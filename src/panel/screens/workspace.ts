// ROUND-A A2: Projects and Videos. A Project is a container and one style;
// a Video is one editor project inside it. Pages: Projects (cards, New
// project, Trash), the New project dialog, the Project page (Videos, Style,
// Assets, Memory). Everything a person may do comes from the Platform Config
// (start options and limits per plan, Trash days); limits are decided by the
// server when a gateway is used (ctx.s.claim).
import { ASPECT_SIZES } from '../../auth-gate';
import {
  enabledStyles,
  workspaceRules,
  type NewProjectOption,
  type Style,
} from '../../platform-config';
import { clear, h, put } from '../dom';
import { icon, type IconName } from '../icons';
import { t, type Key } from '../strings';
import type { Ctx, Screen } from '../app';
import type { ProjectSummary } from '../../persistence/projects';
import { readAiProjects } from '../../project/ai-flag';
import {
  cleanName,
  type StyleFields,
  type WsProject,
  type WsVideo,
} from '../../project/workspace';
import { styleFromTemplate } from '../../project/style-from';
import { EXPORTS_KEY } from '../../usage-report';
import { empty, limitAlert, when } from './common';
import { assetView } from './studio';
import { memoryPanel } from './project-memory';
import { posterArt } from '../art';

const enc = encodeURIComponent;
const rules = (ctx: Ctx) =>
  workspaceRules(ctx.s.config, ctx.s.planOf(ctx.user.id).id);

// ---- syncing with the Projects library ------------------------------------

/**
 * Reads the editor's Projects library, notes editor-made projects (each a
 * Project with one Video), carries the pre-P4 Trash list over, and removes
 * what waited in the Trash too long. Returns the editor summaries by id.
 */
export async function syncWorkspace(
  ctx: Ctx,
): Promise<Map<string, ProjectSummary>> {
  const ws = ctx.s.ws(ctx.user.id);
  ws.reload();
  let list: ProjectSummary[] = [];
  try {
    list = await ctx.s.projects.list();
  } catch {
    list = [];
  }
  for (const p of list) ws.adopt({ id: p.id, name: p.name, at: p.updated });
  // Director used inside the editor makes the Video an AI video.
  for (const id of readAiProjects()) if (ws.video(id)) ws.markAi(id);
  // The old Trash list (before P4) moves into the workspace.
  const old = ctx.prefs().trash;
  if (old.length) {
    for (const id of old)
      if (ws.video(id) && !ws.video(id)!.trashedAt) ws.trashVideo(id);
    ctx.setPrefs({ trash: [] });
  }
  const gone = ws.expired(rules(ctx).trashDays);
  for (const id of gone.projects) await purgeProject(ctx, id);
  for (const id of gone.videos) await purgeVideo(ctx, id);
  return new Map(list.map((p) => [p.id, p]));
}

/** Deletes a Video for good: its editor file, its assets and its record. */
export async function purgeVideo(ctx: Ctx, id: string): Promise<void> {
  const ws = ctx.s.ws(ctx.user.id);
  const v = ws.video(id);
  await ctx.s.projects.remove(id).catch(() => undefined);
  for (const a of ctx.s.assets(ctx.user.id))
    if (a.projectId === id && !a.id.startsWith('ed:')) ctx.s.deleteAsset(a.id);
  ws.forgetVideo(id);
  if (v)
    await ctx.s.changeWs(ctx.user.id, {
      kind: 'video',
      id,
      projectId: v.projectId,
      to: 'forget',
    });
}
/** Deletes a Project and every Video in it for good. */
export async function purgeProject(ctx: Ctx, id: string): Promise<void> {
  const ws = ctx.s.ws(ctx.user.id);
  for (const v of ws.doc().videos.filter((x) => x.projectId === id)) {
    await ctx.s.projects.remove(v.id).catch(() => undefined);
    for (const a of ctx.s.assets(ctx.user.id))
      if (a.projectId === v.id && !a.id.startsWith('ed:'))
        ctx.s.deleteAsset(a.id);
  }
  ws.forgetProject(id);
  await ctx.s.changeWs(ctx.user.id, { kind: 'project', id, to: 'forget' });
}

// ---- making Projects and Videos -------------------------------------------

