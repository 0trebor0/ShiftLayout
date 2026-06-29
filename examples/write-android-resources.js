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
const report = ShiftLayout.writeResources(outputDir, result, {
    baseDir: __dirname,
    layoutName: 'activity_main',
});

console.log(`Wrote ${report.writtenFiles.length} Android resource files to ${outputDir}`);
