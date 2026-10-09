import * as fs from 'node:fs';
import * as ts from 'typescript';
import { EvidenceTraceStep, FileDiff, RiskFinding, RiskSeverity } from '../types';

export class RiskEngine {
  /**
   * Runs deterministic static risk detection on changed files and their diffs.
   */
  public static analyzeFile(
    filePath: string,
    content?: string,
    fileDiff?: FileDiff
  ): RiskFinding[] {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) {
      return [];
    }

    const sourceText = content ?? (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '');
    if (!sourceText) return [];

    const isJsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      isJsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const findings: RiskFinding[] = [];
    const changedLinesSet = fileDiff ? new Set(fileDiff.addedLines) : null;

    const getLineAndColumn = (pos: number) => {
      const lc = sourceFile.getLineAndCharacterOfPosition(pos);
      return { line: lc.line + 1, column: lc.character + 1 };
    };

    const getSnippet = (line: number): string => {
      const lines = sourceText.split('\n');
      const start = Math.max(0, line - 2);
      const end = Math.min(lines.length, line + 1);
      return lines.slice(start, end).join('\n');
    };

    const isLineChanged = (line: number): boolean => {
      if (!changedLinesSet) return true;
      return changedLinesSet.has(line);
    };

    const isTest = this.isTestFile(filePath);

    // 1. Text & Regex analysis for Hardcoded Secrets (skip test fixtures)
    if (!isTest) {
      findings.push(...this.checkHardcodedSecrets(filePath, sourceText, isLineChanged, getSnippet));
    }

    // 2. AST Traversals for semantic rules
    const isApiRoute =
      /[\\/]app[\\/].*[\\/]route\.(?:ts|js|tsx|jsx)$/.test(filePath) ||
      /[\\/]pages[\\/]api[\\/].*\.(?:ts|js|tsx|jsx)$/.test(filePath) ||
      filePath.includes('api/') ||
      filePath.includes('routes/');

    const visit = (node: ts.Node) => {
      // Rule: SQL Injection Detection
      if (ts.isCallExpression(node)) {
        const text = node.expression.getText(sourceFile);
        const isDbQuery =
          /(\bquery|\$queryRawUnsafe|\bexecute|\braw|\bexecSql)$/i.test(text) ||
          /\bdb\..*query/i.test(text);

        if (isDbQuery && node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          const { line, column } = getLineAndColumn(firstArg.getStart(sourceFile));

          if (isLineChanged(line)) {
            // Check template literal with expressions: `SELECT * FROM users WHERE id = ${id}`
            if (ts.isTemplateExpression(firstArg) && firstArg.templateSpans.length > 0) {
              const snippet = getSnippet(line);
              findings.push({
                id: `PC-SQL-${filePath}-${line}`,
                ruleId: 'PC-SEC-001',
                category: 'security',
                title: 'Potential SQL Injection (Template Literal)',
                severity: 'HIGH',
                description:
                  'Database query uses unescaped string interpolation with dynamic variables, exposing the endpoint to SQL injection.',
                file: filePath,
                line,
                column,
                snippet,
                evidenceTrace: [
                  {
                    file: filePath,
                    line,
                    description: `Call to ${text} constructed with template literal expression: ${firstArg.getText(sourceFile)}`
                  },
                  {
                    file: filePath,
                    line,
                    description: 'No parameterized query or escaping mechanism detected'
                  }
                ],
                recommendation:
                  'Use parameterized queries (e.g. db.query("SELECT ... WHERE id = $1", [id])) or an ORM prepared statement.'
              });
            } else if (
              ts.isBinaryExpression(firstArg) &&
              firstArg.operatorToken.kind === ts.SyntaxKind.PlusToken
            ) {
              // String concatenation: "SELECT * FROM users WHERE id = " + id
              const snippet = getSnippet(line);
              findings.push({
                id: `PC-SQL-${filePath}-${line}`,
                ruleId: 'PC-SEC-001',
                category: 'security',
                title: 'Potential SQL Injection (String Concatenation)',
                severity: 'HIGH',
                description:
                  'Database query constructs SQL via direct string concatenation, creating a severe injection vulnerability.',
                file: filePath,
                line,
                column,
                snippet,
                evidenceTrace: [
                  {
                    file: filePath,
                    line,
                    description: `Call to ${text} using string concatenation: ${firstArg.getText(sourceFile)}`
                  }
                ],
                recommendation:
                  'Avoid string concatenation in SQL queries. Use prepared statements or parameterized queries.'
              });
            }
          }
        }
      }

      // Rule: Dangerous eval / Function / child_process.exec
      if (ts.isCallExpression(node)) {
        const text = node.expression.getText(sourceFile);
        if (text === 'eval' || text === 'new Function' || text.endsWith('.exec') || text.endsWith('.execSync')) {
          const { line, column } = getLineAndColumn(node.getStart(sourceFile));
          if (isLineChanged(line) && node.arguments.length > 0) {
