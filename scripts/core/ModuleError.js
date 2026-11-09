/**
 * Token Replacer FA - Structured module error
 * @module core/ModuleError
 */

/**
 * An error carrying what the UI needs to explain a failure: a type key, the
 * technical details and localized recovery suggestions.
 *
 * Callers tell the shapes apart by fields, not by class: a structured error has
 * a truthy `errorType`; a cancellation has `cancelled: true` and *no*
 * `errorType`, which is what stops the wrapping catches in IndexService from
 * relabelling a deliberate stop as an index-build failure.
 *
 * `message` is inherited from Error and therefore not enumerable, so an object
 * spread of a ModuleError drops it. Read the fields by name.
 *
 * @pattern Factory — `of()` and `cancelled()` are the only places an error's
 * shape is decided, so the services stop each assembling their own.
 */
export class ModuleError extends Error {
  /**
   * @param {string|null} errorType - Error type key (e.g. 'search_failed'), null for a cancellation
   * @param {string} message - Localized, user-facing message
   * @param {string} [details] - Technical details for the "show details" pane
   * @param {string[]} [recoverySuggestions=[]] - Localized recovery suggestions
   */
  constructor(errorType, message, details = undefined, recoverySuggestions = []) {
    super(message);
    this.name = 'ModuleError';
    /** @type {string|null} */
    this.errorType = errorType;
    /** @type {string|undefined} */
    this.details = details;
    /** @type {string[]} */
    this.recoverySuggestions = recoverySuggestions;
    /** @type {true|undefined} Set only by cancelled() */
    this.cancelled = undefined;
  }

  /**
   * Build a structured error with localized message and recovery suggestions.
   * Touches `game.i18n` only when called, never at import.
   * @param {string} errorType - Error type key (e.g. 'search_failed')
   * @param {string} details - Technical details about the error
   * @param {string[]} [recoveryKeys=[]] - Recovery suggestion keys
   * @returns {ModuleError} Structured error
   */
  static of(errorType, details, recoveryKeys = []) {
    return new ModuleError(
      errorType,
      game.i18n.localize(`TOKEN_REPLACER_FA.errors.${errorType}`),
      details,
      recoveryKeys.map((key) => game.i18n.localize(`TOKEN_REPLACER_FA.recovery.${key}`))
    );
  }

  /**
   * Build the error thrown when the user cancels an index build or a search.
   * It deliberately has no `errorType`: callers that re-throw anything with an
   * `errorType` and wrap everything else must check `cancelled` first.
   * @returns {ModuleError} Cancellation error
   */
  static cancelled() {
    const error = new ModuleError(null, 'Operation cancelled');
    error.cancelled = true;
    return error;
  }
}
