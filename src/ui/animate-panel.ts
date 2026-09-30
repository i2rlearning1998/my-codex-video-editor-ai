// W5-C Animate panel (ANI-007, ANI-008): one-click In, Out and Loop presets
// and Ken Burns for images, opened from the context toolbar's Animate button.
import {
  IN_OUT_PRESETS,
  LOOP_PRESETS,
  SLIDE_DIRECTIONS,
  clipAnimation,
  findClipByLayer,
  type ClipAnimationSlot,
  type EditorEngine,
} from '../core';
import { formatNumber, t } from '../i18n';
import { locateLayer } from '../render/adapter';
import type { EditorSession } from './session';
import type { DeepPanelHandle } from './side-panel';
import { createNumberField } from './components/number-field';
import { createSelect } from './components/select';

type Tab = 'in' | 'out' | 'loop' | 'kenBurns';
const DEFAULT_DURATION = 0.5;
const DEFAULT_PERIOD = 1.5;

export function mountAnimatePanel(
  handle: DeepPanelHandle,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
) {
  // G1.5: rendered in the left side panel, which owns the header and Back.
  const panel = handle.body;
  let tab: Tab = 'in';
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
    }
  };
  const target = () => {
    const source = session.source;
    const layer =
      session.selectedIds.length === 1 && session.selectedId
        ? locateLayer(source.composition.layers, session.selectedId)?.layer
        : undefined;
    const clip = layer
      ? findClipByLayer(source.composition, layer.id)?.clip
      : undefined;
    return layer && clip ? { layer, clip } : null;
  };
  const set = (slot: ClipAnimationSlot, value: unknown) =>
    safely(() => {
      const found = target();
      if (!found) return;
      session.setPlaying(false);
      engine.commands.transaction('Set animation', [
        {
          type: 'SET_CLIP_ANIMATION',
          compositionId: session.source.composition.id,
          clipId: found.clip.id,
          slot,
          value,
        },
      ]);
    });
  const card = (
    label: string,
    pressed: boolean,
    onClick: () => void,
    data: Record<string, string>,
    disabled = false,
  ) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'animate-card';
    item.textContent = label;
    item.setAttribute('aria-pressed', String(pressed));
    for (const [key, value] of Object.entries(data)) item.dataset[key] = value;
    item.disabled = disabled;
    item.onclick = onClick;
    return item;
  };
  const slider = (
    id: string,
    label: string,
    value: number,
    min: number,
    max: number,
    commit: (value: number) => void,
  ) => {
    // G1: the shared NumberField with a slider in its chevron popover.
    return createNumberField({
      id,
      label,
      value,
      unit: t('animate.seconds'),
      min,
      max,
      step: 0.1,
      decimals: 1,
      slider: true,
      className: 'animate-slider',
      onCommit: (next) => commit(Math.round(next * 10) / 10),
      onInvalid: () =>
        report(
          new RangeError(
            t('animate.range', {
              min: formatNumber(min),
              max: formatNumber(max),
            }),
          ),
        ),
    });
  };
  const render = () => {
    if (!handle.isOpen) return;
    const found = target();
    if (!found) {
      close();
      return;
    }
    const { layer, clip } = found;
    const animation = clipAnimation(clip);
    const isImage = layer.type === 'image';
    if (tab === 'kenBurns' && !isImage) tab = 'in';
    const tabs = document.createElement('div');
    tabs.className = 'animate-tabs';
    tabs.setAttribute('role', 'tablist');
    for (const name of [
      'in',
      'out',
      'loop',
      ...(isImage ? ['kenBurns'] : []),
    ] as Tab[]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.dataset.tab = name;
      button.setAttribute('aria-selected', String(tab === name));
      button.textContent = t(`animate.tab.${name}`);
      button.onclick = () => {
        tab = name;
        render();
      };
      tabs.append(button);
    }
    const cards = document.createElement('div');
    cards.className = 'animate-cards';
    const extras: HTMLElement[] = [];
    if (tab === 'in' || tab === 'out') {
      const current = animation[tab];
      cards.append(
        card(t('animate.none'), !current, () => set(tab, null), {
          preset: 'none',
        }),
        ...IN_OUT_PRESETS.map((preset) =>
          card(
            t(`animate.preset.${preset}`),
            current?.preset === preset,
            () =>
              set(tab, {
                preset,
                duration: current?.duration ?? DEFAULT_DURATION,
                ...(preset === 'slide' ? { direction: 'up' } : {}),
              }),
            { preset },
            preset === 'typewriter' && layer.type !== 'text',
          ),
        ),
      );
      if (current) {
        extras.push(
          slider(
            'animate-duration',
            t('animate.duration'),
            current.duration,
            0.1,
            5,
            (duration) => set(tab, { ...current, duration }),
          ),
        );
        if (current.preset === 'slide') {
          const wrap = createSelect({
            id: 'animate-direction',
            label: t('animate.direction'),
            value: current.direction ?? 'up',
            options: SLIDE_DIRECTIONS.map((direction) => ({
              value: direction,
              label: t(`animate.direction.${direction}`),
            })),
            onChange: (direction) => set(tab, { ...current, direction }),
          });
          extras.push(wrap);
        }
      }
    } else if (tab === 'loop') {
      const current = animation.loop;
      cards.append(
        card(t('animate.none'), !current, () => set('loop', null), {
          preset: 'none',
        }),
        ...LOOP_PRESETS.map((preset) =>
          card(
            t(`animate.preset.${preset}`),
            current?.preset === preset,
            () =>
              set('loop', {
                preset,
                period: current?.period ?? DEFAULT_PERIOD,
              }),
            { preset },
          ),
        ),
      );
      if (current)
        extras.push(
          slider(
            'animate-period',
            t('animate.period'),
            current.period,
            0.5,
            5,
            (period) => set('loop', { ...current, period }),
          ),
        );
    } else {
      const current = animation.kenBurns;
      cards.append(
        card(t('animate.none'), !current, () => set('kenBurns', null), {
          preset: 'none',
        }),
        ...(['in', 'out'] as const).map((zoom) =>
          card(
            t(`animate.kenBurns.${zoom}`),
            current?.zoom === zoom,
            () => set('kenBurns', { zoom }),
            { preset: `ken-burns-${zoom}` },
          ),
        ),
      );
    }
    panel.replaceChildren(tabs, cards, ...extras);
  };
  const close = () => handle.close();
  const open = () => {
    if (!target()) return;
    handle.open();
    render();
    panel.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  };
  const unsubscribe = session.onChange(render);
  return {
    open,
    close,
    toggle: () => (handle.isOpen ? close() : open()),
    render,
    dispose: () => {
      unsubscribe();
      close();
    },
  };
}
