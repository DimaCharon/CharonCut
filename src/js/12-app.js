/* ============================================================
   12 · Запуск приложения, клавиатура, превью, интеграция
   ============================================================ */

function redraw() {
  state.needsDraw = true;
  if (drawCtx) {
    try { drawFrame(state.playhead); } catch (e) { console.warn(e); }
  }
}

function refreshTimeline() {
  if (!tl.built) return;
  renderTimeline();
}

function refreshAll() {
  buildTabs();
  refreshPanel();
  refreshTimeline();
  refreshInspector();
  refreshTransport();
  refreshTop();
  updateStageEmpty();
  updateAudioGains(state.playhead);
  redraw();
}

function refreshTop() {
  const inp = $('#projectName');
  if (inp && document.activeElement !== inp) inp.value = state.project.name || '';
  const u = $('#btnUndo');
  const r = $('#btnRedo');
  if (u) u.disabled = !state.undoStack.length;
  if (r) r.disabled = !state.redoStack.length;
  $$('#aspectSeg button').forEach((b) => b.classList.toggle('on', b.dataset.aspect === state.project.aspect));
}

function updateStageEmpty() {
  const empty = $('#stageEmpty');
  if (!empty) return;
  const isEmpty = state.project.clips.length === 0;
  empty.classList.toggle('hide', !isEmpty);
}

/* ---------- верхняя панель ---------- */

function on(selector, event, handler) {
  const node = $(selector);
  if (!node) {
    console.warn('CharonCut: элемент не найден —', selector);
    return null;
  }
  node.addEventListener(event, handler);
  return node;
}

function setupTopbar() {
  const undoBtn = on('#btnUndo', 'click', undo);
  if (undoBtn) undoBtn.appendChild(icon('undo', 17));
  const redoBtn = on('#btnRedo', 'click', redo);
  if (redoBtn) redoBtn.appendChild(icon('redo', 17));
  const saveBtn = on('#btnSave', 'click', saveNow);
  if (saveBtn) saveBtn.appendChild(icon('save', 17));

  on('#btnExport', 'click', openExportDialog);
  on('#btnPlay', 'click', togglePlay);
  on('#btnHelp', 'click', openHelp);
  on('#btnProject', 'click', openProjectMenu);
  on('#btnBack10', 'click', () => seek(state.playhead - 5));
  on('#btnFwd10', 'click', () => seek(state.playhead + 5));

  on('#projectName', 'input', (e) => {
    state.project.name = e.target.value;
    markDirty();
  });

  on('#masterVol', 'input', (e) => {
    state.masterVolume = parseInt(e.target.value, 10) / 100;
    ensureAudio();
    updateAudioGains(state.playhead);
  });

  $$('#aspectSeg button').forEach((b) => {
    b.addEventListener('click', () => {
      commit(() => applyAspect(b.dataset.aspect), { keepSelection: true });
      refreshPanel();
      updateStageEmpty();
    });
  });

  on('#fileInput', 'change', (e) => {
    if (e.target.files && e.target.files.length) importFiles(e.target.files);
    e.target.value = '';
  });

  on('#projectInput', 'change', (e) => {
    if (e.target.files && e.target.files[0]) importProjectJson(e.target.files[0]);
    e.target.value = '';
  });

  on('#tlSplit', 'click', splitSelected);
  on('#tlDelete', 'click', deleteSelected);
  on('#tlDup', 'click', duplicateSelected);
  on('#tlFit', 'click', fitTimeline);
  on('#tlZoom', 'input', (e) => setZoom(parseInt(e.target.value, 10)));
  on('#btnAddText', 'click', () => addTextClip(null));
  on('#btnUploadTop', 'click', () => $('#fileInput').click());
  const mobilePanel = (inspector) => {
    document.body.classList.toggle('mobile-inspect', inspector);
    const a = $('#mobileLibrary'), b = $('#mobileInspector');
    if (a && b) {
      a.classList.toggle('active', !inspector); b.classList.toggle('active', inspector);
      a.setAttribute('aria-pressed', String(!inspector)); b.setAttribute('aria-pressed', String(inspector));
    }
  };
  on('#mobileLibrary', 'click', () => mobilePanel(false));
  on('#mobileInspector', 'click', () => mobilePanel(true));
  on('#mobileProject', 'click', openProjectMenu);
  on('#stageEmpty', 'click', () => $('#fileInput').click());
}

