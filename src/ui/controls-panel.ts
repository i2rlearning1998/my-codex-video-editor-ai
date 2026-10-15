// P3 (CREATOR-PACK-SPEC 5.1b): the Controls of a layer that is not a code
// layer. HARD RULE: it shows only what the layer really has. A preset shows
// one heading per transform it animates, with the controls its tracks use
// (Duration, Delay and Smoothness under More); keyframes no preset made get a
// simple From / To / Duration / Delay / Easing view for the keyframed
// transforms only. Every change rewrites the keyframes in one undo step.
// Keyframes edited by hand turn a preset's controls off ("Edited manually")
// until "Reset to controls".
import { getLanguage, t } from '../i18n';
import type { Command, EditorEngine } from '../core';
import { locateLayer, type SceneLayer } from '../render/adapter';
import { selectionRoots } from './selection-context';
import type { EditorSession } from './session';
import { createParamsForm, type ParamValue } from './code-params';
import type { ParamSpec } from '../blocks/types';
import { presetControls } from '../creator-pack/preset';
import type { Preset } from '../creator-pack/schemas';
import {
  GROUP_OF,
  editedManually,
  formSpec,
  presetCommands,
  presetGroups,
  readPresets,
  simpleCommand,
  simpleTracks,
  type SimpleTrack,
  type TransformKey,
} from './creator-presets';

export interface CreatorPresetChoice {
  readonly id: string;
  readonly name: string;
  readonly preset: Preset;
}
export interface ControlsDeps {
  readonly engine: EditorEngine;
  readonly session: EditorSession;
  /** The Creator presets in My library (Add animation lists them). */
  readonly presets: () => readonly CreatorPresetChoice[];
  readonly report: (error: unknown) => void;
  readonly confirm: (text: string) => Promise<boolean>;
  readonly rerender: () => void;
}

const safeId = (text: string) => text.replace(/[^A-Za-z0-9_-]/g, '_');
const label = (value: { en: string; hi?: string | undefined }) =>
  getLanguage() === 'hi' && value.hi ? value.hi : value.en;

/** The single non-code, non-audio layer the Controls are for. */
export function controlledLayer(session: EditorSession): SceneLayer | null {
  const roots = selectionRoots(session.source, session.selectedIds);
  if (roots.length !== 1) return null;
  const root = roots[0]!;
  if (root.type === 'audio' || root.code) return null;
  return locateLayer(session.source.composition.layers, root.id)?.layer ?? null;
}
/** True when the layer has something the Controls show (spec 5.1b). */
export function hasControls(layer: SceneLayer): boolean {
  return (
    readPresets(layer).length > 0 ||
    (['position', 'scale', 'rotation', 'opacity'] as const).some(
      (key) =>
        layer.transform[key].animated &&
        layer.transform[key].keyframes.length > 1,
    )
  );
}
/** True when a preset may be applied to the layer (its `appliesTo`). */
export function presetFits(preset: Preset, layer: SceneLayer): boolean {
  const kind = layer.code ? 'code' : layer.type === 'audio' ? null : layer.type;
  return (
    !!kind && preset.appliesTo.some((item) => item === 'any' || item === kind)
  );
}

export function controlsBody(deps: ControlsDeps): HTMLElement[] {
  const { engine, session } = deps;
  const layer = controlledLayer(session);
  if (!layer) return [];
  const composition = session.source.composition;
  const run = (label: string, commands: Command[]) => {
    try {
      session.setPlaying(false);
      engine.commands.transaction(label, commands);
    } catch (error) {
      deps.report(error);
    }
    deps.rerender();
  };
  const parts: HTMLElement[] = [];
  readPresets(layer).forEach((record, index) => {
    const box = document.createElement('section');
    box.className = 'controls-preset';
    box.dataset.preset = record.id;
    const title = document.createElement('h4');
    title.className = 'controls-preset-name';
    title.textContent = record.name;
    box.append(title);
    const edited = editedManually(layer, record);
    if (edited) {
      box.dataset.edited = 'true';
      const note = document.createElement('p');
      note.className = 'code-notice controls-edited';
      note.textContent = t('controls.edited');
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'button';
      reset.id = `controls-reset-${index}`;
      reset.dataset.action = 'controls-reset';
      reset.textContent = t('controls.reset');
      reset.onclick = async () => {
        if (!(await deps.confirm(t('controls.resetConfirm')))) return;
        const current = controlledLayer(session);
        if (!current) return;
        run(
          t('controls.resetStep'),
          presetCommands(session.source.composition, current, record),
        );
      };
      box.append(note, reset);
    }
    const values: Record<string, ParamValue> = {};
    for (const control of presetControls(record.preset)) {
      const value = record.params[control.name] ?? control.default;
      if (
        typeof value === 'number' ||
        typeof value === 'string' ||
        typeof value === 'boolean'
      )
        values[control.name] = value;
    }
    const change = (name: string, value: ParamValue) => {
      const current = controlledLayer(session);
      if (!current) return;
      run(
        t('controls.step'),
        presetCommands(session.source.composition, current, {
          ...record,
          params: { ...record.params, [name]: value },
        }),
      );
    };
    const form = (prefix: string, specs: ParamSpec[]) => {
      const element = createParamsForm({
        idPrefix: prefix,
        specs,
        values,
        onChange: change,
        onInvalid: (text) => deps.report(new RangeError(text)),
      });
      if (edited) {
        element.inert = true;
        element.classList.add('is-disabled');
      }
      return element;
    };
    const specs = (controls: ReturnType<typeof presetGroups>['advanced']) =>
      controls.flatMap((control) => {
        const spec = formSpec(control, label(control.label));
        return spec ? [spec] : [];
      });
    const { groups, advanced } = presetGroups(record.preset);
    const prefix = `controls-${safeId(record.id)}`;
    for (const group of groups) {
      const wrap = document.createElement('div');
      wrap.className = 'controls-group';
      wrap.dataset.group = group.group;
      const heading = document.createElement('h5');
      heading.className = 'controls-group-name';
      heading.textContent = t(`controls.group.${group.group}`);
      wrap.append(heading);
      const list = specs(group.controls);
      if (list.length) wrap.append(form(`${prefix}-${group.group}`, list));
      box.append(wrap);
    }
    if (advanced.length) {
      const more = document.createElement('details');
      more.className = 'controls-more';
      const summary = document.createElement('summary');
      summary.textContent = t('controls.more');
      more.append(summary, form(`${prefix}-more`, specs(advanced)));
      box.append(more);
    }
    parts.push(box);
  });
  // Keyframes no preset made: a simple view of the keyframed ones only.
  for (const track of simpleTracks(composition, layer))
    parts.push(simpleGroup(track, layer, deps, run));
  // Add animation: one more property animation from the Creator presets.
  const add = document.createElement('div');
  add.className = 'controls-add';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.id = 'controls-add';
  button.textContent = t('controls.add');
  button.setAttribute('aria-expanded', 'false');
  const list = document.createElement('div');
  list.className = 'controls-add-list';
  list.hidden = true;
  const choices = deps
    .presets()
    .filter((item) => presetFits(item.preset, layer));
  if (!choices.length) {
    const none = document.createElement('p');
    none.className = 'code-notice';
    none.textContent = t('controls.noPresets');
    list.append(none);
  }
  for (const choice of choices) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'button controls-add-item';
    item.dataset.preset = choice.id;
    item.textContent = choice.name;
    item.onclick = () => {
      const current = controlledLayer(session);
      if (!current) return;
      try {
        run(
          t('controls.addStep'),
          presetCommands(session.source.composition, current, {
            ...choice,
            params: {},
          }),
        );
      } catch (error) {
        deps.report(error);
      }
    };
    list.append(item);
  }
  button.onclick = () => {
    list.hidden = !list.hidden;
    button.setAttribute('aria-expanded', String(!list.hidden));
  };
  add.append(button, list);
  parts.push(add);
  return parts;
}

