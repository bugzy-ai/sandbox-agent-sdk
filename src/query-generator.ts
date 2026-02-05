/**
 * Query Generator
 *
 * Provides the official @anthropic-ai/claude-agent-sdk compatible query() function
 * that returns an AsyncGenerator with additional control methods.
 */

import { SandboxTransport } from './transport/index.js';
import {
  SDKMessage,
  ResultMessage,
  isAssistantMessage,
  isResultMessage,
  extractText,
  generateSessionId,
  generateUuid,
} from './types/messages.js';
import {
  Options,
  PermissionMode,
  SandboxContext,
  SandboxLifecycleHooks,
  SetupConfig,
  SnapshotOptions,
  SnapshotResult,
  QueryResultInfo,
} from './types/options.js';
import { wrapError, SandboxError } from './types/errors.js';
import { ToolDefinition } from './tools/types.js';
import { executeTool } from './tools/tool.js';

/**
 * Slash command information
 */
export interface SlashCommand {
  name: string;
  description: string;
  params?: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}

/**
 * Model information
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  maxTokens?: number;
}

/**
 * MCP server status
 */
export interface McpServerStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools?: string[];
  error?: string;
}

/**
 * Account information
 */
export interface AccountInfo {
  email?: string;
  organizationId?: string;
  plan?: string;
}

/**
 * Query interface extending AsyncGenerator with control methods.
 * This matches the official @anthropic-ai/claude-agent-sdk API.
 */
export interface Query extends AsyncGenerator<SDKMessage, void, undefined> {
  /**
   * Interrupt the current operation
   */
  interrupt(): Promise<void>;

  /**
   * Rewind files to a previous state
   */
  rewindFiles(userMessageUuid: string): Promise<void>;

  /**
   * Set the permission mode for subsequent operations
   */
  setPermissionMode(mode: PermissionMode): Promise<void>;

  /**
   * Set the model for subsequent operations
   */
  setModel(model?: string): Promise<void>;

  /**
   * Get available slash commands
   */
  supportedCommands(): Promise<SlashCommand[]>;

  /**
   * Get available models
   */
  supportedModels(): Promise<ModelInfo[]>;

  /**
   * Get MCP server status
   */
  mcpServerStatus(): Promise<McpServerStatus[]>;

  /**
   * Get account information
   */
  accountInfo(): Promise<AccountInfo>;

  /**
   * Get the session ID
   */
  readonly sessionId: string;

  /**
   * Collect all messages (helper method)
   */
  collect(): Promise<SDKMessage[]>;

  /**
   * Get final text response (helper method)
   */
  text(): Promise<string>;

  // ============================================================================
  // Snapshot Methods
  // ============================================================================

  /**
   * Get the sandbox ID (available after connection).
   */
  readonly sandboxId: string | null;

  /**
   * Create a snapshot on-demand.
   */
  createSnapshot(metadata?: Record<string, string>): Promise<SnapshotResult>;

  /**
   * Get the snapshot ID (available after query completes with snapshotEnabled: true).
   */
  readonly snapshotId: string | null;

  /**
   * Get full snapshot info (available after query completes with snapshotEnabled: true).
   */
  readonly snapshotInfo: SnapshotResult | null;
}

/**
 * Internal Query implementation
 */
class QueryImpl implements Query {
  private transport: SandboxTransport;
  private generator: AsyncGenerator<SDKMessage, void, undefined> | null = null;
  private options: InternalOptions;
  private abortController: AbortController;
  private _sessionId: string;
  private isStarted = false;
  private isInterrupted = false;
  private messages: SDKMessage[] = [];

  // Snapshot state
  private _sandboxId: string | null = null;
  private _snapshotId: string | null = null;
  private _snapshotInfo: SnapshotResult | null = null;
  private _queryStartTime: number = 0;

  // Configuration
  private hooks: SandboxLifecycleHooks;
  private setup: SetupConfig | undefined;
  private snapshotEnabled: boolean;
  private snapshotOptions: SnapshotOptions | undefined;

