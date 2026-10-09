// T-ALL P5 (spec 8, 12, 13): the Layers panel beside the lanes is an
// outliner. Root: the Scene Collection; under it user collections (nested)
// and the scene's top-level elements. Collections are organisation only:
// they live in the scene's optional `outliner` (schema 7) and never change
// stacking, transforms, groups, lanes, timing or export. The eye, lock and
// mute buttons act on the element's lane with the existing track command;
// they forward to the lane header's own button, so one command path runs.
import {
  findClipByLayer,
  type Command,
  type EditorEngine,
  type Composition,
  type DeepReadonly,
} from '../core';
import { t } from '../i18n';
import { iconSvg } from './icons';
import type { EditorSession } from './session';

type Outliner = NonNullable<Composition['outliner']>;
type Layer = DeepReadonly<Composition>['layers'][number];

const empty = (): Outliner => ({ collections: [], items: {}, order: [] });
const clone = (value: DeepReadonly<Outliner> | undefined): Outliner =>
  value ? (structuredClone(value) as Outliner) : empty();

const ICONS: Record<string, string> = {
  video: 'media',
  image: 'image',
  audio: 'audio',
  text: 'text',
  shape: 'elements',
  group: 'folder',
};

export interface OutlinerHandle {
  readonly element: HTMLElement;
  render(): void;
  /** Spec 12: the rows of the selection, its parents open, scrolled to. */
  reveal(): void;
}

