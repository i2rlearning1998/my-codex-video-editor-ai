// P4: a video Director built from a plan can wait for files the person brings
// (their own, or made from prompts elsewhere). The composition finds files by
// exact name, so this lists every expected name, lets the person copy it, and
// takes a file for a name (the file is saved under that name, whatever its
// own name or extension was). Own strings, like the account slot's.
import { getLanguage } from '../i18n';
import { openModal } from './components/modal';

export interface ExpectedAsset {
  readonly name: string;
  readonly kind: 'image' | 'audio' | 'video';
  readonly filled: boolean;
}

const WORDS = {
  title: ['Upload your AI assets', 'अपने AI एसेट अपलोड करें'],
  lead: [
    'Upload your AI assets to generate from AI composition. The video finds each file by its exact name, so save or choose each one under the name shown.',
    'AI कम्पोज़िशन से बनाने के लिए अपने AI एसेट अपलोड करें। वीडियो हर फ़ाइल उसके सटीक नाम से ढूँढता है, इसलिए हर फ़ाइल दिखाए गए नाम से सेव या चुनें।',
  ],
  copy: ['Copy name', 'नाम कॉपी करें'],
  choose: ['Choose file', 'फ़ाइल चुनें'],
  added: ['Added', 'जुड़ गई'],
  build: ['Build again with these files', 'इन फ़ाइलों के साथ फिर बनाएँ'],
  later: ['Later', 'बाद में'],
  note: [
    'Whatever name your file has, it is assigned to this empty slot and saved under the name shown. The extension does not matter.',
    'आपकी फ़ाइल का नाम कुछ भी हो, वह इस खाली जगह को दी जाती है और दिखाए गए नाम से सेव होती है। एक्सटेंशन मायने नहीं रखता।',
  ],
} as const;
const w = (k: keyof typeof WORDS): string =>
  WORDS[k][getLanguage() === 'hi' ? 1 : 0];

const ACCEPT = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
} as const;
const extOf = (name: string) => /\.[a-z0-9]{2,5}$/i.exec(name)?.[0] ?? '';

/** The names a handoff still waits for (empty when none, or nothing was saved). */
export function readExpected(key: string): ExpectedAsset[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
    return Array.isArray(v)
      ? (v as ExpectedAsset[]).filter(
          (x) => x && typeof x.name === 'string' && !x.filled,
        )
      : [];
  } catch {
    return [];
  }
}

export function showMissingAssets(options: {
  readonly missing: readonly ExpectedAsset[];
  /** Imports files into Project Media (the names are already final). */
  readonly importFiles: (files: File[]) => Promise<void>;
  /** Builds the plan again (the editor's own Build dialog decides where). */
  readonly rebuild: () => void;
}): void {
  const done = new Set<string>();
  let build: HTMLButtonElement | null = null;
  const handle = openModal({
    titleText: w('title'),
    bodyBuilder: (body) => {
      body.setAttribute('data-missing-assets', '');
      const lead = document.createElement('p');
      lead.id = 'missing-assets-lead';
      lead.textContent = w('lead');
      const list = document.createElement('ul');
      list.id = 'missing-assets-list';
      list.style.cssText =
        'list-style:none;margin:12px 0;padding:0;display:grid;gap:8px';
      for (const slot of options.missing) {
        const li = document.createElement('li');
        li.dataset.slot = slot.name;
        li.style.cssText =
          'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
        const name = document.createElement('code');
        name.textContent = slot.name;
        name.className = 'missing-asset-name';
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = w('copy');
        copy.addEventListener('click', () => {
          void navigator.clipboard?.writeText(slot.name).catch(() => undefined);
        });
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ACCEPT[slot.kind];
        input.hidden = true;
        input.setAttribute('data-slot-input', slot.name);
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.textContent = w('choose');
        choose.addEventListener('click', () => input.click());
        const state = document.createElement('span');
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;
          const renamed = new File([file], `${slot.name}${extOf(file.name)}`, {
            type: file.type,
          });
          await options.importFiles([renamed]);
          done.add(slot.name);
          state.textContent = `✓ ${w('added')}`;
          li.dataset.filled = 'true';
          if (build) build.disabled = false;
        });
        li.append(name, copy, choose, input, state);
        list.append(li);
      }
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = w('note');
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
      build = document.createElement('button');
      build.type = 'button';
      build.id = 'missing-assets-build';
      build.disabled = true;
      build.textContent = w('build');
      build.addEventListener('click', () => {
        handle.close();
        options.rebuild();
      });
      const later = document.createElement('button');
      later.type = 'button';
      later.textContent = w('later');
      later.addEventListener('click', () => handle.close());
      row.append(later, build);
      body.append(lead, list, note, row);
    },
  });
}
