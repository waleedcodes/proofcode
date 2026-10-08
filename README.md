# ProofCode

> **AI writes code. ProofCode proves the change.**

ProofCode is a planned **VS Code extension for Code Change Verification**. It does not generate code, chat with your codebase, or act as another Copilot. It answers one question every developer faces after an AI agent edits their project:

> **What did this change actually affect, what could it break, and what evidence do we have that it is safe?**

**Status:** Idea / pre-development. Working name only — name, domain, and VS Code Marketplace availability must be checked before committing.

---

## Table of Contents

1. [Why ProofCode Exists](#1-why-proofcode-exists)
2. [Market Position](#2-market-position)
3. [The Core Problem](#3-the-core-problem)
4. [The Killer Workflow](#4-the-killer-workflow)
5. [Core Features](#5-core-features)
6. [What ProofCode Is NOT](#6-what-proofcode-is-not)
7. [MVP: Version 0.1](#7-mvp-version-01)
8. [Architecture](#8-architecture)
9. [Tech Stack](#9-tech-stack)
10. [Project Structure](#10-project-structure)
11. [Development Roadmap](#11-development-roadmap)
12. [Business Model](#12-business-model)
13. [Future Vision: "What Could This Change Break?"](#13-future-vision-what-could-this-change-break)
14. [Positioning and Branding](#14-positioning-and-branding)
15. [Risks and Open Questions](#15-risks-and-open-questions)
16. [Next Steps](#16-next-steps)

---

## 1. Why ProofCode Exists

AI coding agents can now inspect a codebase, edit many files, and run tests. Writing code is no longer the bottleneck. **Trusting the result is.**

Developers report the same frustrations again and again:

| Pain point | Reported figure* |
|---|---|
| Lost time to code that looks right but is wrong | **69.3%** of respondents |
| Lost time to generated code that is hard to review | **54.2%** of respondents |
| Lost time because the AI lacked context | **49.3%** of respondents |

*Source: 2026 Stack Overflow Developer Survey (as cited in the original research notes).*

A large empirical study of **304,362 AI-authored commits** also found that:

- **More than 15%** of commits from each studied AI assistant introduced at least one issue.
- **24.2%** of the tracked AI-introduced issues were still present in the latest revision of the code.

*Source: arXiv study "Debt Behind the AI Boom" (as cited in the original research notes).*

> ⚠️ **Verify before publishing.** Re-check every statistic against its original source before using it on a website, Marketplace page, or pitch.

The takeaway: AI-generated changes are fast to produce and slow to trust. ProofCode targets that gap.

---

## 2. Market Position

### The original idea and why it changed

The first idea was an **"AI codebase context"** extension. A fresh market check showed that space is already getting crowded:

- VS Code itself now has agent workflows that inspect code, make changes, run tests, and let developers review results.
- Several extensions already position themselves around codebase context, code graphs, and auditable AI changes.

### The pivot

Instead of helping AI *understand* code, ProofCode helps humans *verify* what AI *changed*.

| Crowded market | ProofCode's opening |
|---|---|
| Chat with your code | Verify a specific change |
| Generate code | Measure the impact of code |
| Explain this code | Show evidence of what could break |
| Generic AI reviewer | Rule-based, evidence-backed verification |

ProofCode is also useful **without AI at all** — impact analysis and risk detection help with any large diff, including human-written ones.

---

## 3. The Core Problem

Today's workflow looks like this:

```text
Developer
    ↓
"Add authentication"
    ↓
AI Agent
    ↓
Changes 14 files
    ↓
Tests pass
    ↓
Developer: 😐  "Is this actually safe?"
```

**Passing tests does not prove correctness.** Tests only cover what someone thought to test. A change can pass every test and still:

- Remove an authorization check
- Break a caller that nobody tested
- Leak sensitive fields
- Change an object's shape that other components depend on
- Introduce a subtle security hole

ProofCode exists to turn that vague unease into concrete, inspectable evidence.

---

## 4. The Killer Workflow

Imagine working on a Next.js app. You ask your AI agent:

> Add Google OAuth login.

The agent modifies:

```text
14 files
+ 482 lines
- 73 lines
```

Normally, you get a giant Git diff and have to review it manually.

With ProofCode you get a **verification panel**:

```text
┌───────────────────────────────────────┐
│             PROOFCODE                 │
│         Change Verification           │
├───────────────────────────────────────┤
│                                       │
│  OAuth implementation                 │
│                                       │
│  Files changed             14         │
│  Functions affected        31         │
│  API routes affected        4         │
│  Tests added                3         │
│  Tests affected             7         │
│                                       │
│  ───────────────────────────────────  │
│                                       │
│  🔴 HIGH RISK              2          │
│  🟠 MEDIUM                 4          │
│  🟢 LOW                    8          │
│                                       │
│  Verification              76%        │
│                                       │
│  [Review Risks] [Run Verification]    │
└───────────────────────────────────────┘
```

Instead of reading 14 files top to bottom, the developer starts from the **2 high-risk items** and inspects the evidence behind each.

---

## 5. Core Features

### Feature 1 — Change Impact Analysis

*The first killer feature.*

When a function changes, ProofCode traces everything that depends on it.

Example: the AI changes `getUser()`.

```text
getUser()
   │
   ├── ProfilePage
   ├── Dashboard
   ├── OrderService
   │      └── PaymentService
   └── AdminPanel
```

ProofCode then reports:

- ⚠ This function is used in **17 locations**.
- ⚠ **4 callers** have no tests.

This is valuable even with no AI involved.

### Feature 2 — Risk Detection

Rather than just showing a diff line like:

```diff
+ const user = await db.user.findUnique(...)
```

ProofCode asks: **what could go wrong here?**

```text
⚠ Database query

Potential risks:

• No authorization check detected
• Null result isn't handled
• Caller assumes user always exists
• Function is used by 8 API routes

Risk: HIGH
```

Crucially, this does **not** claim "the AI is wrong." It says **"here is why you should inspect this."** That is a far more defensible and trustworthy product stance.

### Feature 3 — Evidence

*This is what separates ProofCode from an AI reviewer.*

Every warning must come with evidence the developer can open and verify.

```text
🔴 Authorization risk

Evidence:

src/app/api/orders/[id]/route.ts:42

getOrder(orderId)
       ↓
database query
       ↓
NO ownership check
       ↓
response.json(order)

[Open Evidence]
```

No warning without a code path to point at. No "trust me" results.

### Feature 4 — Project Requirements (Rules)

Teams define their own rules in a small project file:

```text
.proofcode/
    rules.md
```

Example `rules.md`:

```md
# Project Rules

- Every API route must authenticate the user.
- Users can only access their own orders.
- Payment operations must be idempotent.
- Never expose passwordHash.
- All public API endpoints require tests.
```

When an AI changes code, ProofCode checks the change against these rules:

```text
AI Change
   ↓
ProofCode
   ↓
Project Rules
   ↓
Code Analysis
   ↓
Tests
   ↓
Git Diff
   ↓
Verification Report
```

A violation looks like this:

```text
🔴 RULE VIOLATION

Rule:
"Users can only access their own orders."

Detected:

GET /api/orders/:id

No ownership verification found.

[View Rule]
[View Code]
```

### Feature 5 — Evidence-Based Verification Score

The score is **not** an arbitrary "AI confidence" number. It is a summary of checks that actually ran.

```text
PROOFCODE
────────────────────

Verification: 82%

✓ TypeScript          PASS
✓ ESLint              PASS
✓ Unit tests          PASS
✓ Integration tests   PASS
✓ Dependency check    PASS
✓ Project rules       PASS

⚠ Impact analysis     2 warnings
⚠ Security analysis   1 warning
```

Every point in the score maps to a specific, inspectable check.

---

## 6. What ProofCode Is NOT

To stay focused, ProofCode will **not** be:

- ❌ A "chat with your code" tool
- ❌ An AI code generator
- ❌ Another Copilot
- ❌ Another Cursor
- ❌ An "Explain this code" tool
- ❌ A generic AI code reviewer
- ❌ A generic codebase chatbot

These markets are already crowded. ProofCode's identity is **verification and evidence**.

---

## 7. MVP: Version 0.1

Do not build the giant vision first. **v0.1 has exactly five parts.**

### 1. Git diff detection

Detect modified, added, and deleted files.

### 2. Dependency graph

Build the chain: `File → imports → functions → callers`.

### 3. Change impact

Tell the developer: *"You changed X. These 13 files depend on X."*

### 4. Static risk detection

Start with a small set of deterministic checks:

- SQL injection
- Missing authorization
- Hardcoded secrets
- Unsafe user input
- Dangerous `eval`
- Missing error handling
- Unused changes

### 5. Verification panel

One sidebar view:

```text
PROOFCODE

CHANGE
14 files

IMPACT
31 symbols

RISKS
🔴 2
🟠 4
🟢 8

TESTS
✓ 47 passed
✗ 0 failed

RULES
✓ 8 passed
⚠ 1 violation

[Verify Change]
```

**No AI is required for v0.1.** Deterministic analysis is faster, cheaper, reproducible, and easier to trust.

---

## 8. Architecture

```text
VS Code Extension
       │
       │ TypeScript
       ↓
ProofCode Engine
       │
 ┌─────┼────────────┐
 ↓     ↓            ↓
Git   AST          Tests
      Analysis
       │
       ↓
Dependency Graph
       │
       ↓
Risk Engine
       │
       ↓
Verification Report
```

### Component responsibilities

| Component | Responsibility |
|---|---|
| **Extension layer** | Sidebar, tree views, webview UI, commands |
| **Git module** | Reads status and diffs; identifies changed files, functions, and lines |
| **AST analyzer** | Parses code into symbols: imports, exports, functions, classes, calls |
| **Dependency graph** | Maps who depends on what; computes affected callers and files |
| **Risk engine** | Runs deterministic rules and produces findings with evidence |
| **Rules engine** | Reads `.proofcode/rules.md` and checks changes against it |
| **Test runner** | Detects the package manager and runs test, lint, type-check, and build |
| **Report builder** | Combines everything into a verification report and score |

### Future analysis pipeline

```text
Static Analysis
       +
Dependency Analysis
       +
Git History
       +
Tests
       +
AI Reasoning
       ↓
Verification
```

AI reasoning is added **on top of** hard evidence later, never instead of it.

---

## 9. Tech Stack

**Extension**

- TypeScript
- VS Code Extension API
- Webview / Tree View
- Git API

**Code analysis**

- TypeScript Compiler API (first)
- Tree-sitter (later, for multi-language support)
- ESLint integration

**Testing**

Automatically detect and run the right command for the project:

```text
npm test
npm run test
pnpm test
yarn test
```

**AI (later, optional)**

Not required for v0.1. Added later for deeper reasoning once the deterministic foundation exists.

---

## 10. Project Structure

```text
proofcode/
├── extension/    # VS Code extension entry, commands, activation
├── analyzer/     # AST parsing and symbol extraction
├── git/          # Diff and status handling
├── rules/        # Rule parsing and rule checks
├── graph/        # Dependency and call graph
└── ui/           # Sidebar and webview panels
```

---

## 11. Development Roadmap

### Week 1 — Foundation

- Create the project structure above.
- Build the VS Code sidebar skeleton.

### Week 2 — Git Intelligence

Detect:

```text
git status
git diff
changed files
changed functions
added/deleted lines
```

Display, for example:

```text
12 files changed
47 functions affected
```

### Week 3 — Code Graph

Build:

```text
imports
exports
functions
classes
call relationships
```

Then implement:

```text
Changed function
       ↓
Find callers
       ↓
Find affected files
```

### Week 4 — Risk Engine

Start with deterministic rules. No LLM required.

```text
fetch(req.body.url)
```
→ suspicious user-controlled URL.

```ts
SELECT * FROM users WHERE id = '${id}'
```
→ SQL injection risk.

### Week 5 — Verification

Run TypeScript, ESLint, tests, and build. Collect results as `PASS`, `FAIL`, or `WARNING`.

### Week 6 — UI Polish + GitHub Release

Make the extension genuinely pleasant to use, then release:

> **ProofCode v0.1 — Verify AI-generated changes before you ship them.**

---

## 12. Business Model

Free for individual developers; paid for advanced and team features.

### Free

- Local analysis
- Git diff
- Impact analysis
- Basic security checks
- Basic rules

### Pro

- Advanced analysis
- AI verification
- Architecture rules
- Historical analysis
- Large repository support
- Verification reports

### Team

- Shared rules
- Team policies
- PR verification
- CI/CD integration
- GitHub integration
- Organization dashboard

### Long-term place in the workflow

```text
Developer
   ↓
VS Code
   ↓
ProofCode
   ↓
GitHub PR
   ↓
CI
   ↓
Production
```

---

## 13. Future Vision: "What Could This Change Break?"

The feature to eventually add. The developer clicks **Analyze Change**, and ProofCode responds:

```text
WHAT COULD THIS CHANGE BREAK?

🔴 HIGH

Authentication
────────────────────
Session validation changed.

3 API routes depend on this behavior.

🟠 MEDIUM

User Dashboard
────────────────────
User object shape changed.

2 components assume `avatar` exists.

🟠 MEDIUM

Admin Panel
────────────────────
Uses same authorization middleware.

No regression test found.

🟢 LOW

Documentation
────────────────────
API documentation is now outdated.
```

This is a **far more valuable question** than "Explain my code."

---

## 14. Positioning and Branding

**Tagline**

> **AI writes code. ProofCode proves the change.**

**Possible website hero**

> **Don't just review the diff. Understand the impact.**

**Principles**

- Evidence over opinion
- Deterministic first, AI second
- Help the developer inspect, never ask them to just trust
- Useful with or without AI

---

## 15. Risks and Open Questions

| Risk | Mitigation |
|---|---|
| Name "ProofCode" may be taken | Check Marketplace, npm, GitHub, and domain availability early |
| Static analysis false positives could annoy users | Start with a small, high-precision rule set; always show evidence |
| TypeScript/JavaScript only at first | Accept it for v0.1; add Tree-sitter for other languages later |
| Large repos may be slow | Analyze only changed files and their dependents; cache the graph |
| VS Code agents may add built-in verification | Differentiate through project rules, evidence, and team workflows |
| Building something nobody needs | Validate with real developer problems before coding (see next section) |

---

## 16. Next Steps

**Do not start coding yet.**

1. **List 10 real developer problems** ProofCode could detect (for example: missing auth checks, unhandled nulls, broken callers).
2. **Rank them** by frequency × severity × technical feasibility.
3. **Choose one killer workflow** for v0.1.
4. **Check the name** — domain, Marketplace, npm, and GitHub.
5. **Talk to a few developers** who use AI agents daily and test whether this solves a problem they actually feel.
6. Then begin Week 1 of the roadmap.

This order prevents building a clever extension that nobody needs.

---

*ProofCode is a working name. Statistics referenced here come from third-party sources and should be re-verified before public use.*
