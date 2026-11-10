/* ============================================================
   09 · Правая панель: инспектор клипа и проекта
   ============================================================ */

function refreshInspector() {
  const root = $('#inspector');
  if (!root) return;
  root.innerHTML = '';
  const clip = selectedClip();
  if (!clip) return renderProjectInspector(root);
  renderClipInspector(root, clip);
}

function field(label, node) {
  return h('div', { class: 'field' }, h('label', {}, label), node);
}

function numInput(value, min, max, step, onInput, suffix) {
  const inp = h('input', {
    type: 'number', class: 'num', value: round(value, 2), min, max, step,
    oninput: (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) onInput(clamp(v, min, max));
    },
  });
  return h('div', { class: 'num-wrap' }, inp, suffix ? h('span', { class: 'suffix' }, suffix) : null);
}

function renderClipInspector(root, clip) {
  const media = state.media.get(clip.mediaId);
  const typeName = clip.track === 'text' ? 'Текст' : media ? { video: 'Видео', image: 'Фото', audio: 'Аудио' }[media.type] : 'Клип';

  root.appendChild(
    h('div', { class: 'insp-head' },
      h('div', { class: 'insp-title' },
        h('span', { class: 'badge-t' + (clip.track === 'text' ? ' text' : '') }, typeName),
        h('strong', {}, clipLabel(clip).slice(0, 30))
      ),
      h('button', { class: 'mini danger', title: 'Удалить клип', onclick: deleteSelected }, icon('trash', 15))
    )
  );

  /* --- тайминг --- */
  const timing = h('div', { class: 'grid-2' },
    field('Начало, с', numInput(clip.start, 0, 36000, 0.1, (v) => {
      commit(() => { clip.start = round(v, 3); }, { keepSelection: true });
    })),
    field('Длительность, с', numInput(clip.duration, 0.1, 3600, 0.1, (v) => {
      commit(() => { clip.duration = round(v, 3); }, { keepSelection: true });
    }))
  );
  root.appendChild(timing);

  /* --- текст --- */
  if (clip.track === 'text' && clip.text) {
    const tx = clip.text;
    const ta = h('textarea', {
      class: 'ta', rows: 3, id: 'textContentInput', value: tx.content,
      oninput: (e) => { tx.content = e.target.value; markDirty(); redraw(); refreshTimelineLight(); },
    });
    root.appendChild(h('div', { class: 'section-title' }, 'Содержимое'));
    root.appendChild(ta);

    root.appendChild(h('div', { class: 'grid-2' },
      field('Шрифт', h('select', {
        class: 'sel-input',
        onchange: (e) => { tx.font = e.target.value; markDirty(); redraw(); },
      }, ...FONTS.map((f) => h('option', { value: f.id, selected: tx.font === f.id }, f.name)))),
      field('Насыщенность', h('select', {
        class: 'sel-input',
        onchange: (e) => { tx.weight = parseInt(e.target.value, 10); markDirty(); redraw(); },
      }, ...[400, 600, 700, 800, 900].map((w) => h('option', { value: w, selected: tx.weight === w }, String(w)))))
    ));

    root.appendChild(sliderRow('Размер', tx.size, 16, 260, 1, (v) => { tx.size = v; markDirty(); redraw(); }, (v) => Math.round(v) + ' px'));
    root.appendChild(
      h('div', { class: 'grid-2' },
        field('Цвет', h('input', {
          type: 'color', class: 'color', value: toHex(tx.color),
          oninput: (e) => { tx.color = e.target.value; markDirty(); redraw(); },
        })),
        field('Обводка', h('input', {
          type: 'color', class: 'color', value: toHex(tx.stroke || '#000000'),
          oninput: (e) => { tx.stroke = e.target.value; markDirty(); redraw(); },
        }))
      )
    );
    root.appendChild(sliderRow('Толщина обводки', tx.strokeW, 0, 12, 1, (v) => { tx.strokeW = v; markDirty(); redraw(); }, (v) => Math.round(v)));
    root.appendChild(
      h('div', { class: 'grid-2' },
        field('Фон', h('input', {
          type: 'color', class: 'color', value: toHex(tx.bgColor || '#000000'),
          oninput: (e) => { tx.bgColor = e.target.value; markDirty(); redraw(); },
        })),
        field('Прозрачность фона', h('input', {
          type: 'range', min: 0, max: 100, step: 1, value: Math.round((tx.bgOpacity || 0) * 100),
          oninput: (e) => { tx.bgOpacity = parseFloat(e.target.value) / 100; markDirty(); redraw(); },
        }))
      )
    );
    root.appendChild(sliderRow('Межбуквенное', (tx.letter || 0) * 1000, -50, 400, 5, (v) => { tx.letter = v / 1000; markDirty(); redraw(); }, (v) => v.toFixed(0)));
    root.appendChild(sliderRow('Межстрочный', tx.lineH || 1.22, 0.8, 2.4, 0.02, (v) => { tx.lineH = v; markDirty(); redraw(); }, (v) => v.toFixed(2)));
    root.appendChild(
      h('label', { class: 'switch mt' },
        h('input', { type: 'checkbox', checked: !!tx.shadow, onchange: (e) => { tx.shadow = e.target.checked; markDirty(); redraw(); } }),
        h('span', {}, 'Свечение / тень')
      )
    );

    /* позиция: сетка 3×3 */
    root.appendChild(h('div', { class: 'section-title' }, 'Положение'));
    const grid = h('div', { class: 'pos-grid' });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const px = [0.12, 0.5, 0.88][c];
        const py = [0.14, 0.5, 0.86][r];
        grid.appendChild(
          h('button', {
            class: 'pos-cell' + (Math.abs(tx.x - px) < 0.06 && Math.abs(tx.y - py) < 0.06 ? ' on' : ''),
            title: `x ${px} · y ${py}`,
            onclick: () => {
              tx.x = px; tx.y = py; markDirty(); redraw(); refreshInspector();
            },
          })
        );
      }
    }
    root.appendChild(grid);
    root.appendChild(h('p', { class: 'hint' }, 'Текст можно перетаскивать мышкой прямо по превью.'));
  }

  /* --- видео-параметры --- */
  if (clip.track !== 'text') {
    root.appendChild(h('div', { class: 'section-title' }, 'Скорость'));
    const speeds = [0.25, 0.5, 1, 1.5, 2, 3];
    const row = h('div', { class: 'chips' });
    for (const s of speeds) {
      row.appendChild(h('button', {
        class: 'chip' + (Math.abs((clip.speed || 1) - s) < 0.01 ? ' on' : ''),
        onclick: () => setSpeed(clip, s),
      }, s + '×'));
    }
    root.appendChild(row);
    root.appendChild(sliderRow('Точная скорость', clip.speed || 1, 0.25, 4, 0.05, (v) => setSpeed(clip, v, true), (v) => v.toFixed(2) + '×'));

    root.appendChild(h('div', { class: 'section-title' }, 'Звук клипа'));
    root.appendChild(sliderRow('Громкость', Math.round(clip.volume * 100), 0, 200, 1, (v) => { clip.volume = v / 100; markDirty(); updateAudioGains(state.playhead); }, (v) => v + '%'));
    root.appendChild(
      h('label', { class: 'switch' },
        h('input', { type: 'checkbox', checked: !!clip.muted, onchange: (e) => { clip.muted = e.target.checked; markDirty(); updateAudioGains(state.playhead); refreshTimeline(); } }),
        h('span', {}, 'Заглушить')
      )
    );

    root.appendChild(h('div', { class: 'section-title' }, 'Кадр'));
    root.appendChild(sliderRow('Прозрачность', clip.opacity, 0, 100, 1, (v) => { clip.opacity = v; markDirty(); redraw(); }, (v) => v + '%'));
    root.appendChild(sliderRow('Масштаб', clip.transform.scale, 10, 400, 1, (v) => { clip.transform.scale = v; markDirty(); redraw(); }, (v) => v + '%'));
    root.appendChild(sliderRow('Сдвиг X', clip.transform.x * 100, -100, 100, 1, (v) => { clip.transform.x = v / 100; markDirty(); redraw(); }, (v) => Math.round(v)));
    root.appendChild(sliderRow('Сдвиг Y', clip.transform.y * 100, -100, 100, 1, (v) => { clip.transform.y = v / 100; markDirty(); redraw(); }, (v) => Math.round(v)));
    root.appendChild(sliderRow('Поворот', clip.transform.rot, -180, 180, 1, (v) => { clip.transform.rot = v; markDirty(); redraw(); }, (v) => v + '°'));
    root.appendChild(
      h('div', { class: 'row gap' },
        h('button', { class: 'btn sm', onclick: () => { commit(() => { clip.transform = defaultTransform(); }, { keepSelection: true }); } }, 'Сбросить кадр')
      )
    );

    root.appendChild(h('div', { class: 'section-title' }, 'Фильтр'));
    root.appendChild(
      h('select', {
        class: 'sel-input',
        onchange: (e) => { clip.filter = e.target.value; markDirty(); redraw(); refreshPanel(); },
      }, ...FILTERS.map((f) => h('option', { value: f.id, selected: clip.filter === f.id }, f.name)))
    );

    root.appendChild(h('div', { class: 'section-title' }, 'Появление и исчезновение'));
    root.appendChild(sliderRow('Появление', clip.fadeIn, 0, 5, 0.1, (v) => { clip.fadeIn = round(v, 2); markDirty(); redraw(); }, (v) => v.toFixed(1) + ' с'));
    root.appendChild(sliderRow('Исчезновение', clip.fadeOut, 0, 5, 0.1, (v) => { clip.fadeOut = round(v, 2); markDirty(); redraw(); }, (v) => v.toFixed(1) + ' с'));
  }

  /* --- действия --- */
  root.appendChild(h('div', { class: 'section-title' }, 'Действия'));
  root.appendChild(
    h('div', { class: 'action-grid' },
      h('button', { class: 'btn sm', onclick: () => splitSelected() }, icon('scissors', 14), 'Разделить'),
      h('button', { class: 'btn sm', onclick: () => duplicateSelected() }, icon('copy', 14), 'Дублировать'),
      clip.track === 'main' ? h('button', { class: 'btn sm', onclick: () => moveClipToTrack(clip, 'overlay') }, icon('layers', 14), 'В наложение') : null,
      clip.track === 'overlay' ? h('button', { class: 'btn sm', onclick: () => moveClipToTrack(clip, 'main') }, icon('video', 14), 'На основную') : null,
      h('button', { class: 'btn sm danger', onclick: deleteSelected }, icon('trash', 14), 'Удалить')
    )
  );
}

