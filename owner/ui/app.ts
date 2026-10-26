// Phase 1 library manager UI (P1-14): log in with the 2-step code; browse
// the library per category with search; upload single files and zips;
// tags, licence and credit; thumbnails; versions; publish, unpublish,
// rollback; featured, order, hidden; a publish schedule; the gate's
// reasons in plain sentences. English and Hindi. Plain TypeScript with no
// imports: the owner server transpiles this one file and serves it.

type Lang = 'en' | 'hi';
const STRINGS = {
  en: {
    title: 'Library manager',
    email: 'Email',
    password: 'Password',
    code: '6-digit code from your authenticator app',
    logIn: 'Log in',
    logOut: 'Log out',
    library: 'Library',
    upload: 'Upload',
    versions: 'Versions',
    audit: 'Audit log',
    all: 'All categories',
    search: 'Search by name or tag',
    noItems: 'Nothing matches.',
    tags: 'Tags (comma separated)',
    license: 'Licence',
    credit: 'Credit',
    order: 'Order',
    featured: 'Featured',
    hidden: 'Hidden',
    publishAt: 'Publish from',
    unpublishAt: 'Unpublish at',
    version: 'Version',
    save: 'Save',
    publish: 'Publish',
    unpublish: 'Unpublish',
    delete: 'Delete',
    published: 'Published',
    notPublished: 'Not published',
    scheduled: 'Scheduled',
    file: 'A Creator Pack (.json), a picture, a sound, a video, or a .zip of them',
    uploadButton: 'Check and publish',
    checking: 'Checking in the publish gate…',
    live: 'live',
    rollback: 'Roll back to this version',
    rotate: 'Make a new signing key',
    rotateNote: 'Every editor build needs the new public key afterwards.',
    reauthTitle: 'Confirm it is you',
    reauthNote: 'This action needs your password and a fresh code.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    deleteAsk:
      'Delete this item from the library? Projects that used it keep their own copy.',
    saved: 'Saved. Catalog version {v} is live.',
    language: 'हिन्दी',
    broken: 'The audit log was changed at row {n}.',
    intact: 'The audit log is intact.',
  },
  hi: {
    title: 'लाइब्रेरी प्रबंधक',
    email: 'ईमेल',
    password: 'पासवर्ड',
    code: 'ऑथेंटिकेटर ऐप का 6 अंकों का कोड',
    logIn: 'लॉग इन',
    logOut: 'लॉग आउट',
    library: 'लाइब्रेरी',
    upload: 'अपलोड',
    versions: 'संस्करण',
    audit: 'ऑडिट लॉग',
    all: 'सभी श्रेणियाँ',
    search: 'नाम या टैग से खोजें',
    noItems: 'कुछ नहीं मिला।',
    tags: 'टैग (कॉमा से अलग)',
    license: 'लाइसेंस',
    credit: 'श्रेय',
    order: 'क्रम',
    featured: 'विशेष',
    hidden: 'छिपा हुआ',
    publishAt: 'प्रकाशित करें से',
    unpublishAt: 'अप्रकाशित करें पर',
    version: 'संस्करण',
    save: 'सेव करें',
    publish: 'प्रकाशित करें',
    unpublish: 'अप्रकाशित करें',
    delete: 'हटाएँ',
    published: 'प्रकाशित',
    notPublished: 'प्रकाशित नहीं',
    scheduled: 'निर्धारित',
    file: 'Creator Pack (.json), चित्र, ध्वनि, वीडियो, या इनकी .zip',
    uploadButton: 'जाँचें और प्रकाशित करें',
    checking: 'प्रकाशन गेट में जाँच हो रही है…',
    live: 'चालू',
    rollback: 'इस संस्करण पर वापस जाएँ',
    rotate: 'नई साइनिंग कुंजी बनाएँ',
    rotateNote: 'इसके बाद हर एडिटर बिल्ड को नई सार्वजनिक कुंजी चाहिए।',
    reauthTitle: 'पुष्टि करें कि यह आप हैं',
    reauthNote: 'इस काम के लिए पासवर्ड और नया कोड चाहिए।',
    confirm: 'पुष्टि करें',
    cancel: 'रद्द करें',
    deleteAsk:
      'इस आइटम को लाइब्रेरी से हटाएँ? जिन प्रोजेक्ट में यह था, उनमें उसकी अपनी कॉपी रहती है।',
    saved: 'सेव हुआ। कैटलॉग संस्करण {v} चालू है।',
    language: 'English',
    broken: 'ऑडिट लॉग पंक्ति {n} पर बदला गया है।',
    intact: 'ऑडिट लॉग सुरक्षित है।',
  },
} as const;
type Key = keyof (typeof STRINGS)['en'];

