import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CiInstaller } from '../src/ci/ciInstaller';

describe('CiInstaller', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcode-ci-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should generate valid GitHub Actions workflow YAML content', () => {
    const yaml = CiInstaller.getWorkflowContent();
    expect(yaml).toContain('name: ProofCode Verification');
    expect(yaml).toContain('pull_request:');
    expect(yaml).toContain('actions/checkout@v4');
    expect(yaml).toContain('fetch-depth: 0');
    expect(yaml).toContain('proofcode verify --ci --strict --markdown');
    expect(yaml).toContain('actions/github-script@v7');
    expect(yaml).toContain('<!-- proofcode-pr-comment -->');
  });

  it('should install .github/workflows/proofcode.yml into target directory', () => {
    const res = CiInstaller.installGitHubWorkflow(tempDir);
    expect(res.success).toBe(true);
    expect(res.created).toBe(true);

    const workflowFile = path.join(tempDir, '.github', 'workflows', 'proofcode.yml');
    expect(fs.existsSync(workflowFile)).toBe(true);

    const content = fs.readFileSync(workflowFile, 'utf8');
    expect(content).toContain('ProofCode Verification');
  });

  it('should not overwrite existing workflow without force flag', () => {
    const workflowDir = path.join(tempDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    const workflowFile = path.join(workflowDir, 'proofcode.yml');
    fs.writeFileSync(workflowFile, '# Custom Existing Workflow', 'utf8');

    const res = CiInstaller.installGitHubWorkflow(tempDir, { force: false });
    expect(res.success).toBe(true);
    expect(res.created).toBe(false);
    expect(res.message).toContain('already exists');

    const content = fs.readFileSync(workflowFile, 'utf8');
    expect(content).toBe('# Custom Existing Workflow');
  });

  it('should overwrite existing workflow when force flag is true', () => {
    const workflowDir = path.join(tempDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    const workflowFile = path.join(workflowDir, 'proofcode.yml');
    fs.writeFileSync(workflowFile, '# Custom Existing Workflow', 'utf8');

    const res = CiInstaller.installGitHubWorkflow(tempDir, { force: true });
    expect(res.success).toBe(true);
    expect(res.created).toBe(true);

    const content = fs.readFileSync(workflowFile, 'utf8');
    expect(content).toContain('ProofCode Verification');
  });
});

