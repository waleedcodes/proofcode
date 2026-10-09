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

