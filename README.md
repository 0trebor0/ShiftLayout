# ShiftLayout v5.0.0

**ShiftLayout** converts HTML + CSS into production-ready Android XML layouts. Write your UI in HTML, get back ConstraintLayout, CardView, MaterialButton, TextInputLayout, BottomNavigationView, shape drawables, gradient drawables, and menu files - ready to drop into Android Studio.

See [ROADMAP.md](ROADMAP.md) for completed capabilities, upcoming features, and deferred work.

---

## Installation

ShiftLayout requires Node.js 20.18.1 or newer. Continuous integration tests the
minimum release and the Node.js 22 and 24 release lines on Linux.

```bash
npm install shiftlayout
```

---

## Quick Start

```javascript
const ShiftLayout = require('shiftlayout');
const sculptor = new ShiftLayout({ useConstraint: true });

const html = `
<div id="login_card" style="background-color: white; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 24px; width: 100%;">
    <h1 style="font-size: 24px; font-weight: bold; text-align: center; color: #1A1A2E;">Sign In</h1>
    <input type="email" id="email" placeholder="Email address" style="margin-bottom: 12px;">
    <input type="password" id="pwd" placeholder="Password" maxlength="32" style="margin-bottom: 16px;">
    <button style="background-color: #6200EE; color: white; border-radius: 24px; width: 100%;">Sign In</button>
</div>
`;

const {
    layout, drawables, menus, arrays, values, fonts, resources, assets,
    interactions, forms, media, extractedResources, warnings,
} = sculptor.convert(html);

// layout    -> paste into res/layout/activity_main.xml
// drawables -> write each entry to res/drawable/<name>
// menus     -> write each entry to res/menu/<name>

console.log(layout);
```

---

## Constructor Options

```javascript
const sculptor = new ShiftLayout({
    prefix:         'app',       // ID prefix for auto-generated IDs (default: 'sl')
    defaultPadding: '20dp',      // Root layout padding (default: '16dp')
    useConstraint:  true,        // Emit constraint attrs on top-level elements (default: true)
    inputStyle:     'outlined',  // TextInputLayout style: 'outlined' | 'filled' (default: 'outlined')
    customElements: {            // Optional web-component to Android view mappings
        'app-card': 'LinearLayout',
        'user-avatar': 'com.example.views.AvatarView',
    },
    extractResources: true,      // Optional repeated color/dimen/string extraction
});
```

`customElements` accepts an object or `Map`. Keys must be valid hyphenated custom
element names, and values must be safe simple or fully qualified Android view
tags. A mapping to `LinearLayout` receives normal container orientation behavior;
a mapping to `TextView` receives the custom element's flattened text content.
Unmapped custom elements continue to fall back to `View`.

### Extension Hooks

Constructor hooks support application-specific XML attributes, event metadata,
and result artifacts without changing the core mappings:

```javascript
const converter = new ShiftLayout({
    hooks: {
        element(descriptor) {
            if (descriptor.htmlAttributes['data-handler']) {
                descriptor.attributes['android:onClick'] =
                    descriptor.htmlAttributes['data-handler'];
            }
        },
        interaction(record) {
            record.bindingHandler = `handle_${record.id}`;
            // Return false or null to omit this interaction record.
        },
        result(result) {
            result.extensions = { bindingClass: 'ScreenBindings' };
        },
    },
});
```

The `element` hook receives the HTML tag and attributes, selected Android tag,
generated Android attributes, computed styles, sibling index, and depth. It may
mutate the descriptor or return a replacement descriptor. Android view tags and
XML attribute names are validated, and attribute values remain XML-escaped.
The hook runs for normal views and special wrappers such as text inputs, cards,
and bottom navigation; skipped structural HTML does not produce hook calls.

The `interaction` hook may mutate or replace each record, or filter it by
returning `false`/`null`. The `result` hook may mutate the complete conversion
result or return a replacement object. Hook errors and malformed return values
fail conversion rather than producing silently corrupted output.

---

## Output Format

`convert(html)` returns an object with these keys:

