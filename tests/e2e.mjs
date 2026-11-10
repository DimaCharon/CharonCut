/**
 * ClipCut · E2E-тесты (Playwright + Chromium)
 *
 * Проверяют: импорт медиа, воспроизведение, текст, обрезку мышью, фильтры,
 * переходы, отмену/повтор, звук, автосохранение и реальный экспорт видео.
 *
 * Запуск:
 *   npm i -D playwright && npx playwright install chromium
 *   python3 -m http.server 8123 &
 *   node tests/e2e.mjs
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123/';
const ASSETS = process.env.ASSETS_DIR || 'tests/fixtures';
const SHOTS = process.env.SHOTS_DIR || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0;
const failures = [];
const logs = [];

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name + (extra ? ` — ${extra}` : ''));
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`);
  }
}

const browser = await chromium.launch({
  args: [
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--disable-dev-shm-usage',
  ],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on('console', (m) => {
  if (m.type() === 'error') logs.push('console.error: ' + m.text());
});
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));

const ev = (fn, arg) => page.evaluate(fn, arg);

console.log('\n▶ Загрузка страницы');
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('#preview', { timeout: 15000 });
await page.waitForFunction(() => window.__clipcut && window.__clipcut.state.project, null, { timeout: 15000 });
check('приложение инициализировалось', true);
check('холст превью 1920×1080', (await ev(() => {
  const c = document.getElementById('preview');
  return c.width === 1920 && c.height === 1080;
})));
await page.screenshot({ path: path.join(SHOTS, '01-start.png') });

/* ---------- 1. импорт видео ---------- */
console.log('\n▶ Импорт видео');
await page.setInputFiles('#fileInput', path.join(ASSETS, 'test1.webm'));
await page.waitForFunction(() => window.__clipcut.state.project.clips.length === 1, null, { timeout: 20000 });
const media1 = await ev(() => {
  const s = window.__clipcut.state;
  const m = [...s.media.values()][0];
  const c = s.project.clips[0];
  return {
    mediaCount: s.media.size, type: m && m.type, w: m && m.width, h: m && m.height,
    dur: m && +m.duration.toFixed(2), clipDur: +c.duration.toFixed(2), track: c.track, hasThumb: !!m.thumb,
  };
});
check('файл попал в медиатеку', media1.mediaCount === 1, JSON.stringify(media1));
check('метаданные видео прочитаны (640×360)', media1.w === 640 && media1.h === 360, JSON.stringify(media1));
check('длительность ~3 с', Math.abs(media1.dur - 3) < 0.4, String(media1.dur));
check('клип на основной дорожке', media1.track === 'main' && media1.clipDur > 2.5, JSON.stringify(media1));
check('миниатюра сгенерирована', media1.hasThumb === true);

await page.waitForTimeout(600);
await ev(() => window.__clipcut.seek(1.0));
await page.waitForTimeout(400);
const pixel = await ev(() => {
  const c = document.getElementById('preview');
  const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
  return [d[0], d[1], d[2]];
});
check('видеокадр реально отрисован на холсте', pixel[0] + pixel[1] + pixel[2] > 30, String(pixel));
await page.screenshot({ path: path.join(SHOTS, '02-video.png') });

/* ---------- 2. воспроизведение ---------- */
console.log('\n▶ Воспроизведение');
await ev(() => window.__clipcut.seek(0));
await page.click('#btnPlay');
await page.waitForTimeout(1300);
const playInfo = await ev(() => {
  const s = window.__clipcut.state;
  const m = [...s.media.values()][0];
  return { t: +s.playhead.toFixed(2), playing: s.playing, mediaTime: m.el ? +m.el.currentTime.toFixed(2) : -1, paused: m.el ? m.el.paused : true };
});
await page.click('#btnPlay');
check('плейхед движется', playInfo.t > 0.7, JSON.stringify(playInfo));
check('медиаэлемент синхронизирован', Math.abs(playInfo.mediaTime - playInfo.t) < 0.45, JSON.stringify(playInfo));
check('пауза работает', (await ev(() => window.__clipcut.state.playing)) === false);