const RANGES: Record<TransformKey, { min: number; max: number; step: number }> =
  {
    position: { min: -100000, max: 100000, step: 1 },
    scale: { min: -100, max: 100, step: 0.01 },
    rotation: { min: -36000, max: 36000, step: 1 },
    opacity: { min: 0, max: 1, step: 0.01 },
  };
function simpleGroup(
  track: SimpleTrack,
  layer: SceneLayer,
  deps: ControlsDeps,
  run: (label: string, commands: Command[]) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'controls-group controls-simple';
  wrap.dataset.group = GROUP_OF[track.key];
  const heading = document.createElement('h5');
  heading.className = 'controls-group-name';
  heading.textContent = t(`controls.group.${GROUP_OF[track.key]}`);
  wrap.append(heading);
  const range = RANGES[track.key];
  const num = (name: string, text: string, value: number) =>
    ({
      name,
      label: text,
      type: 'number',
      min: range.min,
      max: range.max,
      step: range.step,
      default: value,
    }) as ParamSpec;
  const specs: ParamSpec[] = [];
  const values: Record<string, ParamValue> = {};
  for (const end of ['from', 'to'] as const) {
    const value = track[end];
    if (typeof value === 'number') {
      specs.push(num(end, t(`controls.${end}`), value));
      values[end] = value;
    } else
      (['x', 'y'] as const).forEach((axis, index) => {
        const name = `${end}${axis.toUpperCase()}`;
        specs.push(
          num(
            name,
            `${t(`controls.${end}`)} ${axis.toUpperCase()}`,
            value[index]!,
          ),
        );
        values[name] = value[index]!;
      });
  }
  specs.push(
    {
      name: 'duration',
      label: t('controls.duration'),
      type: 'number',
      min: 0.01,
      max: 120,
      step: 0.01,
      default: track.duration,
    },
    {
      name: 'delay',
      label: t('controls.delay'),
      type: 'number',
      min: 0,
      max: 120,
      step: 0.01,
      default: track.delay,
    },
    {
      name: 'easing',
      label: t('controls.easing'),
      type: 'select',
      default: track.easing,
      options: ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold'],
    },
  );
  values.duration = track.duration;
  values.delay = track.delay;
  values.easing = track.easing;
  wrap.append(
    createParamsForm({
      idPrefix: `controls-simple-${track.key}`,
      specs,
      values,
      onChange: (name, value) => {
        const current = controlledLayer(deps.session);
        if (!current) return;
        const composition = deps.session.source.composition;
        const vector = (end: 'from' | 'to', axis: 0 | 1) => {
          const now = track[end] as [number, number];
          return (
            axis === 0 ? [Number(value), now[1]] : [now[0], Number(value)]
          ) as [number, number];
        };
        const change: Parameters<typeof simpleCommand>[3] =
          name === 'from' || name === 'to'
            ? { [name]: Number(value) }
            : name === 'fromX'
              ? { from: vector('from', 0) }
              : name === 'fromY'
                ? { from: vector('from', 1) }
                : name === 'toX'
                  ? { to: vector('to', 0) }
                  : name === 'toY'
                    ? { to: vector('to', 1) }
                    : name === 'easing'
                      ? { easing: String(value) }
                      : { [name]: Number(value) };
        run(t('controls.step'), [
          simpleCommand(composition, current, track.key, change),
        ]);
      },
      onInvalid: (text) => deps.report(new RangeError(text)),
    }),
  );
  void layer;
  return wrap;
}
