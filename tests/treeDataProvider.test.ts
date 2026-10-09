import { describe, expect, it } from 'vitest';
import { VerificationReport } from '../src/types';
import { ProofCodeTreeDataProvider } from '../src/ui/treeDataProvider';

describe('ProofCodeTreeDataProvider', () => {
  it('should show run message when no report is set', async () => {
    const provider = new ProofCodeTreeDataProvider();
    const children = await provider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toContain('Run "ProofCode: Verify Current Changes"');
  });

  it('should render root categories when a report is loaded', async () => {
    const provider = new ProofCodeTreeDataProvider();
    const mockReport: VerificationReport = {
      timestamp: new Date().toISOString(),
      repoRoot: '/workspace',
      branch: 'working',
      score: { total: 85, deductions: [] },
      verdict: 'READY_TO_SHIP',
      summary: {
        filesChanged: 3,
        linesAdded: 50,
