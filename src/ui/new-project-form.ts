import type { EditorEngine } from '../core';
import { t, subscribe } from '../i18n';
import {
  aspects,
  resolutions,
  frameRates,
  presetSize,
  validateNewProject,
  createProjectFromSettings,
  type Aspect,
  type Resolution,
  type NewProjectInput,
} from '../project/new-project';
import { confirmDialog } from './components/modal';
import { temporaryOverlay } from './temporary-overlay';

export function mountNewProjectForm(
  engine: EditorEngine,
  report: (message: string) => void,
) {
  // Standalone form styled by the combined Wave 1 shell.
  const overlay = temporaryOverlay('new-project-form', () => t('project.new'));
  const form = document.createElement('form');
  form.noValidate = true;
  const controls = new Map<
    keyof NewProjectInput,
    HTMLInputElement | HTMLSelectElement
  >();
  const labels = new Map<keyof NewProjectInput, HTMLSpanElement>();
  const errors = new Map<keyof NewProjectInput, HTMLElement>();
  const field = (name: keyof NewProjectInput, options?: readonly string[]) => {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    const input = options
      ? document.createElement('select')
      : document.createElement('input');
    if (options)
      for (const value of options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value === 'custom' ? t('project.custom') : value;
        input.append(option);
      }
    input.name = name;
    input.id = `new-project-${name}`;
    caption.id = `${input.id}-label`;
    input.setAttribute('aria-labelledby', caption.id);
    const error = document.createElement('span');
    error.id = `${input.id}-error`;
    error.setAttribute('role', 'alert');
    input.setAttribute('aria-describedby', error.id);
    label.append(caption, input, error);
    form.append(label, document.createElement('br'));
    controls.set(name, input);
    labels.set(name, caption);
    errors.set(name, error);
    return input;
  };
  field('name');
  field('aspect', aspects);
  field('resolution', Object.keys(resolutions));
  for (const name of ['width', 'height'] as const) {
    const input = field(name) as HTMLInputElement;
    input.type = 'number';
    input.min = '16';
    input.max = '7680';
    input.step = '2';
  }
  field('fps', frameRates.map(String));
  // TODO: "transparent" will need a schema migration in a later wave.
  (field('background') as HTMLInputElement).type = 'color';
  const submit = document.createElement('button');
  submit.type = 'submit';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.onclick = overlay.close;
  form.append(submit, cancel);
  overlay.element.append(form);
  const translate = () => {
    for (const [key, caption] of labels)
      caption.textContent = t(`project.${key}`);
    const custom = form.querySelector<HTMLOptionElement>(
      'option[value="custom"]',
    );
    if (custom) custom.textContent = t('project.custom');
    submit.textContent = t('project.create');
    cancel.textContent = t('action.cancel');
  };
  const value = (key: keyof NewProjectInput) => controls.get(key)!.value;
  const updateSize = () => {
    const custom = value('aspect') === 'custom';
    controls.get('resolution')!.disabled = custom;
    for (const key of ['width', 'height'] as const)
      controls.get(key)!.disabled = !custom;
    if (!custom) {
      const size = presetSize(
        value('aspect') as Exclude<Aspect, 'custom'>,
        value('resolution') as Resolution,
      );
      for (const key of ['width', 'height'] as const)
        controls.get(key)!.value = String(size[key]);
    }
  };
  controls.get('aspect')!.onchange = updateSize;
  controls.get('resolution')!.onchange = updateSize;
  let submitting = false;
  let disposed = false;
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (submitting || disposed) return;
    const result = validateNewProject(
      Object.fromEntries(
        [...controls].map(([key, control]) => [key, control.value]),
      ),
    );
    for (const [key, element] of errors) {
      const error = result.ok ? undefined : result.errors[key];
      element.textContent = error ? t(error) : '';
      controls.get(key)!.setAttribute('aria-invalid', String(!!error));
    }
    if (!result.ok) {
      controls
        .get(Object.keys(result.errors)[0] as keyof NewProjectInput)
        ?.focus();
      return;
    }
    submitting = true;
    // A native popover occupies the browser's top layer; close it so the app modal
    // can receive focus and clicks. Reopen this same form on cancel, preserving values.
    overlay.close();
    try {
      const confirmed = await confirmDialog(t('project.replace'), {
        titleText: t('project.new'),
        confirmLabel: t('project.create'),
        cancelLabel: t('action.cancel'),
      });
      if (disposed) return;
      if (!confirmed) {
        overlay.open();
        submit.focus();
        return;
      }
      createProjectFromSettings(result.settings, engine);
      overlay.close();
      report(t('project.created'));
    } catch {
      if (!disposed) {
        overlay.open();
        report(t('project.error.invalid'));
      }
    } finally {
      submitting = false;
    }
  };
  const unsubscribe = subscribe(translate);
  return {
    open() {
      translate();
      const defaults = {
        name: t('project.untitled'),
        aspect: '16:9',
        resolution: '1080p',
        width: '1920',
        height: '1080',
        fps: '30',
        background: '#101219',
      };
      for (const [key, control] of controls) {
        control.value = defaults[key];
        control.removeAttribute('aria-invalid');
        errors.get(key)!.textContent = '';
      }
      updateSize();
      overlay.open();
      controls.get('name')!.focus();
    },
    dispose() {
      disposed = true;
      unsubscribe();
      overlay.dispose();
    },
  };
}
