// P2-32, P2-33: Studio tools from config and the project-wise Asset Library.
// Each run shows its cost first, goes through the gateway (mock this round)
// and saves its result to the chosen project's assets.
import {
  canUse,
  enabledStudios,
  studioById,
  type PlatformConfig,
  type Studio,
} from '../../platform-config';
import { hash } from '../../gateway';
import { icon, studioIcon } from '../icons';
import { h, put } from '../dom';
import type { Ctx, Screen } from '../app';
import type { Asset } from '../services';
import { t } from '../strings';
import { studioService } from '../p3-services';
import { mountStudioForm } from '../studio-form';
import { card, empty } from './common';

/** A picture drawn offline (the mock image model's result). */
export function mockImage(seed: string, label: string): string {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const g = c.getContext('2d')!;
  const hue = hash(seed) % 360;
  const grad = g.createLinearGradient(0, 0, 320, 180);
  grad.addColorStop(0, `hsl(${hue} 70% 45%)`);
  grad.addColorStop(1, `hsl(${(hue + 60) % 360} 70% 25%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 320, 180);
  g.fillStyle = '#fff';
  g.font = '600 16px sans-serif';
  g.fillText(label.slice(0, 34), 14, 160);
  return c.toDataURL('image/png');
}
/** A short tone (the mock voice or music model's result), as a WAV data URL. */
export function mockAudio(seed: string, seconds = 1): string {
  const rate = 8000;
  const n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) =>
    [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  const f = 220 + (hash(seed) % 440);
  for (let i = 0; i < n; i++)
    v.setInt16(
      44 + i * 2,
      Math.round(
        Math.sin((2 * Math.PI * f * i) / rate) *
          8000 *
          Math.min(1, (n - i) / 800),
      ),
      true,
    );
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return `data:audio/wav;base64,${btoa(s)}`;
}

/** P4: studios of one family are one tool with tabs (Voice: speech, changer, effects, music). */
/** ROUND-A: a tool that needs an assigned model shows only once it has one. */
const shown = (c: PlatformConfig) =>
  enabledStudios(c).filter(
    (x) => !x.needsAssignment || !!c.assignments[x.role],
  );
function familyOf(c: PlatformConfig, studioId: string): Studio[] {
  const s = studioById(c, studioId);
  if (!s?.family) return [];
  return shown(c).filter((x) => x.family === s.family);
}
/** The studios shown at the top level: one entry per family (its first tab). */
function topLevel(c: PlatformConfig): Studio[] {
  const seen = new Set<string>();
  return shown(c).filter((x) => {
    if (!x.family) return true;
    if (seen.has(x.family)) return false;
    seen.add(x.family);
    return true;
  });
}
function studioTabs(ctx: Ctx, activeId: string): HTMLElement {
  const c = ctx.s.config;
  const family = familyOf(c, activeId);
  const active = studioById(c, activeId);
  const tab = (x: Studio, label: string, on: boolean, cls = 'tool-tab') =>
    h(
      'a',
      {
        href: `#/studio/${x.id}`,
        class: cls,
        'data-tab': x.id,
        'aria-current': on ? 'page' : undefined,
      },
      label,
    );
  const main = h(
    'nav',
    { class: 'tool-tabs', 'aria-label': t('studio.title') },
    topLevel(c).map((x) =>
      tab(
        x,
        ctx.say(x.family && x.familyName ? x.familyName : x.name),
        x.id === activeId || (!!x.family && x.family === active?.family),
      ),
    ),
  );
  if (family.length < 2) return main;
  return h(
    'div',
    { class: 'tool-tabs-wrap' },
    main,
    h(
      'nav',
      {
        class: 'tool-tabs sub-tabs',
        id: 'studio-family-tabs',
        'aria-label': ctx.say(active?.familyName ?? active?.name ?? { en: '' }),
      },
      family.map((x) =>
        tab(x, ctx.say(x.name), x.id === activeId, 'tool-tab sub'),
      ),
    ),
  );
}
export const studioScreen: Screen = async (ctx, [studioId = ''], out) => {
  const c = ctx.s.config;
  const plan = ctx.s.planOf(ctx.user.id);
  if (!studioId) {
    put(
      out,
      h('h1', { text: t('studio.title') }),
      h(
        'div',
        { class: 'grid', id: 'studio-list' },
        topLevel(c).map((s) => {
          const ok = canUse(plan, s.requires);
          return card(
            { 'data-studio': s.id, 'data-locked': String(!ok) },
            h(
              'span',
              { class: `tool-ico out-${s.output}` },
              icon(studioIcon(s.output)),
            ),
            h('h3', {
              text: ctx.say(s.family && s.familyName ? s.familyName : s.name),
            }),
            s.blurb ? h('p', { class: 'muted', text: ctx.say(s.blurb) }) : null,
            ok
              ? h(
                  'a',
                  { class: 'button primary sm', href: `#/studio/${s.id}` },
                  t('common.open'),
                )
              : h(
                  'a',
                  {
                    class: 'button sm',
                    href: '#/credits',
                    'data-upgrade': s.id,
                  },
                  icon('lock', 14),
                  ` ${t('common.upgrade')}`,
                ),
          );
        }),
      ),
    );
    return;
  }
  const s = studioById(c, studioId);
  if (!s || !s.enabled || (s.needsAssignment && !c.assignments[s.role])) {
    out.append(empty(t('common.none')));
    return;
  }
  if (!canUse(plan, s.requires)) {
    put(
      out,
      studioTabs(ctx, s.id),
      h('h1', { text: ctx.say(s.name) }),
      h('p', {
        class: 'locked-state',
        id: 'studio-locked',
        text: t('common.locked'),
      }),
      h(
        'a',
        { class: 'button primary', href: '#/credits', id: 'studio-upgrade' },
        t('common.upgrade'),
      ),
    );
    return;
  }
  // ROUND-B B0.3: the form is always the config's field form. A model's own
  // declared parameters only hide fields and name the values (studio-form);
  // with a gateway server such a model runs through the Studio service.
  const service = ctx.s.remote
    ? await studioService(ctx, () => '').catch(() => null)
    : null;
  // ROUND-A A4: the config form (one reusable component).
  const view = mountStudioForm({
    ctx,
    studio: s,
    mock: { image: mockImage, audio: mockAudio },
    view: assetView,
    service,
  });
  put(
    out,
    studioTabs(ctx, s.id),
    h('h1', { text: ctx.say(s.name) }),
    s.blurb ? h('p', { class: 'muted', text: ctx.say(s.blurb) }) : null,
    view.el,
  );
};

export function assetView(a: Asset): HTMLElement {
  return h(
    'div',
    { class: 'asset-view', 'data-kind': a.kind },
    (a.kind === 'image' || a.kind === 'video') && !a.dataUrl
      ? h('p', { class: 'muted asset-nofile', text: a.name })
      : a.kind === 'image' || a.kind === 'video'
        ? h('img', { src: a.dataUrl, alt: a.name, class: 'thumb' })
        : a.kind === 'audio'
          ? h('audio', { src: a.dataUrl, controls: true })
          : h('pre', { class: 'asset-text', text: a.text ?? '' }),
  );
}
