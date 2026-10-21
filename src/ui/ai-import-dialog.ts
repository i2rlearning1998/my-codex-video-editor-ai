// R2: the one AI importer (the AI category's Import button, a dropped code or
// pack file). It takes a single code animation (a Composition Spec, a block
// or free code) or a whole Creator Pack (pack text or JSON), checks it on its
// own (no Run checks step) and lists each item with pass, warning or
// rejected and plain reasons. Every motion item shows its controllers, which
// can be changed before adding; the changed values become its defaults.
// Accepted items go to My library and show in the AI category only.
import type { ParamSpec } from '../blocks/types';
import { classifyCode, scriptOf } from '../code-layer/classify';
import { isPlanV2, validatePlan } from '../video-plan';

/** FINAL3 V1: the parsed JSON when the text is a Video Plan v2. */
function planText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('video-plan')) return null;
  try {
    const value = JSON.parse(trimmed) as unknown;
    return isPlanV2(value) ? value : null;
  } catch {
    // A broken plan is still a plan when it says so.
    return /"format"\s*:\s*"video-plan"/.test(trimmed) ? {} : null;
  }
}
import { codeSeed } from '../code-layer/meta';
import { openCodeSession } from '../code-layer/runtime';
import type { FreeCodeMeta } from '../code-layer/runtime-types';
import type { CreatorItem, PackResult } from '../creator-pack';
import { formatNumber, t } from '../i18n';
import { openModal } from './components/modal';
import { createParamsForm, type ParamValues } from './code-params';
import {
  runtimeCheck,
  UNSUPPORTED_KINDS,
  type CheckDeps,
  type RuntimeResult,
} from './creator-checks';

export interface AiImportItem {
  readonly id: string;
  readonly type: string;
  readonly item: CreatorItem;
  readonly thumbnail?: string;
  /** Motion (and a Tier A code animation): its controllers. */
  readonly motionMeta?: FreeCodeMeta;
  /** The controller values chosen in the dialog. */
  readonly params?: ParamValues;
}
export interface AiImportAdd {
  readonly packId: string;
  readonly packName: { en: string; hi?: string };
  readonly packVersion: number;
  readonly items: readonly AiImportItem[];
  /** A single code animation: also put it in the scene. */
  readonly addToScene: boolean;
  /** A Tier A code animation: as new scenes or into this scene. */
  readonly sceneMode?: 'new' | 'current';
}
export interface AiImportOptions extends CheckDeps {
  readonly text?: string;
  readonly fileName?: string;
  readonly fxCatalog: readonly string[];
  readonly knownLibraryIds: () => readonly string[];
  /** The scene size and rate thumbnails are drawn for. */
  readonly canvas: { width: number; height: number; fps: number };
  /** A Tier A thumbnail (PNG data URL). */
  readonly previewA?: (
    spec: unknown,
    overrides: ParamValues,
  ) => Promise<string | null>;
  /** Registers the items: how many were added (0: already there), or false. */
  readonly onAdd: (add: AiImportAdd) => Promise<number | false>;
  readonly copy: (text: string) => void;
  readonly openAi?: () => void;
  /** FINAL2 U10: a checked composition item offers "Build video". */
  readonly buildComposition?: (item: CreatorItem) => void;
}

type Status = 'ok' | 'warning' | 'rejected' | 'unsupported' | 'checking';
interface Row {
  id: string;
  type: string;
  name: string;
  status: Status;
  reasons: string[];
  item?: CreatorItem;
  runtime?: RuntimeResult;
  tier?: 'A' | 'B' | 'C';
  duration?: number;
  specs: readonly ParamSpec[];
  values: ParamValues;
  meta?: FreeCodeMeta;
  /** A render error of the thumbnail (the runtime's message). */
  error?: string;
}

/** Offline reasons the render checks answer (dropped once they pass). */
const PENDING =
  /still required|require runtime|runtime checks|nothing was applied/i;
const THUMB_WIDTH = 320;

/** FINAL2 U10: an exported code animation's first line keeps its control
 *  values; the importer restores them. */
