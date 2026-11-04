import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { FileDiff, RiskFinding } from '../types';
import { AstAnalyzer } from './astAnalyzer';
import { ProjectGraph } from '../graph/projectGraph';
import { GitService } from '../git/gitService';

export class ContractAnalyzer {
  /**
   * Compares the previous version of changed files against the new working tree version.
   * Detects:
   * 1. Exported functions that had new required parameters added without defaults, breaking callers.
   * 2. Exported functions/symbols that were deleted or renamed while still imported elsewhere.
   */
  public static async analyzeContractBreaks(
    repoRoot: string,
    filesToVerify: FileDiff[],
    graph: ProjectGraph,
    gitService: GitService,
    readFileFn: (filePath: string) => string = (p) =>
      fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  ): Promise<RiskFinding[]> {
    const findings: RiskFinding[] = [];

    for (const file of filesToVerify) {
      if (file.isNew || file.isDeleted) continue;
      if (!/\.(ts|tsx|js|jsx)$/.test(file.newPath)) continue;

      const fullPath = path.resolve(repoRoot, file.newPath);
      const oldContent = await gitService.getFileContentAtRef(file.oldPath, 'HEAD', repoRoot);
      if (!oldContent) continue;

      const newContent = readFileFn(fullPath);
      if (!newContent) continue;

      const oldAnalysis = AstAnalyzer.analyzeFile(fullPath, oldContent);
      const newAnalysis = AstAnalyzer.analyzeFile(fullPath, newContent);

      const oldExports = oldAnalysis.symbols.filter((s) => s.isExported);
      const newSymbolsMap = new Map(newAnalysis.symbols.map((s) => [s.name, s]));

      // Get all downstream dependent files from the project graph
      const dependents = graph.getDependents(fullPath);

      for (const oldSym of oldExports) {
        const newSym = newSymbolsMap.get(oldSym.name);

        // Case 1: Symbol was deleted or renamed
        if (!newSym) {
          const affectedFiles: string[] = [];
          for (const dep of dependents) {
            const depAnalysis = graph.getAnalysis(dep);
            if (depAnalysis) {
              const importsOldSymbol = depAnalysis.imports.some(
                (imp) =>
                  imp.resolvedPath === fullPath &&
                  imp.specifiers.some((spec) => spec.name === oldSym.name)
              );
              if (importsOldSymbol) {
                affectedFiles.push(path.basename(dep));
              }
            }
          }

          if (affectedFiles.length > 0) {
            findings.push({
              id: `PC-BREAK-DEL-${file.newPath}-${oldSym.name}`,
              ruleId: 'PC-BREAK-001',
              category: 'reliability',
              title: `Breaking Contract: Exported Symbol '${oldSym.name}' Deleted or Renamed`,
              severity: 'HIGH',
              description: `Exported symbol '${oldSym.name}' in '${file.newPath}' was removed or renamed in this diff, but is actively imported by ${affectedFiles.length} downstream file(s): ${affectedFiles.join(', ')}.`,
              file: file.newPath,
              line: file.modifiedLineRanges[0]?.start ?? 1,
              snippet: `Deleted symbol: ${oldSym.name}`,
              evidenceTrace: [
                {
                  file: file.newPath,
                  line: file.modifiedLineRanges[0]?.start ?? 1,
                  description: `Export '${oldSym.name}' missing in new revision`
                },
                ...affectedFiles.map((f) => ({
                  file: f,
                  line: 1,
                  description: `Downstream file imports '${oldSym.name}'`
                }))
              ],
              recommendation: `Restore the export '${oldSym.name}', provide a backward-compatible alias, or refactor all downstream callers: ${affectedFiles.join(', ')}.`
            });
          }
        } else if (
          (oldSym.kind === 'function' || oldSym.kind === 'method' || oldSym.kind === 'arrow_function') &&
          oldSym.parameters &&
          newSym.parameters
        ) {
          // Case 2: New required parameters added to exported function
          const oldReqCount = oldSym.parameters.filter((p) => !p.isOptional).length;
          const newReqCount = newSym.parameters.filter((p) => !p.isOptional).length;

          if (newReqCount > oldReqCount) {
            const affectedCallers: { file: string; line: number; callText: string }[] = [];
            for (const dep of dependents) {
              const depContent = readFileFn(dep);
              if (depContent && depContent.includes(oldSym.name)) {
                const depSource = ts.createSourceFile(dep, depContent, ts.ScriptTarget.Latest, true);
                const checkCalls = (n: ts.Node) => {
                  if (ts.isCallExpression(n)) {
                    const callName = n.expression.getText(depSource);
                    if (callName === oldSym.name || callName.endsWith(`.${oldSym.name}`)) {
                      if (n.arguments.length < newReqCount) {
                        const lc = depSource.getLineAndCharacterOfPosition(n.getStart(depSource));
                        affectedCallers.push({
                          file: path.basename(dep),
                          line: lc.line + 1,
                          callText: n.getText(depSource)
                        });
                      }
                    }
                  }
                  ts.forEachChild(n, checkCalls);
                };
                ts.forEachChild(depSource, checkCalls);
              }
            }

            if (affectedCallers.length > 0) {
              const addedParam = newSym.parameters.find(
                (p, idx) => !p.isOptional && (!oldSym.parameters![idx] || oldSym.parameters![idx].isOptional)
              );
              const paramName = addedParam?.name || 'new parameter';

              findings.push({
                id: `PC-BREAK-SIG-${file.newPath}-${newSym.name}`,
                ruleId: 'PC-BREAK-001',
                category: 'reliability',
                title: `Breaking Contract: Required Parameter '${paramName}' Added to '${newSym.name}'`,
                severity: 'HIGH',
                description: `Function '${newSym.name}' now requires ${newReqCount} parameters (previously ${oldReqCount}), but ${affectedCallers.length} downstream caller(s) pass fewer arguments. This causes runtime undefined argument failures.`,
                file: file.newPath,
                line: newSym.startLine,
                snippet: `Function ${newSym.name}(${newSym.parameters.map((p) => `${p.name}${p.isOptional ? '?' : ''}`).join(', ')})`,
                evidenceTrace: [
                  {
                    file: file.newPath,
                    line: newSym.startLine,
                    description: `Signature changed from ${oldReqCount} to ${newReqCount} required parameter(s)`
                  },
                  ...affectedCallers.map((c) => ({
                    file: c.file,
                    line: c.line,
                    description: `Caller '${c.callText}' passes fewer than ${newReqCount} arguments`
                  }))
                ],
                recommendation: `Make '${paramName}' optional (e.g. ${paramName}?), provide a default value, or update all caller sites: ${affectedCallers.map((c) => `${c.file}:${c.line}`).join(', ')}.`
              });
            }
          }

          // Case 3: Parameter type altered on an existing parameter
          const minParams = Math.min(oldSym.parameters.length, newSym.parameters.length);
          for (let i = 0; i < minParams; i++) {
            const oldP = oldSym.parameters[i];
            const newP = newSym.parameters[i];
            if (
              oldP.type &&
              newP.type &&
              oldP.type !== newP.type &&
              !newP.type.includes(oldP.type)
            ) {
              const affectedCallers: { file: string; line: number; callText: string }[] = [];
              for (const dep of dependents) {
                const depContent = readFileFn(dep);
                if (depContent && depContent.includes(oldSym.name)) {
                  const depSource = ts.createSourceFile(dep, depContent, ts.ScriptTarget.Latest, true);
                  const checkCalls = (n: ts.Node) => {
                    if (ts.isCallExpression(n)) {
                      const callName = n.expression.getText(depSource);
                      if (callName === oldSym.name || callName.endsWith(`.${oldSym.name}`)) {
                        const lc = depSource.getLineAndCharacterOfPosition(n.getStart(depSource));
                        affectedCallers.push({
                          file: path.basename(dep),
                          line: lc.line + 1,
                          callText: n.getText(depSource)
                        });
                      }
                    }
                    ts.forEachChild(n, checkCalls);
                  };
                  ts.forEachChild(depSource, checkCalls);
                }
              }

              if (affectedCallers.length > 0) {
                findings.push({
                  id: `PC-BREAK-TYPE-${file.newPath}-${newSym.name}-${newP.name}`,
                  ruleId: 'PC-BREAK-001',
                  category: 'reliability',
                  title: `Breaking Contract: Parameter '${newP.name}' Type Changed in '${newSym.name}'`,
                  severity: 'HIGH',
                  description: `Parameter '${newP.name}' in '${newSym.name}' changed type from '${oldP.type}' to '${newP.type}'. Downstream callers in ${affectedCallers.length} file(s) may supply incompatible values.`,
                  file: file.newPath,
                  line: newSym.startLine,
                  snippet: `${newSym.name}(..., ${newP.name}: ${newP.type})`,
                  evidenceTrace: [
                    {
                      file: file.newPath,
                      line: newSym.startLine,
                      description: `Type contract shifted: '${oldP.type}' -> '${newP.type}'`
                    },
                    ...affectedCallers.map((c) => ({
                      file: c.file,
                      line: c.line,
                      description: `Caller '${c.callText}' invokes function with old signature assumptions`
                    }))
                  ],
                  recommendation: `Maintain backwards compatibility by accepting '${oldP.type} | ${newP.type}' or update all downstream callers.`
                });
              }
            }
          }

          // Case 4: Return type weakened to nullable (null | undefined)
          if (
            oldSym.returnType &&
            newSym.returnType &&
            oldSym.returnType !== newSym.returnType &&
            !oldSym.returnType.includes('null') &&
            !oldSym.returnType.includes('undefined') &&
            (newSym.returnType.includes('null') || newSym.returnType.includes('undefined'))
          ) {
            const affectedFiles = Array.from(dependents).map((d) => path.basename(d));
            if (affectedFiles.length > 0) {
              findings.push({
                id: `PC-BREAK-RET-${file.newPath}-${newSym.name}`,
                ruleId: 'PC-BREAK-001',
                category: 'reliability',
                title: `Breaking Contract: Function '${newSym.name}' Now Returns Nullable Value`,
                severity: 'HIGH',
                description: `Return type of '${newSym.name}' changed from '${oldSym.returnType}' to '${newSym.returnType}'. Downstream callers in ${affectedFiles.length} file(s) that expect a non-null return value may throw unhandled null reference exceptions.`,
                file: file.newPath,
                line: newSym.startLine,
                snippet: `function ${newSym.name}(...): ${newSym.returnType}`,
                evidenceTrace: [
                  {
                    file: file.newPath,
                    line: newSym.startLine,
                    description: `Return contract weakened from '${oldSym.returnType}' to '${newSym.returnType}'`
                  },
                  ...affectedFiles.map((f) => ({
                    file: f,
                    line: 1,
                    description: `Downstream consumer file may access return properties without null check`
                  }))
                ],
                recommendation: `Ensure non-null return value or add null checks in all downstream callers: ${affectedFiles.join(', ')}.`
              });
            }
          }
        }
      }
    }

    return findings;
  }
}
