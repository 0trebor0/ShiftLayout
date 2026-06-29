const { COLOR_MAP } = require('./constants');

function parseStyle(styleStr) {
    return Object.fromEntries(
        parseStyleDeclarations(styleStr).map(({ property, value }) => [property, value])
    );
}

function parseStyleDeclarations(styleStr) {
    const declarations = splitCssSegments(String(styleStr), ';');

    return declarations.flatMap(declaration => {
        const colonIdx = findTopLevelCharacter(declaration, ':');
        if (colonIdx === -1) return [];

        const property = declaration.slice(0, colonIdx).trim().toLowerCase();
        const rawValue = declaration.slice(colonIdx + 1).trim();
        const important = /\s*!important\s*$/i.test(rawValue);
        const value = rawValue.replace(/\s*!important\s*$/i, '').trim();
        return property && value ? [{ property, value, important }] : [];
    });
}

function splitCssSegments(input, delimiter) {
    const segments = [];
    let current = '';
    let parentheses = 0;
    let brackets = 0;
    let quote = null;
    let inComment = false;

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
            if (ch === quote && input[i - 1] !== '\\') quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            current += ch;
        } else if (ch === '(') {
            parentheses++;
            current += ch;
        } else if (ch === ')') {
            parentheses = Math.max(0, parentheses - 1);
            current += ch;
        } else if (ch === '[') {
            brackets++;
            current += ch;
        } else if (ch === ']') {
            brackets = Math.max(0, brackets - 1);
            current += ch;
        } else if (ch === delimiter && parentheses === 0 && brackets === 0) {
            if (current.trim()) segments.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }

    if (current.trim()) segments.push(current.trim());
    return segments;
}

function findTopLevelCharacter(input, target) {
    let parentheses = 0;
    let brackets = 0;
    let quote = null;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (quote) {
            if (ch === quote && input[i - 1] !== '\\') quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === '(') {
            parentheses++;
        } else if (ch === ')') {
            parentheses = Math.max(0, parentheses - 1);
        } else if (ch === '[') {
            brackets++;
        } else if (ch === ']') {
            brackets = Math.max(0, brackets - 1);
        } else if (ch === target && parentheses === 0 && brackets === 0) {
            return i;
        }
    }

    return -1;
}

function parseCssStylesheet(cssText, mediaConditions = []) {
    const rules = [];
    const input = String(cssText || '');
    let cursor = 0;

    while (cursor < input.length) {
        const open = findNextCssBrace(input, cursor, '{');
        if (open === -1) break;

        const prelude = input.slice(cursor, open).replace(/\/\*[\s\S]*?\*\//g, '').trim();
        const close = findMatchingCssBrace(input, open);
        if (close === -1) break;

        if (/^@media\b/i.test(prelude)) {
            const condition = prelude.replace(/^@media\s*/i, '').trim();
            rules.push(...parseCssStylesheet(input.slice(open + 1, close), [...mediaConditions, condition]));
        } else if (prelude && !prelude.startsWith('@')) {
            const selectors = splitCssSegments(prelude, ',');
            const declarations = parseStyleDeclarations(input.slice(open + 1, close));
            if (selectors.length && declarations.length) rules.push({ selectors, declarations, mediaConditions });
        }

        cursor = close + 1;
    }

    return rules;
}

function normalizeMediaProfile(profile) {
    if (profile === undefined || profile === null || profile === false) return null;
    if (typeof profile !== 'object' || Array.isArray(profile)) {
        throw new TypeError('media must be an object with target viewport properties.');
    }

    const normalized = {
        type: normalizeStyleValue(profile.type || 'screen'),
        width: normalizeMediaDimension(profile.width, 'width'),
        height: normalizeMediaDimension(profile.height, 'height'),
        orientation: normalizeStyleValue(profile.orientation || ''),
    };
    if (normalized.orientation && !['portrait', 'landscape'].includes(normalized.orientation)) {
        throw new TypeError('media.orientation must be "portrait" or "landscape".');
    }
    if (!normalized.orientation && normalized.width !== null && normalized.height !== null) {
        normalized.orientation = normalized.width > normalized.height ? 'landscape' : 'portrait';
    }
    return normalized;
}

function normalizeMediaDimension(value, name) {
    if (value === undefined || value === null || value === '') return null;
    const converted = typeof value === 'number' ? value : parseFloat(evaluateCssLength(value, 'dp'));
    if (!Number.isFinite(converted) || converted < 0) {
        throw new TypeError(`media.${name} must be a non-negative number or compatible CSS length.`);
    }
    return converted;
}

function matchesMediaQuery(query, profile) {
    if (!profile) return false;
    return splitCssSegments(String(query || ''), ',').some(branch => matchesMediaBranch(branch, profile));
}

function matchesMediaBranch(branch, profile) {
    let normalized = normalizeStyleValue(branch);
    let negate = false;
    if (normalized.startsWith('not ')) {
        negate = true;
        normalized = normalized.slice(4).trim();
    }
    normalized = normalized.replace(/^only\s+/, '');
    const clauses = splitMediaClauses(normalized);
    const matches = clauses.every(clause => matchesMediaClause(clause, profile));
    return negate ? !matches : matches;
}

function splitMediaClauses(value) {
    const clauses = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '(') depth++;
        if (ch === ')') depth = Math.max(0, depth - 1);
        if (depth === 0 && /^\s+and\s+/i.test(value.slice(i))) {
            if (current.trim()) clauses.push(current.trim());
            const match = /^\s+and\s+/i.exec(value.slice(i));
            i += match[0].length - 1;
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) clauses.push(current.trim());
    return clauses;
}

