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
