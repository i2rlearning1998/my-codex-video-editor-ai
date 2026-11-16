// ROUND-C4 (4.1, RDC4-061): the Admin coverage guard. Every field of the
// director, styles[], mcp, plans, site and studios parts of Platform Config
// is either edited by a named Admin screen or listed as config-only with a
// reason; a new field with neither fails here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import * as S from '../../src/platform-config/schema';
import { mcpSchema } from '../../src/platform-config/media-providers';
import { ADMIN_COVERAGE } from '../../src/platform-config/admin-coverage';

const keys = (s: z.ZodTypeAny): string[] => {
  let x = s as unknown as {
    _def?: { innerType?: unknown; schema?: unknown };
    shape?: Record<string, unknown>;
  };
  while (x._def?.innerType || x._def?.schema)
    x = (x._def.innerType ?? x._def.schema) as typeof x;
  return x.shape ? Object.keys(x.shape) : [];
};
const parts = {
  director: S.directorSchema,
  style: S.styleSchema,
  mcp: mcpSchema,
  plan: S.planSchema,
  site: S.siteSchema,
  studio: S.studioSchema,
} as const;

describe('[RDC4-061] Admin coverage', () => {
  it('[RDC4-061] every field of director, styles[], mcp, plans, site and studios has an Admin screen or a config-only reason; no listed field is stale; docs/ADMIN-COVERAGE.md lists every one', () => {
    const doc = readFileSync('docs/ADMIN-COVERAGE.md', 'utf8');
    for (const [part, schema] of Object.entries(parts)) {
      const fields = keys(schema);
      expect(fields.length, part).toBeGreaterThan(0);
      const map = ADMIN_COVERAGE[part as keyof typeof parts];
      const missing = fields.filter((f) => !(f in map));
      expect(missing, `${part}: fields with no screen and no reason`).toEqual(
        [],
      );
      const stale = Object.keys(map).filter((f) => !fields.includes(f));
      expect(stale, `${part}: listed fields that no longer exist`).toEqual([]);
      for (const [f, c] of Object.entries(map)) {
        if ('configOnly' in c)
          expect(c.configOnly.length, f).toBeGreaterThan(20);
        expect(doc, `${part}.${f} in the doc`).toContain(`| \`${f}\``);
      }
    }
    // The parts this round had to close have screens now.
    for (const f of [
      'web',
      'layout',
      'assets',
      'context',
      'rewritesPerVideo',
      'refusals',
      'styleChat',
      'lines',
      'fieldLibrary',
    ])
      expect('screen' in ADMIN_COVERAGE.director[f]!, f).toBe(true);
    for (const f of Object.keys(ADMIN_COVERAGE.mcp))
      expect('screen' in ADMIN_COVERAGE.mcp[f]!, f).toBe(true);
    for (const f of Object.keys(ADMIN_COVERAGE.style).filter(
      (x) => x !== 'playbook',
    ))
      expect('screen' in ADMIN_COVERAGE.style[f]!, f).toBe(true);
  });
});
