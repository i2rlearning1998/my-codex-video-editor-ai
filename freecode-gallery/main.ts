import './style.css';
import { createFreeCodeRuntime } from '../src/freecode/runtime';
import { samples } from '../src/freecode/samples';
import type {
  FreeCodeMeta,
  FreeCodeSession,
  Params,
} from '../src/freecode/types';
const text = {
  title: 'Motion laboratory',
  subtitle: 'Original code studies · full resolution · transparent frames',
  tier: 'TIER C',
  source: 'Source & parameters',
  sample: 'Reference study',
  code: 'JavaScript module',
  validate: 'Validate & preview',
  preview: 'Canvas preview',
  resolution: 'Resolution',
  bake: 'Bake frames',
  compare: 'Determinism check',
  benchmark: 'Benchmark 720p + 1080p',
  cancel: 'Cancel / dispose',
  play: 'Play / pause',
  scrub: 'Frame',
  hostile: 'Hostile-code checks',
  run: 'Run hostile case',
  ready: 'Choose a study or paste a complete module.',
  note: 'Code runs in an isolated iframe. Internal drawing is not editable; exposed parameters are. Resource-exhaustion containment is not a production security guarantee.',
};
const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `<header><div><h1>${text.title}</h1><p>${text.subtitle}</p></div><span class="badge">${text.tier}</span></header><main><aside><section><h2>${text.source}</h2><label for="sample">${text.sample}</label><select id="sample"></select><label for="code">${text.code}</label><textarea id="code" spellcheck="false"></textarea><div class="actions"><button id="validate" class="primary">${text.validate}</button></div><div id="params"></div></section><section><h2>${text.hostile}</h2><select id="hostile" aria-label="Hostile case"></select><div class="actions"><button id="attack">${text.run}</button></div><small>${text.note}</small></section></aside><div><section><h2>${text.preview}</h2><div id="stage"><canvas id="canvas" width="1280" height="720"></canvas></div><div class="controls"><div><label for="resolution">${text.resolution}</label><select id="resolution"><option value="720">1280 × 720</option><option value="1080">1920 × 1080</option></select></div><div><label for="scrub">${text.scrub}</label><input id="scrub" type="range" min="0" max="95" step="1" value="0"></div></div><div class="actions"><button id="play">${text.play}</button><button id="bake" class="primary">${text.bake}</button><button id="compare">${text.compare}</button><button id="benchmark">${text.benchmark}</button><button id="cancel">${text.cancel}</button></div><progress id="progress" value="0" max="1"></progress><p id="status" role="status"></p><div id="metrics"></div><script id="proof-data" type="application/json">null</script></section></div></main>`;
function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
const choice = element<HTMLSelectElement>('sample'),
  code = element<HTMLTextAreaElement>('code'),
  canvas = element<HTMLCanvasElement>('canvas'),
  status = element('status'),
  progress = element<HTMLProgressElement>('progress'),
  scrub = element<HTMLInputElement>('scrub');
const runtime = createFreeCodeRuntime({ totalTimeoutMs: 120000 });
let meta: FreeCodeMeta | undefined,
  session: FreeCodeSession | undefined,
  epoch = 0,
  busy = false,
  playing = false,
  cache: Blob[] = [],
  cacheBytes = 0;
