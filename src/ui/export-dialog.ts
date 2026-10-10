// W5-A Export dialog (EXP-001, EXP-002, EXP-006, EXP-008, EXP-009, APP-015).
// H3 (Canva): Quality (720p, 1080p, 4K: the output's shorter edge, in the
// canvas's shape) and the file name; More options holds the format, frame
// rate and range. Platform sizes are canvas sizes, not export presets.
import type { Asset, Composition, DeepReadonly } from '../core';
import {
  download,
  missingMedia,
  probeMp4,
  startExport,
  type ExportRun,
} from '../export/client';
import {
  FRAME_RATES,
  RESOLUTIONS,
  defaultResolution,
  defaultSettings,
  remainingSeconds,
  resolutionSize,
  type ExportSettings,
} from '../export/settings';
import type { AudioDecoder, MediaStore } from '../media';
import { formatDuration, formatNumber, t } from '../i18n';
import { openModal } from './components/modal';
import { joinScenes } from '../export/join';

export interface ExportDialogOptions {
  composition: DeepReadonly<Composition>;
  /** G5: every scene in playback order; with more than one, All is offered. */
  scenes?: readonly DeepReadonly<Composition>[];
  assets: readonly DeepReadonly<Asset>[];
  background: string;
  projectName: string;
  store: Promise<MediaStore | null>;
  decoder: AudioDecoder;
  /** The playhead frame as a PNG, drawn like the export (EXP-009). */
  renderFrame(): Promise<Blob>;
  /** I2: keeps the frame in Project Media as a Design. */
  saveFrame?(blob: Blob, name: string): Promise<void>;
  toast(text: string, kind: 'info' | 'success' | 'error'): void;
}

const field = (id: string, label: string, control: string) =>
  `<label class="export-field" for="${id}"><span>${label}</span>${control}</label>`;

