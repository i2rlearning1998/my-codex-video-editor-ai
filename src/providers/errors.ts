export type ProviderErrorCode =
  | 'KEY_MISSING'
  | 'KEY_INVALID'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'CORS_BLOCKED'
  | 'BAD_RESPONSE'
  | 'ABORTED'
  | 'SIZE_LIMIT';
const messages: Record<ProviderErrorCode, string> = {
  KEY_MISSING: 'Add the required provider key.',
  KEY_INVALID: 'The provider rejected the key.',
  RATE_LIMITED: 'Provider request limit reached. Try again later.',
  NETWORK: 'The request could not be completed.',
  CORS_BLOCKED:
    'The browser could not read this download. Cross-origin access may require a server proxy.',
  BAD_RESPONSE: 'The provider returned unsupported data.',
  ABORTED: 'Request cancelled.',
  SIZE_LIMIT: 'The download exceeds the size limit.',
};
/** Never include a URL, credentials, response body, or original exception. */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly retryAt?: number,
  ) {
    super(messages[code]);
    this.name = 'ProviderError';
  }
}
export const assertActive = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new ProviderError('ABORTED');
};