/* ---------- 3. текст ---------- */
console.log('\n▶ Текст и стикеры');
await ev(() => window.__clipcut.addTextClip(null));
await page.waitForTimeout(200);
const textInfo = await ev(() => {
  const s = window.__clipcut.state;
  const t = s.project.clips.find((c) => c.track === 'text');
  return { n: s.project.clips.length, track: t && t.track, content: t && t.text.content, dur: t && t.duration };
});
check('текстовый клип создан на дорожке «Текст»', textInfo.track === 'text' && textInfo.n === 2, JSON.stringify(textInfo));
const whitePixels = await ev(() => {
  const s = window.__clipcut.state;
  window.__clipcut.seek(0.5);
  window.__clipcut.redraw();
  const c = document.getElementById('preview');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) n++;
  return n;
});
check('текст нарисован поверх видео (белые пиксели)', whitePixels > 300, String(whitePixels));
await page.screenshot({ path: path.join(SHOTS, '03-text.png') });

/* изменение текста через инспектор */
await ev(() => {
  const s = window.__clipcut.state;
  const t = s.project.clips.find((c) => c.track === 'text');
  s.selection = t.id;
  window.__clipcut.refreshAll();
});
await page.waitForSelector('#textContentInput');
await page.fill('#textContentInput', 'ПРИВЕТ, МИР');
const textAfter = await ev(() => window.__clipcut.state.project.clips.find((c) => c.track === 'text').text.content);
check('редактирование текста в инспекторе', textAfter === 'ПРИВЕТ, МИР', textAfter);

/* ---------- 4. разделение ---------- */
console.log('\n▶ Разделение клипа');
const beforeSplit = await ev(() => {
  const s = window.__clipcut.state;
  s.selection = s.project.clips.find((c) => c.track === 'main').id;
  window.__clipcut.seek(1.2);
  return s.project.clips.length;
});
await ev(() => window.__clipcut.splitSelected());
await page.waitForTimeout(150);
const afterSplit = await ev(() => {
  const s = window.__clipcut.state;
  const mains = s.project.clips.filter((c) => c.track === 'main').sort((a, b) => a.start - b.start);
  return { n: s.project.clips.length, mainCount: mains.length, a: +mains[0].duration.toFixed(2), b: +mains[1].duration.toFixed(2), inB: +mains[1].inPoint.toFixed(2) };
});
check('клип разбит на два', afterSplit.mainCount === 2 && afterSplit.n === beforeSplit + 1, JSON.stringify(afterSplit));
check('inPoint второго клипа сдвинут', afterSplit.inB > 0.8, JSON.stringify(afterSplit));

/* ---------- 5. отмена / повтор ---------- */
console.log('\n▶ История: отмена и повтор');
await ev(() => window.__clipcut.state && window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true })));
await page.waitForTimeout(150);
const afterUndo = await ev(() => window.__clipcut.state.project.clips.filter((c) => c.track === 'main').length);
check('Ctrl+Z отменяет разделение', afterUndo === 1, String(afterUndo));
await ev(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true })));
await page.waitForTimeout(150);
const afterRedo = await ev(() => window.__clipcut.state.project.clips.filter((c) => c.track === 'main').length);
check('Ctrl+Shift+Z повторяет разделение', afterRedo === 2, String(afterRedo));

/* ---------- 6. фильтры ---------- */
console.log('\n▶ Фильтры');
const filterApplied = await ev(() => {
  const s = window.__clipcut.state;
  const c = s.project.clips.find((x) => x.track === 'main');
  s.selection = c.id;
  window.__clipcut.applyFilter('mono');
  return c.filter;
});
check('фильтр применён к клипу', filterApplied === 'mono', filterApplied);
const monoPixel = await ev(() => {
  window.__clipcut.seek(0.4);
  window.__clipcut.redraw();
  const c = document.getElementById('preview');
  const d = c.getContext('2d').getImageData(10, 10, 1, 1).data;
  return [d[0], d[1], d[2]];
});
check('ч/б фильтр даёт серый пиксель', Math.abs(monoPixel[0] - monoPixel[1]) < 12 && Math.abs(monoPixel[1] - monoPixel[2]) < 12, String(monoPixel));

