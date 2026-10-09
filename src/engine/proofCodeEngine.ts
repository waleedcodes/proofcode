import * as path from 'node:path';
import { GitService } from '../git/gitService';
import { ProjectGraph } from '../graph/projectGraph';
import { ProjectRulesEngine } from '../rules/projectRulesEngine';
import { RiskEngine } from '../rules/riskEngine';
import { TestRunner } from '../test-runner/testRunner';
import {
  BreakageRiskItem,
  CheckResult,
  FileDiff,
  ImpactAnalysis,
  RiskFinding,
  RuleResult,
  VerificationReport,
  VerificationScore,
  VerificationVerdict
} from '../types';

export interface VerifyOptions {
  staged?: boolean;
  baseRef?: string;
  runLiveTests?: boolean;
  rulesFilePath?: string;
}

export class ProofCodeEngine {
  private workspaceRoot: string;
  private gitService: GitService;
  private testRunner: TestRunner;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.gitService = new GitService({ cwd: workspaceRoot });
    this.testRunner = new TestRunner();
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  public async verify(options: VerifyOptions = {}): Promise<VerificationReport> {
    const repoRoot = await this.gitService.getRepoRoot();
    const branch = await this.gitService.getCurrentBranch(repoRoot);

    // 1. Git Diff & Change Extraction
    const diffResult = await this.gitService.getDiff({
      staged: options.staged,
      baseRef: options.baseRef,
      repoRoot
    });

    // If workspaceRoot is a subfolder of repoRoot, scope verification to workspaceRoot
    const targetWorkspace = path.resolve(this.workspaceRoot);
    const isSubfolder =
      targetWorkspace !== path.resolve(repoRoot) &&
      targetWorkspace.startsWith(path.resolve(repoRoot));

    const filesToVerify = isSubfolder
      ? diffResult.files.filter((f) => {
          const full = path.resolve(repoRoot, f.newPath);
          return full.startsWith(targetWorkspace);
        })
      : diffResult.files;

    const activeRoot = isSubfolder ? targetWorkspace : repoRoot;

    // 2. Project Graph & Dependency Mapping
    const graph = new ProjectGraph(activeRoot);
    await graph.buildGraph();

    // Map changed files to added/changed lines
    const fileChangedLines = new Map<string, number[]>();
    for (const file of filesToVerify) {
      const fullPath = path.resolve(repoRoot, file.newPath);
      fileChangedLines.set(fullPath, file.addedLines);
    }

    // 3. Compute Change Impact
    const impact = graph.computeImpact(fileChangedLines);

    // 4. Static Risk Analysis on changed files
    const allRisks: RiskFinding[] = [];
    for (const file of filesToVerify) {
      const fullPath = path.resolve(repoRoot, file.newPath);
      const risks = RiskEngine.analyzeFile(fullPath, undefined, file);
      allRisks.push(...risks);
    }

    // 5. Project Rules Verification
    const rulesEngine = new ProjectRulesEngine(activeRoot, options.rulesFilePath);
    const ruleResults = await rulesEngine.evaluateRules(filesToVerify, graph);

    // 6. Test Runner Checks
    let tsCheck: CheckResult = { name: 'TypeScript', status: 'PASS', message: 'Ready' };
    let lintCheck: CheckResult = { name: 'ESLint', status: 'PASS', message: 'Ready' };
    let unitTestsCheck: CheckResult = { name: 'Unit Tests', status: 'SKIPPED', message: 'Not run' };
    let buildCheck: CheckResult = { name: 'Build', status: 'SKIPPED', message: 'Not run' };

    if (options.runLiveTests) {
      [tsCheck, lintCheck, unitTestsCheck, buildCheck] = await Promise.all([
        this.testRunner.runTypeScriptCheck(repoRoot),
        this.testRunner.runLint(repoRoot),
        this.testRunner.runUnitTests(repoRoot),
        this.testRunner.runBuild(repoRoot)
      ]);
    }

    // 7. Calculate Verification Score
    const score = this.calculateVerificationScore({
      filesChanged: filesToVerify,
      risks: allRisks,
      rules: ruleResults,
      untestedCallersCount: impact.untestedCallersCount,
      checks: { tsCheck, lintCheck, unitTestsCheck, buildCheck }
    });

    // 8. Determine Verdict
    const verdict = this.determineVerdict(score.total, allRisks, ruleResults, {
      tsCheck,
      lintCheck,
      unitTestsCheck
    });

    // Count test files touched
    const testsAdded = filesToVerify.filter(
      (f) => f.isNew && graph.isTestFile(f.newPath)
    ).length;
    const testsAffected = filesToVerify.filter((f) => graph.isTestFile(f.newPath)).length;

    const highRiskCount = allRisks.filter((r) => r.severity === 'HIGH').length;
    const mediumRiskCount = allRisks.filter((r) => r.severity === 'MEDIUM').length;
    const lowRiskCount = allRisks.filter((r) => r.severity === 'LOW').length;

    const totalLinesAdded = filesToVerify.reduce((acc, f) => acc + f.addedLines.length, 0);
    const totalLinesDeleted = filesToVerify.reduce((acc, f) => acc + f.deletedLines.length, 0);

    const breakageRisks = this.computeBreakageRisks(impact, allRisks, ruleResults);

    return {
      timestamp: new Date().toISOString(),
      repoRoot: activeRoot,
      branch,
      score,
      verdict,
      summary: {
        filesChanged: filesToVerify.length,
        linesAdded: totalLinesAdded,
        linesDeleted: totalLinesDeleted,
        symbolsAffected: impact.changedSymbols.length,
        apiRoutesAffected: impact.affectedRoutes.length,
        testsAdded,
        testsAffected,
        highRiskCount,
        mediumRiskCount,
        lowRiskCount
      },
      impact,
      risks: allRisks,
      breakageRisks,
      rules: ruleResults,
      checks: {
        typescript: tsCheck,
        eslint: lintCheck,
        unitTests: unitTestsCheck,
        build: buildCheck
      }
    };
  }

