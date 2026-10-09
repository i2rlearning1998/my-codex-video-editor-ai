import './style.css';
import { blocks, getBlock, validateParams } from '../src/blocks';
import type { BlockInfo, Value } from '../src/blocks';
import { createSandbox } from '../src/blocks/sandbox/client';
import type { SandboxClient } from '../src/blocks/sandbox/client';
import type { CompiledBlock } from '../src/blocks/sandbox/compile';
import { sampleSource } from './sample';
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('preview'),
  // Match the worker's default accelerated context; do not force only preview
  // onto a different CPU rasterizer. Explicit false also avoids readback heuristics.
  ctx = canvas.getContext('2d', { willReadFrequently: false })!;
const blockSelect = $<HTMLSelectElement>('block'),
  time = $<HTMLInputElement>('time'),
  scrub = $<HTMLInputElement>('scrub'),
  seed = $<HTMLInputElement>('seed');
const status = $('frame-status'),
  results = $('results'),
  codeStatus = $('code-status'),
  source = $<HTMLTextAreaElement>('source');
const play = $<HTMLButtonElement>('play');
let info: BlockInfo = blocks[0]!,
  params: Record<string, Value> = {},
  custom: CompiledBlock | undefined,
  sandbox: SandboxClient | undefined;
let playing = false,
  busy = false,
  generation = 0,
  painted = Promise.resolve();
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function stop() {
  playing = false;
  play.textContent = 'Play';
}
function select(infoNext: BlockInfo) {
  stop();
  info = infoNext;
  params = { ...validateParams(info.params, {}) };
  time.max = scrub.max = String(info.defaultDuration);
  time.value = scrub.value = String(info.thumbnailTime ?? 0);
  const panel = $('params');
  panel.replaceChildren();
  for (const spec of info.params) {
    const label = document.createElement('label');
    label.textContent = spec.label;
    const input =
      spec.type === 'select'
        ? document.createElement('select')
        : document.createElement('input');
    input.id = 'param-' + spec.name;
    if (input instanceof HTMLSelectElement && spec.type === 'select')
      for (const value of spec.options) {
        const option = new Option(value, value);
        input.add(option);
      }
    if (input instanceof HTMLInputElement) {
      input.type =
        spec.type === 'bool'
          ? 'checkbox'
          : spec.type === 'color'
            ? 'text'
            : spec.type === 'number'
              ? 'number'
              : 'text';
      if (spec.type === 'number') {
        input.min = String(spec.min);
        input.max = String(spec.max);
        input.step = String(spec.step);
      }
      if (spec.type === 'text') input.maxLength = spec.maxLength ?? 200;
      if (spec.type === 'bool') input.checked = spec.default;
    }
    input.value = String(spec.default);
    input.oninput = () => {
      params[spec.name] =
        spec.type === 'number'
          ? Number(input.value)
          : spec.type === 'bool'
            ? (input as HTMLInputElement).checked
            : input.value;
      queuePaint();
    };
    label.append(input);
    panel.append(label);
  }
  queuePaint();
}
async function paint() {
  const thisGeneration = generation,
    t = Number(time.value),
    currentSeed = Number(seed.value),
    p = validateParams(info.params, params);
  const activeCustom = blockSelect.value === 'custom' ? custom : undefined;
  if (activeCustom) {
    sandbox ??= createSandbox();
    const reply = await sandbox.render({
      compiled: activeCustom,
      t,
      size: { width: canvas.width, height: canvas.height },
      params: p,
      seed: currentSeed,
    });
    if (thisGeneration !== generation) return;
    if (!reply.ok || !reply.pixels) {
      sandbox.dispose();
      sandbox = undefined;
      throw Error(reply.error ?? 'Missing pixels');
    }
    ctx.putImageData(
      new ImageData(
        new Uint8ClampedArray(reply.pixels),
        canvas.width,
        canvas.height,
      ),
      0,
      0,
    );
  } else getBlock(info.id)!.render(ctx, t, canvas, p, currentSeed);
  if (thisGeneration === generation) {
    canvas.dataset.time = String(t);
    status.textContent = `Rendered ${info.name} at ${t.toFixed(2)} s`;
    codeStatus.textContent = activeCustom
      ? 'Worker frame OK.'
      : 'Starter block (trusted library).';
  }
}
function queuePaint() {
  const requested = ++generation;
  painted = painted
    .then(async () => {
      if (requested === generation) await paint();
    })
    .catch((error) => {
      status.textContent = 'Error: ' + message(error);
      codeStatus.textContent = 'Runtime error: ' + message(error);
      stop();
    });
  return painted;
}
for (const block of blocks) blockSelect.add(new Option(block.name, block.id));
blockSelect.onchange = () => {
  sandbox?.dispose();
  sandbox = undefined;
  if (blockSelect.value === 'custom' && custom) select(custom.info);
  else select(getBlock(blockSelect.value)!);
};
time.oninput = () => {
  stop();
  scrub.value = time.value;
  queuePaint();
};
scrub.oninput = () => {
  stop();
  time.value = scrub.value;
  queuePaint();
};
seed.oninput = () => queuePaint();
play.onclick = () => {
  if (playing) {
    stop();
    return;
  }
  playing = true;
  play.textContent = 'Pause';
  let last = performance.now();
  const tick = async (now: number) => {
    if (!playing || busy) return;
    const next =
      (Number(time.value) + (now - last) / 1000) % info.defaultDuration;
    last = now;
    time.value = scrub.value = String(next);
    await queuePaint();
    if (playing) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
source.value = sampleSource;
function locking(value: boolean) {
  busy = value;
  $<HTMLFieldSetElement>('controls').disabled = value;
  for (const id of ['compile', 'benchmark', 'export-check'])
    $<HTMLButtonElement>(id).disabled = value;
  source.disabled = value;
}
async function job(task: () => Promise<void>) {
  stop();
  locking(true);
  await painted;
  try {
    await task();
  } catch (error) {
    results.textContent = 'Error: ' + message(error);
    codeStatus.textContent = 'Error: ' + message(error);
  } finally {
    locking(false);
  }
}
$('compile').onclick = () =>
  void job(async () => {
    codeStatus.textContent = 'Validating…';
    const { compileBlock } = await import('../src/blocks/sandbox/compile');
    const compiled = compileBlock(source.value);
    if (!compiled.ok) {
      codeStatus.textContent = 'Validation error: ' + compiled.error;
      return;
    }
    sandbox?.dispose();
    sandbox = createSandbox();
    custom = compiled.value;
    let option = blockSelect.querySelector('option[value="custom"]');
    if (!option) {
      option = new Option(custom.info.name, 'custom');
      blockSelect.append(option);
    }
    option.textContent = custom.info.name;
    blockSelect.value = 'custom';
    select(custom.info);
    await painted;
  });
const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  if (a.length !== b.length) throw Error('Pixel lengths differ');
  let max = 0;
  for (let i = 0; i < a.length; i++)
    max = Math.max(max, Math.abs(a[i]! - b[i]!));
  return max;
}
$('export-check').onclick = () =>
  void job(async () => {
    const selectedCustom = blockSelect.value === 'custom' ? custom : undefined,
      p = validateParams(info.params, params),
      s = Number(seed.value),
      size = { width: canvas.width, height: canvas.height };
    const offscreen = new OffscreenCanvas(size.width, size.height),
      off = offscreen.getContext('2d', { willReadFrequently: false })!;
    const worker = createSandbox();
    const rows = [];
    let maxDifference = 0;
    results.textContent = 'Comparing five times…';
    try {
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const t = info.defaultDuration * fraction;
        const request = {
          t,
          size,
          params: p,
          seed: s,
          ...(selectedCustom
            ? { compiled: selectedCustom }
            : { blockId: info.id }),
        };
        const reply = await worker.render(request);
        if (!reply.ok || !reply.pixels)
          throw Error(reply.error ?? 'Worker readback failed');
        let directDiff: number | null = null;
        let previewPixels: Uint8ClampedArray;
        let displayRoundTripDifference: number | null = null;
        let displayDifference: number | null = null;
        if (selectedCustom) {
          const previewWorker = createSandbox();
          try {
            const preview = await previewWorker.render(request);
            if (!preview.ok || !preview.pixels)
              throw Error(preview.error ?? 'Preview failed');
            // Compare independent render buffers BEFORE either is uploaded.
            // A putImageData/getImageData round trip can lose RGB precision at alpha edges.
            previewPixels = preview.pixels;
            ctx.putImageData(
              new ImageData(
                new Uint8ClampedArray(preview.pixels),
                size.width,
                size.height,
              ),
              0,
              0,
            );
            const displayed = ctx.getImageData(
              0,
              0,
              size.width,
              size.height,
            ).data;
            displayRoundTripDifference = difference(displayed, previewPixels);
            off.putImageData(
              new ImageData(
                new Uint8ClampedArray(reply.pixels),
                size.width,
                size.height,
              ),
              0,
              0,
            );
            displayDifference = difference(
              displayed,
              off.getImageData(0, 0, size.width, size.height).data,
            );
          } finally {
            previewWorker.dispose();
          }
        } else {
          const block = getBlock(info.id)!;
          block.render(ctx, t, size, p, s);
          block.render(off, t, size, p, s);
          previewPixels = ctx.getImageData(0, 0, size.width, size.height).data;
          directDiff = difference(
            previewPixels,
            off.getImageData(0, 0, size.width, size.height).data,
          );
        }
        const workerDiff = difference(previewPixels, reply.pixels);
        maxDifference = Math.max(
          maxDifference,
          directDiff ?? 0,
          workerDiff,
          displayDifference ?? 0,
        );
        rows.push({
          t,
          directOffscreenMaxDifference: directDiff,
          workerMaxDifference: workerDiff,
          displayMaxDifference: displayDifference,
          // Diagnostic only: this compares DIFFERENT representation stages, not two renders.
          displayRoundTripMaxDifference: displayRoundTripDifference,
        });
        await nextPaint();
      }
      results.textContent = JSON.stringify(
        {
          check: 'export',
          block: info.id,
          pass: maxDifference === 0,
          maxDifference,
          tolerance: 0,
          size,
          rows,
          note: 'Zero tolerance for raw render equality and matching display uploads. displayRoundTripMaxDifference separately measures lossy Canvas alpha conversion, not render divergence. Same browser/device/fonts only; isolated export-path proxy.',
        },
        null,
        2,
      );
    } finally {
      worker.dispose();
      await queuePaint();
    }
  });
