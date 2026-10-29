// PRJ-016, APP-006, APP-007: the Projects dialog. Most recently edited first;
// each row has a picture, the name, when it was edited, and Open, Rename,
// Duplicate and Delete. The open project cannot be deleted from here.
import { getLanguage, t } from '../i18n';
import type { ProjectSummary } from '../persistence/projects';
import {
  confirmDialog,
  escapeHtml,
  openModal,
  promptDialog,
} from './components/modal';

export interface ProjectsApi {
  list(): Promise<ProjectSummary[]>;
  currentId(): string;
  open(id: string): Promise<void>;
  rename(id: string, name: string): Promise<boolean>;
  duplicate(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export function openProjectsDialog(api: ProjectsApi): void {
  const handle = openModal({
    titleText: escapeHtml(t('projects.title')),
    bodyHtml: '<div class="projects-list" data-role="projects-list"></div>',
  });
  handle.root.classList.add('projects-dialog');
  const host = handle.root.querySelector<HTMLElement>('.projects-list')!;
  const render = async () => {
    const items = await api.list();
    host.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'projects-empty';
      empty.textContent = t('projects.empty');
      host.append(empty);
      return;
    }
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.dataset.projectId = item.id;
      const current = item.id === api.currentId();
      const when = new Date(item.updated).toLocaleString(getLanguage());
      row.innerHTML = `${
        item.thumb
          ? `<img class="project-thumb" alt="" src="${escapeHtml(item.thumb)}" />`
          : '<span class="project-thumb project-thumb-empty" aria-hidden="true"></span>'
      }<span class="project-info"><strong class="project-row-name">${escapeHtml(item.name)}</strong><span class="project-row-time">${escapeHtml(t('projects.edited', { time: when }))}${current ? ` · <em>${escapeHtml(t('projects.openNow'))}</em>` : ''}</span></span>`;
      const actions = document.createElement('span');
      actions.className = 'project-actions';
      const button = (
        role: string,
        label: string,
        run: () => Promise<void>,
      ) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'button';
        element.dataset.role = role;
        element.textContent = label;
        element.onclick = () => void run().then(render, render);
        actions.append(element);
        return element;
      };
      button('open', t('projects.open'), async () => {
        if (current) {
          handle.close();
          return;
        }
        if (
          await confirmDialog(t('project.openConfirm'), {
            titleText: t('project.openTitle'),
            confirmLabel: t('project.openTitle'),
            cancelLabel: t('action.cancel'),
          })
        ) {
          await api.open(item.id);
          handle.close();
        }
      });
      button('rename', t('projects.rename'), async () => {
        const name = await promptDialog(t('projects.rename'), item.name, {
          label: t('project.name'),
          confirmLabel: t('projects.rename'),
          cancelLabel: t('action.cancel'),
          maxLength: 256,
        });
        if (name) await api.rename(item.id, name);
      });
      button('duplicate', t('projects.duplicate'), () =>
        api.duplicate(item.id),
      );
      const remove = button('delete', t('projects.delete'), async () => {
        if (
          await confirmDialog(
            t('projects.deleteConfirm', { name: item.name }),
            {
              titleText: t('projects.delete'),
              confirmLabel: t('projects.delete'),
              cancelLabel: t('action.cancel'),
              danger: true,
            },
          )
        )
          await api.remove(item.id);
      });
      remove.classList.add('danger');
      if (current) {
        remove.disabled = true;
        remove.title = t('projects.deleteOpen');
      }
      row.append(actions);
      host.append(row);
    }
  };
  void render();
}