export const PARAMS_HEADER = '// @aive-params ';
export function savedParams(source: string): ParamValues {
  if (!source.startsWith(PARAMS_HEADER)) return {};
  try {
    const value: unknown = JSON.parse(
      source.slice(PARAMS_HEADER.length, source.indexOf('\n')),
    );
    return value && typeof value === 'object' ? (value as ParamValues) : {};
  } catch {
    return {};
  }
}
/** A pack (sectioned text or JSON with format creator-pack), not code. */
export function looksLikePack(text: string): boolean {
  const head = text.replace(/^﻿/, '').trimStart();
  return (
    head.startsWith('=== PACK ===') ||
    /^\{[\s\S]{0,400}"format"\s*:\s*"creator-pack"/.test(head)
  );
}
/** A short stable id for a code animation's source. */
export function codeHash(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++)
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}
const defaults = (specs: readonly ParamSpec[]): ParamValues =>
  Object.fromEntries(specs.map((spec) => [spec.name, spec.default]));
/** The meta with the chosen values as the controllers' defaults. */
export function withDefaults(
  meta: FreeCodeMeta,
  values: ParamValues,
): FreeCodeMeta {
  return {
    ...meta,
    params: meta.params.map((spec) =>
      spec.name in values && typeof values[spec.name] === typeof spec.default
        ? ({ ...spec, default: values[spec.name] } as ParamSpec)
        : spec,
    ),
  };
}

