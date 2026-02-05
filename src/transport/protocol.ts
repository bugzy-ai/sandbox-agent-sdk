/**
 * NDJSON Protocol Parser
 *
 * Claude CLI outputs newline-delimited JSON (NDJSON).
 * Each line is a complete JSON object representing a message.
 */

import { SDKMessage } from '../types/messages.js';
import { ParseError } from '../types/errors.js';

/**
 * Parse a single line of NDJSON into an SDKMessage
 */
export function parseLine(line: string): SDKMessage | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as SDKMessage;
    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
      throw new ParseError('Invalid message format: missing type field', trimmed);
    }
    return parsed;
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    throw new ParseError(
      `Failed to parse JSON: ${error instanceof Error ? error.message : 'unknown error'}`,
      trimmed,
      error
    );
  }
}

/**
 * Create an async generator that parses NDJSON from a stream
 */
export async function* parseNDJSONStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SDKMessage, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining content in the buffer
        if (buffer.trim()) {
          const message = parseLine(buffer);
          if (message) {
            yield message;
          }
        }
        break;
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const message = parseLine(line);
        if (message) {
          yield message;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse NDJSON from a string (useful for testing)
 */
export function* parseNDJSONString(input: string): Generator<SDKMessage, void, undefined> {
  const lines = input.split('\n');
  for (const line of lines) {
    const message = parseLine(line);
    if (message) {
      yield message;
    }
  }
}

/**
 * Convert process output (stdout + stderr combined) to NDJSON messages
 * Handles cases where stderr output is interleaved
 */
export async function* parseProcessOutput(
  stdout: ReadableStream<Uint8Array>,
  stderr?: ReadableStream<Uint8Array>,
  onStderr?: (data: string) => void
): AsyncGenerator<SDKMessage, void, undefined> {
  // Start consuming stderr in the background if provided
  if (stderr && onStderr) {
    const stderrReader = stderr.getReader();
    const stderrDecoder = new TextDecoder();

    (async () => {
      try {
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;
          onStderr(stderrDecoder.decode(value, { stream: true }));
        }
      } catch {
        // Stderr reading can fail if the process terminates abruptly
      } finally {
        stderrReader.releaseLock();
      }
    })();
  }

  // Yield messages from stdout
  yield* parseNDJSONStream(stdout);
}

/**
 * Serialize an object to NDJSON format (with newline)
 */
export function serializeMessage(message: Record<string, unknown>): string {
  return JSON.stringify(message) + '\n';
}

/**
 * Create a tool result message for sending back to Claude
 */
export function createToolResultMessage(
  toolUseId: string,
  result: unknown,
  isError: boolean = false
): string {
  return serializeMessage({
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: typeof result === 'string' ? result : JSON.stringify(result),
    is_error: isError,
  });
}
