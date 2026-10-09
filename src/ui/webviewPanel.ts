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

    .blast-symbol-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .symbol-glyph {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: rgba(0, 229, 153, 0.15);
      color: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      font-family: var(--mono-family);
    }

    .symbol-name-text {
      font-size: 14px;
      font-weight: 700;
      color: #FFFFFF;
      font-family: var(--mono-family);
    }

    .symbol-kind-tag {
      font-size: 10px;
      color: #94A3B8;
      background: rgba(255, 255, 255, 0.06);
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .blast-metrics {
      display: flex;
      gap: 8px;
    }

    .metric-chip {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.04);
      color: #CBD5E1;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .metric-chip.warn {
      background: var(--warning-bg);
      color: var(--warning);
      border-color: var(--warning);
      font-weight: 600;
    }

    .metric-chip.danger {
      background: var(--danger-bg);
      color: var(--danger);
      border-color: var(--danger);
      font-weight: 600;
    }

    .blast-tree-container {
      position: relative;
      padding-left: 20px;
      margin-left: 12px;
      border-left: 2px dashed rgba(0, 229, 153, 0.25);
    }

    .blast-caller-node {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 10px 14px;
      margin: 8px 0;
      transition: all 0.2s ease;
    }

    .blast-caller-node:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.12);
      transform: translateX(3px);
    }

    .blast-caller-node.untested {
      border-left: 3px solid var(--warning);
    }

    .blast-caller-node.tested {
      border-left: 3px solid var(--success);
    }

    .blast-caller-node::before {
      content: '';
      position: absolute;
      left: -20px;
      top: 50%;
      width: 18px;
      height: 2px;
      background: rgba(0, 229, 153, 0.25);
    }

    .caller-details {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .caller-icon {
      color: #94A3B8;
      font-size: 12px;
    }

    .caller-name {
      font-weight: 600;
      font-size: 13px;
      color: #F8FAFC;
      font-family: var(--mono-family);
    }

    .caller-file {
      font-size: 11px;
      color: #94A3B8;
      background: rgba(255, 255, 255, 0.04);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .tag-tested {
      font-size: 11px;
      color: var(--success);
      background: var(--success-bg);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .tag-untested {
      font-size: 11px;
      color: var(--warning);
      background: var(--warning-bg);
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .routes-section-card {
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 12px 16px;
      margin-top: 16px;
    }

    .route-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }

    .route-item-row:last-child {
      border-bottom: none;
    }

    .route-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.2);
      color: #60A5FA;
      margin-right: 8px;
    }

    /* Rules Table */
    .rules-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }

    .rules-table th, .rules-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid var(--card-border);
    }

    .rules-table th {
      color: var(--text-muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .empty-state {
      text-align: center;
      padding: 48px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>

  <header class="header">
    <div class="brand">
      <div class="brand-logo">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#000" stroke-width="2.5">
          <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      </div>
      <div>
        <h1 class="brand-title">ProofCode</h1>
        <div class="brand-tagline">AI writes code. ProofCode proves the change.</div>
      </div>
    </div>
    <div class="header-actions">
      <button id="btn-verify" class="btn btn-primary">
        ⚡ Run Verification
      </button>
      <button id="btn-export" class="btn btn-secondary">
        📄 Export Report
      </button>
      <button id="btn-init-rules" class="btn btn-secondary">
        📋 Edit Rules
      </button>
    </div>
  </header>

  <div class="top-grid">
    <div class="card score-card">
      <div class="metric-title">Verification Score</div>
      <div class="gauge-container">
        <svg class="gauge-circle" viewBox="0 0 140 140">
          <circle class="gauge-bg" cx="70" cy="70" r="60"/>
          <circle class="gauge-fill" cx="70" cy="70" r="60"/>
        </svg>
        <div class="gauge-value">${score}%</div>
      </div>
      <div class="verdict-badge">${verdictText}</div>
    </div>

    <div class="metrics-grid">
      <div class="metric-box">
        <div class="metric-title">Files Changed</div>
        <div class="metric-number">${summary.filesChanged}</div>
        <div class="metric-diff">+${summary.linesAdded} / -${summary.linesDeleted} lines</div>
      </div>
      <div class="metric-box">
        <div class="metric-title">Functions Affected</div>
        <div class="metric-number">${summary.symbolsAffected}</div>
        <div class="metric-diff">${summary.apiRoutesAffected} API routes</div>
      </div>
      <div class="metric-box">
        <div class="metric-title">Critical Risks</div>
        <div class="metric-number" style="color: ${summary.highRiskCount > 0 ? 'var(--danger)' : 'var(--success)'}">
          ${summary.highRiskCount}
        </div>
        <div class="metric-diff" style="color: var(--warning)">+${summary.mediumRiskCount} medium, ${summary.lowRiskCount} low</div>
      </div>
      <div class="metric-box">
        <div class="metric-title">Untested Callers</div>
        <div class="metric-number" style="color: ${(impact?.untestedCallersCount || 0) > 0 ? 'var(--warning)' : 'var(--success)'}">
          ${impact?.untestedCallersCount ?? 0}
        </div>
        <div class="metric-diff">${impact?.totalCallersCount ?? 0} total callers</div>
      </div>
    </div>
  </div>

  <nav class="tabs">
    <div class="tab active" data-tab="tab-risks" id="tab-btn-risks">
      Risks & Evidence <span class="tab-badge ${summary.highRiskCount > 0 ? 'danger' : ''}">${risks.length}</span>
    </div>
    <div class="tab" data-tab="tab-breakage" id="tab-btn-breakage">
      💥 What Could Break <span class="tab-badge ${breakage.some((b) => b.severity === 'HIGH') ? 'danger' : ''}">${breakage.length}</span>
    </div>
    <div class="tab" data-tab="tab-impact" id="tab-btn-impact">
      Impact Analysis <span class="tab-badge">${summary.symbolsAffected}</span>
    </div>
    <div class="tab" data-tab="tab-rules" id="tab-btn-rules">
      Project Rules <span class="tab-badge">${rules.length}</span>
    </div>
    <div class="tab" data-tab="tab-checks" id="tab-btn-checks">
      Tests & Checks
    </div>
  </nav>

  <!-- TAB 1: RISKS -->
  <section class="tab-pane active" id="tab-risks">
    ${
      risks.length === 0
        ? `<div class="card empty-state">
             <h3>✅ No Static Risks Detected</h3>
             <p style="margin-top: 8px;">No SQL injection, missing authorization, hardcoded secrets, or unhandled errors found in changed files.</p>
           </div>`
        : risks
            .map(
              (r) => `
        <div class="risk-card ${r.severity.toLowerCase()}">
          <div class="risk-header">
            <div class="risk-title-wrap">
              <span class="severity-tag ${r.severity.toLowerCase()}">${r.severity}</span>
              <span class="risk-title">${r.title}</span>
            </div>
            <button class="btn btn-secondary open-evidence-btn" data-file="${r.file}" data-line="${r.line}">
              🔍 Open Evidence (${path.basename(r.file)}:${r.line})
            </button>
          </div>
          <p style="color: #CBD5E1; margin-bottom: 8px;">${r.description}</p>
          
          ${
            r.evidenceTrace.length > 0
              ? `<div class="evidence-path"><strong>Evidence Trace:</strong>\n${r.evidenceTrace
                  .map((t, idx) => `  [Step ${idx + 1}] Line ${t.line}: ${t.description}`)
                  .join('\n')}`
              : ''
          }</div>

          ${
            r.snippet
              ? `<div class="code-preview"><code>${escapeHtml(r.snippet)}</code></div>`
              : ''
          }

          <div class="recommendation-box">
            <strong>Action:</strong> ${r.recommendation}
          </div>
        </div>
      `
            )
            .join('')
    }
  </section>

  <!-- TAB: WHAT COULD BREAK -->
  <section class="tab-pane" id="tab-breakage">
    ${
      breakage.length === 0
        ? `<div class="card empty-state">
             <h3>✅ No Regression Breakage Risks Detected</h3>
             <p style="margin-top: 8px;">No modified core services with untested dependents, critical route vulnerabilities, or rule breaches found.</p>
           </div>`
        : breakage
            .map(
              (b) => `
        <div class="risk-card ${b.severity.toLowerCase()}">
          <div class="risk-header">
            <div class="risk-title-wrap">
              <span class="severity-tag ${b.severity.toLowerCase()}">${b.severity}</span>
              <span class="risk-title">${b.area}: ${b.trigger}</span>
            </div>
            ${
              b.evidenceFile
                ? `<button class="btn btn-secondary open-evidence-btn" data-file="${b.evidenceFile}" data-line="${b.evidenceLine || 1}">
                    🔍 Open Evidence (${path.basename(b.evidenceFile)}:${b.evidenceLine || 1})
                  </button>`
                : ''
            }
          </div>
          <p style="color: #CBD5E1; margin-bottom: 8px;"><strong>Impact:</strong> ${b.detail}</p>
          ${
            b.affectedCallersOrRoutes.length > 0
              ? `<div style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
                   <strong>Dependents at risk:</strong> ${b.affectedCallersOrRoutes
                     .map(
                       (c) =>
                         `<code style="background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; margin-right: 4px; color: #93C5FD;">${c}</code>`
                     )
                     .join(' ')}
                 </div>`
              : ''
          }
        </div>
      `
            )
            .join('')
    }
  </section>

  <!-- TAB 2: IMPACT & VISUAL BLAST GRAPH -->
  <section class="tab-pane" id="tab-impact">
    ${
      !impact || impact.changedSymbols.length === 0
        ? `<div class="card empty-state"><h3>⚡ No exported symbols were modified.</h3></div>`
        : `
      <!-- Toolbar -->
      <div class="impact-toolbar">
        <div class="impact-search-box">
          <input type="text" id="impact-search" class="impact-search-input" placeholder="🔍 Search functions, callers, files..." />
        </div>
        <div class="impact-filter-pills">
          <button class="filter-pill active" data-filter="all">All Symbols (${impact.changedSymbols.length})</button>
          <button class="filter-pill danger" data-filter="untested">⚠️ Untested Callers (${impact.untestedCallersCount})</button>
          <button class="filter-pill" data-filter="routes">🌐 API Routes (${impact.affectedRoutes.length})</button>
        </div>
      </div>

      <!-- Symbols Blast Graph -->
      <div id="impact-symbols-container">
        ${impact.changedSymbols
          .map((sym) => {
            const untestedCallers = sym.callers.filter((c) => !c.hasTest);
            return `
          <div class="blast-symbol-card" data-symbol="${escapeHtml(sym.symbolName.toLowerCase())}" data-file="${escapeHtml(path.basename(sym.filePath).toLowerCase())}" data-untested="${untestedCallers.length}">
            <div class="blast-header">
              <div class="blast-symbol-info">
                <div class="symbol-glyph">ƒ</div>
                <div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="symbol-name-text">${escapeHtml(sym.symbolName)}</span>
                    <span class="symbol-kind-tag">${sym.kind}</span>
                    ${sym.isApiRoute ? '<span class="tag-tested" style="font-size: 9px;">API ROUTE</span>' : ''}
                  </div>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                    in <code>${escapeHtml(path.relative(report?.repoRoot || '', sym.filePath))}</code>
                  </div>
                </div>
              </div>
              <div class="blast-metrics">
                <span class="metric-chip">${sym.callers.length} Callers</span>
                <span class="metric-chip ${untestedCallers.length > 0 ? 'warn' : ''}">${untestedCallers.length} Untested</span>
                <button class="btn btn-secondary open-evidence-btn" style="padding: 4px 10px; font-size: 11px;" data-file="${escapeHtml(sym.filePath)}" data-line="1">
                  View Definition
                </button>
              </div>
            </div>

            <!-- Downstream Tree Branches -->
            ${
              sym.callers.length === 0
                ? `<div style="padding: 8px 12px; color: var(--text-muted); font-size: 11px; font-style: italic;">
                     No downstream callers detected in repository (leaf module or top-level entrypoint).
                   </div>`
                : `
                <div class="blast-tree-container">
                  ${sym.callers
                    .map(
                      (c) => `
                    <div class="blast-caller-node ${c.hasTest ? 'tested' : 'untested'}" data-caller="${escapeHtml(c.callerName.toLowerCase())}" data-tested="${c.hasTest ? 'true' : 'false'}">
                      <div class="caller-details">
                        <span class="caller-icon">↳</span>
                        <span class="caller-name">${escapeHtml(c.callerName)}</span>
                        <span class="caller-file">${escapeHtml(path.basename(c.filePath))}:${c.line}</span>
                        ${
                          c.hasTest
                            ? `<span class="tag-tested">✓ Test Covered</span>`
                            : `<span class="tag-untested">⚠️ Untested Caller</span>`
                        }
                      </div>
                      <button class="btn btn-secondary open-evidence-btn" style="padding: 3px 8px; font-size: 11px;" data-file="${escapeHtml(c.filePath)}" data-line="${c.line}">
                        Open Caller
                      </button>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              `
            }
          </div>
        `;
          })
          .join('')}
      </div>

      <!-- Connected API Routes Section -->
      ${
        impact.affectedRoutes.length > 0
          ? `
        <div class="routes-section-card">
          <div style="font-weight: 700; font-size: 13px; color: #FFFFFF; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span>🌐</span> Directly Affected API Endpoints (${impact.affectedRoutes.length})
          </div>
          ${impact.affectedRoutes
            .map(
              (r) => `
            <div class="route-item-row">
              <div>
                <span class="route-badge">${escapeHtml(r.method)}</span>
                <strong style="color: #F8FAFC; font-family: var(--mono-family); font-size: 12px;">${escapeHtml(r.routePath)}</strong>
                <span style="color: var(--text-muted); font-size: 11px; margin-left: 8px;">(${escapeHtml(path.basename(r.filePath))}:${r.line})</span>
              </div>
              <button class="btn btn-secondary open-evidence-btn" style="padding: 3px 8px; font-size: 11px;" data-file="${escapeHtml(r.filePath)}" data-line="${r.line}">
                Open Route
              </button>
            </div>
          `
            )
            .join('')}
        </div>
      `
          : ''
      }
    `
    }
  </section>

  <!-- TAB 3: RULES -->
  <section class="tab-pane" id="tab-rules">
    <div class="card">
      <table class="rules-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Project Rule</th>
            <th>Evidence / Details</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${
            rules.length === 0
              ? '<tr><td colspan="4" style="text-align: center;">No rules defined. Click "Edit Rules" to create .proofcode/rules.md.</td></tr>'
              : rules
                  .map(
                    (r) => `
            <tr>
              <td>
                <span class="severity-tag ${r.status === 'PASS' ? 'low' : r.status === 'VIOLATION' ? 'high' : 'medium'}">
                  ${r.status}
                </span>
              </td>
              <td>
                <strong>${r.rule.title}</strong>
                <div style="font-size: 11px; color: var(--text-muted);">${r.rule.description}</div>
              </td>
              <td style="color: ${r.status === 'VIOLATION' ? 'var(--danger)' : '#CBD5E1'};">
                ${r.detectedMessage || 'Compliant with policy.'}
              </td>
              <td>
                ${
                  r.file && r.line
                    ? `<button class="btn btn-secondary open-evidence-btn" data-file="${r.file}" data-line="${r.line}">View Code</button>`
                    : '<span style="color: var(--text-muted);">—</span>'
                }
              </td>
            </tr>
          `
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
  </section>

  <!-- TAB 4: CHECKS -->
  <section class="tab-pane" id="tab-checks">
    <div class="card">
      <table class="rules-table">
        <thead>
          <tr>
            <th>Check Name</th>
            <th>Status</th>
            <th>Details</th>