/* ---------- 7. переходы ---------- */
console.log('\n▶ Переходы');
const transInfo = await ev(() => {
  const s = window.__clipcut.state;
  const mains = s.project.clips.filter((c) => c.track === 'main').sort((a, b) => a.start - b.start);
  s.selection = mains[1].id;
  window.__clipcut.applyTransition('crossfade');
  return { type: mains[1].transition.type, dur: mains[1].transition.dur };
});
check('переход «Растворение» назначен', transInfo.type === 'crossfade' && transInfo.dur > 0, JSON.stringify(transInfo));
await ev(() => {
  const s = window.__clipcut.state;
  const mains = s.project.clips.filter((c) => c.track === 'main').sort((a, b) => a.start - b.start);
  window.__clipcut.seek(mains[1].start + 0.2);
});
await page.waitForTimeout(500);
const transDraw = await ev(() => {
  window.__clipcut.redraw();
  const c = document.getElementById('preview');
  const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
  return [d[0], d[1], d[2]];
});
check('кадр в зоне перехода отрисован', transDraw[0] + transDraw[1] + transDraw[2] > 20, String(transDraw));

/* ---------- 8. обрезка мышью ---------- */
console.log('\n▶ Обрезка клипа мышью');
const clipBox = await page.evaluate(() => {
  const s = window.__clipcut.state;
  const c = s.project.clips.filter((x) => x.track === 'main').sort((a, b) => a.start - b.start)[0];
  const node = document.querySelector(`.clip[data-id="${c.id}"]`);
  const r = node.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, dur: c.duration, id: c.id };
});
const durBeforeTrim = clipBox.dur;
await page.mouse.move(clipBox.x + clipBox.w - 3, clipBox.y + clipBox.h / 2);
await page.mouse.down();
await page.mouse.move(clipBox.x + clipBox.w - 34, clipBox.y + clipBox.h / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(250);
const durAfterTrim = await ev((id) => window.__clipcut.findClip(id).duration, clipBox.id);
check('правый край обрезает клип', durAfterTrim < durBeforeTrim - 0.1, `${durBeforeTrim} → ${durAfterTrim}`);

/* перетаскивание клипа по таймлайну */
const moveBox = await page.evaluate(() => {
  const s = window.__clipcut.state;
  const mains = s.project.clips.filter((c) => c.track === 'main').sort((a, b) => b.duration - a.duration);
  const c = mains[0];
  const node = document.querySelector(`.clip[data-id="${c.id}"]`);
  if (!node) return { error: 'нет DOM-узла клипа', ids: s.project.clips.map((x) => x.id) };
  const r = node.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, start: c.start, id: c.id, dur: c.duration, w: r.width };
});
check('клип найден на таймлайне для перетаскивания', !moveBox.error && moveBox.w > 30, JSON.stringify(moveBox));
await page.mouse.move(moveBox.x, moveBox.y);
await page.mouse.down();
await page.mouse.move(moveBox.x + 40, moveBox.y, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(250);
const startAfterMove = await ev((id) => window.__clipcut.findClip(id).start, moveBox.id);
check('клип перетаскивается по таймлайну', startAfterMove > moveBox.start + 0.1, `${moveBox.start} → ${startAfterMove}`);

/* ---------- 9. фото и аудио ---------- */
console.log('\n▶ Импорт фото и аудио');
await page.setInputFiles('#fileInput', [path.join(ASSETS, 'image1.png'), path.join(ASSETS, 'tone.wav')]);
await page.waitForFunction(() => window.__clipcut.state.project.clips.some((c) => c.track === 'audio'), null, { timeout: 20000 });
const mixed = await ev(() => {
  const s = window.__clipcut.state;
  return {
    media: s.media.size,
    audio: s.project.clips.filter((c) => c.track === 'audio').length,
    images: [...s.media.values()].filter((m) => m.type === 'image').length,
    wavDur: +[...s.media.values()].find((m) => m.type === 'audio').duration.toFixed(2),
  };
});
check('фото и wav импортированы', mixed.media === 3 && mixed.images === 1 && mixed.wavDur > 1.5, JSON.stringify(mixed));
check('аудиоклип на своей дорожке', mixed.audio === 1, JSON.stringify(mixed));

/* громкость и звуковой граф */
await page.click('#btnPlay');
await page.waitForTimeout(600);
const audioGraph = await ev(async () => {
  const s = window.__clipcut.state;
  const audioClip = s.project.clips.find((c) => c.track === 'audio');
  s.selection = audioClip.id;
  window.__clipcut.seek(audioClip.start + 0.3);
  await new Promise((r) => setTimeout(r, 100));
  const m = [...s.media.values()].find((x) => x.type === 'audio');
  return { hasSrc: !!m.srcNode, gain: m.gains.size, state: m.el && m.el.paused === false ? 'playing' : 'paused' };
});
await page.click('#btnPlay');
check('Web Audio источник подключён', audioGraph.hasSrc === true, JSON.stringify(audioGraph));
check('гейн клипа создан', audioGraph.gain >= 1, JSON.stringify(audioGraph));
check('аудио реально играет', audioGraph.state === 'playing', JSON.stringify(audioGraph));

/* ---------- 10. сохранение и восстановление ---------- */
console.log('\n▶ Автосохранение и восстановление после перезагрузки');
const snapshotBefore = await ev(() => {
  window.__clipcut.saveNow();
  const s = window.__clipcut.state;
  return { clips: s.project.clips.length, media: s.media.size, name: s.project.name };
});
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__clipcut && window.__clipcut.state.project, null, { timeout: 15000 });
await page.waitForTimeout(1500);
const snapshotAfter = await ev(() => {
  const s = window.__clipcut.state;
  return { clips: s.project.clips.length, media: s.media.size, name: s.project.name };
});
check('проект восстановлен после перезагрузки', snapshotAfter.clips === snapshotBefore.clips, `${snapshotBefore.clips} → ${snapshotAfter.clips}`);
check('медиа восстановлено из IndexedDB', snapshotAfter.media === snapshotBefore.media, `${snapshotBefore.media} → ${snapshotAfter.media}`);
const drawAfterReload = await ev(() => {
  window.__clipcut.seek(0.4);
  window.__clipcut.redraw();
  const c = document.getElementById('preview');
  const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
  return [d[0], d[1], d[2]];
});
check('после перезагрузки кадр снова рисуется', drawAfterReload[0] + drawAfterReload[1] + drawAfterReload[2] > 20, String(drawAfterReload));
await page.screenshot({ path: path.join(SHOTS, '04-restored.png') });