  private calculateVerificationScore(params: {
    filesChanged: FileDiff[];
    risks: RiskFinding[];
    rules: { status: string }[];
    untestedCallersCount: number;
    checks: {
      tsCheck: CheckResult;
      lintCheck: CheckResult;
      unitTestsCheck: CheckResult;
      buildCheck: CheckResult;
    };
  }): VerificationScore {
    let currentScore = 100;
    const deductions: VerificationScore['deductions'] = [];

    // Deduct for High Risks (15 pts each, max 45)
    const highRisks = params.risks.filter((r) => r.severity === 'HIGH').length;
    if (highRisks > 0) {
      const deduction = Math.min(45, highRisks * 15);
      currentScore -= deduction;
      deductions.push({
        reason: `${highRisks} High Severity Risk(s) detected`,
        amount: deduction
      });
    }

    // Deduct for Medium Risks (7 pts each, max 28)
    const medRisks = params.risks.filter((r) => r.severity === 'MEDIUM').length;
    if (medRisks > 0) {
      const deduction = Math.min(28, medRisks * 7);
      currentScore -= deduction;
      deductions.push({
        reason: `${medRisks} Medium Severity Risk(s) detected`,
        amount: deduction
      });
    }

    // Deduct for Low Risks (2 pts each, max 10)
    const lowRisks = params.risks.filter((r) => r.severity === 'LOW').length;
    if (lowRisks > 0) {
      const deduction = Math.min(10, lowRisks * 2);
      currentScore -= deduction;
      deductions.push({
        reason: `${lowRisks} Low Severity Risk(s) detected`,
        amount: deduction
      });
    }

    // Deduct for Project Rule Violations (15 pts each)
    const violations = params.rules.filter((r) => r.status === 'VIOLATION').length;
    if (violations > 0) {
      const deduction = Math.min(30, violations * 15);
      currentScore -= deduction;
      deductions.push({
        reason: `${violations} Project Rule Violation(s)`,
        amount: deduction
      });
    }

    // Deduct for Rule Warnings (5 pts each)
    const warnings = params.rules.filter((r) => r.status === 'WARNING').length;
    if (warnings > 0) {
      const deduction = Math.min(10, warnings * 5);
      currentScore -= deduction;
      deductions.push({
        reason: `${warnings} Project Rule Warning(s)`,
        amount: deduction
      });
    }

    // Deduct for untested callers (up to 15 pts)
    if (params.untestedCallersCount > 0) {
      const deduction = Math.min(15, params.untestedCallersCount * 3);
      currentScore -= deduction;
      deductions.push({
        reason: `${params.untestedCallersCount} Affected Caller(s) without test coverage`,
        amount: deduction
      });
    }

    // Check failures
    if (params.checks.tsCheck.status === 'FAIL') {
      currentScore -= 20;
      deductions.push({ reason: 'TypeScript compilation failure', amount: 20 });
    }
    if (params.checks.lintCheck.status === 'FAIL') {
      currentScore -= 10;
      deductions.push({ reason: 'Linter reported errors', amount: 10 });
    }
    if (params.checks.unitTestsCheck.status === 'FAIL') {
      currentScore -= 25;
      deductions.push({ reason: 'Unit test suite failed', amount: 25 });
    }

    return {
      total: Math.max(0, Math.min(100, currentScore)),
      deductions
    };
  }

