/* Мобильный E2E на эмуляции сенсорного экрана Chromium. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
const base = process.env.BASE_URL || 'http://127.0.0.1:8123/';
const assets = process.env.ASSETS_DIR || 'tests/fixtures';
const shots = process.env.SHOTS_DIR || '/tmp/shots';
fs.mkdirSync(shots, {recursive: true});
const browser = await chromium.launch({args: ['--no-sandbox','--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage']});
const context = await browser.newContext({viewport:{width:390,height:844}, deviceScaleFactor: 1, isMobile: true, hasTouch: true});
const page = await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto(base);
await page.waitForFunction(()=>window.__clipcut?.state.project);
await page.waitForTimeout(400);
for (const sel of ['.brand','#btnExport','.stage-wrap','.timeline','#mobileLibrary','#mobileInspector','#panelBody']) {
  const rect=await page.locator(sel).boundingBox();
  assert(rect && rect.x>=-1 && rect.y>=-1 && rect.x+rect.width<=391 && rect.y+rect.height<=845, `${sel} вне экрана: ${JSON.stringify(rect)}`);
}
assert((await page.title()).includes('CharonCut'));
await page.screenshot({path:path.join(shots,'charon-mobile-empty.png')});
await page.setInputFiles('#fileInput',path.join(assets,'test1.webm'));
await page.waitForFunction(()=>window.__clipcut.state.project.clips.length===1,{timeout:20000});
await page.waitForTimeout(400);
const original = await page.evaluate(()=>window.__clipcut.state.project.clips[0].duration);
assert(original>2.5);
const clip=page.locator('.tl-track[data-track=main] .clip').first();
await clip.tap({position:{x:50,y:15}});
await page.locator('#mobileInspector').tap();
assert(await page.locator('#inspector').isVisible());
assert((await page.locator('#inspector').innerText()).toLowerCase().includes('скорость'));
await page.screenshot({path:path.join(shots,'charon-mobile-edit.png')});
// Перетаскивание правого края клипа настоящими touch-событиями через CDP.
const b=await clip.boundingBox();
const cdp=await context.newCDPSession(page);
async function touch(type,x,y) {await cdp.send('Input.dispatchTouchEvent',{type,touchPoints: type==='touchEnd'?[]:[{x,y,id:1}]});}
await touch('touchStart',b.x+b.width-5,b.y+b.height/2);
for(let i=1;i<=10;i++) await touch('touchMove',b.x+b.width-5-35*i/10,b.y+b.height/2);
await touch('touchEnd',0,0);
await page.waitForTimeout(250);
const trimmed=await page.evaluate(()=>window.__clipcut.state.project.clips[0].duration);
assert(trimmed<original-0.3,`Обрезка пальцем не сработала: ${original} -> ${trimmed}`);
// Касание линейки, затем разделение кнопкой.
const ruler=await page.locator('#tlRuler').boundingBox();
await page.touchscreen.tap(ruler.x+55,ruler.y+10);
await page.locator('#tlSplit').tap();
assert.equal(await page.evaluate(()=>window.__clipcut.state.project.clips.length),2);
await page.locator('#mobileLibrary').tap();
await page.locator('#tabs [data-tab=text]').tap();
await page.locator('#panelBody .btn.primary').first().tap();
await page.locator('#mobileInspector').tap();
await page.locator('#textContentInput').fill('Привет, CharonCut!');
assert.equal(await page.evaluate(()=>window.__clipcut.state.project.clips.find(c=>c.track==='text').text.content),'Привет, CharonCut!');
await page.locator('#btnPlay').tap();
await page.waitForTimeout(400);
assert(await page.evaluate(()=>window.__clipcut.state.playing));
await page.locator('#btnPlay').tap();
await page.locator('#btnExport').tap();
await page.locator('.modal-foot .btn.primary').tap();
await page.waitForSelector('.modal h2:has-text("Готово")',{timeout:60000});
const blob=await page.evaluate(async()=>{const v=document.querySelector('.modal video'); const b=await (await fetch(v.src)).blob();return {size:b.size,w:v.videoWidth};});
assert(blob.size>8000 && blob.w>0,JSON.stringify(blob));
await page.screenshot({path:path.join(shots,'charon-mobile-export.png')});
assert.equal(errors.length,0,errors.join('\n'));
await page.locator('.modal-head .mini').tap();
await page.setViewportSize({width:320,height:667});
await page.waitForTimeout(400);
for (const sel of ['#btnExport','.stage-wrap','.timeline','#mobileInspector']) {
  const r=await page.locator(sel).boundingBox();
  assert(r && r.x>=-1 && r.x+r.width<=321 && r.y+r.height<=668,`${sel}: ${JSON.stringify(r)}`);
}
await page.screenshot({path:path.join(shots,'charon-mobile-small.png')});
console.log('Мобильный тест: импорт, касание, обрезка, разделение, текст, воспроизведение, экспорт и 320/390 px — OK');
await browser.close();
