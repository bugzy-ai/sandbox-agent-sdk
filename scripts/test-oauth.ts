/**
 * OAuth Token Authentication Test
 *
 * Tests whether OAuth tokens (CLAUDE_CODE_OAUTH_TOKEN) work in Vercel Sandbox.
 *
 * Setup:
 *   1. Comment out ANTHROPIC_API_KEY in your .env.local
 *   2. Add CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-... to .env.local
 *   3. Run: npm run test:oauth
 *
 * Expected outcomes:
 *   ✅ If OAuth works: You'll see a response from Claude
 *   ❌ If OAuth is blocked: You'll see "OAuth authentication is currently not supported"
 */

import { query, isAssistantMessage, extractText } from '../src/index.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  OAuth Token Authentication Test');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Check authentication configuration
  const hasApiKey = !!process.env['ANTHROPIC_API_KEY'];
  const hasOAuthToken = !!process.env['CLAUDE_CODE_OAUTH_TOKEN'];
  const hasVercelOidc = !!process.env['VERCEL_OIDC_TOKEN'];

  console.log('🔍 Checking authentication configuration...\n');

  // Vercel OIDC is always required for sandbox
  if (!hasVercelOidc) {
    console.error('❌ Vercel OIDC token not found!');
    console.error('');
    console.error('   Run these commands to set up Vercel authentication:');
    console.error('     1. vercel login');
    console.error('     2. vercel link');
    console.error('     3. vercel env pull');
    console.error('');
    process.exit(1);
  }
  console.log('   ✅ VERCEL_OIDC_TOKEN: present');

  // Report what Claude authentication is configured
  if (hasApiKey) {
    console.log('   ⚠️  ANTHROPIC_API_KEY: present (starts with',
      process.env['ANTHROPIC_API_KEY']?.slice(0, 14) + '...)');
    console.log('');
    console.log('   WARNING: API key is set alongside OAuth token.');
    console.log('   Both credentials will be passed to the sandbox.');
    console.log('   Claude CLI may prefer API key over OAuth token.');
    console.log('');
    console.log('   For a pure OAuth test, comment out ANTHROPIC_API_KEY in .env.local');
    console.log('');
  } else {
    console.log('   ✅ ANTHROPIC_API_KEY: not set (good for OAuth-only test)');
  }

  if (hasOAuthToken) {
    const tokenPreview = process.env['CLAUDE_CODE_OAUTH_TOKEN']?.slice(0, 18);
    console.log('   ✅ CLAUDE_CODE_OAUTH_TOKEN: present (starts with', tokenPreview + '...)');
  } else {
    console.error('   ❌ CLAUDE_CODE_OAUTH_TOKEN: not set!');
    console.error('');
    console.error('   To test OAuth authentication:');
    console.error('     1. Run: claude auth token');
    console.error('     2. Copy the token (starts with sk-ant-oat01-)');
    console.error('     3. Add to .env.local:');
    console.error('        CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-your-token-here');
    console.error('');
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Running OAuth Authentication Test');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('   Prompt: "What is 2 + 2? Reply with just the number."');
  console.log('   Creating sandbox and running Claude CLI...');
  console.log('');

  const startTime = Date.now();

  try {
    const q = query({
      prompt: 'What is 2 + 2? Reply with just the number.',
    });

    // Collect all messages to check for errors
    let responseText = '';
    let errorMessage = '';

    for await (const message of q) {
      if (isAssistantMessage(message)) {
        responseText += extractText(message);
      }
      // Check for error messages in the stream
      if ('type' in message && message.type === 'error') {
        const errorData = message as { error?: { message?: string } };
        errorMessage = errorData.error?.message || 'Unknown error';
      }
    }

    const duration = Date.now() - startTime;

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ SUCCESS: OAuth Authentication Works!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('   Response:', responseText.trim());
    console.log('   Duration:', duration, 'ms');
    console.log('   Session ID:', q.sessionId);
    console.log('');
    console.log('   OAuth tokens work in Vercel Sandbox!');
    console.log('   You can use CLAUDE_CODE_OAUTH_TOKEN for authentication.');
    console.log('');

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ❌ FAILED: OAuth Authentication');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('   Duration:', duration, 'ms');
    console.log('   Error:', errorMsg);
    console.log('');

    // Analyze the error
    if (errorMsg.includes('OAuth authentication is currently not supported')) {
      console.log('   ┌─────────────────────────────────────────────────────────┐');
      console.log('   │  Anthropic blocks OAuth in this sandbox environment    │');
      console.log('   └─────────────────────────────────────────────────────────┘');
      console.log('');
      console.log('   OAuth tokens are blocked by Anthropic\'s servers for');
      console.log('   Vercel Sandbox. Use ANTHROPIC_API_KEY instead.');
      console.log('');
      console.log('   To use API key authentication:');
      console.log('     1. Go to https://console.anthropic.com/');
      console.log('     2. Create an API key');
      console.log('     3. Add to .env.local:');
      console.log('        ANTHROPIC_API_KEY=sk-ant-api03-your-key-here');
      console.log('');
    } else if (errorMsg.includes('Authentication required')) {
      console.log('   No valid authentication found.');
      console.log('   Make sure CLAUDE_CODE_OAUTH_TOKEN is set correctly.');
      console.log('');
    } else if (errorMsg.includes('invalid') || errorMsg.includes('expired')) {
      console.log('   Your OAuth token may be invalid or expired.');
      console.log('   Try refreshing: claude auth login');
      console.log('');
    } else {
      console.log('   Unexpected error. Full details:');
      console.error('  ', error);
      console.log('');
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
