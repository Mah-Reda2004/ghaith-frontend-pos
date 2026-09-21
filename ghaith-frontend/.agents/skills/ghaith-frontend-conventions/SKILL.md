---

name: ghaith-frontend-conventions

description: >
Mandatory conventions for the "Ghaith" frontend project
(a cashier/admin system for an Islamic clothing store, built with
Vanilla HTML/CSS/JS and no framework).

Use this skill automatically every time you write or modify any code inside
this repository: creating a new page, building a component, modifying CSS,
changing the router or API layer, or even making a small change to an
existing file.

The goal is to ensure that anyone — or any future Claude session — can
continue working on exactly the same architecture without breaking existing
functionality, duplicating code, inventing new patterns, or breaking
responsiveness or performance.

You must review this skill before adding a new page or modifying anything
inside `core/*`.
----------------

# Ghaith Frontend Project Conventions

The project is a management system for an Islamic clothing store with two main
interfaces:

**Admin**

* Dashboard
* Sales
* Products
* Categories
* Inventory
* Suppliers
* Users
* Expenses
* Discounts
* Reports

**Cashier**

* Sales
* Invoices
* Exchanges / Returns
* Debts
* Shift Closing
* Expenses

The entire application is RTL.

It uses Vanilla JavaScript with ES Modules, has no mandatory build step, and
uses no frontend framework.

## The Golden Rule

**Everything belongs in its proper place, and nothing should be duplicated.**

Before creating any new component or CSS class, first search inside:

```text
assets/css/components/
src/components/
```

If something with the same or similar purpose already exists, reuse it or
extend it.

Do not create another implementation that performs the same function.

## Folder Structure — Do Not Change

```text
assets/css/base/        Variables, reset, typography — rarely modified

assets/css/components/  Shared UI elements such as cards, tables, forms,
                        modals, etc.

assets/css/layout/      General application layout + breakpoints

src/core/               router.js, api.js, store.js, utils.js —
                        centralized application logic

src/components/         Reusable JavaScript components

src/pages/<page>/       Each page contains exactly:
                        <page>.html
                        <page>.js
                        <page>.css

mock-data/              Mock data matching the exact shape of the real API
                        responses
```

When adding a new page, create a folder under:

```text
src/pages/
```

containing exactly three files with the same page name:

```text
<page>.html
<page>.js
<page>.css
```

Follow the exact same structure and conventions used by:

```text
src/pages/dashboard
```

Use the dashboard page as the reference implementation.

## Colors and Dimensions — Never Hardcode Values

Every:

* Color
* Spacing value
* Border radius
* Font size

must come from:

```text
assets/css/base/variables.css
```

using:

```css
var(--...)
```

**Never hardcode direct hexadecimal colors or fixed `px` values in any other
file.**

If you need a value that does not already exist, define it once inside
`variables.css`.

Follow the existing naming convention:

```css
--color-*
--space-*
--radius-*
--fs-*
```

This guarantees that a visual change — such as changing the application's
orange color — can be made in one place instead of requiring modifications
across dozens of files.

## Naming Conventions

### Files and Folders

Use `kebab-case`.

Correct:

```text
stock-movement.js
```

Incorrect:

```text
StockMovement.js
```

### CSS Classes

Use lightweight BEM:

```css
.block
.block__element
.block.is-state
```

Examples:

```css
.stat-card
.stat-card__icon
.nav-link.is-active
```

### JavaScript Functions

Use `camelCase`.

JavaScript modules should export named functions.

Avoid using multiple `default export` patterns where named exports would make
the module clearer and easier to maintain.

Prefer:

```js
export function loadProducts() {}
export function renderProducts() {}
```

The goal is better readability, maintainability, and predictable module usage.

## Router and Lazy Loading

Pages **must not all load at application startup**.

Each page must only load when the user navigates to it.

Use dynamic `import()` through:

```text
router.js
```

Every new page must be registered inside the `PAGES` map in `router.js`
following the existing pattern:

```js
routeName: () => import('../pages/x/x.js')
```

Do not add another `<script>` tag to `index.html` for an individual page.

All page code must be loaded through the router.

The application shell in:

```text
index.html
```

must remain lightweight.

## API Layer — Never Use `fetch()` Directly Inside Pages

