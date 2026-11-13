// ROUND-A A1: where a Project's style record comes from. A ready-made Style
// (Platform Config `styles[]`) gives it at once; otherwise the first Video
// Director builds gives it from its plan. Pure and defensive: a field the
// source does not have stays empty.
import { text, type Style, type LText } from '../platform-config';
import { emptyStyle, type StyleFields, type StyleRecord } from './workspace';

const str = (v: unknown, max = 600) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
const hex = (v: unknown) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '';

/** The style a ready-made Style starts a Project with. */
export function styleFromTemplate(s: Style, locale: 'en' | 'hi'): StyleRecord {
  const p = s.projectStyle;
  const said = (t: LText | undefined) => text(t, locale);
  return {
    ...emptyStyle(),
    look: {
      palette: (p?.palette ?? []).map(hex).filter(Boolean),
      headingFont: str(p?.headingFont, 60),
      bodyFont: str(p?.bodyFont, 60),
      captionStyle: str(p?.captionStyle, 60),
    },
    graphics: str(said(p?.graphics) || said(s.blurb)),
    voice: str(said(p?.voice)),
    music: str(said(p?.music)),
    scriptRules: str(said(p?.scriptRules) || s.playbookText, 2000),
    source: 'ready-made',
  };
}

/** The style a built Video's plan (Video Plan v2/v3) implies. */
export function styleFromPlan(plan: unknown): Partial<StyleFields> {
  const p = (plan ?? {}) as {
    feel?: {
      palette?: Record<string, unknown>;
      headingFont?: unknown;
      bodyFont?: unknown;
      captionStyle?: unknown;
      pacing?: unknown;
      transition?: unknown;
      cameraTendency?: unknown;
    };
    captions?: { style?: unknown };
    music?: { query?: unknown };
    voice?: { voiceId?: unknown; speed?: unknown };
    notes?: unknown;
  };
  const f = p.feel ?? {};
  const palette = ['background', 'text', 'accent']
    .map((k) => hex(f.palette?.[k]))
    .filter(Boolean);
  const graphics = [
    str(f.pacing, 40) && `Pacing: ${str(f.pacing, 40)}`,
    str(f.transition, 40) && `Transitions: ${str(f.transition, 40)}`,
    str(f.cameraTendency, 40) && `Camera: ${str(f.cameraTendency, 40)}`,
  ]
    .filter(Boolean)
    .join('. ');
  const voice = [
    str(p.voice?.voiceId, 100),
    typeof p.voice?.speed === 'number' ? `${p.voice.speed}×` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    look: {
      palette,
      headingFont: str(f.headingFont, 60),
      bodyFont: str(f.bodyFont, 60),
      captionStyle: str(f.captionStyle ?? p.captions?.style, 60),
    },
    graphics,
    voice,
    music: str(p.music?.query, 200),
    scriptRules: str(p.notes, 2000),
  };
}
