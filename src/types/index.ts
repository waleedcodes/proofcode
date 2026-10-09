/**
 * ProofCode Core Types
 * AI writes code. ProofCode proves the change.
 */

export type RiskSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type CheckStatus = 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED';

export type RuleStatus = 'PASS' | 'VIOLATION' | 'WARNING';

export type VerificationVerdict = 'READY_TO_SHIP' | 'NEEDS_REVIEW' | 'BLOCKED';

export interface ChangedLineRange {
  start: number;
  end: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: string[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  isNew: boolean;
  isDeleted: boolean;
  isRenamed: boolean;
  hunks: DiffHunk[];
  addedLines: number[];
  deletedLines: number[];
  modifiedLineRanges: ChangedLineRange[];
}

export interface GitDiffResult {
  repoRoot: string;
  baseRef?: string;
  files: FileDiff[];
  totalFilesChanged: number;
  totalInsertions: number;
  totalDeletions: number;
}

export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
}

export type SymbolKind =
  | 'function'
  | 'arrow_function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type_alias'
  | 'variable'
  | 'api_route';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  isExported: boolean;
  isDefaultExport?: boolean;
  parentSymbol?: string;
  calls: string[];
}

export interface ImportInfo {
  source: string;
  resolvedPath?: string;
  specifiers: {
    name: string;
    propertyName?: string;
    isDefault?: boolean;
    isNamespace?: boolean;
  }[];
  line: number;
}

export interface ExportInfo {
  name: string;
  isDefault: boolean;
  line: number;
}

export interface FileAnalysis {
  filePath: string;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  hasApiRoute: boolean;
  apiRoutes: {
    method: string;
    path: string;
    handlerSymbol: string;
    line: number;
  }[];
}

export interface AffectedCaller {
  callerName: string;
  filePath: string;
  line: number;
  hasTest: boolean;
  testFilePath?: string;
}

export interface AffectedRoute {
  routePath: string;
  method: string;
  filePath: string;
  line: number;
}

export interface AffectedSymbol {
  symbolName: string;
  kind: SymbolKind;
  filePath: string;
  callers: AffectedCaller[];
  isApiRoute: boolean;
}

export interface ImpactAnalysis {
  changedFiles: string[];
  changedSymbols: AffectedSymbol[];
  affectedFiles: string[];
  affectedCallers: AffectedCaller[];
  affectedRoutes: AffectedRoute[];
  totalCallersCount: number;
  untestedCallersCount: number;
}

export interface EvidenceTraceStep {
  file: string;
  line: number;
  symbol?: string;
  description: string;
}

export interface RiskFinding {
  id: string;
  ruleId: string;
  category: 'security' | 'authorization' | 'data_integrity' | 'reliability' | 'quality';
  title: string;
  severity: RiskSeverity;
  description: string;
  file: string;
  line: number;
  column?: number;
  snippet: string;
  evidenceTrace: EvidenceTraceStep[];
  recommendation: string;
}

export interface ProjectRule {
  id: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  category?: string;
  tags?: string[];
}

export interface RuleResult {
  rule: ProjectRule;
  status: RuleStatus;
  detectedMessage?: string;
  file?: string;
  line?: number;
  evidenceSnippet?: string;
}

export interface CheckResult {
  name: string;
  status: CheckStatus;
  durationMs?: number;
  message?: string;
  details?: string;
}

export interface VerificationScore {
  total: number;
  deductions: {
    reason: string;
    amount: number;
  }[];
}

export interface BreakageRiskItem {
  id: string;
  severity: RiskSeverity;
  area: string;
  trigger: string;
  detail: string;
  affectedCallersOrRoutes: string[];
  evidenceFile?: string;
  evidenceLine?: number;
}

export interface VerificationReport {
  timestamp: string;
  repoRoot: string;
  branch?: string;
  commitHash?: string;
  score: VerificationScore;
  verdict: VerificationVerdict;
  summary: {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
    symbolsAffected: number;
    apiRoutesAffected: number;
    testsAdded: number;
    testsAffected: number;
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
  };
  impact: ImpactAnalysis;
  risks: RiskFinding[];
  breakageRisks?: BreakageRiskItem[];
  rules: RuleResult[];
  checks: {
    typescript: CheckResult;
    eslint: CheckResult;
    unitTests: CheckResult;
    build: CheckResult;
  };
}
