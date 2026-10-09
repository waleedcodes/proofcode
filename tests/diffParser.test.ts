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
+  const user = await db.user.findUnique({ where: { id } });
+  return user;
 }
+export function deleteUser() {}
`;

    const result = DiffParser.parse(sampleDiff, '/workspace');
    expect(result.files).toHaveLength(1);
    const file = result.files[0];
    expect(file.newPath).toBe('src/user.ts');
    expect(file.addedLines).toEqual([10, 11, 13]);
    expect(file.deletedLines).toEqual([10]);
    expect(file.modifiedLineRanges).toEqual([
      { start: 10, end: 11 },
      { start: 13, end: 13 }
    ]);
  });

  it('should identify new files correctly', () => {
    const newFileDiff = `diff --git a/src/new-route.ts b/src/new-route.ts
new file mode 100644
index 0000000..49e29a1
--- /dev/null
+++ b/src/new-route.ts
@@ -0,0 +1,3 @@
+export async function GET() {
+  return Response.json({ status: 'ok' });
+}
`;

    const result = DiffParser.parse(newFileDiff, '/workspace');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].isNew).toBe(true);
    expect(result.files[0].addedLines).toEqual([1, 2, 3]);
  });
});