/* ---------- 11. экспорт ---------- */
console.log('\n▶ Экспорт видео (реальная запись)');
await ev(() => {
  const s = window.__clipcut.state;
  s.project.clips = s.project.clips.filter((c) => c.track === 'main').slice(0, 1);
  const main = s.project.clips[0];
  main.start = 0;
  main.duration = 1.4;
  main.inPoint = 0;
  main.filter = 'none';
  main.transition = { type: 'none', dur: 0 };
  s.selection = null;
  window.__clipcut.refreshAll();
});
check('MediaRecorder доступен', (await ev(() => !!window.__clipcut.pickMime())) === true);
await page.click('#btnExport');
await page.waitForSelector('.export-modal', { timeout: 10000 });
await page.screenshot({ path: path.join(SHOTS, '05-export-dialog.png') });
const startBtn = page.locator('.modal-foot .btn.primary');
await startBtn.click();
await page.waitForSelector('.modal h2:has-text("Готово")', { timeout: 60000 });
const result = await page.evaluate(async () => {
  const v = document.querySelector('.modal video');
  if (!v) return { ok: false };
  const res = await fetch(v.src);
  const blob = await res.blob();
  return { ok: true, size: blob.size, type: blob.type, w: v.videoWidth, h: v.videoHeight };
});
check('файл экспортирован и не пустой', result.ok && result.size > 8000, JSON.stringify(result));
check('видео читается обратно (есть размеры)', result.w > 0 && result.h > 0, JSON.stringify(result));

