export class TreeItem {
  constructor(public label: string, public collapsibleState?: any) {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export class EventEmitter<T = any> {
  public event = (listener: (e: T) => any) => ({ dispose: () => {} });
  public fire(data?: T) {}
}

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  public start: Position;
  public end: Position;
  constructor(
    startLineOrPos: number | Position,
    startCharOrEndPos: number | Position,
    endLine?: number,
    endCharacter?: number
  ) {
    if (typeof startLineOrPos === 'number') {
      this.start = new Position(startLineOrPos, startCharOrEndPos as number);
      this.end = new Position(endLine ?? startLineOrPos, endCharacter ?? (startCharOrEndPos as number));
    } else {
      this.start = startLineOrPos;
      this.end = startCharOrEndPos as Position;
    }
  }
}

export class Selection {
  constructor(public anchor: Position, public active: Position) {}
}

export class CodeLens {
  constructor(public range: Range, public command?: { title: string; command: string; tooltip?: string }) {}
}

export class CodeActionKind {
  public static readonly QuickFix = new CodeActionKind('quickfix');
  constructor(public readonly value: string) {}
}

export class WorkspaceEdit {
  public replace(_uri: any, _range: Range, _newText: string) {}
  public insert(_uri: any, _position: Position, _newText: string) {}
}

export class CodeAction {
  public edit?: WorkspaceEdit;
  public isPreferred?: boolean;
  public diagnostics?: Diagnostic[];
  constructor(public title: string, public kind?: CodeActionKind) {}
}

export class Diagnostic {
  public source?: string;
  public code?: any;
  constructor(public range: Range, public message: string, public severity: any) {}
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3
}

export const Uri = {
  file: (path: string) => ({ fsPath: path, path }),
  joinPath: (base: any, ...segments: string[]) => ({
    fsPath: `${base.fsPath}/${segments.join('/')}`
  })
};

export const window = {
  createStatusBarItem: () => ({
    text: '',
    tooltip: '',
    command: '',
    show: () => {},
    dispose: () => {}
  }),
  registerTreeDataProvider: () => ({ dispose: () => {} }),
  showInformationMessage: async () => {},
  showWarningMessage: async () => {},
  showErrorMessage: async () => {},
  withProgress: async (_opts: any, task: any) => task(),
  createWebviewPanel: () => ({
    webview: {
      html: '',
      onDidReceiveMessage: () => ({ dispose: () => {} }),
      asWebviewUri: (uri: any) => uri,
      cspSource: 'https:'
    },
    onDidDispose: () => ({ dispose: () => {} }),
    reveal: () => {},
    dispose: () => {}
  })
};

export const workspace = {
  workspaceFolders: [],
  getConfiguration: () => ({
    get: (key: string, defaultValue: any) => defaultValue
  }),
  openTextDocument: async () => ({}),
  onDidSaveTextDocument: () => ({ dispose: () => {} })
};

export const languages = {
  createDiagnosticCollection: (name?: string) => ({
    name,
    clear: () => {},
    set: (_uri: any, _diags: any[]) => {},
    delete: () => {},
    dispose: () => {}
  }),
  registerCodeLensProvider: () => ({ dispose: () => {} }),
  registerCodeActionsProvider: () => ({ dispose: () => {} })
};

export const commands = {
  registerCommand: (_cmd: string, _cb: any) => ({ dispose: () => {} }),
  executeCommand: async () => {}
};

export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

export enum ViewColumn {
  One = 1,
  Two = 2
}
