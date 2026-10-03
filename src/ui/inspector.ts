import { effectiveLayerTiming } from '../core';
import { layerSize, locateLayer, type RenderSource } from '../render/adapter';
import { iconSvg } from './icons';
import {
  createNumberField,
  restoreFieldFocus,
} from './components/number-field';

import type { InspectorField } from './transform-commands';
import { createGeometryRow } from './geometry-fields';
import type { GeometryField } from './geometry';
import { t } from '../i18n';

/** Transform math is exact and unrounded by design (see TRANSFORM_CONTRACT.md);
 *  this only rounds what the inspector *displays*, so a drag doesn't surface
 *  values like 1.6474820143884898. The stored/committed value is untouched. */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded === 0 ? 0 : rounded);
}

const SUB_TABS = ['Transform', 'Timing', 'Dimensions', 'Hierarchy'] as const;
type SubTab = (typeof SUB_TABS)[number];
/**
 * H4: the old sub-tabs are stacked sections (Clipchamp). Position and size,
 * Timing and Details (dimensions, then the layer's place in the tree). A
 * section header opens its section and scrolls to it; the chevron folds it.
 * One inspector exists at a time, so the folded state is module-level.
 */
const GROUPS: readonly (readonly [key: string, tabs: readonly SubTab[]])[] = [
  ['inspector.position', ['Transform']],
  ['inspector.timing', ['Timing']],
  ['inspector.details', ['Dimensions', 'Hierarchy']],
];
// I4: Position and size, Timing and Details start folded at the bottom of
// the right panel's first tab, under the selection's own controls.
const folded = new Set<string>(GROUPS.map(([key]) => key));
let revealTab: SubTab | null = null;
/** Bumped on every render so a render re-entered from a blur commit can stop. */
let renderGeneration = 0;

