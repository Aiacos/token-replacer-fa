/**
 * Token Replacer FA - Token Service
 * Handles token extraction, grouping, and image replacement
 * @module services/TokenService
 */

import { MODULE_ID } from '../core/Constants.js';
import { getCreatureCacheKey } from '../core/Utils.js';

/**
 * TokenService class for handling token operations
 */
export class TokenService {
  /**
   * Extract creature information from a token
   * @param {Token} token - Foundry VTT token
   * @returns {Object|null} Creature info or null
   */
  static extractCreatureInfo(token) {
    const actor = token.actor;
    if (!actor) return null;

    const info = {
      tokenId: token.id,
      tokenName: token.name,
      actorName: actor.name,
      actorId: actor.id,
      currentImage: token.document?.texture?.src || token.texture?.src,
      type: null,
      subtype: null,
      race: null,
      searchTerms: []
    };

    // Get creature type from dnd5e system
    // Handle multiple formats: object with value property or direct string
    if (actor.system?.details?.type) {
      const typeData = actor.system.details.type;
      if (typeof typeData === 'string') {
        info.type = typeData || null;
      } else if (typeof typeData === 'object') {
        info.type = typeData.value || typeData.label || null;
        info.subtype = typeData.subtype || null;
        info.custom = typeData.custom || null;
      }
    }

    // Fallback: check for creatureType field (some systems use this)
    if (!info.type && actor.system?.details?.creatureType) {
      info.type = actor.system.details.creatureType;
    }

    // Debug log to help troubleshoot type extraction issues
    if (!info.type) {
      console.warn(`${MODULE_ID} | Could not extract creature type for ${actor.name}. Details:`, actor.system?.details);
    }

    // Get race if available
    if (actor.system?.details?.race) {
      const race = actor.system.details.race;
      info.race = typeof race === 'string' ? race : race?.name || null;
    }

    // Build search terms array (prioritized)
    const terms = [];

    // Primary: Actor name (most specific)
    if (info.actorName) {
      terms.push(info.actorName.toLowerCase());
    }

    // Secondary: Token name if different from actor
    if (info.tokenName && info.tokenName.toLowerCase() !== info.actorName?.toLowerCase()) {
      terms.push(info.tokenName.toLowerCase());
    }

    // Tertiary: Creature type + subtype
    if (info.type) {
      terms.push(info.type.toLowerCase());
      if (info.subtype) {
        terms.push(`${info.type} ${info.subtype}`.toLowerCase());
        terms.push(info.subtype.toLowerCase());
      }
    }

    // Custom type if available
    if (info.custom) {
      terms.push(info.custom.toLowerCase());
    }

    // Race if available
    if (info.race) {
      terms.push(info.race.toLowerCase());
    }

    info.searchTerms = [...new Set(terms)]; // Remove duplicates
    return info;
  }

  /**
   * Get NPC tokens to process from the current scene
   * If tokens are selected, only process selected NPC tokens
   * @returns {Token[]} Array of NPC tokens
   */
  static getSceneNPCTokens() {
    if (!canvas?.tokens?.placeables) {
      return [];
    }

    // Check if there are selected tokens
    const selectedTokens = canvas.tokens.controlled;

    if (selectedTokens.length > 0) {
      // Filter selected tokens to only include NPCs
      return selectedTokens.filter(token => {
        const actor = token.actor;
        if (!actor) return false;
        return actor.type === 'npc' || actor.type === 'creature';
      });
    }

    // No selection - get all NPC tokens on the scene
    return canvas.tokens.placeables.filter(token => {
      const actor = token.actor;
      if (!actor) return false;
      return actor.type === 'npc' || actor.type === 'creature';
    });
  }

  /**
   * Group tokens by creature type for batch processing
   * @param {Token[]} tokens - Array of tokens
   * @returns {Map} Map of cache key to group data
   */
  static groupTokensByCreature(tokens) {
    const groups = new Map();

    for (const token of tokens) {
      const creatureInfo = this.extractCreatureInfo(token);
      if (!creatureInfo) continue;

      const key = getCreatureCacheKey(creatureInfo);

      if (!groups.has(key)) {
        groups.set(key, {
          creatureInfo: creatureInfo,
          tokens: [],
          searchTerms: creatureInfo.searchTerms
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
   * @returns {Promise<boolean>} Success status
   */
  static async replaceTokenImage(token, imagePath) {
    try {
      // Update both the token document and the prototype token on the actor
      await token.document.update({
        'texture.src': imagePath
      });

      // Also update the actor's prototype token if it exists
      const actor = token.actor;
      if (actor) {
        await actor.update({
          'prototypeToken.texture.src': imagePath
        });
      }

      console.log(`${MODULE_ID} | Replaced token image for ${token.name}`);
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Error replacing token image:`, error);
      return false;
    }
  }
}
