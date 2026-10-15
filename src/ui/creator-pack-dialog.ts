// P2 (CREATOR-PACK-SPEC 2, 6): Import creator pack. A pack (pasted, chosen
// or dropped) is first checked offline by `checkPack` (no code runs). The
// user then runs the render checks (sandboxed, nothing is registered), ticks
// the items to keep and adds them to My library. Rejected items never block
// the rest; the report can be copied back to the AI.
import { t } from '../i18n';
import type { CreatorItem, PackResult } from '../creator-pack';
import { openModal } from './components/modal';
import {
  runtimeCheck,
  UNSUPPORTED_KINDS,
  type CheckDeps,
  type RuntimeResult,
} from './creator-checks';
import type { FreeCodeMeta } from '../code-layer/runtime-types';

export interface CheckedItem {
  readonly id: string;
  readonly type: string;
  readonly item: CreatorItem;
  readonly thumbnail?: string;
  readonly motionMeta?: FreeCodeMeta;
}
export interface CreatorPackAdd {
  readonly packId: string;
  readonly packName: { en: string; hi?: string };
  readonly packVersion: number;
  readonly items: readonly CheckedItem[];
}
export interface CreatorPackOptions extends CheckDeps {
  readonly text?: string;
  readonly fileName?: string;
  readonly fxCatalog: readonly string[];
  readonly knownLibraryIds: () => readonly string[];
  /** Registers the chosen items (asks about versions); resolves when done. */
  readonly onAdd: (add: CreatorPackAdd) => Promise<boolean>;
  readonly copy: (text: string) => void;
}

type Status = 'ok' | 'warning' | 'rejected' | 'unsupported' | 'checking';
interface Row {
  id: string;
  type: string;
  status: Status;
  reasons: string[];
  item?: CreatorItem;
  runtime?: RuntimeResult;
}

/** Offline reasons the render checks answer (dropped once they pass). */
const PENDING =
  /still required|require runtime|runtime checks|nothing was applied/i;