interface Item {
  id: string;
  category: string;
  kind: string;
  name: { en: string; hi: string };
  tags: string[];
  license: { name: string; credit?: string };
  current: number;
  versions: { itemVersion: number; createdAt: string; source: string }[];
  published: boolean;
  hidden: boolean;
  featured: boolean;
  order: number;
  publishAt: string | null;
  unpublishAt: string | null;
  thumb: string | null;
}

let lang: Lang = localStorage.getItem('owner.lang') === 'hi' ? 'hi' : 'en';
let csrf = '';
let tab: 'library' | 'upload' | 'versions' | 'audit' = 'library';
const app = document.getElementById('app')!;
const t = (key: Key, values: Record<string, string | number> = {}) =>
  STRINGS[lang][key].replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? ''),
  );

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props))
    if (value !== undefined) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reauth: boolean,
  ) {
    super(message);
  }
}
async function api<T>(
  method: string,
  url: string,
  body?: unknown,
  raw?: Blob,
  rawName?: string,
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      ...(raw
        ? {
            'content-type': 'application/octet-stream',
            'x-file-name': encodeURIComponent(rawName ?? 'file'),
          }
        : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(raw
      ? { body: raw }
      : body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),
  });
  const data = (await response.json()) as T & {
    error?: string;
    reauth?: boolean;
  };
  if (!response.ok)
    throw new ApiError(data.error ?? 'Error', response.status, !!data.reauth);
  return data;
}
/** Runs a dangerous action; asks for the password and code first if needed. */
async function guarded<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof ApiError) || !error.reauth) throw error;
    if (!(await reauth())) return null;
    return run();
  }
}
function reauth(): Promise<boolean> {
  return new Promise((resolve) => {
    const password = el('input', {
      type: 'password',
      id: 'reauth-password',
      autocomplete: 'current-password',
    });
    const code = el('input', {
      inputmode: 'numeric',
      id: 'reauth-code',
      autocomplete: 'one-time-code',
      maxlength: '6',
    });
    const message = el('p', { class: 'error', role: 'alert' });
    const ok = el(
      'button',
      { class: 'primary', type: 'submit', id: 'reauth-confirm' },
      t('confirm'),
    );
    const cancel = el('button', { type: 'button' }, t('cancel'));
    const form = el(
      'form',
      { method: 'dialog' },
      el('h2', {}, t('reauthTitle')),
      el('p', {}, t('reauthNote')),
      el('label', {}, t('password'), password),
      el('label', {}, t('code'), code),
      message,
      el('div', { class: 'bar' }, ok, cancel),
    );
    const dialog = el('dialog', { id: 'reauth' }, form);
    document.body.append(dialog);
    dialog.showModal();
    cancel.onclick = () => {
      dialog.remove();
      resolve(false);
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      try {
        await api('POST', '/api/reauth', {
          password: password.value,
          code: code.value,
        });
        dialog.remove();
        resolve(true);
      } catch (error) {
        message.textContent =
          error instanceof Error ? error.message : String(error);
      }
    };
  });
}

function header() {
  const language = el(
    'button',
    { type: 'button', id: 'language' },
    t('language'),
  );
  language.onclick = () => {
    lang = lang === 'en' ? 'hi' : 'en';
    localStorage.setItem('owner.lang', lang);
    document.documentElement.lang = lang;
    void render();
  };
  const out = el('button', { type: 'button', id: 'logout' }, t('logOut'));
  out.onclick = async () => {
    await api('POST', '/api/logout', {});
    csrf = '';
    void render();
  };
  const tabs = el('div', { class: 'bar tabs', role: 'tablist' });
  for (const name of ['library', 'upload', 'versions', 'audit'] as const) {
    const button = el(
      'button',
      {
        type: 'button',
        role: 'tab',
        'data-tab': name,
        'aria-selected': String(tab === name),
      },
      t(name),
    );
    button.onclick = () => {
      tab = name;
      void render();
    };
    tabs.append(button);
  }
  return el(
    'header',
    {},
    el(
      'div',
      { class: 'bar' },
      el('h1', { class: 'grow' }, t('title')),
      language,
      out,
    ),
    tabs,
  );
}

