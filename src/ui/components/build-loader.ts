// PHASE 0 E1: the one loader for a long build (Build video, the AI importer's
// checks): an animated mark, the step's name, a moving percentage, Cancel
// that really stops the build, and an honest finish (done, cancelled, failed).
// With Settings › Animations Off, or reduced motion, the mark stays still.
import { t } from '../../i18n';

export type BuildLoaderState = 'running' | 'done' | 'cancelled' | 'failed';
export interface BuildLoader {
  readonly element: HTMLElement;
  /** Aborted when Cancel is pressed. */
  readonly signal: AbortSignal;
  update(progress: { step: string; percent: number }): void;
  finish(text?: string): void;
  fail(reason: string): void;
  cancelled(): void;
  readonly state: BuildLoaderState;
}

export function createBuildLoader(
  options: { onCancel?: () => void } = {},
): BuildLoader {
  const controller = new AbortController();
  const element = document.createElement('div');
  element.className = 'build-loader';
  element.dataset.state = 'running';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.innerHTML = `
    <svg class="build-loader-mark" viewBox="0 0 48 48" aria-hidden="true">
      <circle class="build-loader-track" cx="24" cy="24" r="18"/>
      <circle class="build-loader-arc" cx="24" cy="24" r="18"/>
      <rect class="build-loader-bar b1" x="15" y="20" width="4" height="8" rx="2"/>
      <rect class="build-loader-bar b2" x="22" y="16" width="4" height="16" rx="2"/>
      <rect class="build-loader-bar b3" x="29" y="20" width="4" height="8" rx="2"/>
    </svg>
    <div class="build-loader-text">
      <strong class="build-loader-step"></strong>
      <span class="build-loader-percent" aria-hidden="true">0%</span>
      <div class="build-loader-track-line" aria-hidden="true"><span></span></div>
    </div>
    <button type="button" class="button secondary sm" data-action="build-cancel"></button>`;
  const step = element.querySelector<HTMLElement>('.build-loader-step')!;
  const percent = element.querySelector<HTMLElement>('.build-loader-percent')!;
  const fill = element.querySelector<HTMLElement>(
    '.build-loader-track-line span',
  )!;
  const arc = element.querySelector<SVGCircleElement>('.build-loader-arc')!;
  const cancel = element.querySelector<HTMLButtonElement>(
    '[data-action="build-cancel"]',
  )!;
  cancel.textContent = t('build.cancel');
  step.textContent = t('composition.checking');
  const circumference = 2 * Math.PI * 18;
  arc.style.strokeDasharray = `${circumference}`;
  const show = (value: number) => {
    const rounded = Math.max(0, Math.min(100, Math.round(value)));
    percent.textContent = `${rounded}%`;
    fill.style.inlineSize = `${rounded}%`;
    arc.style.strokeDashoffset = `${circumference * (1 - rounded / 100)}`;
    element.dataset.percent = String(rounded);
  };
  show(0);
  const end = (state: BuildLoaderState, text: string) => {
    element.dataset.state = state;
    step.textContent = text;
    cancel.hidden = true;
    if (state === 'done') show(100);
  };
  cancel.onclick = () => {
    if (element.dataset.state !== 'running') return;
    controller.abort();
    options.onCancel?.();
  };
  return {
    element,
    signal: controller.signal,
    update({ step: name, percent: value }) {
      if (element.dataset.state !== 'running') return;
      step.textContent = name;
      show(value);
    },
    finish: (text = t('build.done')) => end('done', text),
    fail: (reason) => end('failed', t('build.failed', { reason })),
    cancelled: () => end('cancelled', t('build.cancelled')),
    get state() {
      return element.dataset.state as BuildLoaderState;
    },
  };
}
