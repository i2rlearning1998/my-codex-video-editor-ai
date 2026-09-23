import { effectiveLayerTiming } from '../core';
import { layerSize, locateLayer, type RenderSource } from '../render/adapter';
import { iconSvg } from './icons';

import type { InspectorField } from './transform-commands';

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
): void {
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
  const sections: [string, [string, string][]][] = [
    [
      'Transform',
      [
        ['Position X', String(layer.transform.position.value[0])],
        ['Position Y', String(layer.transform.position.value[1])],
        ['Scale X', String(layer.transform.scale.value[0])],
        ['Scale Y', String(layer.transform.scale.value[1])],
        ['Rotation', `${layer.transform.rotation.value}°`],
        ['Opacity', String(layer.transform.opacity.value)],
      ],
    ],
    [
      'Timing',
      [
        ['Start time', String(effectiveTiming.startTime)],
        ['Duration', String(effectiveTiming.duration)],
        ['Current time', String(source.currentTime ?? 0)],
      ],
    ],
    [
      'Dimensions',
      [
        ['Width', size ? String(size.width) : '—'],
        ['Height', size ? String(size.height) : '—'],
        ['Size source', size?.source ?? 'Group has no bounds'],
      ],
    ],
    [
      'Hierarchy',
      [
        ['Parent', parent?.name ?? 'Composition root'],
        ['Parent ID', parent?.id ?? '—'],
        ['Type', layer.type],
        ['Layer ID', layer.id],
      ],
    ],
  ];
  for (const [title, fields] of sections) {
    const section = document.createElement('section');
    section.className = 'inspector-section';
    const label = document.createElement('h4');
    label.textContent = title;
    section.append(label);
    const list = document.createElement('dl');
    for (const [name, value] of fields) {
      const dt = document.createElement('dt'),
        dd = document.createElement('dd');
      dt.textContent = name;
      dd.textContent = value;
      dd.dataset.field = name;
      if (title === 'Transform' && commit) {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.value =
          name === 'Rotation' ? String(layer.transform.rotation.value) : value;
        const initial = input.value;
        input.setAttribute(
          'aria-label',
          name === 'Rotation' ? 'Rotation (degrees)' : name,
        );
        if (name === 'Opacity') {
          input.min = '0';
          input.max = '1';
        }
        const apply = () => {
          if (input.value === initial) return;
          commit(
            name as InspectorField,
            input.value.trim() === '' ? NaN : Number(input.value),
          );
        };
        input.onchange = apply;
        input.onkeydown = (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            apply();
            input.blur();
          }
          if (event.key === 'Escape') {
            input.value = initial;
            input.blur();
          }
        };
        dd.replaceChildren(input);
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
        button.innerHTML = iconSvg(exists ? 'diamondFilled' : 'diamondOutline', 14);
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
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.value = value;
        input.setAttribute('aria-label', name);
        let committed = false;
        const apply = () => {
          if (committed || input.value === value) return;
          committed = true;
          timing(
            name as 'Start time' | 'Duration',
            input.value.trim() === '' ? NaN : Number(input.value),
          );
        };
        input.onchange = apply;
        input.onblur = apply;
        input.onkeydown = (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            apply();
            input.blur();
          } else if (event.key === 'Escape') {
            input.value = value;
            input.blur();
          }
        };
        dd.replaceChildren(input);
      }
      list.append(dt, dd);
    }
    section.append(list);
    root.append(section);
  }
}
