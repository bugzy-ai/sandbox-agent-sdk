/**
 * Basic Query Example
 *
 * This example demonstrates the simplest way to use the SDK -
 * sending a single query and getting a response.
 *
 * Uses the new official SDK API with AsyncGenerator-based query().
 *
 * Run with: npx ts-node index.ts
 */

import { query, isAssistantMessage, extractText } from 'claude-agent-sdk-vercel-sandbox';

async function main() {
  console.log('=== Basic Query Example (New API) ===\n');

  // Method 1: Using query() with .text() helper for simple text response
  console.log('1. Using query().text() for simple text response:');
  const q1 = query({
    prompt: 'What are the three laws of robotics? Be concise.',
    options: {
      model: 'claude-sonnet-4-20250514',
    },
  });

  const text1 = await q1.text();
  console.log('Response:', text1);
  console.log('Session ID:', q1.sessionId);
  console.log('');

  // Method 2: Streaming by iterating over the Query generator
  console.log('2. Streaming by iterating over Query:');
  process.stdout.write('Response: ');

  const q2 = query({
    prompt: 'Count from 1 to 5, with a brief word after each number.',
  });

  for await (const message of q2) {
    if (isAssistantMessage(message)) {
      process.stdout.write(extractText(message));
    }
  }
  console.log('\n');

  // Method 3: Using query().collect() to get all messages
  console.log('3. Using query().collect() to get all messages:');
  const q3 = query({
    prompt: 'What is 2 + 2?',
  });

  const messages = await q3.collect();
  console.log(`Collected ${messages.length} messages`);
  console.log('Message types:', messages.map(m => m.type).join(', '));
  console.log('');

  // Method 4: With a system prompt
  console.log('4. With a system prompt:');
  const q4 = query({
    prompt: 'Tell me about the weather today.',
    options: {
      systemPrompt: 'You are a pirate. Always respond in pirate speak.',
    },
  });

  const pirateResponse = await q4.text();
  console.log('Pirate says:', pirateResponse);
  console.log('');

  // Method 5: Using Query control methods
  console.log('5. Using Query control methods:');
  const q5 = query({ prompt: 'test' });

  const models = await q5.supportedModels();
  console.log('Supported models:', models.map(m => m.id).join(', '));

  const commands = await q5.supportedCommands();
  console.log('Supported commands:', commands.map(c => c.name).join(', '));
}

main().catch(console.error);
