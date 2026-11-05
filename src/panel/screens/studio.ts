// P2-32, P2-33: Studio tools from config and the project-wise Asset Library.
// Each run shows its cost first, goes through the gateway (mock this round)
// and saves its result to the chosen project's assets.
import {
  canUse,
  defaultModelFor,
  modelAvailability,
  modelsForRole,
  enabledStudios,
  needsConsent,
  studioById,
  studioForm,
  type Answers,
} from '../../platform-config';
import { estimateStudio, GatewayError, hash } from '../../gateway';
import { icon, studioIcon } from '../icons';
import { h, clear, put } from '../dom';
import { waveSvg } from '../art';
import type { Ctx, Screen } from '../app';
import { renderForm } from '../form';
import type { Asset } from '../services';
import { t } from '../strings';
import { studioService } from '../p3-services';
import { modelStudio, type SaveRun } from './studio-model';
import { bestModels, card, empty, limitAlert, when } from './common';

const UNSORTED = 'unsorted';
async function projectOptions(ctx: Ctx) {
  let list: { id: string; name: string }[] = [];
  try {
    const trash = new Set(ctx.prefs().trash);
    list = (await ctx.s.projects.list())
      .filter((p) => !trash.has(p.id))
      .map((p) => ({ id: p.id, name: p.name }));
  } catch {
    list = [];
  }
  return [{ id: UNSORTED, name: t('studio.unsorted') }, ...list];
}
/** A picture drawn offline (the mock image model's result). */
export function mockImage(seed: string, label: string): string {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const g = c.getContext('2d')!;
  const hue = hash(seed) % 360;
  const grad = g.createLinearGradient(0, 0, 320, 180);
  grad.addColorStop(0, `hsl(${hue} 70% 45%)`);
  grad.addColorStop(1, `hsl(${(hue + 60) % 360} 70% 25%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 320, 180);
  g.fillStyle = '#fff';
  g.font = '600 16px sans-serif';
  g.fillText(label.slice(0, 34), 14, 160);
  return c.toDataURL('image/png');
}
/** A short tone (the mock voice or music model's result), as a WAV data URL. */
export function mockAudio(seed: string, seconds = 1): string {
  const rate = 8000;
  const n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) =>
    [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  const f = 220 + (hash(seed) % 440);
  for (let i = 0; i < n; i++)
    v.setInt16(
      44 + i * 2,
      Math.round(
        Math.sin((2 * Math.PI * f * i) / rate) *
          8000 *
          Math.min(1, (n - i) / 800),
      ),
      true,
    );
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return `data:audio/wav;base64,${btoa(s)}`;
}

function studioTabs(ctx: Ctx, activeId: string): HTMLElement {
  return h(
    'nav',
    { class: 'tool-tabs', 'aria-label': t('studio.title') },
    enabledStudios(ctx.s.config).map((x) =>
      h(
        'a',
        {
          href: `#/studio/${x.id}`,
          class: 'tool-tab',
          'data-tab': x.id,
          'aria-current': x.id === activeId ? 'page' : undefined,
        },
        ctx.say(x.name),
      ),
    ),
  );
}

