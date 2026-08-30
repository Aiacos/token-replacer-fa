import { describe, it, expect } from 'vitest';
import {
  classifyUpdate,
  compareVersions,
  checksArePassing,
  decide,
} from '../../tools/dependabot-triage.mjs';

/**
 * Dependabot triage tests.
 *
 * This decides what gets merged into main without a human looking at it, so the
 * failure mode that matters is a major update being classified as safe.
 */

describe('compareVersions', () => {
  it('reads a change in the first component as major', () => {
    expect(compareVersions('4', '7')).toBe('major');
    expect(compareVersions('9.39.2', '10.9.1')).toBe('major');
  });

  it('reads a change in the second component as minor', () => {
    expect(compareVersions('3.2.4', '3.3.0')).toBe('minor');
  });

  it('reads a change in the third component as patch', () => {
    expect(compareVersions('3.2.4', '3.2.7')).toBe('patch');
  });
});

describe('classifyUpdate', () => {
  it('classifies a single-action bump from the title', () => {
    expect(classifyUpdate('chore: bump actions/checkout from 4 to 7')).toBe('major');
    expect(classifyUpdate('chore: bump vitest from 3.2.4 to 3.2.7')).toBe('patch');
  });

  it('tolerates a v prefix', () => {
    expect(classifyUpdate('chore: bump some-action from v4 to v4.1')).toBe('minor');
  });

  it('takes the riskiest entry of a grouped PR', () => {
    const body = [
      'Updates `vitest` from 3.2.4 to 3.2.7',
      'Updates `eslint` from 9.39.2 to 10.9.1',
      'Updates `jsdom` from 27.4.0 to 27.5.0',
    ].join('\n');
    // One major in the group makes the whole PR a major
    expect(classifyUpdate('chore: bump the dev-dependencies group with 3 updates', body)).toBe(
      'major'
    );
  });

  it('classifies a group of safe updates as the largest safe one', () => {
    const body = 'Updates `vitest` from 3.2.4 to 3.2.7\nUpdates `jsdom` from 27.4.0 to 27.5.0';
    expect(classifyUpdate('chore: bump the dev-dependencies group with 2 updates', body)).toBe(
      'minor'
    );
  });

  it('returns unknown when no version pair is present', () => {
    expect(classifyUpdate('chore: bump the dev-dependencies group with 4 updates')).toBe('unknown');
  });
});

describe('checksArePassing', () => {
  it('accepts success, neutral and skipped', () => {
    expect(
      checksArePassing([
        { conclusion: 'SUCCESS' },
        { conclusion: 'SKIPPED' },
        { conclusion: 'NEUTRAL' },
      ])
    ).toBe(true);
  });

  it('rejects a failure or a pending check', () => {
    expect(checksArePassing([{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }])).toBe(false);
    expect(checksArePassing([{ conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS' }])).toBe(false);
  });

  it('rejects a PR with no checks at all rather than assuming success', () => {
    expect(checksArePassing([])).toBe(false);
  });
});

describe('decide', () => {
  const green = [{ conclusion: 'SUCCESS' }];

  it('merges a patch update with green checks', () => {
    const result = decide({
      number: 5,
      title: 'chore: bump vitest from 3.2.4 to 3.2.7',
      mergeable: 'MERGEABLE',
      statusCheckRollup: green,
    });
    expect(result.action).toBe('merge');
  });

  it('holds a major update even when everything is green', () => {
    const result = decide({
      number: 2,
      title: 'chore: bump actions/checkout from 4 to 7',
      mergeable: 'MERGEABLE',
      statusCheckRollup: green,
    });
    expect(result.action).toBe('hold');
    expect(result.reason).toMatch(/major/);
  });

  it('holds a safe update whose checks are not green', () => {
    const result = decide({
      number: 6,
      title: 'chore: bump vitest from 3.2.4 to 3.2.7',
      mergeable: 'MERGEABLE',
      statusCheckRollup: [{ conclusion: 'FAILURE' }],
    });
    expect(result.action).toBe('hold');
    expect(result.reason).toMatch(/checks/);
  });

  it('holds a conflicting PR', () => {
    const result = decide({
      number: 7,
      title: 'chore: bump vitest from 3.2.4 to 3.2.7',
      mergeable: 'CONFLICTING',
      statusCheckRollup: green,
    });
    expect(result.action).toBe('hold');
    expect(result.reason).toMatch(/not mergeable/);
  });

  it('holds anything it cannot classify', () => {
    const result = decide({
      number: 8,
      title: 'chore: something opaque',
      mergeable: 'MERGEABLE',
      statusCheckRollup: green,
    });
    expect(result.action).toBe('hold');
  });
});
