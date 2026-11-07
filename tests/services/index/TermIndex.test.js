/**
 * TermIndex: own-property access for prototype-named terms, rebuild from the
 * interned path list, and a stored form that stays a plain object.
 *
 * @module tests/services/index/TermIndex.test
 */
import { describe, it, expect } from 'vitest';
import { TermIndex } from '../../../scripts/services/index/TermIndex.js';

describe('TermIndex', () => {
  describe('tokenize', () => {
    it('splits on path separators and delimiters, lowercased and unique', () => {
      expect(TermIndex.tokenize('Beasts/Wolf\\Dire-Wolf_01 big.webp')).toEqual([
        'beasts',
        'wolf',
        'dire',
        '01',
        'big',
        'webp',
      ]);
    });

    it('returns nothing for empty input', () => {
      expect(TermIndex.tokenize('')).toEqual([]);
      expect(TermIndex.tokenize(null)).toEqual([]);
    });
  });

  describe('add / lookup', () => {
    it('collects ids per term', () => {
      const index = new TermIndex();
      index.add('wolf', 0);
      index.add('wolf', 3);
      expect(index.lookup('wolf')).toEqual([0, 3]);
    });

    it('returns null for an unknown term', () => {
      expect(new TermIndex().lookup('wolf')).toBeNull();
    });

    it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])(
      'treats the prototype-named term "%s" as an ordinary term',
      (term) => {
        const index = new TermIndex();
        expect(index.lookup(term)).toBeNull();

        index.add(term, 7);

        expect(index.lookup(term)).toEqual([7]);
        expect(Object.prototype[term]).not.toEqual([7]);
      }
    );

    it('addText indexes every token of the text', () => {
      const index = new TermIndex();
      index.addText('FA/Goblin_Boss', 2);
      expect(index.lookup('fa')).toEqual([2]);
      expect(index.lookup('goblin')).toEqual([2]);
      expect(index.lookup('boss')).toEqual([2]);
    });
  });

  describe('rebuild', () => {
    it('rebuilds term → id from the parallel pathList/allPaths arrays', () => {
      const index = TermIndex.rebuild(
        ['a/wolf.webp', 'b/bear.webp'],
        [{ name: 'Wolf' }, { name: 'Bear' }]
      );
      expect(index.lookup('wolf')).toEqual([0]);
      expect(index.lookup('bear')).toEqual([1]);
      expect(index.lookup('webp')).toEqual([0, 1]);
    });

    it('is empty for an empty library', () => {
      const index = TermIndex.rebuild([], []);
      expect(index.isEmpty).toBe(true);
      expect(index.size).toBe(0);
    });
  });

  describe('stored form', () => {
    it('wraps the given object without copying, so the index shape stays plain', () => {
      const plain = {};
      const index = new TermIndex(plain);
      index.add('wolf', 1);

      expect(index.toPlainObject()).toBe(plain);
      expect(plain).toEqual({ wolf: [1] });
      expect(JSON.parse(JSON.stringify(plain))).toEqual({ wolf: [1] });
      expect(index.wraps(plain)).toBe(true);
      expect(index.wraps({})).toBe(false);
    });

    it('reports emptiness and size', () => {
      const index = new TermIndex({ a: [0], b: [1] });
      expect(index.isEmpty).toBe(false);
      expect(index.size).toBe(2);
    });
  });
});
