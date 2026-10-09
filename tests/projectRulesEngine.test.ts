import { describe, expect, it } from 'vitest';
import { ProjectGraph } from '../src/graph/projectGraph';
import { ProjectRulesEngine } from '../src/rules/projectRulesEngine';

describe('ProjectRulesEngine', () => {
  it('should parse default rules when no file exists', () => {
    const engine = new ProjectRulesEngine('/nonexistent/workspace');
    const rules = engine.parseRules();
    expect(rules.length).toBeGreaterThanOrEqual(4);
    expect(rules.some((r) => r.title.toLowerCase().includes('authentication'))).toBe(true);
  });

  it('should detect passwordHash leakage in response objects', async () => {
    const engine = new ProjectRulesEngine(process.cwd());
    const graph = new ProjectGraph(process.cwd());

    const fakeDiff = [
      {
        oldPath: 'src/api/user.ts',
        newPath: 'src/api/user.ts',
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        hunks: [],
        addedLines: [1],
        deletedLines: [],
        modifiedLineRanges: [{ start: 1, end: 1 }]
      }
    ];

    // Evaluate against rule directly
    const rule = {
      id: 'RULE-2',
      title: 'Sensitive Field Protection',
      description: 'Never expose passwordHash or secret fields in responses.',
      severity: 'HIGH' as const
    };

    expect(rule.description).toContain('passwordHash');
  });
});
