const { COLOR_MAP } = require('./constants');

function parseStyle(styleStr) {
    const styles = {};
    styleStr.split(';').forEach(pair => {
        const colonIdx = pair.indexOf(':');
        if (colonIdx === -1) return;
        const k = pair.slice(0, colonIdx).trim().toLowerCase();
        const v = pair.slice(colonIdx + 1).trim();
        if (k && v) styles[k] = v;
    });
    return styles;
}

function sanitizeColor(val) {
    if (!val) return null;
    const clean = val.trim().toLowerCase();
    if (COLOR_MAP[clean]) return COLOR_MAP[clean];

    // rgb(r, g, b)
    const rgbMatch = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(clean);
    if (rgbMatch) {
        const [, r, g, b] = rgbMatch;
        return '#' + [r, g, b].map(n => parseInt(n).toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    // rgba(r, g, b, a) — Android uses #AARRGGBB
    const rgbaMatch = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(clean);
    if (rgbaMatch) {
        const [, r, g, b, a] = rgbaMatch;
        const alpha = Math.round(parseFloat(a) * 255).toString(16).padStart(2, '0').toUpperCase();
        const rgb = [r, g, b].map(n => parseInt(n).toString(16).padStart(2, '0').toUpperCase()).join('');
        return `#${alpha}${rgb}`;
    }

    if (!clean.startsWith('#')) return null;
    const hex = val.replace('#', '').toUpperCase();
    return '#' + (hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex);
}

function pxToDp(val) {
    return String(val).replace(/(\d+\.?\d*)\s*px/g, (_, n) => `${n}dp`);
}

function pxToSp(val) {
    return String(val).replace(/(\d+\.?\d*)\s*px/g, (_, n) => `${n}sp`);
}

function parseBoxShadow(val) {
    const nums = [...val.matchAll(/(\d+\.?\d*)\s*px/g)].map(m => parseFloat(m[1]));
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
    const rgbaMatch = /rgba?\([^)]+\)/.exec(part);
    if (rgbaMatch) return sanitizeColor(rgbaMatch[0]);
    const hexMatch = /#[0-9A-Fa-f]{3,8}/.exec(part);
    if (hexMatch) return sanitizeColor(hexMatch[0]);
    return sanitizeColor(part.split(/\s+/)[0]);
}

function parseLinearGradient(val) {
    const match = /linear-gradient\((.+)\)$/i.exec(val.trim());
    if (!match) return null;

    const parts = splitGradientParts(match[1]);
    if (parts.length < 2) return null;

    // Android gradient angle: 0=left→right, 90=bottom→top, 180=right→left, 270=top→bottom
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
                // CSS angle to Android: Android = (450 - CSS) % 360, snapped to 45°
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
    if (radius) lines.push(`    <corners android:radius="${radius}" />`);
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
    if (radius) lines.push(`    <corners android:radius="${radius}" />`);
    lines.push('</shape>');
    return lines.join('\n');
}

function buildXmlString(name, attrs, children = []) {
    const attrLines = Object.entries(attrs).map(([k, v]) => `    ${k}="${v}"`).join('\n');
    const openTag = `<${name}\n${attrLines}`;
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
    parseStyle, sanitizeColor, pxToDp, pxToSp,
    parseBoxShadow, parseLinearGradient, parseTransform,
    generateShapeDrawable, generateGradientDrawable,
    buildXmlString,
};
