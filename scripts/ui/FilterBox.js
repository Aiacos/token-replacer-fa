/**
 * Token Replacer FA - Debounced filter input
 * @module ui/FilterBox
 */

/**
 * A filter input with its clear button: debounces typing, remembers the term
 * through a FilterTermStore and tells its subscriber the settled text.
 *
 * @pattern Observer — the box knows nothing about grids; whoever owns it
 * subscribes with `onChange` and decides what a term means.
 */
export class FilterBox {
  /** Typing faster than this is one change. */
  static DEBOUNCE_MS = 150;

  /**
   * @param {Object} options
   * @param {HTMLInputElement} options.input - The text input
   * @param {HTMLElement|null} [options.clearButton] - Button that empties the input
   * @param {{save: function(string): void}} options.store - Remembers the term
   * @param {function(string): void} options.onChange - Called with the settled text
   * @param {AbortSignal} options.signal - Detaches every listener and pending timer
   */
  constructor({ input, clearButton = null, store, onChange, signal }) {
    this._input = input;
    this._clearButton = clearButton;
    this._store = store;
    this._onChange = onChange;
    this._timer = null;

    input.addEventListener('input', () => this._handleInput(), { signal });
    clearButton?.addEventListener('click', () => this.clear(), { signal });
    signal.addEventListener('abort', () => clearTimeout(this._timer));
    this._syncClearButton();
  }

  /** @returns {string} Current raw text */
  get value() {
    return this._input.value;
  }

  /**
   * Set the text without remembering it or notifying anyone.
   * @param {string} text - New text
   */
  reset(text = '') {
    clearTimeout(this._timer);
    this._input.value = text;
    this._syncClearButton();
  }

  /** Empty the input, notify, and hand focus back to it. */
  clear() {
    this._input.value = '';
    this._handleInput();
    this._input.focus();
  }

  /** Notify for the current text now, e.g. to apply a restored term. */
  apply() {
    clearTimeout(this._timer);
    this._onChange(this._input.value);
  }

  /** @private */
  _handleInput() {
    this._syncClearButton();
    this._store.save(this._input.value);
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this._onChange(this._input.value), FilterBox.DEBOUNCE_MS);
  }

  /** @private */
  _syncClearButton() {
    if (this._clearButton) this._clearButton.hidden = this._input.value.trim().length === 0;
  }
}