export const studioScreen: Screen = async (ctx, [studioId = ''], out) => {
  const c = ctx.s.config;
  const plan = ctx.s.planOf(ctx.user.id);
  if (!studioId) {
    put(
      out,
      h('h1', { text: t('studio.title') }),
      h(
        'div',
        { class: 'grid', id: 'studio-list' },
        enabledStudios(c).map((s) => {
          const ok = canUse(plan, s.requires);
          return card(
            { 'data-studio': s.id, 'data-locked': String(!ok) },
            h(
              'span',
              { class: `tool-ico out-${s.output}` },
              icon(studioIcon(s.output)),
            ),
            h('h3', { text: ctx.say(s.name) }),
            s.blurb ? h('p', { class: 'muted', text: ctx.say(s.blurb) }) : null,
            ok
              ? h(
                  'a',
                  { class: 'button primary sm', href: `#/studio/${s.id}` },
                  t('common.open'),
                )
              : h(
                  'a',
                  {
                    class: 'button sm',
                    href: '#/credits',
                    'data-upgrade': s.id,
                  },
                  icon('lock', 14),
                  ` ${t('common.upgrade')}`,
                ),
          );
        }),
      ),
    );
    return;
  }
  const s = studioById(c, studioId);
  if (!s || !s.enabled) {
    out.append(empty(t('common.none')));
    return;
  }
  if (!canUse(plan, s.requires)) {
    put(
      out,
      h('h1', { text: ctx.say(s.name) }),
      h('p', {
        class: 'locked-state',
        id: 'studio-locked',
        text: t('common.locked'),
      }),
      h(
        'a',
        { class: 'button primary', href: '#/credits', id: 'studio-upgrade' },
        t('common.upgrade'),
      ),
    );
    return;
  }
  // P3U: when the chosen studio's models declare their own parameters, the form
  // is drawn from them (the config-driven form below is the fallback).
  {
    const save: SaveRun = (r) => {
      const prompt = r.request.prompt;
      const seed = `${prompt}:${Date.now()}`;
      const asset: Asset = {
        id: `asset-${Date.now().toString(36)}-${hash(seed).toString(36)}`,
        userId: ctx.user.id,
        projectId: r.projectId ?? UNSORTED,
        kind: s.output,
        name: `${ctx.say(s.name)}: ${prompt.split('\n')[0]!.slice(0, 40)}`,
        studioId: s.id,
        bytes: 0,
        createdAt: new Date().toISOString(),
      };
      if (s.output === 'image' || s.output === 'video')
        asset.dataUrl = mockImage(seed, prompt);
      else if (s.output === 'audio') asset.dataUrl = mockAudio(seed);
      else asset.text = prompt;
      asset.bytes = (asset.dataUrl?.length ?? 0) + (asset.text?.length ?? 0);
      ctx.s.saveAsset(asset);
      return asset.id;
    };
    const svc = await studioService(ctx, save);
    const models = svc ? await svc.models(s.id) : [];
    if (svc && models.length) {
      await modelStudio({
        ctx,
        svc,
        studioId: s.id,
        title: ctx.say(s.name),
        tabs: studioTabs(ctx, s.id),
        projects: await projectOptions(ctx),
        models,
        out,
      });
      return;
    }
  }
  // A connected model the plan allows, a real one before the offline mock.
  const model =
    bestModels(ctx, modelsForRole(c, s.role)).find(
      (m) => modelAvailability(c, plan, m.id).ok && ctx.s.connected(m.id),
    ) ?? defaultModelFor(c, plan, s.role);
  let answers: Answers = {};
  const cost = h('p', {
    class: 'estimate',
    id: 'studio-cost',
    'aria-live': 'polite',
  });
  const consent = s.consent
    ? h(
        'label',
        { class: 'choice consent', id: 'studio-consent-row' },
        h('input', { type: 'checkbox', id: 'studio-consent' }),
        h('span', { text: ctx.say(s.consent) }),
      )
    : null;
  const result = h('div', {
    class: 'result',
    id: 'studio-result',
    'aria-live': 'polite',
  });
  const projects = await projectOptions(ctx);
  const project = h(
    'select',
    { id: 'studio-project' },
    projects.map((p) => h('option', { value: p.id, text: p.name })),
  );
  let max = 0;
  const update = () => {
    if (!model) return;
    const e = estimateStudio(c, s, model, answers);
    max = e.max;
    cost.textContent = t('studio.cost', { n: e.max });
    if (consent) consent.hidden = !needsConsent(s, answers);
  };
  const form = renderForm(studioForm(s), answers, ctx.say, (a) => {
    answers = a;
    update();
  });
  const run = h(
    'button',
    {
      type: 'button',
      class: 'button primary',
      id: 'studio-run',
      disabled: !model,
      onclick: async () => {
        form.showIssues();
        if (form.issues().length) return ctx.toast(t('brief.fix'), 'error');
        if (
          consent &&
          !consent.hidden &&
          !(consent.querySelector('input') as HTMLInputElement).checked
        )
          return ctx.toast(t('studio.consentNeeded'), 'error');
        if (!model) return;
        run.disabled = true;
        clear(result, h('p', { class: 'loading', text: t('studio.working') }));
        const prompt = Object.values(answers)
          .filter((v) => typeof v === 'string')
          .join('\n');
        const units = estimateStudio(c, s, model, answers).units;
        const work = c.costs.find((x) => x.id === s.costId);
        try {
          const r = await ctx.s.gateway.run({
            userId: ctx.user.id,
            plan,
            role: s.role,
            modelId: model.id,
            request: {
              system: `studio:${s.id}`,
              messages: [{ role: 'user', content: prompt }],
              prompt,
              units,
            },
            maxCredits: max,
            workCredits: work ? work.min * units : 0,
            requires: s.requires,
            ...(s.toolId ? { toolId: s.toolId } : {}),
            ...(answers.mode === 'clone'
              ? { action: 'voice-clone' as const }
              : { action: 'store' as const }),
            // P2B-27: what the result will add to the plan's storage.
            addMb:
              s.output === 'video'
                ? 20
                : s.output === 'image' || s.output === 'audio'
                  ? 2
                  : 0.01,
            key: `studio-${s.id}-${Date.now().toString(36)}`,
          });
          const seed = `${prompt}:${Date.now()}`;
          const name = `${ctx.say(s.name)}${answers.mode === 'clone' ? ' (clone)' : ''}: ${prompt.split('\n')[0]!.slice(0, 40)}`;
          const asset: Asset = {
            id: `asset-${Date.now().toString(36)}-${hash(seed).toString(36)}`,
            userId: ctx.user.id,
            projectId: project.value,
            kind: s.output,
            name,
            studioId: s.id,
            bytes: 0,
            createdAt: new Date().toISOString(),
          };
          const made = r.result.media;
          if (made?.base64 && made.mime)
            // A real model's file (through the server).
            asset.dataUrl = `data:${made.mime};base64,${made.base64}`;
          else if (s.output === 'image' || s.output === 'video')
            asset.dataUrl = mockImage(seed, prompt);
          else if (s.output === 'audio') asset.dataUrl = mockAudio(seed);
          else if (s.output === 'captions')
            asset.text = `1\n00:00:00,000 --> 00:00:03,000\n${prompt.slice(0, 60)}\n`;
          else asset.text = r.result.text ?? '';
          asset.bytes =
            (asset.dataUrl?.length ?? 0) + (asset.text?.length ?? 0);
          ctx.s.saveAsset(asset);
          const pname =
            projects.find((p) => p.id === project.value)?.name ?? '';
          clear(
            result,
            h('p', {
              class: 'ok-state',
              id: 'studio-saved',
              text: t('studio.savedTo', { project: pname, n: r.credits }),
            }),
            assetView(asset),
          );
          await ctx.s.sync(ctx.user.id).catch(() => undefined);
          ctx.refreshTop();
        } catch (e) {
          if (e instanceof GatewayError && e.code.startsWith('limit-')) {
            clear(result, limitAlert('studio-error', e.message));
            return;
          }
          const msg =
            e instanceof GatewayError
              ? e.code === 'shortage'
                ? t('gw.shortage', {
                    need: e.detail.need ?? '',
                    have: e.detail.have ?? '',
                  })
                : t('gw.refused', { message: e.message })
              : t('app.error');
          clear(
            result,
            h('p', {
              class: 'error-state',
              role: 'alert',
              id: 'studio-error',
              text: msg,
            }),
          );
          await ctx.s.sync(ctx.user.id).catch(() => undefined);
          ctx.refreshTop();
        } finally {
          run.disabled = false;
        }
      },
    },
    t('studio.run'),
  );
  // P2B-32: tool tabs, and a waveform beside each voice choice.
  const tabs = studioTabs(ctx, s.id);
  if (s.output === 'audio')
    for (const choice of form.el.querySelectorAll<HTMLElement>('.choice'))
      choice.append(waveSvg(choice.textContent ?? ''));
  put(
    out,
    tabs,
    h('h1', { text: ctx.say(s.name) }),
    h('p', { class: 'muted', text: t('studio.mockNote') }),
    form.el,
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
    consent,
    cost,
    run,
    result,
  );
  update();
};

