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

      return {
        name,
        status: 'PASS',
        durationMs: Date.now() - startTime,
        message: 'Completed successfully without errors.',
        details: stdout.slice(0, 500)
      };
    } catch (err: unknown) {
      const execError = err as { stdout?: string; stderr?: string; message?: string };
      const output = `${execError.stdout || ''}\n${execError.stderr || ''}`.trim();

      return {
        name,
        status: 'FAIL',
        durationMs: Date.now() - startTime,
        message: 'Checks reported errors.',
        details: output.slice(0, 1000) || execError.message
      };
    }
  }

  public async runTypeScriptCheck(workspaceRoot: string): Promise<CheckResult> {
    const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      return {
        name: 'TypeScript',
        status: 'SKIPPED',
        message: 'No tsconfig.json found in project root.'
      };
    }

    const scripts = this.getPackageScripts(workspaceRoot);
    const pm = this.detectPackageManager(workspaceRoot);

    let cmd = 'npx tsc --noEmit';
    if (scripts['typecheck']) {
      cmd = `${pm} run typecheck`;
    } else if (scripts['type-check']) {
      cmd = `${pm} run type-check`;
    }

    return this.executeCommand(cmd, workspaceRoot, 'TypeScript');
  }

  public async runLint(workspaceRoot: string): Promise<CheckResult> {
    const scripts = this.getPackageScripts(workspaceRoot);
    const pm = this.detectPackageManager(workspaceRoot);

    if (scripts['lint']) {
      return this.executeCommand(`${pm} run lint`, workspaceRoot, 'ESLint');
    }

    const hasEslint =
      fs.existsSync(path.join(workspaceRoot, '.eslintrc.json')) ||
      fs.existsSync(path.join(workspaceRoot, '.eslintrc.js')) ||
      fs.existsSync(path.join(workspaceRoot, 'eslint.config.js')) ||
      fs.existsSync(path.join(workspaceRoot, 'eslint.config.mjs'));

    if (hasEslint) {
      return this.executeCommand('npx eslint .', workspaceRoot, 'ESLint');
    }

    return {
      name: 'ESLint',
      status: 'SKIPPED',
      message: 'No lint script or ESLint configuration detected.'
    };
  }

  public async runUnitTests(workspaceRoot: string): Promise<CheckResult> {
    const scripts = this.getPackageScripts(workspaceRoot);
    const pm = this.detectPackageManager(workspaceRoot);

    if (scripts['test']) {
      // If the default npm test is "echo \"Error: no test specified\" && exit 1", treat as skipped
      if (scripts['test'].includes('no test specified')) {
        return {
          name: 'Unit Tests',
          status: 'SKIPPED',
          message: 'No tests configured in package.json.'
        };
      }
      return this.executeCommand(`${pm} test`, workspaceRoot, 'Unit Tests');
    }

    return {
      name: 'Unit Tests',
      status: 'SKIPPED',
      message: 'No test script found in package.json.'
    };
  }

  public async runBuild(workspaceRoot: string): Promise<CheckResult> {
    const scripts = this.getPackageScripts(workspaceRoot);
    const pm = this.detectPackageManager(workspaceRoot);

    if (scripts['build']) {
      return this.executeCommand(`${pm} run build`, workspaceRoot, 'Build Check');
    }

    return {
      name: 'Build Check',
      status: 'SKIPPED',
      message: 'No build script found in package.json.'
    };
  }
}
