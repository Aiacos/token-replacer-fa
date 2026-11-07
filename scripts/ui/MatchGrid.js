/**
 * Token Replacer FA - Selectable grid of token art matches
 * @module ui/MatchGrid
 */

import { MODULE_ID, MAX_DISPLAY_RESULTS, FALLBACK_IMAGE } from '../core/Constants.js';
import { FilterQuery } from '../core/FilterQuery.js';
import { Scheduler } from '../core/Scheduler.js';
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
 * @property {number} visible - Tiles rendered and passing the filter
 * @property {number} total - Matches in the whole result set, filtered or not, so
 *   the count reads "3 of 40" rather than "3 of 3"
 */

/**
 * @typedef {Object} PageObserver
 * @property {function(Element): void} observe
 * @property {function(Element): void} unobserve
 * @property {function(): void} disconnect
 */

/**
 * @callback PageObserverFactory
 * @param {function(Array<{isIntersecting: boolean}>): void} callback - Told when the sentinel enters or leaves the view
 * @returns {PageObserver|null} null when the browser has no IntersectionObserver
 */

/**
 * The grid of matches a user picks token art from.
 *
 * Four decisions shape it, each answering an audit finding:
 * - The selection is a Set of paths, not a CSS class on tiles. Filtering only
 *   changes what is *shown*, so a match picked before typing in the filter is
 *   still picked after clearing it, and Apply reads the Set.
 * - Tiles are kept by path and filtering toggles `hidden`. Rebuilding them on
 *   every keystroke made the grid flicker and every image load again.
 * - Each tile is a `<button aria-pressed>`, so it is reachable with Tab and
 *   toggled with Enter or Space by the browser itself.
 * - Tiles are rendered a page at a time. 12K tiles at once froze the UI, and a
 *   hard cap left everything past it unreachable except through the filter. An
 *   IntersectionObserver watches a sentinel after the last tile and renders the
 *   next page as it scrolls into view; without one, the pages are rendered in
 *   chunks between yields. Arrow and End keys that reach the last rendered tile
 *   render the next page too, so the keyboard reaches every match.
 *
 * Tiles come from `templates/match-grid.hbs`: Handlebars escaping stays the
 * only XSS boundary (Constitution, Article III.2).
 *
 * IntersectionObserver: `root` is the scrolling ancestor, `rootMargin` grows it
 * so the next page renders before the sentinel is actually visible, and
 * `observe()` on an element already observed is a no-op — hence the
 * unobserve/observe pair, which makes the observer report the current state.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver/IntersectionObserver
 *
 * @pattern Observer — controllers subscribe to selection changes, to the count
 * and to activation (double-click) instead of reading the DOM back.
 */
export class MatchGrid {
  static TEMPLATE = `modules/${MODULE_ID}/templates/match-grid.hbs`;

  /** How far below the view the next page starts rendering. */
  static ROOT_MARGIN = '0px 0px 300px 0px';

  /** Keys that move focus forward, and so may need the next page. */
  static FORWARD_KEYS = new Set(['ArrowRight', 'ArrowDown', 'End']);

