// T1: the Theme panel (left rail Theme category and the right panel's Theme
// tab). One click applies a theme in one undo step; "Also override manual
// colors" recolours layers the user coloured by hand too. R6: one list, My
// themes (the theme library), with Rename and Delete in a "⋯" menu; Save
// current as theme needs a name that is not used yet. Creator Pack themes are
// in the AI category.
import { t } from '../i18n';
import { createMenu } from './context-menu';
import { iconSvg } from './icons';
import type { Theme } from '../themes/themes';

export interface ThemePanelOptions {
  /** Built-in, project and library themes, in that order. */
  readonly themes: () => {
    builtIn: readonly Theme[];
    saved: readonly Theme[];
    library: readonly Theme[];
  };
  readonly current: () => string | null;
  readonly apply: (theme: Theme, override: boolean) => void;
  readonly save: (name: string) => void;
  readonly rename: (id: string, name: string) => void;
  readonly remove: (id: string) => void;
  readonly onChange: (listener: () => void) => () => void;
}

/** A small preview: the background, the slots as bars, "Aa" in the fonts. */
function preview(theme: Theme): HTMLElement {
  const box = document.createElement('span');
  box.className = 'theme-preview';
  box.style.background = theme.palette.background;
  const sample = document.createElement('span');
  sample.className = 'theme-sample';
  sample.textContent = 'Aa';
  sample.style.color = theme.palette.text;
  sample.style.fontFamily = theme.fonts.heading;
  const bars = document.createElement('span');
  bars.className = 'theme-bars';
  for (const color of [
    theme.palette.primary,
    theme.palette.accent,
    theme.palette.extra,
  ]) {
    if (!color) continue;
    const bar = document.createElement('i');
    bar.style.background = color;
    bars.append(bar);
  }
  box.append(sample, bars);
  return box;
}

