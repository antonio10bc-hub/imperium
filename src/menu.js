// Menú principal: retratos y selección de civilizaciones, mapa y dificultad.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { BONUS, CIV, CIVS, civPick } from './civs.js';
import { TEAM } from './config.js';
import { newGame } from './game.js';
import { GEO } from './geo.js';
import { syncDiff } from './hud.js';
import { resize } from './overlay.js';
import { part } from './render.js';
import { $, S } from './state.js';
import { offscreen, palettize } from './units.js';

// ---------- Menú principal: retratos de héroe y fortaleza ----------
const PORT = {};
// retrato vóxel de un héroe o de una fortaleza (castillo, cuartel y altar) con el color del bando; se dibuja una vez y se guarda
function portrait(kind, ci, side) {
  const key = kind + ci + '_' + side; if (PORT[key]) return PORT[key];
  try {
    const portR = offscreen(), hero = kind === 'hero', w = hero ? 120 : 176, h = hero ? 120 : 132; portR.setSize(w, h, false);
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, w / h, .1, 200), l = new THREE.DirectionalLight(0xfff6e8, 2.2); l.position.set(3, 6, 5); sc.add(l, new THREE.HemisphereLight(0xe6eeff, 0x5a4aa8, 1.25));
    const g = new THREE.Group(), c = CIVS[ci], T = TEAM[side].c; sc.add(g);
    if (hero) c.hero(g, T);
    else { part(g, 11, .5, 8, c.map.plaza, 0, -.25, 0, false); c.castle(CIV.grp(g, .4, 0, -.6, .9), T); c.barracks(CIV.grp(g, -3.8, 0, 2.2, .7, .4), T); c.map.altar(CIV.grp(g, 3.9, 0, 2.3, 1.05, -.3), T); }
    g.rotation.y = side ? -.55 : .55;   // el tuyo mira hacia la derecha, el del rival hacia la izquierda
    const box = new THREE.Box3().setFromObject(g), ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const dist = Math.max(size.y * (hero ? 1.15 : 1.25), size.x / (w / h) * .95) / (2 * Math.tan(13 * Math.PI / 180));
    cam.position.copy(ctr).add(new THREE.Vector3(0, hero ? .35 : .9, 1).normalize().multiplyScalar(dist)); cam.lookAt(ctr);
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
      else { node = new Image(); node.alt = ''; node.src = portrait(stage.dataset.kind, ci, sd); }
      swapStage(stage, node, dir);
    }
    for (const nm of document.querySelectorAll(`#start .s${sd} .nm`)) nm.textContent = ci < 0 ? 'ALEATORIA' : CIVS[ci].name;
    const b = ci < 0 ? null : BONUS[CIVS[ci].id], info = $('civInfo' + sd);   // ventaja de la civilización elegida
    if (info) info.innerHTML = b ? `<b>${b.name}</b> ${b.text}` : 'ventaja al azar';
  }
}

// preparación de la página (listeners y elementos del DOM); la llama main.js al arrancar
export function init() {
  document.querySelectorAll('#start .arr').forEach(b => b.addEventListener('click', () => {
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
    el.addEventListener('change', () => { S.wantScen = el.value; try { localStorage.setItem('imperium-geo', S.wantScen); } catch (e) {} sfx('select'); S.menuDirty = true; });
  }
  $('howBtn').addEventListener('click', () => { sfx('select'); $('start').hidden = true; $('how').hidden = false; });
  $('howBack').addEventListener('click', () => { sfx('select'); $('how').hidden = true; $('start').hidden = false; });
  $('again').addEventListener('click', () => newGame(1 + Math.floor(Math.random() * 99999)));
  document.querySelectorAll('.diff button[data-d]').forEach(b => b.addEventListener('click', () => { S.diff = b.dataset.d; try { localStorage.setItem('imperium-diff', S.diff); } catch (e) {} syncDiff(); sfx('select'); })); resize();
}
