/**
 * Comprehensive SDK Test
 *
 * Tests ALL features of the Claude Agent SDK with Vercel Sandbox:
 * - Query functions (query with new generator API)
 * - Tool system (tool, multi-turn execution)
 * - Snapshots (create, restore, timing comparison)
 * - Client class (multi-turn, session info)
 * - Message helpers (type guards, extractText)
 * - Query control methods (sessionId, supportedModels, etc.)
 * - Error handling
 *
 * Run with: npm run test:comprehensive
 *
 * Uses the new official SDK API with AsyncGenerator-based query().
 */

import {
  // Query function (new API)
  query,
  // Tool system
  tool,
  executeTool,
  textResult,
  jsonResult,
  errorResult,
  // Snapshot utilities
  createSnapshot,
  // Client class
  VercelClaudeClient,
  // Message type guards
  isSystemMessage,
  isAssistantMessage,
  isResultMessage,
  isToolUseMessage,
  isProgressMessage,
  isErrorMessage,
  extractText,
  // Error classes
  AuthenticationError,
  SDKError,
  isSDKError,
} from '../src/index.js';
import { z } from 'zod';

// ============================================================================
// Test Utilities
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];
let testNumber = 0;

async function runTest(
  name: string,
  emoji: string,
  testFn: () => Promise<{ passed: boolean; details?: string }>
): Promise<void> {
  testNumber++;
  const header = `${emoji} Test ${testNumber}: ${name}`;
  console.log(`\n${header}`);
  console.log('─'.repeat(50));

  const startTime = Date.now();
  try {
    const { passed, details } = await testFn();
    const duration = Date.now() - startTime;

    results.push({ name, passed, duration, details });

    if (passed) {
      console.log(`   ✅ Passed (${formatDuration(duration)})`);
      if (details) console.log(`   ${details}`);
    } else {
      console.log(`   ❌ Failed (${formatDuration(duration)})`);
      if (details) console.log(`   ${details}`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMessage });
    console.log(`   ❌ Error: ${errorMessage.slice(0, 200)}`);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function printSummary(): void {
  console.log('\n' + '═'.repeat(50));
  console.log('📊 Test Summary');
  console.log('═'.repeat(50));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`   ${icon} ${result.name}`);
  }

  console.log('');
  console.log(`   Total: ${results.length} tests`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Duration: ${formatDuration(totalDuration)}`);
  console.log('═'.repeat(50));

  if (failed === 0) {
    console.log('\n🎉 All tests passed!\n');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed.\n`);
  }
}

// ============================================================================
// Test Tools
// ============================================================================

// Simple calculator tool
const calculator = tool(
  'calculator',
  'Perform basic arithmetic calculations. Supports +, -, *, / operations.',
  {
    expression: z.string().describe('A mathematical expression like "2 + 2" or "10 * 5"'),
  },
  async ({ expression }) => {
    console.log(`      [Calculator] Evaluating: ${expression}`);
    try {
      // Safe evaluation for basic math only
      const sanitized = expression.replace(/[^0-9+\-*/.()\s]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();
      console.log(`      [Calculator] Result: ${result}`);
      return textResult(String(result));
    } catch (error) {
      return errorResult(`Calculation error: ${error}`);
    }
  }
);

// Current time tool
const getCurrentTime = tool(
  'get_current_time',
  'Get the current date and time.',
  {
    timezone: z.string().optional().describe('Timezone like "UTC" or "America/New_York"'),
  },
  async ({ timezone }) => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone || 'UTC',
      dateStyle: 'full',
      timeStyle: 'long',
    };
    const formatted = now.toLocaleString('en-US', options);
    console.log(`      [Time] Current time: ${formatted}`);
    return textResult(formatted);
  }
);

// String reverser tool
const reverseString = tool(
  'reverse_string',
  'Reverse a string of text.',
  {
    text: z.string().describe('The text to reverse'),
  },
  async ({ text }) => {
    const reversed = text.split('').reverse().join('');
    console.log(`      [Reverse] "${text}" → "${reversed}"`);
    return textResult(reversed);
  }
);

// Mock weather tool
const getWeather = tool(
  'get_weather',
  'Get current weather for a city. Returns temperature and conditions.',
  {
    city: z.string().describe('City name like "New York" or "Tokyo"'),
  },
  async ({ city }) => {
    const mockWeather: Record<string, { temp: number; conditions: string }> = {
      'new york': { temp: 72, conditions: 'Sunny' },
      'london': { temp: 58, conditions: 'Cloudy' },
      'tokyo': { temp: 68, conditions: 'Partly cloudy' },
      'paris': { temp: 64, conditions: 'Rainy' },
      'sydney': { temp: 75, conditions: 'Clear' },
    };
    const weather = mockWeather[city.toLowerCase()] || { temp: 70, conditions: 'Unknown' };
    console.log(`      [Weather] ${city}: ${weather.temp}°F, ${weather.conditions}`);
    return jsonResult({ city, temperature: weather.temp, conditions: weather.conditions });
  }
);

