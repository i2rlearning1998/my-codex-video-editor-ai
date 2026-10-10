// I3: the scene strip under the canvas (replaces the composition select).
// One 72 px row of scene cards in playback order: a 16:9 thumbnail drawn
// lazily and debounced, the name and a duration chip; the open scene has an
// accent border and scrolls into view. "+" adds a blank scene, a copy of the
// open one, or opens Templates. Cards drag to reorder (an insertion line
// shows where), double-click renames, right-click offers Rename, Duplicate,
// Delete, Save as template, Move left and Move right. A chevron collapses
// the strip (a view setting). Below 1024 px wide it becomes a "Scene 2 of 5"
// button with a list. Every change is one existing scene command.
import type { Command, EditorEngine } from '../core';
import { formatNumber, t } from '../i18n';
import type { FrameProvider } from '../render/adapter';
import { closePopover, openPopover } from './components/popover';
import { createMenu, type MenuEntry } from './context-menu';
import { iconSvg } from './icons';
import { drawScenePoster } from './scene-poster';
import { blankScene, duplicateScene } from './scenes';
import type { EditorSession } from './session';

const COLLAPSED_KEY = 'aive.sceneStrip.collapsed';
const THUMB = { width: 176, height: 80 };
const DRAG_TYPE = 'application/x-aive-scene-strip';

export interface SceneStrip {
  render(): void;
  readonly element: HTMLElement;
}

