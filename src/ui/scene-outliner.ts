// V3 (Clipchamp clone spec 4): the left Scene panel is a Blender-style
// outliner. Root: the scene. Under it user collections (nested, from the
// scene's optional schema-7 `outliner`), then the scene's elements front-first
// (D-043), groups with their children. Collections are organisation only:
// nothing here changes stacking, transforms, lanes, timing or export, except
// the explicit layer actions (Delete, Duplicate, Paste, Delete hierarchy),
// which use the normal layer commands. Rows keep `data-layer-id`, so a click
// selects exactly as the old Scene list did.
import {
  findClipByLayer,
  type Command,
  type Composition,
  type DeepReadonly,
  type EditorEngine,
} from '../core';
import { t } from '../i18n';
import {
  createMenu,
  dismissMenuOn,
  announceMenu,
  type MenuEntry,
} from './context-menu';
import { performEdit, type EditAction } from './editing';
import { iconSvg } from './icons';
import { locateLayer } from '../render/adapter';
import { altTextOf } from './layer-actions';
import { LAYER_DRAG_TYPE } from './scene-board';
import type { EditorSession } from './session';

type Outliner = NonNullable<Composition['outliner']>;
type Layer = DeepReadonly<Composition>['layers'][number];

const blank = (): Outliner => ({ collections: [], items: {}, order: [] });
const clone = (value: DeepReadonly<Outliner> | undefined): Outliner =>
  value ? (structuredClone(value) as Outliner) : blank();

const ICONS: Record<string, string> = {
  video: 'media',
  image: 'image',
  audio: 'audio',
  text: 'text',
  shape: 'elements',
  group: 'group',
};

interface Row {
  kind: 'root' | 'collection' | 'layer';
  id: string;
  name: string;
  depth: number;
  icon: string;
  layer?: Layer;
  children: Row[];
}

export interface SceneOutliner {
  render(): void;
  dispose(): void;
}

/** Copied outliner rows: the layers (copied as clips) and the collections
 *  they sat in, so a paste can rebuild the structure. */
let clipboard: {
  layers: string[];
  collections: { id: string; name: string; parentId: string | null }[];
  items: Record<string, string>;
} | null = null;

