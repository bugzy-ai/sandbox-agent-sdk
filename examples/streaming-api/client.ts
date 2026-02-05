/**
 * Client-side SSE Consumer
 *
 * This example shows how to consume the streaming API
 * from a React component or any client-side code.
 */

export interface StreamMessage {
  type: 'text' | 'done' | 'error';
  text?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  durationMs?: number;
}

/**
 * Stream a chat message and process responses in real-time.
 *
 * @example
 * ```typescript
 * await streamChat(
 *   { prompt: 'Tell me a story' },
 *   (message) => {
 *     if (message.type === 'text') {
 *       // Append text to UI
 *       setResponse(prev => prev + message.text);
 *     } else if (message.type === 'done') {
 *       console.log('Done!', message.usage);
 *     } else if (message.type === 'error') {
 *       console.error('Error:', message.error);
 *     }
 *   }
 * );
 * ```
 */
export async function streamChat(
  params: { prompt: string; model?: string; systemPrompt?: string },
  onMessage: (message: StreamMessage) => void
): Promise<void> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE events
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      if (!event.trim()) continue;

      const lines = event.split('\n');
      let eventType = '';
      let data = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7);
        } else if (line.startsWith('data: ')) {
          data = line.slice(6);
        }
      }

      if (eventType && data) {
        try {
          const parsed = JSON.parse(data);
          onMessage({ type: eventType as StreamMessage['type'], ...parsed });
        } catch {
          console.error('Failed to parse SSE data:', data);
        }
      }
    }
  }
}

/**
 * React hook for streaming chat (example usage)
 */
export function useStreamingChat() {
  // This is a simplified example - in a real app you'd use useState and useCallback

  const sendMessage = async (
    prompt: string,
    onText: (text: string) => void,
    onDone?: (usage: StreamMessage['usage']) => void,
    onError?: (error: string) => void
  ) => {
    await streamChat({ prompt }, (message) => {
      if (message.type === 'text' && message.text) {
        onText(message.text);
      } else if (message.type === 'done') {
        onDone?.(message.usage);
      } else if (message.type === 'error' && message.error) {
        onError?.(message.error);
      }
    });
  };

  return { sendMessage };
}
