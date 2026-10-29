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

/** Layers whose stock choices were asked for (transient). */
const stockOpen = new Set<string>();
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
    const head = document.createElement('header');
    const title = document.createElement('h4');
    title.textContent = `${index + 1}. ${scene.title ?? scene.id}`;
    head.append(title);
    card.append(head);
    if (!composition) {
      const gone = document.createElement('p');
      gone.className = 'right-note';
      gone.textContent = t('plan.sceneGone');
      card.append(gone);
      root.append(card);
      return;
    }
    title.onclick = () => deps.openScene(composition.id);
    // Length, order, delete, regenerate (a timeline has none of them: its
    // chapters are stretches of one timeline, edited there).
    const controls = document.createElement('div');
    controls.className = 'camera-row';
    if (!timeline)
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
    if (!timeline) card.append(controls);
    // Narration.
    const narration = document.createElement('textarea');
    narration.className = 'plan-narration';
    narration.id = `plan-narration-${scene.id}`;
    narration.rows = 3;
    narration.value = scene.narration ?? '';
    narration.setAttribute('aria-label', t('plan.narration'));
    if (!timeline)
      card.append(
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
    // Media layers.
    for (const layer of scene.layers) {
      if (layer.kind !== 'media' || !layer.mediaIntent) continue;
      const ref = layerKey(scene, layer);
      const built = byRef(composition, ref);
      const flagged = built?.properties.planFlag?.value === 'needs-asset';
      const row = document.createElement('div');
      row.className = 'plan-layer';
      row.dataset.planLayer = ref;
      row.dataset.flag = flagged ? 'needs-asset' : 'ok';
      const name = document.createElement('p');
      name.className = 'plan-layer-name';
      name.textContent = `${layer.id} · ${layer.mediaIntent.query} (${t(`plan.type.${layer.mediaIntent.type}`)})`;
      const chip = document.createElement('span');
      chip.className = flagged ? 'plan-flag' : 'plan-found';
      chip.textContent = flagged ? t('plan.missing') : t('plan.found');
      name.append(' ', chip);
      row.append(name);
      const strip = document.createElement('div');
      strip.className = 'plan-alternatives';
      strip.hidden = true;
      const choose = async (candidate: MediaCandidate) => {
        (state.plan.resolved ??= {})[ref] = candidate.key;
        save();
        const target = built && !flagged ? built : null;
        if (!target) return regenerate(index);
        const asset = await deps.importCandidate(candidate);
        if (asset.type !== target.type) return regenerate(index);
        deps.run('Swap media', [
          {
            type: 'SET_LAYER_ASSET',
            compositionId: composition.id,
            layerId: target.id,
            assetId: asset.id,
          } as unknown as Command,
        ]);
      };
      const current = state.plan.resolved?.[ref];
      for (const candidate of (state.alternatives[ref] ?? []).slice(
        0,
        4 + 4 * (state.pages[ref] ?? 0),
      )) {
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
          void safely(() => choose(candidate));
        };
        strip.append(option);
      }
      const searchMore = button(
        'plan-search-more',
        t('plan.searchMore'),
        async () => {
          const page = (state.pages[ref] ?? 0) + 2;
          const more = await deps.searchMore(layer.mediaIntent!, page);
          const known = new Set(
            (state.alternatives[ref] ?? []).map((c) => c.key),
          );
          state.alternatives[ref] = [
            ...(state.alternatives[ref] ?? []),
            ...more.filter((c) => !known.has(c.key)).slice(0, 4),
          ];
          state.pages[ref] = page - 1;
          save();
          stockOpen.add(ref);
        },
        'search',
      );
      searchMore.hidden = true;
      const own = button(
        'plan-use-own',
        flagged ? t('plan.chooseFile') : t('plan.swap'),
        async () => {
          const asset = await deps.pickFile(
            layer.mediaIntent!.type === 'video' ? 'video/*' : 'image/*',
          );
          if (!asset) return;
          await choose({
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
      own.classList.toggle('primary', flagged);
      const find = document.createElement('button');
      find.type = 'button';
      find.className = 'button secondary sm';
      find.dataset.action = 'plan-find-stock';
      find.textContent = t('plan.findStock');
      const reveal = () => {
        strip.hidden = false;
        searchMore.hidden = false;
        find.hidden = true;
      };
      find.onclick = () => {
        stockOpen.add(ref);
        reveal();
      };
      if (stockOpen.has(ref)) reveal();
      const actions = document.createElement('div');
      actions.className = 'camera-row plan-layer-actions';
      actions.append(own, find, searchMore);
      row.append(actions, strip);
      card.append(row);
    }
    root.append(card);
  });
  return root;
}