function openHelp() {
  const dialog = h('div', { class: 'modal' },
    h('div', { class: 'modal-head' },
      h('h2', {}, 'CharonCut — как это работает'),
      h('button', { class: 'mini', onclick: closeModal }, icon('close', 16))
    ),
    h('div', { class: 'modal-body' },
      h('p', {}, 'Браузерный видеоредактор в духе CapCut: таймлайн, обрезка, текст, фильтры, переходы, звук и экспорт. Всё считается локально — файлы не уходят на сервер.'),
      h('div', { class: 'section-title' }, 'С чего начать'),
      h('ol', { class: 'tips' },
        h('li', {}, 'Перетащите видео/фото в окно (или «Импорт» в медиатеке).'),
        h('li', {}, 'Тяните края клипа — обрезка; тяните сам клип — сдвиг.'),
        h('li', {}, 'Вкладка «Текст» → стиль или стикер, потом тащите текст по превью.'),
        h('li', {}, '«Фильтры» и «Переходы» применяются к выделенному клипу.'),
        h('li', {}, '«Экспорт» → выберите качество и дождитесь окончания (реальное время).')
      ),
      h('div', { class: 'section-title' }, 'Горячие клавиши'),
      h('div', { class: 'keys' },
        ...[['Space', 'плей / пауза'], ['S', 'разделить клип'], ['Del / Backspace', 'удалить клип'],
          ['Ctrl+D', 'дублировать'], ['Ctrl+C / Ctrl+V', 'копировать / вставить'], ['Ctrl+Z', 'отменить'],
          ['Ctrl+Shift+Z', 'повторить'], ['Ctrl+S', 'сохранить'], ['Ctrl+E', 'экспорт'],
          ['← / →', 'шаг на кадр'], ['Shift+← / →', 'шаг на 1 с'], ['Home / End', 'начало / конец']]
          .map(([k, v]) => h('div', { class: 'key-row' }, h('kbd', {}, k), h('span', {}, v)))
      ),
      h('div', { class: 'section-title' }, 'Честно о границах'),
      h('p', { class: 'hint' }, 'Это не бинарник CapCut и не его брендинг: нет AI-функций, облачных шаблонов, авто-субтитров и мобильного приложения. Взамен — работает в браузере, бесплатно и разворачивается на GitHub Pages без сервера.')
    ),
    h('div', { class: 'modal-foot' },
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn primary', onclick: closeModal }, 'Понятно')
    )
  );
  openModal(dialog);
}

function openProjectMenu() {
  const dialog = h('div', { class: 'modal' },
    h('div', { class: 'modal-head' },
      h('h2', {}, 'Проект'),
      h('button', { class: 'mini', onclick: closeModal }, icon('close', 16))
    ),
    h('div', { class: 'modal-body' },
      h('div', { class: 'action-grid' },
        h('button', { class: 'btn', onclick: () => { closeModal(); saveNow(); } }, icon('save', 15), 'Сохранить'),
        h('button', { class: 'btn', onclick: () => { closeModal(); exportProjectJson(); } }, icon('download', 15), 'Скачать .json'),
        h('button', { class: 'btn', onclick: () => { closeModal(); $('#projectInput').click(); } }, icon('upload', 15), 'Загрузить .json')
      ),
      h('p', { class: 'hint' }, 'Проект автоматически сохраняется в localStorage этого браузера, а исходники — в IndexedDB. При очистке данных сайта медиа исчезнет: держите копии файлов и .json проекта.')
    ),
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn ghost danger', onclick: () => {
        closeModal();
        if (confirm('Удалить проект и все импортированные файлы из этого браузера?')) {
          idbClear();
          state.media.forEach((m) => { try { if (m.el && m.type !== 'image') m.el.remove(); } catch (e) {} });
          state.media.clear();
          resetProject();
          refreshAll();
        }
      } }, 'Очистить всё'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn primary', onclick: closeModal }, 'Закрыть')
    )
  );
  openModal(dialog);
}

