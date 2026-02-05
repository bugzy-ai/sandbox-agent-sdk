/**
 * Simple Test Script
 *
 * Tests basic SDK functionality with your configured authentication.
 * Run with: npm run test:simple
 *
 * Uses the new official SDK API with AsyncGenerator-based query().
 */

// Import from source (before build) or dist (after build)
import { query, isAssistantMessage, extractText } from '../src/index.js';

async function main() {
  console.log('🔍 Checking authentication...\n');

  // Check Vercel authentication (required for sandbox)
  const hasVercelOidc = !!process.env['VERCEL_OIDC_TOKEN'];

  if (!hasVercelOidc) {
    console.error('❌ Vercel OIDC token not found!');
    console.error('');
    console.error('Vercel Sandbox requires authentication. Run these commands:');
    console.error('');
    console.error('  1. vercel login');
    console.error('  2. vercel link');
    console.error('  3. vercel env pull');
    console.error('');
    console.error('This creates .env.local with VERCEL_OIDC_TOKEN');
    process.exit(1);
  }

  console.log('✅ Vercel authentication: VERCEL_OIDC_TOKEN found');

  // Check Claude authentication (API key or OAuth token)
  const hasApiKey = !!process.env['ANTHROPIC_API_KEY'];
  const hasOAuthToken = !!process.env['CLAUDE_CODE_OAUTH_TOKEN'];

  if (!hasApiKey && !hasOAuthToken) {
    console.error('❌ No Claude authentication configured!');
    console.error('');
    console.error('Please set ANTHROPIC_API_KEY (recommended) or CLAUDE_CODE_OAUTH_TOKEN in .env.local:');
    console.error('');
    console.error('  Option 1 - API Key (recommended):');
    console.error('    1. Go to https://console.anthropic.com/');
    console.error('    2. Create an API key');
    console.error('    3. Add to .env.local:');
    console.error('       ANTHROPIC_API_KEY=sk-ant-api03-your-key-here');
    console.error('');
    console.error('  Option 2 - OAuth Token (experimental):');
    console.error('    1. Run: claude auth token');
    console.error('    2. Add to .env.local:');
    console.error('       CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-your-token-here');
    console.error('');
    process.exit(1);
  }

  if (hasApiKey) {
    console.log('✅ Claude authentication: ANTHROPIC_API_KEY found');
    console.log('   (starts with:', process.env['ANTHROPIC_API_KEY']?.slice(0, 14) + '...)');
  }
  if (hasOAuthToken) {
    console.log('✅ Claude authentication: CLAUDE_CODE_OAUTH_TOKEN found');
    console.log('   (starts with:', process.env['CLAUDE_CODE_OAUTH_TOKEN']?.slice(0, 18) + '...)');
    if (!hasApiKey) {
      console.log('   ⚠️  OAuth support is experimental in sandbox environments');
    }
  }
  console.log('');

  // Test 1: Simple query using the new Query generator
  console.log('📝 Test 1: Simple Query (using new API)');
  console.log('   Sending: "What is 2 + 2? Reply with just the number."');
  console.log('   Creating sandbox and running Claude CLI...\n');

  try {
    const startTime = Date.now();

    // Create a query - returns an AsyncGenerator with helper methods
    const q = query({
      prompt: 'What is 2 + 2? Reply with just the number.',
    });

    // Use the .text() helper to get the full response text
    const text = await q.text();
    const duration = Date.now() - startTime;

    console.log('✅ Response received!');
    console.log('   Text:', text.trim());
    console.log('   Duration:', duration, 'ms');
    console.log('   Session ID:', q.sessionId);
    console.log('');

  } catch (error) {
    console.error('❌ Query failed:', error);
    console.error('');

    if (error instanceof Error) {
      if (error.message.includes('Authentication')) {
        console.error('💡 Your token might be invalid or expired.');
        console.error('   Try refreshing your OAuth token from Claude CLI.');
      } else if (error.message.includes('sandbox')) {
        console.error('💡 Sandbox creation failed. Make sure you have:');
        console.error('   1. Vercel CLI installed: npm i -g vercel');
        console.error('   2. Logged in to Vercel: vercel login');
        console.error('   3. Sandbox access enabled on your Vercel account');
      }
    }
    process.exit(1);
  }

  // Test 2: Streaming using the Query as an AsyncIterator
  console.log('📝 Test 2: Streaming (iterating over Query)');
  console.log('   Sending: "Count from 1 to 5, one number per line."');
  console.log('   Response: ');
  process.stdout.write('   ');

  try {
    // The query itself is an AsyncGenerator - iterate directly
    const q = query({
      prompt: 'Count from 1 to 5, one number per line.',
    });

    for await (const message of q) {
      if (isAssistantMessage(message)) {
        const text = extractText(message);
        process.stdout.write(text.replace(/\n/g, '\n   '));
      }
    }
    console.log('\n');
    console.log('✅ Streaming test passed!');

  } catch (error) {
    console.error('\n❌ Streaming test failed:', error);
    process.exit(1);
  }

  // Test 3: Using Query helper methods
  console.log('');
  console.log('📝 Test 3: Query Control Methods');

  try {
    const q = query({
      prompt: 'What models are available?',
    });

    // Test supportedModels() method
    const models = await q.supportedModels();
    console.log('   Available models:', models.map(m => m.id).join(', '));

    // Test supportedCommands() method
    const commands = await q.supportedCommands();
    console.log('   Available commands:', commands.map(c => c.name).join(', '));

    console.log('✅ Control methods test passed!');
  } catch (error) {
    console.error('❌ Control methods test failed:', error);
    process.exit(1);
  }

  console.log('');
  console.log('🎉 All tests passed! The SDK is working correctly.');
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
