// P4: the Asset Library. Cards appear in the order the person made them:
// Style cards (with their projects inside), project cards, and one Studio
// Libraries card. Every project holds three libraries: AI, My Templates and
// Media. Studio results saved without a project live in the Studio card.
import { enabledStudios, workspaceRules } from '../../platform-config';
import { clear, h, put } from '../dom';
import { icon } from '../icons';
import { t, type Key } from '../strings';
import type { Ctx, Screen } from '../app';
import type { Asset } from '../services';
import { libraryOf, type LibraryKind } from '../workspace';
import { empty, when } from './common';
import { assetView } from './studio';
import { syncWorkspace } from './workspace';

const STUDIO_BUCKETS = new Set(['', 'unsorted']);
const isStudioAsset = (a: Asset) => STUDIO_BUCKETS.has(a.projectId);
const TYPE_ORDER = ['image', 'video', 'audio', 'text', 'captions', 'pack'];

/** The assets that are not in the Trash. */
const live = (ctx: Ctx) =>
  ctx.s.assets(ctx.user.id).filter((a) => !a.trashedAt);

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
    { class: 'card lib-card', href: x.href, ...x.attrs },
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
const enc = encodeURIComponent;

/** Cards of one project's assets, with Trash. */
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
  const all = await syncWorkspace(ctx);
  const ws = ctx.s.ws(ctx.user.id);
  const rules = workspaceRules(ctx.s.config, ctx.s.planOf(ctx.user.id).id);
  // Assets in the Trash for too long are removed.
  const limit = Date.now() - rules.trashDays * 864e5;
  for (const a of ctx.s.assets(ctx.user.id))
    if (a.trashedAt && Date.parse(a.trashedAt) <= limit)
      ctx.s.deleteAsset(a.id);
  const names = new Map(all.map((j) => [j.meta.id, j.summary.name]));
  const root = '#/assets';
  const again = () => {
    clear(out);
    void assetsScreen(ctx, args, out);
  };
  const [mode, id = '', lib = '', kind = ''] = args;

  // ---- the Studio card -------------------------------------------------
  if (mode === 'studio') {
    const studioAssets = live(ctx).filter(isStudioAsset);
    const studios = enabledStudios(ctx.s.config);
    if (!id) {
      const by = new Map<string, Asset[]>();
      for (const a of studioAssets)
        by.set(a.studioId, [...(by.get(a.studioId) ?? []), a]);
      put(
        out,
        h('h1', { text: t('lib.title') }),
        crumbs([
          { label: t('lib.title'), href: root },
          { label: t('lib.studioCard') },
        ]),
        h(
          'div',
          { class: 'grid', id: 'lib-grid' },
          [...by.entries()].map(([sid, list]) => {
            const s = studios.find((x) => x.id === sid);
            return tile({
              href: `${root}/studio/${enc(sid)}`,
              title: s ? ctx.say(s.name) : sid,
              sub: count(list.length),
              attrs: { 'data-studio-feature': sid },
            });
          }),
        ),
      );
      return;
    }
    const s = studios.find((x) => x.id === id);
    put(
      out,
      h('h1', { text: s ? ctx.say(s.name) : id }),
      crumbs([
        { label: t('lib.title'), href: root },
        { label: t('lib.studioCard'), href: `${root}/studio` },
        { label: s ? ctx.say(s.name) : id },
      ]),
      assetGrid(
        ctx,
        studioAssets.filter((a) => a.studioId === id),
        again,
      ),
    );
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
        text: t('ws.trashHint', { n: rules.trashDays }),
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
                    t('projects.restore'),
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
                    t('projects.deleteForever'),
                  ),
                ),
              ),
            ),
          )
        : empty(t('lib.trashEmpty')),
    );
    return;
  }

  // ---- inside a Style ---------------------------------------------------
  if (mode === 's') {
    const style = ws.style(id);
    if (!style) {
      out.append(empty(t('ws.styleGone')));
      return;
    }
    put(
      out,
      h('h1', { text: style.name }),
      crumbs([{ label: t('lib.title'), href: root }, { label: style.name }]),
      h(
        'div',
        { class: 'grid', id: 'lib-grid' },
        ws
          .projectsOf(id)
          .map((p) =>
            projectTile(
              ctx,
              p.id,
              names.get(p.id) ?? p.name,
              `${root}/p/${enc(p.id)}`,
            ),
          ),
      ),
      ws.projectsOf(id).length ? null : empty(t('ws.styleEmpty')),
    );
    return;
  }

  // ---- inside a project ------------------------------------------------
  if (mode === 'p') {
    const m = ws.project(id);
    if (!m) {
      out.append(empty(t('plan.none')));
      return;
    }
    const style = m.styleId ? ws.style(m.styleId) : undefined;
    const trail = [
      { label: t('lib.title'), href: root },
      ...(style
        ? [{ label: style.name, href: `${root}/s/${enc(style.id)}` }]
        : []),
    ];
    const mine = live(ctx).filter((a) => a.projectId === id);
    const inLib = (l: LibraryKind) => mine.filter((a) => libraryOf(a) === l);
    const here = names.get(id) ?? m.name;
    if (!lib) {
      put(
        out,
        h('h1', { text: here }),
        crumbs([...trail, { label: here }]),
        h(
          'div',
          { class: 'grid', id: 'lib-grid' },
          (['ai', 'templates', 'media'] as const).map((l) =>
            tile({
              href: `${root}/p/${enc(id)}/${l}`,
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
    const here2 = [...trail, { label: here, href: `${root}/p/${enc(id)}` }];
    if (l === 'templates') {
      put(
        out,
        h('h1', { text: libLabel }),
        crumbs([...here2, { label: libLabel }]),
        assetGrid(ctx, items, again),
      );
      return;
    }
    if (!kind) {
      const kinds = TYPE_ORDER.filter((k) => items.some((a) => a.kind === k));
      put(
        out,
        h('h1', { text: libLabel }),
        crumbs([...here2, { label: libLabel }]),
        kinds.length
          ? h(
              'div',
              { class: 'grid', id: 'lib-grid' },
              kinds.map((k) =>
                tile({
                  href: `${root}/p/${enc(id)}/${l}/${k}`,
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
        ...here2,
        { label: libLabel, href: `${root}/p/${enc(id)}/${l}` },
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

  // ---- the top: cards in the order they were made --------------------------
  const studioAssets = live(ctx).filter(isStudioAsset);
  const cards: { at: string; el: HTMLElement }[] = [];
  for (const c of ws.cards()) {
    if (c.kind === 'style')
      cards.push({
        at: c.at,
        el: tile({
          href: `${root}/s/${enc(c.style.id)}`,
          title: c.style.name,
          sub: `${t('lib.styleCard')} · ${t('ws.styleProjects', { n: ws.projectsOf(c.style.id).length })}`,
          attrs: { 'data-lib-style': c.style.id },
        }),
      });
    else if (names.has(c.project.id))
      cards.push({
        at: c.at,
        el: projectTile(
          ctx,
          c.project.id,
          names.get(c.project.id)!,
          `${root}/p/${enc(c.project.id)}`,
        ),
      });
  }
  if (studioAssets.length)
    cards.push({
      at: studioAssets.map((a) => a.createdAt).sort()[0]!,
      el: tile({
        href: `${root}/studio`,
        title: t('lib.studioCard'),
        sub: count(studioAssets.length),
        attrs: { 'data-lib-studio': '' },
      }),
    });
  cards.sort((a, b) => a.at.localeCompare(b.at));
  const trashed = ctx.s.assets(ctx.user.id).filter((a) => a.trashedAt).length;
  put(
    out,
    h('h1', { text: t('lib.title') }),
    h(
      'div',
      { class: 'actions' },
      h('a', {
        class: 'button sm',
        href: `${root}/trash`,
        id: 'lib-trash',
        text: `${t('lib.trashOpen')} (${trashed})`,
      }),
    ),
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

function projectTile(
  ctx: Ctx,
  id: string,
  name: string,
  href: string,
): HTMLElement {
  const m = ctx.s.ws(ctx.user.id).project(id);
  const n = live(ctx).filter((a) => a.projectId === id).length;
  return tile({
    href,
    title: name,
    sub: `${t('lib.projectCard')} · ${count(n)}`,
    attrs: { 'data-lib-project': id },
    art: icon('projects', 28),
  });
  void m;
}