Every backend request must go through:

```text
src/core/api.js
```

Pages should call something like:

```js
api.get('/sales', { page, filters })
```

They must **not** call:

```js
fetch(...)
```

directly.

`api.js` is responsible for:

* Base URL
* Request headers
* Caching
* Unified error handling

Any change to the API base URL or communication behavior must happen in one
central location.

### Caching

Semi-static data such as:

* Categories
* Users
* Settings

must be cached in:

```text
sessionStorage
```

through `api.js`.

Do not fetch the same semi-static data again during the same session unless
that data has changed.

After any:

* Create
* Delete
* Update

operation, invalidate the related cached resource using:

```js
api.invalidate(key)
```

### Pagination

Every paginated table must send:

```text
page
pageSize
```

to the backend.

**Never fetch the entire dataset and paginate it on the frontend.**

Pagination must be performed server-side.

### Search

Search fields must use the `debounce` helper from:

```text
utils.js
```

before sending requests.

Default debounce delay:

```text
350ms
```

Do not send an API request on every keystroke.

## Mandatory States for Every Data-Driven Page

Every page that loads data from the API must support all four states exactly as
shown in the Figma design.

### 1. Loading

Use the existing:

```css
.view-loading
.skeleton-row
```

Do not leave the screen blank while data is loading.

### 2. Success

Render the real returned data.

### 3. Empty

Use the existing:

```css
.empty-state
```

with clear user-facing text such as:

```text
No suppliers have been added yet.
```

Include the appropriate action button, such as:

```text
Add New Supplier
```

### 4. Error

Use:

```css
.error-state
```

with a:

```text
Try Again
```

button that repeats the same failed request.

The error message must be clear and user-friendly.

Do not expose technical backend errors directly to users.

## Responsive Behavior — Mandatory for Every New Element

The application has only three responsive ranges defined in:

```text
assets/css/layout/responsive.css
```

Do not create new `@media` queries outside the layout files unless the rule is
strictly page-specific, in which case it may live inside that page's CSS file.

### Desktop — Above `1180px`

Full application layout.

Sidebar is fully expanded and displays icons + text.

### Tablet — `768px` to `1180px`

The admin sidebar is reduced to icons only.

The cashier uses its existing horizontal topbar instead of a sidebar. On
tablet, keep its navigation compact, touch-friendly, and horizontally
scrollable when the available width is not enough. Do not hide navigation
labels merely to force every item into one row.

### Mobile — Below `768px`

Sidebar becomes a drawer.

Tables must support horizontal scrolling inside:

```css
.table-responsive
```

Every new component — card, modal, table, or any other UI element — must be
tested at all three sizes before it is considered complete.

Actually resize and inspect the interface.

Do not assume responsiveness will work automatically.

## Performance — Strict Rules

### External Libraries

Do not add heavy external libraries such as:

```text
Chart.js
jQuery
```

Charts such as:

* Donut charts
* Line charts
* Bar charts

must be implemented using lightweight SVG generated from JavaScript, following
the existing implementation patterns.

### Images

Every `<img>` that is not immediately above the fold must use:

```html
loading="lazy"
```

### DOM Manipulation

Do not perform repeated DOM insertion inside a loop when rendering many
elements.

For larger collections, such as table rows, use:

```js
DocumentFragment
```

to batch DOM updates.

### Page-Specific CSS

CSS that belongs only to one page must load together with that page.

It may be loaded through:

* A `<link>` inside the view template
* Or imported through the page's JavaScript module

Do not place page-specific CSS inside the main:

```text
index.html
```

The main application shell must remain lightweight.

## Before Saying "Done"

Review this checklist before delivering any modification or new page:

* [ ] All colors and spacing values come from `var(--...)`; no direct hardcoded values were introduced.
* [ ] The page is lazy-loaded through the router and was not added directly to `index.html`.
* [ ] Every API request goes through `api.js`, with caching, pagination, and debounce where applicable.
* [ ] All four states exist: Loading / Success / Empty / Error.
* [ ] The page was actually tested at Desktop / Tablet / Mobile sizes.
* [ ] No new CSS class duplicates the purpose of an existing class.
* [ ] Any text coming from a user or API response is passed through `escapeHtml()` before being inserted using `innerHTML`.
