import {
  multiplyMatrices,
  invertMatrix,
  transformPoint,
  vector2,
  pixelToTime,
  createLayer,
  effectiveLayerTiming,
  findClipByLayer,
  findClip,
  type EditorEngine,
  type AffineMatrix,
  type Command,
  type Point2,
  hasAnimation,
} from '../core';
import { locateLayer, type SceneLayer } from '../render/adapter';
import {
  Canvas2DRenderer,
  fitViewport,
  type CompositionRenderer,
} from '../render/canvas';
import { renderInspector } from './inspector';
import { mountMediaPanel } from './media-panel';
import { openExportDialog } from './export-dialog';
import { drawComposition } from '../render/canvas';
import {
  AudioDecoder,
  AudioEngine,
  MediaFrames,
  MediaPreviews,
  WaveformCache,
  openMediaStore,
  listAudibleClips,
  type AudibleClip,
  type MediaStore,
  type PreviewAsset,
} from '../media';
import { bindCanvasInteraction } from './canvas-interaction';
import { TransformInteraction } from './transform-interaction';
import { EditorSession } from './session';
import { mountTimeline } from './timeline';
import { mountWorkspace } from './workspace';
import { DrawTool } from './draw-tool';
import { mountDrawPanel } from './draw-panel';
import { mountContextToolbar } from './context-toolbar';
import { mountAnimationPanel } from './animation-panel';
import { mountAnimatePanel } from './animate-panel';
import { canvasMenuEntries } from './canvas-menu';
import { createMenu } from './context-menu';
import { mountSelectionActions } from './selection-actions';
import { multiSelectionBox, selectionGeometry } from '../render/selection';
import { performEdit, planLanding, trackForNewClip } from './editing';
import { iconSvg } from './icons';
import { openModal } from './components/modal';
import { showToast } from './components/toast';
import { mountNewProjectForm } from './new-project-form';
import { bindShortcuts } from '../commands/shortcuts';
import { mountShortcutSheet } from './shortcut-sheet';
import { runCommand, type CommandContext } from '../commands/registry';
import { mountCommandPalette } from './command-palette';
import { closeTopOverlay, registerExternalOverlay } from './temporary-overlay';
import {
  t,
  formatNumber,
  getLanguage,
  setLanguage,
  subscribe,
  bindDomTranslations,
} from '../i18n';

const RAIL_CATEGORIES = [
  'Media',
  'Graphics',
  'Text',
  'Templates',
  'Audio',
  'Elements',
  'Draw',
  'Transitions',
  'Scene',
] as const;
const RAIL_ICONS: Record<(typeof RAIL_CATEGORIES)[number], string> = {
  Media: 'media',
  Graphics: 'graphics',
  Text: 'text',
  Templates: 'templates',
  Audio: 'audio',
  Elements: 'elements',
  Draw: 'pen',
  Transitions: 'transitions',
  Scene: 'group',
};
const RIGHT_SECTIONS = [
  'Properties',
  'Effects',
  'Transitions',
  'Color',
  'Audio',
  'Speed',
] as const;
const RIGHT_ICONS: Record<(typeof RIGHT_SECTIONS)[number], string> = {
  Properties: 'properties',
  Effects: 'effects',
  Transitions: 'transitions',
  Color: 'color',
  Audio: 'audio',
  Speed: 'speed',
};

