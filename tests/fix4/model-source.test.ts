import { afterEach, expect, test, vi } from 'vitest';
import {
  DEFAULT_MODEL_HOST,
  modelHost,
  setModelHost,
  whisperFiles,
} from '../../src/speech/models';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
afterEach(() => store.clear());

test('[FX4-006] the model host defaults to Hugging Face and files follow the saved source', () => {
  expect(modelHost()).toBe(DEFAULT_MODEL_HOST);
  expect(whisperFiles()[0]!.url).toMatch(/^https:\/\/huggingface\.co\//);
  expect(setModelHost('https://models.example.com/hf/')).toBe(true);
  expect(modelHost()).toBe('https://models.example.com/hf');
  expect(whisperFiles()[0]!.url).toMatch(
    /^https:\/\/models\.example\.com\/hf\/Xenova\/whisper-tiny\/resolve\//,
  );
  // The cache key (id) does not change with the source.
  expect(whisperFiles()[0]!.id).toBe(whisperFiles(DEFAULT_MODEL_HOST)[0]!.id);
});

test('[FX4-007] an address without https is refused; empty returns to the default', () => {
  expect(setModelHost('http://insecure.example')).toBe(false);
  expect(setModelHost('not a url')).toBe(false);
  expect(modelHost()).toBe(DEFAULT_MODEL_HOST);
  setModelHost('https://a.example');
  expect(setModelHost('')).toBe(true);
  expect(modelHost()).toBe(DEFAULT_MODEL_HOST);
});
