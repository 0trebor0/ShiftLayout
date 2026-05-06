# ShiftLayout v5.0.0

**ShiftLayout** converts HTML + CSS into production-ready Android XML layouts. Write your UI in HTML, get back ConstraintLayout, CardView, MaterialButton, TextInputLayout, BottomNavigationView, shape drawables, gradient drawables, and menu files — ready to drop into Android Studio.

---

## Installation

```bash
npm install cheerio
```

---

## Quick Start

```javascript
const ShiftLayout = require('./lib.js');
const sculptor = new ShiftLayout({ useConstraint: true });

const html = `
<div id="login_card" style="background-color: white; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 24px; width: 100%;">
    <h1 style="font-size: 24px; font-weight: bold; text-align: center; color: #1A1A2E;">Sign In</h1>
    <input type="email" id="email" placeholder="Email address" style="margin-bottom: 12px;">
    <input type="password" id="pwd" placeholder="Password" maxlength="32" style="margin-bottom: 16px;">
    <button style="background-color: #6200EE; color: white; border-radius: 24px; width: 100%;">Sign In</button>
</div>
`;

const { layout, drawables, menus } = sculptor.convert(html);

// layout   → paste into res/layout/activity_main.xml
// drawables → write each entry to res/drawable/<name>
// menus     → write each entry to res/menu/<name>

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

`convert(html)` returns an object with three keys:

| Key | Type | Write to |
|---|---|---|
| `layout` | `string` | `res/layout/your_layout.xml` |
| `drawables` | `{ [filename]: string }` | `res/drawable/` |
| `menus` | `{ [filename]: string }` | `res/menu/` |

---

## HTML Tag Reference

### Layout Containers

| HTML | Android View | Notes |
|---|---|---|
| `<div>`, `<section>`, `<main>`, `<article>`, `<aside>`, `<form>`, `<header>`, `<footer>`, `<fieldset>` | `LinearLayout` | Vertical by default; `flex-direction: row` makes it horizontal |
| `<div>` with `border-radius` + `box-shadow` | `CardView` | Auto-detected; generates `app:cardCornerRadius`, `app:cardElevation` |
| `<div>` with absolutely positioned children | `FrameLayout` | Auto-detected when any child has `position: absolute` |
| `<div>` with `overflow-y: scroll` | `ScrollView` wrapping `LinearLayout` | `android:fillViewport="true"` included |
| `<ul>`, `<ol>` | `LinearLayout` | |
| `<table>` | `TableLayout` | |
| `<tr>` | `TableRow` | |

### Navigation

| HTML | Android View | Notes |
|---|---|---|
| `<nav>` with only `<a>` children | `BottomNavigationView` | Auto-generates `res/menu/*.xml` with items from the link text |
| `<nav>` with mixed children | `LinearLayout` | Standard container |

### Text

| HTML | Android View |
|---|---|
| `<h1>` `<h2>` `<h3>` `<h4>` | `TextView` |
| `<p>` `<span>` `<label>` `<a>` `<li>` `<legend>` `<td>` `<th>` | `TextView` |

### Inputs

| HTML | Android View | Notes |
|---|---|---|
| `<input type="text/email/password/number/tel/url/search/date/time">` | `TextInputLayout` + `TextInputEditText` | Material floating label; style from `inputStyle` option |
| `<textarea>` | `TextInputLayout` + `TextInputEditText` | `android:inputType="textMultiLine"` |
| `<input type="checkbox">` | `CheckBox` | |
| `<input type="radio">` | `RadioButton` | |
| `<input type="submit">` / `<input type="button">` | `MaterialButton` | |
| `<select>` | `Spinner` | `<option>` children are skipped; populate via adapter in code |

### Other

| HTML | Android View | Notes |
|---|---|---|
| `<button>` | `MaterialButton` | Uses `app:backgroundTint`, `app:cornerRadius`, `app:strokeColor` |
| `<img>` | `ImageView` | `src="logo.png"` → `@drawable/logo`; `src="@drawable/x"` passed through |
| `<progress value="60" max="100">` | `ProgressBar` | Horizontal style applied automatically when `value`/`max` present |
| `<hr>` | `View` (1dp divider) | |
| `<video>` | `VideoView` | |
| `<iframe>` | `WebView` | |

---

## CSS Property Reference

### Colors

All color formats are supported:

```css
color: red;                      /* named color */
color: #6200EE;                  /* hex (3 or 6 digit) */
color: rgb(98, 0, 238);          /* rgb() */
color: rgba(0, 0, 0, 0.5);      /* rgba() → Android #AARRGGBB format */
```

Named colors: `white`, `black`, `red`, `green`, `blue`, `yellow`, `gray`, `silver`, `transparent`.

### Background

| CSS | Android output |
|---|---|
| `background-color: #FFF` | `android:background="#FFFFFF"` |
| `background: linear-gradient(to right, #6200EE, #03DAC5)` | `android:background="@drawable/sl_grad_*.xml"` |
| `border-radius: 12px` | `android:background="@drawable/sl_bg_*.xml"` with `<corners>` |
| `border: 2px solid #E0E0E0` | Shape drawable with `<stroke>` |
| `border-color: #E0E0E0` / `border-width: 2px` | Combined into shape drawable |
| `box-shadow: 0 4px 12px rgba(...)` | `android:elevation` (blur radius extracted) |
| `z-index: 4` | `android:elevation="4dp"` |
| `opacity: 0.8` | `android:alpha="0.80"` |
| `overflow: hidden` | `android:clipChildren="true"` + `android:clipToPadding="true"` |

