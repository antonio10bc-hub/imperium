// Sonido y música sintetizados con WebAudio.
import { civOf } from './civs.js';
import { lastCombat } from './combat.js';
import { elapsed, state } from './game.js';
import { S } from './state.js';

// ---------- Mezcla ----------
// sfx → compresor; rival (farBus): más bajo, más apagado y con más sala, para que se distinga de lo tuyo sin estorbar;
// música → filtro paso bajo (timbre opaco, deja el agudo libre para los efectos) → ducking (baja cuando hay mucho jaleo o un momento importante)
export let ac = null, master = null, sfxBus = null, musBus = null, verb = null, noiseBuf = null;
let farBus = null, duck = null; const lastSfx = {};
export function audio() {
  if (ac) return ac;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  master = ac.createGain(); master.gain.value = S.soundOn ? .85 : 0; master.connect(ac.destination);
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = .01; comp.release.value = .25; comp.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = .75; sfxBus.connect(comp);
  farBus = ac.createGain(); farBus.gain.value = .5; const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1800; farBus.connect(fl).connect(comp);
  duck = ac.createGain(); duck.connect(comp); const ml = ac.createBiquadFilter(); ml.type = 'lowpass'; ml.frequency.value = 2800; ml.Q.value = .5; ml.connect(duck);
  musBus = ac.createGain(); musBus.gain.value = 0; musBus.connect(ml);
  // sala cálida: ruido que se apaga y además se oscurece (filtro de un polo cada vez más cerrado), sin el siseo de antes
  verb = ac.createConvolver(); const L = ac.sampleRate * 1.9 | 0, ir = ac.createBuffer(2, L, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let y = 0; for (let i = 0; i < L; i++) { const k = i / L, a = .5 - .42 * k; y += a * ((Math.random() * 2 - 1) - y); d[i] = y * 1.8 * Math.pow(1 - k, 2.6); } }
  verb.buffer = ir; const vg = ac.createGain(); vg.gain.value = .28; verb.connect(vg).connect(comp);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return ac;
}
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.random() * a.length | 0];
const N2F = n => 440 * Math.pow(2, (n - 69) / 12);
const env = (g, t, a, peak, dur) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + dur); };
function out(node, bus, wet = .3) { node.connect(bus); if (wet) { const w = ac.createGain(); w.gain.value = wet; node.connect(w).connect(verb); } }
function noise(t, dur, { type = 'bandpass', f = 1000, f2 = null, q = 1, gain = .2, a = .003, bus = sfxBus, wet = .25 } = {}) {
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
  env(g, t, a, gain, dur); s.connect(fl).connect(g); out(g, bus, wet); s.start(t, Math.random() * .5); s.stop(t + a + dur + .05);
}
function tone(t, f, dur, { type = 'sine', gain = .1, a = .005, f2 = null, bus = sfxBus, wet = .25, lp = null, det = 0 } = {}) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); o.detune.value = det;
  env(g, t, a, gain, dur); let n = o; if (lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; } n.connect(g); out(g, bus, wet); o.start(t); o.stop(t + a + dur + .05);
}

