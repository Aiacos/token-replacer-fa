/**
 * Token Replacer FA - Whole-library name search for creatures without matches
 * @module services/search/FullLibrarySearch
 */

import { MODULE_ID } from '../../core/Constants.js';
import { SearchPlan } from './SearchPlan.js';
import { ResultCollector } from './ResultCollector.js';

/**
 * The `fallbackFullSearch` step: when a creature group's normal search found
 * nothing, look its actor name up across the whole library — the index, or the
 * TVA cache when no index is built — with the creature category ignored.
 *
 * Every result keeps the `source` of the library it came from (`index`,
 * `tva-direct`), so the existing source labels still apply, and gains
 * `fromFullSearch: true`, so the UI can tell a name-only guess from a category
 * match.
 *
 * It never fails the group it runs for: the normal search already came back
 * empty, so a broken fallback is reported and the group stays "no match".
 *
 * Cost: one term-index lookup (Article IV.2), or the TVA cache's existing name
 * scan; the slow TVA API is never used (`SearchPlan.stepForFullLibrary`).
 *
 * @pattern Strategy — the fallback search step, plugged after the normal flow
 * by `SearchOrchestrator`; `SearchPlan` picks the source it runs on.
 */
export class FullLibrarySearch {
  /** Score given to a result its source did not score: below a category match. */
  static DEFAULT_SCORE = 0.5;

  /**
   * @param {Object} deps - Collaborators
   * @param {{stepForFullLibrary: function(): (string|null)}} deps.plan - Source selection
   * @param {import('./SearchSource.js').SearchSource} deps.index - Index source
   * @param {import('./SearchSource.js').SearchSource} deps.tva - TVA source
   * @param {{isExcluded: function(string): boolean}} deps.pathFilter - Excluded-folder filter
   * @param {function(string, string): *} deps.getSetting - Settings getter
   */
  constructor({ plan, index, tva, pathFilter, getSetting }) {
    this._plan = plan;
    this._index = index;
    this._tva = tva;
    this._pathFilter = pathFilter;
    this._getSetting = getSetting;
  }

  /**
   * True when the user turned the fallback on. Read per call, so toggling the
   * setting applies to the next search without a reload.
   * @returns {boolean}
   */
  isEnabled() {
    return this._getSetting(MODULE_ID, 'fallbackFullSearch') === true;
  }

  /**
   * @param {string|null|undefined} actorName - The creature's actor name
   * @returns {Promise<Array<Object>>} Unranked name matches, each tagged
   *   `fromFullSearch: true`; `[]` when disabled, nameless, nothing is ready, or
   *   the source failed
   */
  async search(actorName) {
    if (!this.isEnabled()) return [];
    const name = typeof actorName === 'string' ? actorName.trim() : '';
    if (!name) return [];

    try {
      const found = await this._searchStep(this._plan.stepForFullLibrary(), name);
      const collector = new ResultCollector(this._pathFilter);
      // An index built before a folder was excluded still holds its paths.
      collector.addAll(found, {
        skipExcluded: true,
        tag: (result) => ({
          ...result,
          score: result.score ?? FullLibrarySearch.DEFAULT_SCORE,
          fromFullSearch: true,
        }),
      });
      return collector.results;
    } catch (error) {
      console.warn(`${MODULE_ID} | Full-library fallback search failed for "${name}":`, error);
      return [];
    }
  }

  /**
   * @private
   * @param {string|null} step - `SearchPlan.STEP.INDEX`, `TVA_CACHE`, or null
   * @param {string} name - Trimmed actor name
   * @returns {Promise<Array<Object>>}
   */
  async _searchStep(step, name) {
    switch (step) {
      case SearchPlan.STEP.INDEX:
        // The term index is keyed by lowercase tokens.
        return this._index.search({ kind: 'term', value: name.toLowerCase() });
      case SearchPlan.STEP.TVA_CACHE:
        return this._tva.search({ kind: 'term', value: name });
      default:
        return [];
    }
  }
}
