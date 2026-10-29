// FINAL3 V2.0: Build video for a Video Plan v2. No slot dialog: the dialog
// shows the builder's steps as they run (media, voice, layout, captions,
// camera, sound) with Cancel, adds the scenes in one step when it is done
// (replacing a single empty scene), and ends with a summary: scenes, media
// found, what needs an asset, and a banner when the video is silent.
import { t } from '../i18n';
import type { Asset } from '../core';
import {
  hasKeys,
  importStockItem,
  type LicenseMeta,
  type StockItem,
  type StockKind,
} from '../providers';
import { synthesizeToMedia } from '../speech';
import type { Theme } from '../themes/themes';
import {
  BUILD_STEPS,
  buildVideoFromPlan,
  type BuildProgress,
  type MediaCandidate,
  type PlanBuildResult,
  type ResolveServices,
  namesMatch,
  type VideoPlan,
} from '../video-plan';
import { openModal } from './components/modal';
import { plainMessage } from './components/toast';
import { stockErrorText } from './stock-panel';
import { iconSvg } from './icons';
import { stockProvidersFor } from './services';
import { stockQuality } from './stock-panel';
import { planVoiceEngine } from './voiceover';

export interface PlanBuildDeps {
  assets(): readonly Asset[];
  /** Imports a file into Media (quietly) with an optional stock licence. */
  importFile(file: File, license?: LicenseMeta): Promise<Asset | null>;
  /**
   * Phase 1 library: a sound effect from the catalog whose name fits one
   * of the words (its asset, made at once), or null.
   */
  sfx?(words: readonly string[]): { asset: Asset; duration: number } | null;
  /** A built-in or saved theme by id. */
  theme(id: string): Promise<Theme | null>;
  /** Adds the built scenes in one step and opens the first. */
  addScenes(result: PlanBuildResult): void;
  /**
   * FIX7: runs once the build is complete and about to be kept (the AI
   * card is saved here, never earlier). A cancelled build never calls it.
   */
  onCommit?(): Promise<void> | void;
  /**
   * FIX7: renders the built scenes' code animations (so the video plays
   * smoothly at once). Rejects on cancel; `progress` gets 0..1.
   */
  prepare?(
    project: NonNullable<PlanBuildResult['project']>,
    signal: AbortSignal,
    progress: (fraction: number) => void,
  ): Promise<void>;
  /** FIX7: takes media the build imported away again (cancel, failure). */
  discardAssets?(ids: readonly string[]): Promise<void> | void;
  /** Opens the Review panel for the built plan. */
  review(result: PlanBuildResult): void;
  report(error: unknown): void;
}

const STOCK_KIND: Record<string, StockKind> = {
  photo: 'stock-image',
  video: 'stock-video',
  icon: 'icon',
  emoji: 'sticker',
};
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1);

