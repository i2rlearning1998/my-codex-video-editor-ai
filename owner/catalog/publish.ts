// Phase 1 library (P1-07): publish = gate, then store, then a new signed
// catalog version for the items that passed. The same item at the same
// content is skipped, so publishing twice changes nothing.
import { buildCatalog, type BuildResult } from './build';
import {
  runGate,
  type GateFile,
  type GateOptions,
  type GateResult,
} from './gate';
import type { CatalogKeys } from './keys';
import { ItemStore, upsertCandidate } from './store';

export interface PublishResult {
  readonly gate: GateResult;
  readonly build: BuildResult | null;
  readonly added: string[];
  readonly updated: string[];
  readonly unchanged: string[];
}

export async function publish(
  files: readonly GateFile[],
  options: GateOptions & {
    dataDir: string;
    outDir: string;
    keys: CatalogKeys;
    now?: string;
  },
): Promise<PublishResult> {
  const store = new ItemStore(options.dataDir);
  const gate = await runGate(files, store, options);
  const now = options.now ?? new Date().toISOString();
  const out = {
    added: [] as string[],
    updated: [] as string[],
    unchanged: [] as string[],
  };
  for (const candidate of gate.candidates)
    out[upsertCandidate(store, candidate, now)].push(candidate.id);
  if (!gate.candidates.length) return { gate, build: null, ...out };
  store.save();
  const build = buildCatalog(store, options.outDir, options.keys, { now });
  return { gate, build, ...out };
}

/** The plain-language summary the CLI and the manager print. */
export function summary(result: PublishResult): string[] {
  const lines: string[] = [];
  for (const id of result.added) lines.push(`Published ${id}.`);
  for (const id of result.updated)
    lines.push(`Published a new version of ${id}.`);
  for (const id of result.unchanged)
    lines.push(`${id} is already published at this version; skipped.`);
  for (const rejected of result.gate.rejected)
    lines.push(
      `Rejected ${rejected.item ? `${rejected.item} in ${rejected.file}` : rejected.file}: ${rejected.reason}`,
    );
  if (result.build?.changed)
    lines.push(`Catalog version ${result.build.catalogVersion} is live.`);
  else lines.push('The catalog did not change.');
  return lines;
}
