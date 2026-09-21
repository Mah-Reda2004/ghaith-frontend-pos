# Release checklist

## Responsive regression

- Discover route names from the router instead of maintaining a stale manual list.
- Load routes with authenticated test state and realistic API interception.
- At tablet minimum and maximum widths, assert the document does not overflow horizontally.
- Inspect representative screenshots because geometry assertions cannot detect invisible labels or awkward density.
- On mobile, verify drawers/bottom navigation, modals, primary actions, and internal table scrolling.

## Static hosting

- The configured publish directory must contain `index.html` at its root.
- Moving the entry page requires updating stylesheet, module, favicon, login redirect, and protected-route paths.
- Upload/deploy the complete publish directory, not only the folder containing `index.html`, when the page references shared assets or nested routes.
- Verify deep links and refresh behavior; configure rewrites only when the routing model requires them.
- Keep environment-specific API URLs configurable rather than editing production URLs into page code.

## Pre-release evidence

- relevant focused tests pass;
- shared-component consumers were sampled;
- browser console has no new uncaught errors;
- no unintended document-level overflow at target widths;
- generated or built artifacts come from current source;
- deployment/printing/device dependencies and required permissions are explicit.
