// FINAL3 V3: Review & swap, a left side panel for the scenes a plan built.
// Per scene: its length (re-time), order (up, down), Delete and Regenerate,
// the narration (Update voice speaks it again and remakes the captions and
// the scene's timing), and its media layers with their flags, up to four
// alternatives, Search more and Use my own. A swap keeps the layer's place,
// animation and the camera (SET_LAYER_ASSET); a fallback card is replaced
// by regenerating its scene with the chosen media. Export plan downloads the
// plan with every choice (it builds the same video again); Compare to plan
// lists where the project and the plan differ. Every edit is one step.
import { t } from '../i18n';
import type {
  Asset,
  Command,
  Composition,
  DeepReadonly,
  Project,
} from '../core';
import {
  buildVideoFromPlan,
  layerKey,
  mayUse,
  rankCandidates,
  type MediaCandidate,
  type PlanBuildDeps as BuilderDeps,
  type VideoPlan,
} from '../video-plan';
import { createNumberField } from './components/number-field';
import { iconSvg } from './icons';
import { planState, savePlanState, type PlanState } from './plan-state';
import { sceneLengthCommands } from './scene-length';

export interface PlanReviewDeps {
  project(): DeepReadonly<Project>;
  /** FIX6: review the plan built under this title (default: the latest). */
  title?: string;
  run(label: string, commands: Command[]): void;
  /** FINAL3 V4.1: saves the plan's feel as a theme in My themes. */
  saveFeel?(name: string, plan: VideoPlan): Promise<void>;
  /** Adds media records the project lacks (a library change, no step). */
  addAssets(assets: readonly Asset[]): void;
  /** The builder's services (media, voice, sound) for regenerating. */
  services(): Promise<BuilderDeps>;
  /** Imports a candidate (stock is downloaded). */
  importCandidate(candidate: MediaCandidate): Promise<Asset>;
  /** More stock for a layer's intent (page 2 on). */
  searchMore(
    layer: NonNullable<
      VideoPlan['scenes'][number]['layers'][number]['mediaIntent']
    >,
    page: number,
  ): Promise<MediaCandidate[]>;
  /** Picks a file and imports it into Media. */
  pickFile(accept: string): Promise<Asset | null>;
  openScene(id: string): void;
  download(name: string, text: string): void;
  report(error: unknown): void;
  rerender(): void;
  /** A small picture of a scene (its first frame), when available. */
  poster?(sceneId: string): string | undefined;
  /** FIX7: hands out a way to fill missing media from the project's Media. */
  onReady?(api: { fillMissing(): Promise<number> }): void;
}

type Layerish = {
  id: string;
  type: string;
  assetId?: string | null;
  properties: Readonly<Record<string, { value?: unknown }>>;
  children: readonly Layerish[];
};
const allLayers = (composition: DeepReadonly<Composition>): Layerish[] => {
  const list: Layerish[] = [];
  const visit = (layers: readonly Layerish[]) =>
    layers.forEach((layer) => {
      list.push(layer);
      visit(layer.children);
    });
  visit(composition.layers as unknown as Layerish[]);
  return list;
};
const byRef = (composition: DeepReadonly<Composition>, ref: string) =>
  allLayers(composition).find(
    (layer) => layer.properties.planRef?.value === ref,
  );

/** A composition with every id given a suffix (a regenerated scene). */
function withFreshIds<T>(composition: T, suffix: string): T {
  const ids = new Set<string>();
  const collect = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) {
        if (k === 'id' && typeof v === 'string') ids.add(v);
        collect(v);
      }
  };
  collect(composition);
  let text = JSON.stringify(composition);
  for (const id of ids)
    text = text.split(JSON.stringify(id)).join(JSON.stringify(id + suffix));
  return JSON.parse(text) as T;
}

