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

      const items = [scoreItem, filesItem, impactItem];

      if (report.breakageRisks && report.breakageRisks.length > 0) {
        const breakageItem = new ProofCodeTreeItem(
          `What Could Break (${report.breakageRisks.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          'breakage'
        );
        breakageItem.iconPath = new vscode.ThemeIcon('flame');
        items.push(breakageItem);
      }

      items.push(risksItem, rulesItem, checksItem);
      return items;
    }

    // Children of Changed Files
    if (element.contextValue === 'changed_files') {
      return report.impact.changedFiles.map((file) => {
        const baseName = path.basename(file);
        const item = new ProofCodeTreeItem(baseName, vscode.TreeItemCollapsibleState.None);
        item.description = path.relative(report.repoRoot, file);
        item.iconPath = new vscode.ThemeIcon('file-code');
        item.command = {
          command: 'vscode.open',
          title: 'Open File',
          arguments: [vscode.Uri.file(file)]
        };
        return item;
      });
    }

    // Children of Impact
    if (element.contextValue === 'impact') {
      const items: ProofCodeTreeItem[] = [];

      for (const sym of report.impact.changedSymbols) {
        const item = new ProofCodeTreeItem(
          `${sym.symbolName} (${sym.callers.length} callers)`,
          vscode.TreeItemCollapsibleState.None
        );
        item.description = path.basename(sym.filePath);
        item.iconPath = new vscode.ThemeIcon('symbol-function');
        items.push(item);
      }

      for (const route of report.impact.affectedRoutes) {
        const item = new ProofCodeTreeItem(
          `${route.method} ${path.basename(route.routePath)}`,
          vscode.TreeItemCollapsibleState.None
        );
        item.description = 'API Route';
        item.iconPath = new vscode.ThemeIcon('globe');
        items.push(item);
      }

      if (items.length === 0) {
        return [
          new ProofCodeTreeItem('No external impact detected', vscode.TreeItemCollapsibleState.None)
        ];
      }

      return items;
    }

    // Children of What Could Break
    if (element.contextValue === 'breakage') {
      return (report.breakageRisks || []).map((b) => {
        const item = new ProofCodeTreeItem(
          `[${b.severity}] ${b.area}: ${b.trigger}`,
          vscode.TreeItemCollapsibleState.None
        );
        item.description = b.detail;
        item.tooltip = `${b.detail}\nDependents: ${b.affectedCallersOrRoutes.join(', ')}`;
        item.iconPath = new vscode.ThemeIcon(
          b.severity === 'HIGH' ? 'error' : b.severity === 'MEDIUM' ? 'warning' : 'info'
        );
        if (b.evidenceFile) {
          item.command = {
            command: 'proofcode.openEvidence',
            title: 'Open Evidence',
            arguments: [b.evidenceFile, b.evidenceLine || 1]
          };
        }
        return item;
      });
    }

    // Children of Risks
    if (element.contextValue === 'risks') {
      if (report.risks.length === 0) {
        const item = new ProofCodeTreeItem(
          '✓ No static risks detected in changes',
          vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon('pass');
        return [item];
      }

      return report.risks.map((risk: RiskFinding) => {
        const icon =
          risk.severity === 'HIGH'
            ? 'error'
            : risk.severity === 'MEDIUM'
            ? 'warning'
            : 'info';

        const item = new ProofCodeTreeItem(
          `[${risk.severity}] ${risk.title}`,
          vscode.TreeItemCollapsibleState.None,
          'risk_item',
          risk
        );