const projectId = () =>
  `pr-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
const videoId = () => crypto.randomUUID();

/** Shows a refusal where the person is (inside the host, else a toast). */
function refuse(ctx: Ctx, host: HTMLElement | undefined, text: string) {
  host?.querySelector('#project-limit')?.remove();
  if (host) host.append(limitAlert('project-limit', text));
  else ctx.toast(text, 'error');
  return null;
}

/**
 * ROUND-A: makes a Project and its first Video under the plan. Nothing is
 * made when the plan (the server's, with a gateway) says no, or when the
 * server cannot be asked. Returns the new ids, or null.
 */
export async function startProject(
  ctx: Ctx,
  how: NewProjectOption,
  opts: {
    template?: Style;
    name?: string;
    aspect?: string;
    host?: HTMLElement;
  } = {},
): Promise<{ projectId: string; videoId: string } | null> {
  if (!rules(ctx).newProjectOptions.includes(how))
    return refuse(ctx, opts.host, t('ws.notAllowed'));
  const pid = projectId();
  const vid = videoId();
  const asked =
    (await ctx.s.claim(ctx.user.id, { kind: 'project', id: pid })) ??
    (await ctx.s.claim(ctx.user.id, {
      kind: 'video',
      id: vid,
      projectId: pid,
    }));
  if (asked) return refuse(ctx, opts.host, asked);
  const ws = ctx.s.ws(ctx.user.id);
  const name =
    cleanName(opts.name ?? '') ||
    (opts.template ? ctx.say(opts.template.name) : t('ws.untitled'));
  const ai = how !== 'editor';
  ws.addProject({
    id: pid,
    name,
    origin: how === 'style' ? 'style' : how === 'editor' ? 'manual' : how,
    templateId: opts.template?.id ?? null,
    ...(opts.template
      ? { style: styleFromTemplate(opts.template, ctx.prefs().locale) }
      : {}),
  });
  try {
    await ctx.s.createVideo(ctx.user.id, {
      id: vid,
      projectId: pid,
      name,
      aspect: opts.aspect ?? opts.template?.formats[0] ?? '16:9',
      origin: ai ? 'ai' : 'manual',
      stage: ai ? 'brief' : 'editor',
    });
  } catch {
    ws.forgetProject(pid);
    await ctx.s.changeWs(ctx.user.id, {
      kind: 'project',
      id: pid,
      to: 'forget',
    });
    return refuse(ctx, opts.host, t('rda.failed'));
  }
  return { projectId: pid, videoId: vid };
}

/** ROUND-A: one more Video in a Project (it follows the Project's style). */
export async function startVideo(
  ctx: Ctx,
  pid: string,
  how: 'style' | 'editor',
  host?: HTMLElement,
): Promise<string | null> {
  const ws = ctx.s.ws(ctx.user.id);
  const p = ws.project(pid);
  if (!p) return refuse(ctx, host, t('rda.projectGone'));
  const vid = videoId();
  const asked = await ctx.s.claim(ctx.user.id, {
    kind: 'video',
    id: vid,
    projectId: pid,
  });
  if (asked) return refuse(ctx, host, asked);
  const first = ws.videosOf(pid)[0];
  const n = ws.videosOf(pid).length + 1;
  try {
    await ctx.s.createVideo(ctx.user.id, {
      id: vid,
      projectId: pid,
      name: `${p.name} ${n}`,
      aspect: first?.aspect ?? '16:9',
      origin: how === 'style' ? 'ai' : 'manual',
      stage: how === 'style' ? 'brief' : 'editor',
    });
  } catch {
    await ctx.s.changeWs(ctx.user.id, {
      kind: 'video',
      id: vid,
      projectId: pid,
      to: 'forget',
    });
    return refuse(ctx, host, t('rda.failed'));
  }
  return vid;
}

/**
 * Where a Video opens: Director when it is AI-made and not finished, else
 * the editor.
 *
 * ROUND-B SEAM: until the editor's AI mode exists (Round B), a Video made
 * from a ready-made Style or by Director opens the existing Director flow in
 * the panel, bound to this Video (brief, plan, asset step). Round B replaces
 * these three addresses with the editor's AI mode.
 */
export function videoHref(ctx: Ctx, v: WsVideo): string {
  if (v.origin === 'ai' && v.stage !== 'built' && v.stage !== 'editor') {
    if (v.stage === 'assets' && v.pause) return `#/assets-step/${enc(v.id)}`;
    const p = ctx.s.ws(ctx.user.id).project(v.projectId);
    if (p?.templateId)
      return `#/brief/${enc(p.templateId)}?project=${enc(v.id)}`;
    return `#/room/${enc(v.id)}`;
  }
  return editorHref(v.id);
}
export const editorHref = (id: string) => `/?open=${enc(id)}`;
/**
 * Leaves for the editor so that its Back button returns to the Project page:
 * the panel's own history entry is the Project page.
 */
export function leaveForEditor(v: { id: string; projectId: string }) {
  history.replaceState(history.state, '', `#/project/${enc(v.projectId)}`);
}
/** Goes to a Video (Director flow or editor) from anywhere in the panel. */
export function openVideo(ctx: Ctx, v: WsVideo) {
  const href = videoHref(ctx, v);
  if (href.startsWith('#/')) {
    location.hash = href.slice(1);
    return;
  }
  leaveForEditor(v);
  location.assign(href);
}
/** After a start: Director flow or the editor. */
function go(ctx: Ctx, vid: string) {
  const v = ctx.s.ws(ctx.user.id).video(vid);
  if (v) openVideo(ctx, v);
}

// ---- small pieces ----------------------------------------------------------

const ORIGIN_KEY: Record<string, Key> = {
  director: 'rda.tag.director',
  manual: 'rda.tag.manual',
  claude: 'rda.tag.claude',
};
/** The origin tag: the ready-made Style's name, Director, Manual or Claude. */
export function originTag(ctx: Ctx, p: WsProject): HTMLElement {
  const style = p.templateId
    ? ctx.s.config.styles.find((s) => s.id === p.templateId)
    : undefined;
  const text =
    p.origin === 'style' && style
      ? ctx.say(style.name)
      : t(ORIGIN_KEY[p.origin] ?? 'rda.tag.director');
  return h('span', {
    class: `ws-tag ${p.origin === 'manual' ? 'manual' : 'ai'}`,
    'data-origin': p.origin,
    text,
  });
}
const videoCount = (n: number) =>
  n === 1 ? t('rda.video1') : t('rda.videos', { n });
const stageChip = (v: WsVideo) =>
  h('span', {
    class: `rda-stage stage-${v.stage}`,
    'data-stage': v.stage,
    text: t(`rda.stage.${v.stage}` as Key),
  });
const thumbOf = (s: ProjectSummary | undefined) =>
  s?.thumb
    ? h('img', { src: s.thumb, alt: '', class: 'thumb', loading: 'lazy' })
    : h(
        'div',
        { class: 'thumb ws-blank', 'aria-hidden': 'true' },
        icon('projects', 30),
      );

