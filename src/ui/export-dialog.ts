// W5-A Export dialog (EXP-001, EXP-002, EXP-006, EXP-008, EXP-009, APP-015).
import type { Asset, Composition, DeepReadonly } from '../core';
import {
  download,
  missingMedia,
  probeMp4,
  startExport,
  type ExportRun,
} from '../export/client';
import {
  EXPORT_PRESETS,
  FRAME_RATES,
  defaultSettings,
  evenSize,
  remainingSeconds,
  type ExportQuality,
  type ExportSettings,
} from '../export/settings';
import type { AudioDecoder, MediaStore } from '../media';
import { formatDuration, formatNumber, t } from '../i18n';
import { openModal } from './components/modal';

export interface ExportDialogOptions {
  composition: DeepReadonly<Composition>;
  assets: readonly DeepReadonly<Asset>[];
  background: string;
  projectName: string;
  store: Promise<MediaStore | null>;
  decoder: AudioDecoder;
  /** The playhead frame as a PNG, drawn like the export (EXP-009). */
  renderFrame(): Promise<Blob>;
  toast(text: string, kind: 'info' | 'success' | 'error'): void;
}

const field = (id: string, label: string, control: string) =>
  `<label class="export-field" for="${id}"><span>${label}</span>${control}</label>`;

export function openExportDialog(options: ExportDialogOptions) {
  const { composition } = options;
  let settings: ExportSettings = defaultSettings(
    composition,
    options.projectName,
  );
  let run: ExportRun | null = null;
  const modal = openModal({
    titleText: t('export.title'),
    persistent: true,
    onClose: () => run?.cancel(),
    bodyBuilder: (body) => {
      body.innerHTML = `
        <form class="export-form" id="export-form">
          ${field(
            'export-preset',
            t('export.preset'),
            `<select id="export-preset"><option value="custom">${t('export.preset.custom')}</option>${EXPORT_PRESETS.map(
              (preset) =>
                `<option value="${preset.id}">${t(preset.label)} · ${preset.width}×${preset.height}</option>`,
            ).join('')}</select>`,
          )}
          <div class="export-row">
            ${field('export-width', t('export.width'), `<input id="export-width" type="number" min="16" max="7680" step="2" />`)}
            ${field('export-height', t('export.height'), `<input id="export-height" type="number" min="16" max="7680" step="2" />`)}
          </div>
          <div class="export-row">
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
            ${field(
              'export-quality',
              t('export.quality'),
              `<select id="export-quality">${(
                ['low', 'medium', 'high'] as const
              )
                .map(
                  (quality) =>
                    `<option value="${quality}">${t(`export.quality.${quality}`)}</option>`,
                )
                .join('')}</select>`,
            )}
          </div>
          <div class="export-row">
            ${field('export-start', t('export.start'), `<input id="export-start" type="number" min="0" step="0.1" />`)}
            ${field('export-end', t('export.end'), `<input id="export-end" type="number" min="0" step="0.1" />`)}
          </div>
          ${field('export-name', t('export.fileName'), `<input id="export-name" type="text" maxlength="120" />`)}
          <p class="export-format" id="export-format" role="status"></p>
          <div class="export-missing" id="export-missing" role="alert" hidden></div>
          <div class="export-progress" id="export-progress" hidden>
            <progress id="export-bar" max="100" value="0"></progress>
            <span id="export-status" role="status"></span>
          </div>
          <div class="export-actions">
            <button type="button" class="button" id="export-png">${t('export.png')}</button>
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
    preset: find<HTMLSelectElement>('export-preset'),
    width: find<HTMLInputElement>('export-width'),
    height: find<HTMLInputElement>('export-height'),
    fps: find<HTMLSelectElement>('export-fps'),
    quality: find<HTMLSelectElement>('export-quality'),
    start: find<HTMLInputElement>('export-start'),
    end: find<HTMLInputElement>('export-end'),
    name: find<HTMLInputElement>('export-name'),
  };
  const startButton = find<HTMLButtonElement>('export-start-button');
  const show = () => {
    inputs.width.value = String(settings.width);
    inputs.height.value = String(settings.height);
    inputs.fps.value = String(settings.fps);
    inputs.quality.value = settings.quality;
    inputs.start.value = String(settings.start);
    inputs.end.value = String(settings.end);
    inputs.name.value = settings.fileName;
  };
  const read = (): ExportSettings => ({
    width: evenSize(Number(inputs.width.value)),
    height: evenSize(Number(inputs.height.value)),
    fps: Number(inputs.fps.value),
    quality: inputs.quality.value as ExportQuality,
    start: Math.max(0, Number(inputs.start.value) || 0),
    end: Math.min(composition.duration, Number(inputs.end.value) || 0),
    fileName: inputs.name.value,
  });
  // EXP-001: say which format will be written, and why.
  let probe = 0;
  const describeFormat = () => {
    const ticket = ++probe;
    find('export-format').textContent = t('export.format.checking');
    void probeMp4(settings.width, settings.height, settings.fps).then((mp4) => {
      if (ticket !== probe) return;
      const format = find('export-format');
      format.textContent = t(mp4 ? 'export.format.mp4' : 'export.format.webm');
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
    settings = read();
    show();
    describeFormat();
    void checkMissing();
  };
  inputs.preset.onchange = () => {
    const preset = EXPORT_PRESETS.find(
      (item) => item.id === inputs.preset.value,
    );
    if (preset) {
      inputs.width.value = String(preset.width);
      inputs.height.value = String(preset.height);
      inputs.quality.value = preset.quality;
    }
    changed();
  };
  for (const input of [
    inputs.width,
    inputs.height,
    inputs.fps,
    inputs.quality,
    inputs.start,
    inputs.end,
  ])
    input.onchange = () => {
      if (input === inputs.width || input === inputs.height)
        inputs.preset.value = 'custom';
      changed();
    };
  inputs.name.oninput = () => {
    settings = { ...settings, fileName: inputs.name.value };
  };

  const progress = find('export-progress');
  const status = find('export-status');
  const cancelButton = find<HTMLButtonElement>('export-cancel');
  const setRunning = (running: boolean) => {
    for (const input of Object.values(inputs)) input.disabled = running;
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
  show();
  describeFormat();
  void checkMissing();
  return modal;
}
