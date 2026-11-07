/**
 * Token Replacer FA - Progress, outcome and error views
 * @module ui/ProgressView
 */

import { MODULE_ID } from '../core/Constants.js';
import { localizer as defaultLocalizer } from '../core/Localizer.js';
import { templateRenderer } from '../core/TemplateRenderer.js';

const TEMPLATES = Object.freeze({
  scan: `modules/${MODULE_ID}/templates/scan-progress.hbs`,
  parallel: `modules/${MODULE_ID}/templates/parallel-search.hbs`,
  search: `modules/${MODULE_ID}/templates/search-progress.hbs`,
  summary: `modules/${MODULE_ID}/templates/progress.hbs`,
  tvaCache: `modules/${MODULE_ID}/templates/tva-cache.hbs`,
  error: `modules/${MODULE_ID}/templates/error.hbs`,
});

/** A path longer than this is shown with its start elided. */
const MAX_DIR_LENGTH = 50;

/**
 * Turns progress numbers into the dialog's progress screens.
 *
 * Every view with a bar exposes it as `role="progressbar"` with its value, and
 * marks one line `data-announce`: TokenReplacerDialog copies that line into a
 * persistent live region, because a live region re-created by each update is
 * never announced.
 *
 * @pattern Presenter — owns the view data of every progress template (counts,
 * percentages, labels), so the templates stay logic-free and the facade only
 * delegates.
 */
export class ProgressView {
  /**
   * @param {Object} [options]
   * @param {{render: function(string, Object): Promise<string>}} [options.renderer]
   * @param {{localize: function(string, Object=): string}} [options.localizer]
   */
  constructor({ renderer = templateRenderer, localizer = defaultLocalizer } = {}) {
    this._renderer = renderer;
    this._localizer = localizer;
  }

  /**
   * @param {string} key - i18n key without namespace
   * @param {Object} [data] - Placeholder values
   * @returns {string}
   * @private
   */
  _t(key, data) {
    return this._localizer.localize(key, data);
  }

  /**
   * @param {number} current
   * @param {number} total
   * @returns {number} Whole percent, 0 when total is 0
   * @private
   */
  static _percent(current, total) {
    return total > 0 ? Math.round((current / total) * 100) : 0;
  }

  /** @private */
  _cancelLabels() {
    return { cancelLabel: this._t('dialog.cancel'), cancellingLabel: this._t('ui.cancelling') };
  }

  /**
   * Directory scan in progress.
   * @param {string} currentDir - Directory being scanned
   * @param {number} dirsScanned
   * @param {number} imagesFound
   * @param {number} filesInDir
   * @param {number} subDirs
   * @param {string|null} [currentFile]
   * @returns {Promise<string>}
   */
  scan(currentDir, dirsScanned, imagesFound, filesInDir, subDirs, currentFile = null) {
    const shortDir =
      currentDir.length > MAX_DIR_LENGTH
        ? '...' + currentDir.substring(currentDir.length - (MAX_DIR_LENGTH - 3))
        : currentDir;

    return this._renderer.render(TEMPLATES.scan, {
      currentDir,
      shortDir,
      dirsScanned,
      imagesFound,
      currentFile,
      showDirInfo: filesInDir > 0,
      scanningLabel: this._t('ui.scanningArtwork'),
      directoriesLabel: this._t('ui.directories'),
      imagesFoundLabel: this._t('ui.imagesFound'),
      currentDirectoryLabel: this._t('ui.currentDirectory'),
      filesLabel: this._t('ui.filesCount', { count: filesInDir }),
      subdirectoriesLabel: this._t('ui.subdirectoriesCount', { count: subDirs }),
      ...this._cancelLabels(),
    });
  }

  /**
   * Creature types being searched in parallel batches.
   * @param {number} completed
   * @param {number} total
   * @param {number} uniqueTypes
   * @param {number} totalTokens
   * @param {string[]} [currentBatch]
   * @returns {Promise<string>}
   */
  parallelSearch(completed, total, uniqueTypes, totalTokens, currentBatch = []) {
    return this._renderer.render(TEMPLATES.parallel, {
      percent: ProgressView._percent(completed, total),
      uniqueTypes,
      totalTokens,
      currentBatch,
      hasBatch: currentBatch.length > 0,
      titleLabel: this._t('ui.parallelSearchTitle'),
      uniqueCreaturesLabel: this._t('ui.uniqueCreatures'),
      totalTokensLabel: this._t('ui.totalTokens'),
      progressLabel: this._t('ui.creatureTypesSearched', { completed, total }),
      currentlySearchingLabel: this._t('ui.currentlySearching'),
      sharedResultsLabel: this._t('ui.sharedResultsInfo'),
      ...this._cancelLabels(),
    });
  }