/** A small menu (details/summary) of buttons and links. */
function menu(
  label: string,
  items: (HTMLElement | null)[],
  attrs: Record<string, string> = {},
): HTMLElement {
  return h(
    'details',
    { class: 'card-menu', ...attrs },
    h(
      'summary',
      { class: 'button sm', 'aria-label': label, 'data-act': 'more' },
      '⋯',
    ),
    h(
      'div',
      { class: 'card-menu-list', role: 'menu' },
      ...items.filter((x): x is HTMLElement => !!x),
    ),
  );
}
const menuButton = (key: Key, act: string, fn: () => void) =>
  h(
    'button',
    {
      type: 'button',
      class: 'button sm',
      role: 'menuitem',
      'data-act': act,
      onclick: (e: Event) => {
        (e.currentTarget as HTMLElement)
          .closest('details')
          ?.removeAttribute('open');
        fn();
      },
    },
    t(key),
  );

/** Turns a heading into a text field until Enter, Escape or blur. */
function renameInPlace(
  el: HTMLElement,
  value: string,
  save: (name: string) => Promise<void> | void,
) {
  const field = h('input', {
    type: 'text',
    value,
    maxlength: 200,
    class: 'rename-field',
    'aria-label': t('rda.rename'),
  });
  let done = false;
  const finish = async (keep: boolean) => {
    if (done) return;
    done = true;
    const name = cleanName(field.value);
    if (keep && name && name !== value) await save(name);
    else field.replaceWith(el);
  };
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void finish(true);
    if (e.key === 'Escape') void finish(false);
  });
  field.addEventListener('blur', () => void finish(true));
  el.replaceWith(field);
  field.focus();
  field.select();
}

// ---- the New project dialog -----------------------------------------------

const DRAFT = 'aive.panel.newProject';
const OPTION_KEYS: Record<NewProjectOption, [Key, Key, string]> = {
  style: ['rda.opt.style', 'rda.opt.styleHelp', 'styles'],
  director: ['rda.opt.director', 'rda.opt.directorHelp', 'director'],
  editor: ['rda.opt.editor', 'rda.opt.editorHelp', 'projects'],
  claude: ['rda.opt.claude', 'rda.opt.claudeHelp', 'director'],
};

/**
 * The dialog lives in the address (`?new=1`), so Back closes it and a reload
 * opens it again with what was typed (kept in this tab's session storage).
 */
export function newProjectDialog(ctx: Ctx, onClose: () => void): HTMLElement {
  const draft = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(DRAFT) ?? '{}') as {
        name?: string;
        aspect?: string;
      };
    } catch {
      return {};
    }
  })();
  const keep = () =>
    sessionStorage.setItem(
      DRAFT,
      JSON.stringify({ name: name.value, aspect: aspect.value }),
    );
  const name = h('input', {
    type: 'text',
    id: 'np-name',
    maxlength: 200,
    value: draft.name ?? '',
    placeholder: t('ws.untitled'),
    'aria-label': t('rda.name'),
    oninput: keep,
  });
  const aspect = h(
    'select',
    { id: 'np-aspect', 'aria-label': t('rda.format'), onchange: keep },
    Object.keys(ASPECT_SIZES).map((a) =>
      h('option', {
        value: a,
        text: a,
        ...(a === (draft.aspect ?? '16:9') ? { selected: true } : {}),
      }),
    ),
  );
  const notes = h('div', { class: 'ws-notices', id: 'np-notes' });
  const gallery = h('div', {
    class: 'np-gallery',
    id: 'np-gallery',
    hidden: true,
  });
  const options = rules(ctx).newProjectOptions;
  let busy = false;
  const run = async (how: NewProjectOption, template?: Style) => {
    if (busy) return;
    busy = true;
    card.setAttribute('aria-busy', 'true');
    const made = await startProject(ctx, how, {
      name: name.value,
      aspect: template ? (template.formats[0] ?? aspect.value) : aspect.value,
      host: notes,
      ...(template ? { template } : {}),
    }).catch(() => refuse(ctx, notes, t('rda.failed')));
    busy = false;
    card.removeAttribute('aria-busy');
    if (!made) return; // The typed name stays; the refusal is shown.
    sessionStorage.removeItem(DRAFT);
    go(ctx, made.videoId);
  };
  const paintGallery = () => {
    const plan = ctx.s.planOf(ctx.user.id);
    clear(
      gallery,
      h('h3', { text: t('rda.pickStyle') }),
      h(
        'div',
        { class: 'np-styles' },
        ...enabledStyles(ctx.s.config).map((s) => {
          const ok = s.requires.every((f) => plan.features.includes(f));
          return h(
            'button',
            {
              type: 'button',
              class: 'np-style glow',
              'data-template': s.id,
              disabled: !ok,
              onclick: () => void run('style', s),
            },
            h(
              'span',
              { class: 'np-style-art', 'aria-hidden': 'true' },
              posterArt(s, ctx.s.config),
            ),
            h('strong', { text: ctx.say(s.name) }),
            h('span', {
              class: 'muted',
              text: ok ? ctx.say(s.blurb) : t('common.upgrade'),
            }),
          );
        }),
      ),
    );
  };
  const choice = (how: NewProjectOption) => {
    const [title, help, ico] = OPTION_KEYS[how];
    return h(
      'button',
      {
        type: 'button',
        class: 'np-option glow',
        'data-option': how,
        onclick: () => {
          if (how === 'style') {
            gallery.hidden = !gallery.hidden;
            if (!gallery.hidden) paintGallery();
            return;
          }
          void run(how);
        },
      },
      h('span', { class: 'np-option-ico' }, icon(ico as IconName, 22)),
      h('strong', { text: t(title) }),
      h('span', { class: 'muted', text: t(help) }),
    );
  };
  const card = h(
    'div',
    { class: 'ws-dialog-card np-card' },
    h(
      'div',
      { class: 'np-head' },
      h('h2', { id: 'np-title', text: t('rda.newProjectTitle') }),
      h('button', {
        type: 'button',
        class: 'button sm ghost',
        id: 'np-close',
        'aria-label': t('rda.close'),
        text: '×',
        onclick: onClose,
      }),
    ),
    h('p', { class: 'muted', text: t('rda.newProjectHelp') }),
    h(
      'div',
      { class: 'np-fields' },
      h('label', { for: 'np-name', class: 'field-label', text: t('rda.name') }),
      name,
      h('label', {
        for: 'np-aspect',
        class: 'field-label',
        text: t('rda.format'),
      }),
      aspect,
    ),
    options.length
      ? h('div', { class: 'np-options', id: 'np-options' }, options.map(choice))
      : limitAlert('np-none', t('rda.noOptions')),
    gallery,
    notes,
  );
  const dlg = h(
    'div',
    {
      class: 'ws-dialog np-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'np-title',
      onclick: (e: Event) => {
        if (e.target === dlg) onClose();
      },
      onkeydown: (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      },
    },
    card,
  );
  queueMicrotask(() => name.focus());
  return dlg;
}
/** The address of the New project dialog over the Projects page. */
export const NEW_PROJECT_ROUTE = 'projects?new=1';
const dialogWanted = () =>
  new URLSearchParams(location.hash.split('?')[1] ?? '').get('new') === '1';

