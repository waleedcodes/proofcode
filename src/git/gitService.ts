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
