/**
 * Tests for mock helper utilities
 *
 * Verifies that all exported helper functions correctly manipulate
 * the Foundry VTT mock infrastructure for per-test customization.
 *
 * @module tests/helpers/mock-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  setTVAAvailable,
  setFANexusAvailable,
  setSetting,
  resetAllMocks,
  createMockActor,
  createMockToken,
  addMockTokens,
} from './mock-helpers.js';

describe('Mock Helper Utilities', () => {
  describe('setTVAAvailable', () => {
    it('adds token-variants to game.modules when called with true', () => {
      setTVAAvailable(true);
      const tva = game.modules.get('token-variants');
      expect(tva).toBeDefined();
      expect(tva.active).toBe(true);
      expect(tva.id).toBe('token-variants');
    });

    it('provides default TVA API with expected methods', () => {
      setTVAAvailable(true);
      const tva = game.modules.get('token-variants');
      expect(tva.api).toBeDefined();
      expect(tva.api.doImageSearch).toBeTypeOf('function');
      expect(tva.api.cacheImages).toBeTypeOf('function');
      expect(tva.api.isCaching).toBeTypeOf('function');
      expect(tva.api.updateTokenImage).toBeTypeOf('function');
      expect(tva.api.TVA_CONFIG).toBeDefined();
      expect(tva.api.TVA_CONFIG.staticCache).toBe(true);
      expect(tva.api.TVA_CONFIG.staticCacheFile).toBe('mock-tva-cache.json');
    });

    it('removes token-variants from game.modules when called with false', () => {
      setTVAAvailable(true);
      expect(game.modules.get('token-variants')).toBeDefined();
      setTVAAvailable(false);
      expect(game.modules.get('token-variants')).toBeUndefined();
    });

    it('merges custom API overrides into default TVA API', () => {
      const customSearch = () => ['custom-result'];
      setTVAAvailable(true, { doImageSearch: customSearch });
      const tva = game.modules.get('token-variants');
      expect(tva.api.doImageSearch).toBe(customSearch);
      // Other defaults should still be present
      expect(tva.api.cacheImages).toBeTypeOf('function');
      expect(tva.api.TVA_CONFIG).toBeDefined();
    });

    it('defaults available to true when called with no arguments', () => {
      setTVAAvailable();
      expect(game.modules.get('token-variants')?.active).toBe(true);
    });
  });

  describe('setFANexusAvailable', () => {
    it('adds fa-tokens-nexus to game.modules when called with true', () => {
      setFANexusAvailable(true);
      const nexus = game.modules.get('fa-tokens-nexus');
      expect(nexus).toBeDefined();
      expect(nexus.active).toBe(true);
      expect(nexus.id).toBe('fa-tokens-nexus');
    });

    it('removes fa-tokens-nexus from game.modules when called with false', () => {
      setFANexusAvailable(true);
      expect(game.modules.get('fa-tokens-nexus')).toBeDefined();
      setFANexusAvailable(false);
      expect(game.modules.get('fa-tokens-nexus')).toBeUndefined();
    });

    it('defaults available to true when called with no arguments', () => {
      setFANexusAvailable();
      expect(game.modules.get('fa-tokens-nexus')?.active).toBe(true);
    });
  });

  describe('setSetting', () => {
    it('overrides debugMode so game.settings.get returns the new value', () => {
      setSetting('debugMode', true);
      expect(game.settings.get('token-replacer-fa', 'debugMode')).toBe(true);
    });

    it('overrides fuzzyThreshold with a numeric value', () => {
      setSetting('fuzzyThreshold', 0.5);
      expect(game.settings.get('token-replacer-fa', 'fuzzyThreshold')).toBe(0.5);
    });

    it('overrides string settings', () => {
      setSetting('additionalPaths', '/custom/path');
      expect(game.settings.get('token-replacer-fa', 'additionalPaths')).toBe('/custom/path');
    });

    it('supports custom module IDs', () => {
      setSetting('someKey', 'someValue', 'other-module');
      expect(game.settings.get('other-module', 'someKey')).toBe('someValue');
    });

    it('defaults moduleId to token-replacer-fa', () => {
      setSetting('autoReplace', true);
      expect(game.settings.get('token-replacer-fa', 'autoReplace')).toBe(true);
    });
  });

  describe('resetAllMocks', () => {
    it('clears settings values added by setSetting', () => {
      setSetting('debugMode', true);
      expect(game.settings.get('token-replacer-fa', 'debugMode')).toBe(true);
      resetAllMocks();
      // Should fall back to registered default (false)
      expect(game.settings.get('token-replacer-fa', 'debugMode')).toBe(false);
    });

    it('clears game.modules entries', () => {
      setTVAAvailable(true);
      setFANexusAvailable(true);
      expect(game.modules.size).toBe(2);
      resetAllMocks();
      expect(game.modules.size).toBe(0);
    });

    it('resets canvas.tokens arrays', () => {
      const token = createMockToken();
      addMockTokens([token]);
      expect(canvas.tokens.placeables.length).toBe(1);
      resetAllMocks();
      expect(canvas.tokens.placeables).toEqual([]);
      expect(canvas.tokens.controlled).toEqual([]);
    });

    it('clears notification spies', () => {
      ui.notifications.info('test');
      ui.notifications.warn('test');
      ui.notifications.error('test');
      resetAllMocks();
      expect(ui.notifications.info).toHaveBeenCalledTimes(0);
      expect(ui.notifications.warn).toHaveBeenCalledTimes(0);
      expect(ui.notifications.error).toHaveBeenCalledTimes(0);
    });

    it('clears Hooks spies', () => {
      Hooks.on('test', () => {});
      Hooks.once('test', () => {});
      resetAllMocks();
      expect(Hooks.on).toHaveBeenCalledTimes(0);
      expect(Hooks.once).toHaveBeenCalledTimes(0);
      expect(Hooks.off).toHaveBeenCalledTimes(0);
      expect(Hooks.call).toHaveBeenCalledTimes(0);
      expect(Hooks.callAll).toHaveBeenCalledTimes(0);
    });
  });

  describe('createMockActor', () => {
    it('returns a valid D&D 5e actor structure with defaults', () => {
      const actor = createMockActor();
      expect(actor.name).toBe('Mock Creature');
      expect(actor.type).toBe('npc');
      expect(actor.system.details.type.value).toBe('humanoid');
      expect(actor.system.details.type.subtype).toBe('');
      expect(actor.system.details.type.custom).toBe('');
      expect(actor.prototypeToken.texture.src).toBe('icons/svg/mystery-man.svg');
    });

    it('accepts type override', () => {
      const actor = createMockActor({ type: 'beast' });
      expect(actor.system.details.type.value).toBe('beast');
    });

    it('accepts subtype override', () => {
      const actor = createMockActor({ type: 'beast', subtype: 'wolf' });
      expect(actor.system.details.type.value).toBe('beast');
      expect(actor.system.details.type.subtype).toBe('wolf');
    });

    it('accepts name override', () => {
      const actor = createMockActor({ name: 'Test Elf' });
      expect(actor.name).toBe('Test Elf');
      expect(actor.prototypeToken.name).toBe('Test Elf');
    });

    it('accepts custom type string', () => {
      const actor = createMockActor({ custom: 'shapechanger' });
      expect(actor.system.details.type.custom).toBe('shapechanger');
    });

    it('accepts token image override', () => {
      const actor = createMockActor({ tokenImg: 'custom/image.png' });
      expect(actor.img).toBe('custom/image.png');
      expect(actor.prototypeToken.texture.src).toBe('custom/image.png');
    });

    it('generates unique IDs for different actors', () => {
      const actor1 = createMockActor();
      const actor2 = createMockActor();
      expect(actor1.id).not.toBe(actor2.id);
    });

    it('accepts explicit ID override', () => {
      const actor = createMockActor({ id: 'fixed-id-123' });
      expect(actor.id).toBe('fixed-id-123');
    });
  });

  describe('createMockToken', () => {
    it('returns a token with nested actor', () => {
      const token = createMockToken();
      expect(token.actor).toBeDefined();
      expect(token.actor.type).toBe('npc');
      expect(token.name).toBe(token.actor.name);
    });

    it('uses provided actor', () => {
      const actor = createMockActor({ name: 'Custom Actor', type: 'fiend' });
      const token = createMockToken({ actor });
      expect(token.actor).toBe(actor);
      expect(token.name).toBe('Custom Actor');
    });

    it('defaults controlled to false', () => {
      const token = createMockToken();
      expect(token.controlled).toBe(false);
    });

    it('accepts controlled override', () => {
      const token = createMockToken({ controlled: true });
      expect(token.controlled).toBe(true);
    });

    it('has document with texture matching actor token image', () => {
      const actor = createMockActor({ tokenImg: 'custom/token.png' });
      const token = createMockToken({ actor });
      expect(token.document.texture.src).toBe('custom/token.png');
    });

    it('generates unique IDs', () => {
      const token1 = createMockToken();
      const token2 = createMockToken();
      expect(token1.id).not.toBe(token2.id);
    });
  });

  describe('addMockTokens', () => {
    it('populates canvas.tokens.placeables with given tokens', () => {
      const token1 = createMockToken();
      const token2 = createMockToken();
      addMockTokens([token1, token2]);
      expect(canvas.tokens.placeables).toHaveLength(2);
      expect(canvas.tokens.placeables).toContain(token1);
      expect(canvas.tokens.placeables).toContain(token2);
    });

    it('filters controlled tokens into canvas.tokens.controlled', () => {
      const token1 = createMockToken({ controlled: false });
      const token2 = createMockToken({ controlled: true });
      const token3 = createMockToken({ controlled: true });
      addMockTokens([token1, token2, token3]);
      expect(canvas.tokens.controlled).toHaveLength(2);
      expect(canvas.tokens.controlled).toContain(token2);
      expect(canvas.tokens.controlled).toContain(token3);
      expect(canvas.tokens.controlled).not.toContain(token1);
    });

    it('replaces previous tokens (not appends)', () => {
      addMockTokens([createMockToken()]);
      expect(canvas.tokens.placeables).toHaveLength(1);
      addMockTokens([createMockToken(), createMockToken()]);
      expect(canvas.tokens.placeables).toHaveLength(2);
    });
  });
});
