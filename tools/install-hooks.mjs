#!/usr/bin/env node
/**
 * Point git at the versioned hooks in .githooks/ (run by `npm install`).
 *
 * A failure here never fails the install: a developer without the hook is still
 * caught by CI, while a broken `npm ci` would stop every workflow at its first step.
 */
import { execFileSync } from 'node:child_process';

const HOOKS_PATH = '.githooks';

/**
 * @param {object} state
 * @param {Record<string, string|undefined>} state.env
 * @param {boolean} state.insideWorkTree
 * @param {string} state.currentHooksPath Value of core.hooksPath, empty when unset
 * @returns {{action: "install"|"skip"|"warn", reason: string}}
 */
function decideInstall({ env, insideWorkTree, currentHooksPath }) {
  if (env.CI) return { action: 'skip', reason: 'running in CI' };
  if (!insideWorkTree) return { action: 'skip', reason: 'not a git work tree' };
  if (currentHooksPath === HOOKS_PATH) return { action: 'skip', reason: 'already active' };
  if (currentHooksPath) {
    return {
      action: 'warn',
      reason: `core.hooksPath is already ${currentHooksPath}; run npm run check before committing`,
    };
  }
  return { action: 'install', reason: `core.hooksPath set to ${HOOKS_PATH}` };
}

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function readGitState() {
  try {
    const insideWorkTree = git('rev-parse', '--is-inside-work-tree') === 'true';
    return { insideWorkTree, currentHooksPath: readHooksPath() };
  } catch (error) {
    console.warn(`install-hooks: git is unavailable (${error.message})`);
    return { insideWorkTree: false, currentHooksPath: '' };
  }
}

function readHooksPath() {
  try {
    return git('config', '--get', 'core.hooksPath');
  } catch {
    // `git config --get` exits non-zero when the key is unset, which is the normal case.
    return '';
  }
}

/**
 * @param {(...args: string[]) => string} [runGit]
 * @returns {boolean} True when the hooks are now active
 */
function activateHooks(runGit = git) {
  try {
    runGit('config', 'core.hooksPath', HOOKS_PATH);
    return true;
  } catch (error) {
    console.warn(
      `install-hooks: could not set core.hooksPath (${error.message}); run npm run check before committing`
    );
    return false;
  }
}

function main() {
  const decision = decideInstall({ env: process.env, ...readGitState() });
  if (decision.action === 'install' && !activateHooks()) return;
  const log = decision.action === 'warn' ? console.warn : console.log;
  log(`install-hooks: ${decision.reason}`);
}

if (process.argv[1] && process.argv[1].endsWith('install-hooks.mjs')) main();

export { activateHooks, decideInstall, HOOKS_PATH };
