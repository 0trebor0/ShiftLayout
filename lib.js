// ============================================================================
// HTML TO ANDROID XML CONVERTER - COMPLETE LIBRARY
// Version: 4.0.0 - Production Ready with ConstraintLayout Support
// 
// Convert HTML/CSS to Android XML layouts with full ConstraintLayout support
// ============================================================================

const cheerio = require('cheerio');
const xmlFormatter = require('xml-formatter');

// ============================================================================
// XML BUILDER - Proper DOM-based approach
// ============================================================================

class XMLBuilder {
  constructor() {
    this.doc = null;
  }

  createElement(tagName, attributes = {}, children = []) {
    const element = {
      type: 'element',
      name: tagName,
      attributes: {},
      children: []
    };

    // Add attributes
    Object.entries(attributes).forEach(([key, value]) => {
      if (!key.startsWith('_') && value !== null && value !== undefined) {
        element.attributes[key] = String(value);
      }
    });

    // Add children
    if (Array.isArray(children)) {
      element.children = children.filter(child => child !== null && child !== undefined);
    } else if (typeof children === 'string') {
      element.children = [{ type: 'text', text: children }];
    }

    return element;
  }

  toXML(element, indent = 0) {
    const spaces = '    '.repeat(indent);
    
    if (element.type === 'text') {
      return element.text;
    }

    // Build opening tag with attributes
    let xml = `${spaces}<${element.name}`;
    
    Object.entries(element.attributes).forEach(([key, value]) => {
      xml += `\n${spaces}    ${key}="${this.escapeXml(value)}"`;
    });

    // Self-closing if no children
    if (element.children.length === 0) {
      xml += ' />';
      return xml;
    }

    xml += '>';

    // Add children
    const hasElementChildren = element.children.some(c => c.type === 'element');
    
    if (hasElementChildren) {
      xml += '\n\n';
      element.children.forEach(child => {
        xml += this.toXML(child, indent + 1);
        if (child.type === 'element') xml += '\n';
      });
      xml += '\n' + spaces;
    } else {
      element.children.forEach(child => {
        xml += this.toXML(child, 0);
      });
    }

    xml += `</${element.name}>`;
    return xml;
  }

