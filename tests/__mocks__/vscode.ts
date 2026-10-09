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
