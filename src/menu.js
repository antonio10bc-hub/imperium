// Menú principal: mapa a la izquierda; en el centro, civilizaciones (con su ventaja), mapa y dificultad; a la derecha, fortaleza y héroe de cada bando.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { BONUS, CIV, CIVS, civPick } from './civs.js';
import { MW, TEAM, idx } from './config.js';
import { newGame } from './game.js';
import { GEO } from './geo.js';
import { syncDiff } from './hud.js';
import { previewMap } from './map.js';
import { resize } from './overlay.js';
import { part } from './render.js';
import { $, S } from './state.js';
import { offscreen, palettize } from './units.js';

// ---------- Menú principal: retrato de fortaleza y héroe ----------
const PORT = {};
// fortaleza (castillo, cuartel y salón de héroes sobre su plaza) con el héroe delante, del color del bando; se dibuja una vez y se guarda.
// La cámara se ajusta a todo el conjunto con margen, para que la imagen salga entera
function portrait(ci, side) {
  const key = ci + '_' + side; if (PORT[key]) return PORT[key];
  try {
    const portR = offscreen(), w = 260, h = 210; portR.setSize(w, h, false);
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, w / h, .1, 300), l = new THREE.DirectionalLight(0xfff6e8, 2.2); l.position.set(3, 6, 5); sc.add(l, new THREE.HemisphereLight(0xe6eeff, 0x5a4aa8, 1.25));
    const g = new THREE.Group(), c = CIVS[ci], T = TEAM[side].c, f = side ? -1 : 1; sc.add(g);
    part(g, 11, .5, 8, c.map.plaza, 0, -.25, 0, false);
    c.castle(CIV.grp(g, -.6 * f, 0, -1.2, .85), T); c.barracks(CIV.grp(g, -4 * f, 0, 1.6, .65, .4 * f), T); c.map.altar(CIV.grp(g, 3.8 * f, 0, -1.4, .8, -.3 * f), T);
    c.hero(CIV.grp(g, 2.6 * f, 0, 3, 2.3, -.35 * f), T);   // el héroe, grande y delante
    g.rotation.y = .45 * f;   // el tuyo mira hacia la derecha, el del rival hacia la izquierda
    const box = new THREE.Box3().setFromObject(g), ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const dist = Math.max(size.y * 1.3, size.x / (w / h) * 1.12, size.z * .9) / (2 * Math.tan(13 * Math.PI / 180));
    cam.position.copy(ctr).add(new THREE.Vector3(0, .75, 1).normalize().multiplyScalar(dist)); cam.lookAt(ctr);
    portR.render(sc, cam); return (PORT[key] = palettize(portR.domElement));
  } catch (e) { return ''; }
}
const civOpts = () => ['random', ...CIVS.map(c => c.id)];
function setCiv(sd, val, dir) {
  civPick[sd] = val; $('civ' + sd).value = val; try { localStorage.setItem('imperium-civs', JSON.stringify(civPick)); } catch (e) {}
  S.menuDirty = true; sfx('select'); showPortraits(sd, dir);
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

// miniatura de la geografía elegida: agua, alturas, bosque denso, pantano y arena, con tu fortaleza (azul) y la del rival (roja)
const PREV_COL = { deep: 0x4594c6, shallow: 0x5fb0d4, forest: 0x2f5a35, swamp: 0x6c9a92, sand: 0xdccb95, oasis: 0x4f9a3a, rock: 0x9a9488, snow: 0xe4e2da, grass: [0x7db45b, 0x8bbd61, 0x9fc56c] };
function drawGeoPreview() {
  const c = $('geoPrev'), x = c.getContext('2d'), W = c.width, H = c.height, key = S.wantScen;
  $('geoName').textContent = GEO.LIST[key] || 'ALEATORIO';
  if (!GEO.LIST[key]) { x.fillStyle = '#262a3b'; x.fillRect(0, 0, W, H); x.fillStyle = '#e8c870'; x.font = '150px Silkscreen, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', W / 2, H / 2 + 8); return; }
  const p = previewMap(key), img = x.createImageData(W, H), k = MW / W;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c0 = idx(i * k | 0, j * k | 0), h = p.HM[c0], t = p.TT[c0], C = PREV_COL;
    const col = h <= 0 ? (h < -1.5 ? C.deep : C.shallow) : t === 1 ? C.forest : t === 2 ? C.swamp : t === 4 ? C.oasis : t === 3 || h <= 1 ? C.sand : h >= 9 ? C.snow : h >= 6 ? C.rock : C.grass[Math.min(2, Math.max(0, Math.round(h) - 2))];
    const o = (j * W + i) * 4; img.data[o] = col >> 16 & 255; img.data[o + 1] = col >> 8 & 255; img.data[o + 2] = col & 255; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  p.F.forEach(([fx, fz], sd) => { const px = fx / k, pz = fz / k; x.fillStyle = '#0f0f1b'; x.fillRect(px - 10, pz - 10, 20, 20); x.fillStyle = TEAM[sd].css; x.fillRect(px - 7, pz - 7, 14, 14); });
}

// preparación de la página (listeners y elementos del DOM); la llama main.js al arrancar
function setGeo(v) {
  S.wantScen = v; $('geo').value = GEO.LIST[v] ? v : 'random'; try { localStorage.setItem('imperium-geo', v); } catch (e) {}
  sfx('select'); S.menuDirty = true; drawGeoPreview();
}

export function init() {
  document.querySelectorAll('#start .arr[data-side]').forEach(b => b.addEventListener('click', () => {
    const sd = +b.dataset.side, d = +b.dataset.d, o = civOpts(), i = o.indexOf(civPick[sd]);
    setCiv(sd, o[(i + d + o.length) % o.length], d);
  }));
  for (const sd of [0, 1]) {
    const el = $('civ' + sd);
    el.innerHTML = '<option value="random">ALEATORIA</option>' + CIVS.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    el.value = civPick[sd] || 'random';
    el.addEventListener('change', () => setCiv(sd, el.value, 1));
  }
  { const el = $('geo');
    el.innerHTML = '<option value="random">ALEATORIO</option>' + GEO.keys.map(k => `<option value="${k}">${GEO.LIST[k]}</option>`).join('');
    el.value = GEO.LIST[S.wantScen] ? S.wantScen : 'random';
    el.addEventListener('change', () => setGeo(el.value));
    document.querySelectorAll('#start [data-geo]').forEach(b => b.addEventListener('click', () => { const o = ['random', ...GEO.keys], i = o.indexOf(S.wantScen); setGeo(o[(i + +b.dataset.geo + o.length) % o.length]); }));
    setTimeout(drawGeoPreview, 0);
  }
  $('howBtn').addEventListener('click', () => { sfx('select'); $('start').hidden = true; $('how').hidden = false; });
  $('howBack').addEventListener('click', () => { sfx('select'); $('how').hidden = true; $('start').hidden = false; });
  $('again').addEventListener('click', () => newGame(1 + Math.floor(Math.random() * 99999)));
  document.querySelectorAll('.diff button[data-d]').forEach(b => b.addEventListener('click', () => { S.diff = b.dataset.d; try { localStorage.setItem('imperium-diff', S.diff); } catch (e) {} syncDiff(); sfx('select'); })); resize();
}
