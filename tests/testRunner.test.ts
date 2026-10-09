import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestRunner } from '../src/test-runner/testRunner';

describe('TestRunner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcode-runner-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should detect pnpm, yarn, bun, and npm based on lockfiles', () => {
    const runner = new TestRunner();

    expect(runner.detectPackageManager(tempDir)).toBe('npm');

    fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');
    expect(runner.detectPackageManager(tempDir)).toBe('pnpm');

    fs.unlinkSync(path.join(tempDir, 'pnpm-lock.yaml'));
    fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');
    expect(runner.detectPackageManager(tempDir)).toBe('yarn');

    fs.unlinkSync(path.join(tempDir, 'yarn.lock'));
    fs.writeFileSync(path.join(tempDir, 'bun.lockb'), '');
    expect(runner.detectPackageManager(tempDir)).toBe('bun');
  });

  it('should skip TypeScript check if no tsconfig.json exists', async () => {
    const runner = new TestRunner();
    const result = await runner.runTypeScriptCheck(tempDir);
    expect(result.status).toBe('SKIPPED');
  });
});
