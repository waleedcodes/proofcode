# ProofCode

<div align="center">
  <img src="resources/icon.png" width="128" height="128" alt="ProofCode Logo" />
  <h3>AI writes code. ProofCode proves the change.</h3>
  <p><strong>Code Change Verification, Blast Radius Analysis & Deterministic Security Guardrails for Modern Development.</strong></p>

  <p>
    <a href="https://github.com/waleedcodes/proofcode/actions"><img src="https://img.shields.io/badge/CI-Passing-00E599?style=flat-square&logo=githubactions&logoColor=white" alt="CI Status" /></a>
    <a href="https://github.com/waleedcodes/proofcode/blob/working/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" /></a>
    <a href="https://marketplace.visualstudio.com/items?itemName=proofcode.proofcode"><img src="https://img.shields.io/badge/VS_Code_Extension-v0.1.0-8B5CF6?style=flat-square&logo=visualstudiocode&logoColor=white" alt="Version" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
    <a href="https://vitest.dev/"><img src="https://img.shields.io/badge/Tests-34%2F34_Passing-10B981?style=flat-square&logo=vitest&logoColor=white" alt="Tests Passing" /></a>
  </p>
</div>

---

## 📖 Overview

AI coding agents (Cursor, GitHub Copilot, Claude Code, Devin, ChatGPT) can inspect codebases, generate hundreds of lines of code, and modify multiple files in seconds. **Writing code is no longer the bottleneck — trusting the result before shipping is.**

AI assistants frequently introduce:
- **Silent regressions in downstream callers** when modifying shared utilities.
- **Untested code paths** that bypass test suites without warning.
- **Security vulnerabilities** (SQL injection in dynamic queries, missing authorization in API handlers).
- **Unhandled null values and uncaught async operations** that cause production crashes.
- **Violations of architectural policies** (e.g., exposing sensitive fields like `passwordHash` in responses).

**ProofCode** is the missing verification layer. It runs deterministic static analysis and dependency graph inspection on every Git diff to answer three critical questions:
1. **What did this change actually affect?** (Blast radius & downstream dependency impact)
2. **What could it break?** (Untested callers, API route impact, risk evidence)
3. **Is it safe to ship?** (Deterministic score gauge & verdict: `READY_TO_SHIP`, `NEEDS_REVIEW`, or `BLOCKED`)

---

## ⚡ Core Features

### 1. 💥 Blast Radius & Downstream Dependency Impact
ProofCode constructs a full Abstract Syntax Tree (AST) call graph of your TypeScript / JavaScript workspace and traces exactly which downstream functions, components, and API routes depend on the symbols modified in your Git diff.
- **Direct & Transitive Callers**: Maps every file and function referencing changed code.
- **Untested Callers Alert**: Flags whenever a modified function has downstream dependents with **zero test coverage**.
- **API Route Mapping**: Detects when modified services touch Next.js App Router (`route.ts`) or Pages Router endpoints.

### 2. 🛡️ Deterministic Static Risk Engine
Unlike LLM-based reviewers that hallucinate or provide inconsistent advice, ProofCode runs fast, deterministic AST static analysis rules with precise source code evidence:
- **`PC-SEC-001` (SQL Injection)**: Detects dynamic template literals and unescaped variable interpolations inside database query functions (`db.query`, `prisma.$queryRaw`, etc.).
- **`PC-AUTH-001` (Missing Route Authorization)**: Detects API route handlers (`GET`, `POST`, `PUT`, `DELETE`) accessing database queries without session or authentication verification.
- **`PC-DATA-001` (Unhandled Database Nulls)**: Detects database lookup results accessed without null/undefined guard clauses (`data.field` without `if (!data)` or optional chaining).
- **`PC-REL-006` (Unhandled Asynchronous Operations)**: Detects unhandled `await` expressions or Promises lacking an enclosing `try/catch` block or `.catch()` handler.

### 3. 📐 Project Architectural Policy Enforcement
Enforce your team's architectural standards directly using simple, human-readable Markdown files in `.proofcode/rules.md`:
- Restrict sensitive fields (e.g. `passwordHash`, `secretKey`) from being included in API responses.
- Ensure all mutation routes implement user ownership constraints (`userId === session.user.id`).
- Check that core payment and billing services always have dedicated regression test coverage.

### 4. 📊 Glassmorphic Verification Dashboard
Inspect full verification metrics in an interactive, dark-mode glassmorphic dashboard:
- **Animated SVG Radial Score Gauge**: Instant visual score from 0% to 100%.
- **Interactive Visual Blast Tree Call Graph**: Visual tree diagram connecting root modifications to affected callers and API routes with live status badges.
- **Live Search & Filter Toolbar**: Quickly filter downstream dependents and isolate untested callers with one click.
- **Tabbed Navigation**: Switch between **Overview**, **Change Impact**, **Risk Findings**, **Project Rules**, and **Raw JSON Report**.

### 5. 💡 Editor Integration (CodeLens & 1-Click Quick-Fixes)
- **Inline CodeLens**: Shows downstream impact metrics directly above changed functions in the editor (e.g. `⚡ ProofCode: 4 callers (4 untested) · View Blast Radius`).
- **1-Click Quick-Fixes (CodeActions)**: Press <kbd>Cmd</kbd>+<kbd>.</kbd> (or <kbd>Ctrl</kbd>+<kbd>.</kbd>) over detected risks to automatically apply:
  - *"ProofCode: Wrap in try/catch block"*
  - *"ProofCode: Add null guard check"*

