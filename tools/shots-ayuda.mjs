// Capturas para la pantalla «Cómo se juega» (img/ayuda/*.jpg): escenas montadas en una partida real, sin niebla.
// Uso: npm run build && npm run shots:ayuda   (requiere Google Chrome; CHROME=ruta para otro navegador)
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), url = 'file://' + path.join(root, 'dist/imperium.html');
const out = path.join(root, 'img/ayuda'); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];

async function game(code) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.addInitScript(() => { localStorage.setItem('imperium-sound', '0'); localStorage.setItem('imperium-civs', JSON.stringify(['romanos', 'galos'])); });
  await p.goto(`${url}?mapa=${code}`); await p.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 120000 });
  await p.click('#go'); await p.waitForFunction(() => __game.state === 'play'); await p.keyboard.press('Escape'); await p.waitForTimeout(3800);
  await p.keyboard.press('p'); await p.keyboard.press('n');   // en pausa y sin niebla
  await p.evaluate(() => { document.getElementById('pause').style.visibility = 'hidden'; document.getElementById('toast').style.visibility = 'hidden'; });
  return p;
}
const hud = (p, on) => p.evaluate(on => document.getElementById('ui').classList.toggle('hidden-ui', !on), on);
const CLIP = { x: 0, y: 80, width: 1280, height: 720 };   // sin la franja de arriba (el contador de la regla del mapa)
async function shot(p, name, [x, z, d], ui = false, clip = CLIP) {
  await hud(p, ui); await p.evaluate(([x, z, d]) => __game.cam(x, z, d), [x, z, d]); await p.waitForTimeout(900);
  fs.writeFileSync(path.join(out, name + '.jpg'), await p.screenshot({ type: 'jpeg', quality: 78, clip }));
  console.log('img/ayuda/' + name + '.jpg');
}

const p = await game('AFLUENTES-4242');
// tropas propias junto a la fortaleza, delante de ella (hacia el centro del mapa)
const army = await p.evaluate(() => { const g = __game, b = g.spots[0], dx = Math.sign(192 - b.x) || 1, x = b.x + dx * 26, z = b.z, L = [];
  for (let k = 0; k < 18; k++) L.push(g.spawnAt(0, ['sword', 'sword', 'bow'][k % 3], x + (k % 6) * 1.6, z + Math.floor(k / 6) * 1.6, 0));
  g.setSelection(L, false); return [x + 4, z + 1.6]; });

// 1 · objetivo: la fortaleza rival
await shot(p, 'gana', await p.evaluate(() => [__game.spots[1].x, __game.spots[1].z + 3, 52]));
// 3 · mover y orientar: el ejército seleccionado con la flecha del clic derecho arrastrado
await p.evaluate(([x, z]) => __game.cam(x, z, 48), army); await hud(p, false); await p.waitForTimeout(600);
await p.mouse.move(560, 440); await p.mouse.down({ button: 'right' }); await p.mouse.move(700, 400, { steps: 6 }); await p.mouse.move(820, 330, { steps: 6 }); await p.waitForTimeout(300);
fs.writeFileSync(path.join(out, 'mueve.jpg'), await p.screenshot({ type: 'jpeg', quality: 78, clip: CLIP })); console.log('img/ayuda/mueve.jpg');
await p.mouse.up({ button: 'right' }); await p.evaluate(() => __game.setSelection([], false));
// 2 · reclutar: el cuartel seleccionado con su barra abajo (con interfaz)
await p.evaluate(() => { __game.sideState[0].gold = 900; }); await hud(p, true); await p.keyboard.press('q'); await p.waitForTimeout(300);
await p.evaluate(() => { const g = __game; g.enqueue(0, 'sword'); g.enqueue(0, 'bow'); g.enqueue(0, 'horse'); });
await shot(p, 'recluta', await p.evaluate(() => { const s = __game.spots.find(s => s.kind === 'barracks' && s.side === 0); return [s.x, s.z - 4, 46]; }), true, { x: 120, y: 260, width: 1040, height: 540 });
await p.evaluate(() => __game.setSelection([], false));
// 4 · conquistar: tropas dentro del círculo de un pueblo neutral, conquistándolo
const town = await p.evaluate(() => { const g = __game, b = g.spots[0], T = g.spots.filter(s => s.kind === 'town' && !s.camp && !s.keep && !s.watch && !s.fortified).sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z))[0], k = g.spots.indexOf(T);
  for (const u of g.units.filter(u => u.side !== 0 && Math.hypot(u.pos.x - T.x, u.pos.z - T.z) < 12)) u.hp = 0;   // sin defensores
  for (let j = 0; j < 8; j++) { const a = j / 8 * 6.28, u = g.spawnAt(0, j % 2 ? 'bow' : 'sword', T.x + Math.cos(a) * 2.5, T.z + Math.sin(a) * 2.5, a); u.order = { type: 'capture', k }; }
  g.step(40); return [T.x, T.z + 2, 30]; });
await shot(p, 'conquista', town);
// 5 · sitios especiales: la ciudadela con sus colosos
await shot(p, 'especiales', await p.evaluate(() => { const k = __game.spots.find(s => s.keep); return [k.x, k.z + 4, 58]; }));
// 6 · héroes: un héroe con su ejército en formación
const hero = await p.evaluate(() => { const g = __game; g.summonHero(0); g.step(900); const h = g.units.find(u => u.side === 0 && u.type === 'hero');
  const L = g.units.filter(u => u.side === 0 && u.type !== 'hero' && u.type !== 'god').slice(0, 30); for (const u of L) g.assign(u, h);
  g.orderMove([h], h.pos.x + (192 - h.pos.x > 0 ? 30 : -30), h.pos.z, false); g.step(500); g.setSelection([h, ...h.escort], false); return [h.pos.x, h.pos.z + 2, 38]; });
await shot(p, 'heroes', hero);
await p.evaluate(() => __game.setSelection([], false));
// 7 · templo y dios: el templo consagrado (con su haz de luz) y el dios delante
await shot(p, 'templo', await p.evaluate(() => { const g = __game, t = g.spots.find(s => s.kind === 'temple' && s.side === 0); g.sideState[0].ritual.state = 'done';
  g.spawnAt(0, 'god', t.x, t.z + 5, 0); g.step(2); return [t.x, t.z + 3, 30]; }));
await p.close(); await b.close();
if (errors.length) { console.log('errores:', errors); process.exit(1); }
