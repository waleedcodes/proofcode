# ProofCode

<div align="center">
  <img src="resources/icon.png" width="128" height="128" alt="ProofCode Logo" />
  <h3>AI writes code. ProofCode proves the change.</h3>
  <p><strong>Code Change Verification, Blast Radius Analysis & Deterministic Security Guardrails for Modern Development.</strong></p>

  <p>
    <a href="https://github.com/waleedcodes/proofcode/actions"><img src="https://img.shields.io/badge/CI-Passing-00E599?style=flat-square&logo=githubactions&logoColor=white" alt="CI Status" /></a>
    <a href="https://github.com/waleedcodes/proofcode/blob/working/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" /></a>
    <a href="https://marketplace.visualstudio.com/items?itemName=waleedcodes.proofcode"><img src="https://img.shields.io/badge/VS_Code_Marketplace-v0.1.0-8B5CF6?style=flat-square&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace" /></a>
    <a href="https://open-vsx.org/extension/waleedcodes/proofcode"><img src="https://img.shields.io/badge/Open_VSX-v0.1.0-orange?style=flat-square&logo=eclipseche&logoColor=white" alt="Open VSX" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
    <a href="https://vitest.dev/"><img src="https://img.shields.io/badge/Tests-70%2F70_Passing-10B981?style=flat-square&logo=vitest&logoColor=white" alt="Tests Passing" /></a>
  </p>
</div>

---

## 📖 Overview

AI coding agents (Cursor, GitHub Copilot, Claude Code, Devin, ChatGPT) can inspect codebases, generate hundreds of lines of code, and modify multiple files in seconds. **Writing code is no longer the bottleneck — trusting the result before shipping is.**

Real-world development teams using AI code constantly face:
- **Breaking Contract & Signature Drift**: The AI fixes a bug in an exported helper, changes parameter counts or return types, and silently breaks downstream callers.
- **Compiles, But Silently Broken**: Code passes `tsc`, but the AI omitted an `await` inside a conditional (`if (checkAuth())` returning a Promise that is always truthy in JS), or directly mutated React state with `.push()`, causing silent production failures.
- **Phantom Hallucinations**: The AI invents non-existent third-party package names, causing runtime `Cannot find module` crashes.
- **AI Cheating & Test Weakening**: The AI secretly deletes or weakens test assertions to make failing suites pass instead of fixing the root cause.
- **Scope Creep & Over-Editing**: The AI touches sensitive root configuration files (`.env`, `package.json`, `tsconfig.json`) outside its authorized scope.

**ProofCode** is the deterministic verification layer. It runs AST analysis, call graph dependency tracing, and automated guardrails on every Git diff before code ever reaches production.

---

## ⚡ Core Features

### 1. 💥 Blast Radius & Downstream Dependency Impact
ProofCode constructs a full Abstract Syntax Tree (AST) call graph of your TypeScript / JavaScript workspace and traces exactly which downstream functions, components, and API routes depend on the symbols modified in your Git diff.
- **Direct & Transitive Callers**: Maps every file and function referencing changed code.
- **Untested Callers Alert**: Flags whenever a modified function has downstream dependents with **zero test coverage**.
- **API Route Mapping**: Detects when modified services touch Next.js App Router (`route.ts`) or Pages Router endpoints.

### 2. 🛡️ AI Reliability & Deterministic Risk Engine
ProofCode runs 15+ deterministic, zero-hallucination static rules with verifiable evidence traces:

