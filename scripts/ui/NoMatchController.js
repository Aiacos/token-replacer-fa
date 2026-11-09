/**
 * Token Replacer FA - No-match dialog with category browser
 * @module ui/NoMatchController
 */

import { MODULE_ID } from '../core/Constants.js';
import { localizer as defaultLocalizer } from '../core/Localizer.js';
import { templateRenderer } from '../core/TemplateRenderer.js';
import { DisplayLabels } from './DisplayLabels.js';
import { FilterBox } from './FilterBox.js';
import { FilterTermStore } from './FilterTermStore.js';
import { SelectionPanel } from './SelectionPanel.js';

/**
 * @callback CategorySearch
 * @param {string} type - Creature type key or free search term
 * @param {Array} localIndex - Local image index
 * @param {null} term - Unused here; the whole category is listed
 * @param {function(Object): Promise<void>} onProgress - Progress callback
 * @returns {Promise<import('./MatchGrid.js').Match[]>}
 */

/**
 * Runs one no-match dialog: the search found nothing, so the user browses a
 * creature type category (or types a free term) and picks from what it holds.
 *
 * Each search gets its own AbortController: a second search started while the
 * first is still running wins, and the first one's late results and progress
 * are dropped instead of overwriting the newer grid.
 *
 * @pattern Mediator — connects the type input, the search button, the
 * category search, the progress area, the filter box and the selection panel.
 */
export class NoMatchController {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - The dialog's `.dialog-content`
   * @param {number} options.tokenCount - Tokens sharing this choice
   * @param {Array} options.localIndex - Passed through to the search
   * @param {CategorySearch} options.searchByCategory - Lists a category
   * @param {function(string, Object): Promise<string>} options.renderProgress - Renders search-progress.hbs
   * @param {{localize: function(string, Object=): string}} [options.localizer]
   * @param {DisplayLabels} [options.labels]
   * @param {{render: function(string, Object): Promise<string>}} [options.renderer]
   * @param {FilterTermStore} [options.filterStore]
   * @param {function(): {warn: function(string): void, error: function(string): void}} [options.notifications] - Foundry's ui.notifications, read lazily
   */
  constructor({
    container,
    tokenCount,
    localIndex,
    searchByCategory,
    renderProgress,
    localizer = defaultLocalizer,
    labels = new DisplayLabels(localizer),
    renderer = templateRenderer,
    filterStore = new FilterTermStore(),
    notifications = () => ui.notifications,
  }) {
    this._container = container;
    this._multiSelect = tokenCount > 1;
    this._localIndex = localIndex;
    this._searchByCategory = searchByCategory;
    this._renderProgress = renderProgress;
    this._localizer = localizer;
    this._labels = labels;
    this._filterStore = filterStore;
    this._notifications = notifications;
    /** @type {AbortController|null} */
    this._searchAbort = null;
    this._panel = new SelectionPanel({
      container,
      multiSelect: this._multiSelect,
      localizer,
      labels,
      renderer,
    });
  }

  /**
   * Wire the dialog and wait for the user.
   * @returns {Promise<import('./SelectionPanel.js').SelectionResult|null>}
   */
  start() {
    const panel = this._panel;
    const signal = panel.signal;
    const find = (selector) =>
      /** @type {HTMLElement|null} */ (this._container.querySelector(selector));

    this._el = {
      typeInput: /** @type {HTMLInputElement|null} */ (find('.category-type-input')),
      results: find('.category-results'),
      loading: find('.category-results-loading'),
      noResults: find('.no-results-message'),
      filter: find('.category-filter'),
      resultCount: find('.category-result-count'),
      modeToggle: find('.token-replacer-fa-mode-toggle'),
      selectionInfo: find('.token-replacer-fa-selection-info'),
    };

    const filterInput = /** @type {HTMLInputElement|null} */ (
      find('.category-search-filter-input')
    );
    this._filterBox = filterInput
      ? new FilterBox({
          input: filterInput,
          clearButton: find('.category-filter .search-clear-btn'),
          store: this._filterStore,
          signal,
          onChange: (text) => {
            panel.grid.filter(text).catch((error) => this._reportRenderFailure(error));
          },
        })
      : null;
    // Every change, a page rendered on scroll included, reaches the count.
    panel.grid.onCountChange((outcome) => this._showCount(outcome));

    find('.search-category-btn')?.addEventListener('click', () => this._search(), { signal });
    this._el.typeInput?.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this._search();
        }
      },
      { signal }
    );
    signal.addEventListener('abort', () => this._searchAbort?.abort());

    return panel.result;
  }

  /** Resolve the dialog with null, e.g. because it was closed. */
  cancel() {
    this._panel.settle(null);
  }

  /** @private */
  async _search() {
    const el = this._el;
    const typed = el.typeInput?.value?.trim();
    if (!typed) {
      this._notifications().warn(this._localizer.localize('dialog.selectTypeFirst'));
      return;
    }
    const type = this._labels.resolveCreatureType(typed);

    this._searchAbort?.abort();
    const search = new AbortController();
    this._searchAbort = search;

    if (el.results) el.results.hidden = false;
    for (const element of [el.noResults, el.filter, el.modeToggle, el.selectionInfo]) {
      if (element) element.hidden = true;
    }
    await this._showProgress(type, {
      current: 0,
      total: 1,
      term: this._localizer.localize('ui.initializing'),
      resultsFound: 0,
    });
    await this._panel.grid.setMatches([]);

    let results;
    try {
      results = await this._searchByCategory(type, this._localIndex, null, async (progress) => {
        if (!search.signal.aborted) await this._showProgress(type, progress);
      });
    } catch (error) {
      if (search.signal.aborted) return;
      console.warn(`${MODULE_ID} | Category search failed:`, error);
      if (el.loading) el.loading.hidden = true;
      this._notifications().error(this._localizer.localize('notifications.categorySearchFailed'));
      return;
    }
    if (search.signal.aborted) return;

    if (el.loading) el.loading.hidden = true;
    if (results.length === 0) {
      if (el.noResults) el.noResults.hidden = false;
      return;
    }

    this._filterBox?.reset('');
    if (el.filter) el.filter.hidden = false;
    if (this._multiSelect) {
      if (el.modeToggle) el.modeToggle.hidden = false;
      if (el.selectionInfo) el.selectionInfo.hidden = false;
    }
    try {
      await this._panel.grid.setMatches(results);
    } catch (error) {
      this._reportRenderFailure(error);
    }
  }

  /**
   * @param {string} type - Category being listed
   * @param {Object} progress - Search progress
   * @private
   */
  async _showProgress(type, progress) {
    const loading = this._el.loading;
    if (!loading) return;
    loading.hidden = false;
    // Rendered by search-progress.hbs: escaped by Handlebars, not built here.
    loading.innerHTML = await this._renderProgress(type, progress);
  }

  /**
   * @param {import('./MatchGrid.js').FilterOutcome} outcome
   * @private
   */
  _showCount({ visible, total }) {
    if (!this._el.resultCount) return;
    this._el.resultCount.textContent = this._localizer.localize('ui.showingResults', {
      visible,
      total,
    });
  }

  /**
   * @param {unknown} error - Template render failure
   * @private
   */
  _reportRenderFailure(error) {
    console.error(`${MODULE_ID} | Could not render the match grid:`, error);
    this._notifications().error(this._localizer.localize('notifications.matchGridFailed'));
  }
}
