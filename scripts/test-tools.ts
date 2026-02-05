/**
 * Tool Test Script
 *
 * Tests the tool execution functionality with a simple calculator.
 * No external dependencies required (no Supabase, etc.)
 *
 * Run with: npx tsx --env-file=.env.local scripts/test-tools.ts
 *
 * Uses the new official SDK API with AsyncGenerator-based query().
 */

import { query, tool } from '../src/index.js';
import { z } from 'zod';

// Simple calculator tool - no external dependencies
const calculator = tool(
  'calculator',
  'Perform basic arithmetic calculations. Supports +, -, *, / operations.',
  {
    expression: z.string().describe('A mathematical expression like "2 + 2" or "10 * 5"'),
  },
  async ({ expression }) => {
    console.log(`    [Calculator] Evaluating: ${expression}`);

    try {
      // Safe evaluation for basic math only
      const sanitized = expression.replace(/[^0-9+\-*/.()\s]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();

      console.log(`    [Calculator] Result: ${result}`);
      return {
        content: [{ type: 'text' as const, text: String(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${error}` }],
        isError: true,
      };
    }
  }
);

// Weather tool (mock - returns fake data)
const getWeather = tool(
  'get_weather',
  'Get the current weather for a city. Returns temperature and conditions.',
  {
    city: z.string().describe('The city name, e.g., "New York" or "London"'),
  },
  async ({ city }) => {
    console.log(`    [Weather] Looking up weather for: ${city}`);

    // Mock weather data
    const mockWeather: Record<string, { temp: number; conditions: string }> = {
      'new york': { temp: 72, conditions: 'Sunny' },
      'london': { temp: 58, conditions: 'Cloudy' },
      'tokyo': { temp: 68, conditions: 'Partly cloudy' },
      'paris': { temp: 64, conditions: 'Rainy' },
    };

    const weather = mockWeather[city.toLowerCase()] || { temp: 70, conditions: 'Unknown' };

    console.log(`    [Weather] Result: ${weather.temp}°F, ${weather.conditions}`);
    return {
      content: [{
        type: 'text' as const,
        text: `Weather in ${city}: ${weather.temp}°F, ${weather.conditions}`,
      }],
    };
  }
);

async function main() {
  console.log('🔧 Tool Execution Test (New API)\n');

  // Check authentication (supports both API key and OAuth token)
  const hasApiKey = !!process.env['ANTHROPIC_API_KEY'];
  const hasOAuthToken = !!process.env['CLAUDE_CODE_OAUTH_TOKEN'];

  if (!hasApiKey && !hasOAuthToken) {
    console.error('❌ No Claude authentication found');
    console.error('   Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN');
    process.exit(1);
  }

  if (hasApiKey) {
    console.log('✅ ANTHROPIC_API_KEY found');
  }
  if (hasOAuthToken) {
    console.log('✅ CLAUDE_CODE_OAUTH_TOKEN found (experimental)');
  }
  console.log();

  // Test 1: Calculator tool
  console.log('📝 Test 1: Calculator Tool');
  console.log('   Prompt: "What is 15 multiplied by 7? Use the calculator tool."');
  console.log('   Expected: Claude should call calculator with "15 * 7" and report 105\n');

  try {
    const startTime = Date.now();

    // Create a query with tools using the new API
    const q = query({
      prompt: 'What is 15 multiplied by 7? Please use the calculator tool to compute this.',
      options: {
        tools: [calculator],
        systemPrompt: 'You are a helpful assistant. When asked to do calculations, use the calculator tool.',
      },
    });

    // Use the .text() helper to get the full response
    const text = await q.text();
    const duration = Date.now() - startTime;

    console.log('\n✅ Test 1 Result:');
    console.log('   Response:', text.slice(0, 200) + (text.length > 200 ? '...' : ''));
    console.log('   Duration:', duration, 'ms');
    console.log('   Session ID:', q.sessionId);
    console.log();
  } catch (error) {
    console.error('❌ Test 1 failed:', error);
  }

  // Test 2: Weather tool
  console.log('📝 Test 2: Weather Tool');
  console.log('   Prompt: "What\'s the weather like in Tokyo?"');
  console.log('   Expected: Claude should call get_weather and report the conditions\n');

  try {
    const startTime = Date.now();

    const q = query({
      prompt: "What's the weather like in Tokyo right now?",
      options: {
        tools: [getWeather],
        systemPrompt: 'You are a helpful assistant. Use the get_weather tool to look up weather information.',
      },
    });

    const text = await q.text();
    const duration = Date.now() - startTime;

    console.log('\n✅ Test 2 Result:');
    console.log('   Response:', text.slice(0, 200) + (text.length > 200 ? '...' : ''));
    console.log('   Duration:', duration, 'ms');
    console.log();
  } catch (error) {
    console.error('❌ Test 2 failed:', error);
  }

  // Test 3: Multiple tools
  console.log('📝 Test 3: Multiple Tools');
  console.log('   Prompt: Complex question requiring both tools');
  console.log('   Expected: Claude should use both calculator and weather\n');

  try {
    const startTime = Date.now();

    const q = query({
      prompt: "What's the weather in London, and if the temperature is multiplied by 2, what would that be?",
      options: {
        tools: [calculator, getWeather],
        systemPrompt: 'You are a helpful assistant with access to weather and calculator tools. Use them as needed.',
        maxTurns: 5,
      },
    });

    const text = await q.text();
    const duration = Date.now() - startTime;

    console.log('\n✅ Test 3 Result:');
    console.log('   Response:', text.slice(0, 300) + (text.length > 300 ? '...' : ''));
    console.log('   Duration:', duration, 'ms');
    console.log();
  } catch (error) {
    console.error('❌ Test 3 failed:', error);
  }

  // Test 4: Streaming with tools
  console.log('📝 Test 4: Streaming with Tools');
  console.log('   Prompt: "What is 99 + 1?"');
  console.log('   Streaming response...\n');

  try {
    process.stdout.write('   Response: ');

    const q = query({
      prompt: 'What is 99 + 1? Use the calculator.',
      options: {
        tools: [calculator],
        systemPrompt: 'Use the calculator for all math.',
      },
    });

    // Iterate over messages for streaming
    for await (const message of q) {
      if (message.type === 'assistant') {
        const text = message.message.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('');
        process.stdout.write(text);
      }
    }

    console.log('\n');
    console.log('✅ Streaming with tools test passed!');
  } catch (error) {
    console.error('\n❌ Test 4 failed:', error);
  }

  console.log('🎉 Tool tests completed!');
}

main().catch(console.error);