// ---------- Instrumentos (música y efectos) ----------
// cuerda punteada: lira, arpa, guzheng, koto, laúd; el filtro se cierra al apagarse la nota, como una cuerda real
function string(t, f, { dur = 1.2, gain = .05, lp = 2400, bend = 1.01, h2 = .25, bus = musBus, wet = .45 } = {}) {
  const o = ac.createOscillator(), o2 = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain(), g2 = ac.createGain();
  o.type = 'triangle'; o2.type = 'sine'; o.frequency.setValueAtTime(f * bend, t); o.frequency.exponentialRampToValueAtTime(f, t + .08); o2.frequency.value = f * 2;
  fl.type = 'lowpass'; fl.frequency.setValueAtTime(lp, t); fl.frequency.exponentialRampToValueAtTime(lp * .25, t + dur); g2.gain.value = h2;
  o.connect(fl); o2.connect(g2).connect(fl); fl.connect(g); env(g, t, .002, gain, dur); out(g, bus, wet);
  for (const n of [o, o2]) { n.start(t); n.stop(t + dur + .05); }
}
// viento: flauta, ney, shakuhachi, flauta de pan, ocarina; soplo, vibrato que entra tarde y una pequeña subida al atacar
function wind(t, f, dur, { gain = .04, breath = .008, vib = .01, bend = 1, h2 = .15, bus = musBus, wet = .5 } = {}) {
  const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), g2 = ac.createGain(), v = ac.createOscillator(), vg = ac.createGain();
  o.type = 'sine'; o2.type = 'triangle'; o.frequency.setValueAtTime(f * bend, t); o.frequency.linearRampToValueAtTime(f, t + .12); o2.frequency.setValueAtTime(f * 2 * bend, t); o2.frequency.linearRampToValueAtTime(f * 2, t + .12);
  v.frequency.value = 5; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * vib, t + Math.min(.45, dur * .6)); v.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
  g2.gain.value = h2; o2.connect(g2).connect(g); o.connect(g);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .07); g.gain.setValueAtTime(gain * .85, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  out(g, bus, wet); for (const n of [o, o2, v]) { n.start(t); n.stop(t + dur + .05); }
  if (breath) noise(t, Math.min(dur, .5), { f: f * 2, q: 1.2, gain: breath, bus, wet: .4 });
}
// lengüeta (aulos, suona): cuadrada muy filtrada para que sea nasal pero suave
function reedI(t, f, dur, gain = .03, bus = musBus) {
  const o = ac.createOscillator(), bp = ac.createBiquadFilter(), lp = ac.createBiquadFilter(), g = ac.createGain(), v = ac.createOscillator(), vg = ac.createGain();
  o.type = 'square'; o.frequency.value = f; bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 1.2; lp.type = 'lowpass'; lp.frequency.value = 2200;
  v.frequency.value = 5.4; vg.gain.value = f * .007; v.connect(vg).connect(o.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .06); g.gain.setValueAtTime(gain * .85, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(bp).connect(lp).connect(g); out(g, bus, .5); for (const n of [o, v]) { n.start(t); n.stop(t + dur + .05); }
}
// cuerda frotada (morin khuur, tagelharpa): sierra apagada con ataque lento
function bowed(t, f, dur, gain = .028, bus = musBus) {
  const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain(), v = ac.createOscillator(), vg = ac.createGain();
  o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = Math.min(1500, f * 4); fl.Q.value = .8;
  v.frequency.value = 5.5; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * .008, t + .4); v.connect(vg).connect(o.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .18); g.gain.setValueAtTime(gain * .9, t + dur * .75); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .1);
  o.connect(fl).connect(g); out(g, bus, .5); for (const n of [o, v]) { n.start(t); n.stop(t + dur + .15); }
}
const INSTR = {
  lyre: (t, f, d, g = 1, bus) => string(t, f, { dur: 1.4, gain: .045 * g, lp: 2200, bus }),
  harp: (t, f, d, g = 1, bus) => string(t, f, { dur: 2, gain: .04 * g, lp: 2600, bend: 1, h2: .15, bus, wet: .6 }),
  pluck: (t, f, d, g = 1, bus) => string(t, f, { dur: 1.1, gain: .05 * g, lp: 3000, bend: 1.014, bus }),          // guzheng
  koto: (t, f, d, g = 1, bus) => string(t, f, { dur: .9, gain: .05 * g, lp: 3200, bend: 1.025, h2: .35, bus }),
  oud: (t, f, d, g = 1, bus) => { string(t, f, { dur: .8, gain: .045 * g, lp: 1500, bend: 1.008, bus }); string(t + .012, f * 1.003, { dur: .7, gain: .02 * g, lp: 1500, bus }); },
  dulc: (t, f, d, g = 1, bus) => { string(t, f, { dur: .7, gain: .04 * g, lp: 3400, bend: 1, h2: .4, bus }); string(t + .09, f, { dur: .5, gain: .022 * g, lp: 3000, bend: 1, h2: .4, bus }); },   // santur
  flute: (t, f, d, g = 1, bus) => wind(t, f, d, { gain: .038 * g, bus }),
  ney: (t, f, d, g = 1, bus) => wind(t, f, d, { gain: .034 * g, breath: .02, vib: .006, bend: .97, h2: .08, bus }),
  shaku: (t, f, d, g = 1, bus) => wind(t, f, d, { gain: .034 * g, breath: .026, vib: .009, bend: .95, h2: .06, bus }),
  pan: (t, f, d, g = 1, bus) => wind(t, f, d, { gain: .034 * g, breath: .02, vib: 0, h2: .1, bus }),
  whistle: (t, f, d, g = 1, bus) => wind(t, f * 2, d, { gain: .026 * g, breath: .006, vib: .008, h2: .05, bus }),
  reed: (t, f, d, g = 1, bus) => reedI(t, f, d, .03 * g, bus),
  fiddle: (t, f, d, g = 1, bus) => bowed(t, f, d, .028 * g, bus),
  wood: (t, f, d, g = 1, bus) => { tone(t, f, .25, { type: 'triangle', gain: .05 * g, a: .001, bus, wet: .3 }); tone(t, f * 3.9, .05, { gain: .012 * g, a: .001, bus, wet: .2 }); },   // marimba de madera
};
// acorde sostenido: dos triángulos desafinados por nota y un poco de sierra muy apagada; entra y sale despacio
function pad(t, notes, dur, gain = .016) {
  const g = ac.createGain(), fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 850; fl.Q.value = .5;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 1.4); g.gain.setValueAtTime(gain, t + dur - .4); g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
  for (const n of notes) for (const [type, det, k] of [['triangle', -6, 1], ['triangle', 6, 1], ['sawtooth', 0, .25]]) {
    const o = ac.createOscillator(), og = ac.createGain(); o.type = type; o.frequency.value = N2F(n); o.detune.value = det; og.gain.value = k; o.connect(og).connect(fl); o.start(t); o.stop(t + dur + 1.3);
  }
  fl.connect(g); out(g, musBus, .55);
}
function bass(t, f, dur, gain = .05) { tone(t, f, dur, { type: 'triangle', gain, a: .03, bus: musBus, wet: .2, lp: 400 }); tone(t, f * 2, dur * .5, { gain: gain * .2, a: .03, bus: musBus, wet: .2 }); }

