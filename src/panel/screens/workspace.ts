// P4: projects first. Projects, the start page, Styles made from projects, and
// the Trash. A project exists at once (Projects library + workspace), and the
// person decides afterwards whether Director or the editor does the work.
import { ASPECT_SIZES } from '../../auth-gate';
import { workspaceRules } from '../../platform-config';
import { clear, h, put } from '../dom';
import { directorService } from '../p3-services';
import { icon } from '../icons';
import { t, type Key } from '../strings';
import type { Ctx, Screen } from '../app';
import type { ProjectSummary } from '../../persistence/projects';
import { readAiProjects } from '../../project/ai-flag';
import { WorkspaceError, type WsProject } from '../workspace';
import { card, empty, limitAlert, when } from './common';

/** Everything the screens below need about the person's projects. */
export interface Joined {
  summary: ProjectSummary;
  meta: WsProject;
}

/** Notes editor-made projects, moves the old Trash list over and empties expired Trash. */
export async function syncWorkspace(ctx: Ctx): Promise<Joined[]> {
  const ws = ctx.s.ws(ctx.user.id);
  ws.reload();
  let list: ProjectSummary[] = [];
  try {
    list = await ctx.s.projects.list();
  } catch {
    list = [];
  }
  for (const p of list) ws.adopt({ id: p.id, name: p.name, at: p.updated });
  // Director used inside the editor makes the project an AI project.
  for (const id of readAiProjects()) if (ws.project(id)) ws.markAi(id);
  // The old Trash list (before P4) moves into the workspace.
  const old = ctx.prefs().trash;
  if (old.length) {
    for (const id of old)
      if (ws.project(id) && !ws.project(id)!.trashedAt) ws.trash(id);
    ctx.setPrefs({ trash: [] });
  }
  const rules = workspaceRules(ctx.s.config, ctx.s.planOf(ctx.user.id).id);
  for (const id of ws.expired(rules.trashDays)) await purgeProject(ctx, id);
  const known = new Set(list.map((p) => p.id));
  return ws
    .projects({ trashed: true })
    .concat(ws.projects())
    .filter((m) => known.has(m.id))
    .map((meta) => ({ meta, summary: list.find((p) => p.id === meta.id)! }));
}

/** Removes a project for good: the document, its files and its record. */
export async function purgeProject(ctx: Ctx, id: string): Promise<void> {
  await ctx.s.projects.remove(id).catch(() => undefined);
  for (const a of ctx.s.assets(ctx.user.id))
    if (a.projectId === id) ctx.s.deleteAsset(a.id);
  ctx.s.ws(ctx.user.id).forget(id);
}

const message = (ctx: Ctx, e: unknown): string => {
  if (e instanceof WorkspaceError) {
    if (e.code === 'style-cap') return t('ws.styleCap');
    if (e.code === 'style-project-cap') return t('ws.styleProjectCap');
  }
  return e instanceof Error ? e.message : String(e);
  void ctx;
};

/** Makes a project and returns its id; null (with a message shown) when refused. */
export async function newProject(
  ctx: Ctx,
  how: 'director' | 'blank',
  opts: { styleId?: string | null; host?: HTMLElement } = {},
): Promise<string | null> {
  const rules = workspaceRules(ctx.s.config, ctx.s.planOf(ctx.user.id).id);
  const refuse = (text: string, link = false) => {
    opts.host?.querySelector('#project-limit')?.remove();
    if (opts.host)
      opts.host.append(
        link
          ? limitAlert('project-limit', text)
          : h('p', {
              class: 'error-state',
              role: 'alert',
              id: 'project-limit',
              text,
            }),
      );
    else ctx.toast(text, 'error');
    return null;
  };
  if (!rules.startOptions.includes(how)) return refuse(t('ws.notAllowed'));
  const limit = await ctx.s.checkLimit(ctx.user.id, 'project');
  if (limit) return refuse(limit, true);
  const ws = ctx.s.ws(ctx.user.id);
  if (
    opts.styleId &&
    rules.maxProjectsPerStyle !== null &&
    ws.projectsOf(opts.styleId).length >= rules.maxProjectsPerStyle
  )
    return refuse(t('ws.styleProjectCap'), true);
  return ctx.s.createProject(ctx.user.id, {
    name: t('ws.untitled'),
    origin: how === 'director' ? 'ai' : 'manual',
    styleId: opts.styleId ?? null,
  });
}

