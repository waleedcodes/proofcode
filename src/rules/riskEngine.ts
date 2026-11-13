import * as fs from 'node:fs';
import * as path from 'node:path';
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
    const normalizedPath = filePath.replace(/\\/g, '/');
    const isSensitiveConfig =
      /(\.env|\.env\.[a-z0-9]+|package\.json|tsconfig\.json|\.npmrc|\.github\/workflows\/.*\.ya?ml)$/i.test(normalizedPath);

    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) {
      if (isSensitiveConfig && fileDiff) {
        const isEnv = /\.env/i.test(normalizedPath);
        const line = fileDiff.modifiedLineRanges[0]?.start ?? 1;
        return [
          {
            id: `PC-SCOPE-${filePath}-${line}`,
            ruleId: 'PC-SCOPE-001',
            category: 'security',
            title: `Sensitive Configuration File Modified (${path.basename(filePath)})`,
            severity: isEnv ? 'HIGH' : 'MEDIUM',
            description: `Modifications detected in sensitive root configuration file '${path.basename(filePath)}'. Verify these changes are intentional and not unintended AI scope creep.`,
            file: filePath,
            line,
            snippet: content ? content.slice(0, 150) : `Modified ${filePath}`,
            evidenceTrace: [
              {
                file: filePath,
                line,
                description: `Critical config file modified: ${fileDiff.addedLines.length} line(s) added, ${fileDiff.deletedLines.length} line(s) removed`
              }
            ],
            recommendation: 'Carefully review environment variables and dependency changes to prevent credential leakage or supply chain shifts.'
          }
        ];
      }
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

    const localSyncFunctions = new Set<string>();
    const localAsyncFunctions = new Set<string>();

    const collectLocalFunctions = (n: ts.Node) => {
      if (ts.isFunctionDeclaration(n) && n.name) {
        const isAsync = n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
        if (isAsync) {
          localAsyncFunctions.add(n.name.text);
        } else {
          localSyncFunctions.add(n.name.text);
        }
      } else if (ts.isVariableStatement(n)) {
        for (const decl of n.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
              const isAsync =
                decl.initializer.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
              if (isAsync) {
                localAsyncFunctions.add(decl.name.text);
              } else {
                localSyncFunctions.add(decl.name.text);
              }
            }
          }
        }
      }
      ts.forEachChild(n, collectLocalFunctions);
    };
    collectLocalFunctions(sourceFile);

    const SYNC_BUILTIN_METHODS = new Set([
      'has',
      'includes',
      'startsWith',
      'endsWith',
      'every',
      'some',
      'filter',
      'map',
      'find',
      'findIndex',
      'indexOf',
      'lastIndexOf',
      'test',
      'match',
      'matchAll',
      'search',
      'replace',
      'replaceAll',
      'split',
      'slice',
      'substring',
      'trim',
      'trimStart',
      'trimEnd',
      'charAt',
      'charCodeAt',
      'concat',
      'join',
      'keys',
      'values',
      'entries',
      'push',
      'pop',
      'shift',
      'unshift',
      'get',
      'set',
      'add',
      'delete',
      'clear',
      'size',
      'length',
      'isArray',
      'isInteger',
      'isNaN',
      'isFinite',
      'isSafeInteger',
      'existsSync',
      'statSync',
      'lstatSync',
      'readFileSync',
      'writeFileSync',
      'resolve',
      'join',
      'dirname',
      'basename',
      'extname'
    ]);

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

      // Rule: Path Traversal in File System Operations (PC-SEC-003)
      if (ts.isCallExpression(node) && !isTest) {
        const text = node.expression.getText(sourceFile);
        const isFsOp =
          /\bfs\.(readFile|readFileSync|createReadStream|writeFile|writeFileSync|unlink|unlinkSync|open|openSync|rm|rmSync|readdir|readdirSync)\b/.test(text) ||
          /^(readFile|readFileSync|createReadStream|writeFile|writeFileSync|unlink|unlinkSync|open|openSync|rm|rmSync|readdir|readdirSync)$/.test(text);
        const isPathOp = /\bpath\.(join|resolve)\b/.test(text) || /^(join|resolve)$/.test(text);

        if ((isFsOp || isPathOp) && node.arguments.length > 0) {
          const hasUnvalidatedInput = node.arguments.some((arg) => {
            const argStr = arg.getText(sourceFile);
            const isUserControlled =
              /\b(req\.query|req\.params|req\.body|params\.|searchParams\.|userInput|userPath)\b/i.test(argStr) ||
              (isApiRoute && /\b(query\.|filePath|fileName|filename)\b/i.test(argStr));
            return (
              isUserControlled &&
              !argStr.includes('path.basename(') &&
              !argStr.includes('basename(')
            );
          });

          if (hasUnvalidatedInput) {
            const { line, column } = getLineAndColumn(node.getStart(sourceFile));
            if (isLineChanged(line)) {
              findings.push({
                id: `PC-PATH-${filePath}-${line}`,
                ruleId: 'PC-SEC-003',
                category: 'security',
                title: 'Potential Path Traversal in File Operation',
                severity: 'HIGH',
                description: `File operation '${text}' uses unvalidated user input or dynamic path parameters, risking directory traversal attacks.`,
                file: filePath,
                line,
                column,
                snippet: getSnippet(line),
                evidenceTrace: [
                  {
                    file: filePath,
                    line,
                    description: `Call to ${text}(...) with user-controlled path parameter`
                  },
                  {
                    file: filePath,
                    line,
                    description: 'No path.basename() sanitization or directory boundary validation detected'
                  }
                ],
                recommendation:
                  'Use path.basename() to sanitize filenames, or verify that path.resolve() stays within the intended root directory.'
              });
            }
          }
        }
      }

      // Rule: Permissive Wildcard CORS Header (PC-SEC-007)
      if (ts.isCallExpression(node)) {
        const text = node.expression.getText(sourceFile);
        const isHeaderSetter = /\b(setHeader|header|set|append)\b/.test(text);
        if (isHeaderSetter && node.arguments.length >= 2) {
          const headerKey = node.arguments[0].getText(sourceFile).replace(/['"`]/g, '').toLowerCase();
          const headerVal = node.arguments[1].getText(sourceFile).replace(/['"`]/g, '').trim();
          if (headerKey === 'access-control-allow-origin' && headerVal === '*') {
            const { line, column } = getLineAndColumn(node.getStart(sourceFile));
            if (isLineChanged(line)) {
              findings.push({
                id: `PC-CORS-${filePath}-${line}`,
                ruleId: 'PC-SEC-007',
                category: 'security',
                title: 'Permissive Wildcard CORS Header Detected',
                severity: 'HIGH',
                description:
                  "Access-Control-Allow-Origin is configured as wildcard '*', allowing unauthorized cross-origin access from any untrusted domain.",
                file: filePath,
                line,
                column,
                snippet: getSnippet(line),
                evidenceTrace: [
                  {
                    file: filePath,
                    line,
                    description: `Header '${headerKey}' set to wildcard '*'`
                  }
                ],
                recommendation:
                  'Replace wildcard * with an explicit whitelist of trusted application origins.'
              });
            }
          }
        }
      } else if (ts.isPropertyAssignment(node)) {
        const propName = node.name.getText(sourceFile).replace(/['"`]/g, '').toLowerCase();
        if (propName === 'access-control-allow-origin') {
          const propVal = node.initializer.getText(sourceFile).replace(/['"`]/g, '').trim();
          if (propVal === '*') {
            const { line, column } = getLineAndColumn(node.getStart(sourceFile));
            if (isLineChanged(line)) {
              findings.push({
                id: `PC-CORS-${filePath}-${line}`,
                ruleId: 'PC-SEC-007',
                category: 'security',
                title: 'Permissive Wildcard CORS Header Detected',
                severity: 'HIGH',
                description:
                  "Access-Control-Allow-Origin is set to '*' in header dictionary, permitting arbitrary cross-origin requests.",
                file: filePath,
                line,
                column,
                snippet: getSnippet(line),
                evidenceTrace: [
                  {
                    file: filePath,
                    line,
                    description: `Property '${propName}' assigned wildcard '*'`
                  }
                ],
                recommendation:
                  'Specify exact allowed origins instead of wildcard * for secure API endpoints.'
              });
            }
          }
        }
      }

      // Rule: ReDoS Vulnerability Pattern (PC-REL-007)
      if (!isTest && (ts.isRegularExpressionLiteral(node) || (ts.isNewExpression(node) && node.expression.getText(sourceFile) === 'RegExp'))) {
        let patternStr = '';
        if (ts.isRegularExpressionLiteral(node)) {
          patternStr = node.text || node.getText(sourceFile);
        } else if (node.arguments && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
          patternStr = node.arguments[0].text;
        }

        if (patternStr) {
          const hasNestedQuantifier = /\((?:[^()\\]|\\.)*[+*]\)(?:[+*]|\{\d+,?\d*\})/.test(patternStr);
          const hasOverlappingAlternation = /\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,?\d*\})/.test(patternStr);

          if (hasNestedQuantifier || (hasOverlappingAlternation && /[+*]/.test(patternStr))) {
            const { line, column } = getLineAndColumn(node.getStart(sourceFile));
            if (isLineChanged(line)) {
              findings.push({
                id: `PC-REDOS-${filePath}-${line}`,
                ruleId: 'PC-REL-007',
                category: 'reliability',
                title: 'Potential Regular Expression Denial of Service (ReDoS)',
                severity: 'HIGH',
                description:
                  'Regular expression contains nested quantifiers or overlapping repetitions susceptible to catastrophic backtracking.',
                file: filePath,
                line,
                column,
                snippet: getSnippet(line),
                evidenceTrace: [
                  {
                    file: filePath,
                    line,
                    description: `Regex pattern ${patternStr} contains nested repetition or ambiguous alternation`
                  },
                  {
                    file: filePath,
                    line,
                    description: 'Evaluation against non-matching input can result in exponential backtracking and process freeze'
                  }
                ],
                recommendation:
                  'Simplify regular expression to eliminate nested quantifiers (e.g. rewrite (a+)+), or validate input length beforehand.'
              });
            }
          }
        }
      }

      // Rule: Unawaited Promise in Conditional Statement (PC-REL-008)
      if (ts.isIfStatement(node) || ts.isConditionalExpression(node) || ts.isWhileStatement(node)) {
        const condition = ts.isIfStatement(node)
          ? node.expression
          : ts.isConditionalExpression(node)
          ? node.condition
          : node.expression;

        const checkConditionCalls = (expr: ts.Node) => {
          if (ts.isCallExpression(expr)) {
            if (!ts.isAwaitExpression(expr.parent)) {
              const callText = expr.expression.getText(sourceFile);
              let shouldFlag = false;

              if (ts.isPropertyAccessExpression(expr.expression)) {
                const propName = expr.expression.name.text;
                const targetText = expr.expression.expression.getText(sourceFile);

                const isBuiltinTarget =
                  targetText === 'ts' ||
                  targetText.startsWith('ts.') ||
                  targetText === 'path' ||
                  targetText.startsWith('path.') ||
                  targetText === 'Array' ||
                  targetText === 'Object' ||
                  targetText === 'String' ||
                  targetText === 'Number' ||
                  targetText === 'Boolean' ||
                  targetText === 'Math' ||
                  targetText === 'JSON' ||
                  targetText === 'Reflect' ||
                  targetText === 'Date' ||
                  targetText === 'console' ||
                  targetText === 'process';

                if (
                  !isBuiltinTarget &&
                  !SYNC_BUILTIN_METHODS.has(propName) &&
                  !propName.endsWith('Sync') &&
                  !localSyncFunctions.has(propName)
                ) {
                  if (
                    localAsyncFunctions.has(propName) ||
                    /(async|Async)\b/.test(propName) ||
                    /^(verify|authenticate|query|fetch)[A-Z0-9_]*/i.test(propName)
                  ) {
                    shouldFlag = true;
                  }
                }
              } else if (ts.isIdentifier(expr.expression)) {
                const funcName = expr.expression.text;
                const isGlobalSync =
                  ['isLineChanged', 'isTestFile', 'isApiRoute', 'getSnippet', 'getLineAndColumn', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Boolean', 'String', 'Number', 'Array', 'Object', 'Error'].includes(funcName);

                if (!isGlobalSync && !localSyncFunctions.has(funcName)) {
                  if (
                    localAsyncFunctions.has(funcName) ||
                    /(async|Async)\b/.test(funcName) ||
                    /^(check|verify|validate|auth|authenticate|fetch|query)[A-Z0-9_]*/i.test(funcName)
                  ) {
                    shouldFlag = true;
                  }
                }
              }

              if (shouldFlag) {
                const { line, column } = getLineAndColumn(expr.getStart(sourceFile));
                if (isLineChanged(line)) {
                  findings.push({
                    id: `PC-PROMISE-COND-${filePath}-${line}`,
                    ruleId: 'PC-REL-008',
                    category: 'reliability',
                    title: 'Unawaited Async Call in Conditional Statement',
                    severity: 'HIGH',
                    description: `Call to '${callText}()' is evaluated inside a conditional without 'await'. In JavaScript, Promise instances are always truthy, which can cause logic or security bypasses.`,
                    file: filePath,
                    line,
                    column,
                    snippet: getSnippet(line),
                    evidenceTrace: [
                      {
                        file: filePath,
                        line,
                        description: `Conditional expression '${expr.getText(sourceFile)}' returns a Promise object without 'await'`
                      },
                      {
                        file: filePath,
                        line,
                        description: 'Objects and Promises always evaluate to true in boolean conditionals'
                      }
                    ],
                    recommendation: `Add 'await' before ${callText}(...) (e.g. if (await ${callText}(...))), and ensure the enclosing function is async.`
                  });
                }
              }
            }
          }
          ts.forEachChild(expr, checkConditionCalls);
        };

        checkConditionCalls(condition);
      }

      // Rule: Silent Error Swallowing in Catch Block (PC-REL-009)
      if (ts.isCatchClause(node)) {
        const { line, column } = getLineAndColumn(node.getStart(sourceFile));
        if (isLineChanged(line)) {
          const statements = node.block.statements;
          const isEmpty = statements.length === 0;
          const isOnlyBareReturn =
            statements.length === 1 &&
            ts.isReturnStatement(statements[0]) &&
            (!statements[0].expression ||
              statements[0].expression.getText(sourceFile) === 'null' ||
              statements[0].expression.getText(sourceFile) === 'undefined' ||
              statements[0].expression.getText(sourceFile) === 'false' ||
              statements[0].expression.getText(sourceFile) === '""' ||
              statements[0].expression.getText(sourceFile) === '{}');

          if (isEmpty || isOnlyBareReturn) {
            findings.push({
              id: `PC-EMPTY-CATCH-${filePath}-${line}`,
              ruleId: 'PC-REL-009',
              category: 'reliability',
              title: 'Silent Error Swallowing in Catch Block',
              severity: 'MEDIUM',
              description:
                'Catch block silently swallows exceptions without logging or re-throwing, concealing runtime errors from developers and telemetry.',
              file: filePath,
              line,
              column,
              snippet: getSnippet(line),
              evidenceTrace: [
                {
                  file: filePath,
                  line,
                  description: isEmpty
                    ? 'Catch block is completely empty'
                    : 'Catch block exits immediately with empty return, discarding error'
                }
              ],
              recommendation:
                'Log the caught error with console.error or a logger, or re-throw a standardized ApplicationError.'
            });
          }
        }
      }

      // Rule: Incomplete AI Stub / Unimplemented Function Detected (PC-STUB-001)
      if (!isTest) {
        if (ts.isThrowStatement(node) && node.expression) {
          const throwText = node.expression.getText(sourceFile);
          if (/not\s*implemented|todo|implement\s*me|placeholder/i.test(throwText)) {
            const { line, column } = getLineAndColumn(node.getStart(sourceFile));
            if (isLineChanged(line)) {
              findings.push({
                id: `PC-STUB-${filePath}-${line}`,
                ruleId: 'PC-STUB-001',
                category: 'quality',
                title: 'Incomplete AI Stub / Unimplemented Function Detected',
                severity: 'HIGH',
                description: `Function contains unimplemented placeholder stub: '${throwText}'. Code was marked complete by AI but cannot execute in production.`,
                file: filePath,
                line,
                column,
                snippet: getSnippet(line),
                evidenceTrace: [
                  {
                    file: filePath,
                    line,
                    description: `Stub exception '${throwText}' detected in executable code path`
                  }
                ],
                recommendation:
                  'Implement complete logic before shipping to avoid production runtime exceptions.'
              });
            }
          }
        }
      }

      // Rule: Dangerous Type Assertion Bypass (PC-TYPE-001)
      if (
        !isTest &&
        ((ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.AnyKeyword) ||
          (ts.isTypeAssertionExpression(node) && node.type.kind === ts.SyntaxKind.AnyKeyword))
      ) {
        const { line, column } = getLineAndColumn(node.getStart(sourceFile));
        if (isLineChanged(line)) {
          findings.push({
            id: `PC-TYPE-ANY-${filePath}-${line}`,
            ruleId: 'PC-TYPE-001',
            category: 'quality',
            title: "Dangerous Type Assertion Bypass ('as any')",
            severity: 'MEDIUM',
            description:
              "Diff introduced an unsafe 'as any' type assertion. This pattern is commonly used by AI assistants to suppress compiler errors rather than fixing underlying type mismatches.",
            file: filePath,
            line,
            column,
            snippet: getSnippet(line),
            evidenceTrace: [
              {
                file: filePath,
                line,
                description: `Expression '${node.expression.getText(sourceFile)}' forcefully coerced to 'any'`
              }
            ],
            recommendation:
              "Replace 'any' with a precise interface or union type, or fix the mismatch at the call-site."
          });
        }
      }

      // Rule: Phantom / Hallucinated Dependency Imported (PC-IMPORT-001)
      if (!isTest && ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const importPath = node.moduleSpecifier.text;
        if (
          !importPath.startsWith('.') &&
          !importPath.startsWith('/') &&
          !importPath.startsWith('@/') &&
          !importPath.startsWith('~/') &&
          !importPath.startsWith('#/')
        ) {
          const isNodeBuiltin =
            /^(node:)?(fs|path|os|crypto|util|events|http|https|stream|child_process|url|buffer|assert|zlib|worker_threads|perf_hooks|readline|string_decoder|timers|net|tls|dgram|dns|v8|vm|async_hooks|diagnostics_channel|process)$/.test(
              importPath
            ) || importPath === 'vscode';

          if (!isNodeBuiltin) {
            const pkgName = importPath.startsWith('@')
              ? importPath.split('/').slice(0, 2).join('/')
              : importPath.split('/')[0];

            const deps = RiskEngine.getInstalledDependencies(filePath);
            if (deps && !deps.has(pkgName) && !deps.has(`@types/${pkgName}`)) {
              const { line, column } = getLineAndColumn(node.getStart(sourceFile));
              if (isLineChanged(line)) {
                findings.push({
                  id: `PC-IMPORT-PHANTOM-${filePath}-${line}`,
                  ruleId: 'PC-IMPORT-001',
                  category: 'reliability',
                  title: `Phantom / Uninstalled Dependency Imported ('${pkgName}')`,
                  severity: 'HIGH',
                  description: `Module '${importPath}' is imported, but '${pkgName}' is not listed in package.json. AI coding assistants frequently hallucinate third-party package names, causing runtime module resolution crashes.`,
                  file: filePath,
                  line,
                  column,
                  snippet: getSnippet(line),
                  evidenceTrace: [
                    {
                      file: filePath,
                      line,
                      description: `Import from uninstalled package '${pkgName}'`
                    }
                  ],
                  recommendation: `Install '${pkgName}' via your package manager (e.g. npm install ${pkgName}) or remove the hallucinated import.`
                });
              }
            }
          }
        }
      }

      // Rule: Unchecked / Non-null Asserted Environment Variable (PC-ENV-001)
      if (!isTest && ts.isNonNullExpression(node)) {
        const exprText = node.expression.getText(sourceFile);
        if (exprText.startsWith('process.env.') || exprText.startsWith('process.env[')) {
          const { line, column } = getLineAndColumn(node.getStart(sourceFile));
          if (isLineChanged(line)) {
            findings.push({
              id: `PC-ENV-ASSERT-${filePath}-${line}`,
              ruleId: 'PC-ENV-001',
              category: 'reliability',
              title: 'Unchecked Non-Null Asserted Environment Variable',
              severity: 'HIGH',
              description: `Expression '${node.getText(sourceFile)}' forcefully asserts that an environment variable exists without runtime validation. AI assistants frequently use non-null assertions to silence compiler errors, risking runtime crashes in production environments where the variable is unset.`,
              file: filePath,
              line,
              column,
              snippet: getSnippet(line),
              evidenceTrace: [
                {
                  file: filePath,
                  line,
                  description: `Environment variable '${exprText}' asserted with non-null operator (!)`
                }
              ],
              recommendation: `Validate '${exprText}' at startup or provide a safe fallback (e.g. ${exprText} || 'fallback').`
            });
          }
        }
      }

      // Rule: Direct State Mutation in React/State Management (PC-MUT-001)
      if (!isTest && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.text;
        const MUTATING_METHODS = new Set(['push', 'splice', 'pop', 'shift', 'unshift', 'reverse', 'sort']);

        if (MUTATING_METHODS.has(methodName)) {
          const targetObjText = node.expression.expression.getText(sourceFile);
          const isStateTarget =
            /^(prev|prevState|state|currentState|draftState)$/i.test(targetObjText) ||
            targetObjText.startsWith('prev.') ||
            targetObjText.startsWith('state.');

          // Also check if inside a setter callback: setX((prev) => { ... })
          let insideSetter = false;
          let currentParent: ts.Node | undefined = node.parent;
          while (currentParent) {
            if (ts.isCallExpression(currentParent)) {
              const calleeText = currentParent.expression.getText(sourceFile);
              if (/^set[A-Z]/.test(calleeText) || calleeText === 'setState' || calleeText === 'dispatch') {
                insideSetter = true;
                break;
              }
            }
            if (ts.isFunctionDeclaration(currentParent) || ts.isClassDeclaration(currentParent)) {
              break;
            }
            currentParent = currentParent.parent;
          }

          if (isStateTarget || (insideSetter && !targetObjText.startsWith('this.'))) {
            const { line, column } = getLineAndColumn(node.getStart(sourceFile));
            if (isLineChanged(line)) {
              findings.push({
                id: `PC-STATE-MUT-${filePath}-${line}`,
                ruleId: 'PC-MUT-001',
                category: 'reliability',
                title: `Direct State Mutation Detected ('.${methodName}()')`,
                severity: 'HIGH',
                description: `Directly mutating state with '.${methodName}()' violates immutable state patterns in React and modern state management. This preserves object identity, which silently bypasses equality checks (Object.is) and causes components to fail to re-render.`,
                file: filePath,
                line,
                column,
                snippet: getSnippet(line),
                evidenceTrace: [
                  {
                    file: filePath,
                    line,
                    description: `In-place mutation '${targetObjText}.${methodName}(...)' called on state object`
                  },
                  {
                    file: filePath,
                    line,
                    description: 'React state updates require new object/array references to trigger UI re-renders'
                  }
                ],
                recommendation: `Use immutable updates instead: replace with spread syntax (e.g. [...${targetObjText}, item]) or non-mutating methods (.filter(), .map(), .concat()).`
              });
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    // Rule: Suppress Directive Detected (@ts-ignore / @ts-nocheck) (PC-TYPE-001)
    if (!isTest && changedLinesSet) {
      const lines = sourceText.split('\n');
      for (const changedLine of changedLinesSet) {
        if (changedLine > 0 && changedLine <= lines.length) {
          const lineContent = lines[changedLine - 1];
          if (/\/\/\s*@ts-(ignore|nocheck|expect-error)\b/.test(lineContent)) {
            const isNoCheck = lineContent.includes('@ts-nocheck');
            findings.push({
              id: `PC-TYPE-IGNORE-${filePath}-${changedLine}`,
              ruleId: 'PC-TYPE-001',
              category: 'quality',
              title: isNoCheck
                ? "TypeScript Type Checking Disabled ('@ts-nocheck')"
                : "TypeScript Diagnostic Suppressed ('@ts-ignore')",
              severity: isNoCheck ? 'HIGH' : 'MEDIUM',
              description: `Found '${lineContent.trim()}' in modified code. AI models frequently silence genuine type errors using compiler suppression directives instead of fixing the underlying issue.`,
              file: filePath,
              line: changedLine,
              snippet: getSnippet(changedLine),
              evidenceTrace: [
                {
                  file: filePath,
                  line: changedLine,
                  description: `Compiler check disabled: ${lineContent.trim()}`
                }
              ],
              recommendation:
                'Remove the suppression directive and address the genuine TypeScript diagnostic.'
            });
          }
        }
      }
    }

    // Rule: Unimplemented AI TODO Placeholder in Production Code (PC-STUB-001)
    if (!isTest && changedLinesSet) {
      const lines = sourceText.split('\n');
      for (const changedLine of changedLinesSet) {
        if (changedLine > 0 && changedLine <= lines.length) {
          const lineContent = lines[changedLine - 1];
          if (/\/\/\s*(TODO|FIXME):\s*(implement|add logic|placeholder|unimplemented)/i.test(lineContent)) {
            findings.push({
              id: `PC-STUB-COMMENT-${filePath}-${changedLine}`,
              ruleId: 'PC-STUB-001',
              category: 'quality',
              title: 'Unimplemented AI TODO Placeholder in Production Code',
              severity: 'HIGH',
              description: `Found incomplete implementation placeholder '${lineContent.trim()}'. AI assistant left unfinished stub logic in production code.`,
              file: filePath,
              line: changedLine,
              snippet: getSnippet(changedLine),
              evidenceTrace: [
                {
                  file: filePath,
                  line: changedLine,
                  description: `Unfinished implementation marker: ${lineContent.trim()}`
                }
              ],
              recommendation: 'Complete the necessary business logic before merging.'
            });
          }
        }
      }
    }

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

    // Rule: Test Weakening / Deleted Assertions (PC-TEST-001)
    if (isTest && fileDiff && fileDiff.hunks) {
      let deletedAssertions = 0;
      let addedAssertions = 0;
      const assertionRegex = /\b(expect\(|assert\(|\.toBe\(|\.toEqual\(|\.toMatch\(|\.toThrow\()/;

      for (const hunk of fileDiff.hunks) {
        for (const l of hunk.lines) {
          if (l.startsWith('-') && !l.startsWith('---')) {
            if (assertionRegex.test(l)) deletedAssertions++;
          } else if (l.startsWith('+') && !l.startsWith('+++')) {
            if (assertionRegex.test(l)) addedAssertions++;
          }
        }
      }

      if (deletedAssertions > 0 && addedAssertions < deletedAssertions) {
        const line = fileDiff.modifiedLineRanges[0]?.start ?? 1;
        findings.push({
          id: `PC-TEST-WEAKEN-${filePath}`,
          ruleId: 'PC-TEST-001',
          category: 'quality',
          title: 'Test Weakening: Deleted Test Assertion Detected',
          severity: 'HIGH',
          description: `Diff removed ${deletedAssertions} test assertion(s) without equivalent replacements. This pattern often indicates AI attempts to pass tests by removing verification criteria.`,
          file: filePath,
          line,
          snippet: `Deleted assertions: ${deletedAssertions}, Added assertions: ${addedAssertions}`,
          evidenceTrace: [
            {
              file: filePath,
              line,
              description: `Net decrease of ${deletedAssertions - addedAssertions} test assertion(s) in test suite`
            }
          ],
          recommendation: 'Restore the original test assertions and fix the underlying implementation code instead of weakening tests.'
        });
      }
    }

    // Rule: Scope Creep & Sensitive File Guard (PC-SCOPE-001)
    if (fileDiff) {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const isSensitiveConfig =
        /(\.env|\.env\.[a-z0-9]+|package\.json|tsconfig\.json|\.npmrc|\.github\/workflows\/.*\.ya?ml)$/i.test(normalizedPath);

      if (isSensitiveConfig) {
        const isEnv = /\.env/i.test(normalizedPath);
        const line = fileDiff.modifiedLineRanges[0]?.start ?? 1;
        findings.push({
          id: `PC-SCOPE-${filePath}-${line}`,
          ruleId: 'PC-SCOPE-001',
          category: 'security',
          title: `Sensitive Configuration File Modified (${path.basename(filePath)})`,
          severity: isEnv ? 'HIGH' : 'MEDIUM',
          description: `Modifications detected in sensitive root configuration file '${path.basename(filePath)}'. Verify these changes are intentional and not unintended AI scope creep.`,
          file: filePath,
          line,
          snippet: getSnippet(line),
          evidenceTrace: [
            {
              file: filePath,
              line,
              description: `Critical config file modified: ${fileDiff.addedLines.length} line(s) added, ${fileDiff.deletedLines.length} line(s) removed`
            }
          ],
          recommendation: 'Carefully review environment variables and dependency changes to prevent credential leakage or supply chain shifts.'
        });
      }

      // Rule: Silent Security Field Dropped in Payload (PC-DATA-002)
      if (fileDiff.hunks) {
        const criticalFieldRegex = /\b(tenantId|userId|organizationId|orgId|accountId)\s*[:=]/;
        for (const hunk of fileDiff.hunks) {
          const deletedCriticalFields: { field: string; line: string }[] = [];
          const addedText = hunk.lines
            .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
            .join('\n');

          for (const l of hunk.lines) {
            if (l.startsWith('-') && !l.startsWith('---')) {
              const match = l.match(criticalFieldRegex);
              if (match) {
                const fieldName = match[1];
                const reIntroduced = new RegExp(`\\b${fieldName}\\s*[:=]`).test(addedText);
                if (!reIntroduced) {
                  deletedCriticalFields.push({ field: fieldName, line: l });
                }
              }
            }
          }

          if (deletedCriticalFields.length > 0) {
            const fieldNames = Array.from(new Set(deletedCriticalFields.map((d) => d.field)));
            const line = fileDiff.modifiedLineRanges[0]?.start ?? 1;
            findings.push({
              id: `PC-DATA-DROP-${filePath}-${line}`,
              ruleId: 'PC-DATA-002',
              category: 'security',
              title: `Silent Security Field Dropped in Payload (${fieldNames.join(', ')})`,
              severity: 'HIGH',
              description: `Critical multi-tenant or identity field(s) '${fieldNames.join(
                ', '
              )}' were deleted from this code block without replacement. This is a common AI refactoring mistake that causes cross-tenant data leaks.`,
              file: filePath,
              line,
              snippet: deletedCriticalFields.map((d) => d.line).join('\n'),
              evidenceTrace: deletedCriticalFields.map((d) => ({
                file: filePath,
                line,
                description: `Field '${d.field}' removed from payload in Git diff: ${d.line.trim()}`
              })),
              recommendation: `Restore '${fieldNames.join(
                ', '
              )}' to ensure tenant and user data isolation.`
            });
          }
        }
      }
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
              severity: 'HIGH',
              description: `API route handler '${handlerName}' accesses database resources without verifying user authentication or permissions.`,
              file: filePath,
              line,
              snippet: getSnippet(line),
              evidenceTrace: trace,
              recommendation:
                'Verify user identity and ownership before querying or modifying sensitive records (e.g. const session = await auth()).'
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return findings;
  }

  private static checkUnhandledNullDbResult(
    node: ts.VariableDeclaration,
    sourceFile: ts.SourceFile,
    filePath: string,
    isLineChanged: (line: number) => boolean,
    getSnippet: (line: number) => string,
    findings: RiskFinding[]
  ): void {
    if (!ts.isIdentifier(node.name) || !node.initializer) return;
    const varName = node.name.text;
    const initText = node.initializer.getText(sourceFile);

    const isSingleEntityQuery =
      /\b(db|prisma|repository|repo|order|user|account)(\.[a-zA-Z0-9_$]+)*\.(findUnique|findOne|findById)\b/i.test(
        initText
      );

    if (!isSingleEntityQuery) return;

    let scopeNode: ts.Node | undefined = node.parent;
    while (scopeNode && !ts.isBlock(scopeNode) && !ts.isSourceFile(scopeNode)) {
      scopeNode = scopeNode.parent;
    }
    if (!scopeNode) return;

    const statements = ts.isBlock(scopeNode)
      ? scopeNode.statements
      : (scopeNode as ts.SourceFile).statements;

    const varDeclIndex = statements.findIndex((s) => s.getText(sourceFile).includes(varName));
    if (varDeclIndex === -1) return;

    let hasNullCheck = false;
    let unsafeDereference: { line: number; text: string } | null = null;

    for (let i = varDeclIndex + 1; i < statements.length; i++) {
      const stmt = statements[i];

      if (
        ts.isIfStatement(stmt) &&
        (new RegExp(`!\\s*${varName}\\b`).test(stmt.expression.getText(sourceFile)) ||
          new RegExp(`${varName}\\s*(===|==)\\s*(null|undefined)`).test(
            stmt.expression.getText(sourceFile)
          ))
      ) {
        hasNullCheck = true;
        break;
      }

      const checkNode = (n: ts.Node) => {
        if (hasNullCheck || unsafeDereference) return;
        if (ts.isPropertyAccessExpression(n)) {
          if (
            ts.isIdentifier(n.expression) &&
            n.expression.text === varName &&
            !n.questionDotToken
          ) {
            let p: ts.Node | undefined = n.parent;
            let guarded = false;
            while (p && p !== stmt) {
              if (
                ts.isBinaryExpression(p) &&
                p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
                p.left.getText(sourceFile).includes(varName)
              ) {
                guarded = true;
                break;
              }
              p = p.parent;
            }

            if (!guarded) {
              const lc = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile));
              unsafeDereference = {
                line: lc.line + 1,
                text: n.getText(sourceFile)
              };
            }
          }
        }
        ts.forEachChild(n, checkNode);
      };

      checkNode(stmt);
      if (unsafeDereference) break;
    }

    if (!hasNullCheck && unsafeDereference) {
      const declLc = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const declLine = declLc.line + 1;
      const refLine = (unsafeDereference as { line: number; text: string }).line;
      const refText = (unsafeDereference as { line: number; text: string }).text;

      if (isLineChanged(declLine) || isLineChanged(refLine)) {
        findings.push({
          id: `PC-NULL-${filePath}-${refLine}`,
          ruleId: 'PC-DATA-001',
          category: 'reliability',
          title: `Unhandled Null/Undefined Database Result (${varName})`,
          severity: 'MEDIUM',
          description: `Database query result '${varName}' is dereferenced as '${refText}' without verifying if the record exists, risking runtime TypeError if not found.`,
          file: filePath,
          line: refLine,
          snippet: getSnippet(refLine),
          evidenceTrace: [
            {
              file: filePath,
              line: declLine,
              description: `Record looked up via ${initText}`
            },
            {
              file: filePath,
              line: refLine,
              description: `Property accessed directly via '${refText}' without null guard (e.g. if (!${varName}) or ${varName}?.${refText.split('.')[1] || ''})`
            }
          ],
          recommendation: `Check if '${varName}' is null before accessing properties, or use optional chaining (${varName}?.${refText.split('.')[1] || ''}).`
        });
      }
    }
  }

  public static getInstalledDependencies(filePath: string): Set<string> | null {
    let dir = path.dirname(path.resolve(filePath));
    let prev = '';
    while (dir !== prev) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          return new Set<string>([
            ...Object.keys(pkg.dependencies || {}),
            ...Object.keys(pkg.devDependencies || {}),
            ...Object.keys(pkg.peerDependencies || {})
          ]);
        } catch (err) {
          if (process.env.DEBUG) {
            console.warn('[ProofCode] Failed to parse package.json at', pkgPath, err);
          }
          return null;
        }
      }
      prev = dir;
      dir = path.dirname(dir);
    }
    return null;
  }

  public static isTestFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return (
      normalized.includes('.test.') ||
      normalized.includes('.spec.') ||
      normalized.includes('/__tests__/') ||
      normalized.includes('/tests/')
    );
  }
}
