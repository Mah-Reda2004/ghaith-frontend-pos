# Figma grid and design review

Use this reference when implementing from Figma, screenshots, design specifications, or a designer handoff.

## Establish the grid before coding

Inspect every relevant frame and record:

- frame/viewport width and height;
- fixed or fluid content container;
- outer margins or safe area;
- number and type of columns;
- gutter width;
- row/baseline grid or spacing unit;
- sidebar/topbar dimensions;
- alignment rules shared across sections;
- desktop, tablet, and mobile variants;
- whether RTL is designed explicitly or inferred.

Prefer values defined in Figma Layout Grid, Auto Layout, variables, and component properties. Do not infer a 12-column grid merely because it is common.

If the design file does not expose a grid, different frames use contradictory grids, or only one breakpoint is designed, ask a concise question before implementation. Include the values already observed so the user can answer quickly. Example structure:

> التصميم الحالي ظاهر بهامش 24px وGutter 16px، لكن عدد الأعمدة غير محدد للتابلت. هل نعتمد 8 أعمدة للتابلت و4 للموبايل، أم يوجد Grid محدد في Figma؟

Do not ask when the grid is explicit and internally consistent; state the detected grid and proceed.

## Identify real design defects

Raise an issue only when evidence shows that following the design will damage the required result. Examples:

- text or translated content cannot fit;
- navigation disappears or has no recognizable label/icon;
- fixed dimensions create viewport overflow;
- touch targets are unusably small;
- contrast or focus state fails an applicable accessibility requirement;
- RTL ordering or directional controls are incorrect;
- modal actions become unreachable;
- a table or chart cannot represent realistic data;
- spacing or alignment contradicts the documented grid/component system.

Do not label personal taste or an optional improvement as an error.

## Approval message

Before deviating from the design, present four short parts:

- **المشكلة:** the exact Figma frame/component and conflicting value.
- **التأثير:** what breaks and at which viewport/content state.
- **التعديل المقترح:** the smallest concrete correction, including new grid/size/behavior.
- **القرار:** ask whether to apply the correction or preserve Figma exactly.

Do not implement the deviation until approved. After approval, record the decision in the implementation notes or local design instructions so later screens remain consistent.
