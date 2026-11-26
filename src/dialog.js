// Visual-novel style talk: Kefifi's big portrait over the room and a name plate with text.
// Dialog.say(lines, done)  line = { who: 'kefifi'|'me'|'mom'|'narr', face: 'normal'|'happy'|'scream', text }
// Dialog.ask(line, options, done)  options = [{ label, value }]
window.Dialog = (function () {
  const NAMES = { kefifi: 'Кэфифи', me: 'Ты', mom: 'Мама Кэфифи', dad: 'Папа Кэфифи', narr: '' };
  let el, nameEl, textEl, portEl, choicesEl, nextEl;
  let queue = [], cur = null, shown = 0, done = null, options = null, wait = 0, open = false;

  function init() {
    el = document.getElementById('dialog');
    nameEl = document.getElementById('dlgName');
    textEl = document.getElementById('dlgText');
    portEl = document.getElementById('dlgPortrait');
    choicesEl = document.getElementById('dlgChoices');
    nextEl = document.getElementById('dlgNext');
    el.addEventListener('click', e => { if (!e.target.closest('.choice')) advance(); });
  }

  function say(lines, cb) {
    queue = lines.slice(); done = cb || null; options = null; open = true;
    el.classList.remove('hidden');
    next();
  }

  function ask(line, opts, cb) {
    queue = [line]; done = null; options = { list: opts, cb }; open = true;
    el.classList.remove('hidden');
    next();
  }

  function next() {
    cur = queue.shift();
    if (!cur) return close();
    shown = 0; wait = 0;
    nameEl.textContent = NAMES[cur.who] || '';
    nameEl.style.display = NAMES[cur.who] ? 'block' : 'none';
    el.classList.toggle('narr', cur.who === 'narr');
    if (cur.who === 'kefifi') {
      portEl.src = window.KEFIFI_IMG[cur.face || 'normal'];
      portEl.style.display = 'block';
      Kefifi.setFace(cur.face === 'scream' ? 'scream' : cur.face || 'normal');
    } else portEl.style.display = 'none';
    textEl.textContent = '';
    choicesEl.innerHTML = '';
    nextEl.style.visibility = 'hidden';
  }

  function close() {
    open = false; cur = null;
    el.classList.add('hidden');
    const cb = done; done = null;
    if (cb) cb();
  }

  function showChoices() {
    if (!options || queue.length) return;
    choicesEl.innerHTML = '';
    options.list.forEach((o, i) => {
      const b = document.createElement('div');
      b.className = 'choice btn'; b.textContent = `${i + 1}. ${o.label}`;
      b.addEventListener('click', e => { e.stopPropagation(); choose(i); });
      choicesEl.appendChild(b);
    });
  }

  function choose(i) {
    if (!options) return;
    const o = options.list[i]; if (!o) return;
    Sfx.click();
    const cb = options.cb; options = null;
    open = false; el.classList.add('hidden'); cur = null;
    cb(o.value);
  }

  function advance() {
    if (!open || !cur) return;
    if (shown < cur.text.length) { shown = cur.text.length; textEl.textContent = cur.text; finished(); return; }
    if (options && !queue.length) return; // must pick a choice
    Sfx.click();
    next();
  }

  function finished() {
    if (options && !queue.length) showChoices(); else nextEl.style.visibility = 'visible';
  }

  function update(dt, auto) {
    if (!open || !cur) return;
    if (shown < cur.text.length) {
      const before = Math.floor(shown);
      shown = Math.min(cur.text.length, shown + dt * 45);
      if (Math.floor(shown) !== before && Math.floor(shown) % 3 === 0 && cur.who === 'kefifi') Sfx.talk();
      textEl.textContent = cur.text.slice(0, Math.floor(shown));
      if (shown >= cur.text.length) finished();
      return;
    }
    if (auto) {
      wait += dt;
      if (wait > 0.6) {
        if (options && !queue.length) choose(Game.botChoice(options.list));
        else advance();
      }
    }
  }

  function key(code) {
    if (!open) return false;
    if (options && !queue.length && shown >= (cur ? cur.text.length : 0)) {
      const n = parseInt(code.replace('Digit', '').replace('Numpad', ''), 10);
      if (n >= 1 && n <= options.list.length) { choose(n - 1); return true; }
    }
    if (code === 'Space' || code === 'Enter' || code === 'KeyE') { advance(); return true; }
    return false;
  }

  return { init, say, ask, update, key, isOpen: () => open };
})();
