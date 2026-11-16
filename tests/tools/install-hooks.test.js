import { accessSync, constants, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { decideInstall, activateHooks, HOOKS_PATH } from '../../tools/install-hooks.mjs';

describe('decideInstall', () => {
  it('activates the versioned hooks on a developer clone', () => {
    expect(decideInstall({ env: {}, insideWorkTree: true, currentHooksPath: '' }).action).toBe(
      'install'
    );
  });

  it('skips CI, whose release commits have already passed the gate', () => {
    const decision = decideInstall({
      env: { CI: 'true' },
      insideWorkTree: true,
      currentHooksPath: '',
    });
    expect(decision.action).toBe('skip');
  });

  it('skips outside a git work tree, such as an unpacked tarball', () => {
    const decision = decideInstall({ env: {}, insideWorkTree: false, currentHooksPath: '' });
    expect(decision.action).toBe('skip');
  });

  it('is a no-op when the hooks are already active', () => {
    const decision = decideInstall({ env: {}, insideWorkTree: true, currentHooksPath: HOOKS_PATH });
    expect(decision.action).toBe('skip');
  });

  it("warns instead of overwriting a developer's own hooks path", () => {
    const decision = decideInstall({
      env: {},
      insideWorkTree: true,
      currentHooksPath: '/home/me/hooks',
    });
    expect(decision.action).toBe('warn');
    expect(decision.reason).toContain('/home/me/hooks');
  });
});

describe('versioned hooks', () => {
  const hook = (name) => `${process.cwd()}/${HOOKS_PATH}/${name}`;

  it('pre-commit runs the quality gate', () => {
    expect(readFileSync(hook('pre-commit'), 'utf8')).toMatch(/^npm run check$/m);
  });

  it.each(['pre-commit', 'post-commit'])('%s is executable, or git would skip it', (name) => {
    expect(() => accessSync(hook(name), constants.X_OK)).not.toThrow();
  });
});

describe('activateHooks', () => {
  it('sets core.hooksPath', () => {
    const runGit = vi.fn();
    expect(activateHooks(runGit)).toBe(true);
    expect(runGit).toHaveBeenCalledWith('config', 'core.hooksPath', HOOKS_PATH);
  });

  it('warns instead of failing npm install when git cannot write its config', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runGit = () => {
      throw new Error('could not lock config file');
    };
    expect(activateHooks(runGit)).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
