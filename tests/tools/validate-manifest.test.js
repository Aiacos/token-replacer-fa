import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

/**
 * Manifest validation smoke test.
 *
 * `npm run validate` is the gate that keeps a dangling template path, a missing
 * i18n key or a stale download URL out of a release. Running it from the suite
 * means `npm test` alone catches those, without waiting for CI.
 */
describe('validate-manifest', () => {
  it('accepts the manifest as committed', () => {
    expect(() =>
      execFileSync('node', ['tools/validate-manifest.mjs'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      })
    ).not.toThrow();
  });
});
