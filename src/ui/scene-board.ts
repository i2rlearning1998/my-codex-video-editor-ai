// G5 scene board: every scene of the project in one row, in playback order,
// over the canvas. Each card shows a poster (the scene at its start), its
// name and length; a transition chip sits between scenes (transitions are
// Wave 6). Double-click (or Enter) opens a scene; the timeline then shows that
// scene only. Cards drag to reorder; a layer dragged from the Scene list or
// the Layers tab onto a card moves to that scene (Alt copies). "+" adds a
// blank scene, a copy of the current one or the built-in layout. Everything
// goes through the Command Bus; the board itself is transient.
import { compositionAt, type Command, type EditorEngine } from '../core';
import { formatNumber, t } from '../i18n';
import { drawComposition, fitViewport } from '../render/canvas';
import type { RenderSource } from '../render/adapter';
import { closePopover, openPopover } from './components/popover';
import { iconSvg } from './icons';
import {
  blankScene,
  duplicateScene,
  moveLayerToScene,
  templateScene,
} from './scenes';
import type { EditorSession } from './session';

const POSTER_WIDTH = 192;
const POSTER_HEIGHT = 108;
export const LAYER_DRAG_TYPE = 'application/x-editor-layer';
const SCENE_DRAG_TYPE = 'application/x-editor-scene';

