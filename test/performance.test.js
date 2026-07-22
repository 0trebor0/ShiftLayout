const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

const ShiftLayout = require('..');

const configuredBudget = process.env.SHIFTLAYOUT_PERF_BUDGET_MS;
const budgetMs = configuredBudget === undefined ? null : Number(configuredBudget);
if (budgetMs !== null && (!Number.isFinite(budgetMs) || budgetMs <= 0)) {
    throw new TypeError('SHIFTLAYOUT_PERF_BUDGET_MS must be a positive number.');
}

function runFixture(name, html, verify) {
    const start = performance.now();
    const result = new ShiftLayout().convert(html);
    const durationMs = performance.now() - start;

    verify(result);
    if (budgetMs !== null) {
        assert.ok(durationMs <= budgetMs, `${name} took ${durationMs.toFixed(1)}ms (budget: ${budgetMs}ms)`);
    }

    const metrics = {
        fixture: name,
        inputBytes: Buffer.byteLength(html),
        outputBytes: Buffer.byteLength(result.layout),
        warnings: result.warnings.length,
        durationMs: Number(durationMs.toFixed(1)),
    };
    process.stdout.write(`${JSON.stringify(metrics)}\n`);
}

const rowCount = 1500;
const rows = Array.from({ length: rowCount }, (_, index) => `
    <section id="row_${index}" class="row">
        <h2>Row ${index}</h2>
        <p data-kind="description">Description ${index}</p>
    </section>
`).join('');
runFixture('large-document', `
    <style>
        .row { padding: 8px; color: #123456; }
        .row [data-kind="description"] { font-size: 14px; }
    </style>
    <main>${rows}</main>
`, result => {
    assert.equal(result.warnings.length, 0);
    assert.match(result.layout, /android:id="@\+id\/row_0"/);
    assert.match(result.layout, new RegExp(`android:id="@\\+id\\/row_${rowCount - 1}"`));
});

const nestingDepth = 300;
let deeplyNested = '<p id="deepest">Deep content</p>';
for (let depth = nestingDepth - 1; depth >= 0; depth--) {
    deeplyNested = `<div id="depth_${depth}">${deeplyNested}</div>`;
}
runFixture('deeply-nested-document', deeplyNested, result => {
    assert.equal(result.warnings.length, 0);
    assert.match(result.layout, /android:id="@\+id\/depth_0"/);
    assert.match(result.layout, /android:id="@\+id\/deepest"/);
});

