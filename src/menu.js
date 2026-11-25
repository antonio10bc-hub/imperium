// Menú principal en tres columnas iguales: civilizaciones (la tuya arriba, la del rival abajo), geografía y, a la derecha, título, dificultad y jugar.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { BONUS, CIV, CIVS, civPick } from './civs.js';
import { MAX_PLAYERS, MD, MW, TEAM, TP, idx, mixHex } from './config.js';
import { newGame } from './game.js';
import { GEO } from './geo.js';
import { syncDiff } from './hud.js';
import { geoTerrain, parseCode, previewMap } from './map.js';
import { resize } from './overlay.js';
import { bake, grad, part } from './render.js';
import { $, S } from './state.js';
import { seed } from './noise.js';
import { offscreen } from './units.js';

// ---------- Menú principal: retrato de cada civilización ----------
const PORT = {};
// diorama de la fortaleza (castillo, cuartel y templo sobre su plaza) con el héroe grande delante, del color del bando,
// con contornos como en la partida; se dibuja una vez a buena resolución y se guarda. La cámara encuadra todo el conjunto.
function portrait(ci, side) {
  const key = ci + '_' + side; if (PORT[key]) return PORT[key];
  try {
    const r = offscreen(), w = 960, h = 600; r.setSize(w, h, false);
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(24, w / h, .1, 300), f = side ? -1 : 1;
    const key1 = new THREE.DirectionalLight(0xfff6e8, 1.9), rim = new THREE.DirectionalLight(0xffd890, .7);
    key1.position.set(-3 * f, 7, 6); rim.position.set(4 * f, 3, -7); sc.add(key1, rim, new THREE.HemisphereLight(0xe6eeff, 0x5a4aa8, 1));
    const g = new THREE.Group(), c = CIVS[ci], M = c.map, T = TEAM[side].c; sc.add(g);
    part(g, 15, 1, 10.5, M.ground[0], 0, -.5, 0); part(g, 15.2, .9, 10.7, TP.cliff, 0, -1.4, 0);   // bloque de terreno
    part(g, 11, .14, 6.6, M.plaza, -.2 * f, .07, -.9, false);
    for (const [x, z, s] of [[-6.4, -4, 1], [6.3, -3.7, .9], [-6.6, 3.8, .8], [6.6, 4.2, 1.1]]) {   // matas en las esquinas
      part(g, .9 * s, .9 * s, .9 * s, M.treeCol ?? TP.canopy, x, .45 * s, z); part(g, .5 * s, .4 * s, .5 * s, mixHex(M.treeCol ?? TP.canopy, 0x9ad86a, .25), x + .1, 1 * s, z - .1);
    }
    c.castle(CIV.grp(g, -.4 * f, 0, -1.8, .9), T); c.barracks(CIV.grp(g, -4.6 * f, 0, 1.4, .62, .35 * f), T); M.altar(CIV.grp(g, 4.5 * f, 0, -1.6, .78, -.3 * f), T);
    c.hero(CIV.grp(g, 2.6 * f, .02, 2.8, 3.1, -.35 * f), T);   // el héroe, grande y delante
    g.rotation.y = .38 * f;   // el tuyo mira hacia la derecha, el del rival hacia la izquierda
    const baked = bake(g);
    fitCam(cam, g, new THREE.Vector3(0, .62, 1), .97);
    r.render(sc, cam); const url = r.domElement.toDataURL();
    for (const m of baked) m.geometry.dispose();
    return (PORT[key] = url);
  } catch (e) { return ''; }
}
// coloca la cámara en la dirección dada y a la distancia justa para que el modelo entero (todos sus vértices) llene el encuadre
function fitCam(cam, obj, dir, fill) {
  obj.updateMatrixWorld(true);
  const pts = [], v = new THREE.Vector3();
  obj.traverse(o => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 2) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).clone()); });
  const ctr = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3()); dir.normalize();
  let dist = 40;
  for (let it = 0; it < 5; it++) {
    cam.position.copy(ctr).addScaledVector(dir, dist); cam.lookAt(ctr); cam.updateMatrixWorld();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const t = dist * Math.tan(cam.fov * Math.PI / 360);
    ctr.add(new THREE.Vector3((x0 + x1) / 2 * cam.aspect * t, (y0 + y1) / 2 * t, 0).applyQuaternion(cam.quaternion));   // recentra
    dist *= Math.max(x1 - x0, y1 - y0) / 2 / fill;
  }
  cam.position.copy(ctr).addScaledVector(dir, dist); cam.lookAt(ctr);
}
// ---------- Menú principal: vista de la geografía ----------
// Terreno real de la geografía de ejemplo (sin edificios), visto desde el sur como en la partida y acercado al centro del mapa
const GEOIMG = {};
// la zona más vistosa del ejemplo: muchos desniveles y orillas, poca cumbre nevada y plana
// cámara de la vista: desde el sur, inclinada como en la partida, mirando al punto (cx, cz)
const GEO_W = 640, GEO_H = 1000;
function geoCam(cx, cz) {
  const cam = new THREE.PerspectiveCamera(30, GEO_W / GEO_H, 1, 1200), D = 185, pitch = 44 * Math.PI / 180;
  cam.position.set(cx, 2 + D * Math.sin(pitch), cz + D * Math.cos(pitch)); cam.lookAt(cx, 2, cz); cam.updateMatrixWorld(); return cam;
}
// lo que se ve del suelo (y = 0) con la cámara centrada en (0, 0): así se elige un centro desde el que no asome nada fuera del mapa
let FOOT = null;
function footprint() {
  if (FOOT) return FOOT;
  const cam = geoCam(0, 0), ray = new THREE.Raycaster(), pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  FOOT = { x0: 0, x1: 0, z0: 0, z1: 0 };
  for (const nx of [-1, 0, 1]) for (const ny of [-1, 0, 1]) {
    ray.setFromCamera(new THREE.Vector2(nx, ny), cam); if (!ray.ray.intersectPlane(pl, hit)) continue;
    FOOT.x0 = Math.min(FOOT.x0, hit.x); FOOT.x1 = Math.max(FOOT.x1, hit.x); FOOT.z0 = Math.min(FOOT.z0, hit.z); FOOT.z1 = Math.max(FOOT.z1, hit.z);
  }
  return FOOT;
}
function geoFocus(key) {
  const p = previewMap(key), H = i => { const g = p.HM[i]; return g >= .5 ? Math.max(1, Math.round(g)) : 0; }, F = footprint(), m = 3;
  const xa = Math.ceil(m - F.x0), xb = Math.floor(MW - m - F.x1), za = Math.ceil(m - F.z0), zb = Math.floor(MD - m - F.z1);
  let best = [THREE.MathUtils.clamp(MW / 2, xa, xb), THREE.MathUtils.clamp(MD / 2, za, zb)], bv = -1e9;
  for (let cz = za; cz <= zb; cz += 8) for (let cx = Math.max(xa, 50); cx <= Math.min(xb, MW - 50); cx += 16) {
    let v = 0;
    for (let z = Math.max(0, cz - 50); z < Math.min(MD - 2, cz + 50); z += 2) for (let x = cx - 40; x < cx + 40; x += 2) {
      const i = idx(x, z), h = H(i), hr = H(i + 2), hd = H(i + 2 * MW);
      if (h !== hr) v += (h === 0) !== (hr === 0) ? 3 : 1;
      if (h !== hd) v += (h === 0) !== (hd === 0) ? 3 : 1;
      if (h >= 9) v -= 1.5; if (p.TT[i] === 1) v += .15;
    }
    v -= Math.hypot(cx - MW / 2, cz - MD / 2) * .4;   // a igualdad, mejor cerca del centro
    if (v > bv) { bv = v; best = [cx, cz]; }
  }
  return best;
}
function geoRender(key) {
  if (GEOIMG[key]) return GEOIMG[key];
  try {
    const r = offscreen(); r.setSize(GEO_W, GEO_H, false);
    const sc = new THREE.Scene(), SKY = new THREE.Color(0x8ad8f0); sc.background = SKY; sc.fog = new THREE.Fog(SKY, 200, 430);
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.2); sun.position.set(-60, 120, 80); sc.add(sun, new THREE.HemisphereLight(0xe6eeff, 0x5a4aa8, 1.25));
    const [cx, cz] = geoFocus(key), grp = geoTerrain(key, cx - 120, 0, cx + 120, MD); sc.add(grp);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshToonMaterial({ color: 0x1e4a8a, gradientMap: grad })); sea.rotation.x = -Math.PI / 2; sea.position.set(cx, -1.5, cz); sc.add(sea);
    const cam = geoCam(cx, cz);
    r.render(sc, cam); const url = r.domElement.toDataURL('image/jpeg', .9);
    grp.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); sea.geometry.dispose(); sea.material.dispose();
    return (GEOIMG[key] = url);
  } catch (e) { return ''; }
}
const civOpts = () => ['random', ...CIVS.map(c => c.id)];
function setCiv(sd, val, dir) {
  civPick[sd] = val; try { localStorage.setItem('imperium-civs', JSON.stringify(civPick)); } catch (e) {}
  S.menuDirty = true; sfx('ui'); showPortraits(sd, dir);
}
// cambia el contenido de una casilla con un deslizamiento suave: lo viejo sale hacia un lado y lo nuevo entra desde el otro
function swapStage(stage, node, dir) {
  node.style.setProperty('--dx', String(dir * 70));
  for (const old of [...stage.children]) { old.style.setProperty('--dx', String(dir * 70)); old.classList.add('leave'); setTimeout(() => old.remove(), 600); }
  if (dir) { node.classList.add('enter'); stage.appendChild(node); requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('enter'))); }
  else { for (const old of [...stage.children]) old.remove(); stage.appendChild(node); }
}
export function showPortraits(onlySide = -1, dir = 0) {
  for (const sd of [0, 1]) {
    if (onlySide >= 0 && sd !== onlySide) continue;
    const val = civPick[sd], ci = CIVS.findIndex(c => c.id === val);
    for (const stage of document.querySelectorAll(`#start .stage[data-side="${sd}"]`)) {
      let node;
      if (ci < 0) { node = document.createElement('div'); node.className = 'q'; node.textContent = '?'; }
      else { node = new Image(); node.alt = ''; node.src = portrait(ci, sd); }
      swapStage(stage, node, dir);
    }
    for (const nm of document.querySelectorAll(`#start .s${sd} .nm`)) nm.textContent = ci < 0 ? 'ALEATORIA' : CIVS[ci].name;
    const b = ci < 0 ? null : BONUS[CIVS[ci].id], info = $('civInfo' + sd);   // ventaja de la civilización elegida
    if (info) info.innerHTML = b ? `<b>${b.name}</b> ${b.text}` : 'ventaja al azar';
  }
}

