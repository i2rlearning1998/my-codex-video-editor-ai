// ROUND-C5 Part 2: every card, hero, banner and empty state of the panel and
// the website that can show a picture is a SLOT with an id. The owner gives a
// slot a picture or a video (with its poster) in Admin › Appearance; a slot
// he never set shows exactly what it showed before. One helper decides what a
// slot draws (slotMedia); one function marks an element (markSlot).
import type { AppearanceSlot, LText, PlatformConfig } from '../platform-config';
import { safeHref } from '../platform-config';
import { slotOf } from './appearance-data';

export type SlotKind = 'card' | 'hero' | 'banner' | 'empty-state' | 'row-art';
export interface SlotInfo {
  readonly id: string;
  readonly kind: SlotKind;
  /** The page it is on (for the Admin tree and its "open the page" link). */
  readonly page: string;
  readonly label: string;
}
/** The fixed slots (one per place). */
export const SLOTS: readonly SlotInfo[] = [
  { id: 'hero:site', kind: 'hero', page: '/site/#/', label: 'Website hero' },
  {
    id: 'hero:director',
    kind: 'hero',
    page: '/panel/#/home',
    label: 'Home: the Director start box',
  },
  {
    id: 'hero:credits',
    kind: 'hero',
    page: '/panel/#/credits',
    label: 'Credits & Plan: the balance hero',
  },
  {
    id: 'banner:site',
    kind: 'banner',
    page: '/site/#/',
    label: "The owner's banner",
  },
  {
    id: 'empty-state:assets',
    kind: 'empty-state',
    page: '/panel/#/assets',
    label: 'Asset Library: nothing yet',
  },
  {
    id: 'empty-state:projects',
    kind: 'empty-state',
    page: '/panel/#/projects',
    label: 'Projects: nothing yet',
  },
  {
    id: 'card:lib-style',
    kind: 'card',
    page: '/panel/#/assets',
    label: 'Asset Library: Style tile',
  },
  {
    id: 'card:lib-project',
    kind: 'card',
    page: '/panel/#/assets',
    label: 'Asset Library: Project tile',
  },
  {
    id: 'card:lib-studio',
    kind: 'card',
    page: '/panel/#/assets',
    label: 'Asset Library: Studio Libraries tile',
  },
  {
    id: 'card:lib-library',
    kind: 'card',
    page: '/panel/#/assets',
    label: 'Asset Library: a library tile',
  },
  {
    id: 'card:claude',
    kind: 'card',
    page: '/site/#/claude',
    label: 'Connect Claude card',
  },
  {
    id: 'row-art:showcase',
    kind: 'row-art',
    page: '/site/#/',
    label: 'Website showcase row',
  },
];
/** Slots made from config lists: one per Style, Studio tool, lesson and plan. */
export const DERIVED = [
  'style',
  'studio',
  'learn',
  'plan',
  'topup',
  'home',
  'page',
] as const;
export type DerivedKind = (typeof DERIVED)[number];
/**
 * Cards that are NOT slots, with the reason (the crawl test accepts these
 * and nothing else).
 */
export const EXEMPT = {
  'person-content':
    "The person's own Projects, Videos and files: they show the person's own pictures.",
  numbers: 'Summary cards with counts and help text; no picture.',
  form: 'Forms, dialogs and consent cards; no picture.',
} as const;
export type ExemptReason = keyof typeof EXEMPT;

