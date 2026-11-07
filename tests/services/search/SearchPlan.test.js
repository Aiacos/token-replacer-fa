/**
 * SearchPlan: which source runs for each `searchPriority` and readiness state.
 * @module tests/services/search/SearchPlan.test
 */
import { describe, it, expect } from 'vitest';
import { SearchPlan } from '../../../scripts/services/search/SearchPlan.js';

const { STEP } = SearchPlan;

/** Sources with fixed readiness. */
function plan({ indexBuilt = false, tva = false, tvaCache = false, forge = false } = {}) {
  const sources = {
    index: { name: 'index', isAvailable: () => indexBuilt },
    tva: { name: 'tva', isAvailable: () => tva, isCacheLoaded: () => tvaCache },
    forge: { name: 'forge-bazaar', isAvailable: () => forge },
  };
  return { plan: new SearchPlan(sources), sources };
}

describe('SearchPlan.stepForCategory()', () => {
  it('prefers a built index under every priority', () => {
    const { plan: p } = plan({ indexBuilt: true, tva: true, tvaCache: true, forge: true });
    for (const priority of ['faNexus', 'forgeBazaar', 'both']) {
      expect(p.stepForCategory(priority)).toBe(STEP.INDEX);
    }
  });

  it('puts an available Bazaar first only for priority forgeBazaar', () => {
    const { plan: p } = plan({ tva: true, tvaCache: true, forge: true });
    expect(p.stepForCategory('forgeBazaar')).toBe(STEP.FORGE);
    expect(p.stepForCategory('faNexus')).toBe(STEP.TVA_CACHE);
    expect(p.stepForCategory('both')).toBe(STEP.TVA_CACHE);
  });

  it('uses the TVA cache before the TVA API', () => {
    expect(plan({ tva: true, tvaCache: true }).plan.stepForCategory('both')).toBe(STEP.TVA_CACHE);
    expect(plan({ tva: true }).plan.stepForCategory('both')).toBe(STEP.TVA_API);
  });

  it('lets TVA answer a forgeBazaar priority when the Bazaar cannot', () => {
    expect(plan({ tva: true }).plan.stepForCategory('forgeBazaar')).toBe(STEP.TVA_API);
  });

  it('falls back to the Bazaar without TVA, except for faNexus', () => {
    expect(plan({ forge: true }).plan.stepForCategory('both')).toBe(STEP.FORGE);
    expect(plan({ forge: true }).plan.stepForCategory('faNexus')).toBeNull();
  });

  it('returns null when nothing is ready', () => {
    expect(plan().plan.stepForCategory('both')).toBeNull();
  });
});

describe('SearchPlan.sourceForDirectTerm()', () => {
  it('follows the priority, then falls back', () => {
    const all = plan({ tva: true, forge: true });
    expect(all.plan.sourceForDirectTerm('forgeBazaar')).toBe(all.sources.forge);
    expect(all.plan.sourceForDirectTerm('faNexus')).toBe(all.sources.tva);
    expect(all.plan.sourceForDirectTerm('both')).toBe(all.sources.tva);

    const forgeOnly = plan({ forge: true });
    expect(forgeOnly.plan.sourceForDirectTerm('both')).toBe(forgeOnly.sources.forge);
    expect(forgeOnly.plan.sourceForDirectTerm('faNexus')).toBeNull();

    expect(plan().plan.sourceForDirectTerm('both')).toBeNull();
  });
});

describe('SearchPlan.stepForSubtypes()', () => {
  it('picks the fastest ready source regardless of priority', () => {
    expect(plan({ indexBuilt: true, tva: true, tvaCache: true }).plan.stepForSubtypes()).toBe(
      STEP.INDEX
    );
    expect(plan({ tva: true, tvaCache: true }).plan.stepForSubtypes()).toBe(STEP.TVA_CACHE);
    expect(plan({ tva: true }).plan.stepForSubtypes()).toBe(STEP.TVA_API);
    expect(plan({ forge: true }).plan.stepForSubtypes()).toBeNull();
  });
});

describe('SearchPlan.standardSteps()', () => {
  it('runs the local fuzzy search for faNexus and both only', () => {
    const { plan: p } = plan({ tva: true });
    expect(p.standardSteps('faNexus', false).fuzzyLocal).toBe(true);
    expect(p.standardSteps('both', false).fuzzyLocal).toBe(true);
    expect(p.standardSteps('forgeBazaar', false).fuzzyLocal).toBe(false);
  });

  it('runs TVA terms when useTVACache is on, or for forgeBazaar and both', () => {
    const { plan: p } = plan({ tva: true });
    expect(p.standardSteps('faNexus', true).tvaTerms).toBe(true);
    expect(p.standardSteps('faNexus', false).tvaTerms).toBe(false);
    expect(p.standardSteps('forgeBazaar', false).tvaTerms).toBe(true);
    expect(p.standardSteps('both', false).tvaTerms).toBe(true);
  });

  it('never runs TVA terms without TVA', () => {
    expect(plan().plan.standardSteps('both', true).tvaTerms).toBe(false);
  });
});
