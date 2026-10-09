import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { ProofCodeCodeLensProvider } from '../src/ui/codeLensProvider';
import { VerificationReport } from '../src/types';

describe('ProofCodeCodeLensProvider', () => {
  it('should return empty array when no report is set', () => {
    const provider = new ProofCodeCodeLensProvider();
    const doc: any = {
      fileName: '/workspace/src/auth.ts',
      lineCount: 10,
      lineAt: () => ({ text: 'export function getUser() {}' })
    };

    const lenses = provider.provideCodeLenses(doc, {} as any);
    expect(lenses).toEqual([]);
  });

  it('should provide CodeLenses for changed functions with caller info and risks', () => {
    const provider = new ProofCodeCodeLensProvider();
    const mockReport: Partial<VerificationReport> = {
      summary: {
        filesChanged: 1,
        linesAdded: 10,
        linesDeleted: 2,
        symbolsAffected: 1,
        apiRoutesAffected: 0,
        testsAdded: 0,
        testsAffected: 0,
        highRiskCount: 1,
