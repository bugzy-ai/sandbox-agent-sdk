/**
 * Snapshot Utilities
 *
 * Functions for creating and managing sandbox snapshots
 * to optimize cold start times.
 */

import { Sandbox, Snapshot } from '@vercel/sandbox';
import { SandboxError, wrapError } from '../types/errors.js';

export interface SnapshotOptions {
  /**
   * Timeout for snapshot operations in milliseconds.
   * @default 300000
   */
  timeout?: number;
}

export interface SnapshotInfo {
  /**
   * Snapshot ID.
   */
  id: string;

  /**
   * When the snapshot was created.
   */
  createdAt: Date;

  /**
   * When the snapshot expires.
   */
  expiresAt: Date;

  /**
   * Size in bytes.
   */
  sizeBytes: number;

  /**
   * Status of the snapshot.
   */
  status: 'created' | 'deleted' | 'failed';
}

/**
 * Create a snapshot from a fresh sandbox with Claude CLI installed.
 *
 * This is the recommended way to optimize cold starts in production.
 * Create a snapshot once, then use it for all subsequent requests.
 *
 * NOTE: Snapshots expire after 7 days.
 *
 * @example
 * ```typescript
 * // Create snapshot (do this once, e.g., during deployment)
 * const snapshotId = await createSnapshot();
 * console.log(`Snapshot created: ${snapshotId}`);
 * // Save this ID to your environment variables
 *
 * // Use the snapshot for subsequent requests
 * const result = await query({
 *   prompt: 'Hello!',
 *   snapshotId,
 * });
 * ```
 */
export async function createSnapshot(
  options: SnapshotOptions = {}
): Promise<string> {
  const timeout = options.timeout ?? 300000;

  let sandbox: Sandbox | null = null;

  try {
    console.log('Creating sandbox for snapshot...');

    // Create a fresh sandbox
    sandbox = await Sandbox.create({
      runtime: 'node24',
      timeout,
    });

    console.log('Installing Claude CLI...');

    // Install Claude CLI
    const installResult = await sandbox.runCommand('npm', [
      'install',
      '-g',
      '@anthropic-ai/claude-code',
    ]);

    if (installResult.exitCode !== 0) {
      const stderr = await installResult.stderr();
      throw new SandboxError(`Failed to install Claude CLI: ${stderr}`);
    }

    // Verify installation
    const verifyResult = await sandbox.runCommand('which', ['claude']);
    if (verifyResult.exitCode !== 0) {
      throw new SandboxError('Claude CLI not found after installation');
    }

    console.log('Creating snapshot...');

    // Create the snapshot (this also stops the sandbox)
    const snapshot = await sandbox.snapshot();

    console.log(`Snapshot created: ${snapshot.snapshotId}`);
    console.log(`Expires: ${snapshot.expiresAt.toISOString()}`);

    return snapshot.snapshotId;
  } catch (error) {
    // If we haven't created the snapshot yet, clean up the sandbox
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch {
        // Ignore cleanup errors
      }
    }
    throw wrapError(error, 'Failed to create snapshot');
  }
}

/**
 * Restore a sandbox from a snapshot.
 *
 * @example
 * ```typescript
 * const sandbox = await restoreFromSnapshot(process.env.SNAPSHOT_ID);
 * // sandbox is ready to use with Claude CLI already installed
 * ```
 */
export async function restoreFromSnapshot(
  snapshotId: string,
  options: SnapshotOptions = {}
): Promise<Sandbox> {
  const timeout = options.timeout ?? 300000;

  try {
    const sandbox = await Sandbox.create({
      source: {
        type: 'snapshot',
        snapshotId,
      },
      timeout,
    });

    return sandbox;
  } catch (error) {
    throw wrapError(error, `Failed to restore snapshot ${snapshotId}`);
  }
}

/**
 * Get information about a snapshot.
 */
export async function getSnapshotInfo(snapshotId: string): Promise<SnapshotInfo> {
  try {
    const snapshot = await Snapshot.get({ snapshotId });

    return {
      id: snapshot.snapshotId,
      createdAt: snapshot.createdAt,
      expiresAt: snapshot.expiresAt,
      sizeBytes: snapshot.sizeBytes,
      status: snapshot.status,
    };
  } catch (error) {
    throw wrapError(error, `Failed to get snapshot info: ${snapshotId}`);
  }
}

/**
 * Delete a snapshot.
 */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
  try {
    const snapshot = await Snapshot.get({ snapshotId });
    await snapshot.delete();
  } catch (error) {
    throw wrapError(error, `Failed to delete snapshot: ${snapshotId}`);
  }
}

/**
 * List all snapshots for the current project.
 */
export async function listSnapshots(options?: {
  limit?: number;
  since?: Date;
  until?: Date;
}): Promise<SnapshotInfo[]> {
  try {
    const result = await Snapshot.list({
      limit: options?.limit,
      since: options?.since,
      until: options?.until,
    });

    return result.json.snapshots.map((s) => ({
      id: s.id,
      createdAt: new Date(s.createdAt),
      expiresAt: new Date(s.expiresAt),
      sizeBytes: s.sizeBytes,
      status: s.status,
    }));
  } catch (error) {
    throw wrapError(error, 'Failed to list snapshots');
  }
}

/**
 * Create a snapshot with additional setup beyond just the CLI.
 *
 * Use this when you want to include project files, dependencies,
 * or other setup in your snapshot.
 *
 * @example
 * ```typescript
 * const snapshotId = await createCustomSnapshot({
 *   setup: async (sandbox) => {
 *     // Clone a repo
 *     await sandbox.runCommand('git', [
 *       'clone', '--depth=1',
 *       'https://github.com/user/repo.git',
 *       '/vercel/sandbox/project'
 *     ]);
 *
 *     // Install dependencies
 *     await sandbox.runCommand('npm', ['install'], {
 *       cwd: '/vercel/sandbox/project'
 *     });
 *   },
 * });
 * ```
 */
export async function createCustomSnapshot(
  options: SnapshotOptions & {
    /**
     * Custom setup function to run before creating the snapshot.
     */
    setup?: (sandbox: Sandbox) => Promise<void>;

    /**
     * Whether to install Claude CLI.
     * @default true
     */
    installCli?: boolean;
  }
): Promise<string> {
  const { setup, installCli = true, ...snapshotOptions } = options;
  const timeout = snapshotOptions.timeout ?? 300000;

  let sandbox: Sandbox | null = null;

  try {
    // Create a fresh sandbox
    sandbox = await Sandbox.create({
      runtime: 'node24',
      timeout,
    });

    // Install Claude CLI if requested
    if (installCli) {
      console.log('Installing Claude CLI...');
      const installResult = await sandbox.runCommand('npm', [
        'install',
        '-g',
        '@anthropic-ai/claude-code',
      ]);

      if (installResult.exitCode !== 0) {
        const stderr = await installResult.stderr();
        throw new SandboxError(`Failed to install Claude CLI: ${stderr}`);
      }
    }

    // Run custom setup
    if (setup) {
      console.log('Running custom setup...');
      await setup(sandbox);
    }

    // Create the snapshot
    console.log('Creating snapshot...');
    const snapshot = await sandbox.snapshot();

    return snapshot.snapshotId;
  } catch (error) {
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch {
        // Ignore cleanup errors
      }
    }
    throw wrapError(error, 'Failed to create custom snapshot');
  }
}
