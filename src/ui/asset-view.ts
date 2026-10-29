// FIX9: the in-panel asset view (Canva's Templates: open a template and its
// elements appear in the same left panel). A saved scene in My Templates and
// an AI composition both open it: a Back button and the name on top, a
// two-column grid of every asset with its own thumbnail and "Name (Kind)"
// under it. A click adds the asset to the canvas; a drag works too. The view
// scrolls inside the panel. Review & swap is a second page of the same view.
import { t } from '../i18n';
import { drags, type DragPayload } from './drag-controller';
import { iconSvg } from './icons';

export interface AssetViewPart {
  readonly id: string;
  readonly name: string;
  /** The kind's label ("Shape", "Animation" …), shown in brackets. */
  readonly kindLabel: string;
  /** Fills the thumbnail slot. */
  thumb(slot: HTMLElement): void;
  drag(): DragPayload | null;
}
export interface AssetViewAction {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly primary?: boolean;
  run(): void;
}
export interface AssetViewOptions {
  readonly title: string;
  /** A line under the title (status, counts). */
  readonly subtitle?: string;
  readonly parts: readonly AssetViewPart[];
  add(id: string): void;
  back(): void;
  readonly actions?: readonly AssetViewAction[];
  /** The Review & swap page: fills `host`. Absent: no such button. */
  readonly review?: (host: HTMLElement) => void;
  /** Open on the review page. */
  readonly startInReview?: boolean;
  /** The page changed (true: Review & swap), so a redraw can keep it. */
  readonly onPage?: (review: boolean) => void;
  readonly emptyTitle: string;
  readonly emptyText: string;
  report(error: unknown): void;
}
export interface AssetView {
  readonly element: HTMLElement;
  dispose(): void;
}

export function buildAssetView(options: AssetViewOptions): AssetView {
  const root = document.createElement('div');
  root.className = 'asset-view';
  root.dataset.assetView = 'true';
  let stops: (() => void)[] = [];
  let reviewing = false;

  const head = document.createElement('div');
  head.className = 'asset-view-head';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'icon-button asset-view-back';
  back.dataset.action = 'asset-view-back';
  back.innerHTML = iconSvg('chevronLeft', 18);
  back.title = t('assetView.back');
  back.setAttribute('aria-label', t('assetView.back'));
  const titles = document.createElement('div');
  titles.className = 'asset-view-titles';
  const title = document.createElement('h3');
  title.className = 'asset-view-title';
  title.textContent = options.title;
  title.title = options.title;
  titles.append(title);
  if (options.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'asset-view-subtitle';
    sub.textContent = options.subtitle;
    titles.append(sub);
  }
  head.append(back, titles);

  const actions = document.createElement('div');
  actions.className = 'asset-view-actions';
  const makeAction = (action: AssetViewAction) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button ${action.primary ? 'primary' : ''}`.trim();
    button.dataset.action = action.id;
    button.innerHTML = `${iconSvg(action.icon, 16)}<span></span>`;
    button.querySelector('span')!.textContent = action.label;
    button.onclick = () => {
      try {
        action.run();
      } catch (error) {
        options.report(error);
      }
    };
    return button;
  };
  const reviewButton = options.review
    ? makeAction({
        id: 'asset-view-review',
        label: t('sceneParts.review'),
        icon: 'replace',
        run: () => show(true),
      })
    : null;
  actions.append(
    ...(options.actions ?? []).map(makeAction),
    ...(reviewButton ? [reviewButton] : []),
  );
  actions.hidden = !actions.childElementCount;

  const body = document.createElement('div');
  body.className = 'asset-view-body';
  root.append(head, actions, body);

  const stopAll = () => {
    for (const stop of stops) stop();
    stops = [];
  };
  const card = (part: AssetViewPart) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'asset-card';
    button.dataset.part = part.id;
    button.dataset.kind = part.kindLabel;
    const label = `${part.name} (${part.kindLabel})`;
    button.title = `${label} · ${t('sceneParts.dragHint')}`;
    const thumb = document.createElement('span');
    thumb.className = 'asset-thumb';
    part.thumb(thumb);
    const name = document.createElement('span');
    name.className = 'asset-name';
    name.textContent = label;
    button.append(thumb, name);
    button.onclick = () => {
      try {
        options.add(part.id);
      } catch (error) {
        options.report(error);
      }
    };
    stops.push(drags().source(button, () => part.drag()));
    return button;
  };
  function show(review: boolean) {
    reviewing = review;
    options.onPage?.(review);
    stopAll();
    root.dataset.page = review ? 'review' : 'assets';
    if (reviewButton) reviewButton.hidden = review;
    if (review && options.review) {
      const host = document.createElement('div');
      host.className = 'asset-review';
      options.review(host);
      body.replaceChildren(host);
      return;
    }
    if (!options.parts.length) {
      const empty = document.createElement('div');
      empty.className = 'asset-view-empty';
      empty.innerHTML = '<h4></h4><p></p>';
      empty.querySelector('h4')!.textContent = options.emptyTitle;
      empty.querySelector('p')!.textContent = options.emptyText;
      body.replaceChildren(empty);
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'asset-grid';
    grid.append(...options.parts.map(card));
    body.replaceChildren(grid);
  }
  back.onclick = () => {
    if (reviewing && options.review) show(false);
    else options.back();
  };
  show(!!options.startInReview && !!options.review);
  return {
    element: root,
    dispose: stopAll,
  };
}
