/**
 * Vercel Sandbox Transport
 *
 * This is the core of the SDK - it creates a Vercel Sandbox microVM,
 * installs the Claude CLI, and streams messages back to the caller.
 */

import { Sandbox } from '@vercel/sandbox';
import {
  SDKMessage,
  isResultMessage,
  isErrorMessage,
  generateUuid,
  generateSessionId,
} from '../types/messages.js';
import {
  Options,
  SandboxTransportOptions,
  SandboxContext,
  CommandResult,
  SnapshotResult,
} from '../types/options.js';
import {
  SandboxError,
  CLIInstallError,
  CLIExecutionError,
  AuthenticationError,
  AbortError,
  wrapError,
  ParseError,
} from '../types/errors.js';

export interface Transport {
  connect(options: SandboxTransportOptions): Promise<void>;
  startSession(prompt: string, options?: Options): AsyncGenerator<SDKMessage>;
  sendInput(message: string): Promise<void>;
  close(): Promise<void>;
  createSnapshotWithInfo(metadata?: Record<string, string>): Promise<SnapshotResult>;
}

/**
 * Valid message types from Claude CLI NDJSON output.
 * Used for runtime validation of incoming messages.
 */
const VALID_MESSAGE_TYPES = new Set([
  'system',
  'user',
  'assistant',
  'result',
  'tool_use',
  'progress',
  'error',
]);

/**
 * Validates that a raw object has the minimum required structure
 * to be considered an SDK message.
 *
 * @param obj - The raw parsed JSON object
 * @returns true if the object appears to be a valid SDK message
 */
function isValidMessageStructure(obj: unknown): obj is { type: string; [key: string]: unknown } {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const record = obj as Record<string, unknown>;

  // Must have a valid 'type' field
  if (typeof record['type'] !== 'string') {
    return false;
  }

  // Type must be one of the known message types
  if (!VALID_MESSAGE_TYPES.has(record['type'])) {
    return false;
  }

  return true;
}

export class SandboxTransport implements Transport {
  private sandbox: Sandbox | null = null;
  private isConnected = false;
  private options: SandboxTransportOptions = {};
  private currentSessionId: string | null = null;

  /**
   * Get authentication credentials from options or environment variables.
   * Supports both ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN.
   */
  private getAuthCredentials(): { apiKey?: string; oauthToken?: string } {
    return {
      apiKey: this.options.apiKey || process.env['ANTHROPIC_API_KEY'],
      oauthToken: this.options.oauthToken || process.env['CLAUDE_CODE_OAUTH_TOKEN'],
    };
  }

  /**
   * Build environment variables for the sandbox, including authentication.
   */
  private buildSandboxEnv(additionalEnv?: Record<string, string>): Record<string, string> {
    const auth = this.getAuthCredentials();
    const env: Record<string, string> = {};

    // API key authentication (guaranteed to work)
    if (auth.apiKey) {
      env['ANTHROPIC_API_KEY'] = auth.apiKey;
    }

    // OAuth token authentication (experimental - may work in sandbox)
    // Note: Works in Docker containers with official Claude CLI
    if (auth.oauthToken) {
      env['CLAUDE_CODE_OAUTH_TOKEN'] = auth.oauthToken;
    }

    // Merge additional environment variables
    if (additionalEnv) {
      Object.assign(env, additionalEnv);
    }

    return env;
  }

  /**
   * Create and connect to a Vercel Sandbox
   */
  async connect(options: SandboxTransportOptions = {}): Promise<void> {
    this.options = options;

    // Check for authentication (API key or OAuth token)
    const authCredentials = this.getAuthCredentials();
    if (!authCredentials.apiKey && !authCredentials.oauthToken) {
      throw new AuthenticationError(
        'Authentication required: set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN'
      );
    }

    try {
      // Create sandbox from snapshot or fresh
      if (options.snapshotId) {
        this.sandbox = await Sandbox.create({
          source: {
            type: 'snapshot',
            snapshotId: options.snapshotId,
          },
          timeout: options.timeout || 300000,
        });
      } else {
        this.sandbox = await Sandbox.create({
          runtime: 'node24',
          timeout: options.timeout || 300000,
        });

        // Install Claude CLI
        await this.installCLI();
      }

      this.isConnected = true;
    } catch (error) {
      throw wrapError(error, 'Failed to create sandbox');
    }
  }