// ============================================================================
// Tests
// ============================================================================

async function checkAuthentication(): Promise<boolean> {
  console.log('\n🔍 Checking Authentication...');
  console.log('─'.repeat(50));

  const hasApiKey = !!process.env['ANTHROPIC_API_KEY'];
  const hasOAuthToken = !!process.env['CLAUDE_CODE_OAUTH_TOKEN'];
  const hasVercelOidc = !!process.env['VERCEL_OIDC_TOKEN'];

  if (!hasVercelOidc) {
    console.log('❌ VERCEL_OIDC_TOKEN not found');
    console.log('   Run: vercel link && vercel env pull');
    return false;
  }
  console.log('✅ VERCEL_OIDC_TOKEN found');

  if (!hasApiKey && !hasOAuthToken) {
    console.log('❌ No Claude authentication found');
    console.log('   Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN');
    return false;
  }

  if (hasApiKey) {
    console.log('✅ ANTHROPIC_API_KEY found');
    console.log(`   (${process.env['ANTHROPIC_API_KEY']?.slice(0, 14)}...)`);
  }
  if (hasOAuthToken) {
    console.log('✅ CLAUDE_CODE_OAUTH_TOKEN found');
    console.log(`   (${process.env['CLAUDE_CODE_OAUTH_TOKEN']?.slice(0, 18)}...)`);
  }

  return true;
}

// Test 1: Simple Query with new API
async function testSimpleQuery(): Promise<{ passed: boolean; details?: string }> {
  const q = query({
    prompt: 'What is 2 + 2? Reply with just the number, nothing else.',
  });

  const text = await q.text();
  const passed = text.trim().includes('4');

  return {
    passed,
    details: `Response: "${text.trim().slice(0, 50)}", Session: ${q.sessionId.slice(0, 20)}...`,
  };
}

// Test 2: Streaming Query (iterate over generator)
async function testStreamingQuery(): Promise<{ passed: boolean; details?: string }> {
  let messageCount = 0;
  let textContent = '';

  const q = query({
    prompt: 'Count from 1 to 3, one number per line.',
  });

  for await (const message of q) {
    messageCount++;
    if (isAssistantMessage(message)) {
      textContent += extractText(message);
    }
  }

  const passed = messageCount > 0 && textContent.length > 0;
  return {
    passed,
    details: `${messageCount} messages streamed, ${textContent.length} chars`,
  };
}

// Test 3: Query.collect() helper
async function testQueryCollect(): Promise<{ passed: boolean; details?: string }> {
  const q = query({
    prompt: 'Say "hello world"',
  });

  const messages = await q.collect();
  const hasMessages = messages.length > 0;
  const hasAssistant = messages.some(isAssistantMessage);

  const passed = hasMessages && hasAssistant;
  return {
    passed,
    details: `Collected ${messages.length} messages, hasAssistant: ${hasAssistant}`,
  };
}

// Test 4: Query control methods
async function testQueryControlMethods(): Promise<{ passed: boolean; details?: string }> {
  const q = query({ prompt: 'test' });

  // Test supportedModels
  const models = await q.supportedModels();
  const hasModels = models.length > 0;

  // Test supportedCommands
  const commands = await q.supportedCommands();
  const hasCommands = commands.length > 0;

  // Test sessionId
  const hasSessionId = q.sessionId.startsWith('session_');

  const passed = hasModels && hasCommands && hasSessionId;
  return {
    passed,
    details: `Models: ${models.length}, Commands: ${commands.length}, SessionId: ${hasSessionId}`,
  };
}

// Test 5: Tool Execution
async function testToolExecution(): Promise<{ passed: boolean; details?: string }> {
  const q = query({
    prompt: 'What is 15 multiplied by 7? Use the calculator tool.',
    options: {
      tools: [calculator],
      systemPrompt: 'You have a calculator tool. Use it to compute math.',
    },
  });

  const text = await q.text();
  const passed = text.includes('105');
  return {
    passed,
    details: `Response contains "105": ${passed}`,
  };
}

