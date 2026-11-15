// ROUND-C1 F3: the Brief card's media choice and reference link, as pure
// rules (the AI mode Director and the tests use the same functions).
import type { PlatformConfig } from '../platform-config/schema';

/** The plan's asset rule for a Brief "Pictures and footage" choice, or null. */
export function assetRuleFromBrief(
  c: PlatformConfig,
  choice: string | undefined,
): {
  order: ('mine' | 'library' | 'stock' | 'ai')[];
  aiImagesMax: number;
  aiVideosMax: number;
  onlyMine: boolean;
} | null {
  if (!choice || !Object.hasOwn(c.director.assets.briefChoices, choice))
    return null;
  const r = c.director.assets.briefChoices[choice]!;
  return {
    order: [...r.order],
    aiImagesMax: r.onlyMine ? 0 : r.aiImagesMax,
    aiVideosMax: r.onlyMine ? 0 : r.aiVideosMax,
    onlyMine: r.onlyMine,
  };
}
/** A Brief reference worth reading: one https or http address, else null. */
export function referenceUrl(text: string | undefined): string | null {
  const t = (text ?? '').trim();
  if (!/^https?:\/\/\S+$/i.test(t) || t.length > 2000) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:'
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
