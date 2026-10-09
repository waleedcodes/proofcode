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
      stroke-width: 10;
      stroke-linecap: round;
      stroke-dasharray: 377;
      stroke-dashoffset: ${377 - (377 * score) / 100};
      transition: stroke-dashoffset 0.8s ease-out;
    }

    .gauge-value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 32px;
      font-weight: 800;
      color: #FFFFFF;
    }

    .verdict-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      background: ${verdictColor}22;
      color: ${verdictColor};
      border: 1px solid ${verdictColor}55;
      margin-top: 8px;
    }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
    }

    .metric-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 14px;
      transition: all 0.2s ease;
    }

    .metric-box:hover {
      border-color: rgba(255, 255, 255, 0.15);
      background: rgba(255, 255, 255, 0.04);
    }

    .metric-title {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .metric-number {
      font-size: 24px;
      font-weight: 700;
      color: #FFFFFF;
    }

    .metric-diff {
      font-size: 11px;
      color: var(--accent);
      margin-top: 4px;
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 20px;
    }

    .tab {
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
    }

    .tab:hover {
      color: #FFFFFF;
    }

    .tab.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    .tab-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      margin-left: 6px;
      background: rgba(255, 255, 255, 0.1);
    }

    .tab-badge.danger {
      background: var(--danger-bg);
      color: var(--danger);
    }

    /* Tab Content */
    .tab-pane {
      display: none;
    }

    .tab-pane.active {
      display: block;
    }

    /* Risk Cards */
    .risk-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 14px;
      transition: border-color 0.15s ease;
    }

    .risk-card.high {
      border-left: 4px solid var(--danger);
    }

    .risk-card.medium {
      border-left: 4px solid var(--warning);
    }

    .risk-card.low {
      border-left: 4px solid var(--success);
    }

    .risk-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .risk-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .severity-tag {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .severity-tag.high {
      background: var(--danger-bg);
      color: var(--danger);
      border: 1px solid var(--danger);
    }

    .severity-tag.medium {
      background: var(--warning-bg);
      color: var(--warning);
      border: 1px solid var(--warning);
    }

    .severity-tag.low {
      background: var(--success-bg);
      color: var(--success);
      border: 1px solid var(--success);
    }

    .risk-title {
      font-size: 14px;
      font-weight: 600;
      color: #FFFFFF;
    }

    .evidence-path {
      background: var(--code-bg);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 12px;
      margin: 10px 0;
      font-family: var(--mono-family);
      font-size: 11px;
      color: #CBD5E1;
      white-space: pre-wrap;
    }

    .evidence-step {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }

    .evidence-step:not(:last-child)::after {
      content: '↓';
      color: var(--accent);
      margin-left: 4px;
    }

    .code-preview {
      background: #0D1117;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      padding: 10px;
      margin: 10px 0;
      font-family: var(--mono-family);
      font-size: 11px;
      color: #E2E8F0;
      overflow-x: auto;
    }

    .recommendation-box {
      font-size: 12px;
      color: #94A3B8;
      background: rgba(255, 255, 255, 0.02);
      padding: 8px 12px;
      border-radius: 6px;
      border-left: 2px solid var(--accent);
    }

    /* Interactive Impact Blast Graph */
    .impact-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 16px;
    }

    .impact-search-box {
      flex: 1;
      min-width: 200px;
    }

    .impact-search-input {
      width: 100%;
      background: rgba(3, 7, 18, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      padding: 7px 12px;
      color: #F1F5F9;
      font-size: 12px;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .impact-search-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-glow);
    }

    .impact-filter-pills {
      display: flex;
      gap: 6px;
    }

    .filter-pill {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #94A3B8;
      border-radius: 20px;
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .filter-pill:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #FFFFFF;
    }

    .filter-pill.active {
      background: rgba(0, 229, 153, 0.15);
      border-color: var(--accent);
      color: var(--accent);
      font-weight: 600;
    }

    .filter-pill.danger.active {
      background: var(--danger-bg);
      border-color: var(--danger);
      color: var(--danger);
    }

    .blast-symbol-card {
      background: linear-gradient(135deg, rgba(22, 29, 44, 0.75), rgba(15, 23, 42, 0.85));
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      transition: border-color 0.2s ease;
    }

    .blast-symbol-card:hover {
      border-color: rgba(0, 229, 153, 0.3);
    }

    .blast-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
