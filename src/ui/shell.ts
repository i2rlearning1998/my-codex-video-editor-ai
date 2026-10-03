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
  EDITOR_FIT,
  type CompositionRenderer,
} from '../render/canvas';
import { renderInspector } from './inspector';
import { syncGeometryFields } from './geometry-fields';
import { clampPan, mountCanvasView } from './canvas-view';
import { LAYER_DRAG_TYPE, mountSceneBoard } from './scene-board';
import { createNumberField, syncNumberField } from './components/number-field';
import {
  isGeometryField,
  selectionGeometry as selectionGeometryOf,
} from './geometry';
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
import { mountWorkspace, type Workspace } from './workspace';
import { DrawTool, withErasedPaths } from './draw-tool';
import { mountDrawPanel } from './draw-panel';
import { addShape } from './shapes';
import { mountSceneStrip } from './scene-strip';
import { mountDrawPalette, type DrawPalette } from './draw-palette';
import { openSaveTemplate } from './save-template';
import { scenePosterUrl } from './scene-poster';
import { mountContextToolbar } from './context-toolbar';
import { CropTool } from './crop-tool';
import { AnimatedInEditorError } from './editor-mode';
import { escapeTopPopover } from './components/popover';
import { mountToolPanels } from './tool-panels';
import { mountLibraryPanels } from './library-panel';
import { createLibraryActions, LIBRARY_DRAG_TYPE } from './library-actions';
import { mountSignature } from './signature';
import { addTopLevel } from './library-insert';
import {
  RIGHT_ICONS,
  RIGHT_SECTIONS,
  firstTabKey,
  kindOf,
  mountRightPanel,
  plannedSection,
  sectionsFor,
  type RightSection,
} from './right-panel';
import { applyCanvasSize } from './canvas-size';
import {
  ALT_TEXT_LIMIT,
  altTextOf,
  layerInfo,
  setAltText,
  worldBox,
} from './layer-actions';
import { selectionRoots } from './selection-context';
import { blankScene, duplicateScene } from './scenes';
import { mountAnimationPanel } from './animation-panel';
import { mountAnimatePanel } from './animate-panel';
import { mountPositionPanel } from './position-panel';
import { createSidePanels } from './side-panel';
import { canvasMenuEntries } from './canvas-menu';
import { createMenu } from './context-menu';
import { mountSelectionActions } from './selection-actions';
import { multiSelectionBox, selectionGeometry } from '../render/selection';
import { performEdit, planLanding, trackForNewClip } from './editing';
import { iconSvg } from './icons';
import { openModal } from './components/modal';
import { openPopover, type PopoverHandle } from './components/popover';
import { showToast } from './components/toast';
import { mountNewProjectForm } from './new-project-form';
import { bindShortcuts } from '../commands/shortcuts';
import { mountShortcutSheet } from './shortcut-sheet';
import { runCommand, type CommandContext } from '../commands/registry';
import { mountCommandPalette } from './command-palette';
import { closeTopOverlay, registerExternalOverlay } from './temporary-overlay';
import { cycleThemePreference, onThemeChange, themePreference } from './theme';
import {
  t,
  formatNumber,
  getLanguage,
  setLanguage,
  subscribe,
  bindDomTranslations,
} from '../i18n';