| Key | Type | Write to |
|---|---|---|
| `layout` | `string` | `res/layout/your_layout.xml` |
| `drawables` | `{ [filename]: string }` | `res/drawable/` |
| `menus` | `{ [filename]: string }` | `res/menu/` |
| `arrays` | `{ [filename]: string }` | `res/values/` per-select string arrays |
| `values` | `{ [filename]: string }` | Combined `res/values/` files such as `arrays.xml` |
| `fonts` | `{ [filename]: string }` | Generated Android font-family XML in `res/font/` |
| `resources` | `{ drawables, menus, values, fonts }` | Grouped Android resource files |
| `assets` | `{ images: Array<object>, fonts: Array<object> }` | External image and font manifests |
| `interactions` | `Array<object>` | Runtime wiring metadata for forms, links, buttons, and navigation |
| `forms` | `Array<object>` | Form groups, controls, constraints, and validation/help metadata |
| `media` | `Array<object>` | Runtime metadata for media, web, canvas, and embedded content |
| `extractedResources` | `{ colors, dimensions, strings } \| null` | Generated value-resource manifest when extraction is enabled |
| `warnings` | `Array<{ severity, code, message, element, property, value }>` | Structured conversion diagnostics |

### Interaction Metadata

Interactive HTML produces metadata alongside the static Android XML:

```javascript
const { interactions } = sculptor.convert(`
    <form id="profile" action="/profiles" method="post">
        <a id="help" href="https://example.com/help">Help</a>
        <button id="save" type="submit">Save</button>
    </form>
`);
```

Each record contains its generated Android resource `id` and a `type` of
`form`, `link`, `button`, or `navigation`. Records also include the applicable
target, action, HTTP method, form association, label, or navigation container.
The resource writer saves the array to `diagnostics/interactions.json`. This is
metadata for application wiring; ShiftLayout does not generate runtime event code.

### Form Metadata And Support Text

Forms include fieldset groups and converted controls in the `forms` result.
Control metadata preserves `required`, `disabled`, `readonly`, `min`, `max`,
`step`, `minlength`, `maxlength`, and `pattern`, plus `aria-invalid`,
`aria-describedby`, and `aria-errormessage` text references. The resource writer
saves this data to `diagnostics/forms.json`.

Use `data-helper-text` to generate Material helper text. Error metadata can come
from `data-error` or `aria-errormessage`; when `aria-invalid` is active, the
message is rendered in the Material helper caption using an error color and is
also emitted as `app:errorContentDescription`. `app:errorEnabled` is reserved
for applications to switch to the native runtime error state:

```html
<input id="username" required minlength="3"
       data-helper-text="Use at least three characters">
<p id="email_error">Enter a valid email address.</p>
<input id="email" type="email" aria-invalid="true"
       aria-errormessage="email_error">
```

### Diagnostics

Conversion continues when CSS cannot be represented exactly, and the result
reports the issue through `warnings`:

```javascript
const { layout, warnings } = sculptor.convert(html);

for (const warning of warnings) {
    console.warn(warning.code, warning.element, warning.property, warning.message);
}
```

Current warning codes include:

| Code | Meaning |
|---|---|
| `unsupported-css-property` | The property has no converter mapping |
| `unsupported-css-value` | The property is recognized but its value cannot be represented |
| `approximated-css` | Android output is useful but not browser-equivalent |
| `invalid-css-selector` | A stylesheet selector could not be matched |
| `missing-stylesheet` | A linked stylesheet was not supplied through `convert()` options |
| `unmapped-web-font` | A remote `@font-face` URL needs an explicit `fontSources` mapping |
| `unsupported-font-format` | A declared font is not TTF, OTF, or TTC |
| `invalid-font-face` | An `@font-face` rule is missing a usable family declaration |

Warnings are deduplicated and include element, property, and value context when
available. CSS custom properties do not produce unsupported-property warnings.

---

## HTML Tag Reference

### Custom Elements

```javascript
const converter = new ShiftLayout({
    customElements: {
        'status-badge': 'TextView',
        'feature-panel': 'com.example.views.FeaturePanel',
    },
});
```

Mapped custom elements retain generated IDs, CSS-derived attributes,
accessibility metadata, constraints, and converted child elements.

### Layout Containers

| HTML | Android View | Notes |
|---|---|---|
| `<div>`, `<section>`, `<main>`, `<article>`, `<aside>`, `<form>`, `<header>`, `<footer>`, `<fieldset>` | `LinearLayout` | Vertical by default; `flex-direction: row` makes it horizontal |
| `<div>` with `border-radius` + `box-shadow` | `CardView` | Auto-detected; generates `app:cardCornerRadius`, `app:cardElevation` |
| `<div>` with absolutely positioned children | `FrameLayout` | Auto-detected when any child has `position: absolute` |
| `<div>` with `overflow-y: scroll` | `ScrollView` wrapping `LinearLayout` | `android:fillViewport="true"` included |
| `<ul>`, `<ol>` | `LinearLayout` | List item text is prefixed; ordered lists preserve `start` and `reversed` |
| `<table>` | `TableLayout` | Stretches columns by default |
| `<tr>` | `TableRow` | |
| `<td>` `<th>` | `TextView` | `colspan`, `rowspan`, `align`, and `valign` are preserved where possible |