/** Every slot the owner can fill for a config (fixed and derived). */
export function allSlots(c: PlatformConfig): SlotInfo[] {
  const say = (t: LText) => t.en;
  return [
    ...SLOTS,
    ...c.styles.map((s) => ({
      id: `style:${s.id}`,
      kind: 'card' as const,
      page: '/panel/#/styles',
      label: `Style: ${say(s.name)}`,
    })),
    ...c.studios.map((s) => ({
      id: `studio:${s.id}`,
      kind: 'card' as const,
      page: '/panel/#/studio',
      label: `Studio: ${say(s.name)}`,
    })),
    ...c.learn.map((l) => ({
      id: `learn:${l.id}`,
      kind: 'card' as const,
      page: '/panel/#/learn',
      label: `Learn: ${say(l.title)}`,
    })),
    ...c.plans.map((p) => ({
      id: `plan:${p.id}`,
      kind: 'card' as const,
      page: '/panel/#/credits',
      label: `Plan: ${say(p.name)}`,
    })),
    ...c.topUps.map((p) => ({
      id: `topup:${p.id}`,
      kind: 'card' as const,
      page: '/panel/#/credits',
      label: `Top-up: ${p.credits}`,
    })),
  ];
}

const motionOff = () => {
  const d = document.documentElement.dataset.motion;
  if (d === 'off') return true;
  if (d === 'on') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
};
const saveData = () =>
  !!(navigator as { connection?: { saveData?: boolean } }).connection?.saveData;

let watch: IntersectionObserver | null = null;
/** Plays a slot video only while it is on screen. */
function observe(v: HTMLVideoElement) {
  if (typeof IntersectionObserver === 'undefined') return;
  watch ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const el = e.target as HTMLVideoElement;
      if (e.isIntersecting) void el.play().catch(() => undefined);
      else el.pause();
    }
  });
  watch.observe(v);
}

/**
 * What a slot draws: the owner's picture or video when he set one, else the
 * defaults (today's drawing). A video plays muted in a loop while it is on
 * screen, poster first; with Animations off, reduced motion or data saving
 * only its poster shows; a broken file falls back to the defaults.
 */
export function slotMedia(
  c: Pick<PlatformConfig, 'appearance'>,
  id: string,
  defaults: () => Element,
): Element {
  const s = slotOf(c, id);
  const img = (src: string, slot: AppearanceSlot) => {
    const el = document.createElement('img');
    el.alt = '';
    el.className = 'slot-media';
    el.dataset.slotMedia = id;
    el.src = src;
    el.style.objectFit = slot.fit;
    el.style.objectPosition = `${slot.focus.x}% ${slot.focus.y}%`;
    el.addEventListener('error', () => el.replaceWith(defaults()), {
      once: true,
    });
    return el;
  };
  if (!s) return defaults();
  if (s.video && s.poster && safeHref(s.video) && safeHref(s.poster)) {
    if (s.play === 'still' || motionOff() || saveData())
      return img(s.poster, s);
    const v = document.createElement('video');
    v.className = 'slot-media';
    v.dataset.slotMedia = id;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.poster = s.poster;
    v.src = s.video;
    v.style.objectFit = s.fit;
    v.style.objectPosition = `${s.focus.x}% ${s.focus.y}%`;
    v.addEventListener('error', () => v.replaceWith(defaults()), {
      once: true,
    });
    if (s.play === 'hover') {
      v.addEventListener(
        'pointerenter',
        () => void v.play().catch(() => undefined),
      );
      v.addEventListener('pointerleave', () => v.pause());
    } else observe(v);
    return v;
  }
  if (s.image && safeHref(s.image)) return img(s.image, s);
  return defaults();
}

/**
 * Marks a card or hero with its slot id and applies the owner's title,
 * blurb, order and hide. Elements inside marked `data-slot-title` and
 * `data-slot-blurb` take the owner's texts.
 */
export function markSlot<E extends HTMLElement>(
  c: Pick<PlatformConfig, 'appearance'>,
  el: E,
  id: string,
  lang: 'en' | 'hi' = 'en',
): E {
  el.dataset.slot = id;
  const s = slotOf(c, id);
  const raw = c.appearance?.slots[id];
  if (raw?.hide) el.hidden = true;
  if (!s) return el;
  const say = (t: LText) => (lang === 'hi' ? (t.hi ?? t.en) : t.en);
  if (s.title) {
    const t = el.querySelector<HTMLElement>('[data-slot-title]');
    if (t) t.textContent = say(s.title);
  }
  if (s.blurb) {
    const b = el.querySelector<HTMLElement>('[data-slot-blurb]');
    if (b) b.textContent = say(s.blurb);
  }
  if (s.order !== undefined) el.style.order = String(s.order);
  return el;
}

