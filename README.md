# HTML to Android XML Converter - Guide

A comprehensive library to convert HTML and CSS into native Android XML layouts, with full support for ConstraintLayout. This tool is designed to help developers quickly prototype or convert web-based views into Android-compatible layouts.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Basic Conversion](#basic-conversion)
  - [Conversion with Resources](#conversion-with-resources)
- [API Reference](#api-reference)
  - [`htmlToAndroidXML(html, options)`](#htmltoandroidxmlhtml-options)
  - [`convertWithResources(html, options)`](#convertwithresourceshtml-options)
  - [`ConversionOptions`](#conversionoptions)
- [Classes](#classes)
  - [`HTMLToAndroidXMLConverter`](#htmltoandroidxmlconverter)
  - [`XMLBuilder`](#xmlbuilder)
- [Mappings](#mappings)
  - [Tag Mappings](#tag-mappings)
  - [Style Mappings](#style-mappings)
- [Examples](#examples)
- [How it Works](#how-it-works)
- [Contributing](#contributing)

## Overview

This library provides a robust solution for converting HTML structures and their corresponding CSS styles into Android XML layout files. It parses the HTML DOM, maps HTML tags to Android View components, and converts CSS properties into XML attributes. It's production-ready and includes advanced features like ConstraintLayout generation, Material Components support, and resource extraction.

## Features

- **ConstraintLayout Support**: Automatically generates layouts using `ConstraintLayout` for flexible and efficient view positioning.
- **Material Components**: Option to generate modern Material Design components.
- **Resource Extraction**: Extracts complex styles (like borders and rounded corners) into drawable XML files.
- **Style Parsing**: Converts inline CSS and `<style>` blocks into Android XML attributes.
- **Customizable**: A wide range of options to control the conversion process.
- **Full HTML5 Tag Support**: Maps all standard HTML5 tags to appropriate Android views.
- **Flexbox to LinearLayout**: Converts CSS Flexbox properties into `LinearLayout` attributes.

## Installation

To use this library, you need to have `cheerio` and `xml-formatter` installed.

```bash
npm install cheerio xml-formatter
```

Then, include `lib.js` in your project.

```javascript
const { htmlToAndroidXML, convertWithResources } = require('./lib.js');
```

## Usage

### Basic Conversion

The simplest way to use the library is to call the `htmlToAndroidXML` function.

```javascript
const { htmlToAndroidXML } = require('./lib.js');

const html = '<h1>Hello, Android!</h1>';
const options = {
  useConstraintLayout: true,
  generateMaterialComponents: true
};

const xmlLayout = htmlToAndroidXML(html, options);
console.log(xmlLayout);
```

### Conversion with Resources

For designs with complex backgrounds, borders, or rounded corners, the `convertWithResources` function is recommended. It generates the main layout XML and any required drawable resource files.

```javascript
const { convertWithResources } = require('./lib.js');
const fs = require('fs');

const html = `
  <button style="background-color: #4CAF50; color: white; 
                 padding: 16px; border-radius: 8px;">
    Sign In
  </button>
`;

const result = convertWithResources(html);

// Save the main layout file
fs.writeFileSync('my_layout.xml', result.xml);

// Save any generated drawable files
result.drawableShapes.forEach(shape => {
  fs.writeFileSync(`drawable/${shape.name}.xml`, shape.xml);
});
```

## API Reference

### `htmlToAndroidXML(html, options)`

Converts an HTML string to an Android XML layout string.

- **`html`** (`string`): The HTML content to convert.
- **`options`** (`object`, optional): A `ConversionOptions` object to customize the output.
- **Returns**: `string` - The generated Android XML layout.

### `convertWithResources(html, options)`

Converts HTML and extracts resources like drawables.

- **`html`** (`string`): The HTML content to convert.
- **`options`** (`object`, optional): A `ConversionOptions` object.
- **Returns**: `object` - An object containing:
  - `xml` (`string`): The main layout XML.
  - `resources` (`object`): An object with `drawableShapes` and `drawables`.
  - `drawableShapes` (`Array`): An array of objects, each with a `name` and `xml` content for a drawable file.
  - `drawables` (`Array`): An array of image sources that need to be converted to drawables.

### `ConversionOptions`

The options object allows you to customize the conversion process.

| Option                       | Type      | Default                | Description                                                                 |
| ---------------------------- | --------- | ---------------------- | --------------------------------------------------------------------------- |
| `rootLayout`                 | `string`  | `'ConstraintLayout'`   | The root layout element to use if `useConstraintLayout` is `false`.         |
| `defaultOrientation`         | `string`  | `'vertical'`           | Default orientation for `LinearLayout`.                                     |
| `includeIds`                 | `boolean` | `true`                 | Whether to include `android:id` attributes.                                 |
| `autoGenerateIds`            | `boolean` | `true`                 | Automatically generate IDs for elements without an `id` attribute.          |
| `resourcePrefix`             | `string`  | `'generated'`          | Prefix for auto-generated IDs and resource names.                           |
| `minifyOutput`               | `boolean` | `false`                | If `true`, the output XML will not be formatted.                            |
| `convertImages`              | `boolean` | `true`                 | Convert `<img>` tags to `ImageView` and reference a drawable.               |
| `imageDrawablePrefix`        | `string`  | `'img'`                | Prefix for drawable names generated from image sources.                     |
| `extractStyles`              | `boolean` | `true`                 | Extract styles from `<style>` blocks.                                       |
| `stylePrefix`                | `string`  | `'Style'`              | Prefix for generated style names (feature not fully implemented).           |
| `generateMaterialComponents` | `boolean` | `false`                | Use Material Components (e.g., `MaterialButton`) where applicable.          |
| `flexboxSupport`             | `boolean` | `true`                 | Convert `display: flex` styles to `LinearLayout`.                           |
| `useConstraintLayout`        | `boolean` | `true`                 | Use `ConstraintLayout` as the root and for positioning.                     |
| `addToolsContext`            | `string`  | `'.MainActivity'`      | Sets the `tools:context` attribute on the root layout.                      |

## Classes

### `HTMLToAndroidXMLConverter`

The main class that handles the conversion logic. You can instantiate this class for more control over the process.

```javascript
const converter = new HTMLToAndroidXMLConverter({ useConstraintLayout: false });
const xml = converter.convert('<div>...</div>');
```

### `XMLBuilder`

A utility class for programmatically creating the XML structure. It uses a DOM-like approach to build XML elements, which are then serialized into a string.

## Mappings

### Tag Mappings

HTML tags are mapped to corresponding Android View classes. Here are some key mappings:

- `<div>`, `<section>`, `<article>` -> `LinearLayout`
- `<h1>`-`<h6>`, `<p>`, `<span>` -> `TextView`
- `<button>` -> `Button` or `com.google.android.material.button.MaterialButton`
- `<input>` -> `EditText` or `com.google.android.material.textfield.TextInputEditText`
- `<img>` -> `ImageView`
- `<ul>`, `<ol>` -> `LinearLayout`
- `<li>` -> `TextView` (with a '•' prefix)
- `<table>` -> `TableLayout`

### Style Mappings

CSS properties are converted to Android XML attributes.

- `background-color` -> `android:background`
- `color` -> `android:textColor`
- `font-size` -> `android:textSize`
- `font-weight` -> `android:textStyle`
- `text-align` -> `android:gravity`
- `padding` -> `android:padding` (and individual sides)
- `margin` -> `android:layout_margin` (and individual sides)
- `width` -> `android:layout_width`
- `height` -> `android:layout_height`
- `border-radius` -> Generates a shape drawable.
- `display: flex` -> `LinearLayout` attributes.

## Examples

The `lib.js` file contains several usage examples at the bottom of the file, demonstrating how to handle forms, styling, resource generation, and different layout configurations.

## How it Works

The conversion process follows these steps:

1.  **Parsing HTML**: The library uses `cheerio` to parse the input HTML string into a traversable DOM structure.
2.  **Style Extraction**: If enabled, it finds all `<style>` blocks and parses the CSS rules into a JavaScript object for later use.
3.  **DOM Traversal**: It recursively traverses the HTML DOM tree, starting from the `<body>` tag.
4.  **Node Conversion**: Each HTML node is processed:
    *   **Tag Mapping**: The HTML tag is mapped to an Android View class (e.g., `div` -> `LinearLayout`).
    *   **Attribute Extraction**: Inline styles, classes, and HTML attributes are parsed.
    *   **Style Mapping**: CSS properties are converted into their corresponding Android XML attributes.
    *   **ID Generation**: `android:id` attributes are generated based on the element's `id` or auto-generated if the option is enabled.
5.  **XML Building**: The `XMLBuilder` class constructs a virtual XML tree that mirrors the Android layout structure.
6.  **Resource Generation**: For complex styles like rounded corners or borders, a corresponding drawable XML is generated, and the view's background is set to reference it.
7.  **XML Serialization**: The virtual XML tree is serialized into a formatted string, resulting in the final Android XML layout.

## Contributing

Contributions are welcome! If you have suggestions for improvements or find any issues, please open an issue or submit a pull request on the project's repository.