// cuernos de cada civilización: forma de onda, apertura del filtro, vibrato, subida al soplar, rugido (carnyx) y soplo (caracola)
const HORNS = {
  cornu: { type: 'sawtooth', open: 4.5, rest: 3, vib: .005 },                        // Roma: cornu de bronce
  salpinx: { type: 'square', open: 5, rest: 3.2, vib: .004, bend: .97, vol: .6 },    // Grecia: trompeta recta y clara
  kerna: { type: 'square', open: 3.2, rest: 2.4, vib: .01, q: 4, vol: .55 },         // Cartago: cuerno de lengüeta nasal
  karnay: { type: 'sawtooth', open: 3.6, rest: 2.6, vib: .004, bend: .9 },           // Persia: karnay largo que sube despacio
  sheneb: { type: 'square', open: 5.5, rest: 3.6, vib: .006, bend: .98, vol: .6 },   // Egipto: trompeta de plata
  haotong: { type: 'sawtooth', open: 2.8, rest: 2, vib: .003, bend: .95, breath: .01 },   // Han: trompa larga y grave
  hora: { type: 'triangle', open: 2.4, rest: 1.8, vib: .009, bend: .86, breath: .022 },  // Japón: horagai que tiembla
  conch: { type: 'triangle', open: 2.6, rest: 2, vib: .003, bend: .92, breath: .018 },   // Mexicas: caracola
  carnyx: { type: 'sawtooth', open: 6, rest: 4, vib: .004, growl: .35 },             // Galos: carnyx que ruge
  lur: { type: 'sawtooth', open: 3, rest: 2, vib: .003, bend: .94, breath: .012 },   // Vikingos: lur oscuro
  bure: { type: 'sawtooth', open: 3.4, rest: 2.4, vib: .007, bend: .9, growl: .15 },  // Mongoles: cuerno de la estepa
};
function horn(t, f, dur, gain = .06, bus = sfxBus, tb = HORNS.cornu) {
  gain *= tb.vol ?? 1;
  const g = ac.createGain(), fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = tb.q || 1.5;
  fl.frequency.setValueAtTime(300, t); fl.frequency.linearRampToValueAtTime(Math.min(4000, f * tb.open), t + .12); fl.frequency.linearRampToValueAtTime(Math.min(3000, f * tb.rest), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .09); g.gain.setValueAtTime(gain, t + Math.max(.1, dur - .12)); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .25);
  const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5; vg.gain.value = f * tb.vib; vib.connect(vg);
  for (const d of [-6, 5]) { const o = ac.createOscillator(); o.type = tb.type; o.frequency.setValueAtTime(f * (tb.bend || 1), t); o.frequency.linearRampToValueAtTime(f, t + .18); o.detune.value = d; vg.connect(o.frequency); o.connect(fl); o.start(t); o.stop(t + dur + .3); }
  vib.start(t); vib.stop(t + dur + .3);
  if (tb.growl) { const gr = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain(); gr.gain.value = 1 - tb.growl; lfo.frequency.value = 27; lg.gain.value = tb.growl; lfo.connect(lg).connect(gr.gain); fl.connect(gr).connect(g); lfo.start(t); lfo.stop(t + dur + .3); }
  else fl.connect(g);
  if (tb.breath) noise(t, dur, { f: f * 3, q: 1.5, gain: tb.breath, bus, wet: .4 });
  out(g, bus, .45);
}
// percusión de cada civilización (strong: tiempo fuerte); todas suaves y graves para no tapar los efectos
function drum(t, gain = .2, low = 1, bus = sfxBus) { tone(t, 110 * low, .26, { gain, f2: 50 * low, bus, wet: .2 }); noise(t, .07, { type: 'lowpass', f: 600, gain: gain * .4, bus, wet: .12 }); }
function metal(t, f, dur, gain, bus, wet = .5) { for (const [r, k] of [[1, 1], [1.48, .6], [2.1, .4], [2.9, .2]]) tone(t, f * r, dur * (1.1 - k * .3), { gain: gain * k, a: .002, bus, wet }); }
const PERC = {
  frame: (t, g, st, bus) => drum(t, g, st ? .85 : 1.15, bus),
  tymp: (t, g, st, bus) => { drum(t, g * .8, st ? 1 : 1.3, bus); if (!st) noise(t, .025, { f: 3000, q: 4, gain: g * .3, a: .001, bus, wet: .15 }); },   // tímpano y krotala
  darbuka: (t, g, st, bus) => st ? tone(t, 95, .28, { gain: g, f2: 70, bus, wet: .2 }) : noise(t, .04, { type: 'highpass', f: 3200, gain: g * .35, a: .001, bus, wet: .15 }),
  daf: (t, g, st, bus) => { drum(t, g * .8, st ? .9 : 1.2, bus); noise(t, .18, { type: 'highpass', f: 6000, gain: g * .12, bus, wet: .2 }); },   // daf con anillas
  sistrum: (t, g, st, bus) => { if (st) drum(t, g * .8, .9, bus); for (let i = 0; i < 3; i++) noise(t + i * .03, .04, { f: 5000, q: 3, gain: g * .15, a: .001, bus, wet: .2 }); },
  gong: (t, g, st, bus) => { drum(t, g * .7, st ? .8 : 1.1, bus); if (st) metal(t, 180, 1.4, g * .1, bus); },
  taiko: (t, g, st, bus) => st ? (tone(t, 62, .6, { gain: g * 1.2, f2: 40, bus, wet: .3 }), noise(t, .1, { type: 'lowpass', f: 380, gain: g * .5, bus })) : noise(t, .03, { f: 1800, q: 3, gain: g * .3, a: .001, bus, wet: .1 }),   // taiko y borde (kakegoe)
  slit: (t, g, st, bus) => { tone(t, st ? 330 : 440, .13, { type: 'triangle', gain: g * .6, a: .001, bus, wet: .3 }); if (!st) noise(t, .08, { f: 4500, q: 2, gain: g * .12, bus, wet: .1 }); },   // teponaztli y sonaja
  bodhran: (t, g, st, bus) => { drum(t, g, st ? .7 : 1, bus); noise(t, .04, { f: 2000, q: 2, gain: g * .18, bus, wet: .1 }); },
  war: (t, g, st, bus) => drum(t, g * 1.1, st ? .55 : .8, bus),
  hoof: (t, g, st, bus) => { drum(t, g * .8, st ? .9 : 1.2, bus); drum(t + .09, g * .4, 1.3, bus); },   // galope
};
// Paisaje sonoro de cada civilización. mode: escala (MIDI, desde la tónica); prog: grados de los acordes (2 compases cada uno);
// leads: dos instrumentos que se reparten la melodía; ui: el que suena al seleccionar; perc, horn; tema: llamada de cuerno de 4 notas; bpm: calma/batalla
const SOUND = {
  roma: { mode: [62, 64, 66, 67, 69, 71, 73], prog: [0, 3, 4, 0], leads: ['flute', 'lyre'], ui: 'lyre', perc: 'frame', horn: 'cornu', theme: [62, 66, 69, 74], bpm: [80, 96] },
  grecia: { mode: [64, 66, 67, 69, 71, 73, 74], prog: [0, 6, 3, 0], leads: ['reed', 'lyre'], ui: 'lyre', perc: 'tymp', horn: 'salpinx', theme: [64, 71, 69, 76], bpm: [78, 94] },
  cartago: { mode: [62, 64, 66, 67, 69, 70, 72], prog: [0, 6, 5, 0], leads: ['oud', 'reed'], ui: 'oud', perc: 'darbuka', horn: 'kerna', theme: [62, 66, 67, 69], bpm: [84, 100] },
  persia: { mode: [62, 63, 66, 67, 69, 70, 72], prog: [0, 1, 6, 0], leads: ['dulc', 'ney'], ui: 'dulc', perc: 'daf', horn: 'karnay', theme: [62, 66, 69, 67], bpm: [76, 92] },
  egipto: { mode: [64, 65, 68, 69, 71, 72, 74], prog: [0, 1, 0, 6], leads: ['harp', 'reed'], ui: 'harp', perc: 'sistrum', horn: 'sheneb', theme: [64, 68, 71, 76], bpm: [72, 88] },
  china: { mode: [62, 64, 66, 69, 71], prog: [0, 3, 1, 0], leads: ['pluck', 'flute'], ui: 'pluck', perc: 'gong', horn: 'haotong', theme: [69, 71, 74, 78], bpm: [72, 90] },
  japon: { mode: [62, 64, 67, 69, 71], prog: [0, 2, 3, 0], leads: ['koto', 'shaku'], ui: 'koto', perc: 'taiko', horn: 'hora', theme: [62, 67, 69, 74], bpm: [66, 84] },
  mexica: { mode: [57, 60, 62, 64, 67], prog: [0, 1, 3, 0], leads: ['whistle', 'pan'], ui: 'wood', perc: 'slit', horn: 'conch', theme: [57, 64, 69, 72], bpm: [86, 104] },
  galos: { mode: [62, 64, 65, 67, 69, 71, 72], prog: [0, 6, 3, 0], leads: ['whistle', 'harp'], ui: 'harp', perc: 'bodhran', horn: 'carnyx', theme: [50, 57, 62, 69], bpm: [88, 108] },
  vikingos: { mode: [57, 59, 60, 62, 64, 66, 67], prog: [0, 6, 3, 0], leads: ['harp', 'fiddle'], ui: 'harp', perc: 'war', horn: 'lur', theme: [45, 52, 57, 64], bpm: [74, 92] },
  mongoles: { mode: [55, 57, 59, 62, 64], prog: [0, 3, 4, 0], leads: ['fiddle', 'flute'], ui: 'koto', perc: 'hoof', horn: 'bure', theme: [55, 62, 64, 67], bpm: [92, 112] },
};
const soundOf = side => SOUND[civOf(side >= 0 ? side : 0)?.id] || SOUND.roma;
// nota de la escala por índice (sube de octava al pasar del final)
const deg = (P, i) => { const L = P.mode.length, o = Math.floor(i / L); return P.mode[((i % L) + L) % L] + 12 * o; };
const chordOf = (P, d) => [deg(P, d), deg(P, d + 2), deg(P, d + 4)];