| Rule ID | Category | Name & What It Detects | Severity |
| :--- | :--- | :--- | :--- |
| **`PC-BREAK-001`** | Quality | **Breaking Contract & Signature Drift**: Parameter count shifts, incompatible argument types, or nullable return widening (`null \| undefined`) affecting downstream callers. | **HIGH** |
| **`PC-REL-008`** | Reliability | **Unawaited Promise in Conditionals**: Calling an async function without `await` inside `if (...)` or boolean checks (Promises are always truthy in JS, causing security bypasses). | **HIGH** |
| **`PC-TYPE-001`** | Quality | **Unsafe Type Assertion Bypass**: AI using `as any`, `<any>`, or `@ts-ignore` / `@ts-nocheck` to silence compiler errors instead of fixing interfaces. | **MEDIUM / HIGH** |
| **`PC-IMPORT-001`** | Reliability | **Phantom / Hallucinated Package Imports**: Modules imported that do not exist in `package.json`, preventing runtime resolution crashes. | **HIGH** |
| **`PC-MUT-001`** | Reliability | **Direct State Mutation in React/Redux**: Direct array/object mutations (`.push()`, `.splice()`) called on state or inside setter callbacks (`setX(prev => { prev.push() })`), breaking React reactivity. | **HIGH** |
| **`PC-ENV-001`** | Reliability | **Unchecked Environment Variable Access**: Forceful non-null assertions (`process.env.VAR!`) without fallback values or startup validation. | **HIGH** |
| **`PC-DATA-002`** | Security | **Silent Security Field Drop**: AI refactoring payload structures and inadvertently dropping critical fields (`tenantId`, `userId`, `updatedAt`). | **HIGH** |
| **`PC-STUB-001`** | Quality | **Incomplete AI Stubs & Placeholders**: Unimplemented stubs (`throw new Error("TODO")`, `Not implemented yet`) left behind in production code paths. | **HIGH** |
| **`PC-REL-009`** | Reliability | **Silent Error Swallowing**: Catch blocks that silently swallow exceptions without logging or re-throwing. | **MEDIUM** |
| **`PC-TEST-001`** | Quality | **AI Test Weakening & Deletion Guard**: Detecting when a Git diff deletes or weakens assertions in test suites. | **HIGH** |
| **`PC-SCOPE-001`** | Security | **Scope Creep & Sensitive File Guard**: Unauthorized modifications to sensitive root configs (`.env`, `package.json`, `tsconfig.json`). | **HIGH** |
| **`PC-SEC-001`** | Security | **SQL Injection**: Template literals or string concatenation in database query statements. | **HIGH** |
| **`PC-AUTH-001`** | Security | **Missing Route Authorization**: API route handlers accessing database resources without session authentication. | **HIGH** |
| **`PC-DATA-001`** | Reliability | **Unhandled Database Nulls**: Query results accessed directly without null guard checks or optional chaining. | **MEDIUM** |
| **`PC-SEC-003`** | Security | **Path Traversal in File Operations**: Unsanitized user inputs passed to file system functions without `path.basename()`. | **HIGH** |
| **`PC-SEC-007`** | Security | **Permissive Wildcard CORS**: `Access-Control-Allow-Origin: *` in authenticated APIs. | **HIGH** |
| **`PC-REL-007`** | Reliability | **Regular Expression Denial of Service (ReDoS)**: Nested quantifiers in regular expressions. | **HIGH** |

### 3. 🧪 Targeted Live Test Execution (<1s)
- **Autodetected Runners**: Automatically detects Vitest, Jest, or Mocha in your project.
- **Smart Target Slicing**: Runs only the test files directly linked to the modified symbols in your Git diff rather than waiting for the entire test suite.
- **Live Stack Trace Viewer**: Clean ANSI-stripped error logs and expandable stack traces rendered directly in the dashboard.

### 4. 🪝 Automated Git Pre-Commit Hook
Prevent broken AI code from ever being committed:
```bash
# Install deterministic pre-commit hook (runs in <1s)
proofcode install-hook

# Uninstall whenever needed
proofcode uninstall-hook
```
If ProofCode detects critical risks or breaking contracts, the commit is blocked automatically with clear remediation instructions.

### 5. 🤖 One-Command CI/CD Setup (`proofcode init-ci`)
Drop automated GitHub Actions protection into any repository with one command:
```bash
proofcode init-ci
```
- Installs `.github/workflows/proofcode.yml`.
- Automatically analyzes every Pull Request.
- Posts and updates an idempotent PR comment with the complete Markdown verification report.
- Blocks merge if verification score drops below 75% or has high-severity risks (`--strict`).

### 6. 📊 Glassmorphic Verification Dashboard
Inspect full verification metrics in an interactive, dark-mode glassmorphic dashboard:
- **Radial Score Gauge**: Visual score from 0% to 100% with instant status (`READY TO SHIP`, `NEEDS REVIEW`, or `BLOCKED`).
- **Interactive Blast Tree Call Graph**: Visual tree diagram connecting root modifications to affected callers and API routes with live status badges.
- **1-Click Quick Fix Buttons**: Fix detected risks (`as any`, `@ts-ignore`, unhandled promises, missing null guards) directly from the dashboard.
- **"📋 Copy PR Summary"**: One click copies a formatted GitHub Markdown report ready for Slack, PRs, or issue trackers.

---

## 🚀 Quick Start

### Installation

