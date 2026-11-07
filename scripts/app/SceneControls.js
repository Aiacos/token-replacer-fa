/**
 * Token Replacer FA - Scene control button
 * @module app/SceneControls
 */

import { MODULE_ID } from '../core/Constants.js';
import { DebugLogger } from '../core/DebugLogger.js';
import { localizer as defaultLocalizer } from '../core/Localizer.js';

const TOOL_NAME = 'tokenReplacerFA';

/**
 * Adds the GM-only "replace token art" button to the Token controls.
 *
 * Foundry v13 passes `getSceneControlButtons` a record of controls keyed by
 * name, each holding a record of tools; a `button: true` tool fires `onChange`.
 * The v12 array shape is not handled: v13 is the supported floor (module.json
 * `compatibility.minimum`).
 * Source: https://foundryvtt.com/api/v13/functions/hookEvents.getSceneControlButtons.html
 *
 * @pattern Adapter — translates "offer a button that starts a run" into the
 * v13 scene-control payload, so the hook in main.js is one line.
 */
export class SceneControls {
  /**
   * @param {Object} deps
   * @param {function(): void} deps.onActivate - Called when the GM clicks the button
   * @param {function(): boolean} [deps.isGM] - Whether the current user is a GM
   * @param {{localize: Function, orEnglish: Function}} [deps.localizer] - Localizer
   * @param {function(): Object} [deps.getUi] - Returns Foundry's `ui` (read lazily)
   * @param {{log: Function}} [deps.logger] - Debug logger
   */
  constructor({
    onActivate,
    isGM = () => game.user.isGM,
    localizer = defaultLocalizer,
    getUi = () => ui,
    logger = new DebugLogger('SceneControls'),
  }) {
    this._onActivate = onActivate;
    this._isGM = isGM;
    this._localizer = localizer;
    this._getUi = getUi;
    this._logger = logger;
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
   * Hook handler: add the button to the token controls.
   * Never throws — a broken button must not break Foundry's control bar.
   * @param {Object<string, {tools?: Object}>} controls - v13 controls record
   * @returns {boolean} True if the button was added
   */
  addButton(controls) {
    try {
      if (!this._isGM()) return false;

      const tokenControls = controls?.tokens;
      if (!tokenControls?.tools) {
        this._logger.log('Token controls not found, scene control button not added');
        return false;
      }

      tokenControls.tools[TOOL_NAME] = {
        name: TOOL_NAME,
        title: this._localizer.localize('button.title'),
        icon: 'fas fa-wand-magic-sparkles',
        order: Object.keys(tokenControls.tools).length + 1,
        button: true,
        visible: true,
        onChange: () => this._onActivate(),
      };
      this._logger.log('Scene control button added');
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to add scene control button:`, error);
      this._ui.notifications.error(
        this._localizer.orEnglish(
          'notifications.controlButtonFailed',
          'Token Replacer FA: could not add its scene control button. Check the console for details.'
        )
      );
      return false;
    }
  }
}