// ---------- Ambiente ----------
// Ruido largo (12 s, estéreo, cada canal distinto) para que no se oiga el bucle; el final se funde con el principio.
// marrón: grave y redondo (viento, oleaje); rosa: más aire (lluvia, arena)
let ambBuf = null;
function ambNoise() {
  if (ambBuf) return ambBuf;
  const R = ac.sampleRate, L = R * 12, X = R / 2 | 0; ambBuf = ac.createBuffer(4, L, R);
  for (let c = 0; c < 4; c++) { const d = ambBuf.getChannelData(c), brown = c < 2; let y = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < L; i++) { const w = Math.random() * 2 - 1;
      if (brown) { y = (y + .02 * w) / 1.02; d[i] = y * 3.5; } else { b0 = .99765 * b0 + w * .099; b1 = .963 * b1 + w * .2965; b2 = .57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * .1848) * .12; } }
    for (let i = 0; i < X; i++) { const k = i / X; d[i] = d[i] * k + d[L - X + i] * (1 - k); } }
  return ambBuf;
}
// fondo de cada geografía: [tipo de ruido, filtro, frecuencia, Q, volumen, cuánto respira el filtro (ráfagas), cuánto respira el volumen]
const AMB = { wind: ['brown', 'lowpass', 420, .5, .05, 260, .45], waves: ['brown', 'lowpass', 520, .4, .06, 180, .6], rain: ['pink', 'lowpass', 2600, .3, .012, 300, .1], sand: ['pink', 'bandpass', 1300, .5, .02, 400, .4] };
let amb = null;
export function setAmbience(kind, level = 1) {
  if (!S.soundOn || !audio()) return;
  if (!amb) {   // dos capas (marrón y rosa) que se cruzan; dos osciladores lentos de periodos que no coinciden dan ráfagas irregulares
    const buf = ambNoise(), mk = (c0) => { const sp = ac.createChannelSplitter(4), mg = ac.createChannelMerger(2), s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(sp); sp.connect(mg, c0, 0); sp.connect(mg, c0 + 1, 1); s.start(0, Math.random() * 10); return mg; };
    const f = ac.createBiquadFilter(), g = ac.createGain(), gb = ac.createGain(), gp = ac.createGain(), fm = ac.createGain(), am = ac.createGain(), base = ac.createGain();
    mk(0).connect(gb).connect(f); mk(2).connect(gp).connect(f); gb.gain.value = 0; gp.gain.value = 0;
    base.gain.value = 1; f.connect(base).connect(g).connect(sfxBus); g.gain.value = 0; fm.gain.value = 0; am.gain.value = 0; fm.connect(f.frequency); am.connect(base.gain);
    for (const hz of [.047, .113, .29]) { const o = ac.createOscillator(), k = ac.createGain(); o.frequency.value = hz * (.9 + Math.random() * .2); k.gain.value = hz > .2 ? .3 : 1; o.connect(k); k.connect(fm); k.connect(am); o.start(); }
    amb = { f, g, gb, gp, fm, am };
  }
  const P = AMB[kind], t = ac.currentTime;
  if (!P) { amb.g.gain.setTargetAtTime(0, t, 1.2); return; }
  const [n, type, fr, q, vol, fmod, amod] = P;
  amb.f.type = type; amb.f.frequency.setTargetAtTime(fr, t, 1); amb.f.Q.setTargetAtTime(q, t, 1);
  amb.gb.gain.setTargetAtTime(n === 'brown' ? 1 : 0, t, 1.5); amb.gp.gain.setTargetAtTime(n === 'pink' ? 1 : 0, t, 1.5);
  amb.fm.gain.setTargetAtTime(fmod / 2.3, t, 1); amb.am.gain.setTargetAtTime(amod / 2.3, t, 1); amb.g.gain.setTargetAtTime(vol * level, t, 1.2);
}