/* ---------- клавиатура ---------- */

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    const el = e.target;
    const tag = (el.tagName || '').toLowerCase();
    const editing = tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;

    if (mod) {
      const k = (e.key || '').toLowerCase();
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (k === 'y') { e.preventDefault(); redo(); return; }
      if (k === 's') { e.preventDefault(); saveNow(); return; }
      if (k === 'd' && !editing) { e.preventDefault(); duplicateSelected(); return; }
      if (k === 'c' && !editing) { e.preventDefault(); copySelected(); return; }
      if (k === 'v' && !editing) { e.preventDefault(); pasteClipboard(); return; }
      if (k === 'e') { e.preventDefault(); openExportDialog(); return; }
      return;
    }
    if (editing) return;

    if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
    if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') { e.preventDefault(); splitSelected(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
    if (e.key === 'Escape') { closeModal(); state.selection = null; refreshInspector(); refreshTimelineLight(); redraw(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? seek(state.playhead - 1) : stepFrame(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? seek(state.playhead + 1) : stepFrame(1); return; }
    if (e.key === 'Home') { e.preventDefault(); seek(0); return; }
    if (e.key === 'End') { e.preventDefault(); seek(projectDuration()); return; }
    if (e.key === '=' || e.key === '+') { setZoom(state.pxPerSec * 1.2); return; }
    if (e.key === '-' || e.key === '_') { setZoom(state.pxPerSec / 1.2); return; }
  });
}

/* ---------- перетаскивание файлов в окно ---------- */

function setupDropZone() {
  let depth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    depth++;
    document.body.classList.add('dropping');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) document.body.classList.remove('dropping');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dropping');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      importFiles(e.dataTransfer.files);
    }
  });
}

/* ---------- перетаскивание текста по превью ---------- */

function setupStageInteractions() {
  const cv = $('#preview');
  cv.addEventListener('pointerdown', (e) => {
    const rect = cv.getBoundingClientRect();
    if (!rect.width) return;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const clip = hitTestText(nx, ny);
    if (!clip) return;
    e.preventDefault();
    state.selection = clip.id;
    refreshInspector();
    refreshTimelineLight();
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = clip.text.x == null ? 0.5 : clip.text.x;
    const oy = clip.text.y == null ? 0.5 : clip.text.y;
    let moved = false;
    const move = (ev) => {
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 3) return;
      if (!moved) { moved = true; pushHistory(); cv.classList.add('dragging'); }
      clip.text.x = clamp(ox + dx, -0.2, 1.2);
      clip.text.y = clamp(oy + dy, -0.2, 1.2);
      markDirty();
      redraw();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      cv.classList.remove('dragging');
      if (moved) refreshInspector();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  /* клик по пустому месту превью снимает выделение */
  cv.addEventListener('click', (e) => {
    const rect = cv.getBoundingClientRect();
    if (!rect.width) return;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (!hitTestText(nx, ny) && state.selection) {
      /* оставляем выделение, чтобы не мешать работе с инспектором */
    }
  });
}

/* ---------- запуск ---------- */

async function boot() {
  initRenderer();
  buildTimelineShell();
  buildTabs();
  setupTopbar();
  setupKeyboard();
  setupDropZone();
  setupStageInteractions();

  /* AudioContext просыпается на первый же жест пользователя */
  const wake = () => wakeAudio();
  window.addEventListener('pointerdown', wake, true);
  window.addEventListener('keydown', wake, true);

  const saved = loadProject();
  state.project = saved || createProject('Мой проект', '16:9');

  window.addEventListener('resize', debounce(() => {
    refreshTimeline();
    updatePlayheadUI();
    updateStageEmpty();
  }, 150));

  refreshAll();

  try {
    await restoreMediaFromIdb();
  } catch (e) {
    console.warn('restore failed', e);
  }
  refreshAll();
  if (saved && state.project.clips.length) {
    toast('Проект восстановлен из этого браузера', 'ok');
  } else {
    toast('Нажмите «Импорт», чтобы добавить видео', 'info', 5000);
  }
  requestAnimationFrame(tickLoop);
}

/* отладочный доступ (используется автотестами) */
window.__clipcut = {
  get state() { return state; },
  refreshAll, refreshTimeline, redraw, drawFrame, tickLoop,
  importFiles, addMediaToTimeline, addTextClip, splitSelected, deleteSelected,
  duplicateSelected, applyFilter, applyTransition, seek, play, pause, togglePlay,
  openExportDialog, startExport, pickMime, saveNow, setTab, fitTimeline,
  projectDuration, clipsOf, findClip, toast,
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
