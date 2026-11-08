import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProofCodeEngine } from './engine/proofCodeEngine';
import { ReportFormatter } from './engine/reportFormatter';
import { ProjectRulesEngine } from './rules/projectRulesEngine';
import { HookInstaller } from './git/hookInstaller';
import { VerificationReport } from './types';

export function emitGitHubAnnotations(report: VerificationReport, baseDir: string): void {
  for (const risk of report.risks) {
    const relFile = path.isAbsolute(risk.file)
      ? path.relative(baseDir, risk.file)
      : risk.file;
    const level =
      risk.severity === 'HIGH'
        ? 'error'
        : risk.severity === 'MEDIUM'
        ? 'warning'
        : 'notice';
    const title = `[${risk.ruleId}] ${risk.title}`.replace(/[\r\n]+/g, ' ');
    const msg = `${risk.description}${risk.snippet ? ` | Snippet: ${risk.snippet.trim()}` : ''}`.replace(/[\r\n]+/g, ' ');
    console.log(`::${level} file=${relFile},line=${risk.line},title=${title}::${msg}`);
  }

  for (const rule of report.rules) {
    if (rule.status === 'VIOLATION') {
      const relFile = rule.file
        ? path.isAbsolute(rule.file)
          ? path.relative(baseDir, rule.file)
          : rule.file
        : '.proofcode/rules.md';
      const title = `Rule Violation: ${rule.rule.title}`.replace(/[\r\n]+/g, ' ');
      const msg = `${rule.detectedMessage || rule.rule.description}`.replace(/[\r\n]+/g, ' ');
      console.log(`::error file=${relFile},line=${rule.line || 1},title=${title}::${msg}`);
    }
  }

  // Write GitHub Actions Step Summary if in CI environment
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        ReportFormatter.toMarkdown(report) + '\n',
        'utf8'
      );
    } catch {
      // Ignore write errors to step summary
    }
  }
}

