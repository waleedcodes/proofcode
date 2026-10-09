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
              risk.severity === 'HIGH'
                ? vscode.DiagnosticSeverity.Error
                : risk.severity === 'MEDIUM'
                ? vscode.DiagnosticSeverity.Warning
                : vscode.DiagnosticSeverity.Information;

            const diag = new vscode.Diagnostic(
              range,
              `[${risk.ruleId}] ${risk.title}: ${risk.description}`,
              severity
            );
            diag.source = 'ProofCode';
            diag.code = risk.ruleId;

            const list = fileDiagnosticsMap.get(risk.file) || [];
            list.push(diag);
            fileDiagnosticsMap.set(risk.file, list);
          }

          for (const rule of report.rules) {
            if (rule.status === 'VIOLATION' && rule.file) {
              const lineIdx = Math.max(0, (rule.line || 1) - 1);
              const range = new vscode.Range(lineIdx, 0, lineIdx, 40);
              const diag = new vscode.Diagnostic(
                range,
                `[${rule.rule.id}] Rule Violation: "${rule.rule.title}" - ${rule.detectedMessage || ''}`,
                vscode.DiagnosticSeverity.Error
              );
              diag.source = 'ProofCode';
              diag.code = rule.rule.id;

              const list = fileDiagnosticsMap.get(rule.file) || [];
              list.push(diag);
              fileDiagnosticsMap.set(rule.file, list);
            }
          }

          for (const [filePath, diags] of fileDiagnosticsMap.entries()) {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
            diagnosticCollection.set(vscode.Uri.file(fullPath), diags);
          }

          // Update CodeLens annotations
          codeLensProvider.setReport(report);

          // Update Status Bar
          const score = report.score.total;
          const risksCount = report.risks.length;
          const icon =
            report.verdict === 'READY_TO_SHIP'
              ? '$(pass)'
              : report.verdict === 'NEEDS_REVIEW'
              ? '$(warning)'
              : '$(error)';

          statusBarItem.text = `${icon} ProofCode: ${score}% (${risksCount} risks)`;
          statusBarItem.tooltip = `Verdict: ${report.verdict} | ${report.summary.filesChanged} files changed, ${report.summary.symbolsAffected} symbols affected.`;

          // If webview is open, refresh it
          if (ProofCodeWebviewPanel.currentPanel) {
            ProofCodeWebviewPanel.currentPanel.setReport(report);
          }

          if (!quiet) {
            if (report.verdict === 'READY_TO_SHIP') {
              vscode.window.showInformationMessage(
                `ProofCode: Verification Passed (${score}%). Ready to ship!`
              );
            } else if (report.verdict === 'NEEDS_REVIEW') {
              vscode.window.showWarningMessage(
                `ProofCode: Score ${score}%. ${report.summary.mediumRiskCount} warning(s) need review.`
              );
            } else {
              vscode.window.showErrorMessage(
                `ProofCode: BLOCKED (${score}%). ${report.summary.highRiskCount} high risk(s) or rule violations detected.`
              );
            }
          }

          return report;
        } catch (err: unknown) {
          vscode.window.showErrorMessage(
            `ProofCode Verification Error: ${(err as Error).message}`
          );
          return null;
        }
      }
    );
  };

  // Commands
  const verifyCmd = vscode.commands.registerCommand('proofcode.verifyChange', async () => {
    await runVerification(false);
  });

  const openDashboardCmd = vscode.commands.registerCommand('proofcode.openDashboard', async () => {
    if (!latestReport) {
      await runVerification(true);
    }

    const root = getWorkspaceRoot();
    ProofCodeWebviewPanel.createOrShow(
      context.extensionUri,
      latestReport,
      async () => {
        await runVerification(false);
      },
      async () => {
        if (root) {
          const rulesEngine = new ProjectRulesEngine(root);
          const createdPath = await rulesEngine.initDefaultRulesFile();
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(createdPath));
          await vscode.window.showTextDocument(doc);
        }
      }
    );
  });

  const initRulesCmd = vscode.commands.registerCommand('proofcode.initRules', async () => {
    const root = getWorkspaceRoot();
    if (!root) return;

