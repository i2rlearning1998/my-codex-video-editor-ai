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
import { SOUND_PACK, encodeWav, soundSamples } from '../audio/sound-pack';
import { synthesizeToMedia } from '../speech';
import type { Theme } from '../themes/themes';
import {
  BUILD_STEPS,
  buildVideoFromPlan,
  type BuildProgress,
  type MediaCandidate,
  type PlanBuildResult,
  type ResolveServices,
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
  /** A built-in or saved theme by id. */
  theme(id: string): Promise<Theme | null>;
  /** Adds the built scenes in one step and opens the first. */
  addScenes(result: PlanBuildResult): void;
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
  deps: Pick<PlanBuildDeps, 'assets' | 'importFile'>,
) {
  const resolve: ResolveServices = {
    local: (query, type) => {
      const wanted = words(query);
      return deps
        .assets()
        .filter(
          (asset) =>
            (asset.type === 'image' || asset.type === 'video') &&
            (type === 'video') === (asset.type === 'video') &&
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
          kind: asset.type === 'video' ? 'video' : 'image',
          title: asset.name,
          tags: [],
          width: asset.width ?? 0,
          height: asset.height ?? 0,
        }));
    },
    stock: async (query, type, orientation, page) => {
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
  const handle = openModal({
    titleText: t('plan.buildTitle', { name: plan.meta.title }),
    persistent: true,
    onClose: () => {
      if (!finished) controller.abort();
    },
    bodyBuilder: (body) => {
      body.classList.add('plan-build');
      body.innerHTML = `<ol class="plan-steps" id="plan-steps"></ol>
        <p class="plan-banner" id="plan-banner" role="status" hidden></p>
        <div class="plan-summary" id="plan-summary" hidden></div>
        <div class="modal-actions">
          <button type="button" class="button secondary" id="plan-cancel"></button>
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
  cancel.onclick = () => {
    if (finished) handle.close();
    else controller.abort();
  };
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
  void (async () => {
    try {
      const services = planServices(deps);
      const voice = await planVoiceEngine(plan.meta.language).catch(() => null);
      const theme = plan.meta.themeId
        ? await deps.theme(plan.meta.themeId)
        : null;
      const result = await buildVideoFromPlan(
        plan,
        {
          ...services,
          theme,
          ...(voice
            ? {
                voice: async (text, lang, signal) => {
                  const made = await synthesizeToMedia(text, {
                    provider: voice.provider,
                    voiceId: voice.voiceId,
                    lang,
                    ...(signal ? { signal } : {}),
                  });
                  const asset = await deps.importFile(
                    new File([made.blob], `Narration.wav`, { type: made.mime }),
                  );
                  return asset ? { asset, duration: made.durationSec } : null;
                },
              }
            : { voiceUnavailable: t('plan.noVoice') }),
          sound: async (query, kind, signal) => {
            // A sound effect from the built-in sound pack when its name fits.
            if (kind === 'sfx') {
              const wanted = words(query);
              const sound = SOUND_PACK.find((item) =>
                wanted.some((word) => item.id.includes(word)),
              );
              if (sound) {
                const asset = await deps.importFile(
                  new File(
                    [encodeWav(soundSamples(sound)) as BlobPart],
                    `${sound.id}.wav`,
                    {
                      type: 'audio/wav',
                    },
                  ),
                );
                if (asset) return { asset, duration: sound.duration };
              }
            }
            const provider = stockProvidersFor('stock-audio').find(hasKeys);
            if (!provider) return null;
            const found = await provider.search({
              kind: 'stock-audio',
              query,
              perPage: 6,
              ...(signal ? { signal } : {}),
            });
            const item = found.items[0];
            if (!item) return null;
            const got = await importStockItem(
              item,
              stockQuality(item),
              signal ? { signal } : {},
            );
            const asset = await deps.importFile(
              new File([got.blob], got.name, { type: got.mime }),
              got.licenseMeta,
            );
            return asset
              ? { asset, duration: item.durationSec || asset.duration || 0 }
              : null;
          },
        },
        show,
        controller.signal,
      );
      finished = true;
      cancel.textContent = t('plan.close');
      if (!result.project) {
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
        return;
      }
      deps.addScenes(result);
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
          count: String(result.project.compositions.length),
          seconds: String(
            Math.round(result.durations.reduce((a, b) => a + b, 0)),
          ),
        }),
        t('plan.summaryMedia', {
          found: String(media - result.flags.length),
          total: String(media),
        }),
        ...result.flags.map((flag) =>
          t('plan.summaryFlag', { key: flag.key, reason: flag.reason }),
        ),
        ...result.warnings
          .filter(
            (warning) =>
              !result.flags.some((flag) => warning.startsWith(flag.key)),
          )
          .slice(0, 6),
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
    } catch (error) {
      finished = true;
      cancel.textContent = t('plan.close');
      const summary = $('plan-summary');
      summary.hidden = false;
      summary.dataset.state = 'error';
      summary.textContent =
        (error as Error)?.name === 'AbortError'
          ? t('plan.cancelled')
          : plainMessage(String((error as Error)?.message ?? error));
      if ((error as Error)?.name !== 'AbortError') deps.report(error);
    }
  })();
  return handle;
}
