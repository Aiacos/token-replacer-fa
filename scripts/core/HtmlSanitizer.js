/**
 * Token Replacer FA - HTML and path sanitizing
 * @module core/HtmlSanitizer
 */

/**
 * Neutralizes untrusted strings before they reach the DOM or the file browser.
 *
 * Templates are the XSS boundary; `escape()` covers the few `innerHTML`
 * assignments made in event handlers outside them. `sanitizePath()` rejects
 * anything that could leave the data directory or run as a URL.
 *
 * @pattern Static Utility — stateless guards at a trust boundary (Constitution,
 * Article I.7); no instance, because there is nothing to hold between calls.
 */
export class HtmlSanitizer {
  /**
   * Escape HTML to prevent XSS
   * @param {*} text - Text to escape
   * @returns {string} Escaped text
   */
  static escape(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Sanitize file path to prevent path traversal attacks
   * @param {*} path - The file path to sanitize
   * @returns {string|null} Sanitized path or null if invalid
   */
  static sanitizePath(path) {
    // Return null for empty or non-string inputs
    if (!path || typeof path !== 'string') return null;

    const trimmed = path.trim();
    if (!trimmed) return null;

    // Reject dangerous URI protocols (javascript:, data:, vbscript:)
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
      console.warn('token-replacer-fa | Rejected path with dangerous protocol:', path);
      return null;
    }

    // Null bytes could be used to bypass validation
    if (trimmed.includes('\0')) {
      console.warn('token-replacer-fa | Rejected path with null byte:', path);
      return null;
    }

    // Absolute paths (starting with / or \)
    if (/^[/\\]/.test(trimmed)) {
      console.warn('token-replacer-fa | Rejected absolute path:', path);
      return null;
    }

    // Path traversal sequences (../ or ..\)
    if (/\.\.[/\\]/.test(trimmed) || /[/\\]\.\./.test(trimmed) || trimmed === '..') {
      console.warn('token-replacer-fa | Rejected path with traversal sequence:', path);
      return null;
    }

    // Forward slashes are standard in web paths, so backslashes are normalized to them
    const normalized = trimmed.replace(/\\/g, '/');

    // Normalization must not have created a traversal sequence
    if (/\.\.\//.test(normalized) || /\/\.\./.test(normalized) || normalized === '..') {
      console.warn('token-replacer-fa | Rejected path after normalization:', path);
      return null;
    }

    return normalized;
  }
}