export function mountOutliner(
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
): OutlinerHandle {
  const element = document.createElement('aside');
  element.className = 'timeline-outliner';
  element.setAttribute('aria-label', t('outliner.title'));
  const header = document.createElement('header');
  header.className = 'outliner-header';
  const title = document.createElement('h3');
  title.textContent = t('outliner.title');
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'icon-button';
  add.dataset.ol = 'new-collection';
  add.setAttribute('aria-label', t('outliner.newCollection'));
  add.title = t('outliner.newCollection');
  add.innerHTML = iconSvg('plus', 16);
  const collapse = document.createElement('button');
  collapse.type = 'button';
  collapse.className = 'icon-button';
  collapse.dataset.ol = 'collapse-panel';
  collapse.setAttribute('aria-label', t('outliner.collapse'));
  collapse.title = t('outliner.collapse');
  collapse.innerHTML = iconSvg('chevronLeft', 16);
  header.append(title, add, collapse);
  const tree = document.createElement('div');
  tree.className = 'outliner-tree';
  tree.setAttribute('role', 'tree');
  const resizer = document.createElement('div');
  resizer.className = 'outliner-resizer';
  resizer.setAttribute('aria-hidden', 'true');
  element.append(header, tree, resizer);
  // Closed by default (a 40 px column), so the lanes keep their room; the
  // choice is a view setting kept in this browser.
  const OPEN_KEY = 'aive.outliner.open';
  const setOpen = (open: boolean) => {
    element.classList.toggle('collapsed', !open);
    collapse.setAttribute('aria-expanded', String(open));
    collapse.innerHTML = iconSvg(open ? 'chevronLeft' : 'chevronRight', 16);
    try {
      localStorage.setItem(OPEN_KEY, String(open));
    } catch {
      // Storage may be unavailable; the panel still works.
    }
  };
  let storedOpen = false;
  try {
    storedOpen = localStorage.getItem(OPEN_KEY) === 'true';
  } catch {
    storedOpen = false;
  }
  setOpen(storedOpen);
  /** Collections opened to show a selected row (view state only). */
  const opened = new Set<string>();
  let width = 220;
  let widthSetByUser = false;

  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
    }
  };
  const scene = () => session.source.composition;
  const current = () => clone(scene().outliner);
  const save = (label: string, next: Outliner) =>
    safely(() =>
      engine.commands.transaction(label, [
        {
          type: 'SET_OUTLINER',
          compositionId: scene().id,
          outliner: next,
        } as Command,
      ]),
    );
  const ordered = (outliner: Outliner): Layer[] => {
    const index = new Map(outliner.order.map((id, i) => [id, i]));
    return [...scene().layers]
      .map((layer, i) => ({ layer, i }))
      .sort(
        (a, b) =>
          (index.get(a.layer.id) ?? 1e6 + a.i) -
          (index.get(b.layer.id) ?? 1e6 + b.i),
      )
      .map((item) => item.layer);
  };
  const parentOf = (outliner: Outliner, layerId: string) => {
    const id = outliner.items[layerId];
    return id && outliner.collections.some((item) => item.id === id)
      ? id
      : null;
  };
  /** Every element inside a collection, nested ones too. */
  const assetsIn = (outliner: Outliner, collectionId: string | null) => {
    const ids = new Set<string | null>([collectionId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const item of outliner.collections)
        if (!ids.has(item.id) && ids.has(item.parentId)) {
          ids.add(item.id);
          grew = true;
        }
    }
    return ordered(outliner).filter((layer) =>
      ids.has(parentOf(outliner, layer.id)),
    );
  };
  const laneOf = (layerId: string) => findClipByLayer(scene(), layerId)?.track;

  const toggle = (
    icon: string,
    pressed: boolean,
    label: string,
    data: Record<string, string>,
  ) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'icon-button track-toggle outliner-toggle';
    for (const [key, value] of Object.entries(data))
      if (key === 'action') item.dataset.olAction = value;
      else if (key === 'id') item.dataset.lane = value;
      else if (key !== 'track') item.dataset[key] = value;
    item.innerHTML = iconSvg(icon, 16);
    item.setAttribute('aria-pressed', String(pressed));
    item.setAttribute('aria-label', label);
    item.title = label;
    item.classList.toggle('active', pressed);
    return item;
  };

  const assetRow = (layer: Layer, depth: number) => {
    const row = document.createElement('div');
    row.className = 'outliner-row';
    row.setAttribute('role', 'treeitem');
    row.dataset.rowKind = 'asset';
    row.tabIndex = 0;
    row.dataset.layerId = layer.id;
    row.draggable = false;
    row.style.paddingInlineStart = `${8 + depth * 16}px`;
    row.setAttribute(
      'aria-selected',
      String(session.selectedIds.includes(layer.id)),
    );
    const icon = document.createElement('span');
    icon.className = 'outliner-icon';
    icon.innerHTML = iconSvg(ICONS[layer.type] ?? 'elements', 16);
    const name = document.createElement('span');
    name.className = 'outliner-name';
    name.textContent = layer.name;
    name.title = layer.name;
    row.append(icon, name);
    const lane = laneOf(layer.id);
    if (lane) {
      const named = { name: layer.name };
      row.append(
        toggle(
          lane.enabled ? 'eye' : 'eyeOff',
          !lane.enabled,
          t(lane.enabled ? 'track.hide' : 'track.show', named),
          { action: 'track-enable', id: lane.id, track: lane.id },
        ),
        toggle(
          lane.locked ? 'lock' : 'unlock',
          lane.locked,
          t(lane.locked ? 'track.unlock' : 'track.lock', named),
          { action: 'track-lock', id: lane.id, track: lane.id },
        ),
      );
      if (lane.type === 'video' || lane.type === 'audio') {
        const soloed = session.soloTrackIds.includes(lane.id);
        row.append(
          toggle(
            'solo',
            soloed,
            t(soloed ? 'track.unsolo' : 'track.solo', named),
            { action: 'track-solo', id: lane.id, track: lane.id },
          ),
          toggle(
            lane.muted ? 'mute' : 'speaker',
            lane.muted,
            t(lane.muted ? 'track.unmute' : 'track.mute', named),
            { action: 'track-mute', id: lane.id, track: lane.id },
          ),
        );
      }
    }
    return row;
  };
  const collectionRow = (
    id: string | null,
    label: string,
    depth: number,
    open: boolean,
  ) => {
    const row = document.createElement('div');
    row.className = 'outliner-row outliner-collection';
    row.setAttribute('role', 'treeitem');
    row.dataset.rowKind = id === null ? 'root' : 'collection';
    row.tabIndex = 0;
    if (id) row.dataset.collectionId = id;
    row.style.paddingInlineStart = `${8 + depth * 16}px`;
    row.setAttribute('aria-expanded', String(open));
    const arrow = document.createElement('button');
    arrow.type = 'button';
    arrow.className = 'outliner-disclosure';
    arrow.dataset.ol = 'disclose';
    arrow.setAttribute('aria-label', t('outliner.toggle'));
    arrow.innerHTML = iconSvg(open ? 'chevronDown' : 'chevronRight', 16);
    const icon = document.createElement('span');
    icon.className = 'outliner-icon';
    icon.innerHTML = iconSvg(id === null ? 'scenes' : 'folder', 16);
    const name = document.createElement('span');
    name.className = 'outliner-name';
    name.textContent = label;
    name.title = label;
    row.append(arrow, icon, name);
    if (id !== null) {
      // A collection's buttons apply to every element inside, one step.
      for (const [kind, icon2, key] of [
        ['enable', 'eye', 'outliner.hideAll'],
        ['lock', 'lock', 'outliner.lockAll'],
        ['mute', 'speaker', 'outliner.muteAll'],
      ] as const) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'icon-button outliner-toggle';
        item.dataset.ol = `collection-${kind}`;
        item.innerHTML = iconSvg(icon2, 16);
        item.setAttribute('aria-label', t(key));
        item.title = t(key);
        row.append(item);
      }
    }
    return row;
  };

  const render = () => {
    const outliner = current();
    const rows: HTMLElement[] = [];
    const rootOpen = true;
    const walk = (parent: string | null, depth: number) => {
      for (const collection of outliner.collections.filter(
        (item) => item.parentId === parent,
      )) {
        const open = !collection.collapsed || opened.has(collection.id);
        rows.push(collectionRow(collection.id, collection.name, depth, open));
        if (open) walk(collection.id, depth + 1);
      }
      for (const layer of ordered(outliner))
        if (parentOf(outliner, layer.id) === parent)
          rows.push(assetRow(layer, depth));
    };
    rows.push(collectionRow(null, scene().name, 0, rootOpen));
    walk(null, 1);
    tree.replaceChildren(...rows);
    // Spec 8: the width fits the longest name, between 160 and 360 px.
    if (!widthSetByUser) {
      const longest = Math.max(
        0,
        ...[...tree.querySelectorAll<HTMLElement>('.outliner-row')].map(
          (row) => {
            const name = row.querySelector<HTMLElement>('.outliner-name');
            return name
              ? name.scrollWidth + row.offsetWidth - name.offsetWidth
              : 0;
          },
        ),
      );
      width = Math.max(220, Math.min(360, longest + 8));
    }
    element.style.width = `${width}px`;
  };

  const reveal = () => {
    const outliner = current();
    let changed = false;
    for (const id of session.selectedIds) {
      let at = parentOf(outliner, id);
      while (at) {
        const collection = outliner.collections.find((item) => item.id === at);
        if (collection?.collapsed && !opened.has(at)) {
          opened.add(at);
          changed = true;
        }
        at = collection?.parentId ?? null;
      }
    }
    if (changed) render();
    const row = tree.querySelector<HTMLElement>(
      `.outliner-row[aria-selected="true"]`,
    );
    // Scroll only the tree, never its ancestors (the stage or the page).
    if (!row) return;
    const top = row.offsetTop - tree.offsetTop;
    if (top < tree.scrollTop) tree.scrollTop = top;
    else if (top + row.offsetHeight > tree.scrollTop + tree.clientHeight)
      tree.scrollTop = top + row.offsetHeight - tree.clientHeight;
  };

  // --- Interaction ---------------------------------------------------------
  const rowOf = (target: EventTarget | null) =>
    (target as HTMLElement | null)?.closest<HTMLElement>('.outliner-row') ??
    null;
  const collectionIdOf = (row: HTMLElement) =>
    row.dataset.rowKind === 'collection' ? row.dataset.collectionId! : null;

  element.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const ol = target.closest<HTMLElement>('[data-ol]')?.dataset.ol;
    const row = rowOf(target);
    if (ol === 'new-collection') {
      const next = current();
      const id = `collection-${crypto.randomUUID().slice(0, 8)}`;
      next.collections.push({
        id,
        name: t('outliner.collectionName', {
          n: String(next.collections.length + 1),
        }),
        parentId: null,
      });
      save(t('outliner.newCollection'), next);
      return;
    }
    if (ol === 'collapse-panel') {
      setOpen(element.classList.contains('collapsed'));
      return;
    }
    const laneToggle = target.closest<HTMLElement>('[data-ol-action]');
    if (laneToggle) {
      // The lane's own header button runs the existing command path.
      const lane = laneToggle.dataset.lane;
      const action = laneToggle.dataset.olAction;
      const header = [
        ...(element.parentElement?.parentElement?.querySelectorAll<HTMLElement>(
          `.timeline-row-header [data-action="${action}"]`,
        ) ?? []),
      ].find((button) => button.dataset.id === lane);
      header?.click();
      return;
    }
    if (!row) return;
    if (ol === 'disclose') {
      const id = collectionIdOf(row);
      if (!id) return;
      const next = current();
      const collection = next.collections.find((item) => item.id === id)!;
      const open = !collection.collapsed || opened.has(id);
      opened.delete(id);
      if (open) collection.collapsed = true;
      else delete collection.collapsed;
      save(t('outliner.toggle'), next);
      return;
    }
    if (ol?.startsWith('collection-')) {
      const id = collectionIdOf(row);
      const lanes = new Map<
        string,
        { enabled: boolean; locked: boolean; muted: boolean }
      >();
      for (const layer of assetsIn(current(), id)) {
        const lane = laneOf(layer.id);
        if (lane)
          lanes.set(lane.id, {
            enabled: lane.enabled,
            locked: lane.locked,
            muted: lane.muted,
          });
      }
      const kind = ol.slice('collection-'.length) as 'enable' | 'lock' | 'mute';
      const states = [...lanes.values()];
      // Turn the state on for all unless every lane already has it.
      const all =
        kind === 'enable'
          ? states.every((state) => !state.enabled)
          : states.every((state) =>
              kind === 'lock' ? state.locked : state.muted,
            );
      const commands = [...lanes.entries()].map(([trackId, state]) => ({
        type: 'SET_TRACK_STATE',
        compositionId: scene().id,
        trackId,
        enabled: kind === 'enable' ? all : state.enabled,
        locked: kind === 'lock' ? !all : state.locked,
        muted: kind === 'mute' ? !all : state.muted,
      })) as Command[];
      if (commands.length)
        safely(() =>
          engine.commands.transaction(t('outliner.collectionState'), commands),
        );
      return;
    }
    // Selection: a row selects its element; a collection all inside it.
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (row.dataset.rowKind === 'asset') {
      session.select(row.dataset.layerId!, additive);
      return;
    }
    const ids = assetsIn(current(), collectionIdOf(row)).map(
      (layer) => layer.id,
    );
    session.selectMany(
      additive ? [...new Set([...session.selectedIds, ...ids])] : ids,
    );
  });

  // Rename by double-click (collections and elements).
  const rename = (row: HTMLElement) => {
    const name = row.querySelector<HTMLElement>('.outliner-name');
    if (!name || row.dataset.rowKind === 'root') return;
    const input = document.createElement('input');
    input.className = 'outliner-rename';
    input.value = name.textContent ?? '';
    input.setAttribute('aria-label', t('outliner.rename'));
    name.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      if (!commit || !value) return render();
      if (row.dataset.rowKind === 'collection') {
        const next = current();
        next.collections.find(
          (item) => item.id === row.dataset.collectionId,
        )!.name = value;
        save(t('outliner.rename'), next);
      } else
        safely(() =>
          engine.commands.transaction('Rename', [
            {
              type: 'SET_LAYER_NAME',
              compositionId: scene().id,
              layerId: row.dataset.layerId!,
              name: value,
            } as Command,
          ]),
        );
      render();
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') finish(true);
      if (event.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  };
  element.addEventListener('dblclick', (event) => {
    const row = rowOf(event.target);
    if (row && !(event.target as HTMLElement).closest('button')) rename(row);
  });
  element.addEventListener('keydown', (event) => {
    const row = rowOf(event.target);
    if (!row) return;
    if (event.key === 'F2') rename(row);
    if (event.key === 'Delete' && row.dataset.rowKind === 'collection') {
      // Deleting a collection moves its contents to the parent.
      const id = row.dataset.collectionId!;
      const next = current();
      const gone = next.collections.find((item) => item.id === id)!;
      for (const item of next.collections)
        if (item.parentId === id) item.parentId = gone.parentId;
      for (const [layerId, collection] of Object.entries(next.items))
        if (collection === id) {
          if (gone.parentId) next.items[layerId] = gone.parentId;
          else delete next.items[layerId];
        }
      next.collections = next.collections.filter((item) => item.id !== id);
      save(t('outliner.deleteCollection'), next);
    }
  });

  // Drag a row onto a collection (into it), the root (out of all) or an
  // element row (before it, in the same collection). Organisation only.
  let drag: { row: HTMLElement; startY: number; moved: boolean } | null = null;
  element.addEventListener('pointerdown', (event) => {
    const row = rowOf(event.target);
    if (
      !row ||
      event.button !== 0 ||
      row.dataset.rowKind === 'root' ||
      (event.target as HTMLElement).closest('button, input')
    )
      return;
    drag = { row, startY: event.clientY, moved: false };
  });
  window.addEventListener('pointermove', (event) => {
    if (!drag) return;
    if (Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
    if (!drag.moved) return;
    for (const item of tree.querySelectorAll('.drop-into'))
      item.classList.remove('drop-into');
    rowOf(
      document.elementFromPoint(event.clientX, event.clientY),
    )?.classList.add('drop-into');
  });
  window.addEventListener('pointerup', (event) => {
    const active = drag;
    drag = null;
    for (const item of tree.querySelectorAll('.drop-into'))
      item.classList.remove('drop-into');
    if (!active?.moved) return;
    const target = rowOf(
      document.elementFromPoint(event.clientX, event.clientY),
    );
    if (!target || target === active.row) return;
    const next = current();
    const into =
      target.dataset.rowKind === 'collection'
        ? target.dataset.collectionId!
        : target.dataset.rowKind === 'root'
          ? null
          : parentOf(next, target.dataset.layerId!);
    if (active.row.dataset.rowKind === 'collection') {
      const id = active.row.dataset.collectionId!;
      // Never into itself or one of its own descendants.
      let at: string | null = into;
      while (at) {
        if (at === id) return;
        at = next.collections.find((item) => item.id === at)?.parentId ?? null;
      }
      next.collections.find((item) => item.id === id)!.parentId = into;
    } else {
      const layerId = active.row.dataset.layerId!;
      if (into) next.items[layerId] = into;
      else delete next.items[layerId];
      if (target.dataset.rowKind === 'asset') {
        const order = ordered(next)
          .map((layer) => layer.id)
          .filter((id) => id !== layerId);
        order.splice(order.indexOf(target.dataset.layerId!), 0, layerId);
        next.order = order;
      }
    }
    save(t('outliner.move'), next);
  });

  // Resize by the right edge (160 to 360 px).
  resizer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const start = event.clientX;
    const from = width;
    const move = (next: PointerEvent) => {
      widthSetByUser = true;
      width = Math.max(160, Math.min(360, from + next.clientX - start));
      element.style.width = `${width}px`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  return { element, render, reveal };
}
