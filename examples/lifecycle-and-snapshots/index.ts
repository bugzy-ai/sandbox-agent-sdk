/**
 * Snapshots and Setup Example
 *
 * This example demonstrates the sandbox setup and snapshot features:
 * 1. Setup hooks and shorthand configuration
 * 2. Automatic snapshot creation (snapshotEnabled: true, the default)
 * 3. Disabling snapshots (snapshotEnabled: false)
 * 4. Resuming from snapshots
 */

import {
  query,
  extractText,
  isAssistantMessage,
  isResultMessage,
  type SandboxContext,
  type QueryResultInfo,
  type SnapshotResult,
} from '../../src/index.js';

// ============================================================================
// Example 1: Simple File Setup
// ============================================================================
async function example1_simpleFileSetup() {
  console.log('\n=== Example 1: Simple File Setup ===\n');

  const q = query({
    prompt: 'Read the README.md file and summarize it.',
    setup: {
      files: [
        {
          path: '/vercel/sandbox/README.md',
          content: `# My Awesome Project

This is a sample project demonstrating the Claude Agent SDK.

## Features
- Sandbox isolation
- Automatic setup
- Snapshot support

## Getting Started
Run \`npm install\` and then \`npm start\`.
`,
        },
      ],
    },
  });

  const text = await q.text();
  console.log('Response:', text);
}

// ============================================================================
// Example 2: GitHub Repo Clone with npm Install
// ============================================================================
async function example2_githubSetup() {
  console.log('\n=== Example 2: GitHub Repo Clone ===\n');

  const q = query({
    prompt: 'List the files in the project and describe its structure.',
    setup: {
      // Clone a repository
      githubRepo: {
        repo: 'anthropics/claude-code-example',
        branch: 'main',
        destination: '/vercel/sandbox/project',
      },
      // Run npm install after cloning
      commands: [{ cmd: 'npm', args: ['install'], cwd: '/vercel/sandbox/project' }],
    },
  });

  const text = await q.text();
  console.log('Response:', text);
}

// ============================================================================
// Example 3: Advanced Hooks
// ============================================================================
async function example3_advancedHooks() {
  console.log('\n=== Example 3: Advanced Hooks ===\n');

  const q = query({
    prompt: 'Run the tests and report the results.',
    setup: {
      files: [
        {
          path: '/vercel/sandbox/project/package.json',
          content: JSON.stringify(
            {
              name: 'test-project',
              scripts: { test: 'echo "All tests passed!"' },
            },
            null,
            2
          ),
        },
      ],
    },
    hooks: {
      async onSetup(sandbox: SandboxContext) {
        console.log('[Hook] onSetup called, sandbox ID:', sandbox.sandboxId);

        // Create additional files programmatically
        await sandbox.writeFiles([
          {
            path: '/vercel/sandbox/project/config.json',
            content: JSON.stringify({ environment: 'test' }),
          },
        ]);

        // Run custom setup commands
        const result = await sandbox.runCommand('ls', ['-la'], {
          cwd: '/vercel/sandbox/project',
        });
        console.log('[Hook] Project files:', result.stdout);
      },

      async onTeardown(sandbox: SandboxContext, result: QueryResultInfo) {
        console.log('[Hook] onTeardown called');
        console.log('[Hook] Query success:', result.success);
        console.log('[Hook] Duration:', result.durationMs, 'ms');
        console.log('[Hook] Messages count:', result.messagesCount);

        // Read logs or results if needed
        if (!result.success) {
          try {
            const errorLog = await sandbox.readFile('/vercel/sandbox/error.log');
            console.log('[Hook] Error log:', errorLog);
          } catch {
            // No error log file
          }
        }
      },

      async onSetupError(error: Error, sandbox: SandboxContext) {
        console.error('[Hook] Setup failed:', error.message);
        // Could write error details to a file for debugging
        await sandbox.writeFiles([
          {
            path: '/vercel/sandbox/setup-error.txt',
            content: `Setup failed at ${new Date().toISOString()}\n${error.stack}`,
          },
        ]);
      },
    },
  });

  const text = await q.text();
  console.log('Response:', text);
}

