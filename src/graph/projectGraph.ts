import * as fs from 'node:fs';
import * as path from 'node:path';
import { AstAnalyzer } from '../analyzer/astAnalyzer';
import {
  AffectedCaller,
  AffectedRoute,
  AffectedSymbol,
  FileAnalysis,
  ImpactAnalysis,
  SymbolInfo
} from '../types';

export class ProjectGraph {
  private workspaceRoot: string;
  private fileAnalyses = new Map<string, FileAnalysis>();
  private fileDependents = new Map<string, Set<string>>(); // targetFile -> Set of files that import it
  private fileDependencies = new Map<string, Set<string>>(); // sourceFile -> Set of files it imports
  private pathAliases = new Map<string, string>(); // alias prefix -> target dir

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.loadTsConfigAliases();
  }

  private loadTsConfigAliases(): void {
    const tsconfigPath = path.join(this.workspaceRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) return;

    try {
      const raw = fs.readFileSync(tsconfigPath, 'utf8');
      // Strip comments
      const cleaned = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const parsed = JSON.parse(cleaned);
      const paths = parsed.compilerOptions?.paths;
      const baseUrl = parsed.compilerOptions?.baseUrl || '.';

      if (paths && typeof paths === 'object') {
        for (const [aliasPattern, targetList] of Object.entries(paths)) {
          if (Array.isArray(targetList) && targetList.length > 0) {
            const cleanAlias = aliasPattern.replace(/\*$/, '');
            const cleanTarget = (targetList[0] as string).replace(/\*$/, '');
            const resolvedTarget = path.resolve(this.workspaceRoot, baseUrl, cleanTarget);
            this.pathAliases.set(cleanAlias, resolvedTarget);
          }
        }
      }
    } catch {
      // Ignore tsconfig parsing errors
    }
  }

  /**
   * Scans all code files in the workspace and builds the dependency graph.
   */
  public async buildGraph(filterFiles?: string[]): Promise<void> {
    const filesToScan = filterFiles ?? this.findSourceFiles(this.workspaceRoot);

    for (const file of filesToScan) {
      const analysis = AstAnalyzer.analyzeFile(file);
      this.fileAnalyses.set(file, analysis);
    }

    // Resolve dependencies and construct reverse dependents graph
    for (const [sourceFile, analysis] of this.fileAnalyses.entries()) {
      const deps = new Set<string>();

      for (const imp of analysis.imports) {
        const resolved = this.resolveImportPath(sourceFile, imp.source);
        if (resolved) {
          deps.add(resolved);
          imp.resolvedPath = resolved;

          let reverseSet = this.fileDependents.get(resolved);
          if (!reverseSet) {
            reverseSet = new Set<string>();
            this.fileDependents.set(resolved, reverseSet);
          }
          reverseSet.add(sourceFile);
        }
      }

      this.fileDependencies.set(sourceFile, deps);
    }
  }

  public resolveImportPath(currentFile: string, importSource: string): string | null {
    // 1. Relative import
    if (importSource.startsWith('.')) {
      const dir = path.dirname(currentFile);
      const targetCandidate = path.resolve(dir, importSource);
      return this.tryResolveFileExtensions(targetCandidate);
    }

    // 2. Check path aliases (e.g. "@/..." or "~/...")
    for (const [alias, targetBase] of this.pathAliases.entries()) {
      if (importSource.startsWith(alias)) {
        const remainder = importSource.substring(alias.length);
        const resolvedCandidate = path.resolve(targetBase, remainder);
        return this.tryResolveFileExtensions(resolvedCandidate);
      }
    }

    return null;
  }

  private tryResolveFileExtensions(basePath: string): string | null {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

    // Direct file match
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
      return basePath;
    }

    // Match with extension
    for (const ext of extensions) {
      const candidate = `${basePath}${ext}`;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }

    // Match directory index file
    if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
      for (const ext of extensions) {
        const indexCandidate = path.join(basePath, `index${ext}`);
        if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
          return indexCandidate;
        }
      }
    }

    return null;
  }

  public findSourceFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;

    const ignoredDirs = new Set([
      'node_modules',
      '.git',
      'dist',
      'out',
      '.next',
      '.turbo',
      'coverage',
      'build'
    ]);

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name) && !entry.name.startsWith('.')) {
          this.findSourceFiles(fullPath, fileList);
        }
      } else if (entry.isFile()) {
        if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
          fileList.push(fullPath);
        }
      }
    }

    return fileList;
  }

  public getAnalysis(filePath: string): FileAnalysis | undefined {
    return this.fileAnalyses.get(filePath);
  }

  public getDependents(filePath: string): Set<string> {
    return this.fileDependents.get(filePath) || new Set();
  }

  public isTestFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return (
      normalized.includes('.test.') ||
      normalized.includes('.spec.') ||
      normalized.includes('/__tests__/') ||
      normalized.includes('/tests/')
    );
  }

  /**
   * Computes the change impact across the codebase given a map of changed files and lines.
   */
  public computeImpact(fileChangedLines: Map<string, number[]>): ImpactAnalysis {
    const changedFiles = Array.from(fileChangedLines.keys());
    const affectedFilesSet = new Set<string>();
    const affectedCallers: AffectedCaller[] = [];
    const affectedRoutes: AffectedRoute[] = [];
    const changedSymbolsList: AffectedSymbol[] = [];

    // Collect all test files in the workspace for test coverage check
    const allTestFiles = Array.from(this.fileAnalyses.keys()).filter((f) => this.isTestFile(f));

    for (const [changedFile, lineNumbers] of fileChangedLines.entries()) {
      const analysis = this.fileAnalyses.get(changedFile);
      if (!analysis) continue;

      // Find changed symbols in this file
      const touchedSymbols = AstAnalyzer.findSymbolsAtLines(analysis.symbols, lineNumbers);

      for (const sym of touchedSymbols) {
        const callers = this.findCallersForSymbol(sym, changedFile, allTestFiles);
        const isApiRoute =
          sym.kind === 'api_route' ||
          (analysis.hasApiRoute &&
            /^(GET|POST|PUT|DELETE|PATCH)$/i.test(sym.name));

        changedSymbolsList.push({
          symbolName: sym.name,
          kind: sym.kind,
          filePath: changedFile,
          callers,
          isApiRoute
        });

        for (const caller of callers) {
          affectedCallers.push(caller);
          affectedFilesSet.add(caller.filePath);
        }
      }

      // Add direct and transitive dependents
      const dependents = this.getTransitiveDependents(changedFile);
      for (const dep of dependents) {
        affectedFilesSet.add(dep);
        const depAnalysis = this.fileAnalyses.get(dep);
        if (depAnalysis && depAnalysis.hasApiRoute) {
          for (const route of depAnalysis.apiRoutes) {
            affectedRoutes.push({
              routePath: route.path,
              method: route.method,
              filePath: dep,
              line: route.line
            });
          }
        }
      }

      // Check if the changed file itself has API routes
      if (analysis.hasApiRoute) {
        for (const route of analysis.apiRoutes) {
          affectedRoutes.push({
            routePath: route.path,
            method: route.method,
            filePath: changedFile,
            line: route.line
          });
        }
      }
    }

    // Deduplicate routes
    const uniqueRoutesMap = new Map<string, AffectedRoute>();
    for (const r of affectedRoutes) {
      const key = `${r.method}:${r.filePath}:${r.line}`;
      uniqueRoutesMap.set(key, r);
    }

    const totalCallersCount = affectedCallers.length;
    const untestedCallersCount = affectedCallers.filter((c) => !c.hasTest).length;

    return {
      changedFiles,
      changedSymbols: changedSymbolsList,
      affectedFiles: Array.from(affectedFilesSet),
      affectedCallers,
      affectedRoutes: Array.from(uniqueRoutesMap.values()),
      totalCallersCount,
      untestedCallersCount
    };
  }

  private findCallersForSymbol(
    sym: SymbolInfo,
    defFile: string,
    allTestFiles: string[]
  ): AffectedCaller[] {
    const callers: AffectedCaller[] = [];
    const directDependents = this.getDependents(defFile);

    // Also include same file callers
    const defAnalysis = this.fileAnalyses.get(defFile);
    if (defAnalysis) {
      for (const otherSym of defAnalysis.symbols) {
        if (otherSym.name !== sym.name && otherSym.calls.includes(sym.name)) {
          const hasTest = this.hasTestCoverage(defFile, otherSym.name, allTestFiles);
          callers.push({
            callerName: otherSym.name,
            filePath: defFile,
            line: otherSym.startLine,
            hasTest,
            testFilePath: hasTest ? this.findMatchingTestFile(defFile, allTestFiles) : undefined
          });
        }
      }
    }

    for (const depFile of directDependents) {
      const depAnalysis = this.fileAnalyses.get(depFile);
      if (!depAnalysis) continue;

      // Check if depFile imports sym
      const importsSymbol = depAnalysis.imports.some(
        (imp) =>
          imp.resolvedPath === defFile &&
          (imp.specifiers.some((s) => s.name === sym.name || s.propertyName === sym.name) ||
            imp.specifiers.some((s) => s.isNamespace || s.isDefault))
      );

      if (!importsSymbol) continue;

      // Check which symbols in depFile call sym.name
      for (const callerSym of depAnalysis.symbols) {
        if (
          callerSym.calls.includes(sym.name) ||
          callerSym.calls.some((c) => c.endsWith(`.${sym.name}`))
        ) {
          const hasTest = this.isTestFile(depFile) || this.hasTestCoverage(depFile, callerSym.name, allTestFiles);
          callers.push({
            callerName: callerSym.name,
            filePath: depFile,
            line: callerSym.startLine,
            hasTest,
            testFilePath: hasTest ? (this.isTestFile(depFile) ? depFile : this.findMatchingTestFile(depFile, allTestFiles)) : undefined
          });
        }
      }
    }

    return callers;
  }

  private getTransitiveDependents(file: string, visited = new Set<string>()): Set<string> {
    if (visited.has(file)) return new Set();
    visited.add(file);

    const result = new Set<string>();
    const direct = this.getDependents(file);

    for (const d of direct) {
      result.add(d);
      const sub = this.getTransitiveDependents(d, visited);
      for (const s of sub) {
        result.add(s);
      }
    }

    return result;
  }

  private hasTestCoverage(sourceFile: string, _symbolName: string, allTestFiles: string[]): boolean {
    const base = path.basename(sourceFile, path.extname(sourceFile));
    for (const testFile of allTestFiles) {
      if (testFile.includes(base)) {
        return true;
      }
      // Check if testFile imports sourceFile
      const deps = this.fileDependencies.get(testFile);
      if (deps && deps.has(sourceFile)) {
        return true;
      }
    }
    return false;
  }

  private findMatchingTestFile(sourceFile: string, allTestFiles: string[]): string | undefined {
    const base = path.basename(sourceFile, path.extname(sourceFile));
    return allTestFiles.find((t) => t.includes(base));
  }
}
