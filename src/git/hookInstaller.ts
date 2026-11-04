import * as fs from 'node:fs';
import * as path from 'node:path';

export class HookInstaller {
  /**
   * Finds the root of the git repository starting from startDir and walking upwards.
   */
  public static findGitRoot(startDir: string): string | null {
    let current = path.resolve(startDir);
    while (true) {
      const gitDir = path.join(current, '.git');
      if (fs.existsSync(gitDir)) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }

  /**
   * Generates the shell script content for the pre-commit hook.
   */
  public static getHookContent(): string {
    return `# --- BEGIN PROOFCODE HOOK ---
# ProofCode Git Pre-commit Hook
# Deterministic Guardrails: Blocks breaking contracts, unawaited promises, dropped fields, and rule violations.

echo "🛡️  Running ProofCode verification on staged changes..."

if command -v proofcode >/dev/null 2>&1; then
  proofcode verify --staged
elif [ -f "./node_modules/.bin/proofcode" ]; then
  ./node_modules/.bin/proofcode verify --staged
else
  npx proofcode verify --staged
fi

PROOFCODE_EXIT=$?

if [ $PROOFCODE_EXIT -ne 0 ]; then
  echo ""
  echo "❌ ProofCode verification BLOCKED this commit."
  echo "   Fix the critical risks or breaking contracts above, or bypass with: git commit --no-verify"
  echo ""
  exit 1
fi

echo "✅ ProofCode: Staged changes verified. Ready to commit!"
# --- END PROOFCODE HOOK ---
`;
  }

  /**
   * Installs the pre-commit hook in .git/hooks/pre-commit.
   */
  public static installPreCommitHook(targetDir: string): {
    success: boolean;
    hookPath?: string;
    message: string;
  } {
    const gitRoot = this.findGitRoot(targetDir);
    if (!gitRoot) {
      return { success: false, message: `No git repository found in or above ${targetDir}` };
    }

    const hooksDir = path.join(gitRoot, '.git', 'hooks');
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    const hookPath = path.join(hooksDir, 'pre-commit');
    const hookSnippet = this.getHookContent();

    if (fs.existsSync(hookPath)) {
      const existing = fs.readFileSync(hookPath, 'utf8');
      if (existing.includes('BEGIN PROOFCODE HOOK')) {
        return {
          success: true,
          hookPath,
          message: 'ProofCode pre-commit hook is already installed.'
        };
      }
      const updated = existing.trimEnd() + '\n\n' + hookSnippet;
      fs.writeFileSync(hookPath, updated, 'utf8');
    } else {
      fs.writeFileSync(hookPath, `#!/bin/sh\n\n${hookSnippet}`, 'utf8');
    }

    try {
      fs.chmodSync(hookPath, 0o755);
    } catch (err: unknown) {
      if (process.env.DEBUG) {
        console.warn('ProofCode: Unable to chmod hook file:', err);
      }
    }

    return {
      success: true,
      hookPath,
      message: `Successfully installed ProofCode pre-commit hook at ${hookPath}`
    };
  }

  /**
   * Uninstalls the ProofCode pre-commit hook.
   */
  public static uninstallPreCommitHook(targetDir: string): {
    success: boolean;
    message: string;
  } {
    const gitRoot = this.findGitRoot(targetDir);
    if (!gitRoot) {
      return { success: false, message: `No git repository found in or above ${targetDir}` };
    }

    const hookPath = path.join(gitRoot, '.git', 'hooks', 'pre-commit');
    if (!fs.existsSync(hookPath)) {
      return { success: true, message: 'No pre-commit hook found.' };
    }

    const content = fs.readFileSync(hookPath, 'utf8');
    if (!content.includes('BEGIN PROOFCODE HOOK')) {
      return { success: true, message: 'ProofCode hook not found in pre-commit hook.' };
    }

    const regex = /# --- BEGIN PROOFCODE HOOK ---[\s\S]*?# --- END PROOFCODE HOOK ---\n?/g;
    const cleaned = content.replace(regex, '').trim();

    if (cleaned.length === 0 || cleaned === '#!/bin/sh') {
      fs.unlinkSync(hookPath);
      return { success: true, message: `Removed empty pre-commit hook file: ${hookPath}` };
    } else {
      fs.writeFileSync(hookPath, cleaned + '\n', 'utf8');
      return { success: true, message: `Removed ProofCode block from ${hookPath}` };
    }
  }
}
