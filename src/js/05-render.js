/* ============================================================
   05 · Рендерер кадра: композитинг, фильтры, переходы, текст
   ============================================================ */

let drawCanvas = null;
let drawCtx = null;

function initRenderer() {
  drawCanvas = document.getElementById('preview');
  if (drawCanvas) drawCtx = drawCanvas.getContext('2d', { alpha: false });
}

function fontStack(id) {
  const f = FONTS.find((x) => x.id === id) || FONTS[0];
  return f.stack;
}

function filterString(clip) {
  const preset = FILTERS.find((f) => f.id === clip.filter);
  const parts = [];
  if (preset && preset.css) parts.push(preset.css);
  const a = clip.adj || { b: 100, c: 100, s: 100 };
  if (a.b !== 100) parts.push(`brightness(${a.b / 100})`);
  if (a.c !== 100) parts.push(`contrast(${a.c / 100})`);
  if (a.s !== 100) parts.push(`saturate(${a.s / 100})`);
  return parts.length ? parts.join(' ') : 'none';
}

function opacityAt(clip, t) {
  const base = (clip.opacity == null ? 100 : clip.opacity) / 100;
  const local = t - clip.start;
  let f = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) f = Math.max(0, local / clip.fadeIn);
  if (clip.fadeOut > 0 && local > clip.duration - clip.fadeOut) {
    f = Math.min(f, Math.max(0, (clip.duration - local) / clip.fadeOut));
  }
  return clamp(base * f, 0, 1);
}

function clipIsActive(clip, t, pad = 0) {
  return t >= clip.start - pad && t < clip.start + clip.duration + pad;
}

/* Перевод «время таймлайна» → «время исходника» */
function sourceTimeAt(clip, t) {
  return clip.inPoint + clamp(t - clip.start, 0, clip.duration) * clip.speed;
}

/* В режиме реального времени мы не можем «заморозить» видео,
   поэтому кадр берётся у самого элемента; синхронизацией занимается syncMedia(). */

