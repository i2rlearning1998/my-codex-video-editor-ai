// W2-F3 Position panel (CV-042, spec section 4): an Arrange tab with layer
// order, align and distribute as buttons, and a Layers tab with the
// composition's layers as a flat, front-first list that reorders by drag.
// It opens from the context toolbar and the selection action cluster, and
// works for any selection the shared capability rules allow.
import type { EditorEngine } from '../core';
import { t } from '../i18n';
import type { SceneLayer } from '../render/adapter';
import {
  ALIGN_EDGES,
  alignSelection,
  canDistribute,
  distributeSelection,
} from './align';
import { ARRANGE_ACTIONS, arrangeSelection, canArrange } from './arrange';
import { ARRANGE_KEYS } from './canvas-menu';
import { iconSvg } from './icons';
import type { EditorSession } from './session';

type Tab = 'arrange' | 'layers';

/** LYR-008: one line icon per layer type; groups show a folder. */
export const layerIcon = (layer: SceneLayer) =>
  layer.type === 'group'
    ? 'open'
    : layer.type === 'text'
      ? 'text'
      : layer.type === 'audio'
        ? 'audio'
        : layer.type === 'image'
          ? 'image'
          : layer.type === 'shape'
            ? 'elements'
            : 'media';

export function mountPositionPanel(
  panel: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
  registerOverlay: (close: () => void) => () => void,
) {
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('position.title'));
  let tab: Tab = 'arrange';
  let unregister: (() => void) | undefined;
  let dragged: string | null = null;
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
    }
  };
  const button = (
    label: string,
    data: Record<string, string>,
    run?: () => void,
    icon?: string,
  ) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'position-button';
    for (const [key, value] of Object.entries(data)) item.dataset[key] = value;
    item.innerHTML = icon ? iconSvg(icon, 14) : '';
    const text = document.createElement('span');
    text.textContent = label;
    item.append(text);
    if (run) item.onclick = () => safely(run);
    else item.disabled = true;
    return item;
  };
  const section = (title: string, ...items: HTMLElement[]) => {
    const wrap = document.createElement('section');
    wrap.className = 'position-section';
    const heading = document.createElement('h4');
    heading.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'position-grid';
    grid.append(...items);
    wrap.append(heading, grid);
    return wrap;
  };
  const arrange = () => {
    const selected = session.selectedIds.length > 0;
    const order = section(
      t('position.order'),
      ...ARRANGE_ACTIONS.map((action) =>
        button(
          t(ARRANGE_KEYS[action]),
          { arrange: action },
          selected && canArrange(session, action)
            ? () => arrangeSelection(engine, session, action)
            : undefined,
        ),
      ),
    );
    const align = section(
      t('command.align'),
      ...ALIGN_EDGES.map((edge) =>
        button(
          t(`command.align${edge[0]!.toUpperCase()}${edge.slice(1)}`),
          { align: edge },
          selected ? () => alignSelection(engine, session, edge) : undefined,
        ),
      ),
    );
    const distribute = section(
      t('position.distribute'),
      ...(['horizontal', 'vertical'] as const).map((axis) =>
        button(
          t(`command.distribute${axis[0]!.toUpperCase()}${axis.slice(1)}`),
          { distribute: axis },
          canDistribute(session)
            ? () => distributeSelection(engine, session, axis)
            : undefined,
        ),
      ),
    );
    const relative = document.createElement('button');
    relative.type = 'button';
    relative.className = 'position-toggle';
    relative.dataset.action = 'align-to-canvas';
    relative.setAttribute('aria-pressed', String(session.alignToCanvas));
    relative.textContent = t('command.alignToCanvas');
    relative.onclick = () =>
      safely(() => session.setAlignToCanvas(!session.alignToCanvas));
    return [order, align, distribute, relative];
  };
  const layers = () => {
    const list = document.createElement('ul');
    list.className = 'position-layers';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', t('position.layers'));
    list.setAttribute('aria-multiselectable', 'true');
    const all = session.source.composition.layers;
    if (!all.length) {
      const empty = document.createElement('p');
      empty.className = 'position-empty';
      empty.textContent = t('position.empty');
      return [empty];
    }
    // Front-first, like the Scene list (D-043): the last layer paints on top.
    [...all].reverse().forEach((layer) => {
      const row = document.createElement('li');
      row.className = 'position-layer';
      row.setAttribute('role', 'option');
      row.dataset.layerId = layer.id;
      row.dataset.type = layer.type;
      row.title = `${layer.name} (${layer.type})`;
      row.draggable = true;
      row.tabIndex = 0;
      row.setAttribute(
        'aria-selected',
        String(session.selectedIds.includes(layer.id)),
      );
      const icon = document.createElement('span');
      icon.className = 'layer-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.dataset.icon = layerIcon(layer);
      icon.innerHTML = iconSvg(icon.dataset.icon, 14);
      const name = document.createElement('span');
      name.className = 'position-layer-name';
      name.textContent = layer.name;
      row.append(icon, name);
      if (layer.type === 'group') {
        const count = document.createElement('span');
        count.className = 'position-layer-count';
        count.textContent = t('position.groupCount', {
          count: layer.children.length,
        });
        row.append(count);
      }
      row.onclick = (event) =>
        safely(() =>
          session.select(
            layer.id,
            event.shiftKey || event.ctrlKey || event.metaKey,
          ),
        );
      row.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          safely(() => session.select(layer.id));
        }
      };
      row.ondragstart = (event) => {
        dragged = layer.id;
        event.dataTransfer?.setData('application/x-editor-layer', layer.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      };
      row.ondragover = (event) => {
        if (!dragged) return;
        event.preventDefault();
        row.classList.add('position-drop-target');
      };
      row.ondragleave = () => row.classList.remove('position-drop-target');
      row.ondragend = () => {
        dragged = null;
      };
      row.ondrop = (event) =>
        safely(() => {
          event.preventDefault();
          row.classList.remove('position-drop-target');
          const moving = dragged;
          dragged = null;
          if (!moving || moving === layer.id) return;
          const ids = session.source.composition.layers.map((item) => item.id);
          const index = ids.indexOf(layer.id);
          if (index < 0 || !ids.includes(moving)) return;
          // The dragged layer takes the target's place in the stack.
          engine.commands.transaction('Reorder layer', [
            {
              type: 'MOVE_LAYER',
              compositionId: session.source.composition.id,
              layerId: moving,
              parentId: null,
              index,
            },
          ]);
        });
      list.append(row);
    });
    return [list];
  };
  const render = () => {
    if (panel.hidden) return;
    const tabs = document.createElement('div');
    tabs.className = 'animate-tabs';
    tabs.setAttribute('role', 'tablist');
    for (const name of ['arrange', 'layers'] as Tab[]) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'tab');
      item.dataset.tab = name;
      item.setAttribute('aria-selected', String(tab === name));
      item.textContent = t(`position.${name}`);
      item.onclick = () => {
        tab = name;
        render();
      };
      tabs.append(item);
    }
    panel.replaceChildren(tabs, ...(tab === 'arrange' ? arrange() : layers()));
  };
  const close = () => {
    if (panel.hidden) return;
    panel.hidden = true;
    unregister?.();
    unregister = undefined;
  };
  const open = () => {
    panel.hidden = false;
    unregister ??= registerOverlay(close);
    render();
    panel.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  };
  const outside = (event: PointerEvent) => {
    const element = event.target as HTMLElement;
    if (
      !panel.hidden &&
      !panel.contains(element) &&
      !element.closest('[data-control="position"], [data-action="position"]')
    )
      close();
  };
  document.addEventListener('pointerdown', outside);
  const unsubscribe = session.onChange(render);
  return {
    open,
    close,
    toggle: () => (panel.hidden ? open() : close()),
    render,
    get isOpen() {
      return !panel.hidden;
    },
    dispose: () => {
      unsubscribe();
      document.removeEventListener('pointerdown', outside);
      close();
    },
  };
}
