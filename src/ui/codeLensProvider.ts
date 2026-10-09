import * as vscode from 'vscode';
import { VerificationReport } from '../types';

export class ProofCodeCodeLensProvider implements vscode.CodeLensProvider {
  private report: VerificationReport | null = null;
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  public setReport(report: VerificationReport | null): void {
    this.report = report;
    this.onDidChangeCodeLensesEmitter.fire();
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    if (!this.report) return [];

    const lenses: vscode.CodeLens[] = [];
    const docPath = document.fileName.replace(/\\/g, '/');

    // Find symbols in this file from impact analysis
    const fileSymbols = this.report.impact.changedSymbols.filter(
      (s) => s.filePath.replace(/\\/g, '/') === docPath || docPath.endsWith(s.filePath)
    );

    // Find risks in this file
    const fileRisks = this.report.risks.filter(
      (r) => r.file.replace(/\\/g, '/') === docPath || docPath.endsWith(r.file)
    );

    for (const sym of fileSymbols) {
      const callersCount = sym.callers.length;
      const untestedCount = sym.callers.filter((c) => !c.hasTest).length;

      // Find line number in document for this symbol
      for (let i = 0; i < Math.min(document.lineCount, 500); i++) {
        const lineText = document.lineAt(i).text;
        if (
          lineText.includes(`function ${sym.symbolName}`) ||
          lineText.includes(`const ${sym.symbolName}`) ||
          lineText.includes(`export async function ${sym.symbolName}`) ||
          lineText.includes(`export function ${sym.symbolName}`)
        ) {
          const range = new vscode.Range(i, 0, i, lineText.length);
          const relatedRisks = fileRisks.filter((r) => r.line >= i + 1 && r.line <= i + 15);

          let title = `🛡️ ProofCode: ${callersCount} caller${callersCount === 1 ? '' : 's'}`;
          if (untestedCount > 0) {
            title += ` (${untestedCount} untested)`;
          }
          if (relatedRisks.length > 0) {
