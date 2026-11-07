/**
 * Token Replacer FA - Creature info from D&D 5e actors
 * @module services/token/CreatureInfoExtractor
 */

import { MODULE_ID } from '../../core/Constants.js';

/** "Humanoid (Tiefling)" → type "Humanoid", subtype "Tiefling". */
const PARENTHESIZED_SUBTYPE = /^([^(]+)\s*\(([^)]+)\)$/;

/** dnd5e's `value` when the type is user-defined and named in `custom`. */
const CUSTOM_TYPE = 'custom';

/**
 * Reads what search needs from a token's dnd5e actor: creature type, subtype,
 * custom type, swarm size, race, and the prioritized search terms built from
 * them.
 *
 * dnd5e 4.x stores the type as `system.details.type = { value, subtype, swarm,
 * custom }`, where `value: "custom"` means "the type is the text in `custom`"
 * and `swarm` is a size key (e.g. "tiny") for a swarm of that creature type.
 * Older data and some importers store a plain "Type (Subtype)" string.
 * Verified against dnd5e 5.0.x (unchanged since 4.x):
 * https://github.com/foundryvtt/dnd5e/blob/5.0.x/module/data/shared/creature-type-field.mjs
 * and `Actor5e.formatCreatureType()` in module/documents/actor/actor.mjs,
 * which renders `value: "custom"` as the `custom` text.
 *
 * @pattern Adapter — the system-specific actor shapes come in, one
 * system-neutral CreatureInfo comes out; nothing else reads `actor.system`.
 */
export class CreatureInfoExtractor {
  /**
   * @param {Token} token - Foundry VTT token
   * @returns {import('../../types/typedefs.js').CreatureInfo | null} Creature info, or null without an actor
   */
  extract(token) {
    const actor = token.actor;
    if (!actor) return null;

    /** @type {any} - D&D 5e system texture access */
    const tokenTexture = token.texture;
    const info = {
      tokenId: token.id,
      tokenName: token.name,
      actorName: /** @type {string} */ (actor.name),
      actorId: actor.id,
      currentImage: token.document?.texture?.src || tokenTexture?.src,
      type: null,
      subtype: null,
      race: null,
      swarm: null,
      searchTerms: [],
    };

    /** @type {any} - D&D 5e system data (not typed by fvtt-types) */
    const system = actor.system;
    const typeData = system?.details?.type;
    if (typeof typeData === 'string') {
      this._readTypeString(typeData, info);
    } else if (typeData && typeof typeData === 'object') {
      this._readTypeObject(typeData, info);
    }

    // Some systems and importers use a flat creatureType field instead
    if (!info.type && system?.details?.creatureType) {
      const fallbackType = system.details.creatureType;
      info.type = typeof fallbackType === 'string' ? fallbackType.toLowerCase() : fallbackType;
    }

    if (!info.type) {
      console.warn(
        `${MODULE_ID} | Could not extract creature type for ${actor.name}. Details:`,
        system?.details
      );
    }

    const race = system?.details?.race;
    if (race) {
      info.race = typeof race === 'string' ? race : race?.name || null;
    }

    info.searchTerms = this._searchTerms(info);
    return info;
  }

  /**
   * @param {string} typeData - "Type" or "Type (Subtype)"
   * @param {Object} info - Info being filled
   * @private
   */
  _readTypeString(typeData, info) {
    const parenMatch = typeData.match(PARENTHESIZED_SUBTYPE);
    if (parenMatch) {
      info.type = parenMatch[1].trim().toLowerCase() || null;
      info.subtype = parenMatch[2].trim() || null;
    } else {
      info.type = typeData.trim().toLowerCase() || null;
    }
  }

  /**
   * @param {{value?: string, label?: string, subtype?: string, custom?: string, swarm?: string}} typeData - dnd5e type object
   * @param {Object} info - Info being filled
   * @private
   */
  _readTypeObject(typeData, info) {
    const custom = typeData.custom || null;
    let typeValue = typeData.value || typeData.label || null;
    if (typeValue === CUSTOM_TYPE || !typeValue) typeValue = custom;

    info.type = typeValue ? typeValue.toLowerCase() : null;
    info.subtype = typeData.subtype || null;
    info.custom = custom;
    info.swarm = typeData.swarm || null;
  }

  /**
   * Most specific first: actor name, token name, type, type + subtype,
   * subtype, custom type, race — lowercased and de-duplicated.
   * @param {Object} info - Filled info
   * @returns {string[]}
   * @private
   */
  _searchTerms(info) {
    const terms = [];
    if (info.actorName) terms.push(info.actorName.toLowerCase());
    if (info.tokenName && info.tokenName.toLowerCase() !== info.actorName?.toLowerCase()) {
      terms.push(info.tokenName.toLowerCase());
    }
    if (info.type) {
      terms.push(info.type.toLowerCase());
      if (info.subtype) {
        terms.push(`${info.type} ${info.subtype}`.toLowerCase());
        terms.push(info.subtype.toLowerCase());
      }
    }
    if (info.custom) terms.push(info.custom.toLowerCase());
    if (info.race) terms.push(info.race.toLowerCase());
    return [...new Set(terms)];
  }
}
