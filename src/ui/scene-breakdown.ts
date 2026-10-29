// FIX7: the My Templates scene breakdown. Clicking a saved scene's card
// opens this side panel instead of dropping the scene: the scene's poster,
// how many of its parts were made by AI, are code animations, come from
// Media or are the editor's own, every part in its real format (each one
// can be added to the canvas or dragged on its own), and Review & swap for
// the parts that play a file (replace the file inside the saved scene, with
// no rebuild). Dragging the card itself still drops the whole scene.
import { t } from '../i18n';
import { drags } from './drag-controller';
import { iconSvg } from './icons';
import type { MyLibrary } from './my-library';
import {
  partItem,
  sceneCounts,
  sceneParts,
  swapPartAsset,
  swappable,
  type PartOrigin,
} from './scene-parts';
import type { Asset } from '../core';

export interface SceneBreakdownDeps {
  readonly library: MyLibrary;
  /** Adds one part (a saved-item record id) to the scene. */
  add(itemId: string): void;
  /** Adds the whole scene (asks replace / add / new like Templates). */
  addScene(id: string): void;
  pickFile(accept: string): Promise<Asset | null>;
  report(error: unknown): void;
  toast(text: string): void;
}

const ORIGINS: readonly PartOrigin[] = ['ai', 'code', 'media', 'own'];

export function openSceneBreakdown(
  id: string,
  deps: SceneBreakdownDeps,
): { close(): void } {
  document.querySelector('.scene-breakdown')?.remove();
  const root = document.createElement('aside');
  root.className = 'scene-breakdown';
  root.dataset.scene = id;
  root.setAttribute('aria-label', t('sceneParts.title'));
  const anchor = document.querySelector('.library');
  const place = () => {
    const box = anchor?.getBoundingClientRect();
    root.style.left = `${Math.round((box?.right ?? 80) + 8)}px`;
  };
  place();
  let stopDrags: (() => void)[] = [];
  const offLibrary = deps.library.onChange(() => render());
  // The panel belongs to My Templates: it goes when that category is left.
  const watch = window.setInterval(() => {
    const mine = document.querySelector<HTMLElement>('#library-mine');
    if (!mine || mine.offsetParent === null) close();
  }, 400);
  const close = () => {
    for (const stop of stopDrags) stop();
    offLibrary();
    window.clearInterval(watch);
    window.removeEventListener('resize', place);
    window.removeEventListener('keydown', onKey, true);
    root.remove();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  window.addEventListener('resize', place);
  window.addEventListener('keydown', onKey, true);

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

  function render() {
    for (const stop of stopDrags) stop();
    stopDrags = [];
    const item = deps.library.list().find((entry) => entry.id === id);
    const template = item?.scene;
    if (!item || !template) {
      close();
      return;
    }
    const parts = sceneParts(template);
    deps.library.setParts(parts.map((part) => partItem(template, part)));
    const counts = sceneCounts(parts);

    const head = el('div', 'scene-breakdown-head');
    head.append(el('h3', 'scene-breakdown-title', item.name));
    const closeButton = el('button', 'scene-breakdown-close');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', t('sceneParts.close'));
    closeButton.innerHTML = iconSvg('close', 16);
    closeButton.onclick = close;
    head.append(closeButton);

    const poster = el('div', 'scene-breakdown-poster');
    poster.style.aspectRatio = `${template.width} / ${template.height}`;
    if (template.poster) {
      const image = el('img');
      image.src = template.poster;
      image.alt = '';
      image.draggable = false;
      poster.append(image);
    }

    const chips = el('div', 'scene-breakdown-counts');
    for (const origin of ORIGINS) {
      const chip = el('span', 'scene-count');
      chip.dataset.origin = origin;
      chip.textContent = t(`sceneParts.origin.${origin}`, {
        count: String(counts[origin]),
      });
      chips.append(chip);
    }

    const addAll = el('button', 'btn btn-primary', t('sceneParts.addScene'));
    addAll.type = 'button';
    addAll.dataset.action = 'scene-add-all';
    addAll.onclick = () => deps.addScene(id);

    const list = el('ul', 'scene-parts');
    list.setAttribute('aria-label', t('sceneParts.items'));
    for (const part of parts) {
      const row = el('li', 'scene-part');
      row.dataset.part = part.layer.id;
      row.dataset.origin = part.origin;
      row.dataset.kind = part.kind;
      row.title = t('sceneParts.dragHint');
      const kind = el('span', 'scene-part-kind', t(`mine.kind.${part.kind}`));
      const name = el('span', 'scene-part-name', part.layer.name);
      const plus = el('button', 'scene-part-add');
      plus.type = 'button';
      plus.title = t('shelf.addToSceneShort');
      plus.setAttribute('aria-label', t('shelf.addToSceneShort'));
      plus.innerHTML = iconSvg('plus', 16);
      plus.onclick = (event) => {
        event.stopPropagation();
        try {
          deps.add(part.itemId);
        } catch (error) {
          deps.report(error);
        }
      };
      row.append(kind, name, plus);
      row.onclick = () => plus.click();
      stopDrags.push(
        drags().source(row, () => ({
          kind: 'saved' as const,
          id: part.itemId,
          name: part.layer.name,
        })),
      );
      list.append(row);
    }

    const review = el('section', 'scene-review');
    review.append(el('h4', '', t('sceneParts.review')));
    const swaps = swappable(parts);
    if (!swaps.length) {
      review.append(el('p', 'scene-review-empty', t('sceneParts.reviewNone')));
    } else {
      const missing = swaps.filter((part) => !part.asset).length;
      review.append(
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
          'btn',
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
        review.append(row);
      }
    }
    root.replaceChildren(head, poster, chips, addAll, list, review);
  }
  render();
  document.body.append(root);
  return { close };
}
