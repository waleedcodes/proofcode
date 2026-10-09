import { describe, expect, it } from 'vitest';
import { RiskEngine } from '../src/rules/riskEngine';

describe('RiskEngine', () => {
  it('should detect SQL injection via template literals with evidence', () => {
    const code = `
export async function queryUser(id: string) {
  const result = await db.query(\`SELECT * FROM users WHERE id = '\${id}'\`);
  return result;
}
`;
    const findings = RiskEngine.analyzeFile('/src/db.ts', code);
    const sqlRisk = findings.find((f) => f.ruleId === 'PC-SEC-001');
    expect(sqlRisk).toBeDefined();
    expect(sqlRisk?.severity).toBe('HIGH');
    expect(sqlRisk?.evidenceTrace.length).toBeGreaterThan(0);
    expect(sqlRisk?.evidenceTrace[0].description).toContain('template literal');
  });

  it('should detect SQL injection via string concatenation', () => {
    const code = `
export async function findOrders(status: string) {
  return pool.query("SELECT * FROM orders WHERE status = '" + status + "'");
}
`;
    const findings = RiskEngine.analyzeFile('/src/orders.ts', code);
    const sqlRisk = findings.find((f) => f.ruleId === 'PC-SEC-001');
    expect(sqlRisk).toBeDefined();
    expect(sqlRisk?.title).toContain('String Concatenation');
  });

  it('should detect hardcoded secrets (AWS and OpenAI keys)', () => {
    const code = `
const awsKey = "AKIAIOSFODNN7EXAMPLE";
const openaiKey = "sk-1234567890abcdef1234567890abcdef";
`;
    const findings = RiskEngine.analyzeFile('/src/config.ts', code);
    expect(findings.some((f) => f.title.includes('AWS Access Key'))).toBe(true);
    expect(findings.some((f) => f.title.includes('OpenAI API Secret Key'))).toBe(true);
  });

  it('should detect dangerous eval and child_process exec', () => {
    const code = `
export function runScript(cmd: string) {
  return eval(cmd);
}
