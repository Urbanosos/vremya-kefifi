// Ночная смена: node tools/simulate.mjs [--runs 500] [--speed 20] [--max 1800] [--goal win] [--parallel 2]
// Игра сама играет много партий в авто-режиме с ускорением. Партия кончается на over или win, либо по --max игровых
// секунд. --goal: событие, которое считаем успехом (по умолчанию win). Итоги: docs/balance/sim-<дата>.{json,md}.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const RUNS = Number(arg('runs', 100));
const SPEED = Number(arg('speed', 20));
const MAX = Number(arg('max', 1800));
const GOAL = String(arg('goal', 'win'));
const PAR = Math.max(1, Number(arg('parallel', 1)));

async function launch() {
  try { return await chromium.launch({ channel: 'chrome', headless: true }); } catch {}
  return chromium.launch({ headless: true });
}

const browser = await launch();
const runs = [];
let next = 0;
const started = Date.now();

async function worker() {
  let page = null, used = 0;
  const fresh = async () => {
    if (page) await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__game, null, { timeout: 10000 });
    used = 0;
  };
  for (;;) {
    const i = next++;
    if (i >= RUNS) break;
    if (!page || used >= 25) await fresh();
    used++;
    const from = await page.evaluate(sp => {
      const g = window.__game;
      g.start(); g.setAuto(true); g.setSpeed(sp);
      return (g.events || []).length;
    }, SPEED);
    let s = {};
    const limit = Date.now() + (MAX / SPEED) * 1000 * 1.5 + 20000;
    for (;;) {
      await page.waitForTimeout(250);
      s = await page.evaluate(() => window.__game.state()).catch(() => ({}));
      if (s.scene === 'over' || s.scene === 'win' || Number(s.time) >= MAX || Date.now() > limit) break;
    }
    const ev = await page.evaluate(k => {
      const all = window.__game.events || [];
      return (all.length >= k ? all.slice(k) : all).map(e => ({ t: e.t, type: e.type, name: e.name, reason: e.reason }));
    }, from);
    const firstAt = {}, counts = {};
    for (const e of ev) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      if (!(e.type in firstAt) && Number.isFinite(Number(e.t))) firstAt[e.type] = Number(e.t);
    }
    const end = s.scene === 'win' || counts.win ? 'win' : s.scene === 'over' || counts.over ? 'over' : 'timeout';
    const finals = Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'number'));
    runs.push({
      end, time: Number(s.time) || null, goal: GOAL === 'win' ? end === 'win' : GOAL in counts,
      goalAt: GOAL === 'win' ? (end === 'win' ? Number(s.time) || firstAt.win || null : null) : firstAt[GOAL] ?? null,
      reason: ev.filter(e => e.type === 'over').map(e => e.reason).pop() ?? null,
      names: [...new Set(ev.filter(e => e.name != null).map(e => `${e.type}:${e.name}`))],
      counts, firstAt, finals,
    });
    if (runs.length % 25 === 0) console.log(`сыграно ${runs.length}/${RUNS}, ${Math.round((Date.now() - started) / 1000)} с`);
  }
  if (page) await page.close();
}

await Promise.all(Array.from({ length: PAR }, worker));
await browser.close();

const n = runs.length;
const median = a => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const share = k => (n ? k / n : 0);
const ends = { win: 0, over: 0, timeout: 0 };
for (const r of runs) ends[r.end]++;
const reasons = {};
for (const r of runs) if (r.end === 'over') reasons[r.reason ?? 'без причины'] = (reasons[r.reason ?? 'без причины'] || 0) + 1;
const types = [...new Set(runs.flatMap(r => Object.keys(r.counts)))];
const eventRows = types.map(t => ({
  type: t,
  runs: runs.filter(r => r.counts[t]).length,
  firstMedian: median(runs.map(r => r.firstAt[t])),
  countMedian: median(runs.filter(r => r.counts[t]).map(r => r.counts[t])),
})).sort((a, b) => (a.firstMedian ?? 1e9) - (b.firstMedian ?? 1e9));
const fields = [...new Set(runs.flatMap(r => Object.keys(r.finals)))];
const fieldRows = fields.map(f => { const m = median(runs.map(r => r.finals[f])); return { field: f, median: m === null ? null : Math.round(m * 10) / 10 }; });
// выборы (улучшения, постройки): доля успеха у тех, кто выбрал, и у тех, кто нет
const choiceRows = [...new Set(runs.flatMap(r => r.names))].map(name => {
  const withIt = runs.filter(r => r.names.includes(name)), without = runs.filter(r => !r.names.includes(name));
  return { name, picked: withIt.length, goalWith: withIt.filter(r => r.goal).length / withIt.length,
    goalWithout: without.length ? without.filter(r => r.goal).length / without.length : null };
}).sort((a, b) => b.goalWith - a.goalWith);
const summary = {
  when: new Date().toISOString(), runs: n, speed: SPEED, max: MAX, goal: GOAL,
  goalShare: share(runs.filter(r => r.goal).length), goalTimeMedian: median(runs.map(r => r.goalAt)),
  ends, overReasons: reasons, events: eventRows, finals: fieldRows, choices: choiceRows,
  minutes: +((Date.now() - started) / 60000).toFixed(1),
};
const dir = path.join(ROOT, 'docs', 'balance');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace(/[:T]/g, '-');
fs.writeFileSync(path.join(dir, `sim-${stamp}.json`), JSON.stringify({ summary, runs }, null, 1));
const pct = x => (x === null ? '-' : `${Math.round(x * 100)}%`);
const mmss = s => (s === null ? '-' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const md = [
  `# Симуляция ${stamp}: ${n} партий, ускорение ×${SPEED}, предел ${mmss(MAX)} игрового времени`, '',
  `Цель «${GOAL}»: дошли ${pct(summary.goalShare)} партий, медиана времени до цели ${mmss(summary.goalTimeMedian)}.`,
  `Победа ${pct(share(ends.win))}, проигрыш ${pct(share(ends.over))}, не успели за предел ${pct(share(ends.timeout))}.`, '',
  '| Причина проигрыша | Партий |', '| --- | --- |',
  ...Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, c]) => `| ${k} | ${c} |`), '',
  '| Событие | В скольких партиях | Первый раз (медиана) | Раз за партию (медиана) |', '| --- | --- | --- | --- |',
  ...eventRows.map(e => `| ${e.type} | ${pct(share(e.runs))} | ${mmss(e.firstMedian)} | ${e.countMedian ?? '-'} |`), '',
  `| Выбор | Брали | Цель с ним | Цель без него |`, '| --- | --- | --- | --- |',
  ...choiceRows.slice(0, 30).map(u => `| ${u.name} | ${u.picked} | ${pct(u.goalWith)} | ${pct(u.goalWithout)} |`), '',
  '| Поле state() в конце | Медиана |', '| --- | --- |',
  ...fieldRows.map(f => `| ${f.field} | ${f.median ?? '-'} |`), '',
  `Прогон занял ${summary.minutes} мин.`,
].join('\n');
fs.writeFileSync(path.join(dir, `sim-${stamp}.md`), md);
console.log(md);
