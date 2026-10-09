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
