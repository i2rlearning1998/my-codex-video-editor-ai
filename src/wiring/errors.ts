// P3-WIRING: a refusal as a thrown error, for contract methods that return a
// plain Promise (DirectorService.start, makeStyle...). The UI reads `failure`
// and shows its one sentence.
import type { P3Failure, P3Text } from '../contracts/p3';

export class P3Error extends Error {
  constructor(readonly failure: P3Failure) {
    super(failure.message.en);
    this.name = 'P3Error';
  }
}
export const failure = (
  code: string,
  message: P3Text,
  upgrade?: string,
): P3Failure => ({ code, message, ...(upgrade ? { upgrade } : {}) });
/** The failure inside an error, or a plain one with the error's text. */
export function failureOf(e: unknown, fallback: P3Text): P3Failure {
  if (e instanceof P3Error) return e.failure;
  const code = (e as { code?: unknown })?.code;
  const msg = (e as { message?: unknown })?.message;
  if (typeof code === 'string' && typeof msg === 'string' && msg)
    return { code, message: { en: msg } };
  return { code: 'failed', message: fallback };
}