async function loginScreen() {
  const email = el('input', {
    type: 'email',
    id: 'email',
    autocomplete: 'username',
  });
  const password = el('input', {
    type: 'password',
    id: 'password',
    autocomplete: 'current-password',
  });
  const code = el('input', {
    inputmode: 'numeric',
    id: 'code',
    autocomplete: 'one-time-code',
    maxlength: '6',
  });
  const message = el('p', { class: 'error', role: 'alert', id: 'login-error' });
  const form = el(
    'form',
    { class: 'card', id: 'login' },
    el('h1', {}, t('title')),
    el('label', {}, t('email'), email),
    el('label', {}, t('password'), password),
    el('label', {}, t('code'), code),
    message,
    el('button', { class: 'primary', type: 'submit' }, t('logIn')),
  );
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      const session = await api<{ csrf: string }>('POST', '/api/login', {
        email: email.value,
        password: password.value,
        code: code.value,
      });
      csrf = session.csrf;
      void render();
    } catch (error) {
      message.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };
  app.replaceChildren(form);
}

let filter = { category: '', q: '' };
function stateOf(item: Item) {
  if (!item.published) return t('notPublished');
  if (item.publishAt && Date.parse(item.publishAt) > Date.now())
    return t('scheduled');
  if (item.hidden) return t('hidden');
  return t('published');
}
const localTime = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

async function libraryScreen(status: HTMLElement) {
  const data = await api<{ categories: string[]; items: Item[] }>(
    'GET',
    `/api/items?${new URLSearchParams({ ...(filter.category ? { category: filter.category } : {}), ...(filter.q ? { q: filter.q } : {}) })}`,
  );
  const category = el(
    'select',
    { id: 'category' },
    el('option', { value: '' }, t('all')),
  );
  for (const name of data.categories) {
    const option = el('option', { value: name }, name);
    if (name === filter.category) option.setAttribute('selected', '');
    category.append(option);
  }
  category.onchange = () => {
    filter.category = category.value;
    void render();
  };
  const search = el('input', {
    type: 'search',
    id: 'search',
    placeholder: t('search'),
    value: filter.q,
  });
  search.onchange = () => {
    filter.q = search.value;
    void render();
  };
  const list = el('div', { class: 'items', id: 'items' });
  if (!data.items.length) list.append(el('p', {}, t('noItems')));
  for (const item of data.items) list.append(itemCard(item, status));
  return el(
    'section',
    {},
    el('div', { class: 'bar card' }, category, search),
    list,
  );
}