export function mountSceneOutliner(
  host: HTMLElement,
  heading: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
): SceneOutliner {
  host.classList.add('scene-outliner');
  host.tabIndex = 0;
  host.setAttribute('role', 'tree');
  // Header: search and New collection, next to the "Scene" title.
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'outliner-search';
  search.placeholder = t('outliner.search');
  search.setAttribute('aria-label', t('outliner.search'));
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'icon-button outliner-new';
  add.dataset.ol = 'new-collection';
  add.setAttribute('aria-label', t('outliner.newCollection'));
  add.title = t('outliner.newCollection');
  add.innerHTML = iconSvg('folderPlus', 18);
  heading.append(add, search);
  const menuElement = document.createElement('div');
  // V7 (spec 10.4, S1 to S5): the shared vertical menu's look.
  menuElement.className = 'context-menu media-menu outliner-menu';
  menuElement.hidden = true;
  document.body.append(menuElement);
  const menu = createMenu(menuElement, { report });
  dismissMenuOn(
    menuElement,
    () => menu.isOpen,
    () => menu.close(),
  );
  /** Window and document listeners, removed by dispose. */
  const globals: (() => void)[] = [];
  function listen<T extends Event>(
    target: Window | Document,
    type: string,
    listener: (event: T) => void,
    capture = false,
  ) {
    target.addEventListener(type, listener as EventListener, capture);
    globals.push(() =>
      target.removeEventListener(type, listener as EventListener, capture),
    );
  }
  const tip = document.createElement('div');
  tip.className = 'outliner-drag-tip';
  tip.textContent = t('outliner.moveInto');
  tip.hidden = true;
  document.body.append(tip);

  /** View state: collapsed rows (transient, not in history). */
  const collapsed = new Set<string>();
  /** Selected collection rows, and the active collection (new, paste). */
  const pickedCollections = new Set<string>();
  let active: string | null = null;
  /** The last clicked layer row (Shift selects a range from it). */
  let anchor: string | null = null;

  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
    }
  };
  const scene = () => session.source.composition;
  const current = () => clone(scene().outliner);
  const collectionOf = (outliner: Outliner, layerId: string) => {
    const id = outliner.items[layerId];
    return id && outliner.collections.some((item) => item.id === id)
      ? id
      : null;
  };
  /** Collections under `id`, nested ones too, `id` included. */
  const subtree = (outliner: Outliner, id: string) => {
    const ids = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const item of outliner.collections)
        if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
          ids.add(item.id);
          grew = true;
        }
    }
    return ids;
  };
  /** Every top-level layer inside a collection (nested ones too). */
  const layersIn = (outliner: Outliner, id: string) => {
    const ids = subtree(outliner, id);
    return scene()
      .layers.filter((layer) => {
        const owner = collectionOf(outliner, layer.id);
        return owner !== null && ids.has(owner);
      })
      .map((layer) => layer.id);
  };
  const saveCommand = (next: Outliner): Command =>
    ({
      type: 'SET_OUTLINER',
      compositionId: scene().id,
      outliner: next,
    }) as Command;
  const save = (label: string, next: Outliner) =>
    safely(() => engine.commands.transaction(label, [saveCommand(next)]));

  // --- Tree --------------------------------------------------------------------
  const layerRow = (layer: Layer, depth: number): Row => ({
    kind: 'layer',
    id: layer.id,
    name: layer.name,
    depth,
    icon: ICONS[layer.type] ?? 'elements',
    layer,
    children: [...layer.children]
      .reverse()
      .map((child) => layerRow(child, depth + 1)),
  });
  const tree = (): Row => {
    const outliner = current();
    const collectionRow = (id: string, name: string, depth: number): Row => ({
      kind: 'collection',
      id,
      name,
      depth,
      icon: 'folder',
      children: [
        ...outliner.collections
          .filter((item) => item.parentId === id)
          .map((item) => collectionRow(item.id, item.name, depth + 1)),
        ...[...scene().layers]
          .reverse()
          .filter((layer) => collectionOf(outliner, layer.id) === id)
          .map((layer) => layerRow(layer, depth + 1)),
      ],
    });
    return {
      kind: 'root',
      id: scene().id,
      name: scene().name,
      depth: 0,
      icon: 'scenes',
      children: [
        ...outliner.collections
          .filter((item) => item.parentId === null)
          .map((item) => collectionRow(item.id, item.name, 1)),
        ...[...scene().layers]
          .reverse()
          .filter((layer) => collectionOf(outliner, layer.id) === null)
          .map((layer) => layerRow(layer, 1)),
      ],
    };
  };
  /** Rows matching the search, with the parents of every match. */
  const filtered = (row: Row, query: string): Row | null => {
    if (!query) return row;
    const children = row.children
      .map((child) => filtered(child, query))
      .filter((child): child is Row => !!child);
    return row.kind === 'root' ||
      children.length ||
      row.name.toLowerCase().includes(query)
      ? { ...row, children }
      : null;
  };
  const visibleRows = (root: Row, query: string) => {
    const rows: Row[] = [];
    const walk = (row: Row) => {
      rows.push(row);
      if (query || !collapsed.has(row.id)) row.children.forEach(walk);
    };
    walk(root);
    return rows;
  };

  /** The lanes holding a set of top-level layers. */
  const lanesOf = (layerIds: readonly string[]) => {
    const lanes = new Map<
      string,
      DeepReadonly<Composition>['tracks'][number]
    >();
    for (const id of layerIds) {
      const found = findClipByLayer(scene(), id);
      if (found) lanes.set(found.track.id, found.track);
    }
    return [...lanes.values()];
  };
  const setLanes = (
    label: string,
    layerIds: readonly string[],
    change: { enabled?: boolean; locked?: boolean; muted?: boolean },
  ) => {
    const lanes = lanesOf(layerIds);
    if (!lanes.length) return;
    safely(() =>
      engine.commands.transaction(
        label,
        lanes.map(
          (lane) =>
            ({
              type: 'SET_TRACK_STATE',
              compositionId: scene().id,
              trackId: lane.id,
              enabled: change.enabled ?? lane.enabled,
              locked: change.locked ?? lane.locked,
              muted: change.muted ?? lane.muted,
            }) as Command,
        ),
      ),
    );
  };
  /** The top-level layer a row stands for (a group child: its group). */
  const topLevel = (layerId: string) => {
    let at = locateLayer(scene().layers, layerId);
    while (at?.parent) at = locateLayer(scene().layers, at.parent.id);
    return at?.layer.id ?? layerId;
  };

  const toggle = (
    action: string,
    icon: string,
    pressed: boolean,
    label: string,
  ) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'outliner-toggle';
    button.dataset.ol = action;
    button.classList.toggle('active', pressed);
    button.setAttribute('aria-pressed', String(pressed));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = iconSvg(icon, 18);
    return button;
  };

  const drawRow = (row: Row, index: number) => {
    const element = document.createElement('div');
    element.className = 'outliner-row';
    element.setAttribute('role', 'treeitem');
    element.setAttribute('aria-level', String(row.depth + 1));
    element.dataset.rowKind = row.kind;
    element.classList.toggle('zebra', index % 2 === 1);
    if (row.kind === 'layer') {
      element.dataset.layerId = row.id;
      // (The class earlier scene-list rows had; other code finds rows by it.)
      element.classList.add('scene-row');
    }
    if (row.kind === 'collection') element.dataset.collectionId = row.id;
    element.style.setProperty('--depth', String(row.depth));
    const selected =
      row.kind === 'layer'
        ? session.selectedIds.includes(row.id)
        : row.kind === 'collection' && pickedCollections.has(row.id);
    element.setAttribute('aria-selected', String(selected));
    element.classList.toggle(
      'active',
      (row.kind === 'collection' && active === row.id) ||
        (row.kind === 'layer' && session.selectedId === row.id),
    );
    const hasChildren = row.children.length > 0 && row.kind !== 'root';
    if (hasChildren)
      element.setAttribute('aria-expanded', String(!collapsed.has(row.id)));
    const arrow = document.createElement('button');
    arrow.type = 'button';
    arrow.className = 'outliner-arrow';
    arrow.tabIndex = -1;
    if (hasChildren) {
      arrow.dataset.ol = 'disclose';
      arrow.setAttribute('aria-label', t('outliner.toggle'));
      arrow.innerHTML = iconSvg(
        collapsed.has(row.id) ? 'chevronRight' : 'chevronDown',
        18,
      );
    } else arrow.setAttribute('aria-hidden', 'true');
    const icon = document.createElement('span');
    icon.className = 'outliner-icon';
    icon.dataset.kind = row.kind;
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = iconSvg(row.icon, 18);
    // V7: a layer's icon is coloured by its kind.
    if (row.layer) icon.dataset.type = row.layer.type;
    const name = document.createElement('span');
    name.className = 'outliner-name';
    name.textContent = row.name;
    name.title = row.name;
    element.append(arrow, icon, name);
    // V7 (spec 10.4): the scene root is a header with a count pill.
    if (row.kind === 'root') {
      const count = document.createElement('span');
      count.className = 'outliner-count';
      const total = scene().layers.length;
      count.textContent = String(total);
      count.title = t('outliner.objects', { count: total });
      element.append(count);
    }
    // J6: a layer with alternative text shows an ALT badge.
    if (row.layer && altTextOf(row.layer as never)) {
      const badge = document.createElement('span');
      badge.className = 'alt-badge';
      badge.textContent = t('altText.short');
      badge.title = t('altText.badge');
      badge.setAttribute('aria-label', t('altText.badge'));
      element.append(badge);
    }
    // A collapsed row shows its children's kinds as a faint strip.
    if (hasChildren && collapsed.has(row.id)) {
      const strip = document.createElement('span');
      strip.className = 'outliner-strip';
      strip.setAttribute('aria-hidden', 'true');
      for (const kind of [
        ...new Set(row.children.map((child) => child.icon)),
      ].slice(0, 6))
        strip.insertAdjacentHTML('beforeend', iconSvg(kind, 16));
      element.append(strip);
    }
    const toggles = document.createElement('span');
    toggles.className = 'outliner-toggles';
    if (row.kind === 'layer') {
      const lane = findClipByLayer(scene(), topLevel(row.id))?.track;
      if (lane) {
        const named = { name: row.name };
        toggles.append(
          toggle(
            'eye',
            lane.enabled ? 'eye' : 'eyeOff',
            !lane.enabled,
            t(lane.enabled ? 'track.hide' : 'track.show', named),
          ),
          toggle(
            'lock',
            lane.locked ? 'lock' : 'unlock',
            lane.locked,
            t(lane.locked ? 'track.unlock' : 'track.lock', named),
          ),
        );
        if (row.layer?.type === 'video' || row.layer?.type === 'audio')
          toggles.append(
            toggle(
              'mute',
              lane.muted ? 'mute' : 'speaker',
              lane.muted,
              t(lane.muted ? 'track.unmute' : 'track.mute', named),
            ),
          );
      }
    } else if (row.kind === 'collection') {
      const lanes = lanesOf(layersIn(current(), row.id));
      const hidden = lanes.length > 0 && lanes.every((lane) => !lane.enabled);
      const locked = lanes.length > 0 && lanes.every((lane) => lane.locked);
      toggles.append(
        toggle('eye', hidden ? 'eyeOff' : 'eye', hidden, t('outliner.hideAll')),
        toggle(
          'lock',
          locked ? 'lock' : 'unlock',
          locked,
          t('outliner.lockAll'),
        ),
      );
    }
    element.append(toggles);
    // Rows move by a pointer drag (also onto a scene on the board); see the
    // drag section below.
    if (
      row.kind === 'collection' ||
      (row.kind === 'layer' &&
        scene().layers.some((item) => item.id === row.id))
    ) {
      element.dataset.dragId = row.id;
    }
    return element;
  };

  let lastKey = '';
  /** A rename in progress: renders wait until it ends. */
  let renaming = false;
  const render = () => {
    if (renaming) return;
    const query = search.value.trim().toLowerCase();
    const root = filtered(tree(), query)!;
    const rows = visibleRows(root, query);
    const key = JSON.stringify([
      rows.map((row) => [
        row.kind,
        row.id,
        row.name,
        row.depth,
        row.children.length,
        row.layer ? altTextOf(row.layer as never) : '',
      ]),
      [...collapsed],
      scene().tracks.map((track) => [
        track.id,
        track.enabled,
        track.locked,
        track.muted,
        track.clips.map((clip) => clip.layerId),
      ]),
    ]);
    // A selection change only repaints the rows' state, so a row being
    // pressed or dragged stays in the page.
    if (key === lastKey && host.childElementCount) {
      paintSelection();
      reveal();
      return;
    }
    lastKey = key;
    const focused =
      document.activeElement instanceof HTMLElement &&
      host.contains(document.activeElement);
    host.replaceChildren(...rows.map(drawRow));
    if (rows.length === 1 && !query) {
      const empty = document.createElement('p');
      empty.className = 'scene-empty';
      empty.textContent = t('scene.empty');
      host.append(empty);
    }
    if (focused) host.focus({ preventScroll: true });
    reveal();
  };

  const paintSelection = () => {
    for (const element of host.querySelectorAll<HTMLElement>('.outliner-row')) {
      const layerId = element.dataset.layerId;
      const collectionId = element.dataset.collectionId;
      const selected = layerId
        ? session.selectedIds.includes(layerId)
        : !!collectionId && pickedCollections.has(collectionId);
      element.setAttribute('aria-selected', String(selected));
      element.classList.toggle(
        'active',
        (!!collectionId && active === collectionId) ||
          (!!layerId && session.selectedId === layerId),
      );
    }
  };
  /** Spec 4: a selection made elsewhere opens its parents and scrolls its
   *  row into view (the outliner only). */
  let revealed = '';
  const reveal = () => {
    const key = session.selectedIds.join(',');
    if (key === revealed) return;
    revealed = key;
    const outliner = current();
    let opened = false;
    for (const id of session.selectedIds) {
      let at = locateLayer(scene().layers, id);
      while (at?.parent) {
        if (collapsed.delete(at.parent.id)) opened = true;
        at = locateLayer(scene().layers, at.parent.id);
      }
      let owner = collectionOf(outliner, topLevel(id));
      while (owner) {
        if (collapsed.delete(owner)) opened = true;
        owner =
          outliner.collections.find((item) => item.id === owner)?.parentId ??
          null;
      }
    }
    if (opened) {
      lastKey = '';
      render();
      return;
    }
    const row = host.querySelector<HTMLElement>(
      '.outliner-row[aria-selected="true"]',
    );
    if (!row) return;
    const top = row.offsetTop - host.offsetTop;
    if (top < host.scrollTop) host.scrollTop = top;
    else if (top + row.offsetHeight > host.scrollTop + host.clientHeight)
      host.scrollTop = top + row.offsetHeight - host.clientHeight;
  };

  // --- Actions -------------------------------------------------------------------
  const nameFor = (outliner: Outliner, parentId: string | null) => {
    const siblings = outliner.collections.filter(
      (item) => item.parentId === parentId,
    );
    const names = new Set(outliner.collections.map((item) => item.name));
    const parent = outliner.collections.find((item) => item.id === parentId);
    for (let n = siblings.length + 1; ; n++) {
      const name = parent
        ? `${parent.name} ${n}`
        : t('outliner.collectionName', { n });
      if (!names.has(name)) return name;
    }
  };
  /** New collection: inside `parent` as its first child, or at the root's
   *  bottom. Not in rename mode; its parent opens. */
  const newCollection = (parent: string | null) => {
    const next = current();
    const item = {
      id: crypto.randomUUID(),
      name: nameFor(next, parent),
      parentId: parent,
    };
    const first = parent
      ? next.collections.findIndex((other) => other.parentId === parent)
      : -1;
    if (first >= 0) next.collections.splice(first, 0, item);
    else next.collections.push(item);
    if (parent) collapsed.delete(parent);
    save(t('outliner.newCollection'), next);
  };
  /** Deleting a collection moves its contents up to its parent. */
  const deleteCollections = (ids: readonly string[]) => {
    const next = current();
    for (const id of ids) {
      const gone = next.collections.find((item) => item.id === id);
      if (!gone) continue;
      for (const item of next.collections)
        if (item.parentId === id) item.parentId = gone.parentId;
      for (const [layerId, owner] of Object.entries(next.items))
        if (owner === id) {
          if (gone.parentId) next.items[layerId] = gone.parentId;
          else delete next.items[layerId];
        }
      next.collections = next.collections.filter((item) => item.id !== id);
    }
    pickedCollections.clear();
    if (active && !next.collections.some((item) => item.id === active))
      active = null;
    save(t('outliner.deleteCollection'), next);
  };
  /** Delete hierarchy: the collection and every layer inside, one step. */
  const deleteHierarchy = (id: string) =>
    safely(() => {
      const next = current();
      const ids = subtree(next, id);
      const layers = layersIn(next, id);
      next.collections = next.collections.filter((item) => !ids.has(item.id));
      for (const layerId of layers) delete next.items[layerId];
      engine.commands.transaction(t('outliner.deleteHierarchy'), [
        ...layers.map(
          (layerId) =>
            ({
              type: 'DELETE_LAYER',
              compositionId: scene().id,
              layerId,
            }) as Command,
        ),
        saveCommand(next),
      ]);
      pickedCollections.clear();
      active = null;
    });
  /** Runs a layer edit on some layers and returns its commands (not run). */
  const capture = (ids: readonly string[], action: EditAction) => {
    const before = [...session.selectedIds];
    session.selectMany(ids);
    try {
      return engine.commands.capture(() =>
        performEdit(engine, session, action),
      ) as Command[];
    } finally {
      session.selectMany(before);
    }
  };
  const createdLayers = (commands: readonly Command[]) =>
    commands.flatMap((command) =>
      command.type === 'CREATE_LAYER' && command.parentId === null
        ? [command.layer.id]
        : [],
    );
  /** Copies of collections (a subtree), returned with an id map. */
  const copyCollections = (
    next: Outliner,
    source: readonly { id: string; name: string; parentId: string | null }[],
    roots: readonly string[],
    under: string | null,
    rename: boolean,
  ) => {
    const map = new Map<string, string>();
    const place = (id: string, parentId: string | null) => {
      const original = source.find((item) => item.id === id)!;
      const fresh = crypto.randomUUID();
      map.set(id, fresh);
      next.collections.push({
        id: fresh,
        name: rename ? `${original.name}.001` : original.name,
        parentId,
      });
      for (const child of source.filter((item) => item.parentId === id))
        place(child.id, fresh);
    };
    for (const root of roots) place(root, under);
    return map;
  };
  /** Duplicate collection: a sibling right after it holding duplicates of
   *  all its layers ("<name>.001"), one step. */
  const duplicateCollection = (id: string) =>
    safely(() => {
      const outliner = current();
      const original = outliner.collections.find((item) => item.id === id);
      if (!original) return;
      const layers = layersIn(outliner, id);
      const commands = layers.length ? capture(layers, 'duplicate') : [];
      const next = current();
      const map = copyCollections(
        next,
        outliner.collections,
        [id],
        original.parentId,
        true,
      );
      const copies = createdLayers(commands);
      // V7 (S6): each copy goes into the copy of its original's collection,
      // matched by content (the order the edit creates them in is not the
      // layers' order), so the tree keeps its shape.
      const created = commands.flatMap((command) =>
        command.type === 'CREATE_LAYER' && command.parentId === null
          ? [command.layer]
          : [],
      );
      const signature = (layer: {
        type: string;
        name: string;
        transform: unknown;
        properties: unknown;
      }) =>
        JSON.stringify([
          layer.type,
          layer.name,
          layer.transform,
          layer.properties,
        ]);
      const unused = new Set(created.map((layer) => layer.id));
      const ordered = scene().layers.filter((layer) =>
        layers.includes(layer.id),
      );
      ordered.forEach((layer, index) => {
        const wanted = signature(layer as never);
        const match =
          created.find(
            (copy) =>
              unused.has(copy.id) && signature(copy as never) === wanted,
          ) ?? created.find((copy, at) => at >= index && unused.has(copy.id));
        if (!match) return;
        unused.delete(match.id);
        const owner = collectionOf(outliner, layer.id);
        next.items[match.id] = (owner && map.get(owner)) || map.get(id)!;
      });
      engine.commands.transaction(t('outliner.duplicateCollection'), [
        ...commands,
        saveCommand(next),
      ]);
      if (copies.length) session.selectMany(copies);
    });
  /** The selected outliner rows as layers (collections bring theirs). */
  const selectionLayers = () => {
    const outliner = current();
    const ids = new Set(session.selectedIds.map(topLevel));
    for (const id of pickedCollections)
      for (const layer of layersIn(outliner, id)) ids.add(layer);
    return [...ids];
  };
  const copy = () =>
    safely(() => {
      const outliner = current();
      const layers = selectionLayers();
      if (!layers.length) return;
      const before = [...session.selectedIds];
      session.selectMany(layers);
      try {
        performEdit(engine, session, 'copy');
      } finally {
        session.selectMany(before);
      }
      const collections = [...pickedCollections].flatMap((id) => [
        ...subtree(outliner, id),
      ]);
      clipboard = {
        layers: scene()
          .layers.filter((layer) => layers.includes(layer.id))
          .map((layer) => layer.id),
        collections: outliner.collections
          .filter((item) => collections.includes(item.id))
          .map((item) => ({
            ...item,
            parentId:
              item.parentId && collections.includes(item.parentId)
                ? item.parentId
                : null,
          })),
        items: Object.fromEntries(
          Object.entries(outliner.items).filter(([layer]) =>
            layers.includes(layer),
          ),
        ),
      };
    });
  /** Paste into the active collection (or the root), one step. */
  const paste = (into: string | null = active) =>
    safely(() => {
      if (!clipboard) return;
      const copied = clipboard;
      const commands = engine.commands.capture(() =>
        performEdit(engine, session, 'paste'),
      ) as Command[];
      const next = current();
      const roots = copied.collections
        .filter((item) => item.parentId === null)
        .map((item) => item.id);
      const map = copyCollections(next, copied.collections, roots, into, false);
      const pasted = createdLayers(commands);
      copied.layers.forEach((layerId, index) => {
        const fresh = pasted[index];
        if (!fresh) return;
        const owner = copied.items[layerId];
        const target = (owner && map.get(owner)) || into;
        if (target) next.items[fresh] = target;
      });
      engine.commands.transaction(t('outliner.paste'), [
        ...commands,
        saveCommand(next),
      ]);
      if (pasted.length) session.selectMany(pasted);
    });
  const deleteSelection = () => {
    if (pickedCollections.size) deleteCollections([...pickedCollections]);
    else if (session.selectedIds.length)
      safely(() => performEdit(engine, session, 'delete'));
  };
  /** Moves rows into a collection (or the root): organisation only. */
  const moveInto = (target: string | null, ids: readonly string[]) => {
    const next = current();
    let changed = false;
    for (const id of ids) {
      const collection = next.collections.find((item) => item.id === id);
      if (collection) {
        // Never into itself or one of its own descendants.
        if (target && subtree(next, id).has(target)) continue;
        if (collection.parentId !== target) {
          collection.parentId = target;
          changed = true;
        }
        continue;
      }
      // Only top-level layers belong to collections (children follow their
      // group).
      if (!scene().layers.some((layer) => layer.id === id)) continue;
      const owner = collectionOf(next, id);
      if (owner === target) continue;
      if (target) next.items[id] = target;
      else delete next.items[id];
      changed = true;
    }
    if (changed) save(t('outliner.move'), next);
  };

  // --- Rename --------------------------------------------------------------------
  const rename = (target: HTMLElement) => {
    const kind = target.dataset.rowKind;
    if (kind !== 'collection' && kind !== 'layer') return;
    // The clicks before a double-click re-render the tree: use the live row.
    const row =
      host.querySelector<HTMLElement>(
        kind === 'collection'
          ? `.outliner-row[data-collection-id="${target.dataset.collectionId}"]`
          : `.outliner-row[data-layer-id="${target.dataset.layerId}"]`,
      ) ?? target;
    const name = row.querySelector<HTMLElement>('.outliner-name')!;
    const before = name.textContent ?? '';
    const input = document.createElement('input');
    input.className = 'outliner-rename';
    input.value = before;
    input.setAttribute('aria-label', t('outliner.rename'));
    name.replaceWith(input);
    input.focus();
    input.select();
    renaming = true;
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      renaming = false;
      const value = input.value.trim();
      lastKey = '';
      if (!commit || !value || value === before) return render();
      if (kind === 'collection') {
        const next = current();
        next.collections.find(
          (item) => item.id === row.dataset.collectionId,
        )!.name = value;
        save(t('outliner.rename'), next);
      } else
        safely(() =>
          engine.commands.transaction(t('outliner.rename'), [
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
    input.addEventListener('pointerdown', (event) => event.stopPropagation());
  };

  // --- Selection -------------------------------------------------------------------
  const rowOf = (target: EventTarget | null) =>
    (target as HTMLElement | null)?.closest<HTMLElement>('.outliner-row') ??
    null;
  const click = (row: HTMLElement, event: MouseEvent) => {
    const additive = event.ctrlKey || event.metaKey;
    const kind = row.dataset.rowKind;
    if (kind === 'root') {
      pickedCollections.clear();
      active = null;
      session.select(null);
    } else if (kind === 'collection') {
      const id = row.dataset.collectionId!;
      const layers = layersIn(current(), id);
      if (additive) {
        if (pickedCollections.has(id)) pickedCollections.delete(id);
        else pickedCollections.add(id);
        const keep = session.selectedIds.filter(
          (item) => !layers.includes(item),
        );
        session.selectMany(
          pickedCollections.has(id) ? [...keep, ...layers] : keep,
        );
      } else {
        pickedCollections.clear();
        pickedCollections.add(id);
        session.selectMany(layers);
      }
      active = id;
    } else {
      const id = row.dataset.layerId!;
      if (!additive) pickedCollections.clear();
      if (event.shiftKey && anchor) {
        const ids = [
          ...host.querySelectorAll<HTMLElement>('.outliner-row[data-layer-id]'),
        ].map((item) => item.dataset.layerId!);
        const from = ids.indexOf(anchor),
          to = ids.indexOf(id);
        // The range runs from the anchor to the clicked row, anchor first.
        if (from >= 0)
          session.selectMany(
            from <= to
              ? ids.slice(from, to + 1)
              : ids.slice(to, from + 1).reverse(),
          );
      } else {
        session.select(id, additive);
        anchor = id;
      }
      active = collectionOf(current(), topLevel(id));
    }
    lastKey = '';
    render();
  };

  let lastClick = { key: '', time: 0 };
  host.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const row = rowOf(target);
    const action = target.closest<HTMLElement>('[data-ol]')?.dataset.ol;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (!row) return;
    host.focus({ preventScroll: true });
    // A second click on the same row's name within 500 ms renames it. (The
    // first click re-renders the tree, so the browser's dblclick would land
    // on a row that is no longer in the page.)
    const rowKey = `${row.dataset.rowKind}:${row.dataset.collectionId ?? row.dataset.layerId ?? ''}`;
    const now = performance.now();
    if (
      !action &&
      event.detail >= 2 &&
      lastClick.key === rowKey &&
      now - lastClick.time < 500
    ) {
      lastClick = { key: '', time: 0 };
      rename(row);
      return;
    }
    lastClick = { key: rowKey, time: now };
    if (action === 'disclose') {
      const id = row.dataset.collectionId ?? row.dataset.layerId!;
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      lastKey = '';
      render();
      return;
    }
    if (action === 'eye' || action === 'lock' || action === 'mute') {
      const layers =
        row.dataset.rowKind === 'collection'
          ? layersIn(current(), row.dataset.collectionId!)
          : [topLevel(row.dataset.layerId!)];
      const lanes = lanesOf(layers);
      if (!lanes.length) return;
      const pressed =
        target
          .closest<HTMLElement>('[data-ol]')!
          .getAttribute('aria-pressed') === 'true';
      setLanes(
        t('outliner.collectionState'),
        layers,
        action === 'eye'
          ? { enabled: pressed }
          : action === 'lock'
            ? { locked: !pressed }
            : { muted: !pressed },
      );
      return;
    }
    click(row, event);
  });
  host.addEventListener('dblclick', (event) => {
    const row = rowOf(event.target);
    if (row && !renaming && !(event.target as HTMLElement).closest('button'))
      rename(row);
  });
  // Registered (document, capture) before the shell's shortcut dispatcher,
  // so Delete, X, F2 and Ctrl+C / V / D act on the outliner while it has
  // focus instead of on the canvas.
  const onKey = (event: KeyboardEvent) => {
    if (!(event.target instanceof Node) || !host.contains(event.target)) return;
    if (event.isComposing) return;
    if ((event.target as HTMLElement).closest('input')) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const row =
      rowOf(document.activeElement) ??
      host.querySelector<HTMLElement>('.outliner-row.active');
    let handled = true;
    if (
      row &&
      (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))
    ) {
      // V7 (spec 10.4): the context menu from the keyboard.
      const box = row.getBoundingClientRect();
      row.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: box.left + 24,
          clientY: box.bottom,
        }),
      );
    } else if (event.key === 'F2' && row) rename(row);
    else if (event.key === 'Delete' || event.key === 'x' || event.key === 'X') {
      if (ctrl) handled = false;
      else deleteSelection();
    } else if (ctrl && event.key.toLowerCase() === 'c') copy();
    else if (ctrl && event.key.toLowerCase() === 'v') paste();
    else if (ctrl && event.key.toLowerCase() === 'd') {
      if (pickedCollections.size === 1)
        duplicateCollection([...pickedCollections][0]!);
      else safely(() => performEdit(engine, session, 'duplicate'));
    } else handled = false;
    // Outliner shortcuts never reach the canvas's.
    if (handled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  listen(document, 'keydown', onKey as EventListener, true);
  add.addEventListener('click', () => newCollection(active));
  search.addEventListener('input', () => {
    lastKey = '';
    render();
  });

  // --- Drag and drop (HTML5, so rows also drop onto scene cards) ---------------
  let dragged: string[] = [];
  let dropTarget: HTMLElement | null = null;
  const clearTarget = () => {
    dropTarget?.classList.remove('drop-into');
    dropTarget = null;
    tip.hidden = true;
  };
  // --- Pointer drag (D-169: no HTML5 drag session that can get stuck) -----------
  let press: {
    row: HTMLElement;
    x: number;
    y: number;
    id: number;
    ghost?: HTMLElement;
  } | null = null;
  const endDrag = () => {
    press?.ghost?.remove();
    clearTarget();
    boardCard?.classList.remove('scene-drop-target');
    boardCard = null;
    press = null;
    dragged = [];
  };
  let boardCard: HTMLElement | null = null;
  const startDrag = (event: PointerEvent) => {
    const row = press!.row;
    const id = row.dataset.collectionId ?? row.dataset.layerId!;
    // A row that is not selected becomes the selection first.
    const inSelection =
      session.selectedIds.includes(id) || pickedCollections.has(id);
    if (!inSelection) click(row, event);
    dragged = [
      ...pickedCollections,
      ...session.selectedIds.filter((item) =>
        scene().layers.some((layer) => layer.id === item),
      ),
    ];
    if (!dragged.length) dragged = [id];
    // Ghost: the type icon and name, or "N objects".
    const ghost = document.createElement('div');
    ghost.className = 'outliner-ghost';
    ghost.innerHTML =
      dragged.length > 1
        ? ''
        : (row.querySelector('.outliner-icon')?.innerHTML ?? '');
    ghost.append(
      dragged.length > 1
        ? t('outliner.objects', { count: dragged.length })
        : (row.querySelector('.outliner-name')?.textContent ?? ''),
    );
    document.body.append(ghost);
    press!.ghost = ghost;
  };
  host.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || press) return;
    const row = rowOf(event.target);
    if (!row?.dataset.dragId) return;
    if ((event.target as HTMLElement).closest('input, button')) return;
    press = { row, x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  listen(window, 'pointermove', (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    if (!press.ghost) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < 4)
        return;
      startDrag(event);
    }
    event.preventDefault();
    press.ghost!.style.left = `${event.clientX + 12}px`;
    press.ghost!.style.top = `${event.clientY + 12}px`;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const row = under && host.contains(under) ? rowOf(under) : null;
    const kind = row?.dataset.rowKind;
    const target = kind === 'collection' || kind === 'root' ? row! : null;
    if (target !== dropTarget) {
      clearTarget();
      dropTarget = target;
      target?.classList.add('drop-into');
    }
    tip.hidden = !target;
    tip.style.left = `${event.clientX + 14}px`;
    tip.style.top = `${event.clientY + 34}px`;
    // A layer may also go onto a scene card on the Scenes board.
    const card =
      under?.closest<HTMLElement>('.scene-card[data-scene-id]') ?? null;
    if (card !== boardCard) {
      boardCard?.classList.remove('scene-drop-target');
      boardCard = card;
      card?.classList.add('scene-drop-target');
    }
  });
  listen(window, 'pointerup', (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    if (!press.ghost) {
      press = null;
      return;
    }
    // The click that follows a drag never selects.
    suppressClick = true;
    setTimeout(() => (suppressClick = false));
    const target = dropTarget;
    const card = boardCard;
    const ids = dragged;
    endDrag();
    if (target)
      moveInto(
        target.dataset.rowKind === 'collection'
          ? target.dataset.collectionId!
          : null,
        ids,
      );
    else if (card) {
      // The board takes a layer the way it always has (a drop carrying the
      // layer type); Alt copies.
      const layerId = ids.find((id) =>
        scene().layers.some((layer) => layer.id === id),
      );
      if (!layerId) return;
      const data = new DataTransfer();
      data.setData(LAYER_DRAG_TYPE, layerId);
      card.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
          altKey: event.altKey,
        }),
      );
    }
  });
  listen(window, 'pointercancel', (event: PointerEvent) => {
    if (press && event.pointerId === press.id) endDrag();
  });
  listen(
    window,
    'keydown',
    (event: KeyboardEvent) => {
      if (press?.ghost && event.key === 'Escape') {
        event.stopPropagation();
        endDrag();
      }
    },
    true,
  );
  listen(window, 'blur', () => press && endDrag());

  // --- Rubber band on empty outliner space ----------------------------------------
  let band: { x: number; y: number; element: HTMLElement; id: number } | null =
    null;
  let suppressClick = false;
  host.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || rowOf(event.target)) return;
    if ((event.target as HTMLElement).closest('input, button')) return;
    const element = document.createElement('div');
    element.className = 'outliner-band';
    document.body.append(element);
    band = { x: event.clientX, y: event.clientY, element, id: event.pointerId };
    host.setPointerCapture(event.pointerId);
  });
  host.addEventListener('pointermove', (event) => {
    if (!band || event.pointerId !== band.id) return;
    const left = Math.min(band.x, event.clientX),
      top = Math.min(band.y, event.clientY);
    const width = Math.abs(event.clientX - band.x),
      height = Math.abs(event.clientY - band.y);
    Object.assign(band.element.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
  });
  const endBand = (event: PointerEvent) => {
    if (!band || event.pointerId !== band.id) return;
    const box = band.element.getBoundingClientRect();
    band.element.remove();
    const moved = box.width > 3 || box.height > 3;
    band = null;
    if (host.hasPointerCapture(event.pointerId))
      host.releasePointerCapture(event.pointerId);
    if (!moved) return;
    suppressClick = true;
    const ids = [
      ...host.querySelectorAll<HTMLElement>('.outliner-row[data-layer-id]'),
    ]
      .filter((row) => {
        const r = row.getBoundingClientRect();
        return r.bottom >= box.top && r.top <= box.bottom;
      })
      .map((row) => row.dataset.layerId!);
    pickedCollections.clear();
    session.selectMany(ids);
  };
  host.addEventListener('pointerup', endBand);
  host.addEventListener('pointercancel', endBand);

  // --- Context menus ---------------------------------------------------------------
  host.addEventListener('contextmenu', (event) => {
    const row = rowOf(event.target);
    if (!row) return;
    event.preventDefault();
    // (Measured now: selecting the row below may redraw it.)
    const box = row.getBoundingClientRect();
    const kind = row.dataset.rowKind;
    let entries: MenuEntry[] = [];
    if (kind === 'root')
      entries = [
        {
          id: 'ol-new',
          icon: 'folderPlus',
          label: t('outliner.newCollection'),
          run: () => newCollection(null),
        },
        {
          id: 'ol-paste',
          icon: 'paste',
          shortcut: 'Ctrl+V',
          label: t('outliner.paste'),
          ...(clipboard
            ? { run: () => paste(null) }
            : { reason: t('outliner.nothingToPaste') }),
        },
      ];
    else if (kind === 'collection') {
      const id = row.dataset.collectionId!;
      if (!pickedCollections.has(id)) click(row, event);
      const layers = () => layersIn(current(), id);
      entries = [
        {
          id: 'ol-new',
          icon: 'folderPlus',
          label: t('outliner.new'),
          run: () => newCollection(id),
        },
        {
          id: 'ol-duplicate',
          icon: 'duplicate',
          shortcut: 'Ctrl+D',
          label: t('outliner.duplicateCollection'),
          run: () => duplicateCollection(id),
        },
        {
          id: 'ol-copy',
          icon: 'copy',
          shortcut: 'Ctrl+C',
          label: t('outliner.copy'),
          run: copy,
        },
        {
          id: 'ol-paste',
          icon: 'paste',
          shortcut: 'Ctrl+V',
          label: t('outliner.paste'),
          ...(clipboard
            ? { run: () => paste(id) }
            : { reason: t('outliner.nothingToPaste') }),
        },
        {
          id: 'ol-delete',
          icon: 'delete',
          shortcut: 'Del',
          label: t('outliner.delete'),
          divider: true,
          run: () => deleteCollections([id]),
        },
        {
          id: 'ol-delete-hierarchy',
          icon: 'layers',
          label: t('outliner.deleteHierarchy'),
          run: () => deleteHierarchy(id),
        },
        {
          id: 'ol-select',
          icon: 'check',
          label: t('outliner.selectObjects'),
          divider: true,
          run: () => session.selectMany(layers()),
        },
        {
          id: 'ol-deselect',
          icon: 'close',
          label: t('outliner.deselectObjects'),
          run: () =>
            session.selectMany(
              session.selectedIds.filter((item) => !layers().includes(item)),
            ),
        },
        {
          id: 'ol-visibility',
          icon: 'eye',
          label: t('outliner.visibility'),
          divider: true,
          submenu: () => [
            {
              id: 'ol-hide-all',
              icon: 'eyeOff',
              label: t('outliner.hideAllShort'),
              run: () =>
                setLanes(t('outliner.collectionState'), layers(), {
                  enabled: false,
                }),
            },
            {
              id: 'ol-show-all',
              icon: 'eye',
              label: t('outliner.showAll'),
              run: () =>
                setLanes(t('outliner.collectionState'), layers(), {
                  enabled: true,
                }),
            },
          ],
        },
        {
          id: 'ol-lock-all',
          icon: 'lock',
          label: t('outliner.lockAllShort'),
          run: () =>
            setLanes(t('outliner.collectionState'), layers(), { locked: true }),
        },
        {
          id: 'ol-unlock-all',
          icon: 'unlock',
          label: t('outliner.unlockAll'),
          run: () =>
            setLanes(t('outliner.collectionState'), layers(), {
              locked: false,
            }),
        },
      ];
    } else {
      const id = row.dataset.layerId!;
      if (!session.selectedIds.includes(id)) click(row, event);
      entries = [
        {
          id: 'ol-rename',
          icon: 'edit',
          shortcut: 'F2',
          label: t('outliner.rename'),
          run: () =>
            rename(
              host.querySelector<HTMLElement>(
                `.outliner-row[data-layer-id="${CSS.escape(id)}"]`,
              ) ?? row,
            ),
        },
        {
          id: 'ol-duplicate',
          icon: 'duplicate',
          shortcut: 'Ctrl+D',
          label: t('outliner.duplicate'),
          run: () => safely(() => performEdit(engine, session, 'duplicate')),
        },
        {
          id: 'ol-copy',
          icon: 'copy',
          shortcut: 'Ctrl+C',
          label: t('outliner.copy'),
          run: copy,
        },
        {
          id: 'ol-delete',
          icon: 'delete',
          shortcut: 'Del',
          label: t('outliner.delete'),
          run: () => safely(() => performEdit(engine, session, 'delete')),
        },
        {
          id: 'ol-show-in-timeline',
          icon: 'timing',
          label: t('outliner.showInTimeline'),
          divider: true,
          run: () =>
            host.dispatchEvent(
              new CustomEvent('outliner-reveal', { detail: id, bubbles: true }),
            ),
        },
      ];
    }
    // V7 (spec 10.4): at the pointer, but below the clicked row (above it
    // when there is no room), so its name stays readable; inside the window.
    menuElement.style.left = `${event.clientX}px`;
    menuElement.style.top = `${Math.max(event.clientY, box.bottom) + 2}px`;
    announceMenu(menuElement);
    menu.open(() => entries);
    menu.fit();
    const placed = menuElement.getBoundingClientRect();
    if (placed.bottom > window.innerHeight - 8 && box.top - placed.height > 8)
      menuElement.style.top = `${box.top - placed.height - 2}px`;
    menuElement.style.left = `${Math.max(
      8,
      Math.min(event.clientX, window.innerWidth - placed.width - 8),
    )}px`;
  });

  return {
    render: () => safely(render),
    dispose: () => {
      endDrag();
      for (const remove of globals.splice(0)) remove();
      tip.remove();
    },
  };
}
