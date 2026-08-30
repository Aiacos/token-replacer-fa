import { describe, it, expect } from 'vitest';
import { nextVersion, promoteChangelog } from '../../tools/bump-version.mjs';

/**
 * Release tooling tests.
 *
 * These guard the release pipeline itself: a bad bump does not fail loudly, it
 * fails *halfway* — after module.json has been rewritten and before the tag is
 * pushed — which is the worst place for a release to stop.
 */

describe('nextVersion', () => {
  it('increments each component', () => {
    expect(nextVersion('1.7.0', 'patch')).toBe('1.7.1');
    expect(nextVersion('1.7.3', 'minor')).toBe('1.8.0');
    expect(nextVersion('1.7.3', 'major')).toBe('2.0.0');
  });

  it('accepts an explicit version', () => {
    expect(nextVersion('1.7.0', '2.0.0-rc.1')).toBe('2.0.0-rc.1');
  });

  it('drops a prerelease suffix when bumping from it', () => {
    expect(nextVersion('2.0.0-rc.1', 'patch')).toBe('2.0.1');
  });

  it('refuses a bump that would not move the version', () => {
    // Would create a duplicate CHANGELOG heading, then fail on an empty commit
    expect(() => nextVersion('1.7.0', '1.7.0')).toThrow(/itself/);
  });

  it('refuses an unknown bump type instead of guessing', () => {
    expect(() => nextVersion('1.7.0', 'bigly')).toThrow(/unknown bump type/);
  });
});

describe('promoteChangelog', () => {
  const changelog =
    '# Changelog\n\n## [Unreleased]\n\n### Added\n- thing\n\n## [1.6.0] - 2026-04-24\n';

  it('promotes Unreleased and leaves a fresh section behind', () => {
    const result = promoteChangelog(changelog, '1.7.0', '2026-08-30');
    expect(result.changed).toBe(true);
    expect(result.content).toContain('## [Unreleased]\n\n## [1.7.0] - 2026-08-30');
    expect(result.content).toContain('### Added\n- thing');
  });

  it('is idempotent — never duplicates an existing version heading', () => {
    const once = promoteChangelog(changelog, '1.7.0', '2026-08-30').content;
    const twice = promoteChangelog(once, '1.7.0', '2026-08-30');
    expect(twice.changed).toBe(false);
    expect(twice.content.match(/## \[1\.7\.0\]/g)).toHaveLength(1);
  });

  it('reports rather than throws when there is no Unreleased section', () => {
    const result = promoteChangelog(
      '# Changelog\n\n## [1.6.0] - 2026-04-24\n',
      '1.7.0',
      '2026-08-30'
    );
    expect(result.changed).toBe(false);
    expect(result.reason).toMatch(/Unreleased/);
  });
});