// ---- the Projects page -----------------------------------------------------

function projectCard(
  ctx: Ctx,
  p: WsProject,
  thumbs: Map<string, ProjectSummary>,
  again: () => void,
): HTMLElement {
  const ws = ctx.s.ws(ctx.user.id);
  const vids = ws.videosOf(p.id);
  const newest = vids
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find((v) => thumbs.get(v.id)?.thumb);
  const nameEl = h('h3', { text: p.name });
  const href = `#/project/${enc(p.id)}`;
  return h(
    'article',
    {
      class: 'card film glow rda-project',
      'data-ws-project': p.id,
      'data-origin': p.origin,
    },
    h(
      'a',
      { class: 'ws-thumb', href, 'aria-label': p.name },
      thumbOf(newest ? thumbs.get(newest.id) : undefined),
      originTag(ctx, p),
    ),
    h(
      'div',
      { class: 'film-body' },
      nameEl,
      h('p', {
        class: 'muted',
        'data-count': String(vids.length),
        text: `${videoCount(vids.length)} · ${when(p.updatedAt, ctx.prefs().locale)}`,
      }),
      h(
        'div',
        { class: 'actions' },
        h('a', {
          class: 'button sm primary',
          href,
          'data-act': 'open',
          text: t('rda.open'),
        }),
        menu(t('rda.more'), [
          menuButton('rda.rename', 'rename', () =>
            renameInPlace(nameEl, p.name, (n) => {
              ws.renameProject(p.id, n);
              again();
            }),
          ),
          menuButton('rda.delete', 'delete', async () => {
            ws.trashProject(p.id);
            await ctx.s.changeWs(ctx.user.id, {
              kind: 'project',
              id: p.id,
              to: 'trash',
            });
            ctx.toast(t('rda.deletedProject', { name: p.name }));
            again();
          }),
        ]),
      ),
    ),
  );
}

async function restore(
  ctx: Ctx,
  x: { kind: 'project' | 'video'; id: string; projectId?: string },
): Promise<boolean> {
  const no = await ctx.s.changeWs(ctx.user.id, { ...x, to: 'restore' });
  if (no) {
    ctx.toast(no, 'error');
    return false;
  }
  const ws = ctx.s.ws(ctx.user.id);
  if (x.kind === 'project') ws.restoreProject(x.id);
  else ws.restoreVideo(x.id);
  ctx.toast(t('rda.restored'));
  return true;
}

