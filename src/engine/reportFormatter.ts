import { VerificationReport } from '../types';

export class ReportFormatter {
  /**
   * Formats the verification report into clean GitHub Flavored Markdown
   */
  public static toMarkdown(report: VerificationReport): string {
    const verdictBadge =
      report.verdict === 'READY_TO_SHIP'
        ? '🟢 **READY TO SHIP**'
        : report.verdict === 'NEEDS_REVIEW'
        ? '🟠 **NEEDS REVIEW**'
        : '🔴 **BLOCKED**';

    let md = `# 🛡️ ProofCode Verification Report\n\n`;
    md += `> **AI writes code. ProofCode proves the change.**\n\n`;
    md += `- **Verdict:** ${verdictBadge}\n`;
    md += `- **Verification Score:** **${report.score.total}%**\n`;
    md += `- **Branch:** \`${report.branch || 'HEAD'}\`\n`;
    md += `- **Timestamp:** \`${report.timestamp}\`\n\n`;

    md += `## 📊 Change Summary\n\n`;
    md += `| Metric | Count |\n`;
    md += `|---|---|\n`;
    md += `| Files Changed | **${report.summary.filesChanged}** |\n`;
    md += `| Lines Added | +${report.summary.linesAdded} |\n`;
    md += `| Lines Deleted | -${report.summary.linesDeleted} |\n`;
    md += `| Functions Affected | **${report.summary.symbolsAffected}** |\n`;
    md += `| API Routes Affected | **${report.summary.apiRoutesAffected}** |\n`;
    md += `| High Risks Detected | 🔴 **${report.summary.highRiskCount}** |\n`;
    md += `| Medium Risks Detected | 🟠 **${report.summary.mediumRiskCount}** |\n`;
    md += `| Low Risks Detected | 🟢 **${report.summary.lowRiskCount}** |\n\n`;

    // Score Deductions breakdown
    if (report.score.deductions.length > 0) {
      md += `### Score Deductions Breakdown\n\n`;
      for (const d of report.score.deductions) {
        md += `- -${d.amount} pts: ${d.reason}\n`;
      }
      md += `\n`;
    }

    // What Could This Change Break?
    if (report.breakageRisks && report.breakageRisks.length > 0) {
      md += `## 💥 What Could This Change Break?\n\n`;
      md += `| Area | Severity | Trigger & Impact | Dependents At Risk |\n`;
      md += `|---|---|---|---|\n`;
      for (const b of report.breakageRisks) {
        const icon = b.severity === 'HIGH' ? '🔴' : b.severity === 'MEDIUM' ? '🟠' : '🟢';
        const deps = b.affectedCallersOrRoutes.length > 0 ? b.affectedCallersOrRoutes.map((c) => `\`${c}\``).join(', ') : '*None*';
        md += `| **${b.area}** | ${icon} ${b.severity} | **${b.trigger}**<br>${b.detail} | ${deps} |\n`;
      }
      md += `\n`;
    }

    // Risks & Evidence
    md += `## ⚠️ Risks & Verifiable Evidence\n\n`;
    if (report.risks.length === 0) {
      md += `*No risks detected in current changes. All static checks passed.*\n\n`;
    } else {
      for (const risk of report.risks) {
        const severityIcon =
          risk.severity === 'HIGH' ? '🔴' : risk.severity === 'MEDIUM' ? '🟠' : '🟢';
        md += `### ${severityIcon} [${risk.severity}] ${risk.title}\n\n`;
        md += `**Location:** \`${risk.file}:${risk.line}\`\n\n`;
        md += `**Description:** ${risk.description}\n\n`;
        md += `**Recommendation:** ${risk.recommendation}\n\n`;

        if (risk.evidenceTrace.length > 0) {
          md += `**Evidence Path:**\n\`\`\`text\n`;
          for (let i = 0; i < risk.evidenceTrace.length; i++) {
            const step = risk.evidenceTrace[i];
            const arrow = i === risk.evidenceTrace.length - 1 ? '└──' : '├──';
            md += `${arrow} [Line ${step.line}] ${step.description}\n`;
          }
          md += `\`\`\`\n\n`;
        }

        if (risk.snippet) {
          md += `**Code Snippet:**\n\`\`\`typescript\n${risk.snippet}\n\`\`\`\n\n`;
        }
      }
    }

    // Impact Analysis
    md += `## ⚡ Change Impact Analysis\n\n`;
    if (report.impact.changedSymbols.length === 0) {
      md += `*No exported symbols were modified.*\n\n`;
    } else {
      md += `### Affected Symbols and Callers\n\n`;
      for (const sym of report.impact.changedSymbols) {
        md += `- **\`${sym.symbolName}\`** (${sym.kind}) in \`${sym.filePath}\`\n`;
        if (sym.callers.length === 0) {
          md += `  - *No external callers detected.*\n`;
        } else {
          for (const caller of sym.callers) {
            const testBadge = caller.hasTest ? '✓ tested' : '⚠️ untested';
            md += `  - Called by \`${caller.callerName}\` at \`${caller.filePath}:${caller.line}\` [${testBadge}]\n`;
          }
        }
      }
      md += `\n`;
    }

    if (report.impact.affectedRoutes.length > 0) {
      md += `### Affected API Routes\n\n`;
      for (const route of report.impact.affectedRoutes) {
        md += `- \`${route.method}\` \`${route.routePath}\` at line ${route.line}\n`;
      }
      md += `\n`;
    }

    // Project Rules
    md += `## 📋 Project Rules Status\n\n`;
    if (report.rules.length === 0) {
      md += `*No project rules configured.*\n\n`;
    } else {
      md += `| Rule | Status | Evidence |\n`;
      md += `|---|---|---|\n`;
      for (const r of report.rules) {
        const statusEmoji = r.status === 'PASS' ? '✅ PASS' : r.status === 'VIOLATION' ? '🔴 VIOLATION' : '⚠️ WARNING';
        const evidence = r.detectedMessage || 'Compliant with policy';
        md += `| ${r.rule.title} | ${statusEmoji} | ${evidence} |\n`;
      }
      md += `\n`;
    }

    // Checks & Tests
    md += `## 🧪 Checks & Verification Tests\n\n`;
    md += `| Check | Status | Details |\n`;
    md += `|---|---|---|\n`;
    md += `| TypeScript | ${report.checks.typescript.status} | ${report.checks.typescript.message || ''} |\n`;
    md += `| ESLint | ${report.checks.eslint.status} | ${report.checks.eslint.message || ''} |\n`;
    md += `| Unit Tests | ${report.checks.unitTests.status} | ${report.checks.unitTests.message || ''} |\n`;
    md += `| Build Check | ${report.checks.build.status} | ${report.checks.build.message || ''} |\n\n`;

    md += `---\n*Generated by ProofCode v0.1.0 — Code Change Verification*\n`;

    return md;
  }

