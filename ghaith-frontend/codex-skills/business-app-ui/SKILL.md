---
name: business-app-ui
description: Create or refine responsive interfaces for admin panels, POS systems, dashboards, tables, forms, modals, profiles, and transactional business screens. Use for layout, visual fidelity, RTL/LTR behavior, accessibility, responsive breakpoints, or reusable UI components. Do not use for backend-only tasks.
---

# Business App UI

Match the product's existing visual language. Do not redesign a screen when the request is to implement or fix it.

## Workflow

1. Inspect the closest existing screen, shared CSS/components, tokens, and any supplied reference image or design.
2. Before implementation, determine the layout grid used by the relevant Figma frames: frame width, content margins, column count, gutter, container behavior, spacing rhythm, and breakpoint variants. If these values cannot be read confidently from Figma or supplied design documentation, ask the user which grid system to follow before choosing one.
3. Identify what belongs in a shared layout/component and what is page-specific.
4. Implement desktop, tablet, and mobile behavior together. Preserve RTL with logical properties such as `margin-inline`, `padding-inline`, and `inset-inline`.
5. Test the actual screen at representative widths and inspect screenshots; do not infer responsiveness only from CSS.
6. Check keyboard focus, accessible names, touch target size, scrolling, modal containment, and table usability.

Use existing design tokens for color, spacing, radius, type, shadows, and z-index. Add a token only when the design introduces a reusable value.

Read [references/responsive-business-ui.md](references/responsive-business-ui.md) when working on responsive layouts, tables, navigation, dense forms, dashboards, or POS screens. Read [references/figma-grid-and-design-review.md](references/figma-grid-and-design-review.md) whenever Figma or another supplied design is the implementation source.

## Design defect approval

Follow the approved design and grid exactly, but do not reproduce a demonstrable design defect silently. When the design would cause clipping, overlap, unreadable content, inaccessible interaction, broken RTL, impossible implementation, or failure at a required breakpoint:

1. stop before making the conflicting visual decision;
2. show the exact issue and where it occurs;
3. explain the user-visible consequence;
4. propose the smallest correction that preserves the design intent;
5. ask whether to apply the correction or keep the original design.

Wait for the user's choice before making a visible change that differs from the supplied design. Continue independent, non-conflicting work when practical. A purely technical correction that does not alter visual intent—such as containing table overflow or adding an accessible name—can be applied directly and reported.

## Invariants

- Shared navigation remains usable at every width. Never hide text when an item has no alternative accessible visual cue.
- Wide tables scroll inside their container; they must not widen the document.
- A modal fits the viewport, keeps its actions reachable, and scrolls internally when needed.
- Forms may move from multiple columns to one, but labels, validation, units, and action order remain clear.
- Numeric values stay readable in RTL contexts using appropriate direction and tabular numerals.
- Loading, empty, error, and success states occupy the same visual system as real content.
