/**
 * Tests for SDK error classes
 */

import {
  SDKError,
  SandboxError,
  SandboxTimeoutError,
  CLIInstallError,
  CLIExecutionError,
  AuthenticationError,
  ToolError,
  ValidationError,
  AbortError,
  ParseError,
  isSDKError,
  isSandboxError,
  wrapError,
} from '../src/types/errors.js';

describe('SDKError', () => {
  it('should create error with message and code', () => {
    const error = new SDKError('Test error', 'TEST_CODE');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SDKError);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('SDKError');
  });

  it('should preserve cause chain', () => {
    const cause = new Error('Original error');
    const error = new SDKError('Wrapped error', 'WRAP_CODE', cause);

    expect(error.cause).toBe(cause);
  });

  it('should have proper stack trace', () => {
    const error = new SDKError('Test error', 'TEST_CODE');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('SDKError');
  });
});

describe('SandboxError', () => {
  it('should create sandbox error with correct code', () => {
    const error = new SandboxError('Sandbox failed');

    expect(error).toBeInstanceOf(SDKError);
    expect(error).toBeInstanceOf(SandboxError);
    expect(error.code).toBe('SANDBOX_ERROR');
    expect(error.name).toBe('SandboxError');
  });

  it('should preserve cause', () => {
    const cause = new Error('Network error');
    const error = new SandboxError('Sandbox connection failed', cause);

    expect(error.cause).toBe(cause);
  });
});

describe('SandboxTimeoutError', () => {
  it('should create timeout error with timeout value', () => {
    const error = new SandboxTimeoutError(30000);

    expect(error).toBeInstanceOf(SandboxError);
    expect(error.timeoutMs).toBe(30000);
    expect(error.message).toContain('30000ms');
    expect(error.name).toBe('SandboxTimeoutError');
  });
});

describe('CLIInstallError', () => {
  it('should create CLI install error', () => {
    const error = new CLIInstallError('npm install failed');

    expect(error).toBeInstanceOf(SandboxError);
    expect(error.message).toContain('Failed to install Claude CLI');
    expect(error.message).toContain('npm install failed');
    expect(error.name).toBe('CLIInstallError');
  });
});

describe('CLIExecutionError', () => {
  it('should create execution error with exit code and stderr', () => {
    const error = new CLIExecutionError('CLI crashed', 1, 'Error output');

    expect(error).toBeInstanceOf(SDKError);
    expect(error.code).toBe('CLI_EXECUTION_ERROR');
    expect(error.exitCode).toBe(1);
    expect(error.stderr).toBe('Error output');
    expect(error.name).toBe('CLIExecutionError');
  });

  it('should work without optional fields', () => {
    const error = new CLIExecutionError('CLI failed');

    expect(error.exitCode).toBeUndefined();
    expect(error.stderr).toBeUndefined();
  });
});

describe('AuthenticationError', () => {
  it('should create auth error with default message', () => {
    const error = new AuthenticationError();

    expect(error).toBeInstanceOf(SDKError);
    expect(error.code).toBe('AUTH_ERROR');
    expect(error.message).toContain('ANTHROPIC_API_KEY');
    expect(error.name).toBe('AuthenticationError');
  });

  it('should accept custom message', () => {
    const error = new AuthenticationError('Custom auth error');

    expect(error.message).toBe('Custom auth error');
  });
});

describe('ToolError', () => {
  it('should create tool error with tool name', () => {
    const error = new ToolError('calculator', 'Division by zero');

    expect(error).toBeInstanceOf(SDKError);
    expect(error.code).toBe('TOOL_ERROR');
    expect(error.toolName).toBe('calculator');
    expect(error.message).toContain('calculator');
    expect(error.message).toContain('Division by zero');
    expect(error.name).toBe('ToolError');
  });
});

describe('ValidationError', () => {
  it('should create validation error with details', () => {
    const details = { field: 'email', reason: 'invalid format' };
    const error = new ValidationError('Invalid input', details);

    expect(error).toBeInstanceOf(SDKError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(details);
    expect(error.name).toBe('ValidationError');
  });

  it('should work without details', () => {
    const error = new ValidationError('Invalid input');

    expect(error.details).toBeUndefined();
  });
});

describe('AbortError', () => {
  it('should create abort error with default message', () => {
    const error = new AbortError();

    expect(error).toBeInstanceOf(SDKError);
    expect(error.code).toBe('ABORT_ERROR');
    expect(error.message).toBe('Operation was aborted');
    expect(error.name).toBe('AbortError');
  });

  it('should accept custom message', () => {
    const error = new AbortError('User cancelled');

    expect(error.message).toBe('User cancelled');
  });
});

describe('ParseError', () => {
  it('should create parse error with line content', () => {
    const error = new ParseError('Invalid JSON', '{"incomplete":');

    expect(error).toBeInstanceOf(SDKError);
    expect(error.code).toBe('PARSE_ERROR');
    expect(error.line).toBe('{"incomplete":');
    expect(error.name).toBe('ParseError');
  });
});

describe('isSDKError', () => {
  it('should return true for SDKError instances', () => {
    expect(isSDKError(new SDKError('test', 'CODE'))).toBe(true);
    expect(isSDKError(new SandboxError('test'))).toBe(true);
    expect(isSDKError(new ToolError('tool', 'msg'))).toBe(true);
  });

  it('should return false for non-SDKError', () => {
    expect(isSDKError(new Error('test'))).toBe(false);
    expect(isSDKError(null)).toBe(false);
    expect(isSDKError(undefined)).toBe(false);
    expect(isSDKError('string error')).toBe(false);
    expect(isSDKError({ message: 'fake error' })).toBe(false);
  });
});

describe('isSandboxError', () => {
  it('should return true for SandboxError and subclasses', () => {
    expect(isSandboxError(new SandboxError('test'))).toBe(true);
    expect(isSandboxError(new SandboxTimeoutError(1000))).toBe(true);
    expect(isSandboxError(new CLIInstallError('test'))).toBe(true);
  });

  it('should return false for non-SandboxError', () => {
    expect(isSandboxError(new SDKError('test', 'CODE'))).toBe(false);
    expect(isSandboxError(new ToolError('tool', 'msg'))).toBe(false);
    expect(isSandboxError(new Error('test'))).toBe(false);
  });
});

describe('wrapError', () => {
  it('should return SDKError unchanged', () => {
    const original = new SDKError('Original', 'CODE');
    const wrapped = wrapError(original, 'Default message');

    expect(wrapped).toBe(original);
  });

  it('should wrap standard Error in SDKError', () => {
    const original = new Error('Standard error');
    const wrapped = wrapError(original, 'Default message');

    expect(wrapped).toBeInstanceOf(SDKError);
    expect(wrapped.message).toBe('Standard error');
    expect(wrapped.code).toBe('UNKNOWN_ERROR');
    expect(wrapped.cause).toBe(original);
  });

  it('should use default message for non-Error values', () => {
    const wrapped = wrapError('string error', 'Default message');

    expect(wrapped).toBeInstanceOf(SDKError);
    expect(wrapped.message).toBe('Default message');
    expect(wrapped.code).toBe('UNKNOWN_ERROR');
    expect(wrapped.cause).toBe('string error');
  });

  it('should handle null/undefined', () => {
    expect(wrapError(null, 'Default').message).toBe('Default');
    expect(wrapError(undefined, 'Default').message).toBe('Default');
  });
});
