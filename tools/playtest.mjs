// Нейросеть играет сама: node tools/playtest.mjs [--seconds 60] [--speed 4]
// Открывает index.html как игрок, начинает партию через window.__game, включает авто-игру с ускорением,
// снимает скриншоты на ПК и телефоне (вертикально и горизонтально), собирает ошибки и события.
// Итог: tools/out/report.json и картинки.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'out');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : def; };
const SECONDS = arg('seconds', 60);
const SPEED = arg('speed', 4);
const SHOTS = 5;

async function launch() {
  try { return await chromium.launch({ channel: 'chrome', headless: true }); } catch {}
  try { return await chromium.launch({ headless: true }); } catch {}
  console.error('Не нашла браузер: поставь Google Chrome или выполни npx playwright install chromium');
  process.exit(2);
}

// пустой экран: разброс яркости по скриншоту почти нулевой (по картинке, а не по canvas: так видно и HTML)
async function spread(page, file) {
  const data = fs.readFileSync(file).toString('base64');
  return page.evaluate(async src => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 160; c.height = 90;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 160, 90);
    const d = g.getImageData(0, 0, 160, 90).data;
    let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; s += y; s2 += y * y; n++; }
    const m = s / n;
    return Math.sqrt(Math.max(0, s2 / n - m * m));
  }, `data:image/png;base64,${data}`).catch(() => null);
}

const numbers = s => Object.fromEntries(Object.entries(s || {}).filter(([, v]) => typeof v === 'number'));

async function run(browser, label, contextOptions) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  const res = { label, errors, shots: [], states: [], events: {}, problems: [] };
  const shot = async name => { const p = path.join(OUT, `${label}_${name}.png`); await page.screenshot({ path: p }); res.shots.push(path.relative(ROOT, p)); return p; };

  await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await shot('0_open');
  const hasApi = await page.waitForFunction(() => !!window.__game, null, { timeout: 5000 }).then(() => true, () => false);
  let last = null;
  if (!hasApi) {
    res.problems.push('нет window.__game: проверки не могут играть (docs/test-api.md)');
  } else {
    let wall0 = Date.now();
    try {
      await page.evaluate(sp => { window.__game.start(); window.__game.setAuto(true); window.__game.setSpeed(sp); }, SPEED);
      wall0 = Date.now();
    } catch (e) { res.problems.push(`window.__game не отвечает: ${String(e.message || e).slice(0, 200)}`); }
    const first = await page.evaluate(() => window.__game.state()).catch(() => null);
    const step = (SECONDS / SPEED) * 1000 / SHOTS;
    for (let i = 1; i <= SHOTS; i++) {
      await page.waitForTimeout(step);
      try { res.states.push(await page.evaluate(() => window.__game.state())); } catch (e) { res.problems.push(`state() упал: ${String(e.message || e).slice(0, 160)}`); }
      await shot(String(i));
    }
    try {
      res.events = await page.evaluate(() => {
        const out = {};
        for (const e of window.__game.events || []) out[e.type] = (out[e.type] || 0) + 1;
        return out;
      });
    } catch {}
    last = res.states[res.states.length - 1] || null;
    const wallSec = (Date.now() - wall0) / 1000;
    if (!last || !Number.isFinite(Number(last.time))) res.problems.push(`state().time не число (time = ${last?.time})`);
    else if (Number(last.time) - Number(first?.time || 0) < wallSec * SPEED * 0.4 && last.scene !== 'over' && last.scene !== 'win')
      res.problems.push(`игровое время идёт медленно: за ${wallSec.toFixed(0)} с при ускорении ×${SPEED} прошло ${(Number(last.time) - Number(first?.time || 0)).toFixed(0)} игровых с (ускорение не работает или игра стоит)`);
    if (!Object.keys(res.events).length) res.problems.push('за партию в авто-режиме не случилось ни одного события (events пустой)');
    const a = JSON.stringify(numbers(first)), b = JSON.stringify(numbers(last));
    if (a === b) res.problems.push('за партию в авто-режиме ни одно число в state() не поменялось: бот стоит');
  }
  const sp = res.shots.length ? await spread(page, path.join(ROOT, res.shots[res.shots.length - 1])) : null;
  if (sp !== null && sp < 3) res.problems.push('на экране пусто: картинка однотонная');
  if (errors.length) res.problems.unshift(`ошибки в консоли: ${[...new Set(errors)].slice(0, 3).join(' | ')}`);
  res.last = last;
  await ctx.close();
  return res;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const results = [
  await run(browser, 'pc', { viewport: { width: 1280, height: 720 } }),
  await run(browser, 'phone', { viewport: { width: 390, height: 844 }, ...phone }),
  await run(browser, 'phone_wide', { viewport: { width: 844, height: 390 }, ...phone }),
];
await browser.close();
const report = { when: new Date().toISOString(), seconds: SECONDS, speed: SPEED, results, problems: results.flatMap(r => r.problems.map(p => `${r.label}: ${p}`)) };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
for (const r of results) console.log(`${r.label}: состояние ${JSON.stringify(r.last)}, события ${JSON.stringify(r.events)}`);
console.log(report.problems.length ? `ПРОБЛЕМЫ:\n- ${report.problems.join('\n- ')}` : 'Проблем не видно');
console.log(`Скриншоты: ${results.flatMap(r => r.shots).join(', ')}`);
console.log('Телефон снят в двух положениях: смотри то, как держат телефон по docs/game.md.');
