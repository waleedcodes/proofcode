import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProofCodeEngine } from '../src/engine/proofCodeEngine';

describe('Killer Workflow Demo Fixture', () => {
  it('should analyze the demo app and detect all high risks, impact, and rule violations', async () => {
    const demoDir = path.resolve(__dirname, '../examples/demo-app');
    const engine = new ProofCodeEngine(demoDir);

    const report = await engine.verify();

    expect(report).toBeDefined();
    expect(report.verdict).toBe('BLOCKED');
    expect(report.summary.highRiskCount).toBeGreaterThanOrEqual(1);

    // Verify SQL injection detection
    const sqlRisk = report.risks.find((r) => r.ruleId === 'PC-SEC-001');
    expect(sqlRisk).toBeDefined();
    expect(sqlRisk?.file).toContain('login/route.ts');

    // Verify Missing Authorization in API route
    const authRisk = report.risks.find(
      (r) => r.ruleId === 'PC-AUTH-001' && r.file.includes('orders')
    );
    expect(authRisk).toBeDefined();

    // Verify Rule Violations
    const passwordHashViolation = report.rules.find((r) =>
      r.rule.description.includes('passwordHash') && r.status === 'VIOLATION'
    );
