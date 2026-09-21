---
name: business-app-printing
description: Implement or diagnose receipt, invoice, report, and barcode printing for business web applications, including browser fallback, local print agents, Windows queues, USB auto-detection, templates, and printer routing. Use whenever printing or connected printer behavior is in scope.
---

# Business App Printing

Separate printable data, document rendering, transport, printer discovery, and operating-system delivery. A request being queued is not proof that paper was printed.

## Workflow

1. Trace the whole path: user action → normalized print payload → renderer → browser or local agent → OS queue → physical device.
2. Determine whether the failure is payload/rendering, agent connectivity, target selection, driver/spooler, paper/status, or the physical connection.
3. Keep receipt, report, and barcode templates distinct. Route by device capability or identity, not by whichever queue appears first.
4. Provide a browser-print fallback for receipts/reports when the local agent is unavailable. Do not silently send labels to browser printing when exact label control is required.
5. Report queued, delivered-to-spooler, completed, and failed as different states when the platform permits it.

Read [references/local-printing.md](references/local-printing.md) before changing a local agent, Windows printer discovery, USB routing, or barcode copy behavior.

## Invariants

- Escape printable user/API text before generating HTML.
- Preserve exact barcode text and requested copy counts; batch only when the device or protocol imposes a limit.
- Do not hardcode a transient USB port as a printer type. Detect the present USB device, map its active port to its Windows queue, then classify by device/driver identity or configured capability.
- Never claim printing succeeded solely because an HTTP endpoint returned `202 queued`.
- Keep diagnostics useful: selected target, job/document name, render size, spooler result, and driver error.
