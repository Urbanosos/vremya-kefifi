// Walking around the flat: which room a point is in and a list of waypoints through doorways to get somewhere.
// Used by Kefifi (walking to tasks, chasing you) and by the auto-player.
window.Nav = (function () {
  const Z = Room.ZONES, D = Room.DOORS;

  function zoneOf(x, z) {
    for (const k in Z) { const r = Z[k]; if (x >= r.x1 - 0.06 && x <= r.x2 + 0.06 && z >= r.z1 - 0.06 && z <= r.z2 + 0.06) return k; }
    // inside a doorway or a wall: the nearest room
    let best = 'C', bd = 1e9;
    for (const k in Z) {
      const r = Z[k], cx = Math.max(r.x1, Math.min(x, r.x2)), cz = Math.max(r.z1, Math.min(z, r.z2));
      const d = (x - cx) ** 2 + (z - cz) ** 2; if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  function zonePath(a, b) {
    if (a === b) return [a];
    const prev = { [a]: null }, q = [a];
    while (q.length) {
      const cur = q.shift();
      for (const [p, r] of D) {
        const n = p === cur ? r : r === cur ? p : null;
        if (n && !(n in prev)) { prev[n] = cur; if (n === b) { const out = [b]; let c = b; while (prev[c]) { c = prev[c]; out.unshift(c); } return out; } q.push(n); }
      }
    }
    return [a, b];
  }

  // waypoints from (fx,fz) to (tx,tz): before, in and after each doorway, then the target itself
  function path(fx, fz, tx, tz) {
    const zs = zonePath(zoneOf(fx, fz), zoneOf(tx, tz));
    const pts = [];
    for (let i = 0; i < zs.length - 1; i++) {
      const a = zs[i], b = zs[i + 1];
      const d = D.find(([p, r]) => (p === a && r === b) || (p === b && r === a));
      const za = (Z[a].z1 + Z[a].z2) / 2 < d[3] ? -1 : 1; // which side of the doorway room a is
      const before = { x: d[2], z: d[3] + za * 0.45 }, mid = { x: d[2], z: d[3] }, after = { x: d[2], z: d[3] - za * 0.45 };
      // already in the doorway: do not step back to the "before" point (that made walkers oscillate)
      const dm = Math.hypot(fx - mid.x, fz - mid.z);
      if (i === 0 && dm < 0.6) { if (Math.hypot(fx - after.x, fz - after.z) < 0.45) pts.push(after); else pts.push(mid, after); }
      else pts.push(before, mid, after);
    }
    pts.push({ x: tx, z: tz });
    return pts;
  }

  function center(k) { const r = Z[k]; return { x: (r.x1 + r.x2) / 2, z: (r.z1 + r.z2) / 2 }; }

  return { zoneOf, path, center, zones: Object.keys(Z) };
})();
