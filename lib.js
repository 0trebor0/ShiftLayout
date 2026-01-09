/**
 * ShiftLayout v4.3.1
 * High-speed HTML to Android XML Bridge.
 * Features: Absolute Positioning, Auto-Centering, and Hex-Color Translation.
 */

const cheerio = require('cheerio');

const COLOR_MAP = {
    white: '#FFFFFF', black: '#000000', red: '#FF0000',
    green: '#00FF00', blue: '#0000FF', yellow: '#FFFF00',
    gray: '#808080', silver: '#C0C0C0', transparent: '#00000000'
};

const TAG_MAP = {
    div: 'LinearLayout', section: 'LinearLayout', header: 'LinearLayout', 
    footer: 'LinearLayout', h1: 'TextView', h2: 'TextView', p: 'TextView', 
    span: 'TextView', button: 'com.google.android.material.button.MaterialButton',
    input: 'EditText', img: 'ImageView'
};

class ShiftLayout {
    constructor(options = {}) {
        this.opts = {
            prefix: options.prefix ?? 'sl', // Changed prefix to 'sl' for ShiftLayout
            defaultPadding: options.defaultPadding ?? '16dp'
        };
        this.idCount = 0;
        this.lastTopLevelId = null;
    }

    sanitizeColor(val) {
        if (!val) return null;
        const clean = val.trim().toLowerCase();
        return COLOR_MAP[clean] || (clean.startsWith('#') ? val.toUpperCase() : '#000000');
    }

    getAndroidAttrs(node, index, depth) {
        const attrs = {
            'android:layout_width': 'wrap_content',
            'android:layout_height': 'wrap_content'
        };

        const rawId = node.attr('id') || `${this.opts.prefix}_${this.idCount++}`;
        const cleanId = `@+id/${rawId.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
        attrs['android:id'] = cleanId;

        const tag = node.prop('tagName').toLowerCase();
        if (TAG_MAP[tag] === 'LinearLayout') attrs['android:orientation'] = 'vertical';

        const styleStr = node.attr('style') || "";
        // Logic check for centering or bottom sticking
        const isCenter = styleStr.includes('vertical-align: center') || (styleStr.includes('top: 0') && styleStr.includes('bottom: 0'));

        if (depth === 0) {
            attrs['app:layout_constraintStart_toStartOf'] = 'parent';
            attrs['app:layout_constraintEnd_toEndOf'] = 'parent';

            if (isCenter) {
                attrs['app:layout_constraintTop_toTopOf'] = 'parent';
                attrs['app:layout_constraintBottom_toBottomOf'] = 'parent';
            } else if (styleStr.includes('bottom: 0')) {
                attrs['app:layout_constraintBottom_toBottomOf'] = 'parent';
            } else {
                if (index === 0) {
                    attrs['app:layout_constraintTop_toTopOf'] = 'parent';
                } else if (this.lastTopLevelId) {
                    attrs['app:layout_constraintTop_toBottomOf'] = this.lastTopLevelId;
                }
                this.lastTopLevelId = cleanId;
            }
        } else {
            attrs['android:layout_gravity'] = 'center_horizontal';
        }

        styleStr.split(';').forEach(pair => {
            const [k, v] = pair.split(':').map(s => s?.trim());
            if (!k || !v) return;
            if (k === 'background-color') attrs['android:background'] = this.sanitizeColor(v);
            if (k === 'color') attrs['android:textColor'] = this.sanitizeColor(v);
            if (k === 'font-size') attrs['android:textSize'] = v.replace('px', 'sp');
            if (k === 'padding') attrs['android:padding'] = v.replace('px', 'dp');
            if (k === 'margin') attrs['android:layout_margin'] = v.replace('px', 'dp');
            if (k === 'width' && v === '100%') attrs['android:layout_width'] = 'match_parent';
        });

        const text = node.clone().children().remove().end().text().trim();
        if (text) attrs['android:text'] = text;
        if (tag === 'input') {
            attrs['android:hint'] = node.attr('placeholder') || '';
            attrs['android:layout_width'] = 'match_parent'; 
        }
        if (tag === 'button') attrs['app:backgroundTint'] = attrs['android:background'] || '#0000FF';

        return attrs;
    }

    buildXmlString(name, attrs, children = []) {
        const attrLines = Object.entries(attrs).map(([k, v]) => `    ${k}="${v}"`).join('\n');
        const openTag = `<${name}\n${attrLines}`;
        return children.length === 0 ? `${openTag} />` : `${openTag}>\n${children.join('\n').split('\n').map(l => '    ' + l).join('\n')}\n</${name}>`;
    }

    convertNode($, el, index, depth) {
        const node = $(el);
        const tag = node.prop('tagName')?.toLowerCase();
        if (!tag || ['script', 'style'].includes(tag)) return null;

        const androidTag = TAG_MAP[tag] || 'View';
        const attrs = this.getAndroidAttrs(node, index, depth);
        const children = [];
        node.children().each((i, child) => {
            const result = this.convertNode($, child, i, depth + 1);
            if (result) children.push(result);
        });
        return this.buildXmlString(androidTag, attrs, children);
    }

    convert(html) {
        const $ = cheerio.load(html);
        const body = $('body').length ? $('body') : $.root();
        const rootAttrs = {
            'xmlns:android': 'http://schemas.android.com/apk/res/android',
            'xmlns:app': 'http://schemas.android.com/apk/res-auto',
            'android:layout_width': 'match_parent',
            'android:layout_height': 'match_parent',
            'android:padding': this.opts.defaultPadding
        };
        this.idCount = 0;
        this.lastTopLevelId = null;
        const content = [];
        body.children().each((i, el) => {
            const converted = this.convertNode($, el, i, 0);
            if (converted) content.push(converted);
        });
        return `<?xml version="1.0" encoding="utf-8"?>\n${this.buildXmlString('androidx.constraintlayout.widget.ConstraintLayout', rootAttrs, content)}`;
    }
}

module.exports = ShiftLayout;
