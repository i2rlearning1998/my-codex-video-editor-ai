// X2 (spec section 2): the one place code animations come in, and the Edit
// code view of an existing code layer. The source is pasted or chosen (a
// dropped file opens it filled in); it is classified A, B or C, or its
// errors are listed with their line, what is wrong and how to fix it. A valid
// result shows its tier, a live thumbnail at its thumbnail time, the params
// form and the duration, with Add to timeline (Apply when editing), Save as
// template (checked) and Cancel.
import type { ParamSpec } from '../blocks/types';
import {
  classifyCode,
  scriptOf,
  type Classified,
} from '../code-layer/classify';
import { codeSeed } from '../code-layer/meta';
import { openCodeSession } from '../code-layer/runtime';
import type {
  FreeCodeMeta,
  FreeCodeRuntime,
} from '../code-layer/runtime-types';
import { t, formatNumber } from '../i18n';
import { openModal } from './components/modal';
import { createParamsForm, type ParamValues } from './code-params';

export type CodeImport =
  | {
      tier: 'A';
      spec: unknown;
      overrides: ParamValues;
      mode: 'new' | 'current';
      name: string;
      duration: number;
      scenes: number;
      paramSpecs: readonly ParamSpec[];
    }
  | {
      tier: 'B' | 'C';
      source: string;
      meta: FreeCodeMeta;
      params: ParamValues;
      name: string;
    };
export interface CodeImportResult {
  readonly item: CodeImport;
  readonly saveTemplate: boolean;
  /** The dialog's thumbnail (PNG), for a template. */
  readonly thumbnail: Blob | null;
}
export interface CodeImportOptions {
  /** A dropped or chosen file's text. */
  readonly text?: string;
  readonly fileName?: string;
  /** Edit code: the layer's source and params. */
  readonly edit?: { readonly source: string; readonly params: ParamValues };
  /** The scene size and rate the thumbnail is drawn for. */
  readonly canvas: { width: number; height: number; fps: number };
  readonly runtime: () => Promise<FreeCodeRuntime | null>;
  /** A Tier A thumbnail: the first new scene drawn at its middle. */
  readonly previewA?: (
    spec: unknown,
    overrides: ParamValues,
  ) => Promise<Blob | null>;
  /** Adds (or applies) the result; a thrown error is shown in the dialog. */
  readonly onConfirm: (result: CodeImportResult) => Promise<void> | void;
}

const THUMB_WIDTH = 320;

function defaults(specs: readonly ParamSpec[]): ParamValues {
  return Object.fromEntries(specs.map((spec) => [spec.name, spec.default]));
}