/** "Create with Director" and "Create with Blank project": one pair of buttons. */
export function createButtons(
  ctx: Ctx,
  opts: { styleId?: string | null; host: HTMLElement; ids?: boolean },
): HTMLElement {
  const go = async (how: 'director' | 'blank') => {
    const id = await newProject(ctx, how, {
      ...(opts.styleId !== undefined ? { styleId: opts.styleId } : {}),
      host: opts.host,
    });
    if (id) ctx.go(how === 'director' ? `room/${id}` : `start/${id}`);
  };
  const ids = opts.ids ?? true;
  return h(
    'div',
    { class: 'actions' },
    h(
      'button',
      {
        type: 'button',
        class: 'button primary',
        ...(ids ? { id: 'new-director' } : {}),
        'data-create': 'director',
        onclick: () => void go('director'),
      },
      t('ws.createDirector'),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'button',
        ...(ids ? { id: 'new-blank' } : {}),
        'data-create': 'blank',
        onclick: () => void go('blank'),
      },
      t('ws.createBlank'),
    ),
  );
}

export const tag = (origin: 'ai' | 'manual') =>
  h('span', {
    class: `ws-tag ${origin}`,
    'data-origin': origin,
    text: t(origin === 'ai' ? 'ws.tagAi' : 'ws.tagManual'),
  });

/** Where a click on the project goes. */
export const openHref = (m: WsProject) =>
  m.pause
    ? `#/assets-step/${encodeURIComponent(m.id)}`
    : `/?open=${encodeURIComponent(m.id)}`;

/** The dialog behind "Save to your styles". Resolves true when a Style was made. */
export function saveStyleDialog(
  ctx: Ctx,
  project: WsProject,
  done: () => void,
): void {
  const plan = ctx.s.planOf(ctx.user.id);
  const rules = workspaceRules(ctx.s.config, plan.id);
  const ws = ctx.s.ws(ctx.user.id);
  const err = h('p', {
    class: 'field-error',
    role: 'alert',
    id: 'style-error',
  });
  const input = h('input', {
    type: 'text',
    id: 'style-name',
    value: project.name,
    required: true,
    maxlength: 80,
    'aria-label': t('ws.saveStyleName'),
  });
  const close = () => dlg.remove();
  const submit = async (e: Event) => {
    e.preventDefault();
    err.textContent = '';
    if (!rules.styleAllowed)
      return void (err.textContent = t('ws.styleLocked'));
    if (!ws.canMakeStyle(rules))
      return void (err.textContent = t('ws.styleCap'));
    const name = input.value.trim();
    if (!name) return void (err.textContent = t('mine.needName'));
    const balance = ctx.s.ledger(ctx.user.id).balance();
    if (rules.styleCredits > balance)
      return void (err.textContent = t('ws.styleNoCredits', {
        n: rules.styleCredits,
      }));
    try {
      if (rules.styleCredits > 0)
        await ctx.s.chargeStyle(ctx.user.id, rules.styleCredits);
      // Director learns the look from this project (best effort).
      let recordId: string | null = null;
      try {
        const svc = await directorService(ctx);
        const draft = await svc.makeStyle(project.id, name);
        recordId = (await svc.acceptStyle(draft.id, { name })).id;
      } catch {
        recordId = null;
      }
      ws.makeStyle({
        name,
        fromProjectId: project.id,
        recordId,
        maxStyles: rules.maxStyles,
      });
      ctx.refreshTop();
      ctx.toast(t('ws.styleSaved', { name }));
      close();
      done();
    } catch (x) {
      err.textContent = message(ctx, x);
    }
  };
  const dlg = h(
    'div',
    {
      class: 'ws-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('ws.saveStyleQ'),
    },
    h(
      'form',
      { class: 'ws-dialog-card', onsubmit: submit },
      h('h2', { text: t('ws.saveStyleQ') }),
      h('p', { class: 'muted', text: t('ws.newStyleHelp') }),
      h('label', {
        for: 'style-name',
        class: 'field-label',
        text: t('ws.saveStyleName'),
      }),
      input,
      rules.styleCredits > 0
        ? h('p', {
            class: 'estimate',
            text: t('ws.styleCost', { n: rules.styleCredits }),
          })
        : null,
      !rules.styleAllowed
        ? h(
            'p',
            { class: 'error-state', text: t('ws.styleLocked') },
            ' ',
            h('a', {
              href: '#/credits',
              class: 'upgrade-link',
              text: t('common.upgrade'),
            }),
          )
        : null,
      err,
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            type: 'submit',
            class: 'button primary',
            id: 'style-save',
            disabled: !rules.styleAllowed,
          },
          t('ws.saveStyleGo'),
        ),
        h(
          'button',
          { type: 'button', class: 'button', onclick: close },
          t('common.cancel'),
        ),
      ),
    ),
  );
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  document.body.append(dlg);
  input.focus();
  input.select();
}

