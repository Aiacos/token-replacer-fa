/**
 * Token Replacer FA - Settings accessor
 * @module core/Settings
 */

/**
 * Builds the settings accessor that services take as an injectable dependency.
 *
 * @pattern Factory — produces the lazy default for every `getSetting`
 * constructor parameter, so a service can be constructed at module load (before
 * `game` exists) and tests can inject a plain function instead.
 */
export class Settings {
  /**
   * Create a getSetting function that delegates to game.settings.get().
   * Lazy: does NOT access `game` until the returned function is called,
   * making it safe to use as a constructor default parameter.
   * @returns {function(string, string): *} A function that calls game.settings.get(moduleId, key)
   */
  static defaultGetter() {
    return (moduleId, key) =>
      game.settings.get(/** @type {any} */ (moduleId), /** @type {any} */ (key));
  }
}
