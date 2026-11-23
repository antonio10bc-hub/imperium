// Sonido y música sintetizados con WebAudio.
import * as THREE from 'three';
import { civOf } from './civs.js';
import { lastCombat } from './combat.js';
import { elapsed, state } from './game.js';
import { S } from './state.js';

// ---------- Sonido y música ----------
// Todo sintetizado con WebAudio, pero buscando timbres reales: metal, madera, cuerno, tambor y una pequeña sala con reverberación
export let ac = null, master = null, sfxBus = null, musBus = null, verb = null, noiseBuf = null; const lastSfx = {};
export function audio() {
  if (ac) return ac;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  master = ac.createGain(); master.gain.value = S.soundOn ? .9 : 0; master.connect(ac.destination);
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = .8; sfxBus.connect(comp);
  musBus = ac.createGain(); musBus.gain.value = 0; musBus.connect(comp);
  verb = ac.createConvolver(); const L = ac.sampleRate * 2.4, ir = ac.createBuffer(2, L, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 3.2); }
  verb.buffer = ir; const vg = ac.createGain(); vg.gain.value = .32; verb.connect(vg).connect(comp);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return ac;
}
const env = (g, t, a, peak, dur) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + dur); };
function out(node, bus, wet = .3) { node.connect(bus); if (wet) { const w = ac.createGain(); w.gain.value = wet; node.connect(w).connect(verb); } }
function noise(t, dur, { type = 'bandpass', f = 1000, f2 = null, q = 1, gain = .2, a = .003, bus = sfxBus, wet = .25 } = {}) {
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
  env(g, t, a, gain, dur); s.connect(fl).connect(g); out(g, bus, wet); s.start(t, Math.random() * .5); s.stop(t + a + dur + .05);
}
function tone(t, f, dur, { type = 'sine', gain = .1, a = .005, f2 = null, bus = sfxBus, wet = .25, lp = null } = {}) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  env(g, t, a, gain, dur); let n = o; if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; } n.connect(g); out(g, bus, wet); o.start(t); o.stop(t + a + dur + .05);
}
// timbres de cuerno: forma de onda, brillo del filtro, vibrato, subida de tono al soplar, rugido (carnyx) y soplo (caracola)
const HORNS = {
  cornu: { type: 'sawtooth', open: 6, rest: 3.5, vib: .006 },
  reed: { type: 'square', open: 4, rest: 3, vib: .012, q: 6, vol: .65 },
  conch: { type: 'triangle', open: 2.6, rest: 2, vib: .003, bend: .9, breath: .02 },
  carnyx: { type: 'sawtooth', open: 9, rest: 5, vib: .004, growl: .45 },
  trumpet: { type: 'square', open: 7, rest: 4, vib: .005, bend: .97, vol: .7 },
  lur: { type: 'sawtooth', open: 3.5, rest: 2.2, vib: .003, bend: .94, breath: .015 },   // lur o cuerno de la estepa: grave y oscuro
};
// cuerno de guerra / metales: osciladores desafinados con un filtro que se abre al soplar
function horn(t, f, dur, gain = .07, bus = sfxBus, tb = HORNS.cornu) {
  gain *= tb.vol ?? 1;   // las ondas cuadradas suenan más fuertes: se igualan
  const g = ac.createGain(), fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = tb.q || 2;
  fl.frequency.setValueAtTime(300, t); fl.frequency.linearRampToValueAtTime(f * tb.open, t + .12); fl.frequency.linearRampToValueAtTime(f * tb.rest, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .09); g.gain.setValueAtTime(gain, t + dur - .12); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .25);
  const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5; vg.gain.value = f * tb.vib; vib.connect(vg);
  for (const d of [-7, 6]) { const o = ac.createOscillator(); o.type = tb.type; o.frequency.setValueAtTime(f * (tb.bend || 1), t); o.frequency.linearRampToValueAtTime(f, t + .18); o.detune.value = d; vg.connect(o.frequency); o.connect(fl); o.start(t); o.stop(t + dur + .3); }
  vib.start(t); vib.stop(t + dur + .3);
  if (tb.growl) {   // rugido del carnyx: el volumen tiembla muy rápido
    const gr = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain(); gr.gain.value = 1 - tb.growl; lfo.frequency.value = 27; lg.gain.value = tb.growl; lfo.connect(lg).connect(gr.gain);
    fl.connect(gr).connect(g); lfo.start(t); lfo.stop(t + dur + .3);
  } else fl.connect(g);
  if (tb.breath) noise(t, dur, { f: f * 3, q: 1.5, gain: tb.breath, bus, wet: .4 });
  out(g, bus, .45);
}
// tambor de marco: golpe grave con caída de tono + parche
function drum(t, gain = .25, low = 1, bus = sfxBus) { tone(t, 110 * low, .28, { gain, f2: 48 * low, bus, wet: .2 }); noise(t, .09, { type: 'lowpass', f: 700, gain: gain * .5, bus, wet: .15 }); }
// percusión de cada civilización (strong: tiempo fuerte)
const PERC = {
  frame: (t, g, strong, bus) => drum(t, g, strong ? .85 : 1.2, bus),
  bodhran: (t, g, strong, bus) => { drum(t, g, strong ? .7 : 1, bus); noise(t, .05, { f: 2200, q: 2, gain: g * .25, bus, wet: .1 }); },
  taiko: (t, g, strong, bus) => strong ? (tone(t, 62, .7, { gain: g * 1.4, f2: 38, bus, wet: .35 }), noise(t, .12, { type: 'lowpass', f: 400, gain: g * .6, bus })) : drum(t, g * .7, 1.4, bus),
  darbuka: (t, g, strong, bus) => strong ? tone(t, 95, .3, { gain: g, f2: 70, bus, wet: .2 }) : noise(t, .05, { type: 'highpass', f: 3500, gain: g * .5, a: .001, bus, wet: .15 }),
  war: (t, g, strong, bus) => { drum(t, g * 1.2, strong ? .55 : .8, bus); if (strong) noise(t, .14, { type: 'lowpass', f: 300, gain: g * .5, bus, wet: .3 }); },   // tambor de guerra grave
  slit: (t, g, strong, bus) => { tone(t, strong ? 330 : 440, .14, { type: 'triangle', gain: g * .7, a: .001, bus, wet: .3 }); noise(t, .02, { f: 1800, q: 3, gain: g * .3, a: .001, bus, wet: .1 }); },
};
// choque de espadas: parciales metálicas inarmónicas + chasquido
function clash(t, gain = .05) {
  const f = 900 + Math.random() * 900;
  for (const [r, k] of [[1, 1], [1.47, .7], [2.09, .5], [2.76, .35], [3.9, .2]]) tone(t, f * r, .18 + Math.random() * .12, { gain: gain * k, a: .001, wet: .3 });
  noise(t, .05, { type: 'highpass', f: 2500, gain: gain * 2.2, a: .001 });
}
const N2F = n => 440 * Math.pow(2, (n - 69) / 12);
// side: bando que suena (carga y héroe del rival con su cuerno); el resto, con el de tu civilización
// fondo sonoro de cada geografía: un ruido filtrado que suena a viento, oleaje, lluvia o arena (con un vaivén lento)
let amb = null;
const AMB = { wind: ['bandpass', 520, .6, .05, .03], waves: ['lowpass', 650, .7, .07, .05], rain: ['highpass', 2300, .5, .05, 0], sand: ['bandpass', 1500, .7, .07, .025] };
export function setAmbience(kind, level = 1) {
  if (!S.soundOn || !audio()) return;
  if (!amb) { const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    s.buffer = noiseBuf; s.loop = true; g.gain.value = 0; lg.gain.value = 0; lfo.frequency.value = .13; s.connect(f).connect(g).connect(sfxBus); lfo.connect(lg).connect(g.gain); s.start(); lfo.start(); amb = { f, g, lg }; }
  const P = AMB[kind], t = ac.currentTime;
  if (!P) { amb.g.gain.setTargetAtTime(0, t, .8); amb.lg.gain.setTargetAtTime(0, t, .8); return; }
  amb.f.type = P[0]; amb.f.frequency.setTargetAtTime(P[1], t, .6); amb.f.Q.value = P[2]; amb.g.gain.setTargetAtTime(P[3] * level, t, .8); amb.lg.gain.setTargetAtTime(P[4] * level, t, .8);
}
export function sfx(kind, side = 0) {
  if (!S.soundOn || !audio()) return;
  const P = soundOf(side), H = HORNS[P.horn], beat = (tt, g, st) => PERC[P.perc](tt, g, st, sfxBus);
  if (ac.state === 'suspended') ac.resume();
  const t = ac.currentTime; if (lastSfx[kind] && t - lastSfx[kind] < (kind === 'hit' ? .06 : kind === 'arrow' ? .09 : .07)) return; lastSfx[kind] = t;
  switch (kind) {
    case 'hit': clash(t); break;
    case 'arrow': noise(t, .2, { f: 2600, f2: 500, q: 3, gain: .07, wet: .1 }); break;
    case 'die': noise(t, .22, { type: 'lowpass', f: 380, gain: .2 }); tone(t + .02, 170, .32, { type: 'sawtooth', gain: .035, f2: 95, lp: 700 }); break;
    case 'select': noise(t, .035, { f: 1700, q: 5, gain: .16, wet: .1 }); tone(t, 520, .06, { gain: .04, wet: .1 }); break;
    case 'cmd': drum(t, .12, 1.4); noise(t + .05, .06, { f: 900, q: 2, gain: .07 }); break;
    case 'deny': tone(t, 95, .12, { gain: .12, f2: 70 }); noise(t, .05, { type: 'lowpass', f: 500, gain: .08 }); break;
    case 'ready': horn(t, N2F(P.capture[0] - 5), .28, .035, sfxBus, H); break;
    case 'alarm': { const a = P.charge[0] - 12; horn(t, N2F(a), .7, .08, sfxBus, H); horn(t + .85, N2F(a), .7, .08, sfxBus, H); horn(t + .85, N2F(a + 7), .7, .05, sfxBus, H); break; }
    case 'capture': beat(t, .22, true); beat(t + .18, .18, false); P.capture.forEach((n, i) => horn(t + .1 + i * .16, N2F(n), .35 + (i === 3 ? .5 : 0), .055, sfxBus, H)); break;
    case 'lost': [P.capture[2] - 12, P.capture[1] - 12, P.capture[0] - 12].forEach((n, i) => horn(t + i * .4, N2F(n), .55, .06, sfxBus, H)); beat(t, .2, true); break;
    case 'win': for (let i = 0; i < 6; i++) beat(t + i * .2, .2 + (i % 2) * .1, i % 2 === 0); [...P.capture, P.capture[3] + 4].forEach((n, i) => horn(t + .3 + i * .22, N2F(n), .4 + (i === 4 ? 1 : 0), .06, sfxBus, H)); break;
    case 'charge': P.charge.forEach((n, i) => horn(t + i * .1, N2F(n), .2 + (i === 2 ? .4 : 0), .06, sfxBus, H)); for (let i = 0; i < 6; i++) beat(t + i * .07, .1 + i * .02, i === 0); break;
    case 'hero': beat(t, .25, true); P.capture.map((n, i) => n - (i < 2 ? 12 : 0)).forEach((n, i) => horn(t + .12 + i * .2, N2F(n), .4 + (i === 3 ? .6 : 0), .06, sfxBus, H)); break;
    case 'crack': for (let i = 0; i < 4; i++) noise(t + i * .09 + Math.random() * .04, .07, { f: 2400 + Math.random() * 1500, q: 7, gain: .13, wet: .3 }); tone(t, 180, .4, { gain: .05, f2: 90, wet: .3 }); break;   // hielo que cruje
    case 'rumble': noise(t, 2.6, { type: 'lowpass', f: 160, f2: 70, gain: .32, a: .4, wet: .4 }); tone(t, 48, 2.4, { type: 'sawtooth', gain: .05, a: .5, f2: 36, lp: 200 }); break;   // el volcán ruge
    case 'rank': for (const [r, k] of [[1, 1], [2.76, .4], [5.4, .2]]) tone(t, 880 * r, 1.1, { gain: .05 * k, a: .002, wet: .5 }); break;
  }
}
// Música: bordón grave, percusión y una melodía en la escala de tu civilización que alterna sus dos instrumentos; con combate cerca, se acelera
let mus = null;
export function startMusic() {
  if (!audio() || mus) return;
  if (ac.state === 'suspended') ac.resume();
  const t = ac.currentTime; musBus.gain.setValueAtTime(0, t); musBus.gain.linearRampToValueAtTime(.55, t + 4);
  mus = { next: t + .5, beat: 0, note: 3, civ: null, drone: null };
  setInterval(scheduleMusic, 100);
}
// bordón de la civilización: sierras graves filtradas que respiran; al cambiar de civilización se funde con el nuevo
function setDrone(P) {
  const t = ac.currentTime;
  if (mus.drone) { const d = mus.drone; d.pad.gain.setTargetAtTime(0, t, .6); for (const o of d.osc) o.stop(t + 3); }
  const pad = ac.createGain(); pad.gain.setValueAtTime(0, t); pad.gain.linearRampToValueAtTime(.05, t + 2); const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 320; fl.Q.value = .7;
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = .07; lg.gain.value = 120; lfo.connect(lg).connect(fl.frequency); lfo.start();
  const osc = [lfo]; P.drone.forEach((n, i) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = N2F(n); o.detune.value = [-5, 6, 0, 3][i % 4]; o.connect(fl); o.start(); osc.push(o); });
  fl.connect(pad); out(pad, musBus, .5); mus.drone = { pad, osc };
}
function flute(t, f, dur) {
  const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), vib = ac.createOscillator(), vg = ac.createGain();
  o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2; vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * .012, t + .35);
  vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
  const g2 = ac.createGain(); g2.gain.value = .18; o2.connect(g2).connect(g); o.connect(g);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.045, t + .08); g.gain.setValueAtTime(.04, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  out(g, musBus, .6); for (const n of [o, o2, vib]) { n.start(t); n.stop(t + dur + .05); }
  noise(t, .06, { f: f * 2, q: 1, gain: .01, bus: musBus, wet: .4 });
}
function lyre(t, f) { tone(t, f, 1.4, { type: 'triangle', gain: .05, a: .002, bus: musBus, wet: .55, lp: 2200 }); tone(t, f * 2, .5, { gain: .012, a: .002, bus: musBus, wet: .5 }); }
// aulos, doble flauta o suona: lengüeta nasal (onda cuadrada filtrada) con vibrato
function reed(t, f, dur) {
  const o = ac.createOscillator(), bp = ac.createBiquadFilter(), g = ac.createGain(), vib = ac.createOscillator(), vg = ac.createGain();
  o.type = 'square'; o.frequency.value = f; bp.type = 'bandpass'; bp.frequency.value = f * 2.2; bp.Q.value = 1.6;
  vib.frequency.value = 5.6; vg.gain.value = f * .01; vib.connect(vg).connect(o.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .05); g.gain.setValueAtTime(.045, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(bp).connect(g); out(g, musBus, .5); for (const n of [o, vib]) { n.start(t); n.stop(t + dur + .05); }
}
// guzheng o pipa: cuerda punteada que cae un poco de tono
function pluck(t, f) { tone(t, f * 1.012, 1.1, { type: 'triangle', gain: .06, a: .002, f2: f, bus: musBus, wet: .5, lp: 3000 }); tone(t, f * 2, .35, { gain: .015, a: .002, bus: musBus, wet: .4 }); }
// arpa: cuerda larga y suave
function harp(t, f) { tone(t, f, 2.2, { type: 'triangle', gain: .045, a: .003, bus: musBus, wet: .65, lp: 2600 }); tone(t, f * 2, 1.2, { gain: .01, a: .003, bus: musBus, wet: .6 }); }
// ocarina o silbato: tono puro con soplo
function whistle(t, f, dur) { tone(t, f * 2, dur, { gain: .035, a: .05, bus: musBus, wet: .55 }); noise(t, dur * .6, { f: f * 2, q: 4, gain: .008, bus: musBus, wet: .4 }); }
const LEADS = { flute, lyre: (t, f) => lyre(t, f), reed, pluck: (t, f) => pluck(t, f), harp: (t, f) => harp(t, f), whistle };
// Paisaje sonoro de cada civilización: escala (notas MIDI), bordón, dos instrumentos que se alternan, percusión, cuerno, llamadas y tempo (calma, batalla)
const SOUND = {
  roma: { mode: [62, 64, 65, 67, 69, 71, 72, 74], drone: [38, 38, 45, 50], leads: ['flute', 'lyre'], perc: 'frame', horn: 'cornu', capture: [62, 66, 69, 74], charge: [55, 59, 62], bpm: [76, 112] },
  cartago: { mode: [62, 63, 66, 67, 69, 70, 72, 74], drone: [38, 45, 50], leads: ['reed', 'lyre'], perc: 'darbuka', horn: 'reed', capture: [62, 63, 66, 69], charge: [62, 63, 66], bpm: [80, 116] },
  china: { mode: [62, 64, 66, 69, 71, 74, 76, 78], drone: [38, 45, 50], leads: ['pluck', 'flute'], perc: 'taiko', horn: 'reed', capture: [69, 71, 74, 78], charge: [62, 66, 69], bpm: [72, 104] },
  mexica: { mode: [57, 60, 62, 64, 67, 69, 72, 74], drone: [33, 40, 45], leads: ['whistle', 'whistle'], perc: 'slit', horn: 'conch', capture: [57, 64, 69, 72], charge: [45, 45, 52], bpm: [84, 120] },
  egipto: { mode: [64, 65, 68, 69, 71, 72, 75, 76], drone: [40, 47, 52], leads: ['harp', 'reed'], perc: 'frame', horn: 'trumpet', capture: [64, 68, 71, 76], charge: [64, 68, 71], bpm: [74, 108] },
  galos: { mode: [62, 64, 65, 67, 69, 70, 72, 74], drone: [38, 45, 50, 57], leads: ['whistle', 'harp'], perc: 'bodhran', horn: 'carnyx', capture: [50, 57, 62, 69], charge: [45, 52, 57], bpm: [82, 124] },
  grecia: { mode: [64, 65, 67, 69, 71, 72, 74, 76], drone: [40, 47, 52], leads: ['reed', 'lyre'], perc: 'frame', horn: 'trumpet', capture: [64, 67, 71, 76], charge: [52, 59, 64], bpm: [78, 112] },
  vikingos: { mode: [57, 59, 60, 62, 64, 65, 67, 69], drone: [33, 40, 45], leads: ['harp', 'whistle'], perc: 'war', horn: 'lur', capture: [45, 52, 57, 64], charge: [33, 40, 45], bpm: [76, 116] },
  persia: { mode: [62, 63, 66, 67, 69, 70, 73, 74], drone: [38, 45, 50], leads: ['reed', 'pluck'], perc: 'darbuka', horn: 'trumpet', capture: [62, 66, 69, 74], charge: [62, 63, 66], bpm: [76, 110] },
  mongoles: { mode: [57, 59, 62, 64, 66, 69, 71, 74], drone: [33, 40, 45], leads: ['whistle', 'pluck'], perc: 'frame', horn: 'lur', capture: [57, 62, 66, 69], charge: [45, 50, 57], bpm: [92, 132] },
  japon: { mode: [62, 63, 67, 69, 70, 74, 75, 79], drone: [38, 45, 50], leads: ['flute', 'pluck'], perc: 'taiko', horn: 'conch', capture: [62, 67, 70, 74], charge: [50, 55, 62], bpm: [70, 104] },
};
const soundOf = side => SOUND[civOf(side === 1 ? 1 : 0)?.id] || SOUND.roma;
function scheduleMusic() {
  if (!mus || !S.soundOn) return;
  const P = soundOf(0); if (mus.civ !== P) { mus.civ = P; setDrone(P); }
  const battle = state === 'play' && elapsed - lastCombat < 6, bpm = P.bpm[battle ? 1 : 0], spb = 60 / bpm, beat = (tt, g, st) => PERC[P.perc](tt, g, st, musBus);
  musBus.gain.setTargetAtTime(state === 'play' && S.paused ? .2 : battle ? .7 : .5, ac.currentTime, 1.5);
  while (mus.next < ac.currentTime + .25) {
    const t = mus.next, b = mus.beat % 16;
    if (battle) { beat(t, b % 4 === 0 ? .2 : .11, b % 4 === 0); if (b % 8 === 6) beat(t + spb / 2, .1, false); }
    else if (b % 4 === 0 || b === 14) beat(t, b === 0 ? .14 : .08, b === 0);
    // melodía: frases de 8 tiempos con un descanso de 8; paso a paso por el modo
    if (b < 8 && (b % 2 === 0 || Math.random() < .3)) {
      mus.note = THREE.MathUtils.clamp(mus.note + [-2, -1, -1, 1, 1, 2, 0][Math.random() * 7 | 0], 0, P.mode.length - 1);
      const f = N2F(P.mode[mus.note] - (battle ? 12 : 0)), dur = spb * (b % 4 === 0 ? 1.8 : .95);
      LEADS[P.leads[(mus.beat >> 4) % 2 && !battle ? 1 : 0]](t, f, dur);
    }
    if (battle && b === 0) horn(t, N2F(P.drone[0]), spb * 3, .03, musBus, HORNS[P.horn]);
    mus.next += spb; mus.beat++;
  }
}
