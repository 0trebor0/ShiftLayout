const { COLOR_MAP } = require('./constants');

function parseStyle(styleStr) {
    const styles = {};
    const declarations = [];
    let current = '';
    let depth = 0;
    let quote = null;
    let inComment = false;
    const input = String(styleStr);

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        const next = input[i + 1];

        if (inComment) {
            if (ch === '*' && next === '/') {
                inComment = false;
                i++;
            }
        } else if (!quote && ch === '/' && next === '*') {
            inComment = true;
            i++;
        } else if (quote) {
            current += ch;
            if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            current += ch;
        } else if (ch === '(') {
            depth++;
            current += ch;
        } else if (ch === ')') {
            depth = Math.max(0, depth - 1);
            current += ch;
        } else if (ch === ';' && depth === 0) {
            declarations.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) declarations.push(current);

    declarations.forEach(declaration => {
        const colonIdx = declaration.indexOf(':');
        if (colonIdx === -1) return;
        const k = declaration.slice(0, colonIdx).trim().toLowerCase();
        const v = declaration.slice(colonIdx + 1).trim().replace(/\s*!important\s*$/i, '').trim();
        if (k && v) styles[k] = v;
    });
    return styles;
}

function normalizeStyleValue(value) {
    return String(value).trim().toLowerCase();
}

function escapeXmlAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r\n|\r|\n/g, '&#10;');
}

function sanitizeResourceName(value, fallback = 'sl_resource') {
    const sanitized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    const name = sanitized || fallback;
    return /^[a-z]/.test(name) ? name : `${fallback}_${name}`;
}

function makeUniqueResourceName(baseName, usedNames) {
    let name = baseName;
    let suffix = 2;

    while (usedNames.has(name)) {
        name = `${baseName}_${suffix++}`;
    }

    usedNames.add(name);
    return name;
}