/** The builder's media services over the project's media and stock. */
export function planServices(
  deps: Pick<PlanBuildDeps, 'assets' | 'importFile' | 'sfx'>,
) {
  const resolve: ResolveServices = {
    local: (query, type) => {
      const wanted = words(query);
      return deps
        .assets()
        .filter(
          (asset) =>
            (type === 'audio'
              ? asset.type === 'audio'
              : (asset.type === 'image' || asset.type === 'video') &&
                (type === 'video') === (asset.type === 'video')) &&
            !(asset.metadata as { removed?: boolean }).removed,
        )
        .filter((asset) => {
          const have = words(
            `${asset.name} ${(asset.metadata as { fileName?: string }).fileName ?? ''}`,
          );
          return wanted.some((word) => have.includes(word));
        })
        .map((asset): MediaCandidate => ({
          key: `asset:${asset.id}`,
          source: 'asset',
          kind:
            asset.type === 'audio'
              ? 'audio'
              : asset.type === 'video'
                ? 'video'
                : 'image',
          title: asset.name,
          tags: [],
          width: asset.width ?? 0,
          height: asset.height ?? 0,
        }));
    },
    stock: async (query, type, orientation, page) => {
      // Narration and other audio files come from the project's own media.
      if (type === 'audio') throw new Error(t('plan.audioOwnMedia'));
      const kind = STOCK_KIND[type]!;
      const provider = stockProvidersFor(kind).find(hasKeys);
      if (!provider)
        throw new Error(t('plan.noStockKey', { kind: t(`plan.kind.${type}`) }));
      const found = await provider
        .search({
          kind,
          query,
          page,
          perPage: 12,
          ...(orientation && (type === 'photo' || type === 'video')
            ? { orientation }
            : {}),
        })
        .catch((error: unknown) => {
          throw new Error(
            stockErrorText(
              error,
              provider.name,
              type === 'video' ? 'videos' : 'photos',
            ),
          );
        });
      return found.items.map((item): MediaCandidate => ({
        key: `${item.providerId}:${item.id}`,
        source: 'stock',
        kind: item.kind === 'stock-video' ? 'video' : 'image',
        title: item.title,
        tags: item.tags,
        width: item.width,
        height: item.height,
        thumbUrl: item.thumbUrl,
        payload: item,
      }));
    },
  };
  const importCandidate = async (
    candidate: MediaCandidate,
    signal?: AbortSignal,
  ) => {
    if (candidate.source === 'asset') {
      const asset = deps
        .assets()
        .find((item) => `asset:${item.id}` === candidate.key);
      if (asset) return asset;
      throw new Error(t('plan.assetGone'));
    }
    const item = candidate.payload as StockItem;
    const got = await importStockItem(
      item,
      stockQuality(item),
      signal ? { signal } : {},
    );
    const asset = await deps.importFile(
      new File([got.blob], got.name, { type: got.mime }),
      got.licenseMeta,
    );
    if (!asset) throw new Error(t('stock.importFailed'));
    return asset;
  };
  return { resolve, importCandidate };
}