  /**
   * Formats a concise summary for terminal/CLI usage
   */
  public static toTerminal(report: VerificationReport): string {
    const lines: string[] = [];
    lines.push('====================================================');
    lines.push('             PROOFCODE CHANGE VERIFICATION          ');
    lines.push('====================================================');
    lines.push(`Verdict:       ${report.verdict}`);
    lines.push(`Score:         ${report.score.total}%`);
    lines.push(`Files Changed: ${report.summary.filesChanged}`);
    lines.push(`Functions:     ${report.summary.symbolsAffected} affected`);
    lines.push(`API Routes:    ${report.summary.apiRoutesAffected} affected`);
    lines.push(
      `Risks:         🔴 ${report.summary.highRiskCount} High | 🟠 ${report.summary.mediumRiskCount} Med | 🟢 ${report.summary.lowRiskCount} Low`
    );
    lines.push('----------------------------------------------------');

    if (report.breakageRisks && report.breakageRisks.length > 0) {
      lines.push('WHAT COULD THIS CHANGE BREAK?');
      for (const b of report.breakageRisks) {
        lines.push(`- [${b.severity}] ${b.area}: ${b.trigger}`);
        lines.push(`  Impact: ${b.detail}`);
        if (b.affectedCallersOrRoutes.length > 0) {
          lines.push(`  Dependents: ${b.affectedCallersOrRoutes.join(', ')}`);
        }
      }
      lines.push('----------------------------------------------------');
    }

    if (report.risks.length > 0) {
      lines.push('CRITICAL FINDINGS:');
      for (const risk of report.risks) {
        lines.push(`[${risk.severity}] ${risk.title} at ${risk.file}:${risk.line}`);
        lines.push(`  -> ${risk.description}`);
      }
      lines.push('----------------------------------------------------');
    }

    const violations = report.rules.filter((r) => r.status === 'VIOLATION');
    if (violations.length > 0) {
      lines.push('RULE VIOLATIONS:');
      for (const v of violations) {
        lines.push(`- ${v.rule.title}: ${v.detectedMessage} (${v.file}:${v.line})`);
      }
      lines.push('----------------------------------------------------');
    }

    return lines.join('\n');
  }

  public static toJson(report: VerificationReport): string {
    return JSON.stringify(report, null, 2);
  }
}
