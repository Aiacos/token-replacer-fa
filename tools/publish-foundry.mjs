#!/usr/bin/env node
/**
 * Announce a release to the Foundry VTT package registry.
 *
 * Reads module.json for the id, version and compatibility range and POSTs it to
 * the Package Release API. Requires FOUNDRY_PACKAGE_TOKEN; pass --dry-run (or
 * set DRY_RUN=true) to validate the payload without publishing.
 *
 * https://foundryvtt.com/article/package-release-api/
 */
import { readFileSync } from 'node:fs';

const ENDPOINT = 'https://foundryvtt.com/_api/packages/release_version/';

/**
 * Build the Package Release API payload for a manifest.
 *
 * Exported so it can be unit-tested: this runs in the last step of the release
 * pipeline, after the tag, the ZIP and the GitHub release are already published,
 * so a malformed payload fails at the worst possible moment.
 * @param {Object} manifest - Parsed module.json
 * @param {boolean} [dryRun=false] - Validate without publishing
 * @returns {Object} Request body for the release endpoint
 */
function buildPayload(manifest, dryRun = false) {
  const repository = (manifest.url ?? '').replace(/\/$/, '');
  const tag = `v${manifest.version}`;

  return {
    id: manifest.id,
    'dry-run': dryRun,
    release: {
      version: manifest.version,
      // Must point at this specific release, not the "latest" alias.
      manifest: `${repository}/releases/download/${tag}/module.json`,
      notes: `${repository}/releases/tag/${tag}`,
      // `maximum` is deliberately unset in module.json (validate-manifest.mjs
      // fails the build if one appears), and "" is not a valid version — send
      // the key only when there is a real value behind it.
      compatibility: {
        minimum: String(manifest.compatibility?.minimum ?? ''),
        verified: String(manifest.compatibility?.verified ?? ''),
        ...(manifest.compatibility?.maximum
          ? { maximum: String(manifest.compatibility.maximum) }
          : {}),
      },
    },
  };
}

async function main() {
  const token = process.env.FOUNDRY_PACKAGE_TOKEN;
  if (!token) {
    console.log('FOUNDRY_PACKAGE_TOKEN is not set — skipping registry publish');
    return;
  }

  const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const manifest = JSON.parse(readFileSync('module.json', 'utf8'));
  const tag = `v${manifest.version}`;

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(buildPayload(manifest, dryRun)),
    signal: AbortSignal.timeout(30000),
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(
      `::error::Foundry package registry rejected the release (HTTP ${response.status}): ${body}`
    );
    process.exit(1);
  }

  console.log(
    `${dryRun ? 'Validated' : 'Published'} ${manifest.id} ${tag} on the Foundry package registry`
  );
  console.log(body);
}

// Only act when run as a script, so buildPayload can be imported by tests.
if (process.argv[1] && process.argv[1].endsWith('publish-foundry.mjs')) await main();

export { buildPayload };
