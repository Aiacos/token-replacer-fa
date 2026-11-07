/**
 * Token Replacer FA - Search source selection
 * @module services/search/SearchPlan
 */

/**
 * Decides which search source answers a query, from the `searchPriority`
 * setting and from what is ready right now (a built index, a loaded TVA cache,
 * an available Bazaar). The orchestrator asks; this class alone holds the
 * priority and fallback rules, so they can be read — and tested — in one place.
 *
 * Priorities: `faNexus` (local/FA first), `forgeBazaar` (Bazaar first), `both`.
 * The Bazaar is a stub today (`ForgeBazaarSource`), which makes every
 * `forgeBazaar` branch fall through to TVA in practice.
 *
 * Built once per set of sources; each decision reads availability live, so a
 * cache that finishes loading mid-session is picked up by the next search.
 *
 * @pattern Strategy selector — maps (priority, readiness) to the strategy that
 * runs; the sources are the strategies.
 */
export class SearchPlan {
  /** What a category search or a subtype search runs first. */
  static STEP = Object.freeze({
    INDEX: 'index',
    FORGE: 'forge',
    TVA_CACHE: 'tvaCache',
    TVA_API: 'tvaApi',
  });

  /**
   * @param {Object} sources - The strategies to choose from
   * @param {import('./IndexSource.js').IndexSource} sources.index - Category index
   * @param {import('./TvaCacheSource.js').TvaCacheSource} sources.tva - Token Variant Art
   * @param {import('./ForgeBazaarSource.js').ForgeBazaarSource} sources.forge - Forge Bazaar
   */
  constructor({ index, tva, forge }) {
    this.index = index;
    this.tva = tva;
    this.forge = forge;
  }

  /**
   * TVA may run unless the user put the Bazaar first and the Bazaar can answer.
   * @private
   * @param {string} priority - `searchPriority` setting
   * @returns {boolean}
   */
  _tvaAllowed(priority) {
    return priority === 'faNexus' || priority === 'both' || !this.forge.isAvailable();
  }

  /**
   * The remote source for a term the user typed, or null when none can answer.
   * @param {string} priority - `searchPriority` setting
   * @returns {Object|null} `forge`, `tva` or null
   */
  sourceForDirectTerm(priority) {
    if (priority === 'forgeBazaar' && this.forge.isAvailable()) return this.forge;
    if (this.tva.isAvailable() && this._tvaAllowed(priority)) return this.tva;
    if (priority !== 'faNexus' && this.forge.isAvailable()) return this.forge;
    return null;
  }

  /**
   * The step that browses a whole creature category, or null when nothing can.
   * A built index wins regardless of priority: it is the fastest and already
   * holds every source's art.
   * @param {string} priority - `searchPriority` setting
   * @returns {string|null} One of `SearchPlan.STEP`, or null
   */
  stepForCategory(priority) {
    const { STEP } = SearchPlan;
    if (this.index.isAvailable()) return STEP.INDEX;
    if (priority === 'forgeBazaar' && this.forge.isAvailable()) return STEP.FORGE;
    const tvaAllowed = this._tvaAllowed(priority);
    if (tvaAllowed && this.tva.isCacheLoaded()) return STEP.TVA_CACHE;
    if (tvaAllowed && this.tva.isAvailable()) return STEP.TVA_API;
    if (priority !== 'faNexus' && this.forge.isAvailable()) return STEP.FORGE;
    return null;
  }

  /**
   * The step that looks up an actor name and its specific subtypes. The
   * priority setting does not apply here: the fastest ready source wins.
   * @returns {string|null} `INDEX`, `TVA_CACHE`, `TVA_API`, or null
   */
  stepForSubtypes() {
    const { STEP } = SearchPlan;
    if (this.index.isAvailable()) return STEP.INDEX;
    if (this.tva.isCacheLoaded()) return STEP.TVA_CACHE;
    if (this.tva.isAvailable()) return STEP.TVA_API;
    return null;
  }

  /**
   * Which sources the standard (no specific subtype) search runs, in order:
   * the local fuzzy search first, then TVA term by term.
   * @param {string} priority - `searchPriority` setting
   * @param {boolean} useTVACache - `useTVACache` setting: search TVA under every priority
   * @returns {{fuzzyLocal: boolean, tvaTerms: boolean}}
   */
  standardSteps(priority, useTVACache) {
    return {
      fuzzyLocal: priority === 'faNexus' || priority === 'both',
      tvaTerms:
        this.tva.isAvailable() &&
        (Boolean(useTVACache) || priority === 'forgeBazaar' || priority === 'both'),
    };
  }
}