### Navigation

| HTML | Android View | Notes |
|---|---|---|
| `<nav>` with only `<a>` children | `BottomNavigationView` | Auto-generates `res/menu/*.xml` with items from the link text |
| `<nav>` with mixed children | `LinearLayout` | Standard container |

### Text

| HTML | Android View |
|---|---|
| `<h1>` `<h2>` `<h3>` `<h4>` | `TextView` |
| `<p>` `<span>` `<label>` `<a>` `<li>` `<legend>` `<td>` `<th>` | `TextView` | Anchor `href` is preserved in `android:tag` |
| `<strong>` `<b>` `<em>` `<i>` `<code>` `<pre>` `<kbd>` `<cite>` `<mark>` | `TextView` | Semantic text styling applied where possible |
| `<small>` `<u>` `<s>` `<del>` `<ins>` `<time>` `<abbr>` `<dfn>` `<samp>` `<var>` | `TextView` | Additional inline semantics mapped to Android text attributes |
| `<blockquote>` `<q>` `<address>` `<sup>` `<sub>` | `TextView` | Lightweight quote/address/script styling |

### Inputs

| HTML | Android View | Notes |
|---|---|---|
| `<input type="text/email/password/number/tel/url/search/date/time/datetime-local/month/week/color">` | `TextInputLayout` + `TextInputEditText` | Material floating label; style from `inputStyle` option |
| `<input inputmode enterkeyhint autocapitalize spellcheck>` | `TextInputEditText` attributes | Keyboard/action hints mapped where Android XML supports them |
| `<textarea>` | `TextInputLayout` + `TextInputEditText` | `android:inputType="textMultiLine"`; `rows` and `cols` are preserved |
| `<input type="checkbox">` | `CheckBox` | `value` is preserved in `android:tag` |
| `<input type="radio">` | `RadioButton` | `value` is preserved in `android:tag` |
| `<input type="submit/button/reset/file">` | `MaterialButton` | Value text or sensible default label |
| `<select>` | `Spinner` | `<option>` labels generate a string-array resource; `selected`, `multiple`, `size`, and `disabled` are preserved where possible |

### Other

| HTML | Android View | Notes |
|---|---|---|
| `<button>` | `MaterialButton` | Uses `app:backgroundTint`, `app:cornerRadius`, `app:strokeColor` |
| `<img>` | `ImageView` | `src="logo.png"` -> `@drawable/logo`; explicit dimensions enable `android:adjustViewBounds` |
| `<picture>` | unwraps to child media | `<source>` tags are skipped; fallback `<img>` is converted |
| `<progress value="60" max="100">` | `ProgressBar` | Horizontal style applied automatically when `value`/`max` present |
| `<meter value="60" max="100">` | `ProgressBar` | Horizontal style with `android:max` and `android:progress` |
| `<hr>` | `View` (1dp divider) | |
| `<video>` | `VideoView` | Source, poster, playback flags, and fallback text are preserved in `media` |
| `<audio>` | `VideoView` | Runtime audio source and playback flags are preserved in `media` |
| `<iframe>` | `WebView` | URL, `srcdoc`, sandbox, and allow policy are preserved in `media` |
| `<canvas>` | `View` | Width, height, and fallback text are preserved for runtime drawing |
| `<embed>`, `<object>` | `WebView` | Source/data and MIME type are preserved for runtime loading |

### Embedded Media Metadata

Media and embedded elements are emitted as leaf Android views so HTML fallback
children are not incorrectly nested inside `VideoView`, `WebView`, or `View`.
Their runtime contract is returned through `media`:

```javascript
const { media } = converter.convert(`
    <video id="intro" src="media/intro.mp4" controls poster="images/intro.png"></video>
    <iframe id="guide" src="https://example.com/guide" sandbox="allow-scripts"></iframe>
`);
```

Records include the generated resource ID, element kind, source, MIME type,
title, and fallback text. Video/audio records also include playback flags;
iframe records include `srcdoc`, sandbox, and allow values; canvas records include
its intrinsic dimensions. The writer saves these records to
`diagnostics/media.json`. Applications remain responsible for loading URLs,
configuring playback, rendering canvas content, and enforcing web security policy.

---

## CSS Property Reference

### Embedded Stylesheets

ShiftLayout reads CSS from `<style>` elements as well as inline `style` attributes.
Tag, class, ID, attribute, grouped, and descendant selectors are supported. The
cascade respects specificity, source order, inheritance for text properties,
and `!important`. CSS custom properties are inherited and resolved through
`var()`, including fallback values.

