/* ============================================================
   07 · Таймлайн: дорожки, клипы, перетаскивание, обрезка, зум
   ============================================================ */

const tl = {
  labels: null,
  scroll: null,
  inner: null,
  ruler: null,
  tracks: null,
  playhead: null,
  built: false,
};

function buildTimelineShell() {
  tl.labels = $('#tlLabels');
  tl.scroll = $('#tlScroll');
  tl.inner = $('#tlInner');
  tl.ruler = $('#tlRuler');
  tl.tracks = $('#tlTracks');
  tl.playhead = $('#tlPlayhead');
  tl.built = true;

  tl.labels.innerHTML = '';
  for (const t of TRACKS) {
    tl.labels.appendChild(
      h('div', { class: 'tl-label', style: { height: t.height + 'px' } },
        h('span', { class: 'tl-label-name' }, t.name),
        h('span', { class: 'tl-label-dot ' + t.kind })
      )
    );
  }

  tl.tracks.innerHTML = '';
  tl.ruler.innerHTML = '';
  for (const t of TRACKS) {
    tl.tracks.appendChild(
      h('div', {
        class: 'tl-track',
        dataset: { track: t.id },
        style: { height: t.height + 'px' },
        onpointerdown: (e) => {
          if (e.target === e.currentTarget) {
            state.selection = null;
            refreshInspector();
            refreshTimeline();
            scrubFromEvent(e, true);
          }
        },
      })
    );
  }

  /* клик/драг по линейке = скраб */
  tl.ruler.addEventListener('pointerdown', (e) => scrubFromEvent(e, true));

  /* колесо мыши + ctrl = зум */
  tl.scroll.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(state.pxPerSec * (e.deltaY > 0 ? 0.9 : 1.1));
    }
  }, { passive: false });
}

function scrubFromEvent(e, drag) {
  const rect = tl.inner.getBoundingClientRect();
  const apply = (clientX) => {
    const x = clientX - rect.left;
    seek(Math.max(0, x / state.pxPerSec));
  };
  apply(e.clientX);
  if (!drag) return;
  const move = (ev) => apply(ev.clientX);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function setZoom(pps) {
  state.pxPerSec = clamp(pps, 12, 400);
  const inp = $('#tlZoom');
  if (inp) inp.value = String(Math.round(state.pxPerSec));
  refreshTimeline();
  updatePlayheadUI();
}

function fitTimeline() {
  const dur = Math.max(projectDuration(), 4);
  const w = tl.scroll ? tl.scroll.clientWidth - 32 : 800;
  setZoom(w / dur);
  if (tl.scroll) tl.scroll.scrollLeft = 0;
}

function tickStep() {
  const cands = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const c of cands) {
    if (c * state.pxPerSec >= 64) return c;
  }
  return 900;
}

function renderRuler(dur) {
  if (!tl.ruler) return;
  tl.ruler.innerHTML = '';
  const step = tickStep();
  const total = Math.max(dur + 12, 40);
  const frag = document.createDocumentFragment();
  for (let t = 0; t <= total; t += step) {
    const left = t * state.pxPerSec;
    if (left > total * state.pxPerSec) break;
    frag.appendChild(
      h('div', { class: 'tick', style: { left: left + 'px' } },
        h('span', {}, fmtTime(t, state.project.fps).slice(0, 5))
      )
    );
  }
  tl.ruler.appendChild(frag);
}

function clipLabel(clip) {
  if (clip.track === 'text') return (clip.text && clip.text.content) || 'Текст';
  if (clip.mediaId) {
    const m = state.media.get(clip.mediaId);
    return m ? m.name : 'Файл';
  }
  return clip.name || 'Клип';
}

function clipClass(clip) {
  const media = state.media.get(clip.mediaId);
  const kinds = [];
  kinds.push('t-' + clip.track);
  if (media) kinds.push('k-' + media.type);
  if (state.selection === clip.id) kinds.push('sel');
  if (clip.transition && clip.transition.dur > 0 && clip.transition.type !== 'none') kinds.push('has-trans');
  return kinds.join(' ');
}

