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
