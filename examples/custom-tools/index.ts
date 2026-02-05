/**
 * Custom Tools Example
 *
 * This example demonstrates two ways to use custom tools:
 * 1. Pass tools directly to VercelClaudeClient via options.tools
 * 2. Create an MCP server for external tool exposure
 *
 * Claude can use these tools to interact with your Supabase database.
 */

import {
  VercelClaudeClient,
  createSdkMcpServer,
  isAssistantMessage,
  isToolUseMessage,
  extractText,
} from 'claude-agent-sdk-vercel-sandbox';
import { supabaseTools } from './supabase-tool.js';

async function main() {
  console.log('=== Custom Tools Example ===\n');

  // Create MCP server with our custom tools
  const mcpServer = createSdkMcpServer({
    name: 'supabase-tools',
    version: '1.0.0',
    tools: supabaseTools,
  });

  console.log('Available tools:');
  for (const tool of mcpServer.getTools()) {
    console.log(`  - ${tool.name}: ${tool.description.slice(0, 50)}...`);
  }
  console.log();

  // Create client with tools passed directly
  // This is the recommended approach for most use cases
  const client = new VercelClaudeClient({
    model: 'claude-sonnet-4-20250514',
    systemPrompt: `You are a helpful assistant with access to a database.
Use the available tools to help users query and manage data.
Always explain what you're doing and show the results clearly.`,
    // Pass tools directly to the client
    tools: supabaseTools,
  });

  await client.connect();

  try {
    // Example 1: Query the database
    console.log('--- Query Example ---');
    const response1 = await client.chat(
      'Can you show me the schema for the users table?'
    );
    console.log('Claude:', response1, '\n');

    // Example 2: More complex query
    console.log('--- Complex Query Example ---');
    const response2 = await client.chat(
      'Find all posts that are published, ordered by creation date, limit to 5'
    );
    console.log('Claude:', response2, '\n');

    // Example 3: Streaming with tools
    console.log('--- Streaming with Tools ---');
    process.stdout.write('Claude: ');

    for await (const message of client.chatStream(
      'Get all comments for post ID "123" and summarize them'
    )) {
      if (isAssistantMessage(message)) {
        process.stdout.write(extractText(message));
      }
      if (isToolUseMessage(message)) {
        console.log(`\n[Using tool: ${message.name}]`);
      }
    }
    console.log('\n');

    // Show session info
    const session = client.getSessionInfo();
    if (session) {
      console.log('--- Session Summary ---');
      console.log(`Messages: ${session.messageCount}`);
      console.log(`Tokens: ${session.totalTokens.input} in, ${session.totalTokens.output} out`);
      console.log(`Cost: $${session.totalCostUsd.toFixed(4)}`);
    }
  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);
