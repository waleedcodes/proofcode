import { describe, expect, it } from 'vitest';
import { TerminalDashboard } from '../src/ui/terminalDashboard';
import { VerificationReport } from '../src/types';

describe('TerminalDashboard (proofcode ui)', () => {
  const mockReport: VerificationReport = {
    verdict: 'NEEDS_REVIEW',
    score: {
      score: 75,
      total: 75,
      breakdown: {
        blastRadius: 20,
        untestedCallers: 20,
        rulesCompliance: 25,
        riskDeductions: 10
      },
      deductions: [{ ruleId: 'PC-ENV-001', amount: 15, reason: 'Unchecked env variable' }]
    },
    branch: 'feat/payment',
    timestamp: '2026-11-20T20:00:00.000Z',
    repoRoot: '/workspace/app',
    summary: {
      filesChanged: 2,
      linesAdded: 45,
      linesDeleted: 12,
      symbolsAffected: 4,
      apiRoutesAffected: 1,
      testsAdded: 0,
      testsAffected: 0,
      highRiskCount: 1,
      mediumRiskCount: 1,
      lowRiskCount: 0
    },
    impact: {
      changedFiles: [],
      changedSymbols: [],
      affectedFiles: [],
      affectedCallers: [
        { callerName: 'processPayment', filePath: 'src/pay.ts', line: 12, hasTest: true }
      ],
      affectedRoutes: [
        { method: 'POST', routePath: '/api/checkout', filePath: 'src/api/checkout.ts', line: 5 }
      ],
      totalCallersCount: 1,
      untestedCallersCount: 0
    },
    checks: {
      typescript: { name: 'TypeScript', status: 'PASS' },
      eslint: { name: 'ESLint', status: 'PASS' },
      unitTests: { name: 'Unit Tests', status: 'PASS' },
      build: { name: 'Build', status: 'PASS' }
    },
    rules: [
      {
        rule: { id: 'RULE-1', title: 'API Auth', description: '', severity: 'HIGH' },
        status: 'PASS'
      }
    ],
    risks: [
      {
        id: 'PC-ENV-1',
        ruleId: 'PC-ENV-001',
        category: 'reliability',
        title: 'Unchecked Environment Variable (API_KEY!)',
        severity: 'HIGH',
        description: 'Forceful non-null assertion on process.env.API_KEY!',
        file: 'src/config.ts',
        line: 15,
        snippet: 'const key = process.env.API_KEY!;',
        evidenceTrace: [],
        recommendation: 'Provide safe default or startup check'
      },
      {
        id: 'PC-ACTION-2',
        ruleId: 'PC-ACTION-002',
        category: 'reliability',
        title: 'Missing Cache Revalidation (updateOrder)',
        severity: 'MEDIUM',
        description: 'Mutates data without revalidatePath',
        file: 'src/actions/order.ts',
        line: 22,
        snippet: 'await db.order.update(...)',
        evidenceTrace: [],
        recommendation: 'Call revalidatePath()'
      }
    ],
    breakageRisks: [
      {
        area: 'Checkout API',
        severity: 'HIGH',
        trigger: 'Modified payment signature',
        detail: 'Downstream caller processPayment affected',
        affectedCallersOrRoutes: ['processPayment']
      }
    ]
  };

  it('should render the overview tab frame with health score and change summary', () => {
    const frame = TerminalDashboard.renderFrame(mockReport, 'overview');

    expect(frame).toContain('PROOFCODE VERIFICATION DASHBOARD');
    expect(frame).toContain('HEALTH SCORE:');
    expect(frame).toContain('75%');
    expect(frame).toContain('feat/payment');
    expect(frame).toContain('Changed Files:       2');
    expect(frame).toContain('Additions/Deletions: +45 / -12 lines');
    expect(frame).toContain('Checkout API');
    expect(frame).toContain('[ 1. OVERVIEW ]');
  });

  it('should render the risks tab frame with cursor and detailed inspection', () => {
    const frame = TerminalDashboard.renderFrame(mockReport, 'risks', 0);

    expect(frame).toContain('[ 2. RISKS (2) ]');
    expect(frame).toContain('CRITICAL FINDINGS');
    expect(frame).toContain('PC-ENV-001');
    expect(frame).toContain('Unchecked Environment Variable');
    expect(frame).toContain('process.env.API_KEY!');
    expect(frame).toContain('Provide safe default');
  });

  it('should render the blast radius tab frame with callers and routes', () => {
    const frame = TerminalDashboard.renderFrame(mockReport, 'blast');

    expect(frame).toContain('[ 3. BLAST RADIUS ]');
    expect(frame).toContain('processPayment');
    expect(frame).toContain('/api/checkout');
  });

  it('should render the auto-fix tab frame listing healable issues', () => {
    const frame = TerminalDashboard.renderFrame(mockReport, 'fix');

    expect(frame).toContain('[ 4. AUTO-FIX ]');
    expect(frame).toContain('ONE-COMMAND AUTO-FIX ENGINE');
    expect(frame).toContain('PC-ENV-001');
    expect(frame).toContain('PC-ACTION-002');
    expect(frame).toContain('Press [f] now to automatically apply');
  });

  it('should display custom status notifications when provided', () => {
    const frame = TerminalDashboard.renderFrame(
      mockReport,
      'overview',
      0,
      'Auto-fix applied successfully!'
    );

    expect(frame).toContain('🔔 Auto-fix applied successfully!');
  });
});