function toHex(color) {
  if (!color) return '#ffffff';
  if (color[0] === '#') return color.length === 7 ? color : '#ffffff';
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return '#ffffff';
  const [r, g, b] = m[1].split(',').map((x) => parseInt(x, 10));
  const hx = (n) => clamp(n || 0, 0, 255).toString(16).padStart(2, '0');
  return '#' + hx(r) + hx(g) + hx(b);
}

function setSpeed(clip, speed, keepUi) {
  const media = state.media.get(clip.mediaId);
  const maxDur = media && media.duration ? Math.max(0.15, (media.duration - clip.inPoint) / speed) : 3600;
  commit(() => {
    clip.speed = round(speed, 3);
    clip.duration = round(Math.min(clip.duration, maxDur), 3);
  }, { keepSelection: true });
  if (keepUi) {
    /* обновляем только значения без пересборки инспектора */
    refreshTimelineLight();
  }
}

function moveClipToTrack(clip, track) {
  commit(() => {
    clip.track = track;
    if (track === 'overlay') {
      clip.start = round(state.playhead, 3);
      clip.transform.scale = 42;
      clip.transform.x = 0.22;
      clip.transform.y = -0.2;
    } else {
      clip.transform = defaultTransform();
    }
  }, { keepSelection: true });
}