// H2: the order a user reaches for them; below 800 px of height the rail
// shows the first six and a More button for the rest.
const RAIL_CATEGORIES = [
  'Templates',
  'Elements',
  'Text',
  'Media',
  'Draw',
  'Scene',
  'Audio',
  'Transitions',
] as const;
const RAIL_ICONS: Record<(typeof RAIL_CATEGORIES)[number], string> = {
  Media: 'media',
  Text: 'text',
  Templates: 'templates',
  Audio: 'audio',
  Elements: 'elements',
  Draw: 'pen',
  Transitions: 'transitions',
  Scene: 'layers',
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
    <div class="editor-shell" data-editor-mode="editor">
      <header class="topbar">
        <div class="topbar-start">
          <button type="button" id="menu-trigger" class="icon-button menu-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="app-menu" aria-label="${t('menu.main')}" title="${t('menu.main')}">${iconSvg('menu')}</button>
          <span class="brand-mark" aria-hidden="true">N</span>
          <div class="project-title">
            <span class="project-dot" id="save-status-dot" aria-hidden="true"></span>
            <span id="project-name" tabindex="0" role="button" aria-label="${t('project.renameLabel')}"></span>
            <input type="text" id="project-name-input" class="project-name-field" aria-label="${t('project.name')}" hidden />
            <span class="save-status" id="save-status-text"></span>
          </div>
        </div>
        <div class="segmented mode-switch" id="mode-switch" role="radiogroup" aria-label="${t('mode.label')}">
          <button type="button" role="radio" data-mode="editor" aria-checked="true">${t('mode.editor')}</button>
          <button type="button" role="radio" data-mode="animation2d" aria-checked="false">${t('mode.animation2d')}</button>
          <button type="button" role="radio" data-mode="animation3d" aria-checked="false" aria-disabled="true" title="${t('mode.animation3dPlanned')}">${t('mode.animation3d')}</button>
        </div>
        <div class="topbar-end top-actions">
          <button type="button" id="undo" class="icon-button" aria-label="${t('action.undo')}" title="${t('action.undo')} (Ctrl+Z)">${iconSvg('undo')}</button>
          <button type="button" id="redo" class="icon-button" aria-label="${t('action.redo')}" title="${t('action.redo')} (Ctrl+Y)">${iconSvg('redo')}</button>
          <span class="topbar-divider" aria-hidden="true"></span>
          <button type="button" id="theme-toggle" class="icon-button" aria-label="${t('theme.label')}" title="${t('theme.label')}">${iconSvg('themeDark')}</button>
          <button type="button" id="export" class="primary">${iconSvg('export')}<span class="export-label">${t('action.export')}</span></button>
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
          <button type="button" id="language-toggle" role="menuitem">${iconSvg('language')}<span id="language-toggle-label"></span></button>
          <button type="button" id="theme-menu" role="menuitem">${iconSvg('themeDark')}<span id="theme-menu-label"></span></button>
        </div>
        <div class="app-menu-group" role="group" aria-label="${t('menu.help')}">
          <div class="app-menu-label">${t('menu.help')}</div>
          <button type="button" id="open-shortcuts" role="menuitem">${iconSvg('info')}${t('shortcuts.title')}<span class="shortcut-hint">Ctrl+/</span></button>
          <button type="button" id="about" role="menuitem">${iconSvg('info')}${t('menu.about')}</button>
        </div>
      </div>
      <nav class="icon-rail" id="rail-left" aria-label="${t('library.categories')}">${RAIL_CATEGORIES.map((name) => railButton(name, RAIL_ICONS[name], name === 'Scene')).join('')}<button type="button" class="rail-more" id="rail-more" aria-haspopup="menu" aria-expanded="false" title="${t('library.more')}">${iconSvg('more')}<span class="icon-rail-label">${t('library.more')}</span></button></nav>
      <aside class="library panel" id="library-panel" aria-label="${t('library.title')}">
        <div class="library-search" data-rail-panel="Media" hidden>
          ${iconSvg('search')}
          <input type="text" id="asset-search" placeholder="${t('library.searchPlaceholder')}" aria-label="${t('library.searchPlaceholder')}" />
        </div>
        <div class="import-row" data-rail-panel="Media" hidden><button type="button" class="button primary" id="import-media" title="${t('media.importButton')}">${iconSvg('export')}${t('library.import')}</button><input type="file" id="import-media-input" multiple accept="video/*,audio/*,image/*,.mov,.m4a,.mkv,.svg" hidden /></div>
        <div class="media-panel" id="media-panel" data-rail-panel="Media" hidden></div>
        <div class="library-placeholder" data-rail-panel="placeholder" hidden><div class="placeholder-icon" aria-hidden="true">${iconSvg('info', 22)}</div><h3 id="library-title">${t('library.assetsTitle')}</h3><p id="library-description">${t('library.assetsDescription')}</p><span class="quiet-tag">${t('library.later')}</span></div>
        <div class="draw-panel" id="draw-panel" hidden></div>
        <div id="library-elements" data-rail-panel="Elements" hidden></div>
        <div id="library-templates" data-rail-panel="Templates" hidden></div>
        <div id="library-text" data-rail-panel="Text" hidden></div>
        <div id="library-transitions" data-rail-panel="Transitions" hidden></div>
        <div class="scene-heading" id="scene-heading" data-rail-panel="Scene"><h2>${t('scene.title')}</h2><span id="layer-count" class="count"></span></div>
        <div id="scene-list" class="scene-list" data-rail-panel="Scene" aria-label="${t('scene.layers')}"></div>
        <div id="side-panel-host"></div>
      </aside>
      <main class="preview-panel" aria-label="${t('canvas.preview')}">
        <div class="canvas-stage" id="canvas-stage"><div class="stage-toolbar-row" id="toolbar-row"><div class="context-toolbar" id="context-toolbar" hidden></div></div><div class="artboard-shadow" id="artboard-shadow" aria-hidden="true"></div><canvas id="composition-canvas" tabindex="0" aria-label="${t('canvas.help')}">${t('canvas.fallback')}</canvas><div class="canvas-empty" id="canvas-empty" hidden><h3>${t('canvas.emptyTitle')}</h3><p>${t('canvas.emptyDescription')}</p></div><div class="selection-actions" id="selection-actions" hidden></div><div class="canvas-context-menu" id="canvas-context-menu" role="menu" hidden></div><div class="buffering-indicator" id="buffering-indicator" role="status" hidden>${t('canvas.buffering')}</div><div class="brush-cursor" id="brush-cursor" aria-hidden="true" hidden></div><div class="canvas-chip" id="canvas-chip" role="status" hidden></div></div>
        <div id="scene-strip"></div>
        <div class="preview-toolbar" id="canvas-footer">
          <div class="composition-picker"><button type="button" class="button sm" id="scene-board-toggle" aria-pressed="false" title="${t('scene.boardTip')}">${iconSvg('scenes', 16)}<span>${t('scene.board')}</span></button></div>
          <div class="preview-summary"><span id="composition-summary"></span><span id="selection-summary" role="status">${t('selection.none')}</span><span id="zoom" class="sr-only">${t('canvas.fit')}</span></div>
          <div class="canvas-zoom-controls">
            <button type="button" class="icon-button" data-canvas-tool="hand" aria-pressed="false" aria-label="${t('canvas.hand')}" title="${t('canvas.hand')} (H)">${iconSvg('hand')}</button>
            <button type="button" class="icon-button" data-canvas-zoom="out" aria-label="${t('canvas.zoomOut')}" title="${t('canvas.zoomOut')} (Ctrl+-)">${iconSvg('zoomOut')}</button>
            <span id="canvas-zoom-field"></span>
            <button type="button" class="icon-button" data-canvas-zoom="in" aria-label="${t('canvas.zoomIn')}" title="${t('canvas.zoomIn')} (Ctrl+=)">${iconSvg('zoomIn')}</button>
            <button type="button" class="button sm ghost" data-canvas-zoom="fit" title="${t('canvas.fit')} (Ctrl+0)">${iconSvg('fit', 16)}<span>${t('canvas.fit')}</span></button>
            <button type="button" class="button sm ghost" data-canvas-zoom="actual" title="${t('canvas.actualSizeTip')}">${t('canvas.actualSize')}</button>
            <button type="button" class="icon-button" id="fullscreen-preview" aria-label="${t('canvas.fullscreen')}" title="${t('canvas.fullscreen')}" disabled>${iconSvg('fullscreen')}</button>
          </div>
        </div>
        <p class="render-warning" id="render-warning" role="status" hidden></p>
      </main>
      <aside class="inspector panel" id="inspector-panel" aria-label="${t('inspector.title')}">
        <div id="right-section"></div>
        <div id="inspector-content"></div>
        <section class="animation-panel" id="animation-panel" aria-label="${t('animation.title')}" hidden></section>
        <div id="right-panel-empty" class="inspector-empty" hidden><h3 id="right-panel-empty-title"></h3><p id="right-panel-empty-description"></p><span class="quiet-tag">${t('library.later')}</span></div>
      </aside>
      <nav class="icon-rail icon-rail-right" id="rail-right" aria-label="${t('inspector.title')}">${RIGHT_SECTIONS.map((name) => rightRailButton(name, RIGHT_ICONS[name], name === 'Properties')).join('')}</nav>
      <section class="timeline" aria-label="${t('timeline.title')}"><div class="timeline-header"><div class="timeline-label"><h2>${t('timeline.title')}</h2></div></div><div id="timeline-foundation"></div></section>
      <footer class="statusbar sr-only"><span id="status" role="status" aria-live="polite">${t('status.ready')}</span></footer>
      <div class="drawer-scrim" id="drawer-scrim" hidden></div>
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
    // H4: an animated property offers to open 2D Animation.
    if (error instanceof AnimatedInEditorError)
      showToast(text, 'info', 6000, {
        label: t('mode.open2d'),
        run: () => session.setMode('animation2d'),
      });
    else showToast(text, 'error');
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
    pick: () => element<HTMLInputElement>('#import-media-input').click(),
    place: (assetId) =>
      safely(() => {
        const asset = session.source.assets.find((item) => item.id === assetId);
        if (!asset) return;
        const { width, height } = session.source.composition;
        placeAsset(asset, {
          time: session.currentTime,
          point: [width / 2, height / 2],
        });
      }),
    toast: (text, kind) => showToast(text, kind),
  });
  const audibleAssets = () => {
    const assets = mediaAssets();
    const removed = new Set(
      assets
        .filter(
          (asset) => (asset.metadata as { removed?: unknown }).removed === true,
        )
        .map((asset) => asset.id),
    );
    if (!removed.size) return assets;
    return assets.filter(
      (asset) =>
        !removed.has(asset.id) &&
        !removed.has(asset.source.reference.replace(/^audio-of:/, '')),
    );
  };
  // W4-C: every clip that can sound, flattened from the canonical composition.
  const audibleClips = (): AudibleClip[] =>
    listAudibleClips(
      session.source.composition,
      // I1.7: a deleted media item's clips are silent (Missing media), and
      // so is audio detached from it.
      audibleAssets(),
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
  // G3: Fit, then the zoom about the view's center, then the pan.
  const viewportFor = (z: number, requested: readonly [number, number]) => {
    const view = fitViewport(
      Math.max(1, canvas.clientWidth || stage.clientWidth),
      Math.max(1, canvas.clientHeight || stage.clientHeight),
      session.source.composition,
      window.devicePixelRatio || 1,
      EDITOR_FIT,
    );
    const at = (pan: readonly [number, number]): AffineMatrix =>
      multiplyMatrices(
        [
          z,
          0,
          0,
          z,
          (view.width * (1 - z)) / 2 + pan[0],
          (view.height * (1 - z)) / 2 + pan[1],
        ],
        view.matrix,
      );
    // H1.4: the stored pan is re-clamped for the current stage size, so a
    // resized window can never leave the artboard out of view.
    const pan = clampPan(
      { ...view, matrix: at([0, 0]) },
      session.source.composition,
      requested,
    );
    return { ...view, matrix: at(pan) };
  };
  const viewport = () => viewportFor(session.canvasZoom, session.canvasPan);
  // G4: a circle the size of the brush (or eraser) follows the pointer.
  const brushCursor = element('#brush-cursor');
  const moveBrushCursor = (event: PointerEvent) => {
    const brush = session.drawBrush;
    brushCursor.hidden = !brush;
    if (!brush) return;
    const box = stage.getBoundingClientRect();
    const size = Math.max(4, session.drawStyle.size * canvasView.scale);
    Object.assign(brushCursor.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${event.clientX - box.left - size / 2}px`,
      top: `${event.clientY - box.top - size / 2}px`,
    });
    brushCursor.classList.toggle('erasing', brush === 'eraser');
  };
  canvas.addEventListener('pointermove', moveBrushCursor);
  // H1.2: the size or angle chip sits beside the pointer while dragging.
  let chipPointer: Point2 = [0, 0];
  canvas.addEventListener('pointermove', (event) => {
    const box = stage.getBoundingClientRect();
    chipPointer = [event.clientX - box.left, event.clientY - box.top];
  });
  const canvasChip = element('#canvas-chip');
  // H2: the artboard's soft shadow is a themed element behind the canvas (the
  // canvas is transparent outside the artboard), so no pixel of the canvas
  // outside the artboard is painted by it.
  const artboardShadow = element('#artboard-shadow');
  const placeArtboardShadow = () => {
    const [a, , , d, e, f] = viewport().matrix;
    const { width, height } = session.source.composition;
    Object.assign(artboardShadow.style, {
      left: `${canvas.offsetLeft + e}px`,
      top: `${canvas.offsetTop + f}px`,
      width: `${a * width}px`,
      height: `${d * height}px`,
    });
  };
  const updateChip = (source: typeof session.source) => {
    const chip = interaction.chip;
    const geometry = chip?.kind === 'size' ? selectionGeometryOf(source) : null;
    if (!chip || (chip.kind === 'size' && !geometry)) {
      canvasChip.hidden = true;
      return;
    }
    canvasChip.hidden = false;
    canvasChip.textContent =
      chip.kind === 'size'
        ? `${Math.round(geometry!.width)} × ${Math.round(geometry!.height)}`
        : `${Math.round(chip.degrees)}°`;
    const box = stage.getBoundingClientRect();
    canvasChip.style.left = `${Math.min(box.width - 96, chipPointer[0] + 16)}px`;
    canvasChip.style.top = `${Math.min(box.height - 32, chipPointer[1] + 20)}px`;
  };
  canvas.addEventListener('pointerdown', moveBrushCursor);
  canvas.addEventListener('pointerleave', () => (brushCursor.hidden = true));
  const canvasView = mountCanvasView(
    stage,
    canvas,
    session,
    viewportFor,
    () => element<HTMLButtonElement>('[data-action="play"]').click(),
    () =>
      element('[data-canvas-tool="hand"]').setAttribute(
        'aria-pressed',
        String(canvasView.hand),
      ),
  );
  // G3: the effective zoom as a number field (100% = actual pixels).
  element('#canvas-zoom-field').replaceWith(
    createNumberField({
      id: 'canvas-zoom-percent',
      label: t('canvas.zoomPercent'),
      value: 100,
      unit: '%',
      decimals: 0,
      compact: true,
      min: 5,
      max: 800,
      presets: [25, 50, 100, 200, 400],
      onCommit: (value) => safely(() => canvasView.zoomToScale(value / 100)),
    }),
  );
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
    const drawn = {
      ...session.source,
      // G4: the eraser's cuts show while dragging; release commits them.
      ...(drawTool.erased.size
        ? {
            composition: withErasedPaths(
              session.source.composition,
              drawTool.erased,
            ),
          }
        : {}),
      frames,
      playing: session.playing,
      animate: true,
      missingLabel: t('media.missing'),
      ...(timeline?.controller.previews.length
        ? { timingPreviews: timeline.controller.previews }
        : {}),
      ...(interaction.previews ? { previews: interaction.previews } : {}),
      ...(timeline?.controller.preview
        ? { timingPreview: timeline.controller.preview }
        : {}),
      ...(interaction.preview ? { preview: interaction.preview } : {}),
      ...(interaction.guides.length ? { guides: interaction.guides } : {}),
      ...(interaction.highlight.length
        ? { highlightIds: interaction.highlight }
        : {}),
      ...(interaction.frame ? { selectionFrame: interaction.frame } : {}),
      ...(drawTool.preview ? { drawing: drawTool.preview } : {}),
      ...(interaction.hoveredHandle !== null
        ? { hoveredHandle: interaction.hoveredHandle }
        : {}),
      ...(hover === 'artboard' && !session.canvasSelected
        ? { hoverArtboard: true }
        : hover && hover !== 'artboard' && !interaction.active
          ? { hoverId: hover }
          : {}),
      ...(cropTool.active && cropTool.layerId
        ? {
            cropLayerId: cropTool.layerId,
            ...(cropTool.view ? { cropView: cropTool.view } : {}),
            ...(cropTool.overlay(viewport().matrix)
              ? { crop: cropTool.overlay(viewport().matrix)! }
              : {}),
          }
        : {}),
    };
    const report = renderer.render(
      canvas,
      drawn,
      viewport(),
      session.selectedId,
    );
    frames.endFrame();
    syncNumberField(root, 'canvas-zoom-percent', canvasView.scale * 100);
    // G2.1: X, Y, W and H (and the stored values) follow a handle drag live.
    if (!session.playing) syncGeometryFields(root, drawn);
    updateChip(drawn);
    placeArtboardShadow();
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
  let drawPalette: DrawPalette | undefined;
  // H3: the crop tool; the Crop panel opens and closes with it.
  let cropWasActive = false;
  const cropTool = new CropTool(engine, session, () => {
    if (cropTool.active !== cropWasActive) {
      cropWasActive = cropTool.active;
      toolPanels?.syncCrop();
    }
    safely(draw);
  });
  let toolPanels: ReturnType<typeof mountToolPanels> | undefined;
  // H3: the object (or the empty artboard) under the pointer is outlined.
  let hover: string | 'artboard' | null = null;
  // W5-B: the Inspector's Animation section (stopwatches and keyframes).
  const animationPanel = mountAnimationPanel(
    element('#animation-panel'),
    engine,
    session,
    reportError,
  );
  // W5-C: animation presets, opened from the toolbar's Animate button.
  // G1.5: deep panels open in the left side panel, never over the canvas.
  const sidePanels = createSidePanels(
    element('#side-panel-host'),
    registerExternalOverlay,
    {
      reveal: () => {
        if (workspace && !workspace.leftOpen) workspace.setOpen('left', true);
      },
      revealed: () => workspace?.leftOpen ?? true,
    },
  );
  const animatePanel = mountAnimatePanel(
    sidePanels.register('animate', () => t('animate.title')),
    engine,
    session,
    reportError,
  );
  // H4: the right panel's sections other than Properties.
  const rightPanel = mountRightPanel(
    element('#right-section'),
    engine,
    session,
    reportError,
    {
      animate: () => animatePanel.toggle(),
      // I4: the toolbar's crop tool and popover contents (one implementation).
      crop: () => toolPanels?.startCrop(),
      build: (id) => contextToolbar.build(id),
    },
  );
  // W2-F3: the Position panel (Arrange and Layers), from the toolbar and the
  // selection action cluster.
  const positionPanel = mountPositionPanel(
    sidePanels.register('position', () => t('position.title')),
    engine,
    session,
    reportError,
    (field, value) => interaction.geometry(field, value),
    (value) => interaction.edit('Rotation', value),
  );
  toolPanels = mountToolPanels(
    sidePanels,
    engine,
    session,
    cropTool,
    reportError,
  );
  // H3, J1: a new canvas size for the open scene, with Undo in the toast.
  const resizeCanvas = (width: number, height: number) => {
    if (!applyCanvasSize(engine, session.source.composition.id, width, height))
      return;
    showToast(
      t('canvasSize.changed', {
        width: formatNumber(width),
        height: formatNumber(height),
      }),
      'info',
      6000,
      {
        label: t('command.undo'),
        run: () => runCommand('undo', commandContext),
      },
    );
  };
  // CV-035: the selected layer's context toolbar above the canvas.
  const contextToolbar = mountContextToolbar(
    element('#context-toolbar'),
    engine,
    session,
    (field, value) =>
      isGeometryField(field)
        ? interaction.geometry(field, value)
        : interaction.edit(field, value),
    reportError,
    () => animatePanel.toggle(),
    () => positionPanel.toggle(),
    sidePanels,
    {
      openPanel: (id) => toolPanels?.open(id),
      crop: () => toolPanels?.startCrop(),
      scenes: () => sceneBoard.open(),
      canvasSize: resizeCanvas,
    },
  );
  // G5: the scene board over the canvas.
  const sceneBoard = mountSceneBoard(
    stage,
    element<HTMLButtonElement>('#scene-board-toggle'),
    engine,
    session,
    reportError,
    registerExternalOverlay,
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
  // H3: the canvas menu's actions outside the Command Bus.
  const selectedLayer = () =>
    session.selectedIds.length === 1 && session.selectedId
      ? (locateLayer(session.source.composition.layers, session.selectedId)
          ?.layer ?? null)
      : null;
  const openAltText = () => {
    const layer = selectedLayer();
    if (!layer) return;
    sidePanels.show('alt-text', t('altText.title'), () => {
      const current = selectedLayer();
      if (!current || current.id !== layer.id) return null;
      const wrap = document.createElement('div');
      wrap.className = 'tool-panel';
      wrap.dataset.toolPanel = 'alt-text';
      const hint = document.createElement('p');
      hint.className = 'tool-panel-hint';
      hint.textContent = t('altText.hint');
      const area = document.createElement('textarea');
      area.id = 'alt-text-input';
      area.rows = 4;
      area.maxLength = ALT_TEXT_LIMIT;
      area.setAttribute('aria-label', t('altText.title'));
      area.value = altTextOf(current);
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'primary';
      save.dataset.action = 'alt-text-save';
      save.textContent = t('altText.save');
      save.onclick = () =>
        safely(() => {
          setAltText(engine, session, area.value);
          sidePanels.close();
        });
      wrap.append(hint, area, save);
      queueMicrotask(() => area.focus());
      return wrap;
    });
  };
  /** Download selection: the selected elements alone, as a PNG. */
  const downloadSelection = () => {
    const source = session.source;
    const roots = selectionRoots(source, session.selectedIds);
    const boxes = roots
      .map((layer) => worldBox(source, layer.id))
      .filter((box): box is NonNullable<typeof box> => !!box);
    if (!boxes.length) return;
    const left = Math.floor(Math.min(...boxes.map((box) => box.x))),
      top = Math.floor(Math.min(...boxes.map((box) => box.y))),
      right = Math.ceil(Math.max(...boxes.map((box) => box.x + box.width))),
      bottom = Math.ceil(Math.max(...boxes.map((box) => box.y + box.height)));
    const width = Math.max(1, right - left),
      height = Math.max(1, bottom - top);
    const ids = new Set(roots.map((layer) => layer.id));
    const keep = (layers: typeof source.composition.layers): typeof layers =>
      layers
        .filter((layer) => ids.has(layer.id) || layer.children.length)
        .map((layer) =>
          ids.has(layer.id)
            ? layer
            : { ...layer, children: keep(layer.children) },
        )
        .filter((layer) => ids.has(layer.id) || layer.children.length);
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const context = frameCanvas.getContext('2d');
    if (!context) return;
    drawComposition(
      context,
      {
        ...source,
        composition: {
          ...source.composition,
          layers: keep(source.composition.layers),
        },
        background: 'rgba(0, 0, 0, 0)',
        frames,
        playing: false,
        animate: true,
      },
      {
        width,
        height,
        pixelRatio: 1,
        matrix: [1, 0, 0, 1, -left, -top],
      },
      null,
      { overlays: false },
    );
    const name = `${(roots.length === 1 ? roots[0]!.name : engine.state.metadata.name).replace(/[\\/:*?"<>|]+/g, '-')}.png`;
    frameCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      showToast(t('download.saved', { name }), 'info', 3000);
    }, 'image/png');
  };
  const menuHooks = {
    showTiming: () => {
      const layer = selectedLayer();
      if (!layer) return;
      const clip = findClipByLayer(session.source.composition, layer.id);
      const start = clip?.clip.startTime ?? layer.startTime;
      session.setCurrentTime(start);
      timeline?.reveal(start);
      element('#timeline-foundation .timeline-scroll').focus();
    },
    altText: openAltText,
    download: downloadSelection,
    info: () => {
      const lines = layerInfo(session);
      if (lines.length) showToast(lines.join(' · '), 'info', 6000);
    },
    canvasSize: resizeCanvas,
    customSize: () => {
      session.select(null);
      session.setCanvasSelected(true);
      requestAnimationFrame(() =>
        element<HTMLElement>(
          '#context-toolbar [data-control="canvas-size"]',
        ).click(),
      );
    },
    addScene: (copy: boolean) =>
      safely(() => {
        const current = session.source.composition.id;
        const added = copy
          ? duplicateScene(engine.state, current)
          : blankScene(engine.state, current);
        engine.commands.transaction(
          copy ? 'Duplicate scene' : 'Add scene',
          added.commands,
        );
        session.selectComposition(added.id);
      }),
    saveAsTemplate: () => {
      const sceneId = session.source.composition.id;
      openSaveTemplate(engine, sceneId, () =>
        scenePosterUrl(engine, session, sceneId, frames),
      );
    },
    deleteScene: () =>
      safely(() => {
        engine.commands.transaction('Delete scene', [
          {
            type: 'DELETE_COMPOSITION',
            compositionId: session.source.composition.id,
          },
        ]);
      }),
  };
  const openCanvasMenu = (point: Point2, layerId: string | null) => {
    const entries = canvasMenuEntries(engine, session, !!layerId, menuHooks);
    canvasMenuController.open(() =>
      canvasMenuEntries(engine, session, !!layerId, menuHooks),
    );
    if (!entries.length) canvasMenuController.close();
    const bounds = stage.getBoundingClientRect();
    canvasMenu.style.left = `${Math.max(0, Math.min(bounds.width - 170, point[0]))}px`;
    canvasMenu.style.top = `${Math.max(0, Math.min(bounds.height - 40, point[1]))}px`;
    // G1.3: flip or shift so the whole menu shows without a scrollbar.
    canvasMenuController.fit();
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
      position: () => positionPanel.toggle(),
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
    const multiBox = multiSelectionBox(source, view);
    const single = multiBox
      ? null
      : selectionGeometry(source, session.selectedId, view);
    // H1.2: the rotation handle belongs to the box the cluster must avoid.
    const corners = multiBox
      ? [...multiBox.corners, multiBox.rotation]
      : single
        ? [...single.corners, single.rotation]
        : undefined;
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
      { width: stage.clientWidth, height: stage.clientHeight },
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
    cropTool,
    (target) => {
      if (target === hover) return;
      hover = target;
      safely(draw);
    },
    {
      // I2: the Draw palette is mounted later; its tools are read lazily.
      get armed() {
        return drawPalette?.place.armed ?? false;
      },
      get active() {
        return drawPalette?.place.active ?? false;
      },
      begin: (at) => drawPalette?.place.begin(at),
      update: (at) => drawPalette?.place.update(at),
      finish: () => drawPalette?.place.finish(),
      cancel: () => drawPalette?.place.cancel(),
    },
  );
  const commandContext: CommandContext = {
    engine,
    session,
    view: canvasView,
    ...(actions.save ? { save: actions.save } : {}),
    togglePlayback: () =>
      element<HTMLButtonElement>('[data-action="play"]').click(),
  };
  let renderedProject: unknown;
  let renderedSelection = '';
  const refresh = (force = false) => {
    drawPanel.sync();
    drawPalette?.sync();
    canvas.classList.toggle('drawing', session.drawBrush !== null);
    canvas.classList.toggle('erasing', session.drawBrush === 'eraser');
    const source = session.source;
    // W5-B: an animated selection shows time-dependent values, so the Inspector
    // and toolbar re-render when the playhead moves (not every frame of playback).
    const animatedSelection =
      !session.playing &&
      session.selectedIds.some((id) => {
        const found = locateLayer(source.composition.layers, id);
        return !!found && hasAnimation(found.layer);
      });
    // H3: a crop ends when its layer is no longer the selection.
    if (cropTool.active && session.selectedId !== cropTool.layerId)
      cropTool.cancel();
    const identity = JSON.stringify([
      source.composition.id,
      session.selectedIds,
      session.canvasSelected,
      session.mode,
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
        // G5: a top-level layer can be dragged onto a scene on the board.
        if (depth === 0) {
          button.draggable = true;
          button.ondragstart = (event) => {
            event.dataTransfer?.setData(LAYER_DRAG_TYPE, layer.id);
            if (event.dataTransfer)
              event.dataTransfer.effectAllowed = 'copyMove';
          };
        }
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
      // H4: keyframe diamonds belong to 2D Animation.
      session.mode !== 'animation2d'
        ? undefined
        : (key, _remove) => {
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
      (field, value) => {
        safely(() => interaction.geometry(field, value));
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
  // H4: Editor | 2D Animation (3D is planned). The switch crossfades the
  // panels and the timeline in 320 ms and keeps the selection.
  const shellRoot = element('.editor-shell');
  const modeButtons = root.querySelectorAll<HTMLButtonElement>(
    '#mode-switch [data-mode]',
  );
  let shownMode = session.mode;
  const syncMode = () => {
    const mode = session.mode;
    for (const button of modeButtons)
      button.setAttribute('aria-checked', String(button.dataset.mode === mode));
    if (mode === shownMode) return;
    shownMode = mode;
    shellRoot.dataset.editorMode = mode;
    shellRoot.classList.remove('mode-fade');
    void shellRoot.offsetWidth;
    shellRoot.classList.add('mode-fade');
    message(t(mode === 'editor' ? 'mode.nowEditor' : 'mode.now2d'));
  };
  shellRoot.addEventListener('animationend', (event) => {
    if ((event as AnimationEvent).animationName === 'mode-fade')
      shellRoot.classList.remove('mode-fade');
  });
  for (const button of modeButtons)
    button.onclick = () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      session.setMode(button.dataset.mode as 'editor' | 'animation2d');
    };
  session.onChange(syncMode);
  const unsubscribe = session.onChange(refresh);
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
      scenes: engine.state.compositions,
      assets: session.source.assets,
      background: session.source.background,
      projectName: engine.state.metadata.name,
      store: mediaStore,
      decoder,
      renderFrame,
      // I2: Designs in Project Media (a library change, not an undo step).
      saveFrame: (blob, name) =>
        mediaPanel.importFiles(
          [
            new File(
              [blob],
              name.replace(/\.png$/, `-${Date.now().toString(36)}.png`),
              { type: 'image/png' },
            ),
          ],
          { design: true },
        ),
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
  // G1.7: every rail category shows only its own panels. The markup tags each
  // panel with data-rail-panel; this is the one place that decides visibility,
  // applied on first load and after every switch.
  const railPanels = [
    ...root.querySelectorAll<HTMLElement>('[data-rail-panel]'),
  ];
  const OWN_PANELS = new Set([
    'Media',
    'Scene',
    'Elements',
    'Templates',
    'Text',
    'Transitions',
  ]);
  // SHP-018: the Draw category; leaving it leaves draw mode.
  const drawPanel = mountDrawPanel(
    element('#draw-panel'),
    session,
    reportError,
  );
  // I1.3, I1.4: adding library items by click, drop and the template dialog.
  const crossfade = () => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    try {
      const snapshot = document.createElement('img');
      snapshot.className = 'scene-crossfade';
      snapshot.alt = '';
      snapshot.setAttribute('aria-hidden', 'true');
      snapshot.src = canvas.toDataURL();
      Object.assign(snapshot.style, {
        left: `${canvas.offsetLeft}px`,
        top: `${canvas.offsetTop}px`,
        width: `${canvas.clientWidth}px`,
        height: `${canvas.clientHeight}px`,
      });
      stage.append(snapshot);
      snapshot.addEventListener('animationend', () => snapshot.remove());
      setTimeout(() => snapshot.remove(), 600);
    } catch {
      // A canvas that cannot be read (tainted) just switches.
    }
  };
  const libraryActions = createLibraryActions({
    engine,
    session,
    report: reportError,
    undo: () => runCommand('undo', commandContext),
    crossfade,
  });
  // H5: Starter Pack 1 in Templates, Elements, Text and Graphics.
  // I2: browse panels; Graphics lives inside Elements.
  const libraryBrowsers = mountLibraryPanels(
    {
      Templates: element('#library-templates'),
      Elements: element('#library-elements'),
      Text: element('#library-text'),
      Transitions: element('#library-transitions'),
    },
    engine,
    session,
    reportError,
    renderer.measureText,
    libraryActions,
    {
      close: () => workspace?.setOpen('left', false),
      // SHP-001: the five W5-D shapes and the I2 lines.
      addPreset: (preset) => safely(() => addShape(engine, session, preset)),
      addTextBox: () => libraryActions.insertTextBox(),
    },
  );
  void libraryBrowsers;
  let activeCategory = 'Scene';
  let activeSection = 'Properties';
  let workspace: Workspace | undefined;
  // H1.5: a rail button is pressed only while its panel is open.
  const syncRails = () => {
    for (const sibling of root.querySelectorAll('[data-category]'))
      sibling.setAttribute(
        'aria-pressed',
        String(
          sibling.getAttribute('data-category') === 'Draw'
            ? !!drawPalette?.open
            : (workspace?.leftOpen ?? true) &&
                !drawPalette?.open &&
                sibling.getAttribute('data-category') === activeCategory,
        ),
      );
    for (const el of root.querySelectorAll<HTMLElement>(
      '.icon-rail-right button',
    ))
      el.setAttribute(
        'aria-pressed',
        String(
          (workspace?.rightOpen ?? true) &&
            el.dataset.section === activeSection,
        ),
      );
  };
  const applyCategory = (category: string) => {
    syncRails();
    const hidden = root.querySelector<HTMLElement>(
      `#rail-left [data-category="${category}"]`,
    );
    root
      .querySelector('#rail-more')
      ?.setAttribute(
        'aria-pressed',
        String(
          !!hidden && hidden.offsetParent === null && !!workspace?.leftOpen,
        ),
      );
    const shown = OWN_PANELS.has(category) ? category : 'placeholder';
    for (const panel of railPanels)
      panel.hidden = panel.dataset.railPanel !== shown;
    root
      .querySelector('.library')
      ?.setAttribute('data-active-category', category);
    if (category !== 'Draw') session.setDrawBrush(null);
    if (shown === 'placeholder') {
      const [titleKey, descriptionKey] = descriptions[category]!;
      element('#library-title').textContent = t(titleKey);
      element('#library-description').textContent = t(descriptionKey);
    }
  };
  applyCategory(activeCategory);
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '[data-category]',
  ))
    button.onclick = () => {
      const category = button.dataset.category!;
      // I2: Draw toggles the palette at the canvas's left edge instead of
      // a panel.
      if (category === 'Draw') {
        drawPalette?.toggle();
        syncRails();
        return;
      }
      if (drawPalette?.open) drawPalette.close();
      // H1.5: the active category collapses its open panel; any other
      // category (or a collapsed panel) opens with that content.
      if (category === activeCategory && workspace?.leftOpen) {
        workspace.setOpen('left', false);
        return;
      }
      activeCategory = category;
      sidePanels.close();
      applyCategory(activeCategory);
      workspace?.setOpen('left', true);
    };
  // H2: on a short window the rail shows six categories; More lists the rest.
  const moreButton = element<HTMLButtonElement>('#rail-more');
  let morePopover: PopoverHandle | null = null;
  moreButton.onclick = () => {
    if (morePopover) return morePopover.close();
    const menu = document.createElement('div');
    menu.className = 'rail-more-menu';
    menu.setAttribute('role', 'menu');
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '#rail-left [data-category]',
    )) {
      if (button.offsetParent !== null) continue;
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.dataset.moreCategory = button.dataset.category!;
      item.setAttribute(
        'aria-pressed',
        button.getAttribute('aria-pressed') ?? 'false',
      );
      item.innerHTML = button.innerHTML;
      item.onclick = () => {
        morePopover?.close();
        button.click();
      };
      menu.append(item);
    }
    morePopover = openPopover(moreButton, menu, {
      label: t('library.more'),
      onClose: () => {
        morePopover = null;
      },
    });
  };
  const searchInput = element<HTMLInputElement>('#asset-search');
  searchInput.oninput = () => mediaPanel.filter(searchInput.value);
  // H6: signatures in the Draw panel (typed, drawn or uploaded).
  const signature = mountSignature({
    host: element('#draw-panel'),
    panels: sidePanels,
    engine,
    session,
    report: reportError,
    upload: async (file) => {
      await mediaPanel.importFiles([file]);
      const assets = engine.state.assets as unknown as readonly {
        id: string;
        type: string;
        width?: number;
        height?: number;
        metadata: { fileName?: string };
      }[];
      const asset = [...assets]
        .reverse()
        .find(
          (item) =>
            item.type === 'image' && item.metadata.fileName === file.name,
        );
      if (!asset) return;
      session.setPlaying(false);
      const { width: W, height: H } = session.source.composition;
      const layer = createLayer(
        crypto.randomUUID(),
        'image',
        t('signature.layerName'),
        5,
      );
      layer.assetId = asset.id;
      const scale =
        asset.width && asset.height
          ? Math.min((W * 0.3) / asset.width, (H * 0.3) / asset.height)
          : 1;
      layer.transform.scale = vector2(scale, scale);
      layer.transform.position = vector2(
        (W - (asset.width ?? 0) * scale) / 2,
        (H - (asset.height ?? 0) * scale) / 2,
      );
      engine.commands.transaction(
        'Add signature',
        addTopLevel(session.source.composition, layer, session.currentTime),
      );
      session.select(layer.id);
    },
  });
  // I3: the scene strip under the canvas.
  mountSceneStrip({
    host: element('#scene-strip'),
    engine,
    session,
    frames,
    report: reportError,
    crossfade,
    openTemplates: () => {
      const templates = element<HTMLButtonElement>(
        '#rail-left [data-category="Templates"]',
      );
      if (templates.getAttribute('aria-pressed') !== 'true') templates.click();
    },
    saveAsTemplate: (sceneId) =>
      openSaveTemplate(engine, sceneId, () =>
        scenePosterUrl(engine, session, sceneId, frames),
      ),
  });
  // I2: the Draw palette (the Draw rail item).
  drawPalette = mountDrawPalette({
    stage,
    canvas,
    engine,
    session,
    drawPanel: element('#draw-panel'),
    toCanvas: (point) => transformPoint(viewport().matrix, point),
    report: reportError,
    openSignature: () => signature.open(),
    insertTextBox: (at, width) => libraryActions.insertTextBox(at, width),
    setLeftOpen: (open) => workspace?.setOpen('left', open),
    leftOpen: () => workspace?.leftOpen ?? true,
    changed: () => {
      syncRails();
      safely(draw);
    },
  });
  // MED-001/MED-002: the Import button and OS file drops both import into Project Media.
  const importMedia = (files: readonly File[]) => {
    if (!files.length) return;
    activeCategory = 'Media';
    applyCategory(activeCategory);
    workspace?.setOpen('left', true);
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

  const setRightSection = (name: string) => {
    activeSection = name;
    syncRails();
    const isProperties = name === 'Properties';
    element('#inspector-content').hidden = !isProperties;
    element('#animation-panel').hidden = !isProperties;
    if (isProperties) animationPanel.render();
    rightEmpty.hidden = true;
    // I4: the first tab is the selection's own controls above the Inspector.
    element('#right-section').hidden = false;
    rightPanel.render(name as RightSection);
    renderedRight = rightKey();
    renderedRightState = engine.state;
  };
  let renderedRight = '';
  const rightKey = () =>
    [
      activeSection,
      session.selectedIds.join(','),
      session.source.composition.id,
      session.mode,
    ].join('|');
  let renderedRightState: unknown = null;
  /** H4: the rail lists the sections that fit the selection (Clipchamp). */
  const syncRightRail = () => {
    const shown = sectionsFor(session);
    for (const el of root.querySelectorAll<HTMLElement>(
      '.icon-rail-right button',
    )) {
      const section = el.dataset.section as RightSection;
      el.hidden = !shown.includes(section);
      // I4: the first tab is named after the selection; unbuilt tabs show
      // disabled and name their wave.
      const label =
        section === 'Properties'
          ? t(firstTabKey(kindOf(session)))
          : t(`panel.${section.toLowerCase()}`);
      const planned = plannedSection(section, session);
      const title = planned
        ? `${label}: ${t('toolbar.later', { wave: String(planned[1]), id: planned[0] })}`
        : label;
      el.title = title;
      el.setAttribute('aria-label', title);
      el.querySelector('.icon-rail-label')!.textContent = label;
      if (planned) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
    }
    if (
      !shown.includes(activeSection as RightSection) ||
      plannedSection(activeSection as RightSection, session)
    )
      setRightSection('Properties');
    else if (
      rightKey() !== renderedRight ||
      engine.state !== renderedRightState
    ) {
      renderedRight = rightKey();
      renderedRightState = engine.state;
      rightPanel.render(activeSection as RightSection);
    }
  };
  session.onChange(syncRightRail);
  syncRightRail();
  for (const el of root.querySelectorAll<HTMLElement>(
    '.icon-rail-right button',
  ))
    el.onclick = () => {
      const name = el.dataset.section!;
      if (el.getAttribute('aria-disabled') === 'true') return;
      if (name === activeSection && workspace?.rightOpen) {
        workspace.setOpen('right', false);
        return;
      }
      setRightSection(name);
      workspace?.setOpen('right', true);
    };

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
          // I1.6: the project's name is not a project edit (not undoable).
          engine.library('Rename project', [
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
    !event.dataTransfer.types.includes('application/x-editor-asset') &&
    !event.dataTransfer.types.includes(LIBRARY_DRAG_TYPE);
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
  // I1.1: each side panel's content sits in a body that keeps the panel's
  // open width, so the panel itself can animate its width without the
  // content reflowing mid-animation.
  for (const panel of root.querySelectorAll<HTMLElement>(
    '.library, .inspector',
  )) {
    const body = document.createElement('div');
    body.className = 'panel-body';
    body.append(...panel.childNodes);
    panel.append(body);
  }
  workspace = mountWorkspace(element('.editor-shell'), session, resize);
  workspace.onChange(syncRails);
  syncRails();
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '[data-canvas-zoom]',
  ))
    button.onclick = () =>
      safely(() => {
        const action = button.dataset.canvasZoom;
        if (action === 'fit') canvasView.fit();
        else if (action === 'actual') canvasView.actualSize();
        else canvasView.zoomBy(action === 'in' ? 1.25 : 0.8);
      });
  element<HTMLButtonElement>('[data-canvas-tool="hand"]').onclick = () =>
    canvasView.toggleHand();
  /** Adds an asset as a layer with a clip, at a composition point or the
   *  centre (canvas), or on a timeline track (the insert rule). */
  const placeAsset = (
    asset: (typeof session.source.assets)[number],
    place: {
      time: number;
      point?: readonly [number, number] | null;
      trackId?: string | undefined;
    },
  ) => {
    const id = asset.id;
    const time = place.time;
    session.setPlaying(false);
    const duration = asset.duration && asset.duration > 0 ? asset.duration : 5;
    const layer = createLayer(
      crypto.randomUUID(),
      asset.type as 'image' | 'video' | 'audio',
      asset.name,
      duration,
    );
    layer.startTime = time;
    if (place.point) {
      const point = place.point;
      {
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
    const requestedTrackId = place.trackId;
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
          duration: findClip(session.source.composition, clipId)!.clip.duration,
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
      place.trackId === undefined ? 'Add asset layer' : 'Add timeline clip',
      commands,
    );
    session.select(layer.id);
  };
  const assetDrop = (event: DragEvent) =>
    safely(() => {
      const id = event.dataTransfer?.getData('application/x-editor-asset');
      if (!id) return;
      const asset = session.source.assets.find((item) => item.id === id);
      if (!asset || !['image', 'video', 'audio'].includes(asset.type)) return;
      event.preventDefault();
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
      let point: [number, number] | null = null;
      if (event.currentTarget === canvas) {
        const rect = canvas.getBoundingClientRect(),
          inverse = invertMatrix(viewport().matrix);
        if (inverse)
          point = transformPoint(inverse, [
            event.clientX - rect.left,
            event.clientY - rect.top,
          ]) as [number, number];
      }
      placeAsset(asset, {
        time,
        point,
        trackId:
          event.currentTarget === canvas
            ? undefined
            : ((event.target as HTMLElement).closest<HTMLElement>(
                '[data-track-id]',
              )?.dataset.trackId ?? ''),
      });
    });
  const assetOver = (event: DragEvent) => {
    if (
      event.dataTransfer?.types.includes('application/x-editor-asset') ||
      event.dataTransfer?.types.includes(LIBRARY_DRAG_TYPE)
    )
      event.preventDefault();
  };
  // I1.3: a library card dropped on the canvas is inserted at the drop
  // point (never imported as media).
  const libraryDrop = (event: DragEvent) => {
    const id = event.dataTransfer?.getData(LIBRARY_DRAG_TYPE);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const item = libraryActions.find(id);
    if (!item) return;
    const rect = canvas.getBoundingClientRect(),
      inverse = invertMatrix(viewport().matrix);
    const point = inverse
      ? transformPoint(inverse, [
          event.clientX - rect.left,
          event.clientY - rect.top,
        ])
      : undefined;
    libraryActions.insert(item, point ? [point[0], point[1]] : undefined);
  };
  canvas.addEventListener('drop', libraryDrop);
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
      if (cropTool.active) {
        cropTool.cancel();
        return true;
      }
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
    closeOverlay: () =>
      escapeTopPopover() ||
      closeTopOverlay() ||
      (timeline?.closeMenu() ?? false),
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
  // H2: the theme (dark, light or system), from the top bar, the menu and
  // the palette; a UI preference, never project data.
  const themeButton = element<HTMLButtonElement>('#theme-toggle');
  const applyThemeControls = () => {
    const preference = themePreference();
    const order = ['dark', 'light', 'system'] as const;
    const next = order[(order.indexOf(preference) + 1) % order.length]!;
    const name = t(`theme.${preference}`);
    themeButton.innerHTML = iconSvg(
      preference === 'dark'
        ? 'themeDark'
        : preference === 'light'
          ? 'themeLight'
          : 'themeSystem',
    );
    themeButton.title = t('theme.toggleTip', {
      name,
      next: t(`theme.${next}`),
    });
    themeButton.dataset.theme = preference;
    element('#theme-menu-label').textContent = t('theme.menu', { name });
  };
  themeButton.onclick = () => cycleThemePreference();
  element<HTMLButtonElement>('#theme-menu').onclick = () =>
    cycleThemePreference();
  const unsubscribeTheme = onThemeChange(() => {
    applyThemeControls();
    // The canvas overlays and stage follow the theme.
    safely(draw);
  });
  applyThemeControls();
  const translateStatic = bindDomTranslations(root);
  const unsubscribeLanguage = subscribe(() => {
    translateStatic();
    applyLanguage();
    applyThemeControls();
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
    canvasDebug: () => ({
      guides: interaction.guides,
      // G3: composition to canvas CSS pixels, for proofs of pan and zoom.
      view: viewport().matrix,
      hand: canvasView.hand,
      // H1.2: the drawn selection box (canvas CSS px), including a preview.
      selection:
        selectionGeometry(
          {
            ...session.source,
            ...(interaction.preview ? { preview: interaction.preview } : {}),
          },
          session.selectedId,
          viewport().matrix,
        )?.handles.map((handle) => ({
          id: handle.id,
          point: handle.point,
          cursor: handle.cursor,
        })) ?? null,
      corners:
        selectionGeometry(
          {
            ...session.source,
            ...(interaction.preview ? { preview: interaction.preview } : {}),
          },
          session.selectedId,
          viewport().matrix,
        )?.corners ?? null,
      chip: element('#canvas-chip').hidden
        ? null
        : element('#canvas-chip').textContent,
      // H3: what the pointer outlines, whether the canvas itself is
      // selected, and the crop in progress.
      hover,
      canvasSelected: session.canvasSelected,
      crop: cropTool.active
        ? { layerId: cropTool.layerId, frame: cropTool.working }
        : null,
    }),
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
      unsubscribeTheme();
      sceneBoard.dispose();
      mediaPanel.dispose();
      positionPanel.dispose();
      frames.dispose();
      previews.dispose();
      audio.dispose();
      waveforms.dispose();
      window.removeEventListener('drop', windowDrop);
      workspace?.dispose();
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
