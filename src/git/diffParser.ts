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
      }

      if (!currentFile) {
        continue;
      }

      if (line.startsWith('new file mode ')) {
        currentFile.isNew = true;
      } else if (line.startsWith('deleted file mode ')) {
        currentFile.isDeleted = true;
      } else if (line.startsWith('similarity index ')) {
        currentFile.isRenamed = true;
      } else if (line.startsWith('rename from ')) {
        currentFile.oldPath = line.substring('rename from '.length).trim();
      } else if (line.startsWith('rename to ')) {
        currentFile.newPath = line.substring('rename to '.length).trim();
      } else if (line.startsWith('@@ ')) {
        // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@ [optional context]
        if (currentHunk) {
          currentFile.hunks.push(currentHunk);
        }

        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
        if (hunkMatch) {
          const oldStart = parseInt(hunkMatch[1], 10);
          const oldLines = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
          const newStart = parseInt(hunkMatch[3], 10);
          const newLines = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;

          currentHunk = {
            oldStart,
            oldLines,
            newStart,
            newLines,
            header: line,
            lines: []
          };
          currentNewLine = newStart;
        }
      } else if (currentHunk) {
        currentHunk.lines.push(line);

        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentFile.addedLines.push(currentNewLine);
          totalInsertions++;
          currentNewLine++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentFile.deletedLines.push(currentHunk.newStart);
          totalDeletions++;
        } else if (line.startsWith(' ')) {
          currentNewLine++;
        }
      }
    }

    if (currentHunk && currentFile) {
      currentFile.hunks.push(currentHunk);
    }
    if (currentFile) {
      files.push(currentFile);
    }

    // Compute consolidated modifiedLineRanges per file
    for (const file of files) {
      file.modifiedLineRanges = this.computeLineRanges(file.addedLines);
    }

    return {
      repoRoot,
      files,
      totalFilesChanged: files.length,
      totalInsertions,
      totalDeletions
    };
  }

  private static computeLineRanges(lineNumbers: number[]): ChangedLineRange[] {
    if (lineNumbers.length === 0) {
      return [];
    }

    const sorted = Array.from(new Set(lineNumbers)).sort((a, b) => a - b);
    const ranges: ChangedLineRange[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      if (current === end + 1) {
        end = current;
      } else {
        ranges.push({ start, end });
        start = current;
        end = current;
      }
    }
    ranges.push({ start, end });

    return ranges;
  }
}