function resourceNameFromPath(value, fallback = 'placeholder') {
    const withoutQuery = String(value || '').split(/[?#]/)[0];
    const filename = withoutQuery.split('/').pop().replace(/\.[^.]+$/, '');
    return sanitizeResourceName(filename, fallback);
}

function sanitizeColor(val) {
    if (!val) return null;
    const clean = resolveCssVarFallback(val).trim().toLowerCase();
    if (COLOR_MAP[clean]) return COLOR_MAP[clean];

    // rgb(r, g, b)
    const rgbMatch = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(clean);
    if (rgbMatch) {
        const [, r, g, b] = rgbMatch;
        return '#' + [r, g, b].map(toHexByte).join('');
    }

    // rgba(r, g, b, a) - Android uses #AARRGGBB
    const rgbaMatch = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(clean);
    if (rgbaMatch) {
        const [, r, g, b, a] = rgbaMatch;
        const alpha = toAlphaHex(a);
        const rgb = [r, g, b].map(toHexByte).join('');
        return `#${alpha}${rgb}`;
    }

    const hslMatch = /^hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/.exec(clean);
    if (hslMatch) {
        const [, h, s, l] = hslMatch;
        return '#' + hslToRgb(h, s, l).map(toHexByte).join('');
    }

    const hslaMatch = /^hsla\(\s*(-?\d+(?:\.\d+)?)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)\s*\)$/.exec(clean);
    if (hslaMatch) {
        const [, h, s, l, a] = hslaMatch;
        const alpha = toAlphaHex(a);
        const rgb = hslToRgb(h, s, l).map(toHexByte).join('');
        return `#${alpha}${rgb}`;
    }

    if (!clean.startsWith('#')) return null;
    const hex = clean.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;

    if (hex.length === 3) {
        return `#${hex.split('').map(c => c + c).join('').toUpperCase()}`;
    }
    if (hex.length === 4) {
        const [r, g, b, a] = hex.split('').map(c => c + c);
        return `#${(a + r + g + b).toUpperCase()}`;
    }
    if (hex.length === 6) {
        return `#${hex.toUpperCase()}`;
    }
    if (hex.length === 8) {
        const rrggbb = hex.slice(0, 6);
        const aa = hex.slice(6);
        return `#${(aa + rrggbb).toUpperCase()}`;
    }

    return null;
}

function resolveCssVarFallback(value) {
    const match = /^var\(\s*--[\w-]+\s*,\s*(.+)\)$/i.exec(String(value || '').trim());
    return match ? match[1].trim() : String(value || '');
}

function toHexByte(value) {
    const n = Math.max(0, Math.min(255, parseInt(value, 10) || 0));
    return n.toString(16).padStart(2, '0').toUpperCase();
}

function toAlphaHex(value) {
    const n = Math.max(0, Math.min(1, parseFloat(value) || 0));
    return Math.round(n * 255).toString(16).padStart(2, '0').toUpperCase();
}

function hslToRgb(hue, saturation, lightness) {
    const h = ((((parseFloat(hue) || 0) % 360) + 360) % 360) / 360;
    const s = Math.max(0, Math.min(100, parseFloat(saturation) || 0)) / 100;
    const l = Math.max(0, Math.min(100, parseFloat(lightness) || 0)) / 100;

    if (s === 0) {
        const gray = Math.round(l * 255);
        return [gray, gray, gray];
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [h + 1 / 3, h, h - 1 / 3].map(t => {
        let channel = t;
        if (channel < 0) channel += 1;
        if (channel > 1) channel -= 1;
        if (channel < 1 / 6) return Math.round((p + (q - p) * 6 * channel) * 255);
        if (channel < 1 / 2) return Math.round(q * 255);
        if (channel < 2 / 3) return Math.round((p + (q - p) * (2 / 3 - channel) * 6) * 255);
        return Math.round(p * 255);
    });
}

function pxToDp(val) {
    const value = String(val).trim();
    if (/^-?\d+(\.\d+)?$/.test(value)) return `${value}dp`;
    return value
        .replace(/(-?\d+\.?\d*)\s*px/g, (_, n) => `${n}dp`)
        .replace(/(-?\d+\.?\d*)\s*rem/g, (_, n) => `${trimNumber(parseFloat(n) * 16)}dp`)
        .replace(/(-?\d+\.?\d*)\s*em/g, (_, n) => `${trimNumber(parseFloat(n) * 16)}dp`);
}

function pxToSp(val) {
    const value = String(val).trim();
    if (/^-?\d+(\.\d+)?$/.test(value)) return `${value}sp`;
    return value
        .replace(/(-?\d+\.?\d*)\s*px/g, (_, n) => `${n}sp`)
        .replace(/(-?\d+\.?\d*)\s*rem/g, (_, n) => `${trimNumber(parseFloat(n) * 16)}sp`)
        .replace(/(-?\d+\.?\d*)\s*em/g, (_, n) => `${trimNumber(parseFloat(n) * 16)}sp`);
}

function trimNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, '');
}

function cssSizeToAndroid(val) {
    const size = normalizeStyleValue(val);
    if (size === '100%') return 'match_parent';
    if (size === 'auto') return 'wrap_content';
    if (/^\d+(\.\d+)?$/.test(size)) return `${size}dp`;
    return pxToDp(size);
}

function expandBoxValues(val) {
    const parts = String(val).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;

    const [top, right = top, bottom = top, left = right] = parts;
    return {
        top: pxToDp(top),
        right: pxToDp(right),
        bottom: pxToDp(bottom),
        left: pxToDp(left),
    };
}