const active = new Set<FreeCodeSession>();
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
const params: Record<string, number | string | boolean> = {};
for (const sample of samples) {
  const r = runtime.validate(sample.source);
  choice.add(new Option(r.ok ? r.meta.name : sample.id, sample.id));
}
function stop() {
  epoch++;
  playing = false;
  for (const s of active) s.dispose();
  active.clear();
  session = undefined;
}
function clearCache() {
  cache = [];
  cacheBytes = 0;
}
function controls(lock: boolean) {
  busy = lock;
  for (const el of root.querySelectorAll<
    | HTMLButtonElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | HTMLInputElement
  >('button,select,textarea,input'))
    if (el.id !== 'cancel') el.disabled = lock;
}
function show(bitmap: ImageBitmap) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
}
function options(
  height = Number(element<HTMLSelectElement>('resolution').value),
) {
  return {
    width: Math.round((height * 16) / 9),
    height,
    fps: meta?.fps ?? 24,
    duration: meta?.duration ?? 4,
    params: { ...params } as Params,
    seed: 42,
  };
}
async function open(height?: number) {
  const started = epoch;
  const s = await runtime.open(code.value, options(height));
  if (started !== epoch) {
    s.dispose();
    throw Error('Cancelled while opening sandbox.');
  }
  active.add(s);
  return s;
}
function release(s: FreeCodeSession) {
  s.dispose();
  active.delete(s);
}
function valid() {
  const r = runtime.validate(code.value);
  if (!r.ok)
    throw Error(r.errors.map((e) => `Line ${e.line}: ${e.message}`).join('\n'));
  meta = r.meta;
  return r.meta;
}
function form() {
  const host = element('params');
  host.replaceChildren();
  for (const k of Object.keys(params)) delete params[k];
  for (const spec of meta!.params) {
    const label = document.createElement('label');
    label.textContent = spec.label;
    const input =
      spec.type === 'select'
        ? document.createElement('select')
        : document.createElement('input');
    input.id = 'param-' + spec.name;
    label.htmlFor = input.id;
    params[spec.name] = spec.default;
    if (input instanceof HTMLSelectElement && spec.type === 'select') {
      for (const value of spec.options) input.add(new Option(value, value));
      input.value = spec.default;
    }
    if (input instanceof HTMLInputElement) {
      input.type =
        spec.type === 'number'
          ? 'number'
          : spec.type === 'bool'
            ? 'checkbox'
            : spec.type === 'color'
              ? 'color'
              : 'text';
      input.value = String(spec.default);
      if (spec.type === 'number') {
        input.min = String(spec.min);
        input.max = String(spec.max);
        input.step = String(spec.step);
      }
      if (spec.type === 'bool') input.checked = spec.default;
    }
    input.addEventListener('change', () => {
      params[spec.name] =
        spec.type === 'number'
          ? Number(input.value)
          : spec.type === 'bool'
            ? (input as HTMLInputElement).checked
            : input.value;
      stop();
      clearCache();
      status.textContent =
        'Parameters changed. Validate preview or bake to apply.';
    });
    host.append(label, input);
  }
}
async function action(task: (run: number) => Promise<void>) {
  if (busy) return;
  playing = false;
  controls(true);
  const run = epoch;
  try {
    await task(run);
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : String(e);
  } finally {
    controls(false);
  }
}
async function preview(rebuild = false) {
  valid();
  if (rebuild) form();
  const opts = options();
  canvas.width = opts.width;
  canvas.height = opts.height;
  scrub.max = String(Math.ceil(opts.duration * opts.fps) - 1);
  if (session) release(session);
  session = await open();
  show(await session.thumbnail());
  status.textContent = `Valid · ${meta!.seekable ? 'seekable' : 'sequential simulation'} · ${meta!.params.length} parameters · ${opts.duration}s at ${opts.fps} fps`;
}
choice.addEventListener('change', () => {
  stop();
  clearCache();
  code.value = samples.find((s) => s.id === choice.value)!.source;
  void action(() => preview(true));
});
code.addEventListener('input', () => {
  stop();
  clearCache();
  meta = undefined;
});
element('validate').addEventListener(
  'click',
  () => void action(() => preview(meta === undefined)),
);
element('resolution').addEventListener('change', () => {
  stop();
  clearCache();
  void action(() => preview());
});
element('cancel').addEventListener('click', () => {
  stop();
  status.textContent = 'Cancelled; sandboxes disposed.';
});
async function frameAt(frame: number) {
  if (cache[frame]) {
    show(await createImageBitmap(cache[frame]!));
    return;
  }
  if (!meta?.seekable)
    throw Error('Bake this stateful animation before scrubbing.');
  session ??= await open();
  show(await session.renderFrame(frame));
}
scrub.addEventListener(
  'input',
  () => void action(() => frameAt(Number(scrub.value))),
);
element('play').addEventListener('click', () => {
  if (playing) {
    playing = false;
    return;
  }
  if (!cache.length && !meta?.seekable) {
    status.textContent = 'Bake this stateful animation before playback.';
    return;
  }
  playing = true;
  let f = Number(scrub.value);
  const tick = async () => {
    if (!playing || busy) return;
    try {
      await frameAt(f);
      scrub.value = String(f);
      f = (f + 1) % (Number(scrub.max) + 1);
      if (playing) setTimeout(() => void tick(), 1000 / (meta?.fps ?? 24));
    } catch (e) {
      playing = false;
      status.textContent = String(e);
    }
  };
  void tick();
});
function pixels(bitmap: ImageBitmap, context: CanvasRenderingContext2D) {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, context.canvas.width, context.canvas.height)
    .data;
}
const now = () => performance.now();
function record(data: unknown, summary: string) {
  element('proof-data').textContent = JSON.stringify(data);
  element('metrics').textContent = summary;
}
element('bake').addEventListener(
  'click',
  () =>
    void action(async (run) => {
      valid();
      clearCache();
      const opts = options(),
        count = Math.ceil(opts.duration * opts.fps);
      canvas.width = opts.width;
      canvas.height = opts.height;
      const s = await open();
      const start = now();
      try {
        for (let f = 0; f < count; f++) {
          if (run !== epoch) throw Error('Bake cancelled.');
          show(await s.renderFrame(f));
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(Error('PNG capture failed.'))),
              'image/png',
            ),
          );
          cacheBytes += blob.size;
          if (cacheBytes > 128 * 1024 * 1024)
            throw Error(
              'Compressed frame cache exceeds 128 MiB. Reduce duration or resolution.',
            );
          cache.push(blob);
          progress.value = (f + 1) / count;
          status.textContent = `Baking ${f + 1} / ${count}`;
        }
        const elapsed = now() - start;
        record(
          {
            kind: 'bake',
            frames: count,
            bakeMs: elapsed,
            cacheBytes,
            rawFrameBytes: opts.width * opts.height * 4,
          },
          `${count} frames baked in ${elapsed.toFixed(0)} ms\nPNG cache: ${(cacheBytes / 1048576).toFixed(1)} MiB · Raw frame: ${((opts.width * opts.height * 4) / 1048576).toFixed(1)} MiB`,
        );
        status.textContent = 'Bake complete. Play or scrub the cached frames.';
      } catch (e) {
        clearCache();
        throw e;
      } finally {
        release(s);
      }
    }),
);
async function compare(run: number, height: number) {
  valid();
  const opts = options(height),
    count = Math.ceil(opts.duration * opts.fps),
    a = await open(height),
    b = await open(height);
  const ca = document.createElement('canvas'),
    cb = document.createElement('canvas');
  ca.width = cb.width = opts.width;
  ca.height = cb.height = opts.height;
  const xa = ca.getContext('2d', { willReadFrequently: true })!,
    xb = cb.getContext('2d', { willReadFrequently: true })!;
  let maximum = 0,
    visible = false,
    peak = 0,
    secondBakeMs = 0,
    minVisiblePixels = Infinity;
  const times: number[] = [];
  const start = now();
  try {
    for (let f = 0; f < count; f++) {
      if (run !== epoch) throw Error('Comparison cancelled.');
      const tick = now();
      const ia = await a.renderFrame(f);
      times.push(now() - tick);
      peak = Math.max(peak, times[times.length - 1]!);
      const secondTick = now();
      const ib = await b.renderFrame(f);
      secondBakeMs += now() - secondTick;
      const da = pixels(ia, xa),
        db = pixels(ib, xb);
      let visibleA = 0,
        visibleB = 0;
      for (let i = 0; i < da.length; i++) {
        maximum = Math.max(maximum, Math.abs(da[i]! - db[i]!));
        if (i % 4 === 3) {
          if (da[i]! > 0) visibleA++;
          if (db[i]! > 0) visibleB++;
        }
      }
      minVisiblePixels = Math.min(minVisiblePixels, visibleA, visibleB);
      visible ||= visibleA > 0;
      progress.value = (f + 1) / count;
      status.textContent = `Two-bake comparison ${f + 1} / ${count} at ${height}p`;
    }
    return {
      height,
      width: opts.width,
      frames: count,
      maxChannelDifference: maximum,
      minVisiblePixels,
      visible,
      frameMeanMs: times.reduce((a, b) => a + b, 0) / times.length,
      framePeakMs: peak,
      firstBakeMs: times.reduce((a, b) => a + b, 0),
      secondBakeMs,
      twoBakeMs: now() - start,
      workingPixelBytes: opts.width * opts.height * 4 * 6,
      browser: navigator.userAgent,
    };
  } finally {
    release(a);
    release(b);
  }
}
element('compare').addEventListener(
  'click',
  () =>
    void action(async (run) => {
      const r = await compare(run, options().height);
      record(
        r,
        `${r.width} × ${r.height} · ${r.frames} frames in each bake\nMaximum channel difference: ${r.maxChannelDifference} / 255\nFrame round-trip mean / peak: ${r.frameMeanMs.toFixed(2)} / ${r.framePeakMs.toFixed(2)} ms\nTwo bakes + comparison: ${r.twoBakeMs.toFixed(0)} ms\nWorking pixel estimate: ${(r.workingPixelBytes / 1048576).toFixed(1)} MiB (excludes libraries, GPU and browser overhead)`,
      );
      status.textContent =
        r.maxChannelDifference === 0 && r.visible
          ? 'Determinism passed: two bakes match.'
          : 'Determinism failed or animation is blank.';
    }),
);
element('benchmark').addEventListener(
  'click',
  () =>
    void action(async (run) => {
      const results = [];
      for (const height of [720, 1080])
        results.push(await compare(run, height));
      record(
        results,
        results
          .map(
            (r) =>
              `${r.height}p: mean ${r.frameMeanMs.toFixed(2)} ms · peak ${r.framePeakMs.toFixed(2)} ms · two bakes ${r.twoBakeMs.toFixed(0)} ms · max difference ${r.maxChannelDifference}`,
          )
          .join('\n'),
      );
      status.textContent =
        'Benchmark complete. Measurements include frame transport and capture, not encoding.';
    }),
);
const attacks: Record<string, string> = {
  fetch: 'fetch("https://example.com")',
  WebSocket: 'new WebSocket("wss://example.com")',
  parent: 'parent.document.body.textContent="attack"',
  storage: 'localStorage.setItem("attack","1")',
  loop: 'while(true) {}',
  allocation: 'const a=[];while(true){a.push(new Uint8Array(1024*1024));}',
  import: 'import("https://example.com/module.js")',
  timeout: 'return new Promise(()=>{});',
};
const hostile = element<HTMLSelectElement>('hostile');
for (const key of Object.keys(attacks)) hostile.add(new Option(key, key));
element('attack').addEventListener(
  'click',
  () =>
    void action(async () => {
      const source = `export default {meta:{id:'hostile',name:'Hostile',version:'1.0.0',category:'Test',duration:1,params:[]},init(){},renderFrame(){${attacks[hostile.value]}}}`;
      const r = runtime.validate(source);
      if (!r.ok) {
        status.textContent =
          'Safely rejected: ' +
          r.errors.map((e) => `Line ${e.line}: ${e.message}`).join('\n');
        return;
      }
      const s = await runtime.open(source, {
        width: 64,
        height: 64,
        fps: 1,
        duration: 1,
        params: {},
        seed: 1,
      });
      active.add(s);
      try {
        (await s.renderFrame(0)).close();
        status.textContent =
          'Unexpected success: hostile case was not blocked.';
      } catch (e) {
        status.textContent = 'Safely stopped: ' + String(e);
      } finally {
        release(s);
      }
    }),
);
status.textContent = text.ready;
choice.value = samples[0]!.id;
code.value = samples[0]!.source;
void action(() => preview(true));