/** Marks a card that is not a slot, with its reason. */
export function exemptSlot<E extends HTMLElement>(el: E, why: ExemptReason): E {
  el.dataset.slotExempt = why;
  return el;
}

/** What the crawl test checks: every one of these is a slot or exempt. */
export const SLOT_SELECTOR =
  '.card, .poster, .credit-hero, .start-hero, .site-section.hero, .empty-state';

/** Which slot an element is (or why it is exempt), from what it already says. */
function slotIdOf(el: HTMLElement): string | { exempt: ExemptReason } | null {
  const d = el.dataset;
  if (el.matches('.poster, .style-card') && d.style) return `style:${d.style}`;
  if (d.studio) return `studio:${d.studio}`;
  if (d.plan) return `plan:${d.plan}`;
  if (d.topup) return `topup:${d.topup}`;
  if (d.learn) return `learn:${d.learn}`;
  if (el.id === 'credit-hero') return 'hero:credits';
  if (el.id === 'director-start') return 'hero:director';
  if (el.matches('.site-section.hero')) return 'hero:site';
  if (el.matches('.site-claude')) return 'card:claude';
  if (d.showcase) return 'row-art:showcase';
  if (el.matches('.lib-card')) {
    const href = el.getAttribute('href') ?? '';
    if (/\/s\/|style/.test(href)) return 'card:lib-style';
    if (/\/p\//.test(href)) return 'card:lib-project';
    if (/studio/.test(href)) return 'card:lib-studio';
    return 'card:lib-library';
  }
  if (el.matches('.empty-state')) {
    const page = location.hash.replace(/^#\//, '').split(/[/?]/)[0] ?? '';
    return page === 'projects'
      ? 'empty-state:projects'
      : page === 'assets'
        ? 'empty-state:assets'
        : { exempt: 'numbers' };
  }
  if (
    el.matches('.rda-project, .rda-video, .rda-trash-row') ||
    d.asset ||
    d.wsProject ||
    d.video
  )
    return { exempt: 'person-content' };
  if (el.matches('.rda-aside-card, #mem-videos, .col-side'))
    return { exempt: 'numbers' };
  return { exempt: 'form' };
}

/** Marks every slot under a root; puts the owner's media in when he set one. */
export function decorateSlots(
  root: ParentNode,
  c: Pick<PlatformConfig, 'appearance'>,
  lang: 'en' | 'hi' = 'en',
) {
  for (const el of root.querySelectorAll<HTMLElement>(SLOT_SELECTOR)) {
    if (el.dataset.slot || el.dataset.slotExempt) continue;
    const id = slotIdOf(el);
    if (!id) continue;
    if (typeof id !== 'string') {
      exemptSlot(el, id.exempt);
      continue;
    }
    markSlot(c, el, id, lang);
    // Styles draw their own slot (posterArt); others get a cover when set.
    if (id.startsWith('style:') || !slotOf(c, id)) continue;
    const media = slotMedia(c, id, () => document.createElement('span'));
    if (media.tagName === 'SPAN') continue;
    media.classList.add('slot-cover');
    el.classList.add('has-slot-cover');
    el.prepend(media);
  }
}

/** Keeps a root's slots marked as its screens repaint. */
export function watchSlots(
  root: HTMLElement,
  config: () => Pick<PlatformConfig, 'appearance'>,
  lang: () => 'en' | 'hi',
) {
  let queued = false;
  const run = () => {
    queued = false;
    decorateSlots(root, config(), lang());
  };
  run();
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(run);
  }).observe(root, { childList: true, subtree: true });
}
