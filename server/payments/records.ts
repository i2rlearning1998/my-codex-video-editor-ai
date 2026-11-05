import type {
  PaymentEvent,
  PaymentWebhookResult,
  AuditRow,
  EmergencySwitches,
} from '../../src/contracts/p3';
import type { LedgerEntry } from '../../src/gateway';
import type { AuditInput } from '../admin/audit';
export interface SecretRecord {
  ciphertext: string;
  iv: string;
  tag: string;
  last4: string;
  updatedAt: string;
}
export interface PaymentRecord {
  event: PaymentEvent;
  creditsDelta: number;
  shortfall: number;
  ledgerKey: string;
  at: string;
}
export interface PaymentCommit {
  event: PaymentEvent;
  credits: number;
  ledgerKey: string;
  revoke: boolean;
  at: string;
}
export interface Operation {
  key: string;
  fingerprint: string;
  result: Record<string, unknown> | null;
}
export interface AdminChange {
  key: string;
  audit: AuditInput;
  userId?: string;
  delta?: number;
  plan?: string;
  suspended?: boolean;
  flag?: { name: string; on: boolean };
  emergency?: EmergencySwitches;
}
export interface P3Store {
  profiles(): Promise<import('../store').Profile[]>;
  payments(userId?: string): Promise<PaymentRecord[]>;
  commitPayment(input: PaymentCommit): Promise<PaymentWebhookResult>;
  appendAudit(input: AuditInput): Promise<AuditRow>;
  audit(): Promise<AuditRow[]>;
  commitAdmin(input: AdminChange): Promise<boolean>;
  flags(userId: string): Promise<string[]>;
  emergency(): Promise<EmergencySwitches>;
  putSecret(name: string, record: SecretRecord): Promise<void>;
  getSecret(name: string): Promise<SecretRecord | null>;
  listSecrets(): Promise<Record<string, SecretRecord>>;
  deleteSecret(name: string): Promise<void>;
  bumpDaily(
    userId: string,
    name: string,
    day: string,
    limit?: number,
  ): Promise<number>;
  dailyCount(userId: string, name: string, day: string): Promise<number>;
  claimOperation(
    key: string,
    fingerprint: string,
  ): Promise<{ claimed: boolean; operation: Operation }>;
  getOperation(key: string): Promise<Operation | null>;
  finishOperation(
    key: string,
    result: Record<string, unknown>,
    audit?: AuditInput,
  ): Promise<void>;
}
export const defaultEmergency = (): EmergencySwitches => ({
  aiOff: false,
  signupsOff: false,
  paymentsOff: false,
  message: { en: 'The service is temporarily paused.' },
});
export function paymentRow(
  input: PaymentCommit,
  previous: readonly PaymentRecord[],
  ledger: readonly LedgerEntry[],
): {
  record: PaymentRecord;
  row: LedgerEntry | null;
  result: PaymentWebhookResult;
} {
  const { event: e } = input;
  const duplicate = previous.some(
    (p) => p.event.provider === e.provider && p.event.eventId === e.eventId,
  );
  if (duplicate)
    return {
      record: previous.find(
        (p) => p.event.provider === e.provider && p.event.eventId === e.eventId,
      )!,
      row: null,
      result: { applied: false, duplicate: true, creditsDelta: 0 },
    };
  const paid = previous.filter(
    (p) =>
      p.event.provider === e.provider &&
      p.event.paymentId === e.paymentId &&
      p.creditsDelta > 0,
  );
  const given = paid.reduce((s, p) => s + p.creditsDelta, 0);
  const taken = previous
    .filter(
      (p) =>
        p.event.provider === e.provider &&
        p.event.paymentId === e.paymentId &&
        p.creditsDelta < 0,
    )
    .reduce((s, p) => s - p.creditsDelta, 0);
  const available = Math.max(
    0,
    ledger.reduce((s, r) => s + r.delta, 0),
  );
  const wanted =
    e.type === 'refund.succeeded' && input.revoke
      ? Math.max(0, given - taken)
      : 0;
  let delta =
    e.type === 'refund.succeeded'
      ? 0 - Math.min(wanted, available)
      : e.type === 'payment.succeeded' || e.type === 'subscription.renewed'
        ? input.credits
        : 0;
  // One successful charge must not grant twice under two different event types/IDs.
  if (
    ledger.some((r) => r.key === input.ledgerKey) ||
    (delta > 0 && paid.length > 0)
  )
    delta = 0;
  const record: PaymentRecord = {
    event: e,
    creditsDelta: delta,
    shortfall: wanted + Math.min(0, delta),
    ledgerKey: input.ledgerKey,
    at: input.at,
  };
  const row: LedgerEntry | null =
    delta === 0
      ? null
      : {
          id: `p3:${e.provider}:${e.eventId}`,
          at: input.at,
          type: delta > 0 ? 'grant' : 'adjust',
          delta,
          key: input.ledgerKey,
          note: delta > 0 ? 'Verified payment' : 'Payment refund revocation',
        };
  return {
    record,
    row,
    result: { applied: true, duplicate: false, creditsDelta: delta },
  };
}
