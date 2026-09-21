---
name: business-app-foundation
description: Build or extend maintainable business web applications such as admin panels, POS systems, inventory, invoicing, CRM, or internal tools. Use for cross-cutting frontend work, new modules, architecture changes, routing, shared components, or requests that span UI and integration. Do not use for a tiny isolated style or copy edit.
---

# Business App Foundation

Treat the repository as the source of truth. Before changing code, inspect its framework, route model, shared components, API layer, design tokens, tests, build/deploy configuration, and local instruction files. Preserve established patterns unless they are the demonstrated cause of the problem.

## Working model

1. Translate the user's natural-language request into observable outcomes. Infer routine details from the code; ask only when a missing decision would materially change behavior.
2. Search for existing shared implementations before adding a component, helper, route, store, or service. Extend one source of truth instead of creating a parallel solution.
3. Separate responsibilities:
   - route/page modules own page behavior;
   - shared components own reusable UI and interactions;
   - the API/service layer owns transport, authentication, base URLs, retries, and normalized errors;
   - design tokens and layout files own shared visual rules;
   - device agents own operating-system or hardware communication.
4. Preserve unrelated work in a dirty tree. Inspect diffs before editing overlapping files.
5. Implement the smallest coherent change that solves the complete workflow, including empty, loading, error, success, permission, and retry states where relevant.
6. Verify behavior rather than only syntax. Test the affected path and the shared consumers most likely to regress.

## Business rules and data

- Derive names and rules from the current domain. Never bake clothing, restaurant, pharmacy, or another sample domain into a reusable component.
- Keep identifiers, money, quantities, taxes, discounts, commissions, stock, debts, returns, and payment status semantically distinct.
- Treat server responses as untrusted and variable at integration boundaries. Normalize known response envelopes once, then keep page code predictable.
- Escape data inserted through HTML strings. Prefer DOM text APIs for plain text.
- Keep user-visible errors clear and actionable; log technical detail separately.

## Architecture decisions

- Preserve a buildless application when one exists; do not introduce a framework or bundler for convenience.
- Preserve a framework application when one exists; use its router, state model, and build conventions.
- Lazy-load substantial route code where the architecture supports it.
- Prefer configurable behavior over product-specific forks, but do not build speculative abstractions.
- When a shared fix can solve several pages safely, fix the shared layer and test representative consumers.

## Completion bar

Do not report completion until the requested workflow works end to end, relevant checks pass, and any remaining external dependency or operating-system blocker is stated precisely.
