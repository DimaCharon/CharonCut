/* ============================================================
   02 · Состояние проекта, модель данных, история
   ============================================================ */

const ASPECTS = {
  '16:9': { w: 1920, h: 1080, label: '16:9' },
  '9:16': { w: 1080, h: 1920, label: '9:16' },
  '1:1': { w: 1080, h: 1080, label: '1:1' },
  '4:5': { w: 1080, h: 1350, label: '4:5' },
};

/* Дорожки снизу вверх по смыслу, в UI показываются сверху вниз */
const TRACKS = [
  { id: 'text', name: 'Текст', kind: 'text', height: 42 },
  { id: 'overlay', name: 'Наложение', kind: 'video', height: 54 },
  { id: 'main', name: 'Основная', kind: 'video', height: 62 },
  { id: 'audio', name: 'Аудио', kind: 'audio', height: 44 },
];

const FILTERS = [
  { id: 'none', name: 'Оригинал', css: '' },
  { id: 'warm', name: 'Тёплый', css: 'saturate(1.15) sepia(.16) contrast(1.03) brightness(1.04)' },
  { id: 'cool', name: 'Холодный', css: 'saturate(1.06) hue-rotate(-14deg) brightness(1.02) contrast(1.06)' },
  { id: 'vivid', name: 'Яркий', css: 'saturate(1.5) contrast(1.12) brightness(1.05)' },
  { id: 'mono', name: 'Ч/Б', css: 'grayscale(1) contrast(1.14)' },
  { id: 'vintage', name: 'Винтаж', css: 'sepia(.45) saturate(1.1) contrast(.95) brightness(1.03)' },
  { id: 'cinema', name: 'Кино', css: 'contrast(1.22) saturate(.9) brightness(.96)' },
  { id: 'soft', name: 'Мягкий', css: 'saturate(1.05) brightness(1.07) blur(.5px)' },
  { id: 'retro', name: 'Ретро', css: 'sepia(.3) hue-rotate(-10deg) contrast(1.1) saturate(1.25)' },
  { id: 'night', name: 'Ночь', css: 'brightness(.86) contrast(1.16) saturate(.8) hue-rotate(-8deg)' },
  { id: 'dream', name: 'Мечта', css: 'brightness(1.1) saturate(1.22) hue-rotate(8deg) blur(.6px)' },
  { id: 'fade', name: 'Выцветший', css: 'contrast(.9) saturate(.75) brightness(1.12)' },
];

const TRANSITIONS = [
  { id: 'none', name: 'Нет', dur: 0 },
  { id: 'crossfade', name: 'Растворение', dur: 0.6 },
  { id: 'fadeblack', name: 'Через чёрное', dur: 0.7 },
  { id: 'slide', name: 'Сдвиг', dur: 0.55 },
  { id: 'zoom', name: 'Наплыв', dur: 0.6 },
];

