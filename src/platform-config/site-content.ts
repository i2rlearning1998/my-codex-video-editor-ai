// ROUND-C5 Part 1: the website and brand settings the owner edits in Admin
// (Website & Brand), read the same way by the website, the panel, the server
// and the Owner App. DOM-free. A config without these fields gives exactly
// what the website showed before (the defaults below are today's values).
import type { LText, PlatformConfig, SiteLink } from './schema';
import { c5 } from './texts/c5';

type Site = PlatformConfig['site'];
export type Surface = 'website' | 'panel' | 'editor';

/** An address a person may follow: https, a path on this site, or the local catalog. */
export function safeHref(href: string): boolean {
  const h = href.trim();
  if (!h || h.length > 2000) return false;
  if (/^#\//.test(h)) return true;
  if (h.startsWith('/') && !h.startsWith('//') && !h.includes('\\'))
    return true;
  try {
    const u = new URL(h);
    if (u.username || u.password) return false;
    // The owner's local catalog (files uploaded in the Owner App on this
    // computer) is served over http on the loopback address only.
    if (u.protocol === 'http:')
      return u.hostname === '127.0.0.1' || u.hostname === 'localhost';
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Today's header link (before C5 the header had only this one). */
export const DEFAULT_NAV: readonly SiteLink[] = [
  {
    label: { en: 'Connect Claude', hi: 'Claude जोड़ें' },
    href: '#/claude',
    enabled: true,
  },
];
export const navOf = (site: Site): readonly SiteLink[] =>
  (site.nav ?? DEFAULT_NAV).filter((l) => l.enabled && safeHref(l.href));

/** The footer's link groups (none by default) and its copyright line (null: today's line). */
export function footerOf(site: Site): {
  groups: { title: LText; links: SiteLink[] }[];
  copyright: LText | null;
} {
  const f = site.footer;
  return {
    groups: (f?.groups ?? []).map((g) => ({
      title: g.title,
      links: g.links.filter((l) => l.enabled && safeHref(l.href)),
    })),
    copyright: f?.copyright ?? null,
  };
}

const time = (s: string | undefined) => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
};

/** The banner to show on a surface now, or null. */
export function bannerFor(site: Site, where: 'website' | 'panel', now: number) {
  const b = site.banner;
  if (!b?.enabled || !b.where.includes(where) || !b.text.en.trim()) return null;
  const start = time(b.start);
  const end = time(b.end);
  if (start !== null && now < start) return null;
  if (end !== null && now >= end) return null;
  return {
    ...b,
    link: b.link && safeHref(b.link) ? b.link : undefined,
    key: `aive.banner.closed.${b.version}`,
  };
}

/** The maintenance state for a surface, or null when it is not under maintenance. */
export function maintenanceFor(site: Site, where: Surface) {
  const m = site.maintenance;
  if (!m?.on || !m.covers.includes(where)) return null;
  return {
    message: m.message ?? {
      en: c5('maintenance-default'),
      hi: c5('maintenance-default', 'hi'),
    },
    backAt: m.backAt ?? '',
  };
}

/** A published legal page, or null. */
export const legalPage = (site: Site, id: string) =>
  (site.legal ?? []).find((p) => p.id === id && p.published) ?? null;
/** Published legal pages (linked from the footer, sign-up and checkout). */
export const legalLinks = (site: Site) =>
  (site.legal ?? []).filter((p) => p.published);

/** Paragraphs of a legal page, each split into text and https links. */
export function paragraphs(body: string): { text: string; href?: string }[][] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      p
        .split(/(https:\/\/[^\s<>"]+)/g)
        .filter(Boolean)
        .map((part) =>
          /^https:\/\//.test(part) && safeHref(part)
            ? { text: part, href: part }
            : { text: part },
        ),
    );
}

const hex = /^#[0-9a-fA-F]{6}$/;
const markup = /<\s*\/?\s*[a-z!]|javascript:|data:text\/html/i;

/**
 * The checks a Website & Brand save must pass (plain sentences). Owner-written
 * text is plain text: no markup, no script addresses.
 */
export function checkSiteContent(c: PlatformConfig): string[] {
  const errors: string[] = [];
  const plain = (where: string, t: LText | undefined) => {
    if (!t) return;
    for (const v of [t.en, t.hi ?? ''])
      if (markup.test(v))
        errors.push(`${where}: write plain text (no HTML or scripts).`);
  };
  const link = (where: string, href: string) => {
    if (!safeHref(href))
      errors.push(
        `${where}: a link must start with https:// or be a page of this site (/ or #/).`,
      );
  };
  const b = c.brand;
  if (!b.name.trim()) errors.push('The brand name cannot be empty.');
  if (markup.test(b.name)) errors.push('The brand name must be plain text.');
  plain('Tagline', b.tagline);
  for (const [k, v] of Object.entries(b.colors))
    if (!hex.test(v))
      errors.push(`Colour "${k}" must be a colour like #1a2b3c.`);
  if (b.logoUrl && !safeHref(b.logoUrl)) link('Logo', b.logoUrl);
  if (b.faviconUrl && !safeHref(b.faviconUrl)) link('Favicon', b.faviconUrl);
  const s = c.site;
  for (const sec of s.sections) {
    plain(`Section ${sec.id}`, sec.title);
    plain(`Section ${sec.id}`, sec.body);
    sec.items.forEach((it, i) => {
      plain(`Section ${sec.id} item ${i + 1}`, it.title);
      plain(`Section ${sec.id} item ${i + 1}`, it.body);
    });
  }
  const ids = new Set<string>();
  for (const sec of s.sections) {
    if (ids.has(sec.id)) errors.push(`Two sections use the id "${sec.id}".`);
    ids.add(sec.id);
  }
  for (const sh of s.showcase) {
    plain(`Showcase ${sh.id}`, sh.title);
    if (sh.videoUrl) {
      link(`Showcase ${sh.id} video`, sh.videoUrl);
      if (!sh.posterUrl) errors.push(c5('video-needs-poster'));
    }
    if (sh.posterUrl) link(`Showcase ${sh.id} poster`, sh.posterUrl);
  }
  (s.nav ?? []).forEach((l, i) => {
    plain(`Header link ${i + 1}`, l.label);
    link(`Header link ${i + 1}`, l.href);
  });
  (s.footer?.groups ?? []).forEach((g, gi) => {
    plain(`Footer group ${gi + 1}`, g.title);
    g.links.forEach((l, i) => {
      plain(`Footer group ${gi + 1} link ${i + 1}`, l.label);
      link(`Footer group ${gi + 1} link ${i + 1}`, l.href);
    });
  });
  plain('Copyright', s.footer?.copyright);
  if (s.banner) {
    plain('Banner', s.banner.text);
    if (s.banner.link) link('Banner', s.banner.link);
    const a = time(s.banner.start);
    const z = time(s.banner.end);
    if (s.banner.start && a === null)
      errors.push('Banner: the start is not a date.');
    if (s.banner.end && z === null)
      errors.push('Banner: the end is not a date.');
    if (a !== null && z !== null && z <= a)
      errors.push('Banner: the end must be after the start.');
  }
  if (s.maintenance) plain('Maintenance', s.maintenance.message);
  const legal = new Set<string>();
  for (const p of s.legal ?? []) {
    if (legal.has(p.id)) errors.push(`Two legal pages use the id "${p.id}".`);
    legal.add(p.id);
    plain(`Legal page ${p.id}`, p.title);
    plain(`Legal page ${p.id}`, p.body);
    if (p.published && !p.body.en.trim())
      errors.push(`Legal page ${p.id}: a published page needs its text.`);
  }
  return errors;
}

/**
 * Places a Hindi reader would see English instead (1.9): the owner-written
 * texts with an English value and no Hindi one.
 */
export function hindiMissing(c: PlatformConfig): string[] {
  const out: string[] = [];
  const miss = (where: string, t: LText | undefined) => {
    if (t && t.en.trim() && !(t.hi ?? '').trim()) out.push(where);
  };
  miss('Tagline', c.brand.tagline);
  for (const sec of c.site.sections) {
    if (!sec.enabled) continue;
    miss(`Section ${sec.id} title`, sec.title);
    miss(`Section ${sec.id} text`, sec.body);
  }
  (c.site.nav ?? []).forEach((l, i) => miss(`Header link ${i + 1}`, l.label));
  if (c.site.banner?.enabled) miss('Banner', c.site.banner.text);
  for (const p of c.site.legal ?? [])
    if (p.published) miss(`Legal page ${p.id}`, p.body);
  return out;
}
