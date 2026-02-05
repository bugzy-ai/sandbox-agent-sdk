/**
 * Claude Agent SDK with Vercel Sandbox Backing
 *
 * This SDK mirrors the official @anthropic-ai/claude-agent-sdk API while
 * executing Claude CLI inside Vercel Sandbox microVMs for cloud deployment.
 *
 * @example Basic Query (Official SDK API)
 * ```typescript
 * import { query, extractText, isAssistantMessage } from 'claude-agent-sdk-vercel-sandbox';
 *
 * const q = query({ prompt: "What is the capital of France?" });
 *
 * for await (const message of q) {
 *   if (isAssistantMessage(message)) {
 *     console.log(extractText(message));
 *   }
 * }
 * ```
 *
 * @example Using Helper Methods
 * ```typescript
 * const q = query({ prompt: "Tell me a joke" });
 * const text = await q.text();
 * console.log(text);
 * ```
 *
 * @example With Tools
 * ```typescript
 * import { query, tool } from 'claude-agent-sdk-vercel-sandbox';
 * import { z } from 'zod';
 *
 * const calculator = tool(
 *   'calculator',
 *   'Perform calculations',
 *   { expression: z.string() },
 *   async ({ expression }) => ({
 *     content: [{ type: 'text', text: String(eval(expression)) }]
 *   })
 * );
 *
 * const q = query({
 *   prompt: "What is 15 * 7?",
 *   options: { tools: [calculator] },
 * });
 *
 * const text = await q.text();
 * ```
 *
 * @example Multi-turn with Client
 * ```typescript
 * import { VercelClaudeClient } from 'claude-agent-sdk-vercel-sandbox';
 *
 * const client = new VercelClaudeClient();
 * await client.connect();
 *
 * const response1 = await client.chat('Hello!');
 * const response2 = await client.chat('Tell me more.');
 *
 * await client.disconnect();
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Primary API (aligned with official @anthropic-ai/claude-agent-sdk)
// ============================================================================

// Query function - the main entry point
export { query } from './query-generator.js';
export type {
  Query,
  QueryArgs,
  SlashCommand,
  ModelInfo,
  McpServerStatus,
  AccountInfo,
} from './query-generator.js';

// ============================================================================
// Client
// ============================================================================

export { VercelClaudeClient } from './client.js';
export type { ConversationMessage, SessionInfo } from './client.js';

// ============================================================================
// Tool System
// ============================================================================

export {
  tool,
  executeTool,
  textResult,
  jsonResult,
  errorResult,
} from './tools/tool.js';
export { createSdkMcpServer, handleToolCall } from './tools/mcp-server.js';
export type {
  ToolDefinition,
  ToolResult,
  ToolHandler,
  ToolSchema,
} from './tools/types.js';

// ============================================================================
// Transport Layer (advanced usage)
// ============================================================================

export {
  SandboxTransport,
  collectMessages,
  getFinalResult,
  SandboxContextImpl,
  createSandboxContext,
} from './transport/index.js';

// ============================================================================
// Sandbox Utilities
// ============================================================================

export { createSnapshot, restoreFromSnapshot } from './sandbox/snapshot.js';
export { mountGitHubRepo, writeFiles, readFile } from './sandbox/file-system.js';

// ============================================================================
// Message Types (aligned with official SDK)
// ============================================================================

export type {
  // Union type
  SDKMessage,

  // Individual message types
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ResultMessage,
  ToolUseMessage,
  ProgressMessage,
  ErrorMessage,

  // SDK-prefixed aliases (official SDK naming)
  SDKSystemMessage,
  SDKUserMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKToolUseMessage,
  SDKProgressMessage,
  SDKErrorMessage,

  // Content types
  Message,
  MessageRole,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ContentBlock,

  // Usage types
  UsageInfo,
  ModelUsage,

  // Base type
  SDKMessageBase,
} from './types/messages.js';

// Message type guards and utilities
export {
  isSystemMessage,
  isUserMessage,
  isAssistantMessage,
  isResultMessage,
  isToolUseMessage,
  isProgressMessage,
  isErrorMessage,
  extractText,
  generateUuid,
  generateSessionId,
} from './types/messages.js';

// ============================================================================
// Options Types
// ============================================================================

export type {
  // Primary options type (official SDK naming)
  Options,

  // Other option types
  ClientOptions,
  McpServerConfig,
  VFSFile,
  GitHubRepoConfig,
  SandboxTransportOptions,
  ClaudeModel,
  PermissionMode,

  // Setup & Hooks types
  SandboxContext,
  SandboxLifecycleHooks,
  SetupConfig,
  QueryResultInfo,
  CommandResult,

  // Snapshot types
  SnapshotOptions,
  SnapshotResult,
  SnapshotMode,
} from './types/options.js';

// ============================================================================
// Error Types
// ============================================================================

export {
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
} from './types/errors.js';
