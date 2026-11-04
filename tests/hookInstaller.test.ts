import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HookInstaller } from '../src/git/hookInstaller';

describe('HookInstaller', () => {
  let tempDir: string;
  let gitDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcode-hook-test-'));
    gitDir = path.join(tempDir, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should find git root when starting in a subfolder', () => {
    const subDir = path.join(tempDir, 'src', 'components');
    fs.mkdirSync(subDir, { recursive: true });

    const root = HookInstaller.findGitRoot(subDir);
    expect(root).toBe(tempDir);
  });

  it('should return null if no .git directory exists in hierarchy', () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcode-nongit-'));
    try {
      const root = HookInstaller.findGitRoot(nonGitDir);
      expect(root).toBeNull();
    } finally {
      fs.rmSync(nonGitDir, { recursive: true, force: true });
    }
  });

  it('should install pre-commit hook in a fresh repository', () => {
    const res = HookInstaller.installPreCommitHook(tempDir);
    expect(res.success).toBe(true);

    const hookFile = path.join(gitDir, 'hooks', 'pre-commit');
    expect(fs.existsSync(hookFile)).toBe(true);

    const content = fs.readFileSync(hookFile, 'utf8');
    expect(content).toContain('proofcode verify --staged');
    expect(content).toContain('BEGIN PROOFCODE HOOK');
  });

  it('should be idempotent and not duplicate hook content on re-run', () => {
    HookInstaller.installPreCommitHook(tempDir);
    const res2 = HookInstaller.installPreCommitHook(tempDir);
    expect(res2.success).toBe(true);
    expect(res2.message).toContain('already installed');

    const hookFile = path.join(gitDir, 'hooks', 'pre-commit');
    const content = fs.readFileSync(hookFile, 'utf8');
    const occurrences = (content.match(/BEGIN PROOFCODE HOOK/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('should append to an existing pre-commit hook without destroying it', () => {
    const hooksDir = path.join(gitDir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    const hookFile = path.join(hooksDir, 'pre-commit');
    fs.writeFileSync(hookFile, '#!/bin/sh\necho "Running existing linter..."\n', 'utf8');

    const res = HookInstaller.installPreCommitHook(tempDir);
    expect(res.success).toBe(true);

    const updated = fs.readFileSync(hookFile, 'utf8');
    expect(updated).toContain('Running existing linter...');
    expect(updated).toContain('proofcode verify --staged');
  });

  it('should cleanly uninstall ProofCode hook while keeping other hooks', () => {
    const hooksDir = path.join(gitDir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    const hookFile = path.join(hooksDir, 'pre-commit');
    fs.writeFileSync(hookFile, '#!/bin/sh\necho "Existing hook"\n', 'utf8');

    HookInstaller.installPreCommitHook(tempDir);
    const unres = HookInstaller.uninstallPreCommitHook(tempDir);
    expect(unres.success).toBe(true);

    const finalContent = fs.readFileSync(hookFile, 'utf8');
    expect(finalContent).toContain('Existing hook');
    expect(finalContent).not.toContain('proofcode verify');
  });
});