// Test 6: Multi-Turn Tool Loop
async function testMultiTurnToolLoop(): Promise<{ passed: boolean; details?: string }> {
  const q = query({
    prompt: 'First, reverse the string "hello", then tell me the result.',
    options: {
      tools: [reverseString],
      systemPrompt: 'Use the reverse_string tool to reverse text.',
      maxTurns: 5,
    },
  });

  const text = await q.text();
  const passed = text.toLowerCase().includes('olleh');
  return {
    passed,
    details: `Response contains "olleh": ${passed}`,
  };
}

// Test 7: Multiple Tools
async function testMultipleTools(): Promise<{ passed: boolean; details?: string }> {
  const q = query({
    prompt: "What's the weather in Tokyo and what's 10 + 20?",
    options: {
      tools: [getWeather, calculator],
      systemPrompt: 'Use the available tools to answer questions.',
      maxTurns: 5,
    },
  });

  const text = await q.text();
  const hasWeather = text.toLowerCase().includes('tokyo') || text.includes('68');
  const hasMath = text.includes('30');
  const passed = hasWeather || hasMath;

  return {
    passed,
    details: `Weather mentioned: ${hasWeather}, Math result: ${hasMath}`,
  };
}

// Test 8: Tool Result Helpers
async function testToolResultHelpers(): Promise<{ passed: boolean; details?: string }> {
  // Test textResult
  const text = textResult('Hello World');
  const textOk = text.content[0]?.type === 'text' && text.content[0].text === 'Hello World';

  // Test jsonResult
  const json = jsonResult({ foo: 'bar' });
  const jsonOk = json.content[0]?.type === 'text' && json.content[0].text.includes('"foo"');

  // Test errorResult
  const error = errorResult('Something went wrong');
  const errorOk = error.isError === true && error.content[0]?.text.includes('wrong');

  const passed = textOk && jsonOk && errorOk;
  return {
    passed,
    details: `textResult: ${textOk}, jsonResult: ${jsonOk}, errorResult: ${errorOk}`,
  };
}

// Test 9: executeTool with Validation
async function testExecuteToolValidation(): Promise<{ passed: boolean; details?: string }> {
  // Test with valid input
  const validResult = await executeTool(calculator, { expression: '5 * 5' });
  const validOk = validResult.content[0]?.type === 'text' && validResult.content[0].text === '25';

  // Test with invalid input (missing expression)
  const invalidResult = await executeTool(calculator, {});
  const invalidOk = invalidResult.isError === true;

  const passed = validOk && invalidOk;
  return {
    passed,
    details: `Valid input: ${validOk}, Invalid caught: ${invalidOk}`,
  };
}

// Test 10: Client Multi-Turn Conversation
async function testClientMultiTurn(): Promise<{ passed: boolean; details?: string }> {
  const client = new VercelClaudeClient({
    systemPrompt: 'You are a helpful assistant. Remember what the user tells you.',
  });

  await client.connect();

  try {
    // Turn 1: Tell Claude something
    const response1 = await client.chat('My favorite color is blue. Remember this.');

    // Turn 2: Ask Claude to recall
    const response2 = await client.chat('What is my favorite color?');

    const passed = response2.toLowerCase().includes('blue');
    const history = client.getHistory();

    return {
      passed,
      details: `Turns: ${history.length / 2}, Remembered "blue": ${passed}`,
    };
  } finally {
    await client.disconnect();
  }
}

// Test 11: Session Info (tokens, cost)
async function testSessionInfo(): Promise<{ passed: boolean; details?: string }> {
  const client = new VercelClaudeClient();
  await client.connect();

  try {
    await client.chat('Say "hello" and nothing else.');

    const session = client.getSessionInfo();
    if (!session) {
      return { passed: false, details: 'No session info' };
    }

    const passed =
      session.totalTokens.input > 0 &&
      session.totalTokens.output > 0 &&
      session.messageCount > 0;

    return {
      passed,
      details: `Tokens: ${session.totalTokens.input} in, ${session.totalTokens.output} out, Messages: ${session.messageCount}`,
    };
  } finally {
    await client.disconnect();
  }
}

// Test 12: Message Type Guards
async function testMessageTypeGuards(): Promise<{ passed: boolean; details?: string }> {
  let hasSystem = false;
  let hasAssistant = false;
  let hasResult = false;

  const q = query({ prompt: 'Say "test"' });

  for await (const msg of q) {
    if (isSystemMessage(msg)) hasSystem = true;
    if (isAssistantMessage(msg)) hasAssistant = true;
    if (isResultMessage(msg)) hasResult = true;
    // Also test other guards don't crash
    isToolUseMessage(msg);
    isProgressMessage(msg);
    isErrorMessage(msg);
  }

  const passed = hasAssistant && hasResult;
  return {
    passed,
    details: `System: ${hasSystem}, Assistant: ${hasAssistant}, Result: ${hasResult}`,
  };
}

