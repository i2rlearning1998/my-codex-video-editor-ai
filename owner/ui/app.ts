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
    controls: 'Editor controls',
    controlsHelp:
      'Choose a kind of selection, then switch buttons, tabs and menu entries on or off. Saved changes reach the editor with the next catalog version, no release.',
    saveControls: 'Save controls',
    controlsOn: 'On',
    controlsOff: 'Off',
    upload: 'Upload',
    versions: 'Versions',
    audit: 'Audit log',
    all: 'All',
    allKinds: 'All types',
    addCategory: 'New category',
    addSub: 'New sub-category',
    addSection: 'New section',
    nameEn: 'Name in English',
    nameHi: 'हिन्दी नाम',
    rename: 'Rename',
    hide: 'Hide in editor',
    show: 'Show in editor',
    up: 'Move up',
    down: 'Move down',
    removeNode: 'Delete',
    removeNodeAsk:
      'Delete this from the library tree? Items inside must be moved first.',
    whereListed: 'Listed under',
    noneSub: '(no sub-category)',
    noneSection: '(no section)',
    uploadInto: 'Upload into',
    builtIn: 'in the editor',
    hiddenNode: 'hidden',
    treeTitle: 'Library',
    emptyNode: 'Nothing here yet. Upload assets into this place.',
    uploadHere: 'Upload here',
    edit: 'Edit details',
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
    controls: 'एडिटर कंट्रोल',
    controlsHelp:
      'चुने हुए एलिमेंट का प्रकार चुनें, फिर बटन, टैब और मेन्यू एंट्री चालू या बंद करें। सेव करते ही नया कैटलॉग संस्करण बनता है, रिलीज़ की ज़रूरत नहीं।',
    saveControls: 'कंट्रोल सेव करें',
    controlsOn: 'चालू',
    controlsOff: 'बंद',
    upload: 'अपलोड',
    versions: 'संस्करण',
    audit: 'ऑडिट लॉग',
    all: 'सभी',
    allKinds: 'सभी प्रकार',
    addCategory: 'नई श्रेणी',
    addSub: 'नई उप-श्रेणी',
    addSection: 'नया सेक्शन',
    nameEn: 'English name',
    nameHi: 'हिन्दी नाम',
    rename: 'नाम बदलें',
    hide: 'एडिटर में छिपाएँ',
    show: 'एडिटर में दिखाएँ',
    up: 'ऊपर',
    down: 'नीचे',
    removeNode: 'हटाएँ',
    removeNodeAsk:
      'इसे लाइब्रेरी ट्री से हटाएँ? अंदर के आइटम पहले दूसरी जगह ले जाएँ।',
    whereListed: 'यहाँ दिखता है',
    noneSub: '(कोई उप-श्रेणी नहीं)',
    noneSection: '(कोई सेक्शन नहीं)',
    uploadInto: 'यहाँ अपलोड करें',
    builtIn: 'एडिटर में है',
    hiddenNode: 'छिपा',
    treeTitle: 'लाइब्रेरी',
    emptyNode: 'यहाँ अभी कुछ नहीं। इस जगह में अपलोड करें।',
    uploadHere: 'यहाँ अपलोड करें',
    edit: 'विवरण बदलें',
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
  place: { category: string; sub: string | null; section: string | null };
  placed: boolean;
}
interface TaxSection {
  id: string;
  name: { en: string; hi: string };
  hidden: boolean;
  builtin: boolean;
  count: number;
}
interface TaxSub extends Omit<TaxSection, 'count'> {
  count: number;
  sections: TaxSection[];
}
interface TaxCategory {
  id: string;
  name: { en: string; hi: string };
  hidden: boolean;
  builtin: boolean;
  count: number;
  subs: TaxSub[];
}

