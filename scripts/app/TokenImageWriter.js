/**
 * Token Replacer FA - Token image writer
 * @module app/TokenImageWriter
 */

import { MODULE_ID } from '../core/Constants.js';
import { DebugLogger } from '../core/DebugLogger.js';

/**
 * Writes a token art path onto a token.
 *
 * TVA's `updateTokenImage` is preferred when present: it keeps TVA's own
 * per-token bookkeeping consistent. Without it the token document is updated
 * directly through TokenService.
 *
 * @pattern Strategy — chooses between the TVA API and the direct document
 * update per call, behind one `write()` that never throws.
 */
export class TokenImageWriter {
  /**
   * @param {Object} deps
   * @param {import('./CompanionModules.js').CompanionModules} deps.companions - Companion module view
   * @param {{replaceTokenImage: function(*, string): Promise<boolean>}} deps.tokenService - Direct update fallback
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
   * @returns {Promise<boolean>} True if the token was updated
   */
  async write(token, imagePath) {
    try {
      this._logger.log(`Replacing token "${token.name}" with image: ${imagePath}`);
      const tvaAPI = this._companions.tvaAPI;
      if (tvaAPI?.updateTokenImage) {
        await tvaAPI.updateTokenImage(imagePath, {
          token,
          actor: token.actor,
          imgName: imagePath.split('/').pop(),
        });
        this._logger.log('Token updated via TVA');
        return true;
      }
      const result = await this._tokenService.replaceTokenImage(token, imagePath);
      this._logger.log(`Direct token update result: ${result ? 'success' : 'failed'}`);
      return result;
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to update token:`, error);
      return false;
    }
  }
}
