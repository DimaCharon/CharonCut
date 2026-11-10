/* ============================================================
   06 · Движок воспроизведения и синхронизация медиаэлементов
   ============================================================ */

state.lastTick = 0;
state.onEnded = null;

function nextClipOf(track, clip) {
  const list = clipsOfTrackSorted(track, clip.id);
  for (const c of list) {
    if (c.start >= clip.start + clip.duration - 1e-6) return c;
  }
  return null;
}

function hookMedia(media) {
  if (!media.el || media._hooked || media.type === 'image') return;
  media._hooked = true;
  const bump = () => { state.needsDraw = true; };
  media.el.addEventListener('seeked', bump);
  media.el.addEventListener('loadeddata', bump);
  media.el.addEventListener('timeupdate', bump);
  media.el.addEventListener('ended', () => { state.needsDraw = true; });
}

function clipNeedsMedia(clip, t) {
  if (clipIsActive(clip, t, 0.06)) return true;
  if (clip.track === 'main' || clip.track === 'overlay') {
    const next = nextClipOf(clip.track, clip);
    if (next && next.transition && next.transition.dur > 0) {
      const until = next.start + next.transition.dur;
      if (t >= clip.start + clip.duration - 0.06 && t < until) return true;
    }
  }
  return false;
}

function syncMedia(t) {
  /* Один медиаэлемент может использоваться несколькими клипами
     (например, после разрезания). Драйвер у каждого элемента должен быть
     ровно один, иначе currentTime «пинг-понгует» и декодер застревает. */
  for (const media of state.media.values()) {
    if (!media.el || media.type === 'image') continue;
    hookMedia(media);

    const clips = state.project.clips.filter((c) => c.mediaId === media.id);
    if (!clips.length) {
      if (!media.el.paused) media.el.pause();
      continue;
    }

    const needing = clips.filter((c) => clipNeedsMedia(c, t));
    if (!needing.length) {
      if (!media.el.paused) media.el.pause();
      continue;
    }

    /* приоритет — клип, который сейчас реально в кадре */
    const active = needing.find((c) => clipIsActive(c, t, 0.06));
    const primary = active || needing[0];
    const el = media.el;
    const maxTime = Math.max(0, (media.duration || 0) - 0.03);
    const desired = clamp(sourceTimeAt(primary, t), 0, maxTime || 1e6);
    const speed = clamp(primary.speed || 1, 0.1, 8);

    if (state.playing) {
      if (Math.abs(el.playbackRate - speed) > 0.001) el.playbackRate = speed;
      if (el.paused) {
        try { el.currentTime = desired; } catch (e) {}
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
      } else if (!el.seeking && Math.abs(el.currentTime - desired) > 0.3) {
        try { el.currentTime = desired; } catch (e) {}
      }
    } else {
      if (!el.paused) el.pause();
      const tol = 1.5 / (state.project.fps || 30);
      if (!el.seeking && Math.abs(el.currentTime - desired) > tol) {
        try { el.currentTime = desired; } catch (e) {}
      }
    }
  }
}

function pauseAllMedia() {
  for (const media of state.media.values()) {
    if (media.el && media.type !== 'image') {
      try { media.el.pause(); } catch (e) {}
    }
  }
}

function play() {
  if (state.playing) return;
  if (projectDuration() <= 0.01) {
    toast('Сначала добавьте видео, фото или текст на таймлайн', 'warn');
    return;
  }
  ensureAudio();
  if (state.playhead >= projectDuration() - 0.02) state.playhead = 0;
  state.playing = true;
  state.lastTick = performance.now();
  refreshTransport();
}

function pause() {
  if (!state.playing) return;
  state.playing = false;
  state.lastTick = 0;
  pauseAllMedia();
  refreshTransport();
}

function stopPlayback() {
  state.playing = false;
  pauseAllMedia();
  refreshTransport();
}

function togglePlay() {
  if (state.playing) pause();
  else play();
}

function seek(t, opts = {}) {
  const dur = Math.max(projectDuration(), opts.minDuration || 0);
  state.playhead = clamp(t, 0, Math.max(0, dur));
  state.lastTick = performance.now();
  state.needsDraw = true;
  updatePlayheadUI();
  refreshTransport(true);
}

function stepFrame(dir) {
  pause();
  const step = 1 / (state.project.fps || 30);
  seek(state.playhead + dir * step);
}

function tickLoop(now) {
  if (state.playing) {
    const dt = Math.min(0.2, (now - (state.lastTick || now)) / 1000);
    state.lastTick = now;
    const dur = projectDuration();
    state.playhead += dt;
    if (state.playhead >= dur) {
      state.playhead = dur;
      pause();
      const cb = state.onEnded;
      state.onEnded = null;
      if (cb) cb();
    }
  }
  syncMedia(state.playhead);
  updateAudioGains(state.playhead);
  if (state.playing || state.needsDraw) drawFrame(state.playhead);
  updatePlayheadUI();
  updateStageHud();
  requestAnimationFrame(tickLoop);
}

/* ---------- UI транспорта ---------- */

function refreshTransport(onlyTime) {
  const btn = $('#btnPlay');
  if (btn) {
    btn.innerHTML = '';
    btn.appendChild(icon(state.playing ? 'pause' : 'play', 20));
    btn.classList.toggle('playing', state.playing);
    btn.setAttribute('aria-label', state.playing ? 'Пауза' : 'Воспроизвести');
  }
  if (!onlyTime) {
    $$('#aspectSeg button').forEach((b) => b.classList.toggle('on', b.dataset.aspect === state.project.aspect));
  }
  updateTimeLabel();
}

function updateTimeLabel() {
  const n = $('#timeLabel');
  if (!n) return;
  const dur = projectDuration();
  n.textContent = `${fmtTime(state.playhead, state.project.fps)} / ${fmtTime(dur, state.project.fps)}`;
}

function updateStageHud() {
  const hud = $('#stageHud');
  if (!hud) return;
  const clip = selectedClip();
  let txt = '';
  if (clip) {
    const media = state.media.get(clip.mediaId);
    txt = media ? media.name : clip.track === 'text' ? 'Текст: ' + (clip.text ? clip.text.content.slice(0, 22) : '') : '';
  }
  if (hud.textContent !== txt) hud.textContent = txt;
}