function showGeo(dir = 0) {
  const key = S.wantScen, node = GEO.LIST[key] ? Object.assign(new Image(), { alt: '', src: geoRender(key) }) : Object.assign(document.createElement('div'), { className: 'q', textContent: '?' });
  $('geoName').textContent = GEO.LIST[key] || 'ALEATORIA'; $('geoDesc').textContent = GEO.DESC[key] || 'UNA GEOGRAFÍA AL AZAR.';
  swapStage($('geoStage'), node, dir);
}

// preparación de la página (listeners y elementos del DOM); la llama main.js al arrancar
function setGeo(v, dir, keepCode = false) {
  if (!keepCode) { S.codeSeed = null; $('mapCode').value = ''; $('mapCode').className = ''; }
  S.wantScen = v; try { localStorage.setItem('imperium-geo', v); } catch (e) {}
  sfx('ui'); S.menuDirty = true; showGeo(dir);
}

// tamaño del mapa: pequeño, normal o grande
export function setSize(k, quiet = false) {
  S.mapSize = k; try { localStorage.setItem('imperium-size', k); } catch (e) {}
  document.querySelectorAll('#start [data-size]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === k)));
  setPlayersPick(Math.min(S.players || 2, MAX_PLAYERS[k] || 2), true);   // pequeño: 2 · normal: hasta 3 · grande: hasta 5
  if (!quiet) { sfx('ui'); S.menuDirty = true; }
}
// jugadores en la partida (todos contra todos); los que no caben en el tamaño elegido salen desactivados
export function setPlayersPick(n, quiet = false) {
  const max = MAX_PLAYERS[S.mapSize] || 2; n = Math.max(2, Math.min(n, max)); S.players = n; try { localStorage.setItem('imperium-players', n); } catch (e) {}
  document.querySelectorAll('#start [data-players]').forEach(b => { const v = +b.dataset.players; b.setAttribute('aria-pressed', String(v === n)); b.disabled = v > max; b.title = v > max ? 'Necesita un mapa más grande' : ''; });
  if (!quiet) { sfx('ui'); S.menuDirty = true; }
}
export function init() {
  document.querySelectorAll('#start [data-players]').forEach(b => b.addEventListener('click', () => setPlayersPick(+b.dataset.players)));
  document.querySelectorAll('#start [data-size]').forEach(b => b.addEventListener('click', () => setSize(b.dataset.size)));
  setSize(S.mapSize, true);
  document.querySelectorAll('#start .arr[data-side]').forEach(b => b.addEventListener('click', () => {
    const sd = +b.dataset.side, d = +b.dataset.d, o = civOpts(), i = o.indexOf(civPick[sd]);
    setCiv(sd, o[(i + d + o.length) % o.length], d);
  }));
  document.querySelectorAll('#start [data-geo]').forEach(b => b.addEventListener('click', () => { const d = +b.dataset.geo, o = ['random', ...GEO.keys], i = o.indexOf(S.wantScen); setGeo(o[(i + d + o.length) % o.length], d); }));
  setTimeout(() => showGeo(), 0);
  $('mapCode').addEventListener('input', e => {   // código de mapa: elige su geografía y su semilla
    const el = e.target, c = parseCode(el.value);
    if (c) { setGeo(c.geo, 1, true); S.codeSeed = c.seed; setSize(c.size, true); setPlayersPick(c.players, true); S.menuDirty = true; }
    else S.codeSeed = null;
    el.className = !el.value.trim() ? '' : c ? 'ok' : 'bad';
  });
  $('howBtn').addEventListener('click', () => { sfx('ui'); $('start').hidden = true; $('how').hidden = false; });
  $('howBack').addEventListener('click', () => { sfx('ui'); $('how').hidden = true; $('start').hidden = false; });
  $('again').addEventListener('click', () => newGame(1 + Math.floor(Math.random() * 99999)));
  $('againSame').addEventListener('click', () => { S.pendingStart = true; newGame(seed, true); });   // revancha: mismo mapa y mismas civilizaciones
  document.querySelectorAll('.diff button[data-d]').forEach(b => b.addEventListener('click', () => { S.diff = b.dataset.d; try { localStorage.setItem('imperium-diff', S.diff); } catch (e) {} syncDiff(); sfx('ui'); })); resize();
}
