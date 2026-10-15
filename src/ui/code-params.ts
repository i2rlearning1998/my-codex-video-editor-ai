// X2 and X3 (spec section 5): one control per declared param of a code
// animation, generated from its meta: a number field with a slider, a colour
// picker, a text field, a switch or a select, all the shared components.
import type { ParamSpec } from '../blocks/types';
import { createColorField } from './components/color-picker';
import { createNumberField } from './components/number-field';
import { createSelect } from './components/select';

export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;

export interface ParamsFormOptions {
  /** Prefix for the controls' ids (unique per form). */
  readonly idPrefix: string;
  readonly specs: readonly ParamSpec[];
  readonly values: Readonly<ParamValues>;
  /** A value was committed (a release, Enter, a pick or a toggle). */
  readonly onChange: (name: string, value: ParamValue) => void;
  readonly onInvalid?: (message: string) => void;
}

const safeId = (text: string) => text.replace(/[^A-Za-z0-9_-]/g, '_');

export function createParamsForm(options: ParamsFormOptions): HTMLElement {
  const form = document.createElement('div');
  form.className = 'code-params';
  for (const spec of options.specs) {
    const id = `${options.idPrefix}-${safeId(spec.name)}`;
    const value = options.values[spec.name] ?? spec.default;
    const row = document.createElement('div');
    row.className = 'code-param';
    row.dataset.param = spec.name;
    row.dataset.type = spec.type;
    if (spec.type === 'number') {
      const decimals = Math.min(
        4,
        Math.max(0, -Math.floor(Math.log10(spec.step || 1))),
      );
      row.append(
        createNumberField({
          id,
          label: spec.label,
          value: Number(value),
          min: spec.min,
          max: spec.max,
          step: spec.step,
          decimals,
          slider: true,
          onCommit: (next) => options.onChange(spec.name, next),
          onPreview: () => undefined,
          onInvalid: (message) => options.onInvalid?.(message),
        }),
      );
    } else if (spec.type === 'color') {
      const label = document.createElement('span');
      label.className = 'code-param-label';
      label.textContent = spec.label;
      row.append(
        label,
        createColorField({
          id,
          label: spec.label,
          value: String(value).slice(0, 7),
          onCommit: (next) => options.onChange(spec.name, next),
        }),
      );
    } else if (spec.type === 'text') {
      const label = document.createElement('label');
      label.className = 'code-param-label';
      label.htmlFor = id;
      label.textContent = spec.label;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = id;
      input.className = 'code-param-text';
      input.value = String(value);
      if (spec.maxLength) input.maxLength = spec.maxLength;
      const commit = () => {
        if (input.value !== String(options.values[spec.name] ?? spec.default))
          options.onChange(spec.name, input.value);
      };
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') input.blur();
      });
      row.append(label, input);
    } else if (spec.type === 'bool') {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = id;
      toggle.className = 'switch-row';
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', String(value === true));
      toggle.innerHTML = `<span></span><span class="switch" aria-hidden="true"></span>`;
      toggle.firstElementChild!.textContent = spec.label;
      toggle.onclick = () => options.onChange(spec.name, value !== true);
      row.append(toggle);
    } else {
      const label = document.createElement('span');
      label.className = 'code-param-label';
      label.textContent = spec.label;
      row.append(
        label,
        createSelect({
          id,
          label: spec.label,
          value: String(value),
          options: spec.options.map((option) => ({
            value: option,
            label: option,
          })),
          onChange: (next) => options.onChange(spec.name, next),
        }),
      );
    }
    form.append(row);
  }
  return form;
}
