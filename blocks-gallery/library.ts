import { blockLibrary } from '../src/blocks/library';
/** Adds only a Library section; selection reuses the existing compile/worker controls. */
export function mountLibrary() {
  const section = document.getElementById('library')!;
  for (const entry of blockLibrary) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.libraryId = entry.id;
    button.textContent = entry.name + ' · ' + entry.category;
    button.onclick = () => {
      const compile = document.getElementById('compile') as HTMLButtonElement;
      if (compile.disabled) return;
      (document.getElementById('source') as HTMLTextAreaElement).value =
        entry.source;
      compile.click();
    };
    section.append(button);
  }
}