  constructor(
    private prompt: string,
    options: Options,
    transportOptions: TransportOptions,
    queryArgs: QueryArgsInternal
  ) {
    this.transport = new SandboxTransport();
    this._sessionId = generateSessionId();
    this.abortController = options.abortController ?? new AbortController();

    // Store hooks and setup configuration
    this.hooks = queryArgs.hooks ?? {};
    this.setup = queryArgs.setup;
    this.snapshotEnabled = queryArgs.snapshotEnabled ?? true; // Default: create snapshot
    this.snapshotOptions = queryArgs.snapshot;

    // Convert options to internal format
    this.options = {
      ...options,
      signal: options.signal ?? this.abortController.signal,
      _transportOptions: transportOptions,
    };

    // Warn about permission mode in sandbox
    if (options.permissionMode && options.permissionMode !== 'bypassPermissions') {
      console.warn(
        `[claude-agent-sdk] Warning: permissionMode '${options.permissionMode}' is not fully supported in sandbox environments. ` +
        `Sandbox runs with --dangerously-skip-permissions, effectively using 'bypassPermissions'.`
      );
    }
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get sandboxId(): string | null {
    return this._sandboxId;
  }

  get snapshotId(): string | null {
    return this._snapshotId;
  }

  get snapshotInfo(): SnapshotResult | null {
    return this._snapshotInfo;
  }

  /**
   * Start the query and return the generator
   */
  private async *run(): AsyncGenerator<SDKMessage, void, undefined> {
    const maxTurns = this.options.maxTurns ?? 10;
    const tools = this.options.tools ?? [];
    const toolMap = new Map<string, ToolDefinition>();
    let querySuccess = false;
    let queryError: Error | undefined;

    for (const t of tools) {
      toolMap.set(t.name, t);
    }

    // Build tool descriptions for system prompt
    const toolDescriptions = tools.length > 0 ? this.buildToolDescriptions(tools) : '';

    this._queryStartTime = Date.now();

    try {
      await this.transport.connect({
        apiKey: this.options._transportOptions?.apiKey,
        oauthToken: this.options._transportOptions?.oauthToken,
        snapshotId: this.options._transportOptions?.snapshotId,
        teamId: this.options._transportOptions?.teamId,
        timeout: this.options.timeout,
      });

      // Store sandbox ID
      this._sandboxId = this.transport.sandboxId;

      // ========================================
      // Phase: Setup (before query execution)
      // ========================================
      await this.executeSetup();

      // Emit session started system message
      const initMessage: SDKMessage = {
        type: 'system',
        subtype: 'session_started',
        uuid: generateUuid(),
        session_id: this._sessionId,
        parent_tool_use_id: null,
        tools: tools.map(t => t.name),
        mcp_servers: this.options.mcpServers ? Object.keys(this.options.mcpServers) : [],
      };
      yield initMessage;
      this.messages.push(initMessage);

      let conversationHistory: Array<{ role: string; content: string }> = [];
      let currentPrompt = this.prompt;
      let turn = 0;

      // Enhance system prompt with tool descriptions
      const systemPrompt = tools.length > 0
        ? `${this.options.systemPrompt || ''}\n\n${toolDescriptions}`.trim()
        : this.options.systemPrompt;

      const transportOptions = {
        ...this.options,
        systemPrompt,
      };

      while (turn < maxTurns && !this.isInterrupted) {
        turn++;

        const fullPrompt = conversationHistory.length > 0
          ? this.buildConversationPrompt(conversationHistory, currentPrompt)
          : currentPrompt;

        // Stream messages from transport, enriching with session info
        for await (const rawMessage of this.transport.startSession(fullPrompt, transportOptions)) {
          // Enrich message with session info if not present
          const message = this.enrichMessage(rawMessage);
          this.messages.push(message);
          yield message;

          if (this.isInterrupted) break;
        }

        if (this.isInterrupted) break;

        // Extract text from assistant messages in this turn
        const turnMessages = this.messages.slice(-10); // Last few messages
        const assistantText = turnMessages
          .filter(isAssistantMessage)
          .map(extractText)
          .join('');

        // Parse tool requests
        const toolRequests = this.parseToolRequestsFromText(assistantText);

        if (toolRequests.length === 0 || tools.length === 0) {
          break;
        }

        // Execute tools
        const toolResults: string[] = [];

        for (const toolReq of toolRequests) {
          const toolDef = toolMap.get(toolReq.tool);

          if (!toolDef) {
            toolResults.push(`Error: Unknown tool "${toolReq.tool}"`);
            continue;
          }

          try {
            const result = await executeTool(toolDef, toolReq.input);
            const resultText = result.content
              .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
              .join('\n');
            toolResults.push(`Tool "${toolReq.tool}" result:\n${resultText}`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            toolResults.push(`Tool "${toolReq.tool}" error: ${errorMsg}`);
          }
        }

        // Update conversation history
        if (assistantText) {
          conversationHistory.push({ role: 'assistant', content: assistantText });
        }

        const toolResultsText = toolResults.join('\n\n');
        conversationHistory.push({ role: 'user', content: `Tool results:\n${toolResultsText}` });
        currentPrompt = 'Please continue based on the tool results above. Provide the final answer to the user.';
      }

      // Mark query as successful
      querySuccess = true;

      // Emit session ended message
      const endMessage: SDKMessage = {
        type: 'system',
        subtype: 'session_ended',
        uuid: generateUuid(),
        session_id: this._sessionId,
        parent_tool_use_id: null,
      };
      yield endMessage;
      this.messages.push(endMessage);

    } catch (error) {
      queryError = error instanceof Error ? error : new Error(String(error));
      throw wrapError(error, 'Query failed');
    } finally {
      // ========================================
      // Phase: Teardown & Lifecycle Handling
      // ========================================
      await this.handleTeardownAndLifecycle(querySuccess, queryError);
    }
  }

  /**
   * Execute setup configuration and hooks before query runs.
   */
  private async executeSetup(): Promise<void> {
    const context = this.transport.getSandboxContext();

    try {
      // Step 1: Execute SetupConfig shorthand (before onSetup hook)
      if (this.setup) {
        await this.executeSetupConfig(context, this.setup);
      }

      // Step 2: Execute onSetup hook
      if (this.hooks.onSetup) {
        await this.hooks.onSetup(context);
      }
    } catch (error) {
      // Call onSetupError hook if provided
      if (this.hooks.onSetupError && error instanceof Error) {
        await this.hooks.onSetupError(error, context);
      }
      throw error;
    }
  }

  /**
   * Process SetupConfig shorthand operations.
   */
  private async executeSetupConfig(context: SandboxContext, setup: SetupConfig): Promise<void> {
    const cwd = setup.workingDirectory || '/vercel/sandbox';

    // Step 1: Write files
    if (setup.files && setup.files.length > 0) {
      await context.writeFiles(setup.files);
    }

    // Step 2: Clone GitHub repo
    if (setup.githubRepo) {
      const repo = setup.githubRepo;
      const branch = repo.branch || 'main';
      const destination = repo.destination || '/vercel/sandbox/project';

      // Create destination directory
      await context.mkdir(destination);

      // Clone the repository
      const cloneUrl = `https://github.com/${repo.repo}.git`;
      const result = await context.runCommand(
        'git',
        ['clone', '--depth', '1', '--branch', branch, cloneUrl, destination],
        { cwd }
      );

      if (result.exitCode !== 0) {
        throw new SandboxError(`Failed to clone repository: ${result.stderr}`);
      }
    }

    // Step 3: Run npm install if specified
    if (setup.npmInstall && setup.npmInstall.length > 0) {
      const result = await context.runCommand(
        'npm',
        ['install', ...setup.npmInstall],
        { cwd }
      );

      if (result.exitCode !== 0) {
        throw new SandboxError(`npm install failed: ${result.stderr}`);
      }
    }

    // Step 4: Run custom commands
    if (setup.commands && setup.commands.length > 0) {
      for (const cmd of setup.commands) {
        const result = await context.runCommand(
          cmd.cmd,
          cmd.args || [],
          { cwd: cmd.cwd || cwd }
        );

        if (result.exitCode !== 0) {
          throw new SandboxError(`Command '${cmd.cmd}' failed: ${result.stderr}`);
        }
      }
    }
  }

  /**
   * Handle teardown hooks and snapshot creation after query completes.
   */
  private async handleTeardownAndLifecycle(success: boolean, error?: Error): Promise<void> {
    const durationMs = Date.now() - this._queryStartTime;

    try {
      // Execute onTeardown hook if sandbox is still connected
      if (this.hooks.onTeardown && this.transport.connected) {
        const context = this.transport.getSandboxContext();
        const resultInfo: QueryResultInfo = {
          success,
          error,
          durationMs,
          messagesCount: this.messages.length,
        };
        await this.hooks.onTeardown(context, resultInfo);
      }

      // Handle snapshot creation based on snapshotEnabled or snapshotOptions
      await this.handleSnapshot(success);

      // Always close the transport when done
      await this.transport.close();

    } catch (teardownError) {
      // Log teardown errors but don't throw (query already completed)
      console.error('[claude-agent-sdk] Teardown error:', teardownError);
    }
  }

  /**
   * Handle snapshot creation based on snapshotEnabled flag or snapshotOptions.
   */
  private async handleSnapshot(success: boolean): Promise<void> {
    if (!this.transport.connected) {
      return;
    }

    // Determine if we should create a snapshot
    let shouldSnapshot = false;
    let metadata: Record<string, string> | undefined;

    if (this.snapshotOptions) {
      // Use snapshotOptions if provided (for advanced control)
      const mode = this.snapshotOptions.mode;
      shouldSnapshot =
        mode === 'always' ||
        (mode === 'on-success' && success);
      metadata = this.snapshotOptions.metadata;
    } else if (this.snapshotEnabled) {
      // Simple mode: snapshot on success when snapshotEnabled is true
      shouldSnapshot = success;
    }

    if (shouldSnapshot) {
      try {
        const snapshotInfo = await this.transport.createSnapshotWithInfo(metadata);
        this._snapshotId = snapshotInfo.snapshotId;
        this._snapshotInfo = snapshotInfo;

        // Call onSnapshot callback if provided
        if (this.snapshotOptions?.onSnapshot) {
          this.snapshotOptions.onSnapshot(snapshotInfo);
        }

        // Update the last result message with snapshot info
        this.updateResultMessageWithSnapshot(snapshotInfo);
      } catch (snapshotError) {
        console.error('[claude-agent-sdk] Failed to create snapshot:', snapshotError);
      }
    }
  }

  /**
   * Update the last result message with snapshot information.
   */
  private updateResultMessageWithSnapshot(snapshotInfo: SnapshotResult): void {
    // Find the last result message and update it
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i]!;
      if (isResultMessage(msg)) {
        (msg as ResultMessage).snapshotId = snapshotInfo.snapshotId;
        (msg as ResultMessage).snapshotInfo = snapshotInfo;
        break;
      }
    }
  }

