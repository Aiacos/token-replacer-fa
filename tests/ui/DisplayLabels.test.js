/**
 * DisplayLabels: internal ids in, user-language words out — and back.
 *
 * @module tests/ui/DisplayLabels
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DisplayLabels } from '../../scripts/ui/DisplayLabels.js';
import { CREATURE_TYPE_MAPPINGS } from '../../scripts/core/Constants.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const italian = JSON.parse(readFileSync(path.join(HERE, '../../lang/it.json'), 'utf8'));
const lookup = (key) =>
  key.split('.').reduce((node, part) => node?.[part], italian.TOKEN_REPLACER_FA) ?? key;
const labels = new DisplayLabels({ localize: lookup });

describe('DisplayLabels', () => {
  it('has a label key for every creature type the search knows', () => {
    expect(Object.keys(DisplayLabels.CREATURE_TYPE_KEYS).sort()).toEqual(
      Object.keys(CREATURE_TYPE_MAPPINGS).sort()
    );
  });

  it('names creature types in the user language', () => {
    expect(labels.creatureType('humanoid')).toBe('Umanoide');
    expect(labels.creatureType('Undead')).toBe('Non morto');
  });

  it('shows an unmapped type as given and a missing one as unknown', () => {
    expect(labels.creatureType('swarm')).toBe('swarm');
    expect(labels.creatureType(null)).toBe('Tipo sconosciuto');
  });

  it('names known sources and stays silent on unknown ones', () => {
    expect(labels.source('tva-direct')).toBe('Cache TVA');
    expect(labels.source('somewhere')).toBe('');
    expect(labels.source(undefined)).toBe('');
  });

  it('lists options alphabetically by label', () => {
    const options = labels.creatureTypeOptions().map((o) => o.label);
    expect(options).toEqual([...options].sort((a, b) => a.localeCompare(b)));
    expect(options).toHaveLength(14);
  });

  it('maps a typed label or key back to the type key', () => {
    expect(labels.resolveCreatureType(' umanoide ')).toBe('humanoid');
    expect(labels.resolveCreatureType('BEAST')).toBe('beast');
  });

  it('passes a free search term through, lowercased', () => {
    expect(labels.resolveCreatureType('Goblin')).toBe('goblin');
  });
});
