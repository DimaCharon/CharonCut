/**
 * ClipCut · визуальная проверка: собирает демо-проект и делает скриншоты.
 *   node tests/visual.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123/';
const ASSETS = process.env.ASSETS_DIR || 'tests/fixtures';
const OUT = process.env.SHOTS_DIR || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text()); });

await page.goto(BASE);
await page.waitForFunction(() => window.__clipcut);
await page.setInputFiles('#fileInput', [path.join(ASSETS, 'test1.webm'), path.join(ASSETS, 'test2.webm')]);
await page.waitForFunction(() => window.__clipcut.state.project.clips.length >= 2);
await page.waitForTimeout(1200);

/* собираем сцену: два клипа + переход, фото-наложение, текст, стикер, музыка */
await page.evaluate(() => {
  const s = window.__clipcut.state;
  const c = window.__clipcut;
  const mains = s.project.clips.filter((x) => x.track === 'main').sort((a, b) => a.start - b.start);
  mains[1].start = mains[0].start + mains[0].duration;
  mains[1].transition = { type: 'crossfade', dur: 0.7 };
  mains[1].filter = 'warm';
  s.selection = mains[1].id;
  c.refreshAll();
});

await page.evaluate(async () => {
  const c = window.__clipcut;
  await c.addTextClip({ text: { content: 'СНЯТО НА КАМЕРУ', size: 74, weight: 800, y: 0.16, color: '#ffffff', bgOpacity: 0.55 } });
});
await page.evaluate(async () => {
  const c = window.__clipcut;
  await c.addTextClip({ text: { content: 'ClipCut', size: 150, weight: 900, y: 0.74, color: '#22d3ee', shadow: true } });
});
await page.setInputFiles('#fileInput', path.join(ASSETS, 'tone.wav'));
await page.waitForTimeout(900);

await page.evaluate(() => {
  const s = window.__clipcut.state;
  const audio = s.project.clips.find((x) => x.track === 'audio');
  if (audio) { audio.start = 0; audio.duration = Math.min(audio.duration, 4); audio.volume = 0.8; audio.fadeIn = 0.6; audio.fadeOut = 1; }
  s.selection = s.project.clips.find((x) => x.track === 'main' && x.transition.type === 'crossfade')?.id || null;
  window.__clipcut.seek(1.9);
  window.__clipcut.refreshAll();
});
await page.waitForTimeout(900);
await page.evaluate(() => window.__clipcut.redraw());
await page.screenshot({ path: path.join(OUT, 'ui-full.png') });

/* отдельные кадры из холста */
const frames = [
  { name: 'frame-clip1', t: 0.8 },
  { name: 'frame-crossfade', t: 2.2 },
  { name: 'frame-clip2', t: 3.6 },
];
for (const f of frames) {
  await page.evaluate((t) => { window.__clipcut.seek(t); }, f.t);
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__clipcut.redraw());
  const data = await page.evaluate(() => document.getElementById('preview').toDataURL('image/png'));
  fs.writeFileSync(path.join(OUT, f.name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
}

/* вертикальный формат + другой стиль текста */
await page.evaluate(() => {
  const s = window.__clipcut.state;
  document.querySelector('#aspectSeg button[data-aspect="9:16"]').click();
  const txt = s.project.clips.filter((c) => c.track === 'text');
  if (txt[0]) { txt[0].text = Object.assign(txt[0].text, { content: 'REELS\n9:16', size: 130, y: 0.5, bgOpacity: 0 }); }
  if (txt[1]) { txt[1].text.y = 0.86; txt[1].text.size = 90; }
  window.__clipcut.seek(1.0);
  window.__clipcut.refreshAll();
});
await page.waitForTimeout(800);
await page.evaluate(() => window.__clipcut.redraw());
await page.screenshot({ path: path.join(OUT, 'ui-vertical.png') });
const vdata = await page.evaluate(() => document.getElementById('preview').toDataURL('image/png'));
fs.writeFileSync(path.join(OUT, 'frame-vertical.png'), Buffer.from(vdata.split(',')[1], 'base64'));

/* панели интерфейса крупным планом */
await page.evaluate(() => document.querySelector('#aspectSeg button[data-aspect="16:9"]').click());
await page.waitForTimeout(300);
for (const tab of ['media', 'text', 'filters', 'transitions', 'audio']) {
  await page.evaluate((t) => window.__clipcut.setTab(t), tab);
  await page.waitForTimeout(250);
  await page.locator('.left').screenshot({ path: path.join(OUT, `panel-${tab}.png`) });
}
await page.evaluate(() => window.__clipcut.setTab('media'));
await page.screenshot({ path: path.join(OUT, 'ui-final.png') });

/* мобильная раскладка */
await page.setViewportSize({ width: 414, height: 900 });
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, 'ui-mobile.png'), fullPage: false });

console.log('screenshots →', OUT);
await browser.close();
