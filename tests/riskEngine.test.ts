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

  it('should detect path traversal in file system operations (PC-SEC-003)', () => {
    const code = `
import * as fs from 'fs';
import * as path from 'path';

export function readUserFile(req: any) {
  const filePath = path.join('/var/data', req.query.filename);
  return fs.readFileSync(filePath, 'utf8');
}
`;
    const findings = RiskEngine.analyzeFile('/src/files.ts', code);
    const pathRisk = findings.find((f) => f.ruleId === 'PC-SEC-003');
    expect(pathRisk).toBeDefined();
    expect(pathRisk?.severity).toBe('HIGH');
    expect(pathRisk?.title).toContain('Path Traversal');
    expect(pathRisk?.evidenceTrace[0].description).toContain('path parameter');
  });

  it('should detect permissive wildcard CORS headers (PC-SEC-007)', () => {
    const code = `
export function handleCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}
`;
    const findings = RiskEngine.analyzeFile('/src/apiCors.ts', code);
    const corsRisk = findings.find((f) => f.ruleId === 'PC-SEC-007');
    expect(corsRisk).toBeDefined();
    expect(corsRisk?.severity).toBe('HIGH');
    expect(corsRisk?.title).toContain('Permissive Wildcard CORS');
  });

  it('should detect regular expression denial of service ReDoS (PC-REL-007)', () => {
    const code = `
export function validateEmail(input: string) {
  const vulnerableRegex = /([a-zA-Z0-9]+)+$/;
  return vulnerableRegex.test(input);
}
`;
    const findings = RiskEngine.analyzeFile('/src/validator.ts', code);
    const redosRisk = findings.find((f) => f.ruleId === 'PC-REL-007');
    expect(redosRisk).toBeDefined();
    expect(redosRisk?.severity).toBe('HIGH');
    expect(redosRisk?.title).toContain('ReDoS');
    expect(redosRisk?.evidenceTrace[0].description).toContain('nested repetition');
  });

  it('should detect unawaited promise in conditional statement (PC-REL-008)', () => {
    const code = `
export async function handleRequest(user: any) {
  if (checkPermission(user)) {
    return 'granted';
  }
  return 'denied';
}
`;
    const findings = RiskEngine.analyzeFile('/src/security.ts', code);
    const promiseRisk = findings.find((f) => f.ruleId === 'PC-REL-008');
    expect(promiseRisk).toBeDefined();
    expect(promiseRisk?.severity).toBe('HIGH');
    expect(promiseRisk?.title).toContain('Unawaited Async Call');
    expect(promiseRisk?.evidenceTrace[0].description).toContain('returns a Promise object without \'await\'');
  });

  it('should detect AI test weakening when test assertions are deleted (PC-TEST-001)', () => {
    const fakeDiff = {
      oldPath: 'tests/auth.test.ts',
      newPath: 'tests/auth.test.ts',
      isNew: false,
      isDeleted: false,
      isRenamed: false,
      hunks: [
        {
          oldStart: 1,
          oldLines: 5,
          newStart: 1,
          newLines: 3,
          header: '@@ -1,5 +1,3 @@',
          lines: [
            ' it("should check auth", () => {',
            '-  expect(res.status).toBe(200);',
            '-  expect(res.body.token).toBeDefined();',
            '+  console.log("passed");',
            ' });'
          ]
        }
      ],
      addedLines: [4],
      deletedLines: [2, 3],
      modifiedLineRanges: [{ start: 1, end: 5 }]
    };

    const findings = RiskEngine.analyzeFile('tests/auth.test.ts', 'it("should check auth", () => {});', fakeDiff);
    const testWeaken = findings.find((f) => f.ruleId === 'PC-TEST-001');
    expect(testWeaken).toBeDefined();
    expect(testWeaken?.severity).toBe('HIGH');
    expect(testWeaken?.title).toContain('Test Weakening');
    expect(testWeaken?.description).toContain('removed 2 test assertion(s)');
  });

  it('should detect scope creep when sensitive root config files are modified (PC-SCOPE-001)', () => {
    const fakeDiff = {
      oldPath: '.env',
      newPath: '.env',
      isNew: false,
      isDeleted: false,
      isRenamed: false,
      hunks: [],
      addedLines: [1, 2],
      deletedLines: [],
      modifiedLineRanges: [{ start: 1, end: 2 }]
    };

    const findings = RiskEngine.analyzeFile('.env', 'DATABASE_URL=postgres://...\n', fakeDiff);
    const scopeRisk = findings.find((f) => f.ruleId === 'PC-SCOPE-001');
    expect(scopeRisk).toBeDefined();
    expect(scopeRisk?.severity).toBe('HIGH');
    expect(scopeRisk?.title).toContain('Sensitive Configuration File Modified');
  });

  it('should detect silent error swallowing in empty catch block (PC-REL-009)', () => {
    const code = `
export function parseConfig(raw: string) {
  try {
    return JSON.parse(raw);
  } catch (err) {}
}
`;
    const findings = RiskEngine.analyzeFile('/src/parser.ts', code);
    const catchRisk = findings.find((f) => f.ruleId === 'PC-REL-009');
    expect(catchRisk).toBeDefined();
    expect(catchRisk?.severity).toBe('MEDIUM');
    expect(catchRisk?.title).toContain('Silent Error Swallowing');
  });

  it('should detect incomplete AI stubs and unimplemented functions (PC-STUB-001)', () => {
    const code = `
export function calculateTax(amount: number): number {
  throw new Error("Not implemented yet");
}
`;
    const findings = RiskEngine.analyzeFile('/src/tax.ts', code);
    const stubRisk = findings.find((f) => f.ruleId === 'PC-STUB-001');
    expect(stubRisk).toBeDefined();
    expect(stubRisk?.severity).toBe('HIGH');
    expect(stubRisk?.title).toContain('Incomplete AI Stub');
  });

  it('should detect silent security field drop in update payloads (PC-DATA-002)', () => {
    const fakeDiff = {
      oldPath: 'src/services/userService.ts',
      newPath: 'src/services/userService.ts',
      isNew: false,
      isDeleted: false,
      isRenamed: false,
      hunks: [
        {
          oldStart: 10,
          oldLines: 6,
          newStart: 10,
          newLines: 4,
          header: '@@ -10,6 +10,4 @@',
          lines: [
            ' const payload = {',
            '   name: req.body.name,',
            '-  tenantId: session.tenantId,',
            '-  userId: session.userId,',
            '+  status: "active"',
            ' };'
          ]
        }
      ],
      addedLines: [13],
      deletedLines: [12, 13],
      modifiedLineRanges: [{ start: 10, end: 15 }]
    };

    const findings = RiskEngine.analyzeFile(
      'src/services/userService.ts',
      'const payload = { name: req.body.name, status: "active" };',
      fakeDiff
    );
    const dropRisk = findings.find((f) => f.ruleId === 'PC-DATA-002');
    expect(dropRisk).toBeDefined();
    expect(dropRisk?.severity).toBe('HIGH');
    expect(dropRisk?.title).toContain('Silent Security Field Dropped');
    expect(dropRisk?.description).toContain('tenantId');
  });
});
