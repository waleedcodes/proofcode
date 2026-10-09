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
        mediumRiskCount: 0,
        lowRiskCount: 0
      },
      impact: {
        changedFiles: ['/workspace/src/auth.ts'],
        changedSymbols: [
          {
            symbolName: 'getUser',
            kind: 'function',
            filePath: '/workspace/src/auth.ts',
            callers: [
              { callerName: 'ProfilePage', filePath: '/src/Profile.tsx', line: 10, hasTest: false },
              { callerName: 'Dashboard', filePath: '/src/Dashboard.tsx', line: 12, hasTest: true }
            ],
            isApiRoute: false
          }
        ],
        affectedFiles: ['/src/Profile.tsx', '/src/Dashboard.tsx'],
        affectedCallers: [],
        affectedRoutes: [],
        totalCallersCount: 2,
        untestedCallersCount: 1
      },
      risks: [
        {
          id: 'risk-1',
          ruleId: 'PC-AUTH-001',
          category: 'authorization',
          title: 'Missing Auth',
          severity: 'HIGH',
          description: 'No auth',
          file: '/workspace/src/auth.ts',
          line: 3,
          snippet: 'const user = db.user()',
          evidenceTrace: [],
          recommendation: 'Fix it'
        }
      ]
    };

    provider.setReport(mockReport as VerificationReport);

    const doc: any = {
      fileName: '/workspace/src/auth.ts',
      lineCount: 5,
      lineAt: (i: number) => {
        if (i === 1) return { text: 'export function getUser() {' };
        return { text: '}' };
      }
    };

    const lenses = provider.provideCodeLenses(doc, {} as any);
    expect(lenses.length).toBe(1);
    expect(lenses[0].command?.title).toContain('2 callers (1 untested)');
    expect(lenses[0].command?.title).toContain('1 risk');
    expect(lenses[0].command?.command).toBe('proofcode.openDashboard');
  });
});
