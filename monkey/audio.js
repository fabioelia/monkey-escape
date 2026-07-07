// Procedural sound effects via WebAudio — no asset files needed.
// Call resume() from a user gesture (the play click) to unlock audio.

let ctx = null;
let muted = false;
let master = null;
let baseVol = 0.5; // user volume setting [0..1] (scaled)

function ensure() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = baseVol;
  master.connect(ctx.destination);
}

export function resume() {
  ensure();
  if (ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : baseVol;
  return muted;
}

// v in [0..1] from the settings slider.
export function setVolume(v) {
  baseVol = 0.7 * v;
  if (master && !muted) master.gain.value = baseVol;
}
export function isMuted() { return muted; }

// One enveloped oscillator note.
function note(freq, t0, dur, { type = 'sine', gain = 0.3, slideTo = null, attack = 0.005 } = {}) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

// Short noise burst (thuds, growls).
function noise(t0, dur, { gain = 0.3, freq = 800, q = 1 } = {}) {
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = freq; filt.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t0);
}

function safe(fn) { return () => { if (!ctx || muted) return; try { fn(ctx.currentTime); } catch (_) {} }; }

export const sfx = {
  jump:   safe((t) => note(330, t, 0.16, { type: 'square', gain: 0.18, slideTo: 620 })),
  land:   safe((t) => noise(t, 0.12, { gain: 0.25, freq: 350 })),
  collect: safe((t) => { note(880, t, 0.09, { type: 'triangle', gain: 0.22 }); note(1320, t + 0.07, 0.12, { type: 'triangle', gain: 0.22 }); }),
  bounce: safe((t) => note(180, t, 0.28, { type: 'sine', gain: 0.3, slideTo: 900 })),
  caught: safe((t) => { noise(t, 0.3, { gain: 0.35, freq: 600, q: 4 }); note(300, t, 0.35, { type: 'sawtooth', gain: 0.2, slideTo: 90 }); }),
  clear:  safe((t) => [523, 659, 784, 1046].forEach((f, i) => note(f, t + i * 0.1, 0.22, { type: 'triangle', gain: 0.22 }))),
  win:    safe((t) => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => note(f, t + i * 0.12, 0.3, { type: 'triangle', gain: 0.24 }))),
  step:   safe((t) => noise(t, 0.05, { gain: 0.06, freq: 500 })),
  near:   safe((t) => note(140, t, 0.18, { type: 'sawtooth', gain: 0.12, slideTo: 110 })),
  flip:   safe((t) => note(500, t, 0.2, { type: 'square', gain: 0.16, slideTo: 950 })),
  dash:   safe((t) => noise(t, 0.22, { gain: 0.22, freq: 2200, q: 0.6 })),
  throw:  safe((t) => note(700, t, 0.14, { type: 'triangle', gain: 0.18, slideTo: 300 })),
  stun:   safe((t) => { noise(t, 0.25, { gain: 0.3, freq: 900, q: 3 }); note(420, t, 0.25, { type: 'square', gain: 0.16, slideTo: 140 }); }),
  roar:   safe((t) => { noise(t, 0.5, { gain: 0.4, freq: 500, q: 6 }); note(150, t, 0.5, { type: 'sawtooth', gain: 0.28, slideTo: 70 }); note(90, t + 0.05, 0.45, { type: 'square', gain: 0.18, slideTo: 55 }); }),
  grab:   safe((t) => note(600, t, 0.12, { type: 'sine', gain: 0.16, slideTo: 280 })),
};

// ---------------------------------------------------------------------------
// Background music — a looping pentatonic jungle groove that intensifies
// (adds a driving kick + harmony) while the chimp is actively chasing.
// ---------------------------------------------------------------------------
let musicTimer = null, musicGain = null, step = 0, nextTime = 0, intense = false;
const BPM = 108;
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]; // C major pentatonic
const MELODY = [0, 2, 4, 3, -1, 4, 2, 0, 3, -1, 2, 4, 5, 4, 2, -1];
const BASS = [65.41, 65.41, 87.31, 98.0]; // C C F G

function mNote(freq, time, dur, type, gain) {
  if (!musicGain) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, time);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(g); g.connect(musicGain); o.start(time); o.stop(time + dur + 0.02);
}
function mShaker(time) {
  if (!musicGain) return;
  const n = Math.floor(ctx.sampleRate * 0.03), buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
  const g = ctx.createGain(); g.gain.value = 0.03;
  src.connect(f); f.connect(g); g.connect(musicGain); src.start(time);
}
function scheduleStep(s, time, dur) {
  const i = s % 16;
  const idx = MELODY[i];
  if (idx >= 0) mNote(SCALE[idx], time, dur * 0.9, 'triangle', 0.11);
  if (i % 4 === 0) mNote(BASS[Math.floor(s / 4) % 4], time, dur * 1.8, 'sine', 0.16);
  mShaker(time);
  if (intense) {
    if (i % 2 === 0) mNote(72, time, dur * 0.9, 'sine', 0.22);          // driving kick
    if (idx >= 0) mNote(SCALE[idx] * 2, time, dur * 0.55, 'triangle', 0.05); // octave harmony
  }
}
function scheduler() {
  if (!ctx) return;
  const dur = (60 / BPM) / 2; // eighth notes
  while (nextTime < ctx.currentTime + 0.12) {
    scheduleStep(step, nextTime, dur);
    nextTime += dur; step++;
  }
}

export function startMusic() {
  ensure();
  if (musicTimer) return;
  musicGain = ctx.createGain();
  musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2);
  musicGain.connect(master);
  step = 0; nextTime = ctx.currentTime + 0.1;
  musicTimer = setInterval(scheduler, 25);
}
export function setMusicIntensity(on) { intense = !!on; }
