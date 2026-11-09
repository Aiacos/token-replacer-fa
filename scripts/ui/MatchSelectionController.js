/**
 * Token Replacer FA - Match selection dialog
 * @module ui/MatchSelectionController
 */

import { MODULE_ID } from '../core/Constants.js';
import { localizer as defaultLocalizer } from '../core/Localizer.js';
import { templateRenderer } from '../core/TemplateRenderer.js';
import { DisplayLabels } from './DisplayLabels.js';
import { FilterBox } from './FilterBox.js';
import { FilterTermStore } from './FilterTermStore.js';
import { SelectionPanel } from './SelectionPanel.js';

/**
 * Runs one match selection dialog: the search found matches and the user
 * picks token art among them, optionally narrowing the grid with a filter.
 *
 * @pattern Mediator — connects the filter box to the selection panel's grid
 * and its result count; neither knows the other exists.
 */
export class MatchSelectionController {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - The dialog's `.dialog-content`
   * @param {import('./MatchGrid.js').Match[]} options.matches - Every match, in rank order
   * @param {boolean} options.multiSelect - Several tokens share this choice
   * @param {{localize: function(string, Object=): string}} [options.localizer]
   * @param {DisplayLabels} [options.labels]
   * @param {{render: function(string, Object): Promise<string>}} [options.renderer]
   * @param {FilterTermStore} [options.filterStore]
   * @param {function(): {error: function(string): void}} [options.notifications] - Foundry's ui.notifications, read lazily
   */
  constructor({
    container,
    matches,
    multiSelect,
    localizer = defaultLocalizer,
    labels = new DisplayLabels(localizer),
    renderer = templateRenderer,
    filterStore = new FilterTermStore(),
    notifications = () => ui.notifications,
  }) {
    this._container = container;
    this._matches = matches;
    this._localizer = localizer;
    this._filterStore = filterStore;
    this._notifications = notifications;
    this._panel = new SelectionPanel({ container, multiSelect, localizer, labels, renderer });
  }

  /**
   * Wire the dialog and wait for the user.
   * @returns {Promise<import('./SelectionPanel.js').SelectionResult|null>}
   */
  start() {
    const panel = this._panel;
    const resultCount = this._container.querySelector('.result-count');
    // The grid reports every change, a page rendered on scroll included, so
    // the count is never read off one filter call's result.
    panel.grid.onCountChange(({ visible, total }) => {
      if (resultCount) {
        resultCount.textContent = this._localizer.localize('ui.showingResults', {
          visible,
          total,
        });
      }
    });

    const input = /** @type {HTMLInputElement|null} */ (
      this._container.querySelector('.search-filter-input')
    );
    const filterBox = input
      ? new FilterBox({
          input,
          clearButton: this._container.querySelector('.search-clear-btn'),
          store: this._filterStore,
          signal: panel.signal,
          onChange: (text) => {
            panel.grid.filter(text).catch((error) => this._reportRenderFailure(error));
          },
        })
      : null;

    panel.grid.setMatches(this._matches).then(
      () => {
        // A term restored from the previous dialog is applied once the grid
        // exists; applied any earlier, the unfiltered first render would win.
        if (filterBox && filterBox.value.trim().length > 0) filterBox.apply();
      },
      (error) => this._reportRenderFailure(error)
    );

    return panel.result;
  }

  /** Resolve the dialog with null, e.g. because it was closed. */
  cancel() {
    this._panel.settle(null);
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
