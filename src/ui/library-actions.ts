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
  type LibraryInsert,
  type TemplateMode,
} from './library-insert';
import { myTemplateCommands, type MyTemplate } from './my-templates';
import type { EditorSession } from './session';

/** I2: recently used library items, per panel, in this browser. */
export type RecentKind = 'template' | 'element' | 'graphic' | 'text';
const RECENT_KEY = 'aive.library.recent';
const RECENT_MAX = 12;
const recentListeners = new Set<() => void>();
export const recent = {
  list(kind: RecentKind): string[] {
    try {
      const value = JSON.parse(
        localStorage.getItem(RECENT_KEY) ?? '{}',
      ) as Record<string, unknown> | null;
      const list = value?.[kind];
      return Array.isArray(list)
        ? list.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  },
  add(kind: RecentKind, id: string) {
    try {
      const value = JSON.parse(
        localStorage.getItem(RECENT_KEY) ?? '{}',
      ) as Record<string, unknown>;
      value[kind] = [
        id,
        ...recent.list(kind).filter((item) => item !== id),
      ].slice(0, RECENT_MAX);
      localStorage.setItem(RECENT_KEY, JSON.stringify(value));
    } catch {
      // Recents are a convenience.
    }
    recentListeners.forEach((listener) => listener());
  },
  onChange(listener: () => void) {
    recentListeners.add(listener);
    return () => recentListeners.delete(listener);
  },
};
const recentKind = (item: LibraryItem): RecentKind | null =>
  item.type === 'template'
    ? 'template'
    : item.type === 'shape'
      ? 'element'
      : item.type === 'background'
        ? 'graphic'
        : item.type === 'text'
          ? 'text'
          : null;

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
  /** Adds an item; `at` is a composition point (a drop), `time` the start
   *  of its clip (default the playhead; T1: a drop on the timeline). */
  insert(
    item: LibraryItem,
    at?: readonly [number, number],
    time?: number,
  ): void;
  /**
   * I2: a plain text box ("Add a text box", the Draw palette's Text tool),
   * centred on `at` (composition point) or the canvas, `width` px wide.
   */
  insertTextBox(
    at?: readonly [number, number],
    width?: number,
    time?: number,
  ): void;
  /** I2: a template saved in this browser (My Templates). */
  insertMine(template: MyTemplate): void;
  /** The item a drag carries, by id. */
  find(id: string): LibraryItem | undefined;
  /**
   * T2: the commands an insert centred on `at` would run (nothing runs), to
   * measure what a drop would place; null for a template (a whole scene).
   */
  commandsFor(
    item: LibraryItem | 'textbox',
    at?: readonly [number, number],
    time?: number,
  ): LibraryInsert | null;
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
    name: string,
    build: (mode?: TemplateMode) => LibraryInsert,
    mode?: TemplateMode,
  ) => {
    session.setPlaying(false);
    const insert = build(mode);
    engine.commands.transaction(insert.label, insert.commands);
    if (insert.sceneId) {
      options.crossfade();
      session.selectComposition(insert.sceneId);
    } else if (insert.layerId) session.select(insert.layerId);
    if (mode)
      showToast(
        t(`template.done.${mode}`, { name }) +
          (insert.scaled ? ` ${t('template.scaled')}` : ''),
        'info',
        6000,
        { label: t('command.undo'), run: options.undo },
      );
  };
  const libraryBuild =
    (
      item: LibraryItem,
      at: readonly [number, number] | undefined,
      time = session.currentTime,
    ) =>
    (mode?: TemplateMode) =>
      libraryCommands(engine.state, session.source, item, time, {
        ...(at ? { at } : {}),
        ...(mode ? { mode } : {}),
      });
  /** I2: the item behind "Add a text box", `width` px wide. */
  const textBoxItem = (width?: number) => {
    const canvas = session.source.composition;
    const w = Math.min(
      3,
      Math.max(0.05, (width ?? canvas.width * 0.4) / canvas.width),
    );
    return {
      id: 'text-box',
      type: 'text',
      name: { en: t('text.boxName'), hi: t('text.boxName') },
      tags: [],
      data: {
        elements: [
          {
            kind: 'text',
            // The block is centred by libraryCommands (or on `at`).
            x: 0,
            y: 0,
            w,
            h: 0.1,
            text: { en: t('text.boxText'), hi: t('text.boxText') },
            size: 0.05,
            color: '#272b29',
            align: 'center',
          },
        ],
      },
    } as unknown as LibraryItem;
  };
  const askMode = (
    name: string,
    build: (mode?: TemplateMode) => LibraryInsert,
    done_?: () => void,
  ) => {
    if (asking) return;
    asking = true;
    let choice = lastTemplateMode();
    let done = false;
    const modal = openModal({
      titleText: t('template.dialogTitle', { name }),
      onClose: () => {
        asking = false;
      },
      bodyBuilder: (body) => {
        const list = document.createElement('div');
        list.className = 'template-modes';
        list.setAttribute('role', 'radiogroup');
        list.setAttribute('aria-label', t('template.dialogTitle', { name }));
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
        run(name, build, choice);
        done_?.();
      } catch (error) {
        report(error);
      }
    };
  };
  return {
    insert(item, at, time) {
      const kind = recentKind(item);
      const remember = () => kind && recent.add(kind, item.id);
      try {
        if (item.type === 'transition') return;
        if (item.type === 'template')
          askMode(itemName(item), libraryBuild(item, at, time), remember);
        else {
          run(itemName(item), libraryBuild(item, at, time));
          remember();
        }
      } catch (error) {
        report(error);
      }
    },
    insertTextBox(at, width, time) {
      try {
        run(t('text.boxName'), libraryBuild(textBoxItem(width), at, time));
      } catch (error) {
        report(error);
      }
    },
    commandsFor(item, at, time) {
      if (item !== 'textbox' && item.type === 'template') return null;
      return libraryBuild(
        item === 'textbox' ? textBoxItem() : item,
        at,
        time,
      )();
    },
    insertMine(template) {
      try {
        askMode(
          template.name,
          (mode) =>
            myTemplateCommands(
              engine.state,
              session.source,
              template,
              mode ?? 'new',
            ),
          () => recent.add('template', template.id),
        );
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