> **Generated drawables** — shape and gradient XML files are returned in the `drawables` map. Write each file to `res/drawable/`.

### Typography

| CSS | Android attribute |
|---|---|
| `font-size: 18px` | `android:textSize="18sp"` |
| `font-weight: bold` / `font-weight: 700` | `android:textStyle="bold"` |
| `font-style: italic` | `android:textStyle="italic"` |
| `font-family: Georgia, serif` | `android:fontFamily="serif"` |
| `text-align: center` | `android:gravity="center"` |
| `letter-spacing: 2px` | `android:letterSpacing="0.125"` |
| `line-height: 1.5` | `android:lineSpacingMultiplier="1.50"` |
| `white-space: nowrap` | `android:maxLines="1"` + `android:ellipsize="end"` |
| `text-overflow: ellipsis` | `android:ellipsize="end"` |
| `-webkit-line-clamp: 3` | `android:maxLines="3"` + `android:ellipsize="end"` |

Supported font families: Roboto, Open Sans, Lato, Ubuntu → `sans-serif`; Georgia, Times New Roman → `serif`; Courier → `monospace`.

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

### Flexbox

| CSS | Android output |
|---|---|
| `flex-direction: row` | `android:orientation="horizontal"` |
| `flex-direction: column` | `android:orientation="vertical"` (default) |
| `justify-content: center` | `android:gravity="center_horizontal"` (row) or `"center_vertical"` (column) |
| `justify-content: flex-end` | `android:gravity="end"` or `"bottom"` |
| `align-items: center` | `android:gravity="center_vertical"` (row) or `"center_horizontal"` (column) |
| `align-items: stretch` | `android:gravity="fill"` |

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
| `position: absolute` + `top/left/right/bottom` | Parent becomes `FrameLayout`; child gets `android:layout_gravity` + margins |
| `overflow-y: scroll` | Element wrapped in `ScrollView` |

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

Generates: `CardView` → `TextInputLayout` (email) → `TextInputLayout` (password, with custom stroke color) → `MaterialButton` with corner radius.

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

## Notes

- `px` values are automatically converted to `dp` (layout) or `sp` (text).
- 3-digit hex colors (`#FFF`) are expanded to 6-digit (`#FFFFFF`).
- `rgba()` transparency is converted to Android's `#AARRGGBB` format.
- Shape drawables are deduplicated — the same color + radius combination reuses one file.
- `<select>` entries (`<option>`) are skipped in XML; populate the `Spinner` via a code adapter.
- `<nav>` menu icon references (`@drawable/ic_nav_1` etc.) must be created manually or replaced with your own icon drawables.
