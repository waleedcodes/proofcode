import * as readline from 'node:readline';
import { ProofCodeEngine, VerifyOptions } from '../engine/proofCodeEngine';
import { AutoFixEngine } from '../fixer/autoFixEngine';
import { VerificationReport } from '../types';

export interface TerminalDashboardOptions extends VerifyOptions {
  interactive?: boolean;
}

export type DashboardTab = 'overview' | 'risks' | 'blast' | 'fix';

export class TerminalDashboard {
  private engine: ProofCodeEngine;
  private options: TerminalDashboardOptions;
  private currentTab: DashboardTab = 'overview';
  private selectedRiskIndex = 0;
  private latestReport: VerificationReport | null = null;
  private statusMessage = '';
  private isRunning = false;

  constructor(engine: ProofCodeEngine, options: TerminalDashboardOptions = {}) {
    this.engine = engine;
    this.options = options;
  }

  /**
   * Renders a single frame of the dashboard as a string (useful for testing and static runs).
   */
  public static renderFrame(
    report: VerificationReport,
    tab: DashboardTab = 'overview',
    selectedRiskIndex = 0,
    statusMessage = ''
  ): string {
    const isReady = report.verdict === 'READY_TO_SHIP';
    const isReview = report.verdict === 'NEEDS_REVIEW';

    const colorReset = '\x1b[0m';
    const colorBold = '\x1b[1m';
    const colorDim = '\x1b[2m';
    const colorRed = '\x1b[31m';
    const colorGreen = '\x1b[32m';
    const colorYellow = '\x1b[33m';
    const colorCyan = '\x1b[36m';
    const colorMagenta = '\x1b[35m';
    const bgSelected = '\x1b[7m';

    const scoreColor = isReady ? colorGreen : isReview ? colorYellow : colorRed;
    const verdictIcon = isReady ? '✅ READY TO SHIP' : isReview ? '⚠️  NEEDS REVIEW' : '❌ BLOCKED';

    // 1. Build Score Bar (40 characters wide)
    const scoreVal = Math.max(0, Math.min(100, report.score.total));
    const filledLength = Math.round((scoreVal / 100) * 40);
    const emptyLength = 40 - filledLength;
    const scoreBar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);

    const out: string[] = [];

    // Header
    out.push(`${colorCyan}${colorBold}========================================================================================${colorReset}`);
    out.push(`  🛡️  ${colorBold}PROOFCODE VERIFICATION DASHBOARD${colorReset}  ${colorDim}|  AI Code Change Verification${colorReset}`);
    out.push(`  ${colorDim}Branch:${colorReset} ${colorBold}${report.branch || 'HEAD'}${colorReset}  ${colorDim}|  Workspace:${colorReset} ${report.repoRoot}  ${colorDim}|  Verdict:${colorReset} ${scoreColor}${colorBold}${verdictIcon}${colorReset}`);
    out.push(`${colorCyan}${colorBold}========================================================================================${colorReset}`);

    // Score Meter
    const testStatus = report.checks?.unitTests
      ? report.checks.unitTests.status === 'PASS'
        ? `${colorGreen}PASS${colorReset}`
        : `${colorRed}${report.checks.unitTests.status}${colorReset}`
      : 'N/A';
    out.push(`  ${colorBold}HEALTH SCORE:${colorReset} ${scoreColor}[${scoreBar}] ${colorBold}${scoreVal}%${colorReset}  ${colorDim}(Files: ${report.summary.filesChanged} | Functions: ${report.summary.symbolsAffected} | API: ${report.summary.apiRoutesAffected})${colorReset}`);
    out.push(`  ${colorDim}Risks:${colorReset} ${colorRed}🔴 ${report.summary.highRiskCount} High${colorReset}  ${colorYellow}🟠 ${report.summary.mediumRiskCount} Med${colorReset}  ${colorGreen}🟢 ${report.summary.lowRiskCount} Low${colorReset}  ${colorDim}| Live Tests: ${testStatus}${colorReset}`);
    out.push(`${colorDim}----------------------------------------------------------------------------------------${colorReset}`);

