// ROUND-C5 Part 2: the Appearance data, DOM-free (the Owner App's server and
// the panel both read it). A slot the owner never set changes nothing.
import {
  c5,
  safeHref,
  type AppearanceSlot,
  type PlatformConfig,
} from '../platform-config';

/** The default upload limits (2.4); the owner may change them in config. */
export const APPEARANCE_LIMITS = {
  imageBytes: 2 * 1024 * 1024,
  videoBytes: 25 * 1024 * 1024,
} as const;

/** The owner's slot, or null when there is none or it is switched off. */
export function slotOf(
  config: Pick<PlatformConfig, 'appearance'>,
  id: string,
): AppearanceSlot | null {
  const s = config.appearance?.slots[id];
  return s && s.enabled ? s : null;
}

/** Checks a config's slots (plain sentences). */
export function checkAppearance(
  c: PlatformConfig,
  lang: 'en' | 'hi' = 'en',
): string[] {
  const out: string[] = [];
  for (const [id, s] of Object.entries(c.appearance?.slots ?? {})) {
    for (const k of ['image', 'video', 'poster'] as const) {
      const v = s[k];
      if (v && !safeHref(v))
        out.push(
          `${id}: the ${k} must be an https address or a file uploaded here.`,
        );
    }
    if (s.video && !s.poster)
      out.push(`${id}: ${c5('video-needs-poster', lang)}`);
  }
  return out;
}

/** Every media address the config uses (for the unused-files list). */
export function usedMedia(c: PlatformConfig): Set<string> {
  const used = new Set<string>();
  const add = (v: string | undefined) => v && used.add(v);
  add(c.brand.logoUrl);
  add(c.brand.faviconUrl);
  for (const sh of c.site.showcase) {
    add(sh.videoUrl);
    add(sh.posterUrl);
  }
  for (const s of Object.values(c.appearance?.slots ?? {})) {
    add(s.image);
    add(s.video);
    add(s.poster);
  }
  for (const st of c.styles) {
    const sample = (st as { sample?: { video?: string; poster?: string } })
      .sample;
    add(sample?.video);
    add(sample?.poster);
    add((st as { cardArt?: string }).cardArt);
  }
  return used;
}
