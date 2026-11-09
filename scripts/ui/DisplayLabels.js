/**
 * Token Replacer FA - User-language labels for internal ids
 * @module ui/DisplayLabels
 */

import { localizer as defaultLocalizer } from '../core/Localizer.js';

/**
 * Turns the ids the services speak — D&D 5e creature type keys, match source
 * ids — into words a user reads, and the words a user types back into ids.
 *
 * The key tables are spelled out literally rather than built with a template
 * string: `npm run validate` can only prove a key exists when it can see it.
 * `tests/ui/DisplayLabels.test.js` keeps the creature table in step with
 * CREATURE_TYPE_MAPPINGS.
 *
 * @pattern Adapter — one translation point between service ids and UI labels,
 * so no template or controller formats an id for display on its own.
 */
export class DisplayLabels {
  static CREATURE_TYPE_KEYS = Object.freeze({
    aberration: 'ui.creatureTypes.aberration',
    beast: 'ui.creatureTypes.beast',
    celestial: 'ui.creatureTypes.celestial',
    construct: 'ui.creatureTypes.construct',
    dragon: 'ui.creatureTypes.dragon',
    elemental: 'ui.creatureTypes.elemental',
    fey: 'ui.creatureTypes.fey',
    fiend: 'ui.creatureTypes.fiend',
    giant: 'ui.creatureTypes.giant',
    humanoid: 'ui.creatureTypes.humanoid',
    monstrosity: 'ui.creatureTypes.monstrosity',
    ooze: 'ui.creatureTypes.ooze',
    plant: 'ui.creatureTypes.plant',
    undead: 'ui.creatureTypes.undead',
  });

  static SOURCE_KEYS = Object.freeze({
    index: 'ui.source.index',
    local: 'ui.source.local',
    tva: 'ui.source.tva',
    'tva-direct': 'ui.source.tvaDirect',
    'forge-bazaar': 'ui.source.forgeBazaar',
  });

  /**
   * @param {{localize: function(string, Object=): string}} [localizer] - Defaults to the module localizer
   */
  constructor(localizer = defaultLocalizer) {
    this._localizer = localizer;
  }

  /**
   * @param {string|null|undefined} type - Creature type key from the actor
   * @returns {string} Localized type, the raw type when unmapped, or "unknown type"
   */
  creatureType(type) {
    const key = type ? DisplayLabels.CREATURE_TYPE_KEYS[type.toLowerCase()] : null;
    if (key) return this._localizer.localize(key);
    return type || this._localizer.localize('ui.unknownType');
  }

  /**
   * @param {string|undefined} source - Match source id (e.g. 'tva-direct')
   * @returns {string} Localized source name, or '' for an unknown source
   */
  source(source) {
    const key = source ? DisplayLabels.SOURCE_KEYS[source] : null;
    return key ? this._localizer.localize(key) : '';
  }

  /**
   * Every creature type for the category browser, alphabetical in the user's language.
   * @returns {{key: string, label: string}[]}
   */
  creatureTypeOptions() {
    return Object.keys(DisplayLabels.CREATURE_TYPE_KEYS)
      .map((key) => ({ key, label: this.creatureType(key) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Map what the user typed in the category browser back to a type key.
   * Accepts the key or the localized label in any case; anything else is a free
   * search term and is returned lowercased.
   * @param {string} text - Typed text
   * @returns {string} Creature type key or lowercased search term
   */
  resolveCreatureType(text) {
    const wanted = text.trim().toLowerCase();
    for (const { key, label } of this.creatureTypeOptions()) {
      if (key === wanted || label.toLowerCase() === wanted) return key;
    }
    return wanted;
  }
}
