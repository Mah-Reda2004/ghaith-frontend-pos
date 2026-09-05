---

name: ghaith-design-fidelity

description: >
Use this skill **mandatorily** every time you build or modify any screen/component
in the "Ghaith" project. The goal is to match the Figma design shown in the
reference images **exactly** — not to create a new design, not to "improve" it,
and not to make personal decisions regarding colors, layout, or spacing.

If you are unsure how a specific element should look, refer to the recurring
patterns described here (the same patterns are reused across all list pages,
modals, error states, and empty states) before inventing a new solution.

Review this skill before writing any new HTML/CSS, even if another skill
(such as `ghaith-frontend-conventions`) already covers the technical structure.
-------------------------------------------------------------------------------

# Exact Ghaith Design Fidelity

The fundamental rule is:

**We are not designing. We are implementing an already existing design.**

Any other skill that says something like "make distinctive design decisions"
(such as `frontend-design`) **does not apply here**.

Every visual decision has already been made in Figma. Our job is to reproduce
it accurately, not reinterpret it.

All patterns below have been verified by reviewing actual design reference
images. If the page you are building is not among the pages already reviewed,
apply the same recurring pattern described here — for example, all list pages
follow exactly the same structure — instead of inventing a new layout.

## 1. General Layout — Applies to Every Page Without Exception

* **The sidebar is always on the right** because the application uses RTL.

  The orange "Ghaith" logo appears at the top of the sidebar.

  Below it is a vertical navigation menu that always follows this order:

  Dashboard ← Sales ← Products ← Categories ← Inventory ← Suppliers ←
  Users ← Expenses ← Discounts ← Reports.

  The currently active item uses a **full solid orange background**.

  Do not use only an orange border or orange text.

  This is the main visual distinction between the active navigation item and
  the rest of the items.

* At the bottom of the sidebar:

  A user "chip" containing the user's name and a circular avatar.

  Directly below it, there is an orange "Log out" link with a logout icon.

* Content area — located to the left of the sidebar:

  A large bold page title appears first.

  Directly below it is a gray subtitle using `.page-subtitle`.

  An additional control may appear in the same row, such as:

  * A date filter like "This Month"
  * An "Add New" button

* **Correct Grid Rule:**

```css
.app-shell {
  grid-template-columns: var(--sidebar-width) 1fr;
}
```

The sidebar must use:

```css
grid-column: 1;
```

In RTL, column `1` is visually positioned at the far right.

This is what keeps the sidebar on the right side of the application.

If you find the implementation reversed — like the bug that happened during
the first implementation — fix it immediately.

This is one of the most important visual bugs that can occur.

## 2. Statistic Cards

Statistic cards appear on almost every page, including:

* Dashboard
* Sales
* Products
* Inventory
* Suppliers
* Users
* Discounts

They always use the same visual ensemble.

* A row containing **3 or 4 equally sized cards**, depending on the page.

* Each card contains a colored icon box near the top.

  The color depends on the meaning of the metric:

  * Red/pink → Expenses
  * Green → Profit
  * Blue → Counts
  * Orange → Sales

  A small delta chip may appear beside it containing:

  * Green upward arrow + percentage
  * Red downward arrow + percentage

* Below the icon:

  A **large bold number** using `--fs-2xl`.

  Directly below it is a small gray label describing the metric.

  All text must align toward the right/end in RTL.

* If the card represents a warning, such as:

  "Low-stock products: 24"

  the icon itself must use the orange/warning style with a warning triangle.

  Do not use a normal metric icon.

## 3. List Pages

This applies to:

* Products
* Categories
* Suppliers
* Users
* Sales

All of these pages follow exactly the same structure:

```text
[Orange "+ Add New" button at the top-right of the content area]

[Row of statistic cards]

[Toolbar:
 Status filter dropdown
 + Type/Category filter dropdown
 + Search field with search icon
 All in one row]

[Table card:
 Gray column header
 Data rows
 "Actions" column containing an Edit/Pencil button
 and a red Delete/Trash button]

[Table footer:
 Pagination numbers on the right
 + "Showing 1 to X of Y" text on the left]
```

* The search field is always the last item in the toolbar.

  Visually, it appears at the far left because it is the longest element in
  the RTL layout.

  Use placeholders such as:

  `Search by product, SKU...`

* Table columns follow this RTL ordering:

  Item Name → Middle Data → Status Badge → Actions

  The item name is the first column on the right.

  The Actions column is positioned at the far left of the table.

* Status badges contain:

  * A small colored dot
  * Status text
  * A lightly tinted/transparent background using the status color

Status mapping:

* `Active` → Green
* `Inactive` → Gray
* `Critical` → Red
* `Low` → Orange/Warning
* `Available` → Green
* `Out of Stock` → Red

