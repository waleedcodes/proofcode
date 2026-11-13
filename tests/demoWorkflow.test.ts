import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProofCodeEngine } from '../src/engine/proofCodeEngine';

describe('Killer Workflow Demo Fixture', () => {
  it('should analyze the demo app and detect all high risks, impact, and rule violations', async () => {
    const demoDir = path.resolve(__dirname, '../examples/demo-app');
    const engine = new ProofCodeEngine(demoDir);

    const report = await engine.verify({ allFiles: true });

    expect(report).toBeDefined();
    expect(report.verdict).toBe('BLOCKED');
    expect(report.summary.highRiskCount).toBeGreaterThanOrEqual(3);

    // Verify SQL injection detection
    const sqlRisk = report.risks.find((r) => r.ruleId === 'PC-SEC-001');
    expect(sqlRisk).toBeDefined();
    expect(sqlRisk?.file).toContain('login/route.ts');

    // Verify Missing Authorization in API route
    const authRisk = report.risks.find(
      (r) => r.ruleId === 'PC-AUTH-001' && r.file.includes('orders')
    );
    expect(authRisk).toBeDefined();

    // Verify Unawaited Async Check in Conditional (PC-REL-008)
    const promiseRisk = report.risks.find((r) => r.ruleId === 'PC-REL-008');
    expect(promiseRisk).toBeDefined();

    // Verify Direct React State Mutation (PC-MUT-001)
    const mutRisk = report.risks.find((r) => r.ruleId === 'PC-MUT-001');
    expect(mutRisk).toBeDefined();

    // Verify Type Assertion Bypass (PC-TYPE-001)
    const typeRisk = report.risks.find((r) => r.ruleId === 'PC-TYPE-001');
    expect(typeRisk).toBeDefined();

    // Verify Unchecked Environment Variable Access (PC-ENV-001)
    const envRisk = report.risks.find((r) => r.ruleId === 'PC-ENV-001');
    expect(envRisk).toBeDefined();

    // Verify Phantom Package Import (PC-IMPORT-001)
    const importRisk = report.risks.find((r) => r.ruleId === 'PC-IMPORT-001');
    expect(importRisk).toBeDefined();

    // Verify Rule Violations
    const passwordHashViolation = report.rules.find((r) =>
      r.rule.description.includes('passwordHash') && r.status === 'VIOLATION'
    );
    expect(passwordHashViolation).toBeDefined();

    // Verify Impact Analysis
    const changedUserSymbol = report.impact.changedSymbols.find(
      (s) => s.symbolName === 'getUser'
    );
    expect(changedUserSymbol).toBeDefined();
    expect(changedUserSymbol?.callers.length).toBeGreaterThanOrEqual(3);
    expect(report.impact.untestedCallersCount).toBeGreaterThan(0);
  });
});
