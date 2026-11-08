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
    const diag = new vscode.Diagnostic(
      new vscode.Range(1, 4, 1, 30),
      '[PC-REL-006] Unhandled Asynchronous Operation',
      vscode.DiagnosticSeverity.Information
    );
    diag.source = 'ProofCode';
    diag.code = 'PC-REL-006';

    const actions = provider.provideCodeActions(
      mockDocument,
      new vscode.Range(1, 0, 1, 0),
      { diagnostics: [diag] } as any,
      {} as any
    );

    expect(actions.length).toBe(1);
    expect(actions[0].title).toContain('Wrap in try/catch block');
    expect(actions[0].edit).toBeDefined();
    expect(actions[0].isPreferred).toBe(true);
  });

  it('should provide QuickFixes for unhandled null database result (PC-DATA-001)', () => {
    const provider = new ProofCodeCodeActionProvider();
    const diag = new vscode.Diagnostic(
      new vscode.Range(1, 4, 1, 30),
      '[PC-DATA-001] Unhandled Null/Undefined Database Result (user)',
      vscode.DiagnosticSeverity.Warning
    );
    diag.source = 'ProofCode';
    diag.code = 'PC-DATA-001';

    const actions = provider.provideCodeActions(
      mockDocument,
      new vscode.Range(1, 0, 1, 0),
      { diagnostics: [diag] } as any,
      {} as any
    );

    expect(actions.length).toBeGreaterThanOrEqual(1);
    const guardAction = actions.find((a) => a.title.includes('null guard'));
    expect(guardAction).toBeDefined();
    expect(guardAction?.title).toContain('if (!user)');
  });

  it('should provide QuickFix for missing authorization in API route (PC-AUTH-001)', () => {
    const provider = new ProofCodeCodeActionProvider();
    const diag = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 20),
      '[PC-AUTH-001] Missing Authorization Check in API Route (GET)',
      vscode.DiagnosticSeverity.Error
    );
    diag.source = 'ProofCode';
    diag.code = 'PC-AUTH-001';

    const actions = provider.provideCodeActions(
      mockDocument,
      new vscode.Range(0, 0, 0, 0),
      { diagnostics: [diag] } as any,
      {} as any
    );

    expect(actions.length).toBe(1);
    expect(actions[0].title).toContain('session authentication guard');
    expect(actions[0].edit).toBeDefined();
  });

  it('should provide QuickFix for dangerous type assertion bypass (PC-TYPE-001)', () => {
    const provider = new ProofCodeCodeActionProvider();
    const docWithAny: any = {
      uri: vscode.Uri.file('/src/sample.ts'),
      lineCount: 10,
      lineAt: () => ({
        text: '  const payload = raw as any;',
        range: new vscode.Range(2, 0, 2, 29)
      })
    };
    const diag = new vscode.Diagnostic(
      new vscode.Range(2, 18, 2, 28),
      "[PC-TYPE-001] Dangerous Type Assertion Bypass ('as any')",
      vscode.DiagnosticSeverity.Warning
    );
    diag.source = 'ProofCode';
    diag.code = 'PC-TYPE-001';

    const actions = provider.provideCodeActions(
      docWithAny,
      new vscode.Range(2, 0, 2, 0),
      { diagnostics: [diag] } as any,
      {} as any
    );

    expect(actions.length).toBe(1);
    expect(actions[0].title).toContain("Replace unsafe 'as any' with 'as unknown'");
    expect(actions[0].edit).toBeDefined();
  });

  it('should provide QuickFix for phantom / uninstalled import (PC-IMPORT-001)', () => {
    const provider = new ProofCodeCodeActionProvider();
    const docWithImport: any = {
      uri: vscode.Uri.file('/src/sample.ts'),
      lineCount: 10,
      lineAt: () => ({
        text: "import { hallucinate } from 'fake-dep';",
        range: new vscode.Range(0, 0, 0, 39)
      })
    };
    const diag = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 39),
      "[PC-IMPORT-001] Phantom / Uninstalled Dependency Imported ('fake-dep')",
      vscode.DiagnosticSeverity.Error
    );
    diag.source = 'ProofCode';
    diag.code = 'PC-IMPORT-001';

    const actions = provider.provideCodeActions(
      docWithImport,
      new vscode.Range(0, 0, 0, 0),
      { diagnostics: [diag] } as any,
      {} as any
    );

    expect(actions.length).toBe(1);
    expect(actions[0].title).toContain('Remove uninstalled/phantom import');
    expect(actions[0].edit).toBeDefined();
  });
});
