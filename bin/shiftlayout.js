#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const ShiftLayout = require('..');

const VALUE_OPTIONS = new Set([
    '--output', '--layout-name', '--prefix', '--default-image-density',
    '--media-width', '--media-height', '--media-orientation', '--media-type',
]);

function usage() {
    return `Usage: shiftlayout <input.html> [options]

Options:
  -o, --output <dir>               Output directory (default: android-output)
      --layout-name <name>         Layout resource name (default: activity_main)
      --prefix <prefix>            Prefix for generated IDs (default: sl)
      --default-image-density <q>  Default Android drawable density qualifier
      --media-width <size>         Target media-query width
      --media-height <size>        Target media-query height
      --media-orientation <value>  portrait or landscape
      --media-type <type>          Media type (default: screen)
      --font-source <url> <path>   Map a declared web-font URL to a local font or @font reference
      --strict                     Fail if conversion produces warnings
      --extract-resources          Extract repeated colors, dimensions, and strings
  -h, --help                       Show this help
`;
}

function parseArgs(argv) {
    const options = {};
    const positionals = [];

    for (let i = 0; i < argv.length; i++) {
        let arg = argv[i];
        if (arg === '-h' || arg === '--help') return { help: true };
        if (arg === '--strict') {
            options.strict = true;
            continue;
        }
        if (arg === '--extract-resources') {
            options.extractResources = true;
            continue;
        }
        if (arg === '--font-source') {
            const declaredSource = argv[++i];
            const mappedSource = argv[++i];
            if (declaredSource === undefined || mappedSource === undefined
                || declaredSource.startsWith('--') || mappedSource.startsWith('--')) {
                throw new Error('--font-source requires a declared URL and a local path or @font reference.');
            }
            options.fontSources ||= {};
            options.fontSources[declaredSource] = mappedSource;
            continue;
        }
        if (arg === '-o') arg = '--output';
        if (VALUE_OPTIONS.has(arg)) {
            const value = argv[++i];
            if (value === undefined || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
            options[arg.slice(2)] = value;
            continue;
        }
        if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        positionals.push(arg);
    }

    if (positionals.length !== 1) throw new Error('Exactly one input HTML file is required.');
    return { input: positionals[0], options };
}

function mediaOptions(options) {
    const media = {};
    if (options['media-width'] !== undefined) media.width = options['media-width'];
    if (options['media-height'] !== undefined) media.height = options['media-height'];
    if (options['media-orientation'] !== undefined) media.orientation = options['media-orientation'];
    if (options['media-type'] !== undefined) media.type = options['media-type'];
    return Object.keys(media).length ? media : undefined;
}

function main(argv) {
    let parsed;
    try {
        parsed = parseArgs(argv);
    } catch (error) {
        process.stderr.write(`${error.message}\n\n${usage()}`);
        return 2;
    }
    if (parsed.help) {
        process.stdout.write(usage());
        return 0;
    }

    const inputFile = path.resolve(parsed.input);
    const outputDir = path.resolve(parsed.options.output || 'android-output');
    try {
        const html = fs.readFileSync(inputFile, 'utf8');
        const converter = new ShiftLayout({
            prefix: parsed.options.prefix,
            extractResources: parsed.options.extractResources === true,
        });
        const result = converter.convert(html, {
            strict: parsed.options.strict === true,
            media: mediaOptions(parsed.options),
            fontSources: parsed.options.fontSources,
        });
        const report = ShiftLayout.writeResources(outputDir, result, {
            baseDir: path.dirname(inputFile),
            layoutName: parsed.options['layout-name'],
            defaultImageDensity: parsed.options['default-image-density'],
        });
        process.stdout.write(`Wrote ${report.writtenFiles.length} files to ${outputDir}\n`);
        if (result.warnings.length || report.warnings.length) {
            process.stderr.write(`Completed with ${result.warnings.length + report.warnings.length} warning(s).\n`);
        }
        return 0;
    } catch (error) {
        process.stderr.write(`${error.name || 'Error'}: ${error.message}\n`);
        if (Array.isArray(error.warnings)) {
            for (const warning of error.warnings) {
                process.stderr.write(`- ${warning.code}: ${warning.message}\n`);
            }
        }
        return 1;
    }
}

process.exitCode = main(process.argv.slice(2));
