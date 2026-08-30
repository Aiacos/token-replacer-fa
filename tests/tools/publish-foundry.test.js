/**
 * Release payload tests.
 *
 * This payload is built in the last step of the release pipeline — after the
 * version bump, the tag, the ZIP and the GitHub release have all been
 * published. A rejection here fails a release that is already half out the door,
 * so the shape is worth pinning.
 *
 * @module tests/tools/publish-foundry
 */
import { describe, it, expect } from 'vitest';
import { buildPayload } from '../../tools/publish-foundry.mjs';

const MANIFEST = {
  id: 'token-replacer-fa',
  version: '2.13.0',
  url: 'https://github.com/Aiacos/token-replacer-fa',
  compatibility: { minimum: '12', verified: '13' },
};

describe('buildPayload', () => {
  it('omits maximum when the manifest has none', () => {
    const { compatibility } = buildPayload(MANIFEST).release;

    // module.json deliberately sets no maximum, and "" is not a valid version.
    expect(compatibility).toEqual({ minimum: '12', verified: '13' });
    expect('maximum' in compatibility).toBe(false);
  });

  it('sends maximum when one is actually set', () => {
    const payload = buildPayload({
      ...MANIFEST,
      compatibility: { ...MANIFEST.compatibility, maximum: '14' },
    });

    expect(payload.release.compatibility.maximum).toBe('14');
  });

  it('points the manifest URL at this release, not the latest alias', () => {
    const { manifest, notes } = buildPayload(MANIFEST).release;

    expect(manifest).toBe(
      'https://github.com/Aiacos/token-replacer-fa/releases/download/v2.13.0/module.json'
    );
    expect(manifest).not.toContain('latest');
    expect(notes).toBe('https://github.com/Aiacos/token-replacer-fa/releases/tag/v2.13.0');
  });

  it('tolerates a trailing slash on the repository URL', () => {
    const payload = buildPayload({ ...MANIFEST, url: `${MANIFEST.url}/` });

    expect(payload.release.manifest).not.toContain('//releases');
  });

  it('marks a dry run', () => {
    expect(buildPayload(MANIFEST, true)['dry-run']).toBe(true);
    expect(buildPayload(MANIFEST)['dry-run']).toBe(false);
  });
});
