/**
 * DataSanitizer — prototype-pollution stripping for persisted data.
 * @module tests/services/storage/DataSanitizer
 */
import { describe, it, expect } from 'vitest';
import { DataSanitizer } from '../../../scripts/services/storage/DataSanitizer.js';

const sanitizer = new DataSanitizer();

describe('DataSanitizer.sanitize', () => {
  it('drops __proto__, constructor and prototype keys at every depth', () => {
    const tainted = JSON.parse(
      '{"a": 1, "__proto__": {"polluted": true}, "nested": {"constructor": {"prototype": {"x": 1}}, "prototype": 2, "ok": "yes"}}'
    );

    const clean = sanitizer.sanitize(tainted);

    expect(Object.keys(clean)).toEqual(['a', 'nested']);
    expect(clean.nested).toEqual({ ok: 'yes' });
    expect(Object.hasOwn(clean, '__proto__')).toBe(false);
    expect({}.polluted).toBeUndefined();
  });

  it('cleans objects inside arrays', () => {
    const tainted = JSON.parse('[{"__proto__": {"p": 1}, "path": "a.webp"}, 3]');

    const clean = sanitizer.sanitize(tainted);

    expect(clean).toEqual([{ path: 'a.webp' }, 3]);
    expect(Object.hasOwn(clean[0], '__proto__')).toBe(false);
  });

  it('returns arrays of primitives untouched (same reference, no copy)', () => {
    const paths = ['a.webp', 'b.webp', 3, null];

    expect(sanitizer.sanitize(paths)).toBe(paths);
    expect(sanitizer.sanitize({ list: paths }).list).toBe(paths);
  });

  it('keeps one cleaned copy per shared object, so both references are sanitized', () => {
    const shared = JSON.parse('{"__proto__": {"p": 1}, "path": "a.webp"}');

    const clean = sanitizer.sanitize({ images: [shared], byCategory: { beast: [shared] } });

    expect(clean.byCategory.beast[0]).toBe(clean.images[0]);
    expect(Object.hasOwn(clean.byCategory.beast[0], '__proto__')).toBe(false);
  });

  it('terminates on cycles and preserves them in the copy', () => {
    const node = { name: 'loop' };
    node.self = node;

    const clean = sanitizer.sanitize(node);

    expect(clean).not.toBe(node);
    expect(clean.self).toBe(clean);
  });

  it('passes primitives, null and undefined through', () => {
    expect(sanitizer.sanitize(null)).toBeNull();
    expect(sanitizer.sanitize(undefined)).toBeUndefined();
    expect(sanitizer.sanitize('x')).toBe('x');
    expect(sanitizer.sanitize(42)).toBe(42);
  });
});

describe('DataSanitizer.jsonReviver', () => {
  it('strips polluting keys while JSON.parse runs, unbound', () => {
    const { jsonReviver } = sanitizer;
    const parsed = JSON.parse(
      '{"data": {"__proto__": {"p": 1}, "constructor": 1, "ok": 2}}',
      jsonReviver
    );

    expect(parsed).toEqual({ data: { ok: 2 } });
    expect(Object.hasOwn(parsed.data, '__proto__')).toBe(false);
  });
});
