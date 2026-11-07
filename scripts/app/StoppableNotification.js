/**
 * Token Replacer FA - Click-to-stop notification
 * @module app/StoppableNotification
 */

import { MODULE_ID } from '../core/Constants.js';

/**
 * Shows a permanent notification the user can click to stop a long operation
 * (the first-time index build, which can run for minutes).
 *
 * Foundry v13 returns a Notification carrying its own `element` and `remove()`
 * from `ui.notifications.info()`; older generations return only an id, so the
 * element is located in the notification list instead. When neither works the
 * message is still shown and simply is not clickable: losing the control is
 * acceptable, throwing during startup is not.
 * Source: https://foundryvtt.com/api/v13/classes/foundry.applications.ui.Notifications.html
 *
 * @pattern Adapter — one `show(message, onStop)` / `dismiss()` interface over
 * the notification API generations, so callers never branch on the return shape.
 */
export class StoppableNotification {
  /**
   * @param {Object} [deps]
   * @param {function(): Object} [deps.getUi] - Returns Foundry's `ui` (read lazily)
   * @param {function(): Document} [deps.getDocument] - Returns the DOM document (read lazily)
   */
  constructor({ getUi = () => ui, getDocument = () => document } = {}) {
    this._getUi = getUi;
    this._getDocument = getDocument;
  }

  /**
   * Foundry's `ui`, read on use. Call sites spell `this._ui.notifications.*` so
   * the `npm run validate` notification-text rule still sees them.
   * @returns {Object} Foundry's ui namespace
   */
  get _ui() {
    return this._getUi();
  }

  /**
   * Show the notification and wire the stop control.
   * @param {string} message - Localized notification text
   * @param {Function} onStop - Called once, when the user asks to stop
   * @returns {{dismiss: () => void}} Handle that removes the notification
   */
  show(message, onStop) {
    const notifications = this._ui.notifications;
    let handle;
    try {
      handle = this._ui.notifications.info(message, { permanent: true });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not show the indexing notification:`, error);
      return { dismiss: () => {} };
    }

    const element =
      handle?.element ??
      this._getDocument().querySelector('#notifications li.notification:last-child');

    if (element) {
      element.classList.add('token-replacer-fa-stoppable');
      element.setAttribute('role', 'button');
      element.addEventListener(
        'click',
        () => {
          try {
            onStop();
          } catch (error) {
            console.warn(`${MODULE_ID} | Stop-indexing handler failed:`, error);
          }
        },
        { once: true }
      );
    } else {
      // Worth knowing about: it means the control silently was not offered.
      console.debug(
        `${MODULE_ID} | Indexing notification element not found, stop control not wired`
      );
    }

    return {
      dismiss() {
        try {
          if (typeof handle?.remove === 'function') handle.remove();
          else if (handle !== undefined) notifications.remove?.(handle);
          else element?.remove();
        } catch (error) {
          console.debug(`${MODULE_ID} | Could not dismiss the indexing notification:`, error);
        }
      },
    };
  }
}
