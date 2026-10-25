// AUDIT-EDITOR (PRJ-016, APP-006 to APP-008): File › Projects lists every
// project kept in this browser, the most recent first, as cards with a
// poster, the name and when it was last edited. A card opens its project;
// Rename, Duplicate and Delete (with a confirmation) are on each card. The
// open project is marked and cannot be deleted while it is open.
import { formatDate, t } from '../i18n';
import type { ProjectSummary } from '../persistence/projects';
import { iconSvg } from './icons';
import {
  confirmDialog,
  escapeHtml,
  openModal,
  promptDialog,
} from './components/modal';

export interface ProjectsApi {
  list(): Promise<ProjectSummary[]>;
  currentId(): string | null;
  open(id: string): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  duplicate(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Opens the New project form. */
  create(): void;
}

const when = (iso: string) => {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return t('projects.justNow');
  if (minutes < 60) return t('projects.minutesAgo', { count: minutes });
  return formatDate(time, { dateStyle: 'medium', timeStyle: 'short' });
};

export function openProjectsDialog(
  api: ProjectsApi,
  report: (error: unknown) => void,
): void {
  let grid!: HTMLElement;
  const handle = openModal({
    titleText: t('projects.title'),
    bodyBuilder: (body) => {
      body.classList.add('projects-body');
      const bar = document.createElement('div');
      bar.className = 'projects-bar';
      const intro = document.createElement('p');
      intro.className = 'projects-intro';
      intro.textContent = t('projects.intro');
      const create = document.createElement('button');
      create.type = 'button';
      create.className = 'button primary';
      create.dataset.action = 'project-new';
      create.innerHTML = `${iconSvg('plus', 16)}<span></span>`;
      create.querySelector('span')!.textContent = t('project.new');
      create.onclick = () => {
        handle.close();
        api.create();
      };
      bar.append(intro, create);
      grid = document.createElement('div');
      grid.className = 'projects-grid';
      grid.setAttribute('role', 'list');
      body.append(bar, grid);
    },
  });
  handle.root.classList.add('projects-dialog');
  const action = (
    icon: string,
    label: string,
    name: string,
    run: () => Promise<void> | void,
    disabledReason?: string,
  ) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button';
    button.dataset.action = name;
    button.innerHTML = iconSvg(icon, 18);
    button.setAttribute('aria-label', disabledReason ?? label);
    button.title = disabledReason ?? label;
    if (disabledReason) button.disabled = true;
    button.onclick = (event) => {
      event.stopPropagation();
      void Promise.resolve()
        .then(run)
        .catch(report)
        .finally(() => void render());
    };
    return button;
  };
  const render = async () => {
    let projects: ProjectSummary[];
    try {
      projects = await api.list();
    } catch (error) {
      grid.replaceChildren();
      const failed = document.createElement('p');
      failed.className = 'projects-empty';
      failed.textContent = t('projects.loadFailed');
      grid.append(failed);
      report(error);
      return;
    }
    const current = api.currentId();
    grid.replaceChildren(
      ...projects.map((project) => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.setAttribute('role', 'listitem');
        card.dataset.projectId = project.id;
        if (project.id === current) card.dataset.current = 'true';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'project-open';
        open.dataset.action = 'project-open';
        open.setAttribute(
          'aria-label',
          t('projects.openNamed', { name: project.name }),
        );
        const thumb = document.createElement('div');
        thumb.className = 'project-thumb';
        if (project.thumbnail) {
          const image = document.createElement('img');
          image.alt = '';
          image.src = project.thumbnail;
          thumb.append(image);
        } else thumb.innerHTML = iconSvg('scenes', 28);
        const name = document.createElement('span');
        name.className = 'project-name';
        name.textContent = project.name;
        const meta = document.createElement('span');
        meta.className = 'project-meta';
        meta.textContent =
          project.id === current
            ? t('projects.openNow')
            : t('projects.edited', { when: when(project.updatedAt) });
        open.append(thumb, name, meta);
        open.onclick = () => {
          if (project.id === current) {
            handle.close();
            return;
          }
          handle.close();
          void api.open(project.id).catch(report);
        };
        const actions = document.createElement('div');
        actions.className = 'project-actions';
        actions.append(
          action('edit', t('projects.rename'), 'project-rename', async () => {
            const next = await promptDialog(
              t('projects.rename'),
              project.name,
              {
                label: t('project.name'),
                confirmLabel: t('projects.rename'),
                cancelLabel: t('action.cancel'),
                maxLength: 120,
              },
            );
            if (next !== null && next.trim())
              await api.rename(project.id, next);
          }),
          action(
            'duplicate',
            t('projects.duplicate'),
            'project-duplicate',
            () => api.duplicate(project.id),
          ),
          action(
            'delete',
            t('projects.delete'),
            'project-delete',
            async () => {
              if (
                await confirmDialog(
                  t('projects.deleteConfirm', {
                    name: escapeHtml(project.name),
                  }),
                  {
                    titleText: t('projects.delete'),
                    confirmLabel: t('projects.delete'),
                  },
                )
              )
                await api.remove(project.id);
            },
            project.id === current ? t('projects.deleteOpen') : undefined,
          ),
        );
        card.append(open, actions);
        return card;
      }),
    );
    if (!projects.length) {
      const empty = document.createElement('p');
      empty.className = 'projects-empty';
      empty.textContent = t('projects.empty');
      grid.append(empty);
    }
  };
  void render();
}
