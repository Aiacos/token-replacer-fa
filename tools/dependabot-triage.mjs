#!/usr/bin/env node
/**
 * Decide which Dependabot pull requests may be merged without review.
 *
 * Reads the JSON produced by
 *   gh pr list --author app/dependabot --state open \
 *     --json number,title,body,mergeable,statusCheckRollup
 * and prints one tab-separated decision per PR:
 *
 *   <number>\t<merge|hold>\t<reason>
 *
 * Only patch and minor updates with green checks are merged. Major updates are
 * held for a human: a major bump can change behaviour, and the release and
 * compatibility workflows are never exercised by pull-request CI, so a green
 * PR is not proof that releasing still works.
 */
import { readFileSync } from 'node:fs';

/** Version pairs Dependabot writes into a title or body. */
const VERSION_PAIR = /from\s+v?(\d+(?:\.\d+)*)\s+to\s+v?(\d+(?:\.\d+)*)/gi;

const RANK = { patch: 0, minor: 1, major: 2, unknown: 3 };

/**
 * Compare two version strings and say how big the jump is.
 * Missing components count as 0, so "4" -> "7" reads as a major bump.
 * @returns {"patch"|"minor"|"major"}
 */
function compareVersions(from, to) {
  const parse = (value) => value.split('.').map(Number);
  const [fromMajor = 0, fromMinor = 0] = parse(from);
  const [toMajor = 0, toMinor = 0] = parse(to);
  if (toMajor !== fromMajor) return 'major';
  if (toMinor !== fromMinor) return 'minor';
  return 'patch';
}

/**
 * Largest update contained in a Dependabot PR.
 * A grouped PR lists every dependency in its body, so the whole PR is only as
 * safe as its riskiest entry.
 * @param {string} title
 * @param {string} body
 * @returns {"patch"|"minor"|"major"|"unknown"}
 */
function classifyUpdate(title, body = '') {
  const matches = [...`${title}\n${body}`.matchAll(VERSION_PAIR)];
  if (matches.length === 0) return 'unknown';
  return matches
    .map((match) => compareVersions(match[1], match[2]))
    .reduce((worst, current) => (RANK[current] > RANK[worst] ? current : worst), 'patch');
}

/** True when every reported check succeeded (neutral and skipped count as fine). */
function checksArePassing(rollup = []) {
  const states = rollup
    .map((check) => check.conclusion || check.state || '')
    .map((state) => state.toUpperCase());
  if (states.length === 0) return false;
  return states.every((state) => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(state));
}

/**
 * @param {object} pr A pull request from `gh pr list --json ...`
 * @returns {{number: number, action: "merge"|"hold", reason: string}}
 */
function decide(pr) {
  const hold = (reason) => ({ number: pr.number, action: 'hold', reason });

  const updateType = classifyUpdate(pr.title ?? '', pr.body ?? '');
  if (updateType === 'major') return hold('major update — needs review');
  if (updateType === 'unknown') return hold('could not determine the update type');
  if (pr.mergeable !== 'MERGEABLE') return hold(`not mergeable (${pr.mergeable})`);
  if (!checksArePassing(pr.statusCheckRollup)) return hold('checks not green');

  return { number: pr.number, action: 'merge', reason: `${updateType} update, checks green` };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node tools/dependabot-triage.mjs <pr-list.json>');
    process.exit(1);
  }
  const pullRequests = JSON.parse(readFileSync(file, 'utf8'));
  for (const pr of pullRequests) {
    const decision = decide(pr);
    console.log(`${decision.number}\t${decision.action}\t${decision.reason}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('dependabot-triage.mjs')) main();

export { classifyUpdate, compareVersions, checksArePassing, decide };
