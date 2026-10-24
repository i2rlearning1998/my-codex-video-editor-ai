// FINAL2 U10: Build video from an AI composition (docs/COMPOSITION-ADAPTER.md,
// "Steps for the UI"). Lists the media slots with their hint, type and a
// Required badge; each can take an item from Media, an upload, a stock search
// result, or stay empty ("let the AI decide later": it is built as a frame).
// The adapter's missing items and warnings show live; the result is added as
// new scenes, or opened as a new project.
import { createBuildLoader } from './components/build-loader';
import { t } from '../i18n';
import type { Asset, Project } from '../core';
import {
  buildProjectFromComposition,
  compositionDataOf,
  createSlotFills,
  type BuildResult,
  type CompositionSlot,
} from '../composition';
import type { LibraryItem } from '../library/schema';
import {
  hasKeys,
  importStockItem,
  type StockItem,
  type StockKind,
} from '../providers';
import { openModal } from './components/modal';
import { iconSvg } from './icons';
import { stockProvidersFor } from './services';
import { stockErrorText, stockQuality } from './stock-panel';

export interface CompositionBuildDeps {
  assets(): readonly Asset[];
  /** Imports a file into Media; its asset, or null. */
  importFile(file: File): Promise<Asset | null>;
  library(id: string): LibraryItem | undefined;
  /** Adds the built scenes (and missing assets) to the open project. */
  addScenes(project: Project): void;
  /** Replaces the open project (after a confirm). */
  openProject(project: Project): Promise<void>;
  openKeys(): void;
  report(error: unknown): void;
}

const kindOf = (slot: CompositionSlot) =>
  slot.type === 'logo' ? 'image' : slot.type;
const STOCK: Record<string, StockKind> = {
  image: 'stock-image',
  video: 'stock-video',
  audio: 'stock-audio',
};

