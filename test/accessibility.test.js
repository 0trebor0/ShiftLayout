const assert = require('node:assert/strict');
const test = require('node:test');

const ShiftLayout = require('..');

test('ARIA labels, states, and live regions map to Android accessibility attributes', () => {
    const result = new ShiftLayout().convert(`
        <button id="menu" aria-label="Open menu" aria-expanded="false" aria-pressed="true"></button>
        <p id="status" aria-live="assertive">Failed</p>
    `);
    assert.match(result.layout, /android:id="@\+id\/menu"[\s\S]*android:contentDescription="Open menu"/);
    assert.match(result.layout, /android:id="@\+id\/menu"[\s\S]*android:stateDescription="collapsed, pressed"/);
    assert.match(result.layout, /android:id="@\+id\/status"[\s\S]*android:accessibilityLiveRegion="assertive"/);
});

test('labels target sanitized control IDs', () => {
    const result = new ShiftLayout({ prefix: 'field' }).convert(`
        <label id="pin_label" for="123 pin">PIN</label>
        <input id="123 pin" type="password">
    `);
    assert.match(result.layout, /android:id="@\+id\/pin_label"[\s\S]*android:labelFor="@id\/field_123_pin"/);
    assert.match(result.layout, /android:id="@\+id\/field_123_pin"/);
});

test('decorative content is removed from the accessibility tree', () => {
    const result = new ShiftLayout().convert(`
        <img id="decorative_image" src="divider.png" alt="">
        <span id="decorative_text" aria-hidden="true">Divider</span>
        <div id="presentation" role="presentation">Layout only</div>
    `);
    assert.match(result.layout, /android:id="@\+id\/decorative_image"[\s\S]*android:contentDescription=""/);
    assert.match(result.layout, /android:id="@\+id\/decorative_image"[\s\S]*android:importantForAccessibility="no"/);
    assert.match(result.layout, /android:id="@\+id\/decorative_text"[\s\S]*android:importantForAccessibility="no"/);
    assert.match(result.layout, /android:id="@\+id\/presentation"[\s\S]*android:importantForAccessibility="no"/);
});

test('language and direction metadata map to Android locale and layout direction', () => {
    const result = new ShiftLayout().convert('<p id="arabic" lang="ar" dir="rtl">مرحبا</p>');
    assert.match(result.layout, /android:id="@\+id\/arabic"[\s\S]*android:textDirection="rtl"/);
    assert.match(result.layout, /android:id="@\+id\/arabic"[\s\S]*android:layoutDirection="rtl"/);
    assert.match(result.layout, /android:id="@\+id\/arabic"[\s\S]*android:textLocale="ar"/);
});
