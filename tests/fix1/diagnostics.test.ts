// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
vi.stubGlobal('__APP_VERSION__', '0.1.0');
vi.stubGlobal('__GIT_COMMIT__', 'abcdef1234567890');
import { ProviderError } from '../../src/providers';
import { diagnosticsText, sanitize } from '../../src/ui/diagnostics';

// FIX1 F4: the diagnostics report names the step, endpoint and status and
// never carries a saved key, a token or a query string.
describe('[FX1-007] diagnostics', () => {
  it('removes saved keys, tokens and queries', () => {
    localStorage.setItem(
      'aive.provider-key.pixabay.apiKey',
      JSON.stringify('secret-pixabay-123456'),
    );
    const error = new ProviderError('HTTP', undefined, {
      status: 429,
      step: 'search',
      endpoint: 'https://pixabay.com/api/',
    });
    error.stack = `ProviderError\n    at https://pixabay.com/api/?key=secret-pixabay-123456&q=x`;
    const text = diagnosticsText({
      feature: 'Elements › Photos',
      providerId: 'pixabay',
      error,
      extra: {
        note: 'Authorization: Bearer abcdefghijkl secret-pixabay-123456',
      },
    });
    expect(text).toContain('HTTP status: 429');
    expect(text).toContain('Step: search');
    expect(text).toContain('Endpoint: https://pixabay.com/api/');
    expect(text).not.toContain('secret-pixabay-123456');
    expect(text).not.toContain('abcdefghijkl');
    expect(text).toContain('?[query removed]');
    expect(sanitize('token=abcdef123456')).toBe('token=[removed]');
  });
});

// PHASE 0 (E3): a failed model download is in the report by file, host,
// status and bytes (the captions dialog adds the worker's last message).
import { ModelDownloadError } from '../../src/speech/model-cache';
it('[FX5-009] the report of a failed model download names the host, the HTTP status and the bytes', () => {
  const error = new ModelDownloadError(
    'http',
    {
      id: 'whisper-tiny/model.onnx',
      url: 'https://huggingface.co/x/y/resolve/main/model.onnx?token=abc123456',
    } as never,
    { status: 503, bytes: 1024 },
  );
  const text = diagnosticsText({
    feature: 'Auto captions',
    error,
    extra: {
      'failing.host': error.host,
      'failing.bytes': error.bytes,
      'worker.lastMessage': 'progress 12 %',
    },
  });
  expect(text).toContain('HTTP status: 503');
  expect(text).toContain(
    'Endpoint: https://huggingface.co/x/y/resolve/main/model.onnx',
  );
  expect(text).toContain('failing.host: huggingface.co');
  expect(text).toContain('failing.bytes: 1024');
  expect(text).toContain('worker.lastMessage: progress 12 %');
  expect(text).not.toContain('abc123456');
});
