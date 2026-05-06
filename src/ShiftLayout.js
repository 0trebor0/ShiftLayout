const cheerio = require('cheerio');
const { TAG_MAP, INPUT_TYPE_MAP, FONT_FAMILY_MAP } = require('./constants');
const {
    parseStyle, sanitizeColor, pxToDp, pxToSp,
    parseBoxShadow, parseLinearGradient, parseTransform,
    generateShapeDrawable, generateGradientDrawable,
    buildXmlString,
} = require('./utils');

function getAndroidTag(tag, node) {
    if (tag === 'input') {
        const type = (node.attr('type') || 'text').toLowerCase();
        if (type === 'checkbox') return 'CheckBox';
        if (type === 'radio') return 'RadioButton';
        if (type === 'submit' || type === 'button') return 'com.google.android.material.button.MaterialButton';
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
        this.drawables = {};
        this.menus = {};
    }

    _nextId(node) {
        const rawId = node.attr('id') || `${this.opts.prefix}_${this.idCount++}`;
        return `@+id/${rawId.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
    }

    _shapeKey(fillColor, radius, strokeColor, strokeWidth) {
        const c = (fillColor || 'transparent').replace('#', '').toLowerCase();
        const r = (radius || '0').replace(/\D/g, '');
        const s = strokeColor ? `_s${strokeColor.replace('#', '').toLowerCase()}${(strokeWidth || '').replace(/\D/g, '')}` : '';
        return `sl_bg_${c}_r${r}${s}`;
    }

    _gradientKey(colors, angle) {
        return `sl_grad_${colors.map(c => c.replace('#', '')).join('_').toLowerCase()}_a${angle}`;
    }

    _applyConstraints(attrs, cleanId, index, depth, styles) {
        const isAbsolute = styles['position'] === 'absolute';
        const isCenter = !isAbsolute && (styles['vertical-align'] === 'center' ||
            (styles['top'] === '0' && styles['bottom'] === '0'));
        const isBottom = !isAbsolute && !isCenter && styles['bottom'] === '0';

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
        const inputType = isArea ? 'textMultiLine' : (INPUT_TYPE_MAP[(node.attr('type') || 'text').toLowerCase()] || 'text');
        const hint      = node.attr('placeholder') || '';
        const cleanId   = this._nextId(node);

        const styleAttr = this.opts.inputStyle === 'filled'
            ? '@style/Widget.MaterialComponents.TextInputLayout.FilledBox'
            : '@style/Widget.MaterialComponents.TextInputLayout.OutlinedBox';

        const outerAttrs = {
            'style':                   styleAttr,
            'android:layout_width':    'match_parent',
            'android:layout_height':   'wrap_content',
            'android:id':              cleanId,
            'android:hint':            hint,
        };

        this._applyConstraints(outerAttrs, cleanId, index, depth, styles);

        // Margin on the outer wrapper
        if (styles['margin'])        outerAttrs['android:layout_margin']       = pxToDp(styles['margin']);
        if (styles['margin-top'])    outerAttrs['android:layout_marginTop']    = pxToDp(styles['margin-top']);
        if (styles['margin-bottom']) outerAttrs['android:layout_marginBottom'] = pxToDp(styles['margin-bottom']);
        if (styles['margin-left'])   outerAttrs['android:layout_marginLeft']   = pxToDp(styles['margin-left']);
        if (styles['margin-right'])  outerAttrs['android:layout_marginRight']  = pxToDp(styles['margin-right']);
        if (styles['display'] === 'none') outerAttrs['android:visibility'] = 'gone';

        const strokeColor = sanitizeColor(styles['border-color'] || styles['color'] || '');
        if (strokeColor) outerAttrs['app:boxStrokeColor'] = strokeColor;
        const bgColor = sanitizeColor(styles['background-color'] || '');
        if (bgColor) outerAttrs['app:boxBackgroundColor'] = bgColor;

        const innerAttrs = {
            'android:layout_width':  'match_parent',
            'android:layout_height': 'wrap_content',
            'android:inputType':     inputType,
        };
        if (node.attr('maxlength')) innerAttrs['android:maxLength'] = node.attr('maxlength');
        if (isArea) {
            innerAttrs['android:minLines'] = node.attr('rows') || '3';
            innerAttrs['android:gravity']  = 'top|start';
        }

        return buildXmlString(
            'com.google.android.material.textfield.TextInputLayout', outerAttrs,
            [buildXmlString('com.google.android.material.textfield.TextInputEditText', innerAttrs)]
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
        const bgColor = sanitizeColor(styles['background-color'] || '');
        if (bgColor) attrs['app:backgroundTint'] = bgColor;

        // Generate menu XML from <a> children
        const items = [];
        node.children().each((i, child) => {
            const a    = $(child);
            const text = a.text().trim();
            const safe = text.toLowerCase().replace(/[^a-z0-9]/g, '_') || String(i);
            items.push(`    <item\n        android:id="@+id/nav_${safe}"\n        android:title="${text}"\n        android:icon="@drawable/ic_nav_${i + 1}" />`);
        });
        this.menus[`${menuId}.xml`] = `<?xml version="1.0" encoding="utf-8"?>\n<menu xmlns:android="http://schemas.android.com/apk/res/android">\n${items.join('\n')}\n</menu>`;

        return buildXmlString('com.google.android.material.bottomnavigation.BottomNavigationView', attrs);
    }

    // CardView from LinearLayout + border-radius + elevation
    _buildCardView(node, index, depth, styles, children) {
        const cleanId = this._nextId(node);

        const cardAttrs = {
            'android:layout_width':  styles['width']  === '100%' ? 'match_parent' : 'wrap_content',
            'android:layout_height': styles['height'] === '100%' ? 'match_parent' : 'wrap_content',
            'android:id': cleanId,
        };
        this._applyConstraints(cardAttrs, cleanId, index, depth, styles);

        if (styles['border-radius']) cardAttrs['app:cardCornerRadius'] = pxToDp(styles['border-radius']);
        if (styles['box-shadow'])    cardAttrs['app:cardElevation']    = parseBoxShadow(styles['box-shadow']);
        else if (styles['z-index'])  cardAttrs['app:cardElevation']    = `${parseInt(styles['z-index'])}dp`;

        const bgColor = sanitizeColor(styles['background-color'] || '');
        if (bgColor) cardAttrs['app:cardBackgroundColor'] = bgColor;
        if (styles['margin']) cardAttrs['android:layout_margin'] = pxToDp(styles['margin']);

        const innerAttrs = {
            'android:layout_width':  'match_parent',
            'android:layout_height': 'wrap_content',
            'android:orientation':   styles['flex-direction'] === 'row' ? 'horizontal' : 'vertical',
        };
        ['padding','padding-top','padding-bottom','padding-left','padding-right'].forEach((k, i) => {
            const aKey = ['android:padding','android:paddingTop','android:paddingBottom','android:paddingLeft','android:paddingRight'][i];
            if (styles[k]) innerAttrs[aKey] = pxToDp(styles[k]);
        });

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
        const isButton  = tag === 'button' || (tag === 'input' && ['submit', 'button'].includes(inputType));

        if (androidTag === 'LinearLayout') attrs['android:orientation'] = 'vertical';

        this._applyConstraints(attrs, cleanId, index, depth, styles);

        let bgColor = null, borderRadius = null, strokeColor = null, strokeWidth = null, gradient = null;

        for (const [k, v] of Object.entries(styles)) {
            switch (k) {
                case 'background-color': bgColor = sanitizeColor(v); break;
                case 'background': {
                    const grad = parseLinearGradient(v);
                    if (grad) gradient = grad; else bgColor = sanitizeColor(v);
                    break;
                }
                case 'color': { const c = sanitizeColor(v); if (c) attrs['android:textColor'] = c; break; }
                case 'font-size':    attrs['android:textSize'] = pxToSp(v); break;
                case 'font-weight':
                    if (v === 'bold' || parseInt(v) >= 600)
                        attrs['android:textStyle'] = attrs['android:textStyle'] ? attrs['android:textStyle'] + '|bold' : 'bold';
                    break;
                case 'font-style':
                    if (v === 'italic')
                        attrs['android:textStyle'] = attrs['android:textStyle'] ? attrs['android:textStyle'] + '|italic' : 'italic';
                    break;
                case 'font-family': {
                    const fam = v.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
                    attrs['android:fontFamily'] = FONT_FAMILY_MAP[fam] || 'sans-serif';
                    break;
                }
                case 'text-align': {
                    const g = { center: 'center', right: 'end', left: 'start', justify: 'fill_horizontal' }[v];
                    if (g) attrs['android:gravity'] = g;
                    break;
                }
                case 'letter-spacing': {
                    const px = parseFloat(v);
                    if (!isNaN(px)) attrs['android:letterSpacing'] = v.endsWith('em') ? px.toFixed(3) : (px / 16).toFixed(3);
                    break;
                }
                case 'line-height': {
                    if (v === 'normal') break;
                    const n = parseFloat(v);
                    if (!isNaN(n)) attrs['android:lineSpacingMultiplier'] = (v.endsWith('px') ? n / 16 : n).toFixed(2);
                    break;
                }
                case 'text-overflow':
                    if (v === 'ellipsis') { attrs['android:ellipsize'] = 'end'; attrs['android:maxLines'] = attrs['android:maxLines'] || '1'; }
                    break;
                case 'white-space':
                    if (v === 'nowrap') { attrs['android:maxLines'] = '1'; attrs['android:ellipsize'] = attrs['android:ellipsize'] || 'end'; }
                    break;
                case '-webkit-line-clamp':
                case 'line-clamp': {
                    const lc = parseInt(v);
                    if (!isNaN(lc)) { attrs['android:maxLines'] = String(lc); attrs['android:ellipsize'] = 'end'; }
                    break;
                }
                case 'justify-content': {
                    if (androidTag !== 'LinearLayout') break;
                    const isRow = styles['flex-direction'] === 'row';
                    const jg = { 'flex-start': isRow ? 'start' : 'top', 'flex-end': isRow ? 'end' : 'bottom', 'center': isRow ? 'center_horizontal' : 'center_vertical' }[v];
                    if (jg) attrs['android:gravity'] = attrs['android:gravity'] ? `${attrs['android:gravity']}|${jg}` : jg;
                    break;
                }
                case 'align-items': {
                    if (androidTag !== 'LinearLayout') break;
                    const isRow = styles['flex-direction'] === 'row';
                    const ag = { 'flex-start': isRow ? 'top' : 'start', 'flex-end': isRow ? 'bottom' : 'end', 'center': isRow ? 'center_vertical' : 'center_horizontal', 'stretch': 'fill' }[v];
                    if (ag) attrs['android:gravity'] = attrs['android:gravity'] ? `${attrs['android:gravity']}|${ag}` : ag;
                    break;
                }
                case 'object-fit':
                    if (androidTag === 'ImageView') {
                        const st = { cover: 'centerCrop', contain: 'centerInside', fill: 'fitXY', 'scale-down': 'centerInside', none: 'center' }[v];
                        if (st) attrs['android:scaleType'] = st;
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
                    if (v === 'pointer') {
                        attrs['android:clickable']  = 'true';
                        attrs['android:focusable']  = 'true';
                        attrs['android:foreground'] = '?attr/selectableItemBackground';
                    }
                    break;
                case 'overflow':
                    if (v === 'hidden') { attrs['android:clipChildren'] = 'true'; attrs['android:clipToPadding'] = 'true'; }
                    break;
                case 'padding':         attrs['android:padding']             = pxToDp(v); break;
                case 'padding-top':     attrs['android:paddingTop']          = pxToDp(v); break;
                case 'padding-bottom':  attrs['android:paddingBottom']       = pxToDp(v); break;
                case 'padding-left':    attrs['android:paddingLeft']         = pxToDp(v); break;
                case 'padding-right':   attrs['android:paddingRight']        = pxToDp(v); break;
                case 'margin':          attrs['android:layout_margin']       = pxToDp(v); break;
                case 'margin-top':      attrs['android:layout_marginTop']    = pxToDp(v); break;
                case 'margin-bottom':   attrs['android:layout_marginBottom'] = pxToDp(v); break;
                case 'margin-left':     attrs['android:layout_marginLeft']   = pxToDp(v); break;
                case 'margin-right':    attrs['android:layout_marginRight']  = pxToDp(v); break;
                case 'width':     if (v === '100%') attrs['android:layout_width']  = 'match_parent'; break;
                case 'height':    if (v === '100%') attrs['android:layout_height'] = 'match_parent'; break;
                case 'min-width':   attrs['android:minWidth']  = pxToDp(v); break;
                case 'min-height':  attrs['android:minHeight'] = pxToDp(v); break;
                case 'max-width':   attrs['android:maxWidth']  = pxToDp(v); break;
                case 'max-height':  attrs['android:maxHeight'] = pxToDp(v); break;
                case 'flex-direction':
                    if (androidTag === 'LinearLayout') attrs['android:orientation'] = v === 'row' ? 'horizontal' : 'vertical';
                    break;
                case 'opacity':     attrs['android:alpha']      = parseFloat(v).toFixed(2); break;
                case 'display':     if (v === 'none') attrs['android:visibility'] = 'gone'; break;
                case 'visibility':
                    if (v === 'hidden') attrs['android:visibility'] = 'invisible';
                    else if (v === 'visible') attrs['android:visibility'] = 'visible';
                    break;
                case 'z-index': { const z = parseInt(v); if (!isNaN(z)) attrs['android:elevation'] = `${z}dp`; break; }
                case 'box-shadow':    attrs['android:elevation'] = parseBoxShadow(v); break;
                case 'border-radius': borderRadius = pxToDp(v); break;
                case 'border': {
                    for (const part of v.trim().split(/\s+/)) {
                        if (/^\d/.test(part)) strokeWidth = pxToDp(part);
                        else if (!['solid','dashed','dotted','none','double'].includes(part)) { const c = sanitizeColor(part); if (c) strokeColor = c; }
                    }
                    break;
                }
                case 'border-color': { const c = sanitizeColor(v); if (c) strokeColor = c; break; }
                case 'border-width': strokeWidth = pxToDp(v); break;
            }
        }

        // Background resolution
        if (isButton) {
            attrs['app:backgroundTint'] = bgColor || '#6200EE';
            if (borderRadius) attrs['app:cornerRadius'] = borderRadius;
            if (strokeColor)  { attrs['app:strokeColor'] = strokeColor; attrs['app:strokeWidth'] = strokeWidth || '1dp'; }
        } else if (gradient) {
            const key = this._gradientKey(gradient.colors, gradient.angle);
            this.drawables[`${key}.xml`] = generateGradientDrawable({ ...gradient, radius: borderRadius });
            attrs['android:background'] = `@drawable/${key}`;
        } else if (borderRadius || strokeColor) {
            const key = this._shapeKey(bgColor, borderRadius, strokeColor, strokeWidth);
            this.drawables[`${key}.xml`] = generateShapeDrawable({ fillColor: bgColor, radius: borderRadius, strokeColor, strokeWidth });
            attrs['android:background'] = `@drawable/${key}`;
        } else if (bgColor) {
            attrs['android:background'] = bgColor;
        }

        // Text content — containers don't get android:text
        const TEXT_TAGS = new Set(['h1','h2','h3','h4','p','span','label','a','li','button','legend','th','td']);
        if (TEXT_TAGS.has(tag)) {
            const text = node.clone().children().remove().end().text().trim();
            if (text) attrs['android:text'] = text;
        }

        // Tag-specific
        if (tag === 'img') {
            const src = node.attr('src') || '';
            const ref = src.startsWith('@') ? src : src ? `@drawable/${src.split('/').pop().replace(/\.[^.]+$/, '').replace(/[^a-z0-9_]/gi, '_').toLowerCase() || 'placeholder'}` : '@drawable/placeholder';
            attrs['android:src'] = ref;
            attrs['android:contentDescription'] = node.attr('alt') || '';
        }
        if (tag === 'select')   attrs['android:layout_width'] = 'match_parent';
        if (tag === 'progress') {
            const max = node.attr('max'), val = node.attr('value');
            if (max || val) { attrs['style'] = '@style/Widget.AppCompat.ProgressBar.Horizontal'; if (max) attrs['android:max'] = max; if (val) attrs['android:progress'] = val; }
        }
        if (tag === 'hr') { attrs['android:layout_width'] = 'match_parent'; attrs['android:layout_height'] = '1dp'; if (!attrs['android:background']) attrs['android:background'] = '#CCCCCC'; }
        if (tag === 'video') { attrs['android:layout_width'] = 'match_parent'; attrs['android:layout_height'] = 'wrap_content'; }
        if (tag === 'iframe') { attrs['android:layout_width'] = 'match_parent'; attrs['android:layout_height'] = 'match_parent'; }
        if (tag === 'input' && ['checkbox', 'radio'].includes(inputType)) { /* label handled by parent */ }

        return attrs;
    }

    convertNode($, el, index, depth) {
        const node = $(el);
        const tag  = node.prop('tagName')?.toLowerCase();
        if (!tag || ['script','style','head','option'].includes(tag)) return null;

        const styles    = parseStyle(node.attr('style') || '');
        const inputType = tag === 'input' ? (node.attr('type') || 'text').toLowerCase() : null;

        // Material TextInputLayout for text inputs and textareas
        if ((tag === 'input' && !['checkbox','radio','submit','button'].includes(inputType)) || tag === 'textarea') {
            return this._buildTextInput(node, index, depth, styles);
        }

        // BottomNavigationView for <nav> whose direct children are all <a> links
        if (tag === 'nav') {
            const children = node.children().toArray();
            const allLinks = children.length > 0 && children.every(c => $(c).prop('tagName')?.toLowerCase() === 'a');
            if (allLinks) return this._buildBottomNav($, node, index, depth, styles);
        }

        const needsScroll = ['scroll','auto'].includes(styles['overflow-y']) || ['scroll','auto'].includes(styles['overflow']);
        let androidTag    = getAndroidTag(tag, node);

        // CardView: LinearLayout + border-radius + elevation source
        const isCard = androidTag === 'LinearLayout' && !needsScroll &&
            styles['border-radius'] && (styles['box-shadow'] || styles['z-index']);

        // FrameLayout: any direct child is absolutely positioned
        if (androidTag === 'LinearLayout' && !isCard) {
            let hasAbsChild = false;
            node.children().each((_, c) => { if (parseStyle($(c).attr('style') || '')['position'] === 'absolute') hasAbsChild = true; });
            if (hasAbsChild) androidTag = 'FrameLayout';
        }

        const children = [];
        node.children().each((i, child) => {
            const result = this.convertNode($, child, i, depth + 1);
            if (result) children.push(result);
        });

        if (isCard) return this._buildCardView(node, index, depth, styles, children);

        const attrs = this.getAndroidAttrs(node, index, depth, androidTag, styles);

        if (needsScroll) {
            const scrollAttrs = { 'android:fillViewport': 'true' }, innerAttrs = {};
            for (const [k, v] of Object.entries(attrs)) (SCROLL_OUTER_KEYS.has(k) ? scrollAttrs : innerAttrs)[k] = v;
            innerAttrs['android:layout_width'] = 'match_parent';
            innerAttrs['android:layout_height'] = 'wrap_content';
            return buildXmlString('ScrollView', scrollAttrs, [buildXmlString(androidTag, innerAttrs, children)]);
        }

        return buildXmlString(androidTag, attrs, children);
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
        this.drawables      = {};
        this.menus          = {};
        const content = [];
        body.children().each((i, el) => {
            const converted = this.convertNode($, el, i, 0);
            if (converted) content.push(converted);
        });

        const layout = `<?xml version="1.0" encoding="utf-8"?>\n${buildXmlString('androidx.constraintlayout.widget.ConstraintLayout', rootAttrs, content)}`;
        return { layout, drawables: this.drawables, menus: this.menus };
    }
}

module.exports = ShiftLayout;
