import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { DiffParser } from './diffParser';
import { GitDiffResult, GitFileStatus } from '../types';

const execAsync = promisify(exec);

export interface GitServiceOptions {
  cwd?: string;
  maxBuffer?: number;
}

export class GitService {
  private cwd: string;
  private maxBuffer: number;

  constructor(options: GitServiceOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.maxBuffer = options.maxBuffer || 10 * 1024 * 1024; // 10MB
  }

  public async getRepoRoot(): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse --show-toplevel', {
        cwd: this.cwd,
        maxBuffer: this.maxBuffer
      });
      return stdout.trim();
    } catch {
      return this.cwd;
    }
  }

  public async getCurrentBranch(repoRoot?: string): Promise<string> {
    const cwd = repoRoot || this.cwd;
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd,
        maxBuffer: this.maxBuffer
      });
      return stdout.trim();
    } catch {
      return 'HEAD';
    }
  }

  public async getStatus(repoRoot?: string): Promise<GitFileStatus[]> {
    const cwd = repoRoot || this.cwd;
    try {
      const { stdout } = await execAsync('git status --porcelain -uall', {
        cwd,
        maxBuffer: this.maxBuffer
      });

      const results: GitFileStatus[] = [];
      const lines = stdout.split('\n');

      for (const rawLine of lines) {
        if (!rawLine || rawLine.trim().length === 0) continue;
        const indexStatus = rawLine[0];
        const workTreeStatus = rawLine[1];
        const filePath = rawLine.substring(3).trim();

        let status: GitFileStatus['status'] = 'modified';
        if (indexStatus === '?' || workTreeStatus === '?') {
          status = 'untracked';
        } else if (indexStatus === 'A' || workTreeStatus === 'A') {
          status = 'added';
        } else if (indexStatus === 'D' || workTreeStatus === 'D') {
          status = 'deleted';
        } else if (indexStatus === 'R' || workTreeStatus === 'R') {
          status = 'renamed';
        }

        results.push({ path: filePath, status });
      }

      return results;
    } catch {
      return [];
    }
  }

  public async getDiff(options?: {
    staged?: boolean;
    baseRef?: string;
    repoRoot?: string;
  }): Promise<GitDiffResult> {
    const repoRoot = options?.repoRoot || (await this.getRepoRoot());
    const parts: string[] = ['git diff'];

    if (options?.staged) {
      parts.push('--cached');
    } else if (options?.baseRef) {
      parts.push(options.baseRef);
    } else {
      // By default compare against HEAD to include both staged and unstaged tracked changes
      // Check if repository has any commits yet
      try {
        await execAsync('git rev-parse HEAD', { cwd: repoRoot });
        parts.push('HEAD');
      } catch {
        // Empty repository, diff against empty tree
        parts.push('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
      }
    }

    let diffOutput = '';
    try {
      const { stdout } = await execAsync(parts.join(' '), {
        cwd: repoRoot,
        maxBuffer: this.maxBuffer
      });
      diffOutput = stdout;
    } catch (err: unknown) {
      // Fallback to simple git diff if HEAD ref fails
      try {
        const { stdout } = await execAsync('git diff', {
          cwd: repoRoot,
          maxBuffer: this.maxBuffer
        });
        diffOutput = stdout;
      } catch {
        diffOutput = '';
      }
    }

    const parsed = DiffParser.parse(diffOutput, repoRoot);

    // Also check for untracked files and synthesize file diffs so new AI-created files are fully verified!
    const statuses = await this.getStatus(repoRoot);
    const untracked = statuses.filter((s) => s.status === 'untracked');

    for (const item of untracked) {
      const fullPath = path.resolve(repoRoot, item.path);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.isFile()) {
          const content = await fs.promises.readFile(fullPath, 'utf8');
          const fileLines = content.split('\n');
          const addedLines = fileLines.map((_, idx) => idx + 1);

          parsed.files.push({
            oldPath: item.path,
            newPath: item.path,
            isNew: true,
            isDeleted: false,
            isRenamed: false,
            hunks: [
              {
                oldStart: 0,
                oldLines: 0,
                newStart: 1,
                newLines: fileLines.length,
                header: `@@ -0,0 +1,${fileLines.length} @@`,
                lines: fileLines.map((l) => `+${l}`)
              }
            ],
            addedLines,
            deletedLines: [],
            modifiedLineRanges: [{ start: 1, end: fileLines.length }]
          });
          parsed.totalFilesChanged++;
          parsed.totalInsertions += fileLines.length;
        }
      } catch {
        // Skip unreadable or directory items
      }
    }

    return parsed;
  }
}