export function openAiImportDialog(options: AiImportOptions) {
  let rows: Row[] = [];
  let mode: 'code' | 'pack' | null = null;
  let pack: PackResult | null = null;
  let envelope: {
    id: string;
    name: { en: string; hi?: string };
    version: number;
  } | null = null;
  let checked = false;
  let run = 0;
  let fileName = options.fileName ?? '';
  let sceneMode: 'new' | 'current' = 'new';
  const handle = openModal({
    titleText: t('aiImport.title'),
    bodyHtml: `
      <div class="code-import ai-import">
        <div class="code-import-source">
          <label for="ai-import-source">${t('aiImport.sourceLabel')}</label>
          <textarea id="ai-import-source" spellcheck="false" rows="8" placeholder="${t('aiImport.placeholder')}"></textarea>
          <div class="code-import-file">
            <button type="button" class="button" id="ai-import-choose">${t('code.chooseFile')}</button>
            <input type="file" id="ai-import-file" accept=".txt,.json,.js,.mjs,.html,.htm,application/json,text/plain,text/javascript,text/html" hidden />
            <span id="ai-import-file-name" class="code-muted"></span>
          </div>
        </div>
        <div class="code-import-result" aria-live="polite">
          <p id="ai-import-summary" class="creator-summary"></p>
          <ul id="ai-import-items" class="creator-items ai-import-items"></ul>
        </div>
      </div>
      <div class="modal-actions">
        <label class="code-save" id="ai-import-scene-row" hidden><input type="checkbox" id="ai-import-scene" checked /> ${t('aiImport.addToScene')}</label>
        <button type="button" class="button" id="ai-import-report" disabled>${t('creator.copyReport')}</button>
        <button type="button" class="button" id="ai-import-cancel">${t('code.cancel')}</button>
        <button type="button" class="button primary" id="ai-import-add" disabled>${t('aiImport.add')}</button>
      </div>`,
    onClose: () => {
      run++;
    },
  });
  const root = handle.root;
  root.classList.add('code-import-dialog', 'ai-import-dialog');
  const $ = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const source = $<HTMLTextAreaElement>('ai-import-source');
  const list = $<HTMLUListElement>('ai-import-items');
  const summary = $<HTMLElement>('ai-import-summary');
  const add = $<HTMLButtonElement>('ai-import-add');
  const report = $<HTMLButtonElement>('ai-import-report');

  const usable = (row: Row) => row.status === 'ok' || row.status === 'warning';
  const selected = () =>
    rows.filter(
      (row) =>
        usable(row) &&
        list.querySelector<HTMLInputElement>(
          `li[data-item="${CSS.escape(row.id)}"] input.ai-import-keep`,
        )?.checked,
    );
  const syncAdd = () => (add.disabled = !checked || !selected().length);

  /** A code item's thumbnail at its thumbnail time (after edits too). */
  const thumbs = new Map<string, number>();
  const drawThumb = async (row: Row) => {
    const mine = (thumbs.get(row.id) ?? 0) + 1;
    thumbs.set(row.id, mine);
    try {
      let url: string | null = null;
      if (row.tier === 'A' && row.item)
        url =
          (await options.previewA?.(
            (row.item.data as { spec: unknown }).spec,
            row.values,
          )) ?? null;
      else if ((row.tier === 'B' || row.tier === 'C') && row.meta) {
        const code = (row.item!.data as { source: string }).source;
        const height = Math.max(
          1,
          Math.round(
            (THUMB_WIDTH * options.canvas.height) / options.canvas.width,
          ),
        );
        const session = await openCodeSession(row.tier, code, {
          width: THUMB_WIDTH,
          height,
          fps: row.meta.fps ?? options.canvas.fps,
          duration: row.meta.duration,
          params: row.values,
          seed: codeSeed(code),
        });
        try {
          const bitmap = await session.thumbnail();
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
          bitmap.close();
          url = canvas.toDataURL('image/png');
        } finally {
          session.dispose();
        }
      }
      if (thumbs.get(row.id) !== mine || !url) return;
      row.runtime = { ...(row.runtime ?? { status: 'ok', reasons: [] }) };
      row.runtime.thumbnail = url;
      const image = list.querySelector<HTMLImageElement>(
        `li[data-item="${CSS.escape(row.id)}"] .creator-thumb`,
      );
      if (image) {
        image.src = url;
        image.hidden = false;
        image.dataset.ready = 'true';
      }
    } catch (error) {
      if (thumbs.get(row.id) !== mine) return;
      row.error = error instanceof Error ? error.message : String(error);
      paint();
    }
  };
  let thumbTimer: ReturnType<typeof setTimeout> | undefined;

  const paint = () => {
    list.replaceChildren(
      ...rows.map((row, index) => {
        // A single code animation keeps the code dialog's element ids.
        const single = mode === 'code' && rows.length === 1;
        const tag = <T extends HTMLElement>(element: T, id: string) => {
          if (single) element.id = id;
          return element;
        };
        const li = document.createElement('li');
        li.className = 'creator-item ai-import-item';
        li.dataset.item = row.id;
        li.dataset.type = row.type;
        li.dataset.status = row.status;
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'ai-import-keep';
        box.setAttribute('aria-label', t('creator.keep', { id: row.name }));
        box.checked = usable(row);
        box.disabled = !usable(row);
        box.onchange = syncAdd;
        const thumb = tag(document.createElement('img'), 'code-thumb');
        thumb.className = 'creator-thumb';
        thumb.alt = '';
        if (row.runtime?.thumbnail) {
          thumb.src = row.runtime.thumbnail;
          thumb.dataset.ready = 'true';
        } else thumb.hidden = true;
        const head = document.createElement('div');
        head.className = 'creator-item-head';
        const name = document.createElement('strong');
        name.textContent = row.name;
        const kind = document.createElement('span');
        kind.className = 'code-muted ai-import-kind';
        kind.textContent = t(`ai.kind.${row.type}`);
        const status = document.createElement('span');
        status.className = 'creator-status';
        status.dataset.status = row.status;
        status.textContent = t(`creator.status.${row.status}`);
        head.append(name, kind, status);
        if (row.tier) {
          const tier = tag(document.createElement('span'), 'code-tier');
          tier.className = 'code-tier';
          tier.dataset.tier = row.tier;
          tier.textContent = t(`code.tier${row.tier}`);
          head.append(tier);
        }
        if (row.duration !== undefined) {
          const duration = tag(document.createElement('span'), 'code-duration');
          duration.className = 'code-muted';
          duration.textContent = t('code.duration', {
            seconds: formatNumber(row.duration),
          });
          head.append(duration);
        }
        const reasons = tag(document.createElement('ul'), 'code-errors');
        reasons.className = 'creator-reasons code-errors';
        for (const reason of row.reasons) {
          const item = document.createElement('li');
          item.textContent = reason;
          reasons.append(item);
        }
        const body = document.createElement('div');
        body.className = 'creator-item-body';
        body.append(head, reasons);
        if (row.error) {
          const error = tag(document.createElement('p'), 'code-error');
          error.className = 'code-error';
          error.setAttribute('role', 'alert');
          error.textContent = row.error;
          body.append(error);
        }
        if (row.tier === 'C' && row.status !== 'rejected') {
          const notice = tag(document.createElement('p'), 'code-notice');
          notice.className = 'code-notice';
          notice.textContent = t('code.fullMode');
          body.append(notice);
        }
        if (single && row.tier === 'A' && row.status !== 'rejected') {
          const scene = document.createElement('div');
          scene.id = 'code-scene-mode';
          scene.className = 'code-scene-mode';
          scene.setAttribute('role', 'radiogroup');
          scene.innerHTML = `<label><input type="radio" name="code-scene" value="new" ${sceneMode === 'new' ? 'checked' : ''} /> ${t('code.sceneNew')}</label><label><input type="radio" name="code-scene" value="current" ${sceneMode === 'current' ? 'checked' : ''} /> ${t('code.sceneCurrent')}</label>`;
          scene.onchange = (event) =>
            (sceneMode =
              (event.target as HTMLInputElement).value === 'current'
                ? 'current'
                : 'new');
          body.append(scene);
        }
        // Every controller of a motion item, editable before adding.
        if (row.specs.length && row.status !== 'rejected') {
          const heading = document.createElement('h3');
          heading.className = 'code-params-title';
          heading.textContent = t('code.params');
          const form = createParamsForm({
            idPrefix: single ? 'code-param' : `ai-param-${index}`,
            specs: row.specs,
            values: row.values,
            onChange: (key, value) => {
              row.values = { ...row.values, [key]: value };
              paint();
              clearTimeout(thumbTimer);
              thumbTimer = setTimeout(() => void drawThumb(row), 250);
            },
          });
          const params = document.createElement('div');
          params.className = 'ai-import-params';
          params.dataset.controls = String(row.specs.length);
          params.append(heading, form);
          body.append(params);
        }
        if (
          row.type === 'composition' &&
          // A single Composition Spec (Tier A) is added as before.
          !row.tier &&
          options.buildComposition &&
          row.item &&
          usable(row)
        ) {
          // FINAL2 U10: not kept in the library; built into scenes.
          box.checked = false;
          box.disabled = true;
          const build = document.createElement('button');
          build.type = 'button';
          build.className = 'button primary sm ai-import-build';
          build.dataset.action = 'build-video';
          build.textContent = t('composition.build');
          // FIX1 F7: Build video also keeps the ticked items (a style)
          // and the composition itself in the AI library.
          build.onclick = async () => {
            build.disabled = true;
            const rows = [...selected().filter((other) => other !== row), row];
            if (envelope)
              await options
                .onAdd(payload(rows, false))
                .catch((error: unknown) => {
                  console.debug('[ai-import] keep before build failed', error);
                  return false as const;
                });
            handle.close();
            options.buildComposition!(row.item!);
          };
          body.append(build);
        }
        li.append(box, thumb, body);
        return li;
      }),
    );
    $<HTMLElement>('ai-import-scene-row').hidden =
      mode !== 'code' || !rows.some(usable);
    syncAdd();
  };
  const reportText = () =>
    `${[
      envelope
        ? `Creator pack ${envelope.id} version ${envelope.version}`
        : mode === 'code'
          ? 'Code animation'
          : 'Creator pack',
      ...(pack && !pack.items.length
        ? pack.reasons.map((r) => `Pack rejected: ${r}`)
        : []),
      ...rows.flatMap((row) => [
        `${row.id} (${row.type}): ${t(`creator.status.${row.status}`).toUpperCase()}`,
        ...row.reasons.map((reason) => `  - ${reason}`),
      ]),
    ].join('\n')}\n`;

  const clear = () => {
    rows = [];
    pack = null;
    envelope = null;
    mode = null;
    summary.textContent = '';
    report.disabled = true;
    paint();
  };
  const classify = async () => {
    const mine = ++run;
    checked = false;
    add.disabled = true;
    const text = source.value;
    if (!text.trim()) return clear();
    root.dataset.checking = 'true';
    if (planText(text)) classifyPlan(text);
    else if (looksLikePack(text)) await classifyPack(text, mine);
    else await classifyCodeText(text, mine);
    if (mine === run) delete root.dataset.checking;
  };
  /** FINAL3 V1: a Video Plan v2: checked here, built by Build video. */
  const classifyPlan = (text: string) => {
    mode = 'code';
    pack = null;
    const check = validatePlan(text);
    const plan = check.plan;
    const title =
      plan?.meta.title ??
      (planText(text) as { meta?: { title?: string } }).meta?.title ??
      t('plan.untitled');
    const id = `plan-${codeHash(text)}`;
    rows = [
      {
        id,
        type: 'composition',
        name: title,
        status: !check.ok
          ? 'rejected'
          : check.warnings.length
            ? 'warning'
            : 'ok',
        reasons: [...check.errors, ...check.warnings],
        ...(plan
          ? {
              item: {
                id,
                name: { en: title.slice(0, 60) },
                tags: ['plan'],
                type: 'composition',
                data: plan,
              } as unknown as CreatorItem,
            }
          : {}),
        specs: [],
        values: {},
      },
    ];
    envelope = plan
      ? { id, name: { en: title.slice(0, 60) }, version: 1 }
      : null;
    checked = true;
    summary.textContent = check.ok
      ? t('plan.checked', {
          scenes: String(plan!.scenes.length),
          warnings: String(check.warnings.length),
        })
      : t('plan.rejected', { count: String(check.errors.length) });
    report.disabled = false;
    paint();
  };
  /** A single code animation: one item, with its tier and controllers. */
  const classifyCodeText = async (text: string, mine: number) => {
    mode = 'code';
    pack = null;
    const code = /\.html?$/i.test(fileName) ? scriptOf(text) : text;
    const result = await classifyCode(
      code,
      await options.runtime(),
      fileName,
    ).catch((error: unknown) => ({
      tier: null as null,
      issues: [
        {
          line: 1,
          what: error instanceof Error ? error.message : String(error),
          fix: t('code.fixGeneric'),
        },
      ],
    }));
    if (mine !== run) return;
    const id = `code-${codeHash(code)}`;
    if (result.tier === null) {
      rows = [
        {
          id,
          type: 'motion',
          name: fileName || t('aiImport.codeName'),
          status: 'rejected',
          reasons: result.issues.map((issue) =>
            t('code.issue', {
              line: formatNumber(issue.line),
              what: issue.what,
              fix: issue.fix,
            }),
          ),
          specs: [],
          values: {},
        },
      ];
    } else if (result.tier === 'A') {
      const meta = {
        id,
        name: result.name,
        duration: result.duration,
        params: result.params,
      } as unknown as FreeCodeMeta;
      rows = [
        {
          id,
          type: 'composition',
          name: result.name,
          status: 'ok',
          reasons: [],
          tier: 'A',
          duration: result.duration,
          item: {
            id,
            name: { en: result.name },
            tags: ['code'],
            type: 'composition',
            data: { spec: result.spec },
          } as unknown as CreatorItem,
          meta,
          specs: result.params,
          values: defaults(result.params),
        },
      ];
    } else {
      rows = [
        {
          id,
          type: 'motion',
          name: result.meta.name,
          status: result.tier === 'C' ? 'warning' : 'ok',
          reasons: [],
          tier: result.tier,
          duration: result.meta.duration,
          item: {
            id,
            name: { en: result.meta.name },
            tags: ['code'],
            type: 'motion',
            data: {
              tier: result.tier,
              source: result.source,
              meta: result.meta,
            },
          } as unknown as CreatorItem,
          meta: result.meta,
          specs: result.meta.params,
          values: {
            ...defaults(result.meta.params),
            ...Object.fromEntries(
              Object.entries(savedParams(text)).filter(([key, value]) =>
                result.meta.params.some(
                  (spec) =>
                    spec.name === key && typeof spec.default === typeof value,
                ),
              ),
            ),
          },
        },
      ];
    }
    envelope = rows[0]!.item
      ? { id, name: { en: rows[0]!.name }, version: 1 }
      : null;
    checked = true;
    summary.textContent =
      rows[0]!.status === 'rejected'
        ? t('aiImport.codeRejected')
        : t('aiImport.codeOk', { name: rows[0]!.name });
    report.disabled = false;
    paint();
    if (usable(rows[0]!)) void drawThumb(rows[0]!);
  };
  const classifyPack = async (text: string, mine: number) => {
    mode = 'pack';
    const { checkPack, parsePack } = await import('../creator-pack');
    if (mine !== run) return;
    pack = checkPack(text, {
      fxCatalog: options.fxCatalog,
      knownLibraryIds: options.knownLibraryIds(),
    });
    envelope = null;
    try {
      const raw = parsePack(text) as {
        pack?: { id?: string; name?: { en: string }; version?: number };
      };
      if (raw.pack?.id && raw.pack.name && raw.pack.version)
        envelope = {
          id: raw.pack.id,
          name: raw.pack.name,
          version: raw.pack.version,
        };
    } catch {
      envelope = null;
    }
    rows = pack.items.map((result) => {
      // FINAL2 U10: a composition is built (Build video), not registered.
      const buildable =
        result.type === 'composition' && !!options.buildComposition;
      const unsupported =
        result.status !== 'rejected' &&
        !buildable &&
        UNSUPPORTED_KINDS.has(result.type);
      return {
        id: result.id,
        type: result.type,
        name: result.item ? result.item.name.en : result.id,
        status: unsupported ? 'unsupported' : result.status,
        reasons: unsupported
          ? [t('creator.notSupported', { kind: result.type })]
          : [...result.reasons],
        specs: [],
        values: {},
        ...(result.item ? { item: result.item } : {}),
      };
    });
    // FINAL2 U10: a composition is checked by the composition adapter
    // itself (the offline pack check predates it and rejects its parts).
    if (options.buildComposition) {
      let rawItems: { id?: string; type?: string; name?: { en: string } }[] =
        [];
      try {
        rawItems = (parsePack(text) as { items?: typeof rawItems }).items ?? [];
      } catch {
        rawItems = [];
      }
      const { buildProjectFromComposition } = await import('../composition');
      for (const row of rows) {
        if (row.type !== 'composition') continue;
        const raw = rawItems.find((entry) => entry.id === row.id);
        if (!raw) continue;
        // FINAL3 V1: a Video Plan v2 inside a pack.
        const data = (raw as { data?: unknown }).data;
        if (isPlanV2(data)) {
          const check = validatePlan(data);
          row.item = {
            ...raw,
            data: check.plan ?? data,
          } as unknown as CreatorItem;
          row.name = raw.name?.en ?? row.id;
          row.status = !check.ok
            ? 'rejected'
            : check.warnings.length
              ? 'warning'
              : 'ok';
          row.reasons = [...check.errors, ...check.warnings];
          continue;
        }
        const built = await buildProjectFromComposition(
          (raw as { data?: unknown }).data,
        ).catch((error: unknown) => ({
          project: null,
          errors: [String(error)],
          warnings: [],
          missing: [],
        }));
        if (mine !== run) return;
        row.item = raw as unknown as CreatorItem;
        row.name = raw.name?.en ?? row.id;
        row.status = built.project ? 'ok' : 'rejected';
        row.reasons = built.project
          ? [t('composition.ready', { count: built.missing.length })]
          : built.errors.slice(0, 5);
      }
    }
    summary.textContent = pack.items.length
      ? t('aiImport.checking', { total: String(rows.length) })
      : t('creator.packRejected', { reason: pack.reasons.join(' ') });
    report.disabled = false;
    paint();
    // The render checks run on their own; nothing is registered until Add.
    for (const row of rows) {
      if (mine !== run) return;
      if (!row.item || !usable(row)) continue;
      if (row.type === 'composition') {
        // Built later by the composition adapter; no render check here.
        row.reasons = row.reasons.filter((reason) => !PENDING.test(reason));
        paint();
        continue;
      }
      row.status = 'checking';
      paint();
      const result = await runtimeCheck(row.item, options);
      if (mine !== run) return;
      row.runtime = result;
      const offline = row.reasons.filter((reason) => !PENDING.test(reason));
      row.reasons = [...offline, ...result.reasons];
      row.status =
        result.status === 'rejected' || result.status === 'unsupported'
          ? result.status
          : result.status === 'warning' || offline.length
            ? 'warning'
            : 'ok';
      if (result.motionMeta) {
        row.meta = result.motionMeta;
        row.specs = result.motionMeta.params;
        row.values = defaults(row.specs);
        row.duration = result.motionMeta.duration;
        if (row.item.type === 'motion')
          row.tier = (row.item.data as { tier: 'B' | 'C' }).tier;
      }
      paint();
    }
    checked = true;
    summary.textContent = pack.items.length
      ? t('creator.checked', {
          ok: String(rows.filter(usable).length),
          total: String(rows.length),
        })
      : summary.textContent;
    paint();
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  source.addEventListener('input', () => {
    clearTimeout(timer);
    add.disabled = true;
    timer = setTimeout(() => void classify(), 300);
  });
  const fileInput = $<HTMLInputElement>('ai-import-file');
  $<HTMLButtonElement>('ai-import-choose').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileName = file.name;
    $<HTMLElement>('ai-import-file-name').textContent = file.name;
    source.value = await file.text();
    void classify();
  };
  report.onclick = () => options.copy(reportText());
  $<HTMLButtonElement>('ai-import-cancel').onclick = () => handle.close();
  /** The items to keep, as onAdd takes them. */
  const payload = (rows: readonly Row[], addToScene: boolean): AiImportAdd => ({
    packId: envelope!.id,
    packName: envelope!.name,
    packVersion: envelope!.version,
    addToScene,
    sceneMode,
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      item: row.item!,
      ...(row.runtime?.thumbnail ? { thumbnail: row.runtime.thumbnail } : {}),
      ...(row.meta ? { motionMeta: withDefaults(row.meta, row.values) } : {}),
      ...(row.specs.length ? { params: row.values } : {}),
    })),
  });
  add.onclick = async () => {
    if (!envelope) return;
    add.disabled = true;
    const done = await options
      .onAdd(
        payload(
          selected(),
          mode === 'code' && $<HTMLInputElement>('ai-import-scene').checked,
        ),
      )
      .catch((error: unknown) => {
        summary.textContent =
          error instanceof Error ? error.message : String(error);
        return false as const;
      });
    if (done === false) {
      syncAdd();
      return;
    }
    // A single code animation closes like the code dialog did; a pack ends
    // in the result card.
    if (mode === 'code') handle.close();
    else showResult(done);
  };
  const showResult = (count: number) => {
    const card = document.createElement('div');
    card.className = 'creator-result';
    card.id = 'creator-result';
    card.setAttribute('role', 'status');
    const text = document.createElement('p');
    text.textContent =
      count > 0
        ? t('creator.resultAdded', { count: String(count) })
        : t('creator.resultSame');
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'button';
    done.id = 'creator-done';
    done.textContent = t('creator.done');
    done.onclick = () => handle.close();
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'button primary';
    open.id = 'creator-open-ai';
    open.textContent = t('creator.openAi');
    open.onclick = () => {
      handle.close();
      options.openAi?.();
    };
    actions.append(done, open);
    card.append(text, actions);
    root.querySelector('.ai-import + .modal-actions')?.remove();
    root.querySelector('.ai-import')!.replaceWith(card);
    open.focus();
  };
  if (fileName) $<HTMLElement>('ai-import-file-name').textContent = fileName;
  if (options.text !== undefined) {
    source.value = options.text;
    void classify();
  }
  source.focus();
  return handle;
}
