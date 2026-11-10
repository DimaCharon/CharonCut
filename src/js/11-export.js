/* ============================================================
   11 · Экспорт видео (canvas.captureStream + MediaRecorder)
   ============================================================ */

let exportState = null;

function pickMime() {
  const cands = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  if (!window.MediaRecorder) return '';
  for (const c of cands) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch (e) {}
  }
  return '';
}

function extForMime(mime) {
  if (!mime) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  return 'webm';
}

function openModal(node, opts = {}) {
  const root = $('#modalRoot');
  root.innerHTML = '';
  const overlay = h('div', { class: 'overlay' }, node);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !opts.sticky) closeModal();
  });
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('in'));
  return overlay;
}

function closeModal() {
  const root = $('#modalRoot');
  if (!root) return;
  const ov = root.firstElementChild;
  if (!ov) return;
  ov.classList.remove('in');
  setTimeout(() => { root.innerHTML = ''; }, 150);
}

function openExportDialog() {
  if (state.exporting) return toast('Экспорт уже идёт', 'warn');
  if (projectDuration() <= 0.01) return toast('Проект пуст — нечего экспортировать', 'warn');
  ensureAudio();

  const duration = projectDuration();
  const mime = pickMime();
  if (!window.MediaRecorder || !mime) {
    toast('Этот браузер не умеет записывать видео (MediaRecorder недоступен)', 'err', 6000);
  }

  const quality = { id: 'q-mid', value: 8_000_000 };
  const qualityBtns = [
    { label: 'Черновик', value: 3_000_000 },
    { label: 'Нормально', value: 8_000_000 },
    { label: 'Хорошо', value: 14_000_000 },
    { label: 'Максимум', value: 24_000_000 },
  ];
  const scaleBtns = [
    { label: '100%', value: 1 },
    { label: '75%', value: 0.75 },
    { label: '50%', value: 0.5 },
  ];
  const fpsBtns = [24, 30, 60];
  const opts = { bitrate: 8_000_000, scale: 1, fps: state.project.fps || 30, audio: true };

  const chips = (arr, current, onPick, labelFn) => {
    const wrap = h('div', { class: 'chips' });
    arr.forEach((item) => {
      const val = typeof item === 'object' ? item.value : item;
      const btn = h('button', {
        class: 'chip' + (val === current ? ' on' : ''),
        onclick: () => {
          onPick(val);
          wrap.querySelectorAll('.chip').forEach((b) => b.classList.remove('on'));
          btn.classList.add('on');
        },
      }, labelFn ? labelFn(item) : String(item));
      wrap.appendChild(btn);
    });
    return wrap;
  };

  const audioChk = h('input', {
    type: 'checkbox', checked: true,
    onchange: (e) => { opts.audio = e.target.checked; },
  });

  const dialog = h('div', { class: 'modal export-modal' },
    h('div', { class: 'modal-head' },
      h('h2', {}, 'Экспорт видео'),
      h('button', { class: 'mini', onclick: closeModal }, icon('close', 16))
    ),
    h('div', { class: 'modal-body' },
      h('div', { class: 'export-summary' },
        h('div', {}, h('span', { class: 'dim' }, 'Формат'), h('strong', {}, state.project.aspect + ' · ' + state.project.width + '×' + state.project.height)),
        h('div', {}, h('span', { class: 'dim' }, 'Длительность'), h('strong', {}, fmtTime(duration, state.project.fps))),
        h('div', {}, h('span', { class: 'dim' }, 'Файл'), h('strong', {}, (mime || 'webm').includes('mp4') ? 'MP4' : 'WebM'))
      ),
      field('Разрешение', chips(scaleBtns, opts.scale, (v) => { opts.scale = v; }, (i) => `${i.label} · ${Math.round(state.project.width * i.value)}p`)),
      field('Частота кадров', chips(fpsBtns, opts.fps, (v) => { opts.fps = v; }, (i) => i + ' fps')),
      field('Качество', chips(qualityBtns, opts.bitrate, (v) => { opts.bitrate = v; }, (i) => i.label)),
      h('label', { class: 'switch' }, audioChk, h('span', {}, 'Со звуком (микс дорожек)')),
      h('p', { class: 'hint' }, 'Экспорт идёт в реальном времени: ролик на ' + fmtDur(duration) + ' будет сохраняться примерно столько же. Не переключайте вкладку — браузер может замедлить отрисовку.'),
      mime ? null : h('p', { class: 'hint err' }, 'MediaRecorder недоступен: используйте Chrome, Edge, Firefox или Safari 15+.')
    ),
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn ghost', onclick: () => { closeModal(); saveFrame(); } }, icon('image', 15), 'Сохранить кадр (PNG)'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: closeModal }, 'Отмена'),
      h('button', {
        class: 'btn primary', disabled: !mime,
        onclick: () => startExport(opts),
      }, icon('download', 16), 'Экспортировать')
    )
  );
  openModal(dialog);
}

