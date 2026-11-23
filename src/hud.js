// Interfaz: barra superior, héroes, panel de selección y herramientas.
import { ac, audio, master, sfx, startMusic } from './audio.js';
import { SHAPES } from './behavior.js';
import { uname } from './civs.js';
import { assign } from './combat.js';
import { ALLT, ALT0, BARR0, BASE0, BASE1, GAME, RANKS, TEAM, TEMP0, TYPES, UNITS } from './config.js';
import { ping } from './effects.js';
import { TOWN_LV, cancelQueue, capOf, endGame, enqueue, startRitual, summonGod, heroCount, heroOf, heroesOf, incomeOf, newGame, townIncNow, popOf, state, summonHero, toast, towerDmg, towerRange, upgradeTown } from './game.js';
import { focusOn, heroButton } from './input.js';
import { MERC, ev, hireMercs, mercRoom } from './events.js';
import { regions, spots } from './map.js';
import { seed } from './noise.js';
import { $, S, track } from './state.js';
import { THUMB, alive, sel, sideState, units } from './units.js';

// ---------- HUD ----------
// Grupos con F1–F5 (sin barra visible: la barra inferior queda libre para la selección)
const GROUPS = [['hero', 'HÉROE'], ['sword', 'ESPADAS'], ['bow', 'ARCOS'], ['horse', 'JINETES'], ['all', 'TODOS']];
function groupUnits(k) {
  const mine = units.filter(u => u.side === 0);
  if (k === 'all') return mine;
  if (k === 'hero') return heroesOf(0).flatMap(h => [h, ...h.escort]);
  return mine.filter(u => u.type === k && !u.leader);
}
export function pickGroup(i) {
  const list = groupUnits(GROUPS[i][0]); if (!list.length) { sfx('deny'); return; }
  setSelection(list, false); S.follow = list[0]; S.focusGoal = null; track('group_select', { group: GROUPS[i][0] });
}
let terrKey = '';
export function updateHud() {
  const st = sideState[0], owned = sd => spots.filter(s => s.owner === sd).length;
  $('gold').textContent = Math.floor(st.gold);
  $('rate').textContent = '+' + String(Math.round(incomeOf(0) * 10) / 10).replace('.', ',') + '/S';
  $('pop').textContent = popOf(0); $('cap').textContent = capOf(0);
  const m = ev.merc, showM = !!m && !m.hired[0]; $('merc').hidden = !showM;   // oferta de mercenarios
  if (showM) { $('mercT').textContent = `MERCENARIOS VETERANOS · ${Math.ceil(m.t)} S`; const b = $('mercBtn'), room = mercRoom(0); b.textContent = room ? `CONTRATAR · ${MERC.cost}` : 'SIN SITIO'; b.disabled = !room || sideState[0].gold < MERC.cost; }
  const n0 = 1 + owned(0), n1 = 1 + spots.filter(s => s.kind === 'town' && s.known === 1).length, NR = regions.length, key = n0 + ',' + n1 + ',' + NR;
  if (key !== terrKey) { terrKey = key; $('terr').innerHTML = '<i class="b"></i>'.repeat(n0) + '<i></i>'.repeat(Math.max(0, NR - n0 - n1)) + '<i class="r"></i>'.repeat(n1); }
  $('hp0').textContent = Math.max(0, Math.round(spots[BASE0].hp / GAME.baseHp * 100)) + ' %';
  $('hp1').textContent = Math.max(0, Math.round(spots[BASE1].hp / GAME.baseHp * 100)) + ' %';
  renderHeroes(); renderPanel();
}
const hpCol = k => k > .5 ? '#7ed957' : k > .25 ? '#e8c870' : '#d83a4a';
const pct = k => Math.round(Math.max(0, Math.min(1, k)) * 100) + '%';
const VS = { titan: 'LENTO Y MUY DURO', sword: 'VENCE A JINETE', bow: 'VENCE A ESPADA', horse: 'VENCE A ARCO', harcher: 'RÁPIDO Y A DISTANCIA', hero: 'CARGA CON SU ESCOLTA', god: 'CURA A LA ESCOLTA DE SU HÉROE' };
// Retrato del héroe a la izquierda (como en Imperium), con las tropas asignadas
let heroesHtml = '';
function renderHeroes() {
  let html = '';
  heroesOf(0).forEach((u, i) => { const on = sel.has(u);
    html += `<button type="button" class="hc${on ? ' on' : ''}" data-hero="${u.id}" title="Héroe ${i + 1} · clic: seleccionar con su escolta"><kbd>${i ? i + 1 : 'G'}</kbd><img alt="Héroe" src="${THUMB.hero || ''}"><span class="n">${u.escort.length}</span><i><b style="width:${pct(u.hp / u.maxHp)};background:${hpCol(u.hp / u.maxHp)}"></b></i></button>`; });
  for (const h of sideState[0].heroQ) html += `<button type="button" class="hc off" data-hero="0" title="${h.state === 'dead' ? 'Un héroe ha caído' : 'Un héroe está en camino'}"><img alt="Héroe" src="${THUMB.hero || ''}"><span class="st">${Math.ceil(h.t)} S</span><i><b style="width:${pct(h.state === 'training' ? 1 - h.t / UNITS.hero.time : 0)};background:var(--yellow)"></b></i></button>`;
  if (html !== heroesHtml) { heroesHtml = html; $('heroes').innerHTML = html; }
}
// Panel de la barra inferior: vacío por defecto; muestra el edificio, el pueblo o las unidades seleccionadas
let panelHtml = '';
function renderPanel() {
  const html = state === 'play' ? panelContent() : '';
  if (html !== panelHtml) { panelHtml = html; $('panel').innerHTML = html; }
}
function panelContent() {
  const st = sideState[0];
  if (S.selBld === 'barracks') {
    const full = popOf(0) >= capOf(0) || st.queue.length >= GAME.queueMax;
    const cards = TYPES.map((t, i) => { const d = UNITS[t];
      return `<button type="button" class="rc" data-act="rec" data-t="${t}" ${full || st.gold < d.cost ? 'disabled' : ''} title="${uname(0, t)} · ${d.time} s · ${VS[t]}"><kbd>${i + 1}</kbd><img alt="" src="${THUMB[t] || ''}"><b>${uname(0, t)}</b><s>${d.cost}</s></button>`; }).join('');
    const q = st.queue.map((it, i) => `<button type="button" class="q" data-act="cancel" data-i="${i}" title="Cancelar (devuelve el oro)"><img alt="${uname(0, it.type)}" src="${THUMB[it.type] || ''}">${i === 0 ? `<i><b style="width:${pct(1 - it.t / UNITS[it.type].time)}"></b></i>` : ''}</button>`).join('');
    return `<div class="ph" title="Clic derecho en el mapa: punto de reunión"><h3>CUARTEL</h3><em>COLA ${st.queue.length}/${GAME.queueMax}</em><em>TROPAS ${popOf(0)}/${capOf(0)}</em></div>${cards}<div class="qu">${q || '<span class="none">COLA VACÍA</span>'}</div>`;
  }
  if (S.selBld === 'temple') {   // templo: primero el ritual; después, invocar al dios (uno por bando)
    const r = st.ritual, god = uname(0, 'god'), d = UNITS.god;
    let info, act = '';
    if (r.state === 'none') {
      info = `<div class="note g">COMIENZA EL RITUAL PARA PODER INVOCAR A ${god}.</div><div class="note">DURA ${GAME.ritualTime} S. LUEGO, ${god} SE INVOCA AQUÍ.</div>`;
      act = `<button type="button" class="y" data-act="ritual" ${st.gold < GAME.ritualCost ? 'disabled' : ''}>COMENZAR RITUAL · ${GAME.ritualCost} ORO</button>`;
    } else if (r.state === 'ritual') {
      info = `<div class="hpb"><b style="width:${pct(1 - r.t / GAME.ritualTime)};background:var(--yellow)"></b><span>RITUAL ${Math.ceil(r.t)} S</span></div><div class="note">CUANDO TERMINE PODRÁS INVOCAR A ${god}.</div>`;
    } else {
      const g = units.find(u => u.side === 0 && u.type === 'god');
      info = st.godQ ? `<div class="hpb"><b style="width:${pct(1 - st.godQ.t / d.time)};background:var(--yellow)"></b><span>DESCIENDE EN ${Math.ceil(st.godQ.t)} S</span></div>`
        : g ? `<div class="note g">${god} YA LUCHA A TU LADO.</div>` : `<div class="note g">FLOTA, GOLPEA CUERPO A CUERPO Y CURA A LA ESCOLTA DE SU HÉROE.</div>`;
      info += `<div class="note">UN DIOS POR BANDO. ASÍGNALO A UN HÉROE: IRÁ DETRÁS DE ÉL.</div><div class="note">CLIC DERECHO EN EL MAPA: DÓNDE APARECE.</div>`;
      act = g ? `<button type="button" data-act="god">SELECCIONAR</button>` : st.godQ ? '' : `<button type="button" class="y" data-act="summonGod" ${st.gold < d.cost || popOf(0) >= capOf(0) ? 'disabled' : ''}>INVOCAR · ${d.cost} ORO</button>`;
    }
    return `<div class="ph"><h3>TEMPLO</h3><em>${r.state === 'done' ? 'CONSAGRADO' : r.state === 'ritual' ? 'RITUAL EN CURSO' : 'SIN CONSAGRAR'}</em></div><img class="big" alt="" src="${THUMB.god || ''}"><div class="info">${info}</div>${act ? `<div class="act">${act}</div>` : ''}`;
  }
  if (S.selBld === 'altar') {
    const n = heroCount(0), alive = heroesOf(0).length, tr = st.heroQ.filter(h => h.state === 'training'), dead = st.heroQ.filter(h => h.state === 'dead');
    let btn = n < GAME.maxHeroes ? `<button type="button" class="y" data-act="summon" ${st.gold < UNITS.hero.cost ? 'disabled' : ''}>INVOCAR · ${UNITS.hero.cost} ORO</button>` : `<button type="button" disabled>MÁXIMO ${GAME.maxHeroes} HÉROES</button>`;
    if (alive) btn = `<button type="button" data-act="hero">SELECCIONAR</button>` + btn;
    const note = `HÉROES ${n}/${GAME.maxHeroes}` + (tr.length ? ` · LLEGA EN ${Math.ceil(tr[0].t)} S` : '') + (dead.length ? ` · VUELVE EN ${Math.ceil(dead[0].t)} S` : '');
    return `<div class="ph"><h3>SALÓN DE HÉROES</h3><em>${note}</em></div><img class="big" alt="" src="${THUMB.hero || ''}"><div class="info"><div class="note">MÁS FUERTE, CARGA CONTRA EL ENEMIGO.</div><div class="note">HASTA ${GAME.escortMax} TROPAS EN FORMACIÓN.</div><div class="note">CLIC DERECHO EN EL MAPA: A DÓNDE VA AL LLEGAR.</div></div><div class="act">${btn}</div>`;
  }
  if (S.selSpot) {
    const s = S.selSpot;
    if (s.kind === 'base') { const k = s.hp / GAME.baseHp;
      return `<div class="ph"><h3>${s.side === 0 ? 'TU FORTALEZA' : 'FORTALEZA RIVAL'}</h3></div><div class="info"><div class="hpb"><b style="width:${pct(k)};background:${TEAM[s.side].css}"></b><span>${Math.max(0, Math.ceil(s.hp))}/${GAME.baseHp}</span></div><div class="note">${s.side === 1 ? 'CLIC DERECHO CON TROPAS: ASALTAR.' : 'SI CAE, PIERDES LA PARTIDA.'}</div></div>`; }
    const own = s.owner, who = own < 0 ? 'NEUTRAL' : own === 0 ? 'TUYO' : 'DEL RIVAL';
    let prog = '';
    if (own < 0 && (s.prog[0] > 0 || s.prog[1] > 0)) { const sd = s.prog[0] >= s.prog[1] ? 0 : 1; prog = `<div class="hpb"><b style="width:${pct(s.prog[sd])};background:${TEAM[sd].css}"></b><span>CONQUISTA ${pct(s.prog[sd])}</span></div>`; }
    if (own >= 0 && s.lose > 0) prog = `<div class="hpb"><b style="width:${pct(1 - s.lose)};background:${TEAM[own].css}"></b><span>RESISTE ${pct(1 - s.lose)}</span></div>`;
    if (s.keep) {
      const g = units.filter(u => u.home === s).length, n = own >= 0 ? units.filter(u => u.keepOf === s && u.side === own).length : 0;
      return `<div class="ph"><h3>${s.name}</h3><em style="color:${own < 0 ? 'var(--txt)' : TEAM[own].css}">${who}</em></div><img class="big" alt="" src="${THUMB.titan || ''}"><div class="info">${own < 0 ? `<div class="note">${g ? `QUEDAN ${g} COLOSOS DE GUARDIA. DERRÓTALOS PARA PODER CONQUISTARLA.` : 'SIN GUARDIANES: DEJA TROPAS EN EL CÍRCULO.'}</div>` : `<div class="stats"><span>COLOSOS <b>${n}/${GAME.keepMax}</b></span><span>UNO CADA <b>${GAME.keepGen} S</b></span></div>`}<div class="note g">DA COLOSOS: LENTOS, MUY DUROS Y CUERPO A CUERPO.</div></div>`;
    }
    if (s.watch) {
      return `<div class="ph"><h3>${s.name}</h3><em style="color:${own < 0 ? 'var(--txt)' : TEAM[own].css}">${who}</em></div><div class="info">${prog}<div class="stats"><span>VISIÓN <b>${GAME.watchVision}</b></span><span>TORRE <b>${GAME.watchDmg}</b></span><span>ALCANCE <b>${GAME.watchRange}</b></span></div><div class="note g">ATALAYA: VE MUY LEJOS Y DISPARA A QUIEN SE ACERQUE. NO DA ORO.</div><div class="note">${own === 0 ? 'TUS TROPAS SE CURAN AQUÍ.' : 'DEJA TROPAS EN EL CÍRCULO PARA CONQUISTARLA.'}</div></div>`;
    }
    if (s.camp) {
      const g = units.filter(u => u.home === s).length, n = own >= 0 ? units.filter(u => u.campOf === s && u.side === own).length : 0;
      return `<div class="ph"><h3>${s.name}</h3><em style="color:${own < 0 ? 'var(--txt)' : TEAM[own].css}">${who}</em></div><img class="big" alt="" src="${THUMB.harcher || ''}"><div class="info">${own < 0 ? `<div class="note">${g ? `QUEDAN ${g} GUARDIANES. DERRÓTALOS PARA PODER CONQUISTARLO.` : 'SIN GUARDIANES: DEJA TROPAS EN EL CÍRCULO.'}</div>` : `<div class="stats"><span>JINETES ARQUEROS <b>${n}/${GAME.campMax}</b></span><span>UNO CADA <b>${GAME.campGen} S</b></span></div>`}<div class="note">DA JINETES ARQUEROS: RÁPIDOS Y A DISTANCIA.</div></div>`;
    }
    return `<div class="ph"><h3>${s.name}</h3><em style="color:${own < 0 ? 'var(--txt)' : TEAM[own].css}">${who}</em></div><div class="info">${prog}<div class="stats"><span>NIVEL <b>${s.lvl}</b></span><span>ORO <b>+${String(Math.round(townIncNow(s) * 10) / 10).replace('.', ',')}/S</b></span><span>TORRE <b>${Math.round(towerDmg(s))}</b></span><span>ALCANCE <b>${towerRange(s)}</b></span></div><div class="note${s.special || s.fortified ? ' g' : ''}">${s.fortified ? (own < 0 && s.guards > 0 ? `PUEBLO FORTIFICADO: QUEDAN ${s.guards} DEFENSORES. MÁS ORO. ` : 'PUEBLO FORTIFICADO: MÁS ORO. ') : ''}${s.special ? 'CIMA DE LA MESETA: MÁS ORO. ' : ''}${own === 0 ? 'CUANTOS MÁS PUEBLOS, MENOS RINDE CADA UNO. ' : ''}${own === 0 ? 'TUS TROPAS SE CURAN AQUÍ.' : own < 0 && s.guards > 0 ? '' : 'DEJA TROPAS EN EL CÍRCULO PARA CONQUISTARLO.'}</div></div>${own === 0 && s.lvl < 3 ? `<div class="act"><button type="button" class="y" data-act="upgrade" ${sideState[0].gold < TOWN_LV.cost[s.lvl] ? 'disabled' : ''} title="Más oro y torre más fuerte">MEJORAR A NIVEL ${s.lvl + 1} · ${TOWN_LV.cost[s.lvl]} ORO</button></div>` : ''}`;
  }
  const list = [...sel].filter(alive);
  if (!list.length) return '';
  if (list.length === 1) return unitDetail(list[0]);
  const h = heroOf(0), free = h ? list.filter(u => u !== h && u.leader !== h) : [];
  const cnt = ALLT.filter(t => t !== 'hero').map(t => [t, list.filter(u => u.type === t).length]).filter(([, n]) => n).map(([t, n]) => `${n} ${uname(0, t)}${n > 1 ? (/[AEIOUÁÉÓ]$/.test(uname(0, t)) ? 'S' : 'ES') : ''}`);
  const order = { hero: 0, sword: 1, bow: 2, horse: 3 };
  const cards = groupCards(list, 'type');
  const asg = h && free.length ? `<button type="button" class="y" data-act="assign">ASIGNAR (${h.escort.length}/${GAME.escortMax})</button>` : '';
  const shp = h && sel.has(h) ? shapeButtons(h) : '';
  return `<div class="ph"><h3>${list.length} UNIDADES</h3><em>${cnt.slice(0, 2).join(' · ')}</em>${cnt[2] ? `<em>${cnt[2]}</em>` : ''}</div>${cards}<div class="act">${shp}${asg}<button type="button" data-act="amove" title="Avanzar atacando lo que encuentren">ATACAR <kbd>E</kbd></button></div>`;
}
// una tarjeta por tipo de tropa: retrato, cuántas hay y vida media
function groupCards(list, act) {
  return ALLT.map(t => { const l = list.filter(u => u.type === t); if (!l.length) return '';
    const k = l.reduce((a, u) => a + u.hp / u.maxHp, 0) / l.length, rk = Math.max(...l.map(u => u.rank));
    return `<button type="button" class="gc" data-act="${act}" data-t="${t}" title="${uname(0, t)} · clic: solo estas · mayús+clic: quitar"><img alt="" src="${THUMB[t] || ''}"><span class="n">${l.length}</span>${rk ? `<u style="background:${RANKS[rk].css}"></u>` : ''}<i><b style="width:${pct(k)};background:${hpCol(k)}"></b></i></button>`; }).join('');
}
function shapeButtons(h) {
  return `<span class="shp">${Object.entries(SHAPES).map(([k, n]) => `<button type="button" data-act="shape" data-s="${k}" class="${(h.formShape || 'block') === k ? 'y' : ''}">${n}</button>`).join('')}</span>`;
}
function cellHtml(u) {
  const k = u.hp / u.maxHp;
  return `<button type="button" class="cell${u.leader ? ' esc' : ''}" data-act="one" data-id="${u.id}" title="${uname(u.side, u.type)}${u.rank ? ' · ' + RANKS[u.rank].name : ''}"><img alt="" src="${THUMB[u.type] || ''}">${u.rank ? `<u style="background:${RANKS[u.rank].css}"></u>` : ''}<i><b style="width:${pct(k)};background:${hpCol(k)}"></b></i></button>`;
}
function unitDetail(u) {
  const k = u.hp / u.maxHp, R1 = RANKS[u.rank], hero = u.type === 'hero', mul = (u.leader ? GAME.escortBonus : 1) * R1.mul;
  const rk = u.rank ? `<span class="rkn" style="background:${R1.css}">${R1.name}</span>` : '';
  const next = u.rank < 3 ? `BAJAS ${u.kills}/${RANKS[u.rank + 1].kills}` : `BAJAS ${u.kills}`;
  let note = VS[u.type];
  if (u.leader) note = 'ESCOLTA DEL HÉROE · +20 %';
  if (hero) note = u.chargeT > 0 ? '¡CARGANDO!' : u.chargeCd > 0 ? `CARGA EN ${Math.ceil(u.chargeCd)} S` : 'CARGA LISTA';
  const esc = hero && u.escort.length ? groupCards(u.escort, 'esc') + `<div class="act">${shapeButtons(u)}</div>` : '';
  const h = heroOf(0), asg = !hero && h && u.leader !== h ? `<div class="act"><button type="button" class="y" data-act="assign">ASIGNAR (${h.escort.length}/${GAME.escortMax})</button></div>` : '';
  return `<div class="ph"><h3>${uname(u.side, u.type)}${rk}</h3><em>${hero ? `ESCOLTA ${u.escort.length}/${GAME.escortMax}` : next}</em></div><img class="big" alt="" src="${THUMB[u.type] || ''}">
    <div class="info"><div class="hpb"><b style="width:${pct(k)};background:${hpCol(k)}"></b><span>${Math.ceil(u.hp)}/${u.maxHp}</span></div>
      <div class="stats"><span>ATQ <b>${Math.round(u.def.dmg * mul)}</b></span><span>ALC <b>${u.def.range}</b></span><span>VEL <b>${u.def.speed}</b></span>${hero ? `<span>BAJAS <b>${u.kills}</b></span>` : ''}</div>
      <div class="note${u.leader || hero ? ' g' : ''}">${note}</div></div>${esc}${asg}`;
}
export function refreshPanel() { panelHtml = null; renderPanel(); renderHeroes(); }   // null y no '': si no, un panel que pasa a vacío no se borraba
function assignSelected() {
  const h = heroOf(0); if (!h) return;
  let n = 0; for (const u of sel) if (assign(u, h)) n++;
  ping(h.pos, '#e8c870'); sfx(n ? 'cmd' : 'deny');
  toast(n ? `${n} ${n === 1 ? 'TROPA ESCOLTA' : 'TROPAS ESCOLTAN'} AL HÉROE (${h.escort.length}/${GAME.escortMax})` : 'LA ESCOLTA ESTÁ COMPLETA', n ? 'good' : 'bad');
  track('escort_assign', { n }); updateCtx();
}
export function updateCtx() {
  refreshPanel();
  for (const k of [BARR0, ALT0, TEMP0]) if (spots[k]?.sel) spots[k].sel.visible = S.selBld === spots[k].kind;
}
// Iconos pixelados 7×7 para la interfaz
const UI_IC = {
  coin: ['0011100','0111110','1110111','1101011','1110111','0111110','0011100'], army: ['0011100','0111110','1111111','1101011','1100011','1100011','0000000'],
  castle: ['1010101','1111111','0111110','0111110','0110110','0110110','1111111'], house: ['0001000','0011100','0111110','1111111','0100010','0101010','0111110'],
  crown: ['1010101','1111111','1111111','0000000','0111110','0111110','0000000'], target: ['0011100','0100010','1001001','1011101','1001001','0100010','0011100'],
  pause: ['0000000','0110110','0110110','0110110','0110110','0110110','0000000'], menu: ['0000000','1111111','0000000','1111111','0000000','1111111','0000000'],
};
export function selectBuilding(kind) { sel.clear(); S.follow = null; S.selBld = kind; S.selSpot = null; updateCtx(); }
export function selectSpot(s) { sel.clear(); S.follow = null; S.selBld = null; S.selSpot = s; updateCtx(); }
export function setSelection(list, add) { S.amode = false; if (!add) sel.clear(); for (const u of list) sel.add(u); S.selBld = null; S.selSpot = null; if (list.length) sfx('select'); updateCtx(); }
export function syncTools() { $('spd').firstChild.textContent = '×' + S.speed; $('spd').classList.toggle('on', S.speed > 1); $('pz').classList.toggle('on', S.paused); $('pause').hidden = !S.paused || S.menuOpen; }
// menú de pausa: congela la partida mientras está abierto y al cerrarlo la deja como estaba
export function openMenu() {
  if (state !== 'play' || S.menuOpen) return;
  S.menuOpen = true; S.pausedBefore = S.paused; S.paused = true; S.amode = false; $('menu').hidden = false; syncTools(); sfx('select'); $('mResume').focus();
}
export function closeMenu() {
  if (!S.menuOpen) return;
  S.menuOpen = false; S.paused = S.pausedBefore; $('menu').hidden = true; syncTools(); sfx('select');
}
export function syncDiff() { document.querySelectorAll('.diff button[data-d]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.d === S.diff))); }

// preparación de la página (listeners y elementos del DOM); la llama main.js al arrancar
export function init() {
  $('heroes').addEventListener('pointerdown', e => { const b = e.button === 0 && e.target.closest('[data-hero]'); if (!b) return; const u = units.find(o => o.id === +b.dataset.hero); if (u) { setSelection([u, ...u.escort], false); S.follow = u; S.focusGoal = null; } else heroButton(); });
  $('panel').addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === 'rec') enqueue(0, b.dataset.t);
    else if (a === 'cancel') cancelQueue(+b.dataset.i);
    else if (a === 'summon') summonHero(0);
    else if (a === 'ritual') startRitual(0);
    else if (a === 'summonGod') summonGod(0);
    else if (a === 'god') { const g = units.find(u => u.side === 0 && u.type === 'god'); if (g) { setSelection([g], false); S.follow = g; S.focusGoal = null; } }
    else if (a === 'hero') heroButton();
    else if (a === 'assign') assignSelected();
    else if (a === 'upgrade' && S.selSpot) upgradeTown(0, S.selSpot);
    else if (a === 'type') { const l = [...sel].filter(u => u.type === b.dataset.t); if (e.shiftKey) { l.forEach(u => sel.delete(u)); updateCtx(); } else setSelection(l, false); }
    else if (a === 'esc') { const h = heroOf(0); if (h) setSelection(h.escort.filter(u => u.type === b.dataset.t), false); }
    else if (a === 'shape') { const h = heroOf(0); if (h) { h.formShape = b.dataset.s; sfx('cmd'); } }
    else if (a === 'amove') { S.amode = true; sfx('select'); }
    else if (a === 'one') { const u = units.find(o => o.id === +b.dataset.id); if (u) { if (e.shiftKey) { sel.delete(u); updateCtx(); } else { setSelection([u], false); S.follow = u; S.focusGoal = null; } } }
    refreshPanel();
  });
  document.querySelectorAll('img.ic').forEach(el => {
    const c = document.createElement('canvas'); c.width = c.height = 7; const x = c.getContext('2d'); x.fillStyle = el.dataset.c;
    UI_IC[el.dataset.ic].forEach((row, j) => [...row].forEach((v, i) => { if (v === '1') x.fillRect(i, j, 1, 1); })); el.src = c.toDataURL();
  });
  $('fBase').addEventListener('click', () => focusOn(spots[BASE0].x, spots[BASE0].z));
  $('fEnemy').addEventListener('click', () => focusOn(spots[BASE1].x, spots[BASE1].z));
  $('fBarr').addEventListener('click', () => { selectBuilding('barracks'); focusOn(spots[BARR0].x, spots[BARR0].z); });
  $('fHero').addEventListener('click', heroButton);
  $('spd').addEventListener('click', () => { S.speed = S.speed === 1 ? 2 : 1; syncTools(); });
  $('pz').addEventListener('click', () => { S.paused = !S.paused; syncTools(); });
  $('menuBtn').addEventListener('click', openMenu);
  $('mercBtn').addEventListener('click', () => { if (hireMercs(0)) { sfx('capture'); updateHud(); } else sfx('deny'); });
  $('mResume').addEventListener('click', closeMenu);
  $('mRestart').addEventListener('click', () => { track('menu_restart'); S.pendingStart = true; newGame(seed, true); });   // misma semilla y mismas civilizaciones
  $('mSurrender').addEventListener('click', () => { track('menu_surrender'); endGame(false, true); });
  $('mQuit').addEventListener('click', () => { track('menu_quit'); newGame(1 + Math.floor(Math.random() * 99999)); });
  $('snd').textContent = '♪ ' + (S.soundOn ? 'SÍ' : 'NO');
  $('snd').addEventListener('click', () => { S.soundOn = !S.soundOn; $('snd').textContent = '♪ ' + (S.soundOn ? 'SÍ' : 'NO'); try { localStorage.setItem('imperium-sound', S.soundOn ? '1' : '0'); } catch (e) {} if (S.soundOn && state === 'play') startMusic(); if (audio()) master.gain.setTargetAtTime(S.soundOn ? .9 : 0, ac.currentTime, .05); });
}