let lang: Lang = localStorage.getItem('owner.lang') === 'hi' ? 'hi' : 'en';
let csrf = '';
let tab: 'library' | 'controls' | 'upload' | 'versions' | 'audit' = 'library';
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
  for (const name of [
    'library',
    'controls',
    'upload',
    'versions',
    'audit',
  ] as const) {
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

let filter = { category: '', sub: '', section: '', q: '' };
const expanded = new Set<string>(['Elements']);
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

/** A small dialog asking for a name in both languages. */
function nameDialog(
  title: string,
  initial?: { en: string; hi: string },
): Promise<{ en: string; hi: string } | null> {
  return new Promise((resolve) => {
    const en = el('input', {
      id: 'name-en',
      value: initial?.en ?? '',
      maxlength: '40',
    });
    const hi = el('input', {
      id: 'name-hi',
      value: initial?.hi ?? '',
      maxlength: '40',
    });
    const ok = el(
      'button',
      { class: 'primary', type: 'submit', id: 'name-ok' },
      t('confirm'),
    );
    const cancel = el('button', { type: 'button' }, t('cancel'));
    const form = el(
      'form',
      { method: 'dialog' },
      el('h2', {}, title),
      el('label', {}, t('nameEn'), en),
      el('label', {}, t('nameHi'), hi),
      el('div', { class: 'bar' }, ok, cancel),
    );
    const dialog = el('dialog', { id: 'name-dialog' }, form);
    document.body.append(dialog);
    dialog.showModal();
    en.focus();
    cancel.onclick = () => {
      dialog.remove();
      resolve(null);
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      dialog.remove();
      resolve({ en: en.value.trim(), hi: hi.value.trim() });
    };
  });
}

/** One node of the tree: its row and, when open, its children. */
function treeNode(
  tree: TaxCategory[],
  status: HTMLElement,
  level: 0 | 1 | 2,
  cat: TaxCategory,
  sub?: TaxSub,
  section?: TaxSection,
): HTMLElement {
  const node = section ?? sub ?? cat;
  const key = [cat.id, sub?.id, section?.id].filter(Boolean).join('/');
  const selected =
    filter.category === cat.id &&
    (filter.sub || '') === (sub?.id ?? '') &&
    (filter.section || '') === (section?.id ?? '');
  const children =
    level === 0 ? cat.subs : level === 1 ? (sub?.sections ?? []) : [];
  const open = expanded.has(key);
  const row = el('div', {
    class: `tree-row level-${level}${selected ? ' selected' : ''}${node.hidden ? ' off' : ''}`,
    'data-node': key,
  });
  const caret = el(
    'button',
    {
      type: 'button',
      class: 'tree-caret',
      'aria-label': open ? 'Collapse' : 'Expand',
      ...(children.length ? {} : { disabled: '' }),
    },
    children.length ? (open ? '▾' : '▸') : '',
  );
  caret.onclick = () => {
    if (open) expanded.delete(key);
    else expanded.add(key);
    void render(true);
  };
  const label = el(
    'button',
    { type: 'button', class: 'tree-label' },
    lang === 'hi' ? node.name.hi : node.name.en,
    el('span', { class: 'tree-count' }, String(node.count)),
    ...(node.hidden
      ? [el('span', { class: 'tree-flag' }, t('hiddenNode'))]
      : []),
  );
  label.onclick = () => {
    filter = {
      ...filter,
      category: cat.id,
      sub: sub?.id ?? '',
      section: section?.id ?? '',
    };
    if (children.length) expanded.add(key);
    void render(true);
  };
  const path = {
    category: cat.id,
    ...(sub ? { sub: sub.id } : {}),
    ...(section ? { section: section.id } : {}),
  };
  const act = (
    action: string,
    text: string,
    title: string,
    run: () => Promise<unknown>,
  ) => {
    const button = el(
      'button',
      {
        type: 'button',
        class: 'tree-act',
        'data-act': action,
        title,
        'aria-label': title,
      },
      text,
    );
    button.onclick = (event) => {
      event.stopPropagation();
      run().then(
        () => {
          status.className = 'ok';
          status.textContent = '';
          void render(true);
        },
        (error: unknown) => {
          status.className = 'error';
          status.textContent =
            error instanceof Error ? error.message : String(error);
        },
      );
    };
    return button;
  };
  const post = (body: unknown) =>
    api<{ catalogVersion: number; id?: string }>('POST', '/api/taxonomy', body);
  const actions = el('span', { class: 'tree-acts' });
  if (level < 2)
    actions.append(
      act('add', '+', level === 0 ? t('addSub') : t('addSection'), async () => {
        const name = await nameDialog(
          level === 0 ? t('addSub') : t('addSection'),
        );
        if (!name) return;
        const made = await post({
          op: level === 0 ? 'addSub' : 'addSection',
          ...path,
          name,
        });
        expanded.add(key);
        filter = {
          ...filter,
          category: cat.id,
          sub: level === 0 ? (made.id ?? '') : (sub?.id ?? ''),
          section: level === 1 ? (made.id ?? '') : '',
        };
      }),
    );
  actions.append(
    act('rename', '✎', t('rename'), async () => {
      const name = await nameDialog(t('rename'), node.name);
      if (name) await post({ op: 'patch', ...path, patch: { name } });
    }),
    act(
      'hide',
      node.hidden ? '◌' : '●',
      node.hidden ? t('show') : t('hide'),
      () => post({ op: 'patch', ...path, patch: { hidden: !node.hidden } }),
    ),
    act('up', '↑', t('up'), () => post({ op: 'move', ...path, direction: -1 })),
    act('down', '↓', t('down'), () =>
      post({ op: 'move', ...path, direction: 1 }),
    ),
  );
  if (!node.builtin)
    actions.append(
      act('remove', '🗑', t('removeNode'), async () => {
        if (!confirm(t('removeNodeAsk'))) return;
        await post({ op: 'remove', ...path });
        filter = { ...filter, category: cat.id, sub: '', section: '' };
      }),
    );
  row.append(caret, label, actions);
  const wrap = el('div', { class: 'tree-node' }, row);
  if (open)
    for (const child of children)
      wrap.append(
        level === 0
          ? treeNode(tree, status, 1, cat, child as TaxSub)
          : treeNode(tree, status, 2, cat, sub, child as TaxSection),
      );
  return wrap;
}
async function libraryScreen(status: HTMLElement) {
  const taxonomy = await api<{ tree: TaxCategory[] }>('GET', '/api/taxonomy');
  knownTree = taxonomy.tree;
  const data = await api<{ items: Item[] }>(
    'GET',
    `/api/items?${new URLSearchParams({
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.sub ? { sub: filter.sub } : {}),
      ...(filter.section ? { section: filter.section } : {}),
      ...(filter.q ? { q: filter.q } : {}),
    })}`,
  );
  const add = el(
    'button',
    { type: 'button', id: 'add-category' },
    `+ ${t('addCategory')}`,
  );
  add.onclick = async () => {
    const name = await nameDialog(t('addCategory'));
    if (!name) return;
    try {
      const made = await api<{ id?: string }>('POST', '/api/taxonomy', {
        op: 'addCategory',
        name,
      });
      filter = { ...filter, category: made.id ?? '', sub: '', section: '' };
      void render(true);
    } catch (error) {
      status.className = 'error';
      status.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };
  const tree = el(
    'nav',
    { class: 'tree card compact', id: 'tree', 'aria-label': t('treeTitle') },
    el(
      'div',
      { class: 'bar' },
      el('strong', { class: 'grow' }, t('treeTitle')),
      add,
    ),
  );
  for (const cat of taxonomy.tree)
    tree.append(treeNode(taxonomy.tree, status, 0, cat));
  const search = el('input', {
    type: 'search',
    id: 'search',
    placeholder: t('search'),
    value: filter.q,
  });
  search.onchange = () => {
    filter.q = search.value;
    void render(true);
  };
  const crumbs = [filter.category, filter.sub, filter.section]
    .filter(Boolean)
    .join(' › ');
  const list = el('div', { class: 'items', id: 'items' });
  if (!data.items.length)
    list.append(el('p', {}, filter.category ? t('emptyNode') : t('noItems')));
  for (const item of data.items)
    list.append(itemCard(item, status, taxonomy.tree));
  const uploadHere = el(
    'button',
    { type: 'button', id: 'upload-here' },
    t('uploadHere'),
  );
  uploadHere.onclick = () => {
    tab = 'upload';
    void render();
  };
  return el(
    'section',
    { class: 'lib-layout' },
    tree,
    el(
      'div',
      { class: 'lib-main' },
      el(
        'div',
        { class: 'bar card compact' },
        el('strong', { class: 'grow', id: 'crumbs' }, crumbs || t('all')),
        search,
        ...(filter.category ? [uploadHere] : []),
      ),
      list,
    ),
  );
}

/** Three linked selects: category, sub-category, section. */
let knownTree: TaxCategory[] = [];
function placePicker(
  initialTree: TaxCategory[],
  initial: { category: string; sub: string | null; section: string | null },
  prefix: string,
) {
  let tree = initialTree;
  const cat = el('select', { 'data-field': `${prefix}-category` });
  const sub = el('select', { 'data-field': `${prefix}-sub` });
  const section = el('select', { 'data-field': `${prefix}-section` });
  const label = (node: { name: { en: string; hi: string } }) =>
    lang === 'hi' ? node.name.hi : node.name.en;
  const fillSubs = (selected: string | null) => {
    sub.replaceChildren(el('option', { value: '' }, t('noneSub')));
    for (const x of tree.find((c) => c.id === cat.value)?.subs ?? [])
      sub.append(el('option', { value: x.id }, label(x)));
    sub.value = selected ?? '';
  };
  const fillSections = (selected: string | null) => {
    section.replaceChildren(el('option', { value: '' }, t('noneSection')));
    const subs = tree.find((c) => c.id === cat.value)?.subs ?? [];
    for (const x of subs.find((y) => y.id === sub.value)?.sections ?? [])
      section.append(el('option', { value: x.id }, label(x)));
    section.value = selected ?? '';
  };
  const fill = (from: {
    category: string;
    sub: string | null;
    section: string | null;
  }) => {
    cat.replaceChildren(
      ...tree.map((c) => el('option', { value: c.id }, label(c))),
    );
    cat.value = from.category;
    fillSubs(from.sub);
    fillSections(from.section);
  };
  fill(initial);
  cat.onchange = () => {
    fillSubs(null);
    fillSections(null);
  };
  sub.onchange = () => fillSections(null);
  return {
    node: el('div', { class: 'row place-picker' }, cat, sub, section),
    get: () => ({
      category: cat.value,
      sub: sub.value || null,
      section: section.value || null,
    }),
    /** The tree arrived (or changed) after the picker was made. */
    setTree(next: TaxCategory[]) {
      tree = next;
      fill({
        category: cat.value || initial.category,
        sub: sub.value || initial.sub,
        section: section.value || initial.section,
      });
    },
  };
}

function itemCard(item: Item, status: HTMLElement, tree: TaxCategory[]) {
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
  const where = placePicker(tree, item.place, 'place');
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
      place: where.get(),
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
        `${item.kind} · ${[item.place.category, item.place.sub, item.place.section].filter(Boolean).join(' › ')} · ${stateOf(item)}`,
      ),
      el(
        'details',
        { class: 'edit' },
        el('summary', {}, t('edit')),
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
        el('label', {}, t('whereListed'), where.node),
        el('label', {}, t('version'), version),
        el('div', { class: 'row' }, save, remove),
      ),
      el('div', { class: 'row' }, toggle),
    ),
  );
}