function startExport(opts) {
  if (state.exporting) return;
  const duration = projectDuration();
  if (duration <= 0.01) return;

  ensureAudio();
  stopPlayback();
  state.exporting = true;

  const outW = Math.max(2, Math.round((state.project.width * opts.scale) / 2) * 2);
  const outH = Math.max(2, Math.round((state.project.height * opts.scale) / 2) * 2);

  const expCanvas = document.createElement('canvas');
  expCanvas.width = outW;
  expCanvas.height = outH;
  const expCtx = expCanvas.getContext('2d');

  /* прогреваем рендер на первом кадре */
  seek(0);
  drawFrame(0);
  expCtx.drawImage(drawCanvas, 0, 0, outW, outH);

  let stream;
  try {
    stream = expCanvas.captureStream(opts.fps);
  } catch (e) {
    state.exporting = false;
    toast('Не удалось захватить canvas: ' + e.message, 'err');
    return;
  }
  if (opts.audio && streamDest) {
    const tracks = streamDest.stream.getAudioTracks();
    /* Экспорт владеет только клоном: иначе cleanup() остановит общую
       аудиодорожку и последующие экспорты останутся без звука. */
    if (tracks.length) stream.addTrack(tracks[0].clone());
  }

  const mime = pickMime();
  let rec;
  try {
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: opts.bitrate, audioBitsPerSecond: 128000 } : undefined);
  } catch (e) {
    try { rec = new MediaRecorder(stream); } catch (e2) {
      state.exporting = false;
      toast('MediaRecorder не запустился: ' + e2.message, 'err');
      return;
    }
  }

  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const recDone = new Promise((resolve) => { rec.onstop = () => resolve(); });
  rec.start(500);

  let cancelled = false;
  let copyAlive = true;
  const copyLoop = () => {
    if (!copyAlive) return;
    try { expCtx.drawImage(drawCanvas, 0, 0, outW, outH); } catch (e) {}
    requestAnimationFrame(copyLoop);
  };
  requestAnimationFrame(copyLoop);

  /* панель прогресса */
  const bar = h('div', { class: 'bar-fill' });
  const pct = h('strong', {}, '0%');
  const eta = h('span', { class: 'dim' }, '');
  const progress = h('div', { class: 'modal export-modal' },
    h('div', { class: 'modal-head' }, h('h2', {}, 'Идёт экспорт…')),
    h('div', { class: 'modal-body' },
      h('div', { class: 'export-summary' }, h('div', {}, h('span', { class: 'dim' }, 'Рендер'), pct), h('div', {}, h('span', { class: 'dim' }, 'Осталось'), eta)),
      h('div', { class: 'bar' }, bar),
      h('p', { class: 'hint' }, 'Идёт запись в реальном времени: ' + outW + '×' + outH + ', ' + opts.fps + ' fps. Не закрывайте вкладку.')
    ),
    h('div', { class: 'modal-foot' },
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn ghost', onclick: () => { cancelled = true; abortExport(); } }, 'Отменить')
    )
  );
  const overlay = openModal(progress, { sticky: true });
  const ovRef = overlay;

  exportState = {
    rec, stream, cancelled,
    abort() { cancelled = true; copyAlive = false; },
  };

  const progressTimer = setInterval(() => {
    const p = clamp(state.playhead / (duration || 1), 0, 1);
    bar.style.width = (p * 100).toFixed(1) + '%';
    pct.textContent = Math.round(p * 100) + '%';
    eta.textContent = fmtDur(Math.max(0, duration - state.playhead));
  }, 120);

  state.onEnded = async () => {
    copyAlive = false;
    clearInterval(progressTimer);
    if (cancelled) { cleanup(); return; }
    await sleep(320);
    try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {}
    await recDone;
    cleanup();
    const blob = new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
    state.exporting = false;
    /* openModal внутри showExportResult сам заменит содержимое оверлея */
    showExportResult(blob, mime);
  };

  function cleanup() {
    state.exporting = false;
    exportState = null;
    state.onEnded = null;
    copyAlive = false;
    clearInterval(progressTimer);
    try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
  }

  function abortExport() {
    stopPlayback();
    copyAlive = false;
    clearInterval(progressTimer);
    try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {}
    cleanup();
    closeModal();
    toast('Экспорт отменён', 'warn');
  }

  play();
}

function showExportResult(blob, mime) {
  const url = URL.createObjectURL(blob);
  const ext = extForMime(mime);
  const name = (state.project.name || 'charoncut').replace(/\s+/g, '-') + '-' + Date.now().toString().slice(-5) + '.' + ext;

  const dialog = h('div', { class: 'modal export-modal' },
    h('div', { class: 'modal-head' },
      h('h2', {}, 'Готово'),
      h('button', { class: 'mini', onclick: () => { URL.revokeObjectURL(url); closeModal(); } }, icon('close', 16))
    ),
    h('div', { class: 'modal-body' },
      h('video', { src: url, controls: true, playsinline: true, style: { width: '100%', borderRadius: '10px', background: '#000' } }),
      h('p', { class: 'hint' }, `Файл: ${name} · ${fmtBytes(blob.size)} · ${ext.toUpperCase()}`),
      h('p', { class: 'hint' }, 'Если скачивание не началось (например, в песочнице предпросмотра), откройте файл в новой вкладке.')
    ),
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn ghost', onclick: () => window.open(url, '_blank') }, 'Открыть в новой вкладке'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => { URL.revokeObjectURL(url); closeModal(); openExportDialog(); } }, 'Ещё раз'),
      h('button', { class: 'btn primary', onclick: () => downloadBlob(blob, name) }, icon('download', 16), 'Скачать')
    )
  );
  openModal(dialog, { sticky: true });
}

function saveFrame() {
  try {
    drawFrame(state.playhead);
    drawCanvas.toBlob((blob) => {
      if (!blob) return toast('Не удалось сохранить кадр', 'err');
      downloadBlob(blob, `frame-${Date.now()}.png`);
      toast('Кадр сохранён', 'ok');
    }, 'image/png');
  } catch (e) {
    toast('Ошибка: ' + e.message, 'err');
  }
}
