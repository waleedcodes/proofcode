import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProjectGraph } from '../graph/projectGraph';
import { FileDiff, ProjectRule, RuleResult } from '../types';

export class ProjectRulesEngine {
  private workspaceRoot: string;
  private rulesFilePath: string;

  constructor(workspaceRoot: string, customRulesPath?: string) {
    this.workspaceRoot = workspaceRoot;
    this.rulesFilePath = path.resolve(
      workspaceRoot,
      customRulesPath || '.proofcode/rules.md'
    );
  }

  public getRulesPath(): string {
    return this.rulesFilePath;
  }

  public hasRulesFile(): boolean {
    return fs.existsSync(this.rulesFilePath);
  }

  /**
   * Initializes default .proofcode/rules.md if it doesn't exist
   */
  public async initDefaultRulesFile(): Promise<string> {
    const dir = path.dirname(this.rulesFilePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    const defaultContent = `# Project Rules

Define organizational and architectural standards for your codebase. ProofCode evaluates every code change against these rules.

- **Rule 1 (Authentication):** Every API route must authenticate the user.
- **Rule 2 (Data Privacy):** Never expose passwordHash or secrets in responses.
- **Rule 3 (Resource Ownership):** Users can only access their own orders or user resources.
- **Rule 4 (Test Coverage):** All public API endpoints require tests.
- **Rule 5 (Financial Safety):** Payment operations must be idempotent.
`;

    await fs.promises.writeFile(this.rulesFilePath, defaultContent, 'utf8');
    return this.rulesFilePath;
  }

  /**
   * Parses rules from .proofcode/rules.md
   */
  public parseRules(): ProjectRule[] {
    if (!this.hasRulesFile()) {
      return this.getDefaultRules();
    }

    try {
      const content = fs.readFileSync(this.rulesFilePath, 'utf8');
      const lines = content.split('\n');
      const rules: ProjectRule[] = [];
      let ruleIndex = 1;

      for (const line of lines) {
        const trimmed = line.trim();
        // Match bullet items like "- Every API route..." or "- **Rule 1:** ..."
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const ruleText = trimmed.replace(/^[-*]\s+/, '').trim();
          // Remove leading bold tags if present: **Rule Name:**
          const titleMatch = ruleText.match(/^\*\*(.*?)\*\*:?\s*(.*)$/);
          let title = ruleText;
          let description = ruleText;

          if (titleMatch) {
            title = titleMatch[1].trim();
            description = titleMatch[2].trim() || title;
          }

          rules.push({
            id: `RULE-${ruleIndex++}`,
            title: title || description,
            description,
            severity: 'HIGH'
          });
        }
      }

      return rules.length > 0 ? rules : this.getDefaultRules();
    } catch {
      return this.getDefaultRules();
    }
  }

  public getDefaultRules(): ProjectRule[] {
    return [
      {
        id: 'RULE-1',
        title: 'API Authentication',
        description: 'Every API route must authenticate the user.',
        severity: 'HIGH'
      },
      {
        id: 'RULE-2',
        title: 'Sensitive Field Protection',
        description: 'Never expose passwordHash or secret fields in responses.',
        severity: 'HIGH'
      },
      {
        id: 'RULE-3',
