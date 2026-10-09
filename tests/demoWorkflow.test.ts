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
