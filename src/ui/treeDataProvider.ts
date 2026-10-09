import * as path from 'node:path';
import * as vscode from 'vscode';
import { RiskFinding, RuleResult, VerificationReport } from '../types';

export class ProofCodeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue?: string,
    public readonly itemData?: unknown
  ) {
    super(label, collapsibleState);
  }
}

export class ProofCodeTreeDataProvider implements vscode.TreeDataProvider<ProofCodeTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ProofCodeTreeItem | undefined | null | void> =
    new vscode.EventEmitter<ProofCodeTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ProofCodeTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private currentReport: VerificationReport | null = null;

  public setReport(report: VerificationReport | null): void {
    this.currentReport = report;
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: ProofCodeTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: ProofCodeTreeItem): Promise<ProofCodeTreeItem[]> {
    if (!this.currentReport) {
      return [
        new ProofCodeTreeItem(
          'Run "ProofCode: Verify Current Changes" to inspect diff',
          vscode.TreeItemCollapsibleState.None
        )
      ];
    }

    const report = this.currentReport;

    if (!element) {
      // Root level items
      const scoreBadge =
        report.verdict === 'READY_TO_SHIP'
          ? '🟢 Ready to Ship'
          : report.verdict === 'NEEDS_REVIEW'
          ? '🟠 Needs Review'
          : '🔴 Blocked';

      const scoreItem = new ProofCodeTreeItem(
        `Verification Score: ${report.score.total}% (${scoreBadge})`,
        vscode.TreeItemCollapsibleState.None,
        'score'
      );
      scoreItem.iconPath = new vscode.ThemeIcon('shield');

      const filesItem = new ProofCodeTreeItem(
        `Changed Files (${report.summary.filesChanged})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'changed_files'
      );
      filesItem.iconPath = new vscode.ThemeIcon('files');

      const impactItem = new ProofCodeTreeItem(
        `Impact (${report.summary.symbolsAffected} symbols, ${report.summary.apiRoutesAffected} routes)`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'impact'
      );
      impactItem.iconPath = new vscode.ThemeIcon('zap');

      const totalRisks = report.risks.length;
      const risksItem = new ProofCodeTreeItem(
        `Risks & Evidence (${totalRisks})`,
        vscode.TreeItemCollapsibleState.Expanded,
        'risks'
      );
      risksItem.iconPath = new vscode.ThemeIcon(
        report.summary.highRiskCount > 0 ? 'error' : 'warning'
      );

      const rulesItem = new ProofCodeTreeItem(
        `Project Rules (${report.rules.filter((r) => r.status === 'PASS').length} PASS / ${
          report.rules.filter((r) => r.status === 'VIOLATION').length
        } Violations)`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'rules'
      );
      rulesItem.iconPath = new vscode.ThemeIcon('checklist');

      const checksItem = new ProofCodeTreeItem(
        `Checks & Tests (TS: ${report.checks.typescript.status})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'checks'
      );
      checksItem.iconPath = new vscode.ThemeIcon('beaker');
