// @ts-nocheck — the fvtt-types ApplicationV2 generics demand a typed
// RenderContext/RenderOptions pair for every override; this dialog renders one
// HTML string and gains nothing from modelling them.
/**
 * Token Replacer FA - The module's single dialog window
 * @module ui/TokenReplacerDialog
 */

/**
 * The window every screen of a run is drawn into: progress, match selection,
 * category browser, outcome. Screens are swapped with `updateContent()` rather
 * than re-rendered, which avoids AppV2's full render cycle on every progress
 * tick.
 *
 * Swapping innerHTML has two accessibility costs this class pays back:
 * - Focus. The focused button is destroyed with the old content, so focus fell
 *   to the document on every tick. The element with the same `data-action` in
 *   the new content gets it back, which keeps a keyboard user on Cancel.
 * - Announcements. A live region inside the swapped content is new each time
 *   and never announced. One persistent region outside it receives the
 *   `[data-announce]` line of each screen instead.
 *
 * Foundry v13 ApplicationV2: the first `render()` needs `{ force: true }` to
 * create the window (Constitution, Article VI.1).
 * @see https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html
 *
 * @pattern Template Method — ApplicationV2 owns the render/close cycle; this
 * subclass only fills its hooks (_renderHTML, _replaceHTML, _onRender, _onClose).
 */
export class TokenReplacerDialog extends foundry.applications.api.ApplicationV2 {
  /**
   * @param {Object} options - ApplicationV2 options, plus:
   * @param {string} [options.content] - Initial HTML (template output)
   * @param {Function} [options.onClose] - Called after the window closes
   * @param {Function} [options.onRender] - Called after every render
   * @param {Object} [options.window] - ApplicationV2 window options
   * @param {Object} [options.position] - ApplicationV2 position options
   */
  constructor(options = {}) {
    super(options);
    this._dialogContent = options.content || '';
    this._onCloseCallback = options.onClose;
    this._onRenderCallback = options.onRender;
    this._lastAnnouncement = '';
  }

  static DEFAULT_OPTIONS = {
    id: 'token-replacer-fa-dialog',
    classes: ['token-replacer-fa-dialog'],
    window: {
      title: 'Token Replacer FA',
      resizable: true,
      minimizable: false,
    },
    position: {
      width: 640,
      height: 'auto',
    },
  };

  /** @returns {Promise<{content: string}>} */
  async _prepareContext(_options) {
    return { content: this._dialogContent };
  }

  /**
   * ApplicationV2 requires DOM elements here, not a string.
   * @returns {Promise<HTMLElement>}
   */
  async _renderHTML(context, _options) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('dialog-content');
    wrapper.innerHTML = context.content;
    return wrapper;
  }

  /**
   * Swap in the rendered content and make sure the live region exists.
   * @param {HTMLElement} result - From _renderHTML
   * @param {HTMLElement} content - The window's content element
   */
  _replaceHTML(result, content, _options) {
    if (!content.querySelector('.trfa-live-region')) {
      const live = document.createElement('div');
      live.className = 'trfa-live-region';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('role', 'status');
      content.appendChild(live);
    }
    const existing = content.querySelector('.dialog-content');
    if (existing) existing.replaceWith(result);
    else content.prepend(result);
  }

  /**
   * The first screen never passes through updateContent(), so whatever wires
   * listeners to content runs from here as well.
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._announce(this.element?.querySelector('.dialog-content'));
    this._onRenderCallback?.();
  }

  async _onClose(options) {
    await super._onClose(options);
    this._onCloseCallback?.();
  }

  /**
   * Replace the current screen, keeping focus and announcing its status line.
   * @param {string} html - New content (template output)
   */
  updateContent(html) {
    this._dialogContent = html;
    if (!this.rendered) return;
    const el = this.element?.querySelector('.dialog-content');
    if (!el) return;

    const active = /** @type {HTMLElement|null} */ (document.activeElement);
    const action = active && el.contains(active) ? active.dataset?.action : undefined;

    el.innerHTML = html;

    if (action) {
      const target = [...el.querySelectorAll('[data-action]')].find(
        (node) => node.dataset.action === action && !node.disabled
      );
      target?.focus();
    }
    this._announce(el);
  }

  /**
   * Copy the screen's status line into the persistent live region.
   * @param {Element|null|undefined} contentElement - `.dialog-content`
   * @private
   */
  _announce(contentElement) {
    const live = this.element?.querySelector('.trfa-live-region');
    const text = contentElement?.querySelector('[data-announce]')?.textContent?.trim() || '';
    if (!live || !text || text === this._lastAnnouncement) return;
    this._lastAnnouncement = text;
    live.textContent = text;
  }

  /** @returns {HTMLElement|null} The window element */
  getDialogElement() {
    return this.element;
  }

  /** @returns {boolean} True while rendered */
  isOpen() {
    return this.rendered;
  }
}
