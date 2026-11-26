// Main loop, story of the evening, interactions, chase and hiding, endings, auto-player and window.__game
// (docs/test-api.md).
window.Game = (function () {
  const $ = id => document.getElementById(id);
  const ENDINGS = {
    night: { title: 'Прожить одну ночь', win: true },
    escape: { title: 'Сбежать', win: true },
    fire: { title: 'Пожар', win: false },
    bad: { title: 'Очень плохо', win: false },
  };
  const TASKS = ['dance', 'cook', 'tv'];

  let renderer, camera, room, O;
  let G = null;                 // current run
  let scene = 'menu';           // menu | play | pause | over | win
  let speed = 1, auto = false, time = 0;
  const events = [];
  let cutscene = null;          // scripted sequence: { steps, i, left }
  let target = null;            // interactable you look at
  const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  function event(type, data) { events.push(Object.assign({ t: +time.toFixed(2), type }, data || {})); if (events.length > 5000) events.splice(0, 1000); }

  function loadFound() { try { return JSON.parse(localStorage.getItem('kffi_endings') || '[]'); } catch (e) { return []; } }
  function saveFound(list) { try { localStorage.setItem('kffi_endings', JSON.stringify(list)); } catch (e) {} }

  // ---------------- setup ----------------
  function init() {
    const canvas = $('game');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    camera = new THREE.PerspectiveCamera(70, 1, 0.05, 30);
    room = Room.build(); O = room.obj;
    Kefifi.init(room.scene);
    Player.init(canvas, room.colliders);
    Dialog.init(); Mini.init();
    resize(); addEventListener('resize', resize);
    // phones report the new size a bit after turning and when the browser bars hide
    addEventListener('orientationchange', () => setTimeout(resize, 300));
    if (window.visualViewport) visualViewport.addEventListener('resize', resize);
    document.body.classList.toggle('touch', touch);

    addEventListener('keydown', onKey);
    $('startBtn').addEventListener('click', () => { Sfx.unlock(); goFullscreen(); start(); });
    // iPhone Safari cannot go fullscreen from a page: suggest adding the game to the home screen
    const ios = /iPhone|iPod/.test(navigator.userAgent);
    const standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    $('iosHint').classList.toggle('hidden', !(ios && !standalone));
    $('btnUse').addEventListener('click', e => { e.stopPropagation(); if (G && G.hidden) unhide(); else useTarget(); });
    $('btnPause').addEventListener('click', e => { e.stopPropagation(); togglePause(); });
    $('resumeBtn').addEventListener('click', () => togglePause(false));
    $('menuBtn').addEventListener('click', () => toMenu());
    $('againBtn').addEventListener('click', () => { Sfx.unlock(); goFullscreen(); start(); });
    $('endMenuBtn').addEventListener('click', () => toMenu());
    $('autoBtn').addEventListener('click', () => setAuto(!auto));
    document.addEventListener('pointerlockchange', () => { $('crosshair').classList.toggle('locked', !!document.pointerLockElement); });

    toMenu();
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      step(dt * speed);
      render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // phones (Android Chrome): hide the browser bars and keep the screen horizontal; silently skipped where not supported
  function goFullscreen() {
    if (!touch || auto) return;
    const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      const lock = () => { try { const q = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (q && q.catch) q.catch(() => {}); } catch (e) {} };
      if (p && p.then) p.then(lock, () => {}); else lock();
    } catch (e) {}
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  }

  // ---------------- run state ----------------
  function start() {
    timers.length = 0;
    G = {
      step: 'intro', mood: CFG.mood.start, hasKey: false, keyTaken: false, wardrobeOpen: false, candle: false, candleOut: false,
      tvBroken: false, tvOn: 0, won: 0, lost: 0, screamers: 0, ending: null, done: {},
      hasChoc: false, chocTaken: false, chase: null, hidden: null, chases: 0, hides: 0,
      botGoal: pickGoal(), botStuck: 0, botLast: null, noclipT: 0,
    };
    scene = 'play';
    Player.reset(); Player.st.noclip = false;
    Kefifi.place(CFG.spots.dance.x, CFG.spots.dance.z); Kefifi.setDancing(false); Kefifi.setFace('happy');
    setLight('evening');
    O.flame.visible = false; O.candleLight.intensity = 0;
    O.tv.rotation.set(0, 0, 0); O.tv.position.set(0, 0, 0); O.tvTex('off', 0);
    O.remote.position.set(O.remoteHome.x, O.remoteHome.y, O.remoteHome.z); O.remote.rotation.set(0, 0, 0);
    O.wardrobeDoor.rotation.y = 0;
    ['start', 'pause', 'ending', 'hideOverlay', 'chaseVignette', 'screamer', 'mg', 'dialog'].forEach(id => $(id).classList.add('hidden'));
    $('hud').classList.remove('hidden');
    $('fade').style.opacity = 0; $('smoke').style.opacity = 0;
    cutscene = null;
    Sfx.music('day');
    event('start', { goal: G.botGoal });
    Player.setEnabled(true);
    // Kefifi greets you right away
    later(0.8, () => Dialog.say([
      { who: 'kefifi', face: 'happy', text: 'Привет! Ура, ты пришёл! Заходи, это моя комната!' },
      { who: 'kefifi', face: 'normal', text: 'Я Кэфифи. Я обожаю сладкое: кексы, леденцы и сахарную вату. Видишь, у меня даже ободок из конфет!' },
      { who: 'kefifi', face: 'happy', text: 'А ещё я собираю фигурки и плюшевых зверят. Их тут целая куча, посмотри на полках!' },
      { who: 'kefifi', face: 'normal', text: 'Мама с папой уехали отдыхать на море и вернутся только через неделю. Так что весь дом сегодня наш!' },
      { who: 'kefifi', face: 'normal', text: 'Но есть правило. Ты мой гость, и ты должен выполнять все мои задания.' },
      { who: 'kefifi', face: 'angry', text: 'Если не будешь… то будет плохо.' },
      { who: 'narr', text: 'Над головой Кэфифи шкала: насколько она довольна. Проигрыши и скука её уменьшают. Если шкала дойдёт до нуля — Кэфифи погонится за тобой!' },
      { who: 'kefifi', face: 'happy', text: 'Подойди ко мне, когда будешь готов. Первое задание — танцы!' },
    ], () => { G.step = 'dance'; event('task', { name: 'dance' }); resume(); }));
  }

  function pickGoal() {
    const e = CFG.bot.endings; let r = Math.random();
    for (const k in e) { r -= e[k]; if (r <= 0) return k; }
    return 'night';
  }

  function toMenu() {
    scene = 'menu'; G = null; cutscene = null; timers.length = 0;
    Player.setEnabled(false);
    ['hud', 'pause', 'ending', 'mg', 'dialog', 'screamer', 'hideOverlay', 'chaseVignette'].forEach(id => $(id).classList.add('hidden'));
    $('start').classList.remove('hidden');
    $('fade').style.opacity = 0; $('smoke').style.opacity = 0;
    const found = loadFound();
    $('endList').innerHTML = Object.keys(ENDINGS).map(k => `<span class="${found.includes(k) ? 'got' : ''}">${found.includes(k) ? '★ ' + ENDINGS[k].title : '? ? ?'}</span>`).join('');
    Sfx.music(null);
    setLight('evening');
    Player.reset();
    Kefifi.place(CFG.spots.dance.x, CFG.spots.dance.z); Kefifi.setDancing(false); Kefifi.setFace('happy');
  }

  function togglePause(on) {
    if (scene !== 'play' && scene !== 'pause') return;
    const p = on === undefined ? scene === 'play' : on;
    scene = p ? 'pause' : 'play';
    $('pause').classList.toggle('hidden', !p);
    Player.setEnabled(!p && !busy() && !(G && G.hidden));
  }

  function setAuto(on) {
    auto = !!on;
    $('autoBtn').textContent = auto ? 'Авто: вкл' : 'Авто: выкл';
    if (!auto) Player.setAutoDir(null);
    event('auto', { on: auto });
  }

  // ---------------- timers ----------------
  const timers = [];
  function later(sec, fn) { timers.push({ at: time + sec, fn }); }
  function runTimers() {
    for (let i = timers.length - 1; i >= 0; i--) if (time >= timers[i].at) { const t = timers.splice(i, 1)[0]; t.fn(); }
  }

  // ---------------- mood ----------------
  function mood(delta, why) {
    if (!G || G.ending) return;
    G.mood = Math.max(0, Math.min(100, G.mood + delta));
    if (delta < 0 && why) toast(`Кэфифи недовольна: ${why}`);
    if (delta > 0 && why) toast(why);
    if (G.mood <= 0 && !G.chase) startChase();
  }
  const angry = () => !G || !!G.chase || !!G.ending;

  let toastT = 0;
  function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); toastT = 2.8; }

  // ---------------- story: talking to Kefifi ----------------
  const busy = () => Dialog.isOpen() || Mini.active() || !!cutscene;

  function talk() {
    if (!G) return;
    if (G.chase) return G.hasChoc ? giveChocolate() : null;
    if (Kefifi.walking()) return Dialog.say([{ who: 'kefifi', face: 'normal', text: 'Иди за мной!' }], resume);
    const s = G.step;
    if (s === 'intro') return;
    if (s === 'watch') return Dialog.say([{ who: 'kefifi', face: 'happy', text: 'Тсс! Смотри мультик!' }], resume);
    if (s === 'dance') return offer('dance', G.done.danceLost ? 'Ещё разок? Смотри, как я танцую, и жми стрелки вовремя!' : 'Потанцуем? Смотри, как я танцую, и жми стрелки вовремя! Стрелки на клавиатуре или кнопки на экране.');
    if (s === 'cook') return offer('cook', G.done.cookLost ? 'Давай заново! Собирай бургер точно как на заказе.' : 'Вот и кухня! Давай приготовим бургеры: я даю заказ, а ты собираешь по порядку.');
    if (s === 'tv') return offer('letters', 'Садись, посмотрим мультики! Только пульт заколдован: надо собрать слово по буквам. На каждую букву 5 секунд!');
    if (s === 'candle') return Dialog.say([{ who: 'kefifi', face: 'normal', text: G.candleOut ? 'Свеча задута? Молодец. Ложись на кровать, будем спать!' : 'Не забудь задуть свечу на столе! А потом ложись на кровать.' }], resume);
  }

  function offer(game, text) {
    // after a loss or when the mood bar is low she does not smile while asking
    const face = G.mood < CFG.kefifi.angryBelow ? 'angry' : G.done[game + 'Lost'] ? 'normal' : 'happy';
    Dialog.ask({ who: 'kefifi', face, text }, [{ label: 'Давай!', value: 'yes' }, { label: 'Потом', value: 'no' }], v => {
      if (v === 'no') {
        mood(-CFG.mood.decline, 'ты отказался играть');
        if (angry()) return;
        Dialog.say([{ who: 'kefifi', face: 'angry', text: 'Ну ладно… Но не тяни. Мне скучно!' }], resume);
        return;
      }
      playMini(game);
    });
  }

  function goTask(step, line) {
    G.step = step; event('task', { name: step });
    const p = CFG.spots[step];
    Dialog.say(line, () => { Kefifi.walkTo(p.x, p.z); resume(); });
  }

  function playMini(game) {
    Player.setEnabled(false);
    Kefifi.setDancing(false);
    Mini.start(game, win => {
      event(win ? 'task_win' : 'task_lose', { name: game });
      win ? G.won++ : G.lost++;
      if (game === 'letters') return win ? tvWin() : tvLose();
      if (win) {
        mood(CFG.mood.win, 'Кэфифи довольна!');
        Kefifi.hop();
        if (game === 'dance') goTask('cook', [{ who: 'kefifi', face: 'happy', text: 'Ура! Ты классно танцуешь!' }, { who: 'kefifi', face: 'normal', text: 'Ох, я от танцев проголодалась… Пошли на кухню, приготовим что-нибудь!' }]);
        else goTask('tv', [{ who: 'kefifi', face: 'happy', text: 'Ммм, вкуснятина! Спасибо, повар!' }, { who: 'kefifi', face: 'normal', text: 'А теперь пошли на диван смотреть телевизор!' }]);
      } else {
        mood(-CFG.mood.lose, game === 'dance' ? 'ты путал движения' : 'бургер не получился');
        G.done[game + 'Lost'] = true;
        if (angry()) return;
        Dialog.say([{ who: 'kefifi', face: 'angry', text: game === 'dance' ? 'Эй, ты всё путаешь! Мне обидно… Подойди, попробуем ещё раз.' : 'Фу, это не бургер, а каша какая-то! Давай заново.' }], resume);
      }
    });
  }

  function resume() { if (scene === 'play' && !busy() && G && !G.hidden) Player.setEnabled(true); }

  function tvWin() {
    mood(CFG.mood.win, 'Кэфифи довольна!');
    G.tvOn = CFG.tv.watchSeconds; G.step = 'watch';
    event('tv_watch');
    Dialog.say([{ who: 'kefifi', face: 'happy', text: 'Ура, мультики! Мой любимый, про зайку!' }], () => {
      later(CFG.tv.watchSeconds, () => goNight());
      resume();
    });
  }

  function tvLose() {
    mood(-CFG.mood.tvLose);
    if (angry()) { G.tvBroken = true; O.tvTex('broken', 0); return; }
    // she throws the remote and the TV, yells at you, then the screamer, then she checks on you
    const R0 = O.remoteHome;
    play([
      { do: () => { Kefifi.setFace('angry'); Sfx.bad(); }, anim: 0.5, fn: k => {
        O.remote.position.set(R0.x + k * 1.0, R0.y + Math.sin(k * Math.PI) * 0.9 + k * 0.5, R0.z + k * 0.2); O.remote.rotation.set(k * 9, k * 5, 0);
      } },
      { do: () => { G.tvBroken = true; O.tvTex('broken', 0); Sfx.crash(); shake(0.6); }, anim: 0.6, fn: k => {
        O.tv.rotation.x = k * 1.5; O.tv.position.y = -k * 0.5; O.tv.position.z = k * 0.4;
        O.remote.position.set(R0.x + 1.0 - k * 0.2, R0.y + 0.5 - k * 0.84, R0.z + 0.2 + k * 0.3);
      } },
      { do: () => Dialog.say([{ who: 'kefifi', face: 'angry', text: 'Ты что, совсем тупой? Тебе 5 лет, ты не умеешь писать, что ли?!' }], nextCut), hold: true },
      { do: () => screamer(), wait: CFG.screamer.seconds + 0.3 },
      { do: () => Dialog.say([
        { who: 'kefifi', face: 'normal', text: '…С тобой всё хорошо?' },
        { who: 'kefifi', face: 'normal', text: 'Ладно. Телевизора больше нет… Пошли уже готовиться ко сну.' },
      ], () => { cutscene = null; goNight(); resume(); }), hold: true },
    ]);
  }

  function goNight() {
    if (!G || G.step === 'candle' || G.ending) return;
    G.step = 'candle'; G.candle = true; event('task', { name: 'candle' });
    O.flame.visible = true; O.candleLight.intensity = 2.2;
    setLight('night'); if (!G.chase) Sfx.music('night');
    if (G.chase) return;
    Kefifi.walkTo(CFG.spots.candle.x, CFG.spots.candle.z);
    Dialog.say([
      { who: 'kefifi', face: 'normal', text: 'Уже поздно, пора спать. Пошли в мою комнату, я зажгла там свечку, чтобы было уютно.' },
      { who: 'kefifi', face: 'normal', text: 'Перед сном обязательно задуй свечу на столе! А потом ложись на кровать.' },
    ], resume);
  }

  // ---------------- chase, hiding, chocolate ----------------
  const HIDES = {
    bed: { label: 'Спрятаться под кроватью', where: 'под кроватью', stand: { x: -0.9, z: 0.55 }, cam: { x: -1.0, y: 0.16, z: 0.15, yaw: -Math.PI + 0.4, pitch: 0.05 } },
    curtainsK: { label: 'Спрятаться за шторами', where: 'за шторами', stand: { x: 0.45, z: -1.3 }, cam: { x: 0.45, y: 1.3, z: -1.5, yaw: Math.PI, pitch: -0.1 } },
    curtainsL: { label: 'Спрятаться за шторами', where: 'за шторами', stand: { x: 0.6, z: 8.1 }, cam: { x: 0.6, y: 1.3, z: 8.27, yaw: 0, pitch: -0.1 } },
    sofa: { label: 'Спрятаться под диваном', where: 'под диваном', stand: { x: -0.6, z: 6.0 }, cam: { x: -0.55, y: 0.09, z: 6.0, yaw: -Math.PI / 2, pitch: 0.05 } },
  };

  function startChase() {
    G.chase = { phase: 'warn', t: CFG.chase.startDelay, repath: 0 };
    G.chases++;
    event('chase_start');
    Kefifi.setDancing(false); Kefifi.setFace('angry'); Kefifi.walkTo(Kefifi.st.x, Kefifi.st.z);
    Sfx.music('chase'); Sfx.bad();
    $('chaseVignette').classList.remove('hidden');
    later(0, () => {
      if (!G || !G.chase || G.ending) return;
      const say = () => Dialog.say([
        { who: 'kefifi', face: 'angry', text: 'ВСЁ!!! Ты меня довёл! Сейчас я тебя поймаю!!!' },
        { who: 'narr', text: 'Прячься: под кроватью Кэфифи, за шторами или под диваном. Успокоить её может только целая шоколадка из морозильника на кухне.' },
      ], resume);
      if (busy()) later(0.5, () => { if (!busy()) say(); }); else say();
    });
  }

  function chaseUpdate(dt) {
    const C = G.chase, K = Kefifi.st, P = Player.st, CC = CFG.chase;
    if (!C || busy()) return;
    const kz = Nav.zoneOf(K.x, K.z);
    const me = G.hidden ? HIDES[G.hidden].stand : { x: P.x, z: P.z };
    const dist = Math.hypot(K.x - me.x, K.z - me.z);
    if (C.phase === 'warn') { C.t -= dt; if (C.t <= 0) { C.phase = 'hunt'; event('chase_hunt'); } return; }
    if (C.phase === 'hunt') {
      if (G.hidden && !C.seen) { C.phase = 'search'; C.t = CC.searchSeconds; event('chase_search'); toast('Кэфифи потеряла тебя и ищет…'); return; }
      C.repath -= dt;
      if (C.repath <= 0) { C.repath = 0.35; Kefifi.walkTo(me.x, me.z, CC.speed); }
      if (dist < CC.catchDist) caught();
      return;
    }
    if (C.phase === 'search') {
      C.t -= dt;
      if (!Kefifi.walking()) { const z = Nav.zones[Math.floor(Math.random() * Nav.zones.length)], c = Nav.center(z); Kefifi.walkTo(c.x, c.z, CC.speed * 0.7); }
      // you came out right in front of her
      if (!G.hidden && kz === Nav.zoneOf(P.x, P.z) && dist < CC.seeDist) { C.phase = 'hunt'; toast('Она тебя увидела! Беги!'); return; }
      if (C.t <= 0) { C.phase = 'rest'; C.t = CC.restSeconds; event('chase_rest'); Kefifi.walkTo(CFG.spots.dance.x, CFG.spots.dance.z, 1.0); toast('Кэфифи устала искать… но скоро продолжит! Найди шоколадку.'); }
      return;
    }
    if (C.phase === 'rest') {
      C.t -= dt;
      if (C.t <= 0) { C.phase = G.hidden ? 'search' : 'hunt'; C.t = CC.searchSeconds; toast('Кэфифи снова ищет тебя!'); Sfx.bad(); }
    }
  }

  function hide(id) {
    const h = HIDES[id];
    G.hidden = id; G.hides++;
    G.prevPos = { x: Player.st.x, z: Player.st.z, yaw: Player.st.yaw, pitch: Player.st.pitch };
    Player.setEnabled(false);
    Player.st.yaw = h.cam.yaw; Player.st.pitch = h.cam.pitch;
    event('hide', { name: id });
    // she saw where you went
    if (G.chase && G.chase.phase === 'hunt') {
      const K = Kefifi.st, d = Math.hypot(K.x - h.stand.x, K.z - h.stand.z);
      G.chase.seen = Nav.zoneOf(K.x, K.z) === Nav.zoneOf(h.stand.x, h.stand.z) && d < CFG.chase.seeDist;
    }
    $('hideText').textContent = `Ты прячешься ${h.where}. ${touch ? 'Кнопка справа' : 'E'} — вылезти.`;
    $('hideOverlay').className = 'hide-' + (id.startsWith('curtains') ? 'curtains' : 'low');
  }

  function unhide() {
    if (!G || !G.hidden) return;
    const p = G.prevPos;
    G.hidden = null;
    Player.st.x = p.x; Player.st.z = p.z; Player.st.yaw = p.yaw; Player.st.pitch = p.pitch;
    $('hideOverlay').classList.add('hidden');
    event('unhide');
    resume();
  }

  function caught() {
    if (G.ending || G.caught) return;
    G.caught = true; event('caught');
    if (G.hidden) { G.hidden = null; $('hideOverlay').classList.add('hidden'); }
    Player.setEnabled(false);
    play([
      { do: () => { Kefifi.setFace('scream'); screamer(); }, wait: CFG.screamer.seconds + 0.3 },
      { do: () => fadeTo(1), wait: 1 },
      { do: () => { fadeTo(0); endWith('bad'); } },
    ]);
  }

  function giveChocolate() {
    // a new bar appears in the freezer, so a later chase can be ended too
    G.hasChoc = false; G.chocTaken = false; G.chase = null;
    event('chocolate_given');
    $('chaseVignette').classList.add('hidden');
    G.mood = CFG.chase.moodAfterChocolate;
    Kefifi.walkTo(Kefifi.st.x, Kefifi.st.z); Kefifi.hop();
    Sfx.win(); Sfx.music(G.step === 'candle' ? 'night' : 'day');
    Dialog.say([
      { who: 'kefifi', face: 'happy', text: 'О, спасибо за шоколадку, ням-ням-ням!' },
      { who: 'kefifi', face: 'normal', text: 'Ладно… Я больше не злюсь. Продолжим!' },
    ], () => {
      const p = CFG.spots[G.step === 'watch' || G.step === 'intro' ? 'tv' : G.step] || CFG.spots.dance;
      if (G.step === 'watch') goNight(); else Kefifi.walkTo(p.x, p.z);
      resume();
    });
  }

  // ---------------- interactables ----------------
  const HW = CFG.room.w / 2, HD = CFG.room.d / 2;
  const hideItem = (id, pos, okExtra) => ({ id: 'hide_' + id, pos, ok: () => !G.hidden && (!okExtra || okExtra()), label: () => HIDES[id].label, use: () => hide(id) });
  const ITEMS = [
    { id: 'kefifi', pos: () => ({ x: Kefifi.st.x, y: 1.0, z: Kefifi.st.z }), ok: () => !G.chase || G.hasChoc, label: () => G.chase ? 'Дать шоколадку' : 'Поговорить с Кэфифи', use: () => talk() },
    { id: 'candle', pos: () => ({ x: HW - 0.45, y: 0.85, z: 1.37 }), ok: () => G.candle && !G.candleOut, label: () => 'Задуть свечу', use: () => {
      G.candleOut = true; O.flame.visible = false; O.candleLight.intensity = 0; Sfx.blow(); event('candle_out');
      toast('Свеча задута. Теперь можно ложиться спать.');
    } },
    { id: 'bed', pos: () => ({ x: -1.1, y: 0.6, z: -0.6 }), ok: () => G.step === 'candle' && !G.chase, label: () => 'Лечь спать', use: () => {
      G.candleOut ? nightEnding() : fireEnding();
    } },
    hideItem('bed', () => ({ x: -1.1, y: 0.3, z: 0.1 }), () => !(G.step === 'candle' && !G.chase)),
    hideItem('curtainsK', () => ({ x: 0.45, y: 1.1, z: -1.5 })),
    hideItem('curtainsL', () => ({ x: 0.6, y: 1.1, z: 8.25 })),
    hideItem('sofa', () => ({ x: -0.55, y: 0.35, z: 6.0 })),
    { id: 'wardrobe', pos: () => ({ x: 0.7, y: 1.1, z: HD - 0.3 }), label: () => G.wardrobeOpen ? 'Закрыть шкаф' : 'Открыть шкаф', use: () => {
      G.wardrobeOpen = !G.wardrobeOpen; Sfx.door();
      if (G.wardrobeOpen) toast('Тут платья Кэфифи и коробка с наклейками.');
    } },
    { id: 'nightstand', pos: () => ({ x: O.nightstand.x, y: 0.4, z: O.nightstand.z }), label: () => 'Открыть тумбочку', use: () => {
      Sfx.door();
      if (!G.keyTaken) { G.keyTaken = G.hasKey = true; Sfx.key(); event('key_found'); toast('Ты нашёл ключ! Похоже, от входной двери…'); }
      else toast('Тут только мамины крема и папины очки.');
    } },
    { id: 'fridge', pos: () => ({ x: O.fridge.x, y: 0.5, z: O.fridge.z }), label: () => 'Открыть морозильник', use: () => {
      Sfx.door();
      if (!G.chocTaken) { G.chocTaken = G.hasChoc = true; Sfx.key(); event('chocolate_found'); toast(G.chase ? 'Целая шоколадка! Скорее отдай её Кэфифи!' : 'Ты нашёл целую шоколадку! Ею можно успокоить Кэфифи.'); }
      else toast('В морозильнике только пельмени и лёд.');
    } },
    { id: 'frontDoor', pos: () => ({ x: O.frontDoor.x, y: 1.0, z: O.frontDoor.z }), label: () => G.hasKey ? 'Открыть входную дверь ключом' : 'Входная дверь', use: () => {
      if (!G.hasKey) { Dialog.say([{ who: 'narr', text: 'Входная дверь заперта на ключ. Где-то в доме он должен быть…' }], resume); return; }
      Dialog.ask({ who: 'narr', text: 'Ключ подходит к двери. Сбежать от Кэфифи?' }, [{ label: 'Сбежать', value: 'go' }, { label: 'Остаться', value: 'stay' }], v => v === 'go' ? escapeEnding() : resume());
    } },
    { id: 'tv', pos: () => ({ x: O.tvPos.x, y: 1.0, z: O.tvPos.z }), ok: () => G.step === 'tv' && !G.chase, label: () => 'Телевизор', use: () => talk() },
    { id: 'shelf', pos: () => ({ x: HW - 0.2, y: 1.0, z: -0.35 }), ok: () => !G.done.shelf && !G.chase, label: () => 'Посмотреть фигурки', use: () => {
      G.done.shelf = true;
      Dialog.say([{ who: 'kefifi', face: 'happy', text: 'Это моя коллекция! Только смотри, не трогай. Особенно ту, розовую!' }], resume);
    } },
    { id: 'sink1', pos: () => ({ x: -2.43, y: 0.9, z: 0.3 }), label: () => 'Помыть руки', use: () => { Sfx.blow(); toast('Ты помыл руки. Чистота!'); } },
    { id: 'sink2', pos: () => ({ x: -4.43, y: 0.9, z: 0.3 }), label: () => 'Помыть руки', use: () => { Sfx.blow(); toast('Ты помыл руки. Чистота!'); } },
  ];

  function findTarget() {
    if (!G || scene !== 'play' || busy() || G.hidden) return null;
    const fx = -Math.sin(Player.st.yaw) * Math.cos(Player.st.pitch), fy = Math.sin(Player.st.pitch), fz = -Math.cos(Player.st.yaw) * Math.cos(Player.st.pitch);
    const myZone = Nav.zoneOf(Player.st.x, Player.st.z);
    let best = null, bestA = 1e9;
    for (const it of ITEMS) {
      if (it.ok && !it.ok()) continue;
      const p = it.pos();
      const dx = p.x - Player.st.x, dy = p.y - CFG.player.eye, dz = p.z - Player.st.z;
      const flat = Math.hypot(dx, dz);
      if (flat > CFG.interact.dist) continue;
      if (Nav.zoneOf(p.x, p.z) !== myZone && flat > 0.9) continue; // not through walls
      const d = Math.hypot(dx, dy, dz);
      const a = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy + dz * fz) / d))) * 180 / Math.PI;
      const lim = CFG.interact.angleDeg + (flat < 0.9 ? 15 : 0);
      if (a < lim && a < bestA) { bestA = a; best = it; }
    }
    return best;
  }

  function useTarget() {
    if (!target || busy() || scene !== 'play') return;
    Sfx.unlock(); Sfx.click();
    const it = target;
    event('use', { name: it.id });
    if (document.pointerLockElement && ['kefifi', 'frontDoor', 'shelf', 'tv', 'bed'].includes(it.id)) document.exitPointerLock();
    it.use();
  }

  // ---------------- cutscenes ----------------
  // steps: { do(), wait } | { anim: seconds, fn(k) } | { hold: true } waits until a callback calls nextCut
  function play(steps) { cutscene = { steps, i: -1, left: 0 }; Player.setEnabled(false); nextCut(); }
  function nextCut() {
    const c = cutscene; if (!c) return;
    c.i++;
    const s = c.steps[c.i];
    if (!s) { cutscene = null; resume(); return; }
    if (s.do) s.do();
    c.left = s.anim || s.wait || 0; c.total = c.left;
  }
  function updateCut(dt) {
    const c = cutscene; if (!c) return;
    const s = c.steps[c.i]; if (!s || s.hold) return;
    c.left -= dt;
    if (s.fn) s.fn(Math.min(1, 1 - c.left / c.total));
    if (c.left <= 0) nextCut();
  }

  let shakeT = 0;
  function shake(sec) { shakeT = sec; }

  function screamer() {
    if (G) G.screamers++;
    event('screamer');
    $('screamer').classList.remove('hidden');
    Sfx.scream(CFG.screamer.seconds); shake(CFG.screamer.seconds);
    // restart the CSS rush-in animation every time
    const f = document.querySelector('#screamer .face'); f.style.animation = 'none'; void f.offsetWidth; f.style.animation = '';
    later(CFG.screamer.seconds, () => $('screamer').classList.add('hidden'));
  }

  // ---------------- endings ----------------
  function endWith(name) {
    if (!G || G.ending) return;
    G.ending = name;
    const E = ENDINGS[name];
    const found = loadFound(); if (!found.includes(name)) { found.push(name); saveFound(found); }
    event('ending', { name });
    event(E.win ? 'win' : 'over', E.win ? { name } : { reason: name });
    scene = E.win ? 'win' : 'over';
    cutscene = null;
    Player.setEnabled(false);
    $('chaseVignette').classList.add('hidden'); $('hideOverlay').classList.add('hidden');
    $('endTitle').textContent = 'Конец';
    $('endName').textContent = E.title;
    $('endText').textContent = ({
      night: 'Ночёвка закончилась… совсем не так, как вы ждали.',
      escape: 'Ты сбежал. Но завтра в школе Кэфифи будет ждать объяснений.',
      fire: 'Кэфифи просила задуть свечу. Хорошо, что все успели выбежать.',
      bad: 'Кэфифи тебя поймала… Ночёвка окончена.',
    })[name];
    $('endFound').textContent = `Открыто концовок: ${loadFound().length} из 4`;
    $('ending').classList.remove('hidden');
    $('hud').classList.add('hidden');
    Sfx.music(null);
  }

  function fadeTo(v) { $('fade').style.opacity = v; }

  function nightEnding() {
    event('sleep');
    play([
      { do: () => { fadeTo(1); Sfx.music(null); }, wait: 1.2 },
      { do: () => { $('fadeText').textContent = 'Ночь прошла…'; }, wait: 2.2 },
      { do: () => {
        $('fadeText').textContent = '';
        setLight('morning');
        Player.st.x = -1.0; Player.st.z = -0.2; Player.st.yaw = Math.PI * 0.85; Player.st.pitch = 0.05;
        G.lying = true;
        Kefifi.place(-0.25, 0.25); Kefifi.setDancing(false); Kefifi.setFace('normal');
        fadeTo(0);
      }, wait: 1.2 },
      { do: () => { Sfx.car(); }, wait: 2.8 },
      { do: () => Dialog.say([
        { who: 'narr', text: 'Утро. Сквозь сон слышно, как во дворе гудит машина…' },
        { who: 'kefifi', face: 'normal', text: 'М-м… Ты слышал? Это же… папина машина?!' },
      ], nextCut), hold: true },
      { do: () => { Sfx.keys(); later(0.6, () => Sfx.door()); }, wait: 1.2 },
      { do: () => Dialog.say([
        { who: 'mom', text: 'Кэфифи, солнышко, мы дома! Решили вернуться пораньше!' },
        { who: 'kefifi', face: 'normal', text: 'ЧТО?! Они же должны были вернуться только через неделю!' },
        { who: 'narr', text: 'Вы оба в шоке.' },
      ], nextCut), hold: true },
      { do: () => endWith('night') },
    ]);
  }

  function fireEnding() {
    event('sleep');
    play([
      { do: () => { fadeTo(1); Sfx.music(null); }, wait: 1.2 },
      { do: () => { $('fadeText').textContent = 'Ночью свеча упала со стола…'; }, wait: 2.2 },
      { do: () => {
        $('fadeText').textContent = ''; setLight('fire');
        Player.st.x = -0.9; Player.st.z = 0.3; Player.st.yaw = -Math.PI * 0.6; Player.st.pitch = 0.1;
        Kefifi.place(0.0, 0.5); Kefifi.setDancing(false); fadeTo(0); $('smoke').style.opacity = 0.75; Sfx.fire(); Sfx.alarm();
      }, wait: 1.5 },
      { do: () => Dialog.say([
        { who: 'kefifi', face: 'angry', text: 'ПОЖАР! Я же просила задуть свечу!!!' },
        { who: 'narr', text: 'Вы схватили плюшевых зверят и выбежали из дома. Комната Кэфифи сгорела.' },
      ], nextCut), hold: true },
      { do: () => endWith('fire') },
    ]);
  }

  function escapeEnding() {
    event('escape');
    play([
      { do: () => { Sfx.door(); fadeTo(1); }, wait: 1.2 },
      { do: () => { $('fadeText').textContent = 'Ты тихо открыл входную дверь ключом и убежал домой. Кэфифи осталась одна…'; }, wait: 3 },
      { do: () => { $('fadeText').textContent = ''; fadeTo(0); endWith('escape'); } },
    ]);
  }

  // ---------------- lights ----------------
  function setLight(mode) {
    const cfg = {
      evening: { hemi: 1.6, ceil: 1, night: 0, fire: 0, bg: '#2a2230', win: '#2b3557', spot: '#fffbe8' },
      night: { hemi: 0.35, ceil: 0, night: 1.6, fire: 0, bg: '#0d0b14', win: '#0f1430', spot: '#77737c' },
      morning: { hemi: 2.2, ceil: 0, night: 0, fire: 0, bg: '#cfe7ff', win: '#bfe3ff', spot: '#cccccc' },
      fire: { hemi: 0.4, ceil: 0, night: 0, fire: 12, bg: '#200800', win: '#3a0f05', spot: '#553322' },
    }[mode];
    if (G) G.light = mode;
    O.hemi.intensity = cfg.hemi;
    O.ceilLights.forEach(l => { l.intensity = l.userData.k * cfg.ceil; });
    O.nightLight.intensity = cfg.night; O.fireLight.intensity = cfg.fire;
    room.scene.background.set(cfg.bg);
    O.windowGlass.material.color.set(cfg.win);
    O.extraWindows.forEach(w => w.material.color.set(cfg.win));
    O.spots.forEach(s => s.material.color.set(cfg.spot));
  }

  // ---------------- keys ----------------
  function onKey(e) {
    if (e.repeat) return;
    if (scene === 'menu') { if (e.code === 'Enter' || e.code === 'Space') { Sfx.unlock(); start(); } return; }
    if (scene === 'win' || scene === 'over') { if (e.code === 'Enter') start(); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (!document.pointerLockElement || e.code === 'KeyP') togglePause(); return; }
    if (scene !== 'play') return;
    if (Mini.active()) { if (Mini.key(e)) e.preventDefault(); return; }
    if (Dialog.key(e.code)) { e.preventDefault(); return; }
    if (G && G.hidden) { if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { unhide(); e.preventDefault(); } return; }
    if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { useTarget(); e.preventDefault(); }
  }

  // ---------------- bot (auto mode) ----------------
  function botChoice(list) {
    const vals = list.map(o => o.value);
    if (vals.includes('go')) return G && G.botGoal === 'escape' ? vals.indexOf('go') : vals.indexOf('stay');
    if (vals.includes('yes')) return vals.indexOf('yes');
    return 0;
  }

  function botGoalItem() {
    if (!G) return null;
    if (G.chase) return G.hasChoc ? 'kefifi' : G.chocTaken ? null : 'fridge';
    const s = G.step;
    if (s === 'intro' || s === 'watch') return null;
    if (G.botGoal === 'escape' && (s === 'cook' || s === 'tv' || s === 'candle')) return G.hasKey ? 'frontDoor' : 'nightstand';
    if (s === 'candle') return G.botGoal === 'fire' || G.candleOut ? 'bed' : 'candle';
    return 'kefifi';
  }

  function botUpdate(dt) {
    if (!G || scene !== 'play' || busy() || G.hidden) { Player.setAutoDir(null); return; }
    const id = botGoalItem();
    const it = ITEMS.find(i => i.id === id);
    if (!it || (it.ok && !it.ok())) { Player.setAutoDir(null); return; }
    const p = it.pos();
    // next waypoint through doorways
    const pts = Nav.path(Player.st.x, Player.st.z, p.x, p.z);
    while (pts.length > 1 && Math.hypot(pts[0].x - Player.st.x, pts[0].z - Player.st.z) < 0.3) pts.shift();
    const w = pts[0], last = pts.length === 1;
    const dx = w.x - Player.st.x, dz = w.z - Player.st.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz);
    let diff = want - Player.st.yaw; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    Player.st.yaw += Math.max(-5 * dt, Math.min(5 * dt, diff));
    const wantPitch = last ? Math.atan2(p.y - CFG.player.eye, Math.max(0.3, dist)) : 0;
    Player.st.pitch += (wantPitch - Player.st.pitch) * Math.min(1, dt * 4);
    const close = last && dist < CFG.interact.dist * 0.55;
    Player.setAutoDir(close ? { f: 0, r: 0 } : { f: Math.abs(diff) < 0.6 ? 1 : 0.2, r: 0 });
    // stuck on furniture: walk through it for a moment
    if (G.botLast) {
      const moved = Math.hypot(Player.st.x - G.botLast.x, Player.st.z - G.botLast.z);
      G.botStuck = !close && moved < 0.2 * dt ? G.botStuck + dt : 0;
    }
    G.botLast = { x: Player.st.x, z: Player.st.z };
    if (G.botStuck > 0.8) { G.noclipT = 1.0; G.botStuck = 0; }
    G.noclipT = Math.max(0, G.noclipT - dt);
    Player.st.noclip = G.noclipT > 0 && !close;
    // do not pester her with talk while she is still walking to the next task
    if (close && target === it && !(it.id === 'kefifi' && Kefifi.walking() && !G.chase)) useTarget();
  }

  // ---------------- per-step update ----------------
  function step(sdt) {
    // substeps keep rhythm and hit windows correct even at speed x50
    let left = sdt;
    while (left > 0) {
      const dt = Math.min(left, 1 / 30); left -= dt;
      if (scene === 'pause') return;
      time += dt;
      if (scene === 'menu') { menuIdle(dt); continue; }
      runTimers();
      tick(dt);
    }
  }

  let menuT = 0;
  function menuIdle(dt) {
    menuT += dt;
    Player.st.yaw = Math.sin(menuT * 0.15) * 0.6; Player.st.pitch = -0.05;
    Kefifi.update(dt, camera);
  }

  function tick(dt) {
    if (!G) return;
    if (auto) botUpdate(dt);
    if ((!busy() || auto) && !G.hidden) Player.update(dt);
    Kefifi.update(dt, camera);
    Player.setBlockers(G.chase ? [] : [{ x: Kefifi.st.x, z: Kefifi.st.z, r: Kefifi.radius }]);
    Dialog.update(dt, auto);
    Mini.update(dt, auto);
    updateCut(dt);
    if (G.chase && !G.ending) chaseUpdate(dt);
    // the bot hides out a search by leaving its spot after a while
    if (auto && G.hidden && (!G.chase || G.chase.phase === 'rest')) unhide();
    target = findTarget();
    if (G.tvOn > 0) { G.tvOn -= dt; O.tvTex(G.tvOn > 0 ? 'on' : 'off', time); }
    if (O.flame.visible) { O.flame.scale.y = 1.8 + Math.sin(time * 23) * 0.25; O.candleLight.intensity = 2.0 + Math.sin(time * 17) * 0.3; }
    if (G.light === 'fire') O.fireLight.intensity = 10 + Math.sin(time * 20) * 3 + Math.random() * 2;
    O.fanBlades.rotation.z -= dt * 12;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    if (shakeT > 0) shakeT -= dt;
    // mood slowly drops while she waits for you to play
    if (scene === 'play' && TASKS.includes(G.step) && !busy() && !G.chase && !Kefifi.walking()) mood(-CFG.mood.decayPerSec * dt);
    const calm = !Dialog.isOpen() && !G.ending && !G.caught && !cutscene && !G.chase;
    // idle face follows the mood bar: joy when very pleased, main emotion normally, a bit angry when unhappy
    const face = G.mood >= CFG.kefifi.happyAt ? 'happy' : G.mood < CFG.kefifi.angryBelow ? 'angry' : 'normal';
    if (Kefifi.st.face !== face && calm) Kefifi.setFace(face);
    // very pleased and standing still: she dances like in the video
    const dance = calm && scene === 'play' && !Mini.active() && !Kefifi.walking() && G.mood >= CFG.danceIdleAt;
    if (dance !== Kefifi.st.dancing) Kefifi.setDancing(dance);
    hud();
  }

  // ---------------- HUD ----------------
  function taskText() {
    if (!G) return '';
    if (G.hidden) return '';
    if (G.chase) return G.hasChoc ? 'Подойди к Кэфифи и дай ей шоколадку!' : G.chase.phase === 'rest' ? 'Передышка! Возьми шоколадку в морозильнике на кухне' : 'Кэфифи гонится! Прячься или найди шоколадку в морозильнике';
    const going = Kefifi.walking() ? ' — иди за ней' : ' — подойди к ней';
    if (G.step === 'intro') return 'Знакомься с Кэфифи';
    if (G.step === 'dance') return 'Задание: потанцуй с Кэфифи' + going;
    if (G.step === 'cook') return 'Задание: приготовь бургеры на кухне' + going;
    if (G.step === 'watch') return 'Смотрите мультики!';
    if (G.step === 'tv') return 'Задание: посмотри с Кэфифи телевизор в гостиной' + going;
    if (G.step === 'candle') return G.candleOut ? 'Задание: ложись спать в комнате Кэфифи' : 'Задание: задуй свечу на столе Кэфифи, потом ложись спать';
    return '';
  }

  function hud() {
    $('task').textContent = busy() ? '' : taskText();
    const showPrompt = target && scene === 'play';
    $('prompt').style.display = showPrompt ? 'block' : 'none';
    if (showPrompt) $('prompt').innerHTML = touch ? target.label() : `<b>E</b> ${target.label()}`;
    // on a phone the action button is always there: dim when there is nothing to use, bright with a label when there is
    const useBtn = touch && scene === 'play' && G && (G.hidden || !busy());
    const canUse = useBtn && (G.hidden || showPrompt);
    $('btnUse').classList.toggle('hidden', !useBtn);
    $('btnUse').classList.toggle('idle', useBtn && !canUse);
    if (useBtn) $('btnUse').textContent = G.hidden ? 'Вылезти' : canUse ? target.label() : 'Действие';
    $('joy').style.display = touch && scene === 'play' && !busy() && !(G && G.hidden) ? '' : 'none';
    const help = touch && scene === 'play' && !busy() && !(G && G.hidden);
    $('helpMove').style.display = help && !Player.st.usedMove ? 'block' : 'none';
    $('helpLook').style.display = help && !Player.st.usedLook ? 'block' : 'none';
    $('hintKeys').style.display = busy() || touch ? 'none' : 'block';
    $('crosshair').style.display = busy() || (G && G.hidden) ? 'none' : 'block';
    $('keyIcon').style.display = G && G.hasKey ? 'block' : 'none';
    $('chocIcon').style.display = G && G.hasChoc ? 'block' : 'none';
    if (G && G.hidden && $('hideOverlay').classList.contains('hidden')) $('hideOverlay').classList.remove('hidden');
  }

  function render() {
    if (G && G.hidden) {
      const c = HIDES[G.hidden].cam;
      camera.position.set(c.x, c.y, c.z); camera.rotation.order = 'YXZ';
      camera.rotation.y = Player.st.yaw; camera.rotation.x = Player.st.pitch; camera.rotation.z = 0;
    } else if (G && G.lying) Player.applyCamera(camera, 0.95);
    else Player.applyCamera(camera);
    if (shakeT > 0) { camera.position.x += (Math.random() - 0.5) * 0.06; camera.position.y += (Math.random() - 0.5) * 0.06; }
    Kefifi.updateBar(camera, G ? G.mood : 0, !!G && scene === 'play' && !G.ending && !Dialog.isOpen() && !Mini.active());
    renderer.render(room.scene, camera);
  }

  // ---------------- test API (docs/test-api.md) ----------------
  window.__game = {
    start() { Sfx.setMuted(false); start(); },
    setAuto,
    setSpeed(k) { speed = Math.max(0.1, Math.min(50, Number(k) || 1)); },
    state() {
      return {
        scene, time: +time.toFixed(2),
        step: G ? G.step : null,
        mood: G ? Math.round(G.mood) : null,
        tasksWon: G ? G.won : 0, tasksLost: G ? G.lost : 0,
        hasKey: G && G.hasKey ? 1 : 0, hasChoc: G && G.hasChoc ? 1 : 0, candleLit: G && G.candle && !G.candleOut ? 1 : 0,
        chase: G && G.chase ? G.chase.phase : null, chases: G ? G.chases : 0, hidden: G && G.hidden ? 1 : 0, hides: G ? G.hides : 0,
        screamers: G ? G.screamers : 0,
        x: +Player.st.x.toFixed(2), z: +Player.st.z.toFixed(2), zone: Nav.zoneOf(Player.st.x, Player.st.z),
        kx: +Kefifi.st.x.toFixed(2), kz: +Kefifi.st.z.toFixed(2),
        ending: G ? G.ending : null, endingsFound: loadFound().length,
        mini: Mini.active() ? 1 : 0, dialog: Dialog.isOpen() ? 1 : 0,
      };
    },
    events,
  };

  return { init, event, isTouch: () => touch, botChoice };
})();

addEventListener('load', () => Game.init());
