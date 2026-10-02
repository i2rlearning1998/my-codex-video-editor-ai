// I1.3 and I1.4: adding a library item, by click (centred) or by drop (at
// the drop point), as one undo step. A template first asks where it goes:
// replace this scene, add onto it, or a new scene; the last choice is the
// default, Enter confirms and Escape cancels. A toast says what happened and
// offers Undo. While the dialog is open, further clicks are ignored, so rapid
// clicking never adds several scenes.
import type { EditorEngine } from '../core';
import { t } from '../i18n';
import type { LibraryItem } from '../library/schema';
import { openModal } from './components/modal';
import { showToast } from './components/toast';
import {
  itemName,
  libraryCommands,
  TEMPLATE_MODES,
  type TemplateMode,
} from './library-insert';
import type { EditorSession } from './session';

/** The drag type of a library card (never a file). */
export const LIBRARY_DRAG_TYPE = 'application/x-aive-library-item';
const MODE_KEY = 'aive.templateMode';

export function lastTemplateMode(): TemplateMode {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return (TEMPLATE_MODES as readonly string[]).includes(value ?? '')
      ? (value as TemplateMode)
      : 'new';
  } catch {
    return 'new';
  }
}
function rememberMode(mode: TemplateMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // The choice is only a convenience.
  }
}

export interface LibraryActions {
  /** Adds an item; `at` is a composition point (a drop). */
  insert(item: LibraryItem, at?: readonly [number, number]): void;
  /** The item a drag carries, by id. */
  find(id: string): LibraryItem | undefined;
  setItems(items: readonly LibraryItem[]): void;
}

export function createLibraryActions(options: {
  engine: EditorEngine;
  session: EditorSession;
  report: (error: unknown) => void;
  undo: () => void;
  /** Crossfades the canvas from what it shows now (editor-only). */
  crossfade: () => void;
}): LibraryActions {
  const { engine, session, report } = options;
  let items: readonly LibraryItem[] = [];
  let asking = false;
  const run = (
    item: LibraryItem,
    at: readonly [number, number] | undefined,
    mode?: TemplateMode,
  ) => {
    session.setPlaying(false);
    const insert = libraryCommands(
      engine.state,
      session.source,
      item,
      session.currentTime,
      { ...(at ? { at } : {}), ...(mode ? { mode } : {}) },
    );
    engine.commands.transaction(insert.label, insert.commands);
    if (insert.sceneId) {
      options.crossfade();
      session.selectComposition(insert.sceneId);
    } else if (insert.layerId) session.select(insert.layerId);
    if (mode) {
      const name = itemName(item);
      showToast(
        t(`template.done.${mode}`, { name }) +
          (insert.scaled ? ` ${t('template.scaled')}` : ''),
        'info',
        6000,
        { label: t('command.undo'), run: options.undo },
      );
    }
  };
  const askMode = (item: LibraryItem, at?: readonly [number, number]) => {
    if (asking) return;
    asking = true;
    let choice = lastTemplateMode();
    let done = false;
    const modal = openModal({
      titleText: t('template.dialogTitle', { name: itemName(item) }),
      onClose: () => {
        asking = false;
      },
      bodyBuilder: (body) => {
        const list = document.createElement('div');
        list.className = 'template-modes';
        list.setAttribute('role', 'radiogroup');
        list.setAttribute(
          'aria-label',
          t('template.dialogTitle', { name: itemName(item) }),
        );
        const buttons = TEMPLATE_MODES.map((mode) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'template-mode';
          button.dataset.templateMode = mode;
          button.setAttribute('role', 'radio');
          const title = document.createElement('strong');
          title.textContent = t(`template.mode.${mode}`);
          const hint = document.createElement('span');
          hint.textContent = t(`template.modeHint.${mode}`);
          button.append(title, hint);
          button.onclick = () => {
            choice = mode;
            sync();
          };
          button.ondblclick = () => confirm();
          return button;
        });
        const sync = () =>
          buttons.forEach((button) =>
            button.setAttribute(
              'aria-checked',
              String(button.dataset.templateMode === choice),
            ),
          );
        sync();
        list.append(...buttons);
        list.onkeydown = (event) => {
          const index = TEMPLATE_MODES.indexOf(choice);
          if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            choice = TEMPLATE_MODES[(index + 1) % TEMPLATE_MODES.length]!;
            sync();
            buttons[TEMPLATE_MODES.indexOf(choice)]!.focus();
            event.preventDefault();
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            choice =
              TEMPLATE_MODES[
                (index + TEMPLATE_MODES.length - 1) % TEMPLATE_MODES.length
              ]!;
            sync();
            buttons[TEMPLATE_MODES.indexOf(choice)]!.focus();
            event.preventDefault();
          }
        };
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'button';
        cancel.dataset.action = 'template-cancel';
        cancel.textContent = t('crop.cancel');
        cancel.onclick = () => modal.close();
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'button primary';
        ok.dataset.action = 'template-confirm';
        ok.textContent = t('template.confirm');
        ok.onclick = () => confirm();
        actions.append(cancel, ok);
        body.append(list, actions);
        // The modal focuses its first control on the next frame; the chosen
        // option takes focus after that, so Enter confirms it.
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            buttons[TEMPLATE_MODES.indexOf(choice)]?.focus(),
          ),
        );
      },
    });
    // Enter confirms from anywhere in the dialog except its Cancel and Close.
    modal.root.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement;
      if (
        event.key === 'Enter' &&
        !target.closest('.modal-close, [data-action="template-cancel"]')
      ) {
        event.preventDefault();
        confirm();
      }
    });
    const confirm = () => {
      if (done) return;
      done = true;
      rememberMode(choice);
      modal.close();
      try {
        run(item, at, choice);
      } catch (error) {
        report(error);
      }
    };
  };
  return {
    insert(item, at) {
      try {
        if (item.type === 'template') askMode(item, at);
        else run(item, at);
      } catch (error) {
        report(error);
      }
    },
    find: (id) => items.find((item) => item.id === id),
    setItems(next) {
      items = next;
    },
  };
}