export function mountThemePanel(host: HTMLElement, options: ThemePanelOptions) {
  let override = false;
  let draft = '';
  const prefix = host.id || 'theme';
  const menuElement = document.createElement('div');
  menuElement.className = 'media-menu theme-menu';
  menuElement.id = `${prefix}-menu`;
  menuElement.hidden = true;
  document.getElementById(menuElement.id)?.remove();
  document.body.append(menuElement);
  const menu = createMenu(menuElement, { report: () => undefined });
  const closeOutside = (event: PointerEvent) => {
    if (!menuElement.hidden && !menuElement.contains(event.target as Node))
      menu.close();
  };
  document.addEventListener('pointerdown', closeOutside, true);
  const taken = (name: string, except?: string) => {
    const { builtIn, saved } = options.themes();
    const key = name.trim().toLowerCase();
    return [...builtIn, ...saved].some(
      (theme) => theme.id !== except && theme.name.trim().toLowerCase() === key,
    );
  };
  /** Rename in place; Enter or leaving commits once. */
  const renameField = (card: HTMLElement, theme: Theme) => {
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'theme-rename-field';
    field.value = theme.name;
    field.maxLength = 40;
    field.setAttribute('aria-label', t('theme.rename'));
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      field.onblur = null;
      const value = field.value.trim();
      if (commit && value && value !== theme.name) {
        if (taken(value, theme.id)) {
          done = false;
          field.setCustomValidity(t('theme.nameTaken'));
          field.reportValidity();
          return;
        }
        options.rename(theme.id, value);
      } else render();
    };
    field.onkeydown = (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') finish(true);
      if (event.key === 'Escape') finish(false);
    };
    field.oninput = () => field.setCustomValidity('');
    field.onblur = () => finish(true);
    card.querySelector('.theme-name')?.replaceWith(field);
    field.focus();
    field.select();
  };
  const render = () => {
    const { builtIn, saved } = options.themes();
    const current = options.current();
    const title = document.createElement('h2');
    title.className = 'theme-title';
    title.textContent = t('theme.panel');
    const now = [...builtIn, ...saved].find((item) => item.id === current);
    const line = document.createElement('p');
    line.className = 'theme-current';
    line.textContent = now
      ? t('theme.current', { name: now.name })
      : t('theme.none');
    const overrideLabel = document.createElement('label');
    overrideLabel.className = 'theme-override';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = `${prefix}-override`;
    box.checked = override;
    box.onchange = () => (override = box.checked);
    overrideLabel.append(box, document.createTextNode(t('theme.override')));
    const group = (
      kind: 'builtin' | 'saved',
      heading: string,
      items: readonly Theme[],
    ) => {
      const section = document.createElement('section');
      section.className = 'theme-group';
      section.dataset.group = kind;
      const h = document.createElement('h3');
      h.textContent = heading;
      const grid = document.createElement('div');
      grid.className = 'theme-grid';
      for (const theme of items) {
        const card = document.createElement('div');
        card.className = 'theme-card';
        card.dataset.themeId = theme.id;
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'theme-apply';
        apply.setAttribute('aria-pressed', String(theme.id === current));
        apply.title = t('theme.applyTip', { name: theme.name });
        const name = document.createElement('span');
        name.className = 'theme-name';
        name.textContent = theme.name;
        apply.append(preview(theme), name);
        apply.onclick = () => options.apply(theme, override);
        card.append(apply);
        if (kind === 'saved') {
          const more = document.createElement('button');
          more.type = 'button';
          more.className = 'icon-button theme-more';
          more.dataset.action = 'theme-more';
          more.setAttribute('aria-label', t('shelf.more'));
          more.setAttribute('aria-haspopup', 'menu');
          more.title = t('shelf.more');
          more.innerHTML = iconSvg('more', 16);
          more.onclick = (event) => {
            event.stopPropagation();
            menu.open(() => [
              {
                id: 'theme-rename',
                label: t('theme.rename'),
                icon: 'edit',
                run: () => renameField(card, theme),
              },
              {
                id: 'theme-delete',
                label: t('theme.delete'),
                icon: 'delete',
                divider: true,
                run: () => options.remove(theme.id),
              },
            ]);
            const box = more.getBoundingClientRect();
            menuElement.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - menuElement.offsetWidth - 8))}px`;
            menuElement.style.top = `${Math.max(8, Math.min(box.bottom + 4, window.innerHeight - menuElement.offsetHeight - 8))}px`;
          };
          card.append(more);
        }
        grid.append(card);
      }
      section.append(h, grid);
      return section;
    };
    const saveRow = document.createElement('div');
    saveRow.className = 'theme-save';
    const saveName = document.createElement('input');
    saveName.type = 'text';
    saveName.id = `${prefix}-save-name`;
    saveName.maxLength = 40;
    saveName.required = true;
    saveName.value = draft;
    saveName.placeholder = t('theme.saveName');
    saveName.setAttribute('aria-label', t('theme.saveName'));
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'button';
    save.id = `${prefix}-save`;
    save.textContent = t('theme.save');
    const message = document.createElement('p');
    message.className = 'theme-save-message';
    message.id = `${prefix}-save-message`;
    message.setAttribute('role', 'status');
    const sync = () => {
      const name = saveName.value.trim();
      const used = !!name && taken(name);
      save.disabled = !name || used;
      message.textContent = used ? t('theme.nameTaken') : '';
      message.hidden = !used;
      save.title = !name ? t('theme.nameRequired') : '';
    };
    saveName.oninput = () => {
      draft = saveName.value;
      sync();
    };
    saveName.onkeydown = (event) => {
      if (event.key === 'Enter' && !save.disabled) save.click();
    };
    save.onclick = () => {
      const name = saveName.value.trim();
      if (!name || taken(name)) return;
      draft = '';
      options.save(name);
    };
    sync();
    saveRow.append(saveName, save);
    host.replaceChildren(
      title,
      line,
      overrideLabel,
      group('builtin', t('theme.builtIn'), builtIn),
      group('saved', t('theme.mine'), saved),
      saveRow,
      message,
    );
  };
  const unsubscribe = options.onChange(render);
  render();
  return {
    render,
    dispose: () => {
      unsubscribe();
      document.removeEventListener('pointerdown', closeOutside, true);
      menu.close();
      menuElement.remove();
    },
  };
}
