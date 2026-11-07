/**
 * Token Replacer FA - Selectable grid of token art matches
 * @module ui/MatchGrid
 */

import { MODULE_ID, MAX_DISPLAY_RESULTS, FALLBACK_IMAGE } from '../core/Constants.js';
import { FilterQuery } from '../core/FilterQuery.js';
import { templateRenderer } from '../core/TemplateRenderer.js';
import { DisplayLabels } from './DisplayLabels.js';

/**
 * @typedef {Object} Match
 * @property {string} path - Image path, unique within one result set
 * @property {string} name - Display name
 * @property {number} [score] - Fuse score, 0 = perfect
 * @property {string} [source] - Source id when there is no score
 */

/**
 * @typedef {Object} FilterOutcome
 * @property {number} visible - Tiles shown
 * @property {number} total - Matches in the whole result set, filtered or not, so
 *   the count reads "3 of 40" rather than "3 of 3"
 * @property {boolean} capped - Whether the render cap hid matches passing the filter
 */

/**
 * The grid of matches a user picks token art from.
 *
 * Three decisions shape it, each answering an audit finding:
 * - The selection is a Set of paths, not a CSS class on tiles. Filtering only
 *   changes what is *shown*, so a match picked before typing in the filter is
 *   still picked after clearing it, and Apply reads the Set.
 * - Tiles are kept by path and filtering toggles `hidden`. Rebuilding them on
 *   every keystroke made the grid flicker and every image load again.
 * - Each tile is a `<button aria-pressed>`, so it is reachable with Tab and
 *   toggled with Enter or Space by the browser itself.
 *
 * Tiles come from `templates/match-grid.hbs`: Handlebars escaping stays the
 * only XSS boundary (Constitution, Article III.2).
 *
 * @pattern Observer — controllers subscribe to selection changes and to
 * activation (double-click) instead of reading the DOM back.
 */
export class MatchGrid {
  static TEMPLATE = `modules/${MODULE_ID}/templates/match-grid.hbs`;

  /**
   * @param {Object} options
   * @param {HTMLElement} options.element - The grid container
   * @param {HTMLElement|null} [options.emptyElement] - Shown when the filter matches nothing
   * @param {boolean} [options.multiSelect=false] - Whether several matches can be picked
   * @param {{render: function(string, Object): Promise<string>}} [options.renderer] - Template renderer
   * @param {DisplayLabels} [options.labels] - Labels for score-less sources
   * @param {number} [options.maxVisible] - Render cap (Article IV: 12K tiles froze the UI)
   */
  constructor({
    element,
    emptyElement = null,
    multiSelect = false,
    renderer = templateRenderer,
    labels = new DisplayLabels(),
    maxVisible = MAX_DISPLAY_RESULTS,
  }) {
    this._element = element;
    this._emptyElement = emptyElement;
    this._multiSelect = multiSelect;
    this._renderer = renderer;
    this._labels = labels;
    this._maxVisible = maxVisible;

    /** @type {Match[]} */
    this._matches = [];
    /** @type {Map<string, number>} path → position in the result set */
    this._order = new Map();
    /** @type {Map<string, HTMLElement>} */
    this._tiles = new Map();
    /** @type {Set<string>} */
    this._selected = new Set();
    /** @type {Set<function(string[]): void>} */
    this._selectionListeners = new Set();
    /** @type {Set<function(string): void>} */
    this._activateListeners = new Set();
    // Bumped by every setMatches(): a render still in flight for the previous
    // result set must not plant its tiles in the new one.
    this._generation = 0;
    // Bumped by every filter(): only the latest one may decide visibility.
    this._filterSeq = 0;

    this._abort = new AbortController();
    this._listen();
  }

  /**
   * Replace the result set. The first match starts selected, as the best one.
   * @param {Match[]} matches - Results in rank order
   * @returns {Promise<FilterOutcome>}
   */
  async setMatches(matches) {
    this._generation++;
    this._matches = matches;
    this._order = new Map(matches.map((match, index) => [match.path, index]));
    for (const tile of this._tiles.values()) tile.remove();
    this._tiles.clear();
    this._selected.clear();
    if (matches.length > 0) this._selected.add(matches[0].path);
    this._notifySelection();
    return this.filter('');
  }