  escapeXml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// ============================================================================
// CONFIGURATION OPTIONS
// ============================================================================

class ConversionOptions {
  constructor(options = {}) {
    this.rootLayout = options.rootLayout || 'ConstraintLayout';
    this.defaultOrientation = options.defaultOrientation || 'vertical';
    this.includeIds = options.includeIds !== false;
    this.autoGenerateIds = options.autoGenerateIds !== false;
    this.resourcePrefix = options.resourcePrefix || 'generated';
    this.minifyOutput = options.minifyOutput || false;
    this.convertImages = options.convertImages !== false;
    this.imageDrawablePrefix = options.imageDrawablePrefix || 'img';
    this.extractStyles = options.extractStyles !== false;
    this.stylePrefix = options.stylePrefix || 'Style';
    this.generateMaterialComponents = options.generateMaterialComponents !== false;
    this.flexboxSupport = options.flexboxSupport !== false;
    this.useConstraintLayout = options.useConstraintLayout !== false;
    this.addToolsContext = options.addToolsContext || '.MainActivity';
  }
}

// ============================================================================
// TAG MAPPINGS - ALL HTML5 TAGS
// ============================================================================

const TAG_MAP = {
  // Text content
  'h1': 'TextView', 'h2': 'TextView', 'h3': 'TextView',
  'h4': 'TextView', 'h5': 'TextView', 'h6': 'TextView',
  'p': 'TextView', 'span': 'TextView', 'strong': 'TextView',
  'b': 'TextView', 'em': 'TextView', 'i': 'TextView',
  'u': 'TextView', 'small': 'TextView', 'mark': 'TextView',
  'del': 'TextView', 's': 'TextView', 'ins': 'TextView',
  'sub': 'TextView', 'sup': 'TextView', 'blockquote': 'TextView',
  'q': 'TextView', 'cite': 'TextView', 'code': 'TextView',
  'pre': 'TextView', 'kbd': 'TextView', 'samp': 'TextView',
  'var': 'TextView', 'abbr': 'TextView', 'address': 'TextView',
  'time': 'TextView', 'dfn': 'TextView',
  
  // Containers
  'div': 'LinearLayout', 'section': 'LinearLayout',
  'article': 'LinearLayout', 'aside': 'LinearLayout',
  'nav': 'LinearLayout', 'header': 'LinearLayout',
  'footer': 'LinearLayout', 'main': 'LinearLayout',
  'figure': 'LinearLayout', 'figcaption': 'TextView',
  'details': 'LinearLayout', 'summary': 'TextView',
  
  // Forms
  'form': 'LinearLayout', 'fieldset': 'LinearLayout',
  'label': 'TextView', 'input': 'EditText',
  'textarea': 'EditText', 'button': 'Button',
  'select': 'Spinner', 'option': 'TextView',
  'legend': 'TextView', 'output': 'TextView',
  'progress': 'ProgressBar', 'meter': 'ProgressBar',
  
  // Lists
  'ul': 'LinearLayout', 'ol': 'LinearLayout', 'li': 'TextView',
  'dl': 'LinearLayout', 'dt': 'TextView', 'dd': 'TextView',
  
  // Media
  'img': 'ImageView', 'video': 'VideoView', 'audio': 'VideoView',
  'picture': 'ImageView', 'canvas': 'View',
  
  // Tables
  'table': 'TableLayout', 'tr': 'TableRow', 
  'td': 'TextView', 'th': 'TextView',
  'thead': 'TableRow', 'tbody': 'TableLayout',
  'tfoot': 'TableRow', 'caption': 'TextView',
  
  // Interactive
  'a': 'TextView',
  
  // Other
  'hr': 'View', 'br': 'Space'
};

// ============================================================================
// COLOR PARSER
// ============================================================================

function parseColor(color) {
  if (!color) return '#000000';
  color = color.trim().toLowerCase();
  
  const namedColors = {
    white: '#FFFFFF', black: '#000000', red: '#FF0000',
    green: '#00FF00', blue: '#0000FF', yellow: '#FFFF00',
    gray: '#808080', grey: '#808080', silver: '#C0C0C0',
    maroon: '#800000', olive: '#808000', lime: '#00FF00',
    aqua: '#00FFFF', cyan: '#00FFFF', teal: '#008080',
    navy: '#000080', fuchsia: '#FF00FF', magenta: '#FF00FF',
    purple: '#800080', orange: '#FFA500', pink: '#FFC0CB',
    brown: '#A52A2A', transparent: '#00000000'
  };
  
  if (namedColors[color]) return namedColors[color];
  
  // RGB/RGBA
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    const alpha = a ? Math.round(parseFloat(a) * 255).toString(16).padStart(2, '0') : 'FF';
    const red = parseInt(r).toString(16).padStart(2, '0');
    const green = parseInt(g).toString(16).padStart(2, '0');
    const blue = parseInt(b).toString(16).padStart(2, '0');
    return `#${alpha}${red}${green}${blue}`.toUpperCase();
  }
  
  if (color.startsWith('#')) {
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toUpperCase();
    }
    return color.toUpperCase();
  }
  
  return '#000000';
}

// ============================================================================
// SIZE PARSERS
// ============================================================================

function parseSize(size, unit = 'dp') {
  if (!size) return `0${unit}`;
  const num = parseFloat(size);
  if (isNaN(num)) return `0${unit}`;
  
  if (size.includes('px')) return `${Math.round(num)}${unit}`;
  if (size.includes('em') || size.includes('rem')) return `${Math.round(num * 16)}${unit}`;
  if (size.includes('pt')) return `${Math.round(num * 1.33)}${unit}`;
  
  return `${Math.round(num)}${unit}`;
}

function parseDimension(dim) {
  if (!dim) return 'wrap_content';
  dim = dim.trim().toLowerCase();
  
  if (dim === 'auto' || dim === '100%') return 'match_parent';
  if (dim.includes('%') && parseFloat(dim) > 50) return 'match_parent';
  if (dim === 'fit-content') return 'wrap_content';
  
  const num = parseFloat(dim);
  if (!isNaN(num) && num > 0) {
    if (num > 500) return 'match_parent';
    return `${Math.round(num)}dp`;
  }
  
  return 'wrap_content';
}

function parsePadding(padding) {
  const parts = padding.trim().split(/\s+/).map(p => parseSize(p, 'dp'));
  
  if (parts.length === 1) {
    return { 'android:padding': parts[0] };
  } else if (parts.length === 2) {
    return {
      'android:paddingTop': parts[0],
      'android:paddingBottom': parts[0],
      'android:paddingLeft': parts[1],
      'android:paddingRight': parts[1]
    };
  } else if (parts.length === 4) {
    return {
      'android:paddingTop': parts[0],
      'android:paddingRight': parts[1],
      'android:paddingBottom': parts[2],
      'android:paddingLeft': parts[3]
    };
  }
  
  return {};
}