function trashView(ctx: Ctx, again: () => void): HTMLElement {
  const ws = ctx.s.ws(ctx.user.id);
  const projects = ws.projects({ trashed: true });
  // Videos trashed on their own (their Project is not in the Trash).
  const videos = ws
    .videos({ trashed: true })
    .filter((v) => !ws.project(v.projectId)?.trashedAt);
  const row = (
    label: string,
    sub: string,
    attrs: Record<string, string>,
    back: () => Promise<boolean>,
    forever: () => Promise<void>,
  ) =>
    h(
      'article',
      { class: 'card rda-trash-row', ...attrs },
      h('h3', { text: label }),
      h('p', { class: 'muted', text: sub }),
      h(
        'div',
        { class: 'actions' },
        h('button', {
          type: 'button',
          class: 'button sm primary',
          'data-act': 'restore',
          text: t('rda.restore'),
          onclick: async () => {
            if (await back()) again();
          },
        }),
        h('button', {
          type: 'button',
          class: 'button sm',
          'data-act': 'forever',
          text: t('rda.deleteForever'),
          onclick: async () => {
            await forever();
            again();
          },
        }),
      ),
    );
  const loc = ctx.prefs().locale;
  return h(
    'section',
    { class: 'rda-trash', id: 'rda-trash' },
    h('p', {
      class: 'muted',
      id: 'trash-note',
      text: t('rda.trashHint', { n: rules(ctx).trashDays }),
    }),
    projects.length || videos.length ? null : empty(t('rda.trashEmpty')),
    projects.length
      ? h(
          'div',
          null,
          h('h2', { text: t('rda.trashProjects') }),
          h(
            'div',
            { class: 'grid' },
            projects.map((p) =>
              row(
                p.name,
                `${videoCount(ws.doc().videos.filter((v) => v.projectId === p.id).length)} · ${when(p.trashedAt!, loc)}`,
                { 'data-trash-project': p.id },
                () => restore(ctx, { kind: 'project', id: p.id }),
                () => purgeProject(ctx, p.id),
              ),
            ),
          ),
        )
      : null,
    videos.length
      ? h(
          'div',
          null,
          h('h2', { text: t('rda.trashVideos') }),
          h(
            'div',
            { class: 'grid' },
            videos.map((v) =>
              row(
                v.name,
                `${t('rda.inProject', { name: ws.project(v.projectId)?.name ?? '' })} · ${when(v.trashedAt!, loc)}`,
                { 'data-trash-video': v.id },
                () =>
                  restore(ctx, {
                    kind: 'video',
                    id: v.id,
                    projectId: v.projectId,
                  }),
                () => purgeVideo(ctx, v.id),
              ),
            ),
          ),
        )
      : null,
  );
}

/** `#/projects` (and `#/projects/trash`, `?new=1` for the dialog). */
export const projectsScreen: Screen = async (ctx, [view = ''], out) => {
  let q = '';
  const host = h('div', { class: 'ws-notices', id: 'projects-notices' });
  const list = h('div', { class: 'grid', id: 'project-list' });
  let thumbs = new Map<string, ProjectSummary>();
  const paint = () => {
    const ws = ctx.s.ws(ctx.user.id);
    ws.reload();
    if (view === 'trash') {
      clear(list, trashView(ctx, paint));
      return;
    }
    const shown = ws
      .projects()
      .filter((p) => !q || p.name.toLowerCase().includes(q));
    clear(
      list,
      ...(shown.length
        ? shown.map((p) => projectCard(ctx, p, thumbs, paint))
        : [
            h(
              'div',
              { class: 'empty-state rda-empty' },
              icon('projects', 28),
              h('p', { text: q ? t('styles.empty') : t('rda.empty') }),
            ),
          ]),
    );
  };
  const tab = (key: Key, v: string) =>
    h('a', {
      class: 'chip',
      href: v ? `#/projects/${v}` : '#/projects',
      'data-view': v || 'all',
      'aria-pressed': String(view === v),
      text: t(key),
    });
  put(
    out,
    h(
      'div',
      { class: 'rda-head' },
      h(
        'div',
        null,
        h('h1', { text: t('rda.projects') }),
        h('p', { class: 'muted', text: t('rda.projectsSub') }),
      ),
      h(
        'a',
        {
          class: 'button primary rda-new',
          id: 'new-project',
          href: `#/${NEW_PROJECT_ROUTE}`,
        },
        icon('plus', 18),
        h('span', { text: t('rda.newProject') }),
      ),
    ),
    host,
    h(
      'div',
      { class: 'filters' },
      view === 'trash'
        ? null
        : h('input', {
            type: 'search',
            id: 'project-search',
            placeholder: t('common.search'),
            'aria-label': t('common.search'),
            oninput: (e: Event) => {
              q = (e.target as HTMLInputElement).value.trim().toLowerCase();
              paint();
            },
          }),
      tab('rda.all', ''),
      tab('rda.trash', 'trash'),
    ),
    list,
  );
  thumbs = await syncWorkspace(ctx);
  paint();
  if (dialogWanted()) {
    // On <body> (the page itself animates in), and gone on any navigation:
    // Back closes it.
    document.querySelector('.np-dialog')?.remove();
    const dlg = newProjectDialog(ctx, () => {
      sessionStorage.removeItem(DRAFT);
      location.replace('#/projects');
    });
    document.body.append(dlg);
    window.addEventListener('hashchange', () => dlg.remove(), { once: true });
  }
};

// ---- the Project page ------------------------------------------------------

type Tab = 'videos' | 'style' | 'assets' | 'memory';
const TABS: Tab[] = ['videos', 'style', 'assets', 'memory'];

