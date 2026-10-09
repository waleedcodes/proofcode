import { ChangedLineRange, DiffHunk, FileDiff, GitDiffResult } from '../types';

/**
 * Parses unified git diff output into structured FileDiff models
 */
export class DiffParser {
  public static parse(rawDiff: string, repoRoot: string = ''): GitDiffResult {
    const files: FileDiff[] = [];
    if (!rawDiff || rawDiff.trim().length === 0) {
      return {
        repoRoot,
        files: [],
        totalFilesChanged: 0,
        totalInsertions: 0,
        totalDeletions: 0
      };
    }

    const lines = rawDiff.split('\n');
    let currentFile: FileDiff | null = null;
    let currentHunk: DiffHunk | null = null;
    let currentNewLine = 0;
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // New file diff header: diff --git a/path b/path
      if (line.startsWith('diff --git ')) {
        if (currentHunk && currentFile) {
          currentFile.hunks.push(currentHunk);
          currentHunk = null;
        }
        if (currentFile) {
          files.push(currentFile);
        }

        const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
        const oldPath = match ? match[1] : '';
        const newPath = match ? match[2] : '';

        currentFile = {
          oldPath,
          newPath: newPath || oldPath,
          isNew: false,
          isDeleted: false,
          isRenamed: false,
          hunks: [],
          addedLines: [],
          deletedLines: [],
          modifiedLineRanges: []
        };
        continue;