```html
<style>
    :root { --brand: #336699; }
    .card p { color: var(--brand); }
    #status { font-weight: bold; }
</style>

<section class="card">
    <p id="status">Ready</p>
</section>
```

External stylesheet URLs are not loaded automatically. Supply already-loaded CSS
by exact linked `href` using the second `convert()` argument:

```javascript
const result = sculptor.convert(`
    <link rel="stylesheet" href="theme.css">
    <p class="status">Ready</p>
`, {
    stylesheets: {
        'theme.css': '.status { color: #336699; font-weight: bold; }',
    },
});
```

`stylesheets` accepts an object or `Map` whose values are CSS strings. Linked
stylesheets and `<style>` elements follow document cascade order. Unmatched links
are ignored, keeping conversion deterministic and free of hidden file or network
access.

### Web Fonts

Embedded or supplied CSS may declare local TTF, OTF, and TTC files with
`@font-face`. ShiftLayout generates an Android font-family resource and applies
it wherever the declared CSS family is used:

```html
<style>
    @font-face { font-family: AppSans; src: url("fonts/app-sans.ttf"); font-weight: 400; }
    body { font-family: AppSans, sans-serif; }
</style>
```

Remote fonts are never downloaded. Map each declared web URL to a contained
local font path or an existing Android font-family reference:

```javascript
const result = sculptor.convert(html, {
    fontSources: {
        'https://cdn.example.com/app.woff2': 'fonts/app-sans.ttf',
        'https://cdn.example.com/display.woff2': '@font/display_family',
    },
});
```

When no supported source or explicit mapping is available, ShiftLayout reports
a warning and uses the next recognized generic CSS family when present.

### Media Query Profiles

Pass a target media profile to activate matching `@media` rules:

```javascript
const result = sculptor.convert(html, {
    media: {
        type: 'screen',
        width: 800,
        height: 600,
        orientation: 'landscape',
    },
});
```

`width` and `height` accept non-negative numbers or compatible CSS lengths such
as `48rem`. Orientation is derived from width and height when omitted. Supported
conditions include `min-width`, `max-width`, exact `width`, their height
equivalents, `orientation`, `screen`, `print`, `all`, `not`, `only`, `and`, and
comma-separated alternatives. Nested media rules are combined and retain normal
stylesheet source order and specificity.

When `media` is omitted, conditional rules remain inactive. This avoids silently
assuming a viewport that may not match the Android target.

### Generated Pseudo-Elements

Stylesheet rules ending in `::before`, `::after`, `:before`, or `:after` can
generate textual Android content:

```html
<style>
    :root { --required-marker: " *"; }
    label.required::after { content: var(--required-marker); }
    .status::before { content: "Status: "; color: #336699; }
    .download::after { content: " " attr(data-format); }
</style>
```

Quoted strings, CSS escapes, `attr(...)`, custom properties, cascade
specificity, `!important`, and `display: none` are supported. On text elements,
generated content is flattened into the host `android:text`; distinct pseudo
styling is reported as an approximation. On compatible containers, ShiftLayout
emits child `TextView`s and maps color, font, alignment, background, spacing,
and text-transform properties. Unsupported generated content such as `url()`,
counters, and pseudo-elements on non-container views is omitted with structured
diagnostics.

### Strict Conversion

Pass `strict: true` to fail conversion when any warning is produced:

```javascript
try {
    const result = sculptor.convert(html, { strict: true });
} catch (error) {
    if (error.name === 'ShiftLayoutConversionError') {
        console.error(error.warnings);
    }
}
```

Strict conversion throws a `ShiftLayoutConversionError` after processing the
document. Its `warnings` property contains the same structured diagnostics that
normal conversion returns. Strict mode is disabled by default.

### Colors

All color formats are supported:

```css
color: red;                      /* named color */
color: #6200EE;                  /* hex (3 or 6 digit) */
color: rgb(98, 0, 238);          /* rgb() */
color: hsl(210, 50%, 40%);       /* hsl() */
color: hsla(120, 100%, 25%, .5); /* hsla() to Android #AARRGGBB format */
color: rgba(0, 0, 0, 0.5);      /* rgba() -> Android #AARRGGBB format */
```

Named colors: `white`, `black`, `red`, `green`, `blue`, `yellow`, `gray`, `silver`, `transparent`.

### Background

