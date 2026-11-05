import type { AdminServices } from '../services';

export interface AdminCtx {
  readonly s: AdminServices;
  readonly who: string;
  go(route: string): void;
  toast(message: string, kind?: 'ok' | 'error'): void;
  /** Re-reads the emergency switches for the banner. */
  refreshBanner(): void;
}
export type AdminScreen = (
  ctx: AdminCtx,
  args: string[],
  out: HTMLElement,
) => void | Promise<void>;
export const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);
