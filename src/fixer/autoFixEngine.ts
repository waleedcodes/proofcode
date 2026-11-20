import * as fs from 'node:fs';
import * as path from 'node:path';
import { RiskFinding } from '../types';

export interface AutoFixTarget {
  ruleId: string;
  file: string;
  line: number;
  snippet?: string;
  description?: string;
}

export interface AppliedFix {
  ruleId: string;
  line: number;
  description: string;
  before: string;
  after: string;
}

export interface FileFixResult {
  file: string;
  relativeFile: string;
  appliedFixes: AppliedFix[];
  modified: boolean;
  content: string;
}

export interface AutoFixEngineOptions {
  dryRun?: boolean;
  ruleId?: string;
  workspaceRoot?: string;
}

export interface AutoFixSummary {
  success: boolean;
  dryRun: boolean;
  totalFixesApplied: number;
  filesModified: number;
  results: FileFixResult[];
}

export class AutoFixEngine {
  /**
   * The list of rule IDs supported by automated healing.
   */
  public static readonly SUPPORTED_RULES = [
    'PC-ENV-001',
    'PC-REL-008',
    'PC-TYPE-001',
    'PC-REL-009',
    'PC-REL-006',
    'PC-IMPORT-001',
    'PC-MUT-001',
    'PC-DATA-001',
    'PC-LEAK-001',
    'PC-ACTION-002'
  ];

  public static isRuleFixable(ruleId: string): boolean {
    return this.SUPPORTED_RULES.includes(ruleId);
  }

