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

  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
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
        details: this.stripAnsi(stdout).slice(0, 1000)
      };
    } catch (err: unknown) {
      const execError = err as { stdout?: string; stderr?: string; message?: string };
      const rawOutput = `${execError.stdout || ''}\n${execError.stderr || ''}`.trim();
      const cleanOutput = this.stripAnsi(rawOutput);

      return {
        name,
        status: 'FAIL',
        durationMs: Date.now() - startTime,
        message: 'Checks reported errors.',
        details: cleanOutput.slice(0, 3000) || execError.message
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

  /**
   * Executes targeted unit tests only on affected test files for ultra-fast (<1s) feedback.
   */
  public async runTargetedTests(
    workspaceRoot: string,
    targetTestFiles: string[]
  ): Promise<CheckResult> {
    if (targetTestFiles.length === 0) {
      return this.runUnitTests(workspaceRoot);
    }

    const scripts = this.getPackageScripts(workspaceRoot);
    const pm = this.detectPackageManager(workspaceRoot);
    const pkgJsonPath = path.join(workspaceRoot, 'package.json');
    let pkgJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
    if (fs.existsSync(pkgJsonPath)) {
      try {
        pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      } catch {
        // ignore
      }
    }

    const allDeps = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.devDependencies || {})
    };

    const relFiles = targetTestFiles.map((f) =>
      path.isAbsolute(f) ? path.relative(workspaceRoot, f) : f
    );
    const filesArg = relFiles.map((f) => `"${f}"`).join(' ');

    let cmd: string;
    if (allDeps['vitest'] || scripts['test']?.includes('vitest')) {
      cmd = `npx vitest run ${filesArg}`;
    } else if (allDeps['jest'] || scripts['test']?.includes('jest')) {
      cmd = `npx jest ${filesArg}`;
    } else if (allDeps['mocha'] || scripts['test']?.includes('mocha')) {
      cmd = `npx mocha ${filesArg}`;
    } else if (scripts['test']) {
      cmd = `${pm} test -- ${filesArg}`;
    } else {
      return {
        name: 'Targeted Tests',
        status: 'SKIPPED',
        message: 'No test runner detected to execute targeted tests.'
      };
    }

    const result = await this.executeCommand(cmd, workspaceRoot, 'Targeted Tests');
    if (result.status === 'PASS') {
      result.message = `Passed ${targetTestFiles.length} affected test suite(s).`;
    } else if (result.status === 'FAIL') {
      result.message = `Failures detected in ${targetTestFiles.length} affected test suite(s).`;
    }
    return result;
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
