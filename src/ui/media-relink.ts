// FINAL2 U8: Reconnect media. After a project opens, media whose bytes are not
// in this browser's media store are listed; the user picks a file per item or
// a folder for all of them, reviews the matches and confirms. The engine is
// docs/MEDIA-PROBE-API.md ("UI load / relink flow"); asset ids, clips, lanes
// and keyframes are never touched, only each asset's reference.
import type { Asset } from '../core/model';
import type { EditorEngine } from '../core';
import { classifyMedia, mediaFingerprint, type MediaStore } from '../media';
import {
  batchRelink,
  describeMissing,
  detectMissingMedia,
  findRelinkCandidates,
  prepareRelink,
  probeMedia,
  relink,
  type MissingMedia,
  type RelinkFile,
} from '../media-probe';
import { formatDuration, formatNumber, t } from '../i18n';
import { escapeHtml, openModal, type ModalHandle } from './components/modal';
import { showToast } from './components/toast';
import { codecMessage } from './media-probe-info';

export interface MediaRelinkOptions {
  engine: EditorEngine;
  store: Promise<MediaStore | null>;
  /** Called after references changed: decoders look for the new bytes. */
  refreshed(): void;
}

interface Picked {
  file: File;
  descriptor: RelinkFile;
  matched: readonly string[];
}
interface Row {
  missing: MissingMedia;
  picked?: Picked;
  note?: string;
  error?: boolean;
}

/** Dev/test only: the legacy e2e fixture turns the automatic check off. */
const autoCheckOff = () =>
  (window as { __AIVE_E2E_RELINK__?: string }).__AIVE_E2E_RELINK__ === 'off';

const isRemoved = (asset: Asset) =>
  (asset.metadata as { removed?: unknown }).removed === true;

async function describeFile(file: File): Promise<RelinkFile> {
  const details = await probeMedia(file);
  return {
    name: file.name,
    size: file.size,
    mime: file.type,
    fingerprint: await mediaFingerprint(file),
    details,
    lastModified: file.lastModified,
  };
}

const readError = (file: File, error: unknown) =>
  codecMessage(
    file.name,
    error instanceof Error ? error.message : String(error),
  ) ?? t('relink.unreadable', { name: file.name });

