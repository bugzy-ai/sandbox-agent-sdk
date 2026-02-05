/**
 * Vercel Claude Client
 *
 * A stateful client for multi-turn conversations with Claude.
 * Maintains conversation history and supports session management.
 */

import { SandboxTransport } from './transport/index.js';
import {
  SDKMessage,
  isAssistantMessage,
  isResultMessage,
  extractText,
  generateSessionId,
} from './types/messages.js';
import { ClientOptions, Options } from './types/options.js';
import { SandboxError } from './types/errors.js';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  uuid?: string;
  metadata?: {
    tokens?: { input: number; output: number };
    costUsd?: number;
    durationMs?: number;
  };
}

export interface SessionInfo {
  id: string;
  startedAt: Date;
  messageCount: number;
  totalTokens: { input: number; output: number };
  totalCostUsd: number;
}

/**
 * Stateful client for multi-turn conversations with Claude.
 *
 * @example
 * ```typescript
 * const client = new VercelClaudeClient({
 *   model: 'claude-sonnet-4-20250514',
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 *
 * await client.connect();
 *
 * // First turn
 * const response1 = await client.chat('Hello! What can you help me with?');
 * console.log(response1);
 *
 * // Second turn (maintains context)
 * const response2 = await client.chat('Tell me more about the first thing you mentioned.');
 * console.log(response2);
 *
 * await client.disconnect();
 * ```
 */
export class VercelClaudeClient {
  private transport: SandboxTransport;
  private options: ClientOptions;
  private conversationHistory: ConversationMessage[] = [];
  private isConnected = false;
  private sessionId: string | null = null;
  private sessionStartedAt: Date | null = null;
  private totalTokens = { input: 0, output: 0 };
  private totalCostUsd = 0;

  constructor(options: ClientOptions = {}) {
    this.transport = new SandboxTransport();
    this.options = {
      model: 'claude-sonnet-4-20250514',
      maxTurns: 10,
      timeout: 300000,
      reuseSandbox: true,
      ...options,
    };
  }