#### Install VS Code Extension (from VSIX)
1. Download `proofcode-0.1.0.vsix` from [Releases](https://github.com/waleedcodes/proofcode/releases).
2. In VS Code, open Extensions (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>).
3. Click **`···`** in the top-right corner and select **"Install from VSIX..."**.
4. Select `proofcode-0.1.0.vsix`.

#### Install Standalone CLI via npm
```bash
npm install -g proofcode
```

---

## 🛠️ CLI Reference

```bash
# Verify working tree changes against Git HEAD
proofcode verify

# Verify only staged git changes (git diff --cached)
proofcode verify --staged

# Generate PR markdown comment summary and write to file
proofcode pr-summary -o pr-comment.md

# Install automated git pre-commit hook in .git/hooks/pre-commit
proofcode install-hook

# Install GitHub Actions workflow (.github/workflows/proofcode.yml)
proofcode init-ci

# CI Mode: Emit GitHub Actions annotations and append to Step Summary
proofcode verify --ci --strict

# Run targeted live unit tests alongside verification
proofcode verify --live

# Output report as JSON or formatted GitHub Markdown
proofcode verify --json
proofcode verify --markdown
```

### Options & Flags
- `--staged`: Verify only staged git changes (`git diff --cached`).
- `--live`: Run targeted project unit tests (Vitest, Jest, Mocha).
- `--ci`: Output GitHub Actions annotations (`::error`, `::warning`) and write to Step Summary.
- `--strict`: Exit code 1 if score < 75% or verdict is not `READY_TO_SHIP`.
- `--markdown`, `-m`: Output report as formatted GitHub Flavored Markdown.
- `--json`: Output report as structured JSON.
- `-o, --output <file>`: Write output directly to the specified file path.

---

## 📋 Sample Verification Output

```text
====================================================
             PROOFCODE CHANGE VERIFICATION          
====================================================
Verdict:       BLOCKED
Score:         42%
Files Changed: 3
Functions:     5 affected
API Routes:    1 affected
Risks:         🔴 2 High | 🟠 1 Med | 🟢 0 Low
----------------------------------------------------
WHAT COULD THIS CHANGE BREAK?
- [HIGH] Breaking Contract: Symbol 'getOrder' parameter count changed from 1 to 2.
  Impact: 2 downstream caller(s) broken.
  Dependents: Dashboard.tsx:42, orderService.ts:88
- [HIGH] Reliability: Unawaited Async Call in Conditional Statement
  Impact: Call to 'checkAuth()' is evaluated inside 'if (...)' without 'await'.
  Dependents: route.ts (api/orders)
----------------------------------------------------
CRITICAL FINDINGS:
[HIGH] Breaking Contract Drift at src/services/orderService.ts:18
  -> Function 'getOrder' now requires 2 parameters, but caller 'Dashboard.tsx:42' passes 1.
[HIGH] Unawaited Async Call in Conditional Statement at src/app/api/orders/route.ts:12
  -> Call to 'checkAuth()' returns a Promise object without 'await'.
====================================================
```

---

## ⚙️ Configuration: `.proofcode/rules.md`

Define custom architectural guardrails for your repository in `.proofcode/rules.md`:

```markdown
# Architectural Rules

## Rule 1: Authentication & Authorization
- **Pattern**: `src/app/api/**/route.ts`
- **Severity**: HIGH
- **Requirement**: All public API handlers modifying database resources must verify session authentication.

## Rule 2: Data Privacy & Secret Exposure
- **Pattern**: `src/app/api/**`
- **Severity**: HIGH
- **Requirement**: Never return password hashes (`passwordHash`), secret keys, or sensitive credentials in API response JSON.

## Rule 3: Resource Ownership
- **Pattern**: `src/app/api/orders/**`
- **Severity**: HIGH
- **Requirement**: Queries for specific records must enforce user ownership (`userId` constraint) to prevent IDOR attacks.
```

---

## 🧪 Quality & Verification Standards

ProofCode is rigorously tested against its own codebase:
- **Test Suite**: **70 / 70 passing tests across 17 test suites** (`vitest`).
- **Dogfood Verification**: ProofCode self-verifies on every commit with **100% score**.
- **TypeScript**: Strict typechecking (`tsc --noEmit`), 0 errors.
- **ESLint**: Complete code compliance, 0 warnings.
- **Bundle Performance**: Production VS Code extension bundle built with esbuild (`dist/extension.js` at **~68 KB**).

---

## 📄 License

MIT License © 2026 ProofCode Contributors. See [LICENSE](LICENSE) for details.
