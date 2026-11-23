// Sonido y música sintetizados con WebAudio.
import * as THREE from 'three';
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
// cuerno de guerra / metales: sierras desafinadas con un filtro que se abre al soplar
function horn(t, f, dur, gain = .07, bus = sfxBus) {
  const g = ac.createGain(), fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 2;
  fl.frequency.setValueAtTime(300, t); fl.frequency.linearRampToValueAtTime(f * 6, t + .12); fl.frequency.linearRampToValueAtTime(f * 3.5, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .09); g.gain.setValueAtTime(gain, t + dur - .12); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .25);
  const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5; vg.gain.value = f * .006; vib.connect(vg);
  for (const d of [-7, 6]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; vg.connect(o.frequency); o.connect(fl); o.start(t); o.stop(t + dur + .3); }
  vib.start(t); vib.stop(t + dur + .3); fl.connect(g); out(g, bus, .45);
}
// tambor de marco: golpe grave con caída de tono + parche
function drum(t, gain = .25, low = 1, bus = sfxBus) { tone(t, 110 * low, .28, { gain, f2: 48 * low, bus, wet: .2 }); noise(t, .09, { type: 'lowpass', f: 700, gain: gain * .5, bus, wet: .15 }); }
// choque de espadas: parciales metálicas inarmónicas + chasquido
function clash(t, gain = .05) {
  const f = 900 + Math.random() * 900;
  for (const [r, k] of [[1, 1], [1.47, .7], [2.09, .5], [2.76, .35], [3.9, .2]]) tone(t, f * r, .18 + Math.random() * .12, { gain: gain * k, a: .001, wet: .3 });
  noise(t, .05, { type: 'highpass', f: 2500, gain: gain * 2.2, a: .001 });
}
const N2F = n => 440 * Math.pow(2, (n - 69) / 12);
export function sfx(kind) {
  if (!S.soundOn || !audio()) return;
  if (ac.state === 'suspended') ac.resume();
  const t = ac.currentTime; if (lastSfx[kind] && t - lastSfx[kind] < (kind === 'hit' ? .06 : kind === 'arrow' ? .09 : .07)) return; lastSfx[kind] = t;
  switch (kind) {
    case 'hit': clash(t); break;
    case 'arrow': noise(t, .2, { f: 2600, f2: 500, q: 3, gain: .07, wet: .1 }); break;
    case 'die': noise(t, .22, { type: 'lowpass', f: 380, gain: .2 }); tone(t + .02, 170, .32, { type: 'sawtooth', gain: .035, f2: 95, lp: 700 }); break;
    case 'select': noise(t, .035, { f: 1700, q: 5, gain: .16, wet: .1 }); tone(t, 520, .06, { gain: .04, wet: .1 }); break;
    case 'cmd': drum(t, .12, 1.4); noise(t + .05, .06, { f: 900, q: 2, gain: .07 }); break;
    case 'deny': tone(t, 95, .12, { gain: .12, f2: 70 }); noise(t, .05, { type: 'lowpass', f: 500, gain: .08 }); break;
    case 'ready': horn(t, N2F(57), .28, .035); break;
    case 'alarm': horn(t, N2F(45), .7, .08); horn(t + .85, N2F(45), .7, .08); horn(t + .85, N2F(52), .7, .05); break;
    case 'capture': drum(t, .22); drum(t + .18, .18); [62, 66, 69, 74].forEach((n, i) => horn(t + .1 + i * .16, N2F(n), .35 + (i === 3 ? .5 : 0), .055)); break;
    case 'lost': [57, 53, 50].forEach((n, i) => horn(t + i * .4, N2F(n), .55, .06)); drum(t, .2, .8); break;
    case 'win': for (let i = 0; i < 6; i++) drum(t + i * .2, .2 + (i % 2) * .1); [62, 66, 69, 74, 78].forEach((n, i) => horn(t + .3 + i * .22, N2F(n), .4 + (i === 4 ? 1 : 0), .06)); break;
    case 'charge': [55, 59, 62].forEach((n, i) => horn(t + i * .1, N2F(n), .2 + (i === 2 ? .4 : 0), .06)); for (let i = 0; i < 6; i++) drum(t + i * .07, .1 + i * .02); break;
    case 'hero': drum(t, .25); [50, 57, 62, 69].forEach((n, i) => horn(t + .12 + i * .2, N2F(n), .4 + (i === 3 ? .6 : 0), .06)); break;
    case 'rank': for (const [r, k] of [[1, 1], [2.76, .4], [5.4, .2]]) tone(t, 880 * r, 1.1, { gain: .05 * k, a: .002, wet: .5 }); break;
  }
}
// Música: bordón grave, tambor de marco y una melodía modal (dórico de re) que alterna flauta y lira; con combate cerca, los tambores se aceleran
const MODE = [62, 64, 65, 67, 69, 71, 72, 74];   // re dórico
let mus = null;
export function startMusic() {
  if (!audio() || mus) return;
  if (ac.state === 'suspended') ac.resume();
  const t = ac.currentTime; musBus.gain.setValueAtTime(0, t); musBus.gain.linearRampToValueAtTime(.55, t + 4);
  const pad = ac.createGain(); pad.gain.value = .05; const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 320; fl.Q.value = .7;
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = .07; lg.gain.value = 120; lfo.connect(lg).connect(fl.frequency); lfo.start();
  for (const [f, d] of [[N2F(38), -5], [N2F(38), 6], [N2F(45), 0], [N2F(50), 3]]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(fl); o.start(); }
  fl.connect(pad); out(pad, musBus, .5);
  mus = { next: t + .5, beat: 0, note: 3 };
  setInterval(scheduleMusic, 100);
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
function scheduleMusic() {
  if (!mus || !S.soundOn) return;
  const battle = state === 'play' && elapsed - lastCombat < 6, bpm = battle ? 112 : 76, spb = 60 / bpm;
  musBus.gain.setTargetAtTime(state === 'play' && S.paused ? .2 : battle ? .7 : .5, ac.currentTime, 1.5);
  while (mus.next < ac.currentTime + .25) {
    const t = mus.next, b = mus.beat % 16;
    if (battle) { drum(t, b % 4 === 0 ? .2 : .11, b % 4 === 0 ? .9 : 1.25, musBus); if (b % 8 === 6) drum(t + spb / 2, .1, 1.25, musBus); }
    else if (b % 4 === 0 || b === 14) drum(t, b === 0 ? .14 : .08, .85, musBus);
    // melodía: frases de 8 tiempos con un descanso de 8; paso a paso por el modo
    if (b < 8 && (b % 2 === 0 || Math.random() < .3)) {
      mus.note = THREE.MathUtils.clamp(mus.note + [-2, -1, -1, 1, 1, 2, 0][Math.random() * 7 | 0], 0, MODE.length - 1);
      const f = N2F(MODE[mus.note] - (battle ? 12 : 0)), dur = spb * (b % 4 === 0 ? 1.8 : .95);
      if ((mus.beat >> 4) % 2 && !battle) lyre(t, f); else flute(t, f, dur);
    }
    if (battle && b === 0) horn(t, N2F(38), spb * 3, .03, musBus);
    mus.next += spb; mus.beat++;
  }
}
