// ROUND-A A3: the Asset Library. The top level holds one card per Project
// and one Studio Libraries card, in the order they were made, with a search
// and a type filter. A Project holds its Video cards; every Video holds
// three libraries: AI, My Templates and Media. Studio Libraries holds one
// card per Studio tool. Deleting goes to the Trash, with Restore.
import { enabledStudios, workspaceRules } from '../../platform-config';
import { clear, h, put } from '../dom';
import { icon } from '../icons';
import { t, type Key } from '../strings';
import type { Ctx, Screen } from '../app';
import type { Asset } from '../services';
import { libraryOf, type LibraryKind } from '../../project/workspace';
import { empty, when } from './common';
import { assetView } from './studio';
import { syncWorkspace } from './workspace';

const STUDIO_BUCKETS = new Set(['', 'unsorted']);
const isStudioAsset = (a: Asset) => STUDIO_BUCKETS.has(a.projectId);
const TYPE_ORDER = ['image', 'video', 'audio', 'text', 'captions', 'pack'];
/** The top-level type filter. */
export const TYPE_FILTERS = [
  'images',
  'video',
  'audio',
  'graphics',
  'templates',
] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];
export function matchesType(a: Asset, f: TypeFilter | ''): boolean {
  const lib = libraryOf(a);
  if (!f) return true;
  if (f === 'templates') return lib === 'templates';
  if (lib === 'templates') return false;
  if (f === 'images') return a.kind === 'image';
  if (f === 'video') return a.kind === 'video';
  if (f === 'audio') return a.kind === 'audio';
  return a.kind === 'pack' || a.kind === 'captions';
}

const enc = encodeURIComponent;
const root = '#/assets';

interface Tile {
  href: string;
  title: string;
  sub: string;
  attrs: Record<string, string>;
  art?: Element;
}
const tile = (x: Tile) =>
  h(
    'a',
    { class: 'card lib-card glow', href: x.href, ...x.attrs },
    h(
      'div',
      { class: 'lib-art', 'aria-hidden': 'true' },
      x.art ?? icon('assets', 28),
    ),
    h('h3', { text: x.title }),
    h('p', { class: 'muted', text: x.sub }),
  );
const crumbs = (items: { label: string; href?: string }[]) =>
  h(
    'nav',
    { class: 'lib-crumbs', 'aria-label': t('lib.title') },
    ...items.flatMap((i, n) => [
      n ? h('span', { 'aria-hidden': 'true', text: '›' }) : null,
      i.href
        ? h('a', { href: i.href, text: i.label })
        : h('strong', { text: i.label, 'aria-current': 'page' }),
    ]),
  );
const count = (n: number) => t('lib.items', { n });

/** Assets not in the Trash and not in a trashed Video or Project. */
function live(ctx: Ctx): Asset[] {
  const ws = ctx.s.ws(ctx.user.id);
  return ctx.s.assets(ctx.user.id).filter((a) => {
    if (a.trashedAt) return false;
    if (isStudioAsset(a)) return true;
    const v = ws.video(a.projectId);
    return !v || !v.trashedAt;
  });
}

/** Cards of assets, each with Trash (editor rows are read-only here). */
function assetGrid(ctx: Ctx, items: Asset[], again: () => void): HTMLElement {
  if (!items.length) return empty(t('lib.noneInside'));
  return h(
    'div',
    { class: 'grid', id: 'asset-list' },
    items
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((a) =>
        h(
          'article',
          { class: 'card', 'data-asset': a.id, 'data-kind': a.kind },
          h('h3', { text: a.name }),
          h('p', {
            class: 'muted',
            text: when(a.createdAt, ctx.prefs().locale),
          }),
          assetView(a),
          a.id.startsWith('ed:')
            ? h('p', { class: 'muted', text: t('lib.fromEditor') })
            : h(
                'div',
                { class: 'actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'button sm',
                    'data-trash': a.id,
                    onclick: () => {
                      ctx.s.patchAsset(a.id, {
                        trashedAt: new Date().toISOString(),
                      });
                      again();
                    },
                  },
                  t('lib.toTrash'),
                ),
              ),
        ),
      ),
  );
}

