// Las diez geografías irregulares (mapas de alturas y tipos de casilla).
import { MD, MW } from './config.js';
import { rngOf } from './noise.js';

// ---------- Geografías ----------
// Diez generadores de terreno irregulares (más el río clásico). Trabajan en unidades de 192×128 (la mitad del mapa) sobre la rejilla completa,
// así que las formas salen al doble de tamaño y los acantilados siguen siendo de verdad. Tipos de casilla: 0 normal · 1 bosque denso (no se cruza) · 18 cumbre de la cordillera (no se pisa) · 2 pantano o bajío (lento) · 3 arena · 4 oasis
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
        const rk = sm(1 - (d - 2) / wd(z)); h += rk * (6 + fbm(x * .09, z * .09, s + 4) * 3) + spur;
        let open = 0; for (const [px, p] of pass) { const k = sm(1 - (Math.abs(z - p - (fbm(x * .05, 1, s + 5) - .5) * 8) - 2.5) / 5) * sm(1 - (Math.abs(x - px) - 10) / 20); open = Math.max(open, k); h = h * (1 - k) + Math.min(h, 3) * k; }
        // núcleo de la sierra: cumbres nevadas altas y picudas (18 = cumbre, no se pisa); solo se cruza por los puertos
        if (rk > .5 && open < .15) { const peak = Math.pow(1 - Math.abs(2 * fbm(x * .11, z * .11, s + 14, 3) - 1), 3); return [10 + rk * 5 + peak * 9 + hsh(x * 2, z * 2, s + 15) * 1.5, 18]; }
        return [h, 0]; });
      return pass;
    },
    istmo(M, r, s, F) {   // un único paso de tierra entre dos mares, sin islotes sueltos
      const xc = 96 + (r() - .5) * 50, zc = 64 + (r() - .5) * 20;
      const w = (x, k) => 9 + Math.pow(Math.abs(x - xc) / 100, 1.3) * 62 + (fbm(x * .025, k, s + k, 3) - .5) * 34;
      M.each((x, z) => { const dn = (zc - w(x, 1)) - z, ds = z - (zc + w(x, 2)), d = Math.max(dn, ds) + (fbm(x * .1, z * .1, s + 9, 2) - .5) * 2;
        if (d > 0) return [d < 2.5 ? 1 : -1 - Math.min(4, d * .3), 0];
        return [2 + Math.max(0, fbm(x * .06, z * .06, s + 6) - .5) * 5, d > -4 ? 3 : 0]; });
      return [[xc, zc]];
    },
    archipielago(M, r, s, F) {   // pocas islas grandes de costa recortada (calas y playas), bajíos anchos y sinuosos entre ellas y arrecifes sueltos
      const isl = [[F[0][0] + 4, F[0][1], 21], [F[1][0] - 4, F[1][1], 21], ...scatter(r, 5, 42, [52, 14, W - 52, H - 14], p => F.every(f => Math.hypot(f[0] - p[0], f[1] - p[1]) > 38)).map(p => [...p, 12 + r() * 9])];
      const links = mst(isl).map(([a, b]) => wander(r, isl[a][0], isl[a][1], isl[b][0], isl[b][1], 16, 12));
      const fs = isl.map(([cx, cz, rr], i) => blobR(cx, cz, rr * (1 + (i % 3) * .15), rr * .85, 1.1, s + i));
      M.each((x, z) => { let v = 9; for (const f of fs) v = Math.min(v, f(x, z)); v += (fbm(x * .09, z * .09, s + 71, 3) - .5) * .4;   // costa recortada
        if (v < .9) return [2 + Math.min(1, (.9 - v) * 2.5) * (fbm(x * .07, z * .07, s + 7) * 3), 0];
        if (v < 1) return [1, 3];   // playa
        let d = 1e9; for (const P of links) d = Math.min(d, polyD(x, z, P)); const wd = 3 + fbm(x * .06, z * .06, s + 8, 2) * 2.6;
        if (d < wd) return [1, 2];   // bajío (la marea lo cubre)
        if (hsh(Math.floor(x * 2), Math.floor(z * 2), s + 12) < .0015 && v < 2.4) return [2, 12];   // arrecife
        return [d < wd + 2 || v < 1.3 ? -1 : -2.5, 0]; });
      return links.map(P => P[P.length >> 1]).filter(p => Math.abs(p[0] - 96) < 50).slice(0, 4);
    },
    barrancos(M, r, s, F) {
      const ramps = [];
      M.each((x, z) => { const c1 = Math.abs(fbm(x * .02, z * .02, s + 9, 3) - .5), c2 = Math.abs(fbm(x * .016, z * .026, s + 10, 3) - .5); const cut = Math.min(c1, c2 * 1.3);
        return [cut < .03 && F.every(f => Math.hypot(x - f[0], z - f[1]) > 16) ? 1 : 4, cut < .012 ? 2 : 0]; });   // arriba, llano: con desniveles sueltos, las explanadas de fortalezas y pueblos dejaban escalones en círculo
      const cand = []; M.each((x, z, h) => { if (h === 1 && hsh(x, z, s) < .02) cand.push([x, z]); return null; });
      for (const p of cand) if (ramps.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > 28) && ramps.length < 7) ramps.push(p);
      M.each((x, z, h, t) => { for (const [px, pz] of ramps) { const d = Math.hypot(x - px, z - pz); if (d < 5) return [Math.min(Math.max(h, 2 + Math.floor(d / 1.6)), 4), 0]; } return null; });
      return ramps;
    },
    meseta(M, r, s, F) {
      const cx = 96 + (r() - .5) * 36, cz = 64 + (r() - .5) * 34, f = blobR(cx, cz, 30 + r() * 10, 22 + r() * 8, .7, s + 12);
      const angs = [0, 1, 2].map(i => i * Math.PI * 2 / 3 + (r() - .5) * .9), ramps = angs.map(a => { let k = .5; while (k < 3 && f(cx + Math.cos(a) * k * 10, cz + Math.sin(a) * k * 10) < 1) k += .05; return [cx + Math.cos(a) * k * 10, cz + Math.sin(a) * k * 10]; });
      // la meseta es alta (10-11) y solo se sube por tres rampas largas y estrechas: un pasillo que baja hacia fuera desde el borde, con paredes a los lados
      const TOP = 10, LO = 3, RL = 10, RW = 1.7;
      M.each((x, z) => { const v = f(x, z); let h = v < 1 ? TOP + fbm(x * .1, z * .1, s + 13) : v < 1.12 ? 3 : 2 + Math.max(0, fbm(x * .05, z * .05, s + 14) - .45) * 6;
        angs.forEach((a, k) => { const [px, pz] = ramps[k], ux = Math.cos(a), uz = Math.sin(a), t = (x - px) * ux + (z - pz) * uz, lat = Math.abs(-(x - px) * uz + (z - pz) * ux);
          if (lat < RW && t > -2 && t < RL) h = TOP - (TOP - LO) * Math.max(0, t) / RL; });
        return [h, 0]; });
      M.special = [[cx, cz]]; return ramps.map(([px, pz], k) => [px + Math.cos(angs[k]) * RL / 2, pz + Math.sin(angs[k]) * RL / 2]);
    },
    afluentes(M, r, s, F) {   // dos ríos que bajan del norte y se juntan en el centro (confluencia), con dos o tres arroyos; vados estrechos de arena
      const C = [96 + (r() - .5) * 20, 60 + (r() - .5) * 14];
      const A = wander(r, 40 + r() * 30, -4, C[0], C[1], 16, 10), B = wander(r, 152 - r() * 30, -4, C[0], C[1], 16, 10), O = wander(r, C[0], C[1], 96 + (r() - .5) * 40, H + 4, 18, 10);
      const mains = [A, B, O], tribs = [];
      for (let k = 0; k < 2 + (r() < .5 ? 1 : 0); k++) { const P = mains[k % 3], j = P[2 + (r() * (P.length - 4) | 0)], west = j[0] < 96; tribs.push(wander(r, west ? -4 : W + 4, 15 + r() * (H - 30), j[0], j[1], 12, 8)); }
      M.div = z => { const P = z > C[1] ? O : null; if (!P) return C[0]; for (let i = 0; i + 1 < P.length; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1]; if ((az - z) * (bz - z) <= 0) return ax + (bx - ax) * ((z - az) / ((bz - az) || 1)); } return C[0]; };
      const fords = []; for (const P of mains) for (const t of [.3, .72]) { const i = Math.max(1, Math.min(P.length - 2, Math.round(P.length * (t + (r() - .5) * .12)))), [px, pz] = P[i], [qx, qz] = P[i + 1], L = Math.hypot(qx - px, qz - pz) || 1; fords.push([px, pz, (qx - px) / L, (qz - pz) / L]); }
      for (const T of tribs) { const [px, pz] = T[T.length >> 1], [qx, qz] = T[(T.length >> 1) + 1], L = Math.hypot(qx - px, qz - pz) || 1; fords.push([px, pz, (qx - px) / L, (qz - pz) / L]); }
      M.each((x, z) => { const n = (fbm(x * .12, z * .12, s + 15) - .5) * 1.2; let dm = 1e9, dt = 1e9; for (const P of mains) dm = Math.min(dm, polyD(x, z, P)); for (const P of tribs) dt = Math.min(dt, polyD(x, z, P));
        const wet = dm < 2.6 + n || dt < 1.4 + n * .5;
        if (wet || dm < 3.2 || dt < 2) { for (const [px, pz, tx, tz] of fords) { const ax = x - px, az = z - pz; if (Math.abs(ax * tx + az * tz) < 1.3 && Math.abs(-ax * tz + az * tx) < 4.5) return [1, 13]; } }   // vado: franja estrecha que cruza el cauce
        if (wet) return [dm < 1.6 ? -2 : -1, 0];
        if (dm < 4.6 + n || dt < 2.8) return [1, 14];   // ribera con juncos
        return [2 + Math.max(0, fbm(x * .05, z * .05, s + 16) - .5) * 6, 0]; });
      M.confluence = C; return fords.map(f => [f[0], f[1]]);
    },
    delta(M, r, s, F) {
      const ridges = []; for (const f of F) for (let k = 0; k < 3; k++) ridges.push(wander(r, f[0], f[1], 70 + r() * 52, 10 + r() * 108, 18, 12));
      M.each((x, z) => { const ch = Math.min(Math.abs(fbm(x * .03, z * .05, s + 17, 3) - .5), Math.abs(fbm(x * .05, z * .025, s + 18, 3) - .5) * 1.3), m = fbm(x * .07, z * .07, s + 19);
        if (F.some(f => Math.hypot(x - f[0], z - f[1]) < 14) || ridges.some(P => polyD(x, z, P) < 2.4 + fbm(x * .2, z * .2, s + 20))) return [2, 0];
        if (ch < .03) return [-1, 0]; return [m > .5 ? 2 : 1, m > .5 ? 0 : 2]; });
      return ridges.map(P => P[P.length - 1]).filter(p => Math.abs(p[0] - 96) < 40).slice(0, 4);
    },
    bosque(M, r, s, F) {   // claros irregulares y sendas de leñadores (bosque claro, 16: se tala rápido) entre ellos; algunos claros solo se alcanzan talando
      const cl = [...F.map(f => [...f, 15, 0]), ...scatter(r, 10, 20, [30, 10, W - 30, H - 10], p => F.every(f => Math.hypot(f[0] - p[0], f[1] - p[1]) > 24)).map(p => [...p, 4 + r() * 9, 0])];
      const hid = scatter(r, 2, 40, [50, 16, W - 50, H - 16], p => cl.every(c => Math.hypot(c[0] - p[0], c[1] - p[1]) > 18)).map(p => [...p, 7 + r() * 3, 1]);   // claros escondidos
      const pockets = scatter(r, 9, 14, [24, 8, W - 24, H - 8], p => [...cl, ...hid].every(c => Math.hypot(c[0] - p[0], c[1] - p[1]) > c[2] + 6)).map(p => [...p, 2 + r() * 3, 2]);   // huecos sueltos dentro del bosque
      const open = mst(cl).map(([a, b]) => wander(r, cl[a][0], cl[a][1], cl[b][0], cl[b][1], 18, 14));
      const paths = [];   // sendas de leñadores: a los claros escondidos, entre huecos y algún atajo
      for (const h of [...hid, ...pockets]) { let b = cl[0], bd = 1e9; for (const c of [...cl, ...pockets]) { const d = Math.hypot(c[0] - h[0], c[1] - h[1]); if (c !== h && d < bd) { bd = d; b = c; } } paths.push(wander(r, h[0], h[1], b[0], b[1], 10, 8)); }
      const all = [...cl, ...hid, ...pockets], fs = all.map(([cx, cz, rr], i) => blobR(cx, cz, rr * (1.1 + r() * .4), rr, 1, s + 30 + i));
      M.each((x, z) => { if (fs.some(f => f(x, z) < 1) || open.some(P => polyD(x, z, P) < 1.6 + fbm(x * .15, z * .15, s + 21) * 1.8)) return [2 + Math.max(0, fbm(x * .05, z * .05, s + 23) - .5) * 5, 0];
        const h = 2 + Math.max(0, fbm(x * .05, z * .05, s + 23) - .5) * 5;
        return [h, paths.some(P => polyD(x, z, P) < 1.4 + fbm(x * .2, z * .2, s + 22) * .8) ? 16 : 1]; });
      M.treasures = hid.map(h => [h[0], h[1]]);
      return open.filter(P => Math.abs(P[P.length >> 1][0] - 96) < 30).map(P => P[P.length >> 1]).slice(0, 5);
    },
    oasis(M, r, s, F) {   // casi todo arena con dunas que frenan (11); dos o tres oasis grandes y valiosos en el centro
      const oa = scatter(r, 3, 34, [66, 24, W - 66, H - 24], p => F.every(f => Math.hypot(f[0] - p[0], f[1] - p[1]) > 40));
      const mesas = scatter(r, 6, 20, [20, 8, W - 20, H - 8], p => oa.every(o => Math.hypot(o[0] - p[0], o[1] - p[1]) > 20)).map((p, i) => blobR(p[0], p[1], 4 + r() * 6, 3 + r() * 5, .8, s + 40 + i));
      M.each((x, z) => { for (const [ox, oz] of oa) { const d = Math.hypot(x - ox, z - oz) / (1 + (fbm(x * .15, z * .15, s + 24) - .5) * .5); if (d < 4) return [-1, 0]; if (d < 11) return [2, 4]; }
        if (mesas.some(f => f(x, z) < 1)) return [5, 3];
        const warp = fbm(x * .02, z * .02, s + 25) * 9, dune = Math.abs(Math.sin((x * .8 + z * .35) * .11 + warp));
        return dune > .9 ? [3, 11] : [2 + (dune > .8 ? 1 : 0), 3]; });   // solo las crestas de las dunas frenan
      M.special = oa; return [];
    },
    lago(M, r, s, F) {   // un gran lago con un volcán enorme en el centro: ríos de lava bajan por sus laderas hasta el agua; fumarolas en la orilla
      const cx = 96 + (r() - .5) * 14, cz = 64 + (r() - .5) * 8, f = blobR(cx, cz, 50 + r() * 6, 33 + r() * 4, .6, s + 26), R = 15;
      const gaps = [0, 1, 2].map(i => (i / 3) * Math.PI * 2 + r() * 1.6);
      // volcán irregular: radio que cambia con el ángulo, cráter desplazado y coladas de lava que serpentean con anchuras distintas
      const Ra = a => R * (1 + (fbm(Math.cos(a) * 1.4 + 3, Math.sin(a) * 1.4 + 5, s + 40, 3) - .5) * .7), crx = cx + (r() - .5) * 4, crz = cz + (r() - .5) * 3;
      const flows = Array.from({ length: 3 + (r() * 3 | 0) }, (_, i) => { const a = i * 6.283 / 5 + r() * 1.4, rr = Ra(a) * 1.02; return { P: wander(r, crx, crz, cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, 7, 9), w: .45 + r() * .55 }; });
      const fum = [0, 1, 2].map(i => { const a = i * 2.1 + r() * 1.2; let k = 1; while (k < 1.6 && f(cx + Math.cos(a) * 50 * k, cz + Math.sin(a) * 33 * k) < 1.12) k += .02; return [cx + Math.cos(a) * 50 * k, cz + Math.sin(a) * 33 * k]; });
      M.each((x, z) => { const v = f(x, z), dv = Math.hypot(x - cx, z - cz);
        const av = Math.atan2(z - cz, x - cx), ra = Ra(av);
        if (dv < ra) { const dc = Math.hypot(x - crx, z - crz), k = 1 - dv / ra, crater = dc < 2.2 + fbm(x * .5, z * .5, s + 41, 2);
          const lava = !crater && flows.some(f => polyD(x, z, f.P) < f.w * (1 + fbm(x * .3, z * .3, s + 42, 2) * .8));
          return [crater ? 8 : 2 + Math.pow(k, .8) * 11 + (fbm(x * .35, z * .35, s + 3, 3) - .5) * 2.4, crater || lava ? 10 : 5]; }
        if (v < 1) return [v < .85 ? -2 : -1, 0];
        if (v < 1.08) return [1, 3];
        const a = Math.atan2(z - cz, x - cx), gap = gaps.some(g => Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < .22);
        if (v < 1.45 && !gap) return [4 + fbm(x * .1, z * .1, s + 27) * 3, 0];
        return [2 + Math.max(0, fbm(x * .05, z * .05, s + 28) - .5) * 5, 0]; });
      M.reveal = (x, z) => f(x, z) < .8 || Math.hypot(x - cx, z - cz) < Ra(Math.atan2(z - cz, x - cx)) + 2;   // el volcán y el agua de alrededor (una forma como la orilla, pero más metida): siempre a la vista
      M.volcano = [crx, crz]; M.lavaEnds = flows.map(f => f.P[f.P.length - 1]); M.fumaroles = fum; M.special = [];
      return gaps.map(g => { let k = 1; while (k < 1.6 && f(cx + Math.cos(g) * 50 * k, cz + Math.sin(g) * 33 * k) < 1.25) k += .02; return [cx + Math.cos(g) * 50 * k, cz + Math.sin(g) * 33 * k]; });
    },
    // ===== geografías nuevas =====
    // valle helado: lagos helados que se cruzan a pie (6 = hielo) entre lomas nevadas
    helado(M, r, s, F) {   // uno o dos lagos helados enormes (hielo fino en el centro, 15), varios pequeños y ríos helados alargados
      const away = p => F.every(f => Math.hypot(f[0] - p[0], f[1] - p[1]) > 34);
      const big = scatter(r, 1 + (r() < .6 ? 1 : 0), 60, [60, 30, W - 60, H - 30], away).map((p, i) => blobR(p[0], p[1], 20 + r() * 12, 12 + r() * 8, .8, s + 60 + i));
      const small = scatter(r, 7, 20, [26, 10, W - 26, H - 10], away).map((p, i) => blobR(p[0], p[1], 3 + r() * 6, 2.5 + r() * 4, .9, s + 50 + i));
      const rivers = [0, 1].map(() => { const a = [20 + r() * (W - 40), r() < .5 ? -4 : H + 4], b = [20 + r() * (W - 40), 30 + r() * (H - 60)]; return wander(r, a[0], a[1], b[0], b[1], 14, 10); });
      M.each((x, z) => { let vb = 9, vs = 9; for (const f of big) vb = Math.min(vb, f(x, z)); for (const f of small) vs = Math.min(vs, f(x, z));
        if (vb < 1) return [1, vb < .5 ? 15 : 6]; if (vs < 1) return [1, 6];
        if (rivers.some(P => polyD(x, z, P) < 1.6 + fbm(x * .2, z * .2, s + 52) * 1.2)) return [1, 6];
        if (vb < 1.1 || vs < 1.12) return [1, 3];
        return [2 + Math.max(0, fbm(x * .05, z * .05, s + 51) - .45) * 7, 0]; });
      M.snow = true; return [];
    },
    // cañón: una garganta con río al fondo parte el mapa; se cruza por tres puentes (9 = tablero del puente) que se pueden destruir y reparar
    canon(M, r, s, F) {   // una garganta seca (17 = fondo de roca) parte el mapa; en el centro se abre en una cuenca redonda con una isla (la ciudadela) unida a cada orilla por un puente; otro puente al norte y otro al sur
      const P = wander(r, 96 + (r() - .5) * 20, -4, 96 + (r() - .5) * 20, H + 4, 22, 16), atZ = z => { for (let i = 0; i + 1 < P.length; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1]; if ((az - z) * (bz - z) <= 0) return ax + (bx - ax) * ((z - az) / ((bz - az) || 1)); } return 96; };
      M.div = atZ;
      const zc = H * .5 + (r() - .5) * 6, ic = [atZ(zc), zc];
      // cuenca e isla irregulares, pero la cuenca siempre rodea a la isla con un foso de al menos GAP: un anillo cerrado que solo se cruza por los puentes
      const GAP = 3.6, polarC = (x, z) => { const dx = x - ic[0], dz = (z - ic[1]) / 1.08; return [Math.hypot(dx, dz), Math.atan2(dz, dx)]; };
      const isR = a => 10 * (1 + (fbm(Math.cos(a) * 1.3 + 7, Math.sin(a) * 1.3 + 3, s + 63, 3) - .5) * .45), baR = a => Math.max(isR(a) + GAP, 13.5 * (1 + (fbm(Math.cos(a) * 1.3 + 7, Math.sin(a) * 1.3 + 3, s + 64, 3) - .5) * .3));
      const isl = (x, z) => { const [d, a] = polarC(x, z); return d / isR(a); }, basin = (x, z) => { const [d, a] = polarC(x, z); return d / baR(a); };
      // en la fila de los puentes centrales, los bordes de la isla y de la cuenca (para que los tableros encajen entre paredes rectas)
      const edge = (f, dir) => { let x = ic[0]; while (f(x, zc) < 1 && Math.abs(x - ic[0]) < 60) x += dir * .25; return x; };
      const iW = edge(isl, -1), iE = edge(isl, 1), bW = edge(basin, -1), bE = edge(basin, 1);
      const bz = [H * .17 + (r() - .5) * 6, H * .83 + (r() - .5) * 6];
      const bridges = [[atZ(bz[0]), bz[0], 10], [(bW + iW) / 2, zc, (iW - bW) / 2 + 2], [(iE + bE) / 2, zc, (bE - iE) / 2 + 2], [atZ(bz[1]), bz[1], 10]];
      M.each((x, z) => {
        const bNear = bz.find(b => Math.abs(z - b) < 5), nearB = bNear != null || Math.abs(z - zc) < 4.5, d = Math.abs(x - atZ(bNear ?? z)) + (nearB ? 0 : (fbm(x * .15, z * .15, s + 60) - .5) * .7);   // junto a un puente la garganta va recta (paredes paralelas al tablero)
        const row = Math.abs(z - zc) < 4.5, inBasin = row ? (x > bW && x < iW) || (x > iE && x < bE) : basin(x, z) < 1, onIsl = row ? x >= iW && x <= iE : isl(x, z) < 1, onB = bz.some(b => Math.abs(z - b) < 2.4) || (Math.abs(z - zc) < 2.4 && inBasin);
        if (onIsl) return [4, 0];
        if (d < 3 || inBasin) return onB ? [4, 9] : [1, 17];   // garganta estrecha, de anchura casi constante
        if ((bz.some(b => Math.abs(z - b) < 7) && d < 12) || basin(x, z) < 1.25) return [4, 0];   // explanadas junto a los puentes y alrededor de la cuenca
        return [3.6 + fbm(x * .05, z * .05, s + 61) * 1.6, 0]; });
      M.bridges = bridges; M.bridgeStyles = ['wood', 'stone', 'stone', 'wood']; M.confluence = ic; return bridges.map(b => [b[0], b[1]]);   // de madera al norte y al sur; de piedra a la isla
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
    // ruinas: grupos de restos repartidos por el mapa (7 = piedra en ruinas): tramos de muralla rotos, esquinas, torres redondas
    // a medio caer, recintos sin techo e hileras de columnas, cada uno con su orientación. Hay un tesoro escondido en cada grupo
    ruinas(M, r, s, F) {
      const clusters = scatter(r, 8, 30, [18, 10, W - 18, H - 10], p => F.every(f => Math.hypot(f[0] - p[0], f[1] - p[1]) > 26));
      const segs = [], rings = [], posts = [], treasures = [];
      const seg = (x, z, a, L, t) => segs.push([x, z, x + Math.cos(a) * L, z + Math.sin(a) * L, t]);
      for (const [cx, cz] of clusters) {
        const n = 3 + (r() * 4 | 0), base = r() * Math.PI;
        for (let k = 0; k < n; k++) {
          const ox = cx + (r() - .5) * 18, oz = cz + (r() - .5) * 14, a = base + (r() < .6 ? (r() * 4 | 0) * Math.PI / 2 : r() * Math.PI) + (r() - .5) * .25, kind = r();
          if (kind < .35) seg(ox, oz, a, 3 + r() * 7, .55 + r() * .3);   // tramo suelto
          else if (kind < .55) { const L1 = 3 + r() * 5, L2 = 2 + r() * 5; seg(ox, oz, a, L1, .6); seg(ox, oz, a + Math.PI / 2 * (r() < .5 ? 1 : -1), L2, .6); }   // esquina
          else if (kind < .72) rings.push([ox, oz, 1.6 + r() * 2.2, r() * 6.28, 3.2 + r() * 2.2]);   // torre redonda rota (arco)
          else if (kind < .88) { const w = 3 + r() * 4, d = 3 + r() * 3, c = Math.cos(a), sn = Math.sin(a), pts = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([u, v]) => [ox + u * c - v * sn, oz + u * sn + v * c]);   // recinto con huecos
            for (let e = 0; e < 4; e++) if (r() < .78) { const [ax, az] = pts[e], [bx, bz] = pts[(e + 1) % 4], f0 = r() * .3, f1 = .7 + r() * .3; segs.push([ax + (bx - ax) * f0, az + (bz - az) * f0, ax + (bx - ax) * f1, az + (bz - az) * f1, .55]); } }
          else for (let q = 0; q < 4 + (r() * 4 | 0); q++) posts.push([ox + Math.cos(a) * q * 2.2, oz + Math.sin(a) * q * 2.2, .55 + r() * .25]);   // hilera de columnas
        }
        treasures.push([cx + (r() - .5) * 6, cz + (r() - .5) * 6]);
      }
      const near = (x, z) => clusters.some(([cx, cz]) => Math.abs(x - cx) < 22 && Math.abs(z - cz) < 18);
      M.each((x, z) => {
        const base = [2 + Math.max(0, fbm(x * .05, z * .05, s + 101) - .5) * 5, 0];
        if (!near(x, z)) return base;
        const broken = hsh(Math.floor(x * 2), Math.floor(z * 2), s + 3) < .14;   // mordiscos en los muros
        for (const [ax, az, bx, bz, t] of segs) if (segD(x, z, ax, az, bx, bz) < t && !broken) return [base[0] + 2, 7];
        for (const [rx, rz, rr, a0, arc] of rings) { const d = Math.hypot(x - rx, z - rz), a = ((Math.atan2(z - rz, x - rx) - a0) % 6.283 + 6.283) % 6.283; if (Math.abs(d - rr) < .55 && a < arc && !broken) return [base[0] + 2, 7]; }
        for (const [px, pz, t] of posts) if (Math.hypot(x - px, z - pz) < t) return [base[0] + 2.5, 7];
        if (hsh(Math.floor(x * 3), Math.floor(z * 3), s + 4) < .05 && clusters.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 12)) return [base[0], 7];   // cascotes
        return base; });
      M.treasures = treasures; return [];
    },
  };


  const LIST = { cordillera: 'CORDILLERA', istmo: 'ISTMO', archipielago: 'ARCHIPIÉLAGO', barrancos: 'BARRANCOS', meseta: 'MESETA', afluentes: 'AFLUENTES', delta: 'DELTA', bosque: 'BOSQUE', oasis: 'DESIERTO', lago: 'CALDERA', helado: 'VALLE HELADO', canon: 'CAÑÓN', costa: 'COSTA', ruinas: 'RUINAS' };
  function build(id, seed) {
    const r = rngOf(seed), s = seed % 997, F = fortsFor(r), HMg = new Float32Array(MW * MD), TTg = new Uint8Array(MW * MD);
    // alturas hasta 12; las cumbres de la cordillera (18) pueden subir hasta 26
    const M = { each(fn) { for (let gz = 0; gz < MD; gz++) for (let gx = 0; gx < MW; gx++) { const i = gz * MW + gx, o = fn((gx + .5) * W / MW, (gz + .5) * H / MD, HMg[i], TTg[i]); if (o) { HMg[i] = Math.min(o[1] === 18 ? 26 : 12, Math.round(o[0])); TTg[i] = o[1]; } } } };
    const passes = GEN[id](M, r, s, F) || [];
    // la fortaleza no puede tapar un río, un lago ni un rasgo especial: si su explanada los toca, se busca el sitio limpio más cercano en su lado
    const at = (x, z) => { const gx = Math.floor(x * MW / W), gz = Math.floor(z * MD / H); return gx < 0 || gz < 0 || gx >= MW || gz >= MD ? -1 : gz * MW + gx; };
    const clean = (fx, fz) => { for (let dz = -15; dz <= 15; dz += 1.5) for (let dx = -15; dx <= 15; dx += 1.5) { if (dx * dx + dz * dz > 225) continue; const i = at(fx + dx, fz + dz); if (i < 0 || HMg[i] <= 0 || (TTg[i] && TTg[i] !== 3 && TTg[i] !== 16 && TTg[i] !== 1)) return false; } return true; };
    if (id !== 'archipielago' && id !== 'costa') F.forEach((f, k) => { if (clean(f[0], f[1])) return; let best = null, bd = 1e9;
      for (let z = 22; z <= H - 22; z += 2) for (let x = k ? W - 46 : 16; x <= (k ? W - 16 : 46); x += 2) { const d = Math.hypot(x - f[0], z - f[1]); if (d < bd && clean(x, z)) { bd = d; best = [x, z]; } }
      if (best) { f[0] = best[0]; f[1] = best[1]; } });
    for (const [fx, fz] of F) M.each((x, z, h) => Math.hypot(x - fx, z - fz) < 13 ? [Math.max(2, Math.min(h, 4)), 0] : null);   // explanada de cada fortaleza
    let RV = null; if (M.reveal) { RV = new Uint8Array(MW * MD); for (let gz = 0; gz < MD; gz++) for (let gx = 0; gx < MW; gx++) if (M.reveal((gx + .5) * W / MW, (gz + .5) * H / MD)) RV[gz * MW + gx] = 1; }
    if (globalThis.__FLIPMAP) {   // prueba: el mapa reflejado de oeste a este
      for (let gz = 0; gz < MD; gz++) for (let gx = 0; gx < MW / 2; gx++) { const i = gz * MW + gx, j = gz * MW + MW - 1 - gx; [HMg[i], HMg[j]] = [HMg[j], HMg[i]]; [TTg[i], TTg[j]] = [TTg[j], TTg[i]]; if (RV) [RV[i], RV[j]] = [RV[j], RV[i]]; }
      const fl = q => { q[0] = W - q[0]; }; F.forEach(fl); F.reverse(); passes.forEach(fl); for (const k of ['special', 'treasures', 'lavaEnds', 'fumaroles', 'bridges']) (M[k] || []).forEach(fl); for (const k of ['confluence', 'volcano']) if (M[k]) fl(M[k]);
      if (M.div) { const d0 = M.div; M.div = z => W - d0(z); }
    }
    const up = p => [p[0] * MW / W, p[1] * MD / H];
    return { HM: HMg, TT: TTg, reveal: RV, F: F.map(up), passes: passes.map(up), special: (M.special || []).map(up), div: M.div ? z => M.div(z * H / MD) * MW / W : null,
      volcano: M.volcano ? up(M.volcano) : null, lavaEnds: (M.lavaEnds || []).map(up), fumaroles: (M.fumaroles || []).map(up), confluence: M.confluence ? up(M.confluence) : null, bridgeStyles: M.bridgeStyles || [], bridges: (M.bridges || []).map(b => [...up(b), (b[2] || 13) * MW / W]), treasures: (M.treasures || []).map(up), snow: !!M.snow,
      sea: id === 'istmo' || id === 'archipielago' || id === 'costa', river: id === 'afluentes', goldTop: id === 'meseta', oasis: id === 'oasis' };
  }
  // una frase para el menú: qué hace especial a cada geografía
  const DESC = { cordillera: 'Una muralla de montañas con tres puertos vigilados. Desde las cumbres se ve lejos, pero la nieve frena.',
    istmo: 'Un solo paso de tierra entre dos mares. La ciudadela lo guarda.', archipielago: 'Islas unidas por bajíos que la marea cubre cada pocos minutos.',
    barrancos: 'Gargantas y mesetas: en el fondo nadie te ve llegar.', meseta: 'Una gran meseta de oro doble con solo tres rampas estrechas.',
    afluentes: 'Dos ríos se juntan en el centro. Las crecidas cierran los vados.', delta: 'Canales y pantanos que ocultan a las tropas y atascan a los jinetes.',
    bosque: 'Un bosque cerrado: tala sendas para avanzar y encontrar los claros escondidos.', oasis: 'Dunas y sed. Pocos oasis, muy valiosos.',
    lago: 'Un lago con un volcán gigante en el centro: en cada erupción lanza una roca enorme.', helado: 'Lagos helados: el hielo se rompe si cargas demasiadas tropas encima.',
    canon: 'Una garganta seca con una isla fortificada en el centro. Quien controle los puentes, controla el mapa.', costa: 'Las fortalezas en lo alto del acantilado y pocas rampas hasta el llano. A veces llega un tsunami.',
    ruinas: 'Restos de una ciudad antigua, con tesoros escondidos entre los muros.', };
  const NAME = { ...LIST, rio: 'RÍO' };   // el río clásico ya no se elige, pero queda como mapa de reserva
  return { build, LIST, NAME, DESC, keys: Object.keys(LIST) };
})();
