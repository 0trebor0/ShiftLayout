# Changelog

## Unreleased

- Added embedded `<style>` support with common selectors, cascade specificity,
  source ordering, `!important`, inherited text styles, and CSS custom properties.
- Added caller-supplied external stylesheets matched to linked `href` values in
  document cascade order without automatic file or network access.
- Added advanced Flexbox conversion using Android `FlexboxLayout` for wrapping,
  reverse directions, distribution, ordering, grow/shrink, basis, and self-alignment.
- Added CSS Grid conversion using Android `GridLayout` with inferred track counts,
  item placement and spans, ordering, alignment, fractional weights, and gap margins.
- Improved positioning with root ConstraintLayout anchors, nested FrameLayout
  placement, relative translations, dual-edge stretching, and auto-margin centering.
- Added safe computed-length evaluation for compatible `calc()`, `min()`, `max()`,
  and `clamp()` expressions across dimensions, spacing, typography, and offsets.
- Added caller-selected media profiles for nested `@media` rules using target
  width, height, orientation, and media type in embedded or linked stylesheets.
- Added structured, deduplicated conversion warnings for unsupported properties,
  unsupported values, approximations, invalid selectors, and missing linked CSS.
- Added an explicit Android resource writer with contained local bitmap copying,
  density-aware drawable destinations, deduplication, and asset write reports.
- Added safe SVG conversion for paths, common geometry, presentation styles, and
  basic transforms into Android VectorDrawable XML with unsupported-feature warnings.
- Updated the patched transitive HTTP dependency to clear the npm security audit.

## 5.0.0

- Exported `ShiftLayout` from the package entrypoint.
- Added XML escaping and safer Android resource name generation.
- Expanded HTML coverage for forms, tables, media, semantic text, lists, navigation, and accessibility.
- Expanded CSS conversion for colors, gradients, spacing, borders, typography, flexbox, transforms, visibility, and positioning.
- Added generated resource maps for drawables, menus, arrays, combined values, grouped resources, and image asset manifests.
- Added regression tests and an example script for writing Android resource files.
