// P2-27: requests Director must not take get the owner's refusal reply, from
// config, never model text. Matching is deterministic (the owner's keywords)
// and runs before any model is asked.
import type { DirectorRules } from '../platform-config';

export type Refusal = DirectorRules['refusals'][number];
const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')} `;

/** The first refusal whose keyword the text contains, else null. */
export function refusalFor(d: DirectorRules, text: string): Refusal | null {
  const t = norm(text);
  for (const r of d.refusals)
    for (const k of r.keywords) if (t.includes(norm(k))) return r;
  return null;
}
