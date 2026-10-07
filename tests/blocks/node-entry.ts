import { parentPort } from 'node:worker_threads';
import { installRuntime } from '../../src/blocks/sandbox/runtime';
import { recording } from './recording';
const port = parentPort!;
const clock = performance.now.bind(performance);
const encoder = new TextEncoder();
let current = recording();
installRuntime({
  send: (value) => port.postMessage(value),
  listen: (cb) => port.on('message', cb),
  clock,
  createCanvas: (size) => {
    current = recording();
    return { ...size, getContext: () => current.ctx };
  },
  read: () =>
    new Uint8ClampedArray(encoder.encode(JSON.stringify(current.log))),
});
