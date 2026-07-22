const cheerio = require('cheerio');
const { TAG_MAP, INPUT_TYPE_MAP, FONT_FAMILY_MAP } = require('./constants');
const {
    parseStyleDeclarations, parseCssStylesheet, parseFontFaces, normalizeMediaProfile, matchesMediaQuery,
    selectorSpecificity, resolveCssVariables,
    normalizeStyleValue, escapeXmlAttribute, sanitizeColor, sanitizeResourceName, makeUniqueResourceName,
    resourceNameFromPath, pxToDp, pxToSp, cssSizeToAndroid,
    expandBoxValues, splitCssTokens, parseBorder, extractBackgroundColor, parseBorderRadius, radiusToKey, uniformRadiusValue,
    parseBoxShadow, parseLinearGradient, parseTransform,
    generateShapeDrawable, generateGradientDrawable,
    buildXmlString,
} = require('./utils');

function getAndroidTag(tag, node, customElements) {
    if (customElements.has(tag)) return customElements.get(tag);
    if (tag === 'input') {
        const type = (node.attr('type') || 'text').toLowerCase();
        if (type === 'checkbox') return 'CheckBox';
        if (type === 'radio') return 'RadioButton';
        if (type === 'range') return 'SeekBar';
        if (['submit', 'button', 'reset', 'file'].includes(type)) return 'com.google.android.material.button.MaterialButton';
    }
    return TAG_MAP[tag] || 'View';
}

const SCROLL_OUTER_KEYS = new Set([
    'android:layout_width', 'android:layout_height', 'android:id',
    'app:layout_constraintStart_toStartOf', 'app:layout_constraintEnd_toEndOf',
    'app:layout_constraintTop_toTopOf', 'app:layout_constraintBottom_toBottomOf',
    'app:layout_constraintTop_toBottomOf',
    'android:layout_margin', 'android:layout_marginTop', 'android:layout_marginBottom',
    'android:layout_marginLeft', 'android:layout_marginRight',
]);

const TEXT_TAGS = new Set([
    'h1','h2','h3','h4','p','span','label','a','li','button','input','legend','th','td','caption',
    'strong','b','em','i','code','pre','kbd','cite','mark',
    'small','u','s','del','ins','time','abbr','dfn','samp','var',
    'blockquote','q','address','sup','sub',
]);
const TABLE_SECTION_TAGS = new Set(['thead', 'tbody', 'tfoot']);
const UNWRAP_TAGS = new Set(['picture']);
const EMBEDDED_MEDIA_TAGS = new Set(['video', 'audio', 'iframe', 'canvas', 'embed', 'object']);
const FLEXBOX_LAYOUT_TAG = 'com.google.android.flexbox.FlexboxLayout';
const GRID_LAYOUT_TAG = 'GridLayout';
const PSEUDO_CONTAINER_ANDROID_TAGS = new Set([
    'LinearLayout', 'FrameLayout', GRID_LAYOUT_TAG, 'TableLayout', 'TableRow',
    FLEXBOX_LAYOUT_TAG,
]);
const INHERITED_CSS_PROPERTIES = new Set([
    'color', 'font-family', 'font-size', 'font-style', 'font-weight', 'letter-spacing',
    'line-height', 'text-align', 'text-indent', 'text-transform', 'visibility',
    'white-space', 'word-break', 'overflow-wrap',
]);
const SUPPORTED_CSS_PROPERTIES = new Set([
    'align-content', 'align-items', 'align-self', 'background', 'background-color',
    'background-image', 'background-position', 'background-size', 'border',
    'border-bottom', 'border-color', 'border-left', 'border-radius', 'border-right',
    'border-top', 'border-width', 'bottom', 'box-shadow', 'color', 'column-gap',
    'content', 'cursor', 'display', 'flex', 'flex-basis', 'flex-direction', 'flex-grow',
    'flex-shrink', 'flex-wrap', 'font-family', 'font-size', 'font-style',
    'font-weight', 'gap', 'grid-area', 'grid-auto-flow', 'grid-column',
    'grid-column-end', 'grid-column-start', 'grid-row', 'grid-row-end',
    'grid-row-start', 'grid-template-columns', 'grid-template-rows', 'height',
    'inset', 'justify-content', 'justify-items', 'justify-self', 'left',
    'letter-spacing', 'line-clamp', 'line-height', 'margin', 'margin-bottom',
    'margin-left', 'margin-right', 'margin-top', 'max-height', 'max-width',
    'min-height', 'min-width', 'object-fit', 'opacity', 'order', 'outline',
    'overflow', 'overflow-wrap', 'overflow-y', 'padding', 'padding-bottom',
    'padding-left', 'padding-right', 'padding-top', 'place-items', 'place-self',
    'position', 'right', 'row-gap', 'text-align', 'text-decoration',
    'text-decoration-line', 'text-indent', 'text-overflow', 'text-transform',
    'top', 'transform', 'vertical-align', 'visibility', '-webkit-line-clamp',
    'white-space', 'width', 'word-break', 'z-index',
]);
const COMPUTED_LENGTH_PROPERTIES = new Set([
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'top', 'right', 'bottom', 'left', 'font-size', 'text-indent', 'gap',
    'row-gap', 'column-gap', 'border-width', 'border-radius', 'inset',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
]);

function compareSpecificity(left, right) {
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const difference = (left[i] || 0) - (right[i] || 0);
        if (difference) return difference;
    }
    return 0;
}

function shouldReplaceDeclaration(current, candidate) {
    if (!current) return true;
    if (current.important !== candidate.important) return candidate.important;

    const specificity = compareSpecificity(candidate.specificity, current.specificity);
    if (specificity) return specificity > 0;
    if (candidate.order !== current.order) return candidate.order > current.order;
    return candidate.declarationOrder >= current.declarationOrder;
}

function normalizeStylesheetSources(stylesheets) {
    if (stylesheets === undefined || stylesheets === null) return new Map();
    if (!(stylesheets instanceof Map) && (typeof stylesheets !== 'object' || Array.isArray(stylesheets))) {
        throw new TypeError('stylesheets must be an object or Map keyed by linked href.');
    }

    const entries = stylesheets instanceof Map
        ? [...stylesheets.entries()]
        : Object.entries(stylesheets);
    const sources = new Map();

    for (const [href, css] of entries) {
        if (typeof css !== 'string') {
            throw new TypeError(`Stylesheet "${href}" must be provided as a CSS string.`);
        }
        sources.set(String(href), css);
    }

    return sources;
}

function isFlexContainer(styles) {
    const display = normalizeStyleValue(styles['display'] || '');
    return ['flex', 'inline-flex'].includes(display) || Boolean(styles['flex-direction'] || styles['flex-wrap']);
}

function flexDirection(styles) {
    const explicit = normalizeStyleValue(styles['flex-direction'] || '');
    if (explicit) return explicit;
    return ['flex', 'inline-flex'].includes(normalizeStyleValue(styles['display'] || '')) ? 'row' : 'column';
}

function flexItemValues(styles) {
    const shorthand = normalizeStyleValue(styles['flex'] || '');
    let parsed = {};

    if (shorthand === 'none') parsed = { grow: '0', shrink: '0', basis: 'auto' };
    else if (shorthand === 'auto') parsed = { grow: '1', shrink: '1', basis: 'auto' };
    else if (shorthand === 'initial') parsed = { grow: '0', shrink: '1', basis: 'auto' };
    else if (shorthand) {
        const tokens = shorthand.split(/\s+/);
        if (/^\d*\.?\d+$/.test(tokens[0] || '')) parsed.grow = tokens.shift();
        if (/^\d*\.?\d+$/.test(tokens[0] || '')) parsed.shrink = tokens.shift();
        if (tokens.length) parsed.basis = tokens.join(' ');
        if (parsed.shrink === undefined && parsed.grow !== undefined) parsed.shrink = '1';
        if (parsed.basis === undefined && parsed.grow !== undefined) parsed.basis = '0%';
    }

    return {
        grow: styles['flex-grow'] ?? parsed.grow,
        shrink: styles['flex-shrink'] ?? parsed.shrink,
        basis: styles['flex-basis'] ?? parsed.basis,
    };
}

function flexEnum(value) {
    return normalizeStyleValue(value || '').replace(/-/g, '_');
}

function isGridContainer(styles) {
    return ['grid', 'inline-grid'].includes(normalizeStyleValue(styles['display'] || ''));
}

function gridTrackCount(value) {
    const normalized = normalizeStyleValue(value || '');
    if (!normalized || ['none', 'subgrid'].includes(normalized)) return null;

    let count = 0;
    for (const token of splitCssTokens(normalized)) {
        if (/^\[.*\]$/.test(token)) continue;
        const repeat = /^repeat\(\s*(\d+)\s*,\s*([\s\S]+)\)$/.exec(token);
        if (repeat) {
            const repeatedCount = gridTrackCount(repeat[2]);
            if (!repeatedCount) return null;
            count += parseInt(repeat[1], 10) * repeatedCount;
        } else {
            count++;
        }
    }
    return count || null;
}

function parseGridAxis(styles, axis) {
    let start = styles[`grid-${axis}-start`];
    let end = styles[`grid-${axis}-end`];
    const shorthand = styles[`grid-${axis}`];
    if (shorthand) {
        const parts = String(shorthand).split('/').map(part => part.trim());
        start = start ?? parts[0];
        end = end ?? parts[1];
    }

    const startLine = /^\d+$/.test(normalizeStyleValue(start || '')) ? parseInt(start, 10) : null;
    const endLine = /^\d+$/.test(normalizeStyleValue(end || '')) ? parseInt(end, 10) : null;
    const startSpan = /^span\s+(\d+)$/i.exec(String(start || '').trim());
    const endSpan = /^span\s+(\d+)$/i.exec(String(end || '').trim());
    const result = {};

    if (startLine && startLine > 0) result.start = startLine - 1;
    if (endSpan) result.span = parseInt(endSpan[1], 10);
    else if (startSpan) result.span = parseInt(startSpan[1], 10);
    else if (startLine && endLine && endLine > startLine) result.span = endLine - startLine;
    return result;
}

function halfCssLength(value) {
    const match = /^(-?\d*\.?\d+)\s*(px|dp|sp|rem|em)?$/i.exec(String(value || '').trim());
    if (match) return pxToDp(`${parseFloat(match[1]) / 2}${match[2] || ''}`);
    return pxToDp(`calc((${value}) / 2)`);
}

function gridAlignment(value, axis) {
    const normalized = normalizeStyleValue(value || '').replace(/^safe\s+|^unsafe\s+/, '');
    if (axis === 'horizontal') {
        return { start: 'start', end: 'end', center: 'center_horizontal', stretch: 'fill_horizontal' }[normalized] || null;
    }
    return { start: 'top', end: 'bottom', center: 'center_vertical', stretch: 'fill_vertical', baseline: 'baseline' }[normalized] || null;
}

function applyBoxSpacing(attrs, styles, cssProperty, androidBase) {
    const shorthand = styles[cssProperty];
    if (shorthand) {
        const values = expandBoxValues(shorthand);
        const usableValues = values && Object.values(values).filter(value => normalizeStyleValue(value) !== 'auto');
        if (usableValues?.length === 4 && new Set(usableValues).size === 1) {
            attrs[androidBase] = values.top;
        } else if (values) {
            if (normalizeStyleValue(values.top) !== 'auto') attrs[`${androidBase}Top`] = values.top;
            if (normalizeStyleValue(values.right) !== 'auto') attrs[`${androidBase}Right`] = values.right;
            if (normalizeStyleValue(values.bottom) !== 'auto') attrs[`${androidBase}Bottom`] = values.bottom;
            if (normalizeStyleValue(values.left) !== 'auto') attrs[`${androidBase}Left`] = values.left;
        }
    }

    const sides = [
        ['top', 'Top'],
        ['right', 'Right'],
        ['bottom', 'Bottom'],
        ['left', 'Left'],
    ];
    for (const [cssSide, androidSide] of sides) {
        const value = styles[`${cssProperty}-${cssSide}`];
        if (value && normalizeStyleValue(value) !== 'auto') attrs[`${androidBase}${androidSide}`] = pxToDp(value);
    }
}

function isZeroCssLength(value) {
    const normalized = normalizeStyleValue(value || '');
    return normalized === '0' || normalized === '0px' || normalized === '0dp' || normalized === '0rem' || normalized === '0em';
}

function isOutOfFlowPosition(position) {
    return ['absolute', 'fixed'].includes(normalizeStyleValue(position || ''));
}