export function assetView(a: Asset): HTMLElement {
  return h(
    'div',
    { class: 'asset-view', 'data-kind': a.kind },
    a.kind === 'image' || a.kind === 'video'
      ? h('img', { src: a.dataUrl, alt: a.name, class: 'thumb' })
      : a.kind === 'audio'
        ? h('audio', { src: a.dataUrl, controls: true })
        : h('pre', { class: 'asset-text', text: a.text ?? '' }),
  );
}

export const assetsScreen: Screen = async (ctx, _a, out) => {
  const projects = await projectOptions(ctx);
  let current = projects[0]!.id;
  const list = h('div', { class: 'grid', id: 'asset-list' });
  const pick = h(
    'select',
    {
      id: 'assets-project',
      onchange: () => {
        current = pick.value;
        paint();
      },
    },
    projects.map((p) => h('option', { value: p.id, text: p.name })),
  );
  const paint = () => {
    const mine = ctx.s
      .assets(ctx.user.id)
      .filter((a) => a.projectId === current);
    clear(
      list,
      ...(mine.length
        ? mine.map((a) => {
            const to = h(
              'select',
              { 'aria-label': t('assets.copyTo'), 'data-copy-target': a.id },
              projects
                .filter((p) => p.id !== current)
                .map((p) => h('option', { value: p.id, text: p.name })),
            );
            return card(
              { 'data-asset': a.id, 'data-kind': a.kind },
              h('h3', { text: a.name }),
              h('p', {
                class: 'muted',
                text: when(a.createdAt, ctx.prefs().locale),
              }),
              assetView(a),
              projects.length > 1
                ? h(
                    'div',
                    { class: 'actions' },
                    to,
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'button sm',
                        'data-copy': a.id,
                        onclick: () => {
                          ctx.s.saveAsset({
                            ...a,
                            id: `${a.id}-c${Date.now().toString(36)}`,
                            projectId: to.value,
                            createdAt: new Date().toISOString(),
                          });
                          ctx.toast(t('assets.copied'));
                        },
                      },
                      t('assets.copyTo'),
                    ),
                  )
                : null,
            );
          })
        : [
            h(
              'div',
              { class: 'empty-state assets-empty' },
              icon('assets', 28),
              h('p', { text: t('assets.empty') }),
              h('a', {
                class: 'button primary sm',
                href: '#/studio',
                text: t('nav.studio'),
              }),
            ),
          ]),
    );
  };
  put(
    out,
    h('h1', { text: t('assets.title') }),
    h(
      'div',
      { class: 'field' },
      h('label', {
        for: 'assets-project',
        class: 'field-label',
        text: t('assets.project'),
      }),
      pick,
    ),
    list,
  );
  paint();
};
