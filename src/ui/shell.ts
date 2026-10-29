import {
  builtScenes,
  compositionCardStatus,
  compositionKey,
  rememberBuilt,
  storageOrNull,
} from './composition-status';
import {
  openAutoCaptions,
  openTranscribe,
  selectedSoundClip,
  type CaptionsContext,
} from './captions-ui';
import { mountNestBar } from './nest-ui';
import { importFileText } from '../code-layer/glb-source';
import { FrameCache } from '../code-layer/cache';
import { CodeBaker } from '../code-layer/baker';
import { CodeFrames, bakeSpecOf } from '../code-layer/frames';
import { CodePosters } from '../code-layer/poster';
import { CodeLive } from '../code-layer/live';
import { freeCodeRuntime, openCodeSession } from '../code-layer/runtime';
import { tierACommands } from '../code-layer/tier-a';
import { codeLayerCommands, codeRecord } from '../code-layer/layer';
import { openCodeImportDialog } from './code-import-dialog';
import { codeLayerSelected } from './right-panel';
import {
  codeTemplates,
  exportCodeTemplate,
  importCodeTemplate,
  isCodeTemplateFile,
  type CodeTemplate,
} from './code-templates';
import { createParamsForm } from './code-params';
import { stableJson } from '../code-layer/hash';
import { download } from '../export/client';
import {
  CreatorLibrary,
  creatorLibraryId,
  type CreatorEntry,
} from './creator-library';
import { briefIdOf, isBriefId, mountAiPanel } from './ai-panel';
import { openBriefDialog } from './brief-dialog';
import { BriefLibrary } from './brief-library';
import { styleThumbnail } from './style-card';
import { briefSections, type BriefFormValues } from '../ai-brief/form';
import { mountThemePanel } from './theme-panel';
import {
  BUILT_IN_THEMES,
  registerBuiltInThemes,
  MOTION_STYLES,
  applyThemeCommands,
  isManualColor,
  projectThemes,
  withPaletteSlots,
  type Theme,
  type ThemeLayer,
  type ThemeScene,
} from '../themes/themes';
import { ThemeError, createThemeLibrary } from '../themes/library';
import { applyMotion, readMotion, reducedNow } from './motion';
import { presetControls } from '../creator-pack/preset';
import { blocks } from '../blocks/starters';
import { SYSTEM_FONTS } from '../render/text-style';
import {
  controlledLayer,
  controlsBody,
  presetFits,
  type ControlsDeps,
  type CreatorPresetChoice,
} from './controls-panel';
import {
  livePresets,
  presetCommands,
  removePresetCommands,
} from './creator-presets';
import {
  codeHash,
  openAiImportDialog,
  type AiImportAdd,
} from './ai-import-dialog';
import { loadLibrary } from '../library/loader';
import { adjustments, effects, filters, transitions } from '../fx';
import type { ParamValues } from './code-params';
import { bakeForExport, codeLayersOf } from '../code-layer/export-bake';
import {
  codeFps,
  codeMeta,
  codeParams,
  codeSeedOf,
  frameCount,
  type CodeData,
} from '../code-layer/meta';
import type { CodeClipStatus } from './timeline';
import type { FrameProvider } from '../render/adapter';
import type { Composition, DeepReadonly, Layer as CoreLayer } from '../core';
import { IN_OUT_PRESETS, LOOP_PRESETS, retimeClip } from '../core';
import { SCENE_TRANSITION_EVENT, transitionFocus } from './transition-focus';
import { assetDrag } from './drag-state';
import { openElementTiming } from './element-timing';
import { mountFonts } from './fonts';
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
  laneAccepts,
  nextTrackName,
  laneInsertIndex,
  trackTypeForLayer,
} from '../core';
import {
  deriveRenderItems,
  hitTest,
  locateLayer,
  type RenderSource,
  type SceneLayer,
} from '../render/adapter';
import {
  Canvas2DRenderer,
  fitViewport,
  EDITOR_FIT,
  type CompositionRenderer,
} from '../render/canvas';
import { renderInspector } from './inspector';
import { syncGeometryFields } from './geometry-fields';
import { clampPan, mountCanvasView } from './canvas-view';
import { mountSceneBoard } from './scene-board';
import { mountSceneOutliner, type SceneOutliner } from './scene-outliner';
import {
  createNumberField,
  setFieldPreview,
  syncNumberField,
} from './components/number-field';
import {
  isGeometryField,
  selectionGeometry as selectionGeometryOf,
} from './geometry';
import { mountMediaPanel } from './media-panel';
import { mountMediaRelink } from './media-relink';
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
import {
  cancelEyedropper,
  createEffectsCanvasTool,
  layerEffects,
} from './right-panel/layer-effects';
import { mountTextEditor, type TextEditor } from './text-editor';
import {
  mountTableEditor,
  openTablePicker,
  tableInsertCommands,
} from './text-table';
import { TransformInteraction } from './transform-interaction';
import { EditorSession } from './session';
import {
  mountTimeline,
  TIMELINE_PAD,
  type AssetTarget,
  type LaneDropInfo,
} from './timeline';
import { laneDropPlan, type LaneGroup } from './timeline-drop';
import { laneGroupOfLayer } from '../core';
import { activeCut, compositionAt, cutsAround } from '../core';
import { drawSceneTransition } from '../render/scene-transitions';
import { mountWorkspace, type Workspace } from './workspace';
import { DrawTool, withErasedPaths } from './draw-tool';
import { mountDrawPanel } from './draw-panel';
import { addShape, addShapeCommands, type ShapePreset } from './shapes';
import { myTemplates, templateFromScene } from './my-templates';
import { groupNameFor } from './ungroup';
import { drags, setDragReporter, type DragPayload } from './drag-controller';
import { mountSceneStrip } from './scene-strip';
import { mountSoundPack } from './sound-pack-panel';
import { mountAudioMixer, projectMasterVolume } from './audio-mixer';
import { createNestEngine } from './nest-engine';
import { configureAudioTab } from './right-panel/audio-tab';
import { mountRecordPanel } from './record-panel';
import { recordPanelHooks } from './record-panel-hooks';
import { newTts, ttsState } from './right-panel/tts-panel';
import { projectAudioState, themeState } from './right-panel';
import {
  registerTtsCommands,
  ttsCommand,
  type TtsSettings,
} from '../audio/tts/commands';
import { wordmarkHtml } from '../brand/brand';
import { mountDrawPalette, type DrawPalette } from './draw-palette';
import {
  MyLibrary,
  mineCommands,
  type MineItem,
  type MineKind,
} from './my-library';
import { mountMyTemplatesPanel } from './my-templates-panel';
import { openSceneBreakdown } from './scene-breakdown';
import { kindMismatch, recommendedKind } from './scene-parts';
import {
  DEFAULT_EDITOR_LAYOUT,
  railCategories,
  railIcon,
  resolveEditorLayout,
} from './editor-layout';
import { scenePosterUrl } from './scene-poster';
import { mountContextToolbar } from './context-toolbar';
import { CropTool } from './crop-tool';
import { AnimatedInEditorError } from './editor-mode';
import { escapeTopPopover } from './components/popover';
import { mountToolPanels } from './tool-panels';
import { mountLibraryPanels } from './library-panel';
import { createLibraryActions, LIBRARY_DRAG_TYPE } from './library-actions';
import { mountSignature } from './signature';
import { addTopLevel, myTextStyleCommands } from './library-insert';
import {
  RIGHT_ICONS,
  RIGHT_SECTIONS,
  firstTabKey,
  kindOf,
  mountRightPanel,
  plannedSection,
  sectionsFor,
  focusedScene,
  type RightSection,
} from './right-panel';
import { applyCanvasSize } from './canvas-size';
import {
  ALT_TEXT_LIMIT,
  altTextOf,
  layerInfo,
  resizeCanvasToSelection,
  selectionSize,
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
import {
  onEditNotice,
  performEdit,
  planLanding,
  trackForNewClip,
} from './editing';
import { iconSvg } from './icons';
import { panelHeaderHtml } from './panel-header';
import {
  confirmDialog,
  escapeHtml,
  openModal,
  promptDialog,
} from './components/modal';
import { openPopover, type PopoverHandle } from './components/popover';
import { showToast } from './components/toast';
import { catalogMediaKey, libraryClient } from '../library-client';
import { catalogAsset } from '../library-client/media';
import type { CatalogEntry } from '../library-client/format';
import { TrainingLog, openTrainingStore } from '../training/record';
import { gateControl } from '../features/registry';
import type { LibraryItem } from '../library/schema';
import { mountNewProjectForm } from './new-project-form';
import { bindShortcuts } from '../commands/shortcuts';
import { mountShortcutSheet } from './shortcut-sheet';
import { runCommand, type CommandContext } from '../commands/registry';
import { mountCommandPalette } from './command-palette';
import { closeTopOverlay, registerExternalOverlay } from './temporary-overlay';
import { cycleThemePreference, onThemeChange, themePreference } from './theme';
import { openSettings } from './settings-dialog';
import { openCompositionBuild } from './composition-dialog';
import { PARAMS_HEADER } from './ai-import-dialog';
import { cameraMatrixFor, cameraStateAt } from '../camera/shots';
import { sceneCameraMatrix } from '../camera/scene';
import { selectionBounds } from '../render/selection';
import { cameraBadge, cameraView } from './camera-panel';
import { cameraSection, cameraUi, selectedShot } from './camera-section';
import {
  feelTheme,
  isPlanV2,
  KIT_IDS,
  kitLayers,
  withFeelDefaults,
  type VideoPlan,
} from '../video-plan';
import { kitPreviewUrl } from '../video-plan/kit-preview';
import type { FeelExtras } from '../themes/library';
import { openPlanBuild, planServices } from './plan-build-dialog';
import { planReviewPanel } from './plan-review';
import { planState, savePlanState } from './plan-state';
import { planVoiceEngine } from './voiceover';
import { synthesizeToMedia } from '../speech';
import type { LicenseMeta } from '../providers';
import { mountCameraFrame } from './camera-frame';
import { cameraShotsOf } from '../camera/shots';
import { updateCameraCommands } from '../camera/shot-commands';
import type { Asset, Project } from '../core';
import {
  dropStock,
  mountStock,
  stockQuality,
  type StockDeps,
} from './stock-panel';
import { hasKeys, importStockItem } from '../providers';
import { stockProviders } from './services';
import {
  t,
  formatNumber,
  getLanguage,
  setLanguage,
  subscribe,
  bindDomTranslations,
} from '../i18n';

// H2: the order a user reaches for them; below 800 px of height the rail
// shows the first six and a More button for the rest. FIX6: which categories
// show, in what order and with which icon comes from the editor layout
// (src/ui/editor-layout.ts), so a published layout can change it later.
const EDITOR_LAYOUT = resolveEditorLayout(DEFAULT_EDITOR_LAYOUT);
const RAIL_CATEGORIES = railCategories(EDITOR_LAYOUT);
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
  realEngine: EditorEngine,
  actions: ShellActions = {},
  renderer: CompositionRenderer = new Canvas2DRenderer(),
) {
  // FIX1 F6: inside a nested clip the editor edits its inside as a scene;
  // the wrapper writes each edit back to the real engine (one undo step).
  const engine = createNestEngine(realEngine);
  const categoryKey = (name: string) => `library.${name.toLowerCase()}`;
  const railButton = (name: string, icon: string, pressed: boolean) =>
    `<button type="button" data-category="${name}" aria-pressed="${pressed}" title="${t(categoryKey(name))}">${iconSvg(icon)}<span class="icon-rail-label">${t(categoryKey(name))}</span></button>`;
  const sectionKey = (name: string) => `panel.${name.toLowerCase()}`;
  const rightRailButton = (name: string, icon: string, pressed: boolean) =>
    `<button type="button" data-section="${name}" aria-pressed="${pressed}" title="${name === 'Properties' ? t('panel.properties') : t(sectionKey(name))}">${iconSvg(icon)}<span class="icon-rail-label">${name === 'Properties' ? t('panel.properties') : t(sectionKey(name))}</span></button>`;
  // J8: the editor replaces index.html's loading skeleton.
  root.removeAttribute('aria-busy');
  root.innerHTML = `
    <div class="editor-shell" data-editor-mode="editor">
      <header class="topbar">
        <div class="topbar-start">
          <button type="button" id="menu-trigger" class="icon-button menu-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="app-menu" aria-label="${t('menu.main')}" title="${t('menu.main')}">${iconSvg('menu')}</button>
          ${wordmarkHtml('sm')}
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
          <button type="button" id="open-brief" role="menuitem">${iconSvg('copy')}${t('brief.copy')}</button>
          <button type="button" id="open-settings" role="menuitem">${iconSvg('adjust')}${t('settings.title')}</button>
        </div>
        <div class="app-menu-group" role="group" aria-label="${t('menu.help')}">
          <div class="app-menu-label">${t('menu.help')}</div>
          <button type="button" id="open-shortcuts" role="menuitem">${iconSvg('info')}${t('shortcuts.title')}<span class="shortcut-hint">Ctrl+/</span></button>
          <button type="button" id="about" role="menuitem">${iconSvg('info')}${t('menu.about')}</button>
        </div>
      </div>
      <nav class="icon-rail" id="rail-left" aria-label="${t('library.categories')}">${RAIL_CATEGORIES.map((name) => railButton(name, railIcon(EDITOR_LAYOUT, name), false)).join('')}<button type="button" class="rail-more" id="rail-more" aria-haspopup="menu" aria-expanded="false" title="${t('library.more')}">${iconSvg('more')}<span class="icon-rail-label">${t('library.more')}</span></button></nav>
      <aside class="library panel" id="library-panel" aria-label="${t('library.title')}">
        <div class="import-row" data-rail-panel="Media" hidden><button type="button" class="button primary" id="import-media" title="${t('media.importButton')}">${iconSvg('export')}${t('library.import')}</button><button type="button" class="button primary import-menu-button" id="import-menu" aria-haspopup="menu" aria-expanded="false" aria-label="${t('code.importMenu')}" title="${t('code.importMenu')}">${iconSvg('chevronDown', 16)}</button><input type="file" id="import-media-input" multiple accept="video/*,audio/*,image/*,.mov,.m4a,.mkv,.svg" hidden /></div>
        <div class="media-panel" id="media-panel" data-rail-panel="Media" hidden></div>
        <div class="library-placeholder" data-rail-panel="placeholder" hidden><div class="placeholder-icon" aria-hidden="true">${iconSvg('info', 22)}</div><h3 id="library-title">${t('library.assetsTitle')}</h3><p id="library-description">${t('library.assetsDescription')}</p><span class="quiet-tag">${t('library.later')}</span></div>
        <div class="draw-panel" id="draw-panel" hidden></div>
        <div id="library-elements" data-rail-panel="Elements" hidden></div>
        <div id="library-templates" data-rail-panel="Templates" hidden></div>
        <div id="library-text" data-rail-panel="Text" hidden></div>
        <div id="library-audio" data-rail-panel="Audio" hidden></div>
        <div id="library-record" data-rail-panel="Record" hidden></div>
        <div id="library-ai" class="ai-panel" data-rail-panel="AI" hidden></div>
        <div id="library-mine" class="mine-panel" data-rail-panel="MyTemplates" hidden></div>
        <div id="library-theme" class="theme-panel" data-rail-panel="Theme" hidden></div>
        <div class="scene-heading" id="scene-heading" data-rail-panel="Scene"><span id="layer-count" class="count"></span></div>
        <div id="scene-list" class="scene-list" data-rail-panel="Scene" aria-label="${t('scene.layers')}"></div>
        <div id="side-panel-host"></div>
      </aside>
      <main class="preview-panel" aria-label="${t('canvas.preview')}">
        <div class="canvas-stage" id="canvas-stage"><div class="stage-toolbar-row" id="toolbar-row"><div class="context-toolbar" id="context-toolbar" hidden></div></div><div class="artboard-shadow" id="artboard-shadow" aria-hidden="true"></div><canvas id="composition-canvas" tabindex="0" aria-label="${t('canvas.help')}">${t('canvas.fallback')}</canvas><div class="canvas-empty" id="canvas-empty" hidden>${wordmarkHtml()}<h3>${t('canvas.emptyTitle')}</h3></div><div class="selection-actions" id="selection-actions" hidden></div><div class="canvas-context-menu" id="canvas-context-menu" role="menu" hidden></div><div class="buffering-indicator" id="buffering-indicator" role="status" hidden>${t('canvas.buffering')}</div><div class="brush-cursor" id="brush-cursor" aria-hidden="true" hidden></div><div class="canvas-chip" id="canvas-chip" role="status" hidden></div><div class="code-render-status" id="code-render-status" role="status" hidden></div></div>
        <div id="scene-strip"></div>
        <div class="preview-toolbar" id="canvas-footer">
          <div class="composition-picker"><button type="button" class="icon-button" id="scene-strip-show" aria-pressed="false" aria-controls="scene-strip" aria-label="${t('scene.stripShow')}" title="${t('scene.stripShow')}">${iconSvg('filmstrip', 20)}</button><button type="button" class="button sm" id="scene-board-toggle" aria-pressed="false" title="${t('scene.boardTip')}">${iconSvg('scenes', 20)}<span>${t('scene.board')}</span></button></div>
          <div class="preview-summary"><span id="composition-summary"></span><span id="selection-summary" role="status">${t('selection.none')}</span><span id="zoom" class="sr-only">${t('canvas.fit')}</span></div>
          <div class="canvas-zoom-controls">
            <button type="button" class="icon-button" data-canvas-tool="hand" aria-pressed="false" aria-label="${t('canvas.hand')}" title="${t('canvas.hand')} (H)">${iconSvg('hand', 20)}</button>
            <button type="button" class="icon-button" data-canvas-zoom="out" aria-label="${t('canvas.zoomOut')}" title="${t('canvas.zoomOut')} (Ctrl+-)">${iconSvg('zoomOut', 20)}</button>
            <span id="canvas-zoom-field"></span>
            <button type="button" class="icon-button" data-canvas-zoom="in" aria-label="${t('canvas.zoomIn')}" title="${t('canvas.zoomIn')} (Ctrl+=)">${iconSvg('zoomIn', 20)}</button>
            <button type="button" class="button sm ghost" data-canvas-zoom="fit" title="${t('canvas.fit')} (Ctrl+0)">${iconSvg('fit', 20)}<span>${t('canvas.fit')}</span></button>
            <button type="button" class="button sm ghost" data-canvas-zoom="actual" title="${t('canvas.actualSizeTip')}">${t('canvas.actualSize')}</button>
            <button type="button" class="icon-button" id="fullscreen-preview" aria-label="${t('canvas.fullscreen')}" title="${t('canvas.fullscreen')}" disabled>${iconSvg('fullscreen', 20)}</button>
          </div>
        </div>
        <p class="render-warning" id="render-warning" role="status" hidden></p>
      </main>
      <aside class="inspector panel" id="inspector-panel" aria-label="${t('inspector.title')}">
        ${panelHeaderHtml({ className: 'right-panel-header', titleId: 'right-panel-title', extra: '<span class="count-badge" id="right-panel-count" hidden></span>', button: { id: 'right-panel-collapse', icon: 'panelRight', label: t('right.collapse') } })}
        <div id="right-section"></div>
        <div id="inspector-content"></div>
        <section class="animation-panel" id="animation-panel" aria-label="${t('animation.title')}" hidden></section>
        <div id="right-panel-empty" class="inspector-empty" hidden>${wordmarkHtml('sm')}<h3 id="right-panel-empty-title"></h3><p id="right-panel-empty-description"></p><span class="quiet-tag">${t('library.later')}</span></div>
      </aside>
      <nav class="icon-rail icon-rail-right" id="rail-right" aria-label="${t('inspector.title')}">${RIGHT_SECTIONS.map((name) => rightRailButton(name, RIGHT_ICONS[name], name === 'Properties')).join('')}</nav>
      <section class="timeline" aria-label="${t('timeline.title')}"><div id="timeline-foundation"></div></section>
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
  let sceneOutliner: SceneOutliner = {
    render: () => undefined,
    dispose: () => undefined,
  };
  const message = (text: string) => {
    element('#status').textContent = text;
  };
  // Refused or failed edits must be noticed, not just logged in the status bar.
  /** J3: errors from a live preview are not shown (the commit reports them). */
  let previewing = false;
  const reportError = (error: unknown) => {
    if (previewing) return;
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
  // R1: Group and Ungroup say what they did.
  onEditNotice((text) => {
    message(text);
    showToast(text, 'success');
  });
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
    importRow: element('.import-row'),
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
      // FINAL2 U5: the persisted master volume (AUDIO-API.md).
      projectMasterVolume(engine),
    );
  // W4-B: decoded frames arrive asynchronously; coalesce their redraws per frame.
  let redrawQueued = false;
  let audioError: string | null = null;
  const audio = new AudioEngine(decoder, () => {
    if (!disposed) safely(draw);
    // FINAL2 U5: a processing (noise reduction) failure shows in the open
    // right panel at once, with Turn off and Try again.
    const error = audio.debug.processingError ?? null;
    if (error !== audioError && !disposed) {
      audioError = error;
      safely(() => rightPanel.render(activeSection as RightSection));
    }
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
  // FINAL2 U8: Reconnect media for files missing from this browser's store.
  const mediaRelink = mountMediaRelink({
    engine,
    store: mediaStore,
    refreshed: () => {
      frames.retry();
      waveforms.retry();
      previews.retry();
    },
  });
  setTimeout(() => void mediaRelink.check(), 0);
  // Phase 1 library (P1-25): a catalog sound, video or picture becomes an
  // asset at once; it draws its poster and plays its proxy until the full
  // file (fetched here, in the background) is in this browser, then swaps
  // in place. A failed download never blocks: the layer stays, a toast
  // offers Retry.
  const catalog = libraryClient();
  frames.posterOf = (assetId) => {
    const asset = (
      session.source.assets as unknown as readonly {
        id: string;
        type: string;
        metadata: Record<string, unknown>;
      }[]
    ).find((item) => item.id === assetId);
    const sha = asset?.metadata.catalogPoster;
    return asset && asset.type !== 'audio' && typeof sha === 'string'
      ? catalog.poster(sha)
      : null;
  };
  const fullJobs = new Map<string, Promise<void>>();
  const fetchCatalogFull = (entry: CatalogEntry, assetId: string) => {
    const full = entry.media?.full;
    if (!full) return Promise.resolve();
    let job = fullJobs.get(assetId);
    if (!job) {
      job = catalog
        .file(full, catalogMediaKey(full.sha256))
        .then((blob) => {
          if (!blob) throw new Error('missing');
          frames.upgrade(assetId);
          decoder.forget(assetId);
          waveforms.retry();
          previews.retry();
        })
        .catch(() => {
          showToast(
            t('library.mediaFailed', {
              name: entry.name[getLanguage()] || entry.name.en,
            }),
            'error',
            10000,
            {
              label: t('library.retry'),
              run: () => void fetchCatalogFull(entry, assetId),
            },
          );
        })
        .finally(() => fullJobs.delete(assetId));
      fullJobs.set(assetId, job);
    }
    return job;
  };
  /** The asset of a heavy catalog entry (made or restored now, one id). */
  const ensureCatalogAsset = (entry: CatalogEntry): string => {
    const asset = catalogAsset(entry, getLanguage());
    const known = (
      engine.state.assets as unknown as readonly {
        id: string;
        metadata: Record<string, unknown>;
      }[]
    ).find((item) => item.id === asset.id);
    if (!known)
      engine.library('Add from library', [
        { type: 'ADD_ASSET', asset } as Command,
      ]);
    else if (known.metadata.removed === true) {
      const { removed: _removed, ...metadata } = known.metadata;
      void _removed;
      engine.library('Restore media', [
        {
          type: 'REPLACE_ASSET',
          asset: { ...known, metadata },
        } as unknown as Command,
      ]);
    }
    // After the placing step (P1-24: nothing on the critical path waits on
    // the network).
    // Two frames later: the placed item is drawn first.
    const later = () => void fetchCatalogFull(entry, asset.id);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setTimeout(later, 0)),
    );
    return asset.id;
  };
  engine.on('state:changed', (event) => {
    if (event.reason === 'load') setTimeout(() => void mediaRelink.check(), 0);
  });
  // X1 (spec section 5): code animations play from a frame cache that the
  // preview and the export share; the baker fills it one job at a time.
  const codeCache = new FrameCache(mediaStore);
  // P2: My library (Creator Pack items), beside My Templates.
  const creatorLibrary = new CreatorLibrary(mediaStore);
  // Phase 1 (P1-31): training-data records for AI-built videos (no UI).
  const training = new TrainingLog(openTrainingStore());
  {
    let pending: string[] = [];
    // The project open at start was loaded before the shell listened.
    void training.has(engine.state.id);
    engine.on('command:applied', (event) => pending.push(event.type));
    engine.on('state:changed', (event) => {
      const id = engine.state.id;
      if (event.reason === 'load') {
        pending = [];
        void training.has(id);
        return;
      }
      if (event.reason === 'library') return void (pending = []);
      const label =
        event.reason === 'undo'
          ? 'Undo'
          : event.reason === 'redo'
            ? 'Redo'
            : (engine.undoLabel ?? '');
      void training.edit(
        id,
        label,
        event.reason === 'undo' || event.reason === 'redo' ? [] : pending,
      );
      pending = [];
    });
  }
  // R5: My Templates, the user's own saved elements and scenes (this
  // browser, not the project, never an undo step). Old scene templates in
  // localStorage move in once.
  const myLibrary = new MyLibrary(mediaStore, () => ({
    list: myTemplates.list(),
    clear: () => {
      for (const template of myTemplates.list())
        myTemplates.remove(template.id);
    },
  }));
  const codeBaker = new CodeBaker(codeCache, openCodeSession);
  const codeOf = (layerId: string): CodeData | null => {
    const find = (
      layers: readonly DeepReadonly<CoreLayer>[],
    ): CodeData | null => {
      for (const layer of layers) {
        if (layer.id === layerId)
          return (layer.code as unknown as CodeData | undefined) ?? null;
        const inner = find(layer.children);
        if (inner) return inner;
      }
      return null;
    };
    for (const composition of engine.state.compositions) {
      const found = find(composition.layers);
      if (found) return found;
    }
    return null;
  };
  const queueCodeDraw = () => {
    if (redrawQueued || disposed) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      safely(draw);
    });
  };
  // P1: the thumbnail frame before a bake has a frame, and the frame rendered
  // directly while a control is dragged.
  const codePosters = new CodePosters(openCodeSession);
  codePosters.onChange(queueCodeDraw);
  const codeLive = new CodeLive(openCodeSession, queueCodeDraw);
  const codeFrames = new CodeFrames(
    codeCache,
    codeBaker,
    codeOf,
    queueCodeDraw,
    codePosters,
    codeLive,
  );
  frames.code = codeFrames;
  codeBaker.onChange(() => {
    if (redrawQueued || disposed) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      safely(draw);
    });
  });
  /** The bake spec of a code layer in the open scene at its quality. */
  const codeSpec = (layerId: string, quality?: 'full' | 'draft') => {
    const code = codeOf(layerId);
    if (!code) return null;
    const composition = session.source.composition;
    const fps = codeFps(code, composition.fps);
    return bakeSpecOf(
      code,
      {
        tier: code.tier,
        bakeKey: code.bakeKey,
        width: composition.width,
        height: composition.height,
        fps,
        frames: frameCount(codeMeta(code).duration, fps),
        frame: 0,
      },
      quality ?? codeFrames.qualityOf(layerId),
    );
  };
  /**
   * FIX7: renders every code animation of a built (not yet added) project,
   * so the video plays smoothly the moment it appears. The frames go to the
   * same cache the preview reads; a cancel stops the work.
   */
  const prepareBuilt = async (
    project: { compositions: readonly unknown[] },
    signal: AbortSignal,
    progress: (fraction: number) => void,
  ) => {
    type Walked = {
      layers: readonly { code?: unknown; children: readonly unknown[] }[];
    };
    const specs = new Map<string, ReturnType<typeof bakeSpecOf>>();
    const walk = (
      scene: { width: number; height: number; fps: number },
      layers: readonly unknown[],
    ) => {
      for (const layer of layers as Walked['layers']) {
        const code = layer.code as CodeData | undefined;
        if (code) {
          const fps = codeFps(code, scene.fps);
          const spec = bakeSpecOf(
            code,
            {
              tier: code.tier,
              bakeKey: code.bakeKey,
              width: scene.width,
              height: scene.height,
              fps,
              frames: frameCount(codeMeta(code).duration, fps),
              frame: 0,
            },
            'full',
          );
          specs.set(spec.cacheKey, spec);
        }
        walk(scene, layer.children);
      }
    };
    for (const scene of project.compositions as (Walked & {
      width: number;
      height: number;
      fps: number;
    })[])
      walk(scene, scene.layers);
    const all = [...specs.values()];
    const stop = () => {
      for (const spec of all) codeBaker.cancel(spec.cacheKey);
      throw new DOMException('Cancelled', 'AbortError');
    };
    let done = 0;
    progress(all.length ? 0 : 1);
    for (const spec of all) {
      if (signal.aborted) stop();
      const timer = window.setInterval(
        () => progress((done + codeBaker.progress(spec.cacheKey)) / all.length),
        250,
      );
      const aborted = new Promise<never>((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        }),
      );
      try {
        await Promise.race([codeBaker.complete(spec), aborted]);
      } catch (error) {
        if (signal.aborted) stop();
        throw error;
      } finally {
        window.clearInterval(timer);
      }
      done++;
      progress(done / all.length);
    }
  };
  const codeStatus: CodeClipStatus = {
    status(layerId) {
      const spec = codeSpec(layerId);
      if (!spec) return null;
      const job = codeBaker.job(spec.cacheKey);
      const complete = codeCache.complete(spec.cacheKey);
      return {
        state: complete ? 'done' : (job?.state ?? 'queued'),
        progress: codeBaker.progress(spec.cacheKey),
        error: job?.error,
      };
    },
    onChange: (listener) => {
      const off = [
        codeBaker.onChange(listener),
        codePosters.onChange(listener),
      ];
      return () => off.forEach((stop) => stop());
    },
    poster(layerId) {
      const code = codeOf(layerId);
      const spec = codeSpec(layerId, 'full');
      return code && spec ? codePosters.url(code.bakeKey, spec) : null;
    },
    cancel(layerId) {
      const spec = codeSpec(layerId);
      if (spec) codeBaker.cancel(spec.cacheKey);
    },
    resume(layerId) {
      const spec = codeSpec(layerId);
      if (spec) codeBaker.ensure(spec, true);
    },
  };
  /**
   * P1: Re-render. Drops the layer's stored frames (and its poster) and
   * bakes it again from frame 0.
   */
  const rerenderCode = async (layerId: string) => {
    const spec = codeSpec(layerId);
    if (!spec) return;
    codeBaker.cancel(spec.cacheKey);
    // Wait for a cancelled running bake to stop before its frames go.
    while (codeBaker.running === spec.cacheKey)
      await new Promise((resolve) => setTimeout(resolve, 16));
    await codeCache.remove(spec.cacheKey);
    codeBaker.forget(spec.cacheKey);
    codeBaker.ensure(spec, true);
    queueCodeDraw();
  };
  // P1: while a code layer of the open scene bakes, the canvas says so.
  const codeRenderStatus = element<HTMLElement>('#code-render-status');
  const paintCodeStatus = () => {
    const visit = (layers: readonly SceneLayer[]): string | null => {
      for (const layer of layers) {
        if (layer.code) {
          const status = codeStatus.status(layer.id);
          if (
            status &&
            (status.state === 'queued' || status.state === 'running')
          )
            return t('code.bakeProgress', {
              percent: formatNumber(Math.floor(status.progress * 100)),
            });
        }
        const inner = visit(layer.children);
        if (inner) return inner;
      }
      return null;
    };
    const text = visit(session.source.composition.layers);
    codeRenderStatus.hidden = !text;
    if (text && codeRenderStatus.textContent !== text)
      codeRenderStatus.textContent = text;
  };
  codeBaker.onChange(paintCodeStatus);
  /** FINAL3 C3: the camera's depth-0 matrix while previewing, else null. */
  const previewCameraMatrix = (): AffineMatrix | null => {
    if (!cameraView.preview || session.playing) return null;
    const composition = session.source.composition;
    const time = session.currentTime;
    const rig = cameraStateAt(composition, time, (id) => {
      const box = selectionBounds(session.source, id);
      if (!box) return null;
      const [x, y] = transformPoint(box.matrix, [
        box.bounds.x + box.bounds.width / 2,
        box.bounds.y + box.bounds.height / 2,
      ]);
      return { x, y };
    });
    if (rig)
      return cameraMatrixFor(rig, composition, 0) as unknown as AffineMatrix;
    return composition.camera
      ? (sceneCameraMatrix(composition, time) as unknown as AffineMatrix)
      : null;
  };
  // G3: Fit, then the zoom about the view's center, then the pan.
  const viewportFor = (
    z: number,
    requested: readonly [number, number],
    withLens = true,
  ) => {
    const fitHeight = Math.max(1, canvas.clientHeight || stage.clientHeight);
    const view = fitViewport(
      Math.max(1, canvas.clientWidth || stage.clientWidth),
      fitHeight,
      session.source.composition,
      window.devicePixelRatio || 1,
      // FINAL3 A1: a portrait canvas on a short stage (laptop-height
      // windows) keeps 12 px per side, so the margin does not shrink it.
      fitHeight < 560 &&
        session.source.composition.height > session.source.composition.width
        ? { ...EDITOR_FIT, padding: 12 }
        : EDITOR_FIT,
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
    let matrix = at(pan);
    // FINAL3 A1: at a whole-pixel zoom (100 %, 200 %) the artboard sits on
    // whole device pixels, so nothing is resampled (crisp, as in Figma).
    const device = matrix[0] * view.pixelRatio;
    if (Math.abs(device - Math.round(device)) < 1e-9 && matrix[1] === 0) {
      const snap = (value: number) =>
        Math.round(value * view.pixelRatio) / view.pixelRatio;
      const [a, b, c, d, e, f] = matrix;
      matrix = [a, b, c, d, snap(e), snap(f)];
    }
    // FINAL3 C3: Preview camera looks through the camera's depth-0 view, so
    // layers are drawn, picked and moved where the camera shows them (the
    // camera's frame stays where the artboard is).
    const lens = withLens ? previewCameraMatrix() : null;
    if (lens) matrix = multiplyMatrices(matrix, lens);
    return { ...view, matrix };
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
    const [a, , , d, e, f] = viewportFor(
      session.canvasZoom,
      session.canvasPan,
      false,
    ).matrix;
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
  let lastCanvasSize = '';
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
  let masterVolume: number | null = null;
  let nestBar: ReturnType<typeof mountNestBar> | undefined;
  const captionsContext: CaptionsContext = { engine, session, mediaStore };
  const syncAudio = () => {
    // FINAL2 U5: the engine follows the project's master volume.
    const master = projectMasterVolume(engine);
    if (master !== masterVolume) {
      masterVolume = master;
      audio.setMasterVolume(master);
    }
    const clock = timeline?.playback.clock ?? session.currentTime;
    const clips = audibleClips();
    audio.sync(session.playing, clock, clips);
    // U2 (D-177): audio sounds only while playing; a scrub, a ruler click,
    // a frame step or a typed time stays silent (no snippets).
  };
  let selectionActions: ReturnType<typeof mountSelectionActions> | undefined;
  /** J4: the on-canvas text editor (mounted with the canvas interaction). */
  let textEditing: TextEditor | undefined;
  // U2: how many times the canvas has been drawn (read by the test hook).
  let drawCount = 0;
  /**
   * V7 (spec 10.5): while playing across a scene cut, the canvas shows the
   * transition: the open scene with the neighbour's boundary frame, mixed.
   */
  const drawSceneCut = (drawn: RenderSource) => {
    const scenes = engine.state.compositions;
    const open = drawn.composition;
    const active = activeCut(cutsAround(scenes, open.id), session.currentTime);
    if (!active) return;
    const index = scenes.findIndex((scene) => scene.id === open.id);
    const other = active.cut.time === 0 ? scenes[index - 1] : scenes[index + 1];
    if (!other) return;
    const at = active.cut.time === 0 ? other.duration - 1 / other.fps : 0;
    const neighbour: RenderSource = {
      composition: compositionAt(other, at),
      assets: drawn.assets,
      background: other.backgroundColor,
      currentTime: at,
      frames,
      playing: false,
      animate: true,
      ...(drawn.measureText ? { measureText: drawn.measureText } : {}),
    };
    const context = canvas.getContext('2d');
    if (!context) return;
    const view = viewport();
    drawSceneTransition(context, active.cut, active.p, (target, side) =>
      drawComposition(
        target,
        (side === 'from') === (active.cut.time === 0) ? neighbour : drawn,
        view,
        null,
        { overlays: false },
      ),
    );
  };
  let cameraFrameTool: ReturnType<typeof mountCameraFrame> | null = null;
  const draw = () => {
    if (disposed) return;
    drawCount++;
    syncAudio();
    frames.beginFrame(
      session.playing
        ? (timeline?.playback.clock ?? session.currentTime) -
            session.currentTime
        : 0,
    );
    // J3: a control being dragged previews its edit on the canvas.
    const base = session.previewSource ?? session.source;
    // FINAL2 U10: the editing canvas shows the scene un-moved by the
    // camera unless playing or "Preview camera" is on.
    // FINAL3 C3: the camera (shots or the scene camera) is off while
    // editing, applied while playing, and with "Preview camera" folded into
    // the view (so layers stay selectable and movable through it).
    const cameraOff = !session.playing && !cameraView.preview;
    const shotFrame = cameraFrameTool?.overlay() ?? null;
    const drawn = {
      ...base,
      ...(cameraOff ? { camera: false } : {}),
      ...(shotFrame ? { cameraFrame: shotFrame } : {}),
      ...(!session.playing && cameraView.preview ? { cameraInView: true } : {}),
      // G4: the eraser's cuts show while dragging; release commits them.
      ...(drawTool.erased.size
        ? {
            composition: withErasedPaths(base.composition, drawTool.erased),
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
      // FINAL2 U7: the chroma key's preview quality (export stays full).
      ...(layerEffects.quality === 'fast'
        ? { chromaQuality: 'fast' as const }
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
    if (session.playing) drawSceneCut(drawn);
    else effectsTool.draw(viewport().matrix);
    frames.endFrame();
    if (textEditing?.layerId) textEditing.sync();
    syncNumberField(root, 'canvas-zoom-percent', canvasView.scale * 100);
    // G2.1: X, Y, W and H (and the stored values) follow a handle drag live.
    if (!session.playing) syncGeometryFields(root, drawn);
    updateChip(drawn);
    placeArtboardShadow();
    updateSelectionActions();
    {
      const badge = cameraBadge(session.source.composition);
      cameraBadgeEl.hidden = !badge;
      cameraBadgeEl.textContent = badge ?? '';
      cameraBadgeEl.dataset.preview = String(cameraView.preview);
    }
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
  // FINAL2 U7: mask handles and the chroma eyedropper on the canvas.
  const effectsTool = createEffectsCanvasTool(
    engine,
    session,
    canvas,
    reportError,
  );
  layerEffects.requestDraw = () => safely(draw);
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
  // U5: the Animate presets live in the right panel's Animate tab; the
  // toolbar's Animate button opens it there.
  let animateShown = false;
  const animateBody = document.createElement('div');
  animateBody.className = 'right-animate-body';
  animateBody.dataset.deepPanel = 'animate';
  const animatePanel = mountAnimatePanel(
    {
      body: animateBody,
      get isOpen() {
        // (A collapsed right panel keeps its section but is not open.)
        return animateShown && Boolean(workspace?.rightOpen);
      },
      open: () => {
        workspace?.setOpen('right', true);
        setRightSection('Animate');
      },
      close: () => undefined,
      toggle: () => animatePanel.open(),
    },
    engine,
    session,
    reportError,
    {
      // R2: AI presets are applied from the AI category, not Animate.
      list: () => [],
      applied: (layerId) => {
        const found = locateLayer(session.source.composition.layers, layerId);
        return found ? livePresets(found.layer).map((item) => item.id) : [];
      },
      apply: (id) => applyCreatorPreset(id),
    },
  );
  // H4: the right panel's sections other than Properties.
  // FIX1 F5: the Mixer's host, shown by the right panel as Project audio.
  const projectAudioHost = document.createElement('section');
  const rightPanel = mountRightPanel(
    element('#right-section'),
    engine,
    session,
    reportError,
    {
      animateBody: () => {
        animatePanel.render();
        return animateBody;
      },
      openTool: (id) =>
        id === 'position' ? positionPanel.toggle() : toolPanels?.open(id),
      // I4: the toolbar's crop tool and popover contents (one implementation).
      crop: () => toolPanels?.startCrop(),
      build: (id) => contextToolbar.build(id),
      projectAudio: () => projectAudioHost,
      // X2: the selected code layer's Animation settings.
      codeBody: () => codeBody(),
      themeBody: () => {
        const host = document.createElement('div');
        host.className = 'theme-panel';
        host.id = 'right-theme';
        mountThemePanel(host, { ...themeOptions, onChange: () => () => {} });
        return host;
      },
      // FINAL3 C3: the Camera section (cameras, shots, Blender settings).
      cameraBody: () =>
        cameraSection({
          composition: () => session.source.composition,
          assets: () => engine.state.assets,
          time: () => session.currentTime,
          selectedId: () =>
            session.selectedIds.length === 1 ? session.selectedIds[0]! : null,
          select: (id) => session.select(id),
          run: (label, commands) =>
            engine.commands.transaction(label, commands),
          report: reportError,
          redraw: () => safely(draw),
          rerender: () => rightPanel.render('Camera'),
        }),
      audioDecoder: decoder,
      // V7 (spec 11.5): Save stores the speech and adds or replaces its clip.
      tts: {
        report: reportError,
        save: async (file, name, settings, clipId) => {
          const assetId = await importMade(file);
          const found = clipId
            ? findClip(session.source.composition, clipId)
            : null;
          if (!found) {
            const created = addOnNewAudioLane(assetId, {
              name,
              tts: settings,
            });
            ttsState.clipId = created;
            openCategory('Media');
            return;
          }
          // Replace: the new audio, its length, the same clip (volume and
          // fades kept), one step.
          registerTtsCommands(engine);
          const asset = session.source.assets.find(
            (item) => item.id === assetId,
          );
          const length =
            asset?.duration && asset.duration > 0
              ? asset.duration
              : found.clip.duration;
          const composition = session.source.composition;
          engine.commands.transaction('Replace text to speech', [
            {
              type: 'SET_LAYER_ASSET',
              compositionId: composition.id,
              layerId: found.clip.layerId,
              assetId,
            },
            {
              type: 'SET_CLIP_TIMING',
              compositionId: composition.id,
              clipId: found.clip.id,
              startTime: found.clip.startTime,
              duration: length,
              sourceIn: 0,
              sourceOut: length,
            },
            ttsCommand(composition.id, found.clip.id, settings),
          ]);
        },
      },
      sample: (width, height) => selectionSample(width, height),
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
      // FINAL2 U10: the scene camera panel.
      camera: () => openCameraSection(),
      autoCaptions: () => openAutoCaptions(captionsContext),
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
  // S1 Part 4: the menu is fixed to the window and lives outside the stage,
  // so no region (the timeline's ruler, a panel) can paint over it.
  root.append(canvasMenu);
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
  /** FINAL3 C3: the scene toolbar's Camera opens the right Camera section. */
  const openCameraSection = () => {
    cameraUi.open = true;
    themeState.open = false;
    projectAudioState.open = false;
    transitionFocus.sceneId = null;
    root.querySelector('.editor-shell')?.classList.remove('right-empty');
    workspace?.setEmpty(false);
    renderedRight = '';
    syncRightRail();
    setRightSection('Camera');
    workspace?.setOpen('right', true);
  };
  // The badge over the canvas, and no picking while the camera is previewed.
  const cameraBadgeEl = document.createElement('div');
  cameraBadgeEl.className = 'camera-badge';
  cameraBadgeEl.id = 'camera-badge';
  cameraBadgeEl.setAttribute('role', 'status');
  cameraBadgeEl.hidden = true;
  (root.querySelector('#canvas-footer') ?? stage).append(cameraBadgeEl);
  // FINAL3 C3: Preview camera no longer blocks the canvas: the view looks
  // through the camera, so layers are picked and moved where they are seen.
  // While editing, the selected shot's camera frame edits its start or end
  // (with a shot selected the canvas edits the camera; select a layer in
  // the timeline or the Scene list, or turn the frame off, to edit layers).
  const framedShot = () =>
    selectedShot(session.source.composition, session.selectedIds);
  cameraFrameTool = mountCameraFrame({
    stage,
    canvas,
    scene: () => session.source.composition,
    shot: framedShot,
    which: () => cameraUi.edit,
    matrix: () => viewport().matrix,
    active: () =>
      cameraUi.frame &&
      !cameraUi.pickFocus &&
      !session.playing &&
      !cameraView.preview &&
      !cropTool.active,
    run: (label, commands) =>
      safely(() => {
        engine.commands.transaction(label, commands);
      }),
    redraw: () => safely(draw),
  });
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
          // J6: a visible confirmation.
          showToast(t('altText.saved'), 'success', 3000);
        });
      wrap.append(hint, area, save);
      queueMicrotask(() => area.focus());
      return wrap;
    });
  };
  /**
   * V4 (spec 5): the FX tiles' source picture: the selected elements alone
   * at the playhead, without their effects, fitted on black at the given
   * size. Null when nothing visible is selected.
   */

  const selectionSample = (width: number, height: number) => {
    const source = session.source;
    const roots = selectionRoots(source, session.selectedIds);
    const boxes = roots
      .map((layer) => worldBox(source, layer.id))
      .filter((box): box is NonNullable<typeof box> => !!box);
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map((box) => box.x)),
      top = Math.min(...boxes.map((box) => box.y)),
      right = Math.max(...boxes.map((box) => box.x + box.width)),
      bottom = Math.max(...boxes.map((box) => box.y + box.height));
    const scale = Math.min(
      width / Math.max(1, right - left),
      height / Math.max(1, bottom - top),
    );
    const ids = new Set(roots.map((layer) => layer.id));
    // A plain copy of the lanes, the selection's clips without effects.
    const plain = JSON.parse(JSON.stringify(source.composition.tracks)) as {
      clips: { layerId: string; metadata: Record<string, unknown> }[];
    }[];
    for (const track of plain)
      for (const clip of track.clips)
        if (ids.has(clip.layerId)) delete clip.metadata.fx;
    const tracks = plain as unknown as typeof source.composition.tracks;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    drawComposition(
      context,
      {
        ...source,
        composition: {
          ...source.composition,
          layers: source.composition.layers.filter((layer) =>
            ids.has(layer.id),
          ),
          // The effects are what the tiles show, so the source has none.
          tracks,
        },
        background: '#000000',
        frames,
        playing: false,
        animate: true,
      },
      {
        width,
        height,
        pixelRatio: 1,
        matrix: [
          scale,
          0,
          0,
          scale,
          (width - (right - left) * scale) / 2 - left * scale,
          (height - (bottom - top) * scale) / 2 - top * scale,
        ],
      },
      null,
      { overlays: false },
    );
    return canvas;
  };
  /** Download selection: the selected elements alone, as a PNG. */
  const downloadSelection = () => {
    const frameCanvas = selectionCanvas();
    if (!frameCanvas) return;
    const roots = selectionRoots(session.source, session.selectedIds);
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
  /** The selected elements alone on a transparent canvas (R5: posters). */
  const selectionCanvas = (): HTMLCanvasElement | null => {
    const source = session.source;
    const roots = selectionRoots(source, session.selectedIds);
    const boxes = roots
      .map((layer) => worldBox(source, layer.id))
      .filter((box): box is NonNullable<typeof box> => !!box);
    if (!boxes.length) return null;
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
    if (!context) return null;
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
    return frameCanvas;
  };
  const menuHooks = {
    // R5: Save to My Templates (the canvas and timeline menus).
    saveToMine: (kind: MineKind) => void saveToMine(kind).catch(reportError),
    // P1: the code layer's entries run the same hooks as the commands.
    code: {
      edit: (layerId: string) => commandContext.code?.edit(layerId),
      settings: (layerId: string) => commandContext.code?.settings(layerId),
      rerender: (layerId: string) => commandContext.code?.rerender(layerId),
      editDuration: () => commandContext.editDuration?.(),
      exportCode: (layerId: string) => commandContext.code?.exportCode(layerId),
      duplicateCopy: (layerId: string) =>
        commandContext.code?.duplicateCopy(layerId),
    },
    showTiming: () => {
      const layer = selectedLayer();
      if (!layer) return;
      const clip = findClipByLayer(session.source.composition, layer.id);
      const start = clip?.clip.startTime ?? layer.startTime;
      session.setCurrentTime(start);
      timeline?.reveal(start);
      element('#timeline-foundation .timeline-scroll').focus();
      // J6: a popover with the start and duration; the clip is highlighted.
      openElementTiming(
        element('#context-toolbar').hidden
          ? element('#composition-canvas')
          : element('#context-toolbar'),
        engine,
        session,
        reportError,
        (id) => timeline?.highlight(id),
      );
    },
    altText: openAltText,
    // J6: a confirmation names the new size; one undo step restores it all.
    resizeToSelection: () => {
      const size = selectionSize(session);
      if (!size) return;
      void confirmDialog(
        t('resize.confirm', {
          width: formatNumber(size.width),
          height: formatNumber(size.height),
        }),
        {
          titleText: t('resize.confirmTitle'),
          confirmLabel: t('resize.apply'),
          cancelLabel: t('action.cancel'),
        },
      ).then((confirmed) => {
        if (!confirmed) return;
        safely(() => {
          if (resizeCanvasToSelection(engine, session)) canvasView.fit();
        });
      });
    },
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
    saveSceneToMine: () => {
      const sceneId = session.source.composition.id;
      void saveSceneToMine(sceneId);
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
  /** Opens the canvas menu at `point` (window coordinates). */
  const openCanvasMenu = (point: Point2, layerId: string | null) => {
    const entries = canvasMenuEntries(engine, session, !!layerId, menuHooks);
    canvasMenuController.open(() =>
      canvasMenuEntries(engine, session, !!layerId, menuHooks),
    );
    if (!entries.length) canvasMenuController.close();
    // S1 Part 4: fixed to the window at the pointer, flipped and clamped so
    // the whole menu shows (never clipped by panels or the timeline).
    canvasMenuController.fit(point[0], point[1]);
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
    // FIX1 F1: never over the floating contextual toolbar.
    const stageRect = stage.getBoundingClientRect();
    const avoid = [
      ...stage.querySelectorAll<HTMLElement>(
        '#context-toolbar:not([hidden]), .stage-toolbar-row > :not([hidden])',
      ),
    ]
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        left: rect.left - stageRect.left,
        top: rect.top - stageRect.top,
        right: rect.right - stageRect.left,
        bottom: rect.bottom - stageRect.top,
      }));
    selectionActions.update(
      {
        left: Math.min(...xs),
        top: Math.min(...ys),
        right: Math.max(...xs),
        bottom: Math.max(...ys),
      },
      { width: stage.clientWidth, height: stage.clientHeight, avoid },
    );
  }
  // J4: on-canvas text editing (double-click, Enter or the Text tool).
  const textEditor = mountTextEditor(
    stage,
    canvas,
    engine,
    session,
    viewport,
    reportError,
  );
  textEditing = textEditor;
  // The toolbar mirrors the editor's selection (J4).
  let toolbarFrame = 0;
  textEditor.onChange(() => {
    if (toolbarFrame) return;
    toolbarFrame = requestAnimationFrame(() => {
      toolbarFrame = 0;
      safely(() => contextToolbar.render());
    });
  });
  // FINAL2 U6: a table edits the cell under the pointer instead.
  const tableEditor = mountTableEditor(
    stage,
    canvas,
    engine,
    session,
    viewport,
    reportError,
  );
  const editText = (
    id: string | null,
    options?: Parameters<typeof textEditor.start>[1],
  ) => {
    if (id && tableEditor.start(id, options?.at)) return;
    if (id) safely(() => textEditor.start(id, options));
  };
  const pointer = bindCanvasInteraction(
    canvas,
    session,
    interaction,
    viewport,
    reportError,
    (action) => performEdit(engine, session, action),
    true,
    // The canvas reports canvas-relative points; the menu wants the window's.
    (point, layerId) => {
      const box = canvas.getBoundingClientRect();
      openCanvasMenu([box.left + point[0], box.top + point[1]], layerId);
    },
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
    (id, options) => editText(id, options ?? { selectAll: true }),
    effectsTool,
  );
  const commandContext: CommandContext = {
    engine,
    session,
    view: canvasView,
    ...(actions.save ? { save: actions.save } : {}),
    togglePlayback: () =>
      element<HTMLButtonElement>('[data-action="play"]').click(),
    // J14: the clip menu's Edit duration, Rename and More options.
    editDuration: () =>
      safely(() => {
        const id = session.selectedId;
        const clip = id
          ? root.querySelector<HTMLElement>(
              `#timeline-foundation .timeline-clip[data-action="clip"][data-id="${CSS.escape(id)}"]`,
            )
          : null;
        openElementTiming(
          clip ?? element('#timeline-foundation'),
          engine,
          session,
          reportError,
          (layerId) => timeline?.highlight(layerId),
          'duration',
        );
      }),
    renameClip: () => {
      if (session.selectedId) timeline?.renameClip(session.selectedId);
    },
    moreOptions: () => workspace?.setOpen('right', true),
    // P1: a code layer's own actions.
    code: {
      edit: (layerId) => safely(() => openCodeImport({ layerId })),
      settings: () =>
        safely(() => {
          workspace?.setOpen('right', true);
          setRightSection('Code');
        }),
      rerender: (layerId) => void rerenderCode(layerId),
      exportCode: (layerId) => safely(() => exportCodeLayer(layerId)),
      duplicateCopy: (layerId) => duplicateCodeCopy(layerId),
    },
    // FINAL2 U9: Transcribe, Auto captions and nested clips.
    captions: {
      transcribe: (layerId) =>
        openTranscribe(captionsContext, layerId ?? undefined),
      autoCaptions: (layerId) =>
        openAutoCaptions(captionsContext, layerId ?? undefined),
    },
    nesting: { enter: (layerId) => nestBar?.enter(layerId) },
    planReview: () => {
      if (planState(engine.state.id)) openPlanReview();
      else showToast(t('plan.reviewEmpty'), 'info');
    },
  };
  let renderedProject: unknown;
  let renderedSelection = '';
  const refresh = (force = false) => {
    // J3: a live preview never rebuilds the panels (the field is being dragged).
    if (previewing) return;
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
    if (
      layerEffects.eyedropper &&
      session.selectedId !== layerEffects.eyedropper
    )
      cancelEyedropper(session);
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
      fps: formatNumber(Math.round(source.composition.fps * 100) / 100),
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
    // V3 (spec 4): the Scene panel is the outliner.
    let count = 0;
    const countLayers = (layers: readonly SceneLayer[]) => {
      for (const layer of layers) {
        count++;
        countLayers(layer.children);
      }
    };
    countLayers(source.composition.layers);
    sceneOutliner.render();
    element('#layer-count').textContent = formatNumber(count);
    mediaPanel.render();
    element('#canvas-empty').hidden = count !== 0;
    // U4: every ratio or size change fits the new canvas in the view.
    const size = `${source.composition.width}x${source.composition.height}`;
    if (lastCanvasSize && size !== lastCanvasSize) canvasView.fit();
    lastCanvasSize = size;
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
    codeStatus,
  );
  // FINAL2 U9: a nested clip's breadcrumb bar above the timeline.
  nestBar = mountNestBar(
    element('#timeline-foundation').parentElement!,
    element('#timeline-foundation'),
    engine,
    session,
    reportError,
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
  // FINAL3 C3 (Blender's focus picker): with "Pick on canvas" on, the next
  // layer selected becomes the camera's Focus Object (depth of field on),
  // and the shot is selected again.
  session.onChange(() => {
    if (!cameraUi.pickFocus || session.selectedIds.length !== 1) return;
    const composition = session.source.composition;
    if (selectedShot(composition, session.selectedIds)) return;
    const shots = cameraShotsOf(composition as never);
    const entry =
      shots.find((item) => item.layer.id === cameraUi.pickShot) ??
      shots.find((item) => item.spec.id === cameraUi.cameraId) ??
      shots[0];
    cameraUi.pickFocus = false;
    if (!entry) return;
    const picked = session.selectedIds[0]!;
    const root = composition.layers.find((layer) => layer.id === picked);
    if (!root) return;
    safely(() => {
      engine.commands.transaction(
        'Focus object',
        updateCameraCommands(composition as never, {
          ...entry.spec,
          dof: { ...entry.spec.dof, enabled: true, focusLayer: picked },
        }),
      );
      session.select(entry.layer.id);
    });
  });
  const unsubscribe = session.onChange(refresh);
  // J3: a NumberField being scrubbed or slid previews its edit on the canvas:
  // the commit runs in capture mode and the canvas draws the result. Nothing
  // reaches the project or history until release.
  setFieldPreview({
    preview: (commit) => {
      previewing = true;
      try {
        const commands = engine.commands.capture(commit);
        session.setPreview(commands.length ? engine.preview(commands) : null);
      } catch {
        // A refused edit shows nothing; its commit reports the reason.
      } finally {
        previewing = false;
      }
    },
    end: () => session.setPreview(null),
  });
  const unsubscribePreview = session.onPreview(() => safely(draw));
  // J5: bundled fonts the project uses load, then the canvas redraws.
  const disposeFonts = mountFonts(engine, () => safely(draw));
  const fontsPrefetched = new Set<string>();
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
  /**
   * X1: a frame provider whose code animations answer with their Full
   * quality baked frame at `time` (baked and loaded first), as the export.
   */
  const fullCodeFrames = async (
    composition: typeof session.source.composition,
    time: number,
  ): Promise<FrameProvider> => {
    await bakeForExport(
      codeBaker,
      composition,
      () => undefined,
      () => false,
    );
    const loaded = new Map<string, CanvasImageSource>();
    for (const item of deriveRenderItems({
      ...session.source,
      composition: compositionAt(composition, time),
      currentTime: time,
      animate: true,
    }).items) {
      const request = item.media;
      const code = request?.code ? codeOf(request.key) : null;
      if (!request?.code || !code) continue;
      const spec = bakeSpecOf(code, request.code, 'full');
      const image = await codeCache.load(spec.cacheKey, request.code.frame);
      if (image) loaded.set(request.key, image);
    }
    return {
      frame: (request, playing) =>
        request.kind === 'code'
          ? (loaded.get(request.key) ?? null)
          : frames.frame(request, playing),
    };
  };
  const renderFrame = async () => {
    const { width, height } = session.source.composition;
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const context = frameCanvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    const provider = await fullCodeFrames(
      session.source.composition,
      session.currentTime,
    );
    drawComposition(
      context,
      { ...session.source, frames: provider, playing: false, animate: true },
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
  // X2 (spec section 2): Import code animation, and Edit code for a code
  // layer. Tier A becomes ordinary layers (one step, new scenes or this
  // one); Tiers B and C become a code layer at the playhead on a new lane.
  const codeThumbnailOf = async (
    composition: DeepReadonly<Composition>,
    time: number,
  ) => {
    const width = 320;
    const height = Math.max(
      1,
      Math.round((width * composition.height) / composition.width),
    );
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d')!;
    drawComposition(
      context,
      {
        composition: compositionAt(composition, time),
        assets: session.source.assets,
        background: composition.backgroundColor,
        currentTime: time,
        animate: true,
        ...(session.source.measureText
          ? { measureText: session.source.measureText }
          : {}),
      },
      fitViewport(width, height, composition, 1, { padding: 0 }),
      null,
      { overlays: false },
    );
    return canvas.convertToBlob({ type: 'image/png' });
  };
  // R2: the Edit code view of a code layer. Importing code goes through the
  // AI importer (openAiImport) only.
  const openCodeImport = (edit: { layerId: string }) => {
    session.setPlaying(false);
    const editCode = codeOf(edit.layerId);
    if (!editCode) return;
    const composition = session.source.composition;
    openCodeImportDialog({
      ...(editCode
        ? {
            edit: {
              source: editCode.source,
              params: codeParams(editCode) as ParamValues,
            },
          }
        : {}),
      canvas: {
        width: composition.width,
        height: composition.height,
        fps: composition.fps,
      },
      runtime: freeCodeRuntime,
      previewA: async (spec, overrides) => {
        const built = await tierACommands(spec, {
          project: engine.state,
          current: session.source.composition,
          mode: 'new',
          overrides,
        });
        const project = engine.preview(built.commands);
        const scene = project.compositions.find(
          (item) => item.id === built.compositionIds[0],
        );
        return scene ? codeThumbnailOf(scene, scene.duration / 2) : null;
      },
      onConfirm: async ({ item }) => {
        const current = session.source.composition;
        if (item.tier === 'A') return;
        const input = {
          tier: item.tier,
          source: item.source,
          meta: item.meta as unknown as Record<string, unknown>,
          params: item.params,
          name: item.name,
        };
        {
          const code = codeRecord({
            ...input,
            ...(editCode.templateId ? { templateId: editCode.templateId } : {}),
          });
          const commands: Command[] = [
            {
              type: 'SET_LAYER_CODE',
              compositionId: current.id,
              layerId: edit.layerId,
              code,
            },
          ];
          // A shorter animation trims its clip to the new end.
          const found = findClipByLayer(current, edit.layerId);
          const duration = codeMeta(code).duration;
          if (found && found.clip.sourceOut > duration + 1e-9) {
            const timing = retimeClip(
              found.clip,
              found.clip.startTime,
              Math.max(
                1 / current.fps,
                (duration - found.clip.sourceIn) / found.clip.speed,
              ),
              'right',
            );
            commands.push({
              type: 'SET_CLIP_TIMING',
              compositionId: current.id,
              clipId: found.clip.id,
              ...timing,
            } as Command);
          }
          engine.commands.transaction('Edit code', commands);
          showToast(t('code.applied'), 'success');
        }
      },
    });
  };
  // P2: Import creator pack: the review dialog, then My library.
  let builtInIds: readonly string[] = [];
  void loadLibrary().then(
    (manifest) => (builtInIds = manifest.items.map((item) => item.id)),
    () => undefined,
  );
  const placeImported = async (add: AiImportAdd) => {
    // R2: a single code animation can also go straight into the scene; a
    // Tier A one as new scenes (one step) or into this scene.
    const first = add.items[0];
    if (add.addToScene && first) {
      if (first.item.type === 'composition' && add.sceneMode !== 'current') {
        const built = await tierACommands(
          (first.item.data as { spec: unknown }).spec,
          {
            project: engine.state,
            current: session.source.composition,
            mode: 'new',
            overrides: (first.params ?? {}) as ParamValues,
          },
        );
        engine.commands.transaction('Import code animation', built.commands);
        if (built.compositionIds[0])
          session.selectComposition(built.compositionIds[0]);
      } else insertCreatorItem(creatorLibraryId(`${add.packId}/${first.id}`));
    }
  };
  const addCreatorItems = async (add: AiImportAdd): Promise<number | false> => {
    await creatorLibrary.ready;
    const existing = creatorLibrary.packVersion(add.packId);
    if (existing === add.packVersion) {
      // Re-importing the same version changes nothing (idempotent).
      showToast(
        t('creator.sameVersion', {
          name: add.packName.en,
          version: String(add.packVersion),
        }),
        'info',
      );
      await placeImported(add);
      return 0;
    }
    if (existing !== null) {
      const newer = add.packVersion > existing;
      const yes = await confirmDialog(
        escapeHtml(
          t(newer ? 'creator.replaceNewer' : 'creator.replaceOlder', {
            name: add.packName.en,
            from: String(existing),
            to: String(add.packVersion),
          }),
        ),
        {
          titleText: escapeHtml(t('creator.replaceTitle')),
          confirmLabel: t('creator.replace'),
          cancelLabel: t('code.cancel'),
          danger: !newer,
        },
      );
      if (!yes) return false;
    }
    const now = new Date().toISOString();
    await creatorLibrary.add(
      add.items.map((checked) => ({
        key: `${add.packId}/${checked.id}`,
        packId: add.packId,
        packName: add.packName,
        packVersion: add.packVersion,
        item: checked.item,
        name: checked.item.name.en,
        addedAt: now,
        ...(checked.thumbnail ? { thumbnail: checked.thumbnail } : {}),
        ...(checked.motionMeta ? { motionMeta: checked.motionMeta } : {}),
        ...(checked.params ? { params: checked.params } : {}),
      })),
      existing !== null ? add.packId : undefined,
    );
    await placeImported(add);
    showToast(
      t('creator.added', {
        count: String(add.items.length),
        name: add.packName.en,
      }),
      'success',
    );
    return add.items.length;
  };
  /** FINAL2 U10 / FINAL3 V2.6: adds built scenes in one 'Build video' step
   *  (replacing a single empty scene); returns the new scenes' ids. */
  const addBuiltScenes = (
    project: Project,
    toast = t('composition.added', { count: project.compositions.length }),
  ): string[] => {
    const missing = project.assets.filter(
      (asset) => !engine.state.assets.some((have) => have.id === asset.id),
    );
    if (missing.length)
      engine.library(
        'Import media',
        missing.map((asset) => ({ type: 'ADD_ASSET' as const, asset })),
      );
    const taken = new Set<string>();
    const collect = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object')
        for (const [key, inner] of Object.entries(value)) {
          if (key === 'id' && typeof inner === 'string') taken.add(inner);
          collect(inner);
        }
    };
    collect(engine.state.compositions);
    const fresh = project.compositions.map((composition) => {
      // Ids already in the open project get a suffix (a second build).
      let text = JSON.stringify(composition);
      const ids = new Set<string>();
      const own = (value: unknown) => {
        if (Array.isArray(value)) value.forEach(own);
        else if (value && typeof value === 'object')
          for (const [key, inner] of Object.entries(value)) {
            if (key === 'id' && typeof inner === 'string') ids.add(inner);
            own(inner);
          }
      };
      own(composition);
      const suffix = `-${Date.now().toString(36)}`;
      for (const id of ids)
        if (taken.has(id))
          text = text
            .split(JSON.stringify(id))
            .join(JSON.stringify(id + suffix));
      return JSON.parse(text) as typeof composition;
    });
    // FIX1 F7: a project that is only one empty default scene gets the
    // built scenes instead of keeping a blank first scene.
    const scenes = engine.state.compositions;
    const blank =
      scenes.length === 1 &&
      !scenes[0]!.layers.length &&
      scenes[0]!.tracks.every((track) => !track.clips.length)
        ? scenes[0]!.id
        : null;
    engine.commands.transaction('Build video', [
      ...fresh.map((composition) => ({
        type: 'CREATE_COMPOSITION' as const,
        composition,
      })),
      ...(blank && fresh.length
        ? [{ type: 'DELETE_COMPOSITION' as const, compositionId: blank }]
        : []),
    ]);
    if (fresh[0]) session.selectComposition(fresh[0].id);
    // The new scenes show at once in the strip, and the note stays long
    // enough to read, with a way to the scenes board.
    if (!stripShown) stripButton.click();
    showToast(toast, 'success', 10000, {
      label: t('composition.showScenes'),
      run: () => element<HTMLButtonElement>('#scene-board-toggle').click(),
    });

    return fresh.map((composition) => composition.id);
  };
  /** FINAL3 V2: a quiet import (no Restored note) that returns the asset. */
  const importQuiet = async (file: File, license?: LicenseMeta) => {
    const [id] = await mediaPanel.importFiles([file], {
      ...(license ? { license } : {}),
      quiet: true,
    });
    return (
      (session.source.assets.find((asset) => asset.id === id) as unknown as
        Asset | undefined) ?? null
    );
  };
  const planBuildServices = () =>
    planServices({
      assets: () => session.source.assets as unknown as readonly Asset[],
      importFile: importQuiet,
      sfx: catalogSfx,
    });
  const catalogSfx = (wanted: readonly string[]) => {
    const entry = catalog
      .entries('audio')
      .find(
        (item) =>
          item.kind === 'sound' &&
          wanted.some((word) => item.id.includes(word)),
      );
    if (!entry) return null;
    const id = ensureCatalogAsset(entry);
    const asset = (session.source.assets as unknown as readonly Asset[]).find(
      (item) => item.id === id,
    );
    return asset ? { asset, duration: entry.media?.duration ?? 0 } : null;
  };
  const planThemeById = async (id: string) =>
    BUILT_IN_THEMES.find((theme) => theme.id === id) ??
    (await (await themeLibrary)?.listThemes())?.find(
      (theme) => theme.id === id,
    ) ??
    null;
  /** FINAL3 V2: Build video for a Video Plan v2 (no slot dialog). */
  let aiPanel: { render(): void } | null = null;
  const openPlanBuildFor = (
    input: VideoPlan,
    keep?: () => Promise<unknown>,
  ) => {
    session.setPlaying(false);
    // FINAL3 V4.2 and V4.3: the plan's theme, else the project's current
    // theme, gives the feel values the plan leaves out.
    const themeId = input.meta.themeId ?? currentThemeId();
    const plan = withFeelDefaults(
      input,
      themeById(themeId),
      themeId ? (feelExtras.get(themeId) ?? null) : null,
    );
    openPlanBuild(plan, {
      assets: () => session.source.assets as unknown as readonly Asset[],
      importFile: importQuiet,
      sfx: catalogSfx,
      theme: planThemeById,
      // FIX7: the AI card is saved once the build is complete, never before.
      ...(keep ? { onCommit: async () => void (await keep()) } : {}),
      discardAssets: (ids) => mediaPanel.discard(ids),
      prepare: (project, signal, progress) =>
        prepareBuilt(project as never, signal, progress),
      addScenes: (result) => {
        // FINAL3 V3.5: the plan's feel is listed in AI as a Theme.
        if (plan.feel?.palette || plan.feel?.headingFont) {
          const { theme } = feelTheme(plan);
          const hash = [...plan.meta.title].reduce(
            (h, c) => (h * 31 + c.charCodeAt(0)) >>> 0,
            7,
          );
          const id = `feel-${hash.toString(36)}`;
          const name = t('plan.feelName', { name: plan.meta.title }).slice(
            0,
            60,
          );
          void creatorLibrary
            .add([
              {
                key: `plan-feel/${id}`,
                packId: 'plan-feel',
                packName: { en: plan.meta.title.slice(0, 60) },
                packVersion: 1,
                item: {
                  id,
                  name: { en: name },
                  tags: ['feel'],
                  type: 'theme',
                  data: theme,
                } as unknown as CreatorEntry['item'],
                name,
                addedAt: new Date().toISOString(),
              },
            ])
            .catch(reportError);
        }
        const ids = addBuiltScenes(
          result.project!,
          t('plan.built', {
            count: String(result.project!.compositions.length),
          }),
        );
        void training.start(engine.state.id, result.plan ?? plan);
        session.select(null);
        savePlanState(engine.state.id, {
          plan: result.plan!,
          alternatives: Object.fromEntries(
            Object.entries(result.alternatives).map(([k, v]) => [k, [...v]]),
          ),
          flags: [...result.flags],
          silent: result.silent,
          sceneIds: ids,
          pages: {},
        });
        aiPanel?.render();
      },
      review: () => openPlanReview(plan.meta.title),
      report: reportError,
    });
  };
  /** FINAL3 V3: Review & swap, a left side panel. */
  const openPlanReview = (title?: string) =>
    sidePanels.show('plan-review', t('plan.reviewTitle'), () =>
      planReviewPanel({
        ...(title !== undefined ? { title } : {}),
        project: () => engine.state,
        run: (label, commands) =>
          safely(() => {
            engine.commands.transaction(label, commands);
          }),
        saveFeel: async (name, plan) => {
          const library = await themeLibrary;
          if (!library) throw new Error(t('theme.storageUnavailable'));
          const { theme, extras } = feelTheme(plan);
          const saved = await library
            .saveFeelTheme(name, theme, extras)
            .catch((error: unknown) => {
              throw themeError(error);
            });
          await refreshThemes();
          showToast(t('theme.savedToast', { name: saved.name }), 'success');
        },
        addAssets: (assets) => {
          if (assets.length)
            engine.library(
              'Import media',
              assets.map((asset) => ({ type: 'ADD_ASSET' as const, asset })),
            );
        },
        services: async () => {
          const plan = planState(engine.state.id, title)?.plan;
          const voice = await planVoiceEngine(
            plan?.meta.language ?? 'en',
          ).catch(() => null);
          return {
            ...planBuildServices(),
            ...(plan?.meta.themeId
              ? { theme: await planThemeById(plan.meta.themeId) }
              : {}),
            ...(voice
              ? {
                  voice: async (text: string, lang: string) => {
                    const made = await synthesizeToMedia(text, {
                      provider: voice.provider,
                      voiceId: voice.voiceId,
                      lang,
                    });
                    const asset = await importQuiet(
                      new File([made.blob], 'Narration.wav', {
                        type: made.mime,
                      }),
                    );
                    return asset ? { asset, duration: made.durationSec } : null;
                  },
                }
              : { voiceUnavailable: t('plan.noVoice') }),
          };
        },
        importCandidate: (candidate) =>
          planBuildServices().importCandidate(candidate),
        searchMore: async (intent, page) => [
          ...(await planBuildServices().resolve.stock(
            intent.query,
            intent.type,
            intent.orientation,
            page,
          )),
        ],
        pickFile: (accept) =>
          new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.onchange = async () => {
              const file = input.files?.[0];
              resolve(file ? await importQuiet(file) : null);
            };
            input.click();
          }),
        openScene: (id) => session.selectComposition(id),
        download: (name, text) => downloadText(text, name, 'application/json'),
        report: reportError,
        rerender: () => sidePanels.refresh(),
      }),
    );
  /** FINAL2 U10: Build video from an AI composition (slots, then scenes). */
  const openBuildVideo = (
    item: { name: { en: string }; data: unknown },
    keep?: () => Promise<unknown>,
  ) => {
    // A composition pack (not a plan) keeps its card when Build is pressed.
    void keep?.();
    return openCompositionBuild(item, {
      assets: () => session.source.assets as unknown as readonly Asset[],
      importFile: async (file) => {
        const id = await importMade(file);
        return (
          (session.source.assets.find((asset) => asset.id === id) as unknown as
            Asset | undefined) ?? null
        );
      },
      library: (id) => libraryActions.find(id),
      addScenes: (project) => {
        const ids = addBuiltScenes(project);
        void training.start(engine.state.id, item.data);
        // FIX3 1.3: the AI card reads Built (or Needs assets) from now on.
        rememberBuilt(
          storageOrNull(),
          engine.state.id,
          compositionKey(item.data),
          ids,
        );
        aiPanel?.render();
        return ids;
      },
      openProject: async (project) => {
        if (
          await confirmDialog(t('composition.openConfirm'), {
            titleText: t('composition.openProject'),
            confirmLabel: t('composition.openProject'),
          })
        )
          engine.load(project);
      },
      openKeys: () => openSettings('keys'),
      report: reportError,
    });
  };
  const openCreatorImport = (
    initial: { text?: string; fileName?: string } = {},
  ) => {
    session.setPlaying(false);
    const composition = session.source.composition;
    openAiImportDialog({
      ...initial,
      canvas: {
        width: composition.width,
        height: composition.height,
        fps: composition.fps,
      },
      previewA: async (spec, overrides) => {
        const built = await tierACommands(spec, {
          project: engine.state,
          current: session.source.composition,
          mode: 'new',
          overrides,
        });
        const project = engine.preview(built.commands);
        const scene = project.compositions.find(
          (item) => item.id === built.compositionIds[0],
        );
        const blob = scene
          ? await codeThumbnailOf(scene, scene.duration / 2)
          : null;
        return blob ? dataUrlOf(blob) : null;
      },
      fxCatalog: FX_CATALOG,
      knownLibraryIds: () => [
        ...builtInIds,
        ...creatorLibrary.list().map((entry) => entry.key),
      ],
      ...(renderer.measureText ? { measureText: renderer.measureText } : {}),
      runtime: freeCodeRuntime,
      onAdd: addCreatorItems,
      openAi: () => openCategory('AI'),
      // FINAL2 U10: a composition builds into scenes (slot dialog).
      buildComposition: (item, keep) =>
        isPlanV2(item.data)
          ? openPlanBuildFor(item.data as unknown as VideoPlan, keep)
          : openBuildVideo(item, keep),
      copy: (text) => {
        void navigator.clipboard
          .writeText(text)
          .then(() => showToast(t('creator.reportCopied'), 'success'))
          .catch(() => showToast(t('creator.reportCopyFailed'), 'error'));
      },
    });
  };
  /** T2: Copy AI brief, built from the live registries (src/ai-brief). */
  const briefText = async (request: string, form?: BriefFormValues) => {
    const made = await briefTextOf(request, form);
    training.noteBrief(made.text);
    return made;
  };
  const briefTextOf = async (request: string, form?: BriefFormValues) => {
    await creatorLibrary.ready;
    const manifest = await loadLibrary().catch(() => null);
    const { aiBrief } = await import('../ai-brief');
    const { ITEM_KINDS } = await import('../creator-pack/schemas');
    const composition = session.source.composition;
    const entries: Record<string, { id: string; label: string }[]> = {};
    const push = (kind: string, id: string, label: string) =>
      (entries[kind] ??= []).push({ id, label });
    for (const item of manifest?.items ?? [])
      push(item.type, item.id, item.name.en);
    for (const entry of creatorLibrary.list())
      push(
        entry.item.type,
        `${entry.packId}/${entry.key.split('/')[1]}`,
        `${entry.name} (My library)`,
      );
    for (const template of codeTemplates.list())
      if (!creatorEntryOf(template.id))
        push('motion', template.id, `${template.name} (My Templates)`);
    const lists = themeLists();
    for (const theme of [...lists.builtIn, ...lists.saved, ...lists.library])
      push('theme', theme.id, theme.name);
    for (const [kind, list] of [
      ['adjust', adjustments],
      ['filter', filters],
      ['effect', effects],
      ['transition', transitions],
    ] as const)
      for (const item of list) push(kind, item.id, item.name);
    const theme = currentTheme();
    return aiBrief({
      project: {
        width: composition.width,
        height: composition.height,
        fps: composition.fps,
        duration: composition.duration,
        theme: theme
          ? {
              name: theme.name,
              palette: theme.palette,
              fonts: theme.fonts,
              motion: theme.motion,
            }
          : null,
      },
      kinds: ITEM_KINDS,
      entries,
      // FINAL2 U10: the installed stock providers and whether a key is
      // saved (never the key itself).
      stock: stockProviders().map((provider) => ({
        id: provider.id,
        name: provider.name,
        hasKey: hasKeys(provider),
      })),
      blocks: blocks.map((block) => ({ id: block.id, label: block.name })),
      animate: {
        in: IN_OUT_PRESETS,
        out: IN_OUT_PRESETS,
        loop: LOOP_PRESETS,
      },
      fonts: SYSTEM_FONTS.map(([name]) => name),
      request,
      // B1: the New AI video form and its style.
      form: form ?? null,
      style: form ? briefStyle(form.styleId) : null,
    });
  };
  const copyAiBrief = () => {
    const handle = openModal({
      titleText: t('brief.title'),
      bodyHtml: `
        <label class="brief-label" for="brief-request">${t('brief.request')}</label>
        <textarea id="brief-request" rows="3" maxlength="2000" placeholder="${t('brief.requestPlaceholder')}"></textarea>
        <div class="brief-fallback" id="brief-fallback" hidden>
          <p>${t('brief.fallback')}</p>
          <textarea id="brief-text" rows="10" readonly></textarea>
          <button type="button" class="button" id="brief-copy-text">${t('brief.copyText')}</button>
        </div>
        <div class="modal-actions">
          <button type="button" class="button" id="brief-cancel">${t('code.cancel')}</button>
          <button type="button" class="button primary" id="brief-copy">${t('brief.copy')}</button>
        </div>`,
    });
    handle.root.classList.add('brief-dialog');
    const $ = <T extends HTMLElement>(id: string) =>
      handle.root.querySelector<T>(`#${id}`)!;
    $('brief-cancel').onclick = () => handle.close();
    $<HTMLButtonElement>('brief-copy').onclick = () =>
      safely(async () => {
        const { text, count } = await briefText(
          $<HTMLTextAreaElement>('brief-request').value,
        );
        try {
          await navigator.clipboard.writeText(text);
          handle.close();
          showToast(t('brief.copied', { count: String(count) }), 'success');
        } catch {
          // The clipboard is blocked: show the text to copy by hand.
          const box = $<HTMLTextAreaElement>('brief-text');
          box.value = text;
          $('brief-fallback').hidden = false;
          box.focus();
          box.select();
        }
      });
    $<HTMLButtonElement>('brief-copy-text').onclick = () => {
      const box = $<HTMLTextAreaElement>('brief-text');
      box.focus();
      box.select();
      void navigator.clipboard
        .writeText(box.value)
        .then(() => showToast(t('brief.copiedPlain'), 'success'))
        .catch(() => showToast(t('brief.selectHint'), 'info'));
    };
    $<HTMLTextAreaElement>('brief-request').focus();
  };
  /** X2: the Animation settings panel of the selected code layer. */
  const codeBody = (): HTMLElement[] => {
    const layer = codeLayerSelected(session);
    const code = layer ? codeOf(layer.id) : null;
    // P3: any other layer's Controls (presets and keyframes it has).
    if (!layer || !code) return controlsBody(controlsDeps);
    const meta = codeMeta(code);
    const info = document.createElement('div');
    info.className = 'code-info';
    const tier = document.createElement('span');
    tier.className = 'code-tier';
    tier.dataset.tier = code.tier;
    tier.textContent = t(`code.tier${code.tier}`);
    const duration = document.createElement('span');
    duration.className = 'code-muted';
    duration.textContent = t('code.duration', {
      seconds: formatNumber(meta.duration),
    });
    info.append(tier, duration);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'button';
    edit.id = 'code-edit';
    edit.innerHTML = `${iconSvg('code', 16)}<span></span>`;
    edit.querySelector('span')!.textContent = t('code.editButton');
    edit.title = t('code.editTitle');
    edit.onclick = () => safely(() => openCodeImport({ layerId: layer.id }));
    const parts: HTMLElement[] = [info, edit];
    if (code.tier === 'C') {
      const notice = document.createElement('p');
      notice.className = 'code-notice';
      notice.textContent = t('code.fullMode');
      parts.push(notice);
    }
    // X3: Full (scene size) or Draft (half) while editing; export is Full.
    const quality = document.createElement('div');
    quality.className = 'segmented code-quality';
    quality.setAttribute('role', 'radiogroup');
    quality.setAttribute('aria-label', t('code.quality'));
    for (const value of ['full', 'draft'] as const) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'radio');
      item.dataset.quality = value;
      item.setAttribute(
        'aria-checked',
        String(codeFrames.qualityOf(layer.id) === value),
      );
      item.textContent = t(value === 'full' ? 'code.full' : 'code.draft');
      item.title = t(value === 'full' ? 'code.fullTip' : 'code.draftTip');
      item.onclick = () =>
        safely(() => {
          codeFrames.quality.set(layer.id, value);
          rightPanel.render('Code');
          draw();
          timeline?.render();
        });
      quality.append(item);
    }
    const qualityLabel = document.createElement('span');
    qualityLabel.className = 'code-param-label';
    qualityLabel.textContent = t('code.quality');
    const qualityRow = document.createElement('div');
    qualityRow.className = 'code-param';
    qualityRow.append(qualityLabel, quality);
    parts.push(qualityRow);
    // X3: one control per declared param. Tier B re-renders as it changes
    // (debounced); Tier C waits for Apply (a heavy re-bake). One undo step
    // per applied change.
    if (!meta.params.length) {
      const none = document.createElement('p');
      none.className = 'code-notice';
      none.textContent = t('code.noParams');
      parts.push(none);
      return parts;
    }
    const stored = codeParams(code) as ParamValues;
    const staged =
      pendingCode?.layerId === layer.id ? pendingCode.values : null;
    const values = { ...stored, ...(staged ?? {}) };
    const changed = !!staged && stableJson(values) !== stableJson(stored);
    parts.push(
      createParamsForm({
        idPrefix: 'code-setting',
        specs: meta.params,
        values,
        // P1: while a number is dragged the frame at the playhead renders
        // at Draft with the dragged value (Blocks and seekable code); on
        // release the change is applied and re-baked after a short pause
        // (a stateful Tier C animation keeps Apply).
        onPreview: (name, value) =>
          safely(() => {
            if (!CodeLive.canRender(code.tier, meta.seekable)) return;
            const request = codeFrames.requestOf(layer.id);
            if (!request?.code) return;
            const spec = bakeSpecOf(
              { ...code, params: { ...values, [name]: value } },
              request.code,
              'draft',
            );
            codeLive.request(layer.id, spec, request.code.frame);
          }),
        onChange: (name, value) =>
          safely(() => {
            pendingCode = {
              layerId: layer.id,
              values: { ...values, [name]: value },
            };
            codeLive.release(layer.id);
            // A stateful Tier C animation is a heavy re-bake: it waits
            // for Apply.
            if (CodeLive.canRender(code.tier, meta.seekable)) {
              clearTimeout(codeApplyTimer);
              codeApplyTimer = setTimeout(
                () => safely(() => applyCodeParams(layer.id)),
                CODE_APPLY_DELAY,
              );
            }
            rightPanel.render('Code');
          }),
        onInvalid: (text) => showToast(text, 'error'),
      }),
    );
    if (code.tier === 'C') {
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'button primary';
      apply.id = 'code-apply';
      apply.textContent = t('code.apply');
      apply.title = t('code.applyTip');
      apply.disabled = !changed;
      apply.onclick = () => safely(() => applyCodeParams(layer.id));
      parts.push(apply);
    }
    return parts;
  };
  /** P3: the Creator presets of My library (Animate > Creator, Add animation). */
  const creatorPresets = (): CreatorPresetChoice[] =>
    creatorLibrary.presets().flatMap((entry) =>
      entry.item.type === 'preset'
        ? [
            {
              id: creatorLibraryId(entry.key),
              name: entry.name,
              preset: entry.item.data,
            },
          ]
        : [],
    );
  const controlsDeps: ControlsDeps = {
    engine,
    session,
    presets: creatorPresets,
    report: (error) => reportError(error),
    confirm: (text) =>
      confirmDialog(escapeHtml(text), {
        titleText: escapeHtml(t('controls.reset')),
        confirmLabel: t('controls.reset'),
        cancelLabel: t('code.cancel'),
      }),
    rerender: () => rightPanel.render(activeSection as RightSection),
    defaults: (preset) => themeMotionParams(preset),
  };
  /** P3: applies a Creator preset to the selected layer (one undo step). */
  /** T1: the current theme's motion style sets a preset's default easing
   *  and scales its default duration. */
  const themeMotionParams = (preset: CreatorPresetChoice['preset']) => {
    const theme = currentTheme();
    if (!theme) return {};
    const style = MOTION_STYLES[theme.motion];
    const duration = presetControls(preset).find(
      (control) => control.name === 'duration',
    );
    return {
      easing: style.easing,
      ...(duration?.type === 'number'
        ? {
            duration:
              Math.round(
                Math.min(
                  duration.max,
                  Math.max(
                    duration.min,
                    duration.default * style.durationScale,
                  ),
                ) * 100,
              ) / 100,
          }
        : {}),
    };
  };
  const applyCreatorPreset = (id: string | null) =>
    safely(() => {
      const layer = controlledLayer(session) ?? codeLayerSelected(session);
      if (!layer) return;
      const found = locateLayer(session.source.composition.layers, layer.id);
      if (!found) return;
      // Q2: None removes every Creator preset of the layer (one step).
      if (id === null) {
        if (!livePresets(found.layer).length) return;
        session.setPlaying(false);
        engine.commands.transaction(
          t('controls.removeStep'),
          removePresetCommands(session.source.composition, found.layer),
        );
        return;
      }
      const choice = creatorPresets().find((item) => item.id === id);
      if (!choice) return;
      if (!presetFits(choice.preset, found.layer))
        throw new Error(t('controls.notFor', { name: choice.name }));
      session.setPlaying(false);
      engine.commands.transaction(
        t('controls.applyStep'),
        presetCommands(
          session.source.composition,
          found.layer,
          { ...choice, params: themeMotionParams(choice.preset) },
          true,
        ),
      );
    });
  /** P1: the pause after a released control before its re-bake. */
  const CODE_APPLY_DELAY = 300;
  /** X3: staged param values of one code layer (not yet applied). */
  let pendingCode: { layerId: string; values: ParamValues } | null = null;
  let codeApplyTimer: ReturnType<typeof setTimeout> | undefined;
  const applyCodeParams = (layerId: string) => {
    clearTimeout(codeApplyTimer);
    const staged = pendingCode?.layerId === layerId ? pendingCode : null;
    pendingCode = null;
    const code = codeOf(layerId);
    if (!staged || !code) return;
    const next = codeRecord({
      tier: code.tier,
      source: code.source,
      meta: code.meta,
      params: staged.values,
      ...(code.templateId ? { templateId: code.templateId } : {}),
    });
    if (next.bakeKey === code.bakeKey) {
      codeLive.clear(layerId);
      rightPanel.render('Code');
      return;
    }
    const found = findLayerScene(layerId);
    if (!found) return;
    engine.commands.transaction('Animation settings', [
      {
        type: 'SET_LAYER_CODE',
        compositionId: found,
        layerId,
        code: next,
      },
    ]);
  };
  const findLayerScene = (layerId: string) =>
    engine.state.compositions.find((composition) =>
      JSON.stringify(composition.layers).includes(`"id":"${layerId}"`),
    )?.id;
  const openExport = () => {
    session.setPlaying(false);
    // FIX1 F6: export always shows the whole project.
    if (engine.nest) nestBar?.leaveAll();
    openExportDialog({
      composition: session.source.composition,
      scenes: engine.state.compositions,
      assets: session.source.assets,
      background: session.source.background,
      projectName: engine.state.metadata.name,
      // FINAL2 U5: the export mix uses the same master volume as playback.
      masterVolume: projectMasterVolume(engine),
      store: mediaStore,
      decoder,
      renderFrame,
      // I2: Designs in Project Media (a library change, not an undo step).
      saveFrame: (blob, name) =>
        mediaPanel
          .importFiles(
            [
              new File(
                [blob],
                name.replace(/\.png$/, `-${Date.now().toString(36)}.png`),
                { type: 'image/png' },
              ),
            ],
            { design: true },
          )
          .then(() => undefined),
      toast: (text, kind) => showToast(text, kind),
      // X1: code animations are baked at Full quality first.
      prepareCode: (composition, progress, cancelled) =>
        bakeForExport(codeBaker, composition, progress, cancelled),
    });
  };
  element<HTMLButtonElement>('#export').onclick = () => safely(openExport);
  // P1-30: the one place a plan feature shows as locked or hidden.
  gateControl(
    element<HTMLButtonElement>('#export'),
    'export.video',
    { upgrade: t('features.upgrade'), locked: t('features.locked') },
    (message) => showToast(message, 'info'),
  );
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
    Record: ['library.recordTitle', 'library.recordDescription'],
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
    'Audio',
    'Record',
    'AI',
    'MyTemplates',
    'Theme',
  ]);
  // SHP-018: the Draw category; leaving it leaves draw mode.
  const drawPanel = mountDrawPanel(
    element('#draw-panel'),
    session,
    reportError,
  );
  // I1.3, I1.4: adding library items by click, drop and the template dialog.
  const crossfade = () => {
    if (reducedNow()) return;
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
  // X4 (spec section 5): code animation templates in My Templates (this
  // browser, not the project, not an undo step).
  const dataUrlOf = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  /** R2: a code animation as a My library entry (kind motion, or
   *  composition for a Tier A spec); it shows in the AI category only. */
  const codeEntry = (template: {
    name: string;
    tier: 'A' | 'B' | 'C';
    source: string;
    meta: Readonly<Record<string, unknown>>;
    params: Readonly<Record<string, unknown>>;
    thumbnail?: string;
    createdAt?: string;
  }): CreatorEntry => {
    const id = `code-${codeHash(template.source)}`;
    const name = template.name || t('aiImport.codeName');
    const meta = template.meta as Record<string, unknown>;
    const item =
      template.tier === 'A'
        ? {
            id,
            name: { en: name },
            tags: ['code'],
            type: 'composition',
            data: { spec: JSON.parse(template.source) as unknown },
          }
        : {
            id,
            name: { en: name },
            tags: ['code'],
            type: 'motion',
            data: { tier: template.tier, source: template.source, meta },
          };
    return {
      key: `${id}/${id}`,
      packId: id,
      packName: { en: name },
      packVersion: 1,
      item: item as unknown as CreatorEntry['item'],
      name,
      addedAt: template.createdAt ?? new Date().toISOString(),
      motionMeta: {
        name,
        category: 'code',
        ...meta,
        params: (meta.params as unknown[] | undefined) ?? [],
      } as unknown as NonNullable<CreatorEntry['motionMeta']>,
      params: template.params,
      ...(template.thumbnail ? { thumbnail: template.thumbnail } : {}),
    };
  };
  // R2: code templates saved before R2 (Templates > Code animations) move to
  // the AI category, once; layers already placed keep their own code.
  void creatorLibrary.ready.then(async () => {
    const old = codeTemplates.list();
    if (!old.length) return;
    const entries: CreatorEntry[] = [];
    for (const template of old)
      try {
        const entry = codeEntry(template);
        if (!creatorLibrary.find(entry.key)) entries.push(entry);
      } catch {
        // A damaged template is left where it is.
        continue;
      }
    if (entries.length) await creatorLibrary.add(entries);
    for (const template of old) codeTemplates.remove(template.id);
  });
  /** P1: Save as template from a code layer (its source, meta and values). */
  /** S1 Part 4: downloads `text` as a file. */
  const downloadText = (text: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  /** S1: a code animation as a file the AI importer reads again: the
   *  source (.js) for Tier B and C, the Composition Spec (.json) for A. */
  const downloadCode = (name: string, tier: string, source: string) => {
    const file = `${name.replace(/[\\/:*?"<>|]+/g, '-') || 'code'}.${tier === 'A' ? 'json' : 'js'}`;
    downloadText(
      source,
      file,
      tier === 'A' ? 'application/json' : 'text/javascript',
    );
    showToast(t('code.exported', { name: file }), 'info', 3000);
  };
  const exportCodeLayer = (layerId: string) => {
    const code = codeOf(layerId);
    if (!code) return;
    const layer = locateLayer(session.source.composition.layers, layerId);
    // FINAL2 U10: changed control values travel with the code (a first
    // comment line the AI importer reads back as the controls' values).
    const params = (code as { params?: Record<string, unknown> }).params;
    downloadCode(
      layer?.layer.name || codeMeta(code).name,
      code.tier,
      params && Object.keys(params).length
        ? `${PARAMS_HEADER}${JSON.stringify(params)}\n${code.source}`
        : code.source,
    );
  };
  /** S1: "<name> copy", then "<name> copy 2" and so on, unique in `taken`. */
  const copyName = (name: string, taken: readonly string[]) => {
    let next = t('shelf.copyName', { name });
    for (let n = 2; taken.includes(next); n++)
      next = t('shelf.copyNameN', { name, n: String(n) });
    return next;
  };
  /** S1: Duplicate as copy: the layer duplicated and named "<name> copy",
   *  one undo step. */
  const duplicateCodeCopy = (layerId: string) =>
    safely(() => {
      session.select(layerId);
      const captured = engine.commands.capture(() =>
        performEdit(engine, session, 'duplicate'),
      ) as Command[];
      const created = captured.flatMap((command) =>
        command.type === 'CREATE_LAYER' && command.parentId === null
          ? [command.layer.id]
          : [],
      );
      const taken = session.source.composition.layers.map((item) => item.name);
      const renamed = captured.map((command): Command => {
        if (
          command.type === 'CREATE_LAYER' &&
          created.includes(command.layer.id)
        )
          return {
            ...command,
            layer: {
              ...command.layer,
              name: copyName(command.layer.name, taken),
            },
          } as Command;
        if (
          command.type === 'CREATE_CLIP' &&
          created.includes(command.clip.layerId)
        )
          return {
            ...command,
            clip: {
              ...command.clip,
              name: copyName(command.clip.name, taken),
            },
          } as Command;
        return command;
      });
      if (!renamed.length) return;
      engine.commands.transaction(t('command.codeDuplicate'), renamed);
      session.selectMany(created);
    });
  /** Inserts a code template at `time` on a new lane, one undo step. */
  const insertCodeTemplate = async (template: CodeTemplate, time: number) => {
    session.setPlaying(false);
    const current = session.source.composition;
    if (template.tier === 'A') {
      const built = await tierACommands(JSON.parse(template.source), {
        project: engine.state,
        current,
        mode: 'current',
        at: time,
        overrides: template.params as ParamValues,
      });
      engine.commands.transaction('Insert code template', built.commands);
      if (built.notBuilt.length)
        showToast(
          t('code.notBuilt', { items: built.notBuilt.join('; ') }),
          'warning',
        );
      return;
    }
    const built = codeLayerCommands(
      current,
      {
        tier: template.tier,
        source: template.source,
        meta: template.meta,
        params: template.params,
        templateId: template.id,
        name: template.name,
      },
      time,
    );
    engine.commands.transaction('Insert code template', built.commands);
    session.select(built.layerId);
  };
  /** Hover: the first two seconds play at 12 frames a second. */
  let hovering: { id: string; stop: () => void } | null = null;
  const codeHover = (
    template: CodeTemplate,
    thumb: HTMLElement,
    on: boolean,
  ) => {
    if (hovering && (!on || hovering.id !== template.id)) {
      hovering.stop();
      hovering = null;
    }
    if (!on || template.tier === 'A' || hovering) return;
    let stopped = false;
    const image = document.createElement('img');
    image.className = 'code-hover';
    image.alt = '';
    let url = '';
    const stop = () => {
      stopped = true;
      image.remove();
      thumb.removeAttribute('data-playing');
      if (url) URL.revokeObjectURL(url);
    };
    hovering = { id: template.id, stop };
    void (async () => {
      const meta = codeMeta(template);
      const fps = 12;
      const duration = Math.min(2, meta.duration);
      const width = 160;
      const height = Math.max(
        1,
        Math.round(
          (width * session.source.composition.height) /
            session.source.composition.width,
        ),
      );
      const codeSession = await openCodeSession(
        template.tier as 'B' | 'C',
        template.source,
        {
          width,
          height,
          fps,
          duration,
          params: codeParams(template) as ParamValues,
          seed: codeSeedOf(template),
        },
      );
      try {
        thumb.append(image);
        const frames = Math.max(1, Math.floor(duration * fps));
        for (let frame = 0; frame < frames && !stopped; frame++) {
          const bitmap = await codeSession.renderFrame(frame);
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
          bitmap.close();
          const blob = await canvas.convertToBlob({ type: 'image/png' });
          if (stopped) break;
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(blob);
          image.src = url;
          thumb.dataset.playing = String(frame + 1);
          await new Promise((resolve) => setTimeout(resolve, 1000 / fps));
        }
      } finally {
        codeSession.dispose();
      }
    })().catch(() => stop());
  };
  const codeTemplateInput = document.createElement('input');
  codeTemplateInput.type = 'file';
  codeTemplateInput.accept = '.json,application/json';
  codeTemplateInput.hidden = true;
  codeTemplateInput.id = 'code-template-file';
  root.append(codeTemplateInput);
  const importCodeTemplateText = (text: string) => {
    try {
      const template = importCodeTemplate(text);
      // R2: an exported code template goes to the AI category.
      void creatorLibrary.add([codeEntry(template)]);
      showToast(t('code.templateImported', { name: template.name }), 'success');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        'error',
      );
    }
  };
  codeTemplateInput.onchange = async () => {
    const file = codeTemplateInput.files?.[0];
    codeTemplateInput.value = '';
    if (file) importCodeTemplateText(await file.text());
  };
  const codeMenuElement = document.createElement('div');
  codeMenuElement.className = 'media-menu';
  codeMenuElement.id = 'code-template-menu';
  codeMenuElement.hidden = true;
  document.body.append(codeMenuElement);
  const codeMenu = createMenu(codeMenuElement, { report: reportError });
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (
        !codeMenuElement.hidden &&
        !codeMenuElement.contains(event.target as Node)
      )
        codeMenu.close();
    },
    true,
  );
  const codeTemplateMenu = (template: CodeTemplate, x: number, y: number) => {
    codeMenu.open(() => [
      {
        id: 'code-template-insert',
        label: t('code.templateInsert'),
        icon: 'plus',
        run: () =>
          void insertCodeTemplate(template, session.currentTime).catch(
            reportError,
          ),
      },
      {
        id: 'code-template-rename',
        label: t('code.templateRename'),
        icon: 'edit',
        run: () =>
          void promptDialog(t('code.templateRename'), template.name, {
            label: t('myTemplates.name'),
            confirmLabel: t('code.templateRename'),
            cancelLabel: t('code.cancel'),
            maxLength: 100,
          }).then((name) => {
            if (name?.trim())
              codeTemplates.update(template.id, { name: name.trim() });
          }),
      },
      {
        id: 'code-template-duplicate',
        label: t('code.templateDuplicate'),
        icon: 'duplicate',
        run: () =>
          codeTemplates.duplicate(
            template.id,
            t('code.templateCopy', { name: template.name }),
          ),
      },
      {
        id: 'code-template-export',
        label: t('code.templateExport'),
        icon: 'export',
        run: () =>
          download(
            new Blob([exportCodeTemplate(template)], {
              type: 'application/json',
            }),
            `${template.name.replace(/[^\w.-]+/g, '-')}.aive-template.json`,
          ),
      },
      {
        id: 'code-template-delete',
        label: t('code.templateDelete'),
        icon: 'delete',
        divider: true,
        run: () => {
          const removed = codeTemplates.remove(template.id);
          if (!removed) return;
          showToast(
            t('code.templateDeleted', { name: template.name }),
            'info',
            8000,
            {
              label: t('code.templateRestore'),
              run: () => codeTemplates.restore(removed.template, removed.index),
            },
          );
        },
      },
    ]);
    const width = codeMenuElement.offsetWidth,
      height = codeMenuElement.offsetHeight;
    codeMenuElement.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
    codeMenuElement.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
  };
  // P2: a Creator Pack item's menu: Insert, Rename, Export item, Delete
  // (soft, with Restore). None of it is an undo step.
  /** R4: a library item's Details (a read-only list). */
  const showDetails = (name: string, rows: readonly [string, string][]) =>
    openModal({
      titleText: escapeHtml(t('media.details.title', { name })),
      bodyBuilder: (body) => {
        const list = document.createElement('dl');
        list.className = 'media-details';
        for (const [term, value] of rows) {
          const dt = document.createElement('dt');
          dt.textContent = term;
          const dd = document.createElement('dd');
          dd.textContent = value;
          list.append(dt, dd);
        }
        body.append(list);
      },
    });
  const creatorEntryOf = (id: string) =>
    creatorLibrary.list().find((entry) => creatorLibraryId(entry.key) === id);
  /** S1 Part 3: moves the new top-level layers of `commands` so their
   *  drawn box is centred on `point` (keyframed positions too). */
  const centreOn = (
    commands: Command[],
    ids: readonly string[],
    point: readonly [number, number],
  ) => {
    const composition = engine
      .preview(commands)
      .compositions.find((item) => item.id === session.source.composition.id);
    const box = composition
      ? selectionGeometryOf({
          ...session.source,
          composition,
          selectedIds: [...ids],
        } as RenderSource)
      : null;
    if (!box) return commands;
    const dx = point[0] - (box.x + box.width / 2),
      dy = point[1] - (box.y + box.height / 2);
    const move = (value: unknown) =>
      Array.isArray(value) && value.length === 2
        ? [Number(value[0]) + dx, Number(value[1]) + dy]
        : value;
    return commands.map((command) => {
      if (
        command.type !== 'CREATE_LAYER' ||
        command.parentId !== null ||
        !ids.includes(command.layer.id)
      )
        return command;
      const position = command.layer.transform.position as unknown as {
        value: unknown;
        keyframes: { value: unknown }[];
      };
      return {
        ...command,
        layer: {
          ...command.layer,
          transform: {
            ...command.layer.transform,
            position: {
              ...position,
              value: move(position.value),
              keyframes: position.keyframes.map((key) => ({
                ...key,
                value: move(key.value),
              })),
            },
          },
        },
      } as Command;
    });
  };
  /** S1 Part 3: the one-step commands that add an AI shape, text or
   *  background (null for themes, presets, motion and templates). */
  const creatorBuilt = (
    id: string,
    time: number,
    point?: readonly [number, number] | null,
  ): { label: string; commands: Command[]; layerId: string } | null => {
    const entry = creatorEntryOf(id);
    if (
      !entry ||
      [
        'theme',
        'motion',
        'composition',
        'preset',
        'template',
        'style',
      ].includes(entry.item.type)
    )
      return null;
    const item = libraryActions.find(id);
    const built = item
      ? libraryActions.commandsFor(item, point ?? undefined, time)
      : null;
    if (!built?.layerId) return null;
    // T1: an AI item's layers remember their palette slot (background, text
    // or primary), so a theme recolours them.
    return {
      label: built.label,
      layerId: built.layerId,
      commands: built.commands.map((command) =>
        command.type === 'CREATE_LAYER'
          ? ({
              ...command,
              layer: withPaletteSlots(
                command.layer as unknown as CoreLayer,
              ) as never,
            } as Command)
          : command,
      ),
    };
  };
  /** FINAL3 V3.5: a starter kit item in the open scene (one step). */
  const insertKitItem = async (id: string) => {
    const composition = session.source.composition;
    const theme = themeById(currentThemeId()) ?? BUILT_IN_THEMES[0]!;
    const built = await kitLayers(id, {
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      palette: {
        background: theme.palette.background,
        text: theme.palette.text,
        accent: theme.palette.accent,
      },
      text: t('kit.sampleText'),
    });
    if (!built) return;
    const placed = mineCommands(
      session.source.composition,
      session.source.assets,
      {
        id: `kit-${id}`,
        name: t(`kit.name.${id}`),
        kind: 'annotation',
        createdAt: engine.state.metadata.updatedAt,
        layers: built.layers,
        clips: built.clips.map((clip) => ({
          layerId: clip.layerId,
          startTime: clip.startTime,
          duration: clip.duration,
          metadata: clip.metadata as Record<string, unknown>,
        })),
        origin: 0,
      },
      session.currentTime,
      (commands) =>
        engine
          .preview(commands)
          .compositions.find((scene) => scene.id === composition.id)!,
    );
    engine.commands.transaction('Add starter kit item', placed.commands);
    session.selectMany?.(placed.layerIds);
  };
  const insertCreatorItem = (
    id: string,
    time = session.currentTime,
    point?: readonly [number, number] | null,
  ) => {
    const entry = creatorEntryOf(id);
    // FINAL3 V2: a Video Plan builds into scenes.
    if (entry?.item.type === 'composition' && isPlanV2(entry.item.data)) {
      openPlanBuildFor(entry.item.data as unknown as VideoPlan);
      return;
    }
    // B1: a style is never placed on the canvas.
    if (!entry || entry.item.type === 'style') return;
    // R2: a theme item is applied (themes live in the AI category too).
    if (entry.item.type === 'theme') {
      const theme = themeById(id);
      if (theme) applyTheme(theme, false);
      return;
    }
    if (entry.item.type === 'motion' || entry.item.type === 'composition') {
      const template = creatorLibrary
        .motionTemplates()
        .find((item) => item.id === id);
      if (template) void insertCodeTemplate(template, time).catch(reportError);
      return;
    }
    const built = creatorBuilt(id, time, point);
    if (!built) {
      const item = libraryActions.find(id);
      if (item)
        libraryActions.insert(
          item,
          (point ?? undefined) as [number, number] | undefined,
          time,
        );
      return;
    }
    session.setPlaying(false);
    engine.commands.transaction(built.label, built.commands);
    session.select(built.layerId);
  };
  // Q4: the AI category (everything from Creator Packs).
  // R4: the AI category on the shared library panel.
  const deleteCreatorItem = (id: string) => {
    const entry = creatorEntryOf(id);
    if (!entry) return;
    void creatorLibrary.remove(entry.key);
    showToast(t('code.templateDeleted', { name: entry.name }), 'info', 8000, {
      label: t('code.templateRestore'),
      run: () => void creatorLibrary.restore(entry.key),
    });
  };
  const renameCreatorItem = (id: string) => {
    const entry = creatorEntryOf(id);
    if (!entry) return;
    void promptDialog(t('code.templateRename'), entry.name, {
      label: t('myTemplates.name'),
      confirmLabel: t('code.templateRename'),
      cancelLabel: t('code.cancel'),
      maxLength: 80,
    }).then((name) => {
      if (name?.trim()) void creatorLibrary.rename(entry.key, name.trim());
    });
  };
  /** S1 Part 4: an AI code animation (motion, or a Composition Spec). */
  const isCreatorCode = (id: string) => {
    const item = creatorEntryOf(id)?.item;
    // B1: styles are duplicated and exported the same way.
    return (
      item?.type === 'motion' ||
      item?.type === 'composition' ||
      item?.type === 'style'
    );
  };
  /** S1: Duplicate makes "<name> copy" (kept unique) in AI. */
  const duplicateCreatorItem = (id: string) => {
    const entry = creatorEntryOf(id);
    if (!entry || !isCreatorCode(id)) return;
    const suffix = `copy-${crypto.randomUUID().slice(0, 8)}`;
    const itemId = `${entry.item.id.slice(0, 50)}-${suffix}`;
    const packId = `${entry.packId.slice(0, 50)}-${suffix}`;
    const name = copyName(
      entry.name,
      creatorLibrary.list().map((other) => other.name),
    );
    void creatorLibrary.add([
      {
        ...entry,
        key: `${packId}/${itemId}`,
        packId,
        item: { ...entry.item, id: itemId } as CreatorEntry['item'],
        name,
        addedAt: new Date().toISOString(),
        removed: false,
      },
    ]);
    showToast(t('code.duplicated', { name }), 'success');
  };
  /** S1: Export downloads a file the AI importer reads again. */
  const exportCreatorItem = (id: string) => {
    const entry = creatorEntryOf(id);
    const item = entry?.item;
    if (!entry || !item) return;
    if (item.type === 'motion')
      downloadCode(entry.name, item.data.tier, item.data.source);
    else if (item.type === 'composition' && isPlanV2(item.data))
      downloadText(
        `${JSON.stringify(item.data, null, 2)}\n`,
        `${entry.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.plan.json`,
        'application/json',
      );
    else if (item.type === 'composition')
      downloadCode(entry.name, 'A', JSON.stringify(item.data.spec, null, 2));
    else if (item.type === 'style') {
      // B1: a one-item Creator Pack, which AI › Import reads again.
      const pack = {
        format: 'creator-pack',
        version: 1,
        pack: {
          id: entry.packId,
          name: entry.packName,
          version: entry.packVersion,
          author: 'ai',
          createdWith: 'claude-chat',
        },
        items: [{ ...item, name: { ...item.name, en: entry.name } }],
      };
      const file = `${entry.name.replace(/[\\/:*?"<>|]+/g, '-') || 'style'}.creatorpack.json`;
      downloadText(JSON.stringify(pack, null, 2), file, 'application/json');
      showToast(t('code.exported', { name: file }), 'info', 3000);
    }
  };
  // B1: the New AI video form and My briefs.
  const briefLibrary = new BriefLibrary(mediaStore);
  /** The styles in My library, as the form's cards. */
  const briefStyles = () =>
    creatorLibrary.list().flatMap((entry) =>
      entry.item.type === 'style'
        ? [
            {
              id: creatorLibraryId(entry.key),
              name: entry.name,
              category: entry.item.data.category,
              thumbnail: styleThumbnail(entry.item.data, entry.name),
            },
          ]
        : [],
    );
  /** The brief's style: its full record, under its library id. */
  const briefStyle = (styleId: string | null) => {
    const entry = styleId ? creatorEntryOf(styleId) : undefined;
    return entry?.item.type === 'style'
      ? { id: entry.key, name: entry.name, data: entry.item.data }
      : null;
  };
  /** Copies `text`; when the clipboard is blocked, shows it to copy by hand. */
  const copyOrShow = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(done, 'success');
    } catch {
      const handle = openModal({
        titleText: t('brief.title'),
        bodyHtml: `<p>${t('brief.fallback')}</p><textarea id="brief-form-text" rows="12" readonly></textarea>`,
      });
      const box =
        handle.root.querySelector<HTMLTextAreaElement>('#brief-form-text')!;
      box.value = text;
      box.focus();
      box.select();
    }
  };
  const openNewVideo = (
    styleId?: string | null,
    initial?: Partial<BriefFormValues> | null,
  ) => {
    openBriefDialog({
      styles: briefStyles,
      initial: { ...(initial ?? {}), ...(styleId ? { styleId } : {}) },
      copy: async (values) => {
        const { text } = await briefText('', values);
        await copyOrShow(text, t('briefForm.copied'));
      },
      save: async (values) => {
        const name = await promptDialog(
          t('briefForm.save'),
          values.topic.trim().slice(0, 80) || t('briefForm.untitled'),
          {
            label: t('myTemplates.name'),
            confirmLabel: t('briefForm.save'),
            cancelLabel: t('media.cancel'),
            maxLength: 80,
          },
        );
        if (!name?.trim()) return;
        await briefLibrary.save(name.trim(), values);
        showToast(t('briefForm.saved', { name: name.trim() }), 'success');
      },
      copyText: (text) => copyOrShow(text, t('briefForm.filesCopied')),
      report: reportError,
    });
  };
  const renameBrief = (id: string) => {
    const item = briefLibrary.find(id);
    if (!item) return;
    void shelfPrompt(t('media.rename.title'), item.name).then((name) => {
      if (name?.trim()) void briefLibrary.rename(id, name.trim());
    });
  };
  const duplicateBrief = (id: string) => {
    const item = briefLibrary.find(id);
    if (!item) return;
    const name = copyName(
      item.name,
      briefLibrary.list().map((other) => other.name),
    );
    void briefLibrary.save(name, item.values);
    showToast(t('code.duplicated', { name }), 'success');
  };
  /** A saved brief exports as the brief text it copies. */
  const exportBrief = (id: string) => {
    const item = briefLibrary.find(id);
    if (!item) return;
    void briefText('', item.values).then(({ text }) => {
      const file = `${item.name.replace(/[\\/:*?"<>|]+/g, '-') || 'brief'}.brief.txt`;
      downloadText(text, file, 'text/plain');
      showToast(t('code.exported', { name: file }), 'info', 3000);
    });
  };
  const briefDetails = (id: string) => {
    const item = briefLibrary.find(id);
    if (!item) return;
    const style = briefStyle(item.values.styleId);
    const { locked, free } = briefSections(item.values, style);
    showDetails(item.name, [
      [t('media.details.name'), item.name],
      [t('shelf.detailsKind'), t('ai.kind.brief')],
      [t('shelf.detailsAdded'), new Date(item.createdAt).toLocaleString()],
      [t('briefForm.style'), style?.name ?? t('briefForm.noStyle')],
      [
        t('briefForm.summary', {
          locked: String(locked.length),
          free: String(free.length),
        }),
        '',
      ],
    ]);
  };
  const deleteBrief = (id: string) => {
    const item = briefLibrary.find(id);
    if (!item) return;
    void briefLibrary.remove(id);
    showToast(t('code.templateDeleted', { name: item.name }), 'info', 8000, {
      label: t('code.templateRestore'),
      run: () => void briefLibrary.save(item.name, item.values, item.id),
    });
  };
  const creatorDetails = (id: string) => {
    const entry = creatorEntryOf(id);
    if (!entry) return;
    const controls =
      entry.item.type === 'preset'
        ? presetControls(entry.item.data).map((control) => control.name)
        : (entry.motionMeta?.params ?? []).map((param) => param.name);
    const rows: [string, string][] = [
      [t('media.details.name'), entry.name],
      [t('shelf.detailsKind'), t(`ai.kind.${entry.item.type}`)],
      [t('shelf.detailsPack'), `${entry.packName.en} (v${entry.packVersion})`],
      [t('shelf.detailsAdded'), new Date(entry.addedAt).toLocaleString()],
      ...(controls.length
        ? ([[t('shelf.detailsControls'), controls.join(', ')]] as [
            string,
            string,
          ][])
        : []),
    ];
    showDetails(entry.name, rows);
  };
  const shelfPrompt = (title: string, value: string) =>
    promptDialog(title, value, {
      label: t('media.folder.name'),
      confirmLabel: value
        ? t('media.rename.confirm')
        : t('media.folder.create'),
      cancelLabel: t('media.cancel'),
      maxLength: 80,
    });
  aiPanel = mountAiPanel(element('#library-ai'), {
    library: creatorLibrary,
    // FINAL3 V3.5: a plan's status, and the starter kit.
    planStatus: (_id, data) => {
      // FIX3 4.6: a composition built with Build video (not a plan).
      if (!isPlanV2(data))
        return compositionCardStatus(
          builtScenes(storageOrNull(), engine.state.id, compositionKey(data)),
          engine.state.compositions,
        ).status;
      const title = (data as VideoPlan).meta.title;
      const state = planState(engine.state.id, title);
      if (!state) return 'not-built';
      return state.flags.length ? 'needs-assets' : 'built';
    },
    // FIX4 A4: Built / Needs assets / Not built, the scene count and a
    // poster from the first built scene.
    planCard: (_id, data) => {
      let ids: readonly string[] = [];
      let status: 'built' | 'needs-assets' | 'not-built';
      if (!isPlanV2(data)) {
        const built = builtScenes(
          storageOrNull(),
          engine.state.id,
          compositionKey(data),
        );
        const info = compositionCardStatus(built, engine.state.compositions);
        status = info.status;
        ids = (built ?? []).filter((id) =>
          engine.state.compositions.some((scene) => scene.id === id),
        );
      } else {
        const state = planState(
          engine.state.id,
          (data as VideoPlan).meta.title,
        );
        if (!state) return { status: 'not-built', scenes: 0 };
        ids = state.sceneIds.filter(
          (id): id is string =>
            !!id && engine.state.compositions.some((scene) => scene.id === id),
        );
        status = !ids.length
          ? 'not-built'
          : state.flags.length
            ? 'needs-assets'
            : 'built';
      }
      if (status === 'not-built' || !ids.length)
        return { status: 'not-built', scenes: 0 };
      // FIX6: the card shows the first scene a moment in (text and
      // pictures are in), not the blank first frame.
      const first = engine.state.compositions.find(
        (item) => item.id === ids[0],
      );
      const poster = scenePosterUrl(
        engine,
        session,
        ids[0]!,
        frames,
        256,
        first ? Math.min(first.duration * 0.4, 2.5) : 0,
      );
      return {
        status,
        scenes: ids.length,
        ...(poster ? { poster } : {}),
      };
    },
    rebuild: (id) => safely(() => insertCreatorItem(id)),
    // FIX6: each built video opens its own Review & swap (with 3 or 4 plans
    // imported, "the" review would not say which one).
    review: (id) => {
      const entry = creatorLibrary
        .list()
        .find((item) => creatorLibraryId(item.key) === id);
      const title = isPlanV2(entry?.item.data)
        ? (entry!.item.data as unknown as VideoPlan).meta.title
        : undefined;
      if (title !== undefined && planState(engine.state.id, title))
        openPlanReview(title);
      else showToast(t('plan.reviewEmpty'), 'info');
    },
    kit: {
      // (Listed with the plans it builds, once the library holds one.)
      items: () =>
        creatorLibrary
          .list()
          .some(
            (entry) =>
              entry.item.type === 'composition' && isPlanV2(entry.item.data),
          )
          ? KIT_IDS.map((id) => ({ id, name: t(`kit.name.${id}`) }))
          : [],
      insert: (id) => void insertKitItem(id).catch(reportError),
      preview: (id) => {
        const theme = themeById(currentThemeId()) ?? BUILT_IN_THEMES[0]!;
        return kitPreviewUrl(id, theme.palette, t('kit.sampleText'));
      },
    },
    insert: (id) => safely(() => insertCreatorItem(id)),
    applyPreset: (id) => applyCreatorPreset(id),
    importPack: () => openCreatorImport(),
    copyBrief: () => void copyAiBrief(),
    motionPreview: (id, slot) => {
      const template = creatorLibrary
        .motionTemplates()
        .find((item) => item.id === id);
      if (!template || template.tier === 'A') return null;
      codeHover(template, slot, true);
      return () => codeHover(template, slot, false);
    },
    // B1: My briefs share the panel (ids `brief:<id>`); each action routes
    // to the brief library or to My library.
    rename: (id) =>
      isBriefId(id) ? renameBrief(briefIdOf(id)) : renameCreatorItem(id),
    isCode: (id) => isBriefId(id) || isCreatorCode(id),
    useStyle: (id) => safely(() => openNewVideo(id)),
    newVideo: () => safely(() => openNewVideo()),
    briefs: briefLibrary,
    useBrief: (id) =>
      safely(() => openNewVideo(null, briefLibrary.find(id)?.values)),
    duplicate: (id) =>
      safely(() =>
        isBriefId(id)
          ? duplicateBrief(briefIdOf(id))
          : duplicateCreatorItem(id),
      ),
    exportItem: (id) =>
      safely(() =>
        isBriefId(id) ? exportBrief(briefIdOf(id)) : exportCreatorItem(id),
      ),
    details: (id) =>
      isBriefId(id) ? briefDetails(briefIdOf(id)) : creatorDetails(id),
    remove: (id) =>
      isBriefId(id) ? deleteBrief(briefIdOf(id)) : deleteCreatorItem(id),
    prompt: shelfPrompt,
    report: reportError,
    toast: (text) => showToast(text, 'success'),
  });
  // R5: My Templates (left rail), on the shared library panel.
  const mineKindLabel = (kind: MineKind) => t(`mine.kind.${kind}`);
  const savedToast = (kind: MineKind) =>
    showToast(t('mine.saved', { kind: mineKindLabel(kind) }), 'success', 6000, {
      label: t('mine.open'),
      run: () => {
        openCategory('MyTemplates');
        minePanel.shelf.setTab(kind);
      },
    });
  /** The used assets of some layers (so a saved item can bring them). */
  const assetsOf = (layers: readonly DeepReadonly<CoreLayer>[]) => {
    const ids = new Set<string>();
    const walk = (list: readonly DeepReadonly<CoreLayer>[]) => {
      for (const layer of list) {
        if (layer.assetId) ids.add(layer.assetId);
        walk(layer.children);
      }
    };
    walk(layers);
    return session.source.assets.filter((asset) => ids.has(asset.id));
  };
  const posterOf = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return undefined;
    const scale = Math.min(1, 320 / Math.max(canvas.width, canvas.height));
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(canvas.width * scale));
    small.height = Math.max(1, Math.round(canvas.height * scale));
    small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL('image/png');
  };
  const askKindMismatch = (
    layer: CoreLayer,
    chosenLabel: string,
  ): Promise<'recommended' | 'anyway' | null> =>
    new Promise((resolve) => {
      let answer: 'recommended' | 'anyway' | null = null;
      const real = mineKindLabel(recommendedKind(layer as never));
      openModal({
        titleText: t('mine.mismatch.title'),
        onClose: () => resolve(answer),
        bodyBuilder: (body) => {
          const text = document.createElement('p');
          text.className = 'mine-mismatch-text';
          text.textContent = t('mine.mismatch.body', {
            name: layer.name,
            real,
            chosen: chosenLabel,
          });
          const row = document.createElement('div');
          row.className = 'mine-mismatch-actions';
          const make = (
            label: string,
            value: 'recommended' | 'anyway' | null,
            primary = false,
          ) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = primary ? 'btn btn-primary' : 'btn';
            button.dataset.action = `mine-mismatch-${value ?? 'cancel'}`;
            button.textContent = label;
            button.onclick = () => {
              answer = value;
              (
                body
                  .closest('.modal-backdrop')
                  ?.querySelector('.modal-close') as HTMLElement | null
              )?.click();
            };
            return button;
          };
          row.append(
            make(t('mine.mismatch.recommended', { real }), 'recommended', true),
            make(t('mine.mismatch.anyway', { chosen: chosenLabel }), 'anyway'),
            make(t('mine.mismatch.cancel'), null),
          );
          body.append(text, row);
        },
      });
    });
  /** Save to My Templates: the selection as one item of `kind` (several
   *  layers are one Group item); nothing selected saves the scene. */
  const saveToMine = async (kind: MineKind) => {
    const roots = selectionRoots(session.source, session.selectedIds);
    if (!roots.length || kind === 'scene')
      return saveSceneToMine(session.source.composition.id);
    const composition = session.source.composition;
    const finalKind: MineKind = roots.length > 1 ? 'group' : kind;
    // FIX7: a format that does not fit the object is explained first; the
    // person may take the recommended one, keep theirs, or cancel.
    if (roots.length === 1 && kindMismatch(roots[0] as never, kind)) {
      const chosen = await askKindMismatch(
        roots[0] as never,
        mineKindLabel(kind),
      );
      if (chosen === null) return;
      if (chosen === 'recommended')
        return saveToMine(recommendedKind(roots[0] as never));
    }
    const clips = roots.flatMap((layer) => {
      const found = findClipByLayer(composition, layer.id);
      return found
        ? [
            {
              layerId: layer.id,
              startTime: found.clip.startTime,
              duration: found.clip.duration,
              sourceIn: found.clip.sourceIn,
              sourceOut: found.clip.sourceOut,
              speed: found.clip.speed,
              metadata: JSON.parse(
                JSON.stringify(found.clip.metadata),
              ) as Record<string, unknown>,
            },
          ]
        : [];
    });
    const origin = Math.min(
      ...roots.map(
        (layer) =>
          clips.find((clip) => clip.layerId === layer.id)?.startTime ??
          layer.startTime,
      ),
    );
    const item: MineItem = {
      id: `mine-${crypto.randomUUID()}`,
      name:
        roots.length > 1
          ? groupNameFor(roots as unknown as { id: string; name: string }[])
          : roots[0]!.name,
      kind: finalKind,
      createdAt: new Date().toISOString(),
      // The stored layers (session.source evaluates animation at the
      // playhead), so keyframes and controls are kept.
      layers: JSON.parse(
        JSON.stringify(
          roots.map(
            (layer) =>
              locateLayer(
                engine.state.compositions.find(
                  (scene) => scene.id === composition.id,
                )!.layers,
                layer.id,
              )?.layer ?? layer,
          ),
        ),
      ) as CoreLayer[],
      clips,
      origin,
      assets: JSON.parse(JSON.stringify(assetsOf(roots))) as NonNullable<
        MineItem['assets']
      >,
      ...(posterOf(selectionCanvas())
        ? { poster: posterOf(selectionCanvas())! }
        : {}),
    };
    await myLibrary.ready;
    await myLibrary.add(item);
    savedToast(finalKind);
  };
  const saveSceneToMine = async (sceneId: string) => {
    const scene = engine.state.compositions.find((item) => item.id === sceneId);
    if (!scene) return;
    const poster = scenePosterUrl(engine, session, sceneId, frames);
    const template = templateFromScene(
      engine.state,
      sceneId,
      scene.name,
      'my',
      poster,
    );
    await myLibrary.ready;
    await myLibrary.add({
      id: template.id,
      name: template.name,
      kind: 'scene',
      createdAt: template.createdAt,
      ...(poster ? { poster } : {}),
      scene: template,
    });
    if (!template.mediaIncluded) showToast(t('mine.mediaLeftOut'), 'warning');
    savedToast('scene');
  };
  /** S1 Part 3: the commands that add a saved element item at `time`
   *  (centred on `point` for a canvas drop); null for a scene. */
  const mineBuilt = (
    id: string,
    time: number,
    point?: readonly [number, number] | null,
  ) => {
    const item = myLibrary.find(id);
    if (!item || item.kind === 'scene') return null;
    const built = mineCommands(
      session.source.composition,
      session.source.assets,
      item,
      time,
      (commands) =>
        engine
          .preview(commands)
          .compositions.find(
            (scene) => scene.id === session.source.composition.id,
          )!,
    );
    return point
      ? { ...built, commands: centreOn(built.commands, built.layerIds, point) }
      : built;
  };
  /** Add to scene: exactly like a library item (one undo step). */
  const insertMine = (
    id: string,
    time = session.currentTime,
    point?: readonly [number, number] | null,
  ) =>
    safely(() => {
      const item = myLibrary.find(id);
      if (!item) return;
      session.setPlaying(false);
      if (item.kind === 'scene' && item.scene) {
        libraryActions.insertMine(item.scene);
        return;
      }
      const built = mineBuilt(id, time, point);
      if (!built) return;
      engine.commands.transaction(t('mine.addStep'), built.commands);
      session.selectMany(built.layerIds);
    });
  /** FIX7: a saved scene's card opens its breakdown; it never drops. */
  const openMineScene = (id: string) =>
    openSceneBreakdown(id, {
      library: myLibrary,
      add: (itemId) => insertMine(itemId),
      addScene: (sceneId) => {
        const scene = myLibrary.find(sceneId)?.scene;
        if (scene) libraryActions.insertMine(scene);
      },
      pickFile: (accept) =>
        new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = accept;
          input.onchange = async () => {
            const file = input.files?.[0];
            resolve(file ? await importQuiet(file) : null);
          };
          input.click();
        }),
      report: reportError,
      toast: (text) => showToast(text, 'success'),
    });
  const minePanel = mountMyTemplatesPanel(element('#library-mine'), {
    library: myLibrary,
    add: (id) =>
      myLibrary.find(id)?.kind === 'scene'
        ? void openMineScene(id)
        : insertMine(id),
    // S1 Part 4: a saved code animation can be duplicated and exported.
    isCode: (id) => {
      const item = myLibrary.find(id);
      return item?.layers?.length === 1 && !!item.layers[0]!.code;
    },
    duplicate: (id) => {
      const item = myLibrary.find(id);
      if (!item) return;
      const name = copyName(
        item.name,
        myLibrary.list().map((other) => other.name),
      );
      void myLibrary.add({
        ...item,
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
      });
      showToast(t('code.duplicated', { name }), 'success');
    },
    exportItem: (id) => {
      const item = myLibrary.find(id);
      const code = item?.layers?.[0]?.code;
      if (item && code) downloadCode(item.name, code.tier, code.source);
    },
    rename: (id) => {
      const item = myLibrary.find(id);
      if (!item) return;
      void shelfPrompt(t('media.rename.title'), item.name).then((name) => {
        if (name?.trim()) void myLibrary.rename(id, name.trim());
      });
    },
    details: (id) => {
      const item = myLibrary.find(id);
      if (!item) return;
      showDetails(item.name, [
        [t('media.details.name'), item.name],
        [t('shelf.detailsKind'), mineKindLabel(item.kind)],
        [t('shelf.detailsAdded'), new Date(item.createdAt).toLocaleString()],
        [
          t('mine.detailsLayers'),
          String(
            item.scene
              ? item.scene.scene.layers.length
              : (item.layers?.length ?? 0),
          ),
        ],
      ]);
    },
    remove: (id) => {
      const item = myLibrary.find(id);
      if (!item) return;
      void myLibrary.remove(id);
      showToast(t('mine.deleted', { name: item.name }), 'info');
    },
    prompt: shelfPrompt,
    report: reportError,
    toast: (text) => showToast(text, 'success'),
  });
  // T1: themes. Built-in, the project's own (reserved markers on the first
  // scene) and My library's (saved themes under theme/<id>, and Creator Pack
  // theme items).
  // R6: My themes live in the theme library (src/themes/library.ts,
  // Codex): saved, renamed and deleted there, never as undo steps. Themes
  // from Creator Packs stay in the AI category.
  let libraryThemes: Theme[] = [];
  const themeListeners = new Set<() => void>();
  const themeChanged = () => {
    for (const listener of [...themeListeners]) listener();
  };
  const themeLibrary = mediaStore.then((store) =>
    store ? createThemeLibrary(store) : null,
  );
  // Phase 1 library: the built-in themes come from the catalog (P1-22).
  const builtInThemeIds = {
    has: (id: string) => BUILT_IN_THEMES.some((theme) => theme.id === id),
  };
  const feelExtras = new Map<string, FeelExtras>();
  const refreshThemes = async () => {
    const library = await themeLibrary;
    if (!library) return;
    libraryThemes = (await library.listThemes()).filter(
      (theme) => !builtInThemeIds.has(theme.id),
    );
    // FINAL3 V4: what a feel theme adds (transition, camera, pacing).
    feelExtras.clear();
    for (const theme of libraryThemes) {
      const extras = await library.feelOf(theme.id);
      if (extras) feelExtras.set(theme.id, extras);
    }
    themeChanged();
  };
  // After a project opens: old project themes move into the library once.
  const migrateProjectThemes = () =>
    void themeLibrary
      .then((library) => library?.migrateThemes(engine))
      .then(refreshThemes)
      .catch(reportError);
  migrateProjectThemes();
  // Phase 1 library (P1-22): catalog themes, styles, motion and presets.
  const syncCatalog = () => {
    const styles = catalog.payloads('styles');
    registerBuiltInThemes(
      styles.flatMap(({ entry, payload }) =>
        entry.kind === 'theme' ? [payload] : [],
      ),
    );
    creatorLibrary.setBuiltIn(
      styles.flatMap(({ entry, payload }): CreatorEntry[] =>
        entry.kind === 'style' ||
        entry.kind === 'motion' ||
        entry.kind === 'preset'
          ? [
              {
                key: `catalog/${entry.id}`,
                packId: 'catalog',
                packName: { en: 'Library', hi: 'लाइब्रेरी' },
                packVersion: entry.itemVersion,
                item: payload as CreatorEntry['item'],
                name: entry.name[getLanguage()] || entry.name.en,
                addedAt: entry.publishAt ?? '2026-10-26T00:00:00.000Z',
                ...(entry.kind === 'motion' &&
                (payload as { meta?: unknown }).meta
                  ? {
                      motionMeta: (
                        payload as { meta: CreatorEntry['motionMeta'] }
                      ).meta!,
                    }
                  : {}),
              },
            ]
          : [],
      ),
    );
    void refreshThemes();
  };
  void catalog.ready.then(syncCatalog, reportError);
  catalog.onChange(syncCatalog);
  engine.on('state:changed', (event) => {
    if (event.reason === 'load') setTimeout(migrateProjectThemes, 0);
  });
  const creatorThemes = (): Theme[] =>
    creatorLibrary.list().flatMap((entry): Theme[] =>
      entry.item.type === 'theme'
        ? [
            {
              id: creatorLibraryId(entry.key),
              name: entry.name.slice(0, 40),
              ...(entry.item.data as Omit<Theme, 'id' | 'name'>),
            },
          ]
        : [],
    );
  const firstScene = () =>
    engine.state.compositions[0] as unknown as ThemeScene;
  const themeLists = () => ({
    builtIn: BUILT_IN_THEMES,
    saved: libraryThemes,
    library: creatorThemes(),
  });
  const currentThemeId = () => projectThemes(firstScene().markers).current;
  const themeById = (id: string | null) => {
    if (!id) return null;
    const lists = themeLists();
    return (
      [...lists.builtIn, ...lists.saved, ...lists.library].find(
        (item) => item.id === id,
      ) ?? null
    );
  };
  const currentTheme = () => themeById(currentThemeId());
  /** A theme the library does not hold (a Creator Pack theme), applied the
   *  same way in one step, with the same counts. */
  const applyThemeHere = (theme: Theme, override: boolean) => {
    const result = { changed: 0, keptManual: 0, overridden: 0 };
    const visit = (layers: readonly ThemeLayer[]) => {
      for (const layer of layers) {
        if (
          (layer.type === 'text' || layer.type === 'shape') &&
          isManualColor(layer, 'fill')
        ) {
          if (override) result.overridden++;
          else result.keptManual++;
        }
        visit(layer.children);
      }
    };
    for (const scene of engine.state.compositions)
      visit(scene.layers as unknown as ThemeLayer[]);
    engine.commands.transaction(t('theme.applyStep'), [
      {
        type: 'SET_PROJECT_BACKGROUND',
        color: theme.palette.background,
      } as Command,
      ...(applyThemeCommands(
        engine.state.compositions as unknown as ThemeScene[],
        theme,
        { override },
      ) as unknown as Command[]),
    ]);
    return result;
  };
  const themeError = (error: unknown) =>
    error instanceof ThemeError
      ? new Error(
          error.code === 'NAME_TAKEN'
            ? t('theme.nameTaken')
            : error.code === 'NAME_REQUIRED'
              ? t('theme.nameRequired')
              : error.code === 'NAME_TOO_LONG'
                ? t('theme.nameTooLong')
                : error.message,
        )
      : error;
  const applyTheme = (theme: Theme, override: boolean) =>
    safely(async () => {
      session.setPlaying(false);
      const library = await themeLibrary;
      const result =
        library &&
        (builtInThemeIds.has(theme.id) ||
          libraryThemes.some((item) => item.id === theme.id))
          ? await library.applyTheme(engine, theme.id, {
              overrideManual: override,
            })
          : applyThemeHere(theme, override);
      showToast(
        result.overridden
          ? t('theme.appliedOverridden', {
              name: theme.name,
              count: String(result.overridden),
            })
          : result.keptManual
            ? t('theme.appliedKept', {
                name: theme.name,
                count: String(result.keptManual),
              })
            : t('theme.applied', { name: theme.name }),
        'success',
      );
      if (feelExtras.has(theme.id))
        showToast(t('theme.feelApplied', { name: theme.name }), 'info');
    });
  const themeOptions = {
    themes: themeLists,
    // FINAL3 V4: what a theme holds, and its Creator Pack export.
    describe: (theme: Theme) => {
      const extras = feelExtras.get(theme.id);
      const parts = [
        t('theme.has.palette'),
        t('theme.has.fonts'),
        t('theme.has.motion'),
        ...(theme.caption ? [t('theme.has.caption')] : []),
        ...(extras?.transition ? [t('theme.has.transition')] : []),
        ...(extras?.cameraTendency ? [t('theme.has.camera')] : []),
        ...(extras?.pacing ? [t('theme.has.pacing')] : []),
      ];
      return t('theme.contains', { list: parts.join(', ') });
    },
    exportPack: (theme: Theme) => {
      const id = theme.id.replace(/[^a-z0-9-]/g, '-').slice(0, 60);
      const { id: _id, name: _name, ...data } = theme;
      void _id;
      void _name;
      downloadText(
        `${JSON.stringify(
          {
            format: 'creator-pack',
            version: 1,
            pack: {
              id: `theme-${id}`.slice(0, 64),
              name: { en: theme.name },
              version: 1,
              author: 'human',
              createdWith: 'api',
            },
            items: [
              {
                id,
                name: { en: theme.name },
                tags: ['theme'],
                type: 'theme',
                data,
              },
            ],
          },
          null,
          2,
        )}\n`,
        `${theme.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.creatorpack.json`,
        'application/json',
      );
    },
    current: currentThemeId,
    apply: applyTheme,
    save: (name: string) =>
      safely(async () => {
        const library = await themeLibrary;
        if (!library) throw new Error(t('theme.storageUnavailable'));
        const theme = await library
          .saveTheme(name, engine.state)
          .catch((error: unknown) => {
            throw themeError(error);
          });
        await refreshThemes();
        showToast(t('theme.savedToast', { name: theme.name }), 'success');
      }),
    rename: (id: string, name: string) =>
      safely(async () => {
        const library = await themeLibrary;
        if (!library) throw new Error(t('theme.storageUnavailable'));
        const theme = await library
          .renameTheme(id, name)
          .catch(async (error: unknown) => {
            await refreshThemes();
            throw themeError(error);
          });
        await refreshThemes();
        showToast(t('theme.renamedToast', { name: theme.name }), 'success');
      }),
    remove: (id: string) =>
      safely(async () => {
        const library = await themeLibrary;
        if (!library) throw new Error(t('theme.storageUnavailable'));
        const name = libraryThemes.find((item) => item.id === id)?.name ?? '';
        await library.deleteTheme(id);
        await refreshThemes();
        showToast(t('theme.deletedToast', { name }), 'info');
      }),
    onChange: (listener: () => void) => {
      themeListeners.add(listener);
      const offEngine = engine.on('state:changed', listener);
      return () => {
        themeListeners.delete(listener);
        offEngine();
      };
    },
  };
  mountThemePanel(element('#library-theme'), themeOptions);
  const creatorMenu = (id: string, x: number, y: number) => {
    const entry = creatorEntryOf(id);
    if (!entry) return;
    codeMenu.open(() => [
      {
        id: 'creator-insert',
        label: t('code.templateInsert'),
        icon: 'plus',
        run: () => insertCreatorItem(id),
      },
      {
        id: 'creator-rename',
        label: t('code.templateRename'),
        icon: 'edit',
        run: () =>
          void promptDialog(t('code.templateRename'), entry.name, {
            label: t('myTemplates.name'),
            confirmLabel: t('code.templateRename'),
            cancelLabel: t('code.cancel'),
            maxLength: 80,
          }).then((name) => {
            if (name?.trim())
              void creatorLibrary.rename(entry.key, name.trim());
          }),
      },
      {
        id: 'creator-export',
        label: t('creator.exportItem'),
        icon: 'export',
        run: () =>
          download(
            new Blob(
              [
                `${JSON.stringify(
                  {
                    format: 'creator-pack',
                    version: 1,
                    pack: {
                      id: entry.packId,
                      name: entry.packName,
                      version: entry.packVersion,
                      author: 'ai',
                      createdWith: 'claude-chat',
                    },
                    items: [entry.item],
                  },
                  null,
                  2,
                )}\n`,
              ],
              { type: 'application/json' },
            ),
            `${entry.item.id}.creatorpack.json`,
          ),
      },
      {
        id: 'creator-delete',
        label: t('code.templateDelete'),
        icon: 'delete',
        divider: true,
        run: () => {
          void creatorLibrary.remove(entry.key);
          showToast(
            t('code.templateDeleted', { name: entry.name }),
            'info',
            8000,
            {
              label: t('code.templateRestore'),
              run: () => void creatorLibrary.restore(entry.key),
            },
          );
        },
      },
    ]);
    const width = codeMenuElement.offsetWidth,
      height = codeMenuElement.offsetHeight;
    codeMenuElement.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
    codeMenuElement.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;
  };
  const stockDeps: StockDeps = {
    add: async (item, place, signal, job) => {
      const result = await importStockItem(
        item,
        job?.quality ?? stockQuality(item),
        {
          signal,
          ...(job ? { onProgress: job.onProgress } : {}),
        },
      );
      const file = new File([result.blob], result.name, {
        type: result.mime,
      });
      // FIX1 F2: adding from stock is the user's own request, so a
      // file that was once deleted from Media comes back silently.
      const [id] = await mediaPanel.importFiles([file], {
        license: result.licenseMeta,
        quiet: true,
      });
      const asset = id
        ? session.source.assets.find((entry) => entry.id === id)
        : undefined;
      if (!asset) throw new Error(t('stock.importFailed'));
      if (asset.type === 'audio') addOnNewAudioLane(asset.id);
      else {
        // FIX1 F2: icons and stickers land big and centred: their
        // longer side is 30 % of the canvas's shorter side.
        const symbol = item.kind === 'icon' || item.kind === 'sticker';
        const { width, height } = session.source.composition;
        placeAsset(asset, {
          time: place.time ?? session.currentTime,
          point: place.point ?? (symbol ? [width / 2, height / 2] : null),
          ...(symbol ? { size: 0.3 * Math.min(width, height) } : {}),
        });
      }
    },
    openKeys: () => openSettings('keys'),
    report: reportError,
  };
  const libraryBrowsers = mountLibraryPanels(
    {
      Templates: element('#library-templates'),
      Elements: element('#library-elements'),
      Text: element('#library-text'),
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
      addTextBox: () => {
        libraryActions.insertTextBox();
        editText(session.selectedId, { selectAll: true });
      },
      prefetchItem: (item) => {
        if (fontsPrefetched.has(item.id)) return;
        fontsPrefetched.add(item.id);
        try {
          const elements =
            item.type === 'template' || item.type === 'text'
              ? (item.data.elements as readonly { kind: string }[]).filter(
                  (element) => element.kind === 'text',
                )
              : [];
          // Text items hold at most four elements: probe in fours.
          for (let start = 0; start < elements.length; start += 4) {
            const built = libraryActions.commandsFor({
              ...item,
              type: 'text',
              data: { elements: elements.slice(start, start + 4) },
            } as unknown as LibraryItem);
            if (built)
              disposeFonts.prefetch(
                engine.preview(built.commands).compositions as never,
              );
          }
        } catch {
          // A preview that cannot be built only skips the prefetch.
        }
      },
      // Phase 1 library (P1-25): catalog videos and pictures.
      media: {
        entries: () =>
          catalog
            .entries('elements')
            .filter(
              (entry) => entry.kind === 'video' || entry.kind === 'image',
            ),
        place: (entry) =>
          safely(() => {
            const id = ensureCatalogAsset(entry);
            const asset = session.source.assets.find((item) => item.id === id);
            if (!asset) return;
            const { width, height } = session.source.composition;
            placeAsset(asset, {
              time: session.currentTime,
              point: [width / 2, height / 2],
            });
          }),
        drag: (entry) => {
          try {
            return {
              kind: 'asset',
              id: ensureCatalogAsset(entry),
              name: entry.name[getLanguage()] || entry.name.en,
              media: entry.kind === 'video' ? 'video' : 'image',
              ...(entry.media?.duration !== undefined
                ? { duration: entry.media.duration }
                : {}),
              ...(entry.media?.width ? { width: entry.media.width } : {}),
              ...(entry.media?.height ? { height: entry.media.height } : {}),
            };
          } catch {
            return null;
          }
        },
        prefetch: (entry) =>
          void catalog.prefetch(entry).catch(() => undefined),
        thumb: async (entry) => {
          if (entry.media?.poster) {
            const blob = await catalog
              .file(entry.media.poster)
              .catch(() => null);
            return blob ? URL.createObjectURL(blob) : null;
          }
          return entry.thumbUrl ? catalog.url(entry.thumbUrl) : null;
        },
      },
      // FINAL3 T5: a saved text style, centred at the playhead.
      insertTextStyle: (style) =>
        safely(() => {
          const insert = myTextStyleCommands(
            session.source,
            style.layer,
            session.currentTime,
          );
          engine.commands.transaction(insert.label, insert.commands);
          session.select(insert.layerId ?? null);
        }),
      code: {
        insert: (template) =>
          void insertCodeTemplate(template, session.currentTime).catch(
            reportError,
          ),
        menu: codeTemplateMenu,
        hover: codeHover,
        importFile: () => codeTemplateInput.click(),
      },
      creator: { library: creatorLibrary, menu: creatorMenu },
      // FINAL2 U6: Elements › Tables inserts a table at the playhead.
      table: () =>
        openTablePicker((rows, columns) =>
          safely(() => {
            session.setPlaying(false);
            const insert = tableInsertCommands(
              rows,
              columns,
              session.source.composition,
              (item) => libraryActions.commandsFor(item, undefined)!,
            );
            engine.commands.transaction(
              t('textx.step.insert'),
              insert.commands,
            );
            if (insert.layerId) session.select(insert.layerId);
          }),
        ),
      // FINAL2 U2: a stock item is downloaded, imported into Media with its
      // licence and placed at the playhead (audio on a new audio lane).
      stock: stockDeps,
    },
  );
  void libraryBrowsers;
  // T-ALL P1: the first load opens Media (spec 7). The e2e fixture asks for
  // Scene so earlier tests keep their start (D-183).
  let activeCategory =
    (window as { __AIVE_E2E_START__?: string }).__AIVE_E2E_START__ ?? 'Media';
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
    // FINAL2 U10: library panels get room for two 165 px card columns.
    workspace?.setLibrary(
      ['Media', 'AI', 'MyTemplates', 'Templates', 'Elements', 'Text'].includes(
        category,
      ),
    );
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
    // S1 Part 1: the shared header names the category.
    const leftTitle = root.querySelector('#left-panel-title');
    if (leftTitle) leftTitle.textContent = t(categoryKey(category));
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
      // V7 (spec 11.4): leaving Record & create while recording asks first.
      if (activeCategory === 'Record' && category !== 'Record') leaveRecord?.();
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
  // T4: the scene strip is hidden by default; the button left of Scenes
  // shows it (240 ms slide) and the choice is kept in this browser. The
  // strip stays mounted while hidden (inert).
  const stripHost = element('#scene-strip');
  const stripButton = element<HTMLButtonElement>('#scene-strip-show');
  const STRIP_KEY = 'aive.sceneStrip.shown';
  const showStrip = (shown: boolean, remember: boolean) => {
    stripHost.classList.toggle('strip-hidden', !shown);
    stripHost.inert = !shown;
    stripButton.setAttribute('aria-pressed', String(shown));
    const label = t(shown ? 'scene.stripHide' : 'scene.stripShow');
    stripButton.setAttribute('aria-label', label);
    stripButton.title = label;
    if (remember)
      try {
        localStorage.setItem(STRIP_KEY, shown ? '1' : '0');
      } catch {
        // A view setting only.
      }
  };
  let stripShown = false;
  try {
    stripShown = localStorage.getItem(STRIP_KEY) === '1';
  } catch {
    // A view setting only.
  }
  // The first state applies at once: a slide on load would move the canvas
  // after it has been laid out.
  stripHost.style.transition = 'none';
  showStrip(stripShown, false);
  void stripHost.offsetHeight;
  stripHost.style.transition = '';
  stripButton.onclick = () => {
    stripShown = !stripShown;
    showStrip(stripShown, true);
  };
  // The canvas refits as the strip slides.
  // (Only the strip's own slide: transitions inside it bubble here too, and
  // a refit at a random moment would cut short a gesture on the canvas.)
  stripHost.addEventListener('transitionend', (event) => {
    if (event.target === stripHost && event.propertyName === 'block-size')
      resize();
  });
  // I3: the scene strip under the canvas.
  const sceneStrip = mountSceneStrip({
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
    saveSceneToMine: (sceneId) => void saveSceneToMine(sceneId),
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
    shapeItems: () =>
      libraryActions.items().filter((item) => item.type === 'shape'),
    insertItem: (item) => libraryActions.insert(item),
    insertTable: (rows, columns) =>
      safely(() => {
        session.setPlaying(false);
        const insert = tableInsertCommands(
          rows,
          columns,
          session.source.composition,
          (item) => libraryActions.commandsFor(item, undefined)!,
        );
        engine.commands.transaction(t('textx.step.insert'), insert.commands);
        if (insert.layerId) session.select(insert.layerId);
      }),
    pickTable: (pick) => openTablePicker(pick),
    insertTextBox: (at, width) => {
      libraryActions.insertTextBox(at, width);
      editText(session.selectedId, { selectAll: true });
    },
    setLeftOpen: (open) => workspace?.setOpen('left', open),
    leftOpen: () => workspace?.leftOpen ?? true,
    changed: () => {
      syncRails();
      safely(draw);
    },
  });
  // MED-001/MED-002: the Import button and OS file drops both import into Project Media.
  const importMedia = async (files: readonly File[]): Promise<string[]> => {
    if (!files.length) return [];
    activeCategory = 'Media';
    applyCategory(activeCategory);
    workspace?.setOpen('left', true);
    try {
      return await mediaPanel.importFiles(files);
    } catch (error) {
      reportError(error);
      return [];
    }
  };
  const mediaInput = element<HTMLInputElement>('#import-media-input');
  element<HTMLButtonElement>('#import-media').onclick = () =>
    mediaInput.click();
  // X2: the Import menu: media, or a code animation.
  const importMenuButton = element<HTMLButtonElement>('#import-menu');
  importMenuButton.onclick = () => {
    const menu = document.createElement('div');
    menu.className = 'import-menu';
    menu.setAttribute('role', 'menu');
    const entry = (
      id: string,
      label: string,
      icon: string,
      run: () => void,
    ) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = id;
      button.setAttribute('role', 'menuitem');
      button.innerHTML = `${iconSvg(icon, 16)}<span></span>`;
      button.querySelector('span')!.textContent = label;
      button.onclick = () => {
        popover.close();
        safely(run);
      };
      menu.append(button);
    };
    entry('import-media-item', t('code.importMedia'), 'media', () =>
      mediaInput.click(),
    );
    importMenuButton.setAttribute('aria-expanded', 'true');
    const popover = openPopover(importMenuButton, menu, {
      label: t('code.importMenu'),
      className: 'import-menu-popover',
      onClose: () => importMenuButton.setAttribute('aria-expanded', 'false'),
    });
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  };
  // J8: the empty timeline's hint rows add text, or open Media (with the file
  // picker) or Audio.
  let leaveRecord: (() => void) | undefined;
  const openCategory = (category: string) => {
    if (drawPalette?.open) drawPalette.close();
    // V7 (spec 11.4): leaving Record & create while recording asks first.
    if (activeCategory === 'Record' && category !== 'Record') leaveRecord?.();
    activeCategory = category;
    sidePanels.close();
    applyCategory(category);
    workspace?.setOpen('left', true);
    syncRails();
  };
  const timelineHint = (event: Event) =>
    safely(() => {
      const kind = (event as CustomEvent<string>).detail;
      if (kind === 'text') {
        libraryActions.insertTextBox();
        editText(session.selectedId, { selectAll: true });
      } else if (kind === 'video') {
        openCategory('Media');
        mediaInput.click();
      } else openCategory('Audio');
    });
  element('#timeline-foundation').addEventListener(
    'timeline-hint',
    timelineHint,
  );
  // J14: the timeline clip menu's entries run registered commands here.
  const timelineCommand = (event: Event) =>
    safely(() => {
      runCommand((event as CustomEvent<string>).detail, commandContext);
    });
  element('#timeline-foundation').addEventListener(
    'timeline-command',
    timelineCommand,
  );
  // R5: the timeline menu's Save to My Templates.
  element('#timeline-foundation').addEventListener(
    'timeline-save-mine',
    (event) => menuHooks.saveToMine((event as CustomEvent<MineKind>).detail),
  );
  // J13: Collapse leaves only the player bar under a large preview; Expand
  // brings the lanes back. UI state only (not saved, no history).
  let collapseTimer = 0;
  const collapseTimeline = (event?: Event) => {
    const shellElement = element('.editor-shell');
    // V2 (spec 2): a drag of the timeline's edge asks for a given state.
    const wanted = (event as CustomEvent<{ collapsed?: boolean }> | undefined)
      ?.detail?.collapsed;
    const collapsed =
      wanted ?? !shellElement.classList.contains('timeline-collapsed');
    if (collapsed === shellElement.classList.contains('timeline-collapsed'))
      return;
    // U4: Collapse and Expand animate the row (240 ms; about 0 with reduced
    // motion), but a height drag never does.
    shellElement.classList.add('timeline-animating');
    window.clearTimeout(collapseTimer);
    collapseTimer = window.setTimeout(
      () => shellElement.classList.remove('timeline-animating'),
      300,
    );
    shellElement.classList.toggle('timeline-collapsed', collapsed);
    const toggle = element<HTMLButtonElement>(
      '#timeline-foundation [data-action="collapse-timeline"]',
    );
    const label = t(collapsed ? 'player.expand' : 'player.collapse');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.innerHTML = iconSvg(collapsed ? 'chevronUp' : 'chevronDown', 15);
  };
  element('#timeline-foundation').addEventListener(
    'timeline-collapse',
    collapseTimeline,
  );
  // V5 (spec 6): a cut's marker (or its "+", which adds one first) selects
  // the incoming clip and opens the right Transition panel.
  const openTransition = (event: Event) =>
    safely(() => {
      const clipId = (event as CustomEvent<string>).detail;
      const found = findClip(session.source.composition, clipId);
      if (!found) return;
      transitionFocus.clipId = clipId;
      session.select(found.clip.layerId);
      transitionFocus.clipId = clipId;
      workspace?.setEmpty(false);
      syncRightRail();
      setRightSection('Transitions');
      workspace?.setOpen('right', true);
      timeline?.render?.();
    });
  element('#timeline-foundation').addEventListener(
    'timeline-transition',
    openTransition,
  );
  const unsubscribeTransition = () => undefined;
  mediaInput.onchange = () => {
    const files = [...(mediaInput.files ?? [])];
    mediaInput.value = '';
    void importMedia(files);
  };

  // Right panel: shared "section" state driven by both the tab row and the icon rail.
  const rightEmpty = element('#right-panel-empty');

  const setRightSection = (name: string) => {
    activeSection = name;
    animateShown = name === 'Animate';
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
    // U5: with nothing selected there is no right panel content (the canvas
    // bar holds the canvas's ratio, background and frame rate).
    if (
      !shown.length ||
      (kindOf(session) === 'none' &&
        !focusedScene(session) &&
        !ttsState.open &&
        !themeState.open &&
        !cameraUi.open &&
        !projectAudioState.open)
    ) {
      animateShown = false;
      element('#inspector-content').hidden = true;
      element('#animation-panel').hidden = true;
      element('#right-section').hidden = true;
      rightEmpty.hidden = false;
      element('#right-panel-empty-title').textContent = t('right.emptyTitle');
      element('#right-panel-empty-description').textContent =
        t('right.emptyHint');
      rightEmpty.querySelector<HTMLElement>('.quiet-tag')!.hidden = true;
      element('#right-panel-title').textContent = t('right.emptyTitle');
      element('#right-panel-count').hidden = true;
      // V7 (spec 10.1): the rail stays, holding only Auto Caption, disabled
      // (planned) until captions exist.
      for (const el of root.querySelectorAll<HTMLElement>(
        '.icon-rail-right button',
      )) {
        const caption = el.dataset.section === 'Captions';
        // T1: Theme is the one tab that works with nothing selected.
        // FIX1 F5: so is Audio: Project audio (the Mixer).
        const theme =
          el.dataset.section === 'Theme' || el.dataset.section === 'Audio';
        el.hidden = !caption && !theme;
        if (el.dataset.section === 'Audio') {
          el.title = t('mixer.projectAudio');
          el.setAttribute('aria-label', el.title);
          el.querySelector('.icon-rail-label')!.textContent = el.title;
        }
        if (theme) {
          el.removeAttribute('aria-disabled');
          el.setAttribute('aria-pressed', 'false');
        }
        if (!caption) continue;
        // FINAL2 U9: Auto Caption opens the Auto captions dialog.
        const label = t('panel.captions');
        el.title = label;
        el.setAttribute('aria-label', el.title);
        el.removeAttribute('aria-disabled');
        el.setAttribute('aria-pressed', 'false');
        el.querySelector('.icon-rail-label')!.textContent = label;
      }
      renderedRight = '';
      return;
    }
    if (!rightEmpty.hidden)
      setRightSection(
        shown.includes(activeSection as RightSection)
          ? activeSection
          : shown[0]!,
      );
    // J15: the rail lists the shown sections in the selection's order (the
    // keyboard order matches what is seen).
    const nav = element('#rail-right');
    const ordered = [
      ...nav.querySelectorAll<HTMLElement>('button[data-section]'),
    ]
      .map((el) => ({
        el,
        at: shown.indexOf(el.dataset.section as RightSection),
      }))
      .sort((a, b) => (a.at < 0 ? 99 : a.at) - (b.at < 0 ? 99 : b.at));
    if (ordered.some(({ el }, index) => nav.children[index] !== el))
      nav.prepend(...ordered.map(({ el }) => el));
    // J15: the header names the selection and counts it; the rail follows
    // the selection's order.
    const kind = kindOf(session);
    element('#right-panel-title').textContent = t(
      kind === 'none'
        ? ttsState.open
          ? 'tts.title'
          : themeState.open
            ? 'panel.theme'
            : cameraUi.open
              ? 'cam.title'
              : projectAudioState.open
                ? 'mixer.projectAudio'
                : 'transition.title'
        : kind === 'video' || kind === 'image'
          ? `right.tab.${kind}`
          : firstTabKey(kind),
    );
    const count = element('#right-panel-count');
    count.hidden = session.selectedIds.length === 0;
    count.textContent = String(session.selectedIds.length);
    count.title = t('right.count', {
      count: String(session.selectedIds.length),
    });
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
          : section === 'Audio' && kindOf(session) === 'none'
            ? t('mixer.projectAudio')
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
      // (V7: an audio clip's rail starts with Audio, not Properties.)
      setRightSection(shown.includes('Properties') ? 'Properties' : shown[0]!);
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
  // V7 (spec 10.5): a scene card's "+" or transition marker opens the right
  // Transition panel for it; a press on the stage or a selection leaves it.
  const openSceneTransition = (event: Event) =>
    safely(() => {
      transitionFocus.sceneId = (event as CustomEvent<string>).detail;
      transitionFocus.clipId = null;
      session.select(null);
      root.querySelector('.editor-shell')?.classList.remove('right-empty');
      workspace?.setEmpty(false);
      renderedRight = '';
      syncRightRail();
      setRightSection('Transitions');
      workspace?.setOpen('right', true);
      sceneStrip.render();
      sceneBoard.render?.();
    });
  document.addEventListener(SCENE_TRANSITION_EVENT, openSceneTransition);
  // V7 (spec 11.5): Create > Text to speech opens the right panel (the one
  // left action that does).
  const openTextToSpeech = () =>
    safely(() => {
      newTts();
      transitionFocus.sceneId = null;
      transitionFocus.clipId = null;
      session.select(null);
      root.querySelector('.editor-shell')?.classList.remove('right-empty');
      renderedRight = '';
      syncRightRail();
      setRightSection('Speech');
      workspace?.setOpen('right', true);
    });
  stage.addEventListener(
    'pointerdown',
    () => {
      if (themeState.open && !session.selectedIds.length) {
        themeState.open = false;
        root.querySelector('.editor-shell')?.classList.add('right-empty');
        renderedRight = '';
        syncRightRail();
        if (workspace?.rightOpen) workspace.setOpen('right', false);
      }
      if (projectAudioState.open && !session.selectedIds.length) {
        projectAudioState.open = false;
        root.querySelector('.editor-shell')?.classList.add('right-empty');
        renderedRight = '';
        syncRightRail();
        if (workspace?.rightOpen) workspace.setOpen('right', false);
      }
      if (ttsState.open && !session.selectedIds.length) {
        ttsState.open = false;
        root.querySelector('.editor-shell')?.classList.add('right-empty');
        renderedRight = '';
        syncRightRail();
        if (workspace?.rightOpen) workspace.setOpen('right', false);
      }
      if (!transitionFocus.sceneId) return;
      transitionFocus.sceneId = null;
      if (!session.selectedIds.length)
        root.querySelector('.editor-shell')?.classList.add('right-empty');
      renderedRight = '';
      syncRightRail();
      if (workspace?.rightOpen && !session.selectedIds.length)
        workspace.setOpen('right', false);
      sceneStrip.render();
      sceneBoard.render?.();
    },
    true,
  );
  element<HTMLButtonElement>('#right-panel-collapse').onclick = () =>
    workspace?.setOpen('right', false);
  for (const el of root.querySelectorAll<HTMLElement>(
    '.icon-rail-right button',
  ))
    el.onclick = () => {
      const name = el.dataset.section!;
      if (el.getAttribute('aria-disabled') === 'true') return;
      // FINAL2 U9: Auto Caption is a dialog, not a panel section.
      if (name === 'Captions') {
        safely(() => {
          openAutoCaptions(
            captionsContext,
            selectedSoundClip(session) ?? undefined,
          );
        });
        return;
      }
      // FIX1 F5: Project audio with nothing selected.
      if (
        name === 'Audio' &&
        !session.selectedIds.length &&
        !projectAudioState.open
      ) {
        projectAudioState.open = true;
        themeState.open = false;
        transitionFocus.sceneId = null;
        root.querySelector('.editor-shell')?.classList.remove('right-empty');
        workspace?.setEmpty(false);
        renderedRight = '';
        syncRightRail();
        setRightSection('Audio');
        workspace?.setOpen('right', true);
        return;
      }
      // T1: the Theme tab with nothing selected.
      if (name === 'Theme' && !session.selectedIds.length && !themeState.open) {
        themeState.open = true;
        projectAudioState.open = false;
        transitionFocus.sceneId = null;
        root.querySelector('.editor-shell')?.classList.remove('right-empty');
        renderedRight = '';
        syncRightRail();
        setRightSection('Theme');
        workspace?.setOpen('right', true);
        return;
      }
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

  // Drop overlay: shown while an OS file is dragged over the window. In-app
  // drags never use the browser's drag and drop (T1 drag controller); a
  // Project Media card or library card drag that a test or browser still
  // sends as HTML5 data is a reference, never a file (MED-015 regression).
  const dropOverlay = element('#drop-overlay');
  const CODE_FILE = /\.(json|js|mjs|html?|glb)$/i;
  let dragDepth = 0;
  const isFileDrag = (event: DragEvent) =>
    !!event.dataTransfer?.types.includes('Files') &&
    !event.dataTransfer.types.includes('application/x-editor-asset') &&
    !event.dataTransfer.types.includes(LIBRARY_DRAG_TYPE);
  // T1: the overlay is drawn over the page but never takes the pointer, so
  // the element under it still receives the drop (a canvas or timeline drop
  // also places the files). Its counter counts file drags only and is reset
  // by every way a file drag can end, so it can never stay up.
  const hideOverlay = () => {
    dragDepth = 0;
    dropOverlay.hidden = true;
  };
  window.addEventListener('dragenter', (event) => {
    if (!isFileDrag(event)) return;
    dragDepth++;
    dropOverlay.hidden = false;
  });
  window.addEventListener('dragleave', (event) => {
    if (!isFileDrag(event)) return;
    // Leaving the window has no related element.
    if (!event.relatedTarget) return hideOverlay();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay.hidden = true;
  });
  window.addEventListener('dragover', (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragend', hideOverlay);
  const windowDrop = (event: DragEvent) => {
    // Any drop ends the overlay, whatever handles it.
    hideOverlay();
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const dropped = [...(event.dataTransfer?.files ?? [])];
    // X2: code files open the import dialog; media files import as before.
    // P2: a creator pack (.creatorpack.txt or .json, or JSON that says it is
    // one) opens the Creator Pack import.
    const isText = (file: File) =>
      CODE_FILE.test(file.name) || /\.txt$/i.test(file.name);
    const code = dropped.filter(isText);
    const files = dropped.filter((file) => !isText(file));
    if (code[0])
      void importFileText(code[0])
        .then((text) =>
          isCreatorPackText(code[0]!.name, text)
            ? openCreatorImport({ text, fileName: code[0]!.name })
            : // X4: an exported code template file imports into the AI tab.
              isCodeTemplateFile(text)
              ? importCodeTemplateText(text)
              : /\.txt$/i.test(code[0]!.name)
                ? showToast(t('creator.notAPack'), 'error')
                : openCreatorImport({ text, fileName: code[0]!.name }),
        )
        .catch(reportError);
    if (!files.length) return;
    const over = event.target instanceof Element ? event.target : null;
    const onCanvas = over === canvas;
    const onTimeline = !!over?.closest('#timeline-foundation .timeline-scroll');
    const point = onCanvas ? canvasPoint(event.clientX, event.clientY) : null;
    const time = onTimeline ? timelineTimeAt(event.clientX) : undefined;
    const imported = importMedia(files);
    if (!onCanvas && !onTimeline) return;
    // Dropped on the canvas or the timeline: also placed there.
    void imported.then((ids) =>
      safely(() => {
        for (const id of ids)
          addPayload(
            { kind: 'asset', id, name: id },
            {
              ...(point ? { point } : {}),
              ...(time !== undefined ? { time } : {}),
            },
          );
      }),
    );
  };
  window.addEventListener('drop', windowDrop, true);

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
  element('#left-panel-title').textContent = t(categoryKey(activeCategory));
  sceneOutliner = mountSceneOutliner(
    element('#scene-list'),
    element('#scene-heading'),
    engine,
    session,
    reportError,
  );
  element('#scene-list').addEventListener('outliner-reveal', (event) =>
    session.select((event as CustomEvent<string>).detail),
  );
  workspace.onChange(syncRails);
  syncRails();
  // T-ALL P1 (spec 7): the right panel (a drawer below 1440 px) shows only while
  // something is selected; it opens on a selection and closes on deselect.
  // On the wide layout its column stays, so the canvas never moves; the
  // panel is simply not drawn while nothing is selected (D-183).
  let rightSelection: string | null = null;
  // V1 (spec 1.3): a selection made by a press waits for the release before
  // the right side moves the stage, so the press's gesture is not cancelled.
  let pressing = false;
  window.addEventListener(
    'pointerdown',
    () => {
      pressing = true;
    },
    true,
  );
  window.addEventListener(
    'pointerup',
    () => {
      pressing = false;
      requestAnimationFrame(followSelection);
    },
    true,
  );
  window.addEventListener('pointercancel', () => (pressing = false), true);
  const followSelection = () => {
    if (disposed) return;
    const key = session.selectedIds.join(',');
    const shell = root.querySelector<HTMLElement>('.editor-shell');
    if (!shell) return;
    // (A scene transition's panel shows with nothing selected; V7.)
    shell.classList.toggle(
      'right-empty',
      key === '' &&
        !transitionFocus.sceneId &&
        !ttsState.open &&
        !themeState.open &&
        !cameraUi.open &&
        !projectAudioState.open,
    );
    // (A press waits for its release, so its gesture is never cancelled.)
    if (pressing) return;
    workspace?.setEmpty(key === '' && !cameraUi.open);
    if (key === rightSelection) return;
    rightSelection = key;
    // V7 (spec 10.1): a selection only changes the rail's categories; it
    // never opens the panel. Deselecting closes an open panel, since its
    // category is gone (the rail stays).
    // (Checked a frame later: an edit such as Ungroup clears the selection
    // for a moment before selecting its result, which must not close it.)
    if (key === '')
      requestAnimationFrame(() => {
        if (
          !disposed &&
          !session.selectedIds.length &&
          !transitionFocus.sceneId &&
          !ttsState.open &&
          !themeState.open &&
          !cameraUi.open &&
          workspace?.rightOpen
        )
          workspace.setOpen('right', false);
      });
    // A phone has no right rail (D-120), so there a selection still opens
    // the bottom sheet; otherwise nothing could reach it (D-217).
    else if (
      key !== '' &&
      workspace?.layout === 'phone' &&
      !workspace.rightOpen
    )
      workspace.setOpen('right', true);
  };
  session.onChange(followSelection);
  followSelection();
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
  /** Adds an asset as a layer with a clip (see `assetCommands`). */
  const placeAsset = (
    asset: (typeof session.source.assets)[number],
    place: Parameters<typeof assetCommands>[1],
  ) => {
    const built = assetCommands(asset, place);
    engine.commands.transaction(built.label, built.commands);
    session.select(built.layerId);
  };
  /**
   * V7 (spec 11.3 to 11.5): an audio asset at the playhead on a new audio
   * lane, one step; a recording or speech names the lane, layer and clip,
   * and speech keeps its settings on the clip.
   */
  const addOnNewAudioLane = (
    assetId: string,
    named: { name?: string; tts?: TtsSettings } = {},
  ) => {
    const asset = session.source.assets.find((item) => item.id === assetId);
    if (!asset) throw new Error(t('media.missing'));
    const composition = session.source.composition;
    const trackId = crypto.randomUUID();
    const built = assetCommands(
      named.name ? { ...asset, name: named.name } : asset,
      {
        time: session.currentTime,
        trackId,
        newTrack: [
          {
            type: 'CREATE_TRACK',
            compositionId: composition.id,
            track: {
              id: trackId,
              name: named.name ?? nextTrackName(composition, 'audio'),
              type: 'audio',
              order: composition.tracks.length,
              enabled: true,
              locked: false,
              muted: false,
              clips: [],
            },
          },
          {
            type: 'MOVE_TRACK',
            compositionId: composition.id,
            trackId,
            index: laneInsertIndex(composition.tracks, 'audio', 'bottom'),
          },
        ],
      },
    );
    let clipId = '';
    for (const command of built.commands)
      if (command.type === 'CREATE_CLIP') {
        clipId = command.clip.id;
        if (named.tts)
          (command.clip.metadata as Record<string, unknown>).tts = {
            ...named.tts,
          };
      }
    engine.commands.transaction(
      named.tts ? 'Add text to speech' : built.label,
      built.commands,
    );
    session.select(built.layerId);
    return clipId;
  };
  /** Imports a file made here (a recording, speech); its asset id. */
  const importMade = async (file: File) => {
    const [id] = await mediaPanel.importFiles([file]);
    if (!id) throw new Error(t('record.importFailed'));
    return id;
  };
  // V7 (spec 11.4): Record & create.
  const recordPanel = mountRecordPanel(element('#library-record'), {
    addRecording: async (file) => {
      const assetId = await importMade(file);
      const taken = new Set(
        session.source.composition.tracks.map((track) => track.name),
      );
      let n = 1;
      while (taken.has(t('record.name', { n: String(n) }))) n++;
      addOnNewAudioLane(assetId, { name: t('record.name', { n: String(n) }) });
    },
    openTextToSpeech: () => openTextToSpeech(),
    report: reportError,
    // FINAL2 U4 and U3 (record-panel-hooks.ts).
    ...recordPanelHooks({
      importMade,
      engine,
      session,
      assetCommands: (asset, place) => assetCommands(asset, place),
      addOnNewAudioLane,
    }),
  });
  leaveRecord = () => recordPanel.leave();
  // V7 (spec 11.3): the left Audio category, the built-in sound pack. A
  // sound goes in at the playhead on a new audio lane, one step.
  // FINAL2 U5: the Mixer sits above the sound pack in the same category.
  // FIX1 F5: the left Audio category holds libraries only (Sound effects,
  // Music from stock, My audio from Media); the Mixer is the right panel's
  // Project audio with nothing selected.
  const audioCategory = element('#library-audio');
  const mixerHost = projectAudioHost;
  const soundPackHost = document.createElement('div');
  const musicHost = document.createElement('div');
  const mineHost = document.createElement('div');
  mineHost.className = 'audio-mine';
  const audioTabs = document.createElement('div');
  audioTabs.className = 'shelf-tabs audio-library-tabs';
  audioTabs.setAttribute('role', 'tablist');
  audioTabs.setAttribute('aria-label', t('library.audio'));
  const audioPages = {
    sounds: soundPackHost,
    music: musicHost,
    mine: mineHost,
  };
  let audioPage: keyof typeof audioPages = 'sounds';
  let musicMounted = false;
  const renderMine = () => {
    const assets = (
      engine.state.assets as unknown as readonly {
        id: string;
        type: string;
        name: string;
        duration?: number;
        source: { kind: string };
        metadata: { removed?: unknown };
      }[]
    ).filter(
      (asset) =>
        asset.type === 'audio' &&
        asset.source.kind !== 'generated' &&
        asset.metadata.removed !== true,
    );
    const rows = assets.map((asset) => {
      const row = document.createElement('div');
      row.className = 'sound-tile audio-mine-item';
      row.dataset.assetId = asset.id;
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'sound-tile-add';
      add.dataset.action = 'audio-mine-add';
      add.title = t('shelf.addToSceneShort');
      add.innerHTML = `${iconSvg('audio', 16)}<span class="sound-tile-name"></span><span class="sound-tile-length"></span>`;
      add.querySelector('.sound-tile-name')!.textContent = asset.name;
      add.querySelector('.sound-tile-length')!.textContent = asset.duration
        ? `${formatNumber(asset.duration, { maximumFractionDigits: 1 })} s`
        : '';
      add.onclick = () => safely(() => void addOnNewAudioLane(asset.id));
      row.append(add);
      return row;
    });
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'sound-pack-empty';
      empty.textContent = t('audioLibrary.mineEmpty');
      mineHost.replaceChildren(empty);
    } else mineHost.replaceChildren(...rows);
  };
  const showAudioPage = (page: keyof typeof audioPages) => {
    audioPage = page;
    for (const [name, host] of Object.entries(audioPages))
      host.hidden = name !== page;
    for (const tab of audioTabs.querySelectorAll('[role="tab"]'))
      tab.setAttribute(
        'aria-selected',
        String((tab as HTMLElement).dataset.audioTab === page),
      );
    if (page === 'music' && !musicMounted) {
      musicMounted = true;
      mountStock(musicHost, 'audio', stockDeps);
    }
    if (page === 'mine') renderMine();
  };
  for (const page of Object.keys(audioPages) as (keyof typeof audioPages)[]) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'shelf-tab';
    tab.setAttribute('role', 'tab');
    tab.dataset.audioTab = page;
    tab.textContent = t(`audioLibrary.${page}`);
    tab.onclick = () => showAudioPage(page);
    audioTabs.append(tab);
  }
  engine.on('state:changed', () => {
    if (audioPage === 'mine' && !mineHost.hidden) renderMine();
  });
  audioCategory.replaceChildren(audioTabs, soundPackHost, musicHost, mineHost);
  showAudioPage('sounds');
  // The clip Audio tab offers Retry and shows processing errors (denoise).
  configureAudioTab({
    processingError: () => audio.debug.processingError ?? null,
    retry: () => audio.retryProcessing(),
  });
  const audioMixer = mountAudioMixer(mixerHost, {
    engine,
    session,
    meters: audio.meters,
    report: reportError,
  });
  const previewUrls = new Map<string, string>();
  const soundPack = mountSoundPack(soundPackHost, {
    entries: () =>
      catalog.entries('audio').filter((entry) => entry.kind === 'sound'),
    onChange: (listener) => catalog.onChange(listener),
    prefetch: (entry) => void catalog.prefetch(entry).catch(() => undefined),
    ensure: (entry) => ensureCatalogAsset(entry),
    add: (assetId) => safely(() => void addOnNewAudioLane(assetId)),
    previewUrl: async (entry) => {
      const ref = entry.media?.proxy ?? entry.media?.full;
      if (!ref) return null;
      const known = previewUrls.get(ref.sha256);
      if (known) return known;
      const blob = await catalog
        .file(ref, catalogMediaKey(ref.sha256))
        .catch(() => null);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      previewUrls.set(ref.sha256, url);
      return url;
    },
    report: reportError,
  });
  /** The commands adding an asset as a layer with a clip, at a composition
   *  point or the centre (canvas), or on a timeline track (the insert rule). */
  const assetCommands = (
    asset: (typeof session.source.assets)[number],
    place: {
      time: number;
      point?: readonly [number, number] | null;
      trackId?: string | undefined;
      /** J9: commands making the lane `trackId` names (a new lane). */
      newTrack?: Command[];
      /** FIX1 F2: the longer side's size in composition pixels. */
      size?: number;
    },
  ) => {
    const id = asset.id;
    let time = place.time;
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
          const fit = place.size
            ? place.size / Math.max(asset.width, asset.height)
            : Math.min(1, w / asset.width, h / asset.height);
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
    const requestedTrack = place.newTrack
      ? undefined
      : requestedTrackId
        ? session.source.composition.tracks.find(
            (item) => item.id === requestedTrackId,
          )
        : undefined;
    void type;
    // J7: a lane takes media of its own group only.
    if (
      requestedTrack &&
      (!laneAccepts(requestedTrack.type, layer) || requestedTrack.locked)
    )
      throw new Error(
        requestedTrack.locked
          ? t('asset.locked', { name: requestedTrack.name })
          : t('asset.incompatible', {
              name: asset.name,
              track: requestedTrack.name,
            }),
      );
    const target = place.newTrack
      ? { trackId: requestedTrackId!, commands: place.newTrack }
      : requestedTrack
        ? { trackId: requestedTrack.id, commands: [] as Command[] }
        : trackForNewClip(
            session.source.composition,
            layer.type,
            time,
            time + duration,
          );
    commands.unshift(...target.commands);
    // J7: audio goes to the single audio lane, at the nearest free time.
    if ('startTime' in target && target.startTime !== time) {
      time = target.startTime;
      layer.startTime = time;
    }
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
    return {
      label:
        place.trackId === undefined ? 'Add asset layer' : 'Add timeline clip',
      commands,
      layerId: layer.id,
    };
  };
  const assetDrop = (event: DragEvent) =>
    safely(() => {
      const id = event.dataTransfer?.getData('application/x-editor-asset');
      if (!id) return;
      const asset = session.source.assets.find((item) => item.id === id);
      if (!asset || !['image', 'video', 'audio'].includes(asset.type)) return;
      event.preventDefault();
      // J9: the timeline knows where the drop lands (a lane, a new lane, a
      // clip to replace) or that it is refused.
      if (event.currentTarget !== canvas && timeline) {
        const target = timeline.assetTarget();
        timeline.clearAssetTarget();
        if (target)
          return laneDrop(
            { kind: 'asset', id: asset.id, name: asset.name },
            target,
          );
      }
      const track = element('.timeline-scroll');
      const time =
        event.currentTarget === canvas
          ? session.currentTime
          : Math.max(
              0,
              pixelToTime(
                // V7: lanes start TIMELINE_PAD inside the scroll area.
                event.clientX -
                  track.getBoundingClientRect().left +
                  track.scrollLeft -
                  TIMELINE_PAD,
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
  /** T3: the commands that add what a drag carries, with its clip at
   *  `time` (a lane chosen by the insert rules, retargeted by the caller);
   *  null for a template or My Template (a whole scene). */
  const insertCommands = (
    payload: DragPayload,
    time: number,
  ): { label: string; commands: Command[]; layerId: string } | null => {
    if (payload.kind === 'asset') {
      const asset = session.source.assets.find(
        (item) => item.id === payload.id,
      );
      return asset ? assetCommands(asset, { time }) : null;
    }
    if (payload.kind === 'preset') {
      const commands = addShapeCommands(
        session.source,
        payload.id as ShapePreset,
        time,
      );
      const created = commands.find((item) => item.type === 'CREATE_LAYER');
      return created?.type === 'CREATE_LAYER'
        ? { label: 'Add shape', commands, layerId: created.layer.id }
        : null;
    }
    if (
      payload.kind === 'mine' ||
      payload.kind === 'code' ||
      payload.kind === 'stock'
    )
      return null;
    // S1 Part 3: AI and My Templates items (one layer) take a lane like any
    // library item; the rest are added whole by addPayload.
    if (payload.kind === 'creator') return creatorBuilt(payload.id, time);
    if (payload.kind === 'saved') {
      const built = mineBuilt(payload.id, time);
      return built?.layerIds.length === 1
        ? {
            label: t('mine.addStep'),
            commands: built.commands,
            layerId: built.layerIds[0]!,
          }
        : null;
    }
    const item =
      payload.kind === 'textbox'
        ? ('textbox' as const)
        : libraryActions.find(payload.id);
    const insert = item
      ? libraryActions.commandsFor(item, undefined, time)
      : null;
    return insert?.layerId
      ? {
          label: insert.label,
          commands: insert.commands,
          layerId: insert.layerId,
        }
      : null;
  };
  /** T3: what a drag carries, as the timeline sees it (lane group, clip
   *  length, name, kind); measured once per drag. */
  let laneInfoCache: { key: string; value: LaneDropInfo | null } | null = null;
  const laneInfo = (payload: DragPayload): LaneDropInfo | null => {
    const key = `${payload.kind}:${payload.id}`;
    if (laneInfoCache?.key === key) return laneInfoCache.value;
    let value: LaneDropInfo | null = null;
    try {
      const built = insertCommands(payload, 0);
      const layer = built?.commands.find(
        (item) =>
          item.type === 'CREATE_LAYER' && item.layer.id === built.layerId,
      );
      const clip = built?.commands.find(
        (item) =>
          item.type === 'CREATE_CLIP' && item.clip.layerId === built.layerId,
      );
      if (layer?.type === 'CREATE_LAYER' && clip?.type === 'CREATE_CLIP')
        value = {
          group: laneGroupOfLayer(layer.layer) as LaneGroup,
          duration: clip.clip.duration,
          name: payload.name,
          kind: layer.layer.type,
        };
    } catch {
      value = null;
    }
    laneInfoCache = { key, value };
    return value;
  };
  /** T3: drops what a drag carries on a lane target, as one undo step: its
   *  clip on the target lane (or a new lane) at the target's start, later
   *  clips pushed, a replaced clip removed. */
  const laneDrop = (payload: DragPayload, target: AssetTarget) => {
    const composition = session.source.composition;
    if (target.mode === 'refused') {
      const lane = composition.tracks.find(
        (item) => item.id === target.trackId,
      );
      throw new Error(
        lane?.locked
          ? t('asset.locked', { name: lane.name })
          : t('asset.incompatible', {
              name: payload.name,
              track: lane?.name ?? '',
            }),
      );
    }
    const built = insertCommands(payload, target.time);
    if (!built) return addPayload(payload, { time: target.time });
    const create = built.commands.find(
      (item) =>
        item.type === 'CREATE_CLIP' && item.clip.layerId === built.layerId,
    );
    if (create?.type !== 'CREATE_CLIP') return;
    const plan = laneDropPlan(composition, target, {
      duration: create.clip.duration,
    });
    // The builder's own lane choice is replaced by the target's.
    const autoTrack = create.trackId;
    const madeTrack = built.commands.some(
      (item) => item.type === 'CREATE_TRACK' && item.track.id === autoTrack,
    );
    const layerCommand = built.commands.find(
      (item) => item.type === 'CREATE_LAYER' && item.layer.id === built.layerId,
    );
    let trackId = plan.trackId;
    const before: Command[] = [];
    if (plan.removeLayerId)
      before.push({
        type: 'DELETE_LAYER',
        compositionId: composition.id,
        layerId: plan.removeLayerId,
      });
    if (
      !trackId &&
      target.mode === 'new-lane' &&
      layerCommand?.type === 'CREATE_LAYER'
    ) {
      const type = trackTypeForLayer(layerCommand.layer);
      trackId = crypto.randomUUID();
      before.push(
        {
          type: 'CREATE_TRACK',
          compositionId: composition.id,
          track: {
            id: trackId,
            name: nextTrackName(composition, type),
            type,
            order: composition.tracks.length,
            enabled: true,
            locked: false,
            muted: false,
            clips: [],
          },
        },
        {
          type: 'MOVE_TRACK',
          compositionId: composition.id,
          trackId,
          index: target.index,
        },
      );
    }
    if (!trackId) return;
    before.push(...plan.pushes);
    const commands = built.commands
      .filter(
        (item) =>
          !madeTrack ||
          !(
            (item.type === 'CREATE_TRACK' && item.track.id === autoTrack) ||
            (item.type === 'MOVE_TRACK' && item.trackId === autoTrack)
          ),
      )
      .map((item): Command => {
        if (item === create)
          return {
            ...create,
            trackId: trackId!,
            clip: { ...create.clip, startTime: plan.startTime },
          };
        if (item === layerCommand && item.type === 'CREATE_LAYER')
          return {
            ...item,
            layer: { ...item.layer, startTime: plan.startTime },
          };
        return item;
      });
    session.setPlaying(false);
    engine.commands.transaction(
      target.mode === 'replace'
        ? 'Replace clip'
        : payload.kind === 'asset'
          ? 'Add timeline clip'
          : built.label,
      [...before, ...commands],
    );
    session.select(built.layerId);
  };
  const assetOver = (event: DragEvent) => {
    if (
      event.dataTransfer?.types.includes('application/x-editor-asset') ||
      event.dataTransfer?.types.includes(LIBRARY_DRAG_TYPE)
    )
      event.preventDefault();
    showDropBox(event);
  };
  // J9: over the canvas (only there), a box shows where a picture would land:
  // centred on the pointer at its own size, scaled to fit the composition.
  const dropBox = document.createElement('div');
  dropBox.className = 'canvas-drop-box';
  dropBox.hidden = true;
  dropBox.setAttribute('aria-hidden', 'true');
  root.append(dropBox);
  const hideDropBox = () => {
    dropBox.hidden = true;
  };
  const showDropBox = (event: { clientX: number; clientY: number }) => {
    const drag = assetDrag();
    if (!drag || drag.type === 'audio') return hideDropBox();
    const { width: w, height: h } = session.source.composition;
    const fit =
      drag.width && drag.height
        ? Math.min(1, w / drag.width, h / drag.height)
        : 1;
    const bw = (drag.width ?? 320) * fit,
      bh = (drag.height ?? 180) * fit;
    const rect = canvas.getBoundingClientRect();
    const matrix = viewport().matrix;
    const inverse = invertMatrix(matrix);
    if (!inverse) return hideDropBox();
    const [cx, cy] = transformPoint(inverse, [
      event.clientX - rect.left,
      event.clientY - rect.top,
    ]);
    const a = transformPoint(matrix, [cx - bw / 2, cy - bh / 2]);
    const b = transformPoint(matrix, [cx + bw / 2, cy + bh / 2]);
    Object.assign(dropBox.style, {
      left: `${rect.left + Math.min(a[0], b[0])}px`,
      top: `${rect.top + Math.min(a[1], b[1])}px`,
      width: `${Math.abs(b[0] - a[0])}px`,
      height: `${Math.abs(b[1] - a[1])}px`,
    });
    dropBox.hidden = false;
  };
  const canvasDragLeave = (event: DragEvent) => {
    if (!(
      event.relatedTarget instanceof Node &&
      canvas.contains(event.relatedTarget)
    ))
      hideDropBox();
  };
  canvas.addEventListener('dragleave', canvasDragLeave);
  canvas.addEventListener('drop', hideDropBox);
  document.addEventListener('dragend', hideDropBox);
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
  // T1: the drag controller's two drop targets, the canvas and the timeline.
  setDragReporter(reportError);
  const canvasPoint = (x: number, y: number) => {
    const rect = canvas.getBoundingClientRect(),
      inverse = invertMatrix(viewport().matrix);
    return inverse
      ? (transformPoint(inverse, [x - rect.left, y - rect.top]) as [
          number,
          number,
        ])
      : null;
  };
  const timelineTimeAt = (x: number) => {
    const track = element('.timeline-scroll');
    return Math.max(
      0,
      pixelToTime(
        x -
          track.getBoundingClientRect().left +
          track.scrollLeft -
          TIMELINE_PAD,
        session.timelineZoom,
      ),
    );
  };
  /** Adds what a drag carries: on the canvas centred on `point`, or with its
   *  clip starting at `time` (a timeline drop). */
  const addPayload = (
    payload: DragPayload,
    place: { point?: [number, number] | null; time?: number },
  ) => {
    const time = place.time ?? session.currentTime;
    const point = place.point ?? undefined;
    if (payload.kind === 'asset') {
      const asset = session.source.assets.find(
        (item) => item.id === payload.id,
      );
      if (asset) placeAsset(asset, { time, point: point ?? null });
    } else if (payload.kind === 'library') {
      const item = libraryActions.find(payload.id);
      if (item) libraryActions.insert(item, point, time);
    } else if (payload.kind === 'textbox')
      libraryActions.insertTextBox(point, undefined, time);
    else if (payload.kind === 'mine') {
      const template = myTemplates.find(payload.id);
      if (template) libraryActions.insertMine(template);
    } else if (payload.kind === 'creator') {
      // A preset dropped on the canvas animates the element under the drop
      // point (else the selection), like a click on the card.
      if (creatorEntryOf(payload.id)?.item.type === 'preset') {
        const hit = point ? hitTest(session.source, point) : null;
        if (hit) session.select(hit);
        applyCreatorPreset(payload.id);
      } else insertCreatorItem(payload.id, time, point ?? null);
    } else if (payload.kind === 'saved')
      insertMine(payload.id, time, point ?? null);
    else if (payload.kind === 'stock')
      dropStock(payload.id, { time, point: point ?? null });
    else if (payload.kind === 'code') {
      const template = creatorLibrary
        .motionTemplates()
        .find((item) => item.id === payload.id);
      if (template) void insertCodeTemplate(template, time).catch(reportError);
    } else if (payload.kind === 'preset') {
      const commands = addShapeCommands(
        session.source,
        payload.id as ShapePreset,
        time,
      );
      const created = commands.find((item) => item.type === 'CREATE_LAYER');
      if (created?.type === 'CREATE_LAYER' && point) {
        const size = (key: 'width' | 'height') => {
          const value = created.layer.properties[key];
          return value?.type === 'number' ? value.value : 0;
        };
        created.layer.transform.position = vector2(
          point[0] - size('width') / 2,
          point[1] - size('height') / 2,
        );
      }
      engine.commands.transaction('Add shape', commands);
      if (created?.type === 'CREATE_LAYER') session.select(created.layer.id);
    }
  };
  // T2: while a library or Media item is dragged over the canvas, an outline
  // of its real size and shape follows the pointer (snapping to the canvas
  // centre and edges) and the canvas is highlighted; the drop lands exactly
  // where the outline was, as one undo step.
  interface Footprint {
    readonly width: number;
    readonly height: number;
    /** From the drop point to the box centre (composition units). */
    readonly dx: number;
    readonly dy: number;
    /** A whole scene (a template): the outline is the artboard. */
    readonly whole?: boolean;
  }
  let measured: { key: string; value: Footprint | null } | null = null;
  const measure = (payload: DragPayload): Footprint | null => {
    const key = `${payload.kind}:${payload.id}:${session.source.composition.id}`;
    if (measured?.key === key) return measured.value;
    const { width: w, height: h } = session.source.composition;
    const at: [number, number] = [w / 2, h / 2];
    let value: Footprint | null = null;
    try {
      if (payload.kind === 'asset' || payload.kind === 'stock') {
        if (payload.media !== 'audio') {
          const aw = payload.width ?? 0,
            ah = payload.height ?? 0;
          const fit = aw && ah ? Math.min(1, w / aw, h / ah) : 1;
          value =
            aw && ah
              ? { width: aw * fit, height: ah * fit, dx: 0, dy: 0 }
              : { width: 240, height: 135, dx: 120, dy: 67.5 };
        }
      } else if (payload.kind === 'mine' || payload.kind === 'code')
        value = { width: w, height: h, dx: 0, dy: 0, whole: true };
      else {
        let commands: Command[] | null = null;
        if (payload.kind === 'creator' || payload.kind === 'saved') {
          // S1 Part 3: AI and My Templates items measure their real insert;
          // a whole scene or code animation outlines the artboard.
          commands =
            (payload.kind === 'creator'
              ? creatorBuilt(payload.id, session.currentTime, at)
              : mineBuilt(payload.id, session.currentTime, at)
            )?.commands ?? null;
          if (!commands)
            value = { width: w, height: h, dx: 0, dy: 0, whole: true };
        } else if (payload.kind === 'preset') {
          commands = addShapeCommands(
            session.source,
            payload.id as ShapePreset,
            session.currentTime,
          );
        } else {
          const item =
            payload.kind === 'textbox'
              ? ('textbox' as const)
              : libraryActions.find(payload.id);
          const insert = item ? libraryActions.commandsFor(item, at) : null;
          if (item && !insert)
            value = { width: w, height: h, dx: 0, dy: 0, whole: true };
          commands = insert?.commands ?? null;
        }
        if (commands) {
          const ids = commands.flatMap((command) =>
            command.type === 'CREATE_LAYER' && command.parentId === null
              ? [command.layer.id]
              : [],
          );
          const project = engine.preview(commands);
          const composition = project.compositions.find(
            (item) => item.id === session.source.composition.id,
          );
          const box =
            composition && ids.length
              ? selectionGeometryOf({
                  ...session.source,
                  composition,
                  selectedIds: ids,
                } as RenderSource)
              : null;
          if (box)
            value = {
              width: box.width,
              height: box.height,
              dx: box.x + box.width / 2 - at[0],
              dy: box.y + box.height / 2 - at[1],
            };
        }
      }
    } catch {
      value = null;
    }
    measured = { key, value };
    return value;
  };
  const guideX = document.createElement('div');
  const guideY = document.createElement('div');
  guideX.className = 'canvas-drop-guide vertical';
  guideY.className = 'canvas-drop-guide horizontal';
  for (const guide of [guideX, guideY]) {
    guide.hidden = true;
    guide.setAttribute('aria-hidden', 'true');
    root.append(guide);
  }
  /** Snap distance in CSS pixels (the D-066 tolerance). */
  const SNAP = 6;
  let dropAt: [number, number] | null = null;
  const hidePreview = () => {
    hideDropBox();
    guideX.hidden = guideY.hidden = true;
    stage.classList.remove('drop-highlight');
    dropAt = null;
  };
  /** Shows the outline for `payload` at the pointer; returns the drop point
   *  (composition units) after snapping. */
  const showPreview = (payload: DragPayload, x: number, y: number) => {
    stage.classList.add('drop-highlight');
    const pointer = canvasPoint(x, y);
    const footprint = measure(payload);
    if (!pointer || !footprint) {
      hideDropBox();
      guideX.hidden = guideY.hidden = true;
      return pointer;
    }
    const rect = canvas.getBoundingClientRect();
    const matrix = viewport().matrix;
    const toScreen = (point: readonly [number, number]) => {
      const [sx, sy] = transformPoint(matrix, point);
      return [rect.left + sx, rect.top + sy] as const;
    };
    const { width: w, height: h } = session.source.composition;
    const [boardLeft, boardTop] = toScreen([0, 0]);
    const [boardRight, boardBottom] = toScreen([w, h]);
    const scale = (boardRight - boardLeft) / w;
    const width = footprint.width * scale,
      height = footprint.height * scale;
    let cx: number, cy: number;
    let snappedX: number | null = null,
      snappedY: number | null = null;
    if (footprint.whole) {
      cx = (boardLeft + boardRight) / 2;
      cy = (boardTop + boardBottom) / 2;
    } else {
      cx = x + footprint.dx * scale;
      cy = y + footprint.dy * scale;
      // Snap the box's centre or edges to the canvas centre or edges.
      const snap = (
        centre: number,
        half: number,
        start: number,
        end: number,
      ): [number, number | null] => {
        let best: [number, number | null] = [centre, null];
        let distance = SNAP + 0.001;
        for (const [feature, target] of [
          [centre, (start + end) / 2],
          [centre - half, start],
          [centre + half, end],
        ] as const) {
          const d = Math.abs(feature - target);
          if (d < distance) {
            distance = d;
            best = [centre + (target - feature), target];
          }
        }
        return best;
      };
      [cx, snappedX] = snap(cx, width / 2, boardLeft, boardRight);
      [cy, snappedY] = snap(cy, height / 2, boardTop, boardBottom);
    }
    Object.assign(dropBox.style, {
      left: `${cx - width / 2}px`,
      top: `${cy - height / 2}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    dropBox.hidden = false;
    guideX.hidden = snappedX === null;
    guideY.hidden = snappedY === null;
    if (snappedX !== null)
      Object.assign(guideX.style, {
        left: `${snappedX}px`,
        top: `${boardTop}px`,
        height: `${boardBottom - boardTop}px`,
      });
    if (snappedY !== null)
      Object.assign(guideY.style, {
        top: `${snappedY}px`,
        left: `${boardLeft}px`,
        width: `${boardRight - boardLeft}px`,
      });
    const centre = canvasPoint(cx, cy);
    // A snapped axis lands exactly on its target: the screen round trip
    // leaves float dust (279.99999999999994) that is dropped here.
    const exact = (value: number, snapped: boolean) =>
      snapped ? Math.round(value * 1e6) / 1e6 : value;
    return centre
      ? ([
          exact(centre[0] - footprint.dx, snappedX !== null),
          exact(centre[1] - footprint.dy, snappedY !== null),
        ] as [number, number])
      : pointer;
  };
  drags().register({
    // The whole stage, overlays included (the selection's action cluster,
    // the floating toolbar): a drop there lands on the canvas below.
    contains: (target) => target === canvas || stage.contains(target),
    over(payload, point) {
      dropAt = showPreview(payload, point.x, point.y);
      return true;
    },
    leave: hidePreview,
    drop(payload, point) {
      const at = dropAt ?? canvasPoint(point.x, point.y);
      hidePreview();
      addPayload(payload, { point: at });
    },
  });
  drags().register({
    contains: (target) =>
      !!timeline && !!target.closest('#timeline-foundation .timeline-scroll'),
    over(payload, point) {
      const info = laneInfo(payload);
      if (!info || !timeline) return !!timeline;
      const target = timeline.dragOverAt(info, point.x, point.y);
      return !!target && target.mode !== 'refused';
    },
    leave: () => timeline?.clearAssetTarget(),
    // A lane of another group refuses the drop and says why (MED-013).
    refuse(payload) {
      const target = timeline?.assetTarget();
      if (target?.mode === 'refused') laneDrop(payload, target);
    },
    drop(payload, point) {
      const target = timeline?.assetTarget();
      timeline?.clearAssetTarget();
      if (target) return laneDrop(payload, target);
      addPayload(payload, { time: timelineTimeAt(point.x) });
    },
  });
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
      if (cancelEyedropper(session)) {
        rightPanel.render(activeSection as RightSection);
        return true;
      }
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
  // T2: Copy AI brief from the main menu.
  element<HTMLButtonElement>('#open-brief').onclick = () => {
    element('#app-menu').hidden = true;
    copyAiBrief();
  };
  // Q5: Settings › Animations; FINAL2 U1: appearance, keys, offline engines.
  applyMotion(readMotion());
  element<HTMLButtonElement>('#open-settings').onclick = () => {
    element('#app-menu').hidden = true;
    openSettings();
  };
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
    syncRightRail();
    refresh(true);
  });

  refresh();
  return {
    session,
    /** Dev/test-only read-only snapshot (the test hook's getMedia). */
    mediaDebug: () => ({
      // X1: each code layer's bake (state, frames stored and total).
      code: codeLayersOf(session.source.composition).map((layer) => {
        const spec = codeSpec(layer.id);
        const job = spec ? codeBaker.job(spec.cacheKey) : undefined;
        return {
          layerId: layer.id,
          cacheKey: spec?.cacheKey ?? '',
          quality: codeFrames.qualityOf(layer.id),
          state:
            spec && codeCache.complete(spec.cacheKey)
              ? 'done'
              : (job?.state ?? 'none'),
          stored: spec ? codeCache.stored(spec.cacheKey) : 0,
          total: spec?.frames ?? 0,
          error: job?.error ?? null,
        };
      }),
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
            // T6: the box as drawn (a live text preview grows it).
            ...(session.previewSource ?? session.source),
            ...(interaction.preview ? { preview: interaction.preview } : {}),
          },
          session.selectedId,
          viewport().matrix,
        )?.corners ?? null,
      draws: drawCount,
      // FINAL3 C3: the camera frame on the canvas (canvas CSS px), if shown.
      cameraFrame:
        cameraFrameTool
          ?.overlay()
          ?.corners.map((corner) =>
            transformPoint(viewport().matrix, corner),
          ) ?? null,
      // T6: text boxes whose fixed height clips their text (the editor
      // draws an overflow mark on them).
      textOverflow: deriveRenderItems(session.source)
        .items.filter((item) => item.textOverflow)
        .map((item) => item.id),
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
      libraryBrowsers.dispose();
      if (disposed) return;
      disposed = true;
      disposeShortcuts();
      sceneOutliner?.dispose();
      shortcutSheet.dispose();
      palette.dispose();
      newProjectForm.dispose();
      unsubscribeLanguage();
      unsubscribeTheme();
      sceneBoard.dispose();
      mediaPanel.dispose();
      mediaRelink.dispose();
      soundPack.dispose();
      audioMixer.dispose();
      recordPanel.dispose();
      positionPanel.dispose();
      frames.dispose();
      codeBaker.dispose();
      previews.dispose();
      audio.dispose();
      waveforms.dispose();
      window.removeEventListener('drop', windowDrop);
      workspace?.dispose();
      canvas.removeEventListener('dragover', assetOver);
      canvas.removeEventListener('dragleave', canvasDragLeave);
      canvas.removeEventListener('drop', hideDropBox);
      document.removeEventListener('dragend', hideDropBox);
      dropBox.remove();
      canvas.removeEventListener('drop', assetDrop);
      element('#timeline-foundation').removeEventListener('drop', assetDrop);
      element('#timeline-foundation').removeEventListener(
        'timeline-hint',
        timelineHint,
      );
      element('#timeline-foundation').removeEventListener(
        'timeline-transition',
        openTransition,
      );
      unsubscribeTransition();
      element('#timeline-foundation').removeEventListener(
        'timeline-command',
        timelineCommand,
      );
      element('#timeline-foundation').removeEventListener(
        'timeline-collapse',
        collapseTimeline,
      );
      unsubscribe();
      unsubscribePreview();
      disposeFonts();
      setFieldPreview(null);
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

/** P2: a dropped or pasted file is a Creator Pack (by name or content). */
function isCreatorPackText(fileName: string, text: string): boolean {
  if (/\.creatorpack\.(txt|json)$/i.test(fileName)) return true;
  const head = text.replace(/^\uFEFF/, '').trimStart();
  return (
    head.startsWith('=== PACK ===') ||
    /^\{[\s\S]{0,200}"format"\s*:\s*"creator-pack"/.test(head)
  );
}
/** P2: the FX catalog's ids (checkPack checks recipes against them). */
const FX_CATALOG = [...filters, ...effects, ...adjustments, ...transitions].map(
  (item) => item.id,
);
