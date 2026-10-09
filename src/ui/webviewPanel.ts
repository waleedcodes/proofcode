import * as path from 'node:path';
import * as vscode from 'vscode';
import { VerificationReport } from '../types';

export class ProofCodeWebviewPanel {
  public static currentPanel: ProofCodeWebviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _report: VerificationReport | null = null;
  private _onVerifyRequested: (() => Promise<void>) | null = null;
  private _onInitRulesRequested: (() => Promise<void>) | null = null;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'verify':
            if (this._onVerifyRequested) {
              await this._onVerifyRequested();
            }
            break;
          case 'openEvidence':
            if (message.file && message.line) {
              await this.openFileAtLine(message.file, message.line);
            }
            break;
          case 'initRules':
            if (this._onInitRulesRequested) {
              await this._onInitRulesRequested();
            }
            break;
          case 'exportMarkdown':
            await vscode.commands.executeCommand('proofcode.exportReport');
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public getExtensionUri(): vscode.Uri {
    return this._extensionUri;
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    report: VerificationReport | null,
    onVerify: () => Promise<void>,
    onInitRules: () => Promise<void>
  ): ProofCodeWebviewPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ProofCodeWebviewPanel.currentPanel) {
      ProofCodeWebviewPanel.currentPanel._panel.reveal(column);
      ProofCodeWebviewPanel.currentPanel.setReport(report);
      ProofCodeWebviewPanel.currentPanel._onVerifyRequested = onVerify;
      ProofCodeWebviewPanel.currentPanel._onInitRulesRequested = onInitRules;
      return ProofCodeWebviewPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'proofcodeDashboard',
      'ProofCode Verification',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')]
      }
    );

    ProofCodeWebviewPanel.currentPanel = new ProofCodeWebviewPanel(panel, extensionUri);
    ProofCodeWebviewPanel.currentPanel._onVerifyRequested = onVerify;
    ProofCodeWebviewPanel.currentPanel._onInitRulesRequested = onInitRules;
    ProofCodeWebviewPanel.currentPanel.setReport(report);

    return ProofCodeWebviewPanel.currentPanel;
  }

  public setReport(report: VerificationReport | null): void {
    this._report = report;
    this._panel.webview.html = this._getHtmlForWebview(report);
  }

  private async openFileAtLine(filePath: string, line: number): Promise<void> {
    try {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(this._report?.repoRoot || '', filePath);
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
      const editor = await vscode.window.showTextDocument(doc);
      const position = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
    } catch (err: unknown) {
      vscode.window.showErrorMessage(`Failed to open evidence file: ${(err as Error).message}`);
    }
  }

  public dispose(): void {
    ProofCodeWebviewPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview(report: VerificationReport | null): string {
    const score = report?.score.total ?? 0;
    const verdict = report?.verdict ?? 'NEEDS_REVIEW';
    const verdictText =
      verdict === 'READY_TO_SHIP'
        ? 'READY TO SHIP'
        : verdict === 'NEEDS_REVIEW'
        ? 'NEEDS REVIEW'
        : 'BLOCKED';

    const verdictColor =
      verdict === 'READY_TO_SHIP'
        ? '#10B981'
        : verdict === 'NEEDS_REVIEW'
        ? '#F59E0B'
        : '#EF4444';

    const summary = report?.summary ?? {
      filesChanged: 0,
      linesAdded: 0,
      linesDeleted: 0,
      symbolsAffected: 0,
      apiRoutesAffected: 0,
      testsAdded: 0,
      testsAffected: 0,
      highRiskCount: 0,
      mediumRiskCount: 0,
      lowRiskCount: 0
    };

    const risks = report?.risks ?? [];
    const impact = report?.impact;
    const rules = report?.rules ?? [];
    const checks = report?.checks;
    const breakage = report?.breakageRisks ?? [];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ProofCode Change Verification</title>
  <style>
    :root {
      --bg: #090D16;
      --card-bg: rgba(22, 29, 44, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent: #00E599;
      --accent-glow: rgba(0, 229, 153, 0.25);
      --danger: #EF4444;
      --danger-bg: rgba(239, 68, 68, 0.12);
      --warning: #F59E0B;
      --warning-bg: rgba(245, 158, 11, 0.12);
      --success: #10B981;
      --success-bg: rgba(16, 185, 129, 0.12);
      --text: #F1F5F9;
      --text-muted: #94A3B8;
      --code-bg: #030712;
      --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      --mono-family: 'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-family);
      font-size: 13px;
      line-height: 1.5;
      padding: 24px;
      overflow-x: hidden;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #00E599 0%, #0070F3 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 15px var(--accent-glow);
    }

    .brand-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #FFFFFF;
    }

    .brand-tagline {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .header-actions {
      display: flex;
      gap: 10px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease-in-out;
    }

    .btn-primary {
      background: var(--accent);
      color: #030712;
      box-shadow: 0 2px 8px var(--accent-glow);
    }

    .btn-primary:hover {
      background: #00FFAC;
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border-color: var(--card-border);
      color: var(--text);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Top Grid */
    .top-grid {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }

    /* Verification Score Card */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      backdrop-filter: blur(12px);
    }

    .score-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .gauge-container {
      position: relative;
      width: 140px;
      height: 140px;
      margin: 12px 0;
    }

    .gauge-circle {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .gauge-bg {
      fill: none;
      stroke: rgba(255, 255, 255, 0.08);
      stroke-width: 10;
    }

    .gauge-fill {
      fill: none;
      stroke: ${verdictColor};
