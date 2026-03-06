/**
 * TVACacheService DI smoke tests
 * Validates that TVACacheService can be instantiated with injected dependencies
 * without requiring Foundry VTT globals (game, canvas, etc.)
 */
import { describe, it, expect, vi } from 'vitest';
import { TVACacheService } from '../../scripts/services/TVACacheService.js';

describe('TVACacheService DI', () => {
  it('instantiates with injected getTvaAPI and storageService without accessing globals', () => {
    const mockAPI = { TVA_CONFIG: { staticCache: true }, isCaching: vi.fn(() => false) };
    const mockStorage = { load: vi.fn(), save: vi.fn(), remove: vi.fn() };

    const service = new TVACacheService({
      getTvaAPI: () => mockAPI,
      storageService: mockStorage,
    });

    expect(service).toBeInstanceOf(TVACacheService);
    expect(service._getTvaAPI).toBeTypeOf('function');
    expect(service._storageService).toBe(mockStorage);
  });

  it('init() uses injected getTvaAPI and does NOT access game.modules', () => {
    const mockAPI = { TVA_CONFIG: { staticCache: true } };
    const mockStorage = { load: vi.fn(), save: vi.fn(), remove: vi.fn() };

    const service = new TVACacheService({
      getTvaAPI: () => mockAPI,
      storageService: mockStorage,
    });

    service.init();

    expect(service.tvaAPI).toBe(mockAPI);
    expect(service.hasTVA).toBe(true);
  });

  it('init() sets hasTVA to false when getTvaAPI returns null', () => {
    const mockStorage = { load: vi.fn(), save: vi.fn(), remove: vi.fn() };

    const service = new TVACacheService({
      getTvaAPI: () => null,
      storageService: mockStorage,
    });

    service.init();

    expect(service.tvaAPI).toBeNull();
    expect(service.hasTVA).toBe(false);
  });

  it('default constructor (no args) does not throw at construction time', () => {
    // Default constructor uses lazy globals -- they are NOT accessed until
    // methods like init() are called, so construction itself is safe.
    expect(() => new TVACacheService()).not.toThrow();
  });

  it('stores injected getSetting function', () => {
    const mockGetSetting = vi.fn();
    const service = new TVACacheService({ getSetting: mockGetSetting });

    expect(service._getSetting).toBe(mockGetSetting);
  });
});
