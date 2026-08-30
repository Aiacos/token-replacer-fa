#!/usr/bin/env node
/**
 * Look up the newest stable Foundry VTT generation and compare it with the
 * `compatibility.verified` value in module.json.
 *
 * Prints a JSON summary and, in Actions, writes `latest`, `verified` and
 * `needs_bump` outputs. Never throws on a network or parsing failure: an
 * unreachable release page must not fail the scheduled workflow.
 */
import { readFileSync, appendFileSync } from 'node:fs';

const RELEASES_URL = 'https://foundryvtt.com/releases/';

const manifest = JSON.parse(readFileSync('module.json', 'utf8'));
const verified = Number.parseInt(String(manifest.compatibility?.verified ?? '0'), 10) || 0;

const emit = (result) => {
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `latest=${result.latest}`,
        `verified=${result.verified}`,
        `needs_bump=${result.needsBump}`,
        `status=${result.status}`,
      ].join('\n') + '\n'
    );
  }
};

let html;
try {
  const response = await fetch(RELEASES_URL, {
    headers: { 'user-agent': 'token-replacer-fa-compat-check' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  html = await response.text();
} catch (error) {
  emit({
    status: 'unreachable',
    error: error.message,
    latest: verified,
    verified,
    needsBump: false,
  });
  process.exit(0);
}

// Release links look like /releases/14.367 — take the highest generation seen.
const generations = [...html.matchAll(/\/releases\/(\d+)\.(\d+)/g)].map((match) =>
  Number(match[1])
);
if (generations.length === 0) {
  emit({ status: 'unparsed', latest: verified, verified, needsBump: false });
  process.exit(0);
}

const latest = Math.max(...generations);
emit({
  status: 'ok',
  latest,
  verified,
  needsBump: latest > verified,
});
