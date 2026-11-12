// P4: Director's asset step. For every file the video needs the person picks
// who makes it: AI, themselves, or "give me prompts". Director waits on this
// page; the choice and the added files are kept, so closing the site and
// coming back resumes right here.
import { clear, h, put } from '../dom';
import { t, type Key } from '../strings';
import type { Screen } from '../app';
import { aiPossible, applyModes } from '../asset-slots';
import { deleteSlotFile, extOf, getSlotFile, putSlotFile } from '../slot-files';
import type {
  AssetSlot,
  DirectorPause,
  SlotMode,
} from '../../project/workspace';
import type { VideoPlan } from '../../video-plan';
import { empty } from './common';

const MODES: { mode: SlotMode; key: Key }[] = [
  { mode: 'ai', key: 'step.modeAi' },
  { mode: 'upload', key: 'step.modeUpload' },
  { mode: 'prompt', key: 'step.modePrompt' },
];
const ACCEPT = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
} as const;

export const assetStepScreen: Screen = async (ctx, [id = ''], out) => {
  const ws = ctx.s.ws(ctx.user.id);
  ws.reload();
  const project = ws.video(id);
  if (!project || !project.pause) {
    put(
      out,
      empty(t('step.none')),
      h('a', { class: 'button', href: '#/projects', text: t('nav.projects') }),
    );
    return;
  }
  let pause: DirectorPause = project.pause;
  const c = ctx.s.config;
  const plan = ctx.s.planOf(ctx.user.id);
  const reach = (m: string) => ctx.s.connected(m);

  // Files added earlier are still there (the slot says so); check they are.
  for (const sl of pause.slots)
    if (sl.filled && !(await getSlotFile(id, sl.name).catch(() => undefined)))
      ws.fillSlot(id, sl.name, false);
  pause = ws.video(id)!.pause!;

  const save = () => ws.pause(id, { ...pause, slots: pause.slots });
  const list = h('div', { class: 'step-list', id: 'step-list' });
  const cards = h('div', { class: 'room-starts step-cards', id: 'step-cards' });
  const err = h('p', {
    class: 'error-state',
    role: 'alert',
    id: 'step-error',
    hidden: true,
  });

  const saveMediaAsset = async (sl: AssetSlot, file: File, name: string) => {
    const small = file.size < 1_500_000;
    const dataUrl = small
      ? await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => resolve('');
          r.readAsDataURL(file);
        })
      : '';
    const aid = `slot-${id}-${sl.name}`;
    ctx.s.deleteAsset(aid);
    ctx.s.saveAsset({
      id: aid,
      userId: ctx.user.id,
      projectId: id,
      kind: sl.kind,
      name,
      studioId: 'upload',
      library: 'media',
      ...(dataUrl ? { dataUrl } : {}),
      bytes: file.size,
      createdAt: new Date().toISOString(),
    });
  };

  const row = (sl: AssetSlot) => {
    const aiOk = !!sl.ai && aiPossible(c, plan, sl, reach);
    const modes = h(
      'div',
      { class: 'step-modes', role: 'group', 'aria-label': t('step.name') },
      MODES.map(({ mode, key }) =>
        h(
          'button',
          {
            type: 'button',
            class: `seg${sl.mode === mode ? ' on' : ''}`,
            'data-mode': mode,
            'aria-pressed': String(sl.mode === mode),
            disabled: mode === 'ai' && !aiOk,
            onclick: () => {
              sl.mode = mode;
              save();
              paint();
            },
          },
          t(key),
        ),
      ),
    );
    const finalName = (file: File) => `${sl.name}${extOf(file.name)}`;
    const pick = h('input', {
      type: 'file',
      accept: ACCEPT[sl.kind],
      'aria-label': `${t('step.pick')}: ${sl.name}`,
      'data-slot-file': sl.name,
      onchange: async () => {
        const file = pick.files?.[0];
        if (!file) return;
        const name = finalName(file);
        await putSlotFile(id, sl.name, { name, type: file.type, blob: file });
        await saveMediaAsset(sl, file, name);
        ws.fillSlot(id, sl.name, true);
        pause = ws.video(id)!.pause!;
        paint();
      },
    });
    const body: (Node | null)[] = [];
    if (sl.mode === 'prompt')
      body.push(
        h('p', { class: 'field-label', text: t('step.prompt') }),
        h('pre', {
          class: 'step-prompt',
          'data-prompt': sl.name,
          text: sl.prompt,
        }),
        h('button', {
          type: 'button',
          class: 'button sm',
          'data-copy-prompt': sl.name,
          text: t('step.copyPrompt'),
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(sl.prompt);
            } catch {
              /* the prompt is on screen */
            }
            ctx.toast(t('step.copied'));
          },
        }),
      );
    if (sl.mode !== 'ai') {
      body.push(
        h('p', { class: 'muted', text: t('step.rename', { name: sl.name }) }),
        pick,
      );
      if (sl.filled)
        body.push(
          h(
            'button',
            {
              type: 'button',
              class: 'button sm',
              'data-clear-slot': sl.name,
              onclick: async () => {
                await deleteSlotFile(id, sl.name).catch(() => undefined);
                ctx.s.deleteAsset(`slot-${id}-${sl.name}`);
                ws.fillSlot(id, sl.name, false);
                pause = ws.video(id)!.pause!;
                paint();
              },
            },
            t('lib.toTrash'),
          ),
        );
    }
    return h(
      'article',
      {
        class: 'step-row',
        'data-slot': sl.name,
        'data-mode': sl.mode,
        'data-filled': String(sl.filled),
      },
      h(
        'div',
        { class: 'step-head' },
        h('span', { class: 'step-name', text: sl.name }),
        h('span', {
          class: 'muted',
          text: sl.filled ? t('step.have', { name: sl.name }) : sl.kind,
        }),
      ),
      modes,
      ...body,
    );
  };

  const build = (fresh: boolean) => {
    const slots = pause.slots;
    const video = applyModes(pause.job.plan as VideoPlan, slots);
    const aiVoice = slots.some(
      (s) => s.name === 'narration' && s.mode === 'ai',
    );
    sessionStorage.setItem(
      `aive.panel.build.${ctx.user.id}`,
      JSON.stringify({
        styleId: pause.templateId,
        plan: video,
        model: pause.job.model,
        max: pause.job.max,
        voice: pause.job.voice && aiVoice,
        projectId: id,
        slots,
        key: `build-${id}-${Date.now().toString(36)}`,
      }),
    );
    void fresh;
    ctx.go('build');
  };

  const paint = () => {
    const slots = pause.slots;
    clear(list, ...slots.map(row));
    const own = slots.filter((s) => s.mode !== 'ai');
    const missing = own.filter((s) => !s.filled).length;
    const anyFilled = own.some((s) => s.filled);
    const card = (
      key: 'upload' | 'skip' | 'ai',
      title: Key,
      help: Key,
      disabled: boolean,
      go: () => void,
    ) =>
      h(
        'button',
        {
          type: 'button',
          class: 'room-start glow ws-start',
          id: `step-${key}`,
          'data-step': key,
          disabled,
          onclick: go,
        },
        h('strong', { text: t(title) }),
        h('span', { text: t(help) }),
        key === 'upload' && missing
          ? h('span', { text: t('step.missing', { n: missing }) })
          : null,
      );
    clear(
      cards,
      ...(own.length
        ? [
            card(
              'upload',
              'step.uploadCard',
              'step.uploadHelp',
              !anyFilled,
              () => build(false),
            ),
            card('skip', 'step.skipCard', 'step.skipHelp', false, () =>
              build(true),
            ),
          ]
        : [
            card('ai', 'step.buildAi', 'step.estimate', false, () =>
              build(false),
            ),
          ]),
    );
    // "Build the video" shows the hold; its help line carries the number.
    const help = cards.querySelector('[data-step="ai"] span');
    if (help) help.textContent = t('step.estimate', { n: pause.job.max });
  };

  put(
    out,
    h('a', {
      class: 'back-link',
      href: `#/plan/${pause.templateId}`,
      text: t('step.back'),
    }),
    h('h1', { text: t('step.title') }),
    h('p', { class: 'muted', text: t('step.sub') }),
    list,
    cards,
    err,
  );
  paint();
};
