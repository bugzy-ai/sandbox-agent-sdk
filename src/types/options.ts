/**
 * Configuration options for SDK operations
 * Aligned with the official @anthropic-ai/claude-agent-sdk
 */

// ============================================================================
// Command Result Types
// ============================================================================

/**
 * Result from running a command in the sandbox.
 */
export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// ============================================================================
// Sandbox Context & Lifecycle Hooks
// ============================================================================

/**
 * Context provided to lifecycle hooks with safe sandbox operations.
 * This interface exposes a controlled subset of sandbox functionality
 * that consumers can use in their setup/teardown hooks.
 */
export interface SandboxContext {
  /**
   * Run a command in the sandbox.
   */
  runCommand(
    cmd: string,
    args?: string[],
    options?: { cwd?: string; env?: Record<string, string> }
  ): Promise<CommandResult>;

  /**
   * Write files to the sandbox filesystem.
   */
  writeFiles(files: Array<{ path: string; content: string }>): Promise<void>;

  /**
   * Read a file from the sandbox filesystem.
   */
  readFile(path: string): Promise<string>;

  /**
   * Check if a file exists in the sandbox.
   */
  fileExists(path: string): Promise<boolean>;

  /**
   * Create a directory in the sandbox.
   */
  mkdir(path: string): Promise<void>;

  /**
   * The unique identifier for this sandbox instance.
   */
  readonly sandboxId: string;
}

/**
 * Information about the query result, provided to onTeardown hook.
 */
export interface QueryResultInfo {
  success: boolean;
  error?: Error;
  durationMs: number;
  messagesCount: number;
}

/**
 * Sandbox lifecycle hooks for setup and teardown operations.
 * Hooks execute in order: setup shorthand → onSetup → query → onTeardown
 */
export interface SandboxLifecycleHooks {
  /**
   * Called after sandbox is created but before query execution.
   * Use this for custom initialization logic.
   */
  onSetup?: (sandbox: SandboxContext) => Promise<void>;

  /**
   * Called after query completes (success or failure).
   * Use this for cleanup, logging, or resource extraction.
   */
  onTeardown?: (sandbox: SandboxContext, result: QueryResultInfo) => Promise<void>;

  /**
   * Called if onSetup throws an error.
   * Use this for error recovery or detailed logging.
   */
  onSetupError?: (error: Error, sandbox: SandboxContext) => Promise<void>;
}

/**
 * Quick setup helpers (shorthand for common operations).
 * These run BEFORE the onSetup hook.
 */
export interface SetupConfig {
  /**
   * Commands to run in sequence during setup.
   */
  commands?: Array<{ cmd: string; args?: string[]; cwd?: string }>;

  /**
   * Files to write to the sandbox.
   */
  files?: Array<{ path: string; content: string }>;

  /**
   * GitHub repository to clone.
   */
  githubRepo?: GitHubRepoConfig;

  /**
   * NPM packages to install (runs npm install with these packages).
   */
  npmInstall?: string[];

  /**
   * Working directory for setup operations.
   * @default '/vercel/sandbox'
   */
  workingDirectory?: string;
}

// ============================================================================
// Snapshot Enabled Option (Simplified Lifecycle)
// ============================================================================

// Note: The lifecycle modes (stop, keep-alive, snapshot, pool) have been removed.
// Use `snapshotEnabled` in QueryArgs for simple snapshot control:
//   - snapshotEnabled: true  -> Create snapshot after query (default)
//   - snapshotEnabled: false -> Stop sandbox without snapshot

// ============================================================================
// Snapshot Options
// ============================================================================

/**
 * Snapshot mode determining when snapshots are created.
 */
export type SnapshotMode =
  | 'never'      // Default: No auto-snapshot
  | 'on-success' // Snapshot only on successful completion
  | 'always'     // Snapshot on completion regardless of success
  | 'on-demand'; // Only via createSnapshot() method

/**
 * Options for automatic snapshot creation.
 */
export interface SnapshotOptions {
  /**
   * When to create snapshots.
   * @default 'never'
   */
  mode: SnapshotMode;

  /**
   * Metadata to attach to the snapshot.
   */
  metadata?: Record<string, string>;

  /**
   * Callback when a snapshot is created.
   */
  onSnapshot?: (info: SnapshotResult) => void;
}

/**
 * Result from creating a snapshot.
 */
export interface SnapshotResult {
  /**
   * Unique identifier for the snapshot.
   */
  snapshotId: string;

  /**
   * Session ID that created this snapshot.
   */
  sessionId: string;

  /**
   * When the snapshot was created.
   */
  createdAt: Date;

  /**
   * When the snapshot expires (Vercel snapshots expire after 7 days).
   */
  expiresAt: Date;

  /**
   * Size of the snapshot in bytes.
   */
  sizeBytes: number;

  /**
   * Parent snapshot ID if this was created from another snapshot.
   */
  parentSnapshotId?: string;
}

// ============================================================================
// Model Types
// ============================================================================

