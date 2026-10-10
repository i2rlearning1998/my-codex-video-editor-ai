// I2: "Save as template" (the empty canvas menu and the scene strip). A
// dialog asks for a name and a category; the scene is kept in this browser
// (My Templates), not in the project and not on the Undo stack.
import type { EditorEngine } from '../core';
import { getLanguage, t } from '../i18n';
import { loadLibrary } from '../library/loader';
import { escapeHtml, openModal } from './components/modal';
import { showToast } from './components/toast';
import { myTemplates, templateFromScene } from './my-templates';

export function openSaveTemplate(
  engine: EditorEngine,
  sceneId: string,
  poster: () => string | undefined,
) {
  const scene = engine.state.compositions.find((item) => item.id === sceneId);
  if (!scene) return;
  let name!: HTMLInputElement;
  let category!: HTMLSelectElement;
  const modal = openModal({
    titleText: escapeHtml(t('myTemplates.saveTitle')),
    bodyBuilder: (body) => {
      const form = document.createElement('div');
      form.className = 'save-template-form';
      const nameLabel = document.createElement('label');
      nameLabel.textContent = t('myTemplates.name');
      name = document.createElement('input');
      name.type = 'text';
      name.id = 'save-template-name';
      name.maxLength = 80;
      name.value = scene.name;
      nameLabel.append(name);
      const categoryLabel = document.createElement('label');
      categoryLabel.textContent = t('myTemplates.category');
      category = document.createElement('select');
      category.id = 'save-template-category';
      const mine = document.createElement('option');
      mine.value = 'my';
      mine.textContent = t('templates.my');
      category.append(mine);
      loadLibrary().then(
        (manifest) => {
          for (const entry of manifest.templates ?? []) {
            if (entry.id === 'all') continue;
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent =
              getLanguage() === 'hi' ? entry.name.hi : entry.name.en;
            category.append(option);
          }
        },
        () => undefined,
      );
      categoryLabel.append(category);
      const hint = document.createElement('p');
      hint.className = 'tool-panel-hint';
      hint.textContent = t('myTemplates.hint');
      const actions = document.createElement('div');
      actions.className = 'modal-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'button';
      cancel.dataset.action = 'save-template-cancel';
      cancel.textContent = t('media.cancel');
      cancel.onclick = () => modal.close();
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'button primary';
      save.dataset.action = 'save-template-confirm';
      save.textContent = t('myTemplates.saveButton');
      save.onclick = () => confirm();
      actions.append(cancel, save);
      form.append(nameLabel, categoryLabel, hint);
      body.append(form, actions);
      name.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          confirm();
        }
      };
    },
  });
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      name.focus();
      name.select();
    }),
  );
  const confirm = () => {
    const title = name.value.trim();
    if (!title) {
      name.focus();
      return;
    }
    try {
      const template = templateFromScene(
        engine.state,
        sceneId,
        title,
        category.value,
        poster(),
      );
      myTemplates.save(template);
      modal.close();
      showToast(
        template.mediaIncluded
          ? t('myTemplates.saved', { name: title })
          : t('myTemplates.savedNoMedia', { name: title }),
        template.mediaIncluded ? 'success' : 'warning',
        template.mediaIncluded ? 4000 : 8000,
      );
    } catch (error) {
      showToast(
        t('myTemplates.failed', {
          error: error instanceof Error ? error.message : String(error),
        }),
        'error',
      );
    }
  };
}