  /**
   * Show only the matches whose name or path contain every term.
   * Searches the whole result set, not just the tiles on screen.
   * @param {string} text - Raw filter text
   * @returns {Promise<FilterOutcome>}
   */
  async filter(text) {
    const seq = ++this._filterSeq;
    const query = FilterQuery.parse(text);
    const passing = query.isEmpty
      ? this._matches
      : this._matches.filter((m) => query.matches(`${m.name || ''} ${m.path || ''}`));
    const shown = passing.slice(0, this._maxVisible);

    const outcome = {
      visible: shown.length,
      total: this._matches.length,
      capped: passing.length > shown.length,
    };

    await this._ensureTiles(shown);
    if (seq !== this._filterSeq) return outcome;

    const visible = new Set(shown.map((m) => m.path));
    for (const [path, tile] of this._tiles) tile.hidden = !visible.has(path);
    // A filter that hides everything leaves only the empty message: the grid's
    // framed box would otherwise sit above it, empty.
    const filteredOut = this._matches.length > 0 && shown.length === 0;
    this._element.hidden = filteredOut;
    if (this._emptyElement) this._emptyElement.hidden = !filteredOut;
    return outcome;
  }

  /**
   * Selected paths in rank order, including ones the filter currently hides.
   * @returns {string[]}
   */
  get selectedPaths() {
    return [...this._selected].sort((a, b) => this._order.get(a) - this._order.get(b));
  }

  /** @returns {number} */
  get selectionSize() {
    return this._selected.size;
  }

  /**
   * Pick a match: in single select it replaces the selection, in multi-select
   * it toggles.
   * @param {string} path - Match path
   */
  toggle(path) {
    if (!this._order.has(path)) return;
    if (!this._multiSelect) {
      this._selected.clear();
      this._selected.add(path);
    } else if (this._selected.has(path)) {
      this._selected.delete(path);
    } else {
      this._selected.add(path);
    }
    this._syncPressed();
    this._notifySelection();
  }

  /**
   * Make sure a match is selected without deselecting anything else.
   * @param {string} path - Match path
   */
  include(path) {
    if (!this._order.has(path) || this._selected.has(path)) return;
    if (!this._multiSelect) this._selected.clear();
    this._selected.add(path);
    this._syncPressed();
    this._notifySelection();
  }

  /**
   * @param {function(string[]): void} listener - Called with selectedPaths on every change
   * @returns {function(): void} Unsubscribe
   */
  onSelectionChange(listener) {
    this._selectionListeners.add(listener);
    return () => this._selectionListeners.delete(listener);
  }

  /**
   * @param {function(string): void} listener - Called with the path of a double-clicked match
   * @returns {function(): void} Unsubscribe
   */
  onActivate(listener) {
    this._activateListeners.add(listener);
    return () => this._activateListeners.delete(listener);
  }

  /** Detach every listener; the tiles stay in the DOM until the dialog replaces them. */
  destroy() {
    this._abort.abort();
    this._selectionListeners.clear();
    this._activateListeners.clear();
  }

  /**
   * Reveal images behind their skeleton once loaded, and swap a broken one for
   * Foundry's placeholder. Images that finished before this ran are revealed
   * at once: the dialog's content is often in the DOM a tick before its
   * handlers are.
   * @param {HTMLElement} root - Element whose images to watch
   * @param {AbortSignal} signal - Detaches the listeners
   */
  static watchImages(root, signal) {
    const reveal = (/** @type {HTMLImageElement} */ img) =>
      img.parentElement?.classList.add('loaded');

    // load/error do not bubble, so they are caught on the way down.
    root.addEventListener(
      'load',
      (event) => {
        const img = /** @type {HTMLImageElement} */ (event.target);
        if (img.tagName === 'IMG') reveal(img);
      },
      { signal, capture: true }
    );
    root.addEventListener(
      'error',
      (event) => {
        const img = /** @type {HTMLImageElement} */ (event.target);
        if (img.tagName === 'IMG' && !img.dataset.fallback) {
          img.dataset.fallback = '1';
          img.src = FALLBACK_IMAGE;
        }
      },
      { signal, capture: true }
    );
    for (const img of root.querySelectorAll('img')) {
      if (img.complete && img.naturalWidth > 0) reveal(img);
    }
  }

