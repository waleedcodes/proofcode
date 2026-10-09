import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { ProofCodeCodeActionProvider } from '../src/ui/codeActionProvider';

describe('ProofCodeCodeActionProvider', () => {
  const mockDocument: any = {
    uri: vscode.Uri.file('/src/auth.ts'),
    lineAt: (line: number) => ({
      text: '    const user = await db.user.findUnique({ where: { id } });',
      range: new vscode.Range(line, 0, line, 60)
    })
  };

  it('should return empty actions when no ProofCode diagnostics are present', () => {
    const provider = new ProofCodeCodeActionProvider();
    const actions = provider.provideCodeActions(
      mockDocument,
      new vscode.Range(0, 0, 0, 0),
      {
        diagnostics: [
          new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            'Some external linter error',
            vscode.DiagnosticSeverity.Error
          )
        ]
      } as any,
      {} as any
    );

    expect(actions).toEqual([]);
  });

  it('should provide QuickFix to wrap unhandled async operation in try/catch (PC-REL-006)', () => {
    const provider = new ProofCodeCodeActionProvider();
