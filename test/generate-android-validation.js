const fs = require('node:fs');
const path = require('node:path');

const ShiftLayout = require('..');

const outputDir = process.argv[2];
if (!outputDir) {
    throw new Error('An output directory is required.');
}
const resolvedOutputDir = path.resolve(outputDir);
const fixtureSourceDir = path.join(resolvedOutputDir, 'fixture-source');
fs.mkdirSync(fixtureSourceDir, { recursive: true });
fs.writeFileSync(path.join(fixtureSourceDir, 'validation.ttf'), Buffer.from('validation-font'));

const html = `
<style>
    @font-face { font-family: ValidationFont; src: url("validation.ttf"); }
    #validation_screen { font-family: ValidationFont, sans-serif; }
    #validation_title::before { content: "Validated: "; }
    #summary_card::after { content: "Ready"; color: #123456; margin-top: 4px; }
</style>
<main id="validation_screen">
    <section id="summary_card" style="background-color: #FFFFFF; border: 1px solid #CCCCCC; border-radius: 12px; padding: 16px;">
        <h1 id="validation_title" style="color: #123456; font-size: 24px;">Validation fixture</h1>
        <p style="color: #123456;">Shared label</p>
        <p style="color: #123456;">Shared label</p>
        <input id="email" type="email" placeholder="Email address" required
            data-helper-text="Use your work email" data-error="Enter a valid email" aria-invalid="true">
        <select id="plan">
            <option>Starter</option>
            <option>Team</option>
        </select>
    </section>
    <nav id="fixture_nav">
        <a>Home</a>
        <a>Profile</a>
    </nav>
    <video id="fixture_video" src="media/demo.mp4" controls width="320" height="180"></video>
    <canvas id="fixture_canvas" width="320" height="180">Chart fallback</canvas>
</main>
`;

const converter = new ShiftLayout({ prefix: 'validation', extractResources: true });
const result = converter.convert(html, { strict: true });
const report = ShiftLayout.writeResources(resolvedOutputDir, result, {
    baseDir: fixtureSourceDir,
    layoutName: 'validation_screen',
});

process.stdout.write(`Generated ${report.writtenFiles.length} Android validation resources.\n`);