  /**
   * One category being listed for the category browser. No Cancel: the
   * listing is fast and the dialog's own Skip already leaves it.
   * @param {string} categoryType
   * @param {{current: number, total: number, term?: string, resultsFound: number}} progress
   * @returns {Promise<string>}
   */
  categorySearch(categoryType, progress) {
    const { current, total, term, resultsFound } = progress;
    return this._renderer.render(TEMPLATES.search, {
      percent: ProgressView._percent(current, total),
      term: term || '',
      headerLabel: this._t('ui.searchingCategory', { category: categoryType }),
      searchingTermLabel: this._t('ui.searchingTerm'),
      termsProgressLabel: this._t('ui.termsProgress', { current, total }),
      resultsFoundLabel: this._t('ui.resultsFoundCount', { count: resultsFound }),
    });
  }

  /**
   * Replacement progress and, once every token is processed, the outcome.
   * @param {number} current
   * @param {number} total
   * @param {string} status - Localized status line
   * @param {{name: string, status: 'success'|'failed'|'skipped', match?: string}[]} results
   * @returns {Promise<string>}
   */
  summary(current, total, status, results) {
    const counts = { success: 0, failed: 0, skipped: 0 };
    for (const result of results) {
      if (result.status in counts) counts[result.status]++;
    }

    return this._renderer.render(TEMPLATES.summary, {
      percent: ProgressView._percent(current, total),
      successCount: counts.success,
      failedCount: counts.failed,
      skippedCount: counts.skipped,
      hasResults: results.length > 0,
      results: results.map((r) => ({
        name: r.name,
        match: r.match || null,
        status: r.status,
        iconClass:
          r.status === 'success' ? 'fa-check' : r.status === 'failed' ? 'fa-times' : 'fa-forward',
      })),
      isComplete: total > 0 && current >= total,
      progressLabel: this._t('ui.progressStatus', { current, total, status }),
      replacedLabel: this._t('ui.replacedLabel'),
      failedLabel: this._t('ui.failedLabel'),
      skippedLabel: this._t('ui.skippedLabel'),
      closeLabel: this._t('dialog.close'),
    });
  }

  /**
   * Reading (or refreshing) Token Variant Art's cache.
   * @param {boolean} [refreshing=false]
   * @param {string|null} [customMessage] - Localized status line
   * @returns {Promise<string>}
   */
  tvaCache(refreshing = false, customMessage = null) {
    return this._renderer.render(TEMPLATES.tvaCache, {
      refreshing,
      statusMessage: customMessage || this._t('ui.usingTvaCache'),
      refreshingLabel: this._t('ui.refreshingCache'),
      refreshingHintLabel: this._t('ui.refreshingCacheHint'),
      tvaCacheInfoLabel: this._t('ui.tvaCacheInfo'),
      ...this._cancelLabels(),
    });
  }

  /**
   * A failure, or an informational stop such as a cancellation.
   * `errorType: 'info'` renders as information (a cancellation), anything else
   * as an error; `details` is disclosed on demand, `recoverySuggestions` are
   * already localized.
   * @param {{errorType?: string, message: string, details?: string, recoverySuggestions?: string[]}|string} errorData - ModuleError-shaped object or a message
   * @returns {Promise<string>}
   */
  error(errorData) {
    const data =
      typeof errorData === 'string' ? { errorType: 'error', message: errorData } : errorData;

    const isInfo = data.errorType === 'info';
    return this._renderer.render(TEMPLATES.error, {
      isInfo,
      toneClass: isInfo ? 'is-info' : 'is-error',
      role: isInfo ? 'status' : 'alert',
      message: data.message,
      details: data.details,
      recoverySuggestions: data.recoverySuggestions,
      showDetailsLabel: this._t('ui.showDetails'),
      howToFixLabel: this._t('ui.howToFix'),
      closeLabel: this._t('dialog.close'),
    });
  }
}
