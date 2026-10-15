import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { emitGitHubAnnotations } from '../src/cli';
import { VerificationReport } from '../src/types';

describe('ProofCode CLI', () => {
  it('should emit correct GitHub Actions annotations for risks and rule violations', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockReport: VerificationReport = {
      timestamp: new Date().toISOString(),
      repoRoot: '/workspace',
      branch: 'main',
      verdict: 'BLOCKED',
      score: { total: 45, deductions: [], breakdown: { risksDeduction: 30, impactDeduction: 10, testsDeduction: 0, rulesDeduction: 15 } },
      summary: { filesChanged: 1, linesAdded: 10, linesDeleted: 2, symbolsAffected: 1, apiRoutesAffected: 0, highRiskCount: 1, mediumRiskCount: 0, lowRiskCount: 1, testFailuresCount: 0 },
      risks: [
        {
          id: 'risk-1',
          ruleId: 'PC-SEC-001',
          category: 'security',
          title: 'SQL Injection',
          severity: 'HIGH',
          description: 'Unescaped dynamic query parameter',
          file: '/workspace/src/db.ts',
          line: 12,
          snippet: 'db.query(`SELECT ${id}`)'
        },
        {
          id: 'risk-2',
          ruleId: 'PC-REL-006',
          category: 'reliability',
          title: 'Unhandled Async',
          severity: 'LOW',
          description: 'Missing catch handler',
          file: '/workspace/src/async.ts',
          line: 45,
          snippet: 'await fetchData()'
        }
      ],
      rules: [
        {
          rule: { id: 'R1', title: 'Data Privacy', description: 'No sensitive fields', pattern: 'src/**', severity: 'HIGH' },
          status: 'VIOLATION',
          file: '/workspace/src/api.ts',
          line: 8,
          detectedMessage: 'Detected passwordHash in payload'
        }
      ],
      impact: {
        changedFiles: ['/workspace/src/db.ts'],
        changedSymbols: [],
        affectedFiles: [],
        affectedCallers: [],
        affectedRoutes: [],
        totalCallersCount: 0,
        untestedCallersCount: 0
      },
      checks: {
        typescript: { name: 'TS', status: 'PASS' },
        eslint: { name: 'ESLint', status: 'PASS' },
        unitTests: { name: 'Unit Tests', status: 'PASS' },
        build: { name: 'Build', status: 'PASS' }
      }
    };

    emitGitHubAnnotations(mockReport, '/workspace');

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    consoleSpy.mockRestore();

    expect(calls.some((c) => c.startsWith('::error') && c.includes('[PC-SEC-001]') && c.includes('file=src/db.ts'))).toBe(true);
    expect(calls.some((c) => c.startsWith('::notice') && c.includes('[PC-REL-006]') && c.includes('file=src/async.ts'))).toBe(true);
    expect(calls.some((c) => c.startsWith('::error') && c.includes('Rule Violation: Data Privacy') && c.includes('file=src/api.ts'))).toBe(true);
  });

  it('should write markdown report to GITHUB_STEP_SUMMARY when variable is set', () => {
    const tmpSummary = path.join(os.tmpdir(), `summary-${Date.now()}.md`);
    process.env.GITHUB_STEP_SUMMARY = tmpSummary;

    const mockReport: VerificationReport = {
      timestamp: new Date().toISOString(),
      repoRoot: '/workspace',
      branch: 'main',
      verdict: 'READY_TO_SHIP',
      score: { total: 100, deductions: [], breakdown: { risksDeduction: 0, impactDeduction: 0, testsDeduction: 0, rulesDeduction: 0 } },
      summary: { filesChanged: 0, linesAdded: 0, linesDeleted: 0, symbolsAffected: 0, apiRoutesAffected: 0, highRiskCount: 0, mediumRiskCount: 0, lowRiskCount: 0, testFailuresCount: 0 },
      risks: [],
      rules: [],
      impact: {
        changedFiles: [],
        changedSymbols: [],
        affectedFiles: [],
        affectedCallers: [],
        affectedRoutes: [],
        totalCallersCount: 0,
        untestedCallersCount: 0
      },
      checks: {
        typescript: { name: 'TS', status: 'PASS' },
        eslint: { name: 'ESLint', status: 'PASS' },
        unitTests: { name: 'Unit Tests', status: 'PASS' },
        build: { name: 'Build', status: 'PASS' }
      }
    };

    emitGitHubAnnotations(mockReport, '/workspace');

    expect(fs.existsSync(tmpSummary)).toBe(true);
    const content = fs.readFileSync(tmpSummary, 'utf8');
    expect(content).toContain('ProofCode Verification Report');
    expect(content).toContain('READY TO SHIP');

    fs.unlinkSync(tmpSummary);
    delete process.env.GITHUB_STEP_SUMMARY;
  });
});