function splitCssTokens(value) {
    const tokens = [];
    let current = '';
    let depth = 0;
    let quote = null;

    for (const ch of String(value)) {
        if (quote) {
            current += ch;
            if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            current += ch;
        } else if (ch === '(') {
            depth++;
            current += ch;
        } else if (ch === ')') {
            depth = Math.max(0, depth - 1);
            current += ch;
        } else if (/\s/.test(ch) && depth === 0) {
            if (current.trim()) tokens.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }

    if (current.trim()) tokens.push(current.trim());
    return tokens;
}

function parseBorder(value) {
    const result = {};
    const styleNames = new Set(['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']);

    for (const token of splitCssTokens(value)) {
        const normalized = normalizeStyleValue(token);
        if (normalized === 'none' || normalized === 'hidden') {
            return {};
        }
        if (styleNames.has(normalized)) {
            result.style = normalized;
        } else if (/^\d/.test(normalized)) {
            result.width = pxToDp(token);
        } else {
            const color = sanitizeColor(token);
            if (color) result.color = color;
        }
    }

    return result;
}

function extractBackgroundColor(value) {
    for (const token of splitCssTokens(value)) {
        const color = sanitizeColor(token);
        if (color) return color;
    }

    const functionColor = /rgba?\([^)]+\)/i.exec(String(value));
    return functionColor ? sanitizeColor(functionColor[0]) : null;
}

function parseBorderRadius(value) {
    const radiusValue = String(value).split('/')[0].trim();
    const parts = splitCssTokens(radiusValue).map(pxToDp);
    if (parts.length === 0) return null;

    const [topLeft, topRight = topLeft, bottomRight = topLeft, bottomLeft = topRight] = parts;
    return { topLeft, topRight, bottomRight, bottomLeft };
}

function isUniformRadius(radius) {
    if (!radius || typeof radius === 'string') return true;
    return new Set([radius.topLeft, radius.topRight, radius.bottomRight, radius.bottomLeft]).size === 1;
}

function radiusToKey(radius) {
    if (!radius) return '0';
    if (typeof radius === 'string') return radius.replace(/\D/g, '') || '0';
    if (isUniformRadius(radius)) return radius.topLeft.replace(/\D/g, '') || '0';
    return [radius.topLeft, radius.topRight, radius.bottomRight, radius.bottomLeft]
        .map(v => (v || '0').replace(/\D/g, '') || '0')
        .join('_');
}

function uniformRadiusValue(radius) {
    if (!radius) return null;
    if (typeof radius === 'string') return radius;
    return radius.topLeft;
}

function parseBoxShadow(val) {
    const normalized = normalizeStyleValue(val || '');
    if (!normalized || normalized === 'none' || normalized.includes('inset')) return null;

    const nums = [...String(val).matchAll(/(-?\d+\.?\d*)\s*px/g)].map(m => Math.abs(parseFloat(m[1])));
    const elevation = nums[2] ?? nums[1] ?? nums[0] ?? 4;
    return `${Math.round(elevation)}dp`;
}

// Splits a comma-separated list while respecting parentheses (e.g. rgba(...))
function splitGradientParts(inner) {
    const parts = [];
    let depth = 0, current = '';
    for (const ch of inner) {
        if (ch === '(') { depth++; current += ch; }
        else if (ch === ')') { depth--; current += ch; }
        else if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; }
        else { current += ch; }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}

function extractGradientColor(part) {
    const colorFunctionMatch = /(rgba?|hsla?)\([^)]+\)/i.exec(part);
    if (colorFunctionMatch) return sanitizeColor(colorFunctionMatch[0]);
    const hexMatch = /#[0-9A-Fa-f]{3,8}/.exec(part);
    if (hexMatch) return sanitizeColor(hexMatch[0]);
    return sanitizeColor(part.split(/\s+/)[0]);
}

function parseLinearGradient(val) {
    const match = /linear-gradient\((.+)\)$/i.exec(val.trim());
    if (!match) return null;

    const parts = splitGradientParts(match[1]);
    if (parts.length < 2) return null;

    // Android gradient angle: 0=left to right, 90=bottom to top, 180=right to left, 270=top to bottom
    let angle = 270;
    let colorStart = 0;
    const first = parts[0].toLowerCase().trim();

    if (first.includes('to ') || /\d+(deg|turn|rad)/.test(first)) {
        if      (first.includes('to bottom'))      angle = 270;
        else if (first.includes('to right'))       angle = 0;
        else if (first.includes('to top'))         angle = 90;
        else if (first.includes('to left'))        angle = 180;
        else {
            const deg = parseFloat(first);
            if (!isNaN(deg)) {
                // CSS angle to Android: Android = (450 - CSS) % 360, snapped to 45 degrees
                const raw = ((450 - deg) % 360 + 360) % 360;
                angle = Math.round(raw / 45) * 45 % 360;
            }
        }
        colorStart = 1;
    }

    const colors = parts.slice(colorStart).map(extractGradientColor).filter(Boolean);
    return colors.length >= 2 ? { angle, colors } : null;
}