/** Inputs commit through the shell's semantic command boundary. */
export function renderInspector(
  root: HTMLElement,
  source: RenderSource,
  selectedId: string | null,
  commit?: (field: InspectorField, value: number) => void,
  timing?: (field: 'Start time' | 'Duration', value: number) => void,
  keyframe?: (
    key: 'position' | 'scale' | 'rotation' | 'opacity',
    remove: boolean,
  ) => void,
  /** G2.1: X, Y, W and H of what is drawn (the main fields). */
  geometry?: (field: GeometryField, value: number) => void,
): void {
  const generation = ++renderGeneration;
  // Removing a focused input fires its blur-commit mid-replaceChildren in
  // Chromium; blur first so that commit (and its nested render) completes, then
  // drop this now-stale render instead of overwriting the newer one.
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && root.contains(focused)) {
    focused.blur();
    if (generation !== renderGeneration) return;
  }
  root.replaceChildren();
  const found = selectedId
    ? locateLayer(source.composition.layers, selectedId)
    : null;
  if (!found) {
    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    empty.innerHTML =
      '<span class="empty-symbol" aria-hidden="true">⌖</span><h3>Nothing selected</h3><p>Click a layer in the canvas<br>or choose one in the scene list.</p><span class="quiet-tag">Select to transform</span>';
    root.append(empty);
    return;
  }
  const { layer, parent } = found;
  const effectiveTiming = effectiveLayerTiming(source.composition, layer);
  const heading = document.createElement('h3');
  heading.className = 'selected-name';
  heading.textContent =
    (source.selectedIds?.length ?? 1) > 1
      ? `${source.selectedIds!.length} selected · ${layer.name}`
      : layer.name;
  root.append(heading);
  const caption = document.createElement('p');
  caption.className = 'inspector-type';
  caption.textContent = `${layer.type} layer · Local transform`;
  root.append(caption);
  const size = layerSize(layer, source.assets);
  const sections: Record<(typeof SUB_TABS)[number], [string, string][]> = {
    Transform: [
      ['Position X', formatNumber(layer.transform.position.value[0])],
      ['Position Y', formatNumber(layer.transform.position.value[1])],
      ['Scale X', formatNumber(layer.transform.scale.value[0])],
      ['Scale Y', formatNumber(layer.transform.scale.value[1])],
      ['Rotation', `${formatNumber(layer.transform.rotation.value)}°`],
      ['Opacity', formatNumber(layer.transform.opacity.value)],
    ],
    // Display-rounded like Transform; committed values stay exact.
    Timing: [
      ['Start time', formatNumber(effectiveTiming.startTime)],
      ['Duration', formatNumber(effectiveTiming.duration)],
      ['Current time', formatNumber(source.currentTime ?? 0)],
    ],
    Dimensions: [
      ['Width', size ? String(size.width) : '—'],
      ['Height', size ? String(size.height) : '—'],
      ['Size source', size?.source ?? 'Group has no bounds'],
    ],
    Hierarchy: [
      ['Parent', parent?.name ?? 'Composition root'],
      ['Parent ID', parent?.id ?? '—'],
      ['Type', layer.type],
      ['Layer ID', layer.id],
    ],
  };
  const rerender = () =>
    renderInspector(
      root,
      source,
      selectedId,
      commit,
      timing,
      keyframe,
      geometry,
    );
  for (const [groupKey, groupTabs] of GROUPS) {
    const group = document.createElement('section');
    group.className = 'inspector-group';
    group.dataset.group = groupKey;
    const header = document.createElement('div');
    header.className = 'inspector-group-header';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'inspector-group-title';
    open.dataset.subtab = groupTabs[0]!;
    open.textContent = t(groupKey);
    const fold = document.createElement('button');
    fold.type = 'button';
    fold.className = 'icon-button inspector-group-fold';
    fold.dataset.fold = groupKey;
    const isFolded = folded.has(groupKey);
    fold.setAttribute('aria-expanded', String(!isFolded));
    fold.setAttribute('aria-label', t('inspector.fold', { name: t(groupKey) }));
    fold.innerHTML = iconSvg(isFolded ? 'chevronRight' : 'chevronDown', 14);
    fold.onclick = () => {
      if (folded.has(groupKey)) folded.delete(groupKey);
      else folded.add(groupKey);
      rerender();
    };
    open.onclick = () => {
      folded.delete(groupKey);
      revealTab = groupTabs[0]!;
      rerender();
    };
    header.append(open, fold);
    group.append(header);
    root.append(group);
    const body = document.createElement('div');
    body.className = 'inspector-group-body';
    body.hidden = isFolded;
    group.append(body);
    for (const title of groupTabs) {
      const fields = sections[title];
      if (title === 'Hierarchy') {
        const sub = document.createElement('button');
        sub.type = 'button';
        sub.className = 'inspector-subheading inspector-subheading-button';
        sub.dataset.subtab = 'Hierarchy';
        sub.textContent = t('inspector.layer');
        sub.onclick = open.onclick;
        body.append(sub);
      }
      if (title === 'Transform' && geometry) {
        const row = createGeometryRow('inspector', source, geometry, rerender);
        if (row) {
          row.classList.add('inspector-geometry');
          body.append(row);
          // The stored values (anchor position, scale) are secondary.
          const values = document.createElement('h4');
          values.className = 'inspector-subheading';
          values.textContent = t('geometry.values');
          body.append(values);
        }
      }
      {
        const section = document.createElement('section');
        section.className = 'inspector-section';
        const list = document.createElement('dl');
        for (const [name, value] of fields) {
          const dt = document.createElement('dt'),
            dd = document.createElement('dd');
          dt.textContent = name;
          dd.textContent = value;
          dd.dataset.field = name;
          if (title === 'Transform' && commit) {
            // G1: the shared NumberField. Opacity shows 0-100 %, rotation in
            // degrees, position in px; the committed values keep their units.
            const t = layer.transform;
            const spec: Record<
              string,
              {
                value: number;
                unit: string;
                scale?: number;
                min?: number;
                max?: number;
              }
            > = {
              'Position X': { value: t.position.value[0], unit: 'px' },
              'Position Y': { value: t.position.value[1], unit: 'px' },
              'Scale X': { value: t.scale.value[0], unit: '×' },
              'Scale Y': { value: t.scale.value[1], unit: '×' },
              Rotation: { value: t.rotation.value, unit: '°' },
              Opacity: {
                value: t.opacity.value * 100,
                unit: '%',
                scale: 100,
                min: 0,
                max: 100,
              },
            };
            const item = spec[name]!;
            const numberField = createNumberField({
              id: `inspector-${name.toLowerCase().replace(/\s+/g, '-')}`,
              label: name === 'Rotation' ? 'Rotation (degrees)' : name,
              value: item.value,
              unit: item.unit,
              decimals: 3,
              step: name.startsWith('Scale') ? 0.01 : 1,
              ...(item.min !== undefined ? { min: item.min } : {}),
              ...(item.max !== undefined ? { max: item.max } : {}),
              ...(name === 'Opacity'
                ? { slider: true, presets: [0, 25, 50, 75, 100] }
                : {}),
              ...(name === 'Rotation'
                ? {
                    presets: [0, 45, 90, 180, -90],
                    // J3: a slider over one turn; typing allows any angle.
                    slider: true,
                    sliderRange: [-180, 180] as const,
                  }
                : {}),
              onCommit: (next) =>
                commit(name as InspectorField, next / (item.scale ?? 1)),
              // A non-number goes to the command boundary, which explains it.
              onInvalid: (_message, kind) => {
                if (kind === 'invalid') commit(name as InspectorField, NaN);
              },
            });
            // The row's label scrubs the value too.
            const scrubLabel = numberField.querySelector<HTMLElement>(
              '.number-field-label',
            )!;
            scrubLabel.textContent = name;
            dt.replaceChildren(scrubLabel);
            dd.replaceChildren(numberField);
          }
          if (
            title === 'Transform' &&
            keyframe &&
            (source.selectedIds?.length ?? 1) === 1
          ) {
            const key = name.startsWith('Position')
              ? 'position'
              : name.startsWith('Scale')
                ? 'scale'
                : name === 'Rotation'
                  ? 'rotation'
                  : 'opacity';
            const exists = layer.transform[key].keyframes.some(
              (frame) => frame.time === (source.currentTime ?? 0),
            );
            const button = document.createElement('button');
            button.className = 'keyframe-button';
            button.dataset.key = key;
            button.dataset.fieldName = name;
            button.innerHTML = iconSvg(
              exists ? 'diamondFilled' : 'diamondOutline',
              14,
            );
            button.title = exists ? 'Remove keyframe' : 'Add keyframe';
            button.setAttribute(
              'aria-label',
              `${exists ? 'Remove' : 'Add'} ${name} keyframe`,
            );
            button.onclick = () => keyframe(key, exists);
            dd.append(button);
          }
          if (
            title === 'Timing' &&
            name !== 'Current time' &&
            timing &&
            (source.selectedIds?.length ?? 1) === 1
          ) {
            const numberField = createNumberField({
              id: `inspector-${name.toLowerCase().replace(/\s+/g, '-')}`,
              label: name,
              value: Number(value),
              unit: 's',
              decimals: 3,
              step: 0.1,
              onCommit: (next) =>
                timing(name as 'Start time' | 'Duration', next),
              onInvalid: (_message, kind) => {
                if (kind === 'invalid')
                  timing(name as 'Start time' | 'Duration', NaN);
              },
            });
            const scrubLabel = numberField.querySelector<HTMLElement>(
              '.number-field-label',
            )!;
            dt.replaceChildren(scrubLabel);
            dd.replaceChildren(numberField);
          }
          list.append(dt, dd);
        }
        section.append(list);
        body.append(section);
      }
    }
  }
  if (revealTab) {
    const target = root.querySelector<HTMLElement>(
      `[data-subtab="${revealTab}"]`,
    );
    revealTab = null;
    target?.scrollIntoView?.({ block: 'nearest' });
  }
  restoreFieldFocus(root);
}
