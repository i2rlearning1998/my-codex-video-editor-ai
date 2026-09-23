import { commands } from '../commands/registry';
import { t, subscribe } from '../i18n';
import { temporaryOverlay } from './temporary-overlay';
export function mountShortcutSheet() {
  // Intentionally unstyled temporary markup pending Claude's shell replacement.
  const overlay = temporaryOverlay('shortcut-sheet', () =>
    t('shortcuts.title'),
  );
  const render = () => {
    overlay.element.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = t('shortcuts.title');
    overlay.element.append(heading);
    for (const command of commands) {
      const row = document.createElement('p');
      row.textContent = `${t(command.labelKey)}: ${command.shortcut || t('shortcuts.none')}`;
      overlay.element.append(row);
    }
    const close = document.createElement('button');
    close.textContent = t('action.close');
    close.onclick = overlay.close;
    overlay.element.append(close);
  };
  const unsubscribe = subscribe(render);
  return {
    open() {
      render();
      overlay.open();
      overlay.element.querySelector('button')?.focus();
    },
    dispose() {
      unsubscribe();
      overlay.dispose();
    },
  };
}
