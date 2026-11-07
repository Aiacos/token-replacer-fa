/**
 * Token Replacer FA - Fuse.js loader
 * @module core/FuseLoader
 */

import { FUSE_CDN } from './Constants.js';

/**
 * Loads Fuse.js from the CDN on first use and validates it before handing it out.
 *
 * Fuse.js is the module's only runtime library and it arrives without SRI, so
 * `_validateFuseShape()` is the guard against a compromised CDN
 * (Constitution, Article VI.3). A failed load is not remembered: the next call
 * retries, because a transient network error must not cost the whole session
 * its fuzzy search. Browsers may still cache a failed dynamic import(); that is
 * not controllable from userland.
 *
 * @see https://www.fusejs.io/api/options.html — Fuse.js 7.0.0 options object
 *
 * @pattern Singleton + Lazy Load — one Fuse constructor per page, fetched only
 * when a search first needs it; `fuseLoader` is the instance.
 */
export class FuseLoader {
  /**
   * @param {Object} [deps={}] - Dependency overrides for testing
   * @param {function(string): Promise<{default: *}>} [deps.importModule] - Dynamic import (default: import())
   * @param {function(): *} [deps.getGlobalFuse] - Fallback global (default: window.Fuse)
   * @param {string} [deps.url] - Module URL (default: FUSE_CDN)
   */
  constructor(deps = {}) {
    const {
      importModule = (url) => import(/* @vite-ignore */ url),
      getGlobalFuse = () => window.Fuse,
      url = FUSE_CDN,
    } = deps;
    this._importModule = importModule;
    this._getGlobalFuse = getGlobalFuse;
    this._url = url;
    this._Fuse = null;
  }

  /**
   * Load Fuse.js, from cache after the first success.
   * SYNC: Keep in sync with IndexWorker.js loadFuse()
   * @returns {Promise<Function|null>} Fuse constructor or null
   */
  async load() {
    if (this._Fuse) return this._Fuse;

    try {
      const module = await this._importModule(this._url);
      const Candidate = module.default;
      if (!FuseLoader._validateFuseShape(Candidate)) {
        console.error(
          'token-replacer-fa | Fuse.js loaded but failed shape validation — possible CDN compromise'
        );
        return null;
      }
      this._Fuse = Candidate;
      return this._Fuse;
    } catch (error) {
      console.error('token-replacer-fa | Failed to load Fuse.js:', error);
      try {
        const globalFuse = this._getGlobalFuse();
        if (globalFuse && FuseLoader._validateFuseShape(globalFuse)) {
          this._Fuse = globalFuse;
          return this._Fuse;
        }
      } catch (e) {
        console.error('token-replacer-fa | Fuse.js not available:', e);
      }
      return null;
    }
  }

  /**
   * Validate that a loaded Fuse candidate has the expected constructor shape.
   * Catches CDN compromise that replaces Fuse.js with arbitrary code.
   * SYNC: Keep in sync with IndexWorker.js _validateFuseShape()
   * @param {*} Candidate - The loaded Fuse constructor
   * @returns {boolean} True if the candidate looks like Fuse.js
   */
  static _validateFuseShape(Candidate) {
    try {
      if (typeof Candidate !== 'function') return false;
      const instance = new Candidate([{ name: 'test' }], { keys: ['name'] });
      if (typeof instance.search !== 'function') return false;
      const results = instance.search('test');
      return Array.isArray(results);
    } catch {
      return false;
    }
  }
}

/** The page-wide instance. */
export const fuseLoader = new FuseLoader();