  /**
   * @param {Object} options
   * @param {HTMLElement} options.element - The grid container; it is also the
   *   element that scrolls (styles.css), so it is the observer's root
   * @param {HTMLElement|null} [options.emptyElement] - Shown when the filter matches nothing
   * @param {boolean} [options.multiSelect=false] - Whether several matches can be picked
   * @param {{render: function(string, Object): Promise<string>}} [options.renderer] - Template renderer
   * @param {DisplayLabels} [options.labels] - Labels for score-less sources
   * @param {number} [options.maxVisible] - Page size: tiles rendered per page
   * @param {PageObserverFactory} [options.observerFactory] - Builds the sentinel observer
   * @param {function(): Promise<void>} [options.nextChunk] - Waits between pages
   *   when there is no observer
   */
  constructor({
    element,
    emptyElement = null,
    multiSelect = false,
    renderer = templateRenderer,
    labels = new DisplayLabels(),
    maxVisible = MAX_DISPLAY_RESULTS,
    observerFactory = (callback) =>
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(callback, { root: element, rootMargin: MatchGrid.ROOT_MARGIN })
        : null,
    nextChunk = () => Scheduler.yieldToMain(),
  }) {
    this._element = element;
    this._emptyElement = emptyElement;
    this._multiSelect = multiSelect;
    this._renderer = renderer;
    this._labels = labels;
    this._pageSize = maxVisible;
    this._nextChunk = nextChunk;

    /** @type {Match[]} */
    this._matches = [];
    /** @type {Match[]} Matches passing the current filter, in rank order */
    this._passing = [];
    /** How many of `_passing` have their tile shown. */
    this._shown = 0;
    /** @type {Map<string, number>} path → position in the result set */
    this._order = new Map();
    /** @type {Map<string, HTMLElement>} */
    this._tiles = new Map();
    // Highest rank holding a tile: a page ranked entirely after it is appended
    // as is, instead of re-sorting every tile already in the grid.
    this._lastRank = -1;
    /** @type {Set<string>} */
    this._selected = new Set();
    /** @type {Set<function(string[]): void>} */
    this._selectionListeners = new Set();
    /** @type {Set<function(string): void>} */
    this._activateListeners = new Set();
    /** @type {Set<function(FilterOutcome): void>} */
    this._countListeners = new Set();
    // Bumped by every setMatches(): a render still in flight for the previous
    // result set must not plant its tiles in the new one.
    this._generation = 0;
    // Bumped by every filter(): only the latest one may decide visibility.
    this._filterSeq = 0;
    /** @type {{seq: number, promise: Promise<boolean>}|null} The page being rendered */
    this._paging = null;

    this._sentinel = document.createElement('div');
    this._sentinel.className = 'match-grid-sentinel';
    this._sentinel.setAttribute('aria-hidden', 'true');

    this._abort = new AbortController();
    this._observer = observerFactory((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) this._loadNextPage();
    });
    this._listen();
  }

  /**
   * Replace the result set. The first match starts selected, as the best one.
   * @param {Match[]} matches - Results in rank order
   * @returns {Promise<FilterOutcome>} The count once the first page is shown
   */
  async setMatches(matches) {
    this._generation++;
    this._matches = matches;
    this._order = new Map(matches.map((match, index) => [match.path, index]));
    for (const tile of this._tiles.values()) tile.remove();
    this._tiles.clear();
    this._lastRank = -1;
    this._selected.clear();
    if (matches.length > 0) this._selected.add(matches[0].path);
    this._notifySelection();
    return this.filter('');
  }

  /**
   * Show only the matches whose name or path contain every term, starting
   * again from the first page. Searches the whole result set, not just the
   * tiles on screen.
   * @param {string} text - Raw filter text
   * @returns {Promise<FilterOutcome>}
   */
  async filter(text) {
    const seq = ++this._filterSeq;
    const query = FilterQuery.parse(text);
    this._passing = query.isEmpty
      ? this._matches
      : this._matches.filter((m) => query.matches(`${m.name || ''} ${m.path || ''}`));
    const count = Math.min(this._pageSize, this._passing.length);

    // Registered as this filter's page so a sentinel report arriving meanwhile
    // waits for it instead of paging over a set that is still being replaced.
    const shown = this._reveal(count, true);
    this._trackPaging(
      seq,
      shown.then((outcome) => outcome !== null)
    );
    return (await shown) ?? { visible: count, total: this._matches.length };
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
   * @param {function(FilterOutcome): void} listener - Called whenever the shown
   *   tiles change: a new result set, a filter, or another page rendered
   * @returns {function(): void} Unsubscribe
   */
  onCountChange(listener) {
    this._countListeners.add(listener);
    return () => this._countListeners.delete(listener);
  }

  /**
   * @param {function(string): void} listener - Called with the path of a double-clicked match
   * @returns {function(): void} Unsubscribe
   */
  onActivate(listener) {
    this._activateListeners.add(listener);
    return () => this._activateListeners.delete(listener);
  }

  /**
   * Detach every listener and stop paging; the tiles stay in the DOM until the
   * dialog replaces them.
   */
  destroy() {
    this._abort.abort();
    this._observer?.disconnect();
    this._sentinel.remove();
    this._selectionListeners.clear();
    this._activateListeners.clear();
    this._countListeners.clear();
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

  /** @returns {boolean} True while passing matches wait for a page @private */
  get _hasMore() {
    return this._shown < this._passing.length;
  }

  /**
   * Render the next page of the current filter, once: reports arriving while
   * it renders share it.
   * @returns {Promise<boolean>} True when a page was shown
   * @private
   */
  _renderNextPage() {
    if (this._abort.signal.aborted || !this._hasMore) return Promise.resolve(false);
    const seq = this._filterSeq;
    if (this._paging?.seq === seq) return this._paging.promise;
    const count = Math.min(this._shown + this._pageSize, this._passing.length);
    return this._trackPaging(
      seq,
      this._reveal(count, false).then((outcome) => outcome !== null)
    );
  }

  /**
   * Fire-and-forget page render for the observer and the chunk loop: a failure
   * is logged, never thrown into a browser callback.
   * @private
   */
  _loadNextPage() {
    this._renderNextPage().catch((error) => this._logPageFailure(error));
  }

  /**
   * @param {number} seq - Filter the page belongs to
   * @param {Promise<boolean>} promise - The page render
   * @returns {Promise<boolean>}
   * @private
   */
  _trackPaging(seq, promise) {
    const paging = { seq, promise };
    this._paging = paging;
    const clear = () => {
      if (this._paging === paging) this._paging = null;
    };
    promise.then(clear, clear);
    return promise;
  }

  /**
   * Show the first `count` passing matches.
   * @param {number} count - Passing matches to show
   * @param {boolean} restart - True for a new filter: every tile's visibility
   *   is decided again; false for the next page: only its tiles are revealed
   * @returns {Promise<FilterOutcome|null>} null when a newer filter or result
   *   set superseded this one while it rendered
   * @private
   */
  async _reveal(count, restart) {
    const seq = this._filterSeq;
    const passing = this._passing;
    const from = restart ? 0 : this._shown;

    await this._ensureTiles(passing.slice(from, count));
    if (seq !== this._filterSeq) return null;
    // Done before listeners hear the count: one reacting with the next page
    // must start it, not be handed this finished one.
    if (this._paging?.seq === seq) this._paging = null;

    if (restart) {
      const visible = new Set(passing.slice(0, count).map((m) => m.path));
      for (const [path, tile] of this._tiles) tile.hidden = !visible.has(path);
    } else {
      for (let i = from; i < count; i++) {
        const tile = this._tiles.get(passing[i].path);
        if (tile) tile.hidden = false;
      }
    }
    this._shown = count;

    // A filter that hides everything leaves only the empty message: the grid's
    // framed box would otherwise sit above it, empty.
    const filteredOut = this._matches.length > 0 && count === 0;
    this._element.hidden = filteredOut;
    if (this._emptyElement) this._emptyElement.hidden = !filteredOut;
    this._syncSentinel();

    const outcome = { visible: count, total: this._matches.length };
    for (const listener of this._countListeners) listener(outcome);
    return outcome;
  }

  /**
   * Keep the sentinel after the last tile while pages remain, or schedule the
   * next chunk when there is no observer to wait for.
   * @private
   */
  _syncSentinel() {
    if (!this._hasMore || this._abort.signal.aborted) {
      this._sentinel.remove();
      this._observer?.unobserve(this._sentinel);
      return;
    }
    if (this._observer) {
      this._element.append(this._sentinel);
      // Re-observing makes the observer report the sentinel's current state,
      // so a page too short to push it out of view still triggers the next.
      this._observer.unobserve(this._sentinel);
      this._observer.observe(this._sentinel);
      return;
    }
    this._nextChunk().then(
      () => this._loadNextPage(),
      (error) => this._logPageFailure(error)
    );
  }

  /**
   * @param {unknown} error - Page render failure
   * @private
   */
  _logPageFailure(error) {
    console.error(`${MODULE_ID} | Could not render the next page of matches:`, error);
  }

  /**
   * Render tiles for matches that have none yet, keeping rank order.
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
    const added = [];
    let firstRank = Infinity;
    for (const tile of fragment.content.querySelectorAll('.match-option')) {
      const element = /** @type {HTMLElement} */ (tile);
      const path = element.dataset.path;
      if (this._tiles.has(path)) continue;
      // Born hidden: only _reveal() shows a tile, so a page that finishes after
      // a newer filter cannot slip tiles past it.
      element.hidden = true;
      this._tiles.set(path, element);
      added.push(element);
      firstRank = Math.min(firstRank, this._order.get(path));
    }

    if (firstRank > this._lastRank) {
      // The usual page: everything new ranks after what is there.
      this._element.append(...added);
    } else {
      const ranked = [...this._tiles.entries()]
        .sort(([a], [b]) => this._order.get(a) - this._order.get(b))
        .map(([, tile]) => tile);
      this._element.append(...ranked);
    }
    for (const element of added) {
      this._lastRank = Math.max(this._lastRank, this._order.get(element.dataset.path));
    }
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
        this._pageForKey(tile, event.key, target);
      },
      { signal }
    );

    MatchGrid.watchImages(this._element, signal);
  }

  /**
   * Render the next page when a forward key reached the last rendered tile,
   * then move on into it: past the edge for an arrow, to the new end for End.
   * @param {HTMLElement} tile - The tile the key was pressed on
   * @param {string} key - KeyboardEvent.key
   * @param {HTMLElement|null} target - Where the key moved focus (null: nowhere)
   * @private
   */
  _pageForKey(tile, key, target) {
    if (!MatchGrid.FORWARD_KEYS.has(key) || !this._hasMore) return;
    const shown = this._element.querySelectorAll('.match-option:not([hidden])');
    if (target !== null && target !== shown[shown.length - 1]) return;
    this._renderNextPage().then(
      (rendered) => {
        if (rendered && (target === null || key === 'End')) this._tileForKey(tile, key)?.focus();
      },
      (error) => this._logPageFailure(error)
    );
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
