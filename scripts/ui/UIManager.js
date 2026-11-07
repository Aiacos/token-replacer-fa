/**
 * Token Replacer FA - UI entry point
 * @module ui/UIManager
 */

import { MODULE_ID } from '../core/Constants.js';
import { localizer as defaultLocalizer } from '../core/Localizer.js';
import { templateRenderer } from '../core/TemplateRenderer.js';
import { DisplayLabels } from './DisplayLabels.js';
import { FilterTermStore } from './FilterTermStore.js';
import { MatchSelectionController } from './MatchSelectionController.js';
import { NoMatchController } from './NoMatchController.js';
import { ProgressView } from './ProgressView.js';
import { TokenReplacerDialog } from './TokenReplacerDialog.js';

const TEMPLATES = Object.freeze({
  matchSelection: `modules/${MODULE_ID}/templates/match-selection.hbs`,
  noMatch: `modules/${MODULE_ID}/templates/no-match.hbs`,
});

/**
 * The one object main.js talks to for anything on screen: it opens the dialog,
 * renders each screen and runs the selection dialogs, delegating the work to
 * ProgressView, MatchSelectionController, NoMatchController and
 * TokenReplacerDialog.
 *
 * It owns the run-level UI state: the open dialog, the Cancel callback, the
 * matches waiting for their selection dialog, and the selection dialog in
 * progress — so closing the window can settle that dialog with null instead of
 * leaving processTokenReplacement() waiting forever.
 *
 * @pattern Facade — keeps main.js's call sites (create*HTML, setup*Handlers,
 * updateDialogContent, closeDialog, …) stable while the work behind them is
 * split across focused classes.
 */
export class UIManager {
  /**
   * @param {Object} [deps] - Collaborators; the defaults are the page-wide instances
   * @param {{localize: function(string, Object=): string, stats?: Object}} [deps.localizer]
   * @param {{render: function(string, Object): Promise<string>}} [deps.renderer]
   * @param {FilterTermStore} [deps.filterStore]
   * @param {DisplayLabels} [deps.labels]
   * @param {ProgressView} [deps.progressView]
   */
  constructor({
    localizer = defaultLocalizer,
    renderer = templateRenderer,
    filterStore = new FilterTermStore(),
    labels = new DisplayLabels(localizer),
    progressView = new ProgressView({ renderer, localizer }),
  } = {}) {
    this._localizer = localizer;
    this._renderer = renderer;
    this._filterStore = filterStore;
    this._labels = labels;
    this._progressView = progressView;

    /** @type {TokenReplacerDialog|null} */
    this.mainDialog = null;
    /** @type {Function|null} */
    this.cancelCallback = null;
    /** Matches rendered by createMatchSelectionHTML, awaiting their handlers. */
    this._pendingMatches = null;
    /** @type {{cancel: function(): void}|null} The selection dialog in progress */
    this._activeSelection = null;
    /** @type {AbortController|null} Detaches the window-level Cancel/Close listener */
    this._actionsAbort = null;
    /** @type {HTMLElement|null} The window element that listener is on */
    this._boundWindow = null;
  }

  // ── screens ────────────────────────────────────────────────────────────────

  /**
   * @param {string} currentDir
   * @param {number} dirsScanned
   * @param {number} imagesFound
   * @param {number} filesInDir
   * @param {number} subDirs
   * @param {string|null} [currentFile]
   * @returns {Promise<string>} HTML
   */
  async createScanProgressHTML(
    currentDir,
    dirsScanned,
    imagesFound,
    filesInDir,
    subDirs,
    currentFile = null
  ) {
    return this._progressView.scan(
      currentDir,
      dirsScanned,
      imagesFound,
      filesInDir,
      subDirs,
      currentFile
    );
  }

  /**
   * @param {number} completed
   * @param {number} total
   * @param {number} uniqueTypes
   * @param {number} totalTokens
   * @param {string[]} [currentBatch]
   * @returns {Promise<string>} HTML
   */
  async createParallelSearchHTML(completed, total, uniqueTypes, totalTokens, currentBatch = []) {
    return this._progressView.parallelSearch(
      completed,
      total,
      uniqueTypes,
      totalTokens,
      currentBatch
    );
  }

