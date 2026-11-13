import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CiInstallResult {
  success: boolean;
  workflowPath: string;
  message: string;
  created: boolean;
}

export class CiInstaller {
  /**
   * Generates the GitHub Actions workflow YAML configuration.
   */
  public static getWorkflowContent(): string {
    return `name: ProofCode Verification

on:
  pull_request:
    branches: [main, master]
  push:
    branches: [main, master]

permissions:
  contents: read
  pull-requests: write

jobs:
  verify:
    name: ProofCode Verification & Impact Guard
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install Dependencies
        run: npm ci --ignore-scripts || npm install

      - name: Run ProofCode Verification
        id: proofcode
        run: |
          npx proofcode verify --ci --strict --markdown -o proofcode-summary.md
        continue-on-error: true

      - name: Post PR Summary Comment
        if: github.event_name == 'pull_request' && hashFiles('proofcode-summary.md') != ''
        uses: actions/github-script@v7
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('fs');
            const summary = fs.readFileSync('proofcode-summary.md', 'utf8');
            const marker = '<!-- proofcode-pr-comment -->';
            const body = marker + '\\n' + summary;

            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });

            const existing = comments.find(c => c.body && c.body.includes(marker));
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body: body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: body,
              });
            }

      - name: Enforce Verification Quality Gate
        if: steps.proofcode.outcome == 'failure'
        run: |
          echo "❌ ProofCode verification failed or detected critical risks/breaking contracts."
          exit 1
`;
  }

  /**
   * Installs .github/workflows/proofcode.yml in the target project.
   */
  public static installGitHubWorkflow(
    projectRoot: string,
    options: { force?: boolean } = {}
  ): CiInstallResult {
    const workflowsDir = path.join(path.resolve(projectRoot), '.github', 'workflows');
    const workflowPath = path.join(workflowsDir, 'proofcode.yml');

    try {
      if (fs.existsSync(workflowPath) && !options.force) {
        return {
          success: true,
          workflowPath,
          message: `GitHub Actions workflow already exists at: ${workflowPath}`,
          created: false
        };
      }

      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(workflowPath, this.getWorkflowContent(), 'utf8');

      return {
        success: true,
        workflowPath,
        message: `Successfully installed GitHub Actions workflow at: ${workflowPath}`,
        created: true
      };
    } catch (err: unknown) {
      return {
        success: false,
        workflowPath,
        message: `Failed to install GitHub Actions workflow: ${(err as Error).message}`,
        created: false
      };
    }
  }
}