export async function runCli(): Promise<void> {
  const args = process.argv.slice(2);

  const isHelp = args.includes('--help') || args.includes('-h');
  const isJson = args.includes('--json');
  const isMarkdown = args.includes('--markdown') || args.includes('-m');
  const isStaged = args.includes('--staged');
  const isLive = args.includes('--live');
  const isCi = args.includes('--ci') || args.includes('--github-actions');
  const isStrict = args.includes('--strict');

  const outputIdx = args.findIndex((a) => a === '--output' || a === '-o');
  const outputFile = outputIdx !== -1 && args[outputIdx + 1] ? args[outputIdx + 1] : undefined;

  if (isHelp) {
    console.log(`
ProofCode CLI - Code Change Verification
AI writes code. ProofCode proves the change.

Usage:
  proofcode [command] [target-directory] [options]

Commands:
  verify [dir]         Verify working tree or git diff (default: current directory)
  pr-summary [dir]     Generate Markdown summary ready for GitHub PR comments
  install-hook [dir]   Install deterministic pre-commit hook in .git/hooks/pre-commit
  uninstall-hook [dir] Uninstall ProofCode pre-commit hook
  init [dir]           Initialize default .proofcode/rules.md in target project
  rules [dir]          List and check configured project rules

Options:
  --staged       Verify only staged git changes (git diff --cached)
  --live         Run full live test and build checks (npm test, tsc, etc.)
  --ci           Output GitHub Actions annotations (::error, ::warning) and Step Summary
  --strict       Fail with exit code 1 if score < 75% or needs review
  --json         Output report as structured JSON
  --markdown, -m Output report as formatted GitHub Markdown
  -o, --output   Write report directly to specified file (e.g. -o pr-summary.md)
  --help, -h     Show this help message

Examples:
  proofcode verify
  proofcode verify --staged
  proofcode pr-summary -o pr-comment.md
  proofcode install-hook
  proofcode verify ./examples/demo-app
  proofcode verify --staged --ci
  proofcode verify ./apps/api --live --markdown
`);
    process.exit(0);
  }

  // Parse positional arguments for command and target directory (skipping flag arguments)
  const nonFlagArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (arg === '--output' || arg === '-o') {
        i++; // Skip the option parameter
      }
      continue;
    }
    nonFlagArgs.push(arg);
  }
  let command = 'verify';
  let targetPath = process.cwd();

  if (nonFlagArgs.length > 0) {
    const first = nonFlagArgs[0];
    if (
      first === 'init' ||
      first === 'rules' ||
      first === 'install-hook' ||
      first === 'hook' ||
      first === 'uninstall-hook' ||
      first === 'pr-summary'
    ) {
      command = first;
      if (nonFlagArgs[1]) {
        targetPath = path.resolve(process.cwd(), nonFlagArgs[1]);
      }
    } else if (first === 'verify') {
      command = 'verify';
      if (nonFlagArgs[1]) {
        targetPath = path.resolve(process.cwd(), nonFlagArgs[1]);
      }
    } else {
      command = 'verify';
      targetPath = path.resolve(process.cwd(), first);
    }
  }

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Target path does not exist: ${targetPath}`);
    process.exit(1);
  }

  if (command === 'install-hook' || command === 'hook') {
    const res = HookInstaller.installPreCommitHook(targetPath);
    if (res.success) {
      console.log(`\n🛡️  ${res.message}`);
      console.log('   Every git commit will now be verified by ProofCode before being committed.\n');
      process.exit(0);
    } else {
      console.error(`\n❌ ${res.message}\n`);
      process.exit(1);
    }
  }

  if (command === 'uninstall-hook') {
    const res = HookInstaller.uninstallPreCommitHook(targetPath);
    if (res.success) {
      console.log(`\n🛡️  ${res.message}\n`);
      process.exit(0);
    } else {
      console.error(`\n❌ ${res.message}\n`);
      process.exit(1);
    }
  }

  if (command === 'init') {
    const rulesEngine = new ProjectRulesEngine(targetPath);
    const created = await rulesEngine.initDefaultRulesFile();
    console.log(`Initialized ProofCode rules at: ${created}`);
    process.exit(0);
  }

  if (command === 'rules') {
    const rulesEngine = new ProjectRulesEngine(targetPath);
    const rules = rulesEngine.parseRules();
    console.log(`\nConfigured Rules (${rules.length}) in ${targetPath}:`);
    rules.forEach((r, idx) => {
      console.log(`  ${idx + 1}. [${r.severity}] ${r.title}: ${r.description}`);
    });
    console.log('');
    process.exit(0);
  }

  // Default: Verify
  try {
    const engine = new ProofCodeEngine(targetPath);
    const report = await engine.verify({
      staged: isStaged,
      runLiveTests: isLive
    });

    let outputText = '';
    if (isJson) {
      outputText = ReportFormatter.toJson(report);
    } else if (isMarkdown || command === 'pr-summary') {
      outputText = ReportFormatter.toMarkdown(report);
    } else {
      outputText = ReportFormatter.toTerminal(report);
    }

    if (outputFile) {
      fs.writeFileSync(path.resolve(process.cwd(), outputFile), outputText, 'utf8');
      console.log(`\n📄 Report written to: ${outputFile}\n`);
    } else {
      console.log(outputText);
    }

    if (isCi) {
      emitGitHubAnnotations(report, targetPath);
    }

    // Write artifact report if .proofcode dir exists
    const proofcodeDir = path.join(targetPath, '.proofcode');
    if (fs.existsSync(proofcodeDir)) {
      fs.writeFileSync(
        path.join(proofcodeDir, 'report.md'),
        ReportFormatter.toMarkdown(report),
        'utf8'
      );
      fs.writeFileSync(
        path.join(proofcodeDir, 'report.json'),
        ReportFormatter.toJson(report),
        'utf8'
      );
    }

    // Exit code: 0 if ready, 1 if blocked (or if strict and needs review)
    if (report.verdict === 'BLOCKED') {
      process.exit(1);
    } else if (isStrict && report.verdict !== 'READY_TO_SHIP') {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err: unknown) {
    console.error(`Verification failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}