    // Tab Bar
    const tabOverview = tab === 'overview' ? `${colorCyan}${colorBold}[ 1. OVERVIEW ]${colorReset}` : `  1. Overview  `;
    const tabRisks = tab === 'risks' ? `${colorCyan}${colorBold}[ 2. RISKS (${report.risks.length}) ]${colorReset}` : `  2. Risks (${report.risks.length})  `;
    const tabBlast = tab === 'blast' ? `${colorCyan}${colorBold}[ 3. BLAST RADIUS ]${colorReset}` : `  3. Blast Radius  `;
    const tabFix = tab === 'fix' ? `${colorCyan}${colorBold}[ 4. AUTO-FIX ]${colorReset}` : `  4. Auto-Fix  `;

    out.push(`  TABS: ${tabOverview}   ${tabRisks}   ${tabBlast}   ${tabFix}`);
    out.push(`${colorCyan}${colorBold}----------------------------------------------------------------------------------------${colorReset}`);

    // Tab Content
    if (tab === 'overview') {
      out.push(`  ${colorBold}📊 SUMMARY OF VERIFICATION METRICS:${colorReset}`);
      out.push(`  • Changed Files:       ${report.summary.filesChanged}`);
      out.push(`  • Additions/Deletions: +${report.summary.linesAdded} / -${report.summary.linesDeleted} lines`);
      out.push(`  • Downstream Callers:  ${report.impact.affectedCallers.length} caller(s) mapped in call graph`);
      out.push(`  • Exposed API Routes:  ${report.impact.affectedRoutes.length} endpoint(s) impacted`);
      out.push(`  • Rule Status:         ${report.rules.filter((r) => r.status === 'PASS').length} Passed, ${report.rules.filter((r) => r.status === 'VIOLATION').length} Violations`);
      out.push('');

      if (report.breakageRisks && report.breakageRisks.length > 0) {
        out.push(`  ${colorBold}💥 WHAT COULD THIS CHANGE BREAK?${colorReset}`);
        for (const b of report.breakageRisks.slice(0, 4)) {
          const sevColor = b.severity === 'HIGH' ? colorRed : b.severity === 'MEDIUM' ? colorYellow : colorGreen;
          out.push(`  ${sevColor}[${b.severity}]${colorReset} ${colorBold}${b.area}:${colorReset} ${b.trigger}`);
          if (b.affectedCallersOrRoutes.length > 0) {
            out.push(`     ${colorDim}Affected: ${b.affectedCallersOrRoutes.slice(0, 3).join(', ')}${colorReset}`);
          }
        }
      } else {
        out.push(`  ${colorGreen}✅ Zero breakage risks identified in current changes.${colorReset}`);
      }
    } else if (tab === 'risks') {
      if (report.risks.length === 0) {
        out.push(`  ${colorGreen}✅ No risk findings detected! Your code change passed all static and AST checks.${colorReset}`);
      } else {
        out.push(`  ${colorBold}CRITICAL FINDINGS (${report.risks.length} total) - Use [↑/↓] to inspect:${colorReset}`);
        const visibleRisks = report.risks.slice(0, 6);
        visibleRisks.forEach((r, idx) => {
          const isSelected = idx === selectedRiskIndex;
          const sevColor = r.severity === 'HIGH' ? colorRed : r.severity === 'MEDIUM' ? colorYellow : colorGreen;
          const prefix = isSelected ? `${colorCyan}${colorBold}❯${colorReset} ` : '  ';
          const line = `${prefix}${sevColor}[${r.severity}]${colorReset} ${colorBold}${r.ruleId}:${colorReset} ${r.title} ${colorDim}(${r.file}:${r.line})${colorReset}`;
          out.push(isSelected ? `${bgSelected}${line}${colorReset}` : line);
        });

        const activeRisk = report.risks[selectedRiskIndex] || report.risks[0];
        if (activeRisk) {
          out.push('');
          out.push(`  ${colorBold}🔍 DETAILED INSPECTION [${activeRisk.ruleId}]:${colorReset}`);
          out.push(`  ${colorDim}Description:${colorReset} ${activeRisk.description}`);
          if (activeRisk.snippet) {
            out.push(`  ${colorDim}Code Snippet:${colorReset}`);
            out.push(`    ${colorYellow}${activeRisk.snippet.replace(/\n/g, '\n    ')}${colorReset}`);
          }
          if (activeRisk.recommendation) {
            out.push(`  ${colorGreen}${colorBold}Remediation:${colorReset} ${activeRisk.recommendation}`);
          }
        }
      }
    } else if (tab === 'blast') {
      out.push(`  ${colorBold}💥 BLAST RADIUS & CALL GRAPH DEPENDENCIES:${colorReset}`);
      if (report.impact.affectedCallers.length === 0 && report.impact.affectedRoutes.length === 0) {
        out.push(`  ${colorDim}No downstream callers or API routes affected by modified symbols.${colorReset}`);
      } else {
        if (report.impact.affectedCallers.length > 0) {
          out.push(`  ${colorCyan}${colorBold}Dependent Callers / Functions:${colorReset}`);
          for (const f of report.impact.affectedCallers.slice(0, 5)) {
            out.push(`    • ${f.callerName} ${colorDim}(in ${f.filePath}:${f.line})${colorReset}`);
          }
        }
        if (report.impact.affectedRoutes.length > 0) {
          out.push(`  ${colorMagenta}${colorBold}Impacted API Routes:${colorReset}`);
          for (const route of report.impact.affectedRoutes.slice(0, 5)) {
            out.push(`    • ${route.method} ${route.routePath} ${colorDim}(${route.filePath})${colorReset}`);
          }
        }
      }
    } else if (tab === 'fix') {
      const fixableRisks = report.risks.filter((r) => AutoFixEngine.isRuleFixable(r.ruleId));
      out.push(`  ${colorBold}🛠️ ONE-COMMAND AUTO-FIX ENGINE (proofcode fix):${colorReset}`);
      if (fixableRisks.length === 0) {
        out.push(`  ${colorGreen}✅ Zero auto-fixable issues detected. Everything clean!${colorReset}`);
      } else {
        out.push(`  Found ${colorBold}${fixableRisks.length}${colorReset} automatically healable issues across your changes:`);
        for (const f of fixableRisks) {
          out.push(`    ${colorGreen}✔${colorReset} ${colorBold}${f.ruleId}:${colorReset} ${f.title} ${colorDim}(${f.file}:${f.line})${colorReset}`);
        }
        out.push('');
        out.push(`  ${colorCyan}${colorBold}Press [f] now to automatically apply all ${fixableRisks.length} fixes on disk!${colorReset}`);
      }
    }