export function mountSceneStrip(options: {
  host: HTMLElement;
  engine: EditorEngine;
  session: EditorSession;
  frames?: FrameProvider;
  report: (error: unknown) => void;
  /** Opens the Templates panel ("From template"). */
  openTemplates: () => void;
  saveAsTemplate: (sceneId: string) => void;
  crossfade?: () => void;
}): SceneStrip {
  const { host, engine, session, report } = options;
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
    }
  };
  const run = (label: string, commands: Command[]) => {
    session.setPlaying(false);
    if (commands.length) engine.commands.transaction(label, commands);
  };
  host.classList.add('scene-strip');
  host.id = 'scene-strip';
  host.setAttribute('aria-label', t('strip.label'));
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'icon-button scene-strip-toggle';
  toggle.id = 'scene-strip-toggle';
  const list = document.createElement('div');
  list.className = 'scene-strip-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', t('strip.label'));
  list.setAttribute('aria-orientation', 'horizontal');
  const insertLine = document.createElement('span');
  insertLine.className = 'scene-strip-insert';
  insertLine.hidden = true;
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'scene-strip-add';
  add.id = 'scene-strip-add';
  add.innerHTML = iconSvg('plus', 18);
  add.title = t('strip.add');
  add.setAttribute('aria-label', t('strip.add'));
  add.setAttribute('aria-haspopup', 'menu');
  const compact = document.createElement('button');
  compact.type = 'button';
  compact.className = 'button sm scene-strip-compact';
  compact.id = 'scene-strip-compact';
  compact.setAttribute('aria-haspopup', 'listbox');
  const menuElement = document.createElement('div');
  menuElement.className = 'media-menu scene-strip-menu';
  menuElement.id = 'scene-strip-menu';
  menuElement.hidden = true;
  document.body.append(menuElement);
  const menu = createMenu(menuElement, { report });
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!menuElement.hidden && !menuElement.contains(event.target as Node))
        menu.close();
    },
    true,
  );
  const openMenu = (entries: () => MenuEntry[], x: number, y: number) => {
    menu.open(entries);
    const width = menuElement.offsetWidth,
      height = menuElement.offsetHeight;
    menuElement.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
    menuElement.style.top = `${Math.max(8, Math.min(y - height, window.innerHeight - height - 8))}px`;
  };
  host.replaceChildren(toggle, compact, list, add, insertLine);

  let collapsed = false;
  try {
    collapsed = localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    // A view setting only.
  }
  const setCollapsed = (value: boolean) => {
    collapsed = value;
    try {
      localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
    } catch {
      // A view setting only.
    }
    render();
  };
  toggle.onclick = () => setCollapsed(!collapsed);

  const open = (id: string) => {
    if (id === session.source.composition.id) return;
    session.setPlaying(false);
    options.crossfade?.();
    session.selectComposition(id);
  };
  const scenes = () => engine.state.compositions;
  const indexOf = (id: string) => scenes().findIndex((item) => item.id === id);
  const move = (id: string, index: number) =>
    run('Reorder scenes', [
      { type: 'MOVE_COMPOSITION', compositionId: id, index },
    ]);
  const remove = (id: string) =>
    run('Delete scene', [{ type: 'DELETE_COMPOSITION', compositionId: id }]);
  const duplicate = (id: string) => {
    const added = duplicateScene(engine.state, id);
    run('Duplicate scene', added.commands);
    open(added.id);
  };
  const blank = () => {
    const added = blankScene(engine.state, session.source.composition.id);
    run('Add scene', added.commands);
    open(added.id);
  };
  const sceneEntries = (id: string): MenuEntry[] => {
    const index = indexOf(id),
      count = scenes().length;
    return [
      {
        id: 'strip-rename',
        label: t('scene.rename'),
        icon: 'edit',
        run: () => rename(id),
      },
      {
        id: 'strip-duplicate',
        label: t('scene.duplicate'),
        icon: 'duplicate',
        run: () => safely(() => duplicate(id)),
      },
      {
        id: 'strip-delete',
        label: t('scene.delete'),
        icon: 'delete',
        ...(count > 1
          ? { run: () => safely(() => remove(id)) }
          : { reason: t('scenes.lastScene') }),
      },
      {
        id: 'strip-save-template',
        label: t('myTemplates.save'),
        icon: 'templates',
        divider: true,
        run: () => options.saveAsTemplate(id),
      },
      {
        id: 'strip-move-left',
        label: t('strip.moveLeft'),
        icon: 'chevronLeft',
        divider: true,
        ...(index > 0 ? { run: () => safely(() => move(id, index - 1)) } : {}),
      },
      {
        id: 'strip-move-right',
        label: t('strip.moveRight'),
        icon: 'chevronRight',
        ...(index < count - 1
          ? { run: () => safely(() => move(id, index + 1)) }
          : {}),
      },
    ];
  };
  add.onclick = () => {
    const box = add.getBoundingClientRect();
    openMenu(
      () => [
        {
          id: 'strip-add-blank',
          label: t('strip.blank'),
          icon: 'plus',
          run: () => safely(blank),
        },
        {
          id: 'strip-add-duplicate',
          label: t('strip.duplicateCurrent'),
          icon: 'duplicate',
          run: () => safely(() => duplicate(session.source.composition.id)),
        },
        {
          id: 'strip-add-template',
          label: t('strip.fromTemplate'),
          icon: 'templates',
          run: options.openTemplates,
        },
      ],
      box.left,
      box.top - 4,
    );
  };

  // --- Thumbnails: lazy (when on screen) and debounced (after edits) -------
  // Drawn on a detached canvas and shown as an image, so the page keeps
  // one <canvas> (the composition), as the library previews do.
  const drawn = new WeakMap<HTMLImageElement, object>();
  let observer: IntersectionObserver | null = null;
  const visible = new Set<HTMLImageElement>();
  const scratch = document.createElement('canvas');
  scratch.width = THUMB.width;
  scratch.height = THUMB.height;
  const paint = (image: HTMLImageElement) => {
    const id = image.dataset.thumbScene!;
    const scene = scenes().find((item) => item.id === id);
    if (!scene || drawn.get(image) === scene) return;
    drawn.set(image, scene);
    safely(() => {
      scratch.getContext('2d')?.clearRect(0, 0, THUMB.width, THUMB.height);
      if (drawScenePoster(scratch, engine, session, id, options.frames))
        image.src = scratch.toDataURL('image/png');
    });
  };
  let timer = 0;
  const paintSoon = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => visible.forEach(paint), 300);
  };

  // --- Rename (inline) ------------------------------------------------------
  const rename = (id: string) => {
    const card = list.querySelector<HTMLElement>(
      `[data-scene-id="${CSS.escape(id)}"]`,
    );
    const scene = scenes().find((item) => item.id === id);
    if (!card || !scene) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'scene-strip-name-input';
    input.value = scene.name;
    input.maxLength = 256;
    input.setAttribute('aria-label', t('scene.rename'));
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      safely(() => {
        if (name && name !== scene.name)
          run('Rename scene', [
            { type: 'SET_COMPOSITION', compositionId: id, name },
          ]);
        else render();
      });
    };
    input.onkeydown = (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') commit();
      if (event.key === 'Escape') {
        done = true;
        render();
      }
    };
    input.onblur = commit;
    input.onclick = (event) => event.stopPropagation();
    card.querySelector('.scene-strip-name')!.replaceWith(input);
    input.focus();
    input.select();
  };

  // --- Drag to reorder --------------------------------------------------------
  let dropIndex = -1;
  const placeLine = (event: DragEvent) => {
    const cards = [...list.querySelectorAll<HTMLElement>('.scene-strip-card')];
    let index = cards.length;
    for (const [i, card] of cards.entries()) {
      const box = card.getBoundingClientRect();
      if (event.clientX < box.left + box.width / 2) {
        index = i;
        break;
      }
    }
    dropIndex = index;
    const hostBox = host.getBoundingClientRect();
    const anchor = cards[index] ?? cards.at(-1);
    if (!anchor) return;
    const box = anchor.getBoundingClientRect();
    const x = cards[index] ? box.left - 4 : box.right + 4;
    insertLine.hidden = false;
    insertLine.style.left = `${x - hostBox.left}px`;
  };
  list.ondragover = (event) => {
    if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    placeLine(event);
  };
  list.ondragleave = (event) => {
    if (!list.contains(event.relatedTarget as Node)) insertLine.hidden = true;
  };
  list.ondrop = (event) =>
    safely(() => {
      insertLine.hidden = true;
      const id = event.dataTransfer?.getData(DRAG_TYPE);
      if (!id) return;
      event.preventDefault();
      const from = indexOf(id);
      // Removing the card first shifts later places left by one.
      const to = dropIndex > from ? dropIndex - 1 : dropIndex;
      if (from < 0 || to === from || to < 0) return;
      move(id, to);
    });

  const card = (index: number) => {
    const scene = scenes()[index]!;
    const current = scene.id === session.source.composition.id;
    const item = document.createElement('div');
    item.className = 'scene-strip-card';
    item.dataset.sceneId = scene.id;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(current));
    item.setAttribute(
      'aria-label',
      t('scene.cardLabel', { n: formatNumber(index + 1), name: scene.name }),
    );
    item.tabIndex = current ? 0 : -1;
    item.draggable = true;
    const canvas = document.createElement('img');
    canvas.className = 'scene-strip-thumb';
    canvas.alt = '';
    canvas.draggable = false;
    canvas.dataset.thumbScene = scene.id;
    const name = document.createElement('span');
    name.className = 'scene-strip-name';
    name.textContent = scene.name;
    const duration = document.createElement('span');
    duration.className = 'scene-strip-duration';
    duration.textContent = t('scene.seconds', {
      value: formatNumber(Math.round(scene.duration * 10) / 10),
    });
    const thumb = document.createElement('span');
    thumb.className = 'scene-strip-frame';
    thumb.append(canvas, duration);
    item.append(thumb, name);
    item.onclick = () => safely(() => open(scene.id));
    item.ondblclick = (event) => {
      event.preventDefault();
      rename(scene.id);
    };
    item.oncontextmenu = (event) => {
      event.preventDefault();
      openMenu(() => sceneEntries(scene.id), event.clientX, event.clientY);
    };
    item.onkeydown = (event) => {
      if (event.target !== item) return;
      const cards = [
        ...list.querySelectorAll<HTMLElement>('.scene-strip-card'),
      ];
      const at = cards.indexOf(item);
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        cards[at + (event.key === 'ArrowRight' ? 1 : -1)]?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        safely(() => open(scene.id));
      } else if (event.key === 'F2') {
        event.preventDefault();
        rename(scene.id);
      }
    };
    item.ondragstart = (event) => {
      event.dataTransfer?.setData(DRAG_TYPE, scene.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    };
    item.ondragend = () => {
      insertLine.hidden = true;
    };
    if (typeof IntersectionObserver === 'undefined') paint(canvas);
    else observer?.observe(canvas);
    return item;
  };

  const render = () => {
    const all = scenes();
    const index = indexOf(session.source.composition.id);
    host.classList.toggle('collapsed', collapsed);
    toggle.innerHTML = iconSvg(collapsed ? 'chevronRight' : 'chevronDown', 16);
    toggle.title = t(collapsed ? 'strip.expand' : 'strip.collapse');
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    compact.innerHTML = `<span></span>${iconSvg('chevronDown', 14)}`;
    compact.querySelector('span')!.textContent = t('strip.position', {
      n: formatNumber(index + 1),
      count: formatNumber(all.length),
    });
    compact.onclick = () => {
      const listbox = document.createElement('div');
      listbox.className = 'scene-strip-popover';
      listbox.setAttribute('role', 'listbox');
      for (const [i, scene] of all.entries()) {
        const option = document.createElement('button');
        option.type = 'button';
        option.setAttribute('role', 'option');
        option.dataset.sceneId = scene.id;
        option.setAttribute('aria-selected', String(i === index));
        option.textContent = `${formatNumber(i + 1)}. ${scene.name}`;
        option.onclick = () => {
          closePopover();
          safely(() => open(scene.id));
        };
        listbox.append(option);
      }
      openPopover(compact, listbox, { label: t('strip.label') });
    };
    observer?.disconnect();
    visible.clear();
    observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            for (const entry of entries) {
              const canvas = entry.target as HTMLImageElement;
              if (entry.isIntersecting) {
                visible.add(canvas);
                paint(canvas);
              } else visible.delete(canvas);
            }
          });
    list.replaceChildren(...all.map((_, i) => card(i)));
    list
      .querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };
  // Structure (scenes, names, order, the open scene) re-renders now; content
  // edits only repaint the visible thumbnails, debounced.
  let shape = '';
  const refresh = () => {
    const next = JSON.stringify([
      session.source.composition.id,
      collapsed,
      scenes().map((scene) => [scene.id, scene.name, scene.duration]),
    ]);
    if (next !== shape) {
      shape = next;
      render();
    } else paintSoon();
  };
  session.onChange(() => refresh());
  render();
  return { render, element: host };
}
