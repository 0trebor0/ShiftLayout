const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ShiftLayout = require('..');

test('value extraction rewrites repeated literals and returns manifests', () => {
    const result = new ShiftLayout({ extractResources: true }).convert(`
        <p style="color: #123456; margin: 8px">Repeated</p>
        <p style="color: #123456; margin: 8px">Repeated</p>
    `);
    assert.match(result.layout, /@color\/sl_color_123456/);
    assert.match(result.layout, /@dimen\/sl_dimen_8dp/);
    assert.match(result.layout, /@string\/sl_string_repeated/);
    assert.equal(result.extractedResources.colors.sl_color_123456, '#123456');
});

test('font resources and contained files are written to res/font', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shiftlayout-resource-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, 'source');
    const output = path.join(root, 'output');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'app.ttf'), Buffer.from('font-fixture'));

    const result = new ShiftLayout().convert(`
        <style>@font-face { font-family: App; src: url(app.ttf); font-weight: 600; }</style>
        <p style="font-family: App">Font resource</p>
    `);
    const report = ShiftLayout.writeResources(output, result, { baseDir: source });

    assert.match(result.layout, /android:fontFamily="@font\/sl_font_app"/);
    assert.ok(fs.existsSync(path.join(output, 'res', 'font', 'sl_font_app.xml')));
    assert.ok(fs.existsSync(path.join(output, 'res', 'font', 'sl_font_app_600_normal.ttf')));
    assert.equal(report.copiedFonts.length, 1);
    assert.ok(fs.existsSync(path.join(output, 'assets', 'fonts.json')));
});

test('unmapped remote fonts produce diagnostics and preserve a generic fallback', () => {
    const result = new ShiftLayout().convert(`
        <style>
            @font-face { font-family: Hosted; src: url(https://example.com/hosted.woff2); }
            p { font-family: Hosted, serif; }
        </style>
        <p>Fallback</p>
    `);
    assert.match(result.layout, /android:fontFamily="serif"/);
    assert.ok(result.warnings.some(warning => warning.code === 'unmapped-web-font'));
});
