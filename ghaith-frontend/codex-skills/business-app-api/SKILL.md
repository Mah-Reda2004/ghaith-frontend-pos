---
name: business-app-api
description: Connect business application frontends to backend APIs, including authentication, CRUD, pagination, search, transactions, roles, error handling, and response normalization. Use when implementing or diagnosing network-backed workflows. Do not use for static UI-only changes.
---

# Business App API Integration

Inspect the existing API client and backend contract before changing a page. Centralize transport behavior; pages should express business operations, not recreate request plumbing.

## Integration workflow

1. Identify the user action, endpoint, method, request shape, response envelopes, permission, and visible success/failure result.
2. Confirm the contract from backend code, API documentation, fixtures, or captured responses. Do not guess field names when an authoritative source exists.
3. Normalize response variants at a boundary helper. Keep a stable internal shape for rendering.
4. Implement loading, empty, error, success, retry, and duplicate-submission behavior proportionate to the operation.
5. Test request method, URL, query/body, headers, authentication, and the resulting UI state.

Read [references/integration-patterns.md](references/integration-patterns.md) for transactional flows, pagination, authentication, caching, and defensive normalization.

## Invariants

- Use the shared API client; do not scatter direct `fetch` calls across pages unless the repository intentionally has no client.
- Send pagination and search to the server for large datasets. Debounce interactive search.
- Use idempotency keys for operations that must not duplicate, such as sales, payments, returns, or shift closing, when supported by the backend.
- Invalidate or update cached resources after mutations.
- Preserve role boundaries in both navigation and route guards; frontend guards complement but do not replace backend authorization.
- Never expose raw stack traces, secrets, tokens, or internal server messages to users.
