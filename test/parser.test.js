const assert = require('node:assert/strict');
const test = require('node:test');

const {
    matchesMediaQuery,
    normalizeMediaProfile,
    parseCssStylesheet,
    parseFontFaces,
    parseStyleDeclarations,
    selectorSpecificity,
} = require('../src/utils');

test('style declarations preserve functions and important precedence', () => {
    assert.deepEqual(parseStyleDeclarations('color: var(--brand, rgb(1, 2, 3)) !important; width: calc(100% - 8px)'), [
        { property: 'color', value: 'var(--brand, rgb(1, 2, 3))', important: true },
        { property: 'width', value: 'calc(100% - 8px)', important: false },
    ]);
});

test('stylesheet parsing retains nested media conditions and selector specificity', () => {
    const rules = parseCssStylesheet('@media screen { @media (min-width: 600px) { #app .card > p { color: red; } } }');
    assert.equal(rules.length, 1);
    assert.deepEqual(rules[0].mediaConditions, ['screen', '(min-width: 600px)']);
    assert.deepEqual(selectorSpecificity('#app .card > p'), [1, 1, 1]);
});

test('font-face parsing finds top-level and media-nested declarations', () => {
    assert.deepEqual(parseFontFaces(`
        @font-face { font-family: App; src: url(app.ttf); font-weight: 400; }
        @media screen { @font-face { font-family: App; src: url(app-bold.otf); font-weight: 700; } }
    `), [
        { 'font-family': 'App', src: 'url(app.ttf)', 'font-weight': '400' },
        { 'font-family': 'App', src: 'url(app-bold.otf)', 'font-weight': '700' },
    ]);
});

test('media profiles normalize dimensions and match combined conditions', () => {
    const profile = normalizeMediaProfile({ width: '50rem', height: 600 });
    assert.deepEqual(profile, { type: 'screen', width: 800, height: 600, orientation: 'landscape' });
    assert.equal(matchesMediaQuery('screen and (min-width: 48rem) and (orientation: landscape)', profile), true);
    assert.equal(matchesMediaQuery('print, (max-width: 700px)', profile), false);
});
