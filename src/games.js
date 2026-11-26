// Kefifi's mini-games: dance (arrows in rhythm), cooking (burger in the right order), letters (word against the clock).
// Each game draws itself into #mg, is driven by game time (so setSpeed works) and can be played by the bot.
window.Mini = (function () {
  let el, game = null, onEnd = null;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function init() { el = document.getElementById('mg'); }

  function start(name, cb) {
    onEnd = cb;
    el.innerHTML = ''; el.className = 'mg-' + name; el.classList.remove('hidden');
    game = { dance: Dance, cook: Cook, letters: Letters }[name];
    game.start();
    Game.event('mini_start', { name });
  }

  function finish(win, info) {
    const g = game; game = null;
    const card = document.createElement('div');
    card.className = 'mg-result ' + (win ? 'win' : 'lose');
    card.innerHTML = `<div>${win ? 'Получилось!' : 'Не получилось…'}</div><small>${info || ''}</small>`;
    el.appendChild(card);
    win ? Sfx.win() : Sfx.lose();
    let t = 0;
    finishing = { left: 1.4, cb: () => { el.classList.add('hidden'); el.innerHTML = ''; const cb = onEnd; onEnd = null; cb && cb(win); } };
  }
  let finishing = null;

  function update(dt, auto) {
    if (finishing) { finishing.left -= dt; if (finishing.left <= 0) { const f = finishing; finishing = null; f.cb(); } return; }
    if (game) game.update(dt, auto);
  }
  function key(e) { if (game && game.key) return game.key(e); return false; }
  const active = () => !!game || !!finishing;

  function h(tag, cls, html, parent) {
    const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; (parent || el).appendChild(d); return d;
  }

  // ======================= DANCE =======================
  const LANES = [
    { key: 'left', arrow: '←', codes: ['ArrowLeft', 'KeyA'], color: '#c78bff' },
    { key: 'down', arrow: '↓', codes: ['ArrowDown', 'KeyS'], color: '#6fd3ff' },
    { key: 'up', arrow: '↑', codes: ['ArrowUp', 'KeyW'], color: '#7fdc9a' },
    { key: 'right', arrow: '→', codes: ['ArrowRight', 'KeyD'], color: '#ff7fa8' },
  ];
  const Dance = {
    start() {
      const C = CFG.dance;
      this.t = -1.0; this.beat = 60 / C.bpm; this.hits = 0; this.lastBeat = -1; this.pose = null; this.poseT = 0;
      this.notes = [];
      let lane = 0;
      for (let i = 0; i < C.notes; i++) {
        lane = Math.random() < 0.35 ? lane : Math.floor(Math.random() * 4);
        this.notes.push({ time: 1.5 + i * this.beat, lane, state: 'wait', cued: false });
      }
      this.end = this.notes[this.notes.length - 1].time + 1.0;
      h('div', 'mg-title', 'Танцуй с Кэфифи! Жми стрелку, когда она долетит до верхней рамки.');
      const stage = h('div', 'dance-stage');
      this.kef = h('img', 'dance-kef', null, stage);
      this.frames = (window.KEFIFI_DANCE && window.KEFIFI_DANCE.length) ? window.KEFIFI_DANCE : [window.KEFIFI_IMG.happy];
      this.frame = -1;
      const board = h('div', 'dance-board', null, stage);
      this.lanesEl = LANES.map(L => {
        const lane = h('div', 'lane', null, board);
        h('div', 'target', L.arrow, lane).style.borderColor = L.color;
        return lane;
      });
      this.scoreEl = h('div', 'mg-score', '');
      this.judgeEl = h('div', 'judge', '', stage);
      const pad = h('div', 'pad');
      LANES.forEach((L, i) => {
        const b = h('div', 'padbtn', L.arrow, pad); b.style.background = L.color;
        const press = e => { e.preventDefault(); this.press(i); };
        b.addEventListener('touchstart', press, { passive: false }); b.addEventListener('mousedown', press);
      });
      this.notes.forEach(n => { n.el = h('div', 'note', LANES[n.lane].arrow, this.lanesEl[n.lane]); n.el.style.color = LANES[n.lane].color; });
      this.renderScore();
    },
    renderScore() {
      this.scoreEl.textContent = `Совпадений: ${this.hits} из ${this.notes.length} · нужно ${Math.ceil(this.notes.length * CFG.dance.winShare)}`;
    },
    press(lane) {
      const C = CFG.dance;
      const lanePress = this.lanesEl[lane].querySelector('.target');
      lanePress.classList.add('pressed'); setTimeout(() => lanePress.classList.remove('pressed'), 90);
      let best = null;
      for (const n of this.notes) if (n.state === 'wait' && n.lane === lane && Math.abs(n.time - this.t) <= C.good) {
        if (!best || Math.abs(n.time - this.t) < Math.abs(best.time - this.t)) best = n;
      }
      if (!best) { this.judge('Мимо', '#ff6b81'); return; }
      const off = Math.abs(best.time - this.t);
      best.state = 'hit'; best.el.remove(); this.hits++;
      this.judge(off <= C.perfect ? 'Супер!' : 'Хорошо', off <= C.perfect ? '#7fdc9a' : '#ffd166');
      Sfx.good(); this.renderScore();
    },
    judge(text, color) { this.judgeEl.textContent = text; this.judgeEl.style.color = color; this.judgeEl.classList.remove('pop'); void this.judgeEl.offsetWidth; this.judgeEl.classList.add('pop'); },
    update(dt, auto) {
      const C = CFG.dance;
      this.t += dt;
      const b = Math.floor((this.t - 1.5) / this.beat);
      if (b !== this.lastBeat && this.t >= 1.5 && this.t < this.end) { this.lastBeat = b; b % 2 ? Sfx.snare() : Sfx.kick(); Sfx.hat(); }
      for (const n of this.notes) {
        if (n.state !== 'wait') continue;
        const k = (n.time - this.t) / C.travel; // 1 = bottom, 0 = target line
        n.el.style.top = `calc(${(k * 100).toFixed(2)}% + 6px)`;
        n.el.style.display = k > 1.05 ? 'none' : 'block';
        // she shows the move a bit before you press it
        if (!n.cued && n.time - this.t < this.beat * 0.6) { n.cued = true; this.pose = LANES[n.lane].key; this.poseT = this.beat * 0.9; }
        if (this.t - n.time > C.good) { n.state = 'miss'; n.el.classList.add('missed'); setTimeout(() => n.el.remove(), 200); this.judge('Мимо', '#ff6b81'); }
        if (auto && !n.botDone && this.t >= n.time - 0.03) {
          n.botDone = true;
          if (Math.random() < CFG.bot.skill) this.press(n.lane);
        }
      }
      this.poseT -= dt; if (this.poseT <= 0) this.pose = null;
      // she dances like in the video; the animation speed follows the song tempo
      const f = Math.floor(Math.max(0, this.t) * 6 * C.bpm / 100) % this.frames.length;
      if (f !== this.frame) { this.frame = f; this.kef.src = this.frames[f]; }
      const lean = { left: 'translateX(-6%)', right: 'translateX(6%)', up: 'translateY(-6%)', down: 'translateY(4%)' };
      this.kef.style.transform = this.pose ? lean[this.pose] : '';
      if (this.t >= this.end) {
        const need = Math.ceil(this.notes.length * C.winShare);
        finish(this.hits >= need, `Совпадений: ${this.hits} из ${this.notes.length}`);
      }
    },
    key(e) {
      const i = LANES.findIndex(L => L.codes.includes(e.code));
      if (i >= 0) { this.press(i); return true; }
      return false;
    },
  };

  // ======================= COOK =======================
  const ING = [
    { id: 'bunB', name: 'Булка (низ)', color: '#e9a55b', h: 16, r: '40% 40% 10px 10px' },
    { id: 'patty', name: 'Котлета', color: '#7a4a2e', h: 14, r: '10px' },
    { id: 'cheese', name: 'Сыр', color: '#ffd23f', h: 7, r: '3px' },
    { id: 'salad', name: 'Салат', color: '#6cc25a', h: 8, r: '12px' },
    { id: 'tomato', name: 'Помидор', color: '#ff5a4f', h: 8, r: '8px' },
    { id: 'bunT', name: 'Булка (верх)', color: '#f0b464', h: 22, r: '50% 50% 8px 8px' },
  ];
  const ingById = id => ING.find(i => i.id === id);
  function layer(id, wide) {
    const I = ingById(id);
    const d = document.createElement('div'); d.className = 'layer';
    d.style.background = I.color; d.style.height = (I.h * (wide ? 1.4 : 1)) + 'px'; d.style.borderRadius = I.r;
    if (id === 'bunT') d.innerHTML = '<i></i><i></i><i></i>';
    return d;
  }
  const Cook = {
    start() {
      this.idx = 0; this.mistakes = 0;
      h('div', 'mg-title', 'Готовим бургеры! Собери бургер в том же порядке, что на заказе Кэфифи: снизу вверх.');
      const row = h('div', 'cook-row');
      const orderBox = h('div', 'order', '<b>Заказ Кэфифи</b>', row);
      this.orderEl = h('div', 'stack', null, orderBox);
      const plateBox = h('div', 'plate', '<b>Твой бургер</b>', row);
      this.plateEl = h('div', 'stack big', null, plateBox);
      this.info = h('div', 'mg-score', '');
      this.timerEl = h('div', 'timer', '<div></div>').firstChild;
      const btns = h('div', 'ingbtns');
      this.btns = ING.map((I, i) => {
        const b = h('div', 'ingbtn', '', btns);
        b.appendChild(layer(I.id)); h('span', null, `${i + 1}. ${I.name}`, b);
        b.addEventListener('click', () => this.add(I.id));
        return b;
      });
      this.next();
    },
    next() {
      const n = CFG.cook.burgers[this.idx];
      const mid = ['patty', 'cheese', 'salad', 'tomato'];
      this.order = ['bunB'];
      for (let i = 0; i < n - 2; i++) this.order.push(i === 0 ? 'patty' : pick(mid));
      this.order.push('bunT');
      this.stack = []; this.left = CFG.cook.timePerBurger; this.botWait = rnd(CFG.bot.reactMin, CFG.bot.reactMax);
      this.orderEl.innerHTML = ''; this.order.slice().reverse().forEach(id => this.orderEl.appendChild(layer(id)));
      this.plateEl.innerHTML = '';
      this.render();
    },
    render() {
      this.info.textContent = `Бургер ${this.idx + 1} из ${CFG.cook.burgers.length} · ошибок ${this.mistakes} из ${CFG.cook.mistakes}`;
    },
    add(id) {
      const need = this.order[this.stack.length];
      if (id !== need) {
        this.mistakes++; Sfx.bad();
        this.plateEl.classList.remove('shake'); void this.plateEl.offsetWidth; this.plateEl.classList.add('shake');
        this.render();
        if (this.mistakes >= CFG.cook.mistakes) finish(false, 'Слишком много ошибок');
        return;
      }
      Sfx.good();
      this.stack.push(id);
      this.plateEl.insertBefore(layer(id, true), this.plateEl.firstChild);
      if (this.stack.length === this.order.length) {
        this.idx++;
        if (this.idx >= CFG.cook.burgers.length) finish(true, 'Все бургеры готовы!');
        else { Sfx.win(); this.next(); }
      }
    },
    update(dt, auto) {
      this.left -= dt;
      this.timerEl.style.width = Math.max(0, this.left / CFG.cook.timePerBurger * 100) + '%';
      if (this.left <= 0) { finish(false, 'Время вышло'); return; }
      if (auto) {
        this.botWait -= dt;
        if (this.botWait <= 0) {
          this.botWait = rnd(CFG.bot.reactMin, CFG.bot.reactMax);
          const need = this.order[this.stack.length];
          this.add(Math.random() < CFG.bot.skill ? need : pick(ING.filter(i => i.id !== need)).id);
        }
      }
    },
    key(e) {
      const n = parseInt(e.code.replace('Digit', '').replace('Numpad', ''), 10);
      if (n >= 1 && n <= ING.length) { this.add(ING[n - 1].id); return true; }
      return false;
    },
  };

  // ======================= LETTERS =======================
  const ABC = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЬЫЭЮЯ';
  const Letters = {
    start() {
      const C = CFG.letters;
      this.words = C.words.slice(); this.w = 0; this.pos = 0; this.lives = C.lives;
      h('div', 'mg-title', 'Пульт от телевизора заколдован! Собери слово: находи нужную букву, пока не кончились 5 секунд.');
      this.wordEl = h('div', 'word');
      this.askEl = h('div', 'ask');
      this.timerEl = h('div', 'timer', '<div></div>').firstChild;
      this.livesEl = h('div', 'lives');
      this.grid = h('div', 'grid');
      this.newLetter();
    },
    word() { return this.words[this.w]; },
    newLetter() {
      const C = CFG.letters;
      this.left = C.secondsPerLetter; this.botWait = rnd(CFG.bot.reactMin, CFG.bot.reactMax * 1.5);
      const need = this.word()[this.pos];
      const set = new Set([need]);
      while (set.size < C.grid) set.add(ABC[Math.floor(Math.random() * ABC.length)]);
      const letters = [...set].sort(() => Math.random() - 0.5);
      this.grid.innerHTML = '';
      letters.forEach(L => { const b = h('div', 'letter', L, this.grid); b.addEventListener('click', () => this.choose(L)); });
      this.render();
    },
    render() {
      const w = this.word();
      this.wordEl.innerHTML = [...w].map((c, i) => `<span class="${i < this.pos ? 'ok' : i === this.pos ? 'cur' : ''}">${i < this.pos ? c : '_'}</span>`).join('');
      this.askEl.innerHTML = `Найди букву: <b>${w[this.pos]}</b> · слово ${this.w + 1} из ${this.words.length}`;
      this.livesEl.textContent = '❤️'.repeat(this.lives) + '🤍'.repeat(CFG.letters.lives - this.lives);
    },
    choose(L) {
      if (!this.word()) return;
      if (L === this.word()[this.pos]) {
        Sfx.good(); this.pos++;
        if (this.pos >= this.word().length) {
          this.w++; this.pos = 0;
          if (this.w >= this.words.length) { this.render0(); finish(true, 'Телевизор включается!'); return; }
          Sfx.win();
        }
        this.newLetter();
      } else this.fail();
    },
    render0() { this.wordEl.innerHTML = [...this.words[this.words.length - 1]].map(c => `<span class="ok">${c}</span>`).join(''); },
    fail() {
      this.lives--; Sfx.bad();
      this.grid.classList.remove('shake'); void this.grid.offsetWidth; this.grid.classList.add('shake');
      if (this.lives <= 0) { this.render(); finish(false, 'Жизни кончились'); return; }
      this.newLetter();
    },
    update(dt, auto) {
      this.left -= dt;
      this.timerEl.style.width = Math.max(0, this.left / CFG.letters.secondsPerLetter * 100) + '%';
      this.timerEl.style.background = this.left < 2 ? '#ff6b81' : '';
      if (this.left <= 0) { this.fail(); return; }
      if (auto) {
        this.botWait -= dt;
        if (this.botWait <= 0) {
          const need = this.word()[this.pos];
          const others = [...this.grid.children].map(c => c.textContent).filter(c => c !== need);
          this.choose(Math.random() < CFG.bot.skill ? need : pick(others));
        }
      }
    },
    key(e) {
      const L = (e.key || '').toUpperCase();
      if (L.length === 1 && ABC.includes(L)) { this.choose(L); return true; }
      return false;
    },
  };

  return { init, start, update, key, active };
})();
