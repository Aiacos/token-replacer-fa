/**
 * Tests for HtmlSanitizer: HTML escaping and path-traversal rejection (TEST-05)
 *
 * @module tests/core/HtmlSanitizer.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HtmlSanitizer } from '../../scripts/core/HtmlSanitizer.js';

// =========================================================================
// escape (TEST-05)
// =========================================================================

describe('HtmlSanitizer.escape', () => {
  it('escapes angle brackets', () => {
    expect(HtmlSanitizer.escape('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes double quotes', () => {
    expect(HtmlSanitizer.escape('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(HtmlSanitizer.escape("it's")).toBe('it&#039;s');
  });

  it('escapes ampersands', () => {
    expect(HtmlSanitizer.escape('a & b')).toBe('a &amp; b');
  });

  it('escapes all five HTML chars in combination', () => {
    expect(HtmlSanitizer.escape('<a href="x">it\'s & done</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;it&#039;s &amp; done&lt;/a&gt;'
    );
  });

  // OWASP XSS payloads
  it('neutralizes script tag injection', () => {
    const result = HtmlSanitizer.escape('<script>alert("xss")</script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('neutralizes img onerror event handler', () => {
    const result = HtmlSanitizer.escape('<img onerror="alert(1)" src=x>');
    expect(result).toContain('&lt;img onerror');
    expect(result).not.toContain('<img');
  });

  it('neutralizes anchor onmouseover event handler', () => {
    const result = HtmlSanitizer.escape('<a onmouseover="alert(1)">hover</a>');
    expect(result).toContain('&lt;a onmouseover');
    expect(result).not.toContain('<a ');
  });

  it('neutralizes svg onload injection', () => {
    const result = HtmlSanitizer.escape('"><svg onload=alert(1)>');
    expect(result).toContain('&quot;&gt;&lt;svg');
    expect(result).not.toContain('<svg');
  });

  it('neutralizes SQL injection quotes', () => {
    const result = HtmlSanitizer.escape("'; DROP TABLE users;--");
    expect(result).toContain('&#039;');
    expect(result).not.toContain("'");
  });

  // Edge cases
  it('returns empty string for empty input', () => {
    expect(HtmlSanitizer.escape('')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(HtmlSanitizer.escape(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(HtmlSanitizer.escape(undefined)).toBe('');
  });

  it('coerces number input via String()', () => {
    expect(HtmlSanitizer.escape(42)).toBe('42');
  });

  it('coerces boolean input via String()', () => {
    expect(HtmlSanitizer.escape(true)).toBe('true');
  });

  it('leaves unicode entities as-is (only escapes 5 HTML chars)', () => {
    expect(HtmlSanitizer.escape('\u00e9\u00e8')).toBe('\u00e9\u00e8');
  });

  it('double-escapes already-escaped content', () => {
    // &amp; becomes &amp;amp; -- this is expected behavior
    expect(HtmlSanitizer.escape('&amp;')).toBe('&amp;amp;');
  });
});

// =========================================================================
// sanitizePath (TEST-05)
// =========================================================================

describe('HtmlSanitizer.sanitizePath', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // Valid paths
  it('returns normalized path for valid relative path', () => {
    expect(HtmlSanitizer.sanitizePath('modules/fa-pack/tokens/goblin.png')).toBe(
      'modules/fa-pack/tokens/goblin.png'
    );
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(HtmlSanitizer.sanitizePath('modules\\fa\\token.png')).toBe('modules/fa/token.png');
  });

  // Traversal attacks
  it('rejects path traversal with ../../../etc/passwd', () => {
    expect(HtmlSanitizer.sanitizePath('../../../etc/passwd')).toBeNull();
  });

  it('rejects Windows path traversal with backslashes', () => {
    expect(HtmlSanitizer.sanitizePath('..\\..\\windows\\system32')).toBeNull();
  });

  it('rejects mid-path traversal sequences', () => {
    expect(HtmlSanitizer.sanitizePath('valid/../../../etc/shadow')).toBeNull();
  });

  it('rejects short traversal sequences', () => {
    expect(HtmlSanitizer.sanitizePath('path/../../secret')).toBeNull();
  });

  // Null byte
  it('rejects paths with null bytes', () => {
    expect(HtmlSanitizer.sanitizePath('normal\0.txt')).toBeNull();
  });

  // Absolute paths
  it('rejects Unix absolute paths', () => {
    expect(HtmlSanitizer.sanitizePath('/etc/passwd')).toBeNull();
  });

  it('rejects Windows absolute paths', () => {
    expect(HtmlSanitizer.sanitizePath('\\windows\\system32')).toBeNull();
  });

  // Edge cases
  it('returns null for null input', () => {
    expect(HtmlSanitizer.sanitizePath(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(HtmlSanitizer.sanitizePath(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(HtmlSanitizer.sanitizePath('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(HtmlSanitizer.sanitizePath('   ')).toBeNull();
  });

  it('returns null for non-string input (number)', () => {
    expect(HtmlSanitizer.sanitizePath(42)).toBeNull();
  });

  it('returns null for non-string input (object)', () => {
    expect(HtmlSanitizer.sanitizePath({})).toBeNull();
  });

  // Console.warn verification
  it('calls console.warn for rejected traversal paths', () => {
    HtmlSanitizer.sanitizePath('../../../etc/passwd');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('calls console.warn for rejected null byte paths', () => {
    HtmlSanitizer.sanitizePath('normal\0.txt');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('calls console.warn for rejected absolute paths', () => {
    HtmlSanitizer.sanitizePath('/etc/passwd');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('rejects javascript: protocol', () => {
    expect(HtmlSanitizer.sanitizePath('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: protocol', () => {
    expect(HtmlSanitizer.sanitizePath('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects vbscript: protocol', () => {
    expect(HtmlSanitizer.sanitizePath('vbscript:MsgBox("XSS")')).toBeNull();
  });

  it('rejects dangerous protocols case-insensitively', () => {
    expect(HtmlSanitizer.sanitizePath('JAVASCRIPT:alert(1)')).toBeNull();
    expect(HtmlSanitizer.sanitizePath('Data:text/html,test')).toBeNull();
    expect(HtmlSanitizer.sanitizePath('VbScript:run')).toBeNull();
  });

  it('calls console.warn for rejected protocol paths', () => {
    HtmlSanitizer.sanitizePath('javascript:alert(1)');
    expect(warnSpy).toHaveBeenCalled();
  });
});