| CSS | Android output |
|---|---|
| `background-color: #FFF` | `android:background="#FFFFFF"` |
| `background: linear-gradient(to right, #6200EE, #03DAC5)` | `android:background="@drawable/sl_grad_*.xml"` |
| `background-image: linear-gradient(...)` | `android:background="@drawable/sl_grad_*.xml"` |
| `background-size: cover` on images | `android:scaleType="centerCrop"` |
| `background-position: center` on images | `android:scaleType="center"` fallback |
| `border-radius: 12px` | `android:background="@drawable/sl_bg_*.xml"` with `<corners>` |
| `border: 2px solid #E0E0E0` | Shape drawable with `<stroke>` |
| `border-color: #E0E0E0` / `border-width: 2px` | Combined into shape drawable |
| `outline: 2px solid #6200EE` | Shape drawable stroke when no explicit border overrides it |
| `box-shadow: 0 4px 12px rgba(...)` | `android:elevation` (blur radius extracted) |
| `box-shadow: none` / `inset ...` | No elevation emitted |
| `z-index: 4` | `android:elevation="4dp"` |
| `opacity: 0.8` | `android:alpha="0.80"` |
| `overflow: hidden` | `android:clipChildren="true"` + `android:clipToPadding="true"` |

> **Generated drawables** - shape and gradient XML files are returned in the `drawables` map. Write each file to `res/drawable/`.

### Typography

| CSS | Android attribute |
|---|---|
| `font-size: 18px` | `android:textSize="18sp"` |
| `font-weight: bold` / `font-weight: 700` | `android:textStyle="bold"` |
| `font-style: italic` | `android:textStyle="italic"` |
| `font-family: Georgia, serif` | `android:fontFamily="serif"` |
| `text-align: center` | `android:gravity="center"` |
| `text-decoration: underline line-through` | `android:paintFlags="underline|strikeThru"` |
| `text-indent: 24px` | `android:textIndent="24dp"` |
| `letter-spacing: 2px` | `android:letterSpacing="0.125"` |
| `line-height: 1.5` | `android:lineSpacingMultiplier="1.50"` |
| `white-space: nowrap` | `android:maxLines="1"` + `android:ellipsize="end"` |
| `overflow-wrap: break-word` | `android:breakStrategy="high_quality"` |
| `text-overflow: ellipsis` | `android:ellipsize="end"` |
| `-webkit-line-clamp: 3` | `android:maxLines="3"` + `android:ellipsize="end"` |

Supported font families: Roboto, Open Sans, Lato, Ubuntu -> `sans-serif`; Georgia, Times New Roman -> `serif`; Courier -> `monospace`.

### Layout & Spacing

| CSS | Android attribute |
|---|---|
| `width: 100%` | `android:layout_width="match_parent"` |
| `height: 100%` | `android:layout_height="match_parent"` |
| `min-width: 120px` | `android:minWidth="120dp"` |
| `max-height: 200px` | `android:maxHeight="200dp"` |
| `padding: 16px` | `android:padding="16dp"` |
| `padding-top/bottom/left/right` | Individual `android:paddingTop` etc. |
| `margin: 8px` | `android:layout_margin="8dp"` |
| `margin-top/bottom/left/right` | Individual `android:layout_marginTop` etc. |

### Computed Lengths

Compatible `calc()`, `min()`, `max()`, and `clamp()` expressions are evaluated
before Android XML is generated.

```css
width: calc(100px + 2rem);          /* 132dp */
padding: min(24px, 2rem);           /* 24dp */
font-size: clamp(14px, 1.25rem, 24px); /* 20sp */
left: calc((8px + 1rem) / 2);       /* 12dp */
```

The evaluator supports parentheses, unary signs, addition, subtraction,
multiplication by unitless numbers, division by nonzero unitless numbers, and
nested math functions. Compatible `px`, `dp`, `sp`, `em`, and `rem` lengths are
normalized to Android units. Expressions that require a browser viewport or
parent measurement, such as `calc(100% - 16px)`, are left unresolved and are not
emitted as invalid Android dimensions.

### Flexbox

| CSS | Android output |
|---|---|
| `display: flex` | Horizontal `LinearLayout` for simple layouts |
| `flex-direction: row` | `android:orientation="horizontal"` |
| `flex-direction: column` | `android:orientation="vertical"` (default) |
| `flex-direction: row-reverse/column-reverse` | `FlexboxLayout` with `app:flexDirection` |
| `flex-wrap: wrap/wrap-reverse` | `FlexboxLayout` with `app:flexWrap` |
| `justify-content: center` | `android:gravity="center_horizontal"` (row) or `"center_vertical"` (column) |
| `justify-content: flex-end` | `android:gravity="end"` or `"bottom"` |
| `justify-content: space-between/space-around/space-evenly` | `FlexboxLayout` distribution |
| `align-items: center` | `android:gravity="center_vertical"` (row) or `"center_horizontal"` (column) |
| `align-items: stretch` | `android:gravity="fill"` |
| `align-content` | `FlexboxLayout` line alignment |
| `order` | Stable XML ordering plus `app:layout_order` |
| `flex-grow` / `flex-shrink` | `app:layout_flexGrow` / `app:layout_flexShrink` |
| `flex-basis` | Percentage basis or main-axis width/height |
| `flex` | Expanded into grow, shrink, and basis attributes |
| `align-self` | `app:layout_alignSelf` |
| `gap: 12px` | Simple `LinearLayout` approximation using divider attributes |