  /**
   * Install Claude CLI in the sandbox
   */
  private async installCLI(): Promise<void> {
    if (!this.sandbox) {
      throw new SandboxError('Sandbox not connected');
    }

    try {
      console.log('Installing Claude CLI in sandbox...');

      // Install Claude CLI globally
      const installResult = await this.sandbox.runCommand('npm', [
        'install',
        '-g',
        '@anthropic-ai/claude-code',
      ]);

      if (installResult.exitCode !== 0) {
        const stderr = await installResult.stderr();
        throw new CLIInstallError(stderr || 'Unknown installation error');
      }

      // Verify installation
      const verifyResult = await this.sandbox.runCommand('which', ['claude']);
      if (verifyResult.exitCode !== 0) {
        throw new CLIInstallError('Claude CLI not found after installation');
      }

      console.log('Claude CLI installed successfully');
    } catch (error) {
      if (error instanceof CLIInstallError) {
        throw error;
      }
      throw new CLIInstallError(
        error instanceof Error ? error.message : 'Unknown error',
        error
      );
    }
  }

  /**
   * Start a Claude session and stream messages
   */
  async *startSession(
    prompt: string,
    options: Options = {}
  ): AsyncGenerator<SDKMessage, void, undefined> {
    if (!this.sandbox || !this.isConnected) {
      throw new SandboxError('Sandbox not connected. Call connect() first.');
    }

    // Verify authentication is available (API key or OAuth token)
    const auth = this.getAuthCredentials();
    if (!auth.apiKey && !auth.oauthToken) {
      throw new AuthenticationError(
        'Authentication required: set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN'
      );
    }

    // Generate session ID for this session
    this.currentSessionId = generateSessionId();

    // Build Claude CLI arguments
    const args = this.buildCLIArgs(prompt, options);

    // Set up environment with authentication
    const env = this.buildSandboxEnv(options.env);

    // Get the effective signal (from options or abortController)
    const signal = options.signal ?? options.abortController?.signal;

    try {
      // First verify Claude CLI is working
      console.log('Verifying Claude CLI installation...');
      const versionCheck = await this.sandbox.runCommand('claude', ['--version']);
      const version = await versionCheck.stdout();
      console.log('Claude CLI version:', version.trim());

      console.log('Starting Claude CLI...');

      // Start the Claude CLI process in detached mode to get streaming output
      const command = await this.sandbox.runCommand({
        cmd: 'claude',
        args,
        env,
        cwd: options.cwd || '/vercel/sandbox',
        detached: true,
      });

      // Set up abort handler
      if (signal) {
        signal.addEventListener('abort', () => {
          command.kill('SIGTERM').catch(() => {});
        });
      }

      // Stream logs and parse NDJSON
      let buffer = '';
      let allStdout = '';
      let allStderr = '';

      for await (const log of command.logs()) {
        if (log.stream === 'stdout') {
          buffer += log.data;
          allStdout += log.data;

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim()) {
              try {
                const rawMessage = JSON.parse(line);
                // Enrich with session metadata and validate structure
                const message = this.enrichMessage(rawMessage);
                yield message;
              } catch (parseError) {
                // If it's a ParseError from enrichMessage, it means we got valid JSON
                // but with invalid message structure - this should propagate
                if (parseError instanceof ParseError) {
                  console.error('[Claude] Invalid message structure:', line);
                  // Continue processing other messages instead of failing completely
                  continue;
                }
                // Otherwise it's a JSON.parse error - not JSON, might be debug output
                console.log('[Claude stdout]', line);
              }
            }
          }
        } else if (log.stream === 'stderr') {
          allStderr += log.data;
          // Log stderr for debugging
          console.error('[Claude stderr]', log.data);
        }
      }

      // Log all output if we didn't get any JSON messages
      if (!allStdout.includes('{')) {
        console.log('[Full stdout]', allStdout);
      }

      // Process any remaining buffer content
      if (buffer.trim()) {
        try {
          const rawMessage = JSON.parse(buffer);
          const message = this.enrichMessage(rawMessage);
          yield message;
        } catch (parseError) {
          // Log validation errors but don't fail
          if (parseError instanceof ParseError) {
            console.error('[Claude] Invalid trailing message structure:', buffer);
          }
          // Ignore non-JSON trailing content
        }
      }

