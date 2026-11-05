// P3U: shared pieces of the admin screens: formatting, the reason dialog every
// change goes through, toasts, and a small SVG chart.
import type { Money, P3Text } from '../contracts/p3';
import { h } from '../panel/dom';
import { adminLocale, at } from './strings';

export const text = (t: P3Text | undefined): string =>
  !t ? '' : adminLocale() === 'hi' && t.hi ? t.hi : t.en;

export function money(m: Money): string {
  const major = m.amountMinor / 100;
  return new Intl.NumberFormat(adminLocale() === 'hi' ? 'en-IN' : 'en', {
    style: 'currency',
    currency: m.currency,
    maximumFractionDigits: major % 1 === 0 ? 0 : 2,
  }).format(major);
}
export function usd(n: number): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}
export const num = (n: number): string =>
  new Intl.NumberFormat(adminLocale() === 'hi' ? 'en-IN' : 'en').format(n);
export function when(iso: string | null): string {
  if (!iso) return at('ad.users.never');
  return new Intl.DateTimeFormat(adminLocale() === 'hi' ? 'en-IN' : 'en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
export function whenTime(iso: string): string {
  return new Intl.DateTimeFormat(adminLocale() === 'hi' ? 'en-IN' : 'en', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
export const initials = (email: string): string =>
  (email.split('@')[0] ?? '?')
    .split(/[._-]/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);

/** A modal. Resolves with the value when confirmed, null when cancelled. */
export interface DialogOptions<T> {
  readonly title: string;
  readonly confirm?: string;
  readonly danger?: boolean;
  /** Builds the body; `ready(value|null)` enables or disables Confirm. */
  readonly body: (
    ready: (value: T | null, error?: string) => void,
  ) => (Node | null)[];
}
export function openDialog<T>(o: DialogOptions<T>): Promise<T | null> {
  return new Promise((resolve) => {
    let value: T | null = null;
    const error = h('p', { class: 'ad-dlg-error', role: 'alert' });
    const ok = h('button', {
      type: 'button',
      class: `button primary${o.danger ? ' danger' : ''}`,
      id: 'ad-dlg-confirm',
      text: o.confirm ?? at('ad.dlg.confirm'),
      disabled: true,
    });
    const done = (v: T | null) => {
      document.removeEventListener('keydown', key, true);
      back.remove();
      prev?.focus();
      resolve(v);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(null);
      }
    };
    const body = o.body((v, msg) => {
      value = v;
      ok.disabled = v === null;
      error.textContent = msg ?? '';
    });
    ok.addEventListener('click', () => {
      if (value !== null) done(value);
    });
    const dlg = h(
      'div',
      {
        class: 'ad-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': o.title,
        id: 'ad-dialog',
      },
      h('h2', { text: o.title }),
      ...body,
      error,
      h(
        'div',
        { class: 'ad-dlg-actions' },
        h('button', {
          type: 'button',
          class: 'button ghost',
          id: 'ad-dlg-cancel',
          text: at('ad.dlg.cancel'),
          onclick: () => done(null),
        }),
        ok,
      ),
    );
    const back = h('div', { class: 'ad-backdrop' }, dlg);
    back.addEventListener('mousedown', (e) => {
      if (e.target === back) done(null);
    });
    const prev = document.activeElement as HTMLElement | null;
    document.body.append(back);
    document.addEventListener('keydown', key, true);
    (dlg.querySelector('input,textarea,select') as HTMLElement | null)?.focus();
  });
}

/** The reason box every change needs. */
export function reasonField(onChange: (reason: string) => void): HTMLElement {
  return h(
    'label',
    { class: 'ad-field' },
    h('span', { text: at('ad.dlg.reason') }),
    h('textarea', {
      id: 'ad-reason',
      rows: 2,
      oninput: (e: Event) =>
        onChange((e.target as HTMLTextAreaElement).value.trim()),
    }),
  );
}

/** A dialog that only asks for a reason. */
export function askReason(
  title: string,
  extra: (set: (ok: boolean) => void) => (Node | null)[] = () => [],
  opts: { confirm?: string; danger?: boolean } = {},
): Promise<string | null> {
  return openDialog<string>({
    title,
    ...(opts.confirm ? { confirm: opts.confirm } : {}),
    ...(opts.danger ? { danger: true } : {}),
    body: (ready) => {
      let reason = '';
      let extraOk = true;
      const update = () => ready(reason && extraOk ? reason : null);
      return [
        ...extra((ok) => {
          extraOk = ok;
          update();
        }),
        reasonField((r) => {
          reason = r;
          update();
        }),
      ];
    },
  });
}

/** A line chart of two series (credits and cost) with an accessible table. */
export function seriesChart(
  series: readonly { day: string; credits: number; costUsd: number }[],
  label: string,
): HTMLElement {
  const W = 760;
  const H = 220;
  const pad = { l: 44, r: 44, t: 14, b: 26 };
  const maxC = Math.max(1, ...series.map((s) => s.credits));
  const maxU = Math.max(0.01, ...series.map((s) => s.costUsd));
  const x = (i: number) =>
    pad.l + (i / Math.max(1, series.length - 1)) * (W - pad.l - pad.r);
  const yC = (v: number) => pad.t + (1 - v / maxC) * (H - pad.t - pad.b);
  const yU = (v: number) => pad.t + (1 - v / maxU) * (H - pad.t - pad.b);
  const path = (y: (v: number) => number, pick: 'credits' | 'costUsd') =>
    series
      .map(
        (s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(s[pick]).toFixed(1)}`,
      )
      .join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'ad-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const el = (tag: string, attrs: Record<string, string>) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.append(e);
    return e;
  };
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + (g / 4) * (H - pad.t - pad.b);
    el('line', {
      x1: String(pad.l),
      x2: String(W - pad.r),
      y1: String(y),
      y2: String(y),
      class: 'grid',
    });
    const l = el('text', { x: '6', y: String(y + 4), class: 'axis c' });
    l.textContent = String(Math.round(maxC * (1 - g / 4)));
    const r = el('text', {
      x: String(W - 4),
      y: String(y + 4),
      class: 'axis u',
      'text-anchor': 'end',
    });
    r.textContent = `$${(maxU * (1 - g / 4)).toFixed(0)}`;
  }
  // A range with no days yet (a new platform) draws the grid only: an empty
  // path is not valid SVG.
  if (series.length) {
    const area =
      path(yC, 'credits') +
      ` L${x(series.length - 1)} ${H - pad.b} L${x(0)} ${H - pad.b} Z`;
    el('path', { d: area, class: 'area' });
    el('path', { d: path(yC, 'credits'), class: 'line c' });
    el('path', { d: path(yU, 'costUsd'), class: 'line u' });
  }
  const step = Math.max(1, Math.ceil(series.length / 6));
  series.forEach((s, i) => {
    if (i % step) return;
    const t = el('text', {
      x: String(x(i)),
      y: String(H - 6),
      class: 'axis',
      'text-anchor': 'middle',
    });
    t.textContent = s.day.slice(5);
  });
  return h(
    'figure',
    { class: 'ad-figure' },
    svg,
    h(
      'figcaption',
      { class: 'ad-legend' },
      h('span', { class: 'key c', text: at('ad.dash.credits') }),
      h('span', { class: 'key u', text: at('ad.dash.costUsd') }),
    ),
  );
}

export function empty(message: string): HTMLElement {
  return h('p', { class: 'empty-state ad-empty', text: message });
}
export function failure(message: string, retry: () => void): HTMLElement {
  return h(
    'div',
    { class: 'error-state ad-error', role: 'alert' },
    h('p', { text: at('ad.error', { m: message }) }),
    h('button', {
      type: 'button',
      class: 'button sm',
      text: at('ad.retry'),
      onclick: retry,
    }),
  );
}