function androidOffset(value) {
    const normalized = normalizeStyleValue(value || '');
    if (/^(calc|min|max|clamp)\(/.test(normalized)) return pxToDp(normalized);
    if (!/^-?\d*\.?\d+(?:px|dp|rem|em)?$/.test(normalized)) return null;
    return pxToDp(normalized);
}

function negateAndroidOffset(value) {
    const converted = androidOffset(value);
    if (!converted) return null;
    const match = /^(-?\d*\.?\d+)(.*)$/.exec(converted);
    return match ? `${-parseFloat(match[1])}${match[2]}` : null;
}

function marginAutoState(styles) {
    const expanded = expandBoxValues(styles['margin'] || '') || {};
    return {
        top: normalizeStyleValue(styles['margin-top'] ?? expanded.top ?? '') === 'auto',
        right: normalizeStyleValue(styles['margin-right'] ?? expanded.right ?? '') === 'auto',
        bottom: normalizeStyleValue(styles['margin-bottom'] ?? expanded.bottom ?? '') === 'auto',
        left: normalizeStyleValue(styles['margin-left'] ?? expanded.left ?? '') === 'auto',
    };
}

function applyAccessibilityAttrs(attrs, node) {
    const role = normalizeStyleValue(node.attr('role') || '');
    const dir = normalizeStyleValue(node.attr('dir') || '');

    if (node.attr('hidden') !== undefined) {
        attrs['android:visibility'] = 'gone';
    }

    if (normalizeStyleValue(node.attr('aria-hidden') || '') === 'true' || ['none', 'presentation'].includes(role)) {
        attrs['android:importantForAccessibility'] = 'no';
    }

    if (normalizeStyleValue(node.attr('aria-disabled') || '') === 'true') {
        attrs['android:enabled'] = 'false';
    }

    if (dir === 'rtl') {
        attrs['android:textDirection'] = 'rtl';
        attrs['android:layoutDirection'] = 'rtl';
    } else if (dir === 'ltr') {
        attrs['android:textDirection'] = 'ltr';
        attrs['android:layoutDirection'] = 'ltr';
    }

    if (node.attr('lang')) attrs['android:textLocale'] = node.attr('lang');

    const live = normalizeStyleValue(node.attr('aria-live') || '');
    if (live === 'polite' || live === 'assertive') attrs['android:accessibilityLiveRegion'] = live;

    const stateDescription = [];
    if (node.attr('aria-expanded') !== undefined) stateDescription.push(normalizeStyleValue(node.attr('aria-expanded')) === 'true' ? 'expanded' : 'collapsed');
    if (node.attr('aria-pressed') !== undefined) stateDescription.push(normalizeStyleValue(node.attr('aria-pressed')) === 'true' ? 'pressed' : 'not pressed');
    if (stateDescription.length) attrs['android:stateDescription'] = stateDescription.join(', ');

    const label = node.attr('aria-label') || node.attr('title');
    if (label && !attrs['android:contentDescription']) {
        attrs['android:contentDescription'] = label;
    }
}

function expandInsetStyles(styles) {
    if (!styles['inset']) return styles;

    const values = expandBoxValues(styles['inset']);
    if (!values) return styles;

    return {
        ...styles,
        top: styles['top'] || values.top,
        right: styles['right'] || values.right,
        bottom: styles['bottom'] || values.bottom,
        left: styles['left'] || values.left,
    };
}

function autoLinkForHref(href) {
    const normalized = normalizeStyleValue(href || '');
    if (/^mailto:/.test(normalized)) return 'email';
    if (/^tel:/.test(normalized)) return 'phone';
    if (/^https?:\/\//.test(normalized) || /^www\./.test(normalized)) return 'web';
    return null;
}

function textContentForNode(node) {
    return node.contents().toArray()
        .map(textContentForDomNode)
        .join('')
        .replace(/[ \t\f\v\r]+\n/g, '\n')
        .replace(/\n[ \t\f\v\r]+/g, '\n')
        .trim();
}

function textContentForDomNode(node) {
    if (!node) return '';
    if (node.type === 'text') return node.data || '';
    const tag = (node.tagName || node.name || '').toLowerCase();
    if (tag === 'br') return '\n';
    if (['script', 'style', 'head'].includes(tag)) return '';
    return (node.children || []).map(textContentForDomNode).join('');
}

function applyTextTransform(text, value) {
    const transform = normalizeStyleValue(value || '');
    if (!text || !transform || transform === 'none') return text;
    if (transform === 'uppercase') return text.toUpperCase();
    if (transform === 'lowercase') return text.toLowerCase();
    if (transform === 'capitalize') {
        return text.replace(/\b([a-z])/gi, match => match.toUpperCase());
    }
    return text;
}

function defaultInputText(type) {
    return {
        submit: 'Submit',
        reset: 'Reset',
        button: 'Button',
        file: 'Choose file',
    }[type] || null;
}

function firstSrcsetCandidate(srcset) {
    return String(srcset || '')
        .split(',')
        .map(candidate => candidate.trim().split(/\s+/)[0])
        .find(Boolean) || '';
}

function imageResourceName(source) {
    const withoutScaleSuffix = String(source || '').replace(/@(?:1|1\.5|2|3|4)x(?=\.[^./?#]+(?:[?#]|$))/i, '');
    return resourceNameFromPath(withoutScaleSuffix);
}

function withInputTypeFlag(inputType, flag) {
    if (!flag || inputType.split('|').includes(flag)) return inputType;
    return `${inputType}|${flag}`;
}

function inputModeType(inputmode) {
    return {
        decimal: 'numberDecimal',
        email: 'textEmailAddress',
        numeric: 'number',
        search: 'text',
        tel: 'phone',
        url: 'textUri',
    }[normalizeStyleValue(inputmode || '')] || null;
}

function imeActionForEnterKeyHint(value) {
    return {
        done: 'actionDone',
        go: 'actionGo',
        next: 'actionNext',
        previous: 'actionPrevious',
        search: 'actionSearch',
        send: 'actionSend',
    }[normalizeStyleValue(value || '')] || null;
}

function normalizeFontSources(fontSources) {
    if (fontSources === undefined || fontSources === null) return new Map();
    if (!(fontSources instanceof Map) && (typeof fontSources !== 'object' || Array.isArray(fontSources))) {
        throw new TypeError('fontSources must be an object or Map keyed by declared font URL.');
    }
    const entries = fontSources instanceof Map ? [...fontSources.entries()] : Object.entries(fontSources);
    const sources = new Map();
    for (const [declaredSource, localSource] of entries) {
        if (typeof localSource !== 'string' || !localSource.trim()) {
            throw new TypeError(`Font source "${declaredSource}" must map to a local path or @font reference.`);
        }
        const mappedSource = localSource.trim();
        if (isRemoteFontSource(mappedSource)) {
            throw new TypeError(`Font source "${declaredSource}" must not map to another remote URL.`);
        }
        sources.set(String(declaredSource), mappedSource);
    }
    return sources;
}

function fontFaceUrls(value) {
    return [...String(value || '').matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)]
        .map(match => match[2].trim())
        .filter(Boolean);
}

function fontFileExtension(value) {
    const clean = String(value || '').split(/[?#]/)[0];
    return /\.(ttf|otf|ttc)$/i.exec(clean)?.[1].toLowerCase() || null;
}

function isRemoteFontSource(value) {
    return /^(?:https?:|\/\/)/i.test(String(value || ''));
}

function decodeCssGeneratedContent(value, node) {
    const normalized = normalizeStyleValue(value || '');
    if (!normalized || ['none', 'normal'].includes(normalized)) return { text: null, supported: true };
    let text = '';
    for (const token of splitCssTokens(value)) {
        const quote = token[0];
        if ((quote === '"' || quote === "'") && token[token.length - 1] === quote) {
            text += token.slice(1, -1)
                .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
                .replace(/\\(.)/gs, '$1');
            continue;
        }
        const attribute = /^attr\(\s*([\w:-]+)\s*\)$/i.exec(token);
        if (attribute) {
            text += node.attr(attribute[1]) || '';
            continue;
        }
        return { text: null, supported: false };
    }
    return { text, supported: true };
}

function interactionActionForHref(href) {
    const normalized = String(href || '').trim().toLowerCase();
    if (/^(?:https?:)?\/\//.test(normalized)) return 'open-url';
    if (normalized.startsWith('mailto:')) return 'send-email';
    if (normalized.startsWith('tel:')) return 'dial-phone';
    if (normalized.startsWith('#')) return 'navigate-anchor';
    return 'navigate';
}

function normalizeCustomElements(customElements) {
    if (customElements === undefined || customElements === null) return new Map();
    if (!(customElements instanceof Map) && (typeof customElements !== 'object' || Array.isArray(customElements))) {
        throw new TypeError('customElements must be an object or Map keyed by custom-element name.');
    }

    const entries = customElements instanceof Map ? [...customElements.entries()] : Object.entries(customElements);
    const mappings = new Map();
    for (const [rawName, rawAndroidTag] of entries) {
        const name = String(rawName).trim().toLowerCase();
        const androidTag = typeof rawAndroidTag === 'string' ? rawAndroidTag.trim() : '';
        if (!/^[a-z][a-z0-9._-]*-[a-z0-9._-]+$/.test(name)) {
            throw new TypeError(`Custom element name "${rawName}" must be a valid hyphenated name.`);
        }
        if (!isValidAndroidTag(androidTag)) {
            throw new TypeError(`Android view tag for "${rawName}" is invalid.`);
        }
        mappings.set(name, androidTag);
    }
    return mappings;
}

function isValidAndroidTag(value) {
    return /^[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*$/.test(String(value || ''));
}

function isValidXmlAttributeName(value) {
    return /^(?:xmlns(?::[A-Za-z_][\w.-]*)?|[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)$/.test(String(value || ''));
}

function normalizeHooks(hooks) {
    if (hooks === undefined || hooks === null) return {};
    if (typeof hooks !== 'object' || Array.isArray(hooks)) {
        throw new TypeError('hooks must be an object.');
    }
    const supported = new Set(['element', 'interaction', 'result']);
    for (const [name, hook] of Object.entries(hooks)) {
        if (!supported.has(name)) throw new TypeError(`Unknown hook "${name}".`);
        if (typeof hook !== 'function') throw new TypeError(`hooks.${name} must be a function.`);
    }
    return { ...hooks };
}

function normalizeResourceExtraction(value) {
    if (value === undefined || value === null || value === false) return null;
    if (value === true) {
        return { colors: true, dimensions: true, strings: true, minOccurrences: 2 };
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('extractResources must be a boolean or configuration object.');
    }
    const supported = new Set(['colors', 'dimensions', 'strings', 'minOccurrences']);
    for (const key of Object.keys(value)) {
        if (!supported.has(key)) throw new TypeError(`Unknown extractResources option "${key}".`);
    }
    for (const key of ['colors', 'dimensions', 'strings']) {
        if (value[key] !== undefined && typeof value[key] !== 'boolean') {
            throw new TypeError(`extractResources.${key} must be a boolean.`);
        }
    }
    const minOccurrences = value.minOccurrences ?? 2;
    if (!Number.isInteger(minOccurrences) || minOccurrences < 1) {
        throw new TypeError('extractResources.minOccurrences must be a positive integer.');
    }
    return {
        colors: value.colors === true,
        dimensions: value.dimensions === true,
        strings: value.strings === true,
        minOccurrences,
    };
}

const EXTRACTABLE_COLOR_ATTRIBUTES = new Set([
    'background', 'textColor', 'tint', 'backgroundTint', 'boxStrokeColor',
    'boxBackgroundColor', 'strokeColor', 'fillColor', 'helperTextTextColor',
    'cardBackgroundColor', 'startColor', 'centerColor', 'endColor',
]);
const EXTRACTABLE_STRING_ATTRIBUTES = new Set([
    'text', 'hint', 'title', 'contentDescription', 'stateDescription',
    'helperText', 'errorContentDescription',
]);

function extractedValueType(attribute, value, options) {
    const localName = attribute.includes(':') ? attribute.split(':').pop() : attribute;
    if (options.colors && EXTRACTABLE_COLOR_ATTRIBUTES.has(localName) && /^#[0-9a-f]{3,8}$/i.test(value)) {
        return 'colors';
    }
    if (options.dimensions && /^-?\d*\.?\d+(?:dp|sp)$/.test(value) && (
        /^layout_(?:width|height|margin)/.test(localName)
        || /^(?:padding|textSize|minWidth|minHeight|maxWidth|maxHeight|elevation|cardElevation|cardCornerRadius|cornerRadius|strokeWidth|textIndent|dropDownHeight|translationX|translationY)/.test(localName)
    )) {
        return 'dimensions';
    }
    if (options.strings && EXTRACTABLE_STRING_ATTRIBUTES.has(localName)
        && value !== '' && !value.startsWith('@') && !value.startsWith('?')) {
        return 'strings';
    }
    return null;
}

function generateNavigationIcon() {
    return `<?xml version="1.0" encoding="utf-8"?>\n${buildXmlString('vector', {
        'xmlns:android': 'http://schemas.android.com/apk/res/android',
        'android:width': '24dp',
        'android:height': '24dp',
        'android:viewportWidth': '24',
        'android:viewportHeight': '24',
    }, [buildXmlString('path', {
        'android:fillColor': '#FF000000',
        'android:pathData': 'M12,2A10,10 0,1 0,12 22A10,10 0,1 0,12 2Z',
    })])}`;
}

class ShiftLayout {
    constructor(options = {}) {
        this.opts = {
            prefix:         options.prefix         ?? 'sl',
            defaultPadding: options.defaultPadding ?? '16dp',
            useConstraint:  options.useConstraint  ?? true,
            inputStyle:     options.inputStyle     ?? 'outlined', // 'outlined' | 'filled'
        };
        this.customElements = normalizeCustomElements(options.customElements);
        this.hooks = normalizeHooks(options.hooks);
        this.resourceExtraction = normalizeResourceExtraction(options.extractResources);
        this.idCount = 0;
        this.lastTopLevelId = null;
        this.usedIds = new Set();
        this.drawables = {};
        this.menus = {};
        this.arrays = {};
        this.arraySpecs = {};
        this.assets = { images: [], fonts: [] };
        this.interactions = [];
        this.media = [];
        this.fonts = {};
        this.fontFaceDeclarations = [];
        this.fontFamilyResources = new Map();
        this.usedFontResources = new Set();
        this.stylesheetRules = [];
        this.computedStyleCache = new WeakMap();
        this.pseudoStyleCache = new WeakMap();
        this.warnings = [];
        this.warningKeys = new Set();
        this.inspectedStyleElements = new WeakSet();
        this.usedImageResources = new Set();
        this.imageResourceBySource = new Map();
        this.elementIds = new WeakMap();
        this.referenceTextById = new Map();
    }

    _warn({ code, message, element = null, property = null, value = null }) {
        const key = [code, element, property, value].join('|');
        if (this.warningKeys.has(key)) return;
        this.warningKeys.add(key);
        this.warnings.push({ severity: 'warning', code, message, element, property, value });
    }

    _elementSelector(node) {
        const tag = node.prop('tagName')?.toLowerCase() || 'element';
        const id = node.attr('id') ? `#${node.attr('id')}` : '';
        const classes = String(node.attr('class') || '').trim().split(/\s+/).filter(Boolean).map(name => `.${name}`).join('');
        return `${tag}${id}${classes}`;
    }

    _interactionFormId(node) {
        const formId = node.attr('form') || node.closest('form').attr('id');
        return formId ? sanitizeResourceName(formId, this.opts.prefix) : null;
    }

    _applyElementHook(node, androidTag, attributes, context) {
        if (!this.hooks.element) return { androidTag, attributes };
        const descriptor = {
            tag: node.prop('tagName')?.toLowerCase() || null,
            androidTag,
            attributes: { ...attributes },
            htmlAttributes: { ...(node[0]?.attribs || {}) },
            styles: { ...(context.styles || {}) },
            index: context.index,
            depth: context.depth,
        };
        const returned = this.hooks.element(descriptor);
        const result = returned === undefined ? descriptor : returned;
        if (!result || typeof result !== 'object' || Array.isArray(result)) {
            throw new TypeError('hooks.element must return an element descriptor or undefined.');
        }
        if (!isValidAndroidTag(result.androidTag)) {
            throw new TypeError('hooks.element returned an invalid Android view tag.');
        }
        if (!result.attributes || typeof result.attributes !== 'object' || Array.isArray(result.attributes)) {
            throw new TypeError('hooks.element returned invalid attributes.');
        }
        for (const name of Object.keys(result.attributes)) {
            if (!isValidXmlAttributeName(name)) {
                throw new TypeError(`hooks.element returned invalid XML attribute "${name}".`);
            }
        }
        return { androidTag: result.androidTag, attributes: result.attributes };
    }

    _addInteraction(record, node) {
        if (!this.hooks.interaction) {
            this.interactions.push(record);
            return;
        }
        const candidate = { ...record };
        const returned = this.hooks.interaction(candidate, {
            tag: node.prop('tagName')?.toLowerCase() || null,
            htmlAttributes: { ...(node[0]?.attribs || {}) },
        });
        const result = returned === undefined ? candidate : returned;
        if (result === null || result === false) return;
        if (typeof result !== 'object' || Array.isArray(result)) {
            throw new TypeError('hooks.interaction must return an interaction record, false, null, or undefined.');
        }
        this.interactions.push(result);
    }

    _referencedText(node, attribute) {
        return String(node.attr(attribute) || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map(id => this.referenceTextById.get(id))
            .filter(Boolean)
            .join(' ') || null;
    }

    _collectForms($) {
        return $('form').toArray().map(formElement => {
            const form = $(formElement);
            const id = this.elementIds.get(formElement);
            const groups = form.find('fieldset').toArray().map(fieldsetElement => {
                const fieldset = $(fieldsetElement);
                return {
                    id: this.elementIds.get(fieldsetElement),
                    label: textContentForNode(fieldset.children('legend').first()).trim() || null,
                    fields: [],
                };
            }).filter(group => group.id);
            const groupByElement = new Map(
                form.find('fieldset').toArray().map((element, index) => [element, groups[index]?.id]).filter(([, groupId]) => groupId)
            );
            const fields = form.find('input, textarea, select').toArray().flatMap(fieldElement => {
                const field = $(fieldElement);
                const fieldId = this.elementIds.get(fieldElement);
                if (!fieldId) return [];
                const groupElement = field.closest('fieldset')[0];
                const group = groupElement && groupByElement.get(groupElement) || null;
                const constraints = {};
                for (const attribute of ['min', 'max', 'step', 'minlength', 'maxlength', 'pattern']) {
                    if (field.attr(attribute) !== undefined) constraints[attribute] = field.attr(attribute);
                }
                const metadata = {
                    id: fieldId,
                    name: field.attr('name') || null,
                    type: field.prop('tagName').toLowerCase() === 'input'
                        ? normalizeStyleValue(field.attr('type') || 'text')
                        : field.prop('tagName').toLowerCase(),
                    required: field.attr('required') !== undefined,
                    disabled: field.attr('disabled') !== undefined,
                    readOnly: field.attr('readonly') !== undefined,
                    invalid: field.attr('aria-invalid') !== undefined && normalizeStyleValue(field.attr('aria-invalid')) !== 'false',
                    constraints,
                    helperText: field.attr('data-helper-text') || this._referencedText(field, 'aria-describedby'),
                    errorText: field.attr('data-error') || this._referencedText(field, 'aria-errormessage'),
                    group,
                };
                if (group) groups.find(item => item.id === group).fields.push(fieldId);
                return [metadata];
            });
            return {
                id,
                target: form.attr('action') || null,
                method: normalizeStyleValue(form.attr('method') || 'get'),
                groups,
                fields,
            };
        }).filter(form => form.id);
    }

    _recordInteraction(node, cleanId, tag, inputType) {
        const id = cleanId.replace('@+id/', '');
        let label = textContentForNode(node).trim() || node.attr('aria-label') || node.attr('title') || null;
        if (!label && tag === 'input' && ['submit', 'button', 'reset', 'file'].includes(inputType)) {
            label = node.attr('value') || defaultInputText(inputType);
        }
        if (!label && tag === 'button') label = defaultInputText(normalizeStyleValue(node.attr('type') || 'button'));
        if (tag === 'a') {
            const target = node.attr('href') || null;
            this._addInteraction({
                type: 'link', id, target,
                action: interactionActionForHref(target),
                label,
            }, node);
            return;
        }
        if (tag === 'form') {
            this._addInteraction({
                type: 'form', id,
                target: node.attr('action') || null,
                method: normalizeStyleValue(node.attr('method') || 'get'),
            }, node);
            return;
        }

        const roleButton = normalizeStyleValue(node.attr('role') || '') === 'button';
        const isButton = tag === 'button' || (tag === 'input' && ['submit', 'button', 'reset', 'file'].includes(inputType)) || roleButton;
        if (!isButton) return;
        const action = tag === 'input'
            ? (inputType === 'file' ? 'choose-file' : inputType)
            : tag === 'button' ? normalizeStyleValue(node.attr('type') || 'submit') : 'button';
        this._addInteraction({
            type: 'button', id, action,
            form: this._interactionFormId(node),
            label,
        }, node);
    }

    _recordMedia(node, cleanId, tag) {
        if (!EMBEDDED_MEDIA_TAGS.has(tag)) return;
        const source = tag === 'object'
            ? node.attr('data') || null
            : node.attr('src') || node.children('source').first().attr('src') || null;
        const record = {
            kind: tag,
            id: cleanId.replace('@+id/', ''),
            source,
            mimeType: node.attr('type') || node.children('source').first().attr('type') || null,
            title: node.attr('title') || node.attr('aria-label') || null,
            fallbackText: textContentForNode(node).trim() || null,
        };
        if (['video', 'audio'].includes(tag)) {
            Object.assign(record, {
                controls: node.attr('controls') !== undefined,
                autoplay: node.attr('autoplay') !== undefined,
                loop: node.attr('loop') !== undefined,
                muted: node.attr('muted') !== undefined,
                preload: node.attr('preload') || null,
                poster: tag === 'video' ? node.attr('poster') || null : null,
            });
        } else if (tag === 'iframe') {
            Object.assign(record, {
                sourceDocument: node.attr('srcdoc') || null,
                sandbox: node.attr('sandbox') || null,
                allow: node.attr('allow') || null,
            });
        } else if (tag === 'canvas') {
            Object.assign(record, {
                width: node.attr('width') || null,
                height: node.attr('height') || null,
            });
        }
        this.media.push(record);
    }

    _inspectStyles(node, styles) {
        const elementNode = node[0];
        if (!elementNode || this.inspectedStyleElements.has(elementNode)) return;
        this.inspectedStyleElements.add(elementNode);
        const element = this._elementSelector(node);

        for (const [property, value] of Object.entries(styles)) {
            if (property.startsWith('--')) continue;
            const normalized = normalizeStyleValue(value);
            if (!SUPPORTED_CSS_PROPERTIES.has(property)) {
                this._warn({
                    code: 'unsupported-css-property',
                    message: `CSS property "${property}" is not converted.`,
                    element, property, value,
                });
                continue;
            }

            if (property === 'content') {
                this._warn({
                    code: 'unsupported-css-value',
                    message: 'CSS content is converted only on ::before and ::after pseudo-elements.',
                    element, property, value,
                });
            }

            if (COMPUTED_LENGTH_PROPERTIES.has(property) && /^(calc|min|max|clamp)\(/.test(normalized) && !pxToDp(value)) {
                this._warn({
                    code: 'unsupported-css-value',
                    message: `CSS value "${value}" requires dimensions unavailable during static conversion.`,
                    element, property, value,
                });
            }
            if (['top', 'right', 'bottom', 'left'].includes(property) && normalized.endsWith('%')) {
                this._warn({
                    code: 'unsupported-css-value',
                    message: 'Percentage positioning offsets are not converted to static Android XML.',
                    element, property, value,
                });
            }
            if (property === 'position' && normalized === 'sticky') {
                this._warn({
                    code: 'unsupported-css-value',
                    message: 'Sticky positioning requires runtime scroll behavior and is not converted.',
                    element, property, value,
                });
            }
            if (property === 'background-image' && normalized !== 'none' && !parseLinearGradient(value)) {
                this._warn({
                    code: 'unsupported-css-value',
                    message: 'Only linear-gradient() background images are currently converted.',
                    element, property, value,
                });
            }
            if (property === 'box-shadow' && normalized !== 'none' && !parseBoxShadow(value)) {
                this._warn({
                    code: 'unsupported-css-value',
                    message: 'Inset or unparseable box shadows are not converted.',
                    element, property, value,
                });
            }

            const approximation = {
                'box-shadow': 'Box shadows are approximated with Android elevation.',
                'border-top': 'One-sided borders are approximated with a uniform Android shape stroke.',
                'border-right': 'One-sided borders are approximated with a uniform Android shape stroke.',
                'border-bottom': 'One-sided borders are approximated with a uniform Android shape stroke.',
                'border-left': 'One-sided borders are approximated with a uniform Android shape stroke.',
                'gap': 'CSS gaps are approximated using Android divider spacing or item margins.',
                'row-gap': 'CSS row gaps are approximated using Android divider spacing or item margins.',
                'column-gap': 'CSS column gaps are approximated using Android divider spacing or item margins.',
            }[property];
            if (approximation && normalized !== 'none' && !isZeroCssLength(value) && (property !== 'box-shadow' || parseBoxShadow(value))) {
                this._warn({ code: 'approximated-css', message: approximation, element, property, value });
            }
            if (property === 'display' && ['grid', 'inline-grid'].includes(normalized)) {
                this._warn({
                    code: 'approximated-css',
                    message: 'CSS Grid is approximated with Android GridLayout.',
                    element, property, value,
                });
            }
            if (property === 'position' && normalized === 'fixed') {
                this._warn({
                    code: 'approximated-css',
                    message: 'Fixed positioning is approximated against the generated Android parent.',
                    element, property, value,
                });
            }
            if (['grid-template-columns', 'grid-template-rows'].includes(property)) {
                this._warn({
                    code: 'approximated-css',
                    message: 'CSS Grid track sizing is reduced to Android track counts and weights.',
                    element, property, value,
                });
            }
        }
    }

    _collectStylesheetRules($, stylesheetSources, mediaProfile) {
        const rules = [];
        let order = 0;

        $('style, link').each((_, element) => {
            const node = $(element);
            const tag = node.prop('tagName')?.toLowerCase();
            let css = null;

            if (tag === 'style') {
                css = node.html() || '';
            } else {
                const rel = normalizeStyleValue(node.attr('rel') || '').split(/\s+/);
                if (!rel.includes('stylesheet')) return;
                const href = node.attr('href') || '';
                css = stylesheetSources.get(href);
                if (css === undefined) {
                    this._warn({
                        code: 'missing-stylesheet',
                        message: `No caller-supplied CSS was provided for linked stylesheet "${href}".`,
                        element: `link[href="${href}"]`,
                        value: href,
                    });
                }
            }
            if (css === null || css === undefined) return;

            this.fontFaceDeclarations.push(...parseFontFaces(css));

            for (const rule of parseCssStylesheet(css)) {
                if (rule.mediaConditions.some(condition => !matchesMediaQuery(condition, mediaProfile))) continue;
                for (const selector of rule.selectors) {
                    const pseudoMatch = /::?(before|after)\s*$/i.exec(selector);
                    const matchSelector = pseudoMatch
                        ? selector.slice(0, pseudoMatch.index).trim() || '*'
                        : selector;
                    rules.push({
                        selector: matchSelector,
                        pseudo: pseudoMatch ? pseudoMatch[1].toLowerCase() : null,
                        declarations: rule.declarations,
                        specificity: [0, ...selectorSpecificity(selector)],
                        order: order++,
                    });
                }
            }
        });

        return rules;
    }

    _prepareFonts(fontSources) {
        const families = new Map();
        for (const face of this.fontFaceDeclarations) {
            const family = String(face['font-family'] || '').trim().replace(/^(['"])(.*)\1$/, '$2');
            const normalizedFamily = family.toLowerCase();
            if (!normalizedFamily) {
                this._warn({
                    code: 'invalid-font-face',
                    message: '@font-face is missing a font-family declaration.',
                    element: '@font-face', property: 'font-family', value: face['font-family'] || null,
                });
                continue;
            }
            const urls = fontFaceUrls(face.src);
            if (!urls.length) {
                this._warn({
                    code: 'unsupported-font-source',
                    message: `Font family "${family}" has no URL source that can become an Android font resource.`,
                    element: '@font-face', property: 'src', value: face.src || null,
                });
                continue;
            }

            let selected = false;
            const sourceFailures = [];
            for (const declaredSource of urls) {
                const mappedSource = fontSources.get(declaredSource);
                if (!mappedSource && isRemoteFontSource(declaredSource)) {
                    sourceFailures.push({ code: 'unmapped-web-font', source: declaredSource });
                    continue;
                }
                const source = mappedSource || declaredSource;
                if (source.startsWith('@font/')) {
                    this.fontFamilyResources.set(normalizedFamily, source);
                    selected = true;
                    break;
                }
                const extension = fontFileExtension(source);
                if (!extension) {
                    sourceFailures.push({ code: 'unsupported-font-format', source });
                    continue;
                }

                let group = families.get(normalizedFamily);
                if (!group) {
                    const familyBase = `sl_font_${sanitizeResourceName(family, 'family')}`;
                    group = {
                        family,
                        resource: makeUniqueResourceName(familyBase, this.usedFontResources),
                        faces: [],
                    };
                    families.set(normalizedFamily, group);
                }
                const weightValue = normalizeStyleValue(face['font-weight'] || '400');
                const parsedWeight = weightValue === 'bold' ? 700 : weightValue === 'normal' ? 400 : parseInt(weightValue, 10);
                const weight = Number.isFinite(parsedWeight) ? Math.max(1, Math.min(1000, parsedWeight)) : 400;
                const style = /^(?:italic|oblique)$/.test(normalizeStyleValue(face['font-style'] || 'normal')) ? 'italic' : 'normal';
                const fileBase = `${group.resource}_${weight}_${style}`;
                const resource = makeUniqueResourceName(fileBase, this.usedFontResources);
                group.faces.push({ resource, weight, style });
                this.assets.fonts.push({
                    family,
                    declaredSource,
                    source,
                    resource,
                    weight,
                    style,
                    remote: false,
                });
                selected = true;
                break;
            }
            if (!selected) {
                for (const failure of sourceFailures) {
                    if (failure.code === 'unmapped-web-font') {
                        this.assets.fonts.push({
                            family, declaredSource: failure.source, source: null, resource: null,
                            weight: null, style: null, remote: true,
                        });
                    }
                    this._warn({
                        code: failure.code,
                        message: failure.code === 'unmapped-web-font'
                            ? `Remote font "${failure.source}" requires an explicit fontSources mapping.`
                            : `Font source "${failure.source}" must use TTF, OTF, or TTC format.`,
                        element: '@font-face', property: 'src', value: failure.source,
                    });
                }
                continue;
            }
        }

        for (const [family, group] of families) {
            if (!group.faces.length) continue;
            const children = group.faces.map(face => buildXmlString('font', {
                'android:font': `@font/${face.resource}`,
                'android:fontStyle': face.style,
                'android:fontWeight': String(face.weight),
            }));
            this.fonts[`${group.resource}.xml`] = `<?xml version="1.0" encoding="utf-8"?>\n${buildXmlString('font-family', {
                'xmlns:android': 'http://schemas.android.com/apk/res/android',
            }, children)}`;
            this.fontFamilyResources.set(family, `@font/${group.resource}`);
        }
    }

    _getComputedStyles($, node) {
        const element = node[0];
        if (!element) return {};
        const cached = this.computedStyleCache.get(element);
        if (cached) return cached;

        const winners = {};
        const parent = node.parent();
        if (parent.length) {
            const parentStyles = this._getComputedStyles($, parent);
            for (const [property, value] of Object.entries(parentStyles)) {
                if (property.startsWith('--') || INHERITED_CSS_PROPERTIES.has(property)) {
                    winners[property] = {
                        value,
                        important: false,
                        specificity: [-1, 0, 0, 0],
                        order: -1,
                        declarationOrder: -1,
                    };
                }
            }
        }

        for (const rule of this.stylesheetRules) {
            if (rule.pseudo) continue;
            let matches = false;
            try {
                matches = node.is(rule.selector);
            } catch {
                this._warn({
                    code: 'invalid-css-selector',
                    message: `CSS selector "${rule.selector}" could not be matched.`,
                    value: rule.selector,
                });
                continue;
            }
            if (!matches) continue;

            rule.declarations.forEach((declaration, declarationOrder) => {
                const candidate = {
                    value: declaration.value,
                    important: declaration.important,
                    specificity: rule.specificity,
                    order: rule.order,
                    declarationOrder,
                };
                if (shouldReplaceDeclaration(winners[declaration.property], candidate)) {
                    winners[declaration.property] = candidate;
                }
            });
        }

        const inlineOrder = this.stylesheetRules.length;
        parseStyleDeclarations(node.attr('style') || '').forEach((declaration, declarationOrder) => {
            const candidate = {
                value: declaration.value,
                important: declaration.important,
                specificity: [1, 0, 0, 0],
                order: inlineOrder,
                declarationOrder,
            };
            if (shouldReplaceDeclaration(winners[declaration.property], candidate)) {
                winners[declaration.property] = candidate;
            }
        });

        const styles = Object.fromEntries(
            Object.entries(winners).map(([property, declaration]) => [property, declaration.value])
        );
        const variables = Object.fromEntries(
            Object.entries(styles).filter(([property]) => property.startsWith('--'))
        );
        for (const property of Object.keys(variables)) {
            variables[property] = resolveCssVariables(variables[property], variables);
            styles[property] = variables[property];
        }
        for (const [property, value] of Object.entries(styles)) {
            if (!property.startsWith('--')) styles[property] = resolveCssVariables(value, variables);
        }

        this.computedStyleCache.set(element, styles);
        return styles;
    }

    _getPseudoStyles(node, pseudo) {
        const element = node[0];
        if (!element) return {};
        let cached = this.pseudoStyleCache.get(element);
        if (!cached) {
            cached = {};
            this.pseudoStyleCache.set(element, cached);
        }
        if (cached[pseudo]) return cached[pseudo];

        const winners = {};
        const hostStyles = this._getComputedStyles(null, node);
        for (const [property, value] of Object.entries(hostStyles)) {
            if (property.startsWith('--') || INHERITED_CSS_PROPERTIES.has(property)) {
                winners[property] = {
                    value,
                    important: false,
                    specificity: [-1, 0, 0, 0],
                    order: -1,
                    declarationOrder: -1,
                };
            }
        }

        for (const rule of this.stylesheetRules) {
            if (rule.pseudo !== pseudo) continue;
            let matches = false;
            try {
                matches = node.is(rule.selector);
            } catch {
                this._warn({
                    code: 'invalid-css-selector',
                    message: `CSS selector "${rule.selector}" could not be matched.`,
                    value: rule.selector,
                });
                continue;
            }
            if (!matches) continue;
            rule.declarations.forEach((declaration, declarationOrder) => {
                const candidate = {
                    value: declaration.value,
                    important: declaration.important,
                    specificity: rule.specificity,
                    order: rule.order,
                    declarationOrder,
                };
                if (shouldReplaceDeclaration(winners[declaration.property], candidate)) {
                    winners[declaration.property] = candidate;
                }
            });
        }

        const styles = Object.fromEntries(
            Object.entries(winners).map(([property, declaration]) => [property, declaration.value])
        );
        const variables = Object.fromEntries(
            Object.entries(styles).filter(([property]) => property.startsWith('--'))
        );
        for (const property of Object.keys(variables)) {
            variables[property] = resolveCssVariables(variables[property], variables);
            styles[property] = variables[property];
        }
        for (const [property, value] of Object.entries(styles)) {
            if (!property.startsWith('--')) styles[property] = resolveCssVariables(value, variables);
        }
        cached[pseudo] = styles;
        return styles;
    }

    _pseudoText(node, pseudo, mode) {
        const styles = this._getPseudoStyles(node, pseudo);
        if (!styles.content || normalizeStyleValue(styles.display || '') === 'none') return null;
        const decoded = decodeCssGeneratedContent(styles.content, node);
        const element = `${this._elementSelector(node)}::${pseudo}`;
        if (!decoded.supported) {
            this._warn({
                code: 'unsupported-css-value',
                message: 'Pseudo-element content supports quoted text and attr() values.',
                element, property: 'content', value: styles.content,
            });
            return null;
        }
        if (!decoded.text) return null;
        if (mode === 'unsupported') {
            this._warn({
                code: 'unsupported-css-value',
                message: 'Pseudo-element content cannot be nested in this Android view type.',
                element, property: 'content', value: styles.content,
            });
            return null;
        }

        const mappedForContainer = new Set([
            'content', 'display', 'color', 'font-size', 'font-weight', 'font-style',
            'font-family', 'text-align', 'text-transform', 'background-color',
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        ]);
        const hostStyles = mode === 'inline' ? this._getComputedStyles(null, node) : null;
        for (const [property, value] of Object.entries(styles)) {
            if (property.startsWith('--') || ['content', 'display', 'text-transform'].includes(property)) continue;
            if (mode === 'inline' && hostStyles[property] === value) continue;
            if (mode === 'container' && mappedForContainer.has(property)) continue;
            this._warn({
                code: 'approximated-css',
                message: mode === 'inline'
                    ? 'Pseudo-element styling is flattened into the host Android text view.'
                    : `Pseudo-element CSS property "${property}" is not mapped to its generated TextView.`,
                element, property, value,
            });
        }
        return {
            text: applyTextTransform(decoded.text, styles['text-transform']),
            styles,
        };
    }

    _buildPseudoTextView(node, pseudo) {
        const generated = this._pseudoText(node, pseudo, 'container');
        if (!generated) return null;
        const { text, styles } = generated;
        const attrs = {
            'android:layout_width': 'wrap_content',
            'android:layout_height': 'wrap_content',
            'android:text': text,
        };
        const color = sanitizeColor(styles.color);
        if (color) attrs['android:textColor'] = color;
        const size = pxToSp(styles['font-size']);
        if (size) attrs['android:textSize'] = size;
        const weight = normalizeStyleValue(styles['font-weight'] || '');
        const italic = normalizeStyleValue(styles['font-style'] || '') === 'italic';
        if (weight === 'bold' || parseInt(weight, 10) >= 600) attrs['android:textStyle'] = 'bold';
        if (italic) attrs['android:textStyle'] = attrs['android:textStyle'] ? `${attrs['android:textStyle']}|italic` : 'italic';
        if (styles['font-family']) {
            const families = styles['font-family'].split(',').map(value => value.replace(/['"]/g, '').trim().toLowerCase());
            const resourceFamily = families.find(family => this.fontFamilyResources.has(family));
            const systemFamily = families.find(family => FONT_FAMILY_MAP[family]);
            attrs['android:fontFamily'] = resourceFamily
                ? this.fontFamilyResources.get(resourceFamily)
                : FONT_FAMILY_MAP[systemFamily] || 'sans-serif';
        }
        const gravity = { center: 'center', right: 'end', left: 'start' }[normalizeStyleValue(styles['text-align'] || '')];
        if (gravity) attrs['android:gravity'] = gravity;
        const background = sanitizeColor(styles['background-color']);
        if (background) attrs['android:background'] = background;
        applyBoxSpacing(attrs, styles, 'padding', 'android:padding');
        applyBoxSpacing(attrs, styles, 'margin', 'android:layout_margin');
        return buildXmlString('TextView', attrs);
    }

    _usesAdvancedFlex(styles, childStyles) {
        if (!isFlexContainer(styles)) return false;

        const direction = flexDirection(styles);
        const wrap = normalizeStyleValue(styles['flex-wrap'] || 'nowrap');
        const justify = normalizeStyleValue(styles['justify-content'] || '');
        if (direction.endsWith('-reverse') || wrap !== 'nowrap' || justify.startsWith('space-') || styles['align-content']) {
            return true;
        }

        return childStyles.some(child => [
            'order', 'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self',
        ].some(property => child[property] !== undefined));
    }

    _applyFlexItemAttrs(attrs, styles, parentStyles = {}) {
        if (!isFlexContainer(parentStyles)) return;

        const order = parseInt(styles['order'], 10);
        if (Number.isFinite(order)) attrs['app:layout_order'] = String(order + 1);

        const item = flexItemValues(styles);
        const grow = parseFloat(item.grow);
        const shrink = parseFloat(item.shrink);
        if (Number.isFinite(grow) && grow >= 0) attrs['app:layout_flexGrow'] = String(grow);
        if (Number.isFinite(shrink) && shrink >= 0) attrs['app:layout_flexShrink'] = String(shrink);

        const basis = normalizeStyleValue(item.basis || '');
        if (/^\d*\.?\d+%$/.test(basis)) {
            attrs['app:layout_flexBasisPercent'] = basis;
        } else if (basis && !['auto', 'content'].includes(basis)) {
            const dimension = flexDirection(parentStyles).startsWith('column')
                ? 'android:layout_height'
                : 'android:layout_width';
            attrs[dimension] = cssSizeToAndroid(basis);
        }

        const alignSelf = flexEnum(styles['align-self']);
        if (alignSelf) attrs['app:layout_alignSelf'] = alignSelf;
    }

    _applyGridItemAttrs(attrs, styles, parentStyles = {}) {
        if (!isGridContainer(parentStyles)) return;

        const placement = { ...styles };
        const area = String(styles['grid-area'] || '').split('/').map(part => part.trim());
        if (area.length > 1) {
            placement['grid-row-start'] ??= area[0];
            placement['grid-column-start'] ??= area[1];
            placement['grid-row-end'] ??= area[2];
            placement['grid-column-end'] ??= area[3];
        }

        const column = parseGridAxis(placement, 'column');
        const row = parseGridAxis(placement, 'row');
        if (column.start !== undefined) attrs['android:layout_column'] = String(column.start);
        if (column.span) attrs['android:layout_columnSpan'] = String(column.span);
        if (row.start !== undefined) attrs['android:layout_row'] = String(row.start);
        if (row.span) attrs['android:layout_rowSpan'] = String(row.span);

        if (/\b\d*\.?\d+fr\b/i.test(parentStyles['grid-template-columns'] || '')) {
            attrs['android:layout_columnWeight'] = '1';
        }
        if (/\b\d*\.?\d+fr\b/i.test(parentStyles['grid-template-rows'] || '')) {
            attrs['android:layout_rowWeight'] = '1';
        }

        const parentPlace = splitCssTokens(parentStyles['place-items'] || '');
        const selfPlace = splitCssTokens(styles['place-self'] || '');
        const align = styles['align-self'] || selfPlace[0] || parentStyles['align-items'] || parentPlace[0];
        const justify = styles['justify-self'] || selfPlace[1] || selfPlace[0] || parentStyles['justify-items'] || parentPlace[1] || parentPlace[0];
        const gravity = [gridAlignment(justify, 'horizontal'), gridAlignment(align, 'vertical')].filter(Boolean);
        if (gravity.length) attrs['android:layout_gravity'] = gravity.join('|');

        const gap = splitCssTokens(parentStyles['gap'] || '');
        const rowGap = parentStyles['row-gap'] || gap[0];
        const columnGap = parentStyles['column-gap'] || gap[1] || gap[0];
        const verticalMargin = halfCssLength(rowGap);
        const horizontalMargin = halfCssLength(columnGap);
        if (verticalMargin) {
            attrs['android:layout_marginTop'] = verticalMargin;
            attrs['android:layout_marginBottom'] = verticalMargin;
        }
        if (horizontalMargin) {
            attrs['android:layout_marginLeft'] = horizontalMargin;
            attrs['android:layout_marginRight'] = horizontalMargin;
        }
    }

    _nextId(node) {
        const rawId = node.attr('id') || `${this.opts.prefix}_${this.idCount++}`;
        const baseId = sanitizeResourceName(rawId, this.opts.prefix);
        const id = makeUniqueResourceName(baseId, this.usedIds);
        if (node[0]) this.elementIds.set(node[0], id);
        return `@+id/${id}`;
    }

    _shapeKey(fillColor, radius, strokeColor, strokeWidth) {
        const c = (fillColor || 'transparent').replace('#', '').toLowerCase();
        const r = radiusToKey(radius);
        const s = strokeColor ? `_s${strokeColor.replace('#', '').toLowerCase()}${(strokeWidth || '').replace(/\D/g, '')}` : '';
        return `sl_bg_${c}_r${r}${s}`;
    }

    _gradientKey(colors, angle, radius) {
        return `sl_grad_${colors.map(c => c.replace('#', '')).join('_').toLowerCase()}_a${angle}_r${radiusToKey(radius)}`;
    }

    _applyConstraints(attrs, cleanId, index, depth, styles) {
        const position = normalizeStyleValue(styles['position'] || '');
        const verticalAlign = normalizeStyleValue(styles['vertical-align'] || '');
        const isOutOfFlow = isOutOfFlowPosition(position);
        const isRelative = position === 'relative';
        const isCenter = !isOutOfFlow && !isRelative && (verticalAlign === 'center' ||
            (isZeroCssLength(styles['top']) && isZeroCssLength(styles['bottom'])));
        const isBottom = !isOutOfFlow && !isRelative && !isCenter && isZeroCssLength(styles['bottom']);
        const hasTop = styles['top'] !== undefined;
        const hasRight = styles['right'] !== undefined;
        const hasBottom = styles['bottom'] !== undefined;
        const hasLeft = styles['left'] !== undefined;
        const autoMargins = marginAutoState(styles);

        if (depth === 0 && this.opts.useConstraint) {
            if (isOutOfFlow) {
                if (hasLeft || (!hasRight && !autoMargins.left) || (autoMargins.left && autoMargins.right)) {
                    attrs['app:layout_constraintStart_toStartOf'] = 'parent';
                }
                if (hasRight || (autoMargins.left && autoMargins.right)) {
                    attrs['app:layout_constraintEnd_toEndOf'] = 'parent';
                }
                if (hasTop || (!hasBottom && !autoMargins.top) || (autoMargins.top && autoMargins.bottom)) {
                    attrs['app:layout_constraintTop_toTopOf'] = 'parent';
                }
                if (hasBottom || (autoMargins.top && autoMargins.bottom)) {
                    attrs['app:layout_constraintBottom_toBottomOf'] = 'parent';
                }
                if (hasLeft && hasRight && !styles['width']) attrs['android:layout_width'] = '0dp';
                if (hasTop && hasBottom && !styles['height']) attrs['android:layout_height'] = '0dp';
                const top = androidOffset(styles['top']);
                const right = androidOffset(styles['right']);
                const bottom = androidOffset(styles['bottom']);
                const left = androidOffset(styles['left']);
                if (top) attrs['android:layout_marginTop'] = top;
                if (right) attrs['android:layout_marginRight'] = right;
                if (bottom) attrs['android:layout_marginBottom'] = bottom;
                if (left) attrs['android:layout_marginLeft'] = left;
            } else {
                attrs['app:layout_constraintStart_toStartOf'] = 'parent';
                attrs['app:layout_constraintEnd_toEndOf']     = 'parent';
            }

            if (!isOutOfFlow && isCenter) {
                attrs['app:layout_constraintTop_toTopOf']       = 'parent';
                attrs['app:layout_constraintBottom_toBottomOf'] = 'parent';
            } else if (!isOutOfFlow && isBottom) {
                attrs['app:layout_constraintBottom_toBottomOf'] = 'parent';
            } else if (!isOutOfFlow) {
                if (!this.lastTopLevelId) {
                    attrs['app:layout_constraintTop_toTopOf'] = 'parent';
                } else {
                    attrs['app:layout_constraintTop_toBottomOf'] = this.lastTopLevelId;
                }
                this.lastTopLevelId = cleanId;
            }
        } else if (depth > 0 && !isOutOfFlow) {
            attrs['android:layout_gravity'] = 'center_horizontal';
        }

        if (isOutOfFlow && depth > 0) {
            const horizontalGravity = autoMargins.left && autoMargins.right ? 'center_horizontal' : hasRight && !hasLeft ? 'end' : 'start';
            const verticalGravity = autoMargins.top && autoMargins.bottom ? 'center_vertical' : hasBottom && !hasTop ? 'bottom' : 'top';
            attrs['android:layout_gravity'] = `${horizontalGravity}|${verticalGravity}`;
            if (hasLeft && hasRight && !styles['width']) attrs['android:layout_width'] = 'match_parent';
            if (hasTop && hasBottom && !styles['height']) attrs['android:layout_height'] = 'match_parent';
            const top = androidOffset(styles['top']);
            const right = androidOffset(styles['right']);
            const bottom = androidOffset(styles['bottom']);
            const left = androidOffset(styles['left']);
            if (top) attrs['android:layout_marginTop'] = top;
            if (right) attrs['android:layout_marginRight'] = right;
            if (bottom) attrs['android:layout_marginBottom'] = bottom;
            if (left) attrs['android:layout_marginLeft'] = left;
        } else if (isRelative) {
            const translationX = hasLeft ? androidOffset(styles['left']) : negateAndroidOffset(styles['right']);
            const translationY = hasTop ? androidOffset(styles['top']) : negateAndroidOffset(styles['bottom']);
            if (translationX) attrs['android:translationX'] = translationX;
            if (translationY) attrs['android:translationY'] = translationY;
        }

        if (!isOutOfFlow && depth > 0) {
            const gravity = new Set(String(attrs['android:layout_gravity'] || '').split('|').filter(Boolean));
            if (autoMargins.left && autoMargins.right) {
                gravity.delete('start');
                gravity.delete('end');
                gravity.add('center_horizontal');
            }
            if (autoMargins.top && autoMargins.bottom) {
                gravity.delete('top');
                gravity.delete('bottom');
                gravity.add('center_vertical');
            }
            if (gravity.size) attrs['android:layout_gravity'] = [...gravity].join('|');
        }
    }

    // Material TextInputLayout for <input> and <textarea>
    _buildTextInput(node, index, depth, styles, parentStyles) {
        const tag       = node.prop('tagName').toLowerCase();
        const isArea    = tag === 'textarea';
        let inputType = isArea ? 'textMultiLine' : (inputModeType(node.attr('inputmode')) || INPUT_TYPE_MAP[(node.attr('type') || 'text').toLowerCase()] || 'text');
        const hint      = node.attr('placeholder') || node.attr('aria-label') || node.attr('title') || '';
        const cleanId   = this._nextId(node);

        const styleAttr = this.opts.inputStyle === 'filled'
            ? '@style/Widget.MaterialComponents.TextInputLayout.FilledBox'
            : '@style/Widget.MaterialComponents.TextInputLayout.OutlinedBox';

        const outerAttrs = {
            'style':                   styleAttr,
            'android:layout_width':    (styles['width'] && cssSizeToAndroid(styles['width'])) || 'match_parent',
            'android:layout_height':   (styles['height'] && cssSizeToAndroid(styles['height'])) || 'wrap_content',
            'android:id':              cleanId,
            'android:hint':            hint,
        };

        this._applyConstraints(outerAttrs, cleanId, index, depth, styles);
        this._applyHtmlSizing(outerAttrs, node, styles);
        this._applyFlexItemAttrs(outerAttrs, styles, parentStyles);
        this._applyGridItemAttrs(outerAttrs, styles, parentStyles);
        applyAccessibilityAttrs(outerAttrs, node);

        // Margin on the outer wrapper
        applyBoxSpacing(outerAttrs, styles, 'margin', 'android:layout_margin');
        if (normalizeStyleValue(styles['display'] || '') === 'none') outerAttrs['android:visibility'] = 'gone';

        const strokeColor = sanitizeColor(styles['border-color'] || styles['color'] || '');
        if (strokeColor) outerAttrs['app:boxStrokeColor'] = strokeColor;
        const bgColor = sanitizeColor(styles['background-color'] || '') || extractBackgroundColor(styles['background'] || '');
        if (bgColor) outerAttrs['app:boxBackgroundColor'] = bgColor;
        const helperText = node.attr('data-helper-text');
        const errorText = node.attr('data-error') || this._referencedText(node, 'aria-errormessage');
        const invalid = node.attr('aria-invalid') !== undefined && normalizeStyleValue(node.attr('aria-invalid')) !== 'false';
        if (helperText) {
            outerAttrs['app:helperTextEnabled'] = 'true';
            outerAttrs['app:helperText'] = helperText;
        }
        if (errorText) {
            outerAttrs['app:errorEnabled'] = 'true';
            outerAttrs['app:errorContentDescription'] = errorText;
        }
        if (invalid && errorText) {
            outerAttrs['app:helperTextEnabled'] = 'true';
            outerAttrs['app:helperText'] = errorText;
            outerAttrs['app:helperTextTextColor'] = '#B00020';
        }

        const innerAttrs = {
            'android:layout_width':  'match_parent',
            'android:layout_height': 'wrap_content',
            'android:inputType':     inputType,
        };
        if (node.attr('maxlength')) innerAttrs['android:maxLength'] = node.attr('maxlength');
        if (node.attr('value')) innerAttrs['android:text'] = node.attr('value');
        if (isArea && node.text().trim()) innerAttrs['android:text'] = node.text().trim();
        if (node.attr('disabled') !== undefined) innerAttrs['android:enabled'] = 'false';
        if (node.attr('readonly') !== undefined) innerAttrs['android:focusable'] = 'false';
        if (node.attr('required') !== undefined) innerAttrs['android:importantForAutofill'] = 'yes';
        if (node.attr('name')) innerAttrs['android:autofillHints'] = sanitizeResourceName(node.attr('name'), 'field');
        if (node.attr('autocomplete')) innerAttrs['android:autofillHints'] = sanitizeResourceName(node.attr('autocomplete'), 'field');
        if ((node.attr('type') || '').toLowerCase() === 'color' && !innerAttrs['android:autofillHints']) innerAttrs['android:autofillHints'] = 'color';
        if (normalizeStyleValue(node.attr('spellcheck') || '') === 'false') inputType = withInputTypeFlag(inputType, 'textNoSuggestions');
        const autocapitalize = normalizeStyleValue(node.attr('autocapitalize') || '');
        if (autocapitalize === 'characters') inputType = withInputTypeFlag(inputType, 'textCapCharacters');
        else if (autocapitalize === 'words') inputType = withInputTypeFlag(inputType, 'textCapWords');
        else if (autocapitalize === 'sentences') inputType = withInputTypeFlag(inputType, 'textCapSentences');
        const imeOptions = imeActionForEnterKeyHint(node.attr('enterkeyhint'));
        if (imeOptions) innerAttrs['android:imeOptions'] = imeOptions;
        innerAttrs['android:inputType'] = inputType;
        if (isArea) {
            innerAttrs['android:minLines'] = node.attr('rows') || '3';
            innerAttrs['android:gravity']  = 'top|start';
            if (node.attr('cols')) innerAttrs['android:ems'] = node.attr('cols');
        }

        const innerChildren = node.attr('autofocus') !== undefined ? [buildXmlString('requestFocus', {})] : [];
        const transformed = this._applyElementHook(
            node,
            'com.google.android.material.textfield.TextInputLayout',
            outerAttrs,
            { index, depth, styles }
        );

        return buildXmlString(
            transformed.androidTag, transformed.attributes,
            [buildXmlString('com.google.android.material.textfield.TextInputEditText', innerAttrs, innerChildren)]
        );
    }

    // BottomNavigationView from <nav> whose children are all <a> tags
    _buildBottomNav($, node, index, depth, styles) {
        const cleanId = this._nextId(node);
        const menuId  = cleanId.replace('@+id/', '') + '_menu';

        const attrs = {
            'android:layout_width':  'match_parent',
            'android:layout_height': 'wrap_content',
            'android:id':            cleanId,
            'app:menu':              `@menu/${menuId}`,
        };
        this._applyConstraints(attrs, cleanId, index, depth, styles);
        const bgColor = sanitizeColor(styles['background-color'] || '') || extractBackgroundColor(styles['background'] || '');
        if (bgColor) attrs['app:backgroundTint'] = bgColor;

        // Generate menu XML from <a> children
        const items = [];
        const usedMenuItemIds = new Set();
        node.children().each((i, child) => {
            const a    = $(child);
            const text = a.text().trim();
            const safe = makeUniqueResourceName(sanitizeResourceName(text, `item_${i + 1}`), usedMenuItemIds);
            const icon = `ic_nav_${i + 1}`;
            if (!this.drawables[`${icon}.xml`]) this.drawables[`${icon}.xml`] = generateNavigationIcon();
            this._addInteraction({
                type: 'navigation',
                id: `nav_${safe}`,
                containerId: cleanId.replace('@+id/', ''),
                target: a.attr('href') || null,
                label: text || null,
            }, a);
            items.push(buildXmlString('item', {
                'android:id': `@+id/nav_${safe}`,
                'android:title': text,
                'android:icon': `@drawable/${icon}`,
            }));
        });
        this.menus[`${menuId}.xml`] = `<?xml version="1.0" encoding="utf-8"?>\n${buildXmlString('menu', {
            'xmlns:android': 'http://schemas.android.com/apk/res/android',
        }, items)}`;

        const transformed = this._applyElementHook(
            node,
            'com.google.android.material.bottomnavigation.BottomNavigationView',
            attrs,
            { index, depth, styles }
        );
        return buildXmlString(transformed.androidTag, transformed.attributes);
    }

    // CardView from LinearLayout + border-radius + elevation
    _buildCardView(node, index, depth, styles, children, parentStyles, innerTag = 'LinearLayout') {
        const cleanId = this._nextId(node);

        const cardAttrs = {
            'android:layout_width':  (styles['width'] && cssSizeToAndroid(styles['width'])) || 'wrap_content',
            'android:layout_height': (styles['height'] && cssSizeToAndroid(styles['height'])) || 'wrap_content',
            'android:id': cleanId,
        };
        this._applyConstraints(cardAttrs, cleanId, index, depth, styles);
        this._applyHtmlSizing(cardAttrs, node, styles);
        this._applyFlexItemAttrs(cardAttrs, styles, parentStyles);
        this._applyGridItemAttrs(cardAttrs, styles, parentStyles);

        if (styles['border-radius']) cardAttrs['app:cardCornerRadius'] = uniformRadiusValue(parseBorderRadius(styles['border-radius']));
        if (styles['box-shadow']) {
            const elevation = parseBoxShadow(styles['box-shadow']);
            if (elevation) cardAttrs['app:cardElevation'] = elevation;
        }
        else if (styles['z-index'])  cardAttrs['app:cardElevation']    = `${parseInt(styles['z-index'])}dp`;

        const bgColor = sanitizeColor(styles['background-color'] || '');
        if (bgColor) cardAttrs['app:cardBackgroundColor'] = bgColor;
        applyBoxSpacing(cardAttrs, styles, 'margin', 'android:layout_margin');

        const innerAttrs = {
            'android:layout_width':  'match_parent',
            'android:layout_height': 'wrap_content',
        };
        if (innerTag === 'LinearLayout') {
            innerAttrs['android:orientation'] = normalizeStyleValue(styles['flex-direction'] || '') === 'row' ? 'horizontal' : 'vertical';
        }
        applyBoxSpacing(innerAttrs, styles, 'padding', 'android:padding');

        const transformed = this._applyElementHook(
            node,
            'androidx.cardview.widget.CardView',
            cardAttrs,
            { index, depth, styles }
        );
        return buildXmlString(transformed.androidTag, transformed.attributes,
            [buildXmlString(innerTag, innerAttrs, children)]);
    }

    getAndroidAttrs(node, index, depth, androidTag, styles, parentStyles) {
        const attrs = {
            'android:layout_width':  'wrap_content',
            'android:layout_height': 'wrap_content',
        };

        const cleanId = this._nextId(node);
        attrs['android:id'] = cleanId;

        const tag = node.prop('tagName').toLowerCase();
        const inputType = tag === 'input' ? (node.attr('type') || 'text').toLowerCase() : null;
        const isButton  = tag === 'button' || (tag === 'input' && ['submit', 'button', 'reset', 'file'].includes(inputType));

        if (androidTag === 'LinearLayout') {
            attrs['android:orientation'] = flexDirection(styles).startsWith('row') ? 'horizontal' : 'vertical';
        }
        if (androidTag === GRID_LAYOUT_TAG) {
            attrs['android:orientation'] = normalizeStyleValue(styles['grid-auto-flow'] || '').startsWith('column') ? 'vertical' : 'horizontal';
            attrs['android:alignmentMode'] = 'alignMargins';
        }
        if (tag === 'label' && node.attr('for')) attrs['android:labelFor'] = `@id/${sanitizeResourceName(node.attr('for'), this.opts.prefix)}`;

        this._applyConstraints(attrs, cleanId, index, depth, styles);
        this._applyHtmlSizing(attrs, node, styles);
        this._applyFlexItemAttrs(attrs, styles, parentStyles);
        this._applyGridItemAttrs(attrs, styles, parentStyles);
        applyAccessibilityAttrs(attrs, node);

        let bgColor = null, borderRadius = null, strokeColor = null, strokeWidth = null, gradient = null;

        for (const [k, v] of Object.entries(styles)) {
            const normalized = normalizeStyleValue(v);
            switch (k) {
                case 'background-color': bgColor = sanitizeColor(v); break;
                case 'background': {
                    const grad = parseLinearGradient(v);
                    if (grad) gradient = grad; else bgColor = extractBackgroundColor(v);
                    break;
                }
                case 'background-image': {
                    const grad = parseLinearGradient(v);
                    if (grad) gradient = grad;
                    break;
                }
                case 'color': { const c = sanitizeColor(v); if (c) attrs['android:textColor'] = c; break; }
                case 'font-size': {
                    const size = pxToSp(v);
                    if (size) attrs['android:textSize'] = size;
                    break;
                }
                case 'font-weight':
                    if (normalized === 'bold' || parseInt(normalized) >= 600)
                        attrs['android:textStyle'] = attrs['android:textStyle'] ? attrs['android:textStyle'] + '|bold' : 'bold';
                    break;
                case 'font-style':
                    if (normalized === 'italic')
                        attrs['android:textStyle'] = attrs['android:textStyle'] ? attrs['android:textStyle'] + '|italic' : 'italic';
                    break;
                case 'font-family': {
                    const families = v.split(',').map(value => value.replace(/['"]/g, '').trim().toLowerCase());
                    const resourceFamily = families.find(family => this.fontFamilyResources.has(family));
                    const systemFamily = families.find(family => FONT_FAMILY_MAP[family]);
                    attrs['android:fontFamily'] = resourceFamily
                        ? this.fontFamilyResources.get(resourceFamily)
                        : FONT_FAMILY_MAP[systemFamily] || 'sans-serif';
                    break;
                }
                case 'text-align': {
                    const g = { center: 'center', right: 'end', left: 'start', justify: 'fill_horizontal' }[normalized];
                    if (g) attrs['android:gravity'] = g;
                    break;
                }
                case 'text-decoration':
                case 'text-decoration-line': {
                    const flags = [];
                    if (normalized.includes('underline')) flags.push('underline');
                    if (normalized.includes('line-through')) flags.push('strikeThru');
                    if (flags.length) attrs['android:paintFlags'] = flags.join('|');
                    break;
                }
                case 'text-indent':
                    attrs['android:textIndent'] = pxToDp(v);
                    break;
                case 'word-break':
                case 'overflow-wrap':
                    if (['break-word', 'anywhere', 'break-all'].includes(normalized)) attrs['android:breakStrategy'] = 'high_quality';
                    break;
                case 'letter-spacing': {
                    const px = parseFloat(normalized);
                    if (!isNaN(px)) attrs['android:letterSpacing'] = normalized.endsWith('em') ? px.toFixed(3) : (px / 16).toFixed(3);
                    break;
                }
                case 'line-height': {
                    if (normalized === 'normal') break;
                    const n = parseFloat(normalized);
                    if (!isNaN(n)) attrs['android:lineSpacingMultiplier'] = (normalized.endsWith('px') ? n / 16 : n).toFixed(2);
                    break;
                }
                case 'text-overflow':
                    if (normalized === 'ellipsis') { attrs['android:ellipsize'] = 'end'; attrs['android:maxLines'] = attrs['android:maxLines'] || '1'; }
                    break;
                case 'white-space':
                    if (normalized === 'nowrap') { attrs['android:maxLines'] = '1'; attrs['android:ellipsize'] = attrs['android:ellipsize'] || 'end'; }
                    break;
                case '-webkit-line-clamp':
                case 'line-clamp': {
                    const lc = parseInt(normalized);
                    if (!isNaN(lc)) { attrs['android:maxLines'] = String(lc); attrs['android:ellipsize'] = 'end'; }
                    break;
                }
                case 'justify-content': {
                    if (androidTag === FLEXBOX_LAYOUT_TAG) {
                        attrs['app:justifyContent'] = flexEnum(v);
                        break;
                    }
                    if (androidTag !== 'LinearLayout') break;
                    const isRow = flexDirection(styles).startsWith('row');
                    const jg = { 'flex-start': isRow ? 'start' : 'top', 'flex-end': isRow ? 'end' : 'bottom', 'center': isRow ? 'center_horizontal' : 'center_vertical' }[normalized];
                    if (jg) attrs['android:gravity'] = attrs['android:gravity'] ? `${attrs['android:gravity']}|${jg}` : jg;
                    break;
                }
                case 'align-items': {
                    if (androidTag === FLEXBOX_LAYOUT_TAG) {
                        attrs['app:alignItems'] = flexEnum(v);
                        break;
                    }
                    if (androidTag !== 'LinearLayout') break;
                    const isRow = flexDirection(styles).startsWith('row');
                    const ag = { 'flex-start': isRow ? 'top' : 'start', 'flex-end': isRow ? 'bottom' : 'end', 'center': isRow ? 'center_vertical' : 'center_horizontal', 'stretch': 'fill' }[normalized];
                    if (ag) attrs['android:gravity'] = attrs['android:gravity'] ? `${attrs['android:gravity']}|${ag}` : ag;
                    break;
                }
                case 'object-fit':
                    if (androidTag === 'ImageView') {
                        const st = { cover: 'centerCrop', contain: 'centerInside', fill: 'fitXY', 'scale-down': 'centerInside', none: 'center' }[normalized];
                        if (st) attrs['android:scaleType'] = st;
                    }
                    break;
                case 'background-size':
                    if (androidTag === 'ImageView') {
                        const st = { cover: 'centerCrop', contain: 'centerInside', fill: 'fitXY', stretch: 'fitXY' }[normalized];
                        if (st && !attrs['android:scaleType']) attrs['android:scaleType'] = st;
                    }
                    break;
                case 'background-position':
                    if (androidTag === 'ImageView' && normalized.includes('center') && !attrs['android:scaleType']) {
                        attrs['android:scaleType'] = 'center';
                    }
                    break;
                case 'transform': {
                    const t = parseTransform(v);
                    if (t.rotation)     attrs['android:rotation']     = t.rotation;
                    if (t.scaleX)       attrs['android:scaleX']       = t.scaleX;
                    if (t.scaleY)       attrs['android:scaleY']       = t.scaleY;
                    if (t.translationX) attrs['android:translationX'] = t.translationX;
                    if (t.translationY) attrs['android:translationY'] = t.translationY;
                    break;
                }
                case 'cursor':
                    if (normalized === 'pointer') {
                        attrs['android:clickable']  = 'true';
                        attrs['android:focusable']  = 'true';
                        attrs['android:foreground'] = '?attr/selectableItemBackground';
                    }
                    break;
                case 'overflow':
                    if (normalized === 'hidden') { attrs['android:clipChildren'] = 'true'; attrs['android:clipToPadding'] = 'true'; }
                    break;
                case 'padding':      applyBoxSpacing(attrs, styles, 'padding', 'android:padding'); break;
                case 'padding-top':
                case 'padding-bottom':
                case 'padding-left':
                case 'padding-right':
                    applyBoxSpacing(attrs, styles, 'padding', 'android:padding');
                    break;
                case 'margin':       applyBoxSpacing(attrs, styles, 'margin', 'android:layout_margin'); break;
                case 'margin-top':
                case 'margin-bottom':
                case 'margin-left':
                case 'margin-right':
                    applyBoxSpacing(attrs, styles, 'margin', 'android:layout_margin');
                    break;
                case 'width': {
                    const size = cssSizeToAndroid(v);
                    if (size) attrs['android:layout_width'] = size;
                    break;
                }
                case 'height': {
                    const size = cssSizeToAndroid(v);
                    if (size) attrs['android:layout_height'] = size;
                    break;
                }
                case 'min-width': { const size = pxToDp(v); if (size) attrs['android:minWidth'] = size; break; }
                case 'min-height': { const size = pxToDp(v); if (size) attrs['android:minHeight'] = size; break; }
                case 'max-width': { const size = pxToDp(v); if (size) attrs['android:maxWidth'] = size; break; }
                case 'max-height': { const size = pxToDp(v); if (size) attrs['android:maxHeight'] = size; break; }
                case 'flex-direction':
                    if (androidTag === FLEXBOX_LAYOUT_TAG) attrs['app:flexDirection'] = flexEnum(v);
                    else if (androidTag === 'LinearLayout') attrs['android:orientation'] = normalized.startsWith('row') ? 'horizontal' : 'vertical';
                    break;
                case 'flex-wrap':
                    if (androidTag === FLEXBOX_LAYOUT_TAG) attrs['app:flexWrap'] = flexEnum(v);
                    break;
                case 'align-content':
                    if (androidTag === FLEXBOX_LAYOUT_TAG) attrs['app:alignContent'] = flexEnum(v);
                    break;
                case 'grid-template-columns': {
                    const count = gridTrackCount(v);
                    if (androidTag === GRID_LAYOUT_TAG && count) attrs['android:columnCount'] = String(count);
                    break;
                }
                case 'grid-template-rows': {
                    const count = gridTrackCount(v);
                    if (androidTag === GRID_LAYOUT_TAG && count) attrs['android:rowCount'] = String(count);
                    break;
                }
                case 'grid-auto-flow':
                    if (androidTag === GRID_LAYOUT_TAG) attrs['android:orientation'] = normalized.startsWith('column') ? 'vertical' : 'horizontal';
                    break;
                case 'gap':
                case 'row-gap':
                case 'column-gap':
                    if (androidTag === 'LinearLayout') {
                        attrs['android:dividerPadding'] = pxToDp(v);
                        attrs['android:showDividers'] = 'middle';
                    }
                    break;
                case 'opacity': {
                    const alpha = parseFloat(v);
                    if (!isNaN(alpha)) attrs['android:alpha'] = Math.max(0, Math.min(1, alpha)).toFixed(2);
                    break;
                }
                case 'display':     if (normalized === 'none') attrs['android:visibility'] = 'gone'; break;
                case 'visibility':
                    if (normalized === 'hidden') attrs['android:visibility'] = 'invisible';
                    else if (normalized === 'visible') attrs['android:visibility'] = 'visible';
                    break;
                case 'z-index': { const z = parseInt(v); if (!isNaN(z)) attrs['android:elevation'] = `${z}dp`; break; }
                case 'box-shadow': {
                    const elevation = parseBoxShadow(v);
                    if (elevation) attrs['android:elevation'] = elevation;
                    break;
                }
                case 'border-radius': borderRadius = parseBorderRadius(v); break;
                case 'border': {
                    const border = parseBorder(v);
                    if (border.width) strokeWidth = border.width;
                    if (border.color) strokeColor = border.color;
                    break;
                }
                case 'outline': {
                    const outline = parseBorder(v);
                    if (outline.width && !strokeWidth) strokeWidth = outline.width;
                    if (outline.color && !strokeColor) strokeColor = outline.color;
                    break;
                }
                case 'border-top':
                case 'border-right':
                case 'border-bottom':
                case 'border-left': {
                    const sideBorder = parseBorder(v);
                    if (sideBorder.width && !strokeWidth) strokeWidth = sideBorder.width;
                    if (sideBorder.color && !strokeColor) strokeColor = sideBorder.color;
                    break;
                }
                case 'border-color': { const c = sanitizeColor(v); if (c) strokeColor = c; break; }
                case 'border-width': strokeWidth = pxToDp(v); break;
            }
        }

        // Background resolution
        if (isButton) {
            attrs['app:backgroundTint'] = bgColor || '#6200EE';
            if (borderRadius) attrs['app:cornerRadius'] = uniformRadiusValue(borderRadius);
            if (strokeColor)  { attrs['app:strokeColor'] = strokeColor; attrs['app:strokeWidth'] = strokeWidth || '1dp'; }
        } else if (gradient) {
            const key = this._gradientKey(gradient.colors, gradient.angle, borderRadius);
            this.drawables[`${key}.xml`] = generateGradientDrawable({ ...gradient, radius: borderRadius });
            attrs['android:background'] = `@drawable/${key}`;
        } else if (borderRadius || strokeColor) {
            const key = this._shapeKey(bgColor, borderRadius, strokeColor, strokeWidth);
            this.drawables[`${key}.xml`] = generateShapeDrawable({ fillColor: bgColor, radius: borderRadius, strokeColor, strokeWidth });
            attrs['android:background'] = `@drawable/${key}`;
        } else if (bgColor) {
            attrs['android:background'] = bgColor;
        }

        // Text content: containers don't get android:text
        if ((TEXT_TAGS.has(tag) && tag !== 'input') || androidTag === 'TextView') {
            const text = textContentForNode(node);
            const valueText = tag === 'input' ? (node.attr('value') || defaultInputText(inputType)) : null;
            const buttonText = tag === 'button' ? defaultInputText(normalizeStyleValue(node.attr('type') || 'button')) : null;
            const rawText = valueText || text || buttonText;
            const before = this._pseudoText(node, 'before', 'inline')?.text || '';
            const after = this._pseudoText(node, 'after', 'inline')?.text || '';
            const hostText = applyTextTransform(rawText || '', styles['text-transform']);
            if (before || hostText || after) attrs['android:text'] = `${before}${hostText}${after}`;
        } else if (tag === 'input') {
            const text = textContentForNode(node);
            const valueText = node.attr('value') || defaultInputText(inputType);
            const rawText = valueText || text;
            if (rawText) attrs['android:text'] = applyTextTransform(rawText, styles['text-transform']);
        }

        if (['strong', 'b'].includes(tag)) {
            attrs['android:textStyle'] = attrs['android:textStyle'] ? `${attrs['android:textStyle']}|bold` : 'bold';
        }
        if (['em', 'i', 'cite', 'dfn', 'var', 'address', 'blockquote'].includes(tag)) {
            attrs['android:textStyle'] = attrs['android:textStyle'] ? `${attrs['android:textStyle']}|italic` : 'italic';
        }
        if (['code', 'pre', 'kbd', 'samp'].includes(tag)) {
            attrs['android:fontFamily'] = 'monospace';
        }
        if (['u', 'ins'].includes(tag)) {
            attrs['android:paintFlags'] = attrs['android:paintFlags'] ? `${attrs['android:paintFlags']}|underline` : 'underline';
        }
        if (['s', 'del'].includes(tag)) {
            attrs['android:paintFlags'] = attrs['android:paintFlags'] ? `${attrs['android:paintFlags']}|strikeThru` : 'strikeThru';
        }
        if (tag === 'small') {
            attrs['android:textScaleX'] = '0.875';
        }
        if (tag === 'blockquote') {
            attrs['android:paddingLeft'] = attrs['android:paddingLeft'] || '16dp';
        }
        if (tag === 'q' && attrs['android:text']) {
            attrs['android:text'] = `"${attrs['android:text']}"`;
        }
        if (['sup', 'sub'].includes(tag)) {
            attrs['android:textScaleX'] = '0.75';
            attrs['android:textSize'] = attrs['android:textSize'] || '12sp';
        }
        if (tag === 'pre') {
            attrs['android:singleLine'] = 'false';
        }
        if (tag === 'mark') {
            attrs['android:background'] = attrs['android:background'] || '#FFFF00';
        }

        // Tag-specific
        if (tag === 'img') {
            const src = node.attr('src') || firstSrcsetCandidate(node.attr('srcset'));
            let resource = null;
            if (src && !src.startsWith('@')) {
                resource = this.imageResourceBySource.get(src);
                if (!resource) {
                    resource = makeUniqueResourceName(imageResourceName(src), this.usedImageResources);
                    this.imageResourceBySource.set(src, resource);
                    this.assets.images.push({
                        source: src,
                        resource,
                        density: node.attr('data-android-density') || node.attr('data-density') || null,
                    });
                }
            }
            const ref = src.startsWith('@') ? src : resource ? `@drawable/${resource}` : '@drawable/placeholder';
            attrs['android:src'] = ref;
            attrs['android:contentDescription'] = node.attr('alt') || node.attr('aria-label') || node.attr('title') || '';
            if (node.attr('width') || node.attr('height') || styles['width'] || styles['height']) attrs['android:adjustViewBounds'] = 'true';
            if (node.attr('alt') === '') attrs['android:importantForAccessibility'] = 'no';
        }
        if (tag === 'a' && node.attr('href')) {
            const autoLink = autoLinkForHref(node.attr('href'));
            attrs['android:clickable'] = 'true';
            attrs['android:focusable'] = 'true';
            attrs['android:tag'] = node.attr('href');
            if (autoLink) attrs['android:autoLink'] = autoLink;
        }
        if (tag === 'input' && inputType === 'file') {
            const meta = [];
            if (node.attr('accept')) meta.push(`accept=${node.attr('accept')}`);
            if (node.attr('capture')) meta.push(`capture=${node.attr('capture')}`);
            if (node.attr('multiple') !== undefined) meta.push('multiple=true');
            if (meta.length) attrs['android:tag'] = meta.join(';');
            attrs['android:contentDescription'] = attrs['android:contentDescription'] || node.attr('aria-label') || node.attr('title') || 'Choose file';
        }
        if (normalizeStyleValue(node.attr('role') || '') === 'button' || node.attr('onclick')) {
            attrs['android:clickable'] = 'true';
            attrs['android:focusable'] = 'true';
            attrs['android:foreground'] = attrs['android:foreground'] || '?attr/selectableItemBackground';
        }
        if (tag === 'select') {
            attrs['android:layout_width'] = 'match_parent';
            const optionLabels = node.children('option').toArray()
                .map(option => textContentForDomNode(option).trim())
                .filter(Boolean);
            if (optionLabels.length) {
                const arrayName = `${cleanId.replace('@+id/', '')}_entries`;
                attrs['android:entries'] = `@array/${arrayName}`;
                this.arrays[`${arrayName}.xml`] = this._buildStringArray(arrayName, optionLabels);
                this.arraySpecs[arrayName] = optionLabels;
            }
            const selectedIndex = node.children('option').toArray()
                .findIndex(option => option.attribs && option.attribs.selected !== undefined);
            if (selectedIndex >= 0) attrs['android:selectedItemPosition'] = String(selectedIndex);
            if (node.attr('multiple') !== undefined) attrs['android:spinnerMode'] = 'dialog';
            if (node.attr('size')) attrs['android:dropDownHeight'] = `${parseInt(node.attr('size'), 10) || 1}dp`;
        }
        if (tag === 'table') {
            attrs['android:stretchColumns'] = '*';
        }
        if (tag === 'tr') {
            attrs['android:layout_width'] = 'match_parent';
        }
        if (tag === 'th') {
            attrs['android:textStyle'] = attrs['android:textStyle'] ? `${attrs['android:textStyle']}|bold` : 'bold';
            attrs['android:gravity'] = attrs['android:gravity'] || 'center';
        }
        if (['td', 'th'].includes(tag) && node.attr('colspan')) {
            attrs['android:layout_span'] = node.attr('colspan');
        }
        if (['td', 'th'].includes(tag) && node.attr('rowspan')) {
            attrs['android:layout_rowSpan'] = node.attr('rowspan');
        }
        if (['td', 'th'].includes(tag)) {
            const horizontal = { left: 'start', center: 'center_horizontal', right: 'end' }[normalizeStyleValue(node.attr('align') || '')];
            const vertical = { top: 'top', middle: 'center_vertical', center: 'center_vertical', bottom: 'bottom' }[normalizeStyleValue(node.attr('valign') || '')];
            const gravity = [horizontal, vertical].filter(Boolean).join('|');
            if (gravity) attrs['android:gravity'] = attrs['android:gravity'] ? `${attrs['android:gravity']}|${gravity}` : gravity;
            const metadata = [];
            if (node.attr('scope')) metadata.push(`scope=${node.attr('scope')}`);
            if (node.attr('headers')) metadata.push(`headers=${node.attr('headers')}`);
            if (metadata.length) attrs['android:tag'] = metadata.join(';');
        }
        if (tag === 'progress' || tag === 'meter') {
            const max = node.attr('max'), val = node.attr('value');
            if (max || val) { attrs['style'] = '@style/Widget.AppCompat.ProgressBar.Horizontal'; if (max) attrs['android:max'] = max; if (val) attrs['android:progress'] = val; }
        }
        if (tag === 'input' && inputType === 'range') {
            attrs['android:layout_width'] = attrs['android:layout_width'] === 'wrap_content' ? 'match_parent' : attrs['android:layout_width'];
            if (node.attr('min')) attrs['android:min'] = node.attr('min');
            if (node.attr('max')) attrs['android:max'] = node.attr('max');
            if (node.attr('value')) attrs['android:progress'] = node.attr('value');
        }
        if (tag === 'input' && inputType === 'checkbox' && node.attr('checked') !== undefined) attrs['android:checked'] = 'true';
        if (tag === 'input' && inputType === 'radio' && node.attr('checked') !== undefined) attrs['android:checked'] = 'true';
        if (tag === 'input' && ['checkbox', 'radio'].includes(inputType) && node.attr('value')) attrs['android:tag'] = node.attr('value');
        if (node.attr('disabled') !== undefined) attrs['android:enabled'] = 'false';
        if (tag === 'hr') { attrs['android:layout_width'] = 'match_parent'; attrs['android:layout_height'] = '1dp'; if (!attrs['android:background']) attrs['android:background'] = '#CCCCCC'; }
        if (['video', 'audio'].includes(tag)) {
            if (attrs['android:layout_width'] === 'wrap_content') attrs['android:layout_width'] = 'match_parent';
        }
        if (['iframe', 'embed', 'object'].includes(tag)) {
            if (attrs['android:layout_width'] === 'wrap_content') attrs['android:layout_width'] = 'match_parent';
            if (attrs['android:layout_height'] === 'wrap_content') attrs['android:layout_height'] = 'match_parent';
        }
        if (EMBEDDED_MEDIA_TAGS.has(tag)) {
            const source = tag === 'object'
                ? node.attr('data')
                : node.attr('src') || node.children('source').first().attr('src');
            if (source) attrs['android:tag'] = source;
            const description = node.attr('aria-label') || node.attr('title') || textContentForNode(node).trim();
            if (description) attrs['android:contentDescription'] = description;
            this._recordMedia(node, cleanId, tag);
        }
        if (tag === 'input' && ['checkbox', 'radio'].includes(inputType)) { /* label handled by parent */ }

        this._recordInteraction(node, cleanId, tag, inputType);

        return attrs;
    }

    _applyHtmlSizing(attrs, node, styles) {
        if (!styles['width'] && node.attr('width')) {
            attrs['android:layout_width'] = cssSizeToAndroid(node.attr('width'));
        }
        if (!styles['height'] && node.attr('height')) {
            attrs['android:layout_height'] = cssSizeToAndroid(node.attr('height'));
        }
    }

    convertNode($, el, index, depth, parentTag = null, parentNode = null) {
        const node = $(el);
        const tag  = node.prop('tagName')?.toLowerCase();
        if (!tag || ['script','style','link','head','option','source'].includes(tag)) return null;
        if (tag === 'br') {
            return buildXmlString('TextView', {
                'android:layout_width': 'wrap_content',
                'android:layout_height': 'wrap_content',
                'android:text': '\n',
            });
        }

        const styles    = expandInsetStyles(this._getComputedStyles($, node));
        const parentStyles = parentNode ? expandInsetStyles(this._getComputedStyles($, parentNode)) : {};
        this._inspectStyles(node, styles);
        const inputType = tag === 'input' ? (node.attr('type') || 'text').toLowerCase() : null;
        if (tag === 'input' && inputType === 'hidden') return null;

        if (TABLE_SECTION_TAGS.has(tag) || UNWRAP_TAGS.has(tag)) {
            const children = [];
            node.children().each((i, child) => {
                const result = this.convertNode($, child, i, depth, parentTag, parentNode);
                if (result) children.push(result);
            });
            return children.join('\n');
        }

        // Material TextInputLayout for text inputs and textareas
        if ((tag === 'input' && !['checkbox','radio','range','submit','button','reset','file'].includes(inputType)) || tag === 'textarea') {
            return this._buildTextInput(node, index, depth, styles, parentStyles);
        }

        // BottomNavigationView for <nav> whose direct children are all <a> links
        if (tag === 'nav') {
            const children = node.children().toArray();
            const allLinks = children.length > 0 && children.every(c => $(c).prop('tagName')?.toLowerCase() === 'a');
            if (allLinks) return this._buildBottomNav($, node, index, depth, styles);
        }

        const overflowY = normalizeStyleValue(styles['overflow-y'] || '');
        const overflow = normalizeStyleValue(styles['overflow'] || '');
        const needsScroll = ['scroll','auto'].includes(overflowY) || ['scroll','auto'].includes(overflow);
        let androidTag    = getAndroidTag(tag, node, this.customElements);
        const directChildren = (EMBEDDED_MEDIA_TAGS.has(tag) ? [] : node.children().toArray()).map((child, originalIndex) => ({
            child,
            originalIndex,
            styles: expandInsetStyles(this._getComputedStyles($, $(child))),
        }));

        if (androidTag === 'LinearLayout') {
            if (isGridContainer(styles)) androidTag = GRID_LAYOUT_TAG;
            else if (this._usesAdvancedFlex(styles, directChildren.map(item => item.styles))) androidTag = FLEXBOX_LAYOUT_TAG;
        }
        const supportsInlinePseudo = ((TEXT_TAGS.has(tag) && tag !== 'input') || androidTag === 'TextView');
        if (!supportsInlinePseudo && !PSEUDO_CONTAINER_ANDROID_TAGS.has(androidTag)) {
            this._pseudoText(node, 'before', 'unsupported');
            this._pseudoText(node, 'after', 'unsupported');
        }

        const hasOutOfFlowChild = directChildren.some(item => isOutOfFlowPosition(item.styles['position']));

        // CardView: LinearLayout + border-radius + elevation source
        const isCard = androidTag === 'LinearLayout' && !needsScroll &&
            styles['border-radius'] && (styles['box-shadow'] || styles['z-index']);

        // FrameLayout: direct absolute/fixed children are removed from normal flow.
        if (androidTag === 'LinearLayout' && !isCard && hasOutOfFlowChild) {
            androidTag = 'FrameLayout';
        }

        const children = [];
        const orderedChildren = (isFlexContainer(styles) || isGridContainer(styles))
            ? [...directChildren].sort((left, right) => {
                const leftOrder = parseInt(left.styles['order'], 10) || 0;
                const rightOrder = parseInt(right.styles['order'], 10) || 0;
                return leftOrder - rightOrder || left.originalIndex - right.originalIndex;
            })
            : directChildren;
        orderedChildren.forEach((item, i) => {
            const child = item.child;
            const childTag = $(child).prop('tagName')?.toLowerCase();
            if ((TEXT_TAGS.has(tag) || androidTag === 'TextView') && TEXT_TAGS.has(childTag)) return;
            const result = this.convertNode($, child, i, depth + 1, tag, node);
            if (result) children.push(result);
        });
        if (PSEUDO_CONTAINER_ANDROID_TAGS.has(androidTag)) {
            const before = this._buildPseudoTextView(node, 'before');
            const after = this._buildPseudoTextView(node, 'after');
            if (before) children.unshift(before);
            if (after) children.push(after);
        }

        if (isCard) {
            return this._buildCardView(
                node, index, depth, styles, children, parentStyles,
                hasOutOfFlowChild ? 'FrameLayout' : 'LinearLayout'
            );
        }

        const attrs = this.getAndroidAttrs(node, index, depth, androidTag, styles, parentStyles);
        this._applyListItemText(attrs, tag, parentTag, parentNode, index);
        const transformed = this._applyElementHook(node, androidTag, attrs, { index, depth, styles });
        androidTag = transformed.androidTag;

        if (needsScroll) {
            const scrollAttrs = { 'android:fillViewport': 'true' }, innerAttrs = {};
            for (const [k, v] of Object.entries(transformed.attributes)) (SCROLL_OUTER_KEYS.has(k) ? scrollAttrs : innerAttrs)[k] = v;
            innerAttrs['android:layout_width'] = 'match_parent';
            innerAttrs['android:layout_height'] = 'wrap_content';
            return buildXmlString('ScrollView', scrollAttrs, [buildXmlString(androidTag, innerAttrs, children)]);
        }

        return buildXmlString(androidTag, transformed.attributes, children);
    }

    _applyListItemText(attrs, tag, parentTag, parentNode, index) {
        if (tag !== 'li' || !attrs['android:text']) return;

        if (parentTag === 'ol') {
            const start = parseInt(parentNode?.attr('start'), 10);
            const base = Number.isFinite(start) ? start : 1;
            const reversed = parentNode?.attr('reversed') !== undefined;
            const count = parentNode ? parentNode.children('li').length : 0;
            const number = reversed ? base + Math.max(0, count - 1 - index) : base + index;
            attrs['android:text'] = `${number}. ${attrs['android:text']}`;
        } else if (parentTag === 'ul') {
            attrs['android:text'] = `- ${attrs['android:text']}`;
        }
    }

    _buildStringArray(name, values) {
        const items = values
            .map(value => `    <item>${escapeXmlAttribute(value)}</item>`)
            .join('\n');
        return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string-array name="${escapeXmlAttribute(name)}">\n${items}\n    </string-array>\n</resources>`;
    }

    _buildValuesArraysXml() {
        const arrays = Object.entries(this.arraySpecs);
        if (arrays.length === 0) return null;

        const body = arrays.map(([name, values]) => {
            const items = values
                .map(value => `        <item>${escapeXmlAttribute(value)}</item>`)
                .join('\n');
            return `    <string-array name="${escapeXmlAttribute(name)}">\n${items}\n    </string-array>`;
        }).join('\n');

        return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${body}\n</resources>`;
    }

    _extractValueResources(layout, values) {
        const options = this.resourceExtraction;
        if (!options) return { layout, manifest: null };

        const documents = [
            { type: 'layout', key: null, xml: layout },
            ...Object.entries(this.drawables).map(([key, xml]) => ({ type: 'drawable', key, xml })),
            ...Object.entries(this.menus).map(([key, xml]) => ({ type: 'menu', key, xml })),
        ];
        const counts = {
            colors: new Map(),
            dimensions: new Map(),
            strings: new Map(),
        };
        const attributePattern = /([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)="([^"]*)"/g;
        for (const document of documents) {
            document.xml.replace(attributePattern, (match, attribute, value) => {
                const type = extractedValueType(attribute, value, options);
                if (type) counts[type].set(value, (counts[type].get(value) || 0) + 1);
                return match;
            });
        }

        const names = { colors: new Map(), dimensions: new Map(), strings: new Map() };
        const usedNames = { colors: new Set(), dimensions: new Set(), strings: new Set() };
        for (const [type, valuesByCount] of Object.entries(counts)) {
            for (const [value, count] of valuesByCount) {
                if (count < options.minOccurrences) continue;
                let baseName;
                if (type === 'colors') {
                    baseName = `sl_color_${value.slice(1).toLowerCase()}`;
                } else if (type === 'dimensions') {
                    baseName = `sl_dimen_${value.toLowerCase().replace(/^-/, 'neg_').replace(/\./g, '_')}`;
                } else {
                    const textName = sanitizeResourceName(value.replace(/&[a-z0-9#]+;/gi, ' '), 'text').slice(0, 48);
                    baseName = `sl_string_${textName}`;
                }
                names[type].set(value, makeUniqueResourceName(baseName, usedNames[type]));
            }
        }

        const resourceType = { colors: 'color', dimensions: 'dimen', strings: 'string' };
        const rewrite = xml => xml.replace(attributePattern, (match, attribute, value) => {
            const type = extractedValueType(attribute, value, options);
            const name = type && names[type].get(value);
            return name ? `${attribute}="@${resourceType[type]}/${name}"` : match;
        });
        for (const document of documents) {
            document.xml = rewrite(document.xml);
            if (document.type === 'layout') layout = document.xml;
            else if (document.type === 'drawable') this.drawables[document.key] = document.xml;
            else this.menus[document.key] = document.xml;
        }

        const manifest = { colors: {}, dimensions: {}, strings: {} };
        const fileSpecs = {
            colors: ['colors.xml', 'color'],
            dimensions: ['dimens.xml', 'dimen'],
            strings: ['strings.xml', 'string'],
        };
        for (const [type, valueNames] of Object.entries(names)) {
            const entries = [...valueNames.entries()];
            for (const [value, name] of entries) manifest[type][name] = value;
            if (!entries.length) continue;
            const [filename, element] = fileSpecs[type];
            const body = entries
                .map(([value, name]) => `    <${element} name="${name}">${value}</${element}>`)
                .join('\n');
            values[filename] = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${body}\n</resources>`;
        }
        return { layout, manifest };
    }

    convert(html, options = {}) {
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('convert options must be an object.');
        }
        if (options.strict !== undefined && typeof options.strict !== 'boolean') {
            throw new TypeError('strict must be a boolean.');
        }
        const $ = cheerio.load(html);
        this.warnings = [];
        this.warningKeys = new Set();
        this.inspectedStyleElements = new WeakSet();
        const stylesheetSources = normalizeStylesheetSources(options.stylesheets);
        const fontSources = normalizeFontSources(options.fontSources);
        const mediaProfile = normalizeMediaProfile(options.media);
        this.fontFaceDeclarations = [];
        this.stylesheetRules = this._collectStylesheetRules($, stylesheetSources, mediaProfile);
        this.computedStyleCache = new WeakMap();
        this.pseudoStyleCache = new WeakMap();
        const body     = $('body').length ? $('body') : $.root();
        const usesTools = /<img/i.test(html);
        const rootAttrs = {
            'xmlns:android': 'http://schemas.android.com/apk/res/android',
            'xmlns:app':     'http://schemas.android.com/apk/res-auto',
            'android:layout_width':  'match_parent',
            'android:layout_height': 'match_parent',
            'android:padding': this.opts.defaultPadding,
        };
        if (usesTools) rootAttrs['xmlns:tools'] = 'http://schemas.android.com/tools';

        this.idCount        = 0;
        this.lastTopLevelId = null;
        this.usedIds        = new Set();
        this.drawables      = {};
        this.menus          = {};
        this.arrays         = {};
        this.arraySpecs     = {};
        this.assets         = { images: [], fonts: [] };
        this.fonts          = {};
        this.fontFamilyResources = new Map();
        this.usedFontResources = new Set();
        this.interactions   = [];
        this.media          = [];
        this.usedImageResources = new Set();
        this.imageResourceBySource = new Map();
        this.elementIds = new WeakMap();
        this.referenceTextById = new Map();
        this._prepareFonts(fontSources);
        $('[id]').each((_, element) => {
            const node = $(element);
            this.referenceTextById.set(node.attr('id'), textContentForNode(node).trim());
        });
        const content = [];
        body.children().each((i, el) => {
            const converted = this.convertNode($, el, i, 0);
            if (converted) content.push(converted);
        });

        let layout = `<?xml version="1.0" encoding="utf-8"?>\n${buildXmlString('androidx.constraintlayout.widget.ConstraintLayout', rootAttrs, content)}`;
        const values = {};
        const arraysXml = this._buildValuesArraysXml();
        if (arraysXml) values['arrays.xml'] = arraysXml;
        const extraction = this._extractValueResources(layout, values);
        layout = extraction.layout;
        const forms = this._collectForms($);
        let result = {
            layout,
            drawables: this.drawables,
            menus: this.menus,
            arrays: this.arrays,
            values,
            fonts: this.fonts,
            resources: {
                drawables: this.drawables,
                menus: this.menus,
                values,
                fonts: this.fonts,
            },
            assets: this.assets,
            interactions: this.interactions,
            forms,
            media: this.media,
            extractedResources: extraction.manifest,
            warnings: this.warnings,
        };
        if (this.hooks.result) {
            const returned = this.hooks.result(result);
            if (returned !== undefined) result = returned;
            if (!result || typeof result !== 'object' || Array.isArray(result)) {
                throw new TypeError('hooks.result must return a conversion result or undefined.');
            }
        }
        if (options.strict && this.warnings.length) {
            const error = new Error(`ShiftLayout strict conversion failed with ${this.warnings.length} warning(s).`);
            error.name = 'ShiftLayoutConversionError';
            error.warnings = [...this.warnings];
            throw error;
        }
        return result;
    }
}

module.exports = ShiftLayout;
