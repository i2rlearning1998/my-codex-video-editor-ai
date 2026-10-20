import { ProviderError } from './errors';
import type { Provider } from './types';
export type KeyTestResult =
  | { status: 'ok' }
  | {
      status: 'invalid-key' | 'rate-limited' | 'network';
      code: string;
      retryAt?: number;
      /** FIX1 F4: the failure itself, for the diagnostics report. */
      error?: ProviderError;
    };
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function createKeyStore(
  storage: () => KeyStorage | undefined = () =>
    typeof localStorage === 'undefined' ? undefined : localStorage,
) {
  const memory = new Map<string, string>();
  const key = (provider: string, field: string) =>
    `aive.provider-key.${encodeURIComponent(provider)}.${encodeURIComponent(field)}`;
  const getKey = (provider: string, field = 'apiKey'): string => {
    const id = key(provider, field);
    if (memory.has(id)) return memory.get(id)!;
    try {
      const raw = storage()?.getItem(id);
      if (!raw) return '';
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return '';
    }
  };
  const setKey = (provider: string, field: string, value: string): void => {
    const id = key(provider, field),
      clean = value.trim();
    memory.set(id, clean);
    try {
      if (clean) storage()?.setItem(id, JSON.stringify(clean));
      else storage()?.removeItem(id);
    } catch {
      /* Session-only when storage is unavailable. */
    }
  };
  const clearKey = (provider: string, field = 'apiKey') =>
    setKey(provider, field, '');
  const hasKeys = (
    provider: Pick<Provider, 'id' | 'requiresKey' | 'keyFields'>,
  ) =>
    !provider.requiresKey ||
    provider.keyFields.every((field) => Boolean(getKey(provider.id, field.id)));
  return { getKey, setKey, clearKey, hasKeys };
}
export const keyStore = createKeyStore();
export const { getKey, setKey, clearKey, hasKeys } = keyStore;
export const maskKey = (value: string): string =>
  value ? (value.length <= 8 ? '••••••••' : `••••••••${value.slice(-4)}`) : '';
export async function testKey(
  provider: Provider,
  signal?: AbortSignal,
): Promise<KeyTestResult> {
  try {
    if (!provider.probe) throw new ProviderError('BAD_RESPONSE');
    await provider.probe(signal);
    return { status: 'ok' };
  } catch (error) {
    const e =
      error instanceof ProviderError ? error : new ProviderError('NETWORK');
    return {
      status:
        e.code === 'KEY_INVALID' || e.code === 'KEY_MISSING'
          ? 'invalid-key'
          : e.code === 'RATE_LIMITED'
            ? 'rate-limited'
            : 'network',
      code: e.code,
      error: e,
      ...(e.retryAt === undefined ? {} : { retryAt: e.retryAt }),
    };
  }
}
export type KeyStore = ReturnType<typeof createKeyStore>;
