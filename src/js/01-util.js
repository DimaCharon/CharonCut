/* ============================================================
   CharonCut — браузерный видеоредактор
   01 · Утилиты
   ============================================================ */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, p = 4) => Math.round(v * Math.pow(10, p)) / Math.pow(10, p);

function fmtTime(t, fps = 30) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t % 1) * fps);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

function fmtDur(t) {
  if (!isFinite(t)) return '—';
  const m = Math.floor(t / 60);
  const s = Math.round(t % 60);
  return m > 0 ? `${m} мин ${s} с` : `${s} с`;
}

function fmtBytes(b) {
  if (b < 1024) return b + ' Б';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' КБ';
  return (b / 1048576).toFixed(1) + ' МБ';
}

/* Маленький DOM-билдер: h('div', {class:'x', onclick:fn}, 'текст', childNode) */
function h(tag, props, ...kids) {
  const node = document.createElement(tag);
  if (props) {
    for (const key in props) {
      const val = props[key];
      if (val == null || val === false) continue;
      if (key === 'class') node.className = val;
      else if (key === 'style' && typeof val === 'object') Object.assign(node.style, val);
      else if (key === 'html') node.innerHTML = val;
      else if (key === 'dataset') Object.assign(node.dataset, val);
      else if (key.startsWith('on') && typeof val === 'function') node.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key in node && key !== 'list' && typeof val !== 'object') { try { node[key] = val; } catch (e) { node.setAttribute(key, val); } }
      else node.setAttribute(key, val);
    }
  }
  for (const kid of kids.flat(4)) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/* Иконки (inline SVG, без внешних файлов) */
const ICON_PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  scissors: 'M6 3l9 9M6 21l9-9M6 3v3M6 21v-3M18 12a3 3 0 100 6 3 3 0 000-6zM9 6a3 3 0 11-6 0 3 3 0 016 0z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M9 9h11v11H9zM4 15V4h11',
  undo: 'M9 7L4 12l5 5M4 12h10a6 6 0 010 12h-2',
  redo: 'M15 7l5 5-5 5M20 12H10a6 6 0 000 12h2',
  download: 'M12 3v12M7 11l5 5 5-5M4 21h16',
  upload: 'M12 21V9M7 13l5-5 5 5M4 3h16',
  plus: 'M12 5v14M5 12h14',
  volume: 'M4 10v4h3l4 4V6L7 10H4zM16 8a6 6 0 010 8M19 5a10 10 0 010 14',
  mute: 'M4 10v4h3l4 4V6L7 10H4zM17 9l4 6M21 9l-4 6',
  zoomin: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l4 4M8 11h6M11 8v6',
  zoomout: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l4 4M8 11h6',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  video: 'M3 6h12v12H3zM15 10l6-4v12l-6-4z',
  audio: 'M9 18V6l10-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM19 16a3 3 0 11-6 0 3 3 0 016 0z',
  text: 'M4 6V4h16v2M12 4v16M8 20h8',
  filter: 'M4 5h16l-6 7v6l-4 2v-8L4 5z',
  transition: 'M3 12h8M8 8l4 4-4 4M21 5v14M14 5v14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M4 12l5 5L20 6',
  chevron: 'M9 6l6 6-6 6',
  save: 'M5 4h11l3 3v13H5zM8 4v6h7V4M8 20v-6h8v6',
  mic: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3',
  help: 'M12 17h.01M9 9a3 3 0 116 0c0 2-3 2-3 4',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-2-1V8l-2-1V4l-2 1-2-1-2 1-2-1v3L5 8v2l-2 1 2 1v2l2 1v3l2-1 2 1 2-1 2 1v-3l2-1v-2z',
  speed: 'M12 20a8 8 0 110-16 8 8 0 010 16zM12 12l4-3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
};

function icon(name, size = 18, extraClass = '') {
  const path = ICON_PATHS[name] || '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'ic ' + extraClass);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  svg.appendChild(p);
  return svg;
}

function toast(msg, kind = 'info', ms = 3200) {
  const root = document.getElementById('toasts');
  if (!root) return;
  const node = h('div', { class: 'toast ' + kind }, msg);
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('in'));
  setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 250);
  }, ms);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function debounce(fn, ms) {
  let t = 0;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* --- IndexedDB: хранение исходников, чтобы проект переживал перезагрузку --- */
const IDB_NAME = 'clipcut-db';
const IDB_STORE = 'media';
let idbPromise = null;

function idb() {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB недоступен'));
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

async function idbAll() {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('idbAll', e);
    return [];
  }
}

async function idbPut(record) {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('idbPut', e);
    return false;
  }
}

async function idbDelete(id) {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve(true);
    });
  } catch (e) {
    return false;
  }
}

async function idbClear() {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve(true);
    });
  } catch (e) {
    return false;
  }
}