const FONTS = [
  { id: 'sans', name: 'Системный', stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' },
  { id: 'serif', name: 'С засечками', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', name: 'Моно', stack: 'ui-monospace, "SF Mono", Consolas, monospace' },
  { id: 'impact', name: 'Плотный', stack: 'Impact, "Arial Black", "Haettenschweiler", sans-serif' },
  { id: 'rounded', name: 'Округлый', stack: '"Trebuchet MS", "Segoe UI", sans-serif' },
];

const TEXT_PRESETS = [
  { name: 'Заголовок', sample: 'Заголовок', text: { content: 'ЗАГОЛОВОК', size: 96, weight: 800, color: '#ffffff', strokeW: 0, bgOpacity: 0, letter: 0.02 } },
  { name: 'Подзаголовок', sample: 'Подзаголовок', text: { content: 'Подзаголовок', size: 64, weight: 600, color: '#ffffff', strokeW: 0, bgOpacity: 0 } },
  { name: 'Субтитры', sample: 'Субтитры', text: { content: 'Текст субтитра', size: 54, weight: 600, color: '#ffffff', bgOpacity: 0.55, y: 0.84, strokeW: 0 } },
  { name: 'Плашка', sample: 'Плашка', text: { content: 'ВАЖНО', size: 60, weight: 800, color: '#0b0b0e', bgColor: '#22d3ee', bgOpacity: 1, y: 0.16 } },
  { name: 'Неон', sample: 'Неон', text: { content: 'NEON', size: 92, weight: 800, color: '#a5f3fc', strokeW: 0, shadow: true } },
  { name: 'Контур', sample: 'Контур', text: { content: 'КОНТУР', size: 88, weight: 800, color: 'rgba(0,0,0,0)', strokeW: 3, stroke: '#ffffff' } },
];

/* Глифы из блоков Geometric Shapes / Dingbats / Misc Symbols:
   они есть в стандартных шрифтах Windows, macOS, Linux и Android,
   поэтому не превращаются в «квадратики» на чужой системе. */
const STICKERS = ['★', '✦', '❤', '✔', '✚', '✱', '▲', '●', '◆', '➜', '✿', '❄', '☀', '☂', '♫', '⚑'];

const STORAGE_KEY = 'clipcut.project.v1';

const state = {
  project: null,
  media: new Map(),
  selection: null,          // id клипа
  playhead: 0,              // сек
  playing: false,
  pxPerSec: 60,
  activeTab: 'media',
  masterVolume: 1,
  undoStack: [],
  redoStack: [],
  needsDraw: true,
  exporting: false,
  filterTargetAll: false,
  lastSave: 0,
};

/* ---------- модель ---------- */

function defaultTransform() {
  return { x: 0, y: 0, scale: 100, rot: 0 };
}

function defaultText() {
  return {
    content: 'Ваш текст',
    font: 'sans',
    size: 72,
    weight: 700,
    color: '#ffffff',
    align: 'center',
    stroke: '#000000',
    strokeW: 0,
    bgColor: '#000000',
    bgOpacity: 0,
    shadow: false,
    x: 0.5,
    y: 0.5,
    letter: 0,
    lineH: 1.22,
  };
}

function makeClip(partial = {}) {
  return Object.assign(
    {
      id: uid('clip'),
      track: 'main',
      mediaId: null,
      name: '',
      start: 0,
      duration: 3,
      inPoint: 0,
      speed: 1,
      volume: 1,
      muted: false,
      opacity: 100,
      filter: 'none',
      adj: { b: 100, c: 100, s: 100 },
      transform: defaultTransform(),
      fadeIn: 0,
      fadeOut: 0,
      transition: { type: 'none', dur: 0 },
      text: null,
    },
    partial
  );
}

function createProject(name = 'Новый проект', aspect = '16:9') {
  const a = ASPECTS[aspect] || ASPECTS['16:9'];
  return {
    version: 1,
    id: uid('proj'),
    name,
    aspect,
    width: a.w,
    height: a.h,
    fps: 30,
    clips: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function applyAspect(aspect) {
  const a = ASPECTS[aspect];
  if (!a) return;
  state.project.aspect = aspect;
  state.project.width = a.w;
  state.project.height = a.h;
  markDirty();
}

/* ---------- доступ к клипам ---------- */

function findClip(id) {
  return state.project.clips.find((c) => c.id === id) || null;
}

function clipsOf(track) {
  return state.project.clips.filter((c) => c.track === track);
}

function clipsOfTrackSorted(track, excludeId) {
  return clipsOf(track)
    .filter((c) => c.id !== excludeId)
    .sort((a, b) => a.start - b.start);
}

function selectedClip() {
  return state.selection ? findClip(state.selection) : null;
}

function projectDuration() {
  let d = 0;
  for (const c of state.project.clips) d = Math.max(d, c.start + c.duration);
  return d;
}

function trackEnd(track) {
  let d = 0;
  for (const c of clipsOf(track)) d = Math.max(d, c.start + c.duration);
  return d;
}

function prevClipOf(track, clip) {
  const list = clipsOfTrackSorted(track, clip.id);
  let best = null;
  for (const c of list) {
    if (c.start + c.duration <= clip.start + 1e-6) {
      if (!best || c.start > best.start) best = c;
    }
  }
  return best;
}

/* Свободное место под дорожку: возвращает место после последнего клипа */
function appendStart(track) {
  return round(trackEnd(track), 3);
}

/* ---------- мутации с историей ---------- */

function markDirty() {
  state.needsDraw = true;
  state.project.updatedAt = Date.now();
  scheduleSave();
}

function pushHistory() {
  try {
    state.undoStack.push(JSON.stringify(state.project));
    if (state.undoStack.length > 80) state.undoStack.shift();
    state.redoStack.length = 0;
  } catch (e) { /* ignore */ }
}

function undo() {
  if (!state.undoStack.length) return toast('Нечего отменять', 'warn');
  state.redoStack.push(JSON.stringify(state.project));
  state.project = JSON.parse(state.undoStack.pop());
  if (state.selection && !findClip(state.selection)) state.selection = null;
  refreshAll();
  toast('Отменено');
}

function redo() {
  if (!state.redoStack.length) return toast('Нечего повторять', 'warn');
  state.undoStack.push(JSON.stringify(state.project));
  state.project = JSON.parse(state.redoStack.pop());
  if (state.selection && !findClip(state.selection)) state.selection = null;
  refreshAll();
  toast('Повторено');
}

/* commit(fn): изменение проекта с записью в историю и полным обновлением UI */
function commit(fn, opts = {}) {
  pushHistory();
  fn();
  if (opts.keepSelection === false) state.selection = null;
  markDirty();
  refreshAll();
}

/* ---------- сохранение проекта ---------- */

const scheduleSave = debounce(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
    state.lastSave = Date.now();
    flashSaved();
  } catch (e) {
    console.warn('save failed', e);
  }
}, 700);

function saveNow() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
    state.lastSave = Date.now();
    flashSaved();
    toast('Проект сохранён в браузере', 'ok');
  } catch (e) {
    toast('Не удалось сохранить: ' + e.message, 'err');
  }
}

function flashSaved() {
  const n = $('#saveHint');
  if (!n) return;
  n.textContent = 'Сохранено';
  n.classList.add('show');
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => n.classList.remove('show'), 1400);
}

function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.clips)) return null;
    return p;
  } catch (e) {
    return null;
  }
}

function resetProject() {
  state.project = createProject('Новый проект', state.project ? state.project.aspect : '16:9');
  state.selection = null;
  state.playhead = 0;
  stopPlayback();
  refreshAll();
  saveNow();
}
