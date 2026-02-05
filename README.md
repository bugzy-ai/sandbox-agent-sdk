# Claude Agent SDK with Vercel Sandbox Backing

Run the Claude CLI in Vercel's serverless environment using Vercel Sandbox microVMs.

## Problem

The Claude Agent SDK works locally but fails on Vercel deployment:
```
Error: Claude Code executable not found
```

Vercel's serverless functions don't have the Claude CLI installed.

## Solution

This SDK runs the Claude CLI inside Vercel Sandbox microVMs, enabling Claude Agent functionality in serverless environments.

```
[Your API Route] → [This SDK] → [Vercel Sandbox] → [Claude CLI] → [Anthropic API]
```

## Installation

```bash
npm install claude-agent-sdk-vercel-sandbox
```

## Quick Start

```typescript
import { query } from 'claude-agent-sdk-vercel-sandbox';

const result = await query({
  prompt: 'What is the capital of France?',
});

console.log(result.text); // "The capital of France is Paris."
```

## Features

- ✅ **Drop-in replacement** for local Claude CLI usage
- ✅ **Streaming support** with SSE for real-time responses
- ✅ **Multi-turn conversations** with session management
- ✅ **Custom tools** via MCP (Model Context Protocol)
- ✅ **Snapshots** for faster cold starts
- ✅ **VFS** for mounting GitHub repos or custom files

## API

### Simple Query

```typescript
import { query } from 'claude-agent-sdk-vercel-sandbox';

// Get just the text response
const q = query({ prompt: 'Hello!' });
const text = await q.text();
console.log(text);
```

### Streaming

```typescript
import { query, isAssistantMessage, extractText } from 'claude-agent-sdk-vercel-sandbox';

for await (const message of query({ prompt: 'Tell me a story' })) {
  if (isAssistantMessage(message)) {
    process.stdout.write(extractText(message));
  }
}
```

### Multi-turn Conversations

```typescript
import { VercelClaudeClient } from 'claude-agent-sdk-vercel-sandbox';

const client = new VercelClaudeClient({
  systemPrompt: 'You are a helpful assistant.',
});

await client.connect();

const response1 = await client.chat('My name is Alice.');
const response2 = await client.chat('What is my name?');
// Claude remembers the conversation context

await client.disconnect();
```

### Custom Tools

```typescript
import { tool, createSdkMcpServer } from 'claude-agent-sdk-vercel-sandbox';
import { z } from 'zod';

const weatherTool = tool(
  'get_weather',
  'Get the current weather for a location',
  { location: z.string() },
  async ({ location }) => {
    const weather = await fetchWeather(location);
    return { content: [{ type: 'text', text: weather }] };
  }
);

const server = createSdkMcpServer({
  name: 'my-tools',
  tools: [weatherTool],
});
```

### Snapshots (Faster Cold Starts)

```typescript
import { createSnapshot, query } from 'claude-agent-sdk-vercel-sandbox';

// Create once (during deployment)
const snapshotId = await createSnapshot({ name: 'claude-ready' });

// Use for all queries
const result = await query({
  prompt: 'Hello!',
  snapshotId,
});
```

## Next.js API Route Example

```typescript
// app/api/chat/route.ts
import { NextRequest } from 'next/server';
import { query, isAssistantMessage, extractText } from 'claude-agent-sdk-vercel-sandbox';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { prompt } = await request.json();

  const stream = new ReadableStream({
    async start(controller) {
      for await (const msg of query({ prompt })) {
        if (isAssistantMessage(msg)) {
          controller.enqueue(new TextEncoder().encode(extractText(msg)));
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain' },
  });
}
```

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-xxx

# Optional (for faster cold starts)
CLAUDE_SANDBOX_SNAPSHOT_ID=snap_xxx

# Optional (for team deployments)
VERCEL_TEAM_ID=team_xxx
```

## Documentation

- [Setup Guide](./docs/SETUP.md) - Detailed setup instructions
- [Examples](./examples/) - Working code examples

## Examples

- [`basic-query`](./examples/basic-query/) - Simple query example
- [`streaming-api`](./examples/streaming-api/) - Next.js API with SSE
- [`custom-tools`](./examples/custom-tools/) - Database query tools

## Architecture

| Component | Location | Purpose |
|-----------|----------|---------|
| Your API Route | Vercel Functions | Entry point, handles requests |
| This SDK | Vercel Functions | Manages sandbox lifecycle |
| Vercel Sandbox | MicroVM | Runs Claude CLI in isolated environment |
| Claude CLI | Inside Sandbox | Communicates with Anthropic API |
| Custom Tools | Your Functions | Access databases, APIs (secure) |

## Performance

| Scenario | Cold Start | Warm |
|----------|------------|------|
| Fresh sandbox | ~45s | - |
| With snapshot | ~3-5s | ~1s |

**Recommendation**: Always use snapshots in production.

## Security

- Anthropic API key is passed to sandbox but never logged
- Custom tools run in your application, not the sandbox
- Each sandbox is an isolated microVM
- Database credentials stay in your application

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.