/** One project card: tag, picture, name and a small menu. */
export function projectCard(
  ctx: Ctx,
  j: Joined,
  again: () => void | Promise<void>,
  opts: { trash?: boolean } = {},
): HTMLElement {
  const { meta: m, summary: p } = j;
  const ws = ctx.s.ws(ctx.user.id);
  const nameEl = h('h3', { text: p.name });
  const act = (
    key: Key,
    id: string,
    fn: () => void | Promise<void>,
    cls = 'button sm',
  ) =>
    h(
      'button',
      {
        type: 'button',
        class: cls,
        'data-act': id,
        onclick: async () => {
          try {
            await fn();
          } catch (e) {
            ctx.toast(message(ctx, e), 'error');
          }
          await again();
        },
      },
      t(key),
    );
  const rename = () => {
    const field = h('input', {
      type: 'text',
      value: p.name,
      class: 'rename-field',
      'aria-label': t('projects.rename'),
    });
    let done = false;
    const finish = async (save: boolean) => {
      if (done) return;
      done = true;
      const name = field.value.trim();
      if (save && name && name !== p.name) {
        await ctx.s.projects.rename(p.id, name);
        ws.rename(p.id, name);
      }
      await again();
    };
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void finish(true);
      if (e.key === 'Escape') void finish(false);
    });
    field.addEventListener('blur', () => void finish(true));
    nameEl.replaceWith(field);
    field.select();
  };
  const styleName = m.styleId ? ws.style(m.styleId)?.name : null;
  return card(
    {
      'data-project': p.id,
      'data-origin': m.origin,
      'data-waiting': String(!!m.pause),
    },
    h(
      'div',
      { class: 'ws-thumb' },
      p.thumb
        ? h('img', { src: p.thumb, alt: '', class: 'thumb' })
        : h(
            'div',
            { class: 'thumb ws-blank', 'aria-hidden': 'true' },
            icon('projects', 30),
          ),
      tag(m.origin),
      m.pause
        ? h('span', { class: 'ws-tag waiting', text: t('ws.waiting') })
        : null,
    ),
    nameEl,
    h('p', {
      class: 'muted',
      text: styleName
        ? `${t('ws.fromStyle', { name: styleName })} · ${t('projects.edited', { when: when(p.updated, ctx.prefs().locale) })}`
        : t('projects.edited', { when: when(p.updated, ctx.prefs().locale) }),
    }),
    h(
      'div',
      { class: 'actions' },
      ...(opts.trash
        ? [
            act(
              'projects.restore',
              'restore',
              () => ws.restore(p.id),
              'button sm primary',
            ),
            act('projects.deleteForever', 'delete', () =>
              purgeProject(ctx, p.id),
            ),
          ]
        : [
            h(
              'a',
              {
                class: 'button sm primary',
                href: openHref(m),
                'data-act': 'open',
              },
              m.pause ? t('ws.waiting') : t('common.open'),
            ),
            h(
              'details',
              { class: 'card-menu' },
              h(
                'summary',
                {
                  class: 'button sm',
                  'aria-label': t('common.more'),
                  'data-act': 'more',
                },
                '⋯',
              ),
              h(
                'div',
                { class: 'card-menu-list', role: 'menu' },
                h(
                  'a',
                  {
                    class: 'button sm',
                    role: 'menuitem',
                    href: `#/room/${encodeURIComponent(p.id)}`,
                    'data-act': 'director',
                  },
                  t('ws.useDirector'),
                ),
                !m.styleId
                  ? h(
                      'button',
                      {
                        type: 'button',
                        class: 'button sm',
                        role: 'menuitem',
                        'data-act': 'save-style',
                        onclick: () =>
                          saveStyleDialog(ctx, m, () => void again()),
                      },
                      t('ws.saveStyle'),
                    )
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'button sm',
                    role: 'menuitem',
                    'data-act': 'rename',
                    onclick: rename,
                  },
                  t('projects.rename'),
                ),
                h(
                  'a',
                  {
                    class: 'button sm',
                    role: 'menuitem',
                    href: `#/project/${encodeURIComponent(p.id)}`,
                    'data-act': 'memory',
                  },
                  t('mem.open'),
                ),
                act('projects.duplicate', 'duplicate', async () => {
                  const id = await ctx.s.projects.duplicate(p.id, 'copy');
                  if (id) {
                    const copy = ws.adopt({ id, name: `${p.name} copy` });
                    void copy;
                    if (m.origin === 'ai') ws.markAi(id);
                    if (m.styleId)
                      ws.addToStyle(id, m.styleId, {
                        maxProjectsPerStyle: null,
                      });
                  }
                }),
                act('projects.toTrash', 'trash', () => ws.trash(p.id)),
              ),
            ),
          ]),
    ),
  );
}