export type ClaudeModel =
  | 'claude-sonnet-4-20250514'
  | 'claude-opus-4-20250514'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-haiku-20241022'
  | (string & {}); // Allow custom model IDs

/**
 * Permission mode for tool execution (aligned with official SDK)
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

/**
 * MCP server configuration (aligned with official SDK Record format)
 */
export interface McpServerConfig {
  /**
   * Command to start the server (for stdio transport).
   */
  command?: string;

  /**
   * Arguments for the command.
   */
  args?: string[];

  /**
   * URL for SSE transport.
   */
  url?: string;

  /**
   * Environment variables for the server process.
   */
  env?: Record<string, string>;

  /**
   * Working directory for the server process.
   */
  cwd?: string;
}

/**
 * Options for query() function (aligned with official SDK)
 */
export interface Options {
  /**
   * The model to use for completion.
   * @default 'claude-sonnet-4-20250514'
   */
  model?: ClaudeModel;

  /**
   * System prompt to guide Claude's behavior.
   */
  systemPrompt?: string;

  /**
   * Maximum number of agentic turns (tool use cycles).
   * @default 10
   */
  maxTurns?: number;

  /**
   * Custom tools that Claude can use.
   */
  tools?: import('../tools/types.js').ToolDefinition[];

  /**
   * Allowed tools for the session.
   * Use 'all' to allow all tools, or specify an array of tool names.
   */
  allowedTools?: 'all' | string[];

  /**
   * Disallowed tools for the session.
   */
  disallowedTools?: string[];

  /**
   * MCP server configurations as a Record (official SDK format).
   * Key is the server name, value is the server configuration.
   *
   * @example
   * ```typescript
   * mcpServers: {
   *   'my-server': {
   *     command: 'node',
   *     args: ['./server.js'],
   *   },
   *   'sse-server': {
   *     url: 'http://localhost:3000/sse',
   *   },
   * }
   * ```
   */
  mcpServers?: Record<string, McpServerConfig>;

  /**
   * Permission mode for tool execution.
   *
   * Note: In sandbox environments, this is effectively 'bypassPermissions'
   * since sandboxes run with --dangerously-skip-permissions.
   * A warning will be logged if a different mode is specified.
   *
   * @default 'bypassPermissions' (in sandbox)
   */
  permissionMode?: PermissionMode;

  /**
   * Timeout in milliseconds for the entire operation.
   * @default 300000 (5 minutes)
   */
  timeout?: number;

  /**
   * Working directory for file operations within the sandbox.
   * @default '/home/user/project'
   */
  cwd?: string;

  /**
   * Environment variables to pass to the sandbox.
   * Note: ANTHROPIC_API_KEY is always required.
   */
  env?: Record<string, string>;

  /**
   * Abort signal for cancellation.
   */
  signal?: AbortSignal;

  /**
   * AbortController for cancellation (alternative to signal).
   * Provides both signal and abort() method.
   */
  abortController?: AbortController;

  /**
   * Maximum budget in USD for the query.
   * The session will stop if this budget is exceeded.
   */
  maxBudgetUsd?: number;
}


/**
 * Client-specific options extending base Options
 */
export interface ClientOptions extends Options {
  /**
   * Reuse existing sandbox if available.
   * @default true
   */
  reuseSandbox?: boolean;

  /**
   * Snapshot ID for faster cold starts.
   * If provided, the sandbox will be created from this snapshot.
   */
  snapshotId?: string;

  /**
   * Files to mount in the sandbox virtual filesystem.
   */
  files?: VFSFile[];

  /**
   * GitHub repository to clone into the sandbox.
   */
  githubRepo?: GitHubRepoConfig;
}

export interface VFSFile {
  /**
   * Path where the file should be mounted in the sandbox.
   */
  path: string;

  /**
   * Content of the file.
   */
  content: string;

  /**
   * File permissions (Unix-style).
   * @default '0644'
   */
  mode?: string;
}

export interface GitHubRepoConfig {
  /**
   * Repository in "owner/repo" format.
   */
  repo: string;

  /**
   * Branch to clone.
   * @default 'main'
   */
  branch?: string;

  /**
   * Path within the repo to mount.
   */
  path?: string;

  /**
   * Destination path in the sandbox.
   * @default '/home/user/project'
   */
  destination?: string;
}

export interface SandboxTransportOptions {
  /**
   * Vercel team ID (for team deployments).
   */
  teamId?: string;

  /**
   * Anthropic API key. Falls back to ANTHROPIC_API_KEY env var.
   * Use this for pay-per-use API access.
   */
  apiKey?: string;

  /**
   * Claude Code OAuth token. Falls back to CLAUDE_CODE_OAUTH_TOKEN env var.
   * Use this for Claude Pro/Teams subscription access.
   */
  oauthToken?: string;

  /**
   * Snapshot ID for warm starts.
   */
  snapshotId?: string;

  /**
   * Timeout for sandbox operations in milliseconds.
   * @default 300000
   */
  timeout?: number;
}

