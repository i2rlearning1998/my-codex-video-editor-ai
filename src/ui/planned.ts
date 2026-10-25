// PHASE 0: what a control that is not built yet says. No control names a
// wave any more: it says what it needs (the AI service or an account) or that
// it is planned for Phase 1.
import { t } from '../i18n';

/** Ledger ids whose feature needs the owner's account (comments, sharing). */
const NEEDS_ACCOUNT = /^(ADV-008|ADV-00[3-9]|COL-|ACC-)/;

export function plannedReason(wave: number | string, id: string): string {
  if (/^AI-/.test(id) || Number(wave) === 10) return t('planned.ai');
  if (NEEDS_ACCOUNT.test(id)) return t('planned.account');
  return t('planned.later');
}