// ---------- Efectos ----------
// Cada acción importante tiene su firma; las frecuentes son cortas, graves, varían un poco cada vez y casan con el acorde que suena.
// Densidad: cuantos más golpes por segundo, más bajo suena cada uno (y a partir de cierto punto se descartan), para que una gran batalla no sature.
const GAP = { hit: .05, arrow: .07, die: .09, select: .06, cmd: .08, ui: .05, deny: .15, cancel: .1, train: .1, ready: .35, charge: 2, alarm: 2, rank: .3, gold: .3 };
const BIG = { capture: .6, lost: .7, hero: .7, ritual: .65, consecrate: .55, god: .45, conquer: .45, cityLost: .5, win: .35, defeat: .35, alarm: .7 };
let busy = 0, busyT = 0, duckUntil = 0;
function combatGain(t) { busy = busy * Math.exp(-(t - busyT) / .35) + 1; busyT = t; return 1 / (1 + busy * .09); }
function duckMusic(t, k) { if (!duck) return; duck.gain.cancelScheduledValues(t); duck.gain.setTargetAtTime(k, t, .08); duckUntil = t + 2.2; }
// nota cercana a la música: un tono del acorde que suena ahora, en el registro pedido
function chordNote(P, base) { const c = mus?.chord || chordOf(P, 0), n = pick(c); let m = n; while (m < base) m += 12; while (m >= base + 12) m -= 12; return m; }
export function sfx(kind, side = 0) {
  if (!S.soundOn || !audio()) return;
  if (ac.state === 'suspended') ac.resume();
  const t = ac.currentTime; if (lastSfx[kind] && t - lastSfx[kind] < (GAP[kind] ?? .12)) return; lastSfx[kind] = t;
  const P = soundOf(side), H = HORNS[P.horn], bus = side > 0 ? farBus : sfxBus, beat = (tt, g, st) => PERC[P.perc](tt, g, st, bus), th = P.theme, ui = INSTR[P.ui];
  if (BIG[kind] && side <= 0) duckMusic(t, BIG[kind]);
  switch (kind) {
    // combate
    case 'hit': { const k = combatGain(t); if (busy > 24 && Math.random() < .5) return;
      if (Math.random() < .55) { const f = rnd(700, 1300); metal(t, f, .14, .012 * k, sfxBus, .25); noise(t, .04, { type: 'highpass', f: 2000, gain: .04 * k, a: .001, wet: .1 }); }   // filo contra filo, apagado
      else { tone(t, rnd(120, 160), .12, { gain: .07 * k, f2: 80, a: .001, wet: .15 }); noise(t, .06, { type: 'lowpass', f: rnd(700, 1100), gain: .1 * k, a: .001, wet: .15 }); }   // golpe en escudo
      break; }
    case 'arrow': { const k = combatGain(t); if (busy > 24 && Math.random() < .6) return; noise(t, .18, { f: rnd(2000, 2800), f2: rnd(500, 700), q: 2.5, gain: .03 * k, wet: .08 }); break; }
    case 'die': { const k = combatGain(t); noise(t, .2, { type: 'lowpass', f: 420, gain: .1 * k, a: .004, wet: .2 }); tone(t, rnd(70, 90), .2, { gain: .06 * k, f2: 45, wet: .2 }); break; }   // cae al suelo
    case 'charge': P.theme.slice(0, 2).forEach((n, i) => horn(t + i * .14, N2F(n - 12), .22 + i * .25, .04, bus, H)); for (let i = 0; i < 5; i++) beat(t + i * .08, .05 + i * .015, i === 0); break;
    case 'rank': metal(t, 1320, .9, .012, sfxBus, .55); break;   // ascenso: campanilla
    // órdenes e interfaz (las más repetidas: muy cortas y suaves)
    case 'select': ui(t, N2F(chordNote(P, 62)), .3, .5, sfxBus); noise(t, .03, { f: 1400, q: 2, gain: .025, wet: 0 }); break;
    case 'cmd': beat(t, .07, false); ui(t + .02, N2F(chordNote(P, 50)), .25, .35, sfxBus); break;
    case 'ui': noise(t, .03, { f: 1300, q: 4, gain: .06, a: .001, wet: .05 }); tone(t, 660, .04, { gain: .012, wet: 0 }); break;
    case 'deny': tone(t, 200, .07, { type: 'triangle', gain: .045, a: .002, lp: 900, wet: .05 }); tone(t + .08, 160, .09, { type: 'triangle', gain: .04, a: .002, lp: 900, wet: .05 }); break;
    case 'cancel': noise(t, .05, { f: 1100, f2: 500, q: 3, gain: .05, wet: .05 }); tone(t, 330, .08, { type: 'triangle', gain: .02, f2: 260, wet: 0 }); break;
    case 'train': noise(t, .02, { f: 900, q: 5, gain: .06, a: .001, wet: 0 }); ui(t + .03, N2F(chordNote(P, 55)), .3, .45, sfxBus); break;   // encargo: un toque de madera y una nota
    case 'ready': horn(t, N2F(pick([th[0], th[2]]) - 12), .22, .022, sfxBus, H); break;
    case 'warn': metal(t, 990, .5, .012, sfxBus, .4); metal(t + .28, 830, .6, .012, sfxBus, .4); break;   // aviso: dos campanas
    case 'danger': for (let k = 0; k < 2; k++) { tone(t + k * .42, 523, .18, { type: 'square', gain: .028, a: .004, lp: 1600, wet: .2 }); tone(t + k * .42 + .2, 392, .2, { type: 'square', gain: .028, a: .004, lp: 1600, wet: .2 }); } break;   // cambio del escenario peligroso (aviso rojo): sirena de dos tonos
    case 'notice': metal(t, 1320, .45, .01, sfxBus, .45); tone(t + .12, 660, .35, { type: 'triangle', gain: .03, a: .01, wet: .35 }); break;   // cambio sin peligro (aviso amarillo): campanilla suave
    case 'alarm': { const a = th[0] - 12; horn(t, N2F(a), .6, .055, sfxBus, H); horn(t + .75, N2F(a), .6, .055, sfxBus, H); horn(t + .75, N2F(a + 7), .6, .035, sfxBus, H); break; }
    // economía y construcción
    case 'gold': for (let i = 0; i < 6; i++) metal(t + i * .045 + Math.random() * .02, rnd(2400, 3600), .18, .005, sfxBus, .2); break;   // monedas
    case 'upgrade': metal(t, 880, .5, .014, sfxBus, .3); noise(t, .03, { f: 3000, q: 3, gain: .05, a: .001 }); metal(t + .22, 1320, .9, .014, sfxBus, .5); ui(t + .22, N2F(chordNote(P, 62) + 12), .4, .5, sfxBus); break;   // yunque y campana que sube
    case 'build': for (let i = 0; i < 3; i++) { tone(t + i * .16, rnd(200, 240), .1, { type: 'triangle', gain: .045, a: .001, wet: .2, lp: 1200 }); noise(t + i * .16, .04, { f: 1200, q: 2, gain: .045, a: .001, wet: .15 }); } drum(t + .5, .1, 1); break;   // martillo
    case 'demolish': for (let i = 0; i < 5; i++) noise(t + i * .07 + Math.random() * .03, .1, { f: rnd(500, 1400), q: 3, gain: .08, wet: .3 }); noise(t + .35, 1.1, { type: 'lowpass', f: 900, f2: 300, gain: .1, a: .05, wet: .4 }); break;   // madera que se quiebra y cae al agua
    // territorio
    case 'capture': beat(t, .14, true); th.slice(0, 3).forEach((n, i) => horn(t + .08 + i * .15, N2F(n), .28 + (i === 2 ? .35 : 0), .045, bus, H)); break;
    case 'lost': [th[2], th[0]].forEach((n, i) => horn(t + i * .38, N2F(n - 12), .5, .045, sfxBus, H)); beat(t, .12, true); break;
    case 'conquer': for (let i = 0; i < 4; i++) beat(t + i * .18, .14 + (i % 2) * .05, i % 2 === 0); th.forEach((n, i) => horn(t + .25 + i * .2, N2F(n), .35 + (i === 3 ? .7 : 0), .05, bus, H)); break;
    case 'cityLost': [th[3], th[2], th[0]].forEach((n, i) => horn(t + i * .42, N2F(n - 12), .6, .05, sfxBus, H)); beat(t, .16, true); beat(t + .84, .12, true); break;
    // héroes, templo y dioses
    case 'hero': beat(t, .16, true); th.map((n, i) => n - (i < 2 ? 12 : 0)).forEach((n, i) => horn(t + .12 + i * .2, N2F(n), .35 + (i === 3 ? .5 : 0), .05, bus, H)); break;
    case 'ritual': choir(t, chordOf(P, 0).map(n => n - 12), 2.4, .03, bus); metal(t, 440, 2, .012, bus, .7); break;
    case 'consecrate': chordOf(P, 0).forEach((n, i) => metal(t + i * .25, N2F(n + 12), 2, .012, bus, .7)); choir(t + .3, chordOf(P, 0), 2.6, .022, bus); break;   // campanas del templo
    case 'god': tone(t, 55, 3, { type: 'triangle', gain: .09, a: .3, lp: 300, bus, wet: .5 }); metal(t, 110, 3, .03, bus, .7); choir(t + .2, chordOf(P, 0).map(n => n - 12), 3, .035, bus); horn(t + 1, N2F(th[3] - 12), 1.2, .045, bus, H); break;
    // final de partida
    case 'win': for (let i = 0; i < 6; i++) beat(t + i * .2, .14 + (i % 2) * .06, i % 2 === 0); [...th, th[3] + 4].forEach((n, i) => horn(t + .3 + i * .22, N2F(n), .4 + (i === 4 ? 1.2 : 0), .05, sfxBus, H)); choir(t + 1.2, chordOf(P, 0), 3, .025, sfxBus); break;
    case 'defeat': [th[3], th[2], th[1], th[0]].forEach((n, i) => horn(t + i * .5, N2F(n - 12), .7, .045, sfxBus, H)); beat(t, .16, true); beat(t + 1.5, .14, true); break;
    // naturaleza
    case 'crack': for (let i = 0; i < 4; i++) noise(t + i * .09 + Math.random() * .04, .07, { f: 2400 + Math.random() * 1500, q: 7, gain: .1, wet: .3 }); tone(t, 180, .4, { gain: .04, f2: 90, wet: .3 }); break;   // hielo que cruje
    case 'rumble': noise(t, 2.4, { type: 'lowpass', f: 160, f2: 70, gain: .26, a: .4, wet: .4 }); tone(t, 48, 2.2, { type: 'triangle', gain: .05, a: .5, f2: 36, lp: 200 }); break;   // el volcán ruge
  }
}
// coro: sierras por la vocal «a» (dos formantes), con entrada lenta; para el templo y los dioses
function choir(t, notes, dur, gain, bus) {
  const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur * .35); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  for (const [f, q, k] of [[700, 6, 1], [1150, 8, .6]]) { const b = ac.createBiquadFilter(), bg = ac.createGain(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; bg.gain.value = k * 2.5; b.connect(bg).connect(g);
    for (const n of notes) for (const d of [-8, 8]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = N2F(n); o.detune.value = d; o.connect(b); o.start(t); o.stop(t + dur + .1); } }
  out(g, bus, .7);
}

