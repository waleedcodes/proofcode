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
