// P2-15: one row per gateway call: model, role, credits, time and outcome.
export interface UsageRow {
  readonly id: string;
  readonly at: string;
  readonly userId: string;
  readonly modelId: string;
  readonly role: string;
  readonly credits: number;
  readonly ms: number;
  readonly outcome: 'ok' | 'failed' | 'refused';
  readonly code?: string;
}
export interface UsageLog {
  append(row: UsageRow): void;
  list(userId?: string): readonly UsageRow[];
}
export const memoryUsageLog = (): UsageLog => {
  const rows: UsageRow[] = [];
  return {
    append: (r) => void rows.push(r),
    list: (u) => (u ? rows.filter((r) => r.userId === u) : rows),
  };
};
type KV = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
};
export function storageUsageLog(storage: KV, max = 2000): UsageLog {
  const key = 'aive.gatewayUsage';
  const read = (): UsageRow[] => {
    try {
      const v = JSON.parse(storage.getItem(key) ?? '[]') as unknown;
      return Array.isArray(v) ? (v as UsageRow[]) : [];
    } catch {
      return [];
    }
  };
  return {
    append: (r) =>
      storage.setItem(key, JSON.stringify([...read(), r].slice(-max))),
    list: (u) => (u ? read().filter((r) => r.userId === u) : read()),
  };
}