// ---------- Música ----------
// Pieza con forma: acordes de la civilización (2 compases cada uno), bajo, percusión ligera y una melodía con motivo que se repite y varía
// (A A' B A, luego 8 compases de respiro solo con acordes). En batalla no se oscurece: sube un poco el pulso y entra un ostinato en el bajo.
let mus = null;
export function startMusic() {
  if (!audio() || mus) return;
  if (ac.state === 'suspended') ac.resume();
  const t = ac.currentTime; musBus.gain.setValueAtTime(0, t); musBus.gain.linearRampToValueAtTime(.3, t + 5);
  mus = { next: t + .5, step: 0, civ: null, chord: null, d: 0, motif: null, inten: 0 };
  setInterval(scheduleMusic, 100);
}
// ritmos de dos compases en corcheas: [posición, duración]
const RHY = [[[0, 3], [3, 1], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 2], [2, 2], [4, 2], [6, 2], [8, 6]], [[0, 4], [4, 2], [6, 2], [8, 3], [11, 1], [12, 4]], [[0, 1], [1, 1], [2, 2], [4, 4], [8, 4], [12, 4]], [[0, 6], [6, 2], [8, 8]]];
function makeMotif(P) {
  const r = pick(RHY), r2 = pick(RHY), walk = n => { let d = 0; return Array.from({ length: n }, (_, i) => i ? (d = Math.max(-3, Math.min(6, d + pick([-2, -1, -1, 1, 1, 2])))) : 0); };
  const a = walk(r.length), b = walk(r2.length).map(x => x + 2);
  a[a.length - 1] = 2; b[b.length - 1] = 4;   // pregunta (abierta) y respuesta (cierra en la tónica del acorde)
  return { r, a, r2, b, a2: a.map((x, i) => i === a.length - 1 ? 0 : x), lead: 0 };
}
function scheduleMusic() {
  if (!mus || !S.soundOn) return;
  const P = soundOf(0); if (mus.civ !== P) { mus.civ = P; mus.motif = makeMotif(P); }
  const now = ac.currentTime, battle = state === 'play' && elapsed - lastCombat < 6;
  mus.inten += ((battle ? 1 : 0) - mus.inten) * .03;
  const spe = 30 / (P.bpm[0] + (P.bpm[1] - P.bpm[0]) * mus.inten);   // segundos por corchea
  musBus.gain.setTargetAtTime(state !== 'play' ? .22 : S.paused ? .12 : .28 + mus.inten * .06, now, 1.5);
  if (now > duckUntil) duck.gain.setTargetAtTime(busy > 10 ? .7 : 1, now, .6);
  while (mus.next < now + .3) {
    const t = mus.next, s = mus.step, bar = (s >> 3) % 16, pos = s & 7, M = mus.motif, I = mus.inten > .5;
    if (pos === 0 && bar % 2 === 0) {   // cambio de acorde
      const d = P.prog[(bar >> 1) % P.prog.length]; mus.d = d; mus.chord = chordOf(P, d);
      pad(t, mus.chord.map(n => n - 12), spe * 16, .014);
      bass(t, N2F(mus.chord[0] - 24), spe * 6, .045);
      if (I) horn(t, N2F(mus.chord[0] - 12), spe * 6, .012, musBus, HORNS[P.horn]);
      if (s && bar === 0 && (s >> 7) % 2 === 0) { M.lead ^= 1; if (Math.random() < .5) mus.motif = makeMotif(P); }
    }
    // percusión: tiempo fuerte y algún contratiempo; en batalla, corcheas suaves
    if (pos === 0) PERC[P.perc](t, .06 + mus.inten * .04, true, musBus);
    else if (pos === 4 && (bar % 2 || I)) PERC[P.perc](t, .035 + mus.inten * .02, false, musBus);
    else if (I && pos % 2 === 0) PERC[P.perc](t, .025, false, musBus);
    if (I && (pos === 0 || pos === 3 || pos === 6)) bass(t, N2F(mus.chord[0] - 24), spe * 1.5, .03);   // ostinato
    // melodía: compases 0-7 (A A' B A); 8-15 respiro, con un eco breve del otro instrumento
    const ph = bar >> 1, inPh = (bar % 2) * 8 + pos;
    if (bar < 8) {
      const [r, line] = ph === 2 ? [M.r2, M.b] : [M.r, ph === 1 ? M.a2 : M.a], k = r.findIndex(x => x[0] === inPh);
      if (k >= 0) { const n = deg(P, mus.d + line[k]); INSTR[P.leads[M.lead]](t, N2F(n), spe * r[k][1] * .95, .9); }
    } else if (bar === 12 && (pos === 0 || pos === 4)) INSTR[P.leads[M.lead ^ 1]](t, N2F(mus.chord[pos ? 1 : 2]), spe * 4, .55);
    mus.next += spe; mus.step++;
  }
}
