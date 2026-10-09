import { describe, expect, it } from 'vitest';
import { DiffParser } from '../src/git/diffParser';

describe('DiffParser', () => {
  it('should parse an empty diff without error', () => {
    const result = DiffParser.parse('', '/test/root');
    expect(result.files).toHaveLength(0);
    expect(result.totalFilesChanged).toBe(0);
    expect(result.totalInsertions).toBe(0);
    expect(result.totalDeletions).toBe(0);
  });

  it('should parse a standard unified diff with additions and deletions', () => {
    const sampleDiff = `diff --git a/src/user.ts b/src/user.ts
index e69de29..49e29a1 100644
--- a/src/user.ts
+++ b/src/user.ts
@@ -10,3 +10,5 @@ export function getUser(id: string) {
-  return db.user.find(id);
