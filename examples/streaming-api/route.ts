/**
 * Next.js API Route with SSE Streaming
 *
 * This example demonstrates how to create a streaming API endpoint
 * that sends Claude's responses in real-time using Server-Sent Events.
 *
 * Uses the new official SDK API with AsyncGenerator-based query().
 *
 * Place this file in: app/api/chat/route.ts
 */

import { NextRequest } from 'next/server';
import {
  query,
  isAssistantMessage,
  isResultMessage,
  isErrorMessage,
  extractText,
} from '@bugzy-ai/sandbox-agent-sdk';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  const { prompt, model, systemPrompt } = await request.json();

  if (!prompt || typeof prompt !== 'string') {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid prompt' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Helper to send SSE event
      const sendEvent = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      try {
        // Create a query using the new API
        const q = query({
          prompt,
          options: {
            model: model || 'claude-sonnet-4-20250514',
            systemPrompt,
          },
          // Use snapshot for faster cold starts in production
          snapshotId: process.env['CLAUDE_SANDBOX_SNAPSHOT_ID'],
        });

        // Send session started event with session ID
        sendEvent('session', { sessionId: q.sessionId });

        // Stream messages by iterating over the Query generator
        for await (const message of q) {
          if (isAssistantMessage(message)) {
            // Send text chunks as they arrive
            const text = extractText(message);
            if (text) {
              sendEvent('text', { text });
            }
          } else if (isResultMessage(message)) {
            // Send completion event with metadata
            // Support both old and new field names for compatibility
            sendEvent('done', {
              usage: {
                inputTokens: message.usage?.total_input_tokens ?? 0,
                outputTokens: message.usage?.total_output_tokens ?? 0,
                costUsd: message.usage?.total_cost_usd ?? message.total_cost_usd ?? 0,
              },
              durationMs: message.duration_ms,
            });
          } else if (isErrorMessage(message)) {
            sendEvent('error', { error: message.error.message });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        sendEvent('error', { error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * Alternative: Non-streaming endpoint using query().text()
 *
 * Use this for simpler use cases where you don't need streaming.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const prompt = searchParams.get('prompt');

  if (!prompt) {
    return new Response(
      JSON.stringify({ error: 'Missing prompt parameter' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const q = query({
      prompt,
      snapshotId: process.env['CLAUDE_SANDBOX_SNAPSHOT_ID'],
    });

    const text = await q.text();

    return new Response(
      JSON.stringify({
        text,
        sessionId: q.sessionId,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