function generateShapeDrawable({ fillColor, radius, strokeColor, strokeWidth }) {
    const lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">',
    ];
    lines.push(`    <solid android:color="${fillColor || '@android:color/transparent'}" />`);
    appendCorners(lines, radius);
    if (strokeColor) lines.push(`    <stroke android:width="${strokeWidth || '1dp'}" android:color="${strokeColor}" />`);
    lines.push('</shape>');
    return lines.join('\n');
}

function generateGradientDrawable({ angle, colors, radius }) {
    const lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">',
        '    <gradient',
        `        android:startColor="${colors[0]}"`,
    ];
    if (colors.length === 3) lines.push(`        android:centerColor="${colors[1]}"`);
    lines.push(`        android:endColor="${colors[colors.length - 1]}"`);
    lines.push(`        android:angle="${angle}" />`);
    appendCorners(lines, radius);
    lines.push('</shape>');
    return lines.join('\n');
}

function appendCorners(lines, radius) {
    if (!radius) return;

    if (typeof radius === 'string' || isUniformRadius(radius)) {
        lines.push(`    <corners android:radius="${uniformRadiusValue(radius)}" />`);
        return;
    }

    lines.push('    <corners');
    lines.push(`        android:topLeftRadius="${radius.topLeft}"`);
    lines.push(`        android:topRightRadius="${radius.topRight}"`);
    lines.push(`        android:bottomRightRadius="${radius.bottomRight}"`);
    lines.push(`        android:bottomLeftRadius="${radius.bottomLeft}" />`);
}

function buildXmlString(name, attrs, children = []) {
    const attrLines = Object.entries(attrs)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `    ${k}="${escapeXmlAttribute(v)}"`)
        .join('\n');
    const openTag = attrLines ? `<${name}\n${attrLines}` : `<${name}`;
    if (children.length === 0) return `${openTag} />`;
    const indentedChildren = children.join('\n').split('\n').map(l => '    ' + l).join('\n');
    return `${openTag}>\n${indentedChildren}\n</${name}>`;
}

function parseTransform(val) {
    const result = {};
    const rotate  = /rotate\(([-\d.]+)deg\)/.exec(val);
    if (rotate) result.rotation = parseFloat(rotate[1]).toFixed(1);
    const scaleXY = /\bscale\(([\d.]+)(?:,\s*([\d.]+))?\)/.exec(val);
    if (scaleXY) { result.scaleX = scaleXY[1]; result.scaleY = scaleXY[2] || scaleXY[1]; }
    const scaleX  = /scaleX\(([\d.]+)\)/.exec(val);
    if (scaleX) result.scaleX = scaleX[1];
    const scaleY  = /scaleY\(([\d.]+)\)/.exec(val);
    if (scaleY) result.scaleY = scaleY[1];
    const tx = /translateX\(([-\d.]+)px\)/.exec(val);
    if (tx) result.translationX = `${tx[1]}dp`;
    const ty = /translateY\(([-\d.]+)px\)/.exec(val);
    if (ty) result.translationY = `${ty[1]}dp`;
    return result;
}

module.exports = {
    parseStyle, normalizeStyleValue, escapeXmlAttribute, sanitizeResourceName,
    makeUniqueResourceName,
    resourceNameFromPath,
    sanitizeColor, pxToDp, pxToSp, cssSizeToAndroid, expandBoxValues,
    splitCssTokens, parseBorder, extractBackgroundColor, parseBorderRadius, radiusToKey, uniformRadiusValue,
    parseBoxShadow, parseLinearGradient, parseTransform,
    generateShapeDrawable, generateGradientDrawable,
    buildXmlString,
};
