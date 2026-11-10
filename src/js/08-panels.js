/* ============================================================
   08 · Левая панель: Медиа · Текст · Фильтры · Переходы · Аудио
   ============================================================ */

const TABS = [
  { id: 'media', name: 'Медиа', icon: 'image' },
  { id: 'text', name: 'Текст', icon: 'text' },
  { id: 'filters', name: 'Фильтры', icon: 'filter' },
  { id: 'transitions', name: 'Переходы', icon: 'transition' },
  { id: 'audio', name: 'Аудио', icon: 'audio' },
];

function buildTabs() {
  const nav = $('#tabs');
  if (!nav) return;
  nav.innerHTML = '';
  for (const t of TABS) {
    nav.appendChild(
      h('button', {
        class: 'tab' + (state.activeTab === t.id ? ' on' : ''),
        dataset: { tab: t.id },
        title: t.name,
        onclick: () => setTab(t.id),
      }, icon(t.icon, 18), h('span', {}, t.name))
    );
  }
}

function setTab(id) {
  state.activeTab = id;
  $$('#tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
  refreshPanel();
}

function refreshPanel() {
  const body = $('#panelBody');
  if (!body) return;
  const scrollTop = body.scrollTop;
  body.innerHTML = '';
  const fn = {
    media: renderMediaPanel,
    text: renderTextPanel,
    filters: renderFiltersPanel,
    transitions: renderTransitionsPanel,
    audio: renderAudioPanel,
  }[state.activeTab] || renderMediaPanel;
  fn(body);
  body.scrollTop = scrollTop;
}

/* ---------- МЕДИА ---------- */

function renderMediaPanel(root) {
  root.appendChild(
    h('div', { class: 'panel-head' },
      h('h3', {}, 'Медиатека'),
      h('button', { class: 'btn primary sm', onclick: () => $('#fileInput').click() },
        icon('upload', 15), 'Импорт')
    )
  );

  const list = Array.from(state.media.values());
  const drop = h('div', { class: 'dropzone' },
    icon('upload', 22),
    h('div', {}, 'Нажмите или перетащите файлы сюда'),
    h('small', {}, 'MP4 · WebM · MOV · MP3 · WAV · JPG · PNG')
  );
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer.files && e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
  });
  drop.addEventListener('click', () => $('#fileInput').click());
  root.appendChild(drop);

  if (!list.length) {
    root.appendChild(h('p', { class: 'hint' }, 'Пока пусто. Импортируйте видео — оно автоматически встанет на основную дорожку.'));
    return;
  }

  const grid = h('div', { class: 'media-grid' });
  for (const m of list) {
    const card = h('div', { class: 'media-card', title: m.name + ' · ' + fmtDur(m.duration || 0) },
      h('div', { class: 'media-thumb' },
        m.thumb ? h('img', { src: m.thumb, alt: m.name, loading: 'lazy' }) : h('div', { class: 'media-noimg' }, icon(m.type === 'audio' ? 'audio' : 'video', 20)),
        h('span', { class: 'media-dur' }, m.type === 'image' ? 'фото' : fmtDur(m.duration || 0)),
        h('div', { class: 'media-actions' },
          h('button', { class: 'mini', title: 'На основную дорожку', onclick: (e) => { e.stopPropagation(); addMediaToTimeline(m, m.type === 'audio' ? 'audio' : 'main'); } }, icon('plus', 14)),
          m.type !== 'audio' ? h('button', { class: 'mini', title: 'Как наложение', onclick: (e) => { e.stopPropagation(); addMediaAsOverlay(m); } }, icon('layers', 14)) : null,
          h('button', { class: 'mini danger', title: 'Удалить из проекта', onclick: (e) => { e.stopPropagation(); removeMedia(m.id); } }, icon('trash', 14))
        )
      ),
      h('div', { class: 'media-name' }, m.name)
    );
    card.addEventListener('dblclick', () => {
      if (m.type === 'audio') addMediaToTimeline(m, 'audio');
      else addMediaToTimeline(m, 'main');
    });
    grid.appendChild(card);
  }
  root.appendChild(grid);
  root.appendChild(h('p', { class: 'hint' }, 'Нажмите «+» на файле, чтобы добавить его на таймлайн. Файлы сохраняются в браузере (IndexedDB), проект переживёт перезагрузку.'));
}

/* ---------- ТЕКСТ ---------- */

