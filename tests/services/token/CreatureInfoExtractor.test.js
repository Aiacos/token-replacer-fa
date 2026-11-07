/**
 * CreatureInfoExtractor — dnd5e actor data → creature info.
 * dnd5e 4.x stores the creature type as `{ value, subtype, swarm, custom }`;
 * older data and some imports use a plain "Type (Subtype)" string.
 * @module tests/services/token/CreatureInfoExtractor
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CreatureInfoExtractor } from '../../../scripts/services/token/CreatureInfoExtractor.js';

const extractor = new CreatureInfoExtractor();

function tokenWithType(type, name = 'Creature') {
  return {
    id: 't1',
    name,
    actor: { id: 'a1', name, type: 'npc', system: { details: { type } } },
    document: { texture: { src: 'icon.webp' } },
  };
}

describe('CreatureInfoExtractor', () => {
  it('tolerates non-string type fields instead of aborting the run', () => {
    const extractor = new CreatureInfoExtractor();
    const info = extractor.extract(tokenWithType({ value: 7, custom: { bad: true } }));
    expect(info.type).toBeNull();
    expect(info.custom).toBeNull();
  });

  let warn;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('reads a dnd5e 4.x type object', () => {
    const info = extractor.extract(
      tokenWithType({ value: 'humanoid', subtype: 'Elf', swarm: '', custom: '' }, 'Elf Mage')
    );

    expect(info).toMatchObject({ type: 'humanoid', subtype: 'Elf', custom: null, swarm: null });
    expect(info.searchTerms).toEqual(['elf mage', 'humanoid', 'humanoid elf', 'elf']);
  });

  it('reads a legacy "Type (Subtype)" string', () => {
    const info = extractor.extract(tokenWithType('Humanoid (Tiefling)'));

    expect(info.type).toBe('humanoid');
    expect(info.subtype).toBe('Tiefling');
  });

  it('uses the custom type when the value is "custom"', () => {
    const info = extractor.extract(
      tokenWithType({ value: 'custom', subtype: '', custom: 'Spirit' })
    );

    expect(info.type).toBe('spirit');
    expect(info.custom).toBe('Spirit');
    expect(info.searchTerms).not.toContain('custom');
    expect(warn).not.toHaveBeenCalled();
  });

  it('uses the custom type when only custom is set', () => {
    const info = extractor.extract(tokenWithType({ value: '', subtype: '', custom: 'Spirit' }));

    expect(info.type).toBe('spirit');
  });

  it('has no type, and warns, when the value is "custom" but custom is empty', () => {
    const info = extractor.extract(tokenWithType({ value: 'custom', custom: '' }));

    expect(info.type).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('keeps the creature type of a swarm and records the swarm size', () => {
    const info = extractor.extract(
      tokenWithType({ value: 'beast', subtype: '', swarm: 'tiny', custom: '' }, 'Swarm of Rats')
    );

    expect(info.type).toBe('beast');
    expect(info.swarm).toBe('tiny');
    expect(info.searchTerms).toEqual(['swarm of rats', 'beast']);
  });

  it('returns null for a token without an actor', () => {
    expect(extractor.extract({ id: 't', name: 'x', actor: null })).toBeNull();
  });
});