function buildClipNode(clip) {
  const pps = state.pxPerSec;
  const w = Math.max(8, clip.duration * pps);
  const node = h('div', {
    class: 'clip ' + clipClass(clip),
    dataset: { id: clip.id },
    style: { left: clip.start * pps + 'px', width: w + 'px' },
    title: `${clipLabel(clip)} · ${fmtDur(clip.duration)}`,
  });

  const media = state.media.get(clip.mediaId);
  if (media && media.thumb && clip.track !== 'text' && clip.track !== 'audio') {
    const strip = h('div', { class: 'clip-strip' });
    strip.style.backgroundImage = `url(${media.thumb})`;
    strip.style.backgroundSize = `auto ${Math.max(24, TRACKS.find((t) => t.id === clip.track).height - 18)}px`;
    node.appendChild(strip);
  }
  if (clip.track === 'audio') {
    node.appendChild(h('div', { class: 'clip-wave' }));
  }
  if (clip.track === 'text') {
    node.appendChild(h('div', { class: 'clip-text-badge' }, 'T'));
  }

  node.appendChild(h('div', { class: 'clip-title' }, clipLabel(clip)));
  if (clip.speed !== 1) node.appendChild(h('div', { class: 'clip-badge' }, clip.speed.toFixed(2).replace(/\.?0+$/, '') + '×'));
  if (clip.muted) node.appendChild(h('div', { class: 'clip-badge mute' }, 'M'));

  if (w > 30) {
    node.appendChild(h('div', { class: 'handle l', dataset: { mode: 'trim-l' } }));
    node.appendChild(h('div', { class: 'handle r', dataset: { mode: 'trim-r' } }));
  }

  node.addEventListener('pointerdown', (e) => startClipDrag(e, clip, node));
  node.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (clip.track === 'text') {
      setTab('text');
      setTimeout(() => {
        const ta = $('#textContentInput');
        if (ta) { ta.focus(); ta.select(); }
      }, 60);
    }
  });
  return node;
}

function renderTimeline() {
  if (!tl.built) return;
  const dur = Math.max(projectDuration(), 12);
  const pps = state.pxPerSec;
  const innerW = Math.max(dur * pps + 260, (tl.scroll ? tl.scroll.clientWidth : 900));
  tl.inner.style.width = innerW + 'px';

  renderRuler(dur);

  for (const t of TRACKS) {
    const row = tl.tracks.querySelector(`.tl-track[data-track="${t.id}"]`);
    if (!row) continue;
    row.innerHTML = '';
    const clips = clipsOf(t.id).sort((a, b) => a.start - b.start);
    for (const c of clips) row.appendChild(buildClipNode(c));
  }

  const durNode = $('#tlDur');
  if (durNode) durNode.textContent = `Длительность: ${fmtTime(projectDuration(), state.project.fps)}`;
  updatePlayheadUI();
  const countNode = $('#tlCount');
  if (countNode) countNode.textContent = `${state.project.clips.length} клип(ов)`;
}

function updatePlayheadUI() {
  if (!tl.playhead) return;
  const x = state.playhead * state.pxPerSec;
  tl.playhead.style.transform = `translateX(${x}px)`;
  const handle = $('#tlPlayheadCap');
  if (handle) handle.style.transform = `translateX(${x}px)`;
  updateTimeLabel();
  /* автоскролл при воспроизведении */
  if (state.playing && tl.scroll) {
    const left = tl.scroll.scrollLeft;
    const w = tl.scroll.clientWidth;
    if (x < left + 40 || x > left + w - 80) {
      tl.scroll.scrollLeft = Math.max(0, x - w * 0.35);
    }
  }
}

/* ---------- перетаскивание и обрезка ---------- */

const SNAP_PX = 8;

function snapPoints(excludeId) {
  const pts = [0, state.playhead];
  for (const c of state.project.clips) {
    if (c.id === excludeId) continue;
    pts.push(c.start, c.start + c.duration);
  }
  return pts;
}

function applySnap(value, pts, pps) {
  let best = value;
  let bestDist = SNAP_PX / pps;
  for (const p of pts) {
    const d = Math.abs(p - value);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return round(best, 3);
}

function trackAtPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return null;
  const row = el.closest ? el.closest('.tl-track') : null;
  return row ? row.dataset.track : null;
}

function canGoToTrack(clip, trackId) {
  if (trackId === clip.track) return true;
  const media = state.media.get(clip.mediaId);
  if (clip.track === 'text') return trackId === 'text';
  if (media && media.type === 'audio') return trackId === 'audio';
  return trackId === 'main' || trackId === 'overlay';
}

function maxDurationFor(clip) {
  const media = state.media.get(clip.mediaId);
  if (!media || media.type === 'image' || !media.duration) return 3600;
  return Math.max(0.2, (media.duration - clip.inPoint) / (clip.speed || 1));
}

