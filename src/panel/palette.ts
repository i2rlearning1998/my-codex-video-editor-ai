// P2-R3: "Search everything" (Ctrl K): pages, Styles and Studio tools from the
// config, one box, arrow keys and Enter. Nothing is invented: every row is a
// real route.
import { canUse, enabledStyles, enabledStudios } from '../platform-config';
import { h, clear } from './dom';
import { icon, studioIcon, type IconName } from './icons';
import type { Ctx } from './app';
import { t, type Key } from './strings';
import { tick } from './motion';

interface Row {
  label: string;
  hint: string;
  route: string;
  ico: IconName;
}

const PAGES: { route: string; key: Key; ico: IconName }[] = [
  { route: 'home', key: 'nav.home', ico: 'home' },
  { route: 'styles', key: 'nav.styles', ico: 'styles' },
  { route: 'projects', key: 'nav.projects', ico: 'projects' },
  { route: 'studio', key: 'nav.studio', ico: 'studio' },
  { route: 'assets', key: 'nav.assets', ico: 'assets' },
  { route: 'brand', key: 'nav.brand', ico: 'brand' },
  { route: 'learn', key: 'nav.learn', ico: 'learn' },
  { route: 'credits', key: 'nav.credits', ico: 'credits' },
  { route: 'settings', key: 'nav.settings', ico: 'settings' },
];

function rows(ctx: Ctx): Row[] {
  const c = ctx.s.config;
  const plan = ctx.s.planOf(ctx.user.id);
  return [
    ...PAGES.map((p) => ({
      label: t(p.key),
      hint: '',
      route: p.route,
      ico: p.ico,
    })),
    ...enabledStyles(c)
      .filter((s) => canUse(plan, s.requires))
      .map((s) => ({
        label: ctx.say(s.name),
        hint: t('nav.styles'),
        route: `brief/${s.id}`,
        ico: 'styles' as IconName,
      })),
    ...enabledStudios(c).map((s) => ({
      label: ctx.say(s.name),
      hint: t('nav.studio'),
      route: `studio/${s.id}`,
      ico: studioIcon(s.output),
    })),
  ];
}

/** Opens the box (returns false if it is already open). */
export function openPalette(ctx: Ctx): boolean {
  if (document.getElementById('palette')) return false;
  const all = rows(ctx);
  let at = 0;
  let shown: Row[] = all;
  const input = h('input', {
    type: 'search',
    id: 'palette-input',
    placeholder: t('home.searchHint'),
    'aria-label': t('common.search'),
    autocomplete: 'off',
  });
  const list = h('ul', { class: 'palette-list', role: 'listbox' });
  const close = () => {
    box.classList.add('out');
    setTimeout(() => box.remove(), 180);
    document.removeEventListener('keydown', onKey, true);
  };
  const paint = () => {
    const q = input.value.trim().toLowerCase();
    shown = (
      q
        ? all.filter((r) => `${r.label} ${r.hint}`.toLowerCase().includes(q))
        : all
    ).slice(0, 12);
    at = Math.min(at, Math.max(0, shown.length - 1));
    clear(
      list,
      ...shown.map((r, i) =>
        h(
          'li',
          {
            role: 'option',
            'aria-selected': String(i === at),
            class: 'palette-row',
            'data-route': r.route,
            onclick: () => pick(i),
            onmousemove: () => {
              if (at !== i) {
                at = i;
                paint();
              }
            },
          },
          icon(r.ico, 18),
          h('span', { class: 'palette-label', text: r.label }),
          r.hint ? h('span', { class: 'palette-hint', text: r.hint }) : null,
        ),
      ),
    );
  };
  const pick = (i: number) => {
    const r = shown[i];
    if (!r) return;
    tick('select');
    close();
    ctx.go(r.route);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      at =
        (at + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      paint();
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({
        block: 'nearest',
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(at);
    }
  };
  input.addEventListener('input', () => {
    at = 0;
    paint();
  });
  const box = h(
    'div',
    {
      class: 'palette',
      id: 'palette',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('home.searchHint'),
    },
    h('div', { class: 'palette-back', onclick: close }),
    h(
      'div',
      { class: 'palette-box' },
      h('div', { class: 'palette-head' }, icon('search', 18), input),
      list,
    ),
  );
  document.body.append(box);
  document.addEventListener('keydown', onKey, true);
  paint();
  input.focus();
  return true;
}
