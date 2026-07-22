# Changelog

## Unreleased

- Split regression coverage into focused parser, resource, layout, form, and
  accessibility suites while retaining the broad end-to-end regression file.
- Added `@font-face` conversion for contained TTF, OTF, and TTC files, explicit
  remote URL mappings, generated Android font families, CLI support, and writer manifests.
- Added optional repeated color, dimension, and string extraction into Android
  value resources, including selective configuration, CLI support, and a manifest.
- Added textual `::before` and `::after` conversion with cascade, variables,
  `attr()`, inline flattening, styled container children, and diagnostics.
- Added validated element, interaction, and result extension hooks for
  application-specific XML bindings, events, metadata, and artifacts.
- Added explicit audio, video, iframe, canvas, embed, and object conversion with
  valid leaf views and structured runtime media metadata.
- Added structured form, fieldset, constraint, helper, and error metadata, plus
  Material helper/error caption generation for text controls.
- Added structured interaction metadata for forms, links, buttons, and bottom
  navigation targets, including resource-writer diagnostic output.
- Added validated constructor mappings from hyphenated HTML custom elements to
  simple or fully qualified Android view tags.
- Added a representative Android resource fixture and CI validation through the
  Android SDK `aapt2` compiler.
- Added CI performance fixtures for large and deeply nested documents, with
  reported metrics and an optional per-fixture time budget.
- Added Linux CI coverage for Node.js 20.18.1, 22, and 24, including regression
  tests and package dry runs, and made npm scripts cross-platform.
- Added a packaged `shiftlayout` CLI for converting HTML files into complete
  Android resource directories with media, density, naming, and strict options.
- Added opt-in strict conversion that throws `ShiftLayoutConversionError` with
  the collected structured warnings when conversion is not exact.
- Added generated fallback vector drawables for bottom-navigation menu icons so
  converted navigation layouts no longer reference missing resources.
- Documented the Node.js 20.18.1 minimum required by the current dependency tree.
- Reconciled the roadmap with the implemented structured diagnostics and basic
  video and iframe mappings.
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