      // Wait for command to complete and check exit code
      const result = await command.wait();
      if (result.exitCode !== 0) {
        const stderr = await result.stderr();
        const stdout = await result.stdout();
        console.log('[Exit code]', result.exitCode);
        console.log('[Final stdout]', stdout);
        console.log('[Final stderr]', stderr);
        throw new CLIExecutionError(
          `Claude CLI exited with code ${result.exitCode}: ${stderr || stdout || 'no output'}`,
          result.exitCode,
          stderr
        );
      }
    } catch (error) {
      if (signal?.aborted) {
        throw new AbortError('Operation was aborted');
      }
      if (error instanceof CLIExecutionError || error instanceof SandboxError) {
        throw error;
      }
      throw wrapError(error, 'Failed to execute Claude CLI');
    }
  }

  /**
   * Enrich a raw message with session metadata.
   * Validates the message structure before returning.
   *
   * @throws {ParseError} if the message structure is invalid
   */
  private enrichMessage(rawMessage: unknown): SDKMessage {
    // Validate basic message structure
    if (!isValidMessageStructure(rawMessage)) {
      throw new ParseError(
        `Invalid message structure: missing or invalid 'type' field`,
        JSON.stringify(rawMessage)
      );
    }

    const msg = rawMessage as Record<string, unknown>;

    // Construct enriched message with required SDK base fields
    const enriched: Record<string, unknown> = {
      ...msg,
      uuid: typeof msg['uuid'] === 'string' ? msg['uuid'] : generateUuid(),
      session_id: typeof msg['session_id'] === 'string'
        ? msg['session_id']
        : (this.currentSessionId || generateSessionId()),
      parent_tool_use_id: typeof msg['parent_tool_use_id'] === 'string'
        ? msg['parent_tool_use_id']
        : null,
    };

    // Type-specific validation for critical message types
    const messageType = enriched['type'] as string;

    switch (messageType) {
      case 'assistant':
      case 'user':
        // These must have a 'message' field with content
        if (!enriched['message'] || typeof enriched['message'] !== 'object') {
          enriched['message'] = { role: messageType, content: [] };
        }
        break;

      case 'result':
        // Result messages should have a subtype
        if (typeof enriched['subtype'] !== 'string') {
          enriched['subtype'] = 'success';
        }
        break;

      case 'error':
        // Error messages should have an error object
        if (!enriched['error'] || typeof enriched['error'] !== 'object') {
          enriched['error'] = {
            code: 'UNKNOWN_ERROR',
            message: 'Unknown error occurred',
          };
        }
        break;
    }

    // The message has been validated to have:
    // 1. A valid 'type' field (checked by isValidMessageStructure)
    // 2. Required base fields: uuid, session_id, parent_tool_use_id
    // 3. Type-specific fields filled with defaults where missing
    // The cast is safe because we've validated the structure at runtime.
    return enriched as unknown as SDKMessage;
  }

  /**
   * Build CLI arguments from options
   */
  private buildCLIArgs(prompt: string, options: Options): string[] {
    const args: string[] = [
      '--print', // Non-interactive mode, print response and exit
      '--output-format', 'stream-json', // NDJSON streaming format
      '--verbose', // Required for stream-json output
      '--dangerously-skip-permissions', // Skip permission prompts in sandbox
    ];

    if (options.model) {
      args.push('--model', options.model);
    }

    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt);
    }

    if (options.allowedTools) {
      if (options.allowedTools === 'all') {
        args.push('--allowedTools', 'all');
      } else {
        args.push('--allowedTools', options.allowedTools.join(','));
      }
    }

    if (options.disallowedTools) {
      args.push('--disallowedTools', options.disallowedTools.join(','));
    }

    // Handle MCP servers (Record format)
    if (options.mcpServers) {
      for (const [name, config] of Object.entries(options.mcpServers)) {
        args.push('--mcp-config', JSON.stringify({ name, ...config }));
      }
    }

    // Handle permission mode warning (sandbox always bypasses)
    if (options.permissionMode && options.permissionMode !== 'bypassPermissions') {
      console.warn(
        `[sandbox-transport] Warning: permissionMode '${options.permissionMode}' is ignored in sandbox. ` +
        `Using --dangerously-skip-permissions.`
      );
    }

    // Handle max turns
    if (options.maxTurns) {
      args.push('--max-turns', String(options.maxTurns));
    }

    // Add the prompt as the final positional argument
    args.push(prompt);

    return args;
  }

  /**
   * Send input to the running Claude process
   * Note: This is not fully supported with the current sandbox API
   */
  async sendInput(_message: string): Promise<void> {
    throw new SandboxError(
      'Interactive input is not supported in sandbox mode. Use non-interactive prompts.'
    );
  }

  /**
   * Close the sandbox connection
   */
  async close(): Promise<void> {
    if (this.sandbox) {
      try {
        await this.sandbox.stop();
      } catch {
        // Ignore stop errors
      }
      this.sandbox = null;
    }

    this.isConnected = false;
    this.currentSessionId = null;
  }

  /**
   * Create a snapshot of the current sandbox state
   * Use this to speed up cold starts in production
   *
   * NOTE: After calling this, the sandbox is automatically stopped
   * and cannot be used again.
   *
   * @param metadata Optional metadata to associate with the snapshot
   * @returns Full snapshot result with expiration info
   */
  async createSnapshotWithInfo(_metadata?: Record<string, string>): Promise<SnapshotResult> {
    // Note: _metadata parameter reserved for future Vercel snapshot metadata support
    if (!this.sandbox) {
      throw new SandboxError('Sandbox not connected');
    }

    try {
      const createdAt = new Date();
      const snapshot = await this.sandbox.snapshot();

      // Vercel snapshots expire after 7 days
      const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

      const result: SnapshotResult = {
        snapshotId: snapshot.snapshotId,
        sessionId: this.currentSessionId || '',
        createdAt,
        expiresAt,
        sizeBytes: 0, // Vercel doesn't expose size, default to 0
        parentSnapshotId: this.options.snapshotId, // If we were created from a snapshot
      };

      this.isConnected = false; // Sandbox stops after snapshot
      this.sandbox = null;

      return result;
    } catch (error) {
      throw new SandboxError(
        `Failed to create snapshot: ${error instanceof Error ? error.message : 'unknown error'}`,
        error
      );
    }
  }

  /**
   * Get a SandboxContext for lifecycle hooks.
   * This provides a safe, controlled interface to the sandbox.
   */
  getSandboxContext(): SandboxContext {
    if (!this.sandbox) {
      throw new SandboxError('Sandbox not connected');
    }
    return new SandboxContextImpl(this.sandbox);
  }

  /**
   * Get the underlying sandbox instance (for advanced use cases).
   * Prefer getSandboxContext() for hook implementations.
   */
  getSandbox(): Sandbox | null {
    return this.sandbox;
  }

  /**
   * Get the sandbox ID if connected.
   */
  get sandboxId(): string | null {
    return this.sandbox?.sandboxId ?? null;
  }

  /**
   * Write files to the sandbox filesystem
   */
  async writeFiles(files: Array<{ path: string; content: string }>): Promise<void> {
    if (!this.sandbox) {
      throw new SandboxError('Sandbox not connected');
    }

    await this.sandbox.writeFiles(
      files.map((f) => ({
        path: f.path,
        content: Buffer.from(f.content, 'utf-8'),
      }))
    );
  }

  /**
   * Read a file from the sandbox filesystem
   */
  async readFile(path: string): Promise<string> {
    if (!this.sandbox) {
      throw new SandboxError('Sandbox not connected');
    }

    const buffer = await this.sandbox.readFileToBuffer({ path });
    if (buffer === null) {
      throw new SandboxError(`File not found: ${path}`);
    }
    return buffer.toString('utf-8');
  }

  /**
   * Check if connected to a sandbox
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get the current session ID
   */
  get sessionId(): string | null {
    return this.currentSessionId;
  }
}

