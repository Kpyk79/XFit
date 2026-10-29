#!/usr/bin/env node
/**
 * Conditional hook dispatcher
 *
 * The original everything-claude-code hooks.json used matchers such as
 * `tool == "Bash" && tool_input.command matches "git push"`, which Claude Code
 * no longer understands (matchers are tool-name regexes). This runs the
 * original hook command only when its condition holds.
 *
 * Usage: node run-if.js <hook-id>   (definitions in ../../hooks/conditional-hooks.json)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const id = process.argv[2];
const defs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'hooks', 'conditional-hooks.json'), 'utf8'));
const def = defs[id];

let data = '';
process.stdin.on('data', c => (data += c));
process.stdin.on('end', () => {
  if (!def) process.exit(0);
  let input = {};
  try {
    input = JSON.parse(data);
  } catch {
    process.exit(0);
  }
  const value = String((input.tool_input || {})[def.field] || '');
  if (def.match && !new RegExp(def.match).test(value)) process.exit(0);
  if (def.notMatch && new RegExp(def.notMatch).test(value)) process.exit(0);

  const r = spawnSync('sh', ['-c', def.command], { input: data, stdio: ['pipe', 'inherit', 'inherit'] });
  process.exit(r.status === null ? 0 : r.status);
});
