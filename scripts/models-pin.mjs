#!/usr/bin/env node
// FINAL2 U11: pins the offline Whisper files. Run on a machine that can reach
// huggingface.co: `npm run models:pin` (optionally `-- --variant base` and
// `-- --revision <commit>`). It downloads each file listed in
// src/speech/whisper-models.json, records its exact size and SHA-256 and the
// commit it came from, and writes the file back. Commit the result.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/speech/whisper-models.json');
const config = JSON.parse(readFileSync(file, 'utf8'));
const arg = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const variants = arg('variant')
  ? [arg('variant')]
  : Object.keys(config.variants);

for (const name of variants) {
  const variant = config.variants[name];
  if (!variant) throw new Error(`Unknown variant ${name}`);
  let revision = arg('revision') ?? variant.revision ?? config.revision;
  if (revision === 'main') {
    // Pin to the commit that "main" is today, so the files never change.
    const info = await fetch(
      `https://huggingface.co/api/models/${variant.model}/revision/main`,
    );
    if (!info.ok)
      throw new Error(`Cannot read ${variant.model}: HTTP ${info.status}`);
    revision = (await info.json()).sha;
    console.log(`${variant.model}: main is ${revision}`);
  }
  for (const entry of variant.files) {
    const url = `https://huggingface.co/${variant.model}/resolve/${revision}/${entry.path}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    entry.sizeBytes = bytes.length;
    entry.sha256 = createHash('sha256').update(bytes).digest('hex');
    console.log(
      `${entry.path}: ${entry.sizeBytes} bytes, sha256 ${entry.sha256}`,
    );
  }
  variant.revision = revision;
}
writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Pinned. Wrote ${path.relative(process.cwd(), file)}; commit it.`);