function renderProjectInspector(root) {
  const dur = projectDuration();
  const size = state.project.width + '×' + state.project.height;

  root.appendChild(h('div', { class: 'insp-head' }, h('div', { class: 'insp-title' }, h('strong', {}, 'Проект'))));

  const stats = h('div', { class: 'stats' },
    statRow('Разрешение', size),
    statRow('Формат', state.project.aspect),
    statRow('Длительность', fmtTime(dur, state.project.fps)),
    statRow('Клипов', String(state.project.clips.length)),
    statRow('Файлов', String(state.media.size)),
    statRow('FPS', String(state.project.fps))
  );
  root.appendChild(stats);

  root.appendChild(h('div', { class: 'section-title' }, 'Проект'));
  root.appendChild(
    h('div', { class: 'action-grid' },
      h('button', { class: 'btn sm', onclick: exportProjectJson }, icon('download', 14), 'Скачать .json'),
      h('button', { class: 'btn sm', onclick: () => $('#projectInput').click() }, icon('upload', 14), 'Загрузить'),
      h('button', { class: 'btn sm danger', onclick: () => {
        if (confirm('Начать новый проект? Текущий будет очищен.')) resetProject();
      } }, icon('trash', 14), 'Новый проект')
    )
  );

  root.appendChild(h('div', { class: 'section-title' }, 'Подсказки'));
  root.appendChild(h('ul', { class: 'tips' },
    h('li', {}, 'Перетащите файлы в окно — они добавятся на таймлайн'),
    h('li', {}, 'S — разделить клип, Del — удалить, Space — плей'),
    h('li', {}, 'Ctrl+Z / Ctrl+Shift+Z — отмена и повтор'),
    h('li', {}, 'Тяните края клипа, чтобы обрезать'),
    h('li', {}, 'Двойной клик по тексту — редактирование')
  ));

  root.appendChild(h('div', { class: 'section-title' }, 'Горячие клавиши'));
  const keys = [
    ['Space', 'плей / пауза'],
    ['S', 'разделить клип'],
    ['Del', 'удалить клип'],
    ['Ctrl+D', 'дублировать'],
    ['Ctrl+Z', 'отменить'],
    ['Ctrl+S', 'сохранить'],
    ['← / →', 'кадр назад / вперёд'],
    ['Home / End', 'в начало / конец'],
  ];
  const table = h('div', { class: 'keys' });
  for (const [k, v] of keys) table.appendChild(h('div', { class: 'key-row' }, h('kbd', {}, k), h('span', {}, v)));
  root.appendChild(table);

  root.appendChild(h('p', { class: 'hint' }, 'Проект автоматически сохраняется в этом браузере. Для переноса используйте «Скачать .json» — но исходники видео нужно перенести отдельно.'));
}

function statRow(k, v) {
  return h('div', { class: 'stat-row' }, h('span', {}, k), h('strong', {}, v));
}
