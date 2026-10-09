import { describe, expect, it } from 'vitest';
import { VerificationReport } from '../src/types';
import { ProofCodeTreeDataProvider } from '../src/ui/treeDataProvider';

describe('ProofCodeTreeDataProvider', () => {
  it('should show run message when no report is set', async () => {
    const provider = new ProofCodeTreeDataProvider();
    const children = await provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toContain('Run "ProofCode: Verify Current Changes"');
  });

  it('should render root categories when a report is loaded', async () => {
    const provider = new ProofCodeTreeDataProvider();
    const mockReport: VerificationReport = {
      timestamp: new Date().toISOString(),
      repoRoot: '/workspace',
      branch: 'working',
      score: { total: 85, deductions: [] },
      verdict: 'READY_TO_SHIP',
      summary: {
        filesChanged: 3,
        linesAdded: 50,
        linesDeleted: 10,
        symbolsAffected: 4,
        apiRoutesAffected: 1,
        testsAdded: 1,
        testsAffected: 1,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0
      },
      impact: {
        changedFiles: ['/workspace/src/app.ts'],
        changedSymbols: [],
        affectedFiles: [],
        affectedCallers: [],
        affectedRoutes: [],
        totalCallersCount: 0,
        untestedCallersCount: 0
      },
      risks: [],
      rules: [],
      checks: {
        typescript: { name: 'TypeScript', status: 'PASS' },
        eslint: { name: 'ESLint', status: 'PASS' },
        unitTests: { name: 'Unit Tests', status: 'PASS' },
        build: { name: 'Build', status: 'PASS' }
      }
    };

    provider.setReport(mockReport);
    const roots = await provider.getChildren();
    expect(roots).toHaveLength(6);
    expect(roots[0].label).toContain('Verification Score: 85%');
    expect(roots[1].label).toContain('Changed Files (3)');
    expect(roots[2].label).toContain('Impact');
    expect(roots[3].label).toContain('Risks & Evidence (0)');
    expect(roots[4].label).toContain('Project Rules');
    expect(roots[5].label).toContain('Checks & Tests');

    // Get children of Changed Files
    const fileChildren = await provider.getChildren(roots[1]);
    expect(fileChildren).toHaveLength(1);
    expect(fileChildren[0].label).toBe('app.ts');
  });
});
