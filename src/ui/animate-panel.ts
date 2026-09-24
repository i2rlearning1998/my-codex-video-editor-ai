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

type Tab = 'in' | 'out' | 'loop' | 'kenBurns';
const DEFAULT_DURATION = 0.5;
const DEFAULT_PERIOD = 1.5;

export function mountAnimatePanel(
  panel: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
  registerOverlay: (close: () => void) => () => void,
) {
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('animate.title'));
  let tab: Tab = 'in';
  let unregister: (() => void) | undefined;
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
    const wrap = document.createElement('label');
    wrap.className = 'animate-slider';
    wrap.htmlFor = `${id}-range`;
    const text = document.createElement('span');
    text.textContent = label;
    const range = document.createElement('input');
    range.type = 'range';
    range.id = `${id}-range`;
    range.min = String(min);
    range.max = String(max);
    range.step = '0.1';
    range.value = String(value);
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = '0.1';
    input.value = String(value);
    input.setAttribute('aria-label', label);
    const unit = document.createElement('span');
    unit.textContent = t('animate.seconds');
    const apply = (raw: string) => {
      const next = Number(raw);
      if (!Number.isFinite(next) || next < min || next > max) {
        report(
          new RangeError(
            t('animate.range', {
              min: formatNumber(min),
              max: formatNumber(max),
            }),
          ),
        );
        return;
      }
      commit(Math.round(next * 10) / 10);
    };
    range.onchange = () => apply(range.value);
    input.onchange = () => apply(input.value);
    wrap.append(text, range, input, unit);
    return wrap;
  };
  const render = () => {
    if (panel.hidden) return;
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
          const wrap = document.createElement('label');
          wrap.className = 'animate-slider';
          const text = document.createElement('span');
          text.textContent = t('animate.direction');
          const select = document.createElement('select');
          select.id = 'animate-direction';
          for (const direction of SLIDE_DIRECTIONS) {
            const option = document.createElement('option');
            option.value = direction;
            option.textContent = t(`animate.direction.${direction}`);
            select.append(option);
          }
          select.value = current.direction ?? 'up';
          select.onchange = () =>
            set(tab, { ...current, direction: select.value });
          wrap.append(text, select);
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
  const close = () => {
    if (panel.hidden) return;
    panel.hidden = true;
    unregister?.();
    unregister = undefined;
  };
  const open = () => {
    if (!target()) return;
    panel.hidden = false;
    unregister ??= registerOverlay(close);
    render();
    panel.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  };
  document.addEventListener('pointerdown', (event) => {
    const element = event.target as HTMLElement;
    if (
      !panel.hidden &&
      !panel.contains(element) &&
      !element.closest('[data-control="animate"]')
    )
      close();
  });
  const unsubscribe = session.onChange(render);
  return {
    open,
    close,
    toggle: () => (panel.hidden ? open() : close()),
    render,
    dispose: () => {
      unsubscribe();
      close();
    },
  };
}
