import { ProviderError, assertActive } from '../providers/errors';
import type { AudioCodec, TtsResult } from './types';
export async function decodeSpeechAudio(
  value: string,
  mime: string,
  codec: AudioCodec,
  signal?: AbortSignal,
): Promise<TtsResult> {
  assertActive(signal);
  if (
    !value ||
    value.length > 280 * 1024 * 1024 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new ProviderError('BAD_RESPONSE');
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const pcm = await codec.decode(blob);
    assertActive(signal);
    const durationSec = (pcm.channels[0]?.length ?? 0) / pcm.sampleRate;
    if (!Number.isFinite(durationSec) || durationSec <= 0)
      throw new ProviderError('BAD_RESPONSE');
    return { blob, mime, durationSec };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('BAD_RESPONSE');
  }
}