/** The differences between the project and the plan (Compare to plan). */
export function comparePlan(
  project: DeepReadonly<Project>,
  state: PlanState,
): string[] {
  const out: string[] = [];
  // A timeline is one scene: every chapter lives in the first one.
  const timeline = state.plan.meta.build === 'timeline';
  state.plan.scenes.forEach((scene, index) => {
    const id = state.sceneIds[timeline ? 0 : index];
    const composition = project.compositions.find((c) => c.id === id);
    const name = `${t('plan.scene')} ${index + 1} (${scene.id})`;
    if (!composition) {
      out.push(t('plan.diffSceneGone', { name }));
      return;
    }
    for (const layer of scene.layers) {
      const ref = layerKey(scene, layer);
      const built = byRef(composition, ref);
      if (!built) out.push(t('plan.diffLayerGone', { name, layer: layer.id }));
      else if (built.properties.planFlag?.value === 'needs-asset')
        out.push(t('plan.diffNeedsAsset', { name, layer: layer.id }));
    }
  });
  const home = project.compositions.find((c) => c.id === state.sceneIds[0]);
  if (timeline && home)
    for (const layer of state.plan.overlays) {
      const built = byRef(home, layerKey({ id: 'overlay' }, layer));
      if (!built)
        out.push(
          t('plan.diffLayerGone', {
            name: t('plan.overlays'),
            layer: layer.id,
          }),
        );
    }
  const order = state.sceneIds.filter((id): id is string => !!id);
  const actual = project.compositions
    .map((c) => c.id)
    .filter((id) => order.includes(id));
  if (actual.join() !== order.join()) out.push(t('plan.diffOrder'));
  return out.length ? out : [t('plan.diffNone')];
}