$('benchmark').onclick = () =>
  void job(async () => {
    const selectedCustom = blockSelect.value === 'custom' ? custom : undefined,
      p = validateParams(info.params, params),
      s = Number(seed.value),
      rows = [];
    const worker = createSandbox();
    try {
      for (const size of [
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
      ]) {
        const target = document.createElement('canvas');
        target.width = size.width;
        target.height = size.height;
        const context = target.getContext('2d')!;
        let mainMs: number | null = null,
          total = 0,
          roundTrip = 0;
        if (!selectedCustom) {
          let elapsed = 0;
          for (let i = 0; i < 120; i++) {
            const start = performance.now();
            getBlock(info.id)!.render(
              context,
              (i / 119) * info.defaultDuration,
              size,
              p,
              s,
            );
            elapsed += performance.now() - start;
            if (i % 10 === 0) await nextPaint();
          }
          mainMs = elapsed / 120;
        }
        for (let i = 0; i < 120; i++) {
          results.textContent = `Benchmark ${size.width}×${size.height}: worker frame ${i + 1}/120`;
          const start = performance.now();
          const reply = await worker.render({
            t: (i / 119) * info.defaultDuration,
            size,
            params: p,
            seed: s,
            pixels: false,
            ...(selectedCustom
              ? { compiled: selectedCustom }
              : { blockId: info.id }),
          });
          if (!reply.ok) throw Error(reply.error);
          total += reply.ms!;
          roundTrip += performance.now() - start;
        }
        rows.push({
          ...size,
          frames: 120,
          mainMs,
          workerMs: total / 120,
          workerRoundTripMs: roundTrip / 120,
        });
      }
      results.textContent = JSON.stringify(
        {
          check: 'benchmark',
          block: info.id,
          rows,
          note: 'Arithmetic mean; worker draw includes per-frame compilation, excludes canvas allocation/readback. Round trip includes allocation/transport/startup. No readback in benchmark. Custom mainMs is null for safety.',
          browser: navigator.userAgent,
        },
        null,
        2,
      );
    } finally {
      worker.dispose();
    }
  });
for (const block of blocks) {
  const button = document.createElement('button'),
    tile = document.createElement('canvas');
  tile.width = 240;
  tile.height = 135;
  block.render(tile.getContext('2d')!, block.thumbnailTime ?? 0, tile, {}, 7);
  button.append(tile, document.createTextNode(block.name));
  button.onclick = () => {
    if (busy) return;
    blockSelect.value = block.id;
    blockSelect.dispatchEvent(new Event('change'));
  };
  $('poses').append(button);
}
select(info);

// Isolated library selection; execution continues through the existing sandbox.
import { mountLibrary } from './library';
mountLibrary();
