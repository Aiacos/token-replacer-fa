/**
 * Token Replacer FA - Companion module detection
 * @module app/CompanionModules
 */

/**
 * Answers which companion modules (Token Variant Art, FA Nexus) are active and
 * exposes TVA's API, read live from `game.modules` on every call because a GM
 * can toggle modules without the page reloading our singletons.
 *
 * @pattern Adapter — a narrow, injectable view of `game.modules`, so the
 * workflow and the bootstrapper never read the Foundry global directly.
 */
export class CompanionModules {
  /**
   * @param {function(): {get: function(string): *}} [getModules] - Returns game.modules (read lazily)
   */
  constructor(getModules = () => game.modules) {
    this._getModules = getModules;
  }

  /** @returns {boolean} True if Token Variant Art is active */
  get hasTVA() {
    return this._getModules().get('token-variants')?.active ?? false;
  }

  /** @returns {boolean} True if FA Nexus is active */
  get hasFANexus() {
    return this._getModules().get('fa-nexus')?.active ?? false;
  }

  /** @returns {Object|null} TVA's API, or null when TVA is inactive */
  get tvaAPI() {
    if (!this.hasTVA) return null;
    return this._getModules().get('token-variants')?.api ?? null;
  }
}
