import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import {
  createKeyStore,
  createNetwork,
  createSearchCache,
  type FetchLike,
} from '../../src/providers';
export const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(`tests/providers/fixtures/${name}.json`, 'utf8'));
export const response = (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
export function setup(name: string) {
  let time = 0;
  const fetch = vi.fn<FetchLike>(async () => response(fixture(name))),
    keys = createKeyStore(() => undefined);
  keys.setKey('pixabay', 'apiKey', 'private-pixabay');
  keys.setKey('pexels', 'apiKey', 'private-pexels');
  keys.setKey('freesound', 'token', 'private-freesound');
  const network = createNetwork({ fetch, now: () => time }),
    cache = createSearchCache({ now: () => time, backend: null });
  return {
    fetch,
    keys,
    network,
    cache,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