function videoCard(
  ctx: Ctx,
  v: WsVideo,
  n: number,
  thumbs: Map<string, ProjectSummary>,
  again: () => void,
): HTMLElement {
  const ws = ctx.s.ws(ctx.user.id);
  const nameEl = h('h3', { text: v.name });
  const href = videoHref(ctx, v);
  const toEditor = (e: Event) => {
    if ((e as MouseEvent).button) return;
    leaveForEditor(v);
  };
  const exportsBox = h('div', { class: 'rda-exports', hidden: true });
  const showExports = () => {
    let rows: { at: string; kind: string; projectId?: string }[] = [];
    try {
      rows = (
        JSON.parse(
          localStorage.getItem(EXPORTS_KEY(ctx.user.id)) ?? '[]',
        ) as typeof rows
      ).filter((r) => r.projectId === v.id);
    } catch {
      rows = [];
    }
    exportsBox.hidden = false;
    clear(
      exportsBox,
      h('strong', { text: t('rda.exportsTitle', { name: v.name }) }),
      rows.length
        ? h(
            'ul',
            { class: 'list' },
            rows
              .slice()
              .reverse()
              .map((r) =>
                h('li', {
                  text: `${when(r.at, ctx.prefs().locale)} · ${r.kind.toUpperCase()}`,
                }),
              ),
          )
        : h('p', { class: 'muted', text: t('rda.exportsEmpty') }),
    );
  };
  return h(
    'article',
    {
      class: 'card film glow rda-video',
      'data-video': v.id,
      'data-origin': v.origin,
      'data-stage': v.stage,
    },
    h(
      'a',
      {
        class: 'ws-thumb',
        href,
        'aria-label': v.name,
        onclick: href.startsWith('/') ? toEditor : undefined,
      },
      thumbOf(thumbs.get(v.id)),
      h('span', { class: 'rda-num', text: String(n) }),
      stageChip(v),
    ),
    h(
      'div',
      { class: 'film-body' },
      h('p', { class: 'eyebrow', text: t('rda.number', { n }) }),
      nameEl,
      h(
        'div',
        { class: 'actions' },
        h('a', {
          class: 'button sm primary',
          href,
          'data-act': 'open',
          text: t('rda.open'),
          onclick: href.startsWith('/') ? toEditor : undefined,
        }),
        menu(t('rda.more'), [
          h('a', {
            class: 'button sm',
            role: 'menuitem',
            href: editorHref(v.id),
            'data-act': 'editor',
            text: t('rda.openEditor'),
            onclick: toEditor,
          }),
          menuButton('rda.rename', 'rename', () =>
            renameInPlace(nameEl, v.name, async (name) => {
              await ctx.s.projects.rename(v.id, name).catch(() => undefined);
              ws.renameVideo(v.id, name);
              again();
            }),
          ),
          menuButton('rda.duplicate', 'duplicate', async () => {
            const name = cleanName(t('rda.copy', { name: v.name }));
            const id = await ctx.s.projects
              .duplicate(v.id, name)
              .catch(() => null);
            if (!id) return void ctx.toast(t('rda.failed'), 'error');
            const no = await ctx.s.claim(ctx.user.id, {
              kind: 'video',
              id,
              projectId: v.projectId,
            });
            if (no) {
              await ctx.s.projects.remove(id).catch(() => undefined);
              return void ctx.toast(no, 'error');
            }
            ws.addVideo({
              id,
              projectId: v.projectId,
              name,
              origin: v.origin,
              aspect: v.aspect,
              stage: v.stage === 'assets' ? 'brief' : v.stage,
            });
            again();
          }),
          menuButton('rda.exports', 'exports', showExports),
          menuButton('rda.delete', 'delete', async () => {
            ws.trashVideo(v.id);
            await ctx.s.changeWs(ctx.user.id, {
              kind: 'video',
              id: v.id,
              projectId: v.projectId,
              to: 'trash',
            });
            ctx.toast(t('rda.deletedVideo', { name: v.name }));
            again();
          }),
        ]),
      ),
      exportsBox,
    ),
  );
}

function styleSummary(ctx: Ctx, p: WsProject): string {
  const s = p.style;
  if (s.source === 'empty') return t('rda.styleEmpty');
  const fonts = [s.look.headingFont, s.look.bodyFont]
    .filter(Boolean)
    .join(' / ');
  const parts = [
    s.source === 'ready-made'
      ? t('rda.styleFrom.ready-made', {
          name: ctx.say(
            ctx.s.config.styles.find((x) => x.id === p.templateId)?.name,
          ),
        })
      : t(`rda.styleFrom.${s.source}` as Key),
    fonts,
    s.voice,
  ].filter(Boolean);
  return parts.join(' · ');
}

