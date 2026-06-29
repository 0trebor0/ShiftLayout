const cheerio = require('cheerio');
const { buildXmlString, parseStyle, sanitizeColor, sanitizeResourceName } = require('./utils');

const PRESENTATION_ATTRIBUTES = [
    'color', 'fill', 'fill-opacity', 'fill-rule', 'opacity', 'stroke',
    'stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-miterlimit', 'display',
];

function svgToVector(svgText, options = {}) {
    const warnings = [];
    const $ = cheerio.load(String(svgText || ''), { xmlMode: true }, false);
    const root = $('svg').first();
    if (!root.length) return { xml: null, warnings: [warning('invalid-svg', 'SVG root element was not found.')] };
    if (root.find('script, foreignObject, image, use').length) {
        warnings.push(warning('unsupported-svg-content', 'Active, external, or embedded SVG content was omitted.'));
    }

    const viewBox = parseNumberList(root.attr('viewBox'));
    const width = svgDimension(root.attr('width')) || viewBox[2];
    const height = svgDimension(root.attr('height')) || viewBox[3];
    const viewportWidth = viewBox.length === 4 ? viewBox[2] : width;
    const viewportHeight = viewBox.length === 4 ? viewBox[3] : height;
    if (!(width > 0 && height > 0 && viewportWidth > 0 && viewportHeight > 0)) {
        return { xml: null, warnings: [warning('invalid-svg-size', 'SVG width, height, or viewBox dimensions are missing or invalid.')] };
    }

    const rootStyle = presentationStyle(root, { fill: 'black', stroke: 'none', opacity: '1' });
    let children = convertChildren($, root, rootStyle, warnings);
    if (viewBox.length === 4 && (viewBox[0] !== 0 || viewBox[1] !== 0) && children.length) {
        children = [buildXmlString('group', {
            'android:translateX': trimNumber(-viewBox[0]),
            'android:translateY': trimNumber(-viewBox[1]),
        }, children)];
    }
    if (!children.length) {
        warnings.push(warning('empty-vector', 'SVG contained no supported visible geometry.'));
        return { xml: null, warnings };
    }

    const attrs = {
        'xmlns:android': 'http://schemas.android.com/apk/res/android',
        'android:width': `${trimNumber(width)}dp`,
        'android:height': `${trimNumber(height)}dp`,
        'android:viewportWidth': trimNumber(viewportWidth),
        'android:viewportHeight': trimNumber(viewportHeight),
    };
    if (options.autoMirrored) attrs['android:autoMirrored'] = 'true';
    return {
        xml: `<?xml version="1.0" encoding="utf-8"?>\n${buildXmlString('vector', attrs, children)}`,
        warnings,
    };
}

