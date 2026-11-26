// All sounds are synthesized with WebAudio: no audio files, works offline.
window.Sfx = (function () {
  let ctx = null, master = null, musicTimer = null, musicStep = 0, musicMode = null;
  let muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol, when, filterFreq, type) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (when || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = filterFreq || 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }

  const S = {
    unlock: ensure,
    setMuted(m) { muted = m; },
    click() { tone(880, 0.06, 'triangle', 0.12); },
    talk() { tone(520 + Math.random() * 180, 0.05, 'triangle', 0.05); },
    good() { tone(660, 0.08, 'triangle', 0.18); tone(990, 0.1, 'triangle', 0.15, 0.06); },
    bad() { tone(220, 0.2, 'sawtooth', 0.12, 0, 120); },
    win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.2, i * 0.1)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.1, i * 0.14)); },
    key() { [1200, 1600, 2000].forEach((f, i) => tone(f, 0.12, 'sine', 0.15, i * 0.07)); },
    door() { noise(0.25, 0.3, 0, 400); tone(90, 0.3, 'sine', 0.3); },
    blow() { noise(0.6, 0.25, 0, 900, 'bandpass'); },
    kick() { tone(150, 0.15, 'sine', 0.5, 0, 45); },
    snare() { noise(0.12, 0.25, 0, 3000, 'highpass'); },
    hat() { noise(0.04, 0.12, 0, 7000, 'highpass'); },
    crash() { noise(0.9, 0.6, 0, 2500); tone(80, 0.5, 'square', 0.25, 0, 40); [0.1, 0.2, 0.32].forEach(w => noise(0.15, 0.4, w, 5000, 'highpass')); },
    scream(dur) {
      // screamer: its own loud chain past the master volume, overdriven on purpose so it sounds harsh
      if (!ctx || muted) return;
      dur = dur || 1.4;
      const t = ctx.currentTime;
      const out = ctx.createGain(); out.gain.value = 1.0;
      const drive = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); }
      drive.curve = curve;
      // a compressor squeezes everything up to the maximum level the browser allows
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -30; comp.ratio.value = 20; comp.attack.value = 0.001;
      const makeup = ctx.createGain(); makeup.gain.value = 2.5;
      drive.connect(comp); comp.connect(makeup); makeup.connect(out); out.connect(ctx.destination);
      const voice = (type, f0, f1, vol, start, len) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t + start); o.frequency.exponentialRampToValueAtTime(f1, t + start + len);
        g.gain.setValueAtTime(vol, t + start); g.gain.setValueAtTime(vol, t + start + len * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + start + len);
        o.connect(g); g.connect(drive); o.start(t + start); o.stop(t + start + len + 0.05);
      };
      // a sudden hit, a rising shriek of detuned saws, a piercing whistle and a low boom
      const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i < len * 0.9 ? 1 : (len - i) / (len * 0.1));
      const ns = ctx.createBufferSource(); ns.buffer = buf; const ng = ctx.createGain(); ng.gain.value = 0.9; ns.connect(ng); ng.connect(drive); ns.start(t);
      [300, 317, 351, 402, 455].forEach(f => voice('sawtooth', f, f * 5, 0.45, 0, dur));
      voice('square', 2600, 3400, 0.25, 0.05, dur - 0.05);
      voice('sine', 70, 28, 1.0, 0, dur * 0.8);
      [2900, 3100].forEach(f => voice('sawtooth', f, f * 1.3, 0.35, 0, dur));
    },
    fire() { for (let i = 0; i < 14; i++) noise(0.08, 0.25, i * 0.12 + Math.random() * 0.05, 1200); noise(1.8, 0.2, 0, 500); },
    alarm() { for (let i = 0; i < 6; i++) tone(i % 2 ? 1400 : 1000, 0.25, 'square', 0.12, i * 0.28); },
    car() { tone(60, 2.2, 'sawtooth', 0.15, 0, 90); noise(2.0, 0.08, 0, 300); tone(400, 0.25, 'square', 0.12, 2.3); tone(400, 0.25, 'square', 0.12, 2.65); },
    keys() { for (let i = 0; i < 5; i++) tone(3000 + Math.random() * 2000, 0.05, 'triangle', 0.08, i * 0.06); noise(0.2, 0.3, 0.5, 500); },
    music(mode) {
      // mode: 'day' (cosy) | 'night' (quiet, tense) | null
      if (musicMode === mode) return;
      musicMode = mode;
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      if (!mode) return;
      const chase = [330, 311, 330, 311, 349, 0, 330, 0, 294, 277, 294, 277, 311, 0, 294, 0];
      const day = [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1046, 988, 784, 659, 587];
      const night = [220, 0, 262, 0, 247, 0, 196, 0, 220, 0, 294, 0, 262, 0, 233, 0];
      musicTimer = setInterval(() => {
        if (mode === 'chase') {
          const f = chase[musicStep++ % chase.length];
          if (f) tone(f, 0.14, 'square', 0.04);
          if (musicStep % 2) tone(60, 0.12, 'sine', 0.25, 0, 40);
          return;
        }
        const seq = mode === 'day' ? day : night;
        const f = seq[musicStep++ % seq.length];
        if (f) tone(f, mode === 'day' ? 0.3 : 0.9, mode === 'day' ? 'triangle' : 'sine', mode === 'day' ? 0.035 : 0.05);
        if (mode === 'day' && musicStep % 4 === 1) tone(f / 2, 0.5, 'sine', 0.03);
      }, mode === 'chase' ? 160 : mode === 'day' ? 300 : 600);
    },
  };
  return S;
})();
