import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { AuditRow } from '../../src/contracts/p3';
import { canonicalJson } from '../entitlements';
const rowSchema = z
  .object({
    seq: z.number().int().positive(),
    at: z.string().datetime(),
    actor: z.string().min(1),
    action: z.string().min(1),
    target: z.string(),
    detail: z.record(
      z.string(),
      z.union([z.string(), z.number().finite(), z.boolean()]),
    ),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type AuditInput = Omit<AuditRow, 'seq' | 'hash'>;
/** Persistence must serialize append+sequence allocation; this helper is pure. */
export function nextAuditRow(
  previous: AuditRow | null,
  input: AuditInput,
): AuditRow {
  const row = { ...input, seq: (previous?.seq ?? 0) + 1 };
  const hash = createHash('sha256')
    .update((previous?.hash ?? '') + canonicalJson(row))
    .digest('hex');
  return rowSchema.parse({ ...row, hash });
}
/** Verify the entire sequence from genesis, not an arbitrary filtered page. */
export function verifyAuditChain(rows: readonly AuditRow[]): boolean {
  let previous: AuditRow | null = null;
  for (const input of rows) {
    const parsed = rowSchema.safeParse(input);
    if (!parsed.success || parsed.data.seq !== (previous?.seq ?? 0) + 1)
      return false;
    const { seq: _, hash, ...body } = parsed.data;
    const expected = nextAuditRow(previous, body);
    if (
      !timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(expected.hash, 'hex'),
      )
    )
      return false;
    previous = parsed.data;
  }
  return true;
}