function matchesMediaClause(clause, profile) {
    const normalized = normalizeStyleValue(clause);
    if (!normalized.startsWith('(')) {
        return normalized === 'all' || normalized === profile.type;
    }
    if (!normalized.endsWith(')')) return false;

    const feature = normalized.slice(1, -1).trim();
    const match = /^(?:(min|max)-)?(width|height|orientation)\s*:\s*(.+)$/.exec(feature);
    if (!match) return false;
    const [, range, name, rawValue] = match;
    if (name === 'orientation') return !range && profile.orientation === rawValue.trim();

    const actual = profile[name];
    const expectedValue = evaluateCssLength(rawValue, 'dp');
    const expected = expectedValue && parseFloat(expectedValue);
    if (actual === null || !Number.isFinite(expected)) return false;
    if (range === 'min') return actual >= expected;
    if (range === 'max') return actual <= expected;
    return actual === expected;
}

function findNextCssBrace(input, start, target) {
    let quote = null;
    let inComment = false;

    for (let i = start; i < input.length; i++) {
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
            if (ch === quote && input[i - 1] !== '\\') quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === target) {
            return i;
        }
    }

    return -1;
}

function findMatchingCssBrace(input, open) {
    let depth = 1;
    let quote = null;
    let inComment = false;

    for (let i = open + 1; i < input.length; i++) {
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
            if (ch === quote && input[i - 1] !== '\\') quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === '{') {
            depth++;
        } else if (ch === '}' && --depth === 0) {
            return i;
        }
    }

    return -1;
}

function selectorSpecificity(selector) {
    const withoutAttributes = String(selector).replace(/\[[^\]]*\]/g, ' ');
    const ids = (withoutAttributes.match(/#[\w-]+/g) || []).length;
    const classes = (withoutAttributes.match(/\.[\w-]+/g) || []).length;
    const attributes = (String(selector).match(/\[[^\]]*\]/g) || []).length;
    const pseudoClasses = (withoutAttributes.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g) || []).length;
    const elements = (withoutAttributes
        .replace(/#[\w-]+|\.[\w-]+|::?[\w-]+(?:\([^)]*\))?/g, ' ')
        .match(/(^|[\s>+~])([a-z][\w-]*)/gi) || []).length;
    const pseudoElements = (withoutAttributes.match(/::[\w-]+/g) || []).length;
    return [ids, classes + attributes + pseudoClasses, elements + pseudoElements];
}