export function openCodeImportDialog(options: CodeImportOptions) {
  const editing = !!options.edit;
  let classified: Classified | null = null;
  let values: ParamValues = {};
  let thumbBlob: Blob | null = null;
  let thumbUrl = '';
  let run = 0;
  const handle = openModal({
    titleText: editing ? t('code.editTitle') : t('code.importTitle'),
    bodyHtml: `
      <div class="code-import">
        <div class="code-import-source">
          <label for="code-source">${t('code.sourceLabel')}</label>
          <textarea id="code-source" spellcheck="false" rows="10" placeholder="${t('code.sourcePlaceholder')}"></textarea>
          <div class="code-import-file">
            <button type="button" class="button" id="code-choose">${t('code.chooseFile')}</button>
            <input type="file" id="code-file" accept=".json,.js,.mjs,.html,.htm,application/json,text/javascript,text/html" hidden />
            <span id="code-file-name" class="code-muted"></span>
          </div>
        </div>
        <div class="code-import-result" aria-live="polite">
          <div class="code-import-head">
            <span id="code-tier" class="code-tier" hidden></span>
            <span id="code-duration" class="code-muted"></span>
          </div>
          <p id="code-notice" class="code-notice" hidden></p>
          <ul id="code-errors" class="code-errors" hidden></ul>
          <img id="code-thumb" class="code-thumb" alt="" hidden />
          <div id="code-scene-mode" class="code-scene-mode" role="radiogroup" hidden>
            <label><input type="radio" name="code-scene" value="new" checked /> ${t('code.sceneNew')}</label>
            <label><input type="radio" name="code-scene" value="current" /> ${t('code.sceneCurrent')}</label>
          </div>
          <div id="code-params-host"></div>
          <p id="code-error" class="code-error" role="alert" hidden></p>
        </div>
      </div>
      <div class="modal-actions">
        <label class="code-save"><input type="checkbox" id="code-save-template" ${editing ? '' : 'checked'} /> ${t('code.saveTemplate')}</label>
        <button type="button" class="button" id="code-cancel">${t('code.cancel')}</button>
        <button type="button" class="button primary" id="code-add" disabled>${editing ? t('code.apply') : t('code.add')}</button>
      </div>`,
    onClose: () => {
      run++;
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    },
  });
  const root = handle.root;
  const $ = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  root.classList.add('code-import-dialog');
  const source = $<HTMLTextAreaElement>('code-source');
  const add = $<HTMLButtonElement>('code-add');
  const errorLine = $<HTMLElement>('code-error');
  let fileName = options.fileName ?? '';

  const setThumb = (blob: Blob | null) => {
    thumbBlob = blob;
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    thumbUrl = blob ? URL.createObjectURL(blob) : '';
    const img = $<HTMLImageElement>('code-thumb');
    img.hidden = !blob;
    if (blob) img.src = thumbUrl;
    else img.removeAttribute('src');
    img.dataset.ready = blob ? 'true' : 'false';
  };
  /** The thumbnail at the animation's thumbnail time (live: after edits). */
  const drawThumb = async () => {
    const mine = ++run;
    const current = classified;
    if (!current || current.tier === null) return setThumb(null);
    try {
      let blob: Blob | null;
      if (current.tier === 'A')
        blob = (await options.previewA?.(current.spec, values)) ?? null;
      else {
        const height = Math.max(
          1,
          Math.round(
            (THUMB_WIDTH * options.canvas.height) / options.canvas.width,
          ),
        );
        const session = await openCodeSession(current.tier, current.source, {
          width: THUMB_WIDTH,
          height,
          fps: current.meta.fps ?? options.canvas.fps,
          duration: current.meta.duration,
          params: values,
          seed: codeSeed(current.source),
        });
        try {
          const bitmap = await session.thumbnail();
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
          bitmap.close();
          blob = await canvas.convertToBlob({ type: 'image/png' });
        } finally {
          session.dispose();
        }
      }
      if (mine === run) setThumb(blob);
    } catch (error) {
      if (mine !== run) return;
      setThumb(null);
      showError(error);
    }
  };
  const showError = (error: unknown) => {
    errorLine.hidden = false;
    errorLine.textContent =
      error instanceof Error ? error.message : String(error);
  };
  let thumbTimer: ReturnType<typeof setTimeout> | undefined;
  const renderParams = () => {
    const host = $<HTMLElement>('code-params-host');
    host.replaceChildren();
    const current = classified;
    if (!current || current.tier === null) return;
    const specs = current.tier === 'A' ? current.params : current.meta.params;
    if (!specs.length) return;
    const heading = document.createElement('h3');
    heading.className = 'code-params-title';
    heading.textContent = t('code.params');
    host.append(
      heading,
      createParamsForm({
        idPrefix: 'code-param',
        specs,
        values,
        onChange: (name, value) => {
          values = { ...values, [name]: value };
          renderParams();
          clearTimeout(thumbTimer);
          thumbTimer = setTimeout(() => void drawThumb(), 250);
        },
        onInvalid: (message) => showError(message),
      }),
    );
  };
  const show = () => {
    const current = classified;
    const tier = $<HTMLElement>('code-tier');
    const notice = $<HTMLElement>('code-notice');
    const errors = $<HTMLUListElement>('code-errors');
    errorLine.hidden = true;
    errors.replaceChildren();
    $<HTMLElement>('code-scene-mode').hidden = current?.tier !== 'A' || editing;
    if (!current) {
      tier.hidden = true;
      notice.hidden = true;
      errors.hidden = true;
      $<HTMLElement>('code-duration').textContent = '';
      add.disabled = true;
      renderParams();
      return;
    }
    if (current.tier === null) {
      tier.hidden = true;
      notice.hidden = true;
      errors.hidden = false;
      for (const issue of current.issues) {
        const item = document.createElement('li');
        item.dataset.line = String(issue.line);
        item.textContent = t('code.issue', {
          line: formatNumber(issue.line),
          what: issue.what,
          fix: issue.fix,
        });
        errors.append(item);
      }
      $<HTMLElement>('code-duration').textContent = '';
      add.disabled = true;
      renderParams();
      return setThumb(null);
    }
    errors.hidden = true;
    tier.hidden = false;
    tier.dataset.tier = current.tier;
    tier.textContent = t(`code.tier${current.tier}`);
    notice.hidden = current.tier !== 'C';
    notice.textContent = t('code.fullMode');
    if (editing && current.tier === 'A') {
      add.disabled = true;
      showError(t('code.editNeedsCode'));
    } else add.disabled = false;
    $<HTMLElement>('code-duration').textContent = t('code.duration', {
      seconds: formatNumber(
        current.tier === 'A' ? current.duration : current.meta.duration,
      ),
    });
    renderParams();
    void drawThumb();
  };
  let checkTimer: ReturnType<typeof setTimeout> | undefined;
  let checks = 0;
  const check = async () => {
    const mine = ++checks;
    root.dataset.checking = 'true';
    const text = source.value;
    const result = await classifyCode(
      text,
      await options.runtime(),
      fileName,
    ).catch((error: unknown): Classified => ({
      tier: null,
      issues: [
        {
          line: 1,
          what: error instanceof Error ? error.message : String(error),
          fix: t('code.fixGeneric'),
        },
      ],
    }));
    if (mine !== checks) return;
    const keep = editing && options.edit ? options.edit.params : {};
    classified = result;
    const specs =
      result.tier === 'A'
        ? result.params
        : result.tier === null
          ? []
          : result.meta.params;
    values = { ...defaults(specs), ...pick(keep, specs) };
    delete root.dataset.checking;
    show();
  };
  source.addEventListener('input', () => {
    clearTimeout(checkTimer);
    add.disabled = true;
    checkTimer = setTimeout(() => void check(), 300);
  });
  const fileInput = $<HTMLInputElement>('code-file');
  $<HTMLButtonElement>('code-choose').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileName = file.name;
    $<HTMLElement>('code-file-name').textContent = file.name;
    source.value = await file.text();
    void check();
  };
  $<HTMLButtonElement>('code-cancel').onclick = () => handle.close();
  add.onclick = async () => {
    const current = classified;
    if (!current || current.tier === null) return;
    add.disabled = true;
    errorLine.hidden = true;
    const saveTemplate = $<HTMLInputElement>('code-save-template').checked;
    const item: CodeImport =
      current.tier === 'A'
        ? {
            tier: 'A',
            spec: current.spec,
            overrides: values,
            mode:
              root.querySelector<HTMLInputElement>(
                'input[name="code-scene"]:checked',
              )?.value === 'current'
                ? 'current'
                : 'new',
            name: current.name,
            duration: current.duration,
            scenes: current.scenes,
            paramSpecs: current.params,
          }
        : {
            tier: current.tier,
            source: current.source,
            meta: current.meta,
            params: values,
            name: current.meta.name,
          };
    try {
      await options.onConfirm({ item, saveTemplate, thumbnail: thumbBlob });
      handle.close();
    } catch (error) {
      showError(error);
      add.disabled = false;
    }
  };
  const initial = options.edit?.source ?? options.text ?? '';
  if (/\.html?$/i.test(fileName)) source.value = scriptOf(initial);
  else source.value = initial;
  if (fileName) $<HTMLElement>('code-file-name').textContent = fileName;
  if (initial) void check();
  else source.focus();
  return handle;
}

function pick(values: ParamValues, specs: readonly ParamSpec[]): ParamValues {
  const kept: ParamValues = {};
  for (const spec of specs)
    if (typeof values[spec.name] === typeof spec.default)
      kept[spec.name] = values[spec.name]!;
  return kept;
}