### 6. 🖥️ Dual Form Factor: Extension + Standalone CLI
Run ProofCode wherever you develop:
- **VS Code Extension**: Real-time feedback, activity bar sidebar, CodeLens, diagnostics, and webview dashboard.
- **Standalone CLI (`proofcode`)**: Lightweight executable for terminal workflows, pre-commit Git hooks, and CI/CD pipelines.

---

## 🚀 Quick Start

### Installation

#### Install from VSIX
1. Download `proofcode-0.1.0.vsix` from the [Releases](https://github.com/waleedcodes/proofcode/releases) page.
2. In VS Code, open the Extensions view (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>).
3. Click the **`···`** menu in the top-right corner and select **"Install from VSIX..."**.
4. Select `proofcode-0.1.0.vsix`.

#### Install Standalone CLI via npm
```bash
npm install -g proofcode
```

---

## 🛠️ Usage

### Using the VS Code Extension

1. **Activity Bar**: Click the emerald **ProofCode** shield icon in the left activity bar to open the **Verification Overview** sidebar tree view.
2. **Run Verification**: Open the Command Palette (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) and select:
   - `ProofCode: Verify Code Change` (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> <kbd>V</kbd>)
   - `ProofCode: Open Verification Dashboard`
   - `ProofCode: Initialize Rules File (.proofcode/rules.md)`
   - `ProofCode: Export Verification Report (Markdown / JSON)`

### Using the Standalone CLI

```bash
# Verify working tree changes against Git HEAD
proofcode verify

# Verify only staged git changes (ideal for pre-commit hooks)
proofcode verify --staged

# Run full live test checks and compiler validation alongside static analysis
proofcode verify --live

# Output report as clean GitHub Markdown (great for PR comments)
proofcode verify --markdown

# Output report as structured JSON for custom tooling
proofcode verify --json

# Initialize a default rules template
proofcode init
```

---

## 📋 Sample Verification Output

```text
====================================================
             PROOFCODE CHANGE VERIFICATION          
====================================================
Verdict:       BLOCKED
Score:         0%
Files Changed: 9
Functions:     11 affected
API Routes:    2 affected
Risks:         🔴 3 High | 🟠 0 Med | 🟢 9 Low
----------------------------------------------------
WHAT COULD THIS CHANGE BREAK?
- [HIGH] Authentication & Session Flow: Symbol 'getUser' was modified in auth.ts.
  Impact: 4 downstream caller(s) depend on this behavior. 4 caller(s) lack automated test coverage.
  Dependents: renderAdminPanel (AdminPanel.tsx), renderDashboard (Dashboard.tsx), getOrderForUser (orderService.ts), processPayment (paymentService.ts)
- [HIGH] Data Security: Potential SQL Injection (Template Literal)
  Impact: Database query uses unescaped string interpolation with dynamic variables, exposing the endpoint to SQL injection.
  Dependents: route.ts (api/auth/login)
----------------------------------------------------
CRITICAL FINDINGS:
[HIGH] Potential SQL Injection (Template Literal) at src/app/api/auth/login/route.ts:8
  -> Database query uses unescaped string interpolation with dynamic variables.
[HIGH] Missing Authorization Check in API Route (POST) at src/app/api/auth/login/route.ts:3
  -> API route handler 'POST' accesses database resources without verifying user authentication.
----------------------------------------------------
RULE VIOLATIONS:
- Rule 2 (Data Privacy): Detected sensitive field "passwordHash" in response payload.
- Rule 3 (Resource Ownership): Query in "orders/[id]/route.ts" queries orders without verifying userId.
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
- **Requirement**: Never return password hashes (`passwordHash`), secret keys, or sensitive internal credentials in API response JSON payloads.

## Rule 3: Resource Ownership
- **Pattern**: `src/app/api/orders/**`
- **Severity**: HIGH
- **Requirement**: Queries for specific records must verify user ownership (`userId` constraint) to prevent Insecure Direct Object References (IDOR).
```

---

## 🤖 CI/CD Integration: GitHub Actions

Automate change verification on every Pull Request with a GitHub Actions workflow:

```yaml
name: ProofCode Verification

on:
  pull_request:
    branches: [main, master, working]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install ProofCode
        run: npm install -g proofcode

      - name: Run ProofCode Verification
        run: proofcode verify --markdown > pr-verification.md

      - name: Attach PR Comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const body = fs.readFileSync('pr-verification.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

---

## 🏛️ Architecture & Extension Settings

ProofCode contributes the following configuration options in VS Code:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `proofcode.enableOnSave` | `true` | Automatically run verification whenever a file is saved. |
| `proofcode.strictScoreThreshold` | `75` | Minimum score percentage required for `READY_TO_SHIP` verdict. |
| `proofcode.blockOnHighRisk` | `true` | Automatically block changes (`BLOCKED` verdict) if $\ge 1$ High risk is found. |
| `proofcode.showCodeLens` | `true` | Show inline CodeLens annotations above modified symbols. |
| `proofcode.runLiveTests` | `false` | Run automated test suites (vitest, jest, etc.) during verification. |

---

## 🧪 Quality & Test Standards

ProofCode is thoroughly tested and verified:
- **Test Suite**: 34 / 34 passing tests across 13 suites (`vitest`).
- **TypeScript**: Strict typechecking (`tsc --noEmit`), 0 errors.
- **ESLint**: `@typescript-eslint` recommended rules, 0 warnings.
- **Build Performance**: Fast esbuild bundling (`dist/extension.js` and `dist/cli.js` built in `<800ms`).

---

## 📄 License

MIT License © 2026 ProofCode Contributors. See [LICENSE](LICENSE) for details.