function uploadScreen() {
  const into = placePicker(
    knownTree,
    {
      category: filter.category || 'Elements',
      sub: filter.sub || null,
      section: filter.section || null,
    },
    'upload',
  );
  void api<{ tree: TaxCategory[] }>('GET', '/api/taxonomy').then((data) => {
    knownTree = data.tree;
    into.setTree(data.tree);
  });
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
        category: into.get().category,
        ...(into.get().sub ? { sub: into.get().sub! } : {}),
        ...(into.get().section ? { section: into.get().section! } : {}),
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
    el('label', {}, t('uploadInto'), into.node),
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

let controlsType = 'text';
async function controlsScreen(status: HTMLElement) {
  const data = await api<{
    surfaces: Record<string, { en: string; hi: string }>;
    types: { id: string; name: { en: string; hi: string } }[];
    registry: {
      surface: string;
      id: string;
      label: { en: string; hi: string };
      types: string[];
    }[];
    off: string[];
  }>('GET', '/api/controls');
  const off = new Set(data.off);
  const chips = el('div', { class: 'bar chips', role: 'tablist' });
  for (const type of data.types) {
    const chip = el(
      'button',
      {
        type: 'button',
        role: 'tab',
        'data-type': type.id,
        'aria-selected': String(controlsType === type.id),
      },
      type.name[lang],
    );
    chip.onclick = () => {
      controlsType = type.id;
      void render(true);
    };
    chips.append(chip);
  }
  const groups = ['panel', 'toolbar', 'menu'].map((surface) => {
    const rows = data.registry
      .filter((d) => d.surface === surface && d.types.includes(controlsType))
      .map((d) => {
        const key = `${surface}.${controlsType}.${d.id}`;
        const box = el('input', {
          type: 'checkbox',
          'data-control': key,
        }) as HTMLInputElement;
        box.checked = !off.has(key);
        box.onchange = () => {
          if (box.checked) off.delete(key);
          else off.add(key);
        };
        return el(
          'label',
          { class: 'control-row' },
          box,
          el('span', {}, d.label[lang]),
        );
      });
    return el(
      'section',
      { class: 'card control-group', 'data-surface': surface },
      el('h3', {}, data.surfaces[surface]![lang]),
      ...(rows.length ? rows : [el('p', {}, '–')]),
    );
  });
  const save = el(
    'button',
    { type: 'button', class: 'primary', id: 'save-controls' },
    t('saveControls'),
  );
  save.onclick = () =>
    guarded(() =>
      api<{ catalogVersion: number }>('POST', '/api/controls', {
        off: [...off],
      }),
    ).then(
      (r) => {
        if (!r) return;
        status.className = 'ok';
        status.textContent = t('saved', { v: r.catalogVersion });
      },
      (error: unknown) => {
        status.className = 'error';
        status.textContent =
          error instanceof Error ? error.message : String(error);
      },
    );
  return el(
    'section',
    { id: 'controls' },
    el('p', {}, t('controlsHelp')),
    chips,
    ...groups,
    save,
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
        : tab === 'controls'
          ? await controlsScreen(status)
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
