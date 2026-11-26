// First-person walking: keyboard + mouse on PC, joystick + look-drag on phone. Collisions with furniture boxes.
window.Player = (function () {
  const P = CFG.player;
  const st = { x: 0, z: 0, yaw: 0, pitch: 0, moveX: 0, moveZ: 0, noclip: false };
  const keys = {};
  let colliders = [], blockers = [], canvas = null, enabled = false;
  let joy = { id: null, x0: 0, y0: 0, dx: 0, dy: 0 }, look = { id: null, x: 0, y: 0 };
  let mouseDrag = null;
  const joyEl = () => document.getElementById('joy');
  const knobEl = () => document.getElementById('joyKnob');

  function init(cv, cols) {
    canvas = cv; colliders = cols;
    addEventListener('keydown', e => { keys[e.code] = true; });
    addEventListener('keyup', e => { keys[e.code] = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    canvas.addEventListener('click', () => {
      if (enabled && !Game.isTouch() && document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
      }
    });
    addEventListener('mousemove', e => {
      if (!enabled) return;
      if (document.pointerLockElement === canvas) turn(e.movementX * P.lookSpeedMouse, e.movementY * P.lookSpeedMouse);
      else if (mouseDrag) { turn((e.clientX - mouseDrag.x) * P.lookSpeedMouse * 1.5, (e.clientY - mouseDrag.y) * P.lookSpeedMouse * 1.5); mouseDrag = { x: e.clientX, y: e.clientY }; }
    });
    canvas.addEventListener('mousedown', e => { if (!Game.isTouch()) mouseDrag = { x: e.clientX, y: e.clientY }; });
    addEventListener('mouseup', () => { mouseDrag = null; });

    // touch: left part of the screen = joystick, the rest = look around
    canvas.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.4 && joy.id === null) {
          // the stick jumps under the thumb, but its base never leaves the screen
          const j = joyEl(), half = j.offsetWidth / 2 || 60;
          const cx = Math.max(half + 4, Math.min(innerWidth - half - 4, t.clientX)), cy = Math.max(half + 4, Math.min(innerHeight - half - 4, t.clientY));
          joy = { id: t.identifier, x0: cx, y0: cy, dx: 0, dy: 0 };
          j.style.left = (cx - half) + 'px'; j.style.top = (cy - half) + 'px'; j.classList.add('active');
          st.usedMove = true;
        } else if (look.id === null) { look = { id: t.identifier, x: t.clientX, y: t.clientY }; st.usedLook = true; }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) {
          let dx = t.clientX - joy.x0, dy = t.clientY - joy.y0;
          const len = Math.hypot(dx, dy), max = (joyEl().offsetWidth / 2 || 60) * 0.8;
          if (len > max) { dx *= max / len; dy *= max / len; }
          joy.dx = dx / max; joy.dy = dy / max;
          knobEl().style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === look.id) {
          turn((t.clientX - look.x) * P.lookSpeedTouch, (t.clientY - look.y) * P.lookSpeedTouch);
          look.x = t.clientX; look.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) releaseJoy();
        if (t.identifier === look.id) look = { id: null };
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  // back to the resting place in the corner, so the stick is always visible
  function releaseJoy() {
    joy = { id: null, dx: 0, dy: 0 };
    const j = joyEl(); if (!j) return;
    knobEl().style.transform = ''; j.classList.remove('active'); j.style.left = ''; j.style.top = '';
  }

  function turn(dx, dy) {
    st.yaw -= dx;
    st.pitch = Math.max(-1.3, Math.min(1.3, st.pitch - dy));
  }

  function reset() {
    st.x = P.start.x; st.z = P.start.z; st.yaw = P.start.yaw; st.pitch = -0.05;
  }

  function setEnabled(on) {
    enabled = on;
    if (!on) {
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      releaseJoy(); look = { id: null };
      for (const k in keys) keys[k] = false;
    }
  }

  // input direction in local space: x = right, z = forward
  function inputDir() {
    let f = 0, r = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    if (joy.id !== null) { f -= joy.dy; r += joy.dx; }
    return { f, r };
  }

  // auto mode sets a desired local direction from outside
  let autoDir = null;
  function setAutoDir(d) { autoDir = d; }

  function update(dt) {
    let { f, r } = enabled ? inputDir() : { f: 0, r: 0 };
    if (autoDir) { f = autoDir.f; r = autoDir.r; }
    const len = Math.hypot(f, r);
    if (len > 1) { f /= len; r /= len; }
    const sin = Math.sin(st.yaw), cos = Math.cos(st.yaw);
    // forward is -z rotated by yaw
    const vx = (-sin * f + cos * r) * P.speed, vz = (-cos * f - sin * r) * P.speed;
    st.moveX = vx; st.moveZ = vz;
    moveTo(st.x + vx * dt, st.z + vz * dt);
  }

  function moveTo(nx, nz) {
    const rad = P.radius, R = CFG.house;
    if (!st.noclip) {
      // try axis by axis so you slide along furniture
      if (!hits(nx, st.z, rad)) st.x = nx;
      if (!hits(st.x, nz, rad)) st.z = nz;
    } else { st.x = nx; st.z = nz; }
    st.x = Math.max(R.minX + rad, Math.min(R.maxX - rad, st.x));
    st.z = Math.max(R.minZ + rad, Math.min(R.maxZ - rad, st.z));
  }

  function hits(x, z, rad) {
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX)), cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < rad * rad) return true;
    }
    for (const b of blockers) if ((x - b.x) ** 2 + (z - b.z) ** 2 < (rad + b.r) ** 2) return true;
    return false;
  }

  function applyCamera(cam, eye) {
    cam.position.set(st.x, eye || P.eye, st.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = st.yaw; cam.rotation.x = st.pitch; cam.rotation.z = 0;
  }

  return { st, init, reset, update, applyCamera, setEnabled, setAutoDir, turn, setBlockers: b => { blockers = b; }, keys };
})();
