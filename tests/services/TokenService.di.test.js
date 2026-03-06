/**
 * TokenService DI smoke tests
 * Validates that TokenService can be instantiated with injected canvas
 * and that all instance methods work without accessing the real canvas global.
 */
import { describe, it, expect } from 'vitest';
import { TokenService } from '../../scripts/services/TokenService.js';
import { createMockActor, createMockToken } from '../helpers/mock-helpers.js';

describe('TokenService DI', () => {
  it('getSceneNPCTokens() uses injected canvas, not the global', () => {
    const npcActor = createMockActor({ name: 'Goblin', type: 'humanoid' });
    const npcToken = createMockToken({ actor: npcActor });
    const pcActor = { ...createMockActor({ name: 'Hero' }), type: 'character' };
    const pcToken = createMockToken({ actor: pcActor });

    const mockCanvas = {
      tokens: {
        placeables: [npcToken, pcToken],
        controlled: [],
      },
    };

    const service = new TokenService({ canvas: mockCanvas });
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

    const mockCanvas = {
      tokens: {
        placeables: [selectedToken, unselectedToken],
        controlled: [selectedToken],
      },
    };

    const service = new TokenService({ canvas: mockCanvas });
    const result = service.getSceneNPCTokens();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Orc');
  });

  it('getSceneNPCTokens() returns empty array when canvas has no tokens', () => {
    const mockCanvas = { tokens: null };
    const service = new TokenService({ canvas: mockCanvas });

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

  it('groupTokensByCreature() works as instance method and calls this.extractCreatureInfo', () => {
    const actor1 = createMockActor({ name: 'Goblin A', type: 'humanoid' });
    const actor2 = createMockActor({ name: 'Goblin B', type: 'humanoid' });
    const token1 = createMockToken({ actor: actor1 });
    const token2 = createMockToken({ actor: actor2 });

    const service = new TokenService();
    const groups = service.groupTokensByCreature([token1, token2]);

    expect(groups).toBeInstanceOf(Map);
    expect(groups.size).toBeGreaterThan(0);
  });

  it('default constructor (no args) does not throw at construction time', () => {
    expect(() => new TokenService()).not.toThrow();
  });
});
