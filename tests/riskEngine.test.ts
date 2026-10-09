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
`;
    const findings = RiskEngine.analyzeFile('/src/exec.ts', code);
    const evalRisk = findings.find((f) => f.ruleId === 'PC-SEC-004');
    expect(evalRisk).toBeDefined();
    expect(evalRisk?.severity).toBe('HIGH');
  });

  it('should detect SSRF / unvalidated external requests', () => {
    const code = `
export async function proxy(req: any) {
  return fetch(req.body.targetUrl);
}
`;
    const findings = RiskEngine.analyzeFile('/src/proxy.ts', code);
    const ssrfRisk = findings.find((f) => f.ruleId === 'PC-SEC-005');
    expect(ssrfRisk).toBeDefined();
    expect(ssrfRisk?.severity).toBe('MEDIUM');
  });

  it('should detect missing authorization in API routes accessing DB', () => {
    const code = `
export async function GET(req: Request) {
  const orders = await db.order.findMany();
  return Response.json(orders);
}
`;
    const findings = RiskEngine.analyzeFile('/app/api/orders/route.ts', code);
    const authRisk = findings.find((f) => f.ruleId === 'PC-AUTH-001');
    expect(authRisk).toBeDefined();
    expect(authRisk?.severity).toBe('HIGH');
    expect(authRisk?.title).toContain('Missing Authorization Check');
  });

  it('should NOT flag API routes that check authentication', () => {
    const code = `
import { auth } from '@/auth';

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const orders = await db.order.findMany({ where: { userId: session.user.id } });
  return Response.json(orders);
}
`;
    const findings = RiskEngine.analyzeFile('/app/api/orders/route.ts', code);
    const authRisk = findings.find((f) => f.ruleId === 'PC-AUTH-001');
    expect(authRisk).toBeUndefined();
  });

  it('should detect unhandled null database results', () => {
    const code = `
export async function getProfile(id: string) {
  const user = await db.user.findUnique({ where: { id } });
  return user.email;
}
`;
    const findings = RiskEngine.analyzeFile('/src/profile.ts', code);
    const nullRisk = findings.find((f) => f.ruleId === 'PC-DATA-001');
    expect(nullRisk).toBeDefined();
    expect(nullRisk?.severity).toBe('MEDIUM');
    expect(nullRisk?.title).toContain('Unhandled Null/Undefined Database Result');
  });

  it('should NOT flag when null check is present', () => {
    const code = `
export async function getProfile(id: string) {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new Error('Not found');
  return user.email;
}
`;
    const findings = RiskEngine.analyzeFile('/src/profile.ts', code);
    const nullRisk = findings.find((f) => f.ruleId === 'PC-DATA-001');
    expect(nullRisk).toBeUndefined();
  });

  it('should NOT flag when optional chaining is used', () => {
    const code = `
export async function getProfile(id: string) {
  const user = await db.user.findUnique({ where: { id } });
  return user?.email;
}
`;
    const findings = RiskEngine.analyzeFile('/src/profile.ts', code);
    const nullRisk = findings.find((f) => f.ruleId === 'PC-DATA-001');
    expect(nullRisk).toBeUndefined();
  });
});
