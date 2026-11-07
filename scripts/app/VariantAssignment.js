/**
 * Token Replacer FA - Token art assignment strategies
 * @module app/VariantAssignment
 */

/**
 * @typedef {Object} Assignment
 * @property {*} token - Foundry token
 * @property {string} path - Token art path chosen for it
 */

/**
 * Gives the selected token art to tokens in selection order, cycling when
 * there are more tokens than images.
 *
 * @pattern Strategy — the `sequential` assignment mode.
 */
export class SequentialAssignment {
  /**
   * @param {Array} tokens - Tokens to assign art to
   * @param {string[]} paths - Selected token art paths
   * @returns {Assignment[]} One entry per token; empty when no path was selected
   */
  assign(tokens, paths) {
    if (!paths?.length) return [];
    return tokens.map((token, i) => ({ token, path: paths[i % paths.length] }));
  }
}

/**
 * Shuffles the selected token art once (Fisher–Yates, uniform), then cycles
 * through it like the sequential mode, so every image is used before any repeats.
 *
 * @pattern Strategy — the `random` assignment mode; the random source is
 * injected so tests are deterministic.
 */
export class RandomAssignment {
  /**
   * @param {function(): number} [random=Math.random] - Returns a float in [0, 1)
   */
  constructor(random = Math.random) {
    this._random = random;
    this._sequential = new SequentialAssignment();
  }

  /**
   * @param {Array} tokens - Tokens to assign art to
   * @param {string[]} paths - Selected token art paths
   * @returns {Assignment[]} One entry per token; empty when no path was selected
   */
  assign(tokens, paths) {
    if (!paths?.length) return [];
    return this._sequential.assign(tokens, this.shuffle(paths));
  }

  /**
   * Fisher–Yates shuffle into a new array; the input is left untouched.
   * @param {Array} items - Items to shuffle
   * @returns {Array} Shuffled copy
   */
  shuffle(items) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this._random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

/**
 * Picks the assignment strategy for the mode the selection dialog reports.
 *
 * @pattern Factory — maps a mode name to its Strategy; unknown or missing
 * modes fall back to sequential, matching the dialog's default.
 */
export class VariantAssignment {
  /**
   * @param {string|undefined} mode - 'sequential' | 'random'
   * @param {Object} [options]
   * @param {function(): number} [options.random] - Random source for the random mode
   * @returns {SequentialAssignment|RandomAssignment} Strategy for the mode
   */
  static forMode(mode, { random = Math.random } = {}) {
    return mode === 'random' ? new RandomAssignment(random) : new SequentialAssignment();
  }
}
