/**
 * Step order in release.yml.
 *
 * A release that pushed its commit and tag before building could fail at the
 * build and leave main and the tag at a version with no release behind it — and
 * a re-run cannot recover, because the bump refuses to repeat that version.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
const stepIndex = (name) => {
  const index = workflow.indexOf(`- name: ${name}`);
  if (index === -1) throw new Error(`release.yml has no step named "${name}"`);
  return index;
};

describe('release.yml', () => {
  it.each(['Build the release ZIP', 'Verify the ZIP contents'])(
    '%s runs before anything is pushed',
    (step) => {
      expect(stepIndex(step)).toBeLessThan(stepIndex('Commit and tag the bump'));
    }
  );
});