  /**
   * @param {string} categoryType
   * @param {{current: number, total: number, term?: string, resultsFound: number}} progress
   * @returns {Promise<string>} HTML
   */
  async createSearchProgressHTML(categoryType, progress) {
    return this._progressView.categorySearch(categoryType, progress);
  }

  /**
   * @param {number} current
   * @param {number} total
   * @param {string} status
   * @param {Array} results
   * @returns {Promise<string>} HTML
   */
  async createProgressHTML(current, total, status, results) {
    return this._progressView.summary(current, total, status, results);
  }

  /**
   * @param {boolean} [refreshing=false]
   * @param {string|null} [customMessage]
   * @returns {Promise<string>} HTML
   */
  async createTVACacheHTML(refreshing = false, customMessage = null) {
    return this._progressView.tvaCache(refreshing, customMessage);
  }

  /**
   * @param {Object|string} errorData - ModuleError-shaped object or a message
   * @returns {Promise<string>} HTML
   */
  async createErrorHTML(errorData) {
    return this._progressView.error(errorData);
  }

  /**
   * The match selection screen. The tiles are rendered by
   * setupMatchSelectionHandlers(), which needs the matches kept here.
   * @param {Object} creatureInfo - From TokenService
   * @param {Array} matches - Every match, in rank order
   * @param {number} [tokenCount=1]
   * @returns {Promise<string>} HTML
   */
  async createMatchSelectionHTML(creatureInfo, matches, tokenCount = 1) {
    this._pendingMatches = matches;
    return this._renderer.render(TEMPLATES.matchSelection, {
      ...this._headerData(creatureInfo, tokenCount),
      ...this._selectionLabels(tokenCount),
      savedFilterTerm: this._filterStore.load(),
      resultCountLabel: '',
    });
  }

  /**
   * The no-match screen with its category browser.
   * @param {Object} creatureInfo - From TokenService
   * @param {number} [tokenCount=1]
   * @returns {Promise<string>} HTML
   */
  async createNoMatchHTML(creatureInfo, tokenCount = 1) {
    const t = (key, data) => this._localizer.localize(key, data);
    return this._renderer.render(TEMPLATES.noMatch, {
      ...this._headerData(creatureInfo, tokenCount),
      ...this._selectionLabels(tokenCount),
      savedFilterTerm: this._filterStore.load(),
      noMatchMessage: t('dialog.noMatch', { name: creatureInfo.actorName }),
      browseByTypeLabel: t('dialog.browseByType'),
      searchCategoryLabel: t('dialog.searchCategory'),
      creatureTypePlaceholder: t('ui.creatureTypePlaceholder'),
      noResultsLabel: t('dialog.noResultsInCategory'),
      typeValue: creatureInfo.type ? this._labels.creatureType(creatureInfo.type) : '',
      creatureTypes: this._labels.creatureTypeOptions(),
    });
  }

  /**
   * @param {Object} creatureInfo
   * @param {number} tokenCount
   * @returns {Object} Template data for the token preview header
   * @private
   */
  _headerData(creatureInfo, tokenCount) {
    return {
      currentImage: creatureInfo.currentImage,
      actorName: creatureInfo.actorName,
      typeLabel: this._labels.creatureType(creatureInfo.type),
      subtype: creatureInfo.subtype || '',
      showTokenCount: tokenCount > 1,
      tokenCountLabel: this._localizer.localize('ui.tokenCount', { count: tokenCount }),
    };
  }