/** The slot (per project) whose stock choices are open (transient). */
const swapping = new Map<string, string>();
/** Projects whose Compare to plan list is open (transient). */
const comparing = new Set<string>();
export function planReviewPanel(deps: PlanReviewDeps): HTMLElement | null {
  const project = deps.project();
  const state = planState(project.id, deps.title);
  const root = document.createElement('div');
  root.className = 'plan-review';
  if (!state) {
    const empty = document.createElement('p');
    empty.className = 'right-note';
    empty.textContent = t('plan.reviewEmpty');
    root.append(empty);
    return root;
  }
  const save = () => savePlanState(project.id, state);
  const timeline = state.plan.meta.build === 'timeline';
  const safely = async (action: () => Promise<void> | void) => {
    try {
      await action();
    } catch (error) {
      deps.report(error);
    }
    deps.rerender();
  };
  const button = (
    action: string,
    label: string,
    run: () => Promise<void> | void,
    icon?: string,
  ) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'button secondary sm';
    el.dataset.action = action;
    if (icon) el.innerHTML = iconSvg(icon, 14);
    el.append(document.createTextNode(label));
    el.onclick = () => {
      el.disabled = true;
      void safely(run);
    };
    return el;
  };
  if (state.silent) {
    const banner = document.createElement('p');
    banner.className = 'plan-banner';
    banner.id = 'plan-review-silent';
    banner.textContent = t('plan.silentBanner', { reason: state.silent });
    root.append(banner);
  }
  const compare = document.createElement('ul');
  compare.className = 'plan-compare';
  const showCompare = () => {
    compare.hidden = false;
    compare.replaceChildren(
      ...comparePlan(deps.project(), state).map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
      }),
    );
  };
  compare.hidden = !comparing.has(project.id);
  if (!compare.hidden) showCompare();
  const top = document.createElement('div');
  top.className = 'camera-row';
  top.append(
    button(
      'plan-export',
      t('plan.export'),
      () =>
        deps.download(
          `${state.plan.meta.title.replace(/[^\p{L}\p{N}]+/gu, '-')}.plan.json`,
          `${JSON.stringify(state.plan, null, 2)}\n`,
        ),
      'download',
    ),
    button('plan-compare', t('plan.compare'), () => {
      comparing.add(project.id);
      more.open = true;
      showCompare();
    }),
  );
  // FIX7: the panel says first whether the video still misses media; the
  // plan's own tools (Export, Compare, Save feel) sit under "More".
  const flaggedCount = () => {
    let missing = 0;
    let found = 0;
    state.plan.scenes.forEach((scene, index) => {
      const composition = project.compositions.find(
        (c) => c.id === state.sceneIds[timeline ? 0 : index],
      );
      if (!composition) return;
      for (const layer of scene.layers) {
        if (layer.kind !== 'media' || !layer.mediaIntent) continue;
        const built = byRef(composition, layerKey(scene, layer));
        if (built?.properties.planFlag?.value === 'needs-asset') missing++;
        else found++;
      }
    });
    return { missing, found };
  };
  const counts = flaggedCount();
  const status = document.createElement('p');
  status.className = 'plan-status';
  status.id = 'plan-review-status';
  status.dataset.state = counts.missing ? 'missing' : 'ready';
  status.textContent = counts.missing
    ? t('plan.statusMissing', {
        found: String(counts.found),
        missing: String(counts.missing),
      })
    : t('plan.statusReady');
  const more = document.createElement('details');
  more.className = 'plan-more';
  more.open = comparing.has(project.id);
  const moreSummary = document.createElement('summary');
  moreSummary.textContent = t('plan.more');
  more.append(moreSummary, top, compare);
  root.append(status, more);
  if (deps.saveFeel) {
    const feelRow = document.createElement('div');
    feelRow.className = 'camera-row plan-feel';
    const feelName = document.createElement('input');
    feelName.type = 'text';
    feelName.id = 'plan-feel-name';
    feelName.maxLength = 40;
    feelName.placeholder = t('plan.feelNamePlaceholder');
    feelName.setAttribute('aria-label', t('plan.feelNamePlaceholder'));
    feelName.value = state.plan.meta.title.slice(0, 40);
    feelRow.append(
      feelName,
      button(
        'plan-save-feel',
        t('plan.saveFeel'),
        () => deps.saveFeel!(feelName.value, state.plan),
        'color',
      ),
    );
    more.append(feelRow);
  }

  /** Builds one scene again from the (edited) plan and puts it in place. */
  const regenerate = async (index: number) => {
    // A timeline is built again as a whole; a scene alone otherwise.
    const slot = timeline ? 0 : index;
    const old = state.sceneIds[slot];
    const current = deps.project();
    const at = current.compositions.findIndex((c) => c.id === old);
    if (at < 0) throw new Error(t('plan.sceneGone'));
    const single: VideoPlan = timeline
      ? state.plan
      : { ...state.plan, scenes: [state.plan.scenes[index]!] };
    const result = await buildVideoFromPlan(single, await deps.services());
    if (!result.project)
      throw new Error(result.errors[0] ?? t('plan.buildFailed'));
    const fresh = withFreshIds(
      result.project.compositions[0]!,
      `-r${Date.now().toString(36)}`,
    );
    // (Media imported while building are already in the project.)
    const now = deps.project();
    const missing = result.project.assets.filter(
      (asset) => !now.assets.some((have) => have.id === asset.id),
    );
    Object.assign((state.plan.resolved ??= {}), result.resolved);
    for (const [k, v] of Object.entries(result.alternatives))
      state.alternatives[k] = [...v];
    state.flags = [
      ...(timeline
        ? []
        : state.flags.filter(
            (flag) => !flag.key.startsWith(`${single.scenes[0]!.id}/`),
          )),
      ...result.flags,
    ];
    deps.addAssets(missing);
    deps.run('Regenerate scene', [
      { type: 'CREATE_COMPOSITION', composition: fresh } as unknown as Command,
      {
        type: 'MOVE_COMPOSITION',
        compositionId: fresh.id,
        index: at,
      } as unknown as Command,
      { type: 'DELETE_COMPOSITION', compositionId: old } as unknown as Command,
    ]);
    // (Only once the scene is really in place.)
    if (deps.project().compositions.some((c) => c.id === fresh.id)) {
      state.sceneIds[slot] = fresh.id;
      save();
    }
    deps.openScene(fresh.id);
  };

  type Slot = {
    scene: VideoPlan['scenes'][number];
    layer: VideoPlan['scenes'][number]['layers'][number];
    index: number;
    ref: string;
    composition: DeepReadonly<Composition>;
    built: ReturnType<typeof byRef>;
    flagged: boolean;
  };
  const slotFor = (ref: string): Slot | null => {
    for (const [index, scene] of state.plan.scenes.entries()) {
      const composition = project.compositions.find(
        (c) => c.id === state.sceneIds[timeline ? 0 : index],
      );
      if (!composition) continue;
      for (const layer of scene.layers) {
        if (layer.kind !== 'media' || !layer.mediaIntent) continue;
        if (layerKey(scene, layer) !== ref) continue;
        const built = byRef(composition, ref);
        return {
          scene,
          layer,
          index,
          ref,
          composition,
          built,
          flagged: built?.properties.planFlag?.value === 'needs-asset',
        };
      }
    }
    return null;
  };
  const choose = async (slot: Slot, candidate: MediaCandidate) => {
    swapping.delete(project.id);
    (state.plan.resolved ??= {})[slot.ref] = candidate.key;
    save();
    const target = slot.built && !slot.flagged ? slot.built : null;
    if (!target) return regenerate(slot.index);
    const asset = await deps.importCandidate(candidate);
    if (asset.type !== target.type) return regenerate(slot.index);
    deps.run('Swap media', [
      {
        type: 'SET_LAYER_ASSET',
        compositionId: slot.composition.id,
        layerId: target.id,
        assetId: asset.id,
      } as unknown as Command,
    ]);
  };
  const useOwn = (slot: Slot) =>
    button(
      'plan-use-own',
      slot.flagged ? t('plan.chooseFile') : t('plan.useOwn'),
      async () => {
        const asset = await deps.pickFile(
          slot.layer.mediaIntent!.type === 'video' ? 'video/*' : 'image/*',
        );
        if (!asset) return;
        await choose(slot, {
          key: `asset:${asset.id}`,
          source: 'asset',
          kind: asset.type === 'video' ? 'video' : 'image',
          title: asset.name,
          tags: [],
          width: asset.width ?? 0,
          height: asset.height ?? 0,
        });
      },
      'upload',
    );
  const sceneThumb = (id: string) => {
    const wrap = document.createElement('div');
    wrap.className = 'plan-scene-thumb';
    const url = deps.poster?.(id);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      wrap.append(img);
    }
    return wrap;
  };

  // The swap view: one slot's stock choices, replacing the list until done.
  const swapRef = swapping.get(project.id);
  const swapSlot = swapRef ? slotFor(swapRef) : null;
  if (swapRef && !swapSlot) swapping.delete(project.id);
  if (swapSlot) {
    const view = document.createElement('div');
    view.className = 'plan-swap';
    view.dataset.planLayer = swapSlot.ref;
    const bar = document.createElement('header');
    bar.className = 'plan-swap-head';
    const back = button('plan-swap-back', t('plan.back'), () => {
      swapping.delete(project.id);
    });
    const heading = document.createElement('h4');
    heading.textContent = `${t('plan.swapTitle')}: ${swapSlot.layer.mediaIntent!.query}`;
    bar.append(back, heading);
    const grid = document.createElement('div');
    grid.className = 'plan-alternatives';
    const current = state.plan.resolved?.[swapSlot.ref];
    const options = (state.alternatives[swapSlot.ref] ?? []).slice(
      0,
      4 + 4 * (state.pages[swapSlot.ref] ?? 0),
    );
    if (!options.length) {
      const none = document.createElement('p');
      none.className = 'right-note';
      none.textContent = t('plan.noStock');
      grid.append(none);
    }
    for (const candidate of options) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'plan-alternative';
      option.dataset.candidate = candidate.key;
      option.setAttribute('aria-pressed', String(candidate.key === current));
      option.title = candidate.title;
      option.setAttribute('aria-label', candidate.title);
      if (candidate.thumbUrl) {
        const img = document.createElement('img');
        img.src = candidate.thumbUrl;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        option.append(img);
      } else option.textContent = candidate.title.slice(0, 24);
      option.onclick = () => {
        option.disabled = true;
        void safely(() => choose(swapSlot, candidate));
      };
      grid.append(option);
    }
    const actions = document.createElement('div');
    actions.className = 'plan-swap-actions';
    actions.append(
      button(
        'plan-search-more',
        t('plan.searchMore'),
        async () => {
          const page = (state.pages[swapSlot.ref] ?? 0) + 2;
          const more = await deps.searchMore(swapSlot.layer.mediaIntent!, page);
          const known = new Set(
            (state.alternatives[swapSlot.ref] ?? []).map((c) => c.key),
          );
          state.alternatives[swapSlot.ref] = [
            ...(state.alternatives[swapSlot.ref] ?? []),
            ...more.filter((c) => !known.has(c.key)).slice(0, 4),
          ];
          state.pages[swapSlot.ref] = page - 1;
          save();
        },
        'search',
      ),
      useOwn(swapSlot),
    );
    view.append(bar, grid, actions);
    const wrap = document.createElement('div');
    wrap.className = 'plan-review';
    wrap.append(view);
    return wrap;
  }

  if (timeline) {
    const note = document.createElement('p');
    note.className = 'right-note';
    note.id = 'plan-timeline-note';
    note.textContent = t('plan.timelineNote');
    root.append(note);
  }
  state.plan.scenes.forEach((scene, index) => {
    const id = state.sceneIds[timeline ? 0 : index];
    const composition = project.compositions.find((c) => c.id === id);
    const card = document.createElement('section');
    card.className = 'plan-scene';
    card.dataset.planScene = scene.id;
    const mediaLayers = scene.layers.filter(
      (layer) => layer.kind === 'media' && layer.mediaIntent,
    );
    const head = document.createElement('header');
    head.className = 'plan-scene-head';
    const titleBox = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = `${index + 1}. ${scene.title ?? scene.id}`;
    const meta = document.createElement('span');
    meta.className = 'plan-scene-meta';
    meta.textContent = composition
      ? t('plan.sceneMeta', {
          seconds: composition.duration.toFixed(1),
          media: String(mediaLayers.length),
        })
      : '';
    titleBox.append(title, meta);
    head.append(composition ? sceneThumb(composition.id) : '', titleBox);
    card.append(head);
    if (!composition) {
      const gone = document.createElement('p');
      gone.className = 'right-note';
      gone.textContent = t('plan.sceneGone');
      card.append(gone);
      root.append(card);
      return;
    }
    head.onclick = () => deps.openScene(composition.id);
    // Media slots: a picture, its name, whether it was found, one action.
    for (const layer of mediaLayers) {
      const ref = layerKey(scene, layer);
      const slot = slotFor(ref);
      if (!slot) continue;
      const row = document.createElement('div');
      row.className = 'plan-layer';
      row.dataset.planLayer = ref;
      row.dataset.flag = slot.flagged ? 'needs-asset' : 'ok';
      const thumb = document.createElement('div');
      thumb.className = 'plan-slot-thumb';
      const chosenKey = state.plan.resolved?.[ref];
      const chosen = (state.alternatives[ref] ?? []).find(
        (c) => c.key === chosenKey,
      );
      if (chosen?.thumbUrl && !slot.flagged) {
        const img = document.createElement('img');
        img.src = chosen.thumbUrl;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        thumb.append(img);
      } else thumb.textContent = t(`plan.type.${layer.mediaIntent!.type}`);
      const text = document.createElement('div');
      text.className = 'plan-slot-text';
      const name = document.createElement('b');
      name.className = 'plan-layer-name';
      name.textContent = chosen?.title ?? layer.mediaIntent!.query;
      const state2 = document.createElement('span');
      state2.className = slot.flagged ? 'plan-flag' : 'plan-found';
      state2.textContent = slot.flagged ? t('plan.missing') : t('plan.found');
      text.append(name, state2);
      row.append(thumb, text);
      if (slot.flagged) {
        const own = useOwn(slot);
        own.classList.add('primary');
        const find = button('plan-swap', t('plan.findStock'), () => {
          swapping.set(project.id, ref);
        });
        find.classList.add('ghost');
        const actions = document.createElement('div');
        actions.className = 'plan-slot-actions';
        actions.append(own, find);
        row.append(actions);
      } else {
        row.append(
          button('plan-swap', t('plan.swap'), () => {
            swapping.set(project.id, ref);
          }),
        );
      }
      card.append(row);
    }
    // Everything else about the scene sits under one fold.
    const options = document.createElement('details');
    options.className = 'plan-scene-options';
    const summary = document.createElement('summary');
    summary.textContent = t('plan.sceneOptions');
    options.append(summary);
    const narration = document.createElement('textarea');
    narration.className = 'plan-narration';
    narration.id = `plan-narration-${scene.id}`;
    narration.rows = 3;
    narration.value = scene.narration ?? '';
    narration.setAttribute('aria-label', t('plan.narration'));
    if (!timeline) {
      const controls = document.createElement('div');
      controls.className = 'camera-row';
      controls.append(
        createNumberField({
          id: `plan-length-${scene.id}`,
          label: t('plan.length'),
          value: composition.duration,
          unit: 's',
          min: 0.5,
          max: 180,
          step: 0.1,
          decimals: 1,
          onCommit: (value) =>
            void safely(() =>
              deps.run(
                'Scene length',
                sceneLengthCommands(
                  { composition, assets: project.assets } as never,
                  value,
                ),
              ),
            ),
          onInvalid: (message) => deps.report(new RangeError(message)),
        }),
        button(
          'plan-up',
          t('plan.up'),
          () => {
            const at = deps
              .project()
              .compositions.findIndex((c) => c.id === composition.id);
            if (at > 0)
              deps.run('Move scene', [
                {
                  type: 'MOVE_COMPOSITION',
                  compositionId: composition.id,
                  index: at - 1,
                } as unknown as Command,
              ]);
          },
          'arrowUp',
        ),
        button(
          'plan-down',
          t('plan.down'),
          () => {
            const list = deps.project().compositions;
            const at = list.findIndex((c) => c.id === composition.id);
            if (at >= 0 && at < list.length - 1)
              deps.run('Move scene', [
                {
                  type: 'MOVE_COMPOSITION',
                  compositionId: composition.id,
                  index: at + 1,
                } as unknown as Command,
              ]);
          },
          'arrowDown',
        ),
        button(
          'plan-delete',
          t('plan.delete'),
          () => {
            deps.run('Delete scene', [
              {
                type: 'DELETE_COMPOSITION',
                compositionId: composition.id,
              } as unknown as Command,
            ]);
            state.sceneIds[index] = null;
            save();
          },
          'delete',
        ),
        button(
          'plan-regenerate',
          t('plan.regenerate'),
          () => regenerate(index),
          'magic',
        ),
      );
      options.append(
        controls,
        narration,
        button(
          'plan-voice',
          t('plan.updateVoice'),
          async () => {
            const text = narration.value.trim();
            state.plan.scenes[index] = {
              ...scene,
              ...(text ? { narration: text } : { narration: undefined }),
            } as VideoPlan['scenes'][number];
            save();
            await regenerate(index);
          },
          'audio',
        ),
      );
      card.append(options);
    }
    root.append(card);
  });
  // FIX7: a file added to Media later fills the slot that waits for it, when
  // its name holds the slot's words (the same rule as the build).
  deps.onReady?.({
    fillMissing: async () => {
      let filled = 0;
      const services = await deps.services();
      for (const [index, scene] of state.plan.scenes.entries()) {
        const composition = deps
          .project()
          .compositions.find(
            (c) => c.id === state.sceneIds[timeline ? 0 : index],
          );
        if (!composition) continue;
        for (const layer of scene.layers) {
          if (layer.kind !== 'media' || !layer.mediaIntent) continue;
          const ref = layerKey(scene, layer);
          const flagged =
            byRef(composition, ref)?.properties.planFlag?.value ===
            'needs-asset';
          if (!flagged) continue;
          const { query, type, orientation } = layer.mediaIntent;
          const found = rankCandidates(
            services.resolve.local(query, type),
            query,
            type,
            orientation,
          ).find((candidate) => mayUse(candidate, query));
          if (!found) continue;
          const slot = slotFor(ref);
          if (!slot) continue;
          await choose(slot, found);
          filled++;
          break; // (the scene was rebuilt: look at the next scene)
        }
      }
      return filled;
    },
  });
  return root;
}