type View = 'all' | 'recent' | 'trash';

export const projectsScreen: Screen = async (ctx, _a, out) => {
  let q = '';
  let view: View = 'all';
  const host = h('div', { class: 'ws-notices' });
  const list = h('div', { class: 'grid', id: 'project-list' });
  const rules = () =>
    workspaceRules(ctx.s.config, ctx.s.planOf(ctx.user.id).id);
  const note = h('p', { class: 'muted', id: 'trash-note' });
  const paint = async () => {
    const all = await syncWorkspace(ctx);
    const week = Date.now() - 7 * 864e5;
    const shown = all.filter(({ meta: m, summary: p }) => {
      if (view === 'trash') return !!m.trashedAt;
      if (m.trashedAt || m.styleId) return false;
      return (
        (view !== 'recent' || Date.parse(p.updated) >= week) &&
        (!q || p.name.toLowerCase().includes(q))
      );
    });
    note.textContent =
      view === 'trash' ? t('ws.trashHint', { n: rules().trashDays }) : '';
    clear(
      list,
      ...(shown.length
        ? shown.map((j) =>
            projectCard(ctx, j, paint, { trash: view === 'trash' }),
          )
        : [
            empty(view === 'trash' ? t('lib.trashEmpty') : t('projects.empty')),
          ]),
    );
  };
  const tab = (key: Key, v: View) =>
    h(
      'button',
      {
        type: 'button',
        class: 'chip',
        'data-view': v,
        'aria-pressed': String(view === v),
        onclick: (e: Event) => {
          view = v;
          for (const b of out.querySelectorAll('[data-view]'))
            b.setAttribute('aria-pressed', String(b === e.currentTarget));
          void paint();
        },
      },
      t(key),
    );
  put(
    out,
    h('h1', { text: t('projects.title') }),
    createButtons(ctx, { host }),
    host,
    h(
      'div',
      { class: 'filters' },
      h('input', {
        type: 'search',
        id: 'project-search',
        placeholder: t('common.search'),
        'aria-label': t('common.search'),
        oninput: (e: Event) => {
          q = (e.target as HTMLInputElement).value.trim().toLowerCase();
          void paint();
        },
      }),
      tab('common.all', 'all'),
      tab('projects.recent', 'recent'),
      tab('projects.trash', 'trash'),
    ),
    list,
    note,
    h('p', { class: 'muted', text: t('projects.fileMenu') }),
  );
  await paint();
};

