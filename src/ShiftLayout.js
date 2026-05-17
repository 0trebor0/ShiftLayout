const cheerio = require('cheerio');
const { TAG_MAP, INPUT_TYPE_MAP, FONT_FAMILY_MAP } = require('./constants');
const {
    parseStyle, normalizeStyleValue, escapeXmlAttribute, sanitizeColor, sanitizeResourceName, makeUniqueResourceName,
    resourceNameFromPath, pxToDp, pxToSp, cssSizeToAndroid,
    expandBoxValues, parseBorder, extractBackgroundColor, parseBorderRadius, radiusToKey, uniformRadiusValue,
    parseBoxShadow, parseLinearGradient, parseTransform,
    generateShapeDrawable, generateGradientDrawable,
    buildXmlString,
} = require('./utils');

function getAndroidTag(tag, node) {
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

function applyBoxSpacing(attrs, styles, cssProperty, androidBase) {
    const shorthand = styles[cssProperty];
    if (shorthand) {
        const values = expandBoxValues(shorthand);
        if (values && new Set(Object.values(values)).size === 1) {
            attrs[androidBase] = values.top;
        } else if (values) {
            attrs[`${androidBase}Top`] = values.top;
            attrs[`${androidBase}Right`] = values.right;
            attrs[`${androidBase}Bottom`] = values.bottom;
            attrs[`${androidBase}Left`] = values.left;
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
        if (value) attrs[`${androidBase}${androidSide}`] = pxToDp(value);
    }
}

function isZeroCssLength(value) {
    const normalized = normalizeStyleValue(value || '');
    return normalized === '0' || normalized === '0px' || normalized === '0dp' || normalized === '0rem' || normalized === '0em';
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

class ShiftLayout {
    constructor(options = {}) {
        this.opts = {
            prefix:         options.prefix         ?? 'sl',
            defaultPadding: options.defaultPadding ?? '16dp',
            useConstraint:  options.useConstraint  ?? true,
            inputStyle:     options.inputStyle     ?? 'outlined', // 'outlined' | 'filled'
        };
        this.idCount = 0;
        this.lastTopLevelId = null;
        this.usedIds = new Set();
        this.drawables = {};
        this.menus = {};
        this.arrays = {};
        this.arraySpecs = {};
        this.assets = { images: [] };
    }

    _nextId(node) {
        const rawId = node.attr('id') || `${this.opts.prefix}_${this.idCount++}`;
        const baseId = sanitizeResourceName(rawId, this.opts.prefix);
        const id = makeUniqueResourceName(baseId, this.usedIds);
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
        const isAbsolute = position === 'absolute';
        const isCenter = !isAbsolute && (verticalAlign === 'center' ||
            (isZeroCssLength(styles['top']) && isZeroCssLength(styles['bottom'])));
        const isBottom = !isAbsolute && !isCenter && isZeroCssLength(styles['bottom']);

        if (depth === 0 && this.opts.useConstraint) {
            attrs['app:layout_constraintStart_toStartOf'] = 'parent';
            attrs['app:layout_constraintEnd_toEndOf']     = 'parent';
            if (isCenter) {
                attrs['app:layout_constraintTop_toTopOf']       = 'parent';
                attrs['app:layout_constraintBottom_toBottomOf'] = 'parent';
            } else if (isBottom) {
                attrs['app:layout_constraintBottom_toBottomOf'] = 'parent';
            } else {
                if (index === 0) {
                    attrs['app:layout_constraintTop_toTopOf'] = 'parent';
                } else if (this.lastTopLevelId) {
                    attrs['app:layout_constraintTop_toBottomOf'] = this.lastTopLevelId;
                }
                this.lastTopLevelId = cleanId;
            }
        } else if (depth > 0 && !isAbsolute) {
            attrs['android:layout_gravity'] = 'center_horizontal';
        }

        if (isAbsolute) {
            const hasRight  = styles['right']  !== undefined;
            const hasBottom = styles['bottom'] !== undefined;
            attrs['android:layout_gravity'] = `${hasRight && !styles['left'] ? 'end' : 'start'}|${hasBottom && !styles['top'] ? 'bottom' : 'top'}`;
            if (styles['top'])    attrs['android:layout_marginTop']    = pxToDp(styles['top']);
            if (styles['left'])   attrs['android:layout_marginLeft']   = pxToDp(styles['left']);
            if (styles['right'])  attrs['android:layout_marginRight']  = pxToDp(styles['right']);
            if (styles['bottom']) attrs['android:layout_marginBottom'] = pxToDp(styles['bottom']);
        }
    }

    // Material TextInputLayout for <input> and <textarea>
    _buildTextInput(node, index, depth, styles) {
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
            'android:layout_width':    styles['width'] ? cssSizeToAndroid(styles['width']) : 'match_parent',
            'android:layout_height':   styles['height'] ? cssSizeToAndroid(styles['height']) : 'wrap_content',
            'android:id':              cleanId,
            'android:hint':            hint,
        };

        this._applyConstraints(outerAttrs, cleanId, index, depth, styles);
        this._applyHtmlSizing(outerAttrs, node, styles);
        applyAccessibilityAttrs(outerAttrs, node);

        // Margin on the outer wrapper
        applyBoxSpacing(outerAttrs, styles, 'margin', 'android:layout_margin');
        if (normalizeStyleValue(styles['display'] || '') === 'none') outerAttrs['android:visibility'] = 'gone';

        const strokeColor = sanitizeColor(styles['border-color'] || styles['color'] || '');
        if (strokeColor) outerAttrs['app:boxStrokeColor'] = strokeColor;
        const bgColor = sanitizeColor(styles['background-color'] || '') || extractBackgroundColor(styles['background'] || '');
        if (bgColor) outerAttrs['app:boxBackgroundColor'] = bgColor;

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

        return buildXmlString(
            'com.google.android.material.textfield.TextInputLayout', outerAttrs,
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
            items.push(buildXmlString('item', {
                'android:id': `@+id/nav_${safe}`,
                'android:title': text,
                'android:icon': `@drawable/ic_nav_${i + 1}`,
            }));
        });
        this.menus[`${menuId}.xml`] = `<?xml version="1.0" encoding="utf-8"?>\n${buildXmlString('menu', {
            'xmlns:android': 'http://schemas.android.com/apk/res/android',
        }, items)}`;

        return buildXmlString('com.google.android.material.bottomnavigation.BottomNavigationView', attrs);
    }

    // CardView from LinearLayout + border-radius + elevation
    _buildCardView(node, index, depth, styles, children) {
        const cleanId = this._nextId(node);

        const cardAttrs = {
            'android:layout_width':  styles['width']  ? cssSizeToAndroid(styles['width']) : 'wrap_content',
            'android:layout_height': styles['height'] ? cssSizeToAndroid(styles['height']) : 'wrap_content',
            'android:id': cleanId,
        };
        this._applyConstraints(cardAttrs, cleanId, index, depth, styles);
        this._applyHtmlSizing(cardAttrs, node, styles);

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
            'android:orientation':   normalizeStyleValue(styles['flex-direction'] || '') === 'row' ? 'horizontal' : 'vertical',
        };
        applyBoxSpacing(innerAttrs, styles, 'padding', 'android:padding');

        return buildXmlString('androidx.cardview.widget.CardView', cardAttrs,
            [buildXmlString('LinearLayout', innerAttrs, children)]);
    }

    getAndroidAttrs(node, index, depth, androidTag, styles) {
        const attrs = {
            'android:layout_width':  'wrap_content',
            'android:layout_height': 'wrap_content',
        };

        const cleanId = this._nextId(node);
        attrs['android:id'] = cleanId;

        const tag = node.prop('tagName').toLowerCase();
        const inputType = tag === 'input' ? (node.attr('type') || 'text').toLowerCase() : null;
        const isButton  = tag === 'button' || (tag === 'input' && ['submit', 'button', 'reset', 'file'].includes(inputType));

        if (androidTag === 'LinearLayout') attrs['android:orientation'] = 'vertical';
        if (tag === 'label' && node.attr('for')) attrs['android:labelFor'] = `@id/${sanitizeResourceName(node.attr('for'), this.opts.prefix)}`;

        this._applyConstraints(attrs, cleanId, index, depth, styles);
        this._applyHtmlSizing(attrs, node, styles);
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
                case 'font-size':    attrs['android:textSize'] = pxToSp(v); break;
                case 'font-weight':
                    if (normalized === 'bold' || parseInt(normalized) >= 600)
                        attrs['android:textStyle'] = attrs['android:textStyle'] ? attrs['android:textStyle'] + '|bold' : 'bold';
                    break;
                case 'font-style':
                    if (normalized === 'italic')
                        attrs['android:textStyle'] = attrs['android:textStyle'] ? attrs['android:textStyle'] + '|italic' : 'italic';
                    break;
                case 'font-family': {
                    const fam = v.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
                    attrs['android:fontFamily'] = FONT_FAMILY_MAP[fam] || 'sans-serif';
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
                    if (androidTag !== 'LinearLayout') break;
                    const isRow = normalizeStyleValue(styles['flex-direction'] || '') === 'row';
                    const jg = { 'flex-start': isRow ? 'start' : 'top', 'flex-end': isRow ? 'end' : 'bottom', 'center': isRow ? 'center_horizontal' : 'center_vertical' }[normalized];
                    if (jg) attrs['android:gravity'] = attrs['android:gravity'] ? `${attrs['android:gravity']}|${jg}` : jg;
                    break;
                }
                case 'align-items': {
                    if (androidTag !== 'LinearLayout') break;
                    const isRow = normalizeStyleValue(styles['flex-direction'] || '') === 'row';
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
                case 'width':        attrs['android:layout_width']  = cssSizeToAndroid(v); break;
                case 'height':       attrs['android:layout_height'] = cssSizeToAndroid(v); break;
                case 'min-width':   attrs['android:minWidth']  = pxToDp(v); break;
                case 'min-height':  attrs['android:minHeight'] = pxToDp(v); break;
                case 'max-width':   attrs['android:maxWidth']  = pxToDp(v); break;
                case 'max-height':  attrs['android:maxHeight'] = pxToDp(v); break;
                case 'flex-direction':
                    if (androidTag === 'LinearLayout') attrs['android:orientation'] = normalized === 'row' ? 'horizontal' : 'vertical';
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
        if (TEXT_TAGS.has(tag)) {
            const text = textContentForNode(node);
            const valueText = tag === 'input' ? (node.attr('value') || defaultInputText(inputType)) : null;
            const buttonText = tag === 'button' ? defaultInputText(normalizeStyleValue(node.attr('type') || 'button')) : null;
            const rawText = valueText || text || buttonText;
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
            const ref = src.startsWith('@') ? src : src ? `@drawable/${resourceNameFromPath(src)}` : '@drawable/placeholder';
            attrs['android:src'] = ref;
            if (src && !src.startsWith('@')) {
                this.assets.images.push({
                    source: src,
                    resource: ref.replace('@drawable/', ''),
                });
            }
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
        if (tag === 'video') { attrs['android:layout_width'] = 'match_parent'; attrs['android:layout_height'] = 'wrap_content'; }
        if (tag === 'iframe') { attrs['android:layout_width'] = 'match_parent'; attrs['android:layout_height'] = 'match_parent'; }
        if (tag === 'input' && ['checkbox', 'radio'].includes(inputType)) { /* label handled by parent */ }

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
        if (!tag || ['script','style','head','option','source'].includes(tag)) return null;
        if (tag === 'br') {
            return buildXmlString('TextView', {
                'android:layout_width': 'wrap_content',
                'android:layout_height': 'wrap_content',
                'android:text': '\n',
            });
        }

        const styles    = expandInsetStyles(parseStyle(node.attr('style') || ''));
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
            return this._buildTextInput(node, index, depth, styles);
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
        let androidTag    = getAndroidTag(tag, node);

        // CardView: LinearLayout + border-radius + elevation source
        const isCard = androidTag === 'LinearLayout' && !needsScroll &&
            styles['border-radius'] && (styles['box-shadow'] || styles['z-index']);

        // FrameLayout: any direct child is absolutely positioned
        if (androidTag === 'LinearLayout' && !isCard) {
            let hasAbsChild = false;
            node.children().each((_, c) => {
                const childStyles = expandInsetStyles(parseStyle($(c).attr('style') || ''));
                if (normalizeStyleValue(childStyles['position'] || '') === 'absolute') hasAbsChild = true;
            });
            if (hasAbsChild) androidTag = 'FrameLayout';
        }

        const children = [];
        node.children().each((i, child) => {
            const childTag = $(child).prop('tagName')?.toLowerCase();
            if (TEXT_TAGS.has(tag) && TEXT_TAGS.has(childTag)) return;
            const result = this.convertNode($, child, i, depth + 1, tag, node);
            if (result) children.push(result);
        });

        if (isCard) return this._buildCardView(node, index, depth, styles, children);

        const attrs = this.getAndroidAttrs(node, index, depth, androidTag, styles);
        this._applyListItemText(attrs, tag, parentTag, parentNode, index);

        if (needsScroll) {
            const scrollAttrs = { 'android:fillViewport': 'true' }, innerAttrs = {};
            for (const [k, v] of Object.entries(attrs)) (SCROLL_OUTER_KEYS.has(k) ? scrollAttrs : innerAttrs)[k] = v;
            innerAttrs['android:layout_width'] = 'match_parent';
            innerAttrs['android:layout_height'] = 'wrap_content';
            return buildXmlString('ScrollView', scrollAttrs, [buildXmlString(androidTag, innerAttrs, children)]);
        }

        return buildXmlString(androidTag, attrs, children);
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

    convert(html) {
        const $ = cheerio.load(html);
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
        this.assets         = { images: [] };
        const content = [];
        body.children().each((i, el) => {
            const converted = this.convertNode($, el, i, 0);
            if (converted) content.push(converted);
        });

        const layout = `<?xml version="1.0" encoding="utf-8"?>\n${buildXmlString('androidx.constraintlayout.widget.ConstraintLayout', rootAttrs, content)}`;
        const values = {};
        const arraysXml = this._buildValuesArraysXml();
        if (arraysXml) values['arrays.xml'] = arraysXml;
        return {
            layout,
            drawables: this.drawables,
            menus: this.menus,
            arrays: this.arrays,
            values,
            resources: {
                drawables: this.drawables,
                menus: this.menus,
                values,
            },
            assets: this.assets,
        };
    }
}

module.exports = ShiftLayout;