  /**
   * Render tiles for matches that have none yet, then restore rank order.
   * @param {Match[]} matches - Matches that must have a tile
   * @private
   */
  async _ensureTiles(matches) {
    const missing = matches.filter((m) => !this._tiles.has(m.path));
    if (missing.length === 0) return;

    const generation = this._generation;
    const html = await this._renderer.render(MatchGrid.TEMPLATE, {
      tiles: missing.map((m) => ({
        path: m.path,
        name: m.name,
        scoreLabel:
          m.score !== undefined
            ? `${Math.round((1 - m.score) * 100)}%`
            : this._labels.source(m.source),
      })),
    });
    if (generation !== this._generation || this._abort.signal.aborted) return;

    const fragment = document.createElement('template');
    fragment.innerHTML = html;
    for (const tile of fragment.content.querySelectorAll('.match-option')) {
      const element = /** @type {HTMLElement} */ (tile);
      const path = element.dataset.path;
      if (!this._tiles.has(path)) this._tiles.set(path, element);
    }

    const ranked = [...this._tiles.entries()]
      .sort(([a], [b]) => this._order.get(a) - this._order.get(b))
      .map(([, tile]) => tile);
    this._element.append(...ranked);
    this._syncPressed();
  }

  /** @private */
  _syncPressed() {
    for (const [path, tile] of this._tiles) {
      const pressed = this._selected.has(path);
      tile.setAttribute('aria-pressed', String(pressed));
      tile.classList.toggle('selected', pressed);
    }
  }

  /** @private */
  _notifySelection() {
    const paths = this.selectedPaths;
    for (const listener of this._selectionListeners) listener(paths);
  }

  /**
   * One delegated listener per event for the grid's lifetime: tiles come and
   * go, the listeners do not.
   * @private
   */
  _listen() {
    const signal = this._abort.signal;
    const tileFor = (/** @type {Event} */ event) =>
      /** @type {HTMLElement|null} */ (
        /** @type {Element} */ (event.target).closest?.('.match-option')
      );

    this._element.addEventListener(
      'click',
      (event) => {
        const tile = tileFor(event);
        if (tile) this.toggle(tile.dataset.path);
      },
      { signal }
    );

    this._element.addEventListener(
      'dblclick',
      (event) => {
        const tile = tileFor(event);
        if (!tile) return;
        // The two clicks of a double-click toggled the tile twice in
        // multi-select; whatever they did, the activated match is applied.
        this.include(tile.dataset.path);
        for (const listener of this._activateListeners) listener(tile.dataset.path);
      },
      { signal }
    );

    this._element.addEventListener(
      'keydown',
      (event) => {
        const tile = tileFor(event);
        if (!tile) return;
        const target = this._tileForKey(tile, event.key);
        if (target === undefined) return;
        event.preventDefault();
        target?.focus();
      },
      { signal }
    );

    MatchGrid.watchImages(this._element, signal);
  }

  /**
   * Where an arrow, Home or End key moves focus from a tile. Every tile stays a
   * Tab stop; the arrows are a shortcut through a grid that can hold hundreds,
   * so a keyboard user is not made to Tab through all of them to reach Apply.
   * @param {HTMLElement} tile - The focused tile
   * @param {string} key - KeyboardEvent.key
   * @returns {HTMLElement|null|undefined} The tile to focus, null to stay at an
   *   edge, undefined for a key the grid does not handle
   * @private
   */
  _tileForKey(tile, key) {
    const tiles = /** @type {HTMLElement[]} */ ([
      ...this._element.querySelectorAll('.match-option:not([hidden])'),
    ]);
    const index = tiles.indexOf(tile);
    // Columns come from the layout (auto-fill), so they are counted, not configured.
    const columns = () => tiles.filter((t) => t.offsetTop === tiles[0].offsetTop).length || 1;
    const at = (/** @type {number} */ i) => tiles[i] ?? null;
    switch (key) {
      case 'ArrowRight':
        return at(index + 1);
      case 'ArrowLeft':
        return at(index - 1);
      case 'ArrowDown':
        return at(index + columns());
      case 'ArrowUp':
        return at(index - columns());
      case 'Home':
        return at(0);
      case 'End':
        return at(tiles.length - 1);
      default:
        return undefined;
    }
  }
}