## 4. Modals — Add / Edit

* Use a dark transparent overlay behind the modal with approximately **65% opacity**.

* Modal header:

  * Small icon + title on the right
  * Close `X` button at the far left

* Form fields:

  Full-width vertical fields.

  Each field has a small gray label above it.

* Action buttons row:

  **The orange primary action button**, such as "Save Category", must be
  positioned at the **far left of the row**.

  The outline "Cancel" button must be directly beside it toward the right.

  Make sure this ordering is reproduced exactly.

  It is the reverse of what might normally be expected in an LTR interface.

* Percentage and numeric fields must display their relevant unit next to the
  value, such as:

  * `%`
  * Currency symbol/unit

## 5. Success Modal / Success Card

This appears after successful creation operations such as:

* Adding a product
* Adding a user
* Adding a discount

Structure:

* Green circle containing a `✓` checkmark at the upper center.

* Bold success title such as:

  `Added Successfully`

  or

  `Updated Successfully`

* Gray descriptive sentence directly below it.

* A summary details card containing information such as:

  * Item name
  * Image/icon
  * Status
  * Code/SKU
  * Creation date

  Display these as label/value rows.

* Two vertically stacked buttons:

  First:

  Orange solid primary button, such as:

  `Add Another Product`

  This repeats the same action.

  Second:

  Outline button such as:

  `Back to List`

  or:

  `Back to Inventory`

* An optional third ghost-style link may appear below them, such as:

  `Print Product Barcode`

## 6. Empty / Error States

These states replace the table or page content whenever there is no data or
when a connection/loading error occurs.

* Use a separate card containing a colored circular icon at the top.

Icon mapping:

* Red warning icon → Error

* Neutral gray icon → Empty state

* Green `✓` → Success

* Use a clear bold title such as:

  `Unable to Load Sales`

  `No Sales Found`

  `No Suppliers Found`

* Add a gray descriptive line explaining the problem or suggested action using
  clear, non-technical language.

Example:

`An error occurred while trying to connect to the server. Please check your internet connection.`

* Add one orange CTA button below the description.

For errors:

`Try Again`

For empty states, use a direct action such as:

`Create New Invoice`

or:

`Add New Supplier`

* **Use exactly the existing `.error-state` and `.empty-state` classes from
  `components/cards.css`.**

These classes define the shared appearance used across every page.

Do not replace them with a different implementation.

## 7. Detail Pages

Examples:

* Invoice Details
* Supplier Details

Structure:

* Header containing:

  * Invoice number/name or supplier name
  * Status badge
  * Close `X` button

* Row of small information cards containing data such as:

  * Customer name
  * Phone number
  * Address

  Each card contains a gray label above the value.

* Items table, such as invoice products.

  It must use the same styling as the standard application tables.

* Two cards side-by-side below the table:

  `Payment Details | Discount Details`

* A `Related Operations` section for things such as:

  * Returns
  * Exchanges

  Tabs appear above this section.

* A full-width outline `Close` button at the bottom of the modal/panel.

## 8. Semantic Colors — Fixed Mapping

| State / Value                                         | Color                    |
| ----------------------------------------------------- | ------------------------ |
| Active / Available / Fully Paid / Success             | Green `--color-success`  |
| Inactive / Out of Stock / Error / Critical / Refunded | Red `--color-danger`     |
| Low / Pending / Requires Attention                    | Orange `--color-warning` |
| Normal Neutral Number                                 | `--color-text-muted`     |

**Do not** use the warning color for success or vice versa, even if the colors
look visually similar.

Every page receives these same textual values from the API, so the mapping
must remain consistent across the entire application.

## 9. RTL Details That Must Be Preserved

* Numbers such as:

  * SKU
  * Prices
  * Percentages

  must remain LTR inside the RTL context.

  Use:

```css
font-variant-numeric: tabular-nums;
```

This already exists in `.num`.

Do not reverse the direction of the number itself.

* Directional icons, such as the `↩` icon used for returns, must be checked
  visually to ensure they make sense in RTL and are not mirrored incorrectly.

* Using physical directional properties such as:

```css
margin-right
margin-left
padding-right
padding-left
```

is **not allowed**.

Use logical properties instead:

```css
margin-inline-start
margin-inline-end
padding-inline-start
padding-inline-end
```

These are already used in `shell.css`.

This ensures the layout will not break if the application later gets an LTR
version, such as an English version.

## Before Delivering Any New Page

Visually compare the page you implemented against the closest matching
reference page from the patterns above.

If there is any difference in:

* Element ordering
* Colors
* Button placement
* Layout
* Spacing

fix it before considering the work complete.

The goal is simple:

**Someone should be able to open your implementation next to the Figma
reference image and see no visual difference.**
