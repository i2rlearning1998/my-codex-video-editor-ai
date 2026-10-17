import type { Provider, ProviderKind } from './types';
export function createProviderRegistry() {
  const entries = new Map<string, Provider>();
  return {
    register(provider: Provider): void {
      if (entries.has(provider.id)) throw Error('Provider already registered');
      entries.set(provider.id, provider);
    },
    list: (): Provider[] => [...entries.values()],
    get: (id: string): Provider | undefined => entries.get(id),
    listByKind: (kind: ProviderKind): Provider[] =>
      [...entries.values()].filter((provider) => provider.kinds.includes(kind)),
  };
}
export const registry = createProviderRegistry();
export const { register, list, get, listByKind } = registry;
