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

const token = process.env.FOUNDRY_PACKAGE_TOKEN;
if (!token) {
  console.log('FOUNDRY_PACKAGE_TOKEN is not set — skipping registry publish');
  process.exit(0);
}

const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const manifest = JSON.parse(readFileSync('module.json', 'utf8'));
const repository = (manifest.url ?? '').replace(/\/$/, '');
const tag = `v${manifest.version}`;

const payload = {
  id: manifest.id,
  'dry-run': dryRun,
  release: {
    version: manifest.version,
    // Must point at this specific release, not the "latest" alias.
    manifest: `${repository}/releases/download/${tag}/module.json`,
    notes: `${repository}/releases/tag/${tag}`,
    compatibility: {
      minimum: String(manifest.compatibility?.minimum ?? ''),
      verified: String(manifest.compatibility?.verified ?? ''),
      maximum: String(manifest.compatibility?.maximum ?? ''),
    },
  },
};

const response = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: token },
  body: JSON.stringify(payload),
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
