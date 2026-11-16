// ROUND-C3 (4.3, RDC3-041): the drift guard. Every editor command and every
// Video Plan v4 field must have a row in the capability matrix, and every
// row must give Claude a way (or say why it is editor-only bookkeeping).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { commandSchema } from '../../src/core/commands';
import { videoPlanSchema } from '../../src/video-plan/schema';
import { CAPABILITY_MATRIX } from '../../src/director/capability-matrix';

const unwrap = (t: z.ZodTypeAny): z.ZodTypeAny => {
  let x = t as z.ZodTypeAny & { _def: Record<string, unknown> };
  for (;;) {
    const d = x._def;
    const inner = (d.innerType ?? d.schema ?? d.type) as
      z.ZodTypeAny | undefined;
    if (d.typeName === 'ZodArray') x = d.type as never;
    else if (inner && d.typeName !== 'ZodObject') x = inner as never;
    else return x;
  }
};
const keys = (t: z.ZodTypeAny) =>
  Object.keys((unwrap(t) as z.ZodObject<z.ZodRawShape>).shape);
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

describe('[RDC3-041] the capability matrix guards against drift', () => {
  it('[RDC3-041] every editor command (core and capability) and every plan v4 field (top, scene, layer) has a row; every row has a way for Claude or an editor-only reason', () => {
    const core = commandSchema.options.map(
      (o) =>
        (o as z.ZodObject<{ type: z.ZodLiteral<string> }>).shape.type.value,
    );
    const plugins = [
      ...new Set(
        files('src').flatMap((f) =>
          [
            ...readFileSync(f, 'utf8').matchAll(/'(plugin:[a-z-]+:[A-Z_]+)'/g),
          ].map((m) => m[1]!),
        ),
      ),
    ];
    expect(core.length).toBeGreaterThan(40);
    expect(plugins.length).toBeGreaterThanOrEqual(5);
    const inMatrix = new Set(CAPABILITY_MATRIX.flatMap((r) => r.commands));
    expect([...core, ...plugins].filter((c) => !inMatrix.has(c))).toEqual([]);

    const shape = (videoPlanSchema as unknown as z.ZodObject<z.ZodRawShape>)
      .shape;
    const top = Object.keys(shape);
    const scene = keys(shape.scenes!);
    const layer = keys(
      (unwrap(shape.scenes!) as z.ZodObject<z.ZodRawShape>).shape.layers!,
    );
    const planned = new Set(CAPABILITY_MATRIX.flatMap((r) => r.plan));
    expect([...top, ...scene, ...layer].filter((f) => !planned.has(f))).toEqual(
      [],
    );

    for (const r of CAPABILITY_MATRIX)
      expect(r.mcp.length > 0 || !!r.internal, r.family).toBe(true);
  });
  it("[RDC3-041] AGENTS.md section 3 holds the owner's rule", () => {
    expect(readFileSync('AGENTS.md', 'utf8')).toContain(
      'A new editor feature, mode, tool or Studio is not done until it has a row in the capability matrix and a way for Claude to reach it.',
    );
  });
});