export function mountMediaRelink(options: MediaRelinkOptions) {
  const { engine } = options;
  let modal: ModalHandle | null = null;
  let checking = 0;

  const assets = () => engine.state.assets as unknown as readonly Asset[];

  /** Missing media of the open project, or null when the store cannot be listed. */
  const findMissing = async (): Promise<Asset[] | null> => {
    const store = await options.store;
    if (!store) return null;
    let keys: string[];
    try {
      keys = await store.keys();
    } catch {
      return null; // A storage failure is not "everything is missing".
    }
    const ids = new Set(
      detectMissingMedia(
        // Phase 1 library: catalog media fetch their own file (P1-25).
        assets().filter(
          (asset) =>
            !isRemoved(asset) &&
            !(asset.metadata as Record<string, unknown>).catalog,
        ),
        new Set(keys),
      ).map((item) => item.id),
    );
    return assets().filter((asset) => ids.has(asset.id));
  };

  const check = async () => {
    if (autoCheckOff()) return;
    const run = ++checking;
    const missing = await findMissing();
    if (run !== checking || !missing?.length || modal) return;
    open(missing);
  };

  const remind = (count: number) =>
    showToast(
      t('relink.skipped', { count: formatNumber(count) }),
      'info',
      8000,
      {
        label: t('relink.reconnect'),
        run: () =>
          void findMissing().then((list) => list?.length && open(list)),
      },
    );

  const open = (missingAssets: Asset[]) => {
    const rows: Row[] = missingAssets.map((asset) => ({
      missing: describeMissing(asset),
    }));
    let busy = false;
    let done = false;
    modal = openModal({
      titleText: escapeHtml(t('relink.title')),
      persistent: true,
      onClose: () => {
        modal = null;
        if (!done) remind(rows.filter((row) => !row.picked).length);
      },
      bodyBuilder: (body) => {
        body.classList.add('relink-body');
        body.innerHTML = `
          <p class="relink-intro">${escapeHtml(t('relink.intro', { count: formatNumber(rows.length) }))}</p>
          <ul class="relink-list" role="list"></ul>
          <p class="relink-status" role="status"></p>
          <div class="modal-actions relink-actions">
            <button type="button" class="button" data-role="folder">${escapeHtml(t('relink.pickFolder'))}</button>
            <span class="relink-spacer"></span>
            <button type="button" class="button" data-role="skip">${escapeHtml(t('relink.skip'))}</button>
            <button type="button" class="button primary" data-role="apply">${escapeHtml(t('relink.apply'))}</button>
          </div>
          <input type="file" class="relink-file-input" hidden />
          <input type="file" class="relink-folder-input" hidden multiple webkitdirectory />`;
      },
    });
    const root = modal.root;
    root.classList.add('relink-dialog');
    const list = root.querySelector<HTMLUListElement>('.relink-list')!;
    const status = root.querySelector<HTMLElement>('.relink-status')!;
    const apply = root.querySelector<HTMLButtonElement>('[data-role="apply"]')!;
    const fileInput =
      root.querySelector<HTMLInputElement>('.relink-file-input')!;
    const folderInput = root.querySelector<HTMLInputElement>(
      '.relink-folder-input',
    )!;
    let target: Row | null = null;

    const facts = (missing: MissingMedia) =>
      [
        missing.kind ? t(`media.${missing.kind}`) : '',
        missing.size === undefined
          ? ''
          : missing.size < 1048576
            ? t('relink.kilobytes', {
                size: formatNumber(
                  Math.max(1, Math.round(missing.size / 1024)),
                ),
              })
            : t('media.details.megabytes', {
                size: formatNumber(
                  Math.round((missing.size / 1048576) * 10) / 10,
                ),
              }),
        missing.duration !== undefined ? formatDuration(missing.duration) : '',
        missing.width && missing.height
          ? `${formatNumber(missing.width)} × ${formatNumber(missing.height)}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ');

    const render = () => {
      list.replaceChildren(
        ...rows.map((row, index) => {
          const item = document.createElement('li');
          item.className = 'relink-row';
          item.dataset.assetId = row.missing.id;
          item.dataset.state = row.picked
            ? 'ready'
            : row.error
              ? 'error'
              : 'missing';
          const text = document.createElement('div');
          text.className = 'relink-text';
          const name = document.createElement('strong');
          name.className = 'relink-name';
          name.textContent = row.missing.name;
          const meta = document.createElement('span');
          meta.className = 'relink-meta';
          meta.textContent = facts(row.missing);
          const note = document.createElement('span');
          note.className = 'relink-note';
          note.textContent =
            row.note ??
            (row.picked
              ? row.picked.matched.length
                ? t('relink.ready', {
                    name: row.picked.file.name,
                    matched: row.picked.matched
                      .map((field) => t(`relink.match.${field}`))
                      .join(', '),
                  })
                : t('relink.readyUnmatched', { name: row.picked.file.name })
              : t('relink.missing'));
          text.append(name, meta, note);
          const pick = document.createElement('button');
          pick.type = 'button';
          pick.className = 'button relink-pick';
          pick.textContent = t('relink.pickFile');
          pick.disabled = busy;
          pick.addEventListener('click', () => {
            target = rows[index]!;
            fileInput.accept = row.missing.kind ? `${row.missing.kind}/*` : '';
            fileInput.value = '';
            fileInput.click();
          });
          item.append(text, pick);
          return item;
        }),
      );
      const ready = rows.filter((row) => row.picked).length;
      apply.disabled = busy || !ready;
      apply.textContent = ready
        ? t('relink.applyCount', { count: formatNumber(ready) })
        : t('relink.apply');
      for (const button of root.querySelectorAll<HTMLButtonElement>(
        '[data-role="folder"], [data-role="skip"]',
      ))
        button.disabled = busy;
    };
    const setBusy = (value: boolean, text = '') => {
      busy = value;
      status.textContent = text;
      render();
    };

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      const row = target;
      target = null;
      if (!file || !row) return;
      setBusy(true, t('relink.checking', { name: file.name }));
      void describeFile(file)
        .then((descriptor) => {
          delete row.note;
          delete row.picked;
          row.error = false;
          if (
            row.missing.kind &&
            descriptor.details.kind !== row.missing.kind
          ) {
            row.error = true;
            row.note = t('relink.wrongKind', {
              name: file.name,
              kind: t(`relink.kind.${descriptor.details.kind}`),
              needed: t(`relink.kind.${row.missing.kind}`),
            });
            return;
          }
          const match = findRelinkCandidates(row.missing, [descriptor])[0];
          row.picked = { file, descriptor, matched: match?.matched ?? [] };
        })
        .catch((error: unknown) => {
          delete row.picked;
          row.error = true;
          row.note = readError(file, error);
        })
        .finally(() => setBusy(false));
    });

    folderInput.addEventListener('change', () => {
      const files = [...(folderInput.files ?? [])];
      folderInput.value = '';
      if (!files.length) return;
      const open = rows.filter((row) => !row.picked);
      // Only files that could match (a name or size in common, and media)
      // are inspected, so a big folder stays quick.
      const names = new Set(open.map((row) => row.missing.name.toLowerCase()));
      const sizes = new Set(open.map((row) => row.missing.size));
      const relevant = files.filter(
        (file) =>
          classifyMedia(file) &&
          (names.has(file.name.toLowerCase()) || sizes.has(file.size)),
      );
      setBusy(
        true,
        t('relink.scanning', { count: formatNumber(relevant.length) }),
      );
      void (async () => {
        const described: { file: File; descriptor: RelinkFile }[] = [];
        for (const file of relevant) {
          try {
            described.push({ file, descriptor: await describeFile(file) });
          } catch {
            // Unreadable files are simply not candidates.
          }
        }
        const pending = missingAssets.filter((asset) =>
          open.some((row) => row.missing.id === asset.id),
        );
        const proposal = batchRelink(
          pending,
          described.map((item) => item.descriptor),
        );
        for (const replacement of proposal.replacements) {
          const row = rows.find((item) => item.missing.id === replacement.id)!;
          const fingerprint = (replacement.metadata as { fingerprint?: string })
            .fingerprint;
          const chosen = described.find(
            (item) => item.descriptor.fingerprint === fingerprint,
          );
          if (!chosen) continue;
          const match = findRelinkCandidates(row.missing, [
            chosen.descriptor,
          ])[0];
          delete row.note;
          row.error = false;
          row.picked = { ...chosen, matched: match?.matched ?? [] };
        }
        for (const miss of proposal.unresolved) {
          const row = rows.find((item) => item.missing.id === miss.id)!;
          row.error = true;
          row.note =
            miss.reason === 'AMBIGUOUS'
              ? t('relink.ambiguous')
              : t('relink.noMatch');
        }
        const found = proposal.replacements.length;
        setBusy(
          false,
          t('relink.folderResult', {
            found: formatNumber(found),
            count: formatNumber(pending.length),
          }),
        );
      })();
    });

    root
      .querySelector('[data-role="folder"]')!
      .addEventListener('click', () => folderInput.click());
    root
      .querySelector('[data-role="skip"]')!
      .addEventListener('click', () => modal?.close());
    apply.addEventListener('click', () => {
      const chosen = rows.filter((row) => row.picked);
      if (!chosen.length) return;
      setBusy(true, t('relink.saving'));
      void (async () => {
        const store = await options.store;
        if (!store) throw new Error('no store');
        const replacements: Asset[] = [];
        for (const row of chosen) {
          const picked = row.picked!;
          // Bytes are written first; a reference only changes once they are stored.
          const prepared = await prepareRelink(picked.file, store, {
            probe: async () => picked.descriptor.details,
          });
          const asset = assets().find((item) => item.id === row.missing.id);
          if (asset) replacements.push(relink(asset, prepared));
        }
        if (replacements.length)
          engine.library(
            'Reconnect media',
            replacements.map((asset) => ({
              type: 'REPLACE_ASSET' as const,
              assetId: asset.id,
              asset: structuredClone(asset) as never,
            })),
          );
        options.refreshed();
        const left = rows.length - replacements.length;
        done = true;
        showToast(
          t('relink.done', { count: formatNumber(replacements.length) }),
          'success',
        );
        modal?.close();
        if (left) remind(left);
      })().catch(() => {
        setBusy(false, t('relink.saveFailed'));
      });
    });
    render();
  };

  return {
    check,
    /** Opens the dialog for the open project's missing media, if any. */
    async open() {
      const missing = await findMissing();
      if (missing?.length && !modal) open(missing);
    },
    dispose() {
      checking++;
      modal?.close();
    },
  };
}
