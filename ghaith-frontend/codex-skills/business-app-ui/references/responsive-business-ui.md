# Responsive business UI

Use the project's existing breakpoints when defined. Otherwise start with these roles and adjust to the product:

- desktop: full navigation and multi-column analytical layouts;
- tablet: compact navigation, two-column cards where useful, scroll-contained tables, and touch-friendly controls;
- mobile: drawer or bottom navigation, one-column workflows, full-width primary actions, and horizontally scrollable data tables.

## Tablet audit

- Verify every routed page at both ends of the tablet range, not only the midpoint.
- Collapse an admin sidebar to recognizable icons only when every item has an icon and accessible label.
- For a POS topbar, keep labels visible and allow horizontal scrolling rather than producing empty navigation buttons.
- Let headers and filter bars wrap. Inputs use `min-width: 0`; search can take the remaining row width.
- Keep content and route roots at `min-width: 0; max-width: 100%` so grid and flex children cannot force document overflow.
- Use two-column metric grids when four desktop cards become cramped.

## Mobile profile and dashboard patterns

- Make the identity/header stack vertically.
- Use compact cards with reduced gaps before shrinking type excessively.
- Keep status chips and primary actions easy to tap.
- Stack charts and legends; cap chart size relative to the viewport.
- Keep transaction tables scrollable rather than deleting important columns.

## Verification

At each target size, check `document.documentElement.scrollWidth <= clientWidth`, then inspect a screenshot. Overflow assertions catch geometry bugs; screenshots catch hidden navigation, clipping, excessive whitespace, and unusable density.
