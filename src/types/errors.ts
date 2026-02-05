/**
 * Custom error classes for the SDK
 */

/**
 * Base error class for all SDK errors
 */
export class SDKError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'SDKError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Error thrown when sandbox operations fail
 */
export class SandboxError extends SDKError {
  constructor(message: string, cause?: unknown) {
    super(message, 'SANDBOX_ERROR', cause);
    this.name = 'SandboxError';
  }
}

/**
 * Error thrown when the sandbox times out
 */
export class SandboxTimeoutError extends SandboxError {
  constructor(
    public readonly timeoutMs: number,
    cause?: unknown
  ) {
    super(`Sandbox operation timed out after ${timeoutMs}ms`, cause);
    this.name = 'SandboxTimeoutError';
  }
}

/**
 * Error thrown when Claude CLI installation fails
 */
export class CLIInstallError extends SandboxError {
  constructor(message: string, cause?: unknown) {
    super(`Failed to install Claude CLI: ${message}`, cause);
    this.name = 'CLIInstallError';
  }
}

/**
 * Error thrown when Claude CLI execution fails
 */
export class CLIExecutionError extends SDKError {
  constructor(
    message: string,
    public readonly exitCode?: number,
    public readonly stderr?: string,
    cause?: unknown
  ) {
    super(message, 'CLI_EXECUTION_ERROR', cause);
    this.name = 'CLIExecutionError';
  }
}

/**
 * Error thrown when authentication credentials are missing
 */
export class AuthenticationError extends SDKError {
  constructor(message: string = 'Authentication required: set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN') {
    super(message, 'AUTH_ERROR');
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when tool execution fails
 */
export class ToolError extends SDKError {
  constructor(
    public readonly toolName: string,
    message: string,
    cause?: unknown
  ) {
    super(`Tool "${toolName}" failed: ${message}`, 'TOOL_ERROR', cause);
    this.name = 'ToolError';
  }
}

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends SDKError {
  constructor(
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when the operation is aborted
 */
export class AbortError extends SDKError {
  constructor(message: string = 'Operation was aborted') {
    super(message, 'ABORT_ERROR');
    this.name = 'AbortError';
  }
}

/**
 * Error thrown when parsing NDJSON fails
 */
export class ParseError extends SDKError {
  constructor(
    message: string,
    public readonly line?: string,
    cause?: unknown
  ) {
    super(message, 'PARSE_ERROR', cause);
    this.name = 'ParseError';
  }
}

/**
 * Type guard to check if an error is an SDK error
 */
export function isSDKError(error: unknown): error is SDKError {
  return error instanceof SDKError;
}

/**
 * Type guard to check if an error is a sandbox error
 */
export function isSandboxError(error: unknown): error is SandboxError {
  return error instanceof SandboxError;
}

/**
 * Wrap an unknown error in an SDKError
 */
export function wrapError(error: unknown, defaultMessage: string): SDKError {
  if (error instanceof SDKError) {
    return error;
  }
  if (error instanceof Error) {
    return new SDKError(error.message || defaultMessage, 'UNKNOWN_ERROR', error);
  }
  return new SDKError(defaultMessage, 'UNKNOWN_ERROR', error);
}