function convertChildren($, parent, inheritedStyle, warnings) {
    const children = [];
    parent.children().each((_, element) => {
        const node = $(element);
        const tag = node.prop('tagName')?.toLowerCase();
        if (['title', 'desc', 'metadata'].includes(tag)) return;
        if (['defs', 'style', 'lineargradient', 'radialgradient', 'pattern', 'clippath', 'mask', 'filter'].includes(tag)) {
            warnings.push(warning('unsupported-svg-element', `SVG <${tag}> is not converted.`));
            return;
        }
        if (['script', 'foreignobject', 'image', 'use'].includes(tag)) return;

        const style = presentationStyle(node, inheritedStyle);
        if (String(style.display).toLowerCase() === 'none') return;
        let converted = null;
        if (tag === 'g' || tag === 'svg') {
            const groupChildren = convertChildren($, node, style, warnings);
            if (groupChildren.length) converted = buildXmlString('group', groupAttrs(node, warnings), groupChildren);
        } else {
            const pathData = geometryPath(tag, node);
            if (pathData) converted = buildXmlString('path', pathAttrs(node, style, pathData, warnings));
            else if (!['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(tag)) {
                warnings.push(warning('unsupported-svg-element', `SVG <${tag}> is not converted.`));
            }
        }
        if (!converted) return;

        const transform = transformAttrs(node.attr('transform'), warnings);
        if (Object.keys(transform).length) converted = buildXmlString('group', transform, [converted]);
        children.push(converted);
    });
    return children;
}

function presentationStyle(node, inherited) {
    const style = { ...inherited };
    let ownOpacity = 1;
    for (const attribute of PRESENTATION_ATTRIBUTES) {
        if (node.attr(attribute) !== undefined) {
            style[attribute] = node.attr(attribute);
            if (attribute === 'opacity') ownOpacity = number(node.attr(attribute), 1);
        }
    }
    const inlineStyle = parseStyle(node.attr('style') || '');
    Object.assign(style, inlineStyle);
    if (inlineStyle.opacity !== undefined) ownOpacity = number(inlineStyle.opacity, 1);
    style.opacity = String(ownOpacity * number(inherited.opacity, 1));
    return style;
}

function pathAttrs(node, style, pathData, warnings) {
    const attrs = { 'android:pathData': pathData };
    if (node.attr('id')) attrs['android:name'] = sanitizeResourceName(node.attr('id'), 'path');
    const currentColor = color(style.color, '#000000');
    const fill = style.fill === 'currentColor' ? currentColor : color(style.fill, null);
    const stroke = style.stroke === 'currentColor' ? currentColor : color(style.stroke, null);
    if (fill) attrs['android:fillColor'] = fill;
    if (stroke) {
        attrs['android:strokeColor'] = stroke;
        attrs['android:strokeWidth'] = trimNumber(number(style['stroke-width'], 1));
    }
    const fillAlpha = alpha(style.opacity, style['fill-opacity']);
    const strokeAlpha = alpha(style.opacity, style['stroke-opacity']);
    if (fill && fillAlpha < 1) attrs['android:fillAlpha'] = trimNumber(fillAlpha);
    if (stroke && strokeAlpha < 1) attrs['android:strokeAlpha'] = trimNumber(strokeAlpha);
    if (['evenodd', 'even-odd'].includes(String(style['fill-rule']).toLowerCase())) attrs['android:fillType'] = 'evenOdd';
    if (['round', 'square', 'butt'].includes(style['stroke-linecap'])) attrs['android:strokeLineCap'] = style['stroke-linecap'];
    if (['round', 'bevel', 'miter'].includes(style['stroke-linejoin'])) attrs['android:strokeLineJoin'] = style['stroke-linejoin'];
    if (style['stroke-miterlimit']) attrs['android:strokeMiterLimit'] = trimNumber(number(style['stroke-miterlimit'], 4));
    if (node.attr('stroke-dasharray')) warnings.push(warning('unsupported-svg-style', 'Dashed SVG strokes are not supported by VectorDrawable paths.'));
    if ((style.fill && String(style.fill).startsWith('url(')) || (style.stroke && String(style.stroke).startsWith('url('))) {
        warnings.push(warning('unsupported-svg-paint', 'SVG gradient or pattern paint references are not converted.'));
    }
    return attrs;
}

function geometryPath(tag, node) {
    if (tag === 'path') return node.attr('d')?.trim() || null;
    if (tag === 'rect') {
        const x = number(node.attr('x')), y = number(node.attr('y'));
        const width = number(node.attr('width')), height = number(node.attr('height'));
        if (!(width > 0 && height > 0)) return null;
        const rx = Math.min(number(node.attr('rx') || node.attr('ry')), width / 2);
        const ry = Math.min(number(node.attr('ry') || node.attr('rx')), height / 2);
        if (rx > 0 && ry > 0) {
            return `M${n(x + rx)},${n(y)} H${n(x + width - rx)} A${n(rx)},${n(ry)} 0 0,1 ${n(x + width)},${n(y + ry)} V${n(y + height - ry)} A${n(rx)},${n(ry)} 0 0,1 ${n(x + width - rx)},${n(y + height)} H${n(x + rx)} A${n(rx)},${n(ry)} 0 0,1 ${n(x)},${n(y + height - ry)} V${n(y + ry)} A${n(rx)},${n(ry)} 0 0,1 ${n(x + rx)},${n(y)} Z`;
        }
        return `M${n(x)},${n(y)} H${n(x + width)} V${n(y + height)} H${n(x)} Z`;
    }
    if (tag === 'circle' || tag === 'ellipse') {
        const cx = number(node.attr('cx')), cy = number(node.attr('cy'));
        const rx = tag === 'circle' ? number(node.attr('r')) : number(node.attr('rx'));
        const ry = tag === 'circle' ? rx : number(node.attr('ry'));
        if (!(rx > 0 && ry > 0)) return null;
        return `M${n(cx - rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1,0 ${n(cx + rx)},${n(cy)} A${n(rx)},${n(ry)} 0 1,0 ${n(cx - rx)},${n(cy)} Z`;
    }
    if (tag === 'line') {
        return `M${n(number(node.attr('x1')))},${n(number(node.attr('y1')))} L${n(number(node.attr('x2')))},${n(number(node.attr('y2')))}`;
    }
    if (tag === 'polyline' || tag === 'polygon') {
        const points = parseNumberList(node.attr('points'));
        if (points.length < 4 || points.length % 2) return null;
        const commands = [`M${n(points[0])},${n(points[1])}`];
        for (let i = 2; i < points.length; i += 2) commands.push(`L${n(points[i])},${n(points[i + 1])}`);
        if (tag === 'polygon') commands.push('Z');
        return commands.join(' ');
    }
    return null;
}

function groupAttrs(node, warnings) {
    const attrs = {};
    if (node.attr('id')) attrs['android:name'] = sanitizeResourceName(node.attr('id'), 'group');
    return attrs;
}

function transformAttrs(value, warnings) {
    const attrs = {};
    const input = String(value || '').trim();
    if (!input) return attrs;
    const transforms = [...input.matchAll(/([a-z]+)\s*\(([^)]*)\)/gi)];
    if (transforms.length > 1) warnings.push(warning('approximated-svg-transform', 'Multiple SVG transforms use Android group transform order.'));
    for (const [, rawName, argsText] of transforms) {
        const name = rawName.toLowerCase();
        const args = parseNumberList(argsText);
        if (name === 'translate') {
            attrs['android:translateX'] = n(args[0] || 0);
            attrs['android:translateY'] = n(args[1] || 0);
        } else if (name === 'scale') {
            attrs['android:scaleX'] = n(args[0] ?? 1);
            attrs['android:scaleY'] = n(args[1] ?? args[0] ?? 1);
        } else if (name === 'rotate') {
            attrs['android:rotation'] = n(args[0] || 0);
            if (args.length >= 3) {
                attrs['android:pivotX'] = n(args[1]);
                attrs['android:pivotY'] = n(args[2]);
            }
        } else {
            warnings.push(warning('unsupported-svg-transform', `SVG ${name}() transforms are not converted.`));
        }
    }
    return attrs;
}

function svgDimension(value) {
    const match = /^\s*(\d*\.?\d+)\s*(?:px|dp)?\s*$/i.exec(String(value || ''));
    return match ? parseFloat(match[1]) : null;
}

function parseNumberList(value) {
    return (String(value || '').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || []).map(Number);
}

function color(value, fallback) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized === 'none') return fallback;
    return sanitizeColor(value) || fallback;
}

function alpha(...values) {
    return Math.max(0, Math.min(1, values.reduce((result, value) => result * number(value, 1), 1)));
}

function number(value, fallback = 0) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function n(value) {
    return trimNumber(number(value));
}

function trimNumber(value) {
    return Number.isInteger(value) ? String(value) : Number(value).toFixed(4).replace(/\.?0+$/, '');
}

function warning(code, message) {
    return { severity: 'warning', code, message };
}

module.exports = svgToVector;
