import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProofCodeEngine } from '../src/engine/proofCodeEngine';
import { ReportFormatter } from '../src/engine/reportFormatter';

async function main() {
  const demoRoot = path.resolve(__dirname, '../examples/demo-app');
  console.log('\n===============================================================');
  console.log('   🚀 PROOFCODE KILLER WORKFLOW DEMO (Next.js AI Change)       ');
  console.log('===============================================================');
  console.log(`Analyzing codebase at: ${demoRoot}\n`);

  try {
    const engine = new ProofCodeEngine(demoRoot);
    const report = await engine.verify({ allFiles: true });

    console.log(ReportFormatter.toTerminal(report));

    // Write demo report
    const reportDir = path.join(demoRoot, '.proofcode');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(reportDir, 'report.md');
    fs.writeFileSync(reportPath, ReportFormatter.toMarkdown(report), 'utf8');

    console.log(`\n📄 Generated Markdown Verification Report at:\n${reportPath}\n`);
  } catch (err) {
    console.error('Demo execution failed:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
