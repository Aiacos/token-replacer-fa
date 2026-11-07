/**
 * The extra token changes that ride along with applied token art: scale and
 * dynamic ring, read from the settings once per run.
 * @module tests/app/TokenAppearancePolicy
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TokenAppearancePolicy } from '../../scripts/app/TokenAppearancePolicy.js';

afterEach(() => vi.restoreAllMocks());

describe('TokenAppearancePolicy — defaults', () => {
  it('adds nothing when scaling is off and the ring is kept', () => {
    const policy = new TokenAppearancePolicy();
    expect(policy.changesFor('fa/goblin.webp')).toEqual({});
    expect(policy.isEmpty).toBe(true);
  });

  it('reads an empty settings object as the defaults', () => {
    expect(TokenAppearancePolicy.fromSettings({}).changesFor('a.webp')).toEqual({});
  });
});

describe('TokenAppearancePolicy — scale', () => {
  it('leaves the scale untouched when scaling is off, whatever the scale value', () => {
    const policy = new TokenAppearancePolicy({ scaleTokens: false, tokenScale: 2 });
    expect(policy.changesFor('a.webp')).not.toHaveProperty('texture.scaleX');
    expect(policy.changesFor('a.webp')).not.toHaveProperty(['texture.scaleY']);
    expect(policy.isEmpty).toBe(true);
  });

  it('sets both scale axes when scaling is on', () => {
    const policy = new TokenAppearancePolicy({ scaleTokens: true, tokenScale: 1.5 });
    expect(policy.changesFor('a.webp')).toEqual({ 'texture.scaleX': 1.5, 'texture.scaleY': 1.5 });
    expect(policy.isEmpty).toBe(false);
  });

  it.each([
    [10, 3],
    [0.01, 0.25],
    [-2, 0.25],
  ])('clamps an out-of-range scale %s to %s and warns once', (raw, clamped) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy = new TokenAppearancePolicy({ scaleTokens: true, tokenScale: raw });

    policy.changesFor('a.webp');
    policy.changesFor('b.webp');

    expect(policy.changesFor('c.webp')['texture.scaleX']).toBe(clamped);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each([NaN, Infinity, null, 'big'])(
    'falls back to scale 1 for a non-finite value (%s) and warns',
    (raw) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const policy = new TokenAppearancePolicy({ scaleTokens: true, tokenScale: raw });
      expect(policy.changesFor('a.webp')['texture.scaleY']).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
    }
  );

  it('does not warn about a scale that is ignored because scaling is off', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new TokenAppearancePolicy({ scaleTokens: false, tokenScale: NaN });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('TokenAppearancePolicy — dynamic ring', () => {
  it('keep adds no ring keys at all', () => {
    const changes = new TokenAppearancePolicy({ dynamicRing: 'keep' }).changesFor('a.webp');
    expect(Object.keys(changes).some((key) => key.startsWith('ring'))).toBe(false);
  });

  it('enable turns the ring on with the applied art as its subject', () => {
    const policy = new TokenAppearancePolicy({ dynamicRing: 'enable' });
    expect(policy.changesFor('fa/goblin.webp')).toEqual({
      'ring.enabled': true,
      'ring.subject.texture': 'fa/goblin.webp',
    });
    expect(policy.changesFor('fa/orc.webp')['ring.subject.texture']).toBe('fa/orc.webp');
  });

  it('disable turns the ring off', () => {
    expect(new TokenAppearancePolicy({ dynamicRing: 'disable' }).changesFor('a.webp')).toEqual({
      'ring.enabled': false,
    });
  });

  it('treats an unknown mode as keep and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy = new TokenAppearancePolicy({ dynamicRing: 'sparkly' });
    expect(policy.changesFor('a.webp')).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('combines scale and ring in one change set', () => {
    const policy = TokenAppearancePolicy.fromSettings({
      scaleTokens: true,
      tokenScale: 0.5,
      dynamicRing: 'enable',
    });
    expect(policy.changesFor('a.webp')).toEqual({
      'texture.scaleX': 0.5,
      'texture.scaleY': 0.5,
      'ring.enabled': true,
      'ring.subject.texture': 'a.webp',
    });
  });

  it('returns a fresh object per call, so a caller cannot corrupt the next token', () => {
    const policy = new TokenAppearancePolicy({ dynamicRing: 'disable' });
    policy.changesFor('a.webp')['ring.enabled'] = 'tampered';
    expect(policy.changesFor('b.webp')).toEqual({ 'ring.enabled': false });
  });
});
