# Project Rules

Define organizational and architectural standards for your codebase. ProofCode evaluates every code change against these rules.

- **Rule 1 (Authentication):** Every API route must authenticate the user.
- **Rule 2 (Data Privacy):** Never expose passwordHash or secrets in responses.
- **Rule 3 (Resource Ownership):** Users can only access their own orders or user resources.
- **Rule 4 (Test Coverage):** All public API endpoints require tests.
- **Rule 5 (Financial Safety):** Payment operations must be idempotent.
