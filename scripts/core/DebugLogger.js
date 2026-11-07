/**
 * Token Replacer FA - Opt-in debug logger
 * @module core/DebugLogger
 */

import { MODULE_ID } from './Constants.js';
import { Settings } from './Settings.js';

/**
 * Writes `token-replacer-fa | [Prefix] message` to the console when the
 * `debugMode` setting is on, and nothing otherwise.
 *
 * It must never throw (Constitution, Article V.4): services log from their
 * constructors and from code that runs before `init` registers the settings,
 * when `game.settings.get()` throws. That window is not a failure worth
 * reporting — debug output is simply off until the setting exists.
 *
 * @pattern Null-safe Logger — callers log unconditionally; the logger owns the
 * "is debug on, and can I even ask yet?" decision so no call site guards it.
 */
export class DebugLogger {
  /**
   * @param {string} prefix - Service name shown in brackets in every line
   * @param {function(string, string): *} [getSetting] - Settings accessor (default: game.settings.get, called lazily)
   */
  constructor(prefix, getSetting = Settings.defaultGetter()) {
    this._prefix = prefix;
    this._getSetting = getSetting;
  }

  /**
   * Log a message when debug mode is enabled.
   * @param {string} message - Message text
   * @param {...*} args - Extra values passed through to console.log
   * @returns {void}
   */
  log(message, ...args) {
    try {
      if (this._getSetting(MODULE_ID, 'debugMode')) {
        console.log(`${MODULE_ID} | [${this._prefix}] ${message}`, ...args);
      }
    } catch {
      // Settings not registered yet: debug output is off until they are.
    }
  }
}
