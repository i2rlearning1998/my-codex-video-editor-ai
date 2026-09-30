// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { insideOpenMenu } from '../src/commands/shortcuts';

test('[KEY-002] keys aimed at a closed menu still reach the shortcuts; an open menu keeps its keys', () => {
  document.body.innerHTML =
    '<div role="menu" id="open"><button id="a">A</button></div><div role="menu" id="closed" hidden><button id="b">B</button></div>';
  const open = document.querySelector('#a')!;
  const closed = document.querySelector('#b')!;
  expect(insideOpenMenu(open)).toBe(true);
  expect(insideOpenMenu(closed)).toBe(false);
  // A menu the browser reports as not rendered (closed popover) counts as closed.
  Object.defineProperty(document.querySelector('#open')!, 'checkVisibility', {
    value: () => false,
  });
  expect(insideOpenMenu(open)).toBe(false);
  expect(insideOpenMenu(document.body)).toBe(false);
});
