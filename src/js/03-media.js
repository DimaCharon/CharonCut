/* ============================================================
   03 · Медиатека: импорт, превью, миниатюры, IndexedDB, SFX, запись
   ============================================================ */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    img.src = url;
  });
}

function waitEvent(el, name, timeout = 12000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const onOk = () => { if (done) return; done = true; cleanup(); resolve(); };
    const onErr = () => { if (done) return; done = true; cleanup(); reject(new Error('Ошибка медиа: ' + name)); };
    const timer = setTimeout(() => onErr(), timeout);
    function cleanup() {
      clearTimeout(timer);
      el.removeEventListener(name, onOk);
      el.removeEventListener('error', onErr);
    }
    el.addEventListener(name, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

function makeThumbFromSource(src, sw, sh, maxW = 220) {
  try {
    const ratio = sh / sw;
    const w = Math.min(maxW, Math.max(48, sw));
    const hgt = Math.max(1, Math.round(w * ratio));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = hgt;
    const c = cv.getContext('2d');
    c.drawImage(src, 0, 0, w, hgt);
    return cv.toDataURL('image/jpeg', 0.72);
  } catch (e) {
    return null;
  }
}

/* WebM/MediaRecorder-файлы часто не содержат длительность в метаданных:
   duration === Infinity. Хак — перемотка «в бесконечность» заставляет браузер
   просканировать файл. Делаем это на ОТДЕЛЬНОМ элементе, чтобы не сломать
   декодер основного (иначе элемент навсегда застревает в readyState=1). */
async function probeDurationFromUrl(url, known, type) {
  if (isFinite(known) && known > 0) return known;
  const el = document.createElement(type === 'audio' ? 'audio' : 'video');
  el.preload = 'metadata';
  el.muted = true;
  el.src = url;
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(el);
  let result = 0;
  try {
    await waitEvent(el, 'loadedmetadata', 8000);
    if (isFinite(el.duration) && el.duration > 0) result = el.duration;
    else {
      el.currentTime = 1e101;
      await waitEvent(el, 'seeked', 8000);
      if (isFinite(el.duration) && el.duration > 0) result = el.duration;
    }
  } catch (e) {
    result = 0;
  } finally {
    try { el.removeAttribute('src'); el.load(); } catch (e) {}
    el.remove();
  }
  return result;
}

async function captureVideoThumb(el) {
  try {
    const target = Math.min(0.15, Math.max(0, (el.duration || 1) * 0.1));
    if (Math.abs(el.currentTime - target) > 0.01) {
      el.currentTime = target;
      await waitEvent(el, 'seeked', 6000);
    }
    return makeThumbFromSource(el, el.videoWidth || 320, el.videoHeight || 180);
  } catch (e) {
    return null;
  }
}

/* Импорт файлов: probe → миниатюра → IndexedDB → медиатека */
async function importFiles(files, opts = {}) {
  const list = Array.from(files || []).filter((f) =>
    /^video\//.test(f.type) || /^image\//.test(f.type) || /^audio\//.test(f.type) || /\.(mp4|webm|mov|m4v|mkv|mp3|wav|ogg|m4a|aac|jpg|jpeg|png|webp|gif|avif)$/i.test(f.name)
  );
  if (!list.length) {
    toast('Нужны видео, фото или аудиофайлы', 'warn');
    return [];
  }
  const created = [];
  for (const file of list) {
    try {
      const media = await addMediaFile(file, opts);
      created.push(media);
    } catch (e) {
      console.warn('import failed', file.name, e);
      toast(`Не удалось импортировать «${file.name}»`, 'err');
    }
  }
  if (created.length) {
    refreshPanel();
    refreshTimeline();
    refreshInspector();
    redraw();
    toast(`Добавлено в проект: ${created.length}`, 'ok');
  }
  return created;
}

async function addMediaFile(file, opts = {}) {
  const id = uid('m');
  const isImage = /^image\//.test(file.type) || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(file.name);
  const isAudio = /^audio\//.test(file.type) || /\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name);
  const type = isImage ? 'image' : isAudio ? 'audio' : 'video';
  const url = URL.createObjectURL(file);
  const media = {
    id, type, url, blob: file,
    name: file.name.replace(/\.[^.]+$/, ''),
    size: file.size,
    duration: 0, width: 0, height: 0, thumb: null,
    el: null, srcNode: null, gains: new Map(),
  };

  if (type === 'image') {
    const img = await loadImage(url);
    media.el = img;
    media.width = img.naturalWidth;
    media.height = img.naturalHeight;
    media.duration = 0;
    media.thumb = makeThumbFromSource(img, img.naturalWidth, img.naturalHeight);
  } else {
    const el = document.createElement(type === 'audio' ? 'audio' : 'video');
    el.src = url;
    el.preload = 'auto';
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.volume = 1;
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(el);
    await waitEvent(el, 'loadedmetadata');
    media.el = el;
    media.duration = await probeDurationFromUrl(url, el.duration, type);
    media.width = el.videoWidth || 0;
    media.height = el.videoHeight || 0;
    if (type === 'video') media.thumb = await captureVideoThumb(el);
    if (!media.thumb) media.thumb = audioWavePlaceholderSvg(media.name);
  }

  state.media.set(id, media);
  ensureSource(media);

  /* сохраняем исходник в IndexedDB (чтобы проект восстанавливался) */
  idbPut({
    id, name: media.name, type,
    blob: file,
    duration: media.duration,
    width: media.width,
    height: media.height,
    thumb: media.thumb,
  });

  if (opts.addToTimeline !== false) addMediaToTimeline(media);
  return media;
}

function audioWavePlaceholderSvg(seed) {
  const bars = 24;
  let rects = '';
  let rnd = 0;
  for (let i = 0; i < seed.length; i++) rnd = (rnd * 31 + seed.charCodeAt(i)) % 9973;
  for (let i = 0; i < bars; i++) {
    rnd = (rnd * 1103515245 + 12345) % 2147483648;
    const hgt = 12 + (rnd % 46);
    rects += `<rect x="${i * 8 + 2}" y="${(64 - hgt) / 2}" width="5" height="${hgt}" rx="2.5" fill="#6d8cff" opacity="0.85"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="64" viewBox="0 0 200 64"><rect width="200" height="64" fill="#171a24"/>${rects}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function defaultDurationFor(media) {
  if (media.type === 'image') return 5;
  return Math.max(0.2, round(media.duration || 5, 2));
}

function addMediaToTimeline(media, targetTrack) {
  pushHistory();
  const track = targetTrack || (media.type === 'audio' ? 'audio' : 'main');
  const duration = defaultDurationFor(media);
  const start = appendStart(track);
  const clip = makeClip({
    track,
    mediaId: media.id,
    start: round(start, 3),
    duration,
    name: media.name,
    speed: 1,
  });
  /* видео на основной дорожке: подгоняем кадр по размеру проекта */
  state.project.clips.push(clip);
  state.selection = clip.id;
  markDirty();
  refreshAll();
  return clip;
}

/* Быстрое добавление с дорожки «Наложение» */
function addMediaAsOverlay(media) {
  const clip = addMediaToTimeline(media, 'overlay');
  const c = findClip(clip.id);
  if (c) {
    c.start = round(state.playhead, 3);
    c.transform = { x: 0.22, y: -0.22, scale: 38, rot: 0 };
    c.duration = Math.min(c.duration, 4);
    markDirty();
    refreshAll();
  }
  return clip;
}

async function removeMedia(id) {
  const media = state.media.get(id);
  if (!media) return;
  const used = state.project.clips.some((c) => c.mediaId === id);
  if (used && !confirm('Файл используется на таймлайне. Удалить вместе с клипами?')) return;
  pushHistory();
  state.project.clips = state.project.clips.filter((c) => c.mediaId !== id);
  if (media.el) {
    try { media.el.pause(); } catch (e) {}
    if (media.type !== 'image') media.el.remove();
  }
  try { URL.revokeObjectURL(media.url); } catch (e) {}
  state.media.delete(id);
  idbDelete(id);
  if (state.selection && !findClip(state.selection)) state.selection = null;
  markDirty();
  refreshAll();
}

/* Восстановление медиа из IndexedDB при загрузке страницы */
async function restoreMediaFromIdb() {
  const rows = await idbAll();
  for (const row of rows) {
    if (state.media.has(row.id)) continue;
    try {
      const url = URL.createObjectURL(row.blob);
      const media = {
        id: row.id, name: row.name, type: row.type, url,
        blob: row.blob,
        duration: row.duration || 0,
        width: row.width || 0,
        height: row.height || 0,
        thumb: row.thumb || null,
        el: null, srcNode: null, gains: new Map(),
      };
      if (media.type === 'image') {
        const img = await loadImage(url);
        media.el = img;
        media.width = media.width || img.naturalWidth;
        media.height = media.height || img.naturalHeight;
        if (!media.thumb) media.thumb = makeThumbFromSource(img, img.naturalWidth, img.naturalHeight);
      } else {
        const el = document.createElement(media.type === 'audio' ? 'audio' : 'video');
        el.src = url;
        el.preload = 'auto';
        el.playsInline = true;
        el.volume = 1;
        el.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
        document.body.appendChild(el);
        await waitEvent(el, 'loadedmetadata', 8000);
        media.el = el;
        if (!media.duration) media.duration = await probeDurationFromUrl(url, el.duration, media.type);
        if (!media.thumb && media.type === 'video') media.thumb = await captureVideoThumb(el);
        if (!media.thumb) media.thumb = audioWavePlaceholderSvg(media.name || 'audio');
      }
      state.media.set(media.id, media);
    } catch (e) {
      console.warn('restore media failed', row && row.id, e);
    }
  }
  /* чистим клипы, у которых не восстановился исходник */
  const before = state.project.clips.length;
  state.project.clips = state.project.clips.filter((c) => !c.mediaId || state.media.has(c.mediaId));
  if (state.project.clips.length !== before) {
    console.info('Удалены клипы без исходников:', before - state.project.clips.length);
  }
}

/* ---------- генератор звуковых эффектов (Web Audio → WAV) ---------- */
function encodeWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const bytes = 44 + len * numCh * 2;
  const ab = new ArrayBuffer(bytes);
  const view = new DataView(ab);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, bytes - 8, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true); view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, len * numCh * 2, true);
  let off = 44;
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = clamp(chans[c][i], -1, 1);
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

async function renderSfx(kind) {
  const sr = 44100;
  const duration = kind === 'swell' ? 2.4 : kind === 'drop' ? 1.8 : kind === 'whoosh' ? 0.9 : 0.6;
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineCtx) throw new Error('OfflineAudioContext не поддерживается');
  const ctx = new OfflineCtx(2, Math.floor(sr * duration), sr);

  if (kind === 'tick') {
    for (let i = 0; i < 2; i++) {
      const t0 = 0.02 + i * 0.28;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 1800 : 1300, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.5, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.16);
    }
  } else if (kind === 'swell') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, 0);
    osc.frequency.exponentialRampToValueAtTime(720, duration);
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(0.45, duration * 0.92);
    g.gain.exponentialRampToValueAtTime(0.0001, duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(0); osc.stop(duration);
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, duration);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.setValueAtTime(400, 0);
    nf.frequency.exponentialRampToValueAtTime(4000, duration);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, 0);
    ng.gain.exponentialRampToValueAtTime(0.18, duration * 0.95);
    ng.gain.exponentialRampToValueAtTime(0.0001, duration);
    noise.connect(nf).connect(ng).connect(ctx.destination);
    noise.start(0);
  } else if (kind === 'drop') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, 0);
    osc.frequency.exponentialRampToValueAtTime(42, duration * 0.75);
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.linearRampToValueAtTime(0.85, 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(0); osc.stop(duration);
  } else {
    /* whoosh */
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, duration);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(260, 0);
    bp.frequency.exponentialRampToValueAtTime(5200, duration * 0.65);
    bp.frequency.exponentialRampToValueAtTime(700, duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.linearRampToValueAtTime(0.5, duration * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, duration);
    noise.connect(bp).connect(g).connect(ctx.destination);
    noise.start(0);
  }

  const buf = await ctx.startRendering();
  return encodeWav(buf);
}

let noiseCache = new Map();
function makeNoiseBuffer(ctx, duration) {
  const key = ctx.sampleRate + ':' + duration;
  if (noiseCache.has(key)) return noiseCache.get(key);
  const len = Math.floor(ctx.sampleRate * duration);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseCache.set(key, b);
  return b;
}

const SFX_PRESETS = [
  { id: 'whoosh', name: 'Whoosh', desc: 'пролёт' },
  { id: 'swell', name: 'Swell', desc: 'нарастание' },
  { id: 'drop', name: 'Bass drop', desc: 'удар' },
  { id: 'tick', name: 'Tick', desc: 'щелчок' },
];

async function addSfx(kind, name) {
  const blob = await renderSfx(kind);
  const file = new File([blob], `${name || kind}.wav`, { type: 'audio/wav' });
  return addMediaFile(file, { addToTimeline: true });
}

/* ---------- запись голоса ---------- */
let recorder = null;
let recChunks = [];
let recStart = 0;
let recTimer = 0;

async function toggleRecording(btn) {
  if (recorder && recorder.state === 'recording') {
    recorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream);
    recChunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(recTimer);
      const btnEl = document.getElementById('btnRecord');
      if (btnEl) { btnEl.classList.remove('rec'); btnEl.textContent = 'Записать голос'; }
      if (!recChunks.length) return;
      const blob = new Blob(recChunks, { type: recChunks[0].type || 'audio/webm' });
      const ext = (blob.type.includes('mp4') ? 'm4a' : 'webm');
      const file = new File([blob], `Запись ${new Date().toLocaleTimeString('ru-RU')}.${ext}`, { type: blob.type });
      try {
        await addMediaFile(file, { addToTimeline: true });
        refreshPanel();
        toast('Запись добавлена на таймлайн', 'ok');
      } catch (e) {
        toast('Не удалось добавить запись', 'err');
      }
      recorder = null;
    };
    recorder.start();
    recStart = performance.now();
    const btnEl = document.getElementById('btnRecord');
    if (btnEl) {
      btnEl.classList.add('rec');
      recTimer = setInterval(() => {
        const s = ((performance.now() - recStart) / 1000).toFixed(1);
        btnEl.textContent = `Стоп ${s} с`;
      }, 100);
    }
    toast('Идёт запись с микрофона…', 'info');
  } catch (e) {
    toast('Микрофон недоступен: ' + (e.message || e.name), 'err');
  }
}
