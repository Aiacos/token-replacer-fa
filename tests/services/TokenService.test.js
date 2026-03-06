/**
 * TokenService comprehensive test suite
 *
 * Covers constructor DI (merged from TokenService.di.test.js),
 * extractCreatureInfo() with all D&D 5e actor type formats,
 * getSceneNPCTokens() with selection/filtering/edge cases,
 * and groupTokensByCreature() grouping logic.
 */
import { describe, it, expect, vi } from 'vitest';
import { TokenService } from '../../scripts/services/TokenService.js';
import { createMockActor, createMockToken } from '../helpers/mock-helpers.js';

// Helper: build a minimal mock canvas for getSceneNPCTokens tests
function mockCanvas(placeables = [], controlled = []) {
  return { tokens: { placeables, controlled } };
}

describe('TokenService', () => {
  // -----------------------------------------------------------------
  // Constructor DI (merged from TokenService.di.test.js)
  // -----------------------------------------------------------------
  describe('constructor DI', () => {
    it('default constructor (no args) does not throw at construction time', () => {
      expect(() => new TokenService()).not.toThrow();
    });

    it('getSceneNPCTokens() uses injected canvas, not the global', () => {
      const npcActor = createMockActor({ name: 'Goblin', type: 'humanoid' });
      const npcToken = createMockToken({ actor: npcActor });
      const pcActor = { ...createMockActor({ name: 'Hero' }), type: 'character' };
      const pcToken = createMockToken({ actor: pcActor });

      const mc = mockCanvas([npcToken, pcToken]);
      const service = new TokenService({ canvas: mc });
      const result = service.getSceneNPCTokens();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Goblin');
    });

    it('getSceneNPCTokens() returns selected NPC tokens when controlled is non-empty', () => {
      const npcActor = createMockActor({ name: 'Orc', type: 'humanoid' });
      const selectedToken = createMockToken({ actor: npcActor, controlled: true });
      const unselectedToken = createMockToken({
        actor: createMockActor({ name: 'Troll', type: 'giant' }),
      });

      const mc = mockCanvas([selectedToken, unselectedToken], [selectedToken]);
      const service = new TokenService({ canvas: mc });
      const result = service.getSceneNPCTokens();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Orc');
    });

    it('getSceneNPCTokens() returns empty array when canvas has no tokens', () => {
      const service = new TokenService({ canvas: { tokens: null } });
      expect(service.getSceneNPCTokens()).toEqual([]);
    });

    it('extractCreatureInfo() works as instance method', () => {
      const actor = createMockActor({ name: 'Dragon', type: 'dragon', subtype: 'Red' });
      const token = createMockToken({ actor });
      const service = new TokenService();
      const info = service.extractCreatureInfo(token);

      expect(info).not.toBeNull();
      expect(info.actorName).toBe('Dragon');
      expect(info.type).toBe('dragon');
      expect(info.subtype).toBe('Red');
    });

    it('groupTokensByCreature() works as instance method', () => {
      const actor1 = createMockActor({ name: 'Goblin A', type: 'humanoid' });
      const actor2 = createMockActor({ name: 'Goblin B', type: 'humanoid' });
      const token1 = createMockToken({ actor: actor1 });
      const token2 = createMockToken({ actor: actor2 });

      const service = new TokenService();
      const groups = service.groupTokensByCreature([token1, token2]);

      expect(groups).toBeInstanceOf(Map);
      expect(groups.size).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------
  // extractCreatureInfo()
  // -----------------------------------------------------------------
  describe('extractCreatureInfo()', () => {
    let service;

    // Suppress the console.warn for "Could not extract creature type"
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    function makeToken(actorShape) {
      return {
        id: 'tok-1',
        name: actorShape.name || 'Token Name',
        actor: actorShape,
        document: {
          texture: { src: 'icons/svg/mystery-man.svg' },
        },
      };
    }

    beforeEach(() => {
      service = new TokenService();
      warnSpy.mockClear();
    });

    // -- Object type format --
    it('handles object type format with value/subtype/custom', () => {
      const token = createMockToken({
        actor: createMockActor({ name: 'Goblin', type: 'humanoid', subtype: 'Goblinoid', custom: 'Goblin Raider' }),
      });
      const info = service.extractCreatureInfo(token);

      expect(info.type).toBe('humanoid');
      expect(info.subtype).toBe('Goblinoid');
      expect(info.custom).toBe('Goblin Raider');
    });

    it('handles object type with label fallback when value is empty', () => {
      const token = makeToken({
        id: 'a1',
        name: 'Imp',
        type: 'npc',
        system: { details: { type: { value: '', label: 'Fiend', subtype: 'Devil' } } },
      });
      const info = service.extractCreatureInfo(token);

      expect(info.type).toBe('fiend');
      expect(info.subtype).toBe('Devil');
    });

    // -- String type format --
    it('handles plain string type format', () => {
      const token = makeToken({
        id: 'a2',
        name: 'Wolf',
        type: 'npc',
        system: { details: { type: 'beast' } },
      });
      const info = service.extractCreatureInfo(token);

      expect(info.type).toBe('beast');
      expect(info.subtype).toBeNull();
    });

    it('handles string with parenthetical subtype "Humanoid (Tiefling)"', () => {
      const token = makeToken({
        id: 'a3',
        name: 'Warlock',
        type: 'npc',
        system: { details: { type: 'Humanoid (Tiefling)' } },
      });
      const info = service.extractCreatureInfo(token);

      expect(info.type).toBe('humanoid');
      expect(info.subtype).toBe('Tiefling');
    });

    it('handles string with parenthetical subtype "Humanoid (Elf)"', () => {
      const token = makeToken({
        id: 'a4',
        name: 'Elf Mage',
        type: 'npc',
        system: { details: { type: 'Humanoid (Elf)' } },
      });
      const info = service.extractCreatureInfo(token);

      expect(info.type).toBe('humanoid');
      expect(info.subtype).toBe('Elf');
    });

    // -- creatureType fallback --
    it('falls back to creatureType field when type is missing', () => {
      const token = makeToken({
        id: 'a5',
        name: 'Custom Monster',
        type: 'npc',
        system: { details: { creatureType: 'Monstrosity' } },
      });
      const info = service.extractCreatureInfo(token);

      expect(info.type).toBe('monstrosity');
    });

    // -- Missing type --
    it('returns info with null type when no type info available', () => {
      const token = makeToken({
        id: 'a6',
        name: 'Mystery',
        type: 'npc',
        system: { details: {} },
      });
      const info = service.extractCreatureInfo(token);

      expect(info).not.toBeNull();
      expect(info.type).toBeNull();
      expect(info.actorName).toBe('Mystery');
    });

    // -- No actor --
    it('returns null when token has no actor', () => {
      const token = { id: 'tok-x', name: 'Orphan', actor: null };
      const info = service.extractCreatureInfo(token);

      expect(info).toBeNull();
    });

    // -- Race extraction --
    it('extracts race from string format', () => {
      const token = makeToken({
        id: 'a7',
        name: 'Guard',
        type: 'npc',
        system: { details: { type: { value: 'humanoid', subtype: '' }, race: 'Human' } },
      });
      const info = service.extractCreatureInfo(token);

      expect(info.race).toBe('Human');
    });

    it('extracts race from object format with name property', () => {
      const token = makeToken({
        id: 'a8',
        name: 'Scout',
        type: 'npc',
        system: { details: { type: { value: 'humanoid', subtype: '' }, race: { name: 'Halfling' } } },
      });
      const info = service.extractCreatureInfo(token);

      expect(info.race).toBe('Halfling');
    });

    it('race is null when not present', () => {
      const token = makeToken({
        id: 'a9',
        name: 'Skeleton',
        type: 'npc',
        system: { details: { type: { value: 'undead', subtype: '' } } },
      });
      const info = service.extractCreatureInfo(token);

      expect(info.race).toBeNull();
    });

    // -- Search terms --
    it('search terms include actorName, type, subtype, custom, race', () => {
      const token = makeToken({
        id: 'a10',
        name: 'Guard Captain',
        type: 'npc',
        system: {
          details: {
            type: { value: 'humanoid', subtype: 'Human', custom: 'Veteran' },
            race: 'Human',
          },
        },
      });
      // Set token name different from actor name
      token.name = 'Guard Captain';

      const info = service.extractCreatureInfo(token);

      expect(info.searchTerms).toContain('guard captain'); // actorName
      expect(info.searchTerms).toContain('humanoid');
      expect(info.searchTerms).toContain('human'); // subtype and race (deduped)
      expect(info.searchTerms).toContain('humanoid human'); // type+subtype combo
      expect(info.searchTerms).toContain('veteran'); // custom
    });

    it('search terms include tokenName when different from actorName', () => {
      const actor = createMockActor({ name: 'Bandit', type: 'humanoid' });
      const token = createMockToken({ actor });
      token.name = 'Highway Robber'; // different from actor name

      const info = service.extractCreatureInfo(token);

      expect(info.searchTerms).toContain('bandit'); // actorName
      expect(info.searchTerms).toContain('highway robber'); // tokenName
    });

    it('search terms do not include tokenName when same as actorName', () => {
      const actor = createMockActor({ name: 'Goblin', type: 'humanoid' });
      const token = createMockToken({ actor });
      // token.name defaults to actor.name via createMockToken

      const info = service.extractCreatureInfo(token);

      // "goblin" should appear only once (deduplication)
      const goblinCount = info.searchTerms.filter((t) => t === 'goblin').length;
      expect(goblinCount).toBe(1);
    });

    it('search terms are deduplicated', () => {
      const token = makeToken({
        id: 'a11',
        name: 'Human Guard',
        type: 'npc',
        system: {
          details: {
            type: { value: 'humanoid', subtype: 'Human' },
            race: 'Human',
          },
        },
      });
      const info = service.extractCreatureInfo(token);

      // All terms should be unique
      const unique = [...new Set(info.searchTerms)];
      expect(info.searchTerms).toEqual(unique);
    });

    it('custom type field is included in info and searchTerms', () => {
      const token = createMockToken({
        actor: createMockActor({ name: 'Shapechanger', type: 'monstrosity', custom: 'Lycanthrope' }),
      });
      const info = service.extractCreatureInfo(token);

      expect(info.custom).toBe('Lycanthrope');
      expect(info.searchTerms).toContain('lycanthrope');
    });

    // -- tokenId and currentImage --
    it('returns correct tokenId and currentImage from document texture', () => {
      const actor = createMockActor({ name: 'Orc', tokenImg: 'tokens/orc.webp' });
      const token = createMockToken({ actor, id: 'tok-42' });

      const info = service.extractCreatureInfo(token);

      expect(info.tokenId).toBe('tok-42');
      expect(info.currentImage).toBe('tokens/orc.webp');
    });
  });

  // -----------------------------------------------------------------
  // getSceneNPCTokens()
  // -----------------------------------------------------------------
  describe('getSceneNPCTokens()', () => {
    it('returns all NPCs when no selection (controlled is empty)', () => {
      const t1 = createMockToken({ actor: createMockActor({ name: 'Goblin' }) });
      const t2 = createMockToken({ actor: createMockActor({ name: 'Orc' }) });

      const service = new TokenService({ canvas: mockCanvas([t1, t2]) });
      const result = service.getSceneNPCTokens();

      expect(result).toHaveLength(2);
    });

    it('returns only selected NPCs when controlled is non-empty', () => {
      const t1 = createMockToken({ actor: createMockActor({ name: 'Goblin' }), controlled: true });
      const t2 = createMockToken({ actor: createMockActor({ name: 'Orc' }) });

      const service = new TokenService({ canvas: mockCanvas([t1, t2], [t1]) });
      const result = service.getSceneNPCTokens();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Goblin');
    });

    it('filters out non-NPC actors (type !== npc and !== creature)', () => {
      const npcActor = createMockActor({ name: 'Bandit' });
      const pcActor = { ...createMockActor({ name: 'Wizard' }), type: 'character' };
      const vehicleActor = { ...createMockActor({ name: 'Cart' }), type: 'vehicle' };

      const t1 = createMockToken({ actor: npcActor });
      const t2 = createMockToken({ actor: pcActor });
      const t3 = createMockToken({ actor: vehicleActor });

      const service = new TokenService({ canvas: mockCanvas([t1, t2, t3]) });
      const result = service.getSceneNPCTokens();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bandit');
    });

    it('returns empty array when canvas.tokens is null', () => {
      const service = new TokenService({ canvas: { tokens: null } });
      expect(service.getSceneNPCTokens()).toEqual([]);
    });

    it('returns empty array when canvas.tokens.placeables is empty', () => {
      const service = new TokenService({ canvas: mockCanvas([]) });
      expect(service.getSceneNPCTokens()).toEqual([]);
    });

    it('handles tokens without actors (skips them)', () => {
      const good = createMockToken({ actor: createMockActor({ name: 'Goblin' }) });
      const noActor = { id: 'tok-orphan', name: 'Orphan', actor: null };

      const service = new TokenService({ canvas: mockCanvas([good, noActor]) });
      const result = service.getSceneNPCTokens();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Goblin');
    });

    it('accepts creature actor type', () => {
      const creatureActor = { ...createMockActor({ name: 'Familiar' }), type: 'creature' };
      const t = createMockToken({ actor: creatureActor });

      const service = new TokenService({ canvas: mockCanvas([t]) });
      const result = service.getSceneNPCTokens();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Familiar');
    });

    it('returns empty array when canvas is null', () => {
      const service = new TokenService({ canvas: null });
      expect(service.getSceneNPCTokens()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------
  // groupTokensByCreature()
  // -----------------------------------------------------------------
  describe('groupTokensByCreature()', () => {
    let service;
    beforeEach(() => {
      service = new TokenService();
    });

    it('groups tokens of same creature type under same key', () => {
      const actor1 = createMockActor({ name: 'Goblin', type: 'humanoid' });
      const actor2 = createMockActor({ name: 'Goblin', type: 'humanoid' });
      const t1 = createMockToken({ actor: actor1 });
      const t2 = createMockToken({ actor: actor2 });

      const groups = service.groupTokensByCreature([t1, t2]);

      // Both have same actorName + type + subtype => same key
      expect(groups.size).toBe(1);
      const group = [...groups.values()][0];
      expect(group.tokens).toHaveLength(2);
    });

    it('different creature types get different keys', () => {
      const goblin = createMockToken({ actor: createMockActor({ name: 'Goblin', type: 'humanoid' }) });
      const dragon = createMockToken({ actor: createMockActor({ name: 'Dragon', type: 'dragon' }) });

      const groups = service.groupTokensByCreature([goblin, dragon]);

      expect(groups.size).toBe(2);
    });

    it('mixed creature types produce correct Map', () => {
      const g1 = createMockToken({ actor: createMockActor({ name: 'Goblin', type: 'humanoid' }) });
      const g2 = createMockToken({ actor: createMockActor({ name: 'Goblin', type: 'humanoid' }) });
      const wolf = createMockToken({ actor: createMockActor({ name: 'Wolf', type: 'beast' }) });

      const groups = service.groupTokensByCreature([g1, g2, wolf]);

      expect(groups.size).toBe(2);

      // Find the goblin group
      const goblinGroup = [...groups.values()].find((g) => g.creatureInfo.actorName === 'Goblin');
      expect(goblinGroup.tokens).toHaveLength(2);

      const wolfGroup = [...groups.values()].find((g) => g.creatureInfo.actorName === 'Wolf');
      expect(wolfGroup.tokens).toHaveLength(1);
    });

    it('skips tokens where extractCreatureInfo returns null', () => {
      const good = createMockToken({ actor: createMockActor({ name: 'Goblin', type: 'humanoid' }) });
      const noActor = { id: 'tok-bad', name: 'Bad', actor: null };

      const groups = service.groupTokensByCreature([good, noActor]);

      expect(groups.size).toBe(1);
    });

    it('each group has creatureInfo, tokens array, and searchTerms', () => {
      const token = createMockToken({ actor: createMockActor({ name: 'Orc', type: 'humanoid' }) });
      const groups = service.groupTokensByCreature([token]);

      const group = [...groups.values()][0];
      expect(group).toHaveProperty('creatureInfo');
      expect(group).toHaveProperty('tokens');
      expect(group).toHaveProperty('searchTerms');
      expect(Array.isArray(group.tokens)).toBe(true);
      expect(Array.isArray(group.searchTerms)).toBe(true);
      expect(group.creatureInfo.actorName).toBe('Orc');
    });

    it('returns empty Map for empty token array', () => {
      const groups = service.groupTokensByCreature([]);
      expect(groups.size).toBe(0);
    });
  });
});