// ============================================================================
// Example 4: Default Snapshot Behavior (snapshotEnabled: true)
// ============================================================================
async function example4_defaultSnapshot() {
  console.log('\n=== Example 4: Default Snapshot (Enabled) ===\n');

  // By default, snapshotEnabled is true - a snapshot is created on success
  const q = query({
    prompt: 'Set up a basic Node.js project with an index.js file',
    setup: {
      files: [
        {
          path: '/vercel/sandbox/project/package.json',
          content: JSON.stringify({ name: 'my-project', version: '1.0.0' }, null, 2),
        },
        {
          path: '/vercel/sandbox/project/index.js',
          content: 'console.log("Hello from my project!");',
        },
      ],
    },
    // snapshotEnabled: true is the default
  });

  await q.text();

  // Snapshot info is available on the query object after completion
  console.log('Snapshot ID:', q.snapshotId);
  console.log('Snapshot info:', q.snapshotInfo);

  return q.snapshotId;
}

// ============================================================================
// Example 5: Disable Snapshot Creation
// ============================================================================
async function example5_noSnapshot() {
  console.log('\n=== Example 5: Disable Snapshot ===\n');

  // For one-off tasks, disable snapshot creation
  const q = query({
    prompt: 'What is 2 + 2?',
    snapshotEnabled: false, // Don't create snapshot
  });

  const text = await q.text();
  console.log('Response:', text);
  console.log('Snapshot ID (should be null):', q.snapshotId);
}

// ============================================================================
// Example 6: Advanced Snapshot Options
// ============================================================================
async function example6_advancedSnapshot() {
  console.log('\n=== Example 6: Advanced Snapshot Options ===\n');

  let savedSnapshotId: string | null = null;

  const q = query({
    prompt: 'Create a Python project with a main.py file',
    setup: {
      files: [
        {
          path: '/vercel/sandbox/project/main.py',
          content: 'print("Hello, Python!")',
        },
      ],
    },
    // Advanced snapshot options for fine-grained control
    snapshot: {
      mode: 'on-success',
      metadata: {
        project: 'python-demo',
        createdBy: 'example-script',
      },
      onSnapshot: (info: SnapshotResult) => {
        console.log('[Snapshot] Created successfully!');
        console.log('[Snapshot] ID:', info.snapshotId);
        console.log('[Snapshot] Expires:', info.expiresAt);
        savedSnapshotId = info.snapshotId;
      },
    },
  });

  await q.text();
  return savedSnapshotId;
}

// ============================================================================
// Example 7: Resume from Snapshot
// ============================================================================
async function example7_resumeFromSnapshot(snapshotId: string) {
  console.log('\n=== Example 7: Resume from Snapshot ===\n');

  const q = query({
    prompt: 'List the files in the project and run the index.js file',
    snapshotId, // Resume from a previous snapshot
    snapshotEnabled: false, // Don't create another snapshot
  });

  const text = await q.text();
  console.log('Resumed query response:', text);
}

// ============================================================================
// Main Runner
// ============================================================================
async function main() {
  console.log('Snapshots and Setup Examples');
  console.log('============================\n');

  try {
    // Run examples that don't require external resources
    await example1_simpleFileSetup();
    await example3_advancedHooks();

    // Example with snapshot (would need real API key)
    // const snapshotId = await example4_defaultSnapshot();
    // if (snapshotId) {
    //   await example7_resumeFromSnapshot(snapshotId);
    // }

    console.log('\n=== All examples completed ===');
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Export examples for individual testing
export {
  example1_simpleFileSetup,
  example2_githubSetup,
  example3_advancedHooks,
  example4_defaultSnapshot,
  example5_noSnapshot,
  example6_advancedSnapshot,
  example7_resumeFromSnapshot,
};

// Run if executed directly
main().catch(console.error);