  /**
   * @param {number} tokenCount
   * @returns {Object} Labels shared by both selection screens
   * @private
   */
  _selectionLabels(tokenCount) {
    const t = (key, data) => this._localizer.localize(key, data);
    return {
      showMultiSelect: tokenCount > 1,
      filterLabel: t('ui.filterLabel'),
      filterPlaceholder: t('ui.filterPlaceholder'),
      filterHint: t('ui.filterHint'),
      clearFilterLabel: t('dialog.clearFilter'),
      matchGridLabel: t('ui.matchGridLabel'),
      noFilterResultsLabel: t('ui.noFilterResults'),
      variantAssignmentLabel: t('ui.variantAssignment'),
      sequentialLabel: t('ui.modeSequential'),
      randomLabel: t('ui.modeRandom'),
      multiSelectHintLabel: t('ui.multiSelectHint'),
      selectionCountLabel: '',
      applyLabel: t('ui.apply'),
      applyToRemainingLabel: t('ui.applyToRemaining'),
      applyToRemainingHint: t('ui.applyToRemainingHint'),
      skipLabel: t('dialog.skip'),
    };
  }

  // ── selection dialogs ──────────────────────────────────────────────────────

  /**
   * Run the match selection screen currently in the dialog.
   * @param {HTMLElement} dialogElement - The dialog window element
   * @returns {Promise<import('./SelectionPanel.js').SelectionResult|null>} The choice, or null for skip/close
   */
  setupMatchSelectionHandlers(dialogElement) {
    const container = /** @type {HTMLElement|null} */ (
      dialogElement.querySelector('.dialog-content')
    );
    if (!container) {
      console.warn(`${MODULE_ID} | No dialog-content found`);
      return Promise.resolve(null);
    }
    const grid = /** @type {HTMLElement|null} */ (
      container.querySelector('.token-replacer-fa-match-select')
    );
    return this._run(
      new MatchSelectionController({
        container,
        matches: this._pendingMatches || [],
        multiSelect: grid?.dataset.multiselect === 'true',
        localizer: this._localizer,
        labels: this._labels,
        renderer: this._renderer,
        filterStore: this._filterStore,
      })
    );
  }

  /**
   * Run the no-match screen currently in the dialog.
   * @param {HTMLElement} dialogElement - The dialog window element
   * @param {Object} _creatureInfo - Unused; kept for main.js's call signature
   * @param {Array} localIndex - Passed to the category search
   * @param {number} tokenCount - Tokens sharing the choice
   * @param {import('./NoMatchController.js').CategorySearch} searchByCategory - Lists a category
   * @returns {Promise<import('./SelectionPanel.js').SelectionResult|null>} The choice, or null for skip/close
   */
  setupNoMatchHandlers(dialogElement, _creatureInfo, localIndex, tokenCount, searchByCategory) {
    const container = /** @type {HTMLElement|null} */ (
      dialogElement.querySelector('.dialog-content')
    );
    if (!container) {
      console.warn(`${MODULE_ID} | No dialog-content found`);
      return Promise.resolve(null);
    }
    return this._run(
      new NoMatchController({
        container,
        tokenCount,
        localIndex,
        searchByCategory,
        renderProgress: (type, progress) => this.createSearchProgressHTML(type, progress),
        localizer: this._localizer,
        labels: this._labels,
        renderer: this._renderer,
        filterStore: this._filterStore,
      })
    );
  }

  /**
   * Make a controller the active selection dialog until it settles; a newer
   * one supersedes it, settling it with null.
   * @param {MatchSelectionController|NoMatchController} controller
   * @returns {Promise<Object|null>}
   * @private
   */
  _run(controller) {
    this._activeSelection?.cancel();
    this._activeSelection = controller;
    return controller.start().then((result) => {
      if (this._activeSelection === controller) this._activeSelection = null;
      return result;
    });
  }

  // ── the dialog window ──────────────────────────────────────────────────────