function renderTextPanel(root) {
  root.appendChild(h('div', { class: 'panel-head' }, h('h3', {}, 'Текст и стикеры')));
  root.appendChild(
    h('button', { class: 'btn primary block', onclick: () => addTextClip(null) },
      icon('plus', 16), 'Добавить текст')
  );

  root.appendChild(h('div', { class: 'section-title' }, 'Стили'));
  const grid = h('div', { class: 'preset-grid' });
  for (const p of TEXT_PRESETS) {
    const sampleStyle = {
      color: p.text.color,
      fontWeight: p.text.weight,
      fontSize: '17px',
      textShadow: p.text.strokeW ? 'none' : '0 1px 6px rgba(0,0,0,.6)',
      WebkitTextStroke: p.text.strokeW ? '1px ' + (p.text.stroke || '#fff') : 'none',
      background: p.text.bgOpacity ? p.text.bgColor || '#000' : 'transparent',
      padding: p.text.bgOpacity ? '2px 8px' : '0',
      borderRadius: '4px',
    };
    grid.appendChild(
      h('button', { class: 'preset translucent' + (p.text.bgOpacity ? ' dark' : ''), onclick: () => addTextClip(p) },
        h('span', { style: sampleStyle }, p.sample),
        h('small', {}, p.name)
      )
    );
  }
  root.appendChild(grid);

  root.appendChild(h('div', { class: 'section-title' }, 'Стикеры'));
  const stickers = h('div', { class: 'sticker-grid' });
  for (const s of STICKERS) {
    stickers.appendChild(
      h('button', {
        class: 'sticker',
        onclick: () => addTextClip({ text: { content: s, size: 200, weight: 400, y: 0.5, strokeW: 0 } }),
      }, s)
    );
  }
  root.appendChild(stickers);
  root.appendChild(h('p', { class: 'hint' }, 'Двойной клик по тексту на таймлайне — быстрое редактирование. Текст можно перетаскивать прямо по превью.'));
}

/* ---------- ФИЛЬТРЫ ---------- */

function renderFiltersPanel(root) {
  const sel = selectedClip();
  root.appendChild(h('div', { class: 'panel-head' },
    h('h3', {}, 'Фильтры'),
    h('label', { class: 'switch' },
      h('input', {
        type: 'checkbox', checked: state.filterTargetAll,
        onchange: (e) => { state.filterTargetAll = e.target.checked; },
      }),
      h('span', {}, 'на все клипы')
    )
  ));

  const grid = h('div', { class: 'filter-grid' });
  for (const f of FILTERS) {
    const active = sel && !state.filterTargetAll && sel.filter === f.id;
    const card = h('button', {
      class: 'filter-card' + (active ? ' on' : ''),
      title: f.name,
      onclick: () => applyFilter(f.id),
    },
      h('div', {
        class: 'filter-sample',
        style: {
          filter: f.css || 'none',
          background: 'linear-gradient(140deg,#ff9a3c 0%,#ff4d6d 38%,#7b5cff 72%,#22d3ee 100%)',
        },
      }),
      h('span', {}, f.name)
    );
    grid.appendChild(card);
  }
  root.appendChild(grid);

  if (sel && sel.track !== 'text') {
    root.appendChild(h('div', { class: 'section-title' }, 'Коррекция'));
    root.appendChild(sliderRow('Яркость', sel.adj.b, 30, 200, 1, (v) => { sel.adj.b = v; markDirty(); redraw(); }, (v) => v + '%'));
    root.appendChild(sliderRow('Контраст', sel.adj.c, 30, 200, 1, (v) => { sel.adj.c = v; markDirty(); redraw(); }, (v) => v + '%'));
    root.appendChild(sliderRow('Насыщенность', sel.adj.s, 0, 250, 1, (v) => { sel.adj.s = v; markDirty(); redraw(); }, (v) => v + '%'));
  } else {
    root.appendChild(h('p', { class: 'hint' }, 'Выберите клип на таймлайне, чтобы применить фильтр.'));
  }
}

function applyFilter(id) {
  const targets = state.filterTargetAll
    ? state.project.clips.filter((c) => c.track !== 'text')
    : [selectedClip()].filter(Boolean);
  if (!targets.length) return toast('Сначала выберите клип', 'warn');
  commit(() => {
    for (const c of targets) c.filter = id;
  });
  refreshPanel();
}

/* ---------- ПЕРЕХОДЫ ---------- */

function renderTransitionsPanel(root) {
  const sel = selectedClip();
  root.appendChild(h('div', { class: 'panel-head' }, h('h3', {}, 'Переходы')));

  const list = h('div', { class: 'trans-list' });
  for (const t of TRANSITIONS) {
    const active = sel && sel.transition && sel.transition.type === t.id && sel.transition.dur > 0;
    list.appendChild(
      h('button', {
        class: 'trans-card' + (active ? ' on' : ''),
        onclick: () => applyTransition(t.id),
      },
        h('div', { class: 'trans-preview t-' + t.id },
          h('span', { class: 'ta' }), h('span', { class: 'tb' })
        ),
        h('span', {}, t.name)
      )
    );
  }
  root.appendChild(list);

  if (sel && sel.transition && sel.transition.dur > 0) {
    root.appendChild(h('div', { class: 'section-title' }, 'Длительность перехода'));
    root.appendChild(
      sliderRow('', sel.transition.dur, 0.2, 2, 0.05, (v) => {
        sel.transition.dur = round(v, 2);
        markDirty();
        redraw();
      }, (v) => v.toFixed(2) + ' с')
    );
  }
  root.appendChild(h('p', { class: 'hint' }, 'Переход применяется к началу выбранного клипа — нужен предыдущий клип на той же дорожке.'));
}

