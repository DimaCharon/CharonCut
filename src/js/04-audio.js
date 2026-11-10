/* ============================================================
   04 · Звуковой граф: микширование, громкость, фейды, экспорт аудио
   ============================================================ */

let audioCtx = null;
let masterGain = null;
let streamDest = null;

/* AudioContext можно создать только «по жесту» пользователя.
   Пока он suspended, подключать медиаэлементы к графу нельзя:
   иначе браузер приостанавливает воспроизведение самого видео. */
function audioRunning() {
  return !!(audioCtx && audioCtx.state === 'running');
}

function wakeAudio() {
  if (!audioCtx) return;
  if (audioCtx.state === 'running') {
    for (const m of state.media.values()) ensureSource(m);
    return;
  }
  const p = audioCtx.resume();
  if (p && p.then) {
    p.then(() => {
      if (audioRunning()) for (const m of state.media.values()) ensureSource(m);
    }).catch(() => {});
  }
}

function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    audioCtx = new AC();
  } catch (e) {
    console.warn('AudioContext', e);
    return null;
  }
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(audioCtx.destination);
  if (audioCtx.createMediaStreamDestination) {
    streamDest = audioCtx.createMediaStreamDestination();
    masterGain.connect(streamDest);
  }
  if (audioCtx.state !== 'running') wakeAudio();
  if (audioRunning()) for (const m of state.media.values()) ensureSource(m);
  return audioCtx;
}

function ensureSource(media) {
  if (!audioRunning() || !media || !media.el || media.srcNode) return;
  if (media.type === 'image') return;
  try {
    media.srcNode = audioCtx.createMediaElementSource(media.el);
  } catch (e) {
    /* элемент уже был подключён к другому контексту — игнорируем */
  }
}

function clipGain(media, clipId) {
  if (!audioRunning() || !media) return null;
  ensureSource(media);
  if (!media.srcNode) return null;
  let g = media.gains.get(clipId);
  if (!g) {
    g = audioCtx.createGain();
    g.gain.value = 0;
    media.srcNode.connect(g);
    g.connect(masterGain);
    media.gains.set(clipId, g);
  }
  return g;
}

/* Множитель громкости клипа в момент t (учитывает фейды и mute) */
function gainFactorAt(clip, t) {
  if (clip.muted) return 0;
  const local = t - clip.start;
  if (local < -0.05 || local > clip.duration + 0.05) return 0;
  let f = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) f = Math.max(0, local / clip.fadeIn);
  if (clip.fadeOut > 0 && local > clip.duration - clip.fadeOut) {
    f = Math.min(f, Math.max(0, (clip.duration - local) / clip.fadeOut));
  }
  return clamp(f, 0, 1);
}

function updateAudioGains(t) {
  if (!audioRunning() || !masterGain) return;
  masterGain.gain.setTargetAtTime(state.masterVolume, audioCtx.currentTime, 0.02);
  for (const clip of state.project.clips) {
    const media = state.media.get(clip.mediaId);
    if (!media || media.type === 'image') continue;
    const g = clipGain(media, clip.id);
    if (!g) continue;
    const target = clamp(clip.volume, 0, 2) * gainFactorAt(clip, t);
    g.gain.setTargetAtTime(target, audioCtx.currentTime, 0.015);
  }
  /* освобождаем гейны удалённых клипов */
  for (const media of state.media.values()) {
    if (!media.gains) continue;
    for (const [clipId, g] of media.gains) {
      if (!findClip(clipId)) {
        try { g.disconnect(); media.srcNode && media.srcNode.disconnect(g); } catch (e) {}
        media.gains.delete(clipId);
      }
    }
  }
}

function silenceAll() {
  if (!audioCtx) return;
  for (const media of state.media.values()) {
    if (!media.gains) continue;
    for (const g of media.gains.values()) {
      try { g.gain.setTargetAtTime(0, audioCtx.currentTime, 0.01); } catch (e) {}
    }
  }
}

function muteMediaElements(muted) {
  for (const media of state.media.values()) {
    if (!media.el || media.type === 'image') continue;
    try { media.el.muted = muted; } catch (e) {}
  }
}
