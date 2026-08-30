#!/usr/bin/env node
/**
 * Validates module.json and every asset the module points at.
 *
 * Run locally with `npm run validate`; CI runs the same script so a broken
 * manifest, a dangling template path or a missing i18n key can never reach a
 * release. Reports every problem it finds, then exits non-zero if any of them
 * is an error.
 *
 * Errors break the module at runtime. Warnings are drift worth knowing about
 * (Foundry degrades gracefully: a missing translation falls back to English).
 */
import { readFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const I18N_NAMESPACE = 'TOKEN_REPLACER_FA';

/**
 * Key prefixes whose leaves are built at runtime (`errors.${errorType}`), so a
 * static scan can never see them used. Defined-but-unused warnings are
 * suppressed under these.
 */
const DYNAMIC_KEY_PREFIXES = [`${I18N_NAMESPACE}.errors.`, `${I18N_NAMESPACE}.recovery.`];

const errors = [];
const warnings = [];
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

// ── manifest ────────────────────────────────────────────────────────────────
let manifest;
try {
  manifest = JSON.parse(readFileSync(path.join(ROOT, 'module.json'), 'utf8'));
} catch (error) {
  console.error(`module.json is not readable JSON: ${error.message}`);
  process.exit(1);
}

for (const field of [
  'id',
  'title',
  'version',
  'compatibility',
  'manifest',
  'download',
  'esmodules',
]) {
  if (!manifest[field]) fail(`module.json is missing required field "${field}"`);
}

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(manifest.version ?? '')) {
  fail(`version "${manifest.version}" is not semver`);
}

// ── compatibility ───────────────────────────────────────────────────────────
const compatibility = manifest.compatibility ?? {};
const generation = (value) => Number.parseInt(String(value ?? ''), 10);

if (!compatibility.minimum) fail('compatibility.minimum is required');
if (!compatibility.verified) fail('compatibility.verified is required');
if (
  compatibility.minimum &&
  compatibility.verified &&
  generation(compatibility.minimum) > generation(compatibility.verified)
) {
  fail(
    `compatibility.minimum (${compatibility.minimum}) is newer than compatibility.verified (${compatibility.verified})`
  );
}

// Setting a maximum locks the module out of every future Foundry generation,
// which defeats the automatic-compatibility policy this project follows
// (see .github/workflows/foundry-compat.yml).
if (compatibility.maximum) {
  fail(
    `compatibility.maximum is set to "${compatibility.maximum}" — leave it unset so new Foundry generations are not blocked`
  );
}

// ── version consistency across the repo ─────────────────────────────────────
// build.sh runs sync-version.sh, but a hand-edited module.json committed
// without a build leaves package.json and the JSDoc banner behind.
if (existsSync(path.join(ROOT, 'package.json'))) {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (pkg.version !== manifest.version) {
    fail(
      `package.json says version ${pkg.version} but module.json says ${manifest.version} — run bash sync-version.sh`
    );
  }
}

// ── release URLs ────────────────────────────────────────────────────────────
if (manifest.download && !manifest.download.includes(`v${manifest.version}`)) {
  fail(`download URL does not reference v${manifest.version}: ${manifest.download}`);
}
if (manifest.manifest && !manifest.manifest.includes('releases/latest/download/module.json')) {
  warn(
    'manifest URL should point at releases/latest/download/module.json so Foundry can auto-update the module'
  );
}

// ── referenced files exist ──────────────────────────────────────────────────
const referenced = [
  ...(manifest.esmodules ?? []),
  ...(manifest.scripts ?? []),
  ...(manifest.styles ?? []),
  ...(manifest.languages ?? []).map((language) => language.path),
];
for (const file of referenced) {
  if (!existsSync(path.join(ROOT, file))) fail(`module.json references a missing file: ${file}`);
}

// ── source collection ───────────────────────────────────────────────────────
const collectFiles = async (directory, extensions) => {
  const entries = await readdir(path.join(ROOT, directory), {
    withFileTypes: true,
    recursive: true,
  });
  return entries
    .filter(
      (entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))
    )
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
};

const scriptFiles = await collectFiles('scripts', ['.js']);
const templateFiles = await collectFiles('templates', ['.hbs', '.html']);

// ── i18n keys used in source must exist ─────────────────────────────────────
// Three shapes are in play:
//   1. any fully-qualified string literal — `game.i18n.localize('NS.x')`, but
//      also the bare `name:`/`hint:` strings handed to game.settings.register,
//      which Foundry localizes for us and which no `localize(` pattern sees;
//   2. the cached wrapper in main.js (`this.i18n('notifications.started')`),
//      which prefixes the namespace itself;
//   3. `{{localize "NS.x"}}` inside a Handlebars template.
const QUALIFIED_KEY = new RegExp(`["'\`](${I18N_NAMESPACE}\\.[A-Za-z0-9_$.{}]+)["'\`]`, 'g');
const WRAPPER_KEY = /\bi18n\(\s*["'`]([A-Za-z0-9_$.{}]+)["'`]/g;
const TEMPLATE_KEY = new RegExp(`localize\\s+"(${I18N_NAMESPACE}\\.[^"]+)"`, 'g');

const usedKeys = new Set();
for (const file of scriptFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(QUALIFIED_KEY)) usedKeys.add(match[1]);
  for (const match of source.matchAll(WRAPPER_KEY)) usedKeys.add(`${I18N_NAMESPACE}.${match[1]}`);
}
for (const file of templateFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(TEMPLATE_KEY)) usedKeys.add(match[1]);
}

