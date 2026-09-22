import { bindShortcuts } from '../commands/shortcuts';
import { mountShortcutSheet } from './shortcut-sheet';
import { runCommand, type CommandContext } from '../commands/registry';
import { mountCommandPalette } from './command-palette';
import { closeTopOverlay } from './temporary-overlay';
import {
  t,
  formatNumber,
  getLanguage,
  setLanguage,
  subscribe,
  bindDomTranslations,
} from '../i18n';
import {
  multiplyMatrices,
  invertMatrix,
  transformPoint,
  vector2,
  pixelToTime,
  createLayer,
  effectiveLayerTiming,
  findClipByLayer,
  type EditorEngine,
  type AffineMatrix,
  type Command,
} from '../core';
import { locateLayer, type SceneLayer } from '../render/adapter';
import {
  Canvas2DRenderer,
  fitViewport,
  type CompositionRenderer,
} from '../render/canvas';
import { renderInspector } from './inspector';
import { bindCanvasInteraction } from './canvas-interaction';
import { TransformInteraction } from './transform-interaction';
import { EditorSession } from './session';
import { mountTimeline } from './timeline';
import { mountWorkspace } from './workspace';
import { performEdit } from './editing';

export interface ShellActions {
  save?: () => void;
  exportProject?: () => void;
  importProject?: (file: File) => Promise<void>;
  openExample?: () => void;
}
export function mountEditorShell(
  root: HTMLElement,
  engine: EditorEngine,
  actions: ShellActions = {},
  renderer: CompositionRenderer = new Canvas2DRenderer(),
) {
  root.innerHTML = `
    <div class="editor-shell">
      <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">N</span><strong>${t('app.title')}</strong><span class="brand-divider"></span><span class="product-mode">${t('app.mode')}</span></div><div class="project-title"><span class="project-dot" aria-hidden="true"></span><span id="project-name"></span></div><div class="top-actions"><button id="example">${t('action.example')}</button><label class="button">${t('action.open')}<input id="import" type="file" accept="application/json,.json" /></label><button id="save">${t('action.save')}</button><button id="export" class="primary">${t('action.export')} <span aria-hidden="true">↗</span></button></div></header>
      <aside class="library panel" aria-label="${t('library.title')}"><div class="panel-heading"><h2>${t('library.title')}</h2><span class="panel-symbol" aria-hidden="true">⊞</span></div><nav class="library-nav" aria-label="${t('library.categories')}">${['Assets', 'Media', 'Graphics', 'Text', 'Templates'].map((name, index) => `<button data-category="${name}" aria-pressed="${index === 0}"><span class="nav-icon" aria-hidden="true">${['▦', '▷', '◇', 'T', '▤'][index]}</span>${t('library.' + name.toLowerCase())}</button>`).join('')}</nav><div class="library-placeholder"><div class="placeholder-icon" aria-hidden="true">▧</div><h3 id="library-title">${t('library.assetsTitle')}</h3><p id="library-description">${t('library.assetsDescription')}</p><span class="quiet-tag">${t('library.later')}</span></div><div class="scene-heading"><h2>${t('scene.title')}</h2><span id="layer-count" class="count"></span></div><div id="scene-list" class="scene-list" aria-label="${t('scene.layers')}"></div><div class="library-footer"><span class="local-dot"></span> ${t('app.local')} <span class="milestone">T3</span></div></aside>
      <main class="preview-panel" aria-label="${t('canvas.preview')}"><div class="preview-toolbar"><div class="composition-picker"><span class="tab-mark" aria-hidden="true">▣</span><select id="composition" aria-label="${t('canvas.composition')}"></select></div><div class="canvas-zoom-controls"><button data-canvas-zoom="out" aria-label="${t('canvas.zoomOut')}">−</button><button data-canvas-zoom="fit">${t('canvas.fit')}</button><button data-canvas-zoom="in" aria-label="${t('canvas.zoomIn')}">+</button></div></div><div class="canvas-stage" id="canvas-stage"><canvas id="composition-canvas" tabindex="0" aria-label="${t('canvas.help')}">${t('canvas.fallback')}</canvas><div class="canvas-empty" id="canvas-empty" hidden><h3>${t('canvas.emptyTitle')}</h3><p>${t('canvas.emptyDescription')}</p></div></div><div class="preview-footer"><span id="composition-summary"></span><span id="selection-summary" role="status">${t('selection.none')}</span><span id="zoom">${t('canvas.fit')}</span></div><p class="render-warning" id="render-warning" role="status" hidden></p></main>
      <aside class="inspector panel" aria-label="${t('inspector.title')}"><div class="panel-heading"><h2>${t('inspector.title')}</h2><span class="quiet-tag">${t('inspector.transform')}</span></div><div id="inspector-content"></div></aside>
      <section class="timeline" aria-label="${t('timeline.title')}"><div class="timeline-header"><div class="timeline-label"><h2>${t('timeline.title')}</h2></div><div class="history-actions"><button id="undo" aria-label="${t('action.undo')}" title="${t('action.undo')}">↶</button><button id="redo" aria-label="${t('action.redo')}" title="${t('action.redo')}">↷</button></div></div><div id="timeline-foundation"></div></section>
      <footer class="statusbar"><span id="status" role="status" aria-live="polite">${t('status.ready')}</span><span>${t('status.phase')} <span class="status-separator">/</span> T3 <span class="status-separator">·</span> ${t('status.timeline')}</span></footer>
    </div>`;
  const element = <T extends HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  // Temporary language control; Claude's shell will replace this markup.
  const languageButton = document.createElement('button');
  languageButton.id = 'language-toggle';
  languageButton.textContent = t('language.toggle');
  element('.top-actions').append(languageButton);
  const translateStatic = bindDomTranslations(root);
  languageButton.onclick = () =>
    setLanguage(getLanguage() === 'en' ? 'hi' : 'en');
  const session = new EditorSession(engine, renderer.measureText);
  const canvas = element<HTMLCanvasElement>('#composition-canvas');
  const stage = element('#canvas-stage');
  let disposed = false;
  const message = (text: string) => {
    element('#status').textContent = text;
  };
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      message(error instanceof Error ? error.message : String(error));
    }
  };
  const viewport = () => {
    const view = fitViewport(
      Math.max(1, stage.clientWidth),
      Math.max(1, stage.clientHeight),
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
  const draw = () => {
    if (disposed) return;
    const report = renderer.render(
      canvas,
      {
        ...session.source,
        ...(timeline?.controller.previews.length
          ? { timingPreviews: timeline.controller.previews }
          : {}),
        ...(interaction.previews ? { previews: interaction.previews } : {}),
        ...(timeline?.controller.preview
          ? { timingPreview: timeline.controller.preview }
          : {}),
        ...(interaction.preview ? { preview: interaction.preview } : {}),
        ...(interaction.hoveredHandle !== null
          ? { hoveredHandle: interaction.hoveredHandle }
          : {}),
      },
      viewport(),
      session.selectedId,
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
  const pointer = bindCanvasInteraction(
    canvas,
    session,
    interaction,
    viewport,
    (error) => message(error instanceof Error ? error.message : String(error)),
    (action) => performEdit(engine, session, action),
    true,
  );
  let renderedProject: unknown;
  let renderedSelection = '';
  const refresh = (force = false) => {
    const source = session.source;
    const identity = JSON.stringify([
      source.composition.id,
      session.selectedIds,
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
          button.textContent = exists ? '◆' : '◇';
          button.title = t(exists ? 'keyframe.remove' : 'keyframe.add');
          button.setAttribute(
            'aria-label',
            t(exists ? 'keyframe.removeField' : 'keyframe.addField', {
              field: button.dataset.fieldName ?? '',
            }),
          );
        }
      draw();
      return;
    }
    renderedProject = engine.state;
    renderedSelection = identity;
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
    const appendLayers = (layers: readonly SceneLayer[], depth: number) => {
      for (const layer of layers) {
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
        icon.textContent =
          layer.type === 'group' ? '▱' : layer.type === 'text' ? 'T' : '◇';
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
    let assets = root.querySelector<HTMLElement>('.available-assets');
    if (!assets) {
      assets = document.createElement('div');
      assets.className = 'available-assets';
      element('.library-placeholder').append(assets);
    }
    assets.replaceChildren(
      ...source.assets
        .filter((asset) => ['image', 'video', 'audio'].includes(asset.type))
        .map((asset) => {
          const item = document.createElement('button');
          item.textContent = asset.name;
          item.draggable = true;
          item.dataset.assetId = asset.id;
          item.title = t('asset.drag', { name: asset.name });
          item.ondragstart = (event) =>
            event.dataTransfer?.setData('application/x-editor-asset', asset.id);
          return item;
        }),
    );
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
    (error) => message(error instanceof Error ? error.message : String(error)),
    true,
  );
  const commandContext: CommandContext = {
    engine,
    session,
    ...(actions.save ? { save: actions.save } : {}),
    togglePlayback: () =>
      element<HTMLButtonElement>('[data-action="play"]').click(),
  };
  const palette = mountCommandPalette(commandContext, (error) =>
    message(String(error)),
  );
  const shortcutSheet = mountShortcutSheet();
  commandContext.openPalette = palette.open;
  commandContext.openShortcuts = shortcutSheet.open;
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
      return false;
    },
    closeOverlay: () => closeTopOverlay() || (timeline?.closeMenu() ?? false),
    localKey: (event) => {
      if (event.target === canvas) pointer.handleKey(event);
      else if (
        event.target instanceof Node &&
        element('#timeline-foundation').contains(event.target)
      )
        timeline?.handleKey(event);
    },
    report: (error) => message(String(error)),
  });
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
  for (const [id, action] of [
    ['#save', actions.save],
    ['#export', actions.exportProject],
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
    Assets: ['library.assetsTitle', 'library.assetsDescription'],
    Media: ['library.mediaTitle', 'library.mediaDescription'],
    Graphics: ['library.graphicsTitle', 'library.graphicsDescription'],
    Text: ['library.textTitle', 'library.textDescription'],
    Templates: ['library.templatesTitle', 'library.templatesDescription'],
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '[data-category]',
  ))
    button.onclick = () => {
      for (const sibling of root.querySelectorAll('[data-category]'))
        sibling.setAttribute('aria-pressed', String(sibling === button));
      const [title, description] = descriptions[button.dataset.category!]!;
      element('#library-title').textContent = t(title);
      element('#library-description').textContent = t(description);
    };
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
          layer.transform.position = vector2(point[0], point[1]);
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
      if (event.currentTarget !== canvas) {
        const type = asset.type === 'audio' ? 'audio' : 'video';
        const requestedTrackId = (
          event.target as HTMLElement
        ).closest<HTMLElement>('[data-track-id]')?.dataset.trackId;
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
        let destination = requestedTrack;
        destination ??= session.source.composition.tracks.find(
          (item) => item.type === type && !item.locked,
        );
        const trackId = destination?.id ?? crypto.randomUUID();
        if (!destination)
          commands.unshift({
            type: 'CREATE_TRACK',
            compositionId,
            track: {
              id: trackId,
              name: `${type === 'audio' ? 'Audio' : 'Video'} ${session.source.composition.tracks.filter((item) => item.type === type).length + 1}`,
              type,
              order: session.source.composition.tracks.length,
              enabled: true,
              locked: false,
              muted: false,
              clips: [],
            },
          });
        commands.push({
          type: 'CREATE_CLIP',
          compositionId,
          trackId,
          clip: {
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
          },
        });
      }
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
  const unsubscribeLanguage = subscribe(() => {
    translateStatic();
    refresh(true);
    root
      .querySelector<HTMLButtonElement>('[data-category][aria-pressed="true"]')
      ?.click();
  });
  refresh();
  return {
    session,
    message,
    refresh,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeShortcuts();
      shortcutSheet.dispose();
      palette.dispose();
      unsubscribeLanguage();
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
