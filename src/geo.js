// Las diez geografías irregulares (mapas de alturas y tipos de casilla).
import { MD, MW } from './config.js';
import { rngOf } from './noise.js';

// ---------- Geografías ----------
// Diez generadores de terreno irregulares (más el río clásico). Trabajan en unidades de 192×128 (la mitad del mapa) sobre la rejilla completa,
// así que las formas salen al doble de tamaño y los acantilados siguen siendo de verdad. Tipos de casilla: 0 normal · 1 bosque denso (no se cruza) · 2 pantano o bajío (lento) · 3 arena · 4 oasis
export const GEO = (() => {
  const W = 192, H = 128;
  const hsh = (x, z, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  function vn(x, z, s) { const xi = Math.floor(x), zi = Math.floor(z), u = x - xi, v = z - zi, a = hsh(xi, zi, s), b = hsh(xi + 1, zi, s), c = hsh(xi, zi + 1, s), d = hsh(xi + 1, zi + 1, s), su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v); return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv; }
  const fbm = (x, z, s, o = 4) => { let a = .5, f = 1, t = 0, n = 0; for (let i = 0; i < o; i++) { t += a * vn(x * f, z * f, s + i * 13); n += a; a *= .5; f *= 2.03; } return t / n; };
  const sm = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  // ===== utilidades de generación irregular =====
  const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
  const polyD = (x, z, P) => { let m = 1e9; for (let i = 0; i + 1 < P.length; i++) m = Math.min(m, segD(x, z, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1])); return m; };
  // línea que serpentea de A a B (paseo aleatorio suavizado, perpendicular a la dirección)
  function wander(r, ax, az, bx, bz, amp = 10, n = 14) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, px = -dz / L, pz = dx / L, P = []; let off = 0, v = 0;
    for (let i = 0; i <= n; i++) { const t = i / n, damp = Math.sin(t * Math.PI); v += (r() - .5) * amp * .6; v *= .7; off += v; off *= .92; P.push([ax + dx * t + px * off * damp, az + dz * t + pz * off * damp]); }
    return P;
  }
  // blob irregular: radio por ángulo con ruido
  const blobR = (cx, cz, rx, rz, jit, s) => (x, z) => { const a = Math.atan2((z - cz) / rz, (x - cx) / rx), k = 1 + (fbm(Math.cos(a) * 1.3 + 7, Math.sin(a) * 1.3 + 3, s, 3) - .5) * jit; return Math.hypot((x - cx) / rx, (z - cz) / rz) / k; };
  // árbol de expansión mínima entre puntos
  function mst(pts) { const inT = [0], E = []; while (inT.length < pts.length) { let b = null, bd = 1e9; for (const i of inT) for (let j = 0; j < pts.length; j++) if (!inT.includes(j)) { const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (d < bd) { bd = d; b = [i, j]; } } inT.push(b[1]); E.push(b); } return E; }
  function scatter(r, n, minD, box, ok = () => true, pre = []) { const P = [...pre]; for (let t = 0; P.length < n + pre.length && t < 3000; t++) { const p = [box[0] + r() * (box[2] - box[0]), box[1] + r() * (box[3] - box[1])]; if (ok(p) && P.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > minD)) P.push(p); } return P.slice(pre.length); }

  // fortalezas: cada una en su extremo pero en posiciones distintas (no en espejo)
  function fortsFor(r) { return [[16 + r() * 14, 30 + r() * 68], [W - 16 - r() * 14, 30 + r() * 68]]; }

  // Cada geografía rellena HM (altura; ≤0 agua) y TT (0 normal · 1 bosque denso · 2 pantano/bajío · 3 arena · 4 oasis) para todo el mapa, y devuelve los puntos de paso.
  const GEN = {
    cordillera(M, r, s, F) {
      const cx = z => 96 + (fbm(.5, z * .018, s, 3) - .5) * 70 + Math.sin(z * .05 + s) * 8, wd = z => 8 + fbm(3.3, z * .03, s + 1, 2) * 12;
      const pz = scatter(r, 3, 26, [0, 12, 1, H - 12]).map(p => p[1]).sort((a, b) => a - b), pass = pz.map(z => [cx(z), z]); M.div = cx;
      M.each((x, z) => { const d = Math.abs(x - cx(z)); let h = 2 + Math.max(0, fbm(x * .05, z * .05, s + 2) - .5) * 6;
        const spur = Math.pow(1 - Math.abs(2 * fbm(x * .03, z * .03, s + 3) - 1), 3) * 5 * Math.max(0, 1 - d / 40);
        h += sm(1 - (d - 2) / wd(z)) * (6 + fbm(x * .09, z * .09, s + 4) * 3) + spur;
        for (const [px, p] of pass) { const k = sm(1 - (Math.abs(z - p - (fbm(x * .05, 1, s + 5) - .5) * 8) - 2.5) / 5) * sm(1 - (Math.abs(x - px) - 10) / 20); h = h * (1 - k) + Math.min(h, 3) * k; }
        return [h, 0]; });
      return pass;
    },
    istmo(M, r, s, F) {
      const xc = 96 + (r() - .5) * 50, zc = 64 + (r() - .5) * 20;
      const w = (x, k) => 9 + Math.pow(Math.abs(x - xc) / 100, 1.3) * 62 + (fbm(x * .025, k, s + k, 3) - .5) * 34;
      const isl = scatter(r, 5, 18, [20, 6, W - 20, H - 6]);
      M.each((x, z) => { const dn = (zc - w(x, 1)) - z, ds = z - (zc + w(x, 2)), d = Math.max(dn, ds);
        let v = -1; for (const [ix, iz] of isl) v = Math.max(v, 1 - Math.hypot(x - ix, z - iz) / (4 + fbm(ix, iz, s, 2) * 6));
        if (d > 0 && v <= 0) return [d < 2.5 ? 1 : -1 - Math.min(4, d * .3), 0];
        return [2 + Math.max(0, fbm(x * .06, z * .06, s + 6) - .5) * 5, d > -4 ? 3 : 0]; });
      return [[xc, zc]];
    },
    archipielago(M, r, s, F) {
      const isl = [[F[0][0] + 4, F[0][1], 18], [F[1][0] - 4, F[1][1], 18], ...scatter(r, 10, 26, [40, 10, W - 40, H - 10], p => F.every(f => Math.hypot(f[0] - p[0], f[1] - p[1]) > 30)).map(p => [...p, 7 + r() * 8])];
      const links = mst(isl).map(([a, b]) => wander(r, isl[a][0], isl[a][1], isl[b][0], isl[b][1], 9, 10));
      for (let k = 0; k < 2; k++) { const a = r() * isl.length | 0, b = r() * isl.length | 0; if (a !== b && Math.hypot(isl[a][0] - isl[b][0], isl[a][1] - isl[b][1]) < 70) links.push(wander(r, isl[a][0], isl[a][1], isl[b][0], isl[b][1], 9, 10)); }
      const fs = isl.map(([cx, cz, rr], i) => blobR(cx, cz, rr * (1 + (i % 3) * .2), rr, .6, s + i));
      M.each((x, z) => { let v = 9; for (const f of fs) v = Math.min(v, f(x, z));
        if (v < 1) return [1 + Math.min(1, (1 - v) * 3) * (1 + fbm(x * .07, z * .07, s + 7) * 2.5), 0];
        if (links.some(P => polyD(x, z, P) < 2 + fbm(x * .2, z * .2, s + 8) * 1.6)) return [1, 2]; return [-2, 0]; });
      return links.map(P => P[P.length >> 1]).filter(p => Math.abs(p[0] - 96) < 50).slice(0, 4);
    },
    barrancos(M, r, s, F) {
      const ramps = [];
      M.each((x, z) => { const c1 = Math.abs(fbm(x * .02, z * .02, s + 9, 3) - .5), c2 = Math.abs(fbm(x * .016, z * .026, s + 10, 3) - .5); const cut = Math.min(c1, c2 * 1.3);
        return [cut < .03 && F.every(f => Math.hypot(x - f[0], z - f[1]) > 16) ? 1 : 4 + fbm(x * .05, z * .05, s + 11) * 1.6, cut < .012 ? 2 : 0]; });
      const cand = []; M.each((x, z, h) => { if (h === 1 && hsh(x, z, s) < .02) cand.push([x, z]); return null; });
      for (const p of cand) if (ramps.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > 28) && ramps.length < 7) ramps.push(p);
      M.each((x, z, h, t) => { for (const [px, pz] of ramps) { const d = Math.hypot(x - px, z - pz); if (d < 5) return [Math.min(Math.max(h, 2 + Math.floor(d / 1.6)), 4), 0]; } return null; });
      return ramps;
    },
    meseta(M, r, s, F) {
      const cx = 96 + (r() - .5) * 36, cz = 64 + (r() - .5) * 34, f = blobR(cx, cz, 30 + r() * 10, 22 + r() * 8, .7, s + 12);
      const angs = [0, 1, 2].map(i => i * Math.PI * 2 / 3 + (r() - .5) * .9), ramps = angs.map(a => { let k = .5; while (k < 3 && f(cx + Math.cos(a) * k * 10, cz + Math.sin(a) * k * 10) < 1) k += .05; return [cx + Math.cos(a) * k * 10, cz + Math.sin(a) * k * 10]; });
      M.each((x, z) => { const v = f(x, z); let h = v < 1 ? 6 + fbm(x * .1, z * .1, s + 13) : v < 1.12 ? 3 : 2 + Math.max(0, fbm(x * .05, z * .05, s + 14) - .45) * 6;
        for (const [px, pz] of ramps) { const d = Math.hypot(x - px, z - pz); if (d < 3.2 && v < 1.3) h = Math.min(6, 3 + Math.max(0, (v < 1 ? 3 : 2) - d * .4)); }   // tres rampas estrechas: fáciles de defender
        return [h, 0]; });
      M.special = [[cx, cz]]; return ramps;
    },
    afluentes(M, r, s, F) {
      const main = wander(r, 96 + (r() - .5) * 30, -4, 96 + (r() - .5) * 30, H + 4, 28, 18), tribs = [];
      M.div = z => { for (let i = 0; i + 1 < main.length; i++) { const [ax, az] = main[i], [bx, bz] = main[i + 1]; if ((az - z) * (bz - z) <= 0) return ax + (bx - ax) * ((z - az) / ((bz - az) || 1)); } return 96; };
      for (let k = 0; k < 5; k++) { const west = k % 2 === 0, j = main[2 + (r() * (main.length - 4) | 0)], sx = west ? r() * 50 : W - r() * 50, sz = r() < .5 ? -4 : H + 4; tribs.push(wander(r, r() < .4 ? (west ? -4 : W + 4) : sx, r() < .4 ? 10 + r() * (H - 20) : sz, j[0], j[1], 16, 12)); }
      const fords = [...scatter(r, 4, 22, [0, 8, 1, H - 8]).map(p => { let b = main[0], bd = 1e9; for (const q of main) { const d = Math.abs(q[1] - p[1]); if (d < bd) { bd = d; b = q; } } return b; }), ...tribs.map(P => P[(P.length * (.3 + r() * .4)) | 0])];
      M.each((x, z) => { const dm = polyD(x, z, main), dt = Math.min(...tribs.map(P => polyD(x, z, P))), d = Math.min(dm - 1.2, dt) + (fbm(x * .12, z * .12, s + 15) - .5) * 2;
        const ford = fords.some(([px, pz]) => Math.hypot(x - px, z - pz) < 4);
        if (d < 2.2) return [ford ? 1 : -1, 0]; if (d < 3.6) return [1, 3]; return [2 + Math.max(0, fbm(x * .05, z * .05, s + 16) - .5) * 6, 0]; });
      return fords;
    },
    delta(M, r, s, F) {
      const ridges = []; for (const f of F) for (let k = 0; k < 3; k++) ridges.push(wander(r, f[0], f[1], 70 + r() * 52, 10 + r() * 108, 18, 12));
      M.each((x, z) => { const ch = Math.min(Math.abs(fbm(x * .03, z * .05, s + 17, 3) - .5), Math.abs(fbm(x * .05, z * .025, s + 18, 3) - .5) * 1.3), m = fbm(x * .07, z * .07, s + 19);
        if (F.some(f => Math.hypot(x - f[0], z - f[1]) < 14) || ridges.some(P => polyD(x, z, P) < 2.4 + fbm(x * .2, z * .2, s + 20))) return [2, 0];
        if (ch < .03) return [-1, 0]; return [m > .5 ? 2 : 1, m > .5 ? 0 : 2]; });
      return ridges.map(P => P[P.length - 1]).filter(p => Math.abs(p[0] - 96) < 40).slice(0, 4);
    },
    bosque(M, r, s, F) {
      const cl = [...F.map(f => [...f, 15]), ...scatter(r, 11, 22, [30, 10, W - 30, H - 10]).map(p => [...p, 5 + r() * 6])];
      const lanes = mst(cl).map(([a, b]) => wander(r, cl[a][0], cl[a][1], cl[b][0], cl[b][1], 10, 12));
      for (let k = 0; k < 3; k++) { const a = r() * cl.length | 0, b = r() * cl.length | 0; if (a !== b && Math.hypot(cl[a][0] - cl[b][0], cl[a][1] - cl[b][1]) < 60) lanes.push(wander(r, cl[a][0], cl[a][1], cl[b][0], cl[b][1], 10, 12)); }
      const fs = cl.map(([cx, cz, rr], i) => blobR(cx, cz, rr * 1.2, rr, .7, s + 30 + i));
      M.each((x, z) => { const open = fs.some(f => f(x, z) < 1) || lanes.some(P => polyD(x, z, P) < 1.8 + fbm(x * .15, z * .15, s + 21) * 1.4) || fbm(x * .05, z * .05, s + 22) < .3;
        return [2 + Math.max(0, fbm(x * .05, z * .05, s + 23) - .5) * 5, open ? 0 : 1]; });
      return lanes.filter(P => Math.abs(P[P.length >> 1][0] - 96) < 30).map(P => P[P.length >> 1]).slice(0, 5);
    },
    oasis(M, r, s, F) {
      const oa = scatter(r, 9, 24, [30, 10, W - 30, H - 10], p => F.every(f => Math.hypot(f[0] - p[0], f[1] - p[1]) > 26));
      const mesas = scatter(r, 6, 20, [20, 8, W - 20, H - 8], p => oa.every(o => Math.hypot(o[0] - p[0], o[1] - p[1]) > 14)).map((p, i) => blobR(p[0], p[1], 4 + r() * 6, 3 + r() * 5, .8, s + 40 + i));
      M.each((x, z) => { for (const [ox, oz] of oa) { const d = Math.hypot(x - ox, z - oz) / (1 + (fbm(x * .2, z * .2, s + 24) - .5) * .6); if (d < 2.6) return [-1, 0]; if (d < 7) return [2, 4]; }
        if (mesas.some(f => f(x, z) < 1)) return [5, 3];
        const warp = fbm(x * .02, z * .02, s + 25) * 9, dune = Math.abs(Math.sin((x * .8 + z * .35) * .11 + warp)); return [2 + (dune > .82 ? (dune - .82) * 12 : 0), 3]; });
      M.special = oa; return [];
    },
    lago(M, r, s, F) {
      const cx = 96 + (r() - .5) * 30, cz = 64 + (r() - .5) * 24, f = blobR(cx, cz, 42 + r() * 12, 24 + r() * 8, .8, s + 26);
      const islands = scatter(r, 2, 16, [cx - 25, cz - 12, cx + 25, cz + 12]), gaps = [0, 1, 2].map(i => (i / 3) * Math.PI * 2 + r() * 1.6);
      const vol = islands[1] && Math.hypot(islands[1][0] - islands[0][0], islands[1][1] - islands[0][1]) > 15 ? islands[1] : [cx + (islands[0] && islands[0][0] > cx ? -18 : 18), cz];   // el volcán, en una isla sin camino
      const dykeTo = islands[0], dyke = dykeTo && wander(r, dykeTo[0], dykeTo[1], dykeTo[0] + (r() < .5 ? -1 : 1) * 30, dykeTo[1] + (r() - .5) * 40, 5, 8);
      M.each((x, z) => { const v = f(x, z);
        const dv = Math.hypot(x - vol[0], z - vol[1]);
        if (dv < 7.5) return [dv < 1.6 ? 6 : 2 + (7.5 - dv) * 1.25 + fbm(x * .4, z * .4, s + 3, 2), 5];   // cono con cráter
        if (islands.slice(0, 1).some(([ix, iz]) => Math.hypot(x - ix, z - iz) < 5 + fbm(x * .2, z * .2, s, 2) * 3)) return [2, 0];
        if (v < 1) return dyke && polyD(x, z, dyke) < 1.6 ? [1, 3] : [v < .85 ? -2 : -1, 0];
        if (v < 1.08) return [1, 3];
        const a = Math.atan2(z - cz, x - cx), gap = gaps.some(g => Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < .22);
        if (v < 1.45 && !gap) return [4 + fbm(x * .1, z * .1, s + 27) * 3, 0];
        return [2 + Math.max(0, fbm(x * .05, z * .05, s + 28) - .5) * 5, 0]; });
      M.special = islands.slice(0, 1); M.volcano = vol;
      return gaps.map(g => { let k = 1; while (k < 1.6 && f(cx + Math.cos(g) * 40 * k, cz + Math.sin(g) * 25 * k) < 1.25) k += .02; return [cx + Math.cos(g) * 40 * k, cz + Math.sin(g) * 25 * k]; });
    },
    // ===== geografías nuevas =====
    // valle helado: lagos helados que se cruzan a pie (6 = hielo) entre lomas nevadas
    helado(M, r, s, F) {
      const lakes = scatter(r, 7, 24, [36, 12, W - 36, H - 12], p => F.every(f => Math.hypot(f[0] - p[0], f[1] - p[1]) > 30)).map((p, i) => blobR(p[0], p[1], 7 + r() * 9, 5 + r() * 6, .7, s + 50 + i));
      M.each((x, z) => { let v = 9; for (const f of lakes) v = Math.min(v, f(x, z));
        if (v < 1) return [1, 6]; if (v < 1.12) return [1, 3];
        return [2 + Math.max(0, fbm(x * .05, z * .05, s + 51) - .45) * 7, 0]; });
      M.snow = true; return [];
    },
    // cañón: una garganta con río al fondo parte el mapa; se cruza por tres puentes (9 = tablero del puente) que se pueden destruir y reparar
    canon(M, r, s, F) {
      const P = wander(r, 96 + (r() - .5) * 20, -4, 96 + (r() - .5) * 20, H + 4, 22, 16), atZ = z => { for (let i = 0; i + 1 < P.length; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1]; if ((az - z) * (bz - z) <= 0) return ax + (bx - ax) * ((z - az) / ((bz - az) || 1)); } return 96; };
      M.div = atZ;
      const bz = [.2, .5, .8].map(k => H * k + (r() - .5) * 10), bridges = bz.map(z => [atZ(z), z]);
      M.each((x, z) => { const d = Math.abs(x - atZ(z)) + (fbm(x * .15, z * .15, s + 60) - .5) * 1.4, onB = bz.some(b => Math.abs(z - b) < 1.6);
        if (d < 3.4) return onB ? [4, 9] : [d < 2 ? -2 : -1, 0];
        if (bz.some(b => Math.abs(z - b) < 6) && d < 12) return [4, 0];   // explanada a cada lado del puente
        return [3.6 + fbm(x * .05, z * .05, s + 61) * 1.6, 0]; });
      M.bridges = bridges; return bridges;
    },
    // costa: las dos fortalezas en lo alto de un acantilado; abajo, una llanura costera con playas. Pocas rampas unen los dos niveles
    costa(M, r, s, F) {
      for (const f of F) f[1] = 32 + r() * 18;
      const zc = x => 72 + (fbm(x * .02, 1, s + 70) - .5) * 26, zs = x => 114 + (fbm(x * .03, 2, s + 71) - .5) * 14, ramps = [0, 1, 2, 3, 4].map(k => 22 + k * 37 + (r() - .5) * 14);
      M.each((x, z) => { const c = zc(x), sea = zs(x);
        if (z > sea) return [-2, 0]; if (z > sea - 4) return [1, 3];
        if (Math.abs(z - c) < 2.5 && ramps.some(rx => Math.abs(x - rx) < 3)) return [3, 0];   // rampa
        if (z > c) return [2 + Math.max(0, fbm(x * .06, z * .06, s + 72) - .55) * 3, 0];
        return [4 + Math.max(0, fbm(x * .05, z * .05, s + 73) - .6) * 2, 0]; });
      return ramps.map(rx => [rx, zc(rx)]);
    },
    // llanura abierta: casi sin obstáculos, unas charcas y arboledas sueltas; ideal para la caballería
    llanura(M, r, s, F) {
      const ponds = scatter(r, 4, 40, [40, 14, W - 40, H - 14], p => F.every(f => Math.hypot(f[0] - p[0], f[1] - p[1]) > 26)).map((p, i) => blobR(p[0], p[1], 3 + r() * 3, 2.5 + r() * 2, .6, s + 80 + i));
      const groves = scatter(r, 7, 26, [30, 10, W - 30, H - 10], p => F.every(f => Math.hypot(f[0] - p[0], f[1] - p[1]) > 24)).map((p, i) => blobR(p[0], p[1], 2.5 + r() * 3, 2 + r() * 2, .8, s + 90 + i));
      M.each((x, z) => { if (ponds.some(f => f(x, z) < 1)) return [-1, 0]; if (groves.some(f => f(x, z) < 1)) return [2, 1];
        return [2 + Math.max(0, fbm(x * .04, z * .04, s + 81) - .62) * 4, 0]; });
      return [];
    },
    // ciudad en ruinas: en el centro, manzanas con muros de piedra rotos (7 = ruina) entre calles; hay tesoros por las calles
    ruinas(M, r, s, F) {
      const cx = 96 + (r() - .5) * 16, cz = 64 + (r() - .5) * 12, city = blobR(cx, cz, 46, 34, .5, s + 100), G = 11;
      const inCity = (x, z) => city(x, z) < 1, cell = v => Math.floor(((v % G) + G) % G);
      M.each((x, z) => {
        if (inCity(x, z)) { const u = cell(x - cx + 2), v = cell(z - cz + 2), bx = Math.floor((x - cx + 2) / G), bzz = Math.floor((z - cz + 2) / G);
          if (u < 3 || v < 3) return [2, 0];   // calle
          const edge = u === 3 || u === G - 1 || v === 3 || v === G - 1, gap = hsh(bx, bzz, s) < .5 ? Math.abs(u - 7) < 1.5 && (v === 3 || v === G - 1) : Math.abs(v - 7) < 1.5 && (u === 3 || u === G - 1);
          if (edge && !gap && hsh(Math.floor(x), Math.floor(z), s + 3) > .12) return [4, 7];   // muro (con huecos)
          return [2, hsh(Math.floor(x * 3), Math.floor(z * 3), s + 4) < .06 ? 7 : 0]; }   // patio con cascotes
        return [2 + Math.max(0, fbm(x * .05, z * .05, s + 101) - .5) * 5, 0]; });
      const streets = []; M.each((x, z, h, t) => { if (inCity(x, z) && h === 2 && (cell(x - cx + 2) < 3 || cell(z - cz + 2) < 3) && city(x, z) < .8) streets.push([x, z]); return null; });
      const pick = []; for (let k = 0; k < 400 && pick.length < 7; k++) { const q = streets[(r() * streets.length) | 0]; if (q && pick.every(o => Math.hypot(o[0] - q[0], o[1] - q[1]) > 12)) pick.push(q); }
      M.treasures = pick; return [[cx, cz]];
    },
  };


  const LIST = { rio: 'RÍO', cordillera: 'CORDILLERA', istmo: 'ISTMO', archipielago: 'ARCHIPIÉLAGO', barrancos: 'BARRANCOS', meseta: 'MESETA', afluentes: 'AFLUENTES', delta: 'DELTA', bosque: 'BOSQUE', oasis: 'DESIERTO', lago: 'CALDERA', helado: 'VALLE HELADO', canon: 'CAÑÓN', costa: 'COSTA', llanura: 'LLANURA', ruinas: 'RUINAS' };
  function build(id, seed) {
    const r = rngOf(seed), s = seed % 997, F = fortsFor(r), HMg = new Float32Array(MW * MD), TTg = new Uint8Array(MW * MD);
    const M = { each(fn) { for (let gz = 0; gz < MD; gz++) for (let gx = 0; gx < MW; gx++) { const i = gz * MW + gx, o = fn((gx + .5) / 2, (gz + .5) / 2, HMg[i], TTg[i]); if (o) { HMg[i] = Math.min(12, Math.round(o[0])); TTg[i] = o[1]; } } } };
    const passes = GEN[id](M, r, s, F) || [];
    for (const [fx, fz] of F) M.each((x, z, h) => Math.hypot(x - fx, z - fz) < 11 ? [Math.max(2, Math.min(h, 4)), 0] : null);   // explanada de cada fortaleza
    const up = p => [p[0] * 2, p[1] * 2];
    return { HM: HMg, TT: TTg, F: F.map(up), passes: passes.map(up), special: (M.special || []).map(up), div: M.div ? z => M.div(z / 2) * 2 : null,
      volcano: M.volcano ? up(M.volcano) : null, bridges: (M.bridges || []).map(up), treasures: (M.treasures || []).map(up), snow: !!M.snow,
      sea: id === 'istmo' || id === 'archipielago' || id === 'costa', river: id === 'afluentes', goldTop: id === 'meseta', oasis: id === 'oasis' };
  }
  return { build, LIST, keys: Object.keys(LIST) };
})();
