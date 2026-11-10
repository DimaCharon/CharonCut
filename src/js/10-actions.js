/* ============================================================
   10 · Действия с клипами: разделение, удаление, дублирование, буфер
   ============================================================ */

let clipboard = null;

function splitClipAt(clip, t) {
  const local = t - clip.start;
  if (local <= 0.06 || local >= clip.duration - 0.06) return false;
  const right = deepClone(clip);
  right.id = uid('clip');
  right.start = round(clip.start + local, 3);
  right.duration = round(clip.duration - local, 3);
  right.inPoint = round((clip.inPoint || 0) + local * (clip.speed || 1), 3);
  right.transition = { type: 'none', dur: 0 };
  clip.duration = round(local, 3);
  state.project.clips.push(right);
  return true;
}

function splitSelected() {
  const clip = selectedClip();
  const t = state.playhead;
  if (clip && t > clip.start + 0.06 && t < clip.start + clip.duration - 0.06) {
    commit(() => { splitClipAt(clip, t); }, { keepSelection: true });
    toast('Клип разделён', 'ok');
    return;
  }
  /* иначе — режем всё, что под курсором */
  const targets = state.project.clips.filter((c) => t > c.start + 0.06 && t < c.start + c.duration - 0.06);
  if (!targets.length) return toast('Поставьте курсор внутрь клипа', 'warn');
  commit(() => { targets.forEach((c) => splitClipAt(c, t)); });
  toast(`Разделено клипов: ${targets.length}`, 'ok');
}

function deleteSelected() {
  const clip = selectedClip();
  if (!clip) return;
  commit(() => {
    state.project.clips = state.project.clips.filter((c) => c.id !== clip.id);
  }, { keepSelection: false });
  state.selection = null;
  refreshAll();
  toast('Клип удалён');
}

function duplicateSelected() {
  const clip = selectedClip();
  if (!clip) return toast('Выберите клип', 'warn');
  const copy = deepClone(clip);
  copy.id = uid('clip');
  copy.start = round(clip.start + clip.duration, 3);
  copy.transition = { type: 'none', dur: 0 };
  commit(() => {
    state.project.clips.push(copy);
    state.selection = copy.id;
  }, { keepSelection: true });
  refreshAll();
  toast('Клип дублирован', 'ok');
}

function copySelected() {
  const clip = selectedClip();
  if (!clip) return;
  clipboard = deepClone(clip);
  toast('Клип скопирован');
}

function pasteClipboard() {
  if (!clipboard) return toast('Буфер пуст', 'warn');
  const copy = deepClone(clipboard);
  copy.id = uid('clip');
  copy.start = round(state.playhead, 3);
  copy.transition = { type: 'none', dur: 0 };
  commit(() => {
    state.project.clips.push(copy);
    state.selection = copy.id;
  }, { keepSelection: true });
  refreshAll();
  toast('Клип вставлен', 'ok');
}

/* ---------- проект в JSON ---------- */

function exportProjectJson() {
  const payload = {
    app: 'CharonCut',
    version: 1,
    exportedAt: new Date().toISOString(),
    project: state.project,
    media: Array.from(state.media.values()).map((m) => ({
      id: m.id, name: m.name, type: m.type, duration: m.duration,
      width: m.width, height: m.height, size: m.size || 0,
      note: 'Исходные файлы в JSON не вкладываются — перенесите их отдельно',
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${(state.project.name || 'charoncut').replace(/\s+/g, '-')}.json`);
  toast('Файл проекта скачан', 'ok');
}

async function importProjectJson(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const proj = data.project || data;
    if (!proj || !Array.isArray(proj.clips)) throw new Error('Неверный формат проекта');
    pushHistory();
    state.project = proj;
    state.selection = null;
    state.playhead = 0;
    stopPlayback();
    refreshAll();
    saveNow();
    const missing = state.project.clips.filter((c) => c.mediaId && !state.media.has(c.mediaId)).length;
    if (missing) toast(`Проект загружен, но для ${missing} клип(ов) нет исходников в этом браузере. Повторное связывание пока не поддерживается`, 'warn', 6000);
    else toast('Проект загружен', 'ok');
  } catch (e) {
    toast('Не удалось открыть проект: ' + e.message, 'err');
  }
}

function selectClip(id) {
  state.selection = id;
  refreshTimelineLight();
  refreshInspector();
  state.needsDraw = true;
}