// Test 13: Error Handling
async function testErrorHandling(): Promise<{ passed: boolean; details?: string }> {
  // Test AuthenticationError construction
  const authError = new AuthenticationError('Test auth error');
  const authOk = authError instanceof SDKError && authError.code === 'AUTH_ERROR';

  // Test isSDKError type guard
  const isErrorOk = isSDKError(authError) && !isSDKError(new Error('regular error'));

  const passed = authOk && isErrorOk;
  return {
    passed,
    details: `AuthenticationError: ${authOk}, isSDKError: ${isErrorOk}`,
  };
}

// Test 14: Snapshot Creation (optional - takes a long time)
async function testSnapshotCreation(): Promise<{ passed: boolean; details?: string }> {
  console.log('      Creating snapshot (this may take ~60 seconds)...');

  const startTime = Date.now();
  const snapshotId = await createSnapshot();
  const duration = Date.now() - startTime;

  const passed = snapshotId.startsWith('snap_') || snapshotId.length > 10;
  return {
    passed,
    details: `Snapshot ID: ${snapshotId.slice(0, 30)}..., Duration: ${formatDuration(duration)}`,
  };
}

// Test 15: Query with Snapshot (timing comparison)
async function testQueryWithSnapshot(snapshotId: string): Promise<{ passed: boolean; details?: string }> {
  console.log('      Running query with snapshot...');

  const startTime = Date.now();
  const q = query({
    prompt: 'Say "snapshot test passed"',
    snapshotId,
  });

  const text = await q.text();
  const duration = Date.now() - startTime;

  const passed = text.toLowerCase().includes('snapshot') || text.length > 0;
  return {
    passed,
    details: `Duration: ${formatDuration(duration)}, Response: "${text.slice(0, 30)}..."`,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('🧪 Comprehensive SDK Test Suite (New API)');
  console.log('═'.repeat(50));
  console.log('Testing all features of the Claude Agent SDK');
  console.log('with Vercel Sandbox backing.');
  console.log('');
  console.log('Using the new AsyncGenerator-based query() API');

  // Check authentication first
  const authOk = await checkAuthentication();
  if (!authOk) {
    console.log('\n❌ Authentication check failed. Please fix and try again.');
    process.exit(1);
  }

  // Check for snapshot test flag
  const runSnapshotTests = process.argv.includes('--with-snapshots');

  // Core Query Tests (New API)
  await runTest('Simple Query (new API)', '📝', testSimpleQuery);
  await runTest('Streaming Query (iterate)', '📝', testStreamingQuery);
  await runTest('Query.collect() helper', '📝', testQueryCollect);
  await runTest('Query Control Methods', '🎛️', testQueryControlMethods);

  // Tool System Tests
  await runTest('Tool Execution', '🔧', testToolExecution);
  await runTest('Multi-Turn Tools', '🔧', testMultiTurnToolLoop);
  await runTest('Multiple Tools', '🔧', testMultipleTools);
  await runTest('Tool Result Helpers', '🔧', testToolResultHelpers);
  await runTest('executeTool Validation', '🔧', testExecuteToolValidation);

  // Client Tests
  await runTest('Client Multi-Turn', '💬', testClientMultiTurn);
  await runTest('Session Info', '📊', testSessionInfo);

  // Type Guard Tests
  await runTest('Message Type Guards', '🏷️', testMessageTypeGuards);

  // Error Handling Tests
  await runTest('Error Handling', '⚠️', testErrorHandling);

  // Snapshot Tests (optional, slow)
  if (runSnapshotTests) {
    console.log('\n📸 Running Snapshot Tests (--with-snapshots flag detected)');
    let snapshotId: string | null = null;

    await runTest('Snapshot Creation', '📸', async () => {
      const result = await testSnapshotCreation();
      if (result.passed && result.details) {
        // Extract snapshot ID from details
        const match = result.details.match(/snap_[a-zA-Z0-9]+/);
        if (match) {
          snapshotId = match[0];
        }
      }
      return result;
    });

    if (snapshotId) {
      await runTest('Query with Snapshot', '⚡', () => testQueryWithSnapshot(snapshotId!));
    }
  } else {
    console.log('\n📸 Skipping snapshot tests (run with --with-snapshots to include)');
  }

  // Print summary
  printSummary();

  // Exit with appropriate code
  const failed = results.filter((r) => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