export function mountSceneBoard(
  host: HTMLElement,
  toggle: HTMLButtonElement,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
  registerOverlay: (close: () => void) => () => void,
) {
  const board = document.createElement('div');
  board.className = 'scene-board';
  board.id = 'scene-board';
  board.hidden = true;
  board.setAttribute('role', 'region');
  board.setAttribute('aria-label', t('scene.board'));
  host.append(board);
  let unregister: (() => void) | null = null;
  let drawnState: unknown = null;
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
    }
  };
  const run = (label: string, commands: Command[]) => {
    if (commands.length) engine.commands.transaction(label, commands);
  };
  const open = (id: string) => {
    session.setPlaying(false);
    if (id !== session.source.composition.id) session.selectComposition(id);
    close();
  };
  const poster = (canvas: HTMLCanvasElement, index: number) => {
    const scene = engine.state.compositions[index];
    const context = canvas.getContext('2d');
    if (!scene || !context) return;
    const source: RenderSource = {
      composition: compositionAt(scene, 0),
      assets: engine.state.assets,
      background: scene.backgroundColor,
      currentTime: 0,
      ...(session.source.measureText
        ? { measureText: session.source.measureText }
        : {}),
    };
    drawComposition(
      context,
      source,
      fitViewport(POSTER_WIDTH, POSTER_HEIGHT, scene, 1),
      null,
      { overlays: false },
    );
  };
  const card = (index: number) => {
    const scene = engine.state.compositions[index]!;
    const current = scene.id === session.source.composition.id;
    const item = document.createElement('div');
    item.className = 'scene-card';
    item.dataset.sceneId = scene.id;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-current', String(current));
    item.setAttribute(
      'aria-label',
      t('scene.cardLabel', {
        n: formatNumber(index + 1),
        name: scene.name,
      }),
    );
    item.tabIndex = 0;
    item.draggable = true;
    const canvas = document.createElement('canvas');
    canvas.className = 'scene-poster';
    canvas.width = POSTER_WIDTH;
    canvas.height = POSTER_HEIGHT;
    poster(canvas, index);
    const name = document.createElement('span');
    name.className = 'scene-card-name';
    name.textContent = `${formatNumber(index + 1)}. ${scene.name}`;
    const duration = document.createElement('span');
    duration.className = 'scene-card-duration';
    duration.textContent = t('scene.seconds', {
      value: formatNumber(Math.round(scene.duration * 10) / 10),
    });
    const actions = document.createElement('div');
    actions.className = 'scene-card-actions';
    const action = (
      id: string,
      icon: string,
      label: string,
      run: () => void,
    ) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'icon-button';
      button.dataset.action = id;
      button.innerHTML = iconSvg(icon, 14);
      button.setAttribute('aria-label', label);
      button.title = label;
      button.onclick = (event) => {
        event.stopPropagation();
        safely(run);
      };
      return button;
    };
    const remove = action('delete-scene', 'delete', t('scene.delete'), () =>
      run('Delete scene', [
        { type: 'DELETE_COMPOSITION', compositionId: scene.id },
      ]),
    );
    remove.disabled = engine.state.compositions.length === 1;
    actions.append(
      action('rename-scene', 'text', t('scene.rename'), () =>
        rename(item, scene.id),
      ),
      action('duplicate-scene', 'duplicate', t('scene.duplicate'), () => {
        const added = duplicateScene(engine.state, scene.id);
        run('Duplicate scene', added.commands);
      }),
      remove,
    );
    const meta = document.createElement('div');
    meta.className = 'scene-card-meta';
    meta.append(name, duration);
    item.append(canvas, meta, actions);
    item.ondblclick = () => safely(() => open(scene.id));
    item.onkeydown = (event) => {
      if (event.key === 'Enter' && event.target === item) {
        event.preventDefault();
        safely(() => open(scene.id));
      }
    };
    item.ondragstart = (event) => {
      event.dataTransfer?.setData(SCENE_DRAG_TYPE, scene.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    };
    item.ondragover = (event) => {
      const types = event.dataTransfer?.types ?? [];
      if (!types.includes(SCENE_DRAG_TYPE) && !types.includes(LAYER_DRAG_TYPE))
        return;
      event.preventDefault();
      item.classList.add('scene-drop-target');
    };
    item.ondragleave = () => item.classList.remove('scene-drop-target');
    item.ondrop = (event) =>
      safely(() => {
        event.preventDefault();
        item.classList.remove('scene-drop-target');
        const moving = event.dataTransfer?.getData(SCENE_DRAG_TYPE);
        if (moving) {
          if (moving === scene.id) return;
          run('Reorder scenes', [
            {
              type: 'MOVE_COMPOSITION',
              compositionId: moving,
              index: engine.state.compositions.findIndex(
                (item) => item.id === scene.id,
              ),
            },
          ]);
          return;
        }
        const layerId = event.dataTransfer?.getData(LAYER_DRAG_TYPE);
        if (!layerId) return;
        const copy = event.altKey;
        run(
          copy ? 'Copy to scene' : 'Move to scene',
          moveLayerToScene(
            engine.state,
            session.source.composition.id,
            layerId,
            scene.id,
            copy,
          ),
        );
      });
    return item;
  };
  const rename = (item: HTMLElement, id: string) => {
    const scene = engine.state.compositions.find((entry) => entry.id === id);
    if (!scene) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'scene-name-input';
    input.value = scene.name;
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
        else render(true);
      });
    };
    input.onkeydown = (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') commit();
      if (event.key === 'Escape') {
        done = true;
        render(true);
      }
    };
    input.onblur = commit;
    item.querySelector('.scene-card-name')!.replaceWith(input);
    input.focus();
    input.select();
  };
  const transition = () => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'scene-transition';
    chip.setAttribute('aria-disabled', 'true');
    chip.innerHTML = iconSvg('transitions', 14);
    const later = t('toolbar.later', { wave: '6', id: 'TR-001' });
    chip.title = later;
    chip.setAttribute('aria-label', `${t('scene.transition')}: ${later}`);
    return chip;
  };
  const addButton = () => {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'scene-add';
    add.dataset.action = 'add-scene';
    add.innerHTML = iconSvg('duplicate', 18);
    add.setAttribute('aria-label', t('scene.add'));
    add.title = t('scene.add');
    add.setAttribute('aria-haspopup', 'menu');
    add.onclick = () => {
      const menu = document.createElement('div');
      menu.className = 'scene-add-menu';
      menu.setAttribute('role', 'menu');
      const current = session.source.composition.id;
      for (const [id, label, build] of [
        ['blank', t('scene.addBlank'), () => blankScene(engine.state, current)],
        [
          'duplicate',
          t('scene.addDuplicate'),
          () => duplicateScene(engine.state, current),
        ],
        [
          'template',
          t('scene.addTemplate'),
          () => templateScene(engine.state, current),
        ],
      ] as const) {
        const option = document.createElement('button');
        option.type = 'button';
        option.setAttribute('role', 'menuitem');
        option.dataset.add = id;
        option.textContent = label;
        option.onclick = () =>
          safely(() => {
            closePopover();
            const added = build();
            run('Add scene', added.commands);
            session.selectComposition(added.id);
          });
        menu.append(option);
      }
      openPopover(add, menu, { label: t('scene.add') });
      menu.querySelector<HTMLButtonElement>('button')?.focus();
    };
    return add;
  };
  const render = (force = false) => {
    if (board.hidden) return;
    if (!force && drawnState === engine.state) {
      for (const item of board.querySelectorAll<HTMLElement>('.scene-card'))
        item.setAttribute(
          'aria-current',
          String(item.dataset.sceneId === session.source.composition.id),
        );
      return;
    }
    drawnState = engine.state;
    const row = document.createElement('div');
    row.className = 'scene-board-row';
    engine.state.compositions.forEach((_, index) => {
      if (index) row.append(transition());
      row.append(card(index));
    });
    row.append(addButton());
    board.replaceChildren(row);
  };
  const close = () => {
    if (board.hidden) return;
    board.hidden = true;
    toggle.setAttribute('aria-pressed', 'false');
    unregister?.();
    unregister = null;
  };
  const show = () => {
    board.hidden = false;
    toggle.setAttribute('aria-pressed', 'true');
    unregister = registerOverlay(close);
    render(true);
    board
      .querySelector<HTMLElement>('.scene-card[aria-current="true"]')
      ?.focus();
  };
  toggle.onclick = () => (board.hidden ? show() : close());
  const unsubscribe = session.onChange(() => render());
  return {
    open: show,
    close,
    get isOpen() {
      return !board.hidden;
    },
    dispose: () => {
      unsubscribe();
      close();
      board.remove();
    },
  };
}
