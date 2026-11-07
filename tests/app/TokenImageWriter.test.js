/**
 * Applying token art: TVA API first, direct update otherwise, never throwing.
 * @module tests/app/TokenImageWriter
 */
import { describe, it, expect, vi } from 'vitest';
import { TokenImageWriter } from '../../scripts/app/TokenImageWriter.js';
import { CompanionModules } from '../../scripts/app/CompanionModules.js';

const token = { name: 'Goblin', actor: { id: 'a1' } };

function modules(entries) {
  return new CompanionModules(() => new Map(Object.entries(entries)));
}

describe('TokenImageWriter.write', () => {
  it('uses TVA when its API can update token images', async () => {
    const updateTokenImage = vi.fn(async () => {});
    const tokenService = { replaceTokenImage: vi.fn() };
    const writer = new TokenImageWriter({
      companions: modules({ 'token-variants': { active: true, api: { updateTokenImage } } }),
      tokenService,
    });

    expect(await writer.write(token, 'a/b/goblin.webp')).toBe(true);
    expect(updateTokenImage).toHaveBeenCalledWith('a/b/goblin.webp', {
      token,
      actor: token.actor,
      imgName: 'goblin.webp',
    });
    expect(tokenService.replaceTokenImage).not.toHaveBeenCalled();
  });

  it('falls back to a direct update without TVA', async () => {
    const tokenService = { replaceTokenImage: vi.fn(async () => true) };
    const writer = new TokenImageWriter({ companions: modules({}), tokenService });

    expect(await writer.write(token, 'goblin.webp')).toBe(true);
    expect(tokenService.replaceTokenImage).toHaveBeenCalledWith(token, 'goblin.webp');
  });

  it('reports a failed update as false instead of throwing', async () => {
    const updateTokenImage = vi.fn(async () => {
      throw new Error('permission denied');
    });
    const writer = new TokenImageWriter({
      companions: modules({ 'token-variants': { active: true, api: { updateTokenImage } } }),
      tokenService: { replaceTokenImage: vi.fn() },
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await writer.write(token, 'goblin.webp')).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('CompanionModules', () => {
  it('reports inactive modules and no TVA API', () => {
    const companions = modules({ 'token-variants': { active: false, api: {} } });
    expect(companions.hasTVA).toBe(false);
    expect(companions.hasFANexus).toBe(false);
    expect(companions.tvaAPI).toBeNull();
  });

  it('reports active modules', () => {
    const api = {};
    const companions = modules({
      'token-variants': { active: true, api },
      'fa-nexus': { active: true },
    });
    expect(companions.hasTVA).toBe(true);
    expect(companions.hasFANexus).toBe(true);
    expect(companions.tvaAPI).toBe(api);
  });
});