export function openCreatorPackDialog(options: CreatorPackOptions) {
  let rows: Row[] = [];
  let pack: PackResult | null = null;
  let envelope: {
    id: string;
    name: { en: string; hi?: string };
    version: number;
  } | null = null;
  let checked = false;
  let run = 0;
  const handle = openModal({
    titleText: t('creator.importTitle'),
    bodyHtml: `
      <div class="creator-import">
        <div class="creator-source">
          <label for="creator-source">${t('creator.sourceLabel')}</label>
          <textarea id="creator-source" spellcheck="false" rows="6" placeholder="${t('creator.sourcePlaceholder')}"></textarea>
          <div class="code-import-file">
            <button type="button" class="button" id="creator-choose">${t('code.chooseFile')}</button>
            <input type="file" id="creator-file" accept=".txt,.json,application/json,text/plain" hidden />
            <span id="creator-file-name" class="code-muted"></span>
          </div>
        </div>
        <p id="creator-summary" class="creator-summary" aria-live="polite"></p>
        <ul id="creator-items" class="creator-items"></ul>
      </div>
      <div class="modal-actions">
        <button type="button" class="button" id="creator-report" disabled>${t('creator.copyReport')}</button>
        <button type="button" class="button" id="creator-cancel">${t('code.cancel')}</button>
        <button type="button" class="button" id="creator-check" disabled>${t('creator.runChecks')}</button>
        <button type="button" class="button primary" id="creator-add" disabled>${t('creator.addSelected')}</button>
      </div>`,
    onClose: () => {
      run++;
    },
  });
  const root = handle.root;
  root.classList.add('creator-pack-dialog');
  const $ = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const source = $<HTMLTextAreaElement>('creator-source');
  const list = $<HTMLUListElement>('creator-items');
  const summary = $<HTMLElement>('creator-summary');
  const add = $<HTMLButtonElement>('creator-add');
  const check = $<HTMLButtonElement>('creator-check');
  const report = $<HTMLButtonElement>('creator-report');

  const selected = () =>
    rows.filter(
      (row) =>
        (row.status === 'ok' || row.status === 'warning') &&
        list.querySelector<HTMLInputElement>(
          `li[data-item="${CSS.escape(row.id)}"] input[type="checkbox"]`,
        )?.checked,
    );
  const paint = () => {
    list.replaceChildren(
      ...rows.map((row) => {
        const li = document.createElement('li');
        li.className = 'creator-item';
        li.dataset.item = row.id;
        li.dataset.type = row.type;
        li.dataset.status = row.status;
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.setAttribute('aria-label', t('creator.keep', { id: row.id }));
        const usable = row.status === 'ok' || row.status === 'warning';
        box.checked = usable;
        box.disabled = !usable;
        box.onchange = () => (add.disabled = !checked || !selected().length);
        const thumb = document.createElement('img');
        thumb.className = 'creator-thumb';
        thumb.alt = '';
        if (row.runtime?.thumbnail) thumb.src = row.runtime.thumbnail;
        else thumb.hidden = true;
        const head = document.createElement('div');
        head.className = 'creator-item-head';
        const name = document.createElement('strong');
        name.textContent = row.item
          ? `${row.item.name.en} (${row.id})`
          : row.id;
        const kind = document.createElement('span');
        kind.className = 'code-muted';
        kind.textContent = row.type;
        const status = document.createElement('span');
        status.className = 'creator-status';
        status.dataset.status = row.status;
        status.textContent = t(`creator.status.${row.status}`);
        head.append(name, kind, status);
        const reasons = document.createElement('ul');
        reasons.className = 'creator-reasons';
        for (const reason of row.reasons) {
          const item = document.createElement('li');
          item.textContent = reason;
          reasons.append(item);
        }
        const body = document.createElement('div');
        body.className = 'creator-item-body';
        body.append(head, reasons);
        li.append(box, thumb, body);
        return li;
      }),
    );
    add.disabled = !checked || !selected().length;
  };
  /** The plain-text report the user pastes back to the AI. */
  const reportText = () => {
    const lines = [
      envelope
        ? `Creator pack ${envelope.id} version ${envelope.version}`
        : 'Creator pack',
      ...(pack && !pack.items.length
        ? pack.reasons.map((r) => `Pack rejected: ${r}`)
        : []),
      ...rows.flatMap((row) => [
        `${row.id} (${row.type}): ${t(`creator.status.${row.status}`).toUpperCase()}`,
        ...row.reasons.map((reason) => `  - ${reason}`),
      ]),
      checked
        ? 'Render checks: done.'
        : 'Render checks: not run (offline checks only).',
    ];
    return `${lines.join('\n')}\n`;
  };

  const classify = async () => {
    const mine = ++run;
    checked = false;
    check.disabled = true;
    add.disabled = true;
    const text = source.value;
    if (!text.trim()) {
      rows = [];
      pack = null;
      summary.textContent = '';
      report.disabled = true;
      paint();
      return;
    }
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
      const unsupported =
        result.status !== 'rejected' && UNSUPPORTED_KINDS.has(result.type);
      return {
        id: result.id,
        type: result.type,
        status: unsupported ? 'unsupported' : result.status,
        reasons: unsupported
          ? [t('creator.notSupported', { kind: result.type })]
          : [...result.reasons],
        ...(result.item ? { item: result.item } : {}),
      };
    });
    if (!pack.items.length)
      summary.textContent = t('creator.packRejected', {
        reason: pack.reasons.join(' '),
      });
    else
      summary.textContent = t('creator.summary', {
        name: envelope?.name.en ?? pack.packId ?? '',
        version: String(envelope?.version ?? ''),
        ok: String(
          rows.filter(
            (r) => r.status !== 'rejected' && r.status !== 'unsupported',
          ).length,
        ),
        total: String(rows.length),
      });
    report.disabled = false;
    check.disabled = !rows.some(
      (row) => row.status === 'ok' || row.status === 'warning',
    );
    paint();
  };

  /** Spec 6 steps 3 to 5, item by item (a failure never stops the rest). */
  const runChecks = async () => {
    const mine = ++run;
    check.disabled = true;
    for (const row of rows) {
      if (mine !== run) return;
      if (!row.item || (row.status !== 'ok' && row.status !== 'warning'))
        continue;
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
      paint();
    }
    checked = true;
    summary.textContent = t('creator.checked', {
      ok: String(
        rows.filter((r) => r.status === 'ok' || r.status === 'warning').length,
      ),
      total: String(rows.length),
    });
    paint();
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  source.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void classify(), 300);
  });
  $<HTMLButtonElement>('creator-choose').onclick = () =>
    $<HTMLInputElement>('creator-file').click();
  $<HTMLInputElement>('creator-file').onchange = async () => {
    const file = $<HTMLInputElement>('creator-file').files?.[0];
    if (!file) return;
    $<HTMLElement>('creator-file-name').textContent = file.name;
    source.value = await file.text();
    void classify();
  };
  check.onclick = () => void runChecks();
  report.onclick = () => options.copy(reportText());
  $<HTMLButtonElement>('creator-cancel').onclick = () => handle.close();
  add.onclick = async () => {
    if (!envelope) return;
    add.disabled = true;
    const done = await options.onAdd({
      packId: envelope.id,
      packName: envelope.name,
      packVersion: envelope.version,
      items: selected().map((row) => ({
        id: row.id,
        type: row.type,
        item: row.item!,
        ...(row.runtime?.thumbnail ? { thumbnail: row.runtime.thumbnail } : {}),
        ...(row.runtime?.motionMeta
          ? { motionMeta: row.runtime.motionMeta }
          : {}),
      })),
    });
    if (done) handle.close();
    else add.disabled = false;
  };
  if (options.fileName)
    $<HTMLElement>('creator-file-name').textContent = options.fileName;
  if (options.text !== undefined) {
    source.value = options.text;
    void classify();
  }
  source.focus();
  return handle;
}
