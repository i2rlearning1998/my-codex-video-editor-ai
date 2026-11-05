// P3U: a Studio screen whose form comes from the CHOSEN MODEL's declared
// parameters (StudioService + StudioEngine). Switching the model changes the
// fields; the cost range, "what will be sent" and Director's Improve button
// all follow the form. The config-driven screen in studio.ts stays for studios
// whose models declare no parameters.
import type { FormSpec, FormValues, StudioService } from '../../contracts/p3';
import { studioEngine } from '../p3-services';
import { h, clear, put } from '../dom';
import { icon } from '../icons';
import type { Ctx } from '../app';
import {
  renderStudioForm,
  type StudioFormView,
  type Txt,
} from '../studio-fields';
import { t } from '../strings';
import type { MockSavedRun } from '../../contracts/p3-mock-studio';

export type ModelStudioArgs = {
  ctx: Ctx;
  svc: StudioService;
  studioId: string;
  title: string;
  tabs: HTMLElement;
  projects: { id: string; name: string }[];
  models: Awaited<ReturnType<StudioService['models']>>;
  out: HTMLElement;
};

export async function modelStudio(a: ModelStudioArgs): Promise<void> {
  const { ctx, svc, studioId, models } = a;
  const engine = await studioEngine(ctx);
  const say = (x: Txt | undefined): string =>
    x ? ctx.say({ en: x.en, ...(x.hi ? { hi: x.hi } : {}) }) : '';
  let modelId = (models.find((m) => !m.locked && m.connected) ?? models[0]!).id;
  let spec: FormSpec = await svc.form(studioId, modelId);
  let view: StudioFormView;
  let before: FormValues | null = null;

  const holder = h('div', { id: 'studio-form-holder' });
  const picker = h('div', {
    class: 'seg-group model-picker',
    role: 'radiogroup',
    id: 'studio-models',
    'aria-label': t('studio.model'),
  });
  const cost = h('p', {
    class: 'estimate',
    id: 'studio-cost',
    'aria-live': 'polite',
  });
  const result = h('div', {
    class: 'result',
    id: 'studio-result',
    'aria-live': 'polite',
  });
  const progress = h(
    'div',
    {
      class: 'studio-progress',
      id: 'studio-progress',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      hidden: true,
    },
    h('span', { class: 'bar' }),
    h('span', { class: 'label' }),
  );
  const note = h('p', { class: 'muted', id: 'studio-enhance-note' });
  const project = h(
    'select',
    { id: 'studio-project' },
    a.projects.map((p) => h('option', { value: p.id, text: p.name })),
  );

  let token = 0;
  const updateCost = async () => {
    const mine = ++token;
    const e = await svc.estimate(studioId, modelId, view.values());
    if (mine !== token) return;
    cost.textContent = t('studio.range', { min: e.min, max: e.max });
  };

  const paintPicker = () =>
    clear(
      picker,
      ...models.map((m) => {
        const ok = !m.locked && m.connected;
        return h(
          'button',
          {
            type: 'button',
            class: `seg${m.id === modelId ? ' on' : ''}`,
            role: 'radio',
            'aria-checked': String(m.id === modelId),
            disabled: !ok,
            title: ok
              ? undefined
              : m.locked
                ? t('common.locked')
                : t('common.notConnected'),
            'data-model': m.id,
            onclick: () => void pickModel(m.id),
          },
          say(m.name),
          ok ? null : h('span', { class: 'lock', text: ' 🔒' }),
        );
      }),
    );

  const draw = (values: FormValues) => {
    view = renderStudioForm(spec, engine, values, say, () => {
      before = null;
      undo.hidden = true;
      void updateCost();
    });
    clear(holder, view.el);
    enhance.hidden = !spec.canEnhance;
    void updateCost();
  };

  async function pickModel(id: string) {
    if (id === modelId) return;
    const keep = view.values();
    modelId = id;
    spec = await svc.form(studioId, id);
    // Carry over what the new model also asks for.
    const ids = new Set([...spec.basic, ...spec.advanced].map((d) => d.id));
    const carried = Object.fromEntries(
      Object.entries(keep).filter(([k]) => ids.has(k)),
    );
    paintPicker();
    draw(carried);
  }

  const enhance = h(
    'button',
    {
      type: 'button',
      class: 'button',
      id: 'studio-enhance',
      onclick: async () => {
        enhance.disabled = true;
        note.textContent = t('studio.enhanceWorking');
        const cur = view.values();
        const r = await svc.enhance(studioId, modelId, cur);
        enhance.disabled = false;
        if (!r.ok) {
          note.textContent = say(r.failure.message);
          return;
        }
        view.setValues(r.value);
        // After setValues: it fires onChange, which forgets the old values.
        before = cur;
        note.textContent = t('studio.enhanced');
        undo.hidden = false;
      },
    },
    icon('director', 16),
    ` ${t('studio.enhance')}`,
  );
  const undo = h(
    'button',
    {
      type: 'button',
      class: 'button sm',
      id: 'studio-enhance-undo',
      hidden: true,
      onclick: () => {
        if (!before) return;
        view.setValues(before);
        before = null;
        undo.hidden = true;
        note.textContent = '';
      },
    },
    t('studio.enhanceUndo'),
  );

  const run = h(
    'button',
    {
      type: 'button',
      class: 'button primary',
      id: 'studio-run',
      onclick: async () => {
        if (!view.showIssues()) return ctx.toast(t('brief.fix'), 'error');
        run.disabled = true;
        clear(result);
        progress.hidden = false;
        const set = (pct: number) => {
          progress.setAttribute('aria-valuenow', String(pct));
          (progress.firstElementChild as HTMLElement).style.width = `${pct}%`;
          progress.lastElementChild!.textContent = t('studio.progress', {
            pct,
          });
        };
        set(0);
        try {
          for await (const ev of svc.run(
            studioId,
            modelId,
            view.values(),
            project.value === 'unsorted' ? null : project.value,
          )) {
            if (ev.type === 'progress') set(ev.pct);
            else if (ev.type === 'failure') {
              put(
                result,
                h(
                  'p',
                  {
                    class: 'error-state',
                    role: 'alert',
                    id: 'studio-error',
                  },
                  say(ev.failure.message),
                  ev.failure.upgrade
                    ? [
                        ' ',
                        h('a', {
                          href: '#/credits',
                          text: t('common.upgrade'),
                        }),
                      ]
                    : [],
                ),
              );
            } else {
              const pname =
                a.projects.find((p) => p.id === project.value)?.name ?? '';
              put(
                result,
                h('p', {
                  class: 'ok-state',
                  id: 'studio-saved',
                  'data-asset': ev.assetId,
                  text: t('studio.savedPlain', { project: pname }),
                }),
              );
            }
          }
        } finally {
          progress.hidden = true;
          run.disabled = false;
          // The server settled the run: read the new balance and history.
          await ctx.s.sync(ctx.user.id).catch(() => undefined);
          ctx.refreshTop();
        }
      },
    },
    t('studio.run'),
  );

  paintPicker();
  draw({});
  put(
    a.out,
    a.tabs,
    h('h1', { text: a.title }),
    h('p', { class: 'muted', text: t('studio.mockNote') }),
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label', text: t('studio.model') }),
      picker,
    ),
    holder,
    h('div', { class: 'actions' }, enhance, undo),
    note,
    h(
      'div',
      { class: 'field' },
      h('label', {
        for: 'studio-project',
        class: 'field-label',
        text: t('studio.project'),
      }),
      project,
    ),
    cost,
    run,
    progress,
    result,
  );
}

/** Turns a finished mock run into an Asset Library item (the screen's save). */
export type SaveRun = (run: MockSavedRun) => string;
