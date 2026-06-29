# ShiftLayout v5.0.0

**ShiftLayout** converts HTML + CSS into production-ready Android XML layouts. Write your UI in HTML, get back ConstraintLayout, CardView, MaterialButton, TextInputLayout, BottomNavigationView, shape drawables, gradient drawables, and menu files - ready to drop into Android Studio.

See [ROADMAP.md](ROADMAP.md) for completed capabilities, upcoming features, and deferred work.

---

## Installation

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

const { layout, drawables, menus, arrays, values, resources, assets } = sculptor.convert(html);

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
});
```

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
| `resources` | `{ drawables, menus, values }` | Grouped Android resource files |
| `assets` | `{ images: Array<{ source, resource, density }> }` | External image manifest |
| `warnings` | `Array<{ severity, code, message, element, property, value }>` | Structured conversion diagnostics |

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

Warnings are deduplicated and include element, property, and value context when
available. CSS custom properties do not produce unsupported-property warnings.

---

## HTML Tag Reference

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
| `<video>` | `VideoView` | |
| `<iframe>` | `WebView` | |

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

## Writing Files

Use the exported resource writer to create an Android-style output tree and copy
local bitmap assets:

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

`baseDir` is the containment root for local image sources. Files that resolve
outside it, do not exist, or use unsupported formats are skipped and reported.
PNG, JPEG, WebP, and GIF files are copied. Supported SVG files are converted to
Android VectorDrawable XML. Remote HTTP, data, and blob URLs stay in the image
manifest without network access.

Image density can come from `data-android-density`, a density directory such as
`xhdpi/`, an `@2x` filename suffix, `imageDensities[source]`, or
`defaultImageDensity`. The writer uses Android directories such as
`res/drawable-hdpi` and `res/drawable-xhdpi`; images without a density use
`res/drawable`.

The returned report lists written files, copied images, skipped images, and
asset warnings. The same asset summary is written to
`diagnostics/assets.json`.

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

It writes `res/layout`, `res/drawable`, `res/menu`, `res/values`, an image asset
manifest, and structured conversion/asset diagnostics under
`examples/android-output/`.

---

## Notes

- Bare numeric, `px`, `em`, and `rem` values are automatically converted to `dp` (layout) or `sp` (text).
- Inline CSS comments are ignored and `!important` markers are stripped before conversion.
- 3-digit hex colors (`#FFF`) are expanded to 6-digit (`#FFFFFF`).
- `rgba()` and `hsla()` transparency is converted to Android's `#AARRGGBB` format.
- Shape drawables are deduplicated - the same color + radius combination reuses one file.
- `<select>` entries (`<option>`) are returned as per-select XML files in `arrays` and combined in `values['arrays.xml']`.
- `<nav>` menu icon references (`@drawable/ic_nav_1` etc.) must be created manually or replaced with your own icon drawables.