    // Status Message / Notification
    out.push('');
    if (statusMessage) {
      out.push(`  ${colorYellow}${colorBold}🔔 ${statusMessage}${colorReset}`);
    } else {
      out.push(`  ${colorDim}Press [r] to re-verify working tree live | [f] to auto-fix | [q] to exit${colorReset}`);
    }

    // Footer
    out.push(`${colorCyan}${colorBold}========================================================================================${colorReset}`);
    out.push(`  ${colorBold}[1-4 / Tab]${colorReset} Switch Tabs  ${colorBold}[↑/↓]${colorReset} Select Risk  ${colorBold}[r]${colorReset} Re-verify  ${colorBold}[f]${colorReset} Auto-Fix  ${colorBold}[q/ESC]${colorReset} Exit`);
    out.push(`${colorCyan}${colorBold}========================================================================================${colorReset}`);

    return out.join('\n');
  }

  /**
   * Starts the interactive dashboard loop in terminal.
   */
  public async start(): Promise<void> {
    this.latestReport = await this.engine.verify(this.options);
    this.isRunning = true;

    // Check if terminal supports interactive raw mode
    if (!process.stdin.isTTY || !this.options.interactive) {
      console.log(
        TerminalDashboard.renderFrame(
          this.latestReport,
          this.currentTab,
          this.selectedRiskIndex,
          this.statusMessage
        )
      );
      return;
    }

    // Configure raw mode
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    // Hide cursor & enter alternate screen buffer
    process.stdout.write('\x1b[?1049h\x1b[?25l');

    this.render();

    const onKeypress = async (str: string, key: readline.Key) => {
      if (!this.isRunning) return;

      // Exit controls: q, Q, Ctrl+C, or Escape
      if (
        str === 'q' ||
        str === 'Q' ||
        (key.ctrl && key.name === 'c') ||
        key.name === 'escape'
      ) {
        this.stop();
        return;
      }

      // Tab switching: 1, 2, 3, 4, Tab, Left, Right
      if (str === '1') {
        this.currentTab = 'overview';
        this.statusMessage = '';
        this.render();
      } else if (str === '2') {
        this.currentTab = 'risks';
        this.statusMessage = '';
        this.render();
      } else if (str === '3') {
        this.currentTab = 'blast';
        this.statusMessage = '';
        this.render();
      } else if (str === '4') {
        this.currentTab = 'fix';
        this.statusMessage = '';
        this.render();
      } else if (key.name === 'tab' || key.name === 'right') {
        const tabs: DashboardTab[] = ['overview', 'risks', 'blast', 'fix'];
        const currentIdx = tabs.indexOf(this.currentTab);
        this.currentTab = tabs[(currentIdx + 1) % tabs.length];
        this.statusMessage = '';
        this.render();
      } else if (key.name === 'left') {
        const tabs: DashboardTab[] = ['overview', 'risks', 'blast', 'fix'];
        const currentIdx = tabs.indexOf(this.currentTab);
        this.currentTab = tabs[(currentIdx - 1 + tabs.length) % tabs.length];
        this.statusMessage = '';
        this.render();
      }

      // Risk list navigation: Up & Down
      if (this.currentTab === 'risks' && this.latestReport && this.latestReport.risks.length > 0) {
        if (key.name === 'up') {
          this.selectedRiskIndex = Math.max(0, this.selectedRiskIndex - 1);
          this.render();
        } else if (key.name === 'down') {
          this.selectedRiskIndex = Math.min(
            this.latestReport.risks.length - 1,
            this.selectedRiskIndex + 1
          );
          this.render();
        }
      }

      // Re-verify action: 'r' or 'R'
      if (str === 'r' || str === 'R') {
        this.statusMessage = '🔄 Re-verifying workspace against Git diff...';
        this.render();
        try {
          this.latestReport = await this.engine.verify(this.options);
          this.statusMessage = `✅ Re-verified at ${new Date().toLocaleTimeString()} (Score: ${this.latestReport.score.total}%)`;
          this.selectedRiskIndex = Math.min(
            this.selectedRiskIndex,
            Math.max(0, this.latestReport.risks.length - 1)
          );
        } catch (err: unknown) {
          this.statusMessage = `❌ Re-verification error: ${(err as Error).message}`;
        }
        this.render();
      }

      // Auto-fix action: 'f' or 'F'
      if (str === 'f' || str === 'F') {
        if (!this.latestReport || this.latestReport.risks.length === 0) {
          this.statusMessage = 'ℹ️ No risks to auto-fix.';
          this.render();
          return;
        }

        this.statusMessage = '🛠️ Applying automated fixes across workspace...';
        this.render();

        try {
          const fixSummary = await this.engine.fix({
            staged: this.options.staged
          });
          // Re-verify after applying fixes
          this.latestReport = await this.engine.verify(this.options);
          this.statusMessage = `✨ Auto-fix applied: ${fixSummary.totalFixesApplied} fix(es) in ${fixSummary.filesModified} file(s)! New Score: ${this.latestReport.score.total}%`;
          this.currentTab = 'overview';
        } catch (err: unknown) {
          this.statusMessage = `❌ Auto-fix error: ${(err as Error).message}`;
        }
        this.render();
      }
    };

    process.stdin.on('keypress', onKeypress);
  }

  public render(): void {
    if (!this.latestReport) return;
    // Clear terminal screen and move cursor to top-left
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    const output = TerminalDashboard.renderFrame(
      this.latestReport,
      this.currentTab,
      this.selectedRiskIndex,
      this.statusMessage
    );
    process.stdout.write(output + '\n');
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    try {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }
      // Leave alternate screen buffer & show cursor
      process.stdout.write('\x1b[?1049l\x1b[?25h');
    } catch {
      // Ignore exit stream errors
    }
    process.exit(0);
  }
}
