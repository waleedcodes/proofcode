# Change Log

All notable changes to the "proofcode" extension will be documented in this file.

## [0.1.0] - 2026-10-12

### Initial Release
- **Change Verification Engine**: Deterministic AST analysis and Git diff parser mapping lines, hunks, and touched symbols.
- **Project Dependency Graph**: Complete caller/callee resolution and blast radius calculation for TypeScript/JavaScript codebases.
- **Deterministic Risk Engine**:
  - `PC-SEC-001`: SQL Injection detection in template literals.
  - `PC-AUTH-001`: Missing Authorization checks in API route handlers (Next.js App & Pages Router).
  - `PC-DATA-001`: Unhandled null/undefined database query results.
  - `PC-REL-006`: Unhandled asynchronous operations lacking try/catch or promise catch blocks.
- **Architectural Rules Engine**: Markdown-based architectural policy enforcement via `.proofcode/rules.md`.
- **VS Code Native Integration**:
  - Activity Bar view container with emerald shield icon.
  - Sidebar Tree View with verification score, verdicts, and findings.
  - Inline CodeLens showing downstream callers and untested blast radius.
  - 1-click Quick-Fix (CodeActions) for automatic risk remediation.
  - Interactive Glassmorphic Webview Dashboard with radial score gauge, tab navigation, and visual blast tree call graph.
- **Standalone CLI**: Executable `proofcode` CLI supporting `--staged`, `--live`, `--markdown`, and `--json` outputs.
