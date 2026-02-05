/**
 * File System Utilities
 *
 * Functions for working with the sandbox virtual filesystem,
 * including mounting GitHub repositories.
 */

import { Sandbox } from '@vercel/sandbox';
import { SandboxError, wrapError } from '../types/errors.js';
import { VFSFile, GitHubRepoConfig } from '../types/options.js';

/**
 * Write files to the sandbox filesystem.
 *
 * @example
 * ```typescript
 * await writeFiles(sandbox, [
 *   { path: '/vercel/sandbox/index.ts', content: 'console.log("Hello")' },
 *   { path: '/vercel/sandbox/package.json', content: '{"name": "test"}' },
 * ]);
 * ```
 */
export async function writeFiles(
  sandbox: Sandbox,
  files: VFSFile[]
): Promise<void> {
  try {
    await sandbox.writeFiles(
      files.map((f) => ({
        path: f.path,
        content: Buffer.from(f.content, 'utf-8'),
      }))
    );
  } catch (error) {
    throw wrapError(error, 'Failed to write files');
  }
}

/**
 * Read a file from the sandbox filesystem.
 *
 * @example
 * ```typescript
 * const content = await readFile(sandbox, '/vercel/sandbox/index.ts');
 * ```
 */
export async function readFile(sandbox: Sandbox, path: string): Promise<string> {
  try {
    const buffer = await sandbox.readFileToBuffer({ path });
    if (buffer === null) {
      throw new SandboxError(`File not found: ${path}`);
    }
    return buffer.toString('utf-8');
  } catch (error) {
    if (error instanceof SandboxError) {
      throw error;
    }
    throw wrapError(error, `Failed to read file: ${path}`);
  }
}

/**
 * List files in a directory.
 *
 * @example
 * ```typescript
 * const files = await listFiles(sandbox, '/vercel/sandbox');
 * // ['index.ts', 'package.json', 'src/']
 * ```
 */
export async function listFiles(
  sandbox: Sandbox,
  path: string
): Promise<string[]> {
  try {
    const result = await sandbox.runCommand('ls', ['-1', path]);

    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new SandboxError(`Failed to list directory: ${stderr}`);
    }

    const stdout = await result.stdout();
    return stdout.split('\n').filter((line) => line.trim());
  } catch (error) {
    if (error instanceof SandboxError) {
      throw error;
    }
    throw wrapError(error, `Failed to list files in: ${path}`);
  }
}

/**
 * Check if a file or directory exists.
 *
 * @example
 * ```typescript
 * if (await fileExists(sandbox, '/vercel/sandbox/package.json')) {
 *   console.log('Package.json exists');
 * }
 * ```
 */
export async function fileExists(
  sandbox: Sandbox,
  path: string
): Promise<boolean> {
  try {
    const result = await sandbox.runCommand('test', ['-e', path]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Mount a GitHub repository into the sandbox.
 *
 * @example
 * ```typescript
 * await mountGitHubRepo(sandbox, {
 *   repo: 'vercel/next.js',
 *   branch: 'main',
 *   path: 'examples/hello-world',
 *   destination: '/vercel/sandbox/project',
 * });
 * ```
 */
export async function mountGitHubRepo(
  sandbox: Sandbox,
  config: GitHubRepoConfig
): Promise<void> {
  const {
    repo,
    branch = 'main',
    path,
    destination = '/vercel/sandbox/project',
  } = config;

  try {
    // Create destination directory
    await sandbox.mkDir(destination);

    if (path) {
      // Sparse checkout for a specific path
      const script = `
        cd ${destination} && \
        git init && \
        git remote add origin https://github.com/${repo}.git && \
        git config core.sparseCheckout true && \
        echo "${path}/*" >> .git/info/sparse-checkout && \
        git pull --depth=1 origin ${branch} && \
        mv ${path}/* . 2>/dev/null || true && \
        rm -rf .git
      `;

      const result = await sandbox.runCommand('bash', ['-c', script]);
      if (result.exitCode !== 0) {
        const stderr = await result.stderr();
        throw new SandboxError(`Git sparse checkout failed: ${stderr}`);
      }
    } else {
      // Full clone (shallow)
      const result = await sandbox.runCommand('git', [
        'clone',
        '--depth=1',
        '--single-branch',
        '--branch',
        branch,
        `https://github.com/${repo}.git`,
        destination,
      ]);

      if (result.exitCode !== 0) {
        const stderr = await result.stderr();
        throw new SandboxError(`Git clone failed: ${stderr}`);
      }

      // Remove .git directory to save space
      await sandbox.runCommand('rm', ['-rf', `${destination}/.git`]);
    }
  } catch (error) {
    if (error instanceof SandboxError) {
      throw error;
    }
    throw wrapError(error, `Failed to mount GitHub repo: ${repo}`);
  }
}

/**
 * Download and extract a tarball into the sandbox.
 *
 * @example
 * ```typescript
 * await extractTarball(sandbox, {
 *   url: 'https://example.com/project.tar.gz',
 *   destination: '/vercel/sandbox/project',
 * });
 * ```
 */
export async function extractTarball(
  sandbox: Sandbox,
  config: { url: string; destination: string }
): Promise<void> {
  const { url, destination } = config;

  try {
    await sandbox.mkDir(destination);

    const result = await sandbox.runCommand('bash', [
      '-c',
      `curl -sL "${url}" | tar -xz -C "${destination}" --strip-components=1`,
    ]);

    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new SandboxError(`Failed to extract tarball: ${stderr}`);
    }
  } catch (error) {
    if (error instanceof SandboxError) {
      throw error;
    }
    throw wrapError(error, `Failed to extract tarball: ${url}`);
  }
}

/**
 * Create a directory structure.
 *
 * @example
 * ```typescript
 * await createDirectories(sandbox, [
 *   '/vercel/sandbox/src',
 *   '/vercel/sandbox/test',
 *   '/vercel/sandbox/dist',
 * ]);
 * ```
 */
export async function createDirectories(
  sandbox: Sandbox,
  paths: string[]
): Promise<void> {
  try {
    for (const path of paths) {
      await sandbox.mkDir(path);
    }
  } catch (error) {
    throw wrapError(error, 'Failed to create directories');
  }
}

/**
 * Copy files within the sandbox.
 *
 * @example
 * ```typescript
 * await copyFile(sandbox, '/vercel/sandbox/source.txt', '/vercel/sandbox/dest.txt');
 * ```
 */
export async function copyFile(
  sandbox: Sandbox,
  source: string,
  destination: string
): Promise<void> {
  try {
    const result = await sandbox.runCommand('cp', ['-r', source, destination]);

    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new SandboxError(`Copy failed: ${stderr}`);
    }
  } catch (error) {
    if (error instanceof SandboxError) {
      throw error;
    }
    throw wrapError(error, `Failed to copy: ${source} -> ${destination}`);
  }
}

/**
 * Delete a file or directory.
 *
 * @example
 * ```typescript
 * await deleteFile(sandbox, '/vercel/sandbox/temp', true);
 * ```
 */
export async function deleteFile(
  sandbox: Sandbox,
  path: string,
  recursive: boolean = false
): Promise<void> {
  try {
    const args = recursive ? ['-rf', path] : [path];
    const result = await sandbox.runCommand('rm', args);

    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new SandboxError(`Delete failed: ${stderr}`);
    }
  } catch (error) {
    if (error instanceof SandboxError) {
      throw error;
    }
    throw wrapError(error, `Failed to delete: ${path}`);
  }
}
