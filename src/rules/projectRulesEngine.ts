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
        title: 'Resource Ownership',
        description: 'Users can only access their own orders or sensitive resources.',
        severity: 'HIGH'
      },
      {
        id: 'RULE-4',
        title: 'API Test Requirement',
        description: 'All public API endpoints require tests.',
        severity: 'MEDIUM'
      },
      {
        id: 'RULE-5',
        title: 'Payment Idempotency',
        description: 'Payment operations must be idempotent.',
        severity: 'MEDIUM'
      }
    ];
  }

  /**
   * Checks changes against active project rules
   */
  public async evaluateRules(
    fileDiffs: FileDiff[],
    graph: ProjectGraph
  ): Promise<RuleResult[]> {
    const rules = this.parseRules();
    const results: RuleResult[] = [];

    for (const rule of rules) {
      const result = await this.evaluateSingleRule(rule, fileDiffs, graph);
      results.push(result);
    }

    return results;
  }

  private async evaluateSingleRule(
    rule: ProjectRule,
    fileDiffs: FileDiff[],
    graph: ProjectGraph
  ): Promise<RuleResult> {
    const textLower = `${rule.title} ${rule.description}`.toLowerCase();

    const resolveFile = (relPath: string): string | null => {
      if (path.isAbsolute(relPath) && fs.existsSync(relPath)) return relPath;
      const direct = path.resolve(this.workspaceRoot, relPath);
      if (fs.existsSync(direct)) return direct;
      const cwdPath = path.resolve(relPath);
      if (fs.existsSync(cwdPath)) return cwdPath;
      return null;
    };

    // 1. PasswordHash protection
    if (textLower.includes('passwordhash') || textLower.includes('never expose password')) {
      for (const diff of fileDiffs) {
        if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(diff.newPath)) continue;
        const fullPath = resolveFile(diff.newPath);
        if (!fullPath) continue;
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        const hasResponse = /res\.json|response\.json|return\s+\{/i.test(content);

        for (const lineNum of diff.addedLines) {
          const lineStr = lines[lineNum - 1] || '';
          if (
            /passwordHash|password_hash/i.test(lineStr) &&
            (hasResponse || /res\.json|return|response\.json/i.test(lineStr))
          ) {
            return {
              rule,
              status: 'VIOLATION',
              detectedMessage: 'Detected sensitive field "passwordHash" in response payload.',
              file: diff.newPath,
              line: lineNum,
              evidenceSnippet: lineStr.trim()
            };
          }
        }
      }
    }

    // 2. Authentication in API routes
    if (textLower.includes('every api route must authenticate') || textLower.includes('authentication')) {
      for (const diff of fileDiffs) {
        if (
          diff.newPath.includes('/api/') ||
          diff.newPath.includes('app/api') ||
          diff.newPath.endsWith('route.ts') ||
          diff.newPath.endsWith('route.js')
        ) {
          const fullPath = resolveFile(diff.newPath);
          if (!fullPath) continue;
          const content = fs.readFileSync(fullPath, 'utf8');

          const hasAuth =
            /\b(auth|session|getServerSession|verifyToken|jwt\.verify|req\.user|req\.session|requireAuth|authenticate)\b/i.test(
              content
            );

          if (!hasAuth) {
            return {
              rule,
              status: 'VIOLATION',
              detectedMessage: `API route "${diff.newPath}" does not appear to contain user authentication checks.`,
              file: diff.newPath,
              line: diff.addedLines[0] || 1,
              evidenceSnippet: `Route file: ${diff.newPath}`
            };
          }
        }
      }
    }

    // 3. Ownership check on orders/user resources
    if (
      textLower.includes('own orders') ||
      textLower.includes('ownership') ||
      textLower.includes('own resources')
    ) {
      for (const diff of fileDiffs) {
        if (diff.newPath.includes('order') || diff.newPath.includes('orders')) {
          const fullPath = resolveFile(diff.newPath);
          if (!fullPath) continue;
          const content = fs.readFileSync(fullPath, 'utf8');

          if (
            /findUnique|findById|findOne/i.test(content) &&
            !/userId|user\.id|session\.user/i.test(content)
          ) {
            return {
              rule,
              status: 'VIOLATION',
              detectedMessage: `Query in "${diff.newPath}" queries orders without verifying userId/ownership constraint.`,
              file: diff.newPath,
              line: diff.addedLines[0] || 1,
              evidenceSnippet: `Resource: ${diff.newPath}`
            };
          }
        }
      }
    }

    // 4. Test requirement for API endpoints
    if (textLower.includes('require tests') || textLower.includes('api endpoints require tests')) {
      for (const diff of fileDiffs) {
        if (
          (diff.newPath.includes('/api/') || diff.newPath.endsWith('route.ts')) &&
          !graph.isTestFile(diff.newPath)
        ) {
          const baseName = path.basename(diff.newPath, path.extname(diff.newPath));
          const hasTest = [
            `${diff.newPath.replace(/\.(ts|js)$/, '.test.$1')}`,
            `${diff.newPath.replace(/\.(ts|js)$/, '.spec.$1')}`,
            path.join(path.dirname(diff.newPath), '__tests__', `${baseName}.test.ts`)
          ].some((p) => Boolean(resolveFile(p)));

          if (!hasTest) {
            return {
              rule,
              status: 'WARNING',
              detectedMessage: `Modified API endpoint "${diff.newPath}" has no co-located or associated test file.`,
              file: diff.newPath,
              line: diff.addedLines[0] || 1,
              evidenceSnippet: `Missing test for: ${diff.newPath}`
            };
          }
        }
      }
    }

    // 5. Payment idempotency
    if (textLower.includes('idempotent') || textLower.includes('payment')) {
      for (const diff of fileDiffs) {
        if (diff.newPath.includes('payment') || diff.newPath.includes('checkout')) {
          const fullPath = resolveFile(diff.newPath);
          if (!fullPath) continue;
          const content = fs.readFileSync(fullPath, 'utf8');

          if (
            /post|charge|pay/i.test(content) &&
            !/idempotency|idempotent|idempotency-key/i.test(content)
          ) {
            return {
              rule,
              status: 'WARNING',
              detectedMessage: `Payment processing file "${diff.newPath}" does not specify an idempotency key or idempotency check.`,
              file: diff.newPath,
              line: diff.addedLines[0] || 1,
              evidenceSnippet: `Payment handler: ${diff.newPath}`
            };
          }
        }
      }
    }

    // Passed
    return {
      rule,
      status: 'PASS'
    };
  }
}