export function openCompositionBuild(
  item: { name: { en: string }; data: unknown },
  deps: CompositionBuildDeps,
) {
  const data = compositionDataOf(item.data);
  const fills = createSlotFills(data);
  let result: BuildResult | null = null;
  let building = 0;
  let controller: AbortController | null = null;
  const handle = openModal({
    onClose: () => {
      controller?.abort();
      building++;
    },
    titleText: t('composition.title', { name: item.name.en }),
    bodyHtml: `
      <div class="composition-build">
        <p class="settings-note">${t('composition.lead')}</p>
        <ul class="composition-slots" aria-label="${t('composition.slots')}"></ul>
        <div class="composition-report" role="status" aria-live="polite"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="button" id="composition-cancel">${t('action.cancel')}</button>
        <button type="button" class="button secondary" id="composition-open">${t('composition.openProject')}</button>
        <button type="button" class="button primary" id="composition-add">${t('composition.addScenes')}</button>
      </div>`,
  });
  const root = handle.root;
  root.closest('.modal-dialog')?.classList.add('composition-dialog');
  const list = root.querySelector<HTMLElement>('.composition-slots')!;
  const report = root.querySelector<HTMLElement>('.composition-report')!;
  const add = root.querySelector<HTMLButtonElement>('#composition-add')!;
  const open = root.querySelector<HTMLButtonElement>('#composition-open')!;

  const rebuild = async () => {
    controller?.abort();
    const active = (controller = new AbortController());
    const mine = ++building;
    add.disabled = open.disabled = true;
    const loader = createBuildLoader();
    report.replaceChildren(loader.element);
    // Cancel stops this build; the dialog stays, with a way to check again.
    loader.signal.addEventListener('abort', () => active.abort(), {
      once: true,
    });
    const built = await buildProjectFromComposition(data, {
      signal: active.signal,
      onProgress: (progress) => {
        if (mine !== building) return;
        loader.update(progress);
      },
      slotFills: fills,
      library: deps.library,
      name: item.name.en,
    }).catch((error: unknown) => {
      if (!active.signal.aborted) {
        loader.fail(error instanceof Error ? error.message : String(error));
        deps.report(error);
      }
      return null;
    });
    if (mine !== building) return;
    if (loader.signal.aborted) {
      loader.cancelled();
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'button secondary sm';
      again.dataset.action = 'build-again';
      again.textContent = t('build.rebuild');
      again.onclick = () => void rebuild();
      report.append(again);
      return;
    }
    if (loader.state === 'failed') return;
    result = built;
    report.replaceChildren();
    if (!built?.project) {
      const p = document.createElement('p');
      p.className = 'composition-error';
      p.textContent = t('composition.invalid', {
        reason: built?.errors.slice(0, 3).join(' ') ?? '',
      });
      report.append(p);
      return;
    }
    const empty = built.missing.filter((m) => m.kind === 'slot').length;
    const lines = [
      empty
        ? t('composition.emptyFrames', { count: empty })
        : t('composition.allFilled'),
      ...built.missing
        .filter((m) => m.kind !== 'slot')
        .map((m) =>
          m.kind === 'voice-over'
            ? t('composition.missingVoice')
            : m.kind === 'captions'
              ? t('composition.missingCaptions')
              : m.reason,
        ),
      ...built.warnings.map((w) => w.message),
    ];
    const ul = document.createElement('ul');
    ul.className = 'composition-checklist';
    for (const line of lines) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.append(li);
    }
    report.append(ul);
    add.disabled = open.disabled = false;
  };

  const fillWith = (slot: CompositionSlot, asset: Asset, stock?: StockItem) => {
    const done = fills.fillSlot(
      slot.id,
      stock
        ? { kind: 'stock', asset, provider: stock.providerId, itemId: stock.id }
        : { kind: 'file', asset },
    );
    if (!done.ok) deps.report(new Error(done.reason));
    paint();
    void rebuild();
  };

  const stockSearch = (slot: CompositionSlot, host: HTMLElement) => {
    host.replaceChildren();
    const provider = stockProvidersFor(STOCK[kindOf(slot)]!).find(hasKeys);
    if (!provider) {
      const p = document.createElement('p');
      p.className = 'settings-note';
      p.textContent = t('composition.stockNoKey');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary sm';
      button.textContent = t('stock.addKey');
      button.onclick = () => deps.openKeys();
      host.append(p, button);
      return;
    }
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'shelf-search composition-stock-search';
    input.placeholder = t(
      `stock.search.${kindOf(slot) === 'audio' ? 'audio' : kindOf(slot) === 'video' ? 'videos' : 'photos'}`,
    );
    input.value = slot.hint.split(/\s+/).slice(0, 3).join(' ');
    const results = document.createElement('div');
    results.className = 'composition-stock-results';
    const go = async () => {
      results.textContent = t('stock.loading');
      try {
        const found = await provider.search({
          kind: STOCK[kindOf(slot)]!,
          query: input.value.trim() || slot.id,
          perPage: 6,
        });
        results.replaceChildren(
          ...found.items.slice(0, 6).map((stock) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'composition-stock-item';
            b.title = stock.title;
            b.setAttribute('aria-label', stock.title);
            if (stock.thumbUrl) {
              const img = document.createElement('img');
              img.src = stock.thumbUrl;
              img.alt = '';
              img.referrerPolicy = 'no-referrer';
              b.append(img);
            } else b.textContent = stock.title;
            b.onclick = async () => {
              b.disabled = true;
              try {
                const got = await importStockItem(stock, stockQuality(stock));
                const asset = await deps.importFile(
                  new File([got.blob], got.name, { type: got.mime }),
                );
                if (asset) fillWith(slot, asset, stock);
              } catch (error) {
                deps.report(
                  new Error(stockErrorText(error, provider.name, 'photos')),
                );
                b.disabled = false;
              }
            };
            return b;
          }),
        );
        if (!found.items.length)
          results.textContent = t('stock.noResults', { query: input.value });
      } catch (error) {
        results.textContent = stockErrorText(error, provider.name, 'photos');
      }
    };
    input.onkeydown = (event) => {
      if (event.key === 'Enter') void go();
    };
    host.append(input, results);
    void go();
  };

  const paint = () => {
    list.replaceChildren(
      ...fills.slots.map((slot) => {
        const li = document.createElement('li');
        li.className = 'composition-slot';
        li.dataset.slot = slot.id;
        const filled = fills.fillOf(slot.id);
        const head = document.createElement('div');
        head.className = 'composition-slot-head';
        head.innerHTML = `${iconSvg(kindOf(slot) === 'audio' ? 'audio' : kindOf(slot) === 'video' ? 'media' : 'image', 18)}`;
        const name = document.createElement('strong');
        name.textContent = slot.id;
        const type = document.createElement('span');
        type.className = 'code-muted';
        type.textContent = t(`composition.type.${slot.type}`);
        head.append(name, type);
        if (slot.required) {
          const badge = document.createElement('span');
          badge.className = 'composition-required';
          badge.textContent = t('composition.required');
          head.append(badge);
        }
        const state = document.createElement('span');
        state.className = 'composition-state';
        state.dataset.filled = String(!!filled);
        state.textContent =
          filled && filled.kind !== 'library'
            ? filled.asset.name
            : t('composition.empty');
        head.append(state);
        const hint = document.createElement('p');
        hint.className = 'settings-note';
        hint.textContent = slot.hint;
        const actions = document.createElement('div');
        actions.className = 'key-actions';
        const assets = deps
          .assets()
          .filter(
            (a) =>
              a.type === kindOf(slot) &&
              (a.metadata as { removed?: unknown }).removed !== true,
          );
        const select = document.createElement('select');
        select.className = 'composition-media';
        select.setAttribute('aria-label', t('composition.fromMedia'));
        select.innerHTML =
          `<option value="">${t('composition.fromMedia')}</option>` +
          assets
            .map(
              (a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`,
            )
            .join('');
        select.disabled = !assets.length;
        select.onchange = () => {
          const asset = assets.find((a) => a.id === select.value);
          if (asset) fillWith(slot, asset);
        };
        const file = document.createElement('input');
        file.type = 'file';
        file.hidden = true;
        file.accept = `${kindOf(slot)}/*`;
        file.onchange = async () => {
          const chosen = file.files?.[0];
          if (!chosen) return;
          const asset = await deps.importFile(chosen).catch((error) => {
            deps.report(error);
            return null;
          });
          if (asset) fillWith(slot, asset);
        };
        const upload = document.createElement('button');
        upload.type = 'button';
        upload.className = 'button secondary sm';
        upload.dataset.action = 'composition-upload';
        upload.textContent = t('composition.upload');
        upload.onclick = () => file.click();
        const stockHost = document.createElement('div');
        stockHost.className = 'composition-stock';
        const stock = document.createElement('button');
        stock.type = 'button';
        stock.className = 'button secondary sm';
        stock.dataset.action = 'composition-stock';
        stock.textContent = t('composition.stock');
        stock.onclick = () => stockSearch(slot, stockHost);
        const later = document.createElement('button');
        later.type = 'button';
        later.className = 'button ghost sm';
        later.dataset.action = 'composition-later';
        later.textContent = t('composition.later');
        later.onclick = () => {
          fills.clearSlot(slot.id);
          paint();
          void rebuild();
        };
        actions.append(select, upload, file, stock, later);
        li.append(head, hint, actions, stockHost);
        return li;
      }),
    );
    if (!fills.slots.length) {
      const li = document.createElement('li');
      li.className = 'settings-note';
      li.textContent = t('composition.noSlots');
      list.append(li);
    }
  };

  root.querySelector<HTMLButtonElement>('#composition-cancel')!.onclick = () =>
    handle.close();
  add.onclick = () => {
    if (!result?.project) return;
    try {
      deps.addScenes(result.project);
      handle.close();
    } catch (error) {
      deps.report(error);
    }
  };
  open.onclick = async () => {
    if (!result?.project) return;
    handle.close();
    await deps.openProject(result.project).catch(deps.report);
  };
  paint();
  void rebuild();
  return handle;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