Advanced flex features emit Google `FlexboxLayout`. Android projects using
those generated layouts need this dependency:

```gradle
implementation 'com.google.android.flexbox:flexbox:3.0.0'
```

Simple row and column layouts continue to use `LinearLayout` and do not require
the Flexbox dependency. Gap values are not currently emitted for advanced,
wrapping `FlexboxLayout` containers.

### Grid

CSS Grid containers are converted to Android `GridLayout`.

| CSS | Android output |
|---|---|
| `display: grid/inline-grid` | `GridLayout` |
| `grid-template-columns` | Inferred `android:columnCount` |
| `grid-template-rows` | Inferred `android:rowCount` |
| Numeric `repeat()` | Expanded track count |
| `grid-auto-flow: row/column` | Horizontal or vertical automatic placement |
| `grid-column` / `grid-row` | Zero-based Android cell index and span |
| `grid-area: row / column / row-end / column-end` | Combined row and column placement |
| `justify-items` / `align-items` / `place-items` | Child `android:layout_gravity` |
| `justify-self` / `align-self` / `place-self` | Per-child gravity override |
| `gap`, `row-gap`, `column-gap` | Half-gap margins on adjacent grid items |
| Fractional tracks (`fr`) | Equal Android row or column weights |

This is an Android approximation, not a browser layout engine. Named grid lines
and areas, negative line numbers, dense packing, `auto-fit`, `auto-fill`, and
exact `minmax()` or unequal fractional track sizing are not currently resolved.
The generated layout preserves numeric track counts, placement, spans, order,
alignment, and practical spacing.

### Visibility

| CSS | Android attribute |
|---|---|
| `display: none` | `android:visibility="gone"` |
| `visibility: hidden` | `android:visibility="invisible"` |
| `visibility: visible` | `android:visibility="visible"` |

### Positioning

| CSS | Android output |
|---|---|
| `vertical-align: center` | Top + bottom constraint (centered vertically) |
| `bottom: 0` | Bottom constraint |
| Root `position: absolute/fixed` | Parent-edge ConstraintLayout anchors and margins |
| Nested `position: absolute/fixed` | Parent becomes `FrameLayout`; child gets gravity and edge margins |
| `position: relative` + offsets | `android:translationX` / `android:translationY` |
| Opposing edges such as `left: 0; right: 0` | Match/stretch across the available parent axis |
| `inset` shorthand | Expanded to top, right, bottom, and left edges |
| Paired `margin: auto` | Horizontal or vertical centering without invalid Android dimensions |
| `overflow-y: scroll` | Element wrapped in `ScrollView` |

Nested positioned children inside generated cards use a `FrameLayout` card
content container. Percentage offsets and sticky positioning are not currently
converted because Android XML has no direct static equivalent.

### Visual Effects

| CSS | Android attribute |
|---|---|
| `transform: rotate(15deg)` | `android:rotation="15.0"` |
| `transform: scale(1.1)` | `android:scaleX="1.1"` + `android:scaleY="1.1"` |
| `transform: translateX(8px)` | `android:translationX="8dp"` |
| `object-fit: cover` | `android:scaleType="centerCrop"` |
| `object-fit: contain` | `android:scaleType="centerInside"` |
| `object-fit: fill` | `android:scaleType="fitXY"` |
| `cursor: pointer` | `android:clickable="true"` + `android:focusable="true"` + ripple foreground |

### Accessibility

| HTML / ARIA | Android output |
|---|---|
| `aria-label` / `title` | `android:contentDescription` |
| `aria-hidden="true"` / `role="presentation"` | `android:importantForAccessibility="no"` |
| `aria-disabled="true"` | `android:enabled="false"` |
| `aria-live="polite/assertive"` | `android:accessibilityLiveRegion` |
| `aria-expanded` / `aria-pressed` | `android:stateDescription` |
| `dir="rtl/ltr"` / `lang="..."` | Text direction, layout direction, and locale attributes |

