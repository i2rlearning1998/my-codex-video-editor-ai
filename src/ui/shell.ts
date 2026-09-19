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
      <header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">N</span><strong>AI-Native</strong><span class="brand-divider"></span><span class="product-mode">Manual editor</span></div><div class="project-title"><span class="project-dot" aria-hidden="true"></span><span id="project-name"></span></div><div class="top-actions"><button id="example">Open example</button><label class="button">Open project<input id="import" type="file" accept="application/json,.json" /></label><button id="save">Save locally</button><button id="export" class="primary">Export JSON <span aria-hidden="true">↗</span></button></div></header>
      <aside class="library panel" aria-label="Library"><div class="panel-heading"><h2>Library</h2><span class="panel-symbol" aria-hidden="true">⊞</span></div><nav class="library-nav" aria-label="Library categories">${['Assets', 'Media', 'Graphics', 'Text', 'Templates'].map((name, index) => `<button data-category="${name}" aria-pressed="${index === 0}"><span class="nav-icon" aria-hidden="true">${['▦', '▷', '◇', 'T', '▤'][index]}</span>${name}</button>`).join('')}</nav><div class="library-placeholder"><div class="placeholder-icon" aria-hidden="true">▧</div><h3 id="library-title">Your assets, in one place</h3><p id="library-description">Asset importing will arrive in a later milestone.</p><span class="quiet-tag">Coming later</span></div><div class="scene-heading"><h2>Scene</h2><span id="layer-count" class="count"></span></div><div id="scene-list" class="scene-list" aria-label="Scene layers"></div><div class="library-footer"><span class="local-dot"></span> Local workspace <span class="milestone">T3</span></div></aside>
      <main class="preview-panel" aria-label="Composition preview"><div class="preview-toolbar"><div class="composition-picker"><span class="tab-mark" aria-hidden="true">▣</span><select id="composition" aria-label="Composition"></select></div><div class="canvas-zoom-controls"><button data-canvas-zoom="out" aria-label="Canvas zoom out">−</button><button data-canvas-zoom="fit">Fit</button><button data-canvas-zoom="in" aria-label="Canvas zoom in">+</button></div></div><div class="canvas-stage" id="canvas-stage"><canvas id="composition-canvas" tabindex="0" aria-label="Composition canvas. Click to select; drag to move; use corners to scale, edges to resize, and the round handle to rotate around the center. Text side handles change box width. Shift resizes proportionally. Escape cancels. Use the Scene list and inspector for keyboard editing.">Composition preview. Select layers in the Scene list to inspect them.</canvas><div class="canvas-empty" id="canvas-empty" hidden><h3>An open space for your next idea.</h3><p>This composition has no layers. Open the example to explore the preview.</p></div></div><div class="preview-footer"><span id="composition-summary"></span><span id="selection-summary" role="status">No layer selected</span><span id="zoom">Fit</span></div><p class="render-warning" id="render-warning" role="status" hidden></p></main>
      <aside class="inspector panel" aria-label="Inspector"><div class="panel-heading"><h2>Inspector</h2><span class="quiet-tag">Transform</span></div><div id="inspector-content"></div></aside>
      <section class="timeline" aria-label="Timeline"><div class="timeline-header"><div class="timeline-label"><h2>Timeline</h2></div><div class="history-actions"><button id="undo" aria-label="Undo project command" title="Undo project command">↶</button><button id="redo" aria-label="Redo project command" title="Redo project command">↷</button></div></div><div id="timeline-foundation"></div></section>
      <footer class="statusbar"><span id="status" role="status" aria-live="polite">Ready.</span><span>PHASE 1 <span class="status-separator">/</span> T3 <span class="status-separator">·</span> Timeline + playback</span></footer>
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
    element('#zoom').textContent = `Fit · ${Math.round(report.zoom * 100)}%`;
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
      if (current) current.textContent = String(session.currentTime);
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
          button.title = exists ? 'Remove keyframe' : 'Add keyframe';
          button.setAttribute(
            'aria-label',
            `${exists ? 'Remove' : 'Add'} ${button.dataset.fieldName} keyframe`,
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
    element('#composition-summary').textContent =
      `${source.composition.width} × ${source.composition.height}  ·  ${source.composition.fps} fps`;
    const selected = session.selectedId
      ? locateLayer(source.composition.layers, session.selectedId)
      : null;
    element('#selection-summary').textContent =
      session.selectedIds.length > 1
        ? `${session.selectedIds.length} layers selected`
        : selected
          ? `${selected.layer.name} selected`
          : 'No layer selected';
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
      empty.textContent = 'No layers in this composition.';
      list.append(empty);
    }
    if (focusedId)
      [...list.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.dataset.layerId === focusedId)
        ?.focus({ preventScroll: true });
    element('#layer-count').textContent = String(count);
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
          item.title = `Drag ${asset.name} to the Canvas or an existing timeline track`;
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
            throw new Error('Select one layer to edit transforms');
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
  );
  const unsubscribe = session.onChange(refresh);
  element<HTMLSelectElement>('#composition').onchange = (event) =>
    session.selectComposition((event.target as HTMLSelectElement).value);
  element<HTMLButtonElement>('#undo').onclick = () =>
    safely(() => {
      engine.undo();
    });
  element<HTMLButtonElement>('#redo').onclick = () =>
    safely(() => {
      engine.redo();
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
      message(`Open failed: ${String(error)}`);
    } finally {
      input.value = '';
    }
  };
  const descriptions: Record<string, [string, string]> = {
    Assets: [
      'Your assets, in one place',
      'Asset importing will arrive in a later milestone.',
    ],
    Media: [
      'A home for your footage',
      'Media browsing is reserved for a later milestone.',
    ],
    Graphics: [
      'Give your story a shape',
      'The graphics library is not available yet.',
    ],
    Text: [
      'Words that make an impression',
      'Text presets are reserved for a later milestone.',
    ],
    Templates: [
      'A starting point for every idea',
      'Templates are not available yet.',
    ],
  };
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '[data-category]',
  ))
    button.onclick = () => {
      for (const sibling of root.querySelectorAll('[data-category]'))
        sibling.setAttribute('aria-pressed', String(sibling === button));
      const [title, description] = descriptions[button.dataset.category!]!;
      element('#library-title').textContent = title;
      element('#library-description').textContent = description;
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
              ? `${requestedTrack.name} is locked`
              : `${asset.name} is not compatible with ${requestedTrack.name}`,
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
  const workspaceKey = (event: KeyboardEvent) => {
    if (
      (event.target as HTMLElement).closest(
        'input,textarea,select,#timeline-foundation',
      )
    )
      return;
    if (event.key === ' ') {
      event.preventDefault();
      element<HTMLButtonElement>('[data-action="play"]').click();
    }
  };
  root.addEventListener('keydown', workspaceKey);
  refresh();
  return {
    session,
    message,
    refresh,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeWorkspace();
      root.removeEventListener('keydown', workspaceKey);
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
