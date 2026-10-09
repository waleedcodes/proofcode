import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { ProofCodeWebviewPanel } from '../src/ui/webviewPanel';
import { VerificationReport } from '../src/types';

describe('ProofCodeWebviewPanel', () => {
  it('should generate rich glassmorphic HTML containing the Impact Blast Graph and tabs', () => {
    const mockReport: VerificationReport = {
      timestamp: new Date().toISOString(),
      repoRoot: '/workspace',
      branch: 'feature/auth',
      score: { total: 76, deductions: [] },
      verdict: 'NEEDS_REVIEW',
      summary: {
        filesChanged: 2,
        linesAdded: 30,
        linesDeleted: 5,
        symbolsAffected: 2,
        apiRoutesAffected: 1,
        testsAdded: 1,
        testsAffected: 1,
        highRiskCount: 0,
        mediumRiskCount: 1,
        lowRiskCount: 2
      },
      impact: {
        changedFiles: ['/workspace/src/auth.ts'],
        changedSymbols: [
          {
            symbolName: 'getUser',
            kind: 'function',
            filePath: '/workspace/src/auth.ts',
            callers: [
              { callerName: 'Dashboard', filePath: '/workspace/src/Dashboard.tsx', line: 12, hasTest: true },
              { callerName: 'AdminPanel', filePath: '/workspace/src/AdminPanel.tsx', line: 8, hasTest: false }
            ],
            isApiRoute: false
          }
        ],
        affectedFiles: ['/workspace/src/Dashboard.tsx', '/workspace/src/AdminPanel.tsx'],
        affectedCallers: [],
        affectedRoutes: [
          {
            routePath: '/api/auth/session',
            method: 'GET',
            filePath: '/workspace/src/api/auth.ts',
            line: 5
          }
        ],
        totalCallersCount: 2,
        untestedCallersCount: 1
      },
      risks: [],
      breakageRisks: [
        {
          id: 'BRK-1',
          severity: 'HIGH',
          area: 'Authentication',
          trigger: 'getUser modified',
          detail: 'Downstream callers at risk',
          affectedCallersOrRoutes: ['AdminPanel']
        }
      ],
      rules: [],
      checks: {
        typescript: { name: 'TypeScript', status: 'PASS' },
        eslint: { name: 'ESLint', status: 'PASS' },
        unitTests: { name: 'Unit Tests', status: 'PASS' },
        build: { name: 'Build', status: 'PASS' }
      }
    };

    // Instantiate panel via private constructor method or test _getHtmlForWebview
    // We can call createOrShow with mock panel
    const mockWebview: any = {
      html: '',
      onDidReceiveMessage: () => ({ dispose: () => {} }),
      asWebviewUri: (uri: any) => uri,
      cspSource: 'https:'
    };

    const mockPanel: any = {
      webview: mockWebview,
