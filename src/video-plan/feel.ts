// FINAL3 V4: a plan's feel as a theme. Palette, fonts, motion and caption
// style fit the theme schema; transition, camera tendency and pacing are the
// feel's extras (kept beside the theme, used as defaults by the builder).
import {
  PLAN_PACING,
  PLAN_TENDENCIES,
  type PlanFeel,
  type VideoPlan,
} from './schema';
import { KIT_CAPTION_STYLES, KIT_TRANSITIONS } from './kit-ids';

export interface FeelTheme {
  readonly palette: {
    background: string;
    primary: string;
    accent: string;
    text: string;
  };
  readonly fonts: { heading: string; body: string };
  readonly motion: 'calm' | 'snappy' | 'bouncy' | 'cinematic';
  readonly caption?: string;
}
export interface FeelExtrasData {
  readonly transition?: string;
  readonly cameraTendency?: string;
  readonly pacing?: string;
}
export function feelTheme(plan: Pick<VideoPlan, 'feel'>): {
  theme: FeelTheme;
  extras: FeelExtrasData;
} {
  const feel: PlanFeel = plan.feel ?? {};
  const accent = feel.palette?.accent ?? '#7c5cff';
  return {
    theme: {
      palette: {
        background: feel.palette?.background ?? '#101219',
        primary: accent,
        accent,
        text: feel.palette?.text ?? '#ffffff',
      },
      fonts: {
        heading: feel.headingFont ?? 'Poppins',
        body: feel.bodyFont ?? 'Inter',
      },
      motion:
        feel.cameraTendency === 'dynamic'
          ? 'cinematic'
          : feel.pacing === 'slow'
            ? 'calm'
            : feel.pacing === 'fast'
              ? 'snappy'
              : 'bouncy',
      ...(feel.captionStyle ? { caption: feel.captionStyle } : {}),
    },
    extras: {
      ...(feel.transition ? { transition: feel.transition } : {}),
      ...(feel.cameraTendency ? { cameraTendency: feel.cameraTendency } : {}),
      ...(feel.pacing ? { pacing: feel.pacing } : {}),
    },
  };
}
/** A plan whose missing feel values come from a theme and its extras. */
export function withFeelDefaults(
  plan: VideoPlan,
  theme: { caption?: string | undefined } | null,
  extras: FeelExtrasData | null,
): VideoPlan {
  const feel = { ...(plan.feel ?? {}) } as Record<string, unknown>;
  const add = (key: string, value: unknown, allowed: readonly string[]) => {
    if (feel[key] === undefined && allowed.includes(value as string))
      feel[key] = value;
  };
  add('captionStyle', theme?.caption, KIT_CAPTION_STYLES);
  add('transition', extras?.transition, KIT_TRANSITIONS);
  add('cameraTendency', extras?.cameraTendency, PLAN_TENDENCIES);
  add('pacing', extras?.pacing, PLAN_PACING);
  return { ...plan, feel: feel as PlanFeel };
}
