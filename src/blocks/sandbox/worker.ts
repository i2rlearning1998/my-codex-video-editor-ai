import { installRuntime } from './runtime';
import type { FrameRequest } from './runtime';
const Canvas = OffscreenCanvas,
  clock = performance.now.bind(performance),
  send = globalThis.postMessage.bind(globalThis),
  listen = globalThis.addEventListener.bind(globalThis);
installRuntime({
  send: (value, transfer = []) => send(value, { transfer }),
  listen: (callback) =>
    listen('message', (event: MessageEvent<FrameRequest>) =>
      callback(event.data),
    ),
  createCanvas: (size) => new Canvas(size.width, size.height),
  clock,
  read: (canvas) =>
    canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
      .data,
});