  /**
   * Enrich a message with session information.
   * Messages from the transport layer are already validated, so this just
   * ensures session-specific fields are populated.
   */
  private enrichMessage(message: SDKMessage): SDKMessage {
    // SDKMessage already extends SDKMessageBase which has uuid, session_id, parent_tool_use_id
    // If message already has complete session info, return as-is
    if (message.uuid && message.session_id) {
      return message;
    }

    // Create a new message with session info filled in
    // Spread preserves the discriminated union type from the original message
    const enriched: SDKMessage = {
      ...message,
      uuid: message.uuid || generateUuid(),
      session_id: message.session_id || this._sessionId,
      parent_tool_use_id: message.parent_tool_use_id ?? null,
    };

    return enriched;
  }

  /**
   * Build tool descriptions for Claude's system prompt
   */
  private buildToolDescriptions(tools: ToolDefinition[]): string {
    const toolDocs = tools.map((t) => {
      // Access shape - compatible with Zod v3 and v4
      const shape = t.schema.shape ||
        (t.schema as unknown as { _zod?: { def?: { shape?: Record<string, unknown> } } })._zod?.def?.shape || {};

      const schemaDesc = Object.entries(shape)
        .map(([key, value]) => {
          // Get type name - compatible with Zod v3 and v4
          const zodType = value as { description?: string; _def?: { typeName?: string }; _zod?: { def?: { type?: string } } };
          const desc = zodType.description || '';
          const typeName = zodType._zod?.def?.type || zodType._def?.typeName || 'any';
          const type = typeName.replace('Zod', '').toLowerCase();
          return `    - ${key} (${type}): ${desc}`;
        })
        .join('\n');

      return `- **${t.name}**: ${t.description}\n  Parameters:\n${schemaDesc}`;
    }).join('\n\n');

    return `## IMPORTANT: Custom Tools Available

You have been given access to these CUSTOM tools. These are DIFFERENT from your built-in tools.
DO NOT use Bash, Read, Write, or other built-in tools for these tasks.
ONLY use the custom tools listed below by outputting a JSON block.

To use a tool, respond with ONLY a JSON block like this:
\`\`\`json
{"tool": "tool_name", "input": {"param1": "value1"}}
\`\`\`

### Available Custom Tools:

${toolDocs}

IMPORTANT: When asked to perform a task that matches one of these tools, you MUST use the tool by outputting the JSON block.`;
  }