function styleTab(ctx: Ctx, p: WsProject, again: () => void): HTMLElement {
  const ws = ctx.s.ws(ctx.user.id);
  const vids = ws.videosOf(p.id);
  let target = ''; // '' = the whole project, else a Video id
  const form = h('form', { class: 'rda-style-form', id: 'rda-style-form' });
  const note = h('p', { class: 'ok-state', role: 'status', id: 'style-note' });
  const fieldsOf = (): StyleFields =>
    target
      ? ws.effectiveStyle(target)!
      : {
          look: { ...p.style.look },
          graphics: p.style.graphics,
          voice: p.style.voice,
          music: p.style.music,
          scriptRules: p.style.scriptRules,
        };
  const paint = () => {
    const f = fieldsOf();
    const palette = [...f.look.palette];
    const swatches = h('div', { class: 'rda-palette', id: 'rda-palette' });
    const paintPalette = () =>
      clear(
        swatches,
        ...palette.map((c, i) =>
          h(
            'span',
            { class: 'rda-colour' },
            h('input', {
              type: 'color',
              value: c,
              'aria-label': `${t('rda.palette')} ${i + 1}`,
              oninput: (e: Event) =>
                (palette[i] = (e.target as HTMLInputElement).value),
            }),
            h('button', {
              type: 'button',
              class: 'button sm ghost',
              'aria-label': t('rda.removeColour', { n: i + 1 }),
              text: '×',
              onclick: () => {
                palette.splice(i, 1);
                paintPalette();
              },
            }),
          ),
        ),
        palette.length < 8
          ? h('button', {
              type: 'button',
              class: 'button sm',
              id: 'rda-add-colour',
              text: t('rda.addColour'),
              onclick: () => {
                palette.push('#7c5cff');
                paintPalette();
              },
            })
          : null,
      );
    paintPalette();
    const input = (id: string, key: Key, value: string, long = false) => [
      h('label', { for: id, class: 'field-label', text: t(key) }),
      long
        ? h('textarea', { id, rows: 3, maxlength: 2000, value })
        : h('input', { id, type: 'text', maxlength: 200, value }),
    ];
    const v = target ? ws.video(target) : undefined;
    clear(
      form,
      h('label', {
        for: 'rda-apply',
        class: 'field-label',
        text: t('rda.applyTo'),
      }),
      h(
        'select',
        {
          id: 'rda-apply',
          onchange: (e: Event) => {
            target = (e.target as HTMLSelectElement).value;
            paint();
          },
        },
        h('option', { value: '', text: t('rda.wholeProject') }),
        ...vids.map((x, i) =>
          h('option', {
            value: x.id,
            text: `${t('rda.number', { n: i + 1 })}: ${x.name}`,
            ...(x.id === target ? { selected: true } : {}),
          }),
        ),
      ),
      p.style.source === 'empty' && !target
        ? h('p', { class: 'muted', text: t('rda.styleEmpty') })
        : null,
      h('h3', { text: t('rda.look') }),
      h('span', { class: 'field-label', text: t('rda.palette') }),
      swatches,
      ...input('rda-heading', 'rda.headingFont', f.look.headingFont),
      ...input('rda-body', 'rda.bodyFont', f.look.bodyFont),
      ...input('rda-caption', 'rda.captionStyle', f.look.captionStyle),
      ...input('rda-graphics', 'rda.graphics', f.graphics, true),
      ...input('rda-voice', 'rda.voice', f.voice),
      ...input('rda-music', 'rda.music', f.music),
      ...input('rda-rules', 'rda.scriptRules', f.scriptRules, true),
      h(
        'div',
        { class: 'actions' },
        h('button', {
          type: 'submit',
          class: 'button primary',
          id: 'rda-style-save',
          text: t('rda.saveStyle'),
        }),
        v?.override
          ? h('button', {
              type: 'button',
              class: 'button',
              id: 'rda-promote',
              text: t('rda.promote'),
              onclick: () => {
                ws.promoteOverride(v.id);
                ctx.toast(t('rda.promoted'));
                again();
              },
            })
          : null,
      ),
      v?.override
        ? h('p', { class: 'muted', text: t('rda.hasOverride') })
        : null,
      note,
    );
    form.onsubmit = (e) => {
      e.preventDefault();
      const val = (id: string) =>
        (form.querySelector<HTMLInputElement>(`#${id}`)?.value ?? '').trim();
      const next: StyleFields = {
        look: {
          palette: palette.filter((c) => /^#[0-9a-f]{6}$/i.test(c)),
          headingFont: val('rda-heading'),
          bodyFont: val('rda-body'),
          captionStyle: val('rda-caption'),
        },
        graphics: val('rda-graphics'),
        voice: val('rda-voice'),
        music: val('rda-music'),
        scriptRules: val('rda-rules'),
      };
      if (target) {
        ws.setVideoOverride(target, next);
        note.textContent = t('rda.overrideSaved');
      } else {
        ws.setProjectStyle(p.id, next);
        note.textContent = t('rda.styleSaved');
        // The summary under the title follows at once.
        const line = document.getElementById('project-style-line');
        if (line) line.textContent = styleSummary(ctx, ws.project(p.id)!);
      }
      paint();
      note.textContent = target ? t('rda.overrideSaved') : t('rda.styleSaved');
    };
  };
  paint();
  const examples = h(
    'section',
    { class: 'rda-examples', id: 'rda-examples' },
    h('h3', { text: t('rda.examples') }),
    h('p', { class: 'muted', text: t('rda.examplesHelp') }),
    vids.length
      ? h(
          'ul',
          { class: 'list' },
          vids.map((v, i) =>
            h(
              'li',
              null,
              h(
                'label',
                { class: 'choice' },
                h('input', {
                  type: 'checkbox',
                  'data-example': v.id,
                  checked: ws.project(p.id)!.style.examples.includes(v.id),
                  onchange: (e: Event) =>
                    ws.setExample(
                      p.id,
                      v.id,
                      (e.target as HTMLInputElement).checked,
                    ),
                }),
                h('span', {
                  text: `${t('rda.number', { n: i + 1 })}: ${v.name}`,
                }),
              ),
            ),
          ),
        )
      : empty(t('rda.noVideos')),
  );
  return h('div', { class: 'rda-style' }, form, examples);
}

function assetsTab(ctx: Ctx, p: WsProject): HTMLElement {
  const ws = ctx.s.ws(ctx.user.id);
  const vids = ws.videosOf(p.id);
  const all = ctx.s.assets(ctx.user.id).filter((a) => !a.trashedAt);
  const groups = vids
    .map((v, i) => ({
      v,
      n: i + 1,
      items: all.filter((a) => a.projectId === v.id),
    }))
    .filter((g) => g.items.length);
  if (!groups.length) return empty(t('rda.assetsEmpty'));
  return h(
    'div',
    { class: 'rda-assets', id: 'rda-assets' },
    groups.map((g) =>
      h(
        'section',
        { class: 'rda-asset-group', 'data-asset-video': g.v.id },
        h(
          'div',
          { class: 'section-head' },
          h('h3', { text: `${t('rda.number', { n: g.n })}: ${g.v.name}` }),
          h('a', {
            class: 'button sm',
            href: `#/assets/v/${enc(g.v.id)}`,
            text: t('rda.openLibrary'),
          }),
        ),
        h(
          'div',
          { class: 'grid' },
          g.items.map((a) =>
            h(
              'article',
              { class: 'card', 'data-asset': a.id, 'data-kind': a.kind },
              h('h3', { text: a.name }),
              assetView(a),
            ),
          ),
        ),
      ),
    ),
  );
}

/** `#/project/<id>[/<tab>]`: one Project. A Video id opens its Project. */
export const projectScreen: Screen = async (
  ctx,
  [id = '', tabArg = ''],
  out,
) => {
  const thumbs = await syncWorkspace(ctx);
  const ws = ctx.s.ws(ctx.user.id);
  const asVideo = ws.video(id);
  if (asVideo && !ws.project(id)) {
    // A Video's address (an old memory link): its Project, same tab.
    location.replace(
      `#/project/${enc(asVideo.projectId)}${tabArg ? `/${tabArg}` : '/memory'}`,
    );
    return;
  }
  const p = ws.project(id);
  const back = h('a', {
    class: 'back-link',
    href: '#/projects',
    text: t('rda.backProjects'),
  });
  if (!p) {
    put(
      out,
      back,
      h('p', {
        class: 'error-state',
        role: 'alert',
        text: t('rda.projectGone'),
      }),
    );
    return;
  }
  if (p.trashedAt) {
    put(
      out,
      back,
      h('h1', { text: p.name }),
      h(
        'div',
        { class: 'error-state', role: 'alert', id: 'project-trashed' },
        h('span', { text: `${t('rda.projectTrashed')} ` }),
        h('button', {
          type: 'button',
          class: 'button sm primary',
          id: 'project-restore',
          text: t('rda.restore'),
          onclick: async () => {
            if (await restore(ctx, { kind: 'project', id: p.id }))
              location.reload();
          },
        }),
      ),
    );
    return;
  }
  const tab: Tab = (TABS as string[]).includes(tabArg)
    ? (tabArg as Tab)
    : 'videos';
  const again = () => {
    clear(out);
    void projectScreen(ctx, [id, tab], out);
  };
  const title = h('h1', { id: 'project-title', text: p.name });
  const notes = h('div', { class: 'ws-notices', id: 'video-notices' });
  const newVideo = async (how: 'style' | 'editor') => {
    const vid = await startVideo(ctx, p.id, how, notes);
    if (vid) go(ctx, vid);
  };
  const vids = ws.videosOf(p.id);
  const body = h('div', { class: 'rda-tab-body', id: `tab-${tab}` });
  if (tab === 'videos')
    put(
      body,
      h(
        'div',
        { class: 'rda-new-video', id: 'rda-new-video' },
        h('h2', { text: t('rda.newVideo') }),
        h(
          'div',
          { class: 'np-options' },
          h(
            'button',
            {
              type: 'button',
              class: 'np-option glow',
              'data-new-video': 'style',
              onclick: () => void newVideo('style'),
            },
            h('span', { class: 'np-option-ico' }, icon('director', 22)),
            h('strong', { text: t('rda.newVideoStyle') }),
            h('span', { class: 'muted', text: t('rda.newVideoStyleHelp') }),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'np-option glow',
              'data-new-video': 'editor',
              onclick: () => void newVideo('editor'),
            },
            h('span', { class: 'np-option-ico' }, icon('projects', 22)),
            h('strong', { text: t('rda.newVideoEditor') }),
            h('span', { class: 'muted', text: t('rda.newVideoEditorHelp') }),
          ),
        ),
        notes,
      ),
      vids.length
        ? h(
            'div',
            { class: 'grid rda-series', id: 'video-list' },
            vids.map((v, i) => videoCard(ctx, v, i + 1, thumbs, again)),
          )
        : h(
            'div',
            { class: 'empty-state rda-empty', id: 'video-list' },
            icon('projects', 28),
            h('p', { text: t('rda.noVideos') }),
          ),
    );
  else if (tab === 'style') body.append(styleTab(ctx, p, again));
  else if (tab === 'assets') body.append(assetsTab(ctx, p));
  else await memoryPanel(ctx, p.id, body);
  put(
    out,
    back,
    h(
      'div',
      { class: 'rda-head' },
      h(
        'div',
        null,
        h(
          'div',
          { class: 'rda-title-row' },
          title,
          originTag(ctx, p),
          h('button', {
            type: 'button',
            class: 'button sm ghost',
            id: 'project-rename',
            text: t('rda.rename'),
            onclick: () =>
              renameInPlace(title, p.name, (n) => {
                ws.renameProject(p.id, n);
                again();
              }),
          }),
        ),
        h('p', {
          class: 'muted',
          id: 'project-style-line',
          text: styleSummary(ctx, p),
        }),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'button primary rda-new',
          id: 'project-new-video',
          onclick: () => {
            if (tab !== 'videos') location.hash = `#/project/${enc(p.id)}`;
            else
              document
                .getElementById('rda-new-video')
                ?.scrollIntoView({ block: 'center' });
          },
        },
        icon('plus', 18),
        h('span', { text: t('rda.newVideo') }),
      ),
    ),
    h(
      'nav',
      { class: 'tabs rda-tabs', role: 'tablist', 'aria-label': p.name },
      TABS.map((x) =>
        h('a', {
          class: 'tab',
          role: 'tab',
          href: `#/project/${enc(p.id)}${x === 'videos' ? '' : `/${x}`}`,
          'data-tab': x,
          'aria-selected': String(x === tab),
          text: t(`rda.tab.${x}` as Key),
        }),
      ),
    ),
    body,
  );
};

/** For the Director flow and the Home Director box: a new Project + Video. */
export async function newDirectorVideo(
  ctx: Ctx,
  host?: HTMLElement,
): Promise<string | null> {
  const made = await startProject(ctx, 'director', host ? { host } : {});
  return made?.videoId ?? null;
}
