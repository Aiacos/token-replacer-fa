/**
 * Token Replacer FA - Token Service
 * Handles token extraction, grouping, and image replacement
 * @module services/TokenService
 */

import { MODULE_ID } from '../core/Constants.js';
import { CreatureTerms } from '../core/CreatureTerms.js';
import { ModuleError } from '../core/ModuleError.js';
import { CreatureInfoExtractor } from './token/CreatureInfoExtractor.js';

/**
 * Finds the NPC tokens to process on the scene, groups them by creature, and
 * writes a chosen image back to the token and its actor's prototype.
 *
 * Reading the creature out of dnd5e actor data is delegated to
 * CreatureInfoExtractor; the canvas is injected so tests need no Foundry scene.
 *
 * @pattern Facade — main.js asks for tokens, groups and replacements; the
 * canvas, the actor data shapes and the document updates stay behind it.
 * @example
 * // Production: use exported singleton
 * import { tokenService } from './services/TokenService.js';
 * const tokens = tokenService.getSceneNPCTokens();
 *
 * // Testing: create instance with mock canvas
 * const svc = new TokenService({ canvas: mockCanvas });
 */
export class TokenService {
  /**
   * @param {Object} [deps={}] - Dependency overrides for testing
   * @param {Object} [deps.canvas] - Canvas object (default: global canvas)
   * @param {CreatureInfoExtractor} [deps.extractor] - Reads creature info from actors
   */
  constructor(deps = {}) {
    const { canvas: injectedCanvas, extractor = new CreatureInfoExtractor() } = deps;
    this._getCanvas = () => injectedCanvas ?? canvas;
    this._extractor = extractor;
  }

  /**
   * Extract creature information from a token
   * @param {Token} token - Foundry VTT token
   * @returns {import('../types/typedefs.js').CreatureInfo | null} Creature info or null
   */
  extractCreatureInfo(token) {
    return this._extractor.extract(token);
  }

  /**
   * Get NPC tokens to process from the current scene
   * If tokens are selected, only process selected NPC tokens
   * @returns {Token[]} Array of NPC tokens
   */
  getSceneNPCTokens() {
    const c = this._getCanvas();
    if (!c?.tokens?.placeables) {
      return [];
    }

    // Check if there are selected tokens
    const selectedTokens = c.tokens.controlled;

    if (selectedTokens.length > 0) {
      // Filter selected tokens to only include NPCs
      return selectedTokens.filter((token) => {
        const actor = token.actor;
        if (!actor) return false;
        return actor.type === 'npc' || actor.type === 'creature';
      });
    }

    // No selection - get all NPC tokens on the scene
    return c.tokens.placeables.filter((token) => {
      const actor = token.actor;
      if (!actor) return false;
      return actor.type === 'npc' || actor.type === 'creature';
    });
  }

  /**
   * Group tokens by creature type for batch processing
   * @param {Token[]} tokens - Array of tokens
   * @returns {Map<string, {creatureInfo: import('../types/typedefs.js').CreatureInfo, tokens: Token[], searchTerms: string[]}>} Map of cache key to group data
   */
  groupTokensByCreature(tokens) {
    const groups = new Map();

    for (const token of tokens) {
      const creatureInfo = this.extractCreatureInfo(token);
      if (!creatureInfo) continue;

      const key = CreatureTerms.cacheKey(creatureInfo);

      if (!groups.has(key)) {
        groups.set(key, {
          creatureInfo: creatureInfo,
          tokens: [],
          searchTerms: creatureInfo.searchTerms,
        });
      }

      groups.get(key).tokens.push(token);
    }

    return groups;
  }

  /**
   * Replace a token's image
   * @param {Token} token - Token to update
   * @param {string} imagePath - New image path
   * @returns {Promise<true>} Always true on success
   * @throws {Object} Structured error with errorType 'token_replace_failed'
   */
  async replaceTokenImage(token, imagePath) {
    try {
      // Update both the token document and the prototype token on the actor
      // Foundry VTT dot-notation update path syntax ('texture.src')
      await token.document.update(
        /** @type {any} */ ({
          'texture.src': imagePath,
        })
      );

      // Also update the actor's prototype token if it exists
      const actor = token.actor;
      if (actor) {
        // Foundry VTT dot-notation update path syntax ('prototypeToken.texture.src')
        await actor.update(
          /** @type {any} */ ({
            'prototypeToken.texture.src': imagePath,
          })
        );
      }

      console.log(`${MODULE_ID} | Replaced token image for ${token.name}`);
      return true;
    } catch (error) {
      throw ModuleError.of(
        'token_replace_failed',
        `Error replacing token image for "${token.name}": ${error.message || String(error)}`,
        ['check_console', 'check_permissions']
      );
    }
  }
}

// Export singleton instance (uses global canvas at runtime)
export const tokenService = new TokenService();