export interface ShellActions {
  save?: () => void;
  exportProject?: () => void;
  importProject?: (file: File) => Promise<void>;
  openExample?: () => void | Promise<void>;
  /** The media byte store (D-004); defaults to OPFS, then IndexedDB. */
  mediaStore?: Promise<MediaStore | null>;
}
export function mountEditorShell(
  root: HTMLElement,
  engine: EditorEngine,
  actions: ShellActions = {},
  renderer: CompositionRenderer = new Canvas2DRenderer(),
) {
  const categoryKey = (name: string) => `library.${name.toLowerCase()}`;
  const railButton = (name: string, icon: string, pressed: boolean) =>
    `<button type="button" data-category="${name}" aria-pressed="${pressed}" title="${t(categoryKey(name))}">${iconSvg(icon)}<span class="icon-rail-label">${t(categoryKey(name))}</span></button>`;
  const sectionKey = (name: string) => `panel.${name.toLowerCase()}`;
  const rightRailButton = (name: string, icon: string, pressed: boolean) =>
    `<button type="button" data-section="${name}" aria-pressed="${pressed}" title="${name === 'Properties' ? t('panel.properties') : t(sectionKey(name))}">${iconSvg(icon)}<span class="icon-rail-label">${name === 'Properties' ? t('panel.properties') : t(sectionKey(name))}</span></button>`;
  root.innerHTML = `
    <div class="editor-shell">
      <header class="topbar">
        <button type="button" id="menu-trigger" class="icon-button menu-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="app-menu" aria-label="${t('menu.main')}" title="${t('menu.main')}">${iconSvg('menu')}</button>
        <div class="brand"><span class="brand-mark" aria-hidden="true">N</span><strong>${t('app.title')}</strong><span class="brand-divider"></span><span class="product-mode">${t('app.mode')}</span></div>
        <div class="project-title">
          <span class="project-dot" id="save-status-dot" aria-hidden="true"></span>
          <span id="project-name" tabindex="0" role="button" aria-label="${t('project.renameLabel')}"></span>
          <input type="text" id="project-name-input" class="project-name-field" aria-label="${t('project.name')}" hidden />
          <span class="save-status" id="save-status-text"></span>
        </div>
        <div class="top-actions">
          <button type="button" id="undo" class="icon-button" aria-label="${t('action.undo')}" title="${t('action.undo')}">${iconSvg('undo')}</button>
          <button type="button" id="redo" class="icon-button" aria-label="${t('action.redo')}" title="${t('action.redo')}">${iconSvg('redo')}</button>
          <button type="button" id="export" class="primary">${iconSvg('export')}${t('action.export')}</button>
        </div>
      </header>
      <div class="app-menu" id="app-menu" role="menu" hidden>
        <div class="app-menu-group" role="group" aria-label="${t('menu.file')}">
          <div class="app-menu-label">${t('menu.file')}</div>
          <button type="button" id="new-project" role="menuitem">${iconSvg('templates')}${t('project.new')}</button>
          <button type="button" id="example" role="menuitem">${iconSvg('open')}${t('action.example')}</button>
          <label class="button" role="menuitem" id="open-project-label">${iconSvg('open')}${t('action.open')}<input id="import" type="file" accept="application/json,.json" /></label>
          <button type="button" id="save" role="menuitem">${iconSvg('save')}${t('action.save')}</button>
          <button type="button" id="export-json" role="menuitem">${iconSvg('export')}${t('action.exportJson')}</button>
        </div>
        <div class="app-menu-group" role="group" aria-label="${t('menu.view')}">
          <div class="app-menu-label">${t('menu.view')}</div>
          <button type="button" id="open-palette" role="menuitem">${iconSvg('search')}${t('palette.title')}<span class="shortcut-hint">Ctrl+K</span></button>
          <button type="button" id="language-toggle" role="menuitem">${iconSvg('properties')}<span id="language-toggle-label"></span></button>
        </div>
        <div class="app-menu-group" role="group" aria-label="${t('menu.help')}">
          <div class="app-menu-label">${t('menu.help')}</div>
          <button type="button" id="open-shortcuts" role="menuitem">${iconSvg('info')}${t('shortcuts.title')}<span class="shortcut-hint">Ctrl+/</span></button>
          <button type="button" id="about" role="menuitem">${iconSvg('info')}${t('menu.about')}</button>
        </div>
      </div>
      <nav class="icon-rail" id="rail-left" aria-label="${t('library.categories')}">${RAIL_CATEGORIES.map((name) => railButton(name, RAIL_ICONS[name], name === 'Scene')).join('')}</nav>
      <aside class="library panel" aria-label="${t('library.title')}">
        <div class="library-tabs" id="media-source-tabs">
          <button type="button" data-source="project" aria-pressed="true">${t('library.projectMedia')}</button>
          <button type="button" data-source="stock" aria-pressed="false">${t('library.stock')}</button>
        </div>
        <div class="library-search">
          ${iconSvg('search')}
          <input type="text" id="asset-search" placeholder="${t('library.searchPlaceholder')}" aria-label="${t('library.searchPlaceholder')}" />
        </div>
        <div class="import-row"><button type="button" class="button primary" id="import-media" title="${t('media.importButton')}">${iconSvg('export')}${t('library.import')}</button><input type="file" id="import-media-input" multiple accept="video/*,audio/*,image/*,.mov,.m4a,.mkv,.svg" hidden /></div>
        <div class="media-panel" id="media-panel" hidden></div>
        <div class="library-placeholder"><div class="placeholder-icon" aria-hidden="true">${iconSvg('info', 22)}</div><h3 id="library-title">${t('library.assetsTitle')}</h3><p id="library-description">${t('library.assetsDescription')}</p><span class="quiet-tag">${t('library.later')}</span></div>
        <div class="draw-panel" id="draw-panel" hidden></div>
        <div class="scene-heading" id="scene-heading"><h2>${t('scene.title')}</h2><span id="layer-count" class="count"></span></div>
        <div id="scene-list" class="scene-list" aria-label="${t('scene.layers')}"></div>
        <div class="library-footer"><span class="local-dot"></span> ${t('app.local')} <span class="milestone">${t('app.wave')}</span></div>
      </aside>
      <main class="preview-panel" aria-label="${t('canvas.preview')}">
        <div class="preview-toolbar">
          <div class="composition-picker">${iconSvg('templates', 15)}<select id="composition" aria-label="${t('canvas.composition')}"></select></div>
          <div class="canvas-zoom-controls">
            <button type="button" class="icon-button" data-canvas-zoom="out" aria-label="${t('canvas.zoomOut')}" title="${t('canvas.zoomOut')}">${iconSvg('zoomOut')}</button>
            <button type="button" data-canvas-zoom="fit" title="${t('canvas.fit')}">${iconSvg('fit')}${t('canvas.fit')}</button>
            <button type="button" class="icon-button" data-canvas-zoom="in" aria-label="${t('canvas.zoomIn')}" title="${t('canvas.zoomIn')}">${iconSvg('zoomIn')}</button>
          </div>
        </div>
        <div class="canvas-stage" id="canvas-stage"><div class="context-toolbar" id="context-toolbar" hidden></div><div class="animate-panel" id="animate-panel" hidden></div><canvas id="composition-canvas" tabindex="0" aria-label="${t('canvas.help')}">${t('canvas.fallback')}</canvas><div class="canvas-empty" id="canvas-empty" hidden><h3>${t('canvas.emptyTitle')}</h3><p>${t('canvas.emptyDescription')}</p></div><div class="selection-actions" id="selection-actions" hidden></div><div class="canvas-context-menu" id="canvas-context-menu" role="menu" hidden></div><div class="buffering-indicator" id="buffering-indicator" role="status" hidden>${t('canvas.buffering')}</div></div>
        <div class="preview-footer"><span id="composition-summary"></span><span id="selection-summary" role="status">${t('selection.none')}</span><span id="zoom">${t('canvas.fit')}</span><button type="button" class="icon-button" id="fullscreen-preview" aria-label="${t('canvas.fullscreen')}" title="${t('canvas.fullscreen')}" disabled>${iconSvg('fullscreen')}</button></div>
        <p class="render-warning" id="render-warning" role="status" hidden></p>
      </main>
      <aside class="inspector panel" aria-label="${t('inspector.title')}">
        <div id="inspector-content"></div>
        <section class="animation-panel" id="animation-panel" aria-label="${t('animation.title')}" hidden></section>
        <div id="right-panel-empty" class="inspector-empty" hidden><h3 id="right-panel-empty-title"></h3><p id="right-panel-empty-description"></p><span class="quiet-tag">${t('library.later')}</span></div>
      </aside>
      <nav class="icon-rail icon-rail-right" id="rail-right" aria-label="${t('inspector.title')}">${RIGHT_SECTIONS.map((name) => rightRailButton(name, RIGHT_ICONS[name], name === 'Properties')).join('')}</nav>
      <section class="timeline" aria-label="${t('timeline.title')}"><div class="timeline-header"><div class="timeline-label"><h2>${t('timeline.title')}</h2></div></div><div id="timeline-foundation"></div></section>
      <footer class="statusbar"><span id="status" role="status" aria-live="polite">${t('status.ready')}</span><span>${t('app.wave')} <span class="status-separator">·</span> ${t('app.shellStatus')}</span></footer>
      <div class="drop-overlay" id="drop-overlay" hidden>${t('drop.overlay')}</div>
    </div>`;

  const element = <T extends HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const session = new EditorSession(engine, renderer.measureText);
  const canvas = element<HTMLCanvasElement>('#composition-canvas');
  const stage = element('#canvas-stage');
  let disposed = false;
  const message = (text: string) => {
    element('#status').textContent = text;
  };
  // Refused or failed edits must be noticed, not just logged in the status bar.
  const reportError = (error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    message(text);
    showToast(text, 'error');
  };
  const safely = (action: () => void | Promise<void>) => {
    try {
      const result = action();
      if (result && typeof (result as Promise<void>).then === 'function')
        (result as Promise<void>).catch(reportError);
    } catch (error) {
      reportError(error);
    }
  };
  const mediaStore = actions.mediaStore ?? openMediaStore();
  const previews = new MediaPreviews(mediaStore);
  const mediaAssets = () =>
    session.source.assets as unknown as readonly PreviewAsset[];
  const decoder = new AudioDecoder(mediaStore, mediaAssets);
  const waveforms = new WaveformCache(mediaStore, decoder, mediaAssets);
  const mediaPanel = mountMediaPanel({
    container: element('#media-panel'),
    engine,
    session,
    store: mediaStore,
    previews,
    waveforms,
    imported: () => frames.retry(),
    toast: (text, kind) => showToast(text, kind),
  });
  // W4-C: every clip that can sound, flattened from the canonical composition.
  const audibleClips = (): AudibleClip[] =>
    listAudibleClips(
      session.source.composition,
      mediaAssets(),
      session.soloTrackIds,
    );
  // W4-B: decoded frames arrive asynchronously; coalesce their redraws per frame.
  let redrawQueued = false;
  const audio = new AudioEngine(decoder, () => {
    if (!disposed) safely(draw);
  });
  const frames = new MediaFrames(
    mediaStore,
    () => session.source.assets as unknown as readonly PreviewAsset[],
    () => {
      if (redrawQueued || disposed) return;
      redrawQueued = true;
      requestAnimationFrame(() => {
        redrawQueued = false;
        safely(draw);
      });
    },
  );
  const viewport = () => {
    const view = fitViewport(
      Math.max(1, canvas.clientWidth || stage.clientWidth),
      Math.max(1, canvas.clientHeight || stage.clientHeight),
      session.source.composition,
      window.devicePixelRatio || 1,
    );
    const z = session.canvasZoom;
    const centered: AffineMatrix = [
      z,
      0,
      0,
      z,
      (view.width * (1 - z)) / 2,
      (view.height * (1 - z)) / 2,
    ];
    return { ...view, matrix: multiplyMatrices(centered, view.matrix) };
  };
  let timeline: ReturnType<typeof mountTimeline> | undefined;
  let lastAudio: {
    time: number;
    project: unknown;
    composition: string;
  } | null = null;
  const syncAudio = () => {
    const clock = timeline?.playback.clock ?? session.currentTime;
    const clips = audibleClips();
    audio.sync(session.playing, clock, clips);
    // PB-011: a paused playhead that moved (and nothing else) plays a snippet.
    if (
      !session.playing &&
      lastAudio &&
      lastAudio.project === engine.state &&
      lastAudio.composition === session.source.composition.id &&
      lastAudio.time !== session.currentTime
    )
      audio.scrub(session.currentTime, clips);
    lastAudio = {
      time: session.currentTime,
      project: engine.state,
      composition: session.source.composition.id,
    };
  };
  let selectionActions: ReturnType<typeof mountSelectionActions> | undefined;
  const draw = () => {
    if (disposed) return;
    syncAudio();
    frames.beginFrame(
      session.playing
        ? (timeline?.playback.clock ?? session.currentTime) -
            session.currentTime
        : 0,
    );
    const report = renderer.render(
      canvas,
      {
        ...session.source,
        frames,
        playing: session.playing,
        animate: true,
        ...(timeline?.controller.previews.length
          ? { timingPreviews: timeline.controller.previews }
          : {}),
        ...(interaction.previews ? { previews: interaction.previews } : {}),
        ...(timeline?.controller.preview
          ? { timingPreview: timeline.controller.preview }
          : {}),
        ...(interaction.preview ? { preview: interaction.preview } : {}),
        ...(interaction.guides.length ? { guides: interaction.guides } : {}),
        ...(drawTool.preview ? { drawing: drawTool.preview } : {}),
        ...(interaction.hoveredHandle !== null
          ? { hoveredHandle: interaction.hoveredHandle }
          : {}),
      },
      viewport(),
      session.selectedId,
    );
    frames.endFrame();
    updateSelectionActions();
    // PB-009: a visible video without a current frame during playback.
    element('#buffering-indicator').hidden = !(
      session.playing && frames.buffering
    );
    element('#zoom').textContent = t('canvas.zoom', {
      zoom: formatNumber(Math.round(report.zoom * 100)),
    });
    const warning = element('#render-warning');
    warning.hidden = report.warnings.length === 0;
    warning.textContent = report.warnings.join(' ');
  };
  const interaction = new TransformInteraction(engine, session, () =>
    safely(draw),
  );
  const drawTool = new DrawTool(engine, session, () => safely(draw));
  // W5-B: the Inspector's Animation section (stopwatches and keyframes).
  const animationPanel = mountAnimationPanel(
    element('#animation-panel'),
    engine,
    session,
    reportError,
  );
  // W5-C: animation presets, opened from the toolbar's Animate button.
  const animatePanel = mountAnimatePanel(
    element('#animate-panel'),
    engine,
    session,
    reportError,
    registerExternalOverlay,
  );
  // CV-035: the selected layer's context toolbar above the canvas.
  const contextToolbar = mountContextToolbar(
    element('#context-toolbar'),
    engine,
    session,
    (field, value) => interaction.edit(field, value),
    reportError,
    () => animatePanel.toggle(),
  );
  const canvasMenu = element('#canvas-context-menu');
  // W2-F1: the canvas menu is built from the selection's capabilities and
  // rendered by the shared menu (context-menu.ts).
  let unregisterCanvasMenu: (() => void) | undefined;
  const canvasMenuController = createMenu(canvasMenu, {
    report: reportError,
    onClose: () => {
      unregisterCanvasMenu?.();
      unregisterCanvasMenu = undefined;
    },
  });
  const hideCanvasMenu = () => canvasMenuController.close();
  const openCanvasMenu = (point: Point2, layerId: string | null) => {
    const entries = canvasMenuEntries(engine, session, !!layerId);
    canvasMenuController.open(() =>
      canvasMenuEntries(engine, session, !!layerId),
    );
    if (!entries.length) canvasMenuController.close();
    const bounds = stage.getBoundingClientRect();
    canvasMenu.style.left = `${Math.max(0, Math.min(bounds.width - 170, point[0]))}px`;
    canvasMenu.style.top = `${Math.max(0, Math.min(bounds.height - 40, point[1]))}px`;
    unregisterCanvasMenu ??= registerExternalOverlay(hideCanvasMenu);
  };
  document.addEventListener('click', (event) => {
    if (!canvasMenu.hidden && !canvasMenu.contains(event.target as Node))
      hideCanvasMenu();
  });
  // CV-040: the action cluster follows the selection box, and hides while
  // dragging, drawing or playing so it never covers the object being edited.
  selectionActions = mountSelectionActions(
    element('#selection-actions'),
    engine,
    session,
    {
      openMenu: (point) => openCanvasMenu(point, session.selectedId),
      report: reportError,
    },
  );
  function updateSelectionActions() {
    if (!selectionActions) return;
    if (
      session.playing ||
      drawTool.active ||
      interaction.active ||
      !session.selectedIds.length
    )
      return selectionActions.update(null, stage.getBoundingClientRect());
    const source = {
      ...session.source,
      ...(interaction.previews ? { previews: interaction.previews } : {}),
    };
    const view = viewport().matrix;
    const corners =
      multiSelectionBox(source, view)?.corners ??
      selectionGeometry(source, session.selectedId, view)?.corners;
    if (!corners?.length)
      return selectionActions.update(null, stage.getBoundingClientRect());
    const xs = corners.map((point) => point[0] + canvas.offsetLeft),
      ys = corners.map((point) => point[1] + canvas.offsetTop);
    selectionActions.update(
      {
        left: Math.min(...xs),
        top: Math.min(...ys),
        right: Math.max(...xs),
        bottom: Math.max(...ys),
      },
      stage.getBoundingClientRect(),
    );
  }
  const pointer = bindCanvasInteraction(
    canvas,
    session,
    interaction,
    viewport,
    reportError,
    (action) => performEdit(engine, session, action),
    true,
    openCanvasMenu,
    drawTool,
  );
  const commandContext: CommandContext = {
    engine,
    session,
    ...(actions.save ? { save: actions.save } : {}),
    togglePlayback: () =>
      element<HTMLButtonElement>('[data-action="play"]').click(),
  };
  let renderedProject: unknown;
  let renderedSelection = '';
  const refresh = (force = false) => {
    drawPanel.sync();
    canvas.classList.toggle('drawing', session.drawBrush !== null);
    const source = session.source;
    // W5-B: an animated selection shows time-dependent values, so the Inspector
    // and toolbar re-render when the playhead moves (not every frame of playback).
    const animatedSelection =
      !session.playing &&
      session.selectedIds.some((id) => {
        const found = locateLayer(source.composition.layers, id);
        return !!found && hasAnimation(found.layer);
      });
    const identity = JSON.stringify([
      source.composition.id,
      session.selectedIds,
      animatedSelection ? session.currentTime : null,
    ]);
    if (
      !force &&
      renderedProject === engine.state &&
      renderedSelection === identity
    ) {
      const current = root.querySelector('[data-field="Current time"]');
      if (current) current.textContent = formatNumber(session.currentTime);
      const layer = session.selectedId
        ? locateLayer(source.composition.layers, session.selectedId)?.layer
        : null;
      if (layer)
        for (const button of root.querySelectorAll<HTMLButtonElement>(
          '.keyframe-button',
        )) {
          const key = button.dataset.key as
            'position' | 'scale' | 'rotation' | 'opacity';
          const exists = layer.transform[key].keyframes.some(
            (frame) => frame.time === session.currentTime,
          );
          button.innerHTML = iconSvg(
            exists ? 'diamondFilled' : 'diamondOutline',
            14,
          );
          button.title = t(exists ? 'keyframe.remove' : 'keyframe.add');
          button.setAttribute(
            'aria-label',
            t(exists ? 'keyframe.removeField' : 'keyframe.addField', {
              field: button.dataset.fieldName ?? '',
            }),
          );
        }
      // ANI-005: keyframe markers follow the playhead (not every frame while playing).
      if (!session.playing && !element('#inspector-content').hidden)
        animationPanel.render();
      draw();
      return;
    }
    renderedProject = engine.state;
    renderedSelection = identity;
    contextToolbar.render();
    if (!element('#inspector-content').hidden) animationPanel.render();
    element('#project-name').textContent = engine.state.metadata.name;
    const picker = element<HTMLSelectElement>('#composition');
    picker.replaceChildren(
      ...engine.state.compositions.map((composition) => {
        const option = document.createElement('option');
        option.value = composition.id;
        option.textContent = composition.name;
        return option;
      }),
    );
    picker.value = source.composition.id;
    element('#composition-summary').textContent = t('canvas.summary', {
      width: formatNumber(source.composition.width),
      height: formatNumber(source.composition.height),
      fps: formatNumber(source.composition.fps),
    });
    const selected = session.selectedId
      ? locateLayer(source.composition.layers, session.selectedId)
      : null;
    element('#selection-summary').textContent =
      session.selectedIds.length > 1
        ? t('selection.count', { count: session.selectedIds.length })
        : selected
          ? t('selection.one', { name: selected.layer.name })
          : t('selection.none');
    const list = element('#scene-list');
    const focusedId =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.layerId
        : undefined;
    list.replaceChildren();
    let count = 0;
    // Front-first (owner decision, LYR-002): the topmost layer is the first row;
    // layers later in the array paint on top, so each sibling level is reversed.
    const appendLayers = (layers: readonly SceneLayer[], depth: number) => {
      for (const layer of [...layers].reverse()) {
        count++;
        const button = document.createElement('button');
        button.className = 'scene-row';
        button.dataset.layerId = layer.id;
        button.style.paddingLeft = `${14 + depth * 14}px`;
        button.setAttribute(
          'aria-pressed',
          String(session.selectedIds.includes(layer.id)),
        );
        button.title = `${layer.name} (${layer.type})`;
        const icon = document.createElement('span');
        icon.className = 'layer-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = iconSvg(
          layer.type === 'group'
            ? 'group'
            : layer.type === 'text'
              ? 'text'
              : layer.type === 'audio'
                ? 'audio'
                : layer.type === 'image'
                  ? 'image'
                  : layer.type === 'shape'
                    ? 'elements'
                    : 'media',
          14,
        );
        const label = document.createElement('span');
        label.className = 'scene-name';
        label.textContent = layer.name;
        button.append(icon, label);
        button.onclick = (event) =>
          session.select(
            layer.id,
            event.shiftKey || event.ctrlKey || event.metaKey,
          );
        list.append(button);
        appendLayers(layer.children, depth + 1);
      }
    };
    appendLayers(source.composition.layers, 0);
    if (!count) {
      const empty = document.createElement('p');
      empty.className = 'scene-empty';
      empty.textContent = t('scene.empty');
      list.append(empty);
    }
    if (focusedId)
      [...list.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.dataset.layerId === focusedId)
        ?.focus({ preventScroll: true });
    element('#layer-count').textContent = formatNumber(count);
    mediaPanel.render();
    element('#canvas-empty').hidden = count !== 0;
    renderInspector(
      element('#inspector-content'),
      source,
      session.selectedId,
      (field, value) => {
        safely(() => {
          if (session.selectedIds.length > 1)
            throw new Error(t('selection.single'));
          interaction.edit(field, value);
        });
        refresh(true);
      },
      (field, value) => {
        safely(() => {
          session.setPlaying(false);
          if (!selected) return;
          const layer = selected.layer;
          const clip = findClipByLayer(source.composition, layer.id);
          const timing = effectiveLayerTiming(source.composition, layer);
          if (
            value ===
            (field === 'Start time' ? timing.startTime : timing.duration)
          )
            return;
          engine.commands.transaction('Edit timing', [
            clip
              ? {
                  type: 'SET_CLIP_TIMING',
                  compositionId: source.composition.id,
                  clipId: clip.clip.id,
                  startTime: field === 'Start time' ? value : timing.startTime,
                  duration: field === 'Duration' ? value : timing.duration,
                  sourceIn: clip.clip.sourceIn,
                  sourceOut:
                    field === 'Duration'
                      ? clip.clip.sourceIn + value * clip.clip.speed
                      : clip.clip.sourceOut,
                }
              : {
                  type: 'SET_LAYER_TIMING',
                  compositionId: source.composition.id,
                  layerId: layer.id,
                  startTime: field === 'Start time' ? value : timing.startTime,
                  duration: field === 'Duration' ? value : timing.duration,
                },
          ]);
        });
        refresh(true);
      },
      (key, _remove) => {
        safely(() => {
          session.setPlaying(false);
          const remove =
            selected?.layer.transform[key].keyframes.some(
              (frame) => frame.time === session.currentTime,
            ) ?? false;
          if (selected)
            engine.commands.transaction(
              remove ? 'Remove keyframe' : 'Add keyframe',
              [
                {
                  type: remove ? 'REMOVE_KEYFRAME' : 'SET_KEYFRAME',
                  compositionId: source.composition.id,
                  layerId: selected.layer.id,
                  key,
                  time: session.currentTime,
                },
              ],
            );
        });
        refresh(true);
      },
    );
    element<HTMLButtonElement>('#undo').disabled = !engine.canUndo;
    element<HTMLButtonElement>('#redo').disabled = !engine.canRedo;
    draw();
  };
  timeline = mountTimeline(
    element('#timeline-foundation'),
    engine,
    session,
    () => safely(draw),
    reportError,
    true,
    previews,
    waveforms,
  );
  const unsubscribe = session.onChange(refresh);
  element<HTMLSelectElement>('#composition').onchange = (event) =>
    session.selectComposition((event.target as HTMLSelectElement).value);
  element<HTMLButtonElement>('#undo').onclick = () =>
    safely(() => {
      runCommand('undo', commandContext);
    });
  element<HTMLButtonElement>('#redo').onclick = () =>
    safely(() => {
      runCommand('redo', commandContext);
    });
  const fullscreenButton = element<HTMLButtonElement>('#fullscreen-preview');
  fullscreenButton.disabled = !document.fullscreenEnabled;
  fullscreenButton.onclick = () =>
    safely(() =>
      document.fullscreenElement
        ? document.exitFullscreen()
        : stage.requestFullscreen(),
    );
  // APP-015 / W5-A: the primary Export button opens the Export dialog.
  const renderFrame = () => {
    const { width, height } = session.source.composition;
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const context = frameCanvas.getContext('2d');
    if (!context) return Promise.reject(new Error('Canvas 2D is unavailable'));
    drawComposition(
      context,
      { ...session.source, frames, playing: false, animate: true },
      { width, height, pixelRatio: 1, matrix: [1, 0, 0, 1, 0, 0] },
      null,
      { overlays: false },
    );
    return new Promise<Blob>((resolve, reject) =>
      frameCanvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG failed'))),
        'image/png',
      ),
    );
  };
  const openExport = () => {
    session.setPlaying(false);
    openExportDialog({
      composition: session.source.composition,
      assets: session.source.assets,
      background: session.source.background,
      projectName: engine.state.metadata.name,
      store: mediaStore,
      decoder,
      renderFrame,
      toast: (text, kind) => showToast(text, kind),
    });
  };
  element<HTMLButtonElement>('#export').onclick = () => safely(openExport);
  for (const [id, action] of [
    ['#save', actions.save],
    ['#export-json', actions.exportProject],
    ['#example', actions.openExample],
  ] as const) {
    const button = element<HTMLButtonElement>(id);
    button.disabled = !action;
    button.onclick = () =>
      safely(() => {
        action?.();
      });
  }
  const input = element<HTMLInputElement>('#import');
  input.disabled = !actions.importProject;
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await actions.importProject?.(file);
    } catch (error) {
      message(t('status.openFailed', { error: String(error) }));
    } finally {
      input.value = '';
    }
  };
  const descriptions: Record<string, [string, string]> = {
    Media: ['library.assetsTitle', 'library.assetsDescription'],
    Graphics: ['library.graphicsTitle', 'library.graphicsDescription'],
    Text: ['library.textTitle', 'library.textDescription'],
    Templates: ['library.templatesTitle', 'library.templatesDescription'],
    Audio: ['library.audioTitle', 'library.audioDescription'],
    Elements: ['library.elementsTitle', 'library.elementsDescription'],
    Transitions: ['library.transitionsTitle', 'library.transitionsDescription'],
  };
  const mediaOnly = [
    element('#media-source-tabs'),
    element('.library-search'),
    element('.import-row'),
    element('#media-panel'),
  ];
  const sceneOnly = [element('#scene-heading'), element('#scene-list')];
  // SHP-018: the Draw category; leaving it leaves draw mode.
  const drawPanel = mountDrawPanel(
    element('#draw-panel'),
    session,
    reportError,
  );
  let activeCategory = 'Scene';
  const applyCategory = (category: string) => {
    for (const sibling of root.querySelectorAll('[data-category]'))
      sibling.setAttribute(
        'aria-pressed',
        String(sibling.getAttribute('data-category') === category),
      );
    const isMedia = category === 'Media';
    const isScene = category === 'Scene';
    const isDraw = category === 'Draw';
    for (const el of mediaOnly) el.hidden = !isMedia;
    for (const el of sceneOnly) el.hidden = !isScene;
    element('#draw-panel').hidden = !isDraw;
    if (!isDraw) session.setDrawBrush(null);
    element('.library-placeholder').hidden = isMedia || isScene || isDraw;
    if (!isScene && !isDraw) {
      const [titleKey, descriptionKey] = descriptions[category]!;
      element('#library-title').textContent = t(titleKey);
      element('#library-description').textContent = t(descriptionKey);
    }
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '[data-category]',
  ))
    button.onclick = () => {
      activeCategory = button.dataset.category!;
      applyCategory(activeCategory);
    };
  const searchInput = element<HTMLInputElement>('#asset-search');
  searchInput.oninput = () => mediaPanel.filter(searchInput.value);
  // MED-001/MED-002: the Import button and OS file drops both import into Project Media.
  const importMedia = (files: readonly File[]) => {
    if (!files.length) return;
    activeCategory = 'Media';
    applyCategory(activeCategory);
    safely(() => mediaPanel.importFiles(files));
  };
  const mediaInput = element<HTMLInputElement>('#import-media-input');
  element<HTMLButtonElement>('#import-media').onclick = () =>
    mediaInput.click();
  mediaInput.onchange = () => {
    const files = [...(mediaInput.files ?? [])];
    mediaInput.value = '';
    importMedia(files);
  };

  // Right panel: shared "section" state driven by both the tab row and the icon rail.
  const rightEmpty = element('#right-panel-empty');
  const rightDescriptions: Record<string, [string, string]> = {
    Effects: ['panel.effectsTitle', 'panel.effectsDescription'],
    Transitions: ['panel.transitionsTitle', 'panel.transitionsDescription'],
    Color: ['panel.colorTitle', 'panel.colorDescription'],
    Audio: ['panel.audioTitle', 'panel.audioDescription'],
    Speed: ['panel.speedTitle', 'panel.speedDescription'],
  };
  let activeSection = 'Properties';
  const setRightSection = (name: string) => {
    activeSection = name;
    for (const el of root.querySelectorAll<HTMLElement>(
      '.icon-rail-right button',
    ))
      el.setAttribute('aria-pressed', String(el.dataset.section === name));
    const isProperties = name === 'Properties';
    element('#inspector-content').hidden = !isProperties;
    element('#animation-panel').hidden = true;
    if (isProperties) animationPanel.render();
    rightEmpty.hidden = isProperties;
    if (!isProperties) {
      const [titleKey, descriptionKey] = rightDescriptions[name] ?? ['', ''];
      element('#right-panel-empty-title').textContent = titleKey
        ? t(titleKey)
        : '';
      element('#right-panel-empty-description').textContent = descriptionKey
        ? t(descriptionKey)
        : '';
    }
  };
  for (const el of root.querySelectorAll<HTMLElement>(
    '.icon-rail-right button',
  ))
    el.onclick = () => setRightSection(el.dataset.section!);

  // Hamburger menu: open/close, outside click, Esc, focus handling.
  // Registered into the shared overlay stack (temporary-overlay.ts) so the global
  // Escape handler closes the menu instead of falling through to canvas deselect.
  const menuTrigger = element<HTMLButtonElement>('#menu-trigger');
  const appMenu = element('#app-menu');
  let unregisterMenu: (() => void) | undefined;
  const closeMenu = () => {
    if (appMenu.hidden) return;
    appMenu.hidden = true;
    menuTrigger.setAttribute('aria-expanded', 'false');
    unregisterMenu?.();
    unregisterMenu = undefined;
  };
  menuTrigger.onclick = () => {
    const opening = appMenu.hidden;
    appMenu.hidden = !opening;
    menuTrigger.setAttribute('aria-expanded', String(opening));
    if (opening) {
      unregisterMenu = registerExternalOverlay(closeMenu);
      requestAnimationFrame(() =>
        appMenu.querySelector<HTMLElement>('button')?.focus(),
      );
    }
  };
  document.addEventListener('click', (event) => {
    if (
      !appMenu.hidden &&
      !appMenu.contains(event.target as Node) &&
      event.target !== menuTrigger &&
      !menuTrigger.contains(event.target as Node)
    )
      closeMenu();
  });
  for (const button of appMenu.querySelectorAll('button'))
    button.addEventListener('click', () => closeMenu());
  element<HTMLButtonElement>('#about').onclick = () => {
    openModal({
      titleText: t('menu.about'),
      bodyHtml: `<p class="modal-message">${t('about.body', { version: String(engine.state.schemaVersion) })}</p>`,
    });
  };

  // Project rename: click or Enter/Space on the name to edit; Enter commits, Esc cancels.
  // The display span stays in the DOM (hidden, not removed) so refresh() can always
  // update it safely even if a rename is triggered concurrently with a state change.
  const nameDisplay = element<HTMLSpanElement>('#project-name');
  const nameInput = element<HTMLInputElement>('#project-name-input');
  const startRename = () => {
    const current = engine.state.metadata.name;
    nameInput.value = current;
    nameDisplay.hidden = true;
    nameInput.hidden = false;
    nameInput.focus();
    nameInput.select();
    const commit = () => {
      const next = nameInput.value.trim();
      nameInput.hidden = true;
      nameDisplay.hidden = false;
      if (next && next !== current)
        safely(() => {
          engine.commands.transaction('Rename project', [
            { type: 'SET_PROJECT_NAME', name: next },
          ]);
          showToast(t('project.renamed'), 'success', 2000);
        });
    };
    nameInput.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        nameInput.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        nameInput.value = current;
        nameInput.blur();
      }
    };
    nameInput.onblur = commit;
  };
  nameDisplay.addEventListener('click', startRename);
  nameDisplay.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      startRename();
    }
  });

  // Drop overlay: shown while an OS file is dragged over the window (distinct from the
  // internal application/x-editor-asset drag, which uses its own mime type and targets).
  const dropOverlay = element('#drop-overlay');
  let dragDepth = 0;
  // A Project Media card dragged onto the canvas or timeline is a reference to
  // an asset already stored, never a new file, even if the browser also
  // attaches file data to the drag (MED-015 regression).
  const isFileDrag = (event: DragEvent) =>
    !!event.dataTransfer?.types.includes('Files') &&
    !event.dataTransfer.types.includes('application/x-editor-asset');
  window.addEventListener('dragenter', (event) => {
    if (!isFileDrag(event)) return;
    dragDepth++;
    dropOverlay.hidden = false;
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay.hidden = true;
  });
  window.addEventListener('dragover', (event) => {
    if (isFileDrag(event)) event.preventDefault();
  });
  const windowDrop = (event: DragEvent) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    importMedia([...(event.dataTransfer?.files ?? [])]);
  };
  window.addEventListener('drop', windowDrop);

  const resize = () =>
    safely(() => {
      pointer.cancel();
      draw();
    });
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(stage);
  window.addEventListener('resize', resize);
  const disposeWorkspace = mountWorkspace(
    element('.editor-shell'),
    session,
    resize,
  );
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '[data-canvas-zoom]',
  ))
    button.onclick = () =>
      session.setCanvasZoom(
        button.dataset.canvasZoom === 'fit'
          ? 1
          : session.canvasZoom *
              (button.dataset.canvasZoom === 'in' ? 1.25 : 0.8),
      );
  const assetDrop = (event: DragEvent) =>
    safely(() => {
      const id = event.dataTransfer?.getData('application/x-editor-asset');
      if (!id) return;
      const asset = session.source.assets.find((item) => item.id === id);
      if (!asset || !['image', 'video', 'audio'].includes(asset.type)) return;
      event.preventDefault();
      session.setPlaying(false);
      const track = element('.timeline-scroll');
      const time =
        event.currentTarget === canvas
          ? session.currentTime
          : Math.max(
              0,
              pixelToTime(
                event.clientX -
                  track.getBoundingClientRect().left +
                  track.scrollLeft -
                  224,
                session.timelineZoom,
              ),
            );
      const duration =
        asset.duration && asset.duration > 0 ? asset.duration : 5;
      const layer = createLayer(
        crypto.randomUUID(),
        asset.type as 'image' | 'video' | 'audio',
        asset.name,
        duration,
      );
      layer.startTime = time;
      if (event.currentTarget === canvas) {
        const rect = canvas.getBoundingClientRect(),
          inverse = invertMatrix(viewport().matrix);
        if (inverse) {
          const point = transformPoint(inverse, [
            event.clientX - rect.left,
            event.clientY - rect.top,
          ]);
          // MED-015: centred on the drop point at the media's own size, scaled
          // down to fit inside the composition when it is larger.
          const { width: w, height: h } = session.source.composition;
          if (asset.width && asset.height) {
            const fit = Math.min(1, w / asset.width, h / asset.height);
            layer.transform.scale = vector2(fit, fit);
            layer.transform.position = vector2(
              point[0] - (asset.width * fit) / 2,
              point[1] - (asset.height * fit) / 2,
            );
          } else layer.transform.position = vector2(point[0], point[1]);
        }
      }
      layer.assetId = id;
      const compositionId = session.source.composition.id;
      const commands: Command[] = [
        {
          type: 'CREATE_LAYER',
          compositionId,
          parentId: null,
          layer,
        },
      ];
      // TL-001: every drop creates a clip. The canvas uses a free compatible
      // track at the playhead (or a new one); a track row uses the insert rule.
      const type = asset.type === 'audio' ? 'audio' : 'video';
      const requestedTrackId =
        event.currentTarget === canvas
          ? undefined
          : (event.target as HTMLElement).closest<HTMLElement>(
              '[data-track-id]',
            )?.dataset.trackId;
      const requestedTrack = requestedTrackId
        ? session.source.composition.tracks.find(
            (item) => item.id === requestedTrackId,
          )
        : undefined;
      if (
        requestedTrack &&
        (requestedTrack.type !== type || requestedTrack.locked)
      )
        throw new Error(
          requestedTrack.locked
            ? t('asset.locked', { name: requestedTrack.name })
            : t('asset.incompatible', {
                name: asset.name,
                track: requestedTrack.name,
              }),
        );
      const target = requestedTrack
        ? { trackId: requestedTrack.id, commands: [] as Command[] }
        : trackForNewClip(
            session.source.composition,
            layer.type,
            time,
            time + duration,
          );
      commands.unshift(...target.commands);
      const clip = {
        id: crypto.randomUUID(),
        name: asset.name,
        layerId: layer.id,
        assetId: asset.id,
        startTime: time,
        duration,
        sourceIn: 0,
        sourceOut: duration,
        enabled: true,
        speed: 1,
        transitionMetadata: {},
        effectMetadata: {},
        metadata: {},
      };
      if (requestedTrack) {
        const plan = planLanding(session.source.composition, [
          { clip, trackId: requestedTrack.id, startTime: time },
        ]);
        clip.startTime = plan.placed.get(clip.id)!;
        layer.startTime = clip.startTime;
        plan.pushed.forEach(({ startTime }, clipId) =>
          commands.push({
            type: 'SET_CLIP_TIMING',
            compositionId,
            clipId,
            startTime,
            duration: findClip(session.source.composition, clipId)!.clip
              .duration,
          }),
        );
      }
      commands.push({
        type: 'CREATE_CLIP',
        compositionId,
        trackId: target.trackId,
        clip,
      });
      engine.commands.transaction(
        event.currentTarget === canvas
          ? 'Add asset layer'
          : 'Add timeline clip',
        commands,
      );
      session.select(layer.id);
    });
  const assetOver = (event: DragEvent) => {
    if (event.dataTransfer?.types.includes('application/x-editor-asset'))
      event.preventDefault();
  };
  canvas.addEventListener('dragover', assetOver);
  canvas.addEventListener('drop', assetDrop);
  element('#timeline-foundation').addEventListener('drop', assetDrop);
  const setSaveStatus = (
    status: 'saved' | 'saving' | 'unsaved' | 'error',
    detail?: string,
  ) => {
    const dot = element('#save-status-dot');
    const text = element('#save-status-text');
    dot.className = `project-dot ${status === 'unsaved' ? '' : status}`.trim();
    text.textContent =
      status === 'saved'
        ? t('status.saved')
        : status === 'saving'
          ? t('status.saving')
          : status === 'error'
            ? (detail ?? t('status.saveError'))
            : t('status.unsaved');
  };

  // Command palette, shortcut sheet and New Project dialog (logic from W1-CODEX; markup
  // styled here via style.css against their stable ids, not reimplemented).
  const palette = mountCommandPalette(commandContext, (error) =>
    message(String(error)),
  );
  const shortcutSheet = mountShortcutSheet();
  const newProjectForm = mountNewProjectForm(engine, message);
  commandContext.newProject = newProjectForm.open;
  commandContext.openPalette = palette.open;
  commandContext.openShortcuts = shortcutSheet.open;
  element<HTMLButtonElement>('#new-project').onclick = () =>
    runCommand('new-project', commandContext);
  element<HTMLButtonElement>('#open-palette').onclick = () =>
    runCommand('palette', commandContext);
  element<HTMLButtonElement>('#open-shortcuts').onclick = () =>
    runCommand('shortcuts', commandContext);

  // Global keyboard shortcuts (Ctrl+Z/Y, Ctrl+S, Space, Ctrl+K, Ctrl+/, Escape priority,
  // typing guard). Canvas- and timeline-local key handling is delegated through localKey
  // so there is exactly one document-level keydown listener for the whole shell.
  const disposeShortcuts = bindShortcuts(commandContext, {
    cancelGesture: () => {
      if (pointer.active) {
        pointer.cancel();
        return true;
      }
      if (timeline?.active) {
        timeline.cancel();
        return true;
      }
      // SHP-018: Esc with no stroke in progress leaves draw mode.
      if (session.drawBrush) {
        session.setDrawBrush(null);
        return true;
      }
      return false;
    },
    closeOverlay: () => closeTopOverlay() || (timeline?.closeMenu() ?? false),
    localKey: (event) => {
      if (
        session.drawBrush &&
        event.key.toLowerCase() === 'v' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        session.setDrawBrush(null);
      } else if (event.target === canvas) pointer.handleKey(event);
      else if (
        event.target instanceof Node &&
        element('#timeline-foundation').contains(event.target)
      )
        timeline?.handleKey(event);
    },
    report: reportError,
  });

  // Language switcher (temporary location in the View menu; a dedicated control may move
  // it later). Re-applies every translated string that was only evaluated once at mount.
  const languageLabel = element('#language-toggle-label');
  const applyLanguage = () => {
    languageLabel.textContent = getLanguage() === 'en' ? 'हिन्दी' : 'English';
    document.title = t('app.title');
  };
  applyLanguage();
  element<HTMLButtonElement>('#language-toggle').onclick = () => {
    setLanguage(getLanguage() === 'en' ? 'hi' : 'en');
  };
  const translateStatic = bindDomTranslations(root);
  const unsubscribeLanguage = subscribe(() => {
    translateStatic();
    applyLanguage();
    applyCategory(activeCategory);
    setRightSection(activeSection);
    refresh(true);
  });

  refresh();
  return {
    session,
    /** Dev/test-only read-only snapshot (the test hook's getMedia). */
    mediaDebug: () => ({
      audio: audio.debug,
      video: frames.debug,
      transport: timeline?.playback.clock ?? session.currentTime,
    }),
    /** Dev/test-only: the active gesture's snap guides (CV-013). */
    canvasDebug: () => ({ guides: interaction.guides }),
    message,
    refresh,
    setSaveStatus,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeShortcuts();
      shortcutSheet.dispose();
      palette.dispose();
      newProjectForm.dispose();
      unsubscribeLanguage();
      mediaPanel.dispose();
      frames.dispose();
      previews.dispose();
      audio.dispose();
      waveforms.dispose();
      window.removeEventListener('drop', windowDrop);
      disposeWorkspace();
      canvas.removeEventListener('dragover', assetOver);
      canvas.removeEventListener('drop', assetDrop);
      element('#timeline-foundation').removeEventListener('drop', assetDrop);
      unsubscribe();
      timeline?.dispose();
      pointer.dispose();
      interaction.dispose();
      session.dispose();
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      root.replaceChildren();
    },
  };
}
