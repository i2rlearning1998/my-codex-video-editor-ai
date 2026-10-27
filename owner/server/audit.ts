// Phase 1 library manager (P1-13, P1-19): the append-only audit log. One
// JSON line per action, chained by SHA-256 (each row names the previous
// row's hash), so an edited or removed row is found by `verify`. The app
// only appends (the file is opened for appending); there is no route that
// edits or deletes a row.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface AuditRow {
  readonly seq: number;
  readonly time: string;
  readonly actor: string;
  readonly action: string;
  readonly target?: string;
  readonly detail?: string;
  readonly ok: boolean;
  readonly prev: string;
  readonly hash: string;
}
const GENESIS = '0'.repeat(64);
const hashOf = (row: Omit<AuditRow, 'hash'>) =>
  createHash('sha256').update(JSON.stringify(row)).digest('hex');

export class AuditLog {
  readonly file: string;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'audit.log');
  }
  rows(): AuditRow[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditRow);
  }
  append(entry: {
    actor: string;
    action: string;
    target?: string;
    detail?: string;
    ok?: boolean;
    time?: string;
  }): AuditRow {
    const rows = this.rows();
    const last = rows.at(-1);
    const base = {
      seq: (last?.seq ?? 0) + 1,
      time: entry.time ?? new Date().toISOString(),
      actor: entry.actor,
      action: entry.action,
      ...(entry.target !== undefined ? { target: entry.target } : {}),
      ...(entry.detail !== undefined
        ? { detail: entry.detail.slice(0, 2000) }
        : {}),
      ok: entry.ok ?? true,
      prev: last?.hash ?? GENESIS,
    };
    const row: AuditRow = { ...base, hash: hashOf(base) };
    appendFileSync(this.file, `${JSON.stringify(row)}\n`, { flag: 'a' });
    return row;
  }
  /** The sequence number of the first row that was changed, or null. */
  verify(): number | null {
    let prev = GENESIS;
    let seq = 0;
    for (const row of this.rows()) {
      const { hash, ...base } = row;
      if (row.prev !== prev || row.seq !== seq + 1 || hashOf(base) !== hash)
        return row.seq;
      prev = hash;
      seq = row.seq;
    }
    return null;
  }
}
