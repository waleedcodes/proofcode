import { describe, expect, it } from 'vitest';
import { ProofCodeEngine } from '../src/engine/proofCodeEngine';
import { ReportFormatter } from '../src/engine/reportFormatter';
import { VerificationReport } from '../src/types';

describe('ProofCodeEngine & ReportFormatter', () => {
  it('should run verification on current project without crashing', async () => {
    const engine = new ProofCodeEngine(process.cwd());
    const report = await engine.verify();

    expect(report).toBeDefined();
    expect(report.score.total).toBeGreaterThanOrEqual(0);
    expect(report.score.total).toBeLessThanOrEqual(100);
    expect(['READY_TO_SHIP', 'NEEDS_REVIEW', 'BLOCKED']).toContain(report.verdict);
    expect(report.summary).toBeDefined();
  });

  it('should format report to clean markdown', () => {
    const sampleReport: VerificationReport = {
      timestamp: new Date().toISOString(),
      repoRoot: '/workspace',
      branch: 'main',
      score: {
        total: 82,
        deductions: [{ reason: '1 Medium Risk detected', amount: 7 }]
      },
      verdict: 'NEEDS_REVIEW',
      summary: {
        filesChanged: 2,
        linesAdded: 45,
        linesDeleted: 12,
        symbolsAffected: 5,
        apiRoutesAffected: 1,
        testsAdded: 1,
        testsAffected: 2,
        highRiskCount: 0,
        mediumRiskCount: 1,
        lowRiskCount: 0
      },
      impact: {
        changedFiles: ['src/user.ts'],
        changedSymbols: [
          {
            symbolName: 'getUser',
            kind: 'function',
            filePath: 'src/user.ts',
            callers: [
