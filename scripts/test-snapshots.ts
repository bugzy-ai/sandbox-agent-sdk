/**
 * Snapshot Test Script
 *
 * Tests sandbox snapshot creation and restoration functionality.
 * Snapshots allow faster cold starts by resuming from a pre-configured state.
 *
 * Run with: npm run test:snapshots
 *
 * This test runs multiple iterations to show realistic performance differences.
 */

import { query, createSnapshot } from '../src/index.js';

// ============================================================================
// Configuration
// ============================================================================

const FRESH_SANDBOX_RUNS = 2;    // Number of fresh sandbox queries (slower, fewer needed)
const SNAPSHOT_RUNS = 3;         // Number of snapshot queries (faster, more to show consistency)

// ============================================================================
// Utilities
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function calculateStats(durations: number[]): { min: number; max: number; avg: number } {
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  return { min, max, avg };
}

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
  }
  if (hasOAuthToken) {
    console.log('✅ CLAUDE_CODE_OAUTH_TOKEN found (experimental)');
  }

  return true;
}

// ============================================================================
// Snapshot Tests
// ============================================================================

async function testSnapshotCreation(): Promise<string | null> {
  console.log('\n📸 Phase 1: Snapshot Creation');
  console.log('─'.repeat(50));
  console.log('   Creating snapshot with Claude CLI pre-installed...\n');

  const startTime = Date.now();

  try {
    const snapshotId = await createSnapshot();
    const duration = Date.now() - startTime;

    const isValid = snapshotId.startsWith('snap_') || snapshotId.length > 10;

    if (isValid) {
      console.log(`   ✅ Snapshot created successfully!`);
      console.log(`   ID: ${snapshotId}`);
      console.log(`   Duration: ${formatDuration(duration)}`);
      return snapshotId;
    } else {
      console.log(`   ❌ Invalid snapshot ID: ${snapshotId}`);
      return null;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`   ❌ Snapshot creation failed after ${formatDuration(duration)}`);
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function runSingleQuery(prompt: string, snapshotId?: string): Promise<number> {
  const startTime = Date.now();

  const q = query({
    prompt,
    ...(snapshotId && { snapshotId }),
  });

  await q.text();
  return Date.now() - startTime;
}

async function testFreshSandboxQueries(): Promise<number[]> {
  console.log(`\n⏱️  Phase 2: Fresh Sandbox Queries (${FRESH_SANDBOX_RUNS} runs)`);
  console.log('─'.repeat(50));
  console.log('   Each run creates a new sandbox and installs Claude CLI...\n');

  const durations: number[] = [];

  for (let i = 1; i <= FRESH_SANDBOX_RUNS; i++) {
    process.stdout.write(`   Run ${i}/${FRESH_SANDBOX_RUNS}: `);

    try {
      const duration = await runSingleQuery(`Say "fresh ${i}" and nothing else.`);
      durations.push(duration);
      console.log(`${formatDuration(duration)}`);
    } catch (error) {
      console.log(`❌ Failed - ${error instanceof Error ? error.message : error}`);
    }
  }

  return durations;
}

async function testSnapshotQueries(snapshotId: string): Promise<number[]> {
  console.log(`\n⚡ Phase 3: Snapshot Queries (${SNAPSHOT_RUNS} runs)`);
  console.log('─'.repeat(50));
  console.log(`   Using snapshot: ${snapshotId.slice(0, 30)}...`);
  console.log('   Each run restores from snapshot (CLI already installed)...\n');

  const durations: number[] = [];

  for (let i = 1; i <= SNAPSHOT_RUNS; i++) {
    process.stdout.write(`   Run ${i}/${SNAPSHOT_RUNS}: `);

    try {
      const duration = await runSingleQuery(`Say "snap ${i}" and nothing else.`, snapshotId);
      durations.push(duration);

      // Mark first run specially (cold cache)
      if (i === 1) {
        console.log(`${formatDuration(duration)} (first restore - may include cache warm-up)`);
      } else {
        console.log(`${formatDuration(duration)}`);
      }
    } catch (error) {
      console.log(`❌ Failed - ${error instanceof Error ? error.message : error}`);
    }
  }

  return durations;
}

function printDetailedComparison(freshDurations: number[], snapshotDurations: number[]): void {
  console.log('\n📊 Performance Comparison');
  console.log('═'.repeat(60));

  const freshStats = calculateStats(freshDurations);
  const snapshotStats = calculateStats(snapshotDurations);

  // Also calculate snapshot stats excluding first run (warmed cache)
  const warmedSnapshotDurations = snapshotDurations.slice(1);
  const warmedStats = warmedSnapshotDurations.length > 0
    ? calculateStats(warmedSnapshotDurations)
    : snapshotStats;

  console.log('\n   Fresh Sandbox (full setup each time):');
  console.log(`   ├─ Average: ${formatDuration(freshStats.avg)}`);
  console.log(`   ├─ Min:     ${formatDuration(freshStats.min)}`);
  console.log(`   └─ Max:     ${formatDuration(freshStats.max)}`);

  console.log('\n   With Snapshot (all runs):');
  console.log(`   ├─ Average: ${formatDuration(snapshotStats.avg)}`);
  console.log(`   ├─ Min:     ${formatDuration(snapshotStats.min)}`);
  console.log(`   └─ Max:     ${formatDuration(snapshotStats.max)}`);

  if (warmedSnapshotDurations.length > 0) {
    console.log('\n   With Snapshot (excluding first/cold run):');
    console.log(`   ├─ Average: ${formatDuration(warmedStats.avg)}`);
    console.log(`   ├─ Min:     ${formatDuration(warmedStats.min)}`);
    console.log(`   └─ Max:     ${formatDuration(warmedStats.max)}`);
  }

  // Calculate improvements
  console.log('\n   ─────────────────────────────────────────────────────');

  const avgImprovement = freshStats.avg - snapshotStats.avg;
  const avgPercent = ((avgImprovement / freshStats.avg) * 100).toFixed(1);

  const warmedImprovement = freshStats.avg - warmedStats.avg;
  const warmedPercent = ((warmedImprovement / freshStats.avg) * 100).toFixed(1);

  if (avgImprovement > 0) {
    console.log(`\n   ⚡ Snapshot is ${formatDuration(avgImprovement)} faster on average (${avgPercent}%)`);
  } else {
    console.log(`\n   ⚠️  Snapshot was ${formatDuration(Math.abs(avgImprovement))} slower on average`);
    console.log(`\n   💡 Note: Snapshots may be slower when:`);
    console.log(`      • Vercel's CLI install is already cached/optimized`);
    console.log(`      • Snapshot storage is in a different region`);
    console.log(`      • The snapshot is large or complex`);
    console.log(`      • Network conditions favor fresh downloads`);
  }

  if (warmedSnapshotDurations.length > 0) {
    if (warmedImprovement > 0) {
      console.log(`   ⚡ After warm-up: ${formatDuration(warmedImprovement)} faster (${warmedPercent}%)`);
    } else if (warmedImprovement < avgImprovement) {
      // Warm runs are faster than cold, but still slower than fresh
      console.log(`   📈 After warm-up: Still ${formatDuration(Math.abs(warmedImprovement))} slower, but improving`);
    }
  }

  // Visual bar comparison
  console.log('\n   Visual comparison (average times):');
  const maxDuration = Math.max(freshStats.avg, snapshotStats.avg);
  const freshBarLen = Math.round((freshStats.avg / maxDuration) * 30);
  const snapBarLen = Math.round((snapshotStats.avg / maxDuration) * 30);

  console.log(`   Fresh:    [${'█'.repeat(freshBarLen)}${'░'.repeat(30 - freshBarLen)}] ${formatDuration(freshStats.avg)}`);
  console.log(`   Snapshot: [${'█'.repeat(snapBarLen)}${'░'.repeat(30 - snapBarLen)}] ${formatDuration(snapshotStats.avg)}`);

  console.log('\n' + '═'.repeat(60));
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('📸 Snapshot Performance Test');
  console.log('═'.repeat(60));
  console.log('This test compares fresh sandbox setup vs snapshot restoration.');
  console.log(`Running ${FRESH_SANDBOX_RUNS} fresh queries and ${SNAPSHOT_RUNS} snapshot queries.`);

  // Check authentication
  const authOk = await checkAuthentication();
  if (!authOk) {
    console.log('\n❌ Authentication check failed. Please fix and try again.');
    process.exit(1);
  }

  // Phase 1: Create snapshot
  const snapshotId = await testSnapshotCreation();
  if (!snapshotId) {
    console.log('\n❌ Cannot continue without a valid snapshot.');
    process.exit(1);
  }

  // Phase 2: Fresh sandbox queries (baseline)
  const freshDurations = await testFreshSandboxQueries();
  if (freshDurations.length === 0) {
    console.log('\n❌ All fresh sandbox queries failed.');
    process.exit(1);
  }

  // Phase 3: Snapshot queries
  const snapshotDurations = await testSnapshotQueries(snapshotId);
  if (snapshotDurations.length === 0) {
    console.log('\n❌ All snapshot queries failed.');
    process.exit(1);
  }

  // Print detailed comparison
  printDetailedComparison(freshDurations, snapshotDurations);

  // Summary
  const totalTests = freshDurations.length + snapshotDurations.length + 1; // +1 for snapshot creation
  console.log(`\n🎉 All ${totalTests} tests completed!`);

  // Output snapshot ID for reuse
  console.log('\n💡 To reuse this snapshot in your code:');
  console.log('─'.repeat(50));
  console.log(`const q = query({`);
  console.log(`  prompt: 'Your prompt here',`);
  console.log(`  snapshotId: '${snapshotId}',`);
  console.log(`});`);

  process.exit(0);
}

main().catch((error) => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
