# Integration patterns

## Normalize once

APIs often return lists as `items`, `data`, `results`, or a bare array, and records as `data`, `item`, or a bare object. Normalize accepted envelopes once near the integration boundary and document the fallback order. Do not let every render function repeat it.

## Authentication

- Keep access-token storage and request headers centralized.
- Resolve the post-login destination from the normalized user role.
- Build login URLs from a stable application base so moving `index.html` does not break redirects.
- On logout, clear every token and user cache consistently before navigation.

## Transactions

For sales, payments, purchase invoices, returns, exchanges, debts, and stock movements:

- calculate displayed totals from the same source fields sent to the server;
- prevent double submission while a request is pending;
- distinguish paid, remaining, refund, difference, discount, tax, and subtotal values;
- refresh the affected list/detail after success;
- preserve the server's operation or invoice number for printing and later lookup.

## Failure behavior

Map common failures to actionable UI: validation, unauthorized, forbidden, not found, conflict, offline/timeout, and server failure. Retain safe user input after recoverable errors.

## Tests

Intercept requests in browser tests and assert method, URL, query/body, and headers. Return realistic success, empty, alternate-envelope, validation, and server-error responses; assert the visible state for each.