function drawMediaFit(ctx, srcEl, sw, sh, transform, W, H) {
  if (!sw || !sh) { sw = srcEl.videoWidth || srcEl.width || W; sh = srcEl.videoHeight || srcEl.height || H; }
  const cover = Math.max(W / sw, H / sh);
  const tr = transform || { x: 0, y: 0, scale: 100, rot: 0 };
  const scale = cover * ((tr.scale == null ? 100 : tr.scale) / 100);
  const dw = sw * scale;
  const dh = sh * scale;
  const cx = W / 2 + (tr.x || 0) * W;
  const cy = H / 2 + (tr.y || 0) * H;
  ctx.save();
  ctx.translate(cx, cy);
  if (tr.rot) ctx.rotate((tr.rot * Math.PI) / 180);
  ctx.drawImage(srcEl, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return { dw, dh };
}

function drawClipVisual(clip, t, alpha, extraOffsetX = 0) {
  const media = state.media.get(clip.mediaId);
  if (!media) return false;
  const W = state.project.width;
  const H = state.project.height;
  const ctx = drawCtx;

  let srcEl = media.el;
  if (media.type !== 'image') {
    if (!srcEl || srcEl.readyState < 2) return false;
  } else if (!srcEl || !srcEl.complete) return false;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  const fs = filterString(clip);
  if (fs !== 'none') ctx.filter = fs;
  const tr = Object.assign({}, clip.transform);
  if (extraOffsetX) tr.x = (tr.x || 0) + extraOffsetX;
  drawMediaFit(ctx, srcEl, media.width, media.height, tr, W, H);
  ctx.restore();
  return true;
}

/* ---------- текст ---------- */

function wrapLines(ctx, text, maxWidth) {
  const out = [];
  const paragraphs = String(text).split('\n');
  for (const para of paragraphs) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function textFontCss(tx) {
  return `${tx.weight || 700} ${Math.max(4, tx.size || 72)}px ${fontStack(tx.font)}`;
}

function drawTextClip(clip, t, alpha) {
  const tx = clip.text;
  if (!tx) return;
  const W = state.project.width;
  const H = state.project.height;
  const ctx = drawCtx;
  const k = H / 1080; /* масштаб относительно 1080p */
  const fontSize = Math.max(8, tx.size * k);
  const font = `${tx.weight || 700} ${fontSize}px ${fontStack(tx.font)}`;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  if (tx.letter) {
    /* межбуквенное расстояние поддерживается не везде — рисуем вручную */
    ctx.letterSpacing = `${tx.letter}em`;
  }
  const maxWidth = W * 0.9;
  const lines = wrapLines(ctx, tx.content || '', maxWidth);
  const lineH = fontSize * (tx.lineH || 1.22);
  const totalH = lineH * lines.length;
  const cx = (tx.x == null ? 0.5 : tx.x) * W;
  const cyTop = (tx.y == null ? 0.5 : tx.y) * H - totalH / 2 + lineH / 2;

  /* фон-плашка за весь блок */
  if (tx.bgOpacity > 0) {
    let wMax = 0;
    for (const l of lines) wMax = Math.max(wMax, ctx.measureText(l).width);
    const padX = fontSize * 0.34;
    const padY = fontSize * 0.22;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1) * clamp(tx.bgOpacity, 0, 1);
    ctx.fillStyle = tx.bgColor || '#000000';
    const rx = Math.min(fontSize * 0.3, 24 * k);
    const bw = wMax + padX * 2;
    const bh = totalH + padY * 2;
    roundRect(ctx, cx - bw / 2, cyTop - lineH / 2 - padY, bw, bh, rx);
    ctx.fill();
    ctx.restore();
  }

  for (let i = 0; i < lines.length; i++) {
    const ly = cyTop + i * lineH;
    if (tx.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.65)';
      ctx.shadowBlur = fontSize * 0.45;
      ctx.shadowOffsetY = fontSize * 0.08;
      ctx.fillStyle = tx.color || '#fff';
      ctx.fillText(lines[i], cx, ly);
      ctx.restore();
      /* неоновое свечение */
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1) * 0.6;
      ctx.shadowColor = tx.color || '#fff';
      ctx.shadowBlur = fontSize * 0.8;
      ctx.fillStyle = tx.color || '#fff';
      ctx.fillText(lines[i], cx, ly);
      ctx.restore();
    }
    if (tx.strokeW > 0) {
      ctx.lineWidth = tx.strokeW * k;
      ctx.strokeStyle = tx.stroke || '#000';
      ctx.lineJoin = 'round';
      ctx.strokeText(lines[i], cx, ly);
    }
    ctx.fillStyle = tx.color || '#ffffff';
    ctx.fillText(lines[i], cx, ly);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, hgt, r) {
  const rr = Math.min(r, w / 2, hgt / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + hgt, rr);
  ctx.arcTo(x + w, y + hgt, x, y + hgt, rr);
  ctx.arcTo(x, y + hgt, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ---------- отрисовка дорожки ---------- */

function activeClipsOn(track, t) {
  return clipsOf(track)
    .filter((c) => clipIsActive(c, t))
    .sort((a, b) => a.start - b.start);
}

function drawTrack(track, t) {
  const clips = clipsOf(track).sort((a, b) => a.start - b.start);
  for (const clip of clips) {
    if (!clipIsActive(clip, t)) continue;
    const tr = clip.transition || { type: 'none', dur: 0 };
    const prev = prevClipOf(track, clip);
    const inTransition = tr.dur > 0 && prev && t < clip.start + tr.dur;

    if (inTransition) {
      const p = clamp((t - clip.start) / tr.dur, 0, 1);
      const eased = p * p * (3 - 2 * p);
      /* исходящий кадр предыдущего клипа */
      const prevFrameTime = Math.min(prev.start + prev.duration - 0.001, t);
      if (tr.type === 'fadeblack') {
        drawClipVisual(prev, prevFrameTime, 1 - eased);
        /* чёрный между — оставляем как есть, экран уже чёрный */
      } else if (tr.type === 'slide') {
        drawClipVisual(prev, prevFrameTime, 1);
        drawClipVisual(clip, t, 1, -(1 - eased) * 1.05);
      } else if (tr.type === 'zoom') {
        drawClipVisual(prev, prevFrameTime, 1 - eased);
        const media = state.media.get(clip.mediaId);
        if (media) {
          const saved = JSON.parse(JSON.stringify(clip.transform || {}));
          clip.transform = Object.assign({}, clip.transform, {
            scale: (clip.transform.scale || 100) * (1.18 - 0.18 * eased),
          });
          drawClipVisual(clip, t, eased);
          clip.transform = saved;
        } else {
          drawClipVisual(clip, t, eased);
        }
      } else {
        /* crossfade */
        drawClipVisual(prev, prevFrameTime, 1);
        drawClipVisual(clip, t, eased);
      }
    } else {
      const alpha = opacityAt(clip, t);
      if (clip.track === 'text') drawTextClip(clip, t, alpha);
      else drawClipVisual(clip, t, alpha);
    }
  }
}

function drawFrame(t) {
  if (!drawCtx) return;
  const W = state.project.width;
  const H = state.project.height;
  if (drawCanvas.width !== W || drawCanvas.height !== H) {
    drawCanvas.width = W;
    drawCanvas.height = H;
  }
  drawCtx.setTransform(1, 0, 0, 1, 0, 0);
  drawCtx.globalAlpha = 1;
  drawCtx.filter = 'none';
  drawCtx.fillStyle = '#000000';
  drawCtx.fillRect(0, 0, W, H);
  drawTrack('main', t);
  drawTrack('overlay', t);
  drawTrack('text', t);
  /* безопасные поля */
  if (state.showSafe) {
    drawCtx.save();
    drawCtx.strokeStyle = 'rgba(255,255,255,.25)';
    drawCtx.lineWidth = 2;
    drawCtx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
    drawCtx.restore();
  }
  state.needsDraw = false;
}

/* ---------- попадание по тексту на канвасе ---------- */

function hitTestText(nx, ny) {
  const t = state.playhead;
  const list = clipsOf('text').filter((c) => clipIsActive(c, t));
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    const tx = c.text;
    if (!tx) continue;
    const box = textBoxOf(c);
    if (nx >= box.x0 && nx <= box.x1 && ny >= box.y0 && ny <= box.y1) return c;
  }
  return null;
}

/* Приблизительные габариты текстового блока в долях кадра */
function textBoxOf(clip) {
  const tx = clip.text || {};
  const W = state.project.width;
  const H = state.project.height;
  const k = H / 1080;
  const fontSize = Math.max(8, (tx.size || 72) * k);
  const lines = String(tx.content || '').split('\n');
  const approxW = Math.min(W * 0.9, Math.max(...lines.map((l) => l.length * fontSize * 0.55), fontSize));
  const approxH = fontSize * (tx.lineH || 1.22) * lines.length;
  const cx = (tx.x == null ? 0.5 : tx.x) * W;
  const cy = (tx.y == null ? 0.5 : tx.y) * H;
  return {
    x0: cx - approxW / 2, x1: cx + approxW / 2,
    y0: cy - approxH / 2, y1: cy + approxH / 2,
    cx, cy,
  };
}