/**
 * Helper function to collect all messages from a session
 */
export async function collectMessages(
  generator: AsyncGenerator<SDKMessage>
): Promise<SDKMessage[]> {
  const messages: SDKMessage[] = [];
  for await (const message of generator) {
    messages.push(message);
  }
  return messages;
}

/**
 * Helper function to get the final result from a session
 */
export async function getFinalResult(
  generator: AsyncGenerator<SDKMessage>
): Promise<string | undefined> {
  let lastResult: string | undefined;

  for await (const message of generator) {
    if (isResultMessage(message) && message.subtype === 'success') {
      lastResult = message.result;
    }
    if (isErrorMessage(message)) {
      throw new CLIExecutionError(message.error.message);
    }
  }

  return lastResult;
}

// ============================================================================
// SandboxContext Implementation
// ============================================================================

/**
 * Implementation of SandboxContext for lifecycle hooks.
 * Provides a safe, controlled interface to sandbox operations.
 */
export class SandboxContextImpl implements SandboxContext {
  constructor(private sandbox: Sandbox) {}

  get sandboxId(): string {
    return this.sandbox.sandboxId;
  }

  async runCommand(
    cmd: string,
    args: string[] = [],
    options: { cwd?: string; env?: Record<string, string> } = {}
  ): Promise<CommandResult> {
    const result = await this.sandbox.runCommand({
      cmd,
      args,
      cwd: options.cwd || '/vercel/sandbox',
      env: options.env,
    });

    return {
      exitCode: result.exitCode,
      stdout: await result.stdout(),
      stderr: await result.stderr(),
    };
  }

  async writeFiles(files: Array<{ path: string; content: string }>): Promise<void> {
    await this.sandbox.writeFiles(
      files.map((f) => ({
        path: f.path,
        content: Buffer.from(f.content, 'utf-8'),
      }))
    );
  }

  async readFile(path: string): Promise<string> {
    const buffer = await this.sandbox.readFileToBuffer({ path });
    if (buffer === null) {
      throw new SandboxError(`File not found: ${path}`);
    }
    return buffer.toString('utf-8');
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const buffer = await this.sandbox.readFileToBuffer({ path });
      return buffer !== null;
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    const result = await this.sandbox.runCommand('mkdir', ['-p', path]);
    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new SandboxError(`Failed to create directory ${path}: ${stderr}`);
    }
  }
}

/**
 * Factory function to create a SandboxContext from a Sandbox instance.
 */
export function createSandboxContext(sandbox: Sandbox): SandboxContext {
  return new SandboxContextImpl(sandbox);
}
