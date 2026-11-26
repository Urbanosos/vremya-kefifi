// Kefifi's room in 3D, built from simple shapes after the reference video (комната/).
// Everything is procedural: textures are drawn on canvas, so the game runs from file:// without a server.
window.Room = (function () {
  const T = THREE;
  const R = CFG.room;
  const HW = R.w / 2, HD = R.d / 2;

  // Interior rectangles of the rooms and the doorways between them (used by navigation and gameplay).
  const ZONES = {
    K: { x1: -2, x2: 2, z1: -1.7, z2: 1.7, name: 'комната Кэфифи' },
    P: { x1: 2.1, x2: 6.1, z1: -1.7, z2: 1.7, name: 'комната родителей' },
    T1: { x1: -4.0, x2: -2.1, z1: 0, z2: 1.7, name: 'туалет' },
    T2: { x1: -6.0, x2: -4.1, z1: 0, z2: 1.7, name: 'второй туалет' },
    C: { x1: -6.0, x2: 6.1, z1: 1.8, z2: 3.3, name: 'коридор' },
    L: { x1: -6.0, x2: 2.0, z1: 3.4, z2: 8.4, name: 'кухня-гостиная' },
  };
  // door: [zoneA, zoneB, x, z] — all doorways sit in walls that run along x
  const DOORS = [['K', 'C', -0.62, 1.75], ['P', 'C', 3.05, 1.75], ['T1', 'C', -3.05, 1.75], ['T2', 'C', -5.05, 1.75], ['C', 'L', -1.2, 3.35]];

  const mats = {};
  function mat(color, opts) {
    const key = color + JSON.stringify(opts || {});
    if (!mats[key]) mats[key] = new T.MeshLambertMaterial(Object.assign({ color }, opts || {}));
    return mats[key];
  }

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 4;
    return t;
  }

  // ---------- procedural textures ----------
  function floorTex() {
    return canvasTex(512, 512, (g, w, h) => {
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        let x = -((r * 137) % 300);
        while (x < w) {
          const len = 260 + ((r * 31 + x) % 140);
          const shade = 205 + ((r * 13 + Math.floor(x)) % 22);
          g.fillStyle = `rgb(${shade},${shade},${shade + 4})`;
          g.fillRect(x, r * h / rows, len, h / rows);
          g.strokeStyle = 'rgba(120,120,130,.35)';
          g.strokeRect(x + .5, r * h / rows + .5, len, h / rows);
          for (let k = 0; k < 6; k++) {
            g.strokeStyle = `rgba(150,150,160,${0.08 + k * 0.01})`;
            g.beginPath();
            const yy = r * h / rows + 6 + k * 9;
            g.moveTo(x + 4, yy); g.bezierCurveTo(x + len * .3, yy + 3, x + len * .6, yy - 3, x + len - 4, yy + 1);
            g.stroke();
          }
          x += len;
        }
      }
    }, [2, 2]);
  }

  function fluffyTex(base, dark) {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        g.strokeStyle = Math.random() < .5 ? dark : 'rgba(255,255,255,.35)';
        g.lineWidth = 1;
        const x = Math.random() * w, y = Math.random() * h, a = Math.random() * 6.3;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.stroke();
      }
    }, [2, 2]);
  }

  function tileTex(a, b, n) {
    return canvasTex(256, 256, (g, w, h) => {
      const s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * s, j * s, s, s); }
      g.strokeStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
    }, [3, 3]);
  }

  function rugTex() {
    return canvasTex(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#fff4f7';
      g.beginPath(); g.ellipse(w / 2, h / 2 + 20, 220, 190, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(120, 120, 70, 60, -.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(392, 120, 70, 60, .5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#f3b7c9'; g.lineWidth = 10;
      g.beginPath(); g.ellipse(w / 2, h / 2 + 20, 214, 184, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#4a3b45';
      g.beginPath(); g.ellipse(190, 280, 16, 22, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(322, 280, 16, 22, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f7a5bd';
      g.beginPath(); g.ellipse(256, 320, 20, 14, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(150, 330, 26, 14, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(362, 330, 26, 14, 0, 0, Math.PI * 2); g.fill();
    });
  }

  // Cute posters of our own (no third-party characters).
  const POSTERS = [
    (g, w, h) => { bg(g, w, h, '#ffd6e5'); strawberry(g, w / 2, h / 2 + 10, 70); stars(g, w, h, '#fff'); title(g, w, 'Клубничка'); },
    (g, w, h) => { bg(g, w, h, '#d9f3ec'); cupcake(g, w / 2, h / 2 + 20, 60); stars(g, w, h, '#ffb3cf'); title(g, w, 'Кекс'); },
    (g, w, h) => { bg(g, w, h, '#e7ddff'); bunny(g, w / 2, h / 2 + 20, 60); stars(g, w, h, '#fff7b0'); title(g, w, 'Зайка'); },
    (g, w, h) => { bg(g, w, h, '#fff3c4'); rainbow(g, w / 2, h / 2 + 50, 90); stars(g, w, h, '#ff9fc2'); title(g, w, 'Радуга'); },
    (g, w, h) => { bg(g, w, h, '#ffe0f0'); kitty(g, w / 2, h / 2 + 15, 62); hearts(g, w, h); title(g, w, 'Мяу'); },
    (g, w, h) => { bg(g, w, h, '#d5ecff'); bigStar(g, w / 2, h / 2 + 10, 70); stars(g, w, h, '#fff'); title(g, w, 'Звезда'); },
    (g, w, h) => { bg(g, w, h, '#ffeedd'); lollipop(g, w / 2, h / 2, 55); hearts(g, w, h); title(g, w, 'Сладкое'); },
    (g, w, h) => { bg(g, w, h, '#f2ffe0'); ghost(g, w / 2, h / 2 + 10, 55); stars(g, w, h, '#c9b6ff'); title(g, w, 'Бу!'); },
  ];
  function bg(g, w, h, c) {
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  }
  function title(g, w, text) {
    g.fillStyle = '#7a4560'; g.font = 'bold 28px sans-serif'; g.textAlign = 'center'; g.fillText(text, w / 2, 44);
  }
  function stars(g, w, h, c) {
    g.fillStyle = c;
    for (let i = 0; i < 14; i++) { const x = (i * 71) % w, y = 60 + (i * 113) % (h - 70); star(g, x, y, 5 + (i % 3) * 2); }
  }
  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  function hearts(g, w, h) {
    g.fillStyle = '#ff8fb5';
    for (let i = 0; i < 10; i++) heart(g, (i * 83) % w, 70 + (i * 97) % (h - 80), 7);
  }
  function heart(g, x, y, s) {
    g.beginPath(); g.moveTo(x, y + s);
    g.bezierCurveTo(x - s * 2, y - s * .5, x - s * .6, y - s * 1.8, x, y - s * .5);
    g.bezierCurveTo(x + s * .6, y - s * 1.8, x + s * 2, y - s * .5, x, y + s); g.fill();
  }
  function strawberry(g, x, y, s) {
    g.fillStyle = '#ff4f6d';
    g.beginPath(); g.moveTo(x - s, y - s * .5); g.quadraticCurveTo(x, y - s * 1.1, x + s, y - s * .5); g.quadraticCurveTo(x + s * .7, y + s * .9, x, y + s * 1.2); g.quadraticCurveTo(x - s * .7, y + s * .9, x - s, y - s * .5); g.fill();
    g.fillStyle = '#ffe9a8';
    for (let i = 0; i < 12; i++) { g.beginPath(); g.ellipse(x - s * .6 + (i % 4) * s * .4, y - s * .2 + Math.floor(i / 4) * s * .4, 3, 5, 0, 0, 7); g.fill(); }
    g.fillStyle = '#58b85a';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(x - s * .5 + i * s * .25, y - s * .75, s * .18, s * .08, (i - 2) * .4, 0, 7); g.fill(); }
  }
  function cupcake(g, x, y, s) {
    g.fillStyle = '#8fd8c8'; g.beginPath(); g.moveTo(x - s * .8, y); g.lineTo(x + s * .8, y); g.lineTo(x + s * .55, y + s); g.lineTo(x - s * .55, y + s); g.fill();
    g.fillStyle = '#ffb6d0';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x, y - i * s * .35, s * (.9 - i * .22), s * .3, 0, 0, 7); g.fill(); }
    g.fillStyle = '#ff4f6d'; g.beginPath(); g.arc(x, y - s * 1.05, s * .14, 0, 7); g.fill();
  }
  function face(g, x, y, s) {
    g.fillStyle = '#4a3b45';
    g.beginPath(); g.arc(x - s * .3, y, s * .08, 0, 7); g.fill();
    g.beginPath(); g.arc(x + s * .3, y, s * .08, 0, 7); g.fill();
    g.fillStyle = '#ff9fbd';
    g.beginPath(); g.ellipse(x - s * .5, y + s * .2, s * .12, s * .07, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(x + s * .5, y + s * .2, s * .12, s * .07, 0, 0, 7); g.fill();
    g.strokeStyle = '#4a3b45'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y + s * .12, s * .1, .2, Math.PI - .2); g.stroke();
  }
  function bunny(g, x, y, s) {
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(x - s * .35, y - s * 1.1, s * .2, s * .6, -.15, 0, 7); g.fill();
    g.beginPath(); g.ellipse(x + s * .35, y - s * 1.1, s * .2, s * .6, .15, 0, 7); g.fill();
    g.beginPath(); g.arc(x, y, s * .85, 0, 7); g.fill();
    face(g, x, y, s);
  }
  function kitty(g, x, y, s) {
    g.fillStyle = '#ffd59e';
    g.beginPath(); g.moveTo(x - s * .9, y - s * .3); g.lineTo(x - s * .6, y - s * 1.2); g.lineTo(x - s * .1, y - s * .7); g.fill();
    g.beginPath(); g.moveTo(x + s * .9, y - s * .3); g.lineTo(x + s * .6, y - s * 1.2); g.lineTo(x + s * .1, y - s * .7); g.fill();
    g.beginPath(); g.ellipse(x, y, s, s * .8, 0, 0, 7); g.fill();
    face(g, x, y, s);
  }
  function rainbow(g, x, y, s) {
    ['#ff8fa3', '#ffc078', '#fff07a', '#9be59b', '#8fc8ff', '#c7a6ff'].forEach((c, i) => {
      g.strokeStyle = c; g.lineWidth = 12; g.beginPath(); g.arc(x, y, s - i * 12, Math.PI, 0); g.stroke();
    });
    g.fillStyle = '#fff';
    [x - s + 30, x + s - 30].forEach(cx => { g.beginPath(); g.arc(cx - 14, y, 16, 0, 7); g.arc(cx + 10, y - 6, 20, 0, 7); g.arc(cx + 28, y + 2, 14, 0, 7); g.fill(); });
  }
  function bigStar(g, x, y, s) { g.fillStyle = '#ffe066'; star(g, x, y, s); face(g, x, y + 8, s * .55); }
  function lollipop(g, x, y, s) {
    g.fillStyle = '#c7a37a'; g.fillRect(x - 4, y + s * .6, 8, s * 1.2);
    const cs = ['#ff8fb5', '#fff', '#a6e3ff', '#fff'];
    for (let i = 0; i < 8; i++) { g.fillStyle = cs[i % 4]; g.beginPath(); g.arc(x, y, s - i * 7, 0, 7); g.fill(); }
  }
  function ghost(g, x, y, s) {
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(x, y - s * .2, s * .8, Math.PI, 0); g.lineTo(x + s * .8, y + s * .9);
    for (let i = 0; i < 4; i++) g.quadraticCurveTo(x + s * .8 - (i + .5) * s * .4, y + s * (i % 2 ? .9 : .6), x + s * .8 - (i + 1) * s * .4, y + s * .9);
    g.fill();
    face(g, x, y - s * .1, s * .8);
  }

  function posterTex(i) { return canvasTex(256, 340, POSTERS[i % POSTERS.length]); }

  function doorTex() {
    return canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#f7f7f9'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2b2b30'; g.lineWidth = 3;
      const cx = 130, cy = 170;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70); g.stroke(); }
      for (let r = 15; r <= 70; r += 14) { g.beginPath(); for (let i = 0; i <= 8; i++) { const a = i * Math.PI / 4; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.stroke(); }
      g.fillStyle = '#2b2b30';
      g.beginPath(); g.ellipse(100, 330, 12, 24, -.2, 0, 7); g.fill();
      g.beginPath(); g.ellipse(160, 330, 12, 24, .2, 0, 7); g.fill();
      g.beginPath(); g.moveTo(118, 380); g.lineTo(142, 380); g.lineTo(130, 405); g.fill();
    });
  }

  function tvTex(mode, t) {
    // mode: 'off' | 'on' (cartoon) | 'broken'
    if (!tvTex.c) { tvTex.c = document.createElement('canvas'); tvTex.c.width = 320; tvTex.c.height = 180; tvTex.t = new T.CanvasTexture(tvTex.c); tvTex.t.colorSpace = T.SRGBColorSpace; }
    const g = tvTex.c.getContext('2d'), w = 320, h = 180;
    if (mode === 'on') {
      g.fillStyle = '#9fe0ff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#8be08b'; g.fillRect(0, 130, w, 50);
      g.fillStyle = '#ffe066'; g.beginPath(); g.arc(270, 40, 22, 0, 7); g.fill();
      const bx = (t * 90) % (w + 80) - 40, by = 120 - Math.abs(Math.sin(t * 5)) * 50;
      g.save(); g.translate(bx, by); bunny(g, 0, 0, 22); g.restore();
      g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.fillText('Мультик!', 12, 28);
    } else if (mode === 'broken') {
      g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ccc'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(160, 90);
      [[30, 10], [300, 20], [20, 170], [290, 160], [160, 0]].forEach(([x, y]) => { g.moveTo(160, 90); g.lineTo((160 + x) / 2 + 10, (90 + y) / 2 - 8); g.lineTo(x, y); });
      g.stroke();
    } else {
      g.fillStyle = '#16161c'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(10, 10, 120, 60);
    }
    tvTex.t.needsUpdate = true;
    return tvTex.t;
  }

  // ---------- building ----------
  function build() {
    const scene = new T.Scene();
    scene.background = new T.Color('#2a2230');
    const colliders = [];
    const obj = { extraWindows: [] };

    const add = (mesh, parent) => { (parent || scene).add(mesh); return mesh; };
    // box with its bottom at y
    function box(w, h, d, material, x, y, z, parent) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), typeof material === 'string' ? mat(material) : material);
      m.position.set(x, y + h / 2, z);
      return add(m, parent);
    }
    function collide(x1, x2, z1, z2) { colliders.push({ minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2) }); }

    // Kefifi's room floor; walls, ceiling and the other rooms are built by buildHouse() below
    const floor = new T.Mesh(new T.PlaneGeometry(R.w, R.d), new T.MeshLambertMaterial({ map: floorTex() }));
    floor.rotation.x = -Math.PI / 2; add(floor);
    // thin pink line under the ceiling, like in the video
    [[0, -HD + 0.003, 0, R.w], [0, HD - 0.003, Math.PI, R.w], [-HW + 0.003, 0, Math.PI / 2, R.d], [HW - 0.003, 0, -Math.PI / 2, R.d]].forEach(([x, z, ry, len]) => {
      const ln = new T.Mesh(new T.PlaneGeometry(len, 0.02), mat('#f3c3d3')); ln.position.set(x, R.h - 0.25, z); ln.rotation.y = ry; add(ln);
    });

    // ceiling spot lamps
    obj.spots = [];
    [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.8], [0.9, 0.8]].forEach(([x, z]) => {
      const s = new T.Mesh(new T.CircleGeometry(0.06, 16), new T.MeshBasicMaterial({ color: '#fffbe8' }));
      s.rotation.x = Math.PI / 2; s.position.set(x, R.h - 0.002, z); add(s); obj.spots.push(s);
    });

    // ---- bed in the back-left corner, pink and fluffy ----
    const bed = new T.Group(); add(bed);
    box(1.45, 0.3, 2.0, '#a2848f', -1.275, 0, -0.7, bed);                       // frame
    box(1.4, 0.18, 1.95, '#ffffff', -1.275, 0.3, -0.7, bed);                     // mattress
    const blanket = new T.MeshLambertMaterial({ map: fluffyTex('#f7a8c3', 'rgba(210,90,140,.35)') });
    box(1.5, 0.12, 1.55, blanket, -1.27, 0.44, -0.45, bed);                      // fluffy blanket
    box(1.5, 0.5, 0.08, '#9c7d89', -1.275, 0.15, -1.66, bed);                    // headboard
    box(0.5, 0.14, 0.32, '#c9b8f0', -1.6, 0.48, -1.4, bed);                      // pillows
    box(0.5, 0.14, 0.32, '#ffd1e0', -1.0, 0.48, -1.42, bed);
    obj.pillow = box(0.42, 0.12, 0.28, '#ffffff', -1.3, 0.6, -1.3, bed);
    collide(-HW, -0.55, -HD, 0.3);
    // plushies on the bed
    plush(bed, -1.75, 0.56, -1.25, '#ffffff', 0.13);
    plush(bed, -1.45, 0.56, -1.0, '#f2d0a4', 0.11);
    plush(bed, -0.85, 0.56, -1.2, '#ffffff', 0.15, true);
    plush(bed, -1.15, 0.56, -1.5, '#3b3438', 0.1);
    plush(bed, -0.75, 0.56, -0.9, '#ffb3cf', 0.1);
    // long cow-pattern body pillow
    const bp = new T.Mesh(new T.CapsuleGeometry(0.11, 0.7, 6, 12), mat('#f4f4f4')); bp.rotation.z = Math.PI / 2; bp.position.set(-1.3, 0.62, -0.75); bed.add(bp);
    [[-1.5, -0.65], [-1.1, -0.82], [-1.25, -0.68]].forEach(([x, z]) => { const s = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), mat('#2f2a2e')); s.position.set(x, 0.72, z); s.scale.y = .4; bed.add(s); });

    // ---- window with dusty-pink curtains on the back wall ----
    box(1.1, 1.3, 0.04, new T.MeshBasicMaterial({ color: '#2b3557' }), 0.45, 0.9, -HD + 0.02);  // evening sky
    obj.windowGlass = scene.children[scene.children.length - 1];
    box(1.16, 0.05, 0.08, '#ffffff', 0.45, 0.88, -HD + 0.04);
    box(1.16, 0.05, 0.08, '#ffffff', 0.45, 2.18, -HD + 0.04);
    box(0.05, 1.3, 0.08, '#ffffff', 0.45, 0.9, -HD + 0.04);
    box(1.6, 0.03, 0.03, '#888', 0.45, 2.38, -HD + 0.14);
    const curtain = mat('#c4848f');
    for (let i = 0; i < 7; i++) {
      [-0.12, 1.02].forEach(cx => {
        const c = new T.Mesh(new T.CylinderGeometry(0.035, 0.045, 2.3, 8), curtain);
        c.position.set(cx + (i - 3) * 0.045, 1.2, -HD + 0.14 + (i % 2) * 0.03); add(c);
      });
    }

    // ---- floor fan next to the window ----
    const fan = new T.Group(); fan.position.set(-0.35, 0, -1.4); add(fan);
    box(0.32, 0.03, 0.32, '#f2f2f2', 0, 0, 0, fan);
    const pole = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 1.1, 8), mat('#f2f2f2')); pole.position.y = 0.55; fan.add(pole);
    const head = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.08, 20, 1, true), mat('#f8f8f8', { side: T.DoubleSide })); head.rotation.x = Math.PI / 2; head.position.y = 1.15; fan.add(head);
    obj.fanBlades = new T.Group(); obj.fanBlades.position.set(0, 1.15, 0.01); fan.add(obj.fanBlades);
    for (let i = 0; i < 3; i++) { const b = new T.Mesh(new T.BoxGeometry(0.06, 0.18, 0.01), mat('#e4f3fb')); b.position.y = 0.09; const p = new T.Group(); p.rotation.z = i * 2.09; p.add(b); obj.fanBlades.add(p); }
    collide(-0.52, -0.18, -HD, -1.22);

    // ---- low toy chest in the back-right corner ----
    box(0.75, 0.45, 0.4, '#f4f4f4', 1.55, 0, -1.45);
    box(0.33, 0.02, 0.01, '#ddd', 1.55, 0.3, -1.249);
    plush(scene, 1.35, 0.45, -1.45, '#ffb3cf', 0.08); plush(scene, 1.6, 0.45, -1.5, '#ffffff', 0.1, true); plush(scene, 1.82, 0.45, -1.42, '#a6e3ff', 0.07);
    collide(1.15, HW, -HD, -1.22);

    // ---- white shelving with toys on the right wall ----
    const shelf = new T.Group(); shelf.position.set(HW - 0.2, 0, -0.35); add(shelf);
    const sw = 0.38, sl = 1.25, sh = 1.9;
    box(sw, 0.03, sl, '#fafafa', 0, 0, 0, shelf);
    for (let i = 1; i <= 4; i++) box(sw, 0.03, sl, '#fafafa', 0, i * sh / 4 - 0.03, 0, shelf);
    [-sl / 2, -sl / 6, sl / 6, sl / 2].forEach(z => box(sw, sh, 0.03, '#fafafa', 0, 0, z, shelf));
    box(0.02, sh, sl, '#efefef', sw / 2 - 0.01, 0, 0, shelf);
    const toyCols = ['#ff9fbd', '#fff', '#a6e3ff', '#ffe066', '#c7a6ff', '#9be59b', '#ff6f91', '#f2d0a4'];
    let k = 0;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
      for (let n = 0; n < 3; n++) {
        const y = row * sh / 4 + 0.01, z = -sl / 2 + sl / 6 + col * sl / 3 + (n - 1) * 0.11;
        const c = toyCols[(k++ * 5) % toyCols.length];
        if ((row + col + n) % 3 === 0) plush(shelf, -0.02, y, z, c, 0.06);
        else if ((row + n) % 2) { const f = new T.Mesh(new T.CylinderGeometry(0.03, 0.04, 0.16, 8), mat(c)); f.position.set(-0.03, y + 0.08, z); shelf.add(f); const hd = new T.Mesh(new T.SphereGeometry(0.045, 10, 8), mat('#ffe3d1')); hd.position.set(-0.03, y + 0.2, z); shelf.add(hd); const hair = new T.Mesh(new T.SphereGeometry(0.05, 10, 8, 0, 6.3, 0, 1.6), mat(toyCols[(k + 3) % 8])); hair.position.copy(hd.position); shelf.add(hair); }
        else { box(0.09, 0.12, 0.09, c, -0.04, y, z, shelf); }
      }
    }
    collide(HW - 0.4, HW, -0.35 - sl / 2, -0.35 + sl / 2);

    // ---- desk with drawers + candle, pink gaming chair ----
    const desk = new T.Group(); desk.position.set(HW - 0.32, 0, 0.95); add(desk);
    box(0.6, 0.04, 1.2, '#fbfbfb', 0, 0.72, 0, desk);
    box(0.55, 0.72, 0.4, '#f4f4f4', 0, 0, 0.38, desk);
    for (let i = 0; i < 3; i++) { box(0.01, 0.2, 0.36, '#e8e8e8', -0.276, 0.06 + i * 0.22, 0.38, desk); box(0.012, 0.02, 0.18, '#999', -0.285, 0.15 + i * 0.22, 0.38, desk); }
    box(0.03, 0.72, 0.55, '#f4f4f4', 0, 0, -0.32, desk);
    box(0.4, 0.01, 0.3, '#3b3438', -0.05, 0.76, -0.25, desk);           // tablet with stickers
    box(0.3, 0.01, 0.22, '#ffd1e0', -0.05, 0.765, 0.1, desk);
    // candle (the fire ending depends on it)
    obj.candle = new T.Group(); obj.candle.position.set(-0.12, 0.76, 0.42); desk.add(obj.candle);
    const cw = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.12, 12), mat('#fff3e0')); cw.position.y = 0.06; obj.candle.add(cw);
    const dish = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.015, 16), mat('#d9c2a0')); obj.candle.add(dish);
    obj.flame = new T.Mesh(new T.SphereGeometry(0.018, 8, 8), new T.MeshBasicMaterial({ color: '#ffb347' }));
    obj.flame.scale.set(1, 1.8, 1); obj.flame.position.y = 0.15; obj.candle.add(obj.flame);
    obj.flame.visible = false;
    obj.candleLight = new T.PointLight('#ff9a3c', 0, 3.5, 1.5); obj.candleLight.position.set(HW - 0.45, 1.0, 1.37); add(obj.candleLight);
    collide(HW - 0.62, HW, 0.35, 1.55);
    const chair = new T.Group(); chair.position.set(1.2, 0, 0.95); add(chair);
    box(0.45, 0.08, 0.45, '#f5f5f5', 0, 0.42, 0, chair);
    box(0.08, 0.7, 0.45, '#ffb6cc', -0.22, 0.48, 0, chair);
    box(0.06, 0.3, 0.3, '#fff', -0.23, 0.75, 0, chair);
    const cp = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.4, 8), mat('#bbb')); cp.position.y = 0.2; chair.add(cp);
    box(0.5, 0.03, 0.08, '#999', 0, 0.02, 0, chair); box(0.08, 0.03, 0.5, '#999', 0, 0.02, 0, chair);
    // cat ears on the chair, like in the video
    [-0.12, 0.12].forEach(z => { const e = new T.Mesh(new T.ConeGeometry(0.05, 0.1, 4), mat('#ffb6cc')); e.position.set(-0.22, 1.22, z); chair.add(e); });
    collide(0.95, 1.45, 0.7, 1.2);

    // ---- wardrobe on the front wall (the key is hidden inside) ----
    const wr = new T.Group(); wr.position.set(0.7, 0, HD - 0.3); add(wr);
    box(0.9, 2.1, 0.58, '#f7f7f7', 0, 0, 0, wr);
    box(0.01, 2.0, 0.01, '#ddd', 0, 0.05, -0.291, wr);
    obj.wardrobeDoor = new T.Group(); obj.wardrobeDoor.position.set(-0.45, 0, -0.3); wr.add(obj.wardrobeDoor);
    box(0.45, 2.0, 0.02, '#fbfbfb', 0.225, 0.05, 0, obj.wardrobeDoor);
    box(0.02, 0.25, 0.03, '#b98', 0.41, 1.0, -0.02, obj.wardrobeDoor);
    box(0.02, 0.25, 0.03, '#b98', 0.04, 1.0, -0.3, wr);
    box(0.8, 0.02, 0.5, '#eee', 0, 1.0, 0, wr);
    obj.key = new T.Group(); obj.key.visible = false; obj.key.position.set(-0.2, 1.03, -0.05); wr.add(obj.key);
    const kr = new T.Mesh(new T.TorusGeometry(0.03, 0.01, 6, 12), new T.MeshLambertMaterial({ color: '#ffd24a', emissive: '#5a4300' })); kr.rotation.x = Math.PI / 2; obj.key.add(kr);
    const ks = new T.Mesh(new T.BoxGeometry(0.1, 0.012, 0.015), new T.MeshLambertMaterial({ color: '#ffd24a', emissive: '#5a4300' })); ks.position.x = 0.075; obj.key.add(ks);
    collide(0.25, 1.15, HD - 0.6, HD);

    // ---- door with the spider web on the front wall ----
    obj.door = new T.Group(); obj.door.position.set(-1.05, 0, HD - 0.02); obj.door.rotation.y = 1.45; add(obj.door);
    const dm = new T.Mesh(new T.BoxGeometry(0.85, 2.05, 0.04), new T.MeshLambertMaterial({ map: doorTex() }));
    dm.position.set(0.425, 1.025, 0); dm.rotation.y = Math.PI; obj.door.add(dm);
    box(0.03, 0.03, 0.12, '#333', 0.75, 1.0, -0.05, obj.door);
    box(0.95, 0.05, 0.05, '#ececec', -0.6, 2.05, HD - 0.02);
    // pink backpack hanging on the handle
    const bag = new T.Mesh(new T.SphereGeometry(0.14, 12, 10), mat('#f6b8cc')); bag.scale.set(1, 1.3, 0.6); bag.position.set(-1.3, 0.78, HD - 0.1); add(bag);

    // ---- clothes rack in the front-left corner ----
    const rack = new T.Group(); rack.position.set(-1.65, 0, 1.15); add(rack);
    [-0.35, 0.35].forEach(z => { const p = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 1.6, 6), mat('#444')); p.position.set(0, 0.8, z); rack.add(p); });
    const bar = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.75, 6), mat('#444')); bar.rotation.x = Math.PI / 2; bar.position.y = 1.58; rack.add(bar);
    ['#8fa9c8', '#c7a6ff', '#f2f2f2', '#ff9fbd', '#9ec7a8'].forEach((c, i) => box(0.06, 0.7, 0.14, c, (i % 2) * 0.03, 0.85, -0.28 + i * 0.14, rack));
    collide(-HW, -1.45, 0.7, 1.6);

    // ---- rug, lanterns, posters ----
    const rug = new T.Mesh(new T.PlaneGeometry(1.1, 1.1), new T.MeshLambertMaterial({ map: rugTex(), transparent: true }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(-0.3, 0.004, 0.55); add(rug);
    [[-1.4, -0.9], [-0.6, -1.3], [0.1, 0.2]].forEach(([x, z], i) => {
      const l = new T.Mesh(new T.SphereGeometry(0.17, 14, 12), new T.MeshLambertMaterial({ color: i === 2 ? '#ffffff' : '#ff9fb2', emissive: '#4a1f2a' }));
      l.scale.y = 1.15; l.position.set(x, R.h - 0.55, z); add(l);
      const str = new T.Mesh(new T.CylinderGeometry(0.003, 0.003, 0.37, 4), mat('#888')); str.position.set(x, R.h - 0.18, z); add(str);
    });
    const posterSpots = [
      // [x, y, z, rotY, w, h]
      [-HW + 0.005, 1.55, -1.2, Math.PI / 2, 0.5, 0.66], [-HW + 0.005, 1.45, -0.45, Math.PI / 2, 0.38, 0.5],
      [-HW + 0.005, 1.9, 0.2, Math.PI / 2, 0.36, 0.48], [-HW + 0.005, 1.35, 0.25, Math.PI / 2, 0.3, 0.4],
      [-1.4, 1.65, -HD + 0.005, 0, 0.6, 0.8], [-0.75, 1.75, -HD + 0.005, 0, 0.34, 0.45],
      [HW - 0.005, 2.2, -0.6, -Math.PI / 2, 0.36, 0.48], [HW - 0.005, 2.2, 0.1, -Math.PI / 2, 0.36, 0.48],
      [HW - 0.005, 1.4, 1.0, -Math.PI / 2, 0.4, 0.53], [HW - 0.005, 1.95, 1.3, -Math.PI / 2, 0.3, 0.4],
      [1.65, 1.95, HD - 0.005, Math.PI, 0.32, 0.42], [-1.75, 1.8, HD - 0.005, Math.PI, 0.36, 0.48],
    ];
    posterSpots.forEach((p, i) => {
      const m = new T.Mesh(new T.PlaneGeometry(p[4], p[5]), new T.MeshLambertMaterial({ map: posterTex(i) }));
      m.position.set(p[0], p[1], p[2]); m.rotation.y = p[3]; add(m);
    });
    // little stickers scattered over the walls
    for (let i = 0; i < 40; i++) {
      const wall = i % 3, c = toyCols[i % toyCols.length];
      const s = new T.Mesh(new T.CircleGeometry(0.035 + (i % 3) * 0.01, 10), mat(c));
      if (wall === 0) { s.position.set(-HW + 0.006, 0.9 + (i * 37 % 100) / 100 * 1.3, -1.6 + (i * 53 % 100) / 100 * 2.0); s.rotation.y = Math.PI / 2; }
      else if (wall === 1) { s.position.set(-1.9 + (i * 41 % 100) / 100 * 1.5, 1.0 + (i * 29 % 100) / 100 * 1.4, -HD + 0.006); }
      else { s.position.set(HW - 0.006, 1.95 + (i * 17 % 100) / 100 * 0.5, -1.0 + (i * 61 % 100) / 100 * 2.6); s.rotation.y = -Math.PI / 2; }
      add(s);
    }

    // ---- lights ----
    obj.hemi = new T.HemisphereLight('#fff6f0', '#c9b6c0', 1.6); add(obj.hemi);
    obj.ceilLights = [[0.1, 0.1, 9], [4.1, 0, 7], [0, 2.55, 5], [-4, 1.0, 4], [-3.6, 5.6, 9], [0.2, 6.2, 9]].map(([x, z, k]) => {
      const l = new T.PointLight('#fff1dd', k, 7, 1.6); l.position.set(x, R.h - 0.3, z); l.userData.k = k; add(l); return l;
    });
    buildHouse();
    obj.nightLight = new T.PointLight('#9d8cff', 0, 3, 1.5); obj.nightLight.position.set(-1.8, 0.5, -1.5); add(obj.nightLight);
    obj.fireLight = new T.PointLight('#ff4a1c', 0, 8, 1.2); obj.fireLight.position.set(HW - 0.5, 1.0, 1.2); add(obj.fireLight);

    // ================= the rest of the flat =================
    // Rooms (interior rectangles), walls are 0.1 m thick boxes between them. Kefifi's room is ZONES.K.
    function buildHouse() {
      const H = R.h, Z = ZONES;
      const wallK = mat('#f6f1f4'), wallO = mat('#f4ece4'), wallT = mat('#e3f1f3');
      // solid wall from x1..x2, z1..z2 with door gaps along its long side: gaps = [[a, b], ...]
      function wall(x1, x2, z1, z2, m, gaps) {
        const alongX = (x2 - x1) > (z2 - z1);
        const lo = alongX ? x1 : z1, hi = alongX ? x2 : z2;
        const cuts = (gaps || []).slice().sort((a, b) => a[0] - b[0]);
        let cur = lo;
        const seg = (a, b, y0, y1) => {
          if (b - a < 0.01) return;
          const w = alongX ? b - a : x2 - x1, d = alongX ? z2 - z1 : b - a;
          const cx = alongX ? (a + b) / 2 : (x1 + x2) / 2, cz = alongX ? (z1 + z2) / 2 : (a + b) / 2;
          box(w, y1 - y0, d, m, cx, y0, cz);
          if (y0 === 0) colliders.push(alongX ? { minX: a, maxX: b, minZ: z1, maxZ: z2 } : { minX: x1, maxX: x2, minZ: a, maxZ: b });
        };
        for (const [a, b] of cuts) { seg(cur, a, 0, H); seg(a, b, 2.05, H); cur = b; }
        seg(cur, hi, 0, H);
      }
      // Kefifi's room
      wall(-2.1, 2.0, -1.8, -1.7, wallK); wall(-2.1, -2.0, -1.8, 1.8, wallK); wall(2.0, 2.1, -1.8, 1.8, wallK);
      wall(-2.1, 2.0, 1.7, 1.8, wallK, [[-1.05, -0.2]]);
      // parents' room
      wall(2.0, 6.2, -1.8, -1.7, wallO); wall(6.1, 6.2, -1.8, 3.4, wallO); wall(2.0, 6.2, 1.7, 1.8, wallO, [[2.6, 3.5]]);
      // toilets
      wall(-6.1, -2.0, -0.1, 0, wallT); wall(-4.1, -4.0, 0, 1.7, wallT); wall(-6.1, -2.1, 1.7, 1.8, wallT, [[-3.4, -2.7], [-5.4, -4.7]]);
      // corridor and living room
      wall(-6.1, -6.0, -0.1, 8.5, wallO);
      wall(-6.1, 6.2, 3.3, 3.4, wallO, [[-2.2, -0.2]]);
      wall(2.0, 2.1, 3.4, 8.5, wallO); wall(-6.1, 2.1, 8.4, 8.5, wallO);

      const ceil = new T.Mesh(new T.PlaneGeometry(12.3, 10.3), mat('#f4f2f5'));
      ceil.rotation.x = Math.PI / 2; ceil.position.set(0.05, H, 3.35); add(ceil);
      const floorOf = (r, m) => { const f = new T.Mesh(new T.PlaneGeometry(r.x2 - r.x1, r.z2 - r.z1), m); f.rotation.x = -Math.PI / 2; f.position.set((r.x1 + r.x2) / 2, 0, (r.z1 + r.z2) / 2); add(f); };
      const tiles = new T.MeshLambertMaterial({ map: tileTex('#ffffff', '#cfe3ea', 6) });
      floorOf(Z.P, new T.MeshLambertMaterial({ map: fluffyTex('#e9dcef', 'rgba(150,120,170,.25)') }));
      floorOf(Z.T1, tiles); floorOf(Z.T2, tiles);
      floorOf(Z.C, new T.MeshLambertMaterial({ map: floorTex() }));
      floorOf({ x1: -6, x2: -3, z1: 3.4, z2: 8.4 }, new T.MeshLambertMaterial({ map: tileTex('#fff6ea', '#f0d9c9', 8) }));
      floorOf({ x1: -3, x2: 2, z1: 3.4, z2: 8.4 }, new T.MeshLambertMaterial({ map: floorTex() }));
      // lamp discs on the ceiling
      [[4.1, 0], [0, 2.55], [-3, 0.9], [-5, 0.9], [-3.6, 5.6], [0.2, 6.2], [4, 2.55]].forEach(([x, z]) => {
        const s = new T.Mesh(new T.CircleGeometry(0.09, 16), new T.MeshBasicMaterial({ color: '#fffbe8' }));
        s.rotation.x = Math.PI / 2; s.position.set(x, H - 0.002, z); add(s); obj.spots.push(s);
      });

      // ---- parents' room ----
      box(1.9, 0.32, 2.1, '#8d6e63', 4.1, 0, -0.6);                       // big bed
      box(1.85, 0.2, 2.05, '#ffffff', 4.1, 0.32, -0.6);
      box(1.95, 0.1, 1.5, '#a5b8d8', 4.1, 0.5, -0.3);                      // blanket
      box(2.0, 0.9, 0.08, '#7b5e55', 4.1, 0, -1.66);                       // headboard
      box(0.6, 0.14, 0.35, '#ffffff', 3.6, 0.52, -1.35); box(0.6, 0.14, 0.35, '#ffffff', 4.6, 0.52, -1.35);
      collide(3.1, 5.1, -1.7, 0.45);
      [2.75, 5.45].forEach(x => { box(0.45, 0.5, 0.4, '#efe2d0', x, 0, -1.45); box(0.38, 0.02, 0.01, '#b98', x, 0.32, -1.249); lamp(x, 0.5, -1.45); });
      obj.nightstand = { x: 5.45, z: -1.2 };
      collide(2.5, 3.0, -1.7, -1.2); collide(5.2, 5.7, -1.7, -1.2);
      box(0.6, 2.1, 1.3, '#f3ece2', 5.8, 0, 0.9); box(0.01, 1.9, 0.01, '#ccc', 5.494, 0.1, 0.9); collide(5.5, 6.1, 0.25, 1.55);  // wardrobe
      box(0.45, 0.85, 1.0, '#efe2d0', 2.33, 0, 0.9); collide(2.1, 2.55, 0.4, 1.4);                                              // dresser + mirror
      const mir = new T.Mesh(new T.PlaneGeometry(0.6, 0.8), new T.MeshBasicMaterial({ color: '#cfe6f2' })); mir.position.set(2.11, 1.45, 0.9); mir.rotation.y = Math.PI / 2; add(mir);
      windowOn(6.1, -0.6, -Math.PI / 2, '#a8b8d8');
      picture(2.11, 1.7, -0.4, Math.PI / 2, 3);

      // ---- toilets ----
      [[-3.05, 'Т1'], [-5.05, 'Т2']].forEach(([x], i) => {
        const g = new T.Group(); g.position.set(x, 0, 0); add(g);
        const bowl = new T.Mesh(new T.CylinderGeometry(0.2, 0.16, 0.4, 16), mat('#ffffff')); bowl.position.set(0, 0.2, 0.35); g.add(bowl);
        const seat = new T.Mesh(new T.TorusGeometry(0.17, 0.035, 8, 16), mat(i ? '#ffd6e5' : '#d5ecff')); seat.rotation.x = Math.PI / 2; seat.position.set(0, 0.42, 0.35); g.add(seat);
        box(0.4, 0.4, 0.18, '#ffffff', 0, 0.35, 0.09, g);                                  // tank
        box(0.45, 0.12, 0.35, '#ffffff', 0.62, 0.8, 0.3, g);                               // sink
        const ped = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 0.8, 10), mat('#ffffff')); ped.position.set(0.62, 0.4, 0.3); g.add(ped);
        const m = new T.Mesh(new T.PlaneGeometry(0.4, 0.5), new T.MeshBasicMaterial({ color: '#cfe6f2' })); m.position.set(0.62, 1.4, 0.005); g.add(m);
        const roll = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.1, 10), mat('#fff')); roll.rotation.z = Math.PI / 2; roll.position.set(-0.6, 0.7, 0.2); g.add(roll);
        collide(x - 0.25, x + 0.85, 0, 0.6);
      });

      // ---- corridor ----
      box(0.1, 2.05, 0.95, '#c98b6b', 6.08, 0, 2.75);                       // front door
      obj.frontDoor = { x: 6.05, z: 2.75 };
      box(0.05, 0.05, 0.14, '#c0a050', 6.0, 1.0, 2.45);
      box(0.4, 0.5, 0.35, '#efe2d0', 5.85, 0, 2.02); collide(5.65, 6.1, 1.8, 2.2);  // shoe rack
      [[5.3, 1.81], [4.9, 1.81]].forEach(([x, z]) => box(0.3, 0.6, 0.05, ['#8fa9c8', '#ff9fbd'][x > 5 ? 0 : 1], x, 1.1, z + 0.03)); // coats
      picture(-1.5, 1.6, 3.29, Math.PI, 1); picture(1.0, 1.6, 1.81, 0, 5);
      const runner = new T.Mesh(new T.PlaneGeometry(6, 0.8), mat('#e9c7d4')); runner.rotation.x = -Math.PI / 2; runner.position.set(1.5, 0.004, 2.55); add(runner);

      // ---- kitchen (west part of the big room) ----
      box(0.6, 0.9, 3.4, '#ffffff', -5.7, 0, 5.3); box(0.64, 0.04, 3.44, '#d8c3b0', -5.7, 0.9, 5.3); collide(-6.0, -5.38, 3.6, 7.0); // counter
      box(0.3, 0.7, 3.4, '#ffffff', -5.85, 1.5, 5.3);                                                                                // wall cupboards
      for (let i = 0; i < 5; i++) box(0.01, 0.6, 0.6, '#f0f0f0', -5.39, 0.15, 3.85 + i * 0.68);
      box(0.56, 0.02, 0.56, '#333', -5.7, 0.94, 4.4);                                                                                // stove
      [[-5.82, 4.27], [-5.58, 4.27], [-5.82, 4.53], [-5.58, 4.53]].forEach(([x, z]) => { const b = new T.Mesh(new T.CircleGeometry(0.08, 14), mat('#555')); b.rotation.x = -Math.PI / 2; b.position.set(x, 0.962, z); add(b); });
      box(0.5, 0.25, 0.6, '#d0d0d0', -5.75, 1.7, 4.4);                                                                               // hood
      box(0.4, 0.02, 0.5, '#bcd7e0', -5.7, 0.93, 6.1);                                                                               // sink
      const pan = new T.Mesh(new T.CylinderGeometry(0.15, 0.13, 0.08, 16), mat('#e85d93')); pan.position.set(-5.7, 1.0, 4.27); add(pan);
      // fridge in the corner: the freezer is the bottom drawer
      box(0.7, 1.95, 0.75, '#e8f6f3', -5.62, 0, 7.75); collide(-6.0, -5.25, 7.35, 8.4);
      box(0.01, 0.01, 0.7, '#9fb8b3', -5.265, 0.75, 7.75);
      box(0.03, 0.5, 0.04, '#9fb8b3', -5.25, 1.2, 7.5); box(0.03, 0.25, 0.04, '#9fb8b3', -5.25, 0.4, 7.5);
      [['#ff8fb5', 1.5], ['#ffe066', 1.3], ['#8fe0cf', 1.6]].forEach(([c, y], i) => { const mg = new T.Mesh(new T.CircleGeometry(0.04, 10), mat(c)); mg.position.set(-5.264, y, 7.85 + i * 0.1); mg.rotation.y = Math.PI / 2; add(mg); });
      obj.fridge = { x: -5.5, z: 7.75 };
      // dining table with four chairs
      box(1.3, 0.05, 0.9, '#d9b48f', -3.7, 0.72, 5.5);
      [[-4.25, 5.15], [-3.15, 5.15], [-4.25, 5.85], [-3.15, 5.85]].forEach(([x, z]) => box(0.05, 0.72, 0.05, '#b98', x, 0, z));
      [[-3.7, 4.75, 0], [-3.7, 6.25, 0], [-4.6, 5.5, 1], [-2.8, 5.5, 1]].forEach(([x, z, r]) => { box(0.4, 0.05, 0.4, '#ffd6e5', x, 0.45, z); box(0.4, 0.45, 0.05, '#ffd6e5', x + (r ? (x < -3.7 ? -0.18 : 0.18) : 0), 0.5, z + (r ? 0 : (z < 5.5 ? -0.18 : 0.18))); });
      collide(-4.8, -2.6, 4.55, 6.45);
      const fruit = new T.Mesh(new T.SphereGeometry(0.12, 12, 8, 0, 6.3, 0, 1.6), mat('#ffffff')); fruit.rotation.x = Math.PI; fruit.position.set(-3.7, 0.86, 5.5); add(fruit);
      [['#ff5a4f', -3.75, 5.45], ['#ffd23f', -3.62, 5.52], ['#7fdc9a', -3.7, 5.6]].forEach(([c, x, z]) => { const f = new T.Mesh(new T.SphereGeometry(0.05, 8, 8), mat(c)); f.position.set(x, 0.82, z); add(f); });

      // ---- living room (east part): sofa faces the big TV on the east wall ----
      const sofa = new T.Group(); sofa.position.set(-0.6, 0, 6.0); add(sofa);
      box(0.9, 0.18, 2.1, '#b7a2d9', 0, 0.12, 0, sofa);     // seat base (on legs, you can crawl under)
      box(0.85, 0.12, 2.0, '#c9b6ec', 0.05, 0.3, 0, sofa);  // cushions
      box(0.22, 0.6, 2.1, '#b7a2d9', -0.34, 0.3, 0, sofa);  // back
      box(0.9, 0.45, 0.18, '#b7a2d9', 0, 0.12, -1.05, sofa); box(0.9, 0.45, 0.18, '#b7a2d9', 0, 0.12, 1.05, sofa);
      [[-0.4, -1.0], [0.4, -1.0], [-0.4, 1.0], [0.4, 1.0]].forEach(([x, z]) => box(0.05, 0.12, 0.05, '#6d5a7d', x, 0, z, sofa));
      [[0.05, -0.5, '#ffb3cf'], [0.05, 0.5, '#a6e3ff']].forEach(([x, z, c]) => box(0.15, 0.32, 0.38, c, x - 0.15, 0.42, z, sofa));
      collide(-1.05, -0.15, 4.85, 7.15);
      const rug2 = new T.Mesh(new T.CircleGeometry(1.0, 32), mat('#f7d9e6')); rug2.rotation.x = -Math.PI / 2; rug2.position.set(0.7, 0.004, 6.0); add(rug2);
      box(0.6, 0.35, 0.9, '#d9b48f', 0.6, 0, 6.0); collide(0.3, 0.9, 5.55, 6.45);                                      // coffee table
      // TV remote on the coffee table (Kefifi throws it if you lose the letters game)
      obj.remote = new T.Group(); obj.remoteHome = { x: 0.55, y: 0.36, z: 5.8 }; obj.remote.position.set(0.55, 0.36, 5.8); add(obj.remote);
      box(0.06, 0.025, 0.2, '#2b2b30', 0, 0, 0, obj.remote);
      [['#ff5a4f', 0.06], ['#7fdc9a', 0.02], ['#6fd3ff', -0.02]].forEach(([c, z]) => { const b = new T.Mesh(new T.CircleGeometry(0.008, 8), mat(c)); b.rotation.x = -Math.PI / 2; b.position.set(0, 0.026, z); obj.remote.add(b); });
      box(0.45, 0.5, 1.6, '#f4f4f4', 1.75, 0, 6.0); collide(1.5, 2.0, 5.2, 6.8);                                        // TV stand
      obj.tvMount = new T.Group(); obj.tvMount.position.set(1.8, 0.5, 6.0); obj.tvMount.rotation.y = -Math.PI / 2; add(obj.tvMount);
      obj.tv = new T.Group(); obj.tv.position.set(0, 0, 0); obj.tvMount.add(obj.tv);
      box(0.12, 0.06, 0.25, '#222', 0, 0, 0, obj.tv);
      box(1.3, 0.76, 0.06, '#1c1c22', 0, 0.06, 0, obj.tv);
      obj.tvScreen = new T.Mesh(new T.PlaneGeometry(1.22, 0.68), new T.MeshBasicMaterial({ map: tvTex('off', 0) }));
      obj.tvScreen.position.set(0, 0.44, 0.032); obj.tv.add(obj.tvScreen);
      obj.tvTex = tvTex;
      obj.tvPos = { x: 1.7, z: 6.0 };
      plantPot(1.75, 7.9); plantPot(-2.6, 3.7); plantPot(5.8, -1.4);
      // window with long curtains on the south wall (you can hide behind them)
      windowOn(0.6, 8.4, Math.PI, '#a8c8e8', true);
      picture(-1.2, 1.6, 8.39, Math.PI, 2); picture(1.99, 1.6, 4.3, -Math.PI / 2, 6);
    }

    function lamp(x, y, z) {
      const b = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 0.2, 10), mat('#fff3e0')); b.position.set(x, y + 0.1, z); add(b);
      const s = new T.Mesh(new T.CylinderGeometry(0.1, 0.15, 0.18, 12, 1, true), mat('#ffe9c7', { side: T.DoubleSide })); s.position.set(x, y + 0.29, z); add(s);
    }
    function plantPot(x, z) {
      const p = new T.Mesh(new T.CylinderGeometry(0.16, 0.12, 0.3, 12), mat('#e8a87c')); p.position.set(x, 0.15, z); add(p);
      for (let i = 0; i < 5; i++) { const l = new T.Mesh(new T.SphereGeometry(0.13, 8, 6), mat('#6cc25a')); l.position.set(x + Math.cos(i * 1.3) * 0.1, 0.45 + i * 0.06, z + Math.sin(i * 1.3) * 0.1); l.scale.y = 1.4; add(l); }
      collide(x - 0.18, x + 0.18, z - 0.18, z + 0.18);
    }
    function picture(x, y, z, ry, i) {
      const f = new T.Mesh(new T.PlaneGeometry(0.5, 0.62), new T.MeshLambertMaterial({ map: posterTex(i) })); f.position.set(x, y, z); f.rotation.y = ry; add(f);
    }
    // window on a wall: (x or z of the wall line, position along it, rotation of the inside face)
    function windowOn(a, b, ry, sky, curtains) {
      const g = new T.Group(); add(g);
      if (Math.abs(ry) === Math.PI / 2) g.position.set(a + (ry < 0 ? -0.02 : 0.02), 0, b); else g.position.set(a, 0, b + (ry === Math.PI ? -0.02 : 0.02));
      g.rotation.y = ry;
      const glass = new T.Mesh(new T.PlaneGeometry(1.2, 1.3), new T.MeshBasicMaterial({ color: sky })); glass.position.y = 1.55; g.add(glass);
      obj.extraWindows.push(glass);
      box(1.26, 0.05, 0.06, '#ffffff', 0, 0.88, 0.02, g); box(1.26, 0.05, 0.06, '#ffffff', 0, 2.2, 0.02, g); box(0.05, 1.3, 0.06, '#ffffff', 0, 0.9, 0.02, g);
      if (curtains) for (let i = 0; i < 7; i++) [-0.62, 0.62].forEach(cx => {
        const c = new T.Mesh(new T.CylinderGeometry(0.035, 0.045, 2.4, 8), mat('#9fb6d9')); c.position.set(cx + (i - 3) * 0.045, 1.2, 0.12 + (i % 2) * 0.03); g.add(c);
      });
    }

    function plush(parent, x, y, z, color, s, isCow) {
      const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
      const body = new T.Mesh(new T.SphereGeometry(s, 12, 10), mat(color)); body.position.y = s; body.scale.set(1, .9, .9); g.add(body);
      const hd = new T.Mesh(new T.SphereGeometry(s * .8, 12, 10), mat(color)); hd.position.y = s * 2.3; g.add(hd);
      [-1, 1].forEach(side => { const e = new T.Mesh(new T.SphereGeometry(s * .3, 8, 6), mat(isCow ? '#2f2a2e' : color)); e.position.set(side * s * .55, s * 2.9, 0); g.add(e); });
      [-1, 1].forEach(side => { const e = new T.Mesh(new T.SphereGeometry(s * .09, 6, 6), mat('#2b2328')); e.position.set(side * s * .3, s * 2.35, s * .7); g.add(e); });
      if (isCow) { const sp = new T.Mesh(new T.SphereGeometry(s * .35, 8, 6), mat('#2f2a2e')); sp.position.set(s * .5, s * 1.1, s * .5); sp.scale.z = .4; g.add(sp); }
      g.rotation.y = (x * 7 + z * 3) % 1.2 - .6;
      return g;
    }

    return { scene, colliders, obj };
  }

  return { build, ZONES, DOORS };
})();
