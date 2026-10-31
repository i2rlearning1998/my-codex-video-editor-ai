// FX10: "Import Templates from your Cloud" (My Templates) and "Import AI
// templates from your AI libraries" (AI). The panels list only the open
// project's items; this dialog lists what the user saved in other projects,
// grouped by project, with search and many-at-once choice. Choosing copies
// the items into the open project, so a project never carries more than it
// uses. Until accounts exist the lists come from this browser.
import { t } from '../i18n';
import { escapeHtml, openModal } from './components/modal';

export interface ImportItem {
  readonly id: string;
  readonly name: string;
  /** A small picture (a data URL), when there is one. */
  readonly thumb?: string;
  /** A short second line (the kind). */
  readonly detail?: string;
}
export interface ImportGroup {
  readonly id: string;
  readonly name: string;
  readonly items: readonly ImportItem[];
}
export interface ImportDialogOptions {
  /** Prefix of the `data-role` names (`mine` or `ai`). */
  readonly role: string;
  readonly title: string;
  readonly intro: string;
  readonly groups: () =>
    Promise<readonly ImportGroup[]> | readonly ImportGroup[];
  /** Copies the chosen items into the open project; resolves with the count. */
  readonly importItems: (ids: readonly string[]) => Promise<number>;
  readonly done: (count: number) => void;
  readonly report: (error: unknown) => void;
}

export function openLibraryImportDialog(options: ImportDialogOptions) {
  const handle = openModal({
    titleText: escapeHtml(options.title),
    bodyHtml: `<p class="import-intro">${escapeHtml(options.intro)}</p>
      <input type="search" class="import-search" data-role="${options.role}-import-search" aria-label="${escapeHtml(t('importLib.search'))}" placeholder="${escapeHtml(t('importLib.search'))}" />
      <div class="import-groups" data-role="${options.role}-import-groups"></div>
      <div class="import-footer">
        <button type="button" class="button" data-role="${options.role}-import-cancel">${escapeHtml(t('action.cancel'))}</button>
        <button type="button" class="button primary" data-role="${options.role}-import-confirm" disabled></button>
      </div>`,
  });
  handle.root.classList.add('import-dialog');
  const root = handle.root;
  const host = root.querySelector<HTMLElement>('.import-groups')!;
  const search = root.querySelector<HTMLInputElement>('.import-search')!;
  const confirm = root.querySelector<HTMLButtonElement>(
    `[data-role="${options.role}-import-confirm"]`,
  )!;
  root.querySelector<HTMLButtonElement>(
    `[data-role="${options.role}-import-cancel"]`,
  )!.onclick = () => handle.close();
  const chosen = new Set<string>();
  let groups: readonly ImportGroup[] = [];
  const refreshConfirm = () => {
    confirm.disabled = !chosen.size;
    confirm.textContent = t('importLib.confirm', {
      count: String(chosen.size),
    });
  };
  const render = () => {
    const needle = search.value.trim().toLowerCase();
    host.replaceChildren();
    let shown = 0;
    for (const group of groups) {
      const items = group.items.filter(
        (item) => !needle || item.name.toLowerCase().includes(needle),
      );
      if (!items.length) continue;
      shown += items.length;
      const section = document.createElement('section');
      section.className = 'import-group';
      section.dataset.group = group.id;
      const head = document.createElement('header');
      head.className = 'import-group-head';
      const title = document.createElement('strong');
      title.textContent = group.name;
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'button import-all';
      all.dataset.role = `${options.role}-import-all`;
      all.textContent = t('importLib.selectAll');
      all.onclick = () => {
        const every = items.every((item) => chosen.has(item.id));
        for (const item of items)
          if (every) chosen.delete(item.id);
          else chosen.add(item.id);
        render();
        refreshConfirm();
      };
      head.append(title, all);
      const list = document.createElement('div');
      list.className = 'import-list';
      for (const item of items) {
        const row = document.createElement('label');
        row.className = 'import-row';
        row.dataset.itemId = item.id;
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = chosen.has(item.id);
        box.onchange = () => {
          if (box.checked) chosen.add(item.id);
          else chosen.delete(item.id);
          refreshConfirm();
        };
        const picture = item.thumb
          ? Object.assign(document.createElement('img'), {
              src: item.thumb,
              alt: '',
              className: 'import-thumb',
            })
          : Object.assign(document.createElement('span'), {
              className: 'import-thumb import-thumb-empty',
            });
        const text = document.createElement('span');
        text.className = 'import-text';
        const name = document.createElement('strong');
        name.textContent = item.name;
        text.append(name);
        if (item.detail) {
          const detail = document.createElement('small');
          detail.textContent = item.detail;
          text.append(detail);
        }
        row.append(box, picture, text);
        list.append(row);
      }
      section.append(head, list);
      host.append(section);
    }
    if (!shown) {
      const empty = document.createElement('p');
      empty.className = 'import-empty';
      empty.textContent = t(
        groups.length ? 'importLib.noMatch' : 'importLib.empty',
      );
      host.append(empty);
    }
  };
  search.oninput = render;
  confirm.onclick = () => {
    confirm.disabled = true;
    void options
      .importItems([...chosen])
      .then((count) => {
        handle.close();
        options.done(count);
      })
      .catch((error: unknown) => {
        refreshConfirm();
        options.report(error);
      });
  };
  refreshConfirm();
  void Promise.resolve(options.groups()).then((value) => {
    groups = value;
    render();
  }, options.report);
  return handle;
}