function itemCard(item: Item, status: HTMLElement) {
  const thumb = item.thumb
    ? el('img', { src: item.thumb, alt: '' })
    : el('div', {});
  const nameEn = el('input', {
    value: item.name.en,
    'data-field': 'name-en',
    'aria-label': 'English name',
  });
  const nameHi = el('input', {
    value: item.name.hi,
    'data-field': 'name-hi',
    'aria-label': 'हिन्दी नाम',
  });
  const tags = el('input', {
    value: item.tags.join(', '),
    'data-field': 'tags',
  });
  const license = el('input', {
    value: item.license.name,
    'data-field': 'license',
  });
  const credit = el('input', {
    value: item.license.credit ?? '',
    'data-field': 'credit',
  });
  const order = el('input', {
    type: 'number',
    value: String(item.order),
    'data-field': 'order',
    step: '1',
  });
  const featured = el('input', { type: 'checkbox', 'data-field': 'featured' });
  featured.checked = item.featured;
  const hidden = el('input', { type: 'checkbox', 'data-field': 'hidden' });
  hidden.checked = item.hidden;
  const publishAt = el('input', {
    type: 'datetime-local',
    value: localTime(item.publishAt),
    'data-field': 'publish-at',
  });
  const unpublishAt = el('input', {
    type: 'datetime-local',
    value: localTime(item.unpublishAt),
    'data-field': 'unpublish-at',
  });
  const version = el('select', { 'data-field': 'version' });
  for (const v of item.versions) {
    const option = el(
      'option',
      { value: String(v.itemVersion) },
      `${v.itemVersion} · ${v.createdAt.slice(0, 10)} · ${v.source}`,
    );
    if (v.itemVersion === item.current) option.setAttribute('selected', '');
    version.append(option);
  }
  const done = (catalogVersion: number) => {
    status.className = 'ok';
    status.textContent = t('saved', { v: catalogVersion });
    void render(true);
  };
  const fail = (error: unknown) => {
    status.className = 'error';
    status.textContent = error instanceof Error ? error.message : String(error);
  };
  const save = el(
    'button',
    { type: 'button', class: 'primary', 'data-action': 'save' },
    t('save'),
  );
  save.onclick = () =>
    api<{ catalogVersion: number }>('POST', `/api/items/${item.id}`, {
      name: { en: nameEn.value, hi: nameHi.value },
      tags: tags.value.split(','),
      license: { name: license.value, credit: credit.value },
      order: Number(order.value),
      featured: featured.checked,
      hidden: hidden.checked,
      publishAt: publishAt.value
        ? new Date(publishAt.value).toISOString()
        : null,
      unpublishAt: unpublishAt.value
        ? new Date(unpublishAt.value).toISOString()
        : null,
      current: Number(version.value),
    }).then((r) => done(r.catalogVersion), fail);
  const toggle = el(
    'button',
    {
      type: 'button',
      'data-action': item.published ? 'unpublish' : 'publish',
      ...(item.published ? { class: 'danger' } : {}),
    },
    item.published ? t('unpublish') : t('publish'),
  );
  toggle.onclick = () =>
    guarded(() =>
      api<{ catalogVersion: number }>(
        'POST',
        `/api/items/${item.id}/${item.published ? 'unpublish' : 'publish'}`,
        {},
      ),
    ).then((r) => r && done(r.catalogVersion), fail);
  const remove = el(
    'button',
    { type: 'button', class: 'danger', 'data-action': 'delete' },
    t('delete'),
  );
  remove.onclick = () => {
    if (!confirm(t('deleteAsk'))) return;
    guarded(() =>
      api<{ catalogVersion: number }>(
        'POST',
        `/api/items/${item.id}/delete`,
        {},
      ),
    ).then((r) => r && done(r.catalogVersion), fail);
  };
  return el(
    'article',
    { class: 'item', 'data-id': item.id },
    thumb,
    el(
      'div',
      { class: 'fields' },
      el('strong', {}, lang === 'hi' ? item.name.hi : item.name.en),
      el(
        'span',
        { class: 'state', 'data-state': '' },
        `${item.kind} · ${item.category} · ${stateOf(item)}`,
      ),
      el('div', { class: 'row' }, nameEn, nameHi),
      el('label', {}, t('tags'), tags),
      el(
        'div',
        { class: 'row' },
        el('label', {}, t('license'), license),
        el('label', {}, t('credit'), credit),
      ),
      el(
        'div',
        { class: 'row' },
        el('label', {}, featured, t('featured')),
        el('label', {}, hidden, t('hidden')),
        el('label', {}, t('order'), order),
      ),
      el(
        'div',
        { class: 'row' },
        el('label', {}, t('publishAt'), publishAt),
        el('label', {}, t('unpublishAt'), unpublishAt),
      ),
      el('label', {}, t('version'), version),
      el('div', { class: 'row' }, save, toggle, remove),
    ),
  );
}

function uploadScreen() {
  const file = el('input', { type: 'file', id: 'upload-file' });
  const license = el('input', { id: 'upload-license' });
  const credit = el('input', { id: 'upload-credit' });
  const result = el('ul', {
    class: 'lines',
    id: 'upload-result',
    'aria-live': 'polite',
  });
  const send = el(
    'button',
    { type: 'button', class: 'primary', id: 'upload-send' },
    t('uploadButton'),
  );
  send.onclick = async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    result.replaceChildren(el('li', {}, t('checking')));
    send.disabled = true;
    try {
      const params = new URLSearchParams({
        ...(license.value ? { license: license.value } : {}),
        ...(credit.value ? { credit: credit.value } : {}),
      });
      const data = await api<{ lines: string[]; rejected: unknown[] }>(
        'POST',
        `/api/upload?${params}`,
        undefined,
        chosen,
        chosen.name,
      );
      result.replaceChildren(
        ...data.lines.map((line) =>
          el(
            'li',
            { class: line.startsWith('Rejected') ? 'error' : 'ok' },
            line,
          ),
        ),
      );
    } catch (error) {
      result.replaceChildren(
        el(
          'li',
          { class: 'error' },
          error instanceof Error ? error.message : String(error),
        ),
      );
    } finally {
      send.disabled = false;
    }
  };
  return el(
    'section',
    { class: 'card' },
    el('label', {}, t('file'), file),
    el(
      'div',
      { class: 'row bar' },
      el('label', {}, t('license'), license),
      el('label', {}, t('credit'), credit),
    ),
    send,
    result,
  );
}

