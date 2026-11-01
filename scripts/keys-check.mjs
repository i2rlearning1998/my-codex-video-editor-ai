#!/usr/bin/env node
// P2-R2 (P2B-15): which keys and settings are present. Names only: a value
// is never printed. Reads the process environment and .env.local.
import { existsSync, readFileSync } from 'node:fs';

const keys = JSON.parse(
  readFileSync(new URL('./keys.json', import.meta.url), 'utf8'),
);
const fromFile = {};
if (existsSync('.env.local'))
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[2]) fromFile[m[1]] = true;
  }
let present = 0;
for (const k of keys) {
  const set =
    !!(process.env[k.name] && process.env[k.name].trim()) || !!fromFile[k.name];
  if (set) present++;
  console.log(
    `${set ? 'present' : 'missing'}  ${k.name.padEnd(26)} ${k.unlocks}`,
  );
}
console.log(`\n${present} of ${keys.length} set. Details: docs/KEYS.md`);
