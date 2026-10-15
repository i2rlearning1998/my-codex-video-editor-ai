// T1: the Theme panel (left rail Theme category and the right panel's Theme
// tab). One click applies a theme in one undo step; "Also override manual
// colors" recolours layers the user coloured by hand too. My themes: the
// project's saved themes (rename, delete) and Save current as theme; themes
// from Creator Packs are listed too.
import { t } from '../i18n';
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
  const prefix = host.id || 'theme';
  const render = () => {
    const { builtIn, saved, library } = options.themes();
    const current = options.current();
    const title = document.createElement('h2');
    title.className = 'theme-title';
    title.textContent = t('theme.panel');
    const now = [...builtIn, ...saved, ...library].find(
      (item) => item.id === current,
    );
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
      kind: 'builtin' | 'saved' | 'library',
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
          const rename = document.createElement('button');
          rename.type = 'button';
          rename.className = 'button theme-rename';
          rename.dataset.action = 'theme-rename';
          rename.textContent = t('theme.rename');
          rename.onclick = () => {
            const field = document.createElement('input');
            field.type = 'text';
            field.className = 'theme-rename-field';
            field.value = theme.name;
            field.maxLength = 40;
            field.setAttribute('aria-label', t('theme.rename'));
            const commit = () => {
              const value = field.value.trim();
              if (value && value !== theme.name)
                options.rename(theme.id, value);
              else render();
            };
            field.onkeydown = (event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') render();
            };
            field.onblur = commit;
            rename.replaceWith(field);
            field.focus();
            field.select();
          };
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'button theme-delete';
          remove.dataset.action = 'theme-delete';
          remove.textContent = t('theme.delete');
          remove.onclick = () => options.remove(theme.id);
          card.append(rename, remove);
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
    saveName.placeholder = t('theme.saveName');
    saveName.setAttribute('aria-label', t('theme.saveName'));
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'button';
    save.id = `${prefix}-save`;
    save.textContent = t('theme.save');
    save.disabled = !now;
    save.title = now ? '' : t('theme.saveNeedsTheme');
    save.onclick = () => {
      const name = saveName.value.trim() || `${now?.name ?? ''} copy`;
      options.save(name);
    };
    saveRow.append(saveName, save);
    host.replaceChildren(
      title,
      line,
      overrideLabel,
      group('builtin', t('theme.builtIn'), builtIn),
      group('saved', t('theme.mine'), saved),
      saveRow,
      ...(library.length
        ? [group('library', t('theme.fromPacks'), library)]
        : []),
    );
  };
  const unsubscribe = options.onChange(render);
  render();
  return { render, dispose: unsubscribe };
}
