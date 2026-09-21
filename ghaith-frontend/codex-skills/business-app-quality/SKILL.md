---
name: business-app-quality
description: Verify, release, or deploy business web applications with route-level regression tests, responsive checks, API contract tests, static-hosting preparation, and evidence-based handoff. Use for testing, release readiness, Cloudflare Pages/static hosting, or broad cross-page changes. Do not use for an explanation-only request.
---

# Business App Quality and Release

Choose verification proportional to risk. Broad shared-layout, routing, authentication, API-client, or printing changes require representative regression coverage across consumers.

## Verification layers

1. Static checks: syntax, lint/type checks where configured, invalid imports/paths, and diff whitespace.
2. Focused behavior: test the exact user flow and failure path changed.
3. Contract checks: assert requests and visible response handling.
4. Route sweep: load every registered route with representative API fixtures and fail on runtime errors or document-level horizontal overflow.
5. Visual checks: inspect screenshots at desktop, both ends of the tablet range, and mobile for affected screens.
6. Existing suite: run the nearest tests first, then the broader suite when a shared layer changed.

Read [references/release-checklist.md](references/release-checklist.md) for responsive regression and static-hosting rules.

## Handoff

State what changed, what was tested, and any real external blocker. Distinguish warnings from failures. Never report a device action, deployment, or print job as complete without observable confirmation appropriate to that system.
