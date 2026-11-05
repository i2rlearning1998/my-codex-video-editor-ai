#!/usr/bin/env node
// Phase 1 library (P1-11, P1-28): the built editor never contains the owner
// app (its routes, cookie or screens) and no bundled library payloads.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
if (!existsSync(dist)) {
  console.error('dist/ is missing: run vite build first.');
  process.exit(1);
}
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
};
walk(dist);
export const OWNER_MARKERS = [
  '/api/rotate-key',
  'aive_owner',
  '/api/reauth',
  'Library manager',
  'owner/gate/harness',
];
export const PAYLOAD_MARKERS = [
  '"shape-star-5"',
  'Starter Pack 1',
  '"dark-neon"',
  'Corporate Blue',
  'Cinematic Teal',
  'shape-flowchart-decision',
];
// P2-R2 (P2B-38): server code never reaches any browser bundle: no
// server-only secret names and no hosts of the gateway's providers. (The
// editor's own voice and stock tools, which use the person's own keys from
// Settings (D-276), keep their hosts; they are not the gateway.)
export const SERVER_MARKERS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'service_role',
  'SUPABASE_JWT_SECRET',
  'LOCAL_AUTH_SECRET',
  'api.anthropic.com',
  'api.openai.com',
  'api.x.ai',
  'generateContent',
  'is not connected: its key was refused',
];
const problems = [];
for (const file of files) {
  const relative = path.relative(dist, file);
  if (relative.startsWith('library/'))
    problems.push(`${relative}: bundled library file`);
  if (!/\.(js|html|json|css)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const marker of SERVER_MARKERS)
    if (text.includes(marker))
      problems.push(`${relative}: contains server-only code (${marker})`);
  for (const marker of OWNER_MARKERS)
    if (text.includes(marker))
      problems.push(`${relative}: contains the owner app (${marker})`);
  if (/\.(js|json)$/.test(file))
    for (const marker of PAYLOAD_MARKERS)
      if (text.includes(marker))
        problems.push(
          `${relative}: contains bundled library content (${marker})`,
        );
}
// P2-R1 (P2-21): three pages. What the editor page loads never contains the
// panel, the website or the gateway; the panel and website never load the
// editor's entry, its shell or its main module.
export const PANEL_MARKERS = [
  'aive.panel.',
  'aive.credits.',
  'anthropic-version',
  'Start with Director',
  'Brief Room',
  'Test payment (no money moves)',
];
export const EDITOR_MARKERS = [
  'Example project · All artwork is part of the canonical scene.',
  'Local persistence paused to protect existing data.',
];
// P3U: the admin page is a fourth page. No other page may carry its code, and
// it carries neither the editor nor the user panel's screens.
export const ADMIN_MARKERS = [
  'aive.admin.session',
  'Emergency switches',
  'Audit log',
];
const manifestPath = path.join(dist, '.vite', 'manifest.json');
let pages = '';
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const reach = (key, seen = new Set()) => {
    if (!manifest[key] || seen.has(key)) return seen;
    seen.add(key);
    for (const next of [
      ...(manifest[key].imports ?? []),
      ...(manifest[key].dynamicImports ?? []),
    ])
      reach(next, seen);
    return seen;
  };
  const filesOf = (keys) => [...keys].map((key) => manifest[key].file);
  const editor = reach('index.html');
  for (const file of filesOf(editor)) {
    const text = readFileSync(path.join(dist, file), 'utf8');
    for (const marker of PANEL_MARKERS)
      if (text.includes(marker))
        problems.push(
          `${file}: the editor page loads panel or gateway code (${marker})`,
        );
    for (const marker of ADMIN_MARKERS)
      if (text.includes(marker))
        problems.push(`${file}: the editor page loads admin code (${marker})`);
  }
  for (const page of [
    'panel/index.html',
    'site/index.html',
    'admin/index.html',
  ]) {
    const keys = reach(page);
    if (!manifest[page]) {
      problems.push(`${page}: missing from the build`);
      continue;
    }
    for (const key of ['index.html', 'src/main.ts', 'src/boot.ts'])
      if (keys.has(key)) problems.push(`${page}: loads the editor (${key})`);
    for (const file of filesOf(keys)) {
      const text = readFileSync(path.join(dist, file), 'utf8');
      for (const marker of EDITOR_MARKERS)
        if (text.includes(marker))
          problems.push(`${file}: ${page} loads editor code (${marker})`);
      if (page === 'admin/index.html') {
        for (const marker of PANEL_MARKERS)
          if (text.includes(marker))
            problems.push(`${file}: admin loads panel code (${marker})`);
      } else {
        for (const marker of ADMIN_MARKERS)
          if (text.includes(marker))
            problems.push(`${file}: ${page} loads admin code (${marker})`);
      }
    }
  }
  pages = ` Editor page ${editor.size} chunks without panel, website or gateway code; panel and website without the editor.`;
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(
  `Editor bundle: ${files.length} files, no owner app, no server code, no bundled library payloads.${pages}`,
);