  /**
   * Open a fresh dialog, closing any previous one first.
   * @param {string} initialContent - First screen
   * @param {Function} [onClose] - Called when the window closes
   * @returns {Promise<TokenReplacerDialog>} Not yet rendered: call render({ force: true })
   */
  async createMainDialog(initialContent, onClose) {
    if (this.mainDialog) {
      // Settle the old dialog's selection before closing it, so its onClose
      // cannot reach the new dialog's state.
      this._activeSelection?.cancel();
      this._activeSelection = null;
      try {
        if (this.mainDialog.rendered) await this.mainDialog.close();
      } catch (error) {
        console.warn(`${MODULE_ID} | Failed to close existing dialog:`, error);
      }
      this.mainDialog = null;
    }

    const dialog = new TokenReplacerDialog({
      content: initialContent,
      onRender: () => this._bindWindowActions(dialog),
      onClose: () => {
        this._activeSelection?.cancel();
        this._activeSelection = null;
        this._actionsAbort?.abort();
        this._boundWindow = null;
        this._filterStore.clear();
        onClose?.();
        if (this.mainDialog === dialog) this.mainDialog = null;
      },
      window: {
        title: this._localizer.localize('dialog.title'),
        resizable: true,
        positioned: true,
        minimizable: false,
      },
      position: { width: 640, height: 'auto' },
    });
    this.mainDialog = dialog;
    return dialog;
  }

  /**
   * @param {Function|null} callback - Run when the user presses Cancel
   */
  setCancelCallback(callback) {
    this.cancelCallback = callback;
  }

  /**
   * @param {string} content - New screen (template output)
   */
  updateDialogContent(content) {
    if (!this.mainDialog) return;
    try {
      this.mainDialog.updateContent(content);
    } catch (error) {
      console.debug(`${MODULE_ID} | Dialog content update failed (may be in transition):`, error);
    }
  }

  /**
   * Cancel and Close appear on many screens; one delegated listener on the
   * window serves them all, whatever the content swaps do.
   * @param {TokenReplacerDialog} dialog
   * @private
   */
  _bindWindowActions(dialog) {
    const element = dialog.getDialogElement();
    if (!element || element === this._boundWindow) return;
    this._actionsAbort?.abort();
    this._actionsAbort = new AbortController();
    this._boundWindow = element;

    element.addEventListener(
      'click',
      (event) => {
        const button = /** @type {HTMLButtonElement|null} */ (
          /** @type {Element} */ (event.target).closest?.('[data-action]')
        );
        if (!button) return;
        if (button.dataset.action === 'cancel') this._cancel(button);
        else if (button.dataset.action === 'close') this.closeDialog();
      },
      { signal: this._actionsAbort.signal }
    );
  }

  /**
   * @param {HTMLButtonElement} button - The Cancel button pressed
   * @private
   */
  async _cancel(button) {
    const callback = this.cancelCallback;
    if (!callback) return;
    this.cancelCallback = null;

    console.log(`${MODULE_ID} | Cancel button clicked`);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const label = button.querySelector('.btn-label');
    if (label && button.dataset.busyLabel) label.textContent = button.dataset.busyLabel;
    button.querySelector('i')?.setAttribute('class', 'fas fa-spinner fa-spin');

    try {
      await callback();
      this.updateDialogContent(
        await this.createErrorHTML({
          errorType: 'info',
          message: this._localizer.localize('ui.cancelled'),
        })
      );
    } catch (error) {
      console.error(`${MODULE_ID} | Error during cancellation:`, error);
      this.updateDialogContent(
        await this.createErrorHTML(this._localizer.localize('ui.cancelFailed'))
      );
    }
  }

  /** @returns {HTMLElement|null} The dialog window element */
  getDialogElement() {
    return this.mainDialog?.getDialogElement() || null;
  }

  /** @returns {boolean} True while the dialog is open */
  isDialogOpen() {
    return this.mainDialog?.isOpen() || false;
  }

  /** Close the dialog, settling any selection in progress with null. */
  async closeDialog() {
    this._activeSelection?.cancel();
    this._activeSelection = null;
    if (this.mainDialog) {
      try {
        await this.mainDialog.close();
      } catch (error) {
        console.debug(`${MODULE_ID} | Dialog already closed:`, error);
      }
      this.mainDialog = null;
    }
    this._pendingMatches = null;
    this._filterStore.clear();
  }
}

/** The page-wide instance main.js uses. */
export const uiManager = new UIManager();