// ── language files ──────────────────────────────────────────────────────────
const flatten = (object, prefix = '') =>
  Object.entries(object).reduce((accumulator, [key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(accumulator, flatten(value, `${prefix}${key}.`));
    } else {
      accumulator[`${prefix}${key}`] = value;
    }
    return accumulator;
  }, {});

const languageKeys = new Map();
for (const language of manifest.languages ?? []) {
  const file = path.join(ROOT, language.path);
  if (!existsSync(file)) continue;
  try {
    languageKeys.set(
      language.lang,
      new Set(Object.keys(flatten(JSON.parse(readFileSync(file, 'utf8')))))
    );
  } catch (error) {
    fail(`${language.path} is not valid JSON: ${error.message}`);
  }
}

const englishKeys = languageKeys.get('en');
if (englishKeys) {
  for (const key of usedKeys) {
    if (key.includes('${')) continue; // interpolated key — resolved at runtime
    if (!englishKeys.has(key))
      fail(`i18n key used in source but missing from lang/en.json: ${key}`);
  }
  for (const key of englishKeys) {
    if (usedKeys.has(key)) continue;
    if (DYNAMIC_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    warn(`i18n key defined but never used: ${key}`);
  }
}

// ── translation parity ──────────────────────────────────────────────────────
// A missing translation degrades gracefully in Foundry (the key falls back to
// English), so this warns rather than fails — but silent drift is exactly how
// a secondary language quietly falls dozens of keys behind.
if (englishKeys) {
  for (const [lang, keys] of languageKeys) {
    if (lang === 'en') continue;
    const missing = [...englishKeys].filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !englishKeys.has(key));
    if (missing.length > 0) {
      warn(
        `lang/${lang}.json is missing ${missing.length} key(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', ...' : ''}`
      );
    }
    if (extra.length > 0) {
      warn(
        `lang/${lang}.json defines ${extra.length} key(s) that no longer exist in English: ${extra.slice(0, 5).join(', ')}`
      );
    }
  }
}

// ── runtime asset paths referenced from source exist ────────────────────────
// Covers both `renderTemplate('modules/${MODULE_ID}/templates/x.hbs')` and the
// Web Worker URL, which is loaded by path and therefore invisible to the
// bundler, the manifest and the linter alike — a rename here fails only at
// runtime, in a user's world.
const ASSET_PATH = /modules\/[^"'`\s)]+\.(?:hbs|html|js|css|json)/g;
const packagedPaths = new Set();
for (const file of scriptFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(ASSET_PATH)) {
    const resolved = match[0].replace(/\$\{MODULE_ID\}/g, manifest.id);
    if (resolved.includes('${')) continue;
    // Other modules' assets are none of our business.
    if (!resolved.startsWith(`modules/${manifest.id}/`)) continue;
    const relative = resolved.slice(`modules/${manifest.id}/`.length);
    packagedPaths.add(relative);
    if (!existsSync(path.join(ROOT, relative))) {
      fail(`${path.relative(ROOT, file)} references a missing asset: ${match[0]}`);
    }
  }
}

// ── every template on disk should actually be reachable ─────────────────────
for (const file of templateFiles) {
  const relative = path.relative(ROOT, file);
  if (!packagedPaths.has(relative)) warn(`template is never rendered from source: ${relative}`);
}

// ── hardcoded user-visible text in templates ────────────────────────────────
// Every one of the eight templates currently ships English text inline
// (">Total Tokens<", ">Show Details<", ">Scanning token artwork...<"), so an
// Italian user reads an English dialog. Constitution Article III.1 forbids it.
//
// TODO(you): implement this check. The trade-off is the policy, not the regex:
//   - `fail()` makes the rule real but turns the whole suite red until all
//     ~40 strings are moved into lang/en.json — a big, blocking first commit;
//   - `warn()` reports the drift and lets it be paid down template by template,
//     but a warning nobody clears is a warning everyone stops reading;
//   - a third option: fail only for templates added or changed after today,
//     freezing the existing debt without letting it grow.
// Text nodes to skip: pure `{{expressions}}`, whitespace, numbers, and single
// punctuation. Attribute values (title=, placeholder=) are user-visible too.
const checkHardcodedText = (source, file) => {
  void source;
  void file;
};
for (const file of templateFiles) {
  checkHardcodedText(readFileSync(file, 'utf8'), path.relative(ROOT, file));
}

// ── handlebars partials referenced from templates exist ────────────────────
const PARTIAL_PATTERN = /\{\{>\s*"?(modules\/[^"\s}]+)"?\s*\}\}/g;
for (const file of templateFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(PARTIAL_PATTERN)) {
    const relative = match[1].replace(`modules/${manifest.id}/`, '');
    if (!existsSync(path.join(ROOT, relative))) {
      fail(`${path.relative(ROOT, file)} references a missing partial: ${match[1]}`);
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────
for (const message of warnings) console.warn(`::warning::${message}`);
for (const message of errors) console.error(`::error::${message}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s) found in module.json validation`);
  process.exit(1);
}

console.log(
  `module.json OK — ${manifest.id} v${manifest.version} (Foundry ${compatibility.minimum}+, verified ${compatibility.verified})`
);
console.log(
  `  ${referenced.length} manifest file(s), ${packagedPaths.size} runtime asset(s), ${usedKeys.size} i18n key(s) in use, ${warnings.length} warning(s)`
);