---

## Examples

### Login Screen

```html
<div id="card" style="background-color: white; border-radius: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 24px; width: 100%;">
    <h1 style="font-size: 24px; font-weight: bold; text-align: center; color: #1A1A2E;">Welcome Back</h1>
    <input type="email" id="email" placeholder="Email" style="margin-bottom: 12px;">
    <input type="password" id="password" placeholder="Password" maxlength="32" style="margin-bottom: 8px; border-color: #6200EE;">
    <button style="background-color: #6200EE; color: white; border-radius: 24px; width: 100%; min-height: 48px;">Log In</button>
</div>
```

Generates: `CardView` -> `TextInputLayout` (email) -> `TextInputLayout` (password, with custom stroke color) -> `MaterialButton` with corner radius.

### Gradient Hero Banner

```html
<div id="hero" style="background: linear-gradient(to right, #6200EE, #03DAC5); padding: 32px; width: 100%; border-radius: 0;">
    <h1 style="color: white; font-size: 28px; font-weight: bold;">Hello, World</h1>
    <p style="color: rgba(255,255,255,0.8); line-height: 1.5;">Build beautiful Android UIs.</p>
</div>
```

Generates: gradient shape drawable (`res/drawable/sl_grad_*.xml`) + layout.

### Bottom Navigation

```html
<nav id="bottom_nav" style="background-color: #FFFFFF;">
    <a>Home</a>
    <a>Search</a>
    <a>Profile</a>
</nav>
```

Generates: `BottomNavigationView` in the layout + `res/menu/bottom_nav_menu.xml` with three items.

### Floating Action Button

```html
<div id="screen" style="width: 100%; height: 100%;">
    <div id="fab" style="position: absolute; bottom: 16px; right: 16px; background-color: #6200EE; border-radius: 28px;">
        <button style="color: white;">+</button>
    </div>
</div>
```

Generates: parent becomes `FrameLayout`; FAB div uses `android:layout_gravity="end|bottom"` with bottom/right margins.

---

## Command-Line Usage

The package installs a `shiftlayout` command that converts an HTML file and
writes the complete Android resource tree:

```bash
shiftlayout screen.html --output android-output --layout-name activity_main
```

The output directory defaults to `android-output`. Local image and mapped font paths are
resolved relative to the input HTML file. Useful options include:

```text
--prefix <prefix>
--default-image-density <qualifier>
--media-width <size>
--media-height <size>
--media-orientation <portrait|landscape>
--media-type <type>
--font-source <declared-url> <local-path-or-@font-reference>
      --strict
      --extract-resources
```

Run `shiftlayout --help` for the complete usage text. Successful conversion
returns exit code `0`, conversion or file failures return `1`, and invalid
command-line usage returns `2`.

---

## Testing

Run `npm test` for the focused parser, resource, layout, form, and accessibility
suites plus the broad end-to-end regression coverage. Performance fixtures are
kept separate so their timing output remains explicit:

```bash
npm run test:performance
```

### Debugging A Conversion

Start with strict mode so approximations and unsupported input fail at the
conversion boundary:

```bash
shiftlayout screen.html --output debug-output --strict
```

If strict mode fails, rerun without `--strict` to write the partial Android
resources and inspect these files:

- `diagnostics/warnings.json` for unsupported or approximated HTML/CSS
- `diagnostics/assets.json` for missing, rejected, or conflicting files
- `diagnostics/forms.json` for form constraints and support/error text
- `diagnostics/interactions.json` for runtime actions that still need app wiring
- `diagnostics/media.json` for media and embedded-content runtime requirements
- `diagnostics/extracted-resources.json` for generated value references

For a source-level Node.js debugging session, invoke the packaged CLI through
Node and pass normal CLI arguments after the script path:

```bash
node --inspect-brk bin/shiftlayout.js screen.html --output debug-output
```

After resolving conversion warnings, compile the generated resources with the
Android SDK to catch resource-name, XML, and reference errors:

```bash
aapt2 compile --dir debug-output/res -o debug-output/compiled.zip
```

`aapt2 compile` validates individual resources. A complete Android application
should also run its normal Gradle resource-link and build tasks because app
themes, dependencies, minimum SDK choices, and application-owned references are
outside ShiftLayout's generated resource directory.

---

## Writing Files

Use the exported resource writer to create an Android-style output tree and copy
local bitmap and font assets:

```javascript
const ShiftLayout = require('shiftlayout');

const converter = new ShiftLayout();
const result = converter.convert(html);
const report = ShiftLayout.writeResources('android-output', result, {
    baseDir: __dirname,
    layoutName: 'activity_main',
    defaultImageDensity: 'xhdpi',
});
```

