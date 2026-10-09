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
