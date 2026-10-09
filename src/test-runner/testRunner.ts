import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { CheckResult } from '../types';

const execAsync = promisify(exec);

export interface TestRunnerOptions {
  timeoutMs?: number;
}

export class TestRunner {
  private timeoutMs: number;

  constructor(options: TestRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 45000; // 45 seconds default timeout
  }

  /**
   * Detects package manager based on lockfiles
   */
  public detectPackageManager(workspaceRoot: string): 'pnpm' | 'yarn' | 'bun' | 'npm' {
    if (fs.existsSync(path.join(workspaceRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(workspaceRoot, 'yarn.lock'))) return 'yarn';
    if (
      fs.existsSync(path.join(workspaceRoot, 'bun.lockb')) ||
      fs.existsSync(path.join(workspaceRoot, 'bun.lock'))
    ) {
      return 'bun';
    }
    return 'npm';
  }

  private getPackageScripts(workspaceRoot: string): Record<string, string> {
    const pkgPath = path.join(workspaceRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) return {};
    try {
      const data = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return data.scripts || {};
    } catch {
      return {};
    }
  }

  private async executeCommand(
    cmd: string,
    cwd: string,
    name: string
  ): Promise<CheckResult> {
    const startTime = Date.now();
    try {
      const { stdout } = await execAsync(cmd, {
        cwd,
        timeout: this.timeoutMs,
        maxBuffer: 5 * 1024 * 1024
      });
