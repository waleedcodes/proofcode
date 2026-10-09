import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { activate, deactivate } from '../src/extension/index';

describe('Extension Lifecycle', () => {
  it('should activate extension and register commands, views, and subscriptions', () => {
    const registeredCommands: string[] = [];
    (vscode.commands.registerCommand as any) = (cmd: string, _callback: any) => {
      registeredCommands.push(cmd);
      return { dispose: () => {} };
    };

    const mockContext: any = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/extension')
    };

    expect(() => activate(mockContext)).not.toThrow();

    // Verify key commands registered
    expect(registeredCommands).toContain('proofcode.verifyChange');
    expect(registeredCommands).toContain('proofcode.openDashboard');
    expect(registeredCommands).toContain('proofcode.initRules');
    expect(registeredCommands).toContain('proofcode.openEvidence');
