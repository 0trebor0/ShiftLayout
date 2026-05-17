const fs = require('node:fs');
const path = require('node:path');
const ShiftLayout = require('..');

const html = `
<main>
    <h1 style="font-size: 24px; font-weight: bold;">Welcome</h1>
    <img src="assets/logo.png" alt="Company logo" width="96">
    <select id="plan">
        <option>Starter</option>
        <option>Team</option>
    </select>
</main>
`;

const outputDir = path.join(__dirname, 'android-output');
const converter = new ShiftLayout({ prefix: 'demo' });
const result = converter.convert(html);

fs.rmSync(outputDir, { recursive: true, force: true });

writeFile('res/layout/activity_main.xml', result.layout);
writeResourceMap('res/drawable', result.drawables);
writeResourceMap('res/menu', result.menus);
writeResourceMap('res/values', result.values);
writeFile('assets/images.json', JSON.stringify(result.assets.images, null, 2));

console.log(`Wrote Android resources to ${outputDir}`);

function writeResourceMap(baseDir, files) {
    for (const [filename, contents] of Object.entries(files)) {
        writeFile(path.join(baseDir, filename), contents);
    }
}

function writeFile(relativePath, contents) {
    const target = path.join(outputDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, 'utf8');
}