async function versionsScreen(status: HTMLElement) {
  const data = await api<{
    versions: {
      version: number;
      live: boolean;
      generatedAt: string;
      rolledBackTo: number | null;
      counts: Record<string, number>;
    }[];
  }>('GET', '/api/versions');
  const rows = data.versions
    .slice()
    .reverse()
    .map((v) => {
      const back = el(
        'button',
        { type: 'button', class: 'danger', 'data-rollback': String(v.version) },
        t('rollback'),
      );
      back.disabled = v.live;
      back.onclick = () =>
        guarded(() =>
          api<{ catalogVersion: number }>('POST', '/api/rollback', {
            to: v.version,
          }),
        ).then(
          (r) => {
            if (!r) return;
            status.className = 'ok';
            status.textContent = t('saved', { v: r.catalogVersion });
            void render(true);
          },
          (error: unknown) => {
            status.className = 'error';
            status.textContent =
              error instanceof Error ? error.message : String(error);
          },
        );
      return el(
        'tr',
        { 'data-version': String(v.version) },
        el('td', {}, `${v.version}${v.live ? ` (${t('live')})` : ''}`),
        el('td', {}, v.generatedAt),
        el(
          'td',
          {},
          Object.entries(v.counts)
            .map(([k, n]) => `${k} ${n}`)
            .join(', '),
        ),
        el('td', {}, back),
      );
    });
  const rotate = el(
    'button',
    { type: 'button', class: 'danger', id: 'rotate-key' },
    t('rotate'),
  );
  rotate.onclick = () =>
    guarded(() =>
      api<{ keyId: string; publicKey: string }>('POST', '/api/rotate-key', {}),
    ).then(
      (r) => {
        if (!r) return;
        status.className = 'ok';
        status.textContent = `${r.keyId}: ${r.publicKey}`;
      },
      (error: unknown) => {
        status.className = 'error';
        status.textContent =
          error instanceof Error ? error.message : String(error);
      },
    );
  return el(
    'section',
    { class: 'card' },
    el('table', {}, el('tbody', {}, ...rows)),
    el('p', {}, t('rotateNote')),
    rotate,
  );
}

async function auditScreen() {
  const data = await api<{
    rows: {
      seq: number;
      time: string;
      actor: string;
      action: string;
      target?: string;
      ok: boolean;
      detail?: string;
    }[];
    broken: number | null;
  }>('GET', '/api/audit');
  return el(
    'section',
    { class: 'card' },
    el(
      'p',
      { class: data.broken ? 'error' : 'ok', id: 'audit-state' },
      data.broken ? t('broken', { n: data.broken }) : t('intact'),
    ),
    el(
      'table',
      { id: 'audit' },
      el(
        'tbody',
        {},
        ...data.rows
          .slice()
          .reverse()
          .map((row) =>
            el(
              'tr',
              { 'data-action': row.action },
              el('td', {}, String(row.seq)),
              el('td', {}, row.time),
              el('td', {}, row.actor),
              el('td', {}, row.action),
              el('td', {}, row.target ?? ''),
              el('td', {}, row.ok ? '✓' : '✗'),
              el('td', {}, row.detail ?? ''),
            ),
          ),
      ),
    ),
  );
}

let lastStatus: HTMLElement | null = null;
async function render(keepStatus = false) {
  document.documentElement.lang = lang;
  document.title = t('title');
  if (!csrf) {
    try {
      csrf = (await api<{ csrf: string }>('GET', '/api/session')).csrf;
    } catch {
      return loginScreen();
    }
  }
  const status =
    keepStatus && lastStatus
      ? lastStatus
      : el('p', { id: 'status', role: 'status' });
  lastStatus = status;
  let body: HTMLElement;
  try {
    body =
      tab === 'library'
        ? await libraryScreen(status)
        : tab === 'upload'
          ? uploadScreen()
          : tab === 'versions'
            ? await versionsScreen(status)
            : await auditScreen();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      csrf = '';
      return loginScreen();
    }
    body = el(
      'p',
      { class: 'error' },
      error instanceof Error ? error.message : String(error),
    );
  }
  app.replaceChildren(header(), status, body);
}
void render();
export {};
