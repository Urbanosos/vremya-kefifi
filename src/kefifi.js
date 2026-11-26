// Kefifi in the room: a cut-out picture that always turns to face you, plus the mood bar above her head.
window.Kefifi = (function () {
  const T = THREE;
  const K = CFG.kefifi;
  const st = { x: K.x, z: K.z, path: [], speed: 1.2, face: 'normal', hop: 0, t: 0, dancing: false };
  let group, plane, tex = {}, aspect = {}, barEl, fillEl, danceTex = [], danceAspect = 0.6;

  function init(scene) {
    group = new T.Group(); scene.add(group);
    const loader = new T.TextureLoader();
    for (const name of ['normal', 'happy', 'angry', 'scream']) {
      const t = loader.load(window.KEFIFI_IMG[name], img => {
        aspect[name] = t.image.width / t.image.height;
        if (st.face === name) setFace(name);
      });
      t.colorSpace = T.SRGBColorSpace;
      tex[name] = t; aspect[name] = 0.47;
    }
    // dance animation frames cut from the dance video
    (window.KEFIFI_DANCE || []).forEach((src, i) => {
      const t = loader.load(src, () => { if (i === 0) danceAspect = t.image.width / t.image.height; });
      t.colorSpace = T.SRGBColorSpace; danceTex.push(t);
    });
    plane = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: tex.normal, transparent: true, alphaTest: 0.35, side: T.DoubleSide }));
    group.add(plane);
    // soft shadow under her feet
    const sh = new T.Mesh(new T.CircleGeometry(0.28, 20), new T.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.006; group.add(sh);
    barEl = document.getElementById('moodBar'); fillEl = document.getElementById('moodFill');
    setFace('normal');
  }

  function setFace(name) {
    st.face = name;
    if (!plane || st.dancing) return;
    plane.material.map = tex[name]; plane.material.needsUpdate = true;
    const h = K.height, w = h * (aspect[name] || 0.47);
    plane.scale.set(w, h, 1);
  }

  function place(x, z) { st.x = x; st.z = z; st.path = []; }
  // walk through the flat along doorways; speed in m/s
  function walkTo(x, z, speed) { st.path = Nav.path(st.x, st.z, x, z); st.speed = speed || 1.2; }
  function walking() { return st.path.length > 0; }
  function setDancing(on) { st.dancing = on; if (!on) setFace(st.face); }
  function hop() { st.hop = 0.5; }

  function update(dt, cam) {
    st.t += dt;
    let walking = false;
    if (st.path.length) {
      const p = st.path[0], dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz);
      if (d < 0.03) st.path.shift();
      else { walking = true; const s = Math.min(d, st.speed * dt); st.x += dx / d * s; st.z += dz / d * s; }
    }
    if (st.dancing && danceTex.length) {
      const f = danceTex[Math.floor(st.t * 6) % danceTex.length];
      if (plane.material.map !== f) { plane.material.map = f; plane.material.needsUpdate = true; plane.scale.set(K.height * danceAspect * 1.08, K.height * 1.08, 1); }
    }
    st.hop = Math.max(0, st.hop - dt);
    const jump = st.hop > 0 ? Math.sin((0.5 - st.hop) / 0.5 * Math.PI) * 0.18 : 0;
    const bob = walking ? Math.abs(Math.sin(st.t * (st.speed > 1.4 ? 14 : 9))) * (st.speed > 1.4 ? 0.07 : 0.04) : Math.sin(st.t * 2) * 0.008;
    group.position.set(st.x, 0, st.z);
    plane.position.y = plane.scale.y / 2 + jump + bob;
    if (!st.dancing) plane.scale.y = K.height * (1 + Math.sin(st.t * 2) * 0.008);
    // face the camera around the vertical axis only
    group.rotation.y = Math.atan2(cam.position.x - st.x, cam.position.z - st.z);
  }

  // mood bar: an HTML element placed over her head on screen
  const v = new T.Vector3();
  function updateBar(cam, mood, visible) {
    if (!barEl) return;
    v.set(st.x, K.height + 0.22, st.z).project(cam);
    const show = visible && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
    barEl.style.display = show ? 'block' : 'none';
    if (!show) return;
    barEl.style.left = ((v.x + 1) / 2 * innerWidth) + 'px';
    barEl.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
    fillEl.style.width = Math.max(0, Math.min(100, mood)) + '%';
    fillEl.style.background = mood > 60 ? '#7fdc9a' : mood > 30 ? '#ffd166' : '#ff6b81';
    barEl.querySelector('.face').textContent = mood > 60 ? '😊' : mood > 30 ? '😐' : '😠';
  }

  return { st, init, setFace, place, walkTo, walking, setDancing, hop, update, updateBar, radius: 0.3 };
})();
