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
            const firstArg = node.arguments[0];
            // If argument is not a simple string literal, it's dynamic
            if (!ts.isStringLiteral(firstArg)) {
              findings.push({
                id: `PC-EVAL-${filePath}-${line}`,
                ruleId: 'PC-SEC-004',
                category: 'security',
                title: 'Dangerous Code/Command Execution',
                severity: 'HIGH',
                description: `Invoking ${text} with dynamic arguments can lead to arbitrary code or command execution.`,
                file: filePath,
                line,
                column,
                snippet: getSnippet(line),
                evidenceTrace: [
                  {
                    file: filePath,
                    line,
                    description: `Invocation of ${text}(${firstArg.getText(sourceFile)})`
                  }
                ],
                recommendation:
                  'Avoid eval() or dynamic shell execution. Use safe alternative APIs or execFile with static arguments.'
              });
            }
          }
        }
      }

      // Rule: Unsafe User Input SSRF / Open Redirect
      if (ts.isCallExpression(node)) {
        const text = node.expression.getText(sourceFile);
        if (
          text === 'fetch' ||
          text === 'axios' ||
          text.startsWith('axios.') ||
          text.endsWith('res.redirect') ||
          text.endsWith('redirect')
        ) {
          if (node.arguments.length > 0) {
            const argText = node.arguments[0].getText(sourceFile);
            const { line, column } = getLineAndColumn(node.getStart(sourceFile));
            if (
              isLineChanged(line) &&
              (argText.includes('req.body') ||
                argText.includes('req.query') ||
                argText.includes('req.params') ||
                argText.includes('params.'))
            ) {
              findings.push({
                id: `PC-SSRF-${filePath}-${line}`,
                ruleId: 'PC-SEC-005',
                category: 'security',
                title: 'Unsafe User-Controlled URL / Potential SSRF',
                severity: 'MEDIUM',
                description:
                  'User request parameter is passed directly into a network request or redirect without explicit validation or allowlisting.',
                file: filePath,
                line,
                column,
                snippet: getSnippet(line),
                evidenceTrace: [
                  {
                    file: filePath,
                    line,
                    description: `Call to ${text}(${argText}) with user-controlled input`
                  }
                ],
                recommendation:
                  'Validate target URLs against an explicit allowlist and enforce URL protocol and host checks.'
              });
            }
          }
        }
      }

      // Rule: Missing Error Handling on Async Calls
      if (ts.isAwaitExpression(node) && !isTest) {
        const { line, column } = getLineAndColumn(node.getStart(sourceFile));
        if (isLineChanged(line)) {
          // Check if this await is inside a try-catch block
          let parent: ts.Node | undefined = node.parent;
          let insideTry = false;
          while (parent) {
            if (ts.isTryStatement(parent)) {
              insideTry = true;
              break;
            }
            if (
              ts.isFunctionDeclaration(parent) ||
              ts.isArrowFunction(parent) ||
              ts.isMethodDeclaration(parent)
            ) {
              break;
            }
            parent = parent.parent;
          }

          if (!insideTry) {
            // Also check if expression has .catch
            const exprText = node.expression.getText(sourceFile);
            if (!exprText.includes('.catch(')) {
              findings.push({
                id: `PC-ERR-${filePath}-${line}`,
                ruleId: 'PC-REL-006',
                category: 'reliability',
                title: 'Unhandled Asynchronous Operation',
                severity: 'LOW',
                description:
                  'Async operation is awaited without an enclosing try/catch block or promise catch handler.',
                file: filePath,
                line,
                column,
                snippet: getSnippet(line),
                evidenceTrace: [
                  {
                    file: filePath,
                    line,
                    description: `await ${exprText} executed without try/catch wrapper`
                  }
                ],
                recommendation:
                  'Wrap async database and network calls in try/catch to handle potential failures gracefully.'
              });
            }
          }
        }
      }

      // Rule: Unhandled Null/Undefined Database Result
      if (ts.isVariableDeclaration(node) && !isTest) {
        this.checkUnhandledNullDbResult(node, sourceFile, filePath, isLineChanged, getSnippet, findings);
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    // Rule: Missing Authorization in API routes performing DB queries
    if (isApiRoute) {
      const authFindings = this.checkApiRouteAuthorization(
        filePath,
        sourceFile,
        sourceText,
        isLineChanged,
        getSnippet
      );
      findings.push(...authFindings);
    }

    // Deduplicate findings by ID
    const uniqueMap = new Map<string, RiskFinding>();
    for (const f of findings) {
      uniqueMap.set(f.id, f);
    }

    return Array.from(uniqueMap.values());
  }

  private static checkHardcodedSecrets(
    filePath: string,
    sourceText: string,
    isLineChanged: (line: number) => boolean,
    getSnippet: (line: number) => string
  ): RiskFinding[] {
    const findings: RiskFinding[] = [];
    const lines = sourceText.split('\n');

    const patterns = [
      {
        regex: /(?:AKIA[0-9A-Z]{16})/,
        name: 'AWS Access Key ID',
        ruleId: 'PC-SEC-002',
        severity: 'HIGH' as RiskSeverity
      },
      {
        regex: /-----BEGIN(?:[A-Z\s]+)?PRIVATE KEY-----/,
        name: 'Private Encryption Key',
        ruleId: 'PC-SEC-002',
        severity: 'HIGH' as RiskSeverity
      },
      {
        regex: /(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{50,})/,
        name: 'GitHub Personal Access Token',
        ruleId: 'PC-SEC-002',
        severity: 'HIGH' as RiskSeverity
      },
      {
        regex: /(?:sk-[a-zA-Z0-9]{32,})/,
        name: 'OpenAI API Secret Key',
        ruleId: 'PC-SEC-002',
        severity: 'HIGH' as RiskSeverity
      },
      {
        regex: /(?:password|apiKey|api_key|client_secret|private_key)\s*[:=]\s*["']([A-Za-z0-9+/=_\-!@#$%^&*]{16,})["']/i,
        name: 'Hardcoded Secret Credential',
        ruleId: 'PC-SEC-002',
        severity: 'HIGH' as RiskSeverity
      }
    ];

    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      if (!isLineChanged(lineNum)) return;

      // Skip process.env or commented-out lines
      if (lineText.includes('process.env.') || /^\s*\/\//.test(lineText)) return;

      for (const pattern of patterns) {
        if (pattern.regex.test(lineText)) {
          findings.push({
            id: `PC-SECRET-${filePath}-${lineNum}`,
            ruleId: pattern.ruleId,
            category: 'security',
            title: `Hardcoded Secret Detected (${pattern.name})`,
            severity: pattern.severity,
            description: `Potential hardcoded secret or credential found in source code: ${pattern.name}.`,
            file: filePath,
            line: lineNum,
            snippet: getSnippet(lineNum),
            evidenceTrace: [
              {
                file: filePath,
                line: lineNum,
                description: `Sensitive literal matched pattern for ${pattern.name}`
              }
            ],
            recommendation:
              'Never commit credentials to source control. Move the secret to environment variables or secret manager.'
          });
          break;
        }
      }
    });

    return findings;
  }

  private static checkApiRouteAuthorization(
    filePath: string,
    sourceFile: ts.SourceFile,
    sourceText: string,
    isLineChanged: (line: number) => boolean,
    getSnippet: (line: number) => string
  ): RiskFinding[] {
    const findings: RiskFinding[] = [];

    // Check if the file imports or uses actual auth utilities (stripping comments)
    const codeWithoutComments = sourceText.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    const hasAuthCheck =
      /\b(auth|session|getServerSession|verifyToken|jwt\.verify|req\.user|req\.session|requireAuth|authenticate|useSession)\b/i.test(
        codeWithoutComments
      );

    // Look for route handler functions
    const visit = (node: ts.Node) => {
      let isHandler = false;
      let handlerName = '';

      if (ts.isFunctionDeclaration(node) && node.name) {
        handlerName = node.name.text;
        isHandler = /^(GET|POST|PUT|DELETE|PATCH)$/i.test(handlerName) || handlerName === 'handler';
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        handlerName = node.name.text;
        isHandler = /^(GET|POST|PUT|DELETE|PATCH)$/i.test(handlerName);
      }

      if (isHandler && node) {
        const handlerText = node.getText(sourceFile);
        const codeInHandler = handlerText.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

        const hasDbQuery =
          /\b(db|prisma|order|user|account|payment)(\.[a-zA-Z0-9_$]+)*\.(find|create|update|delete|query|findUnique|findMany)\b/i.test(
            codeInHandler
          );

        const hasLocalAuth =
          /\b(auth|session|getServerSession|req\.user|verifyToken|jwt|requireAuth)\b/i.test(
            codeInHandler
          );

        if (hasDbQuery && !hasLocalAuth && !hasAuthCheck) {
          const lc = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const line = lc.line + 1;

          if (isLineChanged(line)) {
            const trace: EvidenceTraceStep[] = [
              {
                file: filePath,
                line,
                symbol: handlerName,
                description: `Route handler ${handlerName} receives client request`
              },
              {
                file: filePath,
                line,
                description: 'Handler performs database query / resource mutation'
              },
              {
                file: filePath,
                line,
                description: 'NO authentication/authorization or session ownership check found in handler body'
              }
            ];

            findings.push({
              id: `PC-AUTH-${filePath}-${line}`,
              ruleId: 'PC-AUTH-001',
              category: 'authorization',
              title: `Missing Authorization Check in API Route (${handlerName})`,