export function openPlanBuild(plan: VideoPlan, deps: PlanBuildDeps) {
  const controller = new AbortController();
  let finished = false;
  // FIX7: all or nothing. What the build imports is remembered, and taken
  // away again unless the video is really added.
  const before = new Set(deps.assets().map((asset) => asset.id));
  let committed = false;
  const rollback = async () => {
    if (committed) return;
    const added = deps
      .assets()
      .map((asset) => asset.id)
      .filter((id) => !before.has(id));
    if (added.length) await deps.discardAssets?.(added);
  };
  const handle = openModal({
    titleText: t('plan.buildTitle', { name: plan.meta.title }),
    persistent: true,
    onClose: () => {
      if (!finished) controller.abort();
      void rollback();
    },
    bodyBuilder: (body) => {
      body.classList.add('plan-build');
      body.innerHTML = `<p class="plan-working" id="plan-working" role="status"><span class="plan-spinner" aria-hidden="true"></span><span>${t('plan.working')}</span></p>
        <ol class="plan-steps" id="plan-steps"></ol>
        <p class="plan-banner" id="plan-banner" role="status" hidden></p>
        <div class="plan-missing" id="plan-missing" hidden></div>
        <div class="plan-summary" id="plan-summary" hidden></div>
        <div class="modal-actions">
          <button type="button" class="button secondary" id="plan-cancel"></button>
          <button type="button" class="button secondary" id="plan-continue" hidden></button>
          <button type="button" class="button primary" id="plan-review" hidden></button>
        </div>`;
    },
  });
  const root = handle.root;
  const $ = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const steps = $('plan-steps');
  for (const step of BUILD_STEPS) {
    const li = document.createElement('li');
    li.dataset.step = step;
    li.dataset.state = 'waiting';
    li.innerHTML = `<span class="plan-step-icon" aria-hidden="true"></span><span class="plan-step-name"></span><span class="plan-step-detail"></span>`;
    li.querySelector('.plan-step-name')!.textContent = t(`plan.step.${step}`);
    steps.append(li);
  }
  const cancel = $<HTMLButtonElement>('plan-cancel');
  cancel.textContent = t('code.cancel');
  const proceed = $<HTMLButtonElement>('plan-continue');
  const reviewButton = $<HTMLButtonElement>('plan-review');
  reviewButton.textContent = t('plan.review');
  const show = (progress: BuildProgress) => {
    const li = steps.querySelector<HTMLElement>(
      `[data-step="${progress.step}"]`,
    );
    if (!li) return;
    li.dataset.state = progress.state;
    li.querySelector('.plan-step-icon')!.innerHTML =
      progress.state === 'done'
        ? iconSvg('check', 16)
        : progress.state === 'failed'
          ? iconSvg('warning', 16)
          : '';
    li.querySelector('.plan-step-detail')!.textContent = progress.detail ?? '';
  };
  const message = (text: string, state: 'error' | 'ok' | 'warning') => {
    const summary = $('plan-summary');
    summary.hidden = false;
    summary.dataset.state = state;
    summary.textContent = text;
  };
  /** The voice is made once, however often the build runs again. */
  const spokenBefore = new Map<
    string,
    { asset: Asset; duration: number } | null
  >();
  const build = async () => {
    const services = planServices(deps);
    const voice = await planVoiceEngine(plan.meta.language).catch(() => null);
    const theme = plan.meta.themeId
      ? await deps.theme(plan.meta.themeId)
      : null;
    return buildVideoFromPlan(
      plan,
      {
        ...services,
        theme,
        ...(voice
          ? {
              voice: async (text, lang, signal) => {
                const known = `${lang}|${text}`;
                if (spokenBefore.has(known)) return spokenBefore.get(known)!;
                const made = await synthesizeToMedia(text, {
                  provider: voice.provider,
                  voiceId: voice.voiceId,
                  lang,
                  ...(signal ? { signal } : {}),
                });
                const asset = await deps.importFile(
                  new File([made.blob], `Narration.wav`, { type: made.mime }),
                );
                const spoken = asset
                  ? { asset, duration: made.durationSec }
                  : null;
                spokenBefore.set(known, spoken);
                return spoken;
              },
            }
          : { voiceUnavailable: t('plan.noVoice') }),
        sound: async (query, kind) => {
          // A sound effect from our own library catalog when its name fits.
          if (kind === 'sfx') return deps.sfx?.(words(query)) ?? null;
          // FIX7: music is the person's own file (by name), never stock.
          const own = deps
            .assets()
            .find(
              (asset) =>
                asset.type === 'audio' &&
                !(asset.metadata as { removed?: boolean }).removed &&
                namesMatch(asset.name, query),
            );
          return own ? { asset: own, duration: own.duration ?? 0 } : null;
        },
      },
      show,
      controller.signal,
    );
  };
  /** Keeps the video: scenes, the AI card, then the summary. */
  const commit = async (result: PlanBuildResult) => {
    $('plan-missing').hidden = true;
    proceed.hidden = true;
    // FIX7: nothing is added (and Play stays unreachable) until every code
    // animation is rendered; Cancel here leaves nothing behind.
    if (deps.prepare) {
      $('plan-working').hidden = false;
      show({ step: 'prepare', state: 'running', detail: '0%' });
      try {
        await deps.prepare(result.project!, controller.signal, (fraction) =>
          show({
            step: 'prepare',
            state: 'running',
            detail: `${Math.round(fraction * 100)}%`,
          }),
        );
        show({ step: 'prepare', state: 'done' });
      } catch (error) {
        show({ step: 'prepare', state: 'failed' });
        throw error;
      }
      $('plan-working').hidden = true;
    } else show({ step: 'prepare', state: 'skipped' });
    try {
      await deps.onCommit?.();
    } catch (error) {
      console.debug('[plan-build] keeping the card failed', error);
    }
    committed = true;
    finished = true;
    deps.addScenes(result);
    cancel.textContent = t('plan.close');
    cancel.onclick = () => handle.close();
    const banner = $('plan-banner');
    if (result.silent) {
      banner.hidden = false;
      banner.textContent = t('plan.silentBanner', { reason: result.silent });
    }
    const media = Object.keys(result.alternatives).length;
    const summary = $('plan-summary');
    summary.hidden = false;
    summary.dataset.state = result.flags.length ? 'warning' : 'ok';
    const lines = [
      t('plan.summaryScenes', {
        count: String(result.project!.compositions.length),
        seconds: String(
          Math.round(result.durations.reduce((a, b) => a + b, 0)),
        ),
      }),
      t('plan.summaryMedia', {
        found: String(media - result.flags.length),
        total: String(media),
      }),
      ...[...new Set(result.flags.map((flag) => flag.name ?? flag.key))].map(
        (name) => t('plan.summaryFlag', { key: name }),
      ),
    ];
    summary.replaceChildren(
      ...lines.map((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        return p;
      }),
    );
    reviewButton.hidden = false;
    reviewButton.onclick = () => {
      handle.close();
      deps.review(result);
    };
  };
  /** FIX7: the files the plan expects and the person has not added. */
  const askMissing = (result: PlanBuildResult) => {
    // Each file once, however many layers use it.
    const seen = new Set<string>();
    const missing = result.flags.filter((flag) => {
      if (!flag.name) return false;
      const id = `${flag.type ?? 'photo'}:${flag.name}`;
      return seen.has(id) ? false : (seen.add(id), true);
    });
    const box = $('plan-missing');
    box.hidden = false;
    const title = document.createElement('p');
    title.className = 'plan-missing-title';
    title.textContent = t('plan.missingTitle', {
      count: String(missing.length),
    });
    const list = document.createElement('ul');
    list.className = 'plan-missing-list';
    for (const flag of missing) {
      const li = document.createElement('li');
      li.dataset.missing = flag.key;
      const name = document.createElement('strong');
      name.textContent = flag.name!;
      const kind = document.createElement('span');
      kind.textContent = t(`plan.kindOne.${flag.type ?? 'photo'}`);
      li.append(name, ' ', kind);
      list.append(li);
    }
    const hint = document.createElement('p');
    hint.className = 'right-note';
    hint.textContent = t('plan.missingHint');
    box.replaceChildren(title, list, hint);
    $('plan-working').hidden = true;
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'button';
    choose.id = 'plan-choose-files';
    choose.textContent = t('plan.chooseFiles');
    choose.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'image/*,video/*,audio/*';
      input.onchange = async () => {
        const files = [...(input.files ?? [])];
        if (!files.length) return;
        choose.disabled = true;
        for (const file of files) await deps.importFile(file);
        // The build runs again (fast: nothing is searched) with the files in.
        box.hidden = true;
        proceed.hidden = true;
        $('plan-working').hidden = false;
        await run();
      };
      input.click();
    };
    box.append(choose);
    proceed.hidden = false;
    proceed.textContent = t('plan.continueWithout');
    proceed.onclick = () => void guarded(() => commit(result));
  };
  const run = async () => {
    try {
      const result = await build();
      $('plan-working').hidden = true;
      if (!result.project) {
        finished = true;
        cancel.textContent = t('plan.close');
        cancel.onclick = () => handle.close();
        const summary = $('plan-summary');
        summary.hidden = false;
        summary.dataset.state = 'error';
        summary.replaceChildren(
          ...result.errors.slice(0, 8).map((error) => {
            const p = document.createElement('p');
            p.textContent = error;
            return p;
          }),
        );
        await rollback();
        return;
      }
      if (result.flags.some((flag) => flag.name)) askMissing(result);
      else await commit(result);
    } catch (error) {
      await fail(error);
    }
  };
  const fail = async (error: unknown) => {
    {
      finished = true;
      $('plan-working').hidden = true;
      cancel.textContent = t('plan.close');
      cancel.onclick = () => handle.close();
      const aborted = (error as Error)?.name === 'AbortError';
      message(
        aborted
          ? t('plan.cancelled')
          : plainMessage(String((error as Error)?.message ?? error)),
        'error',
      );
      await rollback();
      if (!aborted) deps.report(error);
    }
  };
  const guarded = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      await fail(error);
    }
  };
  cancel.onclick = () => {
    if (finished) handle.close();
    else {
      controller.abort();
      handle.close();
    }
  };
  void (async () => {
    // FIX6: let the dialog (and its spinner) paint before heavy work.
    await new Promise<void>((done) =>
      requestAnimationFrame(() => setTimeout(done)),
    );
    await run();
  })();
  return handle;
}