  /**
   * Fixes raw text content by applying fixes sorted from bottom to top (line descending).
   */
  public static fixContent(
    _filePath: string,
    content: string,
    targets: AutoFixTarget[]
  ): { newContent: string; appliedFixes: AppliedFix[] } {
    const isCrlf = content.includes('\r\n');
    const newline = isCrlf ? '\r\n' : '\n';
    const lines = content.split(/\r?\n/);
    const appliedFixes: AppliedFix[] = [];

    // Sort targets by line descending so lower line shifts don't disrupt higher lines
    const sortedTargets = [...targets].sort((a, b) => b.line - a.line);

    for (const target of sortedTargets) {
      const lineIdx = target.line - 1;
      if (lineIdx < 0 || lineIdx >= lines.length) continue;

      const originalLine = lines[lineIdx];
      const indentMatch = originalLine.match(/^\s*/);
      const indent = indentMatch ? indentMatch[0] : '';

      let fixedLine: string | null = null;
      let fixDescription = '';

      switch (target.ruleId) {
        // 1. Unchecked Environment Variable Access: process.env.FOO! -> process.env.FOO || ''
        case 'PC-ENV-001': {
          if (/process\.env(?:\.[a-zA-Z0-9_]+|\[['"][^'"]+['"]\])!/.test(originalLine)) {
            fixedLine = originalLine.replace(
              /(process\.env(?:\.[a-zA-Z0-9_]+|\[['"][^'"]+['"]\]))!/g,
              "$1 || ''"
            );
            fixDescription = "Replaced non-null assertion with safe fallback (|| '')";
          }
          break;
        }

        // 2. Unawaited Async Call in Conditional: if (checkAuth()) -> if (await checkAuth())
        case 'PC-REL-008': {
          if (/(if\s*\(\s*|while\s*\(\s*|\?\s*)([a-zA-Z0-9_$.]+\s*\()/g.test(originalLine)) {
            fixedLine = originalLine.replace(
              /(if\s*\(\s*|while\s*\(\s*|\?\s*)([a-zA-Z0-9_$.]+\s*\()/g,
              '$1await $2'
            );
            fixDescription = "Inserted missing 'await' before async call in conditional";
          }
          break;
        }

        // 3. Dangerous Type Assertion Bypass: as any -> as unknown or remove @ts-ignore
        case 'PC-TYPE-001': {
          if (/\bas\s+any\b/.test(originalLine)) {
            fixedLine = originalLine.replace(/\bas\s+any\b/g, 'as unknown');
            fixDescription = "Replaced unsafe 'as any' with 'as unknown'";
          } else if (/\/\/\s*@ts-(ignore|nocheck|expect-error)\b/.test(originalLine)) {
            if (/^\s*\/\/\s*@ts-(ignore|nocheck|expect-error)\b[^\n]*$/.test(originalLine)) {
              // Delete line entirely
              lines.splice(lineIdx, 1);
              appliedFixes.push({
                ruleId: target.ruleId,
                line: target.line,
                description: 'Removed TypeScript compiler suppression directive line',
                before: originalLine,
                after: '(deleted)'
              });
              continue;
            } else {
              fixedLine = originalLine.replace(/\/\/\s*@ts-(ignore|nocheck|expect-error)\b[^\n]*/, '').trimEnd();
              fixDescription = 'Removed inline TypeScript compiler suppression directive';
            }
          }
          break;
        }

        // 4. Silent Error Swallowing in Catch Block
        case 'PC-REL-009': {
          if (originalLine.includes('catch')) {
            const errParamMatch = originalLine.match(/catch\s*\(([^)]+)\)/);
            const errParam = errParamMatch ? errParamMatch[1].trim() : 'error';
            if (/catch\s*(\([^)]*\))?\s*\{[^}]*\}/.test(originalLine)) {
              fixedLine = originalLine.replace(
                /catch\s*(\([^)]*\))?\s*\{[^}]*\}/,
                `catch (${errParam}) {\n${indent}  console.error('Operation failed:', ${errParam});\n${indent}}`
              );
            } else {
              fixedLine = originalLine.replace(
                /catch\s*(\([^)]*\))?\s*\{?/,
                `catch (${errParam}) {\n${indent}  console.error('Operation failed:', ${errParam});`
              );
            }
            fixDescription = `Added error logging to catch block (${errParam})`;
          }
          break;
        }

        // 5. Unhandled Async Operation: Wrap in try/catch block
        case 'PC-REL-006': {
          if (originalLine.includes('await') && !originalLine.includes('try {')) {
            fixedLine = `${indent}try {\n${indent}  ${originalLine.trim()}\n${indent}} catch (error) {\n${indent}  console.error('Async operation failed:', error);\n${indent}}`;
            fixDescription = 'Wrapped unhandled async operation in try/catch block';
          }
          break;
        }

        // 6. Phantom / Hallucinated Dependency: Remove import statement
        case 'PC-IMPORT-001': {
          if (/^\s*import\b/.test(originalLine)) {
            lines.splice(lineIdx, 1);
            appliedFixes.push({
              ruleId: target.ruleId,
              line: target.line,
              description: 'Removed uninstalled phantom dependency import',
              before: originalLine,
              after: '(deleted)'
            });
            continue;
          }
          break;
        }

        // 7. Direct State Mutation in React: items.push(newItem) -> [...items, newItem]
        case 'PC-MUT-001': {
          if (/\.push\(/.test(originalLine)) {
            if (/([a-zA-Z0-9_$]+)\.push\(([^)]+)\)/.test(originalLine)) {
              fixedLine = originalLine.replace(
                /([a-zA-Z0-9_$]+)\.push\(([^)]+)\)/g,
                '$1 = [...$1, $2]'
              );
              fixDescription = 'Replaced mutating .push() with immutable array spread';
            }
          }
          break;
        }

        // 8. Unhandled Null/Undefined Database Result
        case 'PC-DATA-001': {
          const varMatch = target.description?.match(/\(([^)]+)\)/);
          const varName = varMatch ? varMatch[1] : 'record';
          const dotIndex = originalLine.indexOf(`${varName}.`);
          if (dotIndex !== -1) {
            fixedLine = originalLine.replace(
              new RegExp(`\\b${varName}\\.`, 'g'),
              `${varName}?.`
            );
            fixDescription = `Applied optional chaining (${varName}?.)`;
          } else {
            fixedLine = `${indent}if (!${varName}) throw new Error('${varName} not found');\n${originalLine}`;
            fixDescription = `Added null check guard for '${varName}'`;
          }
          break;
        }

        // 9. Client Secret Leak in 'use client' file: prefix with NEXT_PUBLIC_
        case 'PC-LEAK-001': {
          if (/process\.env\.(?!NEXT_PUBLIC_)([a-zA-Z0-9_]+)/.test(originalLine)) {
            fixedLine = originalLine.replace(
              /process\.env\.(?!NEXT_PUBLIC_)([a-zA-Z0-9_]+)/g,
              'process.env.NEXT_PUBLIC_$1'
            );
            fixDescription =
              "Prefixed private environment variable with 'NEXT_PUBLIC_' for client accessibility";
          }
          break;
        }

        // 10. Missing Cache Revalidation in Server Action: add revalidatePath('/')
        case 'PC-ACTION-002': {
          fixedLine = `${originalLine}\n${indent}revalidatePath('/');`;
          fixDescription =
            "Added missing Next.js cache revalidation call (revalidatePath('/'))";
          break;
        }

        default:
          break;
      }

      if (fixedLine !== null && fixedLine !== originalLine) {
        lines[lineIdx] = fixedLine;
        appliedFixes.push({
          ruleId: target.ruleId,
          line: target.line,
          description: fixDescription,
          before: originalLine,
          after: fixedLine
        });
      }
    }

