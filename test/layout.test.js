const assert = require('node:assert/strict');
const test = require('node:test');

const ShiftLayout = require('..');

test('advanced flex containers retain direction, wrapping, ordering, and item sizing', () => {
    const result = new ShiftLayout().convert(`
        <section id="flex" style="display:flex; flex-wrap:wrap; justify-content:space-between">
            <p id="later" style="order:2; flex:1 0 40%">Later</p>
            <p id="first" style="order:1">First</p>
        </section>
    `);
    assert.match(result.layout, /com\.google\.android\.flexbox\.FlexboxLayout/);
    assert.match(result.layout, /app:flexWrap="wrap"/);
    assert.match(result.layout, /app:justifyContent="space_between"/);
    assert.ok(result.layout.indexOf('@+id/first') < result.layout.indexOf('@+id/later'));
    assert.match(result.layout, /android:id="@\+id\/later"[\s\S]*app:layout_flexBasisPercent="40%"/);
});

test('grid placement maps track counts, positions, spans, and gaps', () => {
    const result = new ShiftLayout().convert(`
        <section id="grid" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px 12px">
            <p id="cell" style="grid-column:2 / span 2; grid-row:1 / span 2">Cell</p>
        </section>
    `);
    assert.match(result.layout, /<GridLayout/);
    assert.match(result.layout, /android:columnCount="3"/);
    assert.match(result.layout, /android:id="@\+id\/cell"[\s\S]*android:layout_column="1"/);
    assert.match(result.layout, /android:id="@\+id\/cell"[\s\S]*android:layout_columnSpan="2"/);
    assert.match(result.layout, /android:id="@\+id\/cell"[\s\S]*android:layout_rowSpan="2"/);
});

test('absolute children use parent-aware FrameLayout positioning', () => {
    const result = new ShiftLayout().convert(`
        <section id="frame" style="position:relative">
            <p id="badge" style="position:absolute; right:12px; bottom:8px">Badge</p>
        </section>
    `);
    assert.match(result.layout, /<FrameLayout/);
    assert.match(result.layout, /android:id="@\+id\/badge"[\s\S]*android:layout_gravity="end\|bottom"/);
    assert.match(result.layout, /android:id="@\+id\/badge"[\s\S]*android:layout_marginRight="12dp"/);
    assert.match(result.layout, /android:id="@\+id\/badge"[\s\S]*android:layout_marginBottom="8dp"/);
});
