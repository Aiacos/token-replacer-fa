/**
 * Token Replacer FA - Token image writer
 * @module app/TokenImageWriter
 */

import { MODULE_ID } from '../core/Constants.js';
import { DebugLogger } from '../core/DebugLogger.js';

/**
 * Writes a token art path onto a token, together with the extra changes of the
 * run's {@link import('./TokenAppearancePolicy.js').TokenAppearancePolicy}.
 *
 * TVA's `updateTokenImage` is preferred when present: it keeps TVA's own
 * per-token bookkeeping consistent. It only sets the image, so non-empty extra
 * changes follow as one `TokenDocument#update`. Without TVA the token document
 * is updated directly through TokenService, image and extras in one update.
 *
 * @pattern Strategy — chooses between the TVA API and the direct document
 * update per call, behind one `write()` that never throws.
 */
export class TokenImageWriter {
  /**
   * @param {Object} deps
   * @param {import('./CompanionModules.js').CompanionModules} deps.companions - Companion module view
   * @param {{replaceTokenImage: function(*, string, Object=): Promise<boolean>}} deps.tokenService - Direct update fallback
   * @param {{log: Function}} [deps.logger] - Debug logger
   */
  constructor({ companions, tokenService, logger = new DebugLogger('TokenImageWriter') }) {
    this._companions = companions;
    this._tokenService = tokenService;
    this._logger = logger;
  }

  /**
   * @param {*} token - Foundry token
   * @param {string} imagePath - Token art path
   * @param {{changesFor: function(string): Object}} [appearance] - Extra changes for this run
   * @returns {Promise<boolean>} True if the token was updated, extras included
   */
  async write(token, imagePath, appearance = undefined) {
    try {
      this._logger.log(`Replacing token "${token.name}" with image: ${imagePath}`);
      const extras = appearance?.changesFor(imagePath) ?? {};
      const tvaAPI = this._companions.tvaAPI;
      if (tvaAPI?.updateTokenImage) {
        await tvaAPI.updateTokenImage(imagePath, {
          token,
          actor: token.actor,
          imgName: imagePath.split('/').pop(),
        });
        if (Object.keys(extras).length > 0) await token.document.update(extras);
        this._logger.log('Token updated via TVA');
        return true;
      }
      const result = await this._tokenService.replaceTokenImage(token, imagePath, extras);
      this._logger.log(`Direct token update result: ${result ? 'success' : 'failed'}`);
      return result;
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to update token:`, error);
      return false;
    }
  }
}
