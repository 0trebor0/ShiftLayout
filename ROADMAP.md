# ShiftLayout Roadmap

This file tracks completed capabilities, active work, and features that have not
been implemented yet. Update it whenever a feature is started, completed,
deferred, or removed from scope.

## Status Key

- `[x]` Complete and covered by the current implementation.
- `[ ]` Planned but not implemented.
- `In progress` Work has started but is not complete.
- `Deferred` Intentionally postponed.

## Current Release: 5.0.0

### Conversion Core

- [x] Convert HTML fragments into Android XML layouts.
- [x] Generate stable, sanitized, and deduplicated Android resource names.
- [x] Escape XML attributes and text safely.
- [x] Return layout, drawable, menu, value, array, and asset outputs.
- [x] Write generated resources through the example script.

### HTML Coverage

- [x] Layout containers, scrolling containers, cards, and absolute-positioned children.
- [x] Headings, paragraphs, semantic inline text, links, labels, and line breaks.
- [x] Ordered and unordered lists, including `start` and `reversed` numbering.
- [x] Tables, captions, sections, header cells, alignment, and cell spans.
- [x] Text inputs, text areas, buttons, checkboxes, radios, ranges, selects, and file inputs.
- [x] Images, picture fallbacks, progress bars, meters, navigation, and floating actions.
- [x] Accessibility metadata, hidden states, disabled states, language, and RTL direction.

### CSS Coverage

- [x] Inline style parsing with comments, quoted values, functions, and `!important` cleanup.
- [x] Dimensions and spacing using numbers, `px`, `dp`, `sp`, `em`, and `rem`.
- [x] Hex, RGB, RGBA, HSL, HSLA, and named colors.
- [x] Background colors, linear gradients, borders, outlines, radii, and shadows.
- [x] Typography, alignment, decoration, indentation, wrapping hints, and text transforms.
- [x] Basic flex direction, alignment, gaps, and layout weights.
- [x] Basic rotation, scale, translation, visibility, overflow, and absolute positioning.

### Quality And Distribution

- [x] JavaScript regression test suite.
- [x] Runnable Android resource-writing example.
- [x] npm package whitelist that excludes generated example output.
- [x] README usage and feature reference.
- [x] Changelog for version 5.0.0.

## Next: Stylesheet Support

- [x] Parse CSS from `<style>` elements.
- [x] Match tag, class, ID, attribute, grouped, and descendant selectors.
- [x] Apply cascade ordering, specificity, inheritance, and `!important` precedence.
- [x] Resolve inherited CSS custom properties and `var()` fallback values.
- [x] Add tests for conflicting rules and inherited text styles.
- [x] Add an explicit API for caller-supplied linked stylesheets without hidden network access.

## Planned: Layout Fidelity

- [x] Expand Flexbox support for wrapping, reverse directions, ordering, item sizing, and distribution rules.
- [x] Add a documented Android `GridLayout` approximation for numeric tracks, placement, spans, alignment, and gaps.
- [x] Improve relative, absolute, and fixed positioning with parent-aware constraints, stretching, and centering.
- [x] Support safe, dimension-aware `min()`, `max()`, `clamp()`, and practical `calc()` expressions.
- [x] Add media-query profiles for caller-selected width, height, orientation, and media type.
- [x] Report unsupported and approximated CSS through deduplicated structured diagnostics.

## Planned: Assets And Resources

- [x] Copy contained local bitmap images through an explicit Android resource writer.
- [x] Add density-aware image destinations, scale-suffix inference, and safe drawable naming.
- [x] Convert supported SVG geometry, paint, and transforms into Android vector drawables.
- [ ] Generate or map navigation icons instead of emitting placeholder references.
- [ ] Map local and web font declarations to Android font resources.
- [ ] Extract repeated colors, dimensions, and strings into optional value resources.

## Planned: HTML And Interaction

- [ ] Add explicit handling for audio, video, iframe, canvas, and embedded content.
- [ ] Improve form grouping, validation metadata, and error/helper text generation.
- [ ] Add configurable mappings for custom elements and web components.
- [ ] Represent pseudo-elements such as `::before` and `::after` where Android permits it.
- [ ] Produce interaction metadata for links, buttons, forms, and navigation targets.
- [ ] Define extension hooks for application-specific event and data-binding generation.

## Planned: Tooling And Validation

- [ ] Add a CLI for converting HTML files and writing a complete resource directory.
- [ ] Add structured warnings with source element and CSS-property context.
- [ ] Add strict mode that fails on unsupported or invalid input.
- [ ] Split the regression suite into focused parser, resource, layout, form, and accessibility tests.
- [ ] Validate generated resources with Android SDK tooling in continuous integration.
- [ ] Add supported Node.js versions and CI coverage to package documentation.
- [ ] Add performance fixtures for large documents and deeply nested layouts.

## Deferred

- TypeScript source migration and declaration files.
- Jetpack Compose generation.
- Kotlin or Java activity, fragment, navigation, and runtime event code generation.
- CSS animations, transitions, keyframes, and browser-state pseudo-classes.

## Maintenance Rules

1. Move a feature to `In progress` before implementation begins.
2. Mark it complete only after implementation, tests, and documentation are finished.
3. Add newly discovered limitations to the relevant planned section.
4. Record user-visible completed work in `CHANGELOG.md`.
5. Keep TypeScript work deferred until it is explicitly resumed.