`baseDir` is the containment root for local image and font sources. Files that resolve
outside it, do not exist, or use unsupported formats are skipped and reported.
PNG, JPEG, WebP, and GIF files are copied. Supported SVG files are converted to
Android VectorDrawable XML. TTF, OTF, and TTC files are copied to `res/font`.
Remote URLs remain in their asset manifests without network access.

Image density can come from `data-android-density`, a density directory such as
`xhdpi/`, an `@2x` filename suffix, `imageDensities[source]`, or
`defaultImageDensity`. The writer uses Android directories such as
`res/drawable-hdpi` and `res/drawable-xhdpi`; images without a density use
`res/drawable`.

The returned report lists written files, copied and skipped images, copied and
skipped fonts, and asset warnings. Source manifests are written to
`assets/images.json` and `assets/fonts.json`, while the copy summary is written
to `diagnostics/assets.json`; interaction metadata is written to
`diagnostics/interactions.json`, form metadata to `diagnostics/forms.json`, and
embedded-media metadata to `diagnostics/media.json`.

### Optional Value Extraction

Enable repeated Android value extraction through the constructor:

```javascript
const converter = new ShiftLayout({ extractResources: true });
```

Repeated compatible literals are replaced across generated layout, drawable,
and menu XML with `@color`, `@dimen`, and `@string` references. ShiftLayout
adds `colors.xml`, `dimens.xml`, and `strings.xml` when each type has matches,
and returns their names and original values through `extractedResources`. The
writer also saves that manifest to `diagnostics/extracted-resources.json`.

Extraction is disabled by default. Configure individual types and the minimum
occurrence count when finer control is needed:

```javascript
const converter = new ShiftLayout({
    extractResources: {
        colors: true,
        dimensions: true,
        strings: false,
        minOccurrences: 3,
    },
});
```

Only attributes whose Android types accept the corresponding resource are
eligible, preventing text that happens to resemble a color or dimension from
being replaced with an incompatible reference.

### SVG Conversion

The resource writer converts this SVG subset:

- `<path>` data
- Rectangles, including rounded rectangles
- Circles and ellipses
- Lines, polylines, and polygons
- Nested groups
- Fill and stroke colors, widths, opacity, line caps, joins, and fill rules
- Basic `translate()`, `scale()`, and `rotate()` transforms
- Nonzero `viewBox` origins

SVG scripts, external images, `<use>`, `foreignObject`, gradients, patterns,
masks, filters, clipping references, text, dashed strokes, and matrix/skew
transforms are not silently embedded. They are omitted and reported through the
asset write report. Converted vectors are written to `res/drawable/<name>.xml`;
drawable resource-name conflicts are reported instead of overwritten.

Run the included example:

```bash
node examples/write-android-resources.js
```

It writes `res/layout`, `res/drawable`, `res/menu`, `res/values`, image and font
asset manifests, and structured conversion/asset diagnostics under
`examples/android-output/`.

---

## Performance Fixtures

Run the large-document and deeply-nested conversion fixtures with:

```bash
npm run test:performance
```

Each fixture reports input size, generated layout size, warning count, and
elapsed conversion time. Set `SHIFTLAYOUT_PERF_BUDGET_MS` to a positive number
to enforce a per-fixture time budget; no timing threshold is imposed by default
because performance varies across machines. CI runs both fixtures as smoke tests.

---

## Android Resource Validation

CI generates a representative layout, shape drawable, navigation vectors and
menu, and values file, then compiles the complete `res/` directory with Android
SDK `aapt2`. Generate the same fixture locally with:

```bash
npm run test:android:generate -- path/to/output
```

The command only generates the fixture. Compiling it locally requires Android
SDK Build Tools:

```bash
aapt2 compile --dir path/to/output/res -o path/to/output/compiled.zip
```

---

## Notes

- Bare numeric, `px`, `em`, and `rem` values are automatically converted to `dp` (layout) or `sp` (text).
- Inline CSS comments are ignored and `!important` markers are stripped before conversion.
- 3-digit hex colors (`#FFF`) are expanded to 6-digit (`#FFFFFF`).
- `rgba()` and `hsla()` transparency is converted to Android's `#AARRGGBB` format.
- Shape drawables are deduplicated - the same color + radius combination reuses one file.
- `<select>` entries (`<option>`) are returned as per-select XML files in `arrays` and combined in `values['arrays.xml']`.
- `<nav>` menus include generated fallback vector icons (`@drawable/ic_nav_1` etc.); replace them with app-specific icons when appropriate.
