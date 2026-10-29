// FIX9: the asset view of a saved scene (My Templates). Clicking the scene's
// card opens it in the same left panel: every part of the scene as a card
// with its own thumbnail and "Name (Kind)", a click or a drag adds that part
// on its own, "Add whole scene…" drops the scene (replace / add / new, like
// Templates), and Review & swap replaces a media file inside the saved scene
// without a rebuild. Also home to the helpers the AI composition view shares
// (part cards, the review page).
import { t } from '../i18n';
import type { Asset } from '../core';
import type { FrameProvider } from '../render/adapter';
import { buildAssetView, type AssetViewPart } from './asset-view';
import { iconSvg } from './icons';
import type { Shelf } from './library-shelf';
import type { MyLibrary } from './my-library';
import type { MyTemplate } from './my-templates';
import { drawPartThumb } from './part-thumb';
import {
  partItem,
  sceneParts,
  swapPartAsset,
  swappable,
  type ScenePart,
} from './scene-parts';

export interface SceneViewDeps {
  readonly library: MyLibrary;
  readonly shelf: Shelf;
  /** Adds one part (a saved-item record id) to the scene. */
  add(itemId: string): void;
  /** Adds the whole scene (asks replace / add / new like Templates). */
  addScene(id: string): void;
  pickFile(accept: string): Promise<Asset | null>;
  frames(): FrameProvider | undefined;
  report(error: unknown): void;
  toast(text: string): void;
}

const cameraPart = (part: ScenePart) =>
  part.layer.properties.role?.value === 'camera';
/** The word in brackets: audio and camera moves are not "Video" or "Shape". */
const labelKind = (part: ScenePart) =>
  part.layer.type === 'audio'
    ? 'audio'
    : cameraPart(part)
      ? 'camera'
      : part.kind;

/** A part's own picture: drawn alone; redrawn once its pictures have decoded. */
export function partThumb(
  slot: HTMLElement,
  template: MyTemplate,
  part: ScenePart,
  frames: FrameProvider | undefined,
) {
  // Sound and camera moves have no picture: an icon stands for them.
  const icon =
    part.layer.type === 'audio' ? 'audio' : cameraPart(part) ? 'camera' : null;
  if (icon) {
    slot.classList.add('asset-thumb-icon');
    slot.innerHTML = iconSvg(icon, 40);
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  canvas.dataset.thumb = 'part';
  slot.append(canvas);
  const paint = () => {
    try {
      drawPartThumb(
        canvas,
        template.scene,
        template.assets,
        part.layer,
        frames,
      );
    } catch {
      /* A part that cannot be drawn keeps its empty tile. */
    }
  };
  paint();
  if (part.layer.assetId)
    for (const wait of [350, 1200, 3000]) window.setTimeout(paint, wait);
}

export const partCards = (
  entries: readonly { template: MyTemplate; part: ScenePart }[],
  frames: FrameProvider | undefined,
): AssetViewPart[] =>
  entries.map(({ template, part }) => ({
    id: part.itemId,
    name: part.layer.name,
    kindLabel: t(`mine.kind.${labelKind(part)}`),
    thumb: (slot) => partThumb(slot, template, part, frames),
    drag: () => ({
      kind: 'saved' as const,
      id: part.itemId,
      name: part.layer.name,
    }),
  }));

/** The media a scene plays: found or missing, each with a Swap button. */
export function renderSceneReview(
  host: HTMLElement,
  template: MyTemplate,
  parts: readonly ScenePart[],
  deps: Pick<SceneViewDeps, 'library' | 'pickFile' | 'report' | 'toast'>,
  id: string,
) {
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className = '',
    text = '',
  ) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const swaps = swappable(parts);
  if (!swaps.length) {
    host.append(el('p', 'scene-review-empty', t('sceneParts.reviewNone')));
    return;
  }
  const missing = swaps.filter((part) => !part.asset).length;
  host.append(
    el(
      'p',
      'scene-review-status',
      t('sceneParts.reviewStatus', {
        found: String(swaps.length - missing),
        missing: String(missing),
      }),
    ),
  );
  for (const part of swaps) {
    const row = el('div', 'scene-review-row');
    row.dataset.state = part.asset ? 'found' : 'missing';
    row.dataset.part = part.layer.id;
    const label = el(
      'span',
      'scene-review-name',
      part.asset?.name ?? part.layer.name,
    );
    const state = el(
      'span',
      'scene-review-state',
      t(part.asset ? 'sceneParts.found' : 'sceneParts.missing'),
    );
    const button = el(
      'button',
      'button',
      t(part.asset ? 'sceneParts.swap' : 'sceneParts.choose'),
    );
    button.type = 'button';
    button.dataset.action = 'scene-swap';
    button.onclick = async () => {
      try {
        const type = part.asset?.type ?? part.layer.type;
        const asset = await deps.pickFile(
          type === 'audio'
            ? 'audio/*'
            : type === 'image'
              ? 'image/*'
              : 'video/*,image/*',
        );
        if (!asset) return;
        const next = swapPartAsset(template, part.layer.id, asset);
        if (!next) {
          deps.toast(t('sceneParts.wrongKind'));
          return;
        }
        await deps.library.updateScene(id, next);
        deps.toast(t('sceneParts.swapped', { name: asset.name }));
      } catch (error) {
        deps.report(error);
      }
    };
    row.append(label, state, button);
    host.append(row);
  }
}

/** Does the saved scene have anything Review & swap can show? */
export const hasReview = (template: MyTemplate): boolean => {
  const parts = sceneParts(template);
  return swappable(parts).length > 0 || parts.some((p) => p.origin === 'ai');
};

let current: (() => void) | null = null;

/** Opens the saved scene's asset view in the My Templates panel. */
export function openSceneView(
  id: string,
  deps: SceneViewDeps,
  review = false,
): void {
  current?.();
  const close = () => {
    offLibrary();
    view?.dispose();
    deps.shelf.closeDetail();
    if (current === close) current = null;
  };
  let view: ReturnType<typeof buildAssetView> | null = null;
  let page = review;
  const render = () => {
    view?.dispose();
    const item = deps.library.list().find((entry) => entry.id === id);
    const template = item?.scene;
    if (!item || !template) {
      close();
      return;
    }
    const parts = sceneParts(template);
    deps.library.setParts(parts.map((part) => partItem(template, part)));
    view = buildAssetView({
      title: item.name,
      subtitle: t('assetView.items', { count: String(parts.length) }),
      parts: partCards(
        parts.map((part) => ({ template, part })),
        deps.frames(),
      ),
      add: deps.add,
      back: close,
      actions: [
        {
          id: 'scene-add-all',
          label: t('sceneParts.addScene'),
          icon: 'plus',
          primary: true,
          run: () => deps.addScene(id),
        },
      ],
      review: (host) => renderSceneReview(host, template, parts, deps, id),
      startInReview: page && hasReview(template),
      onPage: (value) => {
        page = value;
      },
      emptyTitle: t('assetView.empty.title'),
      emptyText: t('assetView.empty.text'),
      report: deps.report,
    });
    deps.shelf.openDetail(view.element);
  };
  // A swapped file updates the saved scene: the view redraws on the same page.
  const offLibrary = deps.library.onChange(() => {
    if (deps.shelf.detailOpen) render();
  });
  current = close;
  render();
}

export const closeSceneView = () => current?.();