  /**
   * Connect to the sandbox and prepare for conversations.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    await this.transport.connect({
      apiKey: this.options.env?.['ANTHROPIC_API_KEY'],
      snapshotId: this.options.snapshotId,
      timeout: this.options.timeout,
    });

    this.isConnected = true;
    this.sessionId = generateSessionId();
    this.sessionStartedAt = new Date();
  }

  /**
   * Send a message and get a response.
   * Conversation history is maintained automatically.
   */
  async chat(message: string, options?: Partial<Options>): Promise<string> {
    if (!this.isConnected) {
      await this.connect();
    }

    // Build the prompt with conversation history
    const fullPrompt = this.buildPromptWithHistory(message);

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    const startTime = Date.now();
    let responseText = '';
    let tokens = { input: 0, output: 0 };
    let costUsd = 0;

    // Stream the response
    const mergedOptions: Options = {
      ...this.options,
      ...options,
    };

    for await (const sdkMessage of this.transport.startSession(fullPrompt, mergedOptions)) {
      if (isAssistantMessage(sdkMessage)) {
        responseText += extractText(sdkMessage);
      }
      if (isResultMessage(sdkMessage) && sdkMessage.subtype === 'success') {
        // Support both old and new field names
        tokens = {
          input: sdkMessage.usage?.total_input_tokens ?? sdkMessage.tokens_in ?? 0,
          output: sdkMessage.usage?.total_output_tokens ?? sdkMessage.tokens_out ?? 0,
        };
        costUsd = sdkMessage.usage?.total_cost_usd ?? sdkMessage.total_cost_usd ?? sdkMessage.cost_usd ?? 0;
      }
    }

    const durationMs = Date.now() - startTime;

    // Add assistant response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date(),
      metadata: {
        tokens,
        costUsd,
        durationMs,
      },
    });

    // Update totals
    this.totalTokens.input += tokens.input;
    this.totalTokens.output += tokens.output;
    this.totalCostUsd += costUsd;

    return responseText;
  }

  /**
   * Stream messages from a conversation turn.
   */
  async *chatStream(
    message: string,
    options?: Partial<Options>
  ): AsyncGenerator<SDKMessage, void, undefined> {
    if (!this.isConnected) {
      await this.connect();
    }

    const fullPrompt = this.buildPromptWithHistory(message);

    this.conversationHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    const mergedOptions: Options = {
      ...this.options,
      ...options,
    };

    let responseText = '';
    let tokens = { input: 0, output: 0 };
    let costUsd = 0;
    const startTime = Date.now();

    for await (const sdkMessage of this.transport.startSession(fullPrompt, mergedOptions)) {
      if (isAssistantMessage(sdkMessage)) {
        responseText += extractText(sdkMessage);
      }
      if (isResultMessage(sdkMessage) && sdkMessage.subtype === 'success') {
        tokens = {
          input: sdkMessage.usage?.total_input_tokens ?? sdkMessage.tokens_in ?? 0,
          output: sdkMessage.usage?.total_output_tokens ?? sdkMessage.tokens_out ?? 0,
        };
        costUsd = sdkMessage.usage?.total_cost_usd ?? sdkMessage.total_cost_usd ?? sdkMessage.cost_usd ?? 0;
      }
      yield sdkMessage;
    }

    const durationMs = Date.now() - startTime;

    this.conversationHistory.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date(),
      metadata: { tokens, costUsd, durationMs },
    });

    this.totalTokens.input += tokens.input;
    this.totalTokens.output += tokens.output;
    this.totalCostUsd += costUsd;
  }

  /**
   * Build a prompt that includes conversation history.
   * This enables multi-turn conversations.
   */
  private buildPromptWithHistory(newMessage: string): string {
    if (this.conversationHistory.length === 0) {
      return newMessage;
    }

    // Format conversation history
    const historyText = this.conversationHistory
      .map((msg) => {
        const role = msg.role === 'user' ? 'Human' : 'Assistant';
        return `${role}: ${msg.content}`;
      })
      .join('\n\n');

    return `Here is the conversation so far:\n\n${historyText}\n\nHuman: ${newMessage}\n\nPlease continue the conversation naturally, taking into account the previous messages.`;
  }

  /**
   * Clear conversation history to start fresh.
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get the current conversation history.
   */
  getHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Get session information.
   */
  getSessionInfo(): SessionInfo | null {
    if (!this.sessionId || !this.sessionStartedAt) {
      return null;
    }

    return {
      id: this.sessionId,
      startedAt: this.sessionStartedAt,
      messageCount: this.conversationHistory.length,
      totalTokens: { ...this.totalTokens },
      totalCostUsd: this.totalCostUsd,
    };
  }

  /**
   * Write files to the sandbox filesystem.
   */
  async writeFiles(files: Array<{ path: string; content: string }>): Promise<void> {
    if (!this.isConnected) {
      throw new SandboxError('Client not connected. Call connect() first.');
    }
    await this.transport.writeFiles(files);
  }

  /**
   * Read a file from the sandbox filesystem.
   */
  async readFile(path: string): Promise<string> {
    if (!this.isConnected) {
      throw new SandboxError('Client not connected. Call connect() first.');
    }
    return await this.transport.readFile(path);
  }

  /**
   * Create a snapshot of the current sandbox state.
   * Note: After calling this, the sandbox is stopped and cannot be reused.
   */
  async createSnapshot(): Promise<string> {
    if (!this.isConnected) {
      throw new SandboxError('Client not connected. Call connect() first.');
    }
    const result = await this.transport.createSnapshotWithInfo();
    this.isConnected = false; // Sandbox stops after snapshot
    return result.snapshotId;
  }

  /**
   * Disconnect from the sandbox.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    await this.transport.close();
    this.isConnected = false;
    this.sessionId = null;
    this.sessionStartedAt = null;
  }

  /**
   * Check if connected to a sandbox.
   */
  get connected(): boolean {
    return this.isConnected;
  }
}