function parseMargin(margin) {
  const parts = margin.trim().split(/\s+/).map(p => parseSize(p, 'dp'));
  
  if (parts.length === 1) {
    return { 'android:layout_margin': parts[0] };
  } else if (parts.length === 2) {
    return {
      'android:layout_marginTop': parts[0],
      'android:layout_marginBottom': parts[0],
      'android:layout_marginLeft': parts[1],
      'android:layout_marginRight': parts[1]
    };
  } else if (parts.length === 4) {
    return {
      'android:layout_marginTop': parts[0],
      'android:layout_marginRight': parts[1],
      'android:layout_marginBottom': parts[2],
      'android:layout_marginLeft': parts[3]
    };
  }
  
  return {};
}

// ============================================================================
// STYLE MAPPING - CSS TO ANDROID
// ============================================================================

const STYLE_MAP = {
  'background-color': (val) => ({ 'android:background': parseColor(val) }),
  'background': (val) => {
    const colorMatch = val.match(/#[0-9A-Fa-f]{3,8}|rgba?\([^)]+\)|[a-z]+/);
    return colorMatch ? { 'android:background': parseColor(colorMatch[0]) } : {};
  },
  'color': (val) => ({ 'android:textColor': parseColor(val) }),
  'font-size': (val) => ({ 'android:textSize': parseSize(val, 'sp') }),
  'font-weight': (val) => {
    const num = parseInt(val);
    return { 'android:textStyle': (num >= 700 || val === 'bold') ? 'bold' : 'normal' };
  },
  'font-style': (val) => ({ 'android:textStyle': val === 'italic' ? 'italic' : 'normal' }),
  'font-family': (val) => {
    const family = val.toLowerCase();
    if (family.includes('monospace') || family.includes('courier')) return { 'android:fontFamily': 'monospace' };
    if (family.includes('serif') || family.includes('times')) return { 'android:fontFamily': 'serif' };
    return { 'android:fontFamily': 'sans-serif' };
  },
  'text-align': (val) => {
    const map = { left: 'left', center: 'center', right: 'right', justify: 'left' };
    return { 'android:gravity': map[val] || 'left' };
  },
  'padding': (val) => parsePadding(val),
  'padding-top': (val) => ({ 'android:paddingTop': parseSize(val, 'dp') }),
  'padding-bottom': (val) => ({ 'android:paddingBottom': parseSize(val, 'dp') }),
  'padding-left': (val) => ({ 'android:paddingLeft': parseSize(val, 'dp') }),
  'padding-right': (val) => ({ 'android:paddingRight': parseSize(val, 'dp') }),
  'margin': (val) => parseMargin(val),
  'margin-top': (val) => ({ 'android:layout_marginTop': parseSize(val, 'dp') }),
  'margin-bottom': (val) => ({ 'android:layout_marginBottom': parseSize(val, 'dp') }),
  'margin-left': (val) => ({ 'android:layout_marginLeft': parseSize(val, 'dp') }),
  'margin-right': (val) => ({ 'android:layout_marginRight': parseSize(val, 'dp') }),
  'width': (val) => ({ 'android:layout_width': parseDimension(val) }),
  'height': (val) => ({ 'android:layout_height': parseDimension(val) }),
  'max-width': (val) => ({ 'android:maxWidth': parseSize(val, 'dp') }),
  'max-height': (val) => ({ 'android:maxHeight': parseSize(val, 'dp') }),
  'min-width': (val) => ({ 'android:minWidth': parseSize(val, 'dp') }),
  'min-height': (val) => ({ 'android:minHeight': parseSize(val, 'dp') }),
  'border-radius': (val) => ({ '_border_radius': parseSize(val, 'dp') }),
  'border': (val) => {
    const parts = val.split(/\s+/);
    const attrs = {};
    parts.forEach(part => {
      if (part.match(/^\d+/)) attrs['_border_width'] = parseSize(part, 'dp');
      else if (part.startsWith('#') || part.match(/^rgb/)) attrs['_border_color'] = parseColor(part);
    });
    return attrs;
  },
  'border-width': (val) => ({ '_border_width': parseSize(val, 'dp') }),
  'border-color': (val) => ({ '_border_color': parseColor(val) }),
  'opacity': (val) => ({ 'android:alpha': val }),
  'display': (val) => val === 'none' ? { 'android:visibility': 'gone' } : {},
  'visibility': (val) => ({ 'android:visibility': val === 'hidden' ? 'invisible' : 'visible' }),
  'flex': (val) => ({ 'android:layout_weight': val.split(/\s+/)[0] || '1' }),
  'flex-direction': (val) => ({ 'android:orientation': val.includes('row') ? 'horizontal' : 'vertical' }),
  'justify-content': (val) => {
    const map = { center: 'center', 'flex-start': 'start', 'flex-end': 'end' };
    return { 'android:gravity': map[val] || 'start' };
  },
  'align-items': (val) => {
    const map = { center: 'center', 'flex-start': 'start', 'flex-end': 'end', stretch: 'fill' };
    return { 'android:gravity': map[val] || 'start' };
  }
};

function parseInputType(type) {
  const map = {
    text: 'text', password: 'textPassword', email: 'textEmailAddress',
    number: 'number', tel: 'phone', url: 'textUri', date: 'date', time: 'time'
  };
  return map[type] || 'text';
}

// ============================================================================
// MAIN CONVERTER CLASS
// ============================================================================

class HTMLToAndroidXMLConverter {
  constructor(options = {}) {
    this.options = new ConversionOptions(options);
    this.xmlBuilder = new XMLBuilder();
    this.tagMap = TAG_MAP;
    this.styleMap = STYLE_MAP;
    this.idCounter = 0;
    this.styleCounter = 0;
    this.styles = {};
    this.drawableShapes = {};
    this.resources = { drawables: [], styles: {} };
    this.isRootConstraintLayout = this.options.useConstraintLayout;
    this.previousElementId = null;
  }

  convert(html) {
    const $ = cheerio.load(html, { xmlMode: false });
    
    if (this.options.extractStyles) {
      this.extractStyleBlocks($);
    }
    
    const body = $('body').length ? $('body') : $.root();
    const elements = [];
    
    body.children().each((i, child) => {
      const element = this.convertNode($(child), $, i);
      if (element) elements.push(element);
    });
    
    if (elements.length === 0) {
      return this.createEmptyLayoutXML();
    }
    
    // If there's only one root element that's already a layout, use it as root
    if (elements.length === 1 && this.isLayoutElement(elements[0].name)) {
      const rootElement = elements[0];
      
      // Add root attributes if not present
      if (!rootElement.attributes['xmlns:android']) {
        rootElement.attributes['xmlns:android'] = 'http://schemas.android.com/apk/res/android';
      }
      if (!rootElement.attributes['xmlns:app']) {
        rootElement.attributes['xmlns:app'] = 'http://schemas.android.com/apk/res-auto';
      }
      if (!rootElement.attributes['xmlns:tools']) {
        rootElement.attributes['xmlns:tools'] = 'http://schemas.android.com/tools';
      }
      if (!rootElement.attributes['android:id']) {
        rootElement.attributes['android:id'] = '@+id/main';
      }
      if (this.options.addToolsContext && !rootElement.attributes['tools:context']) {
        rootElement.attributes['tools:context'] = this.options.addToolsContext;
      }
      
      // Ensure proper dimensions
      rootElement.attributes['android:layout_width'] = 'match_parent';
      rootElement.attributes['android:layout_height'] = 'match_parent';
      
      let xml = '<?xml version="1.0" encoding="utf-8"?>\n' + this.xmlBuilder.toXML(rootElement, 0);
      
      if (!this.options.minifyOutput) {
        try {
          xml = xmlFormatter(xml, {
            indentation: '    ',
            collapseContent: true,
            lineSeparator: '\n'
          });
        } catch (e) {
          console.warn('XML formatting failed');
        }
      }
      
      return xml;
    }
    
    // Multiple elements or non-layout elements - wrap in root layout
    const rootElement = this.createRootLayout(elements);
    let xml = '<?xml version="1.0" encoding="utf-8"?>\n' + this.xmlBuilder.toXML(rootElement, 0);
    
    if (!this.options.minifyOutput) {
      try {
        xml = xmlFormatter(xml, {
          indentation: '    ',
          collapseContent: true,
          lineSeparator: '\n'
        });
      } catch (e) {
        console.warn('XML formatting failed');
      }
    }
    
    return xml;
  }

  /**
   * Check if element is a layout (ViewGroup)
   */
  isLayoutElement(tagName) {
    const layouts = [
      'LinearLayout',
      'RelativeLayout',
      'FrameLayout',
      'ConstraintLayout',
      'androidx.constraintlayout.widget.ConstraintLayout',
      'ScrollView',
      'HorizontalScrollView',
      'TableLayout',
      'GridLayout',
      'androidx.gridlayout.widget.GridLayout',
      'CoordinatorLayout',
      'androidx.coordinatorlayout.widget.CoordinatorLayout',
      'DrawerLayout',
      'androidx.drawerlayout.widget.DrawerLayout'
    ];
    
    return layouts.includes(tagName);
  }

  createRootLayout(children) {
    const rootTag = this.isRootConstraintLayout 
      ? 'androidx.constraintlayout.widget.ConstraintLayout'
      : this.options.rootLayout;

    const attrs = {
      'xmlns:android': 'http://schemas.android.com/apk/res/android',
      'xmlns:app': 'http://schemas.android.com/apk/res-auto',
      'xmlns:tools': 'http://schemas.android.com/tools',
      'android:id': '@+id/main',
      'android:layout_width': 'match_parent',
      'android:layout_height': 'match_parent'
    };

    if (this.options.addToolsContext) {
      attrs['tools:context'] = this.options.addToolsContext;
    }

    if (!this.isRootConstraintLayout && rootTag === 'LinearLayout') {
      attrs['android:orientation'] = this.options.defaultOrientation;
    }

    return this.xmlBuilder.createElement(rootTag, attrs, children);
  }

  extractStyleBlocks($) {
    $('style').each((i, styleTag) => {
      const css = $(styleTag).html();
      const ruleRegex = /([^{]+)\{([^}]+)\}/g;
      let match;
      
      while ((match = ruleRegex.exec(css)) !== null) {
        const selector = match[1].trim();
        const properties = match[2].trim();
        if (!selector.includes('@')) {
          this.styles[selector] = properties;
        }
      }
    });
  }

  applyClassStyles(element) {
    const classes = element.attr('class');
    if (!classes) return {};
    
    const attrs = {};
    classes.split(/\s+/).forEach(className => {
      const selector = `.${className}`;
      if (this.styles[selector]) {
        Object.assign(attrs, this.parseStyles(this.styles[selector]));
      }
    });
    
    return attrs;
  }

  convertNode(element, $, index = 0) {
    if (!element || !element.length) return null;

    if (element[0].type === 'text') {
      const text = element.text().trim();
      if (!text) return null;
      
      const attrs = {
        'android:layout_width': 'wrap_content',
        'android:layout_height': 'wrap_content',
        'android:text': text
      };

      // Add ConstraintLayout constraints for direct children
      if (this.isRootConstraintLayout) {
        this.addConstraintAttributes(attrs, index);
      }

      return this.xmlBuilder.createElement('TextView', attrs);
    }

    const tagName = element.prop('tagName')?.toLowerCase();
    if (!tagName || ['script', 'style', 'meta', 'link', 'title', 'head'].includes(tagName)) {
      return null;
    }

    const androidTag = this.getAndroidTag(tagName, element);
    const attributes = this.extractAttributes(element, $, androidTag, tagName, index);
    
    // Check if this tag can have children
    const canHaveChildren = this.canHaveChildren(androidTag);
    
    const children = [];
    
    // Only process children if the tag can have them
    if (canHaveChildren) {
      element.contents().each((i, child) => {
        const childElement = this.convertNode($(child), $, i);
        if (childElement) children.push(childElement);
      });
    }

    if (this.hasComplexBackground(attributes)) {
      this.generateDrawableForElement(attributes);
    }

    return this.xmlBuilder.createElement(androidTag, attributes, children);
  }

  /**
   * Check if Android view can have children
   */
  canHaveChildren(androidTag) {
    // ViewGroups that CAN have children
    const viewGroups = [
      'LinearLayout',
      'RelativeLayout',
      'FrameLayout',
      'ConstraintLayout',
      'androidx.constraintlayout.widget.ConstraintLayout',
      'ScrollView',
      'HorizontalScrollView',
      'TableLayout',
      'TableRow',
      'GridLayout',
      'androidx.gridlayout.widget.GridLayout',
      'CoordinatorLayout',
      'androidx.coordinatorlayout.widget.CoordinatorLayout',
      'DrawerLayout',
      'androidx.drawerlayout.widget.DrawerLayout'
    ];

    // Check if it's a ViewGroup
    if (viewGroups.includes(androidTag)) return true;

    // Views that CANNOT have children
    const leafViews = [
      'TextView',
      'Button',
      'ImageView',
      'EditText',
      'CheckBox',
      'RadioButton',
      'Switch',
      'ProgressBar',
      'SeekBar',
      'RatingBar',
      'VideoView',
      'ImageButton',
      'ToggleButton',
      'Spinner',
      'View',
      'Space',
      'com.google.android.material.button.MaterialButton',
      'com.google.android.material.textfield.TextInputEditText',
      'com.google.android.material.textview.MaterialTextView'
    ];

    if (leafViews.includes(androidTag)) return false;

    // Default: assume it's a ViewGroup if not in the leaf views list
    return true;
  }

  addConstraintAttributes(attrs, index) {
    // Center in parent by default
    attrs['app:layout_constraintStart_toStartOf'] = 'parent';
    attrs['app:layout_constraintEnd_toEndOf'] = 'parent';
    
    if (index === 0) {
      // First element - constrain to top
      attrs['app:layout_constraintTop_toTopOf'] = 'parent';
      attrs['app:layout_constraintBottom_toBottomOf'] = 'parent';
    } else if (this.previousElementId) {
      // Chain to previous element
      attrs['app:layout_constraintTop_toBottomOf'] = this.previousElementId;
    }
  }

  getAndroidTag(htmlTag, element) {
    const style = element.attr('style') || '';
    
    if (style.includes('display') && style.includes('flex') && this.options.flexboxSupport) {
      return 'LinearLayout';
    }

    if (this.options.generateMaterialComponents) {
      if (htmlTag === 'button') return 'com.google.android.material.button.MaterialButton';
      if (htmlTag === 'input') return 'com.google.android.material.textfield.TextInputEditText';
    }

    return this.tagMap[htmlTag] || 'LinearLayout';
  }

  extractAttributes(element, $, androidTag, htmlTag, index = 0) {
    const attrs = {
      'android:layout_width': 'wrap_content',
      'android:layout_height': 'wrap_content'
    };

    // Handle ID
    if (this.options.includeIds) {
      const htmlId = element.attr('id');
      if (htmlId) {
        attrs['android:id'] = `@+id/${this.sanitizeId(htmlId)}`;
        this.previousElementId = attrs['android:id'];
      } else if (this.options.autoGenerateIds) {
        attrs['android:id'] = `@+id/${this.options.resourcePrefix}_${this.idCounter++}`;
        this.previousElementId = attrs['android:id'];
      }
    }

    // Add ConstraintLayout constraints for direct children
    if (this.isRootConstraintLayout) {
      this.addConstraintAttributes(attrs, index);
    }

    if (androidTag === 'LinearLayout' && !this.isRootConstraintLayout) {
      attrs['android:orientation'] = this.options.defaultOrientation;
    }

    if (this.options.extractStyles) {
      Object.assign(attrs, this.applyClassStyles(element));
    }
    
    const style = element.attr('style');
    if (style) {
      Object.assign(attrs, this.parseStyles(style));
    }

    this.handleSpecificTags(element, $, androidTag, attrs, htmlTag);

    Object.keys(attrs).forEach(key => {
      if (key.startsWith('_')) delete attrs[key];
    });

    return attrs;
  }

  parseStyles(styleString) {
    const attrs = {};
    styleString.split(';').filter(s => s.trim()).forEach(decl => {
      const colonIndex = decl.indexOf(':');
      if (colonIndex === -1) return;
      
      const prop = decl.substring(0, colonIndex).trim();
      const val = decl.substring(colonIndex + 1).trim();
      
      if (!prop || !val) return;

      const mapper = this.styleMap[prop];
      if (mapper) Object.assign(attrs, mapper(val));
    });

    return attrs;
  }

  handleSpecificTags(element, $, androidTag, attrs, htmlTag) {
    // For views that display text (but can't have children)
    if (['TextView', 'Button', 'com.google.android.material.button.MaterialButton'].includes(androidTag)) {
      // Extract all text content recursively
      const text = element.text().trim();
      if (text) attrs['android:text'] = text;

      // Heading styles
      if (htmlTag?.match(/^h[1-6]$/)) {
        const level = parseInt(htmlTag[1]);
        const sizes = { 1: 32, 2: 28, 3: 24, 4: 20, 5: 18, 6: 16 };
        attrs['android:textSize'] = `${sizes[level]}sp`;
        attrs['android:textStyle'] = 'bold';
      }

      // Bold/Italic
      if (['strong', 'b'].includes(htmlTag)) {
        attrs['android:textStyle'] = attrs['android:textStyle'] === 'italic' ? 'bold|italic' : 'bold';
      }
      if (['em', 'i'].includes(htmlTag)) {
        attrs['android:textStyle'] = attrs['android:textStyle'] === 'bold' ? 'bold|italic' : 'italic';
      }

      // Links
      if (htmlTag === 'a') {
        attrs['android:textColor'] = attrs['android:textColor'] || '#2196F3';
        attrs['android:clickable'] = 'true';
        const href = element.attr('href');
        if (href) attrs['android:tag'] = href;
      }

      // Code/Pre
      if (['code', 'pre', 'kbd', 'samp'].includes(htmlTag)) {
        attrs['android:fontFamily'] = 'monospace';
        attrs['android:textSize'] = attrs['android:textSize'] || '14sp';
      }
    }

    // EditText - input type
    if (androidTag === 'EditText' || androidTag.includes('TextInputEditText')) {
      const type = element.attr('type') || 'text';
      attrs['android:inputType'] = parseInputType(type);
      
      const placeholder = element.attr('placeholder');
      if (placeholder) attrs['android:hint'] = placeholder;
      
      const value = element.attr('value');
      if (value) attrs['android:text'] = value;
      
      // Set default width for inputs
      if (!attrs['android:layout_width'] || attrs['android:layout_width'] === 'wrap_content') {
        attrs['android:layout_width'] = 'match_parent';
      }
    }

    // ImageView - handle src
    if (androidTag === 'ImageView' && this.options.convertImages) {
      const src = element.attr('src') || element.attr('data-src');
      if (src) {
        const drawableName = this.convertImageSrc(src);
        attrs['android:src'] = `@drawable/${drawableName}`;
      }
      attrs['android:scaleType'] = attrs['android:scaleType'] || 'centerCrop';
      
      const alt = element.attr('alt');
      if (alt) attrs['android:contentDescription'] = alt;
    }

    // ProgressBar
    if (androidTag === 'ProgressBar') {
      const value = element.attr('value');
      const max = element.attr('max');
      if (max) attrs['android:max'] = max;
      if (value) attrs['android:progress'] = value;
      attrs['style'] = '?android:attr/progressBarStyleHorizontal';
    }

    // HR (horizontal rule)
    if (htmlTag === 'hr') {
      attrs['android:layout_width'] = 'match_parent';
      attrs['android:layout_height'] = '1dp';
      attrs['android:background'] = attrs['android:background'] || '#CCCCCC';
    }

    // Space
    if (androidTag === 'Space') {
      attrs['android:layout_width'] = '0dp';
      attrs['android:layout_height'] = '8dp';
    }

    // List items (li should be TextView, but extract text from children)
    if (htmlTag === 'li') {
      const text = element.text().trim();
      if (text) attrs['android:text'] = '• ' + text;
    }
  }

  convertImageSrc(src) {
    const filename = src.split('/').pop().split('?')[0].split('.')[0];
    const drawableName = `${this.options.imageDrawablePrefix}_${this.sanitizeId(filename)}`;
    
    this.resources.drawables.push({ original: src, name: drawableName });
    return drawableName;
  }

  hasComplexBackground(attrs) {
    return attrs['_border_radius'] || attrs['_border_width'] || attrs['_border_color'];
  }

  generateDrawableForElement(attrs) {
    const drawableName = `bg_${this.options.resourcePrefix}_${this.styleCounter++}`;
    const bg = attrs['android:background'] || '#FFFFFF';
    const radius = attrs['_border_radius'] || '0dp';
    const borderWidth = attrs['_border_width'] || '0dp';
    const borderColor = attrs['_border_color'] || '#000000';
    
    const drawable = this.createShapeDrawable(bg, radius, borderWidth, borderColor);
    this.drawableShapes[drawableName] = drawable;
    
    attrs['android:background'] = `@drawable/${drawableName}`;
    
    delete attrs['_border_radius'];
    delete attrs['_border_width'];
    delete attrs['_border_color'];
  }

  createShapeDrawable(solidColor, cornerRadius, strokeWidth, strokeColor) {
    const radiusVal = parseInt(cornerRadius) || 0;
    const strokeVal = parseInt(strokeWidth) || 0;
    
    const attrs = { 'xmlns:android': 'http://schemas.android.com/apk/res/android' };
    const children = [
      this.xmlBuilder.createElement('solid', { 'android:color': solidColor })
    ];
    
    if (radiusVal > 0) {
      children.push(this.xmlBuilder.createElement('corners', { 'android:radius': cornerRadius }));
    }
    
    if (strokeVal > 0) {
      children.push(this.xmlBuilder.createElement('stroke', {
        'android:width': strokeWidth,
        'android:color': strokeColor
      }));
    }
    
    const shapeElement = this.xmlBuilder.createElement('shape', attrs, children);
    return '<?xml version="1.0" encoding="utf-8"?>\n' + this.xmlBuilder.toXML(shapeElement, 0);
  }

  createEmptyLayoutXML() {
    const rootTag = this.isRootConstraintLayout 
      ? 'androidx.constraintlayout.widget.ConstraintLayout'
      : 'LinearLayout';

    const attrs = {
      'xmlns:android': 'http://schemas.android.com/apk/res/android',
      'xmlns:app': 'http://schemas.android.com/apk/res-auto',
      'xmlns:tools': 'http://schemas.android.com/tools',
      'android:id': '@+id/main',
      'android:layout_width': 'match_parent',
      'android:layout_height': 'match_parent'
    };

    if (this.options.addToolsContext) {
      attrs['tools:context'] = this.options.addToolsContext;
    }

    if (!this.isRootConstraintLayout) {
      attrs['android:orientation'] = 'vertical';
    }
    
    const element = this.xmlBuilder.createElement(rootTag, attrs);
    return '<?xml version="1.0" encoding="utf-8"?>\n' + this.xmlBuilder.toXML(element, 0);
  }

  sanitizeId(id) {
    return id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  generateResourceFiles() {
    const drawableShapes = Object.entries(this.drawableShapes).map(([name, xml]) => ({
      name,
      xml
    }));

    return {
      drawableShapes,
      drawables: this.resources.drawables,
      styles: '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <!-- Add your styles here -->\n</resources>'
    };
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Convert HTML to Android XML
 * 
 * @param {string} html - HTML string to convert
 * @param {object} options - Configuration options
 * @returns {string} Android XML layout
 * 
 * @example
 * const xml = htmlToAndroidXML('<div><h1>Hello World!</h1></div>');
 * 
 * @example with options
 * const xml = htmlToAndroidXML('<button>Click Me</button>', {
 *   useConstraintLayout: true,
 *   generateMaterialComponents: true,
 *   addToolsContext: '.MainActivity'
 * });
 */
function htmlToAndroidXML(html, options = {}) {
  const converter = new HTMLToAndroidXMLConverter(options);
  return converter.convert(html);
}

/**
 * Convert HTML to Android XML with resources
 * 
 * @param {string} html - HTML string to convert
 * @param {object} options - Configuration options
 * @returns {object} Object containing xml, resources, drawableShapes, and drawables
 * 
 * @example
 * const result = convertWithResources('<div style="border-radius: 12px;">Content</div>');
 * console.log(result.xml); // Android XML
 * result.resources.drawableShapes.forEach(shape => {
 *   console.log(shape.name, shape.xml); // Drawable files
 * });
 */
function convertWithResources(html, options = {}) {
  const converter = new HTMLToAndroidXMLConverter(options);
  const xml = converter.convert(html);
  const resources = converter.generateResourceFiles();
  
  return {
    xml,
    resources,
    drawableShapes: resources.drawableShapes,
    drawables: resources.drawables
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  htmlToAndroidXML,
  convertWithResources,
  HTMLToAndroidXMLConverter,
  ConversionOptions,
  XMLBuilder
};

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*

// EXAMPLE 1: Basic Usage with ConstraintLayout (Default)
const { htmlToAndroidXML } = require('./html-to-android-xml');

const xml = htmlToAndroidXML('<h1>Hello World!</h1>');
console.log(xml);

Output:
<?xml version="1.0" encoding="utf-8"?>
<androidx.constraintlayout.widget.ConstraintLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    xmlns:tools="http://schemas.android.com/tools"
    android:id="@+id/main"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    tools:context=".MainActivity">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Hello World!"
        android:textSize="32sp"
        android:textStyle="bold"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintBottom_toBottomOf="parent" />

</androidx.constraintlayout.widget.ConstraintLayout>


// EXAMPLE 2: Custom Context
const xml = htmlToAndroidXML('<button>Click Me</button>', {
  addToolsContext: '.LoginActivity'
});


// EXAMPLE 3: With Styling
const html = `
  <div style="padding: 24px; background-color: #2196F3;">
    <h1 style="color: white; text-align: center;">Welcome</h1>
    <p style="color: white; text-align: center;">Get started now</p>
  </div>
`;

const xml = htmlToAndroidXML(html, {
  includeIds: true,
  resourcePrefix: 'welcome'
});


// EXAMPLE 4: With Resources (Drawables)
const { convertWithResources } = require('./html-to-android-xml');

const html = `
  <button style="background-color: #4CAF50; color: white; 
                 padding: 16px; border-radius: 8px;">
    Sign In
  </button>
`;

const result = convertWithResources(html);

// Save layout
fs.writeFileSync('activity_login.xml', result.xml);

// Save drawable shapes
result.resources.drawableShapes.forEach(shape => {
  fs.writeFileSync(`${shape.name}.xml`, shape.xml);
});


// EXAMPLE 5: Material Components
const xml = htmlToAndroidXML('<button>Material Button</button>', {
  generateMaterialComponents: true
});

// Generates com.google.android.material.button.MaterialButton


// EXAMPLE 6: Use LinearLayout Instead
const xml = htmlToAndroidXML('<div><p>Text</p></div>', {
  useConstraintLayout: false,
  rootLayout: 'LinearLayout'
});


// EXAMPLE 7: Complete Form
const formHtml = `
  <div style="padding: 24px;">
    <h1>Login</h1>
    <input type="email" placeholder="Email" />
    <input type="password" placeholder="Password" />
    <button style="background-color: #2196F3; color: white; padding: 16px;">
      Sign In
    </button>
  </div>
`;

const xml = htmlToAndroidXML(formHtml, {
  includeIds: true,
  autoGenerateIds: true,
  resourcePrefix: 'login',
  addToolsContext: '.LoginActivity'
});

*/