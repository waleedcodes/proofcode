# Change Log

All notable changes to the "proofcode" extension will be documented in this file.

## [0.1.0] - 2026-11-13

### AI Reliability & Anti-Hallucination Engine
- **Breaking Contract & Signature Drift (`PC-BREAK-001`)**:
  - Detects parameter count shifts on exported functions traced to downstream callers across workspace.
  - Detects incompatible parameter type changes.
  - Detects nullable return type widening (`null | undefined`) lacking caller null guards.
- **Unawaited Promise Trap (`PC-REL-008`)**:
  - Detects async calls evaluated inside `if (...)` and boolean conditionals without `await` (which are always truthy in JS, causing silent logic and authorization bypasses).
  - Implemented local function AST classifier and synchronous method matrix (`Set.has`, `Array.isArray`, `ts.is*`) to ensure zero false positives.
- **Dangerous Type Assertion Bypass (`PC-TYPE-001`)**:
  - Detects `as any`, `<any>`, and `@ts-ignore` / `@ts-nocheck` suppression directives introduced by AI to silence compiler diagnostics.
- **Phantom / Hallucinated Package Imports (`PC-IMPORT-001`)**:
  - Validates all third-party imports against root `package.json` dependencies to prevent runtime module resolution crashes.
- **Direct State Mutation Guard (`PC-MUT-001`)**:
  - Flags direct array/object mutations (`.push()`, `.splice()`) on state variables or inside setter callbacks (`setTodos(prev => { prev.push() })`), preventing silent React reactivity bugs.
- **Unchecked Environment Variable Guard (`PC-ENV-001`)**:
  - Detects non-null asserted environment variables (`process.env.VAR!`) lacking runtime fallbacks or startup guards.
- **Silent Security Field Drop (`PC-DATA-002`)**:
  - Detects when an AI refactor accidentally omits critical payload fields (`tenantId`, `userId`, `updatedAt`).
- **Incomplete AI Stubs & Placeholders (`PC-STUB-001`)**:
  - Flags `throw new Error("TODO: implement")` and placeholder stubs in production code paths.
- **Silent Error Swallowing in Catch Blocks (`PC-REL-009`)**:
  - Flags empty catch clauses and bare returns concealing runtime errors from telemetry.
- **AI Test Weakening Guard (`PC-TEST-001`)**:
  - Flags Git diffs that delete or weaken assertions in test files.
- **Scope Creep & Sensitive File Guard (`PC-SCOPE-001`)**:
  - Alerts when changes touch sensitive root configs (`.env`, `package.json`, `tsconfig.json`).

### Git & CI/CD Automation
- **Automated Git Pre-Commit Hook**:
  - Added `proofcode install-hook` and `proofcode uninstall-hook` for instantaneous (<1s) staged diff verification before commits.
- **One-Command CI/CD Setup**:
  - Added `proofcode init-ci` to automatically drop a production-ready `.github/workflows/proofcode.yml` into any repository.
  - Posts and updates an idempotent PR comment with verification results and blocks merging if critical risks are detected.
- **PR Summary & Markdown Export**:
  - Added `proofcode pr-summary` and `-o, --output <file>` for CI workflows.

### Targeted Live Test Execution
- **Targeted Test Runner**:
  - Autodetects Vitest, Jest, and Mocha.
  - Slices test execution to only tests covering touched symbols in <1s.
  - ANSI-stripped error log sanitizer and expandable stack trace viewer in the dashboard.

### Dashboard & Quick-Fix Upgrades
- **In-Webview 1-Click Quick Fixes**:
  - Direct `⚡ Quick Fix` buttons inside the Webview Dashboard for `as any`, `@ts-ignore`, unhandled promises, and phantom imports.
- **Toolbar PR Summary Copy**:
  - One-click `📋 Copy PR Summary` button in dashboard header.

### Core Engine & Architecture
- **Dependency Graph & Blast Radius Analysis**:
  - AST-based workspace symbol call graph tracking direct and transitive callers, untested callers, and API routes.
- **Architectural Policy Enforcement**:
  - Markdown-driven policy rules in `.proofcode/rules.md`.
- **Test Coverage**:
  - Expanded test suite to **70 passing tests across 17 test files** (100% passing).
- **Bundle Optimization**:
  - Production VS Code extension bundle maintained at **~68 KB**.
