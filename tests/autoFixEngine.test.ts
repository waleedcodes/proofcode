import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AutoFixEngine } from '../src/fixer/autoFixEngine';
import { RiskFinding } from '../src/types';

describe('AutoFixEngine', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcode-autofix-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should identify fixable rules correctly', () => {
    expect(AutoFixEngine.isRuleFixable('PC-ENV-001')).toBe(true);
    expect(AutoFixEngine.isRuleFixable('PC-REL-008')).toBe(true);
    expect(AutoFixEngine.isRuleFixable('PC-TYPE-001')).toBe(true);
    expect(AutoFixEngine.isRuleFixable('PC-IMPORT-001')).toBe(true);
    expect(AutoFixEngine.isRuleFixable('PC-UNKNOWN-999')).toBe(false);
  });

  it('should heal PC-ENV-001 (Unchecked Environment Variable Access)', () => {
    const code = `const dbUrl = process.env.DATABASE_URL!;\nconst port = process.env['PORT']!;`;
    const res = AutoFixEngine.fixContent('test.ts', code, [
      { ruleId: 'PC-ENV-001', file: 'test.ts', line: 1 },
      { ruleId: 'PC-ENV-001', file: 'test.ts', line: 2 }
    ]);

    expect(res.appliedFixes.length).toBe(2);
    expect(res.newContent).toContain("process.env.DATABASE_URL || ''");
    expect(res.newContent).toContain("process.env['PORT'] || ''");
  });

  it('should heal PC-REL-008 (Unawaited Async in Conditional)', () => {
    const code = `if (checkPermission(userId)) {\n  proceed();\n}`;
    const res = AutoFixEngine.fixContent('test.ts', code, [
      { ruleId: 'PC-REL-008', file: 'test.ts', line: 1 }
    ]);

    expect(res.appliedFixes.length).toBe(1);
    expect(res.newContent).toBe(`if (await checkPermission(userId)) {\n  proceed();\n}`);
  });

  it('should heal PC-TYPE-001 (as any and @ts-ignore)', () => {
    const code = `// @ts-ignore\nconst data = value as any;`;
    const res = AutoFixEngine.fixContent('test.ts', code, [
      { ruleId: 'PC-TYPE-001', file: 'test.ts', line: 1 },
      { ruleId: 'PC-TYPE-001', file: 'test.ts', line: 2 }
    ]);

    expect(res.appliedFixes.length).toBe(2);
    expect(res.newContent).not.toContain('@ts-ignore');
    expect(res.newContent).toContain('as unknown');
  });

  it('should heal PC-REL-009 (Silent Error Swallowing in Catch Block)', () => {
    const code = `try {\n  run();\n} catch {\n  // empty\n}`;
    const res = AutoFixEngine.fixContent('test.ts', code, [
      { ruleId: 'PC-REL-009', file: 'test.ts', line: 3 }
    ]);

    expect(res.appliedFixes.length).toBe(1);
    expect(res.newContent).toContain("console.error('Operation failed:', error);");
  });

  it('should heal PC-IMPORT-001 (Phantom / Hallucinated Package)', () => {
    const code = `import { fakeCrypto } from 'phantom-lib';\nexport function test() { return 1; }`;
    const res = AutoFixEngine.fixContent('test.ts', code, [
      { ruleId: 'PC-IMPORT-001', file: 'test.ts', line: 1 }
    ]);

    expect(res.appliedFixes.length).toBe(1);
    expect(res.newContent).not.toContain('phantom-lib');
    expect(res.newContent).toContain('export function test()');
  });

  it('should heal PC-MUT-001 (Direct State Mutation in React)', () => {
    const code = `const update = () => {\n  items.push(newItem);\n};`;
    const res = AutoFixEngine.fixContent('test.ts', code, [
      { ruleId: 'PC-MUT-001', file: 'test.ts', line: 2 }
    ]);

    expect(res.appliedFixes.length).toBe(1);
    expect(res.newContent).toContain('items = [...items, newItem]');
  });

  it('should heal multiple different rules in a single file without line drift', () => {
    const code = [
      "import { fakePackage } from 'nonexistent-crypto';",
      'export async function handler(req: Request) {',
      '  if (checkPermission()) {',
      '    const db = process.env.DB_URL!;',
      '    const user = getUser() as any;',
      '  }',
      '}'
    ].join('\n');

    const res = AutoFixEngine.fixContent('test.ts', code, [
      { ruleId: 'PC-IMPORT-001', file: 'test.ts', line: 1 },
      { ruleId: 'PC-REL-008', file: 'test.ts', line: 3 },
      { ruleId: 'PC-ENV-001', file: 'test.ts', line: 4 },
      { ruleId: 'PC-TYPE-001', file: 'test.ts', line: 5 }
    ]);

    expect(res.appliedFixes.length).toBe(4);
    expect(res.newContent).not.toContain('nonexistent-crypto');
    expect(res.newContent).toContain('if (await checkPermission())');
    expect(res.newContent).toContain("process.env.DB_URL || ''");
    expect(res.newContent).toContain('as unknown');
  });

  it('should apply fixes on disk in real files and support dry-run', () => {
    const filePath = path.join(tempDir, 'sample.ts');
    const originalCode = `const secret = process.env.API_KEY!;\n`;
    fs.writeFileSync(filePath, originalCode, 'utf8');

    const risks: RiskFinding[] = [
      {
        id: 'r1',
        ruleId: 'PC-ENV-001',
        category: 'security',
        severity: 'HIGH',
        title: 'Unchecked env',
        description: 'process.env.API_KEY!',
        file: filePath,
        line: 1,
        snippet: 'process.env.API_KEY!',
        evidenceTrace: [],
        recommendation: 'Add safe fallback'
      }
    ];

    // Dry-run should not modify file on disk
    const dryRunSummary = AutoFixEngine.applyFixes(tempDir, risks, { dryRun: true });
    expect(dryRunSummary.dryRun).toBe(true);
    expect(dryRunSummary.totalFixesApplied).toBe(1);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(originalCode);

    // Real run should write to disk
    const realSummary = AutoFixEngine.applyFixes(tempDir, risks, { dryRun: false });
    expect(realSummary.dryRun).toBe(false);
    expect(realSummary.totalFixesApplied).toBe(1);
    expect(realSummary.filesModified).toBe(1);
    expect(fs.readFileSync(filePath, 'utf8')).toContain("process.env.API_KEY || ''");
  });
});