/** `#/start/<projectId>`: a new blank project asks how to go on. */
export const startScreen: Screen = async (ctx, [id = ''], out) => {
  const ws = ctx.s.ws(ctx.user.id);
  await syncWorkspace(ctx);
  const m = ws.project(id);
  if (!m) {
    out.append(empty(t('plan.none')));
    return;
  }
  const rules = workspaceRules(ctx.s.config, ctx.s.planOf(ctx.user.id).id);
  const name = h('input', {
    type: 'text',
    id: 'start-name',
    value: m.name,
    maxlength: 80,
    'aria-label': t('projects.blankName'),
  });
  const aspect = h(
    'select',
    { id: 'start-aspect', 'aria-label': t('projects.blankFormat') },
    Object.keys(ASPECT_SIZES).map((a) =>
      h('option', {
        value: a,
        text: a,
        ...(a === m.aspect ? { selected: true } : {}),
      }),
    ),
  );
  /** Saves the name and format the person chose before leaving this page. */
  const apply = async () => {
    const n = name.value.trim();
    if (n && n !== m.name) {
      await ctx.s.projects.rename(m.id, n);
      ws.rename(m.id, n);
    }
    if (aspect.value !== m.aspect) {
      const doc = await ctx.s.projects.open(m.id);
      const size = ASPECT_SIZES[aspect.value];
      if (doc && size) {
        const comp = doc.compositions[0];
        if (comp) {
          comp.width = size[0];
          comp.height = size[1];
        }
        await ctx.s.projects.save(doc);
      }
    }
  };
  const choice = (key: 'director' | 'editor') =>
    h(
      'button',
      {
        type: 'button',
        class: 'room-start glow ws-start',
        'data-start': key,
        disabled:
          key === 'director' && !rules.startOptions.includes('director'),
        onclick: async () => {
          await apply();
          if (key === 'director') {
            ctx.go(`room/${m.id}`);
          } else location.href = `/?open=${encodeURIComponent(m.id)}`;
        },
      },
      h('strong', {
        text: t(key === 'director' ? 'ws.startDirector' : 'ws.startEditor'),
      }),
      h('span', {
        text: t(
          key === 'director' ? 'ws.startDirectorHelp' : 'ws.startEditorHelp',
        ),
      }),
    );
  put(
    out,
    h('h1', { text: t('ws.startTitle') }),
    h(
      'div',
      { class: 'ws-start-fields' },
      h('label', {
        for: 'start-name',
        class: 'field-label',
        text: t('projects.blankName'),
      }),
      name,
      h('label', {
        for: 'start-aspect',
        class: 'field-label',
        text: t('projects.blankFormat'),
      }),
      aspect,
    ),
    h(
      'div',
      { class: 'room-starts ws-starts' },
      choice('director'),
      choice('editor'),
    ),
  );
};

/** The Styles page's "Your Styles": cards of Styles made from projects, and a way to start one. */
export function styleCards(
  ctx: Ctx,
  into: HTMLElement,
  host: HTMLElement,
): void {
  const ws = ctx.s.ws(ctx.user.id);
  const list = ws.styles();
  clear(
    into,
    ...(list.length
      ? list.map((s) => {
          const n = ws.projectsOf(s.id).length;
          return h(
            'article',
            { class: 'card ws-style-card', 'data-ws-style': s.id },
            h(
              'div',
              { class: 'ws-style-art', 'aria-hidden': 'true' },
              h('span', { text: s.name.slice(0, 1).toUpperCase() }),
            ),
            h('h3', { text: s.name }),
            h('p', { class: 'muted', text: t('ws.styleProjects', { n }) }),
            h(
              'div',
              { class: 'actions' },
              h(
                'a',
                {
                  class: 'button sm primary',
                  href: `#/style/${encodeURIComponent(s.id)}`,
                  'data-act': 'open-style',
                },
                t('common.open'),
              ),
            ),
          );
        })
      : [empty(t('ws.stylesEmpty'))]),
  );
  void host;
}

