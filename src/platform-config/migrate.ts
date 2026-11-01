// Upgrades older config documents to the current schema, one step at a time,
// before validation. Version 1 is the first, so nothing to upgrade yet.
import { CONFIG_SCHEMA_VERSION } from './schema';

type Step = (doc: Record<string, unknown>) => Record<string, unknown>;
const STEPS: Record<number, Step> = {};

export function migrateConfig(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  let doc = { ...(input as Record<string, unknown>) };
  let v = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0;
  if (v > CONFIG_SCHEMA_VERSION) return doc; // newer: validation refuses it
  while (v < CONFIG_SCHEMA_VERSION) {
    const step = STEPS[v];
    if (!step) return doc;
    doc = step(doc);
    v += 1;
    doc.schemaVersion = v;
  }
  return doc;
}