export function openExportDialog(options: ExportDialogOptions) {
  // G5: all scenes joined end to end (the default), or this scene only.
  const scenes = options.scenes ?? [options.composition];
  let joined: DeepReadonly<Composition> | null = null;
  let joinError = '';
  try {
    joined = scenes.length > 1 ? joinScenes(scenes) : null;
  } catch (error) {
    joinError = error instanceof Error ? error.message : String(error);
  }
  let composition = joined ?? options.composition;
  let settings: ExportSettings = {
    ...defaultSettings(composition, options.projectName),
    ...resolutionSize(composition, defaultResolution(composition)),
  };
  let run: ExportRun | null = null;
  const modal = openModal({
    titleText: t('export.title'),
    persistent: true,
    onClose: () => run?.cancel(),
    bodyBuilder: (body) => {
      body.innerHTML = `
        <form class="export-form" id="export-form">
          ${
            scenes.length > 1
              ? field(
                  'export-scenes',
                  t('export.scenes'),
                  `<select id="export-scenes"><option value="all"${joined ? '' : ' disabled'}>${t('export.scenes.all', { count: formatNumber(scenes.length) })}</option><option value="current">${t('export.scenes.current')}</option></select>`,
                )
              : ''
          }
          <p class="export-format" id="export-scenes-note" role="note"${joinError ? '' : ' hidden'}>${joinError}</p>
          ${field(
            'export-resolution',
            t('export.quality'),
            `<select id="export-resolution">${RESOLUTIONS.map(
              (edge) =>
                `<option value="${edge}">${t(`export.resolution.${edge}`)}</option>`,
            ).join('')}</select>`,
          )}
          <p class="export-size" id="export-size" role="status"></p>
          ${field('export-name', t('export.fileName'), `<input id="export-name" type="text" maxlength="120" />`)}
          <details class="export-more" id="export-more">
            <summary>${t('export.more')}</summary>
            <div class="export-row">
              ${field(
                'export-container',
                t('export.formatChoice'),
                `<select id="export-container"><option value="auto">${t('export.container.auto')}</option><option value="webm">${t('export.container.webm')}</option></select>`,
              )}
              ${field(
                'export-fps',
                t('export.fps'),
                `<select id="export-fps">${[
                  ...new Set([composition.fps, ...FRAME_RATES]),
                ]
                  .sort((a, b) => a - b)
                  .map(
                    (fps) =>
                      `<option value="${fps}">${formatNumber(fps)}</option>`,
                  )
                  .join('')}</select>`,
              )}
            </div>
            <div class="export-row">
              ${field('export-start', t('export.start'), `<input id="export-start" type="number" min="0" step="0.1" />`)}
              ${field('export-end', t('export.end'), `<input id="export-end" type="number" min="0" step="0.1" />`)}
            </div>
          </details>
          <p class="export-format" id="export-format" role="status"></p>
          <div class="export-missing" id="export-missing" role="alert" hidden></div>
          <div class="export-progress" id="export-progress" hidden>
            <progress id="export-bar" max="100" value="0"></progress>
            <span id="export-status" role="status"></span>
          </div>
          <div class="export-actions">
            <button type="button" class="button" id="export-png">${t('export.png')}</button>
            <button type="button" class="button" id="export-png-media"${options.saveFrame ? '' : ' hidden'}>${t('export.saveToMedia')}</button>
            <button type="button" class="button" id="export-cancel" hidden>${t('media.cancel')}</button>
            <button type="submit" class="button primary" id="export-start-button">${t('export.start.button')}</button>
          </div>
        </form>`;
    },
  });
  const root = modal.root;
  const find = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const inputs = {
    resolution: find<HTMLSelectElement>('export-resolution'),
    container: find<HTMLSelectElement>('export-container'),
    fps: find<HTMLSelectElement>('export-fps'),
    start: find<HTMLInputElement>('export-start'),
    end: find<HTMLInputElement>('export-end'),
    name: find<HTMLInputElement>('export-name'),
  };
  const startButton = find<HTMLButtonElement>('export-start-button');
  let resolution: number = defaultResolution(composition);
  const show = () => {
    inputs.resolution.value = String(resolution);
    inputs.container.value = settings.container ?? 'auto';
    inputs.fps.value = String(settings.fps);
    inputs.start.value = String(settings.start);
    inputs.end.value = String(settings.end);
    inputs.name.value = settings.fileName;
    find('export-size').textContent = t('export.sizeNote', {
      width: formatNumber(settings.width),
      height: formatNumber(settings.height),
    });
  };
  const read = (): ExportSettings => ({
    ...resolutionSize(composition, resolution),
    fps: Number(inputs.fps.value),
    quality: 'high',
    start: Math.max(0, Number(inputs.start.value) || 0),
    end: Math.min(composition.duration, Number(inputs.end.value) || 0),
    fileName: inputs.name.value,
    container: inputs.container.value === 'webm' ? 'webm' : 'auto',
  });
  // EXP-001: say which format will be written, and why.
  let probe = 0;
  const describeFormat = () => {
    const ticket = ++probe;
    find('export-format').textContent = t('export.format.checking');
    const forced = settings.container === 'webm';
    void (
      forced
        ? Promise.resolve(false)
        : probeMp4(settings.width, settings.height, settings.fps)
    ).then((mp4) => {
      if (ticket !== probe) return;
      const format = find('export-format');
      format.textContent = t(
        mp4
          ? 'export.format.mp4'
          : forced
            ? 'export.format.webmChosen'
            : 'export.format.webm',
      );
      format.dataset.container = mp4 ? 'mp4' : 'webm';
    });
  };
  // EXP-008: block the export while media bytes are missing.
  const checkMissing = async () => {
    const missing = await missingMedia(
      { composition, assets: options.assets, settings },
      await options.store,
    );
    const box = find('export-missing');
    box.hidden = !missing.length;
    box.textContent = missing.length
      ? t('export.missing', { names: missing.join(', ') })
      : '';
    startButton.disabled = missing.length > 0 || run !== null;
  };
  const changed = () => {
    resolution = Number(inputs.resolution.value);
    settings = read();
    show();
    describeFormat();
    void checkMissing();
  };
  for (const input of [
    inputs.resolution,
    inputs.container,
    inputs.fps,
    inputs.start,
    inputs.end,
  ])
    input.onchange = changed;
  const scope = root.querySelector<HTMLSelectElement>('#export-scenes');
  if (scope) {
    scope.value = joined ? 'all' : 'current';
    scope.onchange = () => {
      composition =
        scope.value === 'all' && joined ? joined : options.composition;
      settings = {
        ...defaultSettings(composition, options.projectName),
        ...resolutionSize(composition, resolution),
        fileName: settings.fileName,
        container: settings.container ?? 'auto',
      };
      show();
      describeFormat();
      void checkMissing();
    };
  }
  inputs.name.oninput = () => {
    settings = { ...settings, fileName: inputs.name.value };
  };

  const progress = find('export-progress');
  const status = find('export-status');
  const cancelButton = find<HTMLButtonElement>('export-cancel');
  const setRunning = (running: boolean) => {
    for (const input of Object.values(inputs)) input.disabled = running;
    if (scope) scope.disabled = running;
    startButton.disabled = running;
    cancelButton.hidden = !running;
    progress.hidden = !running;
  };
  find<HTMLFormElement>('export-form').onsubmit = (event) => {
    event.preventDefault();
    if (run) return;
    settings = read();
    setRunning(true);
    find<HTMLProgressElement>('export-bar').value = 0;
    status.textContent = t('export.preparing');
    const started = performance.now();
    run = startExport(
      {
        composition,
        assets: options.assets,
        background: options.background,
        settings,
      },
      {
        store: options.store,
        decoder: options.decoder,
        onProgress: ({ done, total }) => {
          const percent = Math.round((done / total) * 100);
          find<HTMLProgressElement>('export-bar').value = percent;
          const left = remainingSeconds(
            done,
            total,
            performance.now() - started,
          );
          status.textContent = t('export.progress', {
            percent: formatNumber(percent),
            done: formatNumber(done),
            total: formatNumber(total),
            left: left === null ? '—' : formatDuration(Math.ceil(left)),
          });
        },
      },
    );
    void run.result.then(
      (result) => {
        run = null;
        setRunning(false);
        if (!result) {
          options.toast(t('export.cancelled'), 'info');
          return;
        }
        download(result.file, result.fileName);
        options.toast(t('export.done', { name: result.fileName }), 'success');
        modal.close();
      },
      (error: unknown) => {
        run = null;
        setRunning(false);
        options.toast(
          t('export.failed', {
            error: error instanceof Error ? error.message : String(error),
          }),
          'error',
        );
        void checkMissing();
      },
    );
  };
  cancelButton.onclick = () => run?.cancel();
  find<HTMLButtonElement>('export-png').onclick = () =>
    void options.renderFrame().then(
      (blob) => download(blob, `${settings.fileName || 'frame'}.png`),
      (error: unknown) => options.toast(String(error), 'error'),
    );
  find<HTMLButtonElement>('export-png-media').onclick = () =>
    void options
      .renderFrame()
      .then((blob) =>
        options.saveFrame?.(blob, `${settings.fileName || 'frame'}.png`),
      )
      .then(
        () => options.toast(t('export.savedToMedia'), 'success'),
        (error: unknown) => options.toast(String(error), 'error'),
      );
  show();
  describeFormat();
  void checkMissing();
  return modal;
}
