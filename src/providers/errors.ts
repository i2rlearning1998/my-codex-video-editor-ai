export type ProviderErrorCode =
  | 'KEY_MISSING'
  | 'KEY_INVALID'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'CORS_BLOCKED'
  | 'BAD_RESPONSE'
  | 'ABORTED'
  | 'SIZE_LIMIT'
  /** FIX1 F2: the truthful classes behind a failed request. */
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'HTTP'
  | 'EMPTY';
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
  OFFLINE: 'The browser is offline.',
  TIMEOUT: 'The request took too long.',
  HTTP: 'The provider answered with an error status.',
  EMPTY: 'The provider sent an empty file.',
};
/** FIX1 F4: where a provider request failed, for the diagnostics report. */
export type ProviderStep = 'search' | 'download' | 'read';
/** Never include a URL, credentials, response body, or original exception. */
export class ProviderError extends Error {
  /** FIX1 F2: the HTTP status, when the provider answered. */
  status?: number;
  /** FIX1 F4: the request step and the endpoint without its query. */
  step?: ProviderStep;
  endpoint?: string;
  constructor(
    readonly code: ProviderErrorCode,
    readonly retryAt?: number,
    detail: { status?: number; step?: ProviderStep; endpoint?: string } = {},
  ) {
    super(messages[code]);
    this.name = 'ProviderError';
    if (detail.status !== undefined) this.status = detail.status;
    if (detail.step) this.step = detail.step;
    if (detail.endpoint) this.endpoint = detail.endpoint;
  }
}
export const assertActive = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new ProviderError('ABORTED');
};