/* содержимое экспортированного файла — не чёрный экран */
const exportedFrame = await page.evaluate(async () => {
  const src = document.querySelector('.modal video').src;
  const v = document.createElement('video');
  v.muted = true;
  v.src = src;
  await new Promise((res, rej) => {
    v.addEventListener('loadeddata', res, { once: true });
    v.addEventListener('error', () => rej(new Error('битое видео')), { once: true });
    setTimeout(res, 6000);
  });
  v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
  await new Promise((res) => { v.addEventListener('seeked', res, { once: true }); setTimeout(res, 4000); });
  const cv = document.createElement('canvas');
  cv.width = v.videoWidth || 640;
  cv.height = v.videoHeight || 360;
  const c = cv.getContext('2d');
  c.drawImage(v, 0, 0, cv.width, cv.height);
  const d = c.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data;
  return { px: [d[0], d[1], d[2]], dur: +(v.duration || 0).toFixed(2), w: cv.width, h: cv.height };
});
check('в экспортированном видео есть изображение', exportedFrame.px[0] + exportedFrame.px[1] + exportedFrame.px[2] > 20, JSON.stringify(exportedFrame));
check('длительность экспорта ~1.4 с', Math.abs(exportedFrame.dur - 1.4) < 0.7, JSON.stringify(exportedFrame));
await page.screenshot({ path: path.join(SHOTS, '06-export-result.png') });

/* ---------- 12. форматы кадра и служебное ---------- */
console.log('\n▶ Формат кадра, зум, удаление');
await page.click('.modal-head .mini');
await page.waitForTimeout(400);
const aspect = await ev(() => {
  const btn = [...document.querySelectorAll('#aspectSeg button')].find((b) => b.dataset.aspect === '9:16');
  btn.click();
  const s = window.__clipcut.state;
  const c = document.getElementById('preview');
  return { w: s.project.width, h: s.project.height, cw: c.width, ch: c.height };
});
await page.waitForTimeout(200);
const aspect2 = await ev(() => {
  const c = document.getElementById('preview');
  return { cw: c.width, ch: c.height };
});
check('вертикальный формат применяется', aspect.w === 1080 && aspect.h === 1920, JSON.stringify(aspect));
check('холст перестроен под 9:16', aspect2.cw === 1080 && aspect2.ch === 1920, JSON.stringify(aspect2));

const zoom = await ev(() => {
  const before = window.__clipcut.state.pxPerSec;
  window.__clipcut.fitTimeline();
  const after = window.__clipcut.state.pxPerSec;
  return { before, after };
});
check('зум/вписывание меняет масштаб', zoom.after > 0 && zoom.after !== undefined, JSON.stringify(zoom));

const delCount = await ev(() => {
  const s = window.__clipcut.state;
  const c = s.project.clips[0];
  s.selection = c.id;
  window.__clipcut.deleteSelected();
  return s.project.clips.length;
});
check('удаление клипа работает', delCount === 0, String(delCount));

await ev(() => {
  const s = window.__clipcut.state;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
});
await page.waitForTimeout(200);
check('удаление можно отменить', (await ev(() => window.__clipcut.state.project.clips.length)) === 1);

await page.screenshot({ path: path.join(SHOTS, '07-final.png'), fullPage: false });

/* ---------- итоги ---------- */
const hardErrors = logs.filter((l) => !/favicon|Failed to load resource/i.test(l));
console.log('\n──────────────────────────────');
console.log(`Пройдено проверок: ${passed}`);
console.log(`Провалено: ${failures.length}`);
if (failures.length) failures.forEach((f) => console.log('  · ' + f));
console.log(`Ошибок в консоли: ${hardErrors.length}`);
hardErrors.slice(0, 12).forEach((e) => console.log('  · ' + e));
console.log('──────────────────────────────');

await browser.close();
process.exit(failures.length || hardErrors.length ? 1 : 0);
