// B1: the New AI video form. The user fills what they know; everything they
// fill is LOCKED in the brief and everything left empty is FREE for the AI
// creator (src/ai-brief/form.ts). Files are never read: a Choose button only
// takes the file's name, and the footer lists the files to attach in the
// Claude chat. Nothing here blocks: missing values only show soft hints.
import { t } from '../i18n';
import {
  BRIEF_ASPECTS,
  briefFilesText,
  briefSections,
  emptyBriefForm,
  normalizeBriefForm,
  type BriefFormValues,
} from '../ai-brief/form';
import { openModal } from './components/modal';
import { iconSvg } from './icons';

export interface BriefStyleCard {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly thumbnail: string;
}
export interface BriefDialogOptions {
  readonly styles: () => readonly BriefStyleCard[];
  readonly initial?: Partial<BriefFormValues> | null;
  readonly copy: (values: BriefFormValues) => void | Promise<void>;
  readonly save: (values: BriefFormValues) => void | Promise<void>;
  readonly copyText: (text: string) => void | Promise<void>;
  readonly report: (error: unknown) => void;
}

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
const escape = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
const names = (text: string) =>
  text
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter(Boolean);

export function openBriefDialog(options: BriefDialogOptions) {
  const values = structuredClone(
    normalizeBriefForm({ ...emptyBriefForm(), ...(options.initial ?? {}) }),
  ) as Mutable<BriefFormValues>;
  const segmented = (
    name: string,
    choices: readonly [string, string][],
    current: string,
  ) =>
    `<div class="brief-segmented" role="radiogroup" data-name="${name}">${choices
      .map(
        ([value, label]) =>
          `<button type="button" role="radio" class="brief-segment" data-value="${value}" aria-checked="${value === current}">${label}</button>`,
      )
      .join('')}</div>`;
  const fileRow = (id: string, multiple: boolean, placeholder: string) =>
    `<div class="brief-file"><input type="text" id="${id}" placeholder="${placeholder}" /><button type="button" class="button brief-choose" data-for="${id}" data-multiple="${multiple}">${iconSvg('upload', 16)}<span>${t('briefForm.choose')}</span></button></div>`;
  const toggle = (id: string, label: string, body: string) =>
    `<div class="brief-option"><label class="brief-check"><input type="checkbox" id="${id}" /> <span>${label}</span></label><div class="brief-option-body" data-for="${id}" hidden>${body}</div></div>`;
  const handle = openModal({
    titleText: t('briefForm.title'),
    bodyHtml: `
      <div class="brief-form">
        <div class="brief-scroll">
          <p class="brief-intro">${t('briefForm.intro')}</p>
          <div class="brief-columns">
            <section class="brief-section" data-section="what">
              <h3>${t('briefForm.what')}</h3>
              <div class="brief-field">
                <span class="brief-field-label">${t('briefForm.style')}</span>
                <div class="brief-styles" id="brief-styles" role="radiogroup" aria-label="${t('briefForm.style')}"></div>
              </div>
              <label class="brief-field"><span class="brief-field-label">${t('briefForm.topic')}</span>
                <input type="text" id="brief-topic" maxlength="500" placeholder="${t('briefForm.topicPlaceholder')}" />
                <span class="brief-hint" id="brief-topic-hint">${t('briefForm.topicHint')}</span></label>
              <div class="brief-row">
                <label class="brief-field"><span class="brief-field-label">${t('briefForm.language')}</span>
                  <input type="text" id="brief-language" maxlength="80" placeholder="${t('briefForm.languagePlaceholder')}" /></label>
                <label class="brief-field"><span class="brief-field-label">${t('briefForm.length')}</span>
                  <input type="number" id="brief-length" min="1" max="3600" step="1" placeholder="${t('briefForm.auto')}" /></label>
              </div>
              <div class="brief-field"><span class="brief-field-label">${t('briefForm.aspect')}</span>
                ${segmented('aspect', [['', t('briefForm.auto')], ...BRIEF_ASPECTS.map((aspect) => [aspect, aspect] as [string, string])], values.aspect)}</div>
              <div class="brief-row">
                <div class="brief-field"><span class="brief-field-label">${t('briefForm.fps')}</span>
                  ${segmented(
                    'fps',
                    [
                      ['', t('briefForm.auto')],
                      ['24', '24'],
                      ['25', '25'],
                      ['30', '30'],
                      ['60', '60'],
                    ],
                    values.fps ? String(values.fps) : '',
                  )}</div>
              </div>
              <div class="brief-field"><span class="brief-field-label">${t('briefForm.platform')}</span>
                ${segmented(
                  'platform',
                  [
                    ['', t('briefForm.any')],
                    ['youtube', 'YouTube'],
                    ['reels', 'Reels'],
                    ['shorts', 'Shorts'],
                    ['other', t('briefForm.other')],
                  ],
                  values.platform,
                )}
                <input type="text" id="brief-platform-other" maxlength="80" placeholder="${t('briefForm.platformOther')}" hidden /></div>
            </section>
            <section class="brief-section" data-section="content">
              <h3>${t('briefForm.content')}</h3>
              <p class="brief-hint">${t('briefForm.contentHint')}</p>
              ${toggle(
                'brief-script-on',
                t('briefForm.script'),
                `<textarea id="brief-script" rows="5" placeholder="${t('briefForm.scriptPlaceholder')}"></textarea>
                 ${segmented(
                   'script-mode',
                   [
                     ['exact', t('briefForm.scriptExact')],
                     ['improve', t('briefForm.scriptImprove')],
                   ],
                   values.script.mode,
                 )}`,
              )}
              ${toggle(
                'brief-audio-on',
                t('briefForm.audio'),
                `${fileRow('brief-audio-file', false, t('briefForm.fileName'))}
                 ${segmented(
                   'transcript',
                   [
                     ['transcribe', t('briefForm.transcribe')],
                     ['have', t('briefForm.haveTranscript')],
                   ],
                   values.audio.transcript,
                 )}
                 <textarea id="brief-transcript" rows="4" placeholder="${t('briefForm.transcriptPlaceholder')}" hidden></textarea>`,
              )}
              ${toggle('brief-topic-only', t('briefForm.topicOnly'), `<p class="brief-hint">${t('briefForm.topicOnlyHint')}</p>`)}
              ${toggle(
                'brief-video-on',
                t('briefForm.video'),
                `${fileRow('brief-video-file', false, t('briefForm.fileName'))}
                 <label class="brief-check"><input type="checkbox" id="brief-video-motion" checked /> <span>${t('briefForm.addMotion')}</span></label>`,
              )}
              ${toggle(
                'brief-notes-on',
                t('briefForm.notes'),
                `${fileRow('brief-notes-files', true, t('briefForm.fileNames'))}
                 <textarea id="brief-notes" rows="3" placeholder="${t('briefForm.notesPlaceholder')}"></textarea>`,
              )}
            </section>
            <section class="brief-section" data-section="references">
              <h3>${t('briefForm.references')}</h3>
              <label class="brief-field"><span class="brief-field-label">${t('briefForm.refImages')}</span>${fileRow('brief-ref-images', true, t('briefForm.fileNames'))}</label>
              <label class="brief-field"><span class="brief-field-label">${t('briefForm.refVideos')}</span>${fileRow('brief-ref-videos', true, t('briefForm.fileNames'))}</label>
              <label class="brief-field"><span class="brief-field-label">${t('briefForm.logo')}</span>${fileRow('brief-logo', false, t('briefForm.fileName'))}</label>
              <div class="brief-field"><span class="brief-field-label">${t('briefForm.colours')}</span>
                <div class="brief-colours" id="brief-colours"></div></div>
              <label class="brief-field"><span class="brief-field-label">${t('briefForm.fonts')}</span>
                <input type="text" id="brief-fonts" maxlength="200" placeholder="${t('briefForm.fontsPlaceholder')}" /></label>
            </section>
            <section class="brief-section" data-section="freedom">
              <h3>${t('briefForm.freedom')}</h3>
              <div class="brief-freedom" id="brief-freedom" role="radiogroup" aria-label="${t('briefForm.freedom')}">
                ${(['strict', 'guided', 'free'] as const)
                  .map(
                    (level) =>
                      `<button type="button" role="radio" class="brief-freedom-card" data-value="${level}" aria-checked="false"><strong>${t(`briefForm.freedom.${level}`)}</strong><span>${t(`briefForm.freedom.${level}Text`)}</span></button>`,
                  )
                  .join('')}
              </div>
              <div class="brief-field"><span class="brief-field-label">${t('briefForm.locks')}</span>
                <div class="brief-chips" id="brief-locks">
                  ${(['script', 'style', 'colours', 'length'] as const)
                    .map(
                      (lock) =>
                        `<button type="button" class="brief-chip" data-lock="${lock}" aria-pressed="false">${iconSvg('lock', 16)}<span>${t(`briefForm.lock.${lock}`)}</span></button>`,
                    )
                    .join('')}
                </div></div>
              <h3>${t('briefForm.assets')}</h3>
              <p class="brief-rule">${iconSvg('info', 16)}<span>${t('briefForm.assetsRule')}</span></p>
              <div class="brief-row">
                <label class="brief-field"><span class="brief-field-label">${t('briefForm.aiImages')}</span>
                  <input type="number" id="brief-ai-images" min="0" max="50" step="1" value="0" /></label>
                <label class="brief-field"><span class="brief-field-label">${t('briefForm.aiVideos')}</span>
                  <input type="number" id="brief-ai-videos" min="0" max="20" step="1" value="0" /></label>
              </div>
              <label class="brief-check"><input type="checkbox" id="brief-only-mine" /> <span>${t('briefForm.onlyMine')}</span></label>
            </section>
            <section class="brief-section" data-section="voice">
              <h3>${t('briefForm.voiceMusic')}</h3>
              <div class="brief-field"><span class="brief-field-label">${t('briefForm.voice')}</span>
                ${segmented(
                  'voice',
                  [
                    ['', t('briefForm.unset')],
                    ['mine', t('briefForm.voiceMine')],
                    ['ai', t('briefForm.voiceAi')],
                    ['none', t('briefForm.none')],
                  ],
                  values.voice,
                )}</div>
              <div class="brief-field"><span class="brief-field-label">${t('briefForm.music')}</span>
                ${segmented(
                  'music',
                  [
                    ['', t('briefForm.unset')],
                    ['none', t('briefForm.none')],
                    ['library', t('briefForm.musicLibrary')],
                    ['mine', t('briefForm.musicMine')],
                  ],
                  values.music,
                )}
                <div id="brief-music-file-row" hidden>${fileRow('brief-music-file', false, t('briefForm.fileName'))}</div></div>
            </section>
            <section class="brief-section" data-section="extra">
              <h3>${t('briefForm.extra')}</h3>
              <textarea id="brief-extra" rows="4" placeholder="${t('briefForm.extraPlaceholder')}"></textarea>
            </section>
          </div>
        </div>
        <footer class="brief-footer">
          <div class="brief-files" id="brief-files-row" hidden>
            <span id="brief-files"></span>
            <button type="button" class="button" id="brief-files-copy">${iconSvg('copy', 16)}<span>${t('briefForm.copyFiles')}</span></button>
          </div>
          <div class="brief-actions">
            <span class="brief-summary" id="brief-summary"></span>
            <button type="button" class="button" id="brief-form-save">${iconSvg('save', 16)}<span>${t('briefForm.save')}</span></button>
            <button type="button" class="button primary" id="brief-form-copy">${iconSvg('copy', 16)}<span>${t('briefForm.copy')}</span></button>
          </div>
        </footer>
      </div>`,
  });
  const root = handle.root;
  root.classList.add('new-video-dialog');
  const $ = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const safely = (action: () => unknown) => {
    try {
      const result = action();
      if (result instanceof Promise)
        result.catch((error: unknown) => options.report(error));
    } catch (error) {
      options.report(error);
    }
  };

  // Style cards, with "No style - you decide" first.
  const paintStyles = () => {
    const host = $('brief-styles');
    const card = (
      id: string | null,
      name: string,
      thumbnail: string | null,
    ) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'brief-style';
      button.setAttribute('role', 'radio');
      button.dataset.styleId = id ?? '';
      button.setAttribute('aria-checked', String(values.styleId === id));
      button.innerHTML = thumbnail
        ? `<img alt="" src="${escape(thumbnail)}" />`
        : `<span class="brief-style-none">${iconSvg('magic', 24)}</span>`;
      const label = document.createElement('span');
      label.textContent = name;
      button.append(label);
      button.onclick = () => {
        values.styleId = id;
        paintStyles();
        sync();
      };
      return button;
    };
    const styles = options.styles();
    host.replaceChildren(
      card(null, t('briefForm.noStyle'), null),
      ...styles.map((style) => card(style.id, style.name, style.thumbnail)),
    );
    if (!styles.length) {
      const hint = document.createElement('p');
      hint.className = 'brief-hint';
      hint.textContent = t('briefForm.noStyles');
      host.append(hint);
    }
  };
  // Brand colours: up to five pickers, each removable.
  const paintColours = () => {
    const host = $('brief-colours');
    host.replaceChildren(
      ...values.references.colours.map((colour, index) => {
        const wrap = document.createElement('span');
        wrap.className = 'brief-colour';
        const input = document.createElement('input');
        input.type = 'color';
        input.value = colour;
        input.setAttribute(
          'aria-label',
          t('briefForm.colourN', { n: String(index + 1) }),
        );
        input.oninput = () => {
          values.references.colours[index] = input.value;
          sync();
        };
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'icon-button brief-colour-remove';
        remove.innerHTML = iconSvg('close', 16);
        remove.setAttribute('aria-label', t('briefForm.removeColour'));
        remove.title = t('briefForm.removeColour');
        remove.onclick = () => {
          values.references.colours.splice(index, 1);
          paintColours();
          sync();
        };
        wrap.append(input, remove);
        return wrap;
      }),
    );
    if (values.references.colours.length < 5) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'button brief-colour-add';
      add.id = 'brief-colour-add';
      add.innerHTML = `${iconSvg('plus', 16)}<span>${t('briefForm.addColour')}</span>`;
      add.onclick = () => {
        values.references.colours.push(`#${randomHex()}`);
        paintColours();
        sync();
      };
      host.append(add);
    }
  };
  const randomHex = () =>
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0');

  // Fill the fields from the values (a reopened My brief comes prefilled).
  const text = (id: string, value: string) => {
    $<HTMLInputElement | HTMLTextAreaElement>(id).value = value;
  };
  const check = (id: string, value: boolean) => {
    $<HTMLInputElement>(id).checked = value;
  };
  text('brief-topic', values.topic);
  text('brief-language', values.language);
  text(
    'brief-length',
    values.lengthSeconds ? String(values.lengthSeconds) : '',
  );
  text('brief-platform-other', values.platformOther);
  check('brief-script-on', values.script.on);
  text('brief-script', values.script.text);
  check('brief-audio-on', values.audio.on);
  text('brief-audio-file', values.audio.file);
  text('brief-transcript', values.audio.transcriptText);
  check('brief-topic-only', values.topicOnly);
  check('brief-video-on', values.video.on);
  text('brief-video-file', values.video.file);
  check('brief-video-motion', values.video.addMotion);
  check('brief-notes-on', values.notes.on);
  text('brief-notes-files', values.notes.files.join(', '));
  text('brief-notes', values.notes.text);
  text('brief-ref-images', values.references.images.join(', '));
  text('brief-ref-videos', values.references.videos.join(', '));
  text('brief-logo', values.references.logo);
  text('brief-fonts', values.references.fonts);
  text('brief-ai-images', String(values.assets.aiImages));
  text('brief-ai-videos', String(values.assets.aiVideos));
  check('brief-only-mine', values.assets.onlyMine);
  text('brief-music-file', values.musicFile);
  text('brief-extra', values.extra);

  /** Reads every field into `values`, then refreshes what depends on them. */
  const read = () => {
    const value = (id: string) =>
      $<HTMLInputElement | HTMLTextAreaElement>(id).value;
    const on = (id: string) => $<HTMLInputElement>(id).checked;
    const number = (id: string, max: number) => {
      const parsed = Number(value(id));
      return Number.isFinite(parsed) && parsed > 0
        ? Math.min(max, parsed)
        : null;
    };
    values.topic = value('brief-topic');
    values.language = value('brief-language');
    values.lengthSeconds = number('brief-length', 3600);
    values.platformOther = value('brief-platform-other');
    values.script.on = on('brief-script-on');
    values.script.text = value('brief-script');
    values.audio.on = on('brief-audio-on');
    values.audio.file = value('brief-audio-file');
    values.audio.transcriptText = value('brief-transcript');
    values.topicOnly = on('brief-topic-only');
    values.video.on = on('brief-video-on');
    values.video.file = value('brief-video-file');
    values.video.addMotion = on('brief-video-motion');
    values.notes.on = on('brief-notes-on');
    values.notes.files = names(value('brief-notes-files'));
    values.notes.text = value('brief-notes');
    values.references.images = names(value('brief-ref-images'));
    values.references.videos = names(value('brief-ref-videos'));
    values.references.logo = value('brief-logo').trim();
    values.references.fonts = value('brief-fonts');
    values.assets.aiImages = Math.round(number('brief-ai-images', 50) ?? 0);
    values.assets.aiVideos = Math.round(number('brief-ai-videos', 20) ?? 0);
    values.assets.onlyMine = on('brief-only-mine');
    values.musicFile = value('brief-music-file');
    values.extra = value('brief-extra');
  };
  const sync = () => {
    for (const body of root.querySelectorAll<HTMLElement>('.brief-option-body'))
      body.hidden = !$<HTMLInputElement>(body.dataset.for!).checked;
    $('brief-transcript').hidden = values.audio.transcript !== 'have';
    $('brief-platform-other').hidden = values.platform !== 'other';
    $('brief-music-file-row').hidden = values.music !== 'mine';
    for (const card of root.querySelectorAll<HTMLElement>(
      '.brief-freedom-card',
    ))
      card.setAttribute(
        'aria-checked',
        String((values.freedom || 'guided') === card.dataset.value),
      );
    root
      .querySelector('.brief-freedom-card[data-value="guided"]')
      ?.classList.toggle('brief-default', !values.freedom);
    for (const chip of root.querySelectorAll<HTMLElement>('[data-lock]'))
      chip.setAttribute(
        'aria-pressed',
        String(values.locks[chip.dataset.lock as keyof typeof values.locks]),
      );
    // Soft hints only: nothing is ever blocked.
    $('brief-topic-hint').classList.toggle(
      'brief-hint-soft',
      !values.topic.trim(),
    );
    const style = options.styles().find((item) => item.id === values.styleId);
    const { locked, free } = briefSections(
      values,
      style ? { id: style.id, name: style.name } : null,
    );
    $('brief-summary').textContent = t('briefForm.summary', {
      locked: String(locked.length),
      free: String(free.length),
    });
    const files = briefFilesText(values);
    $('brief-files-row').hidden = !files;
    $('brief-files').textContent = files;
  };
  root.addEventListener('input', () => {
    read();
    sync();
  });
  root.addEventListener('change', () => {
    read();
    sync();
  });
  // Segmented choices.
  for (const group of root.querySelectorAll<HTMLElement>('.brief-segmented'))
    group.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>(
        '.brief-segment',
      );
      if (!button) return;
      for (const other of group.querySelectorAll('.brief-segment'))
        other.setAttribute('aria-checked', String(other === button));
      const value = button.dataset.value!;
      switch (group.dataset.name) {
        case 'aspect':
          values.aspect = value as BriefFormValues['aspect'];
          break;
        case 'fps':
          values.fps = value ? Number(value) : null;
          break;
        case 'platform':
          values.platform = value as BriefFormValues['platform'];
          break;
        case 'script-mode':
          values.script.mode = value as 'exact' | 'improve';
          break;
        case 'transcript':
          values.audio.transcript = value as 'have' | 'transcribe';
          break;
        case 'voice':
          values.voice = value as BriefFormValues['voice'];
          break;
        case 'music':
          values.music = value as BriefFormValues['music'];
          break;
      }
      sync();
    });
  $('brief-freedom').addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>(
      '.brief-freedom-card',
    );
    if (!card) return;
    values.freedom = card.dataset.value as BriefFormValues['freedom'];
    sync();
  });
  $('brief-locks').addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-lock]',
    );
    if (!chip) return;
    const key = chip.dataset.lock as keyof typeof values.locks;
    values.locks[key] = !values.locks[key];
    sync();
  });
  // Choose buttons take only the file names; the files are never read.
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '.brief-choose',
  ))
    button.onclick = () => {
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.multiple = button.dataset.multiple === 'true';
      picker.onchange = () => {
        const chosen = [...(picker.files ?? [])].map((file) => file.name);
        if (!chosen.length) return;
        const field = $<HTMLInputElement>(button.dataset.for!);
        field.value = picker.multiple
          ? [...names(field.value), ...chosen].join(', ')
          : chosen[0]!;
        read();
        sync();
      };
      picker.click();
    };
  $('brief-files-copy').onclick = () =>
    safely(() => options.copyText(briefFilesText(values)));
  $('brief-form-copy').onclick = () => {
    read();
    safely(() => options.copy(structuredClone(values)));
  };
  $('brief-form-save').onclick = () => {
    read();
    safely(() => options.save(structuredClone(values)));
  };
  paintStyles();
  paintColours();
  sync();
  return {
    root,
    close: handle.close,
    get values(): BriefFormValues {
      read();
      return structuredClone(values);
    },
  };
}