function startClipDrag(e, clip, node) {
  if (e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();

  const mode = e.target.dataset && e.target.dataset.mode ? e.target.dataset.mode : 'move';
  state.selection = clip.id;
  $$('.clip.sel').forEach((n) => n.classList.remove('sel'));
  node.classList.add('sel');
  refreshInspector();
  refreshTimelineLight();

  const pps = state.pxPerSec;
  const startX = e.clientX;
  const startY = e.clientY;
  const orig = { start: clip.start, duration: clip.duration, inPoint: clip.inPoint, track: clip.track };
  let snapPts = snapPoints(clip.id);
  let moved = false;
  let historyPushed = false;

  const guide = $('#snapGuide');

  const onMove = (ev) => {
    const dx = (ev.clientX - startX) / pps;
    if (!moved && Math.abs(ev.clientX - startX) < 2 && Math.abs(ev.clientY - startY) < 2) return;
    if (!moved) {
      moved = true;
      if (!historyPushed) { pushHistory(); historyPushed = true; }
      document.body.classList.add('dragging-clip');
      snapPts = snapPoints(clip.id);
    }

    if (mode === 'move') {
      let ns = orig.start + dx;
      const snapped = applySnap(ns, snapPts, pps);
      if (snapped !== ns) { ns = snapped; showSnapGuide(ns); } else hideSnapGuide();
      clip.start = round(Math.max(0, ns), 3);
      /* смена дорожки */
      const hoverTrack = trackAtPoint(ev.clientX, ev.clientY);
      if (hoverTrack && hoverTrack !== clip.track && canGoToTrack(clip, hoverTrack)) {
        clip.track = hoverTrack;
        renderTimeline();
        node = tl.tracks.querySelector(`.clip[data-id="${clip.id}"]`) || node;
      }
      node.style.left = clip.start * pps + 'px';
    } else if (mode === 'trim-l') {
      let delta = dx;
      /* нельзя выйти за начало исходника */
      const media = state.media.get(clip.mediaId);
      if (media && media.duration) {
        const minDelta = -orig.inPoint / (clip.speed || 1);
        delta = Math.max(delta, minDelta);
      }
      delta = Math.min(delta, orig.duration - 0.15);
      let newStart = orig.start + delta;
      const snapped = applySnap(newStart, snapPts, pps);
      if (snapped !== newStart) { delta += snapped - newStart; newStart = snapped; showSnapGuide(newStart); } else hideSnapGuide();
      if (newStart < 0) { delta -= newStart; newStart = 0; }
      clip.start = round(newStart, 3);
      clip.duration = round(Math.max(0.15, orig.duration - delta), 3);
      clip.inPoint = round(Math.max(0, orig.inPoint + delta * (clip.speed || 1)), 3);
      node.style.left = clip.start * pps + 'px';
      node.style.width = Math.max(8, clip.duration * pps) + 'px';
    } else {
      const media = state.media.get(clip.mediaId);
      let maxDur = 3600;
      if (media && media.duration) maxDur = Math.max(0.15, (media.duration - orig.inPoint) / (clip.speed || 1));
      let newEnd = orig.start + orig.duration + dx;
      const snapped = applySnap(newEnd, snapPts, pps);
      if (snapped !== newEnd) { newEnd = snapped; showSnapGuide(newEnd); } else hideSnapGuide();
      const newDur = clamp(newEnd - orig.start, 0.15, maxDur);
      clip.duration = round(newDur, 3);
      node.style.width = Math.max(8, clip.duration * pps) + 'px';
    }

    markDirty();
    refreshTimelineLight();
    updateTimeLabel();
    redraw();
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    document.body.classList.remove('dragging-clip');
    hideSnapGuide();
    if (moved) {
      refreshTimeline();
      refreshInspector();
      refreshPanel();
      redraw();
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function showSnapGuide(t) {
  const g = $('#snapGuide');
  if (!g) return;
  g.style.display = 'block';
  g.style.transform = `translateX(${t * state.pxPerSec}px)`;
}

function hideSnapGuide() {
  const g = $('#snapGuide');
  if (g) g.style.display = 'none';
}

/* Обновление только выделения/подписей без пересборки DOM */
function refreshTimelineLight() {
  if (!tl.built) return;
  $$('.tl-track .clip').forEach((n) => {
    n.classList.toggle('sel', n.dataset.id === state.selection);
  });
}
