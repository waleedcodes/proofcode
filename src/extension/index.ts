import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ProofCodeEngine } from '../engine/proofCodeEngine';
import { ReportFormatter } from '../engine/reportFormatter';
import { ProjectRulesEngine } from '../rules/projectRulesEngine';
import { VerificationReport } from '../types';
import { ProofCodeCodeActionProvider } from '../ui/codeActionProvider';
import { ProofCodeCodeLensProvider } from '../ui/codeLensProvider';
import { ProofCodeTreeDataProvider } from '../ui/treeDataProvider';
import { ProofCodeWebviewPanel } from '../ui/webviewPanel';

let treeDataProvider: ProofCodeTreeDataProvider;
let statusBarItem: vscode.StatusBarItem;
let codeLensProvider: ProofCodeCodeLensProvider;
let diagnosticCollection: vscode.DiagnosticCollection;
let latestReport: VerificationReport | null = null;

export function activate(context: vscode.ExtensionContext): void {
  // 1. Sidebar Tree View
  treeDataProvider = new ProofCodeTreeDataProvider();
  vscode.window.registerTreeDataProvider('proofcode.views.overview', treeDataProvider);

  // 2. Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'proofcode.openDashboard';
  statusBarItem.text = '$(shield) ProofCode';
  statusBarItem.tooltip = 'ProofCode Change Verification: Click to open dashboard';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 3. Diagnostics, CodeLens & Quick Fix Code Actions
  codeLensProvider = new ProofCodeCodeLensProvider();
  const codeLensDisposable = vscode.languages.registerCodeLensProvider(
    [
      { language: 'typescript' },
      { language: 'javascript' },
      { language: 'typescriptreact' },
      { language: 'javascriptreact' }
    ],
    codeLensProvider
  );
  diagnosticCollection = vscode.languages.createDiagnosticCollection('proofcode');

  const codeActionProvider = new ProofCodeCodeActionProvider();
  const codeActionDisposable = vscode.languages.registerCodeActionsProvider(
    [
      { language: 'typescript' },
      { language: 'javascript' },
      { language: 'typescriptreact' },
      { language: 'javascriptreact' }
    ],
    codeActionProvider,
    {
      providedCodeActionKinds: ProofCodeCodeActionProvider.providedCodeActionKinds
    }
  );

  context.subscriptions.push(codeLensDisposable, diagnosticCollection, codeActionDisposable);

  // Helper to get workspace root
  const getWorkspaceRoot = (): string | undefined => {
    return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;
  };

  // Verification Runner
  const runVerification = async (quiet = false): Promise<VerificationReport | null> => {
    const root = getWorkspaceRoot();
    if (!root) {
      if (!quiet) {
        vscode.window.showWarningMessage('ProofCode requires an open workspace folder.');
      }
      return null;
    }

    const config = vscode.workspace.getConfiguration('proofcode');
    const runLiveTests = config.get<boolean>('runTestsOnVerify', false);
    const rulesFilePath = config.get<string>('rulesFilePath', '.proofcode/rules.md');

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'ProofCode: Verifying change impact and risks...',
        cancellable: false
      },
      async () => {
        try {
          const engine = new ProofCodeEngine(root);
          const report = await engine.verify({
            runLiveTests,
            rulesFilePath
          });

          latestReport = report;
          treeDataProvider.setReport(report);

          // Update Diagnostics in Problems panel
          diagnosticCollection.clear();
          const fileDiagnosticsMap = new Map<string, vscode.Diagnostic[]>();

          for (const risk of report.risks) {
            const lineIdx = Math.max(0, risk.line - 1);
            const colIdx = Math.max(0, (risk.column || 1) - 1);
            const range = new vscode.Range(lineIdx, colIdx, lineIdx, colIdx + 40);
            const severity =