    return {
      newContent: lines.join(newline),
      appliedFixes
    };
  }

  /**
   * Scans a set of risks, groups them by file, applies all automated fixes,
   * and writes the results to disk (unless dryRun is true).
   */
  public static applyFixes(
    repoRoot: string,
    risks: (RiskFinding | AutoFixTarget)[],
    options: AutoFixEngineOptions = {}
  ): AutoFixSummary {
    const root = path.resolve(repoRoot);
    const dryRun = Boolean(options.dryRun);

    // Filter to fixable risks
    let eligibleRisks = risks.filter((r) => this.isRuleFixable(r.ruleId));
    if (options.ruleId) {
      eligibleRisks = eligibleRisks.filter((r) => r.ruleId === options.ruleId);
    }

    // Group targets by resolved file path
    const fileTargetsMap = new Map<string, AutoFixTarget[]>();
    for (const risk of eligibleRisks) {
      const fullPath = path.isAbsolute(risk.file)
        ? risk.file
        : path.resolve(root, risk.file);

      if (!fileTargetsMap.has(fullPath)) {
        fileTargetsMap.set(fullPath, []);
      }
      fileTargetsMap.get(fullPath)!.push({
        ruleId: risk.ruleId,
        file: fullPath,
        line: risk.line,
        snippet: risk.snippet,
        description: risk.description
      });
    }

    const results: FileFixResult[] = [];
    let totalFixesApplied = 0;
    let filesModified = 0;

    for (const [filePath, targets] of fileTargetsMap.entries()) {
      if (!fs.existsSync(filePath)) continue;

      const rawContent = fs.readFileSync(filePath, 'utf8');
      const { newContent, appliedFixes } = this.fixContent(filePath, rawContent, targets);

      const modified = appliedFixes.length > 0 && newContent !== rawContent;
      if (modified) {
        filesModified++;
        totalFixesApplied += appliedFixes.length;
        if (!dryRun) {
          fs.writeFileSync(filePath, newContent, 'utf8');
        }
      }

      const relativeFile = path.relative(root, filePath);
      results.push({
        file: filePath,
        relativeFile,
        appliedFixes,
        modified,
        content: newContent
      });
    }

    return {
      success: true,
      dryRun,
      totalFixesApplied,
      filesModified,
      results
    };
  }
}
