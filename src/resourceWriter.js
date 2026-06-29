const fs = require('node:fs');
const path = require('node:path');
const { sanitizeResourceName } = require('./utils');
const svgToVector = require('./svgToVector');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const DENSITIES = new Set(['ldpi', 'mdpi', 'tvdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi', 'nodpi']);

function writeResources(outputDir, result, options = {}) {
    if (!result || typeof result !== 'object') throw new TypeError('result must be a ShiftLayout conversion result.');
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('write options must be an object.');

    const outputRoot = path.resolve(outputDir);
    const baseDir = path.resolve(options.baseDir || process.cwd());
    const layoutName = sanitizeResourceName(options.layoutName || 'activity_main', 'activity_main');
    const report = { writtenFiles: [], copiedImages: [], skippedImages: [], warnings: [] };

    fs.mkdirSync(outputRoot, { recursive: true });
    writeFile(outputRoot, `res/layout/${layoutName}.xml`, result.layout || '', report);
    writeMap(outputRoot, 'res/drawable', result.drawables, report);
    writeMap(outputRoot, 'res/menu', result.menus, report);
    writeMap(outputRoot, 'res/values', result.values, report);
    writeFile(outputRoot, 'assets/images.json', JSON.stringify(result.assets?.images || [], null, 2), report);
    writeFile(outputRoot, 'diagnostics/warnings.json', JSON.stringify(result.warnings || [], null, 2), report);

    for (const image of result.assets?.images || []) {
        copyLocalImage(outputRoot, baseDir, image, options, report);
    }
    writeFile(outputRoot, 'diagnostics/assets.json', JSON.stringify({
        copiedImages: report.copiedImages,
        skippedImages: report.skippedImages,
        warnings: report.warnings,
    }, null, 2), report);

    return report;
}

function writeMap(outputRoot, directory, files, report) {
    for (const [filename, contents] of Object.entries(files || {})) {
        writeFile(outputRoot, path.join(directory, filename), contents, report);
    }
}

function writeFile(outputRoot, relativePath, contents, report) {
    const target = resolveInside(outputRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, 'utf8');
    report.writtenFiles.push(target);
}

function copyLocalImage(outputRoot, baseDir, image, options, report) {
    const source = String(image.source || '');
    if (!source || isRemoteSource(source)) {
        report.skippedImages.push({ source, resource: image.resource, reason: 'remote' });
        return;
    }

    const cleanSource = decodePath(source.split(/[?#]/)[0]);
    const candidate = resolveSource(baseDir, cleanSource);
    if (!candidate || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
        warnImage(report, 'missing-image', source, `Local image "${source}" was not found beneath baseDir.`);
        return;
    }

    const realBase = fs.realpathSync(baseDir);
    const realSource = fs.realpathSync(candidate);
    if (!isInside(realBase, realSource)) {
        warnImage(report, 'image-outside-base-dir', source, `Local image "${source}" resolves outside baseDir and was not copied.`);
        return;
    }

    const extension = path.extname(cleanSource).toLowerCase();
    if (extension === '.svg') {
        copySvgVector(outputRoot, realSource, source, image, options, report);
        return;
    }
    if (!IMAGE_EXTENSIONS.has(extension)) {
        warnImage(report, 'unsupported-image-format', source, `Image format "${extension || '(none)'}" cannot be copied as an Android bitmap drawable.`);
        return;
    }

    const density = resolveDensity(image, source, options, report);
    const drawableDirectory = density ? `drawable-${density}` : 'drawable';
    const filename = `${sanitizeResourceName(image.resource, 'image')}${extension}`;
    const target = resolveInside(outputRoot, path.join('res', drawableDirectory, filename));
    if (hasResourceNameConflict(path.dirname(target), image.resource, target)) {
        warnImage(report, 'drawable-name-conflict', source, `Drawable resource "${image.resource}" already exists in ${drawableDirectory}.`);
        return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(realSource, target);
    report.writtenFiles.push(target);
    report.copiedImages.push({ source, target, resource: image.resource, density });
}

function copySvgVector(outputRoot, realSource, source, image, options, report) {
    const converted = svgToVector(fs.readFileSync(realSource, 'utf8'), {
        autoMirrored: options.autoMirrorVectors === true,
    });
    for (const item of converted.warnings) report.warnings.push({ ...item, source });
    if (!converted.xml) {
        report.skippedImages.push({ source, resource: image.resource, reason: 'svg-conversion-failed' });
        return;
    }

    const resource = sanitizeResourceName(image.resource, 'image');
    const target = resolveInside(outputRoot, path.join('res', 'drawable', `${resource}.xml`));
    if (hasResourceNameConflict(path.dirname(target), resource, target)) {
        warnImage(report, 'drawable-name-conflict', source, `Drawable resource "${resource}" already exists in drawable.`);
        return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, converted.xml, 'utf8');
    report.writtenFiles.push(target);
    report.copiedImages.push({ source, target, resource, density: null, format: 'vector' });
}

function hasResourceNameConflict(directory, resource, target) {
    if (!fs.existsSync(directory)) return false;
    const normalizedTarget = path.resolve(target);
    return fs.readdirSync(directory).some(filename => {
        const candidate = path.resolve(directory, filename);
        return path.parse(filename).name === sanitizeResourceName(resource, 'image') && candidate !== normalizedTarget;
    });
}

function resolveDensity(image, source, options, report) {
    const configured = options.imageDensities?.[source] || image.density || inferDensity(source) || options.defaultImageDensity || null;
    if (!configured) return null;
    const density = String(configured).toLowerCase().replace(/^drawable-/, '');
    if (DENSITIES.has(density)) return density;
    warnImage(report, 'invalid-image-density', source, `Image density "${configured}" is not a supported Android drawable qualifier.`);
    return null;
}

function inferDensity(source) {
    const pathDensity = /(?:^|[\\/])(ldpi|mdpi|tvdpi|hdpi|xhdpi|xxhdpi|xxxhdpi|nodpi)(?:[\\/]|$)/i.exec(source);
    if (pathDensity) return pathDensity[1].toLowerCase();
    const scale = /@(1|1\.5|2|3|4)x(?=\.[^./?#]+(?:[?#]|$))/i.exec(source)?.[1];
    return { '1': 'mdpi', '1.5': 'hdpi', '2': 'xhdpi', '3': 'xxhdpi', '4': 'xxxhdpi' }[scale] || null;
}

function resolveSource(baseDir, source) {
    const absolute = path.resolve(source);
    if (path.isAbsolute(source) && isInside(baseDir, absolute)) return absolute;
    if (path.isAbsolute(source) && /^[A-Za-z]:[\\/]/.test(source)) return absolute;
    return path.resolve(baseDir, source.replace(/^[\\/]+/, ''));
}

function resolveInside(root, relativePath) {
    const target = path.resolve(root, relativePath);
    if (!isInside(root, target)) throw new Error(`Refusing to write outside outputDir: ${relativePath}`);
    return target;
}

function isInside(root, target) {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isRemoteSource(source) {
    return /^(?:https?:|data:|blob:|\/\/)/i.test(source);
}

function decodePath(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function warnImage(report, code, source, message) {
    report.warnings.push({ severity: 'warning', code, source, message });
    report.skippedImages.push({ source, reason: code });
}

module.exports = writeResources;
