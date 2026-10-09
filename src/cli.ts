import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProofCodeEngine } from './engine/proofCodeEngine';
import { ReportFormatter } from './engine/reportFormatter';
import { ProjectRulesEngine } from './rules/projectRulesEngine';

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const cwd = process.cwd();

  const isHelp = args.includes('--help') || args.includes('-h');
  const isJson = args.includes('--json');
  const isMarkdown = args.includes('--markdown') || args.includes('-m');
  const isStaged = args.includes('--staged');
  const isLive = args.includes('--live');
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'verify';

  if (isHelp) {
    console.log(`
ProofCode CLI - Code Change Verification
AI writes code. ProofCode proves the change.

Usage:
  proofcode [command] [options]

Commands:
  verify       Verify working tree or git diff (default)
  init         Initialize default .proofcode/rules.md in project
  rules        List and check configured project rules

Options:
  --staged     Verify only staged git changes
  --live       Run full live test and build checks (npm test, tsc, etc.)
  --json       Output report as structured JSON
  --markdown   Output report as formatted GitHub Markdown