function resolveCssVariables(value, variables) {
    let result = String(value || '');

    for (let pass = 0; pass < 20; pass++) {
        const start = result.indexOf('var(');
        if (start === -1) break;

        const open = start + 3;
        const close = findMatchingParenthesis(result, open);
        if (close === -1) break;

        const parts = splitCssSegments(result.slice(open + 1, close), ',');
        const name = (parts.shift() || '').trim().toLowerCase();
        const replacement = Object.prototype.hasOwnProperty.call(variables, name)
            ? variables[name]
            : parts.join(', ').trim();
        result = `${result.slice(0, start)}${replacement}${result.slice(close + 1)}`;
    }

    return result.trim();
}

function findMatchingParenthesis(input, open) {
    let depth = 1;
    let quote = null;

    for (let i = open + 1; i < input.length; i++) {
        const ch = input[i];
        if (quote) {
            if (ch === quote && input[i - 1] !== '\\') quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === '(') {
            depth++;
        } else if (ch === ')' && --depth === 0) {
            return i;
        }
    }

    return -1;
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

function tokenizeCssMath(value) {
    const tokens = [];
    const input = String(value);
    let cursor = 0;

    while (cursor < input.length) {
        const rest = input.slice(cursor);
        const whitespace = /^\s+/.exec(rest);
        if (whitespace) {
            cursor += whitespace[0].length;
            continue;
        }

        const number = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
        if (number) {
            cursor += number[0].length;
            const unit = /^(px|dp|sp|rem|em|%)/i.exec(input.slice(cursor));
            if (unit) cursor += unit[0].length;
            tokens.push({ type: 'number', value: parseFloat(number[0]), unit: unit?.[0].toLowerCase() || '' });
            continue;
        }

        const identifier = /^(calc|min|max|clamp)\b/i.exec(rest);
        if (identifier) {
            tokens.push({ type: 'function', value: identifier[0].toLowerCase() });
            cursor += identifier[0].length;
            continue;
        }

        const symbol = rest[0];
        if ('+-*/(),'.includes(symbol)) {
            tokens.push({ type: symbol, value: symbol });
            cursor++;
            continue;
        }
        return null;
    }

    return tokens;
}

function evaluateCssLength(value, outputUnit = 'dp') {
    const tokens = tokenizeCssMath(value);
    if (!tokens) return null;
    let cursor = 0;

    function peek(type) {
        return tokens[cursor]?.type === type;
    }

    function take(type) {
        if (!peek(type)) throw new Error('Unexpected CSS math token.');
        return tokens[cursor++];
    }

    function normalizeNumber(token) {
        if (!token.unit) return { value: token.value, kind: 'number' };
        if (token.unit === '%') return { value: token.value, kind: 'percent' };
        const multiplier = ['em', 'rem'].includes(token.unit) ? 16 : 1;
        return { value: token.value * multiplier, kind: 'length' };
    }

    function compatible(left, right) {
        if (left.kind === right.kind) return [left, right];
        if (left.kind === 'number' && left.value === 0) return [{ value: 0, kind: right.kind }, right];
        if (right.kind === 'number' && right.value === 0) return [left, { value: 0, kind: left.kind }];
        throw new Error('Incompatible CSS math dimensions.');
    }

    function parsePrimary() {
        if (peek('+') || peek('-')) {
            const sign = take(tokens[cursor].type).type === '-' ? -1 : 1;
            const result = parsePrimary();
            return { ...result, value: result.value * sign };
        }
        if (peek('number')) return normalizeNumber(take('number'));
        if (peek('(')) {
            take('(');
            const result = parseExpression();
            take(')');
            return result;
        }
        if (peek('function')) {
            const name = take('function').value;
            take('(');
            if (name === 'calc') {
                const result = parseExpression();
                take(')');
                return result;
            }

            const args = [parseExpression()];
            while (peek(',')) {
                take(',');
                args.push(parseExpression());
            }
            take(')');
            if ((name === 'clamp' && args.length !== 3) || (name !== 'clamp' && args.length < 1)) {
                throw new Error('Invalid CSS math arguments.');
            }
            const normalized = args.slice(1).reduce((items, item) => {
                const [first, current] = compatible(items[0], item);
                items[0] = first;
                items.push(current);
                return items;
            }, [args[0]]);
            if (name === 'min') return normalized.reduce((best, item) => item.value < best.value ? item : best);
            if (name === 'max') return normalized.reduce((best, item) => item.value > best.value ? item : best);
            return {
                value: Math.max(normalized[0].value, Math.min(normalized[1].value, normalized[2].value)),
                kind: normalized[0].kind,
            };
        }
        throw new Error('Expected a CSS math value.');
    }

    function parseProduct() {
        let result = parsePrimary();
        while (peek('*') || peek('/')) {
            const operator = take(tokens[cursor].type).type;
            const right = parsePrimary();
            if (operator === '*') {
                if (result.kind === 'number') result = { value: result.value * right.value, kind: right.kind };
                else if (right.kind === 'number') result = { value: result.value * right.value, kind: result.kind };
                else throw new Error('CSS lengths cannot be multiplied together.');
            } else {
                if (right.kind !== 'number' || right.value === 0) throw new Error('CSS lengths require a unitless nonzero divisor.');
                result = { value: result.value / right.value, kind: result.kind };
            }
        }
        return result;
    }

    function parseExpression() {
        let result = parseProduct();
        while (peek('+') || peek('-')) {
            const operator = take(tokens[cursor].type).type;
            const [left, right] = compatible(result, parseProduct());
            result = { value: operator === '+' ? left.value + right.value : left.value - right.value, kind: left.kind };
        }
        return result;
    }

    try {
        const result = parseExpression();
        if (cursor !== tokens.length || result.kind === 'percent') return null;
        return `${trimNumber(result.value)}${outputUnit}`;
    } catch {
        return null;
    }
}

function pxToDp(val) {
    const value = String(val).trim();
    if (/^(calc|min|max|clamp)\(/i.test(value)) return evaluateCssLength(value, 'dp');
    if (/^-?\d+(\.\d+)?$/.test(value)) return `${value}dp`;
    return value
        .replace(/(-?\d+\.?\d*)\s*px/g, (_, n) => `${n}dp`)
        .replace(/(-?\d+\.?\d*)\s*rem/g, (_, n) => `${trimNumber(parseFloat(n) * 16)}dp`)
        .replace(/(-?\d+\.?\d*)\s*em/g, (_, n) => `${trimNumber(parseFloat(n) * 16)}dp`);
}

function pxToSp(val) {
    const value = String(val).trim();
    if (/^(calc|min|max|clamp)\(/i.test(value)) return evaluateCssLength(value, 'sp');
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
    if (/^(calc|min|max|clamp)\(/i.test(size)) return evaluateCssLength(size, 'dp');
    if (/^\d+(\.\d+)?$/.test(size)) return `${size}dp`;
    return pxToDp(size);
}

function expandBoxValues(val) {
    const parts = splitCssTokens(val);
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
    parseStyle, parseStyleDeclarations, parseCssStylesheet, normalizeMediaProfile, matchesMediaQuery,
    selectorSpecificity, resolveCssVariables,
    normalizeStyleValue, escapeXmlAttribute, sanitizeResourceName,
    makeUniqueResourceName,
    resourceNameFromPath,
    sanitizeColor, evaluateCssLength, pxToDp, pxToSp, cssSizeToAndroid, expandBoxValues,
    splitCssTokens, parseBorder, extractBackgroundColor, parseBorderRadius, radiusToKey, uniformRadiusValue,
    parseBoxShadow, parseLinearGradient, parseTransform,
    generateShapeDrawable, generateGradientDrawable,
    buildXmlString,
};
