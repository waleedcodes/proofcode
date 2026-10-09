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