function applyTransition(id) {
  const clip = selectedClip();
  if (!clip) return toast('Выберите клип на таймлайне', 'warn');
  const t = TRANSITIONS.find((x) => x.id === id);
  commit(() => {
    clip.transition = { type: id, dur: id === 'none' ? 0 : t.dur };
  });
  refreshPanel();
  refreshTimeline();
}

/* ---------- АУДИО ---------- */

function renderAudioPanel(root) {
  root.appendChild(h('div', { class: 'panel-head' }, h('h3', {}, 'Аудио')));

  root.appendChild(
    h('div', { class: 'row gap' },
      h('button', { class: 'btn block', id: 'btnRecord', onclick: (e) => toggleRecording(e.currentTarget) }, icon('mic', 16), 'Записать голос'),
      h('button', { class: 'btn', title: 'Импорт аудиофайла', onclick: () => $('#fileInput').click() }, icon('upload', 16))
    )
  );

  root.appendChild(h('div', { class: 'section-title' }, 'Библиотека эффектов'));
  const sfx = h('div', { class: 'sfx-grid' });
  for (const s of SFX_PRESETS) {
    sfx.appendChild(
      h('button', { class: 'sfx-card', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          await addSfx(s.id, s.name);
          toast('Эффект «' + s.name + '» добавлен', 'ok');
          refreshPanel();
        } catch (err) {
          toast('Не удалось создать эффект', 'err');
        }
        e.currentTarget.disabled = false;
      } },
        icon('audio', 18), h('span', {}, s.name), h('small', {}, s.desc)
      )
    );
  }
  root.appendChild(sfx);

  root.appendChild(h('div', { class: 'section-title' }, 'Звук проекта'));
  root.appendChild(
    sliderRow('Общая громкость', state.masterVolume * 100, 0, 100, 1, (v) => {
      state.masterVolume = v / 100;
      const inp = $('#masterVol');
      if (inp) inp.value = String(v);
      updateAudioGains(state.playhead);
    }, (v) => v + '%')
  );

  const audioMedia = Array.from(state.media.values()).filter((m) => m.type === 'audio');
  root.appendChild(h('div', { class: 'section-title' }, 'Мои аудиофайлы'));
  if (!audioMedia.length) {
    root.appendChild(h('p', { class: 'hint' }, 'Аудио пока нет: запишите голос, сгенерируйте эффект или импортируйте MP3/WAV.'));
  } else {
    const list = h('div', { class: 'audio-list' });
    for (const m of audioMedia) {
      list.appendChild(
        h('div', { class: 'audio-item' },
          icon('audio', 16),
          h('div', { class: 'audio-meta' }, h('span', {}, m.name), h('small', {}, fmtDur(m.duration || 0))),
          h('button', { class: 'mini', title: 'Добавить на дорожку аудио', onclick: () => addMediaToTimeline(m, 'audio') }, icon('plus', 14)),
          h('button', { class: 'mini danger', title: 'Удалить', onclick: () => removeMedia(m.id) }, icon('trash', 14))
        )
      );
    }
    root.appendChild(list);
  }
}

/* ---------- общий helper: строка со слайдером ---------- */

function sliderRow(label, value, min, max, step, onInput, format) {
  const out = h('span', { class: 'srow-val' }, format ? format(value) : String(value));
  const range = h('input', {
    type: 'range', min, max, step, value,
    oninput: (e) => {
      const v = parseFloat(e.target.value);
      out.textContent = format ? format(v) : String(v);
      onInput(v);
    },
  });
  return h('div', { class: 'srow' },
    label ? h('span', { class: 'srow-label' }, label) : null,
    range,
    out
  );
}

/* ---------- добавление текста ---------- */

function addTextClip(preset) {
  const tx = Object.assign(defaultText(), preset && preset.text ? preset.text : {});
  const start = round(state.playhead, 3);
  const clip = makeClip({ track: 'text', start, duration: 3, name: 'Текст', text: tx });
  commit(() => {
    state.project.clips.push(clip);
    state.selection = clip.id;
  });
  setTab('text');
  refreshInspector();
  toast('Текст добавлен', 'ok');
}
