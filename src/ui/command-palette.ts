import {
  commands,
  runCommand,
  type CommandContext,
} from '../commands/registry';
import { subscribe, t } from '../i18n';
import { temporaryOverlay } from './temporary-overlay';

export function fuzzyMatch(label: string, query: string): boolean {
  let index = 0;
  const letters = [...query.toLocaleLowerCase().replace(/\s/g, '')];
  for (const letter of label.toLocaleLowerCase())
    if (letter === letters[index]) index++;
  return index === letters.length;
}
export function mountCommandPalette(
  context: CommandContext,
  report: (error: unknown) => void,
) {
  // Intentionally unstyled temporary markup pending Claude's shell replacement.
  const overlay = temporaryOverlay('command-palette', () => t('palette.title'));
  const input = document.createElement('input');
  const list = document.createElement('div');
  list.setAttribute('role', 'listbox');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-controls', 'palette-results');
  input.setAttribute('aria-expanded', 'true');
  list.id = 'palette-results';
  overlay.element.append(input, list);
  let selected = 0;
  let matches = [...commands];
  const execute = (id: string) => {
    overlay.close();
    try {
      runCommand(id, context);
    } catch (error) {
      report(error);
    }
  };
  const render = () => {
    input.setAttribute('aria-label', t('palette.search'));
    matches = commands.filter((command) =>
      fuzzyMatch(t(command.labelKey), input.value),
    );
    selected = Math.max(0, Math.min(selected, matches.length - 1));
    list.replaceChildren();
    for (const [index, command] of matches.entries()) {
      const button = document.createElement('button');
      button.id = `palette-${command.id}`;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === selected));
      button.disabled = !command.isEnabled(context);
      button.textContent = `${t(command.labelKey)} ${command.shortcut}`;
      button.onclick = () => execute(command.id);
      list.append(button);
    }
    if (!matches.length) list.textContent = t('palette.empty');
    if (matches[selected])
      input.setAttribute(
        'aria-activedescendant',
        `palette-${matches[selected]!.id}`,
      );
    else input.removeAttribute('aria-activedescendant');
  };
  input.oninput = () => {
    selected = 0;
    render();
  };
  input.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const command = matches[selected];
      if (command?.isEnabled(context)) execute(command.id);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      selected =
        (selected + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) %
        (matches.length || 1);
      render();
    }
  };
  const unsubscribe = subscribe(render);
  return {
    open() {
      input.value = '';
      selected = 0;
      render();
      overlay.open();
      input.focus();
    },
    close: overlay.close,
    dispose() {
      unsubscribe();
      overlay.dispose();
    },
  };
}
