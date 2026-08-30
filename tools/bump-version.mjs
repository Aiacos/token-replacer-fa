#!/usr/bin/env node
/**
 * Bump the module version everywhere it is recorded.
 *
 * Usage: node tools/bump-version.mjs <patch|minor|major|x.y.z>
 *
 * Updates module.json (version + download URL), package.json, and promotes the
 * CHANGELOG "Unreleased" section to the new version. Prints the new version to
 * stdout and writes it to $GITHUB_OUTPUT when running in Actions.
 *
 * The pure helpers are exported so they can be unit-tested without touching
 * the working tree.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Resolve the version a bump argument produces.
 * @param {string} current Current version, e.g. "1.7.0"
 * @param {string} argument "patch" | "minor" | "major" | an explicit "x.y.z"
 * @returns {string}
 * @throws {Error} on an unknown bump type, or when the result would not move
 *   the version — a no-op bump produces a duplicate CHANGELOG heading and then
 *   fails on an empty commit, halfway through a release.
 */
function nextVersion(current, argument) {
  let version;
  if (SEMVER.test(argument)) {
    version = argument;
  } else {
    const [major, minor, patch] = current.split('-')[0].split('.').map(Number);
    if (argument === 'major') version = `${major + 1}.0.0`;
    else if (argument === 'minor') version = `${major}.${minor + 1}.0`;
    else if (argument === 'patch') version = `${major}.${minor}.${patch + 1}`;
    else
      throw new Error(
        `unknown bump type "${argument}" — expected patch, minor, major or an explicit x.y.z`
      );
  }

  if (version === current) {
    throw new Error(
      `refusing to "bump" ${current} to itself — pick a bump type, or a version that is not already released`
    );
  }
  return version;
}

/**
 * Promote the CHANGELOG "Unreleased" section to a released version, leaving a
 * fresh empty one behind. Idempotent: a heading that already exists is left
 * alone rather than duplicated.
 * @param {string} changelog Full CHANGELOG.md contents
 * @param {string} version
 * @param {string} date ISO date (YYYY-MM-DD)
 * @returns {{content: string, changed: boolean, reason?: string}}
 */
function promoteChangelog(changelog, version, date) {
  if (changelog.includes(`## [${version}]`)) {
    return {
      content: changelog,
      changed: false,
      reason: `CHANGELOG.md already has a [${version}] section`,
    };
  }
  if (!changelog.includes('## [Unreleased]')) {
    return {
      content: changelog,
      changed: false,
      reason: 'CHANGELOG.md has no [Unreleased] section',
    };
  }
  return {
    content: changelog.replace('## [Unreleased]', `## [Unreleased]\n\n## [${version}] - ${date}`),
    changed: true,
  };
}

function main() {
  const argument = process.argv[2];
  if (!argument) {
    console.error('usage: node tools/bump-version.mjs <patch|minor|major|x.y.z>');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync('module.json', 'utf8'));

  let version;
  try {
    version = nextVersion(manifest.version, argument);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }

  const repository = (manifest.url ?? '').replace(/\/$/, '');
  manifest.version = version;
  manifest.download = `${repository}/releases/download/v${version}/${manifest.id}-v${version}.zip`;
  writeFileSync('module.json', `${JSON.stringify(manifest, null, 2)}\n`);

  if (existsSync('package.json')) {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    pkg.version = version;
    writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  }

  if (existsSync('CHANGELOG.md')) {
    const result = promoteChangelog(
      readFileSync('CHANGELOG.md', 'utf8'),
      version,
      new Date().toISOString().slice(0, 10)
    );
    if (result.changed) writeFileSync('CHANGELOG.md', result.content);
    else console.warn(`::warning::${result.reason} — skipping changelog promotion`);
  }

  console.log(version);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
}

// Only act when run as a script, so the helpers can be imported by tests.
if (process.argv[1] && process.argv[1].endsWith('bump-version.mjs')) main();

export { nextVersion, promoteChangelog };