/** `#/style/<id>`: one Style and the projects inside it. */
export const styleScreen: Screen = async (ctx, [id = ''], out) => {
  const ws = ctx.s.ws(ctx.user.id);
  await syncWorkspace(ctx);
  const style = ws.style(id);
  if (!style) {
    put(
      out,
      h('a', { class: 'back-link', href: '#/styles', text: t('mine.back') }),
      h('p', { class: 'error-state', role: 'alert', text: t('ws.styleGone') }),
    );
    return;
  }
  const host = h('div', { class: 'ws-notices' });
  const list = h('div', { class: 'grid', id: 'style-projects' });
  const paint = async () => {
    const all = await syncWorkspace(ctx);
    const mine = all.filter((j) => j.meta.styleId === id && !j.meta.trashedAt);
    clear(
      list,
      ...(mine.length
        ? mine.map((j) => projectCard(ctx, j, paint))
        : [empty(t('ws.styleEmpty'))]),
    );
  };
  const title = h('h1', { text: style.name, id: 'style-title' });
  put(
    out,
    h('a', { class: 'back-link', href: '#/styles', text: t('mine.back') }),
    title,
    h('p', { class: 'muted', text: t('ws.newStyleHelp') }),
    style.recordId
      ? h('a', {
          class: 'button sm',
          href: `#/my-styles/${encodeURIComponent(style.recordId)}`,
          text: t('ws.styleRules'),
        })
      : null,
    h('h2', { text: t('ws.newInStyle') }),
    createButtons(ctx, { styleId: id, host, ids: false }),
    host,
    list,
  );
  await paint();
};

/** The "New Style" form on the Styles page (a Style can be made before any project). */
export function newStyleForm(ctx: Ctx, done: () => void): HTMLElement {
  const rules = workspaceRules(ctx.s.config, ctx.s.planOf(ctx.user.id).id);
  const err = h('p', {
    class: 'field-error',
    role: 'alert',
    id: 'new-style-error',
  });
  const input = h('input', {
    type: 'text',
    id: 'new-style-name',
    maxlength: 80,
    placeholder: t('ws.saveStyleName'),
    'aria-label': t('ws.saveStyleName'),
  });
  return h(
    'form',
    {
      class: 'inline-form',
      id: 'new-style-form',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        err.textContent = '';
        const ws = ctx.s.ws(ctx.user.id);
        if (!rules.styleAllowed)
          return void (err.textContent = t('ws.styleLocked'));
        if (!ws.canMakeStyle(rules))
          return void (err.textContent = t('ws.styleCap'));
        const name = input.value.trim();
        if (!name) return void (err.textContent = t('mine.needName'));
        if (rules.styleCredits > ctx.s.ledger(ctx.user.id).balance())
          return void (err.textContent = t('ws.styleNoCredits', {
            n: rules.styleCredits,
          }));
        try {
          if (rules.styleCredits > 0)
            await ctx.s.chargeStyle(ctx.user.id, rules.styleCredits);
          const s = ws.makeStyle({ name, maxStyles: rules.maxStyles });
          ctx.refreshTop();
          done();
          ctx.go(`style/${s.id}`);
        } catch (x) {
          err.textContent = message(ctx, x);
        }
      },
    },
    input,
    h(
      'button',
      { type: 'submit', class: 'button primary', id: 'new-style-go' },
      t('ws.newStyle'),
    ),
    rules.styleCredits > 0
      ? h('span', {
          class: 'muted',
          text: t('ws.styleCost', { n: rules.styleCredits }),
        })
      : null,
    err,
  );
}