  /**
   * Build a prompt with conversation history
   */
  private buildConversationPrompt(
    history: Array<{ role: string; content: string }>,
    newMessage: string
  ): string {
    const historyText = history
      .map((msg) => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    return `Previous conversation:\n${historyText}\n\nHuman: ${newMessage}`;
  }

  /**
   * Parse tool requests from text
   */
  private parseToolRequestsFromText(
    text: string
  ): Array<{ tool: string; input: Record<string, unknown> }> {
    const requests: Array<{ tool: string; input: Record<string, unknown> }> = [];

    // Pattern 1: JSON in code blocks
    const codeBlockPattern = /```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?```/g;
    let match;

    while ((match = codeBlockPattern.exec(text)) !== null) {
      try {
        const jsonStr = match[1];
        if (!jsonStr) continue;
        const parsed = JSON.parse(jsonStr);
        if (parsed.tool && typeof parsed.tool === 'string') {
          requests.push({
            tool: parsed.tool,
            input: parsed.input || {},
          });
        }
      } catch {
        // Not valid JSON, skip
      }
    }

    // Pattern 2: Inline JSON
    if (requests.length === 0) {
      const inlinePattern = /\{[^{}]*"tool"\s*:\s*"[^"]+"\s*[,}][^{}]*\}/g;
      while ((match = inlinePattern.exec(text)) !== null) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed.tool && typeof parsed.tool === 'string') {
            requests.push({
              tool: parsed.tool,
              input: parsed.input || {},
            });
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }

    return requests;
  }

  // AsyncGenerator interface implementation
  async next(): Promise<IteratorResult<SDKMessage, void>> {
    if (!this.isStarted) {
      this.isStarted = true;
      this.generator = this.run();
    }

    if (!this.generator) {
      return { done: true, value: undefined };
    }

    return this.generator.next();
  }

  async return(value?: void): Promise<IteratorResult<SDKMessage, void>> {
    this.isInterrupted = true;
    if (this.generator) {
      return this.generator.return(value);
    }
    return { done: true, value: undefined };
  }

  async throw(error: Error): Promise<IteratorResult<SDKMessage, void>> {
    if (this.generator) {
      return this.generator.throw(error);
    }
    throw error;
  }

  [Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void, undefined> {
    return this;
  }

  // Control methods
  async interrupt(): Promise<void> {
    this.isInterrupted = true;
    this.abortController.abort();
  }

  async rewindFiles(_userMessageUuid: string): Promise<void> {
    // In sandbox environments, file rewinding isn't supported
    console.warn('[claude-agent-sdk] rewindFiles() is not supported in sandbox environments');
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    if (mode !== 'bypassPermissions') {
      console.warn(
        `[claude-agent-sdk] setPermissionMode('${mode}') is not supported in sandbox environments. ` +
        `Sandbox always uses 'bypassPermissions'.`
      );
    }
  }

  async setModel(model?: string): Promise<void> {
    if (model) {
      this.options.model = model;
    }
  }

  async supportedCommands(): Promise<SlashCommand[]> {
    // Return common slash commands available in Claude CLI
    return [
      { name: 'help', description: 'Show help information' },
      { name: 'clear', description: 'Clear conversation history' },
      { name: 'config', description: 'Show or modify configuration' },
      { name: 'memory', description: 'Manage conversation memory' },
    ];
  }

  async supportedModels(): Promise<ModelInfo[]> {
    return [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
    ];
  }

  async mcpServerStatus(): Promise<McpServerStatus[]> {
    if (!this.options.mcpServers) {
      return [];
    }

    return Object.keys(this.options.mcpServers).map((name) => ({
      name,
      status: 'connected' as const, // In sandbox, assume connected if configured
    }));
  }

  async accountInfo(): Promise<AccountInfo> {
    // Account info isn't available in sandbox context
    return {};
  }

  // Helper methods
  async collect(): Promise<SDKMessage[]> {
    const collected: SDKMessage[] = [];
    for await (const message of this) {
      collected.push(message);
    }
    return collected;
  }

  async text(): Promise<string> {
    await this.collect();
    return this.messages
      .filter(isAssistantMessage)
      .map(extractText)
      .join('');
  }

  // ============================================================================
  // Snapshot Methods
  // ============================================================================

  /**
   * Create a snapshot on-demand.
   * Note: This should be called before the query completes if you want manual control.
   */
  async createSnapshot(metadata?: Record<string, string>): Promise<SnapshotResult> {
    if (!this.transport.connected) {
      throw new SandboxError('Cannot create snapshot: sandbox is not connected');
    }

    const snapshotInfo = await this.transport.createSnapshotWithInfo(metadata);
    this._snapshotId = snapshotInfo.snapshotId;
    this._snapshotInfo = snapshotInfo;

    // Call onSnapshot callback if provided
    if (this.snapshotOptions?.onSnapshot) {
      this.snapshotOptions.onSnapshot(snapshotInfo);
    }

    return snapshotInfo;
  }
}

/**
 * Transport options passed separately from query options
 */
interface TransportOptions {
  apiKey?: string;
  oauthToken?: string;
  snapshotId?: string;
  teamId?: string;
}

/**
 * Internal options including transport config
 */
interface InternalOptions extends Options {
  _transportOptions?: TransportOptions;
}

/**
 * Internal interface for passing hook/setup/snapshot config to QueryImpl
 */
interface QueryArgsInternal {
  hooks?: SandboxLifecycleHooks;
  setup?: SetupConfig;
  snapshotEnabled?: boolean;
  snapshot?: SnapshotOptions;
}

/**
 * Arguments for the query function
 */
export interface QueryArgs {
  /**
   * The prompt to send to Claude
   */
  prompt: string;

  /**
   * Query options
   */
  options?: Options;

  /**
   * Anthropic API key
   */
  apiKey?: string;

  /**
   * OAuth token (experimental - may work in sandbox)
   */
  oauthToken?: string;

  /**
   * Snapshot ID for faster cold starts (resume from a previous snapshot)
   */
  snapshotId?: string;

  /**
   * Vercel team ID
   */
  teamId?: string;

  // ============================================================================
  // Setup & Hooks
  // ============================================================================

  /**
   * Lifecycle hooks for sandbox setup and teardown.
   * Hooks execute in order: setup shorthand → onSetup → query → onTeardown
   */
  hooks?: SandboxLifecycleHooks;

  /**
   * Quick setup helpers (shorthand for common operations).
   * Runs BEFORE the onSetup hook.
   *
   * @example
   * ```typescript
   * setup: {
   *   files: [{ path: '/vercel/sandbox/README.md', content: '# Hello' }],
   *   githubRepo: { repo: 'user/app' },
   *   npmInstall: ['lodash', 'axios'],
   *   commands: [{ cmd: 'npm', args: ['run', 'build'] }],
   * }
   * ```
   */
  setup?: SetupConfig;

  // ============================================================================
  // Snapshot Options
  // ============================================================================

  /**
   * Whether to create a snapshot after the query completes successfully.
   * @default true
   *
   * @example
   * ```typescript
   * // Disable snapshot creation for one-off tasks
   * snapshotEnabled: false
   * ```
   */
  snapshotEnabled?: boolean;

  /**
   * Advanced snapshot options for fine-grained control.
   * If provided, these take precedence over snapshotEnabled.
   *
   * @example
   * ```typescript
   * snapshot: { mode: 'on-success', metadata: { project: 'my-app' } }
   * ```
   */
  snapshot?: SnapshotOptions;
}

/**
 * Create a query to Claude.
 *
 * Returns a Query object that is both an AsyncGenerator<SDKMessage>
 * and provides control methods like interrupt(), setModel(), etc.
 *
 * @example Basic usage
 * ```typescript
 * const q = query({ prompt: "What is 2 + 2?" });
 *
 * for await (const message of q) {
 *   if (message.type === 'assistant') {
 *     console.log(extractText(message));
 *   }
 * }
 * ```
 *
 * @example With options
 * ```typescript
 * const q = query({
 *   prompt: "Write a haiku about programming",
 *   options: {
 *     model: 'claude-sonnet-4-20250514',
 *     maxTurns: 5,
 *   },
 * });
 *
 * const text = await q.text();
 * console.log(text);
 * ```
 *
 * @example With tools
 * ```typescript
 * import { tool } from './tools/tool.js';
 * import { z } from 'zod';
 *
 * const calculator = tool('calc', 'Do math', { expr: z.string() },
 *   async ({ expr }) => ({ content: [{ type: 'text', text: String(eval(expr)) }] })
 * );
 *
 * const q = query({
 *   prompt: "What is 15 * 7?",
 *   options: { tools: [calculator] },
 * });
 *
 * const response = await q.text();
 * ```
 */
export function query(args: QueryArgs): Query {
  const transportOptions: TransportOptions = {
    apiKey: args.apiKey,
    oauthToken: args.oauthToken,
    snapshotId: args.snapshotId,
    teamId: args.teamId,
  };

  // Build internal query args for setup/snapshot
  const queryArgsInternal: QueryArgsInternal = {
    hooks: args.hooks,
    setup: args.setup,
    snapshotEnabled: args.snapshotEnabled,
    snapshot: args.snapshot,
  };

  return new QueryImpl(args.prompt, args.options ?? {}, transportOptions, queryArgsInternal);
}

// Re-export types for convenience
export type { Options, PermissionMode, McpServerConfig } from './types/options.js';
export type {
  SandboxContext,
  SandboxLifecycleHooks,
  SetupConfig,
  SnapshotOptions,
  SnapshotResult,
  QueryResultInfo,
} from './types/options.js';
export type { SDKMessage } from './types/messages.js';
