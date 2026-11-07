/**
 * Token Replacer FA - Extra token changes that ride along with applied art
 * @module app/TokenAppearancePolicy
 */

import { MODULE_ID } from '../core/Constants.js';

/**
 * Bounds of the `tokenScale` setting.
 * SYNC: Keep in sync with the tokenScale range in app/ModuleSettings.js
 */
const SCALE_RANGE = Object.freeze({ min: 0.25, max: 3, fallback: 1 });

/** Accepted values of the `dynamicRing` setting. */
const RING_MODES = Object.freeze(['keep', 'enable', 'disable']);

/**
 * What else changes on a token when it receives new token art: its texture
 * scale and its dynamic ring, as the world settings ask.
 *
 * Built once per run from the settings, so the per-token cost is one small
 * object literal. The changes use Foundry's dotted update keys
 * (`texture.scaleX`, `ring.subject.texture`) so they merge into the same
 * `TokenDocument#update` that sets `texture.src`.
 *
 * Foundry v13 fields verified against the API docs:
 * - https://foundryvtt.com/api/v13/classes/foundry.data.TextureData.html
 *   (`scaleX`, `scaleY`: number)
 * - https://foundryvtt.com/api/v13/interfaces/foundry.documents.types.TokenRingData.html
 *   (`enabled`, `subject.texture`: "Path of the subject texture")
 *
 * @pattern Strategy — the scale and ring rules are fixed per run and turned into
 * one change set per art path; the writer applies it without knowing the rules.
 */
export class TokenAppearancePolicy {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.scaleTokens=false] - Apply `tokenScale` to both axes
   * @param {*} [options.tokenScale=1] - Scale; clamped into 0.25–3
   * @param {*} [options.dynamicRing='keep'] - 'keep' | 'enable' | 'disable'
   */
  constructor({ scaleTokens = false, tokenScale = 1, dynamicRing = 'keep' } = {}) {
    /** @type {number|null} */
    this._scale = scaleTokens === true ? TokenAppearancePolicy._clampScale(tokenScale) : null;
    this._ring = TokenAppearancePolicy._ringMode(dynamicRing);
  }

  /**
   * Read the policy from the module settings. Each setting is read exactly once.
   * @param {{scaleTokens?: boolean, tokenScale?: number, dynamicRing?: string}} settings - Module settings
   * @returns {TokenAppearancePolicy} Policy for one run
   */
  static fromSettings(settings) {
    return new TokenAppearancePolicy({
      scaleTokens: settings.scaleTokens,
      tokenScale: settings.tokenScale,
      dynamicRing: settings.dynamicRing,
    });
  }

  /** @returns {boolean} True when no extra change is ever produced */
  get isEmpty() {
    return this._scale === null && this._ring === 'keep';
  }

  /**
   * The extra update data for a token receiving `path`. A fresh object on
   * every call, so the caller may merge into it.
   * @param {string} path - The token art being applied
   * @returns {Object<string, *>} Dotted-key changes; empty when nothing applies
   */
  changesFor(path) {
    const changes = {};
    if (this._scale !== null) {
      changes['texture.scaleX'] = this._scale;
      changes['texture.scaleY'] = this._scale;
    }
    if (this._ring === 'enable') {
      changes['ring.enabled'] = true;
      changes['ring.subject.texture'] = path;
    } else if (this._ring === 'disable') {
      changes['ring.enabled'] = false;
    }
    return changes;
  }

  /**
   * A settings store can hold anything a world file or a macro wrote, so the
   * scale is forced into the registered range rather than trusted.
   * @private
   * @param {*} value - Raw setting value
   * @returns {number} Scale inside the range
   */
  static _clampScale(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      console.warn(
        `${MODULE_ID} | Token scale ${String(value)} is not a number, using ${SCALE_RANGE.fallback}`
      );
      return SCALE_RANGE.fallback;
    }
    const clamped = Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, value));
    if (clamped !== value) {
      console.warn(`${MODULE_ID} | Token scale ${value} is out of range, using ${clamped}`);
    }
    return clamped;
  }

  /**
   * @private
   * @param {*} value - Raw setting value
   * @returns {string} A known ring mode; unknown values leave the ring alone
   */
  static _ringMode(value) {
    if (RING_MODES.includes(value)) return value;
    console.warn(
      `${MODULE_ID} | Unknown dynamic ring mode "${String(value)}", leaving rings alone`
    );
    return 'keep';
  }
}
