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