const typeLabel = (lib: LibraryKind, kind: string): string =>
  lib === 'media'
    ? t(`lib.media.${kind}` as Key)
    : t(`lib.kind.${kind}` as Key);

export const assetsScreen: Screen = async (ctx, args, out) => {
  await syncWorkspace(ctx);
  const ws = ctx.s.ws(ctx.user.id);
  const rules = workspaceRules(ctx.s.config, ctx.s.planOf(ctx.user.id).id);
  // Assets in the Trash for too long are removed.
  const limit = Date.now() - rules.trashDays * 864e5;
  for (const a of ctx.s.assets(ctx.user.id))
    if (a.trashedAt && Date.parse(a.trashedAt) <= limit)
      ctx.s.deleteAsset(a.id);
  const again = () => {
    clear(out);
    void assetsScreen(ctx, args, out);
  };
  const [mode, id = '', lib = '', kind = ''] = args;
  const studios = enabledStudios(ctx.s.config);
  const all = live(ctx);

  // ---- Studio Libraries ------------------------------------------------
  if (mode === 'studio') {
    const studioAssets = all.filter(isStudioAsset);
    if (!id) {
      const by = new Map<string, Asset[]>();
      for (const a of studioAssets)
        by.set(a.studioId, [...(by.get(a.studioId) ?? []), a]);
      put(
        out,
        h('h1', { text: t('lib.studioCard') }),
        crumbs([
          { label: t('lib.title'), href: root },
          { label: t('lib.studioCard') },
        ]),
        by.size
          ? h(
              'div',
              { class: 'grid', id: 'lib-grid' },
              [...by.entries()].map(([sid, list]) => {
                const s = ctx.s.config.studios.find((x) => x.id === sid);
                return tile({
                  href: `${root}/studio/${enc(sid)}`,
                  title: s ? ctx.say(s.familyName ?? s.name) : sid,
                  sub: count(list.length),
                  attrs: { 'data-studio-feature': sid },
                });
              }),
            )
          : empty(t('lib.noneInside')),
      );
      return;
    }
    const s = ctx.s.config.studios.find((x) => x.id === id);
    const label = s ? ctx.say(s.name) : id;
    put(
      out,
      h('h1', { text: label }),
      crumbs([
        { label: t('lib.title'), href: root },
        { label: t('lib.studioCard'), href: `${root}/studio` },
        { label },
      ]),
      assetGrid(
        ctx,
        studioAssets.filter((a) => a.studioId === id),
        again,
      ),
    );
    void studios;
    return;
  }

  // ---- the Trash -----------------------------------------------------
  if (mode === 'trash') {
    const trashed = ctx.s.assets(ctx.user.id).filter((a) => a.trashedAt);
    put(
      out,
      h('h1', { text: t('lib.trashTitle') }),
      crumbs([
        { label: t('lib.title'), href: root },
        { label: t('lib.trashTitle') },
      ]),
      h('p', {
        class: 'muted',
        text: t('rda.trashHint', { n: rules.trashDays }),
      }),
      trashed.length
        ? h(
            'div',
            { class: 'grid', id: 'asset-trash' },
            trashed.map((a) =>
              h(
                'article',
                { class: 'card', 'data-asset': a.id },
                h('h3', { text: a.name }),
                assetView(a),
                h(
                  'div',
                  { class: 'actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'button sm primary',
                      'data-restore': a.id,
                      onclick: () => {
                        ctx.s.patchAsset(a.id, { trashedAt: undefined });
                        again();
                      },
                    },
                    t('rda.restore'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'button sm',
                      'data-delete': a.id,
                      onclick: () => {
                        ctx.s.deleteAsset(a.id);
                        again();
                      },
                    },
                    t('rda.deleteForever'),
                  ),
                ),
              ),
            ),
          )
        : empty(t('lib.trashEmpty')),
    );
    return;
  }

  // ---- inside a Project: its Videos ---------------------------------------
  if (mode === 'p') {
    const p = ws.project(id);
    if (!p || p.trashedAt) {
      put(
        out,
        crumbs([{ label: t('lib.title'), href: root }]),
        h('p', {
          class: 'error-state',
          role: 'alert',
          text: p ? t('rda.projectTrashed') : t('rda.projectGone'),
        }),
      );
      return;
    }
    const vids = ws.videosOf(id);
    put(
      out,
      h('h1', { text: p.name }),
      crumbs([{ label: t('lib.title'), href: root }, { label: p.name }]),
      vids.length
        ? h(
            'div',
            { class: 'grid', id: 'lib-grid' },
            vids.map((v, i) =>
              tile({
                href: `${root}/v/${enc(v.id)}`,
                title: `${t('rda.number', { n: i + 1 })}: ${v.name}`,
                sub: count(all.filter((a) => a.projectId === v.id).length),
                attrs: { 'data-lib-video': v.id },
                art: icon('video', 28),
              }),
            ),
          )
        : empty(t('rda.noVideos')),
    );
    return;
  }

  // ---- inside a Video: AI, My Templates, Media ---------------------------
  if (mode === 'v') {
    const v = ws.video(id);
    const p = v ? ws.project(v.projectId) : undefined;
    if (!v || !p || v.trashedAt) {
      put(
        out,
        crumbs([{ label: t('lib.title'), href: root }]),
        h('p', {
          class: 'error-state',
          role: 'alert',
          text: v ? t('rda.videoTrashed') : t('rda.projectGone'),
        }),
      );
      return;
    }
    const trail = [
      { label: t('lib.title'), href: root },
      { label: p.name, href: `${root}/p/${enc(p.id)}` },
    ];
    const mine = all.filter((a) => a.projectId === id);
    const inLib = (l: LibraryKind) => mine.filter((a) => libraryOf(a) === l);
    if (!lib) {
      put(
        out,
        h('h1', { text: v.name }),
        crumbs([...trail, { label: v.name }]),
        h(
          'div',
          { class: 'grid', id: 'lib-grid' },
          (['ai', 'templates', 'media'] as const).map((l) =>
            tile({
              href: `${root}/v/${enc(id)}/${l}`,
              title: t(`lib.${l}` as Key),
              sub: count(inLib(l).length),
              attrs: { 'data-library': l },
            }),
          ),
        ),
      );
      return;
    }
    const l = lib as LibraryKind;
    const libLabel = t(`lib.${l}` as Key);
    const items = inLib(l);
    const here = [...trail, { label: v.name, href: `${root}/v/${enc(id)}` }];
    if (l === 'templates') {
      put(
        out,
        h('h1', { text: libLabel }),
        crumbs([...here, { label: libLabel }]),
        assetGrid(ctx, items, again),
      );
      return;
    }
    if (!kind) {
      const kinds = TYPE_ORDER.filter((k) => items.some((a) => a.kind === k));
      put(
        out,
        h('h1', { text: libLabel }),
        crumbs([...here, { label: libLabel }]),
        kinds.length
          ? h(
              'div',
              { class: 'grid', id: 'lib-grid' },
              kinds.map((k) =>
                tile({
                  href: `${root}/v/${enc(id)}/${l}/${k}`,
                  title: typeLabel(l, k),
                  sub: count(items.filter((a) => a.kind === k).length),
                  attrs: { 'data-kind-card': k },
                }),
              ),
            )
          : empty(t('lib.noneInside')),
      );
      return;
    }
    put(
      out,
      h('h1', { text: typeLabel(l, kind) }),
      crumbs([
        ...here,
        { label: libLabel, href: `${root}/v/${enc(id)}/${l}` },
        { label: typeLabel(l, kind) },
      ]),
      h('p', { class: 'muted', text: t('lib.versions') }),
      assetGrid(
        ctx,
        items.filter((a) => a.kind === kind),
        again,
      ),
    );
    return;
  }

  // ---- the top: Project cards and Studio Libraries, search, type ----------
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  let q = (params.get('q') ?? '').trim().toLowerCase();
  let type: TypeFilter | '' = (TYPE_FILTERS as readonly string[]).includes(
    params.get('type') ?? '',
  )
    ? (params.get('type') as TypeFilter)
    : '';
  const body = h('div', { class: 'lib-body', id: 'lib-body' });
  const where = (a: Asset): string => {
    if (isStudioAsset(a)) {
      const s = ctx.s.config.studios.find((x) => x.id === a.studioId);
      return `${t('lib.studioCard')} › ${s ? ctx.say(s.name) : a.studioId}`;
    }
    const v = ws.video(a.projectId);
    const p = v ? ws.project(v.projectId) : undefined;
    return [p?.name, v?.name, t(`lib.${libraryOf(a)}` as Key)]
      .filter(Boolean)
      .join(' › ');
  };
  const paint = () => {
    // The address keeps the search, so Back and a reload restore it.
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (type) qs.set('type', type);
    history.replaceState(
      history.state,
      '',
      `${root}${qs.toString() ? `?${qs}` : ''}`,
    );
    for (const b of out.querySelectorAll<HTMLElement>('[data-type-filter]'))
      b.setAttribute('aria-pressed', String(b.dataset.typeFilter === type));
    if (q || type) {
      const found = all.filter(
        (a) =>
          matchesType(a, type) &&
          (!q ||
            a.name.toLowerCase().includes(q) ||
            where(a).toLowerCase().includes(q)),
      );
      clear(
        body,
        found.length
          ? h(
              'div',
              { class: 'grid', id: 'lib-results' },
              found.map((a) =>
                h(
                  'article',
                  { class: 'card', 'data-asset': a.id, 'data-kind': a.kind },
                  h('h3', { text: a.name }),
                  h('p', { class: 'muted lib-where', text: where(a) }),
                  assetView(a),
                ),
              ),
            )
          : empty(t('lib.noneFound')),
      );
      return;
    }
    const studioAssets = all.filter(isStudioAsset);
    const cards: { at: string; el: HTMLElement }[] = ws.cards().map((p) => ({
      at: p.createdAt,
      el: tile({
        href: `${root}/p/${enc(p.id)}`,
        title: p.name,
        sub: `${t('lib.projectCard')} · ${
          ws.videosOf(p.id).length === 1
            ? t('rda.video1')
            : t('rda.videos', { n: ws.videosOf(p.id).length })
        } · ${count(
          all.filter((a) => ws.video(a.projectId)?.projectId === p.id).length,
        )}`,
        attrs: { 'data-lib-project': p.id },
        art: icon('projects', 28),
      }),
    }));
    if (studioAssets.length)
      cards.push({
        at: studioAssets.map((a) => a.createdAt).sort()[0]!,
        el: tile({
          href: `${root}/studio`,
          title: t('lib.studioCard'),
          sub: count(studioAssets.length),
          attrs: { 'data-lib-studio': '' },
          art: icon('studio', 28),
        }),
      });
    cards.sort((a, b) => a.at.localeCompare(b.at));
    clear(
      body,
      cards.length
        ? h(
            'div',
            { class: 'grid', id: 'lib-grid' },
            cards.map((c) => c.el),
          )
        : h(
            'div',
            { class: 'empty-state assets-empty' },
            icon('assets', 28),
            h('p', { text: t('lib.empty') }),
            h('a', {
              class: 'button primary sm',
              href: '#/projects',
              text: t('nav.projects'),
            }),
          ),
    );
  };
  const trashed = ctx.s.assets(ctx.user.id).filter((a) => a.trashedAt).length;
  put(
    out,
    h(
      'div',
      { class: 'rda-head' },
      h('h1', { text: t('lib.title') }),
      h('a', {
        class: 'button sm',
        href: `${root}/trash`,
        id: 'lib-trash',
        text: `${t('lib.trashOpen')} (${trashed})`,
      }),
    ),
    h(
      'div',
      { class: 'filters', id: 'lib-filters' },
      h('input', {
        type: 'search',
        id: 'lib-search',
        value: q,
        placeholder: t('lib.search'),
        'aria-label': t('lib.search'),
        oninput: (e: Event) => {
          q = (e.target as HTMLInputElement).value.trim().toLowerCase();
          paint();
        },
      }),
      ...(['', ...TYPE_FILTERS] as const).map((f) =>
        h('button', {
          type: 'button',
          class: 'chip',
          'data-type-filter': f,
          'aria-pressed': String(type === f),
          text: t(f ? (`lib.type.${f}` as Key) : 'rda.all'),
          onclick: () => {
            type = f;
            paint();
          },
        }),
      ),
    ),
    body,
  );
  paint();
};