  private determineVerdict(
    score: number,
    risks: RiskFinding[],
    rules: { status: string }[],
    checks: {
      tsCheck: CheckResult;
      lintCheck: CheckResult;
      unitTestsCheck: CheckResult;
    }
  ): VerificationVerdict {
    const hasHighRisk = risks.some((r) => r.severity === 'HIGH');
    const hasRuleViolation = rules.some((r) => r.status === 'VIOLATION');
    const hasTestFailure = checks.unitTestsCheck.status === 'FAIL';
    const hasTsFailure = checks.tsCheck.status === 'FAIL';

    if (hasHighRisk || hasRuleViolation || hasTestFailure || hasTsFailure || score < 50) {
      return 'BLOCKED';
    }

    if (score < 85 || risks.some((r) => r.severity === 'MEDIUM')) {
      return 'NEEDS_REVIEW';
    }

    return 'READY_TO_SHIP';
  }

  private computeBreakageRisks(
    impact: ImpactAnalysis,
    risks: RiskFinding[],
    rules: RuleResult[]
  ): BreakageRiskItem[] {
    const breakage: BreakageRiskItem[] = [];

    // 1. Check for touched auth/session services affecting routes/callers
    const authSymbols = impact.changedSymbols.filter(
      (s) =>
        /auth|session|token|user|login|permission/i.test(s.symbolName) ||
        /auth|session/i.test(s.filePath)
    );
    for (const s of authSymbols) {
      if (s.callers.length > 0) {
        const untested = s.callers.filter((c) => !c.hasTest);
        breakage.push({
          id: `BRK-AUTH-${s.symbolName}`,
          severity: 'HIGH',
          area: 'Authentication & Session Flow',
          trigger: `Symbol '${s.symbolName}' was modified in ${path.basename(s.filePath)}.`,
          detail: `${s.callers.length} downstream caller(s) depend on this behavior.${
            untested.length > 0 ? ` ${untested.length} caller(s) lack automated test coverage.` : ''
          }`,
          affectedCallersOrRoutes: s.callers.map((c) => `${c.callerName} (${path.basename(c.filePath)})`),
          evidenceFile: s.filePath
        });
      }
    }

    // 2. Check for high risks on routes & logic (SQL injection, Missing Auth, Secrets)
    for (const r of risks.filter((r) => r.severity === 'HIGH')) {
      breakage.push({
        id: `BRK-RISK-${r.id}`,
        severity: 'HIGH',
        area: r.category === 'authorization' ? 'API Access Control' : 'Data Security',
        trigger: r.title,
        detail: r.description,
        affectedCallersOrRoutes: [path.basename(r.file)],
        evidenceFile: r.file,
