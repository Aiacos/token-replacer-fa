/**
 * Token Replacer FA - Shared core of the selection dialogs
 * @module ui/SelectionPanel
 */

import { localizer as defaultLocalizer } from '../core/Localizer.js';
import { templateRenderer } from '../core/TemplateRenderer.js';
import { DisplayLabels } from './DisplayLabels.js';
import { MatchGrid } from './MatchGrid.js';

/**
 * @typedef {Object} SelectionResult
 * @property {string[]} paths - Chosen token art, in rank order
 * @property {'sequential'|'random'} mode - How the paths are spread over the tokens
 */

/**
 * What both selection dialogs share: the grid, the assignment mode, Apply,
 * Skip, the selection count, and the one outcome the dialog produces.
 *
 * The outcome resolves exactly once — Apply, Skip, a double-click or the
 * dialog closing, whichever comes first — and settling detaches every
 * listener, so a late click on a stale dialog can reach nothing.
 *
 * @pattern Mediator — grid, mode buttons, count and Apply never talk to each
 * other; they talk to the panel, which keeps them consistent (Apply is
 * disabled exactly while the grid's selection is empty).
 */
export class SelectionPanel {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - The dialog's `.dialog-content`
   * @param {boolean} options.multiSelect - Several tokens share this choice
   * @param {{localize: function(string, Object=): string}} [options.localizer]
   * @param {DisplayLabels} [options.labels]
   * @param {{render: function(string, Object): Promise<string>}} [options.renderer]
   */
  constructor({
    container,
    multiSelect,
    localizer = defaultLocalizer,
    labels = new DisplayLabels(localizer),
    renderer = templateRenderer,
  }) {
    this._container = container;
    this._localizer = localizer;
    this._abort = new AbortController();
    /** @type {'sequential'|'random'} */
    this._mode = 'sequential';
    this._settled = false;

    /** @type {Promise<SelectionResult|null>} */
    this.result = new Promise((resolve) => {
      this._resolve = resolve;
    });

    this.grid = new MatchGrid({
      element: container.querySelector('.token-replacer-fa-match-select'),
      emptyElement: container.querySelector('.match-grid-empty'),
      multiSelect,
      renderer,
      labels,
    });

    this._applyButton = /** @type {HTMLButtonElement|null} */ (
      container.querySelector('.select-btn')
    );
    this._countElement = container.querySelector('.selection-count');

    this._wire();
  }

  /** @returns {AbortSignal} Aborted when the dialog's outcome is settled */
  get signal() {
    return this._abort.signal;
  }

  /** @returns {boolean} */
  get settled() {
    return this._settled;
  }

  /**
   * Resolve the dialog's outcome; every call after the first is ignored.
   * @param {SelectionResult|null} value - The choice, or null for skip/close
   */
  settle(value) {
    if (this._settled) return;
    this._settled = true;
    this._abort.abort();
    this.grid.destroy();
    this._resolve(value);
  }

  /** @private */
  _apply() {
    const paths = this.grid.selectedPaths;
    if (paths.length > 0) this.settle({ paths, mode: this._mode });
  }

  /** @private */
  _wire() {
    const signal = this._abort.signal;
    const preview = this._container.querySelector('.token-replacer-fa-token-preview');
    if (preview) MatchGrid.watchImages(/** @type {HTMLElement} */ (preview), signal);

    const modeButtons = [...this._container.querySelectorAll('.mode-btn')];
    for (const button of modeButtons) {
      button.addEventListener(
        'click',
        () => {
          this._mode =
            /** @type {HTMLElement} */ (button).dataset.mode === 'random' ? 'random' : 'sequential';
          for (const other of modeButtons) {
            const pressed = other === button;
            other.setAttribute('aria-pressed', String(pressed));
            other.classList.toggle('active', pressed);
          }
        },
        { signal }
      );
    }

    this._applyButton?.addEventListener('click', () => this._apply(), { signal });
    this._container
      .querySelector('.skip-btn')
      ?.addEventListener('click', () => this.settle(null), { signal });

    this.grid.onSelectionChange((paths) => this._showSelection(paths.length));
    this.grid.onActivate(() => this._apply());
    this._showSelection(this.grid.selectionSize);
  }

  /**
   * @param {number} count - Selected matches
   * @private
   */
  _showSelection(count) {
    if (this._applyButton) this._applyButton.disabled = count === 0;
    if (this._countElement) {
      this._countElement.textContent =
        count === 1
          ? this._localizer.localize('ui.selectedCountOne')
          : this._localizer.localize('ui.selectedCount', { count });
    }
  }
}
