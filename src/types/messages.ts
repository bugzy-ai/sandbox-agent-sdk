/**
 * SDK Message Types
 *
 * These types mirror the official @anthropic-ai/claude-agent-sdk message format.
 * The SDK streams messages as NDJSON, each line being a JSON object.
 */

export type MessageRole = 'user' | 'assistant';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: MessageRole;
  content: ContentBlock[];
}

/**
 * Base fields present on all SDK messages (aligned with official SDK)
 */
export interface SDKMessageBase {
  /** Unique identifier for this message */
  uuid: string;
  /** Session identifier for message correlation */
  session_id: string;
  /** Parent tool use ID if this message is part of a tool execution */
  parent_tool_use_id: string | null;
}

/**
 * System message from Claude CLI
 */
export interface SystemMessage extends SDKMessageBase {
  type: 'system';
  subtype: 'init' | 'session_started' | 'session_ended';
  tools?: string[];
  mcp_servers?: string[];
}

/**
 * User message in the conversation
 */
export interface UserMessage extends SDKMessageBase {
  type: 'user';
  message: Message;
}

/**
 * Assistant message chunk during streaming
 */
export interface AssistantMessage extends SDKMessageBase {
  type: 'assistant';
  message: Message;
  stop_reason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
}

/**
 * Model-level usage information per model
 */
export interface ModelUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Structured usage information (aligned with official SDK)
 */
export interface UsageInfo {
  /** Breakdown by model */
  modelUsage: Record<string, ModelUsage>;
  /** Total input tokens across all models */
  total_input_tokens: number;
  /** Total output tokens across all models */
  total_output_tokens: number;
  /** Total cost in USD */
  total_cost_usd: number;
}

/**
 * Result from a completed session
 */
export interface ResultMessage extends SDKMessageBase {
  type: 'result';
  subtype: 'success' | 'error' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd';
  result?: string;
  error?: string;
  /** @deprecated Use usage.total_cost_usd instead */
  cost_usd?: number;
  /** Total cost in USD (official SDK naming) */
  total_cost_usd?: number;
  duration_ms?: number;
  /** @deprecated Use usage.total_input_tokens instead */
  tokens_in?: number;
  /** @deprecated Use usage.total_output_tokens instead */
  tokens_out?: number;
  /** Structured usage information */
  usage?: UsageInfo;
  /** Number of API turns used */
  num_turns?: number;
  /** Snapshot ID if auto-snapshot was enabled */
  snapshotId?: string;
  /** Full snapshot information if auto-snapshot was enabled */
  snapshotInfo?: import('./options.js').SnapshotResult;
}

/**
 * Tool use request from Claude
 */
export interface ToolUseMessage extends SDKMessageBase {
  type: 'tool_use';
  tool_use_id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Progress indicator message
 */
export interface ProgressMessage extends SDKMessageBase {
  type: 'progress';
  message: string;
  percent?: number;
}

/**
 * Error message from the CLI
 */
export interface ErrorMessage extends SDKMessageBase {
  type: 'error';
  error: {
    code: string;
    message: string;
  };
}

/**
 * Union of all message types streamed from Claude CLI
 */
export type SDKMessage =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ResultMessage
  | ToolUseMessage
  | ProgressMessage
  | ErrorMessage;

/**
 * Prefixed type aliases for clarity (aligned with official SDK export names)
 */
export type SDKSystemMessage = SystemMessage;
export type SDKUserMessage = UserMessage;
export type SDKAssistantMessage = AssistantMessage;
export type SDKResultMessage = ResultMessage;
export type SDKToolUseMessage = ToolUseMessage;
export type SDKProgressMessage = ProgressMessage;
export type SDKErrorMessage = ErrorMessage;

/**
 * Type guard functions for message identification
 */
export function isSystemMessage(msg: SDKMessage): msg is SystemMessage {
  return msg.type === 'system';
}

export function isUserMessage(msg: SDKMessage): msg is UserMessage {
  return msg.type === 'user';
}

export function isAssistantMessage(msg: SDKMessage): msg is AssistantMessage {
  return msg.type === 'assistant';
}

export function isResultMessage(msg: SDKMessage): msg is ResultMessage {
  return msg.type === 'result';
}

export function isToolUseMessage(msg: SDKMessage): msg is ToolUseMessage {
  return msg.type === 'tool_use';
}

export function isProgressMessage(msg: SDKMessage): msg is ProgressMessage {
  return msg.type === 'progress';
}

export function isErrorMessage(msg: SDKMessage): msg is ErrorMessage {
  return msg.type === 'error';
}

/**
 * Extract text content from an assistant message
 */
export function extractText(message: AssistantMessage): string {
  return message.message.content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * Generate a UUID v4 for message identification.
 * Uses crypto.randomUUID() for cryptographically secure generation.
 */
export function generateUuid(): string {
  // Use Node.js built-in crypto.randomUUID() (available since Node.js 16)
  // This is cryptographically secure, unlike Math.random()
  return crypto.randomUUID();
}

/**
 * Generate a session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
