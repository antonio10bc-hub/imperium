// Capturas de las geografías con el motor real del juego (terreno, fortalezas, pueblos, guardianes y elementos del paisaje; sin niebla):
//  · img/geo/<geografía>.jpg: la imagen de cada geografía en el menú principal, encuadrando su parte clave
//  · capturas/mapas/<geografía>.jpg: el mapa entero visto desde arriba, y capturas/mapas/todos.jpg con todos juntos
// Uso: npm run build && npm run shots [-- --solo=menu|mapas --geo=canon,lago]   (requiere Google Chrome; CHROME=ruta para otro navegador)
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const ALL = ['cordillera', 'istmo', 'archipielago', 'barrancos', 'meseta', 'afluentes', 'delta', 'bosque', 'oasis', 'lago', 'helado', 'canon', 'costa', 'ruinas'];
const NAME = { cordillera: 'CORDILLERA', istmo: 'ISTMO', archipielago: 'ARCHIPIÉLAGO', barrancos: 'BARRANCOS', meseta: 'MESETA', afluentes: 'AFLUENTES', delta: 'DELTA', bosque: 'BOSQUE', oasis: 'DESIERTO', lago: 'CALDERA', helado: 'VALLE HELADO', canon: 'CAÑÓN', costa: 'COSTA', ruinas: 'RUINAS' };
const GEOS = (arg('geo') || ALL.join(',')).split(','), SOLO = arg('solo');
const SEED = { cordillera: 4242, istmo: 4242, archipielago: 4242, barrancos: 4242, meseta: 4242, afluentes: 4242, delta: 4242, bosque: 4242, oasis: 4242, lago: 4242, helado: 4242, canon: 4242, costa: 4242, ruinas: 4242 };
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), url = 'file://' + path.join(root, 'dist/imperium.html');
const save = (file, dataUrl) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64')); };

// qué encuadrar en el menú: el rasgo propio de cada geografía (en casillas del mapa) y la distancia de la cámara
const FOCUS = `(key) => { const g = __game, d = g.dbg(), R = d.geoR, sp = g.spots, MW = d.MW, MD = d.HM.length / MW, T = sp.filter(s => s.kind === 'town');
  const keep = T.find(s => s.keep), watch = T.find(s => s.watch), mid = (a, b, k = .5) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const centroid = t => { let x = 0, z = 0, n = 0; for (let i = 0; i < d.GEOT.length; i++) if (d.GEOT[i] === t) { x += i % MW; z += (i / MW) | 0; n++; } return n ? [x / n, z / n] : [MW / 2, MD / 2]; };
  const near = (p, list) => list.slice().sort((a, b) => Math.hypot(a[0] - p[0], a[1] - p[1]) - Math.hypot(b[0] - p[0], b[1] - p[1]))[0];
  const C = [MW / 2, MD / 2];
  const densest = (ok, r = 36) => { let best = C, bv = -1; for (let z = r; z < MD - r; z += 8) for (let x = r; x < MW - r; x += 8) { let v = 0; for (let dz = -r; dz <= r; dz += 3) for (let dx = -r; dx <= r; dx += 3) if (ok((z + dz) * MW + x + dx)) v++; if (v > bv) { bv = v; best = [x, z]; } } return best; };
  switch (key) {
    case 'cordillera': return [...(watch ? [watch.x, watch.z] : near(C, R.passes)), 120];
    case 'istmo': return [keep.x, keep.z, 125];
    case 'archipielago': return [...near(C, R.passes.length ? R.passes : [C]), 125];
    case 'barrancos': return [...densest(i => d.HM[i] === 1), 125];   // donde más barrancos hay
    case 'meseta': { const p = R.passes.slice().sort((a, b) => b[1] - a[1])[0]; return [p[0], p[1] - 12, 115]; }   // la rampa del sur: su pared mira a la cámara
    case 'afluentes': return [...R.confluence, 120];
    case 'delta': return [...near(C, R.passes.length ? R.passes : [C]), 115];
    case 'bosque': return [...near(C, R.treasures), 105];
    case 'oasis': return [...near(C, R.special), 105];
    case 'lago': return [...R.volcano, 140];
    case 'helado': return [...centroid(15), 125];
    case 'canon': return [...R.confluence, 125];
    case 'costa': { const p = near(C, R.passes); return [p[0], p[1] + 34, 150]; }
    case 'ruinas': return [...near(C, R.treasures), 100];
  } return [...C, 130]; }`;

const b = await chromium.launch({ executablePath: CHROME, headless: true });
const sheet = [];
for (const key of GEOS) {
  const p = await b.newPage({ viewport: { width: 720, height: 1100 } }), errors = []; p.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await p.goto(`${url}?mapa=${key.toUpperCase()}-${SEED[key] || 4242}`);
  await p.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 120000 });
  await p.evaluate(() => { for (const id of ['start', 'how', 'vs', 'toast']) { const e = document.getElementById(id); if (e) e.hidden = true; } });
  if (SOLO !== 'mapas') {   // imagen del menú: la vista de la partida, encuadrando la parte clave
    const [x, z, dist] = await p.evaluate(`(${FOCUS})(${JSON.stringify(key)})`);
    await p.evaluate(([x, z, d]) => __game.cam(x, z, d), [x, z, dist]); await p.waitForTimeout(1200);
    const shot = await p.screenshot({ type: 'jpeg', quality: 80 });
    fs.mkdirSync(path.join(root, 'img/geo'), { recursive: true }); fs.writeFileSync(path.join(root, `img/geo/${key}.jpg`), shot);
  }
  if (SOLO !== 'menu') {   // el mapa entero desde arriba
    const jpg = await p.evaluate(() => new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); res(c.toDataURL('image/jpeg', .88)); }; im.src = __game.mapShot(2048); }));
    save(path.join(root, `capturas/mapas/${key}.jpg`), jpg); sheet.push([NAME[key] || key.toUpperCase(), jpg]);
  }
  console.log(`${errors.length ? 'MAL' : 'OK '} ${key}${errors.length ? ' ' + errors.join(' | ') : ''}`); await p.close();
}
if (sheet.length > 1) {   // hoja con todos los mapas y su nombre
  const p = await b.newPage();
  const out = await p.evaluate(async items => {
    const cols = 3, w = 900, imgs = await Promise.all(items.map(([, src]) => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = src; })));
    const h = Math.round(w * imgs[0].height / imgs[0].width), lab = 44, rows = Math.ceil(items.length / cols), c = document.createElement('canvas'); c.width = cols * w; c.height = rows * (h + lab);
    const x = c.getContext('2d'); x.fillStyle = '#0f0f1b'; x.fillRect(0, 0, c.width, c.height); x.font = 'bold 26px monospace'; x.fillStyle = '#e8c870';
    imgs.forEach((im, i) => { const cx = (i % cols) * w, cy = Math.floor(i / cols) * (h + lab); x.drawImage(im, cx, cy + lab, w, h); x.fillText(items[i][0], cx + 14, cy + 31); });
    return c.toDataURL('image/jpeg', .85);
  }, sheet);
  save(path.join(root, 'capturas/mapas/todos.jpg'), out); console.log('capturas/mapas/todos.jpg');
}
await b.close();
