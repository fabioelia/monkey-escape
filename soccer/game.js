// Pixel Pitch v2 — 1v1 pixel soccer.
// Modes: online host/guest (host-authoritative sim, guest streams inputs),
// local 2P (one keyboard), vs AI, and spectate (state-only viewers).

/* ================= Constants ================= */

const W = 384, H = 216;            // logical pixels
const FIELD = { x0: 10, y0: 26, x1: 374, y1: 206 };
const GOAL = { y0: 86, y1: 146 };  // goal mouth vertical span
const DRIBBLE_DIST = 8;
const WIN_SCORE = 5;
const MATCH_TIME = 120;            // timed mode, seconds
const SPRINT_MULT = 1.45;
const STAMINA_DRAIN = 30, STAMINA_REGEN = 18;
const CHARGE_MAX = 0.8;            // seconds of shot charge
const KEEPER_RADIUS = 5;
const PAUSE_GRACE = 20;            // seconds to wait for a reconnect
const EMOTES = ['GG 🤝', 'SIUUU 🔥', 'LUCKY 🍀', 'OLÉ 😎'];

/* ================= DOM ================= */

const $ = id => document.getElementById(id);
const screens = {
  menu: $('screen-menu'), select: $('screen-select'),
  lobby: $('screen-lobby'), over: $('screen-over'),
};
const gameWrap = $('gameWrap');
const canvas = $('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle('active', k === name);
  gameWrap.classList.toggle('active', name === 'game');
  const touchUI = $('touchUI');
  if (touchUI) touchUI.classList.toggle('on', name === 'game' && IS_TOUCH);
}

function fitCanvas() {
  // integer scale for crisp pixels; fractional below 1x so phones still fit
  const s = Math.min(innerWidth / W, innerHeight / H);
  const scale = s >= 1 ? Math.floor(s) : s;
  canvas.style.width = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
}
addEventListener('resize', fitCanvas);
fitCanvas();

/* ================= Audio ================= */

let AC = null;
function beep(freq, dur, type = 'square', vol = 0.04) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g).connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  } catch (e) { /* audio unavailable */ }
}

function unlockAudio() {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (e) { /* audio unavailable */ }
}
addEventListener('touchstart', unlockAudio, { once: true });
addEventListener('keydown', unlockAudio, { once: true });

function cheerNoise(dur = 0.9) {  // white-noise crowd roar
  try {
    unlockAudio();
    const n = Math.floor(AC.sampleRate * dur);
    const buf = AC.createBuffer(1, n, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = AC.createBufferSource(); src.buffer = buf;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    const g = AC.createGain(); g.gain.value = 0.12;
    src.connect(lp).connect(g).connect(AC.destination);
    src.start();
  } catch (e) { /* audio unavailable */ }
}

const sfx = {
  kick:   () => beep(220, 0.09),
  steal:  () => beep(140, 0.12, 'sawtooth'),
  bounce: () => beep(330, 0.05, 'square', 0.03),
  pickup: () => beep(520, 0.05, 'square', 0.025),
  power:  () => { beep(660, 0.07); setTimeout(() => beep(990, 0.09), 70); },
  save:   () => beep(180, 0.1, 'sawtooth', 0.035),
  tick:   () => beep(660, 0.07, 'square', 0.03),
  goal:   () => { cheerNoise(); beep(523, 0.12); setTimeout(() => beep(659, 0.12), 120); setTimeout(() => beep(784, 0.25), 240); },
  whistle: () => beep(1900, 0.35, 'square', 0.03),
  win:    () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.16), i * 140)),
  lose:   () => [392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.03), i * 180)),
};
const fxSounds = [sfx.kick, sfx.steal, sfx.bounce, sfx.pickup, sfx.power, sfx.save];

/* ================= Game state ================= */

const game = {
  mode: null,              // 'host' | 'guest' | 'local' | 'ai' | 'spectate'
  phase: 'idle',           // idle | countdown | play | goal | replay | paused | end
  phaseT: 0,
  score: [0, 0],
  scorer: 0,
  clock: MATCH_TIME,
  gg: false,               // golden goal active
  settings: { timed: false },
  myChar: null,
  chars: [null, null],
  winner: 0,
  rematchLocal: false,
  rematchRemote: false,
  players: [null, null],
  keepers: [{ y: 116 }, { y: 116 }],
  ball: null,
  pu: null,                // power-up on the field {x,y,type,ttl}
  puTimer: 8,
  pauseT: 0,
  fx: [0, 0, 0, 0, 0, 0],  // event counters: kick, steal, bounce, pickup, power, save
  bubbles: [null, null],   // speech bubbles per player {text, t}
  replayBuf: [],
  replayT: 0,
};

function simulating() { return game.mode === 'host' || game.mode === 'local' || game.mode === 'ai'; }
function myIndex() { return game.mode === 'guest' ? 1 : 0; }

function makePlayer(i) {
  return {
    x: i === 0 ? 100 : 284, y: 116,
    fx: i === 0 ? 1 : -1, fy: 0,
    stun: 0, stealCd: 0, pickupCd: 0,
    anim: 0, moving: false,
    st: 100, charge: -1, boost: 0, frozen: 0,
  };
}

function resetKickoff() {
  const keep = game.players[0] ? game.players.map(p => p.st) : [100, 100];
  game.players[0] = makePlayer(0); game.players[0].st = Math.min(100, keep[0] + 25);
  game.players[1] = makePlayer(1); game.players[1].st = Math.min(100, keep[1] + 25);
  game.keepers = [{ y: 116 }, { y: 116 }];
  game.ball = { x: W / 2, y: 126, vx: 0, vy: 0, owner: -1 };  // 126 = feet level
  game.replayBuf = [];
}

function startMatch() {
  if (!game.mode) game.mode = NET.isHost ? 'host' : 'guest';
  game.score = [0, 0];
  game.fx = [0, 0, 0, 0, 0, 0];
  lastFx = [0, 0, 0, 0, 0, 0];
  game.winner = 0;
  game.gg = false;
  game.clock = MATCH_TIME;
  game.pu = null;
  game.puTimer = 8;
  game.bubbles = [null, null];
  game.rematchLocal = game.rematchRemote = false;
  game.players = [null, null];
  resetKickoff();
  game.phase = 'countdown';
  game.phaseT = 3;
  showScreen('game');
  fitCanvas();
}

/* ================= Records (localStorage) ================= */

const REC_KEY = 'pixel-pitch-record';
function loadRecords() {
  try { return JSON.parse(localStorage.getItem(REC_KEY)) || {}; } catch (e) { return {}; }
}
function recordResult(charId, won) {
  try {
    const r = loadRecords();
    r[charId] = r[charId] || { w: 0, l: 0 };
    won ? r[charId].w++ : r[charId].l++;
    localStorage.setItem(REC_KEY, JSON.stringify(r));
  } catch (e) { /* storage unavailable */ }
  refreshRecords();
}

/* ================= Input ================= */

const keys = {};
const touchMove = { up: 0, down: 0, left: 0, right: 0, sprint: 0 };

// key maps per player slot
function moveSingle() {   // online / vs AI: arrows + wasd + touch
  return {
    up:    (keys['ArrowUp'] || keys['KeyW'] || touchMove.up) ? 1 : 0,
    down:  (keys['ArrowDown'] || keys['KeyS'] || touchMove.down) ? 1 : 0,
    left:  (keys['ArrowLeft'] || keys['KeyA'] || touchMove.left) ? 1 : 0,
    right: (keys['ArrowRight'] || keys['KeyD'] || touchMove.right) ? 1 : 0,
    sprint: (keys['KeyX'] || keys['ControlLeft'] || keys['ControlRight'] || touchMove.sprint) ? 1 : 0,
  };
}
function moveP1() {       // local 2P, player 1: WASD + F sprint
  return {
    up: keys['KeyW'] ? 1 : 0, down: keys['KeyS'] ? 1 : 0,
    left: keys['KeyA'] ? 1 : 0, right: keys['KeyD'] ? 1 : 0,
    sprint: keys['KeyF'] ? 1 : 0,
  };
}
function moveP2() {       // local 2P, player 2: arrows + . sprint
  return {
    up: keys['ArrowUp'] ? 1 : 0, down: keys['ArrowDown'] ? 1 : 0,
    left: keys['ArrowLeft'] ? 1 : 0, right: keys['ArrowRight'] ? 1 : 0,
    sprint: (keys['Period'] || keys['ControlRight']) ? 1 : 0,
  };
}

// Remote (guest) input as seen by the host
const remoteInput = { up: 0, down: 0, left: 0, right: 0, sprint: 0 };
const remoteActions = [];   // queued action strings from the guest / AI

function dispatchAction(action) {
  // action by the LOCAL player ('steal' | 'shootStart' | 'shootEnd')
  if (game.mode === 'guest') NET.send({ t: 'press', a: action });
  else if (simulating()) applyAction(0, action);
}

addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  const active = ['play', 'countdown'].includes(game.phase);
  if (!active) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (game.mode === 'local') {
    if (e.code === 'KeyQ') applyAction(0, 'steal');
    if (e.code === 'KeyE') applyAction(0, 'shootStart');
    if (e.code === 'Space') applyAction(1, 'steal');
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') applyAction(1, 'shootStart');
  } else if (game.mode !== 'spectate') {
    if (e.code === 'Space') dispatchAction('steal');
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') dispatchAction('shootStart');
    if (/^Digit[1-4]$/.test(e.code) && (game.mode === 'host' || game.mode === 'guest')) {
      sendEmote(Number(e.code[5]) - 1);
    }
  }
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (game.mode === 'local') {
    if (e.code === 'KeyE') applyAction(0, 'shootEnd');
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') applyAction(1, 'shootEnd');
  } else if (game.mode !== 'spectate') {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') dispatchAction('shootEnd');
  }
});

/* ---- touch controls ---- */

if (IS_TOUCH) {
  const stick = $('stick'), nub = $('nub');
  const setStick = (dx, dy) => {
    const m = Math.hypot(dx, dy);
    if (m > 42) { dx *= 42 / m; dy *= 42 / m; }
    nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const t = 12;
    touchMove.left = dx < -t ? 1 : 0; touchMove.right = dx > t ? 1 : 0;
    touchMove.up = dy < -t ? 1 : 0;   touchMove.down = dy > t ? 1 : 0;
  };
  const stickHandler = e => {
    e.preventDefault();
    const r = stick.getBoundingClientRect();
    const t = e.targetTouches[0];
    if (!t) return;
    setStick(t.clientX - (r.left + r.width / 2), t.clientY - (r.top + r.height / 2));
  };
  stick.addEventListener('touchstart', stickHandler, { passive: false });
  stick.addEventListener('touchmove', stickHandler, { passive: false });
  const stickReset = e => { e.preventDefault(); setStick(0, 0); };
  stick.addEventListener('touchend', stickReset, { passive: false });
  stick.addEventListener('touchcancel', stickReset, { passive: false });

  const hold = (id, on, off) => {
    $(id).addEventListener('touchstart', e => { e.preventDefault(); unlockAudio(); on(); }, { passive: false });
    if (off) {
      $(id).addEventListener('touchend', e => { e.preventDefault(); off(); }, { passive: false });
      $(id).addEventListener('touchcancel', e => { e.preventDefault(); off(); }, { passive: false });
    }
  };
  hold('tSteal', () => dispatchAction('steal'));
  hold('tShoot', () => dispatchAction('shootStart'), () => dispatchAction('shootEnd'));
  hold('tSprint', () => { touchMove.sprint = 1; }, () => { touchMove.sprint = 0; });
  document.querySelectorAll('.ebtn').forEach(b => {
    b.addEventListener('touchstart', e => {
      e.preventDefault();
      if (game.mode === 'host' || game.mode === 'guest') sendEmote(Number(b.dataset.emote));
    }, { passive: false });
  });
}

/* ================= Emotes & bubbles ================= */

function showBubble(pi, text) {
  game.bubbles[pi] = { text, t: 2.5 };
}

function sendEmote(i) {
  const me = myIndex();
  showBubble(me, EMOTES[i]);
  if (game.mode === 'guest') NET.send({ t: 'emote', i });
  else if (game.mode === 'host') NET.broadcast({ t: 'emote', i, from: 0 });
}

/* ================= Simulation ================= */

function applyAction(pi, action) {
  if (game.phase !== 'play') return;
  const p = game.players[pi], b = game.ball, o = game.players[1 - pi];
  const ch = getCharacter(game.chars[pi]);
  if (!p || p.stun > 0) return;
  if (action === 'steal') {
    if (p.stealCd > 0) return;
    p.stealCd = 0.5;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < ch.tkl && b.owner !== pi) {
      if (b.owner === 1 - pi) {
        o.stun = 0.45; o.charge = -1;
        sfx.steal(); game.fx[1]++;
        spawnDust(b.x, b.y);
      }
      b.owner = pi;
      p.pickupCd = 0;
    }
  } else if (action === 'shootStart') {
    if (b.owner === pi && p.charge < 0) p.charge = 0;
  } else if (action === 'shootEnd') {
    if (p.charge < 0 || b.owner !== pi) { p.charge = -1; return; }
    let dx = p.fx, dy = p.fy;
    if (dx === 0 && dy === 0) dx = pi === 0 ? 1 : -1;
    const n = Math.hypot(dx, dy) || 1;
    const power = ch.shot * (0.65 + 0.75 * Math.min(p.charge, CHARGE_MAX) / CHARGE_MAX);
    b.owner = -1;
    b.vx = (dx / n) * power;
    b.vy = (dy / n) * power;
    p.pickupCd = 0.35;
    p.charge = -1;
    sfx.kick(); game.fx[0]++;
  }
}

function movePlayer(pi, input, dt) {
  const p = game.players[pi];
  const ch = getCharacter(game.chars[pi]);
  p.moving = false;
  p.boost = Math.max(0, p.boost - dt);
  p.frozen = Math.max(0, p.frozen - dt);
  p.stealCd = Math.max(0, p.stealCd - dt);
  p.pickupCd = Math.max(0, p.pickupCd - dt);
  if (p.charge >= 0) {
    p.charge = Math.min(CHARGE_MAX + 0.1, p.charge + dt);
    if (game.ball.owner !== pi) p.charge = -1;   // lost the ball mid-charge
  }
  if (p.stun > 0) { p.stun -= dt; return; }
  let dx = input.right - input.left;
  let dy = input.down - input.up;
  const wantSprint = input.sprint && p.st > 1 && (dx || dy);
  if (wantSprint) p.st = Math.max(0, p.st - STAMINA_DRAIN * dt);
  else p.st = Math.min(100, p.st + STAMINA_REGEN * dt);
  if (dx || dy) {
    const n = Math.hypot(dx, dy);
    dx /= n; dy /= n;
    let speed = ch.spd;
    if (wantSprint) speed *= SPRINT_MULT;
    if (p.boost > 0) speed *= 1.4;
    if (p.frozen > 0) speed *= 0.45;
    if (p.charge >= 0) speed *= 0.6;
    p.x += dx * speed * dt;
    p.y += dy * speed * dt;
    p.fx = dx; p.fy = dy;
    p.moving = true;
    p.anim += dt * 10;
  }
  p.x = Math.max(FIELD.x0 + 4, Math.min(FIELD.x1 - 4, p.x));
  p.y = Math.max(FIELD.y0 + 6, Math.min(FIELD.y1 - 2, p.y));
}

function stepKeeper(i, dt) {
  const kp = game.keepers[i];
  const kx = i === 0 ? FIELD.x0 + 8 : FIELD.x1 - 8;
  const b = game.ball;
  const incoming = b.owner < 0 && (i === 0 ? b.vx < -60 : b.vx > 60);
  const near = Math.abs(b.x - kx) < 130;
  const target = near ? b.y : 116;
  const spd = incoming ? 150 : 55;
  kp.y += Math.max(-spd * dt, Math.min(spd * dt, target - kp.y));
  kp.y = Math.max(GOAL.y0 + 10, Math.min(GOAL.y1 - 10, kp.y));
  if (Math.hypot(b.x - kx, b.y - kp.y) < KEEPER_RADIUS + 2) {
    if (b.owner >= 0) {
      // strip a dribbler who walks into the keeper
      game.players[b.owner].pickupCd = 0.5;
      game.players[b.owner].charge = -1;
      b.owner = -1;
      b.vx = (i === 0 ? 1 : -1) * 150;
      b.vy = (Math.random() - 0.5) * 120;
      sfx.save(); game.fx[5]++;
    } else if (Math.abs(b.vx) > 30 && (i === 0 ? b.vx < 0 : b.vx > 0)) {
      b.vx = (i === 0 ? 1 : -1) * (Math.abs(b.vx) * 0.55 + 40);
      b.vy = (b.y - kp.y) * 10 + (Math.random() - 0.5) * 60;
      sfx.save(); game.fx[5]++;
    }
  }
}

function stepPowerups(dt) {
  for (const p of game.players) { /* effect timers handled in movePlayer */ }
  if (game.pu) {
    game.pu.ttl -= dt;
    if (game.pu.ttl <= 0) { game.pu = null; return; }
    for (let i = 0; i < 2; i++) {
      const p = game.players[i];
      if (Math.hypot(game.pu.x - p.x, game.pu.y - (p.y + 8)) < 10) {
        if (game.pu.type === 0) p.boost = 5;             // bolt: speed boost
        else game.players[1 - i].frozen = 2.5;           // freeze: slow the opponent
        sfx.power(); game.fx[4]++;
        game.pu = null;
        break;
      }
    }
  } else {
    game.puTimer -= dt;
    if (game.puTimer <= 0) {
      game.pu = {
        x: 130 + Math.random() * 124,
        y: 66 + Math.random() * 110,
        type: Math.random() < 0.5 ? 0 : 1,
        ttl: 9,
      };
      game.puTimer = 12 + Math.random() * 6;
    }
  }
}

function inputFor(pi) {
  if (game.mode === 'local') return pi === 0 ? moveP1() : moveP2();
  if (pi === 0) return moveSingle();
  return game.mode === 'ai' ? aiThink() : remoteInput;
}

function matchOverBy() {
  if (!game.settings.timed) return game.score[0] >= WIN_SCORE || game.score[1] >= WIN_SCORE;
  return game.gg;   // in timed mode a goal ends it only during golden goal
}

function scoreGoal(scorer) {
  game.score[scorer]++;
  game.scorer = scorer;
  game.phase = 'goal';
  game.phaseT = 2.4;
  showBubble(scorer, getCharacter(game.chars[scorer]).cheer);
  spawnConfetti(scorer);
  shakeT = 0.5;
  sfx.goal();
}

function endMatch(winner) {
  game.winner = winner;
  game.phase = 'end';
  if (game.mode === 'host') NET.broadcast({ t: 'end', winner, score: game.score });
  enterOver();
}

function simulate(dt) {
  game.phaseT -= dt;

  if (game.phase === 'countdown' && game.phaseT <= 0) {
    game.phase = 'play';
    sfx.whistle();
  }

  if (game.phase === 'goal' && game.phaseT <= 0) {
    if (game.replayBuf.length > 10) {
      game.phase = 'replay';
      game.replayT = 0;
    } else {
      afterGoal();
    }
  }

  if (game.phase === 'replay') {
    game.replayT += dt;
    const idx = Math.floor(game.replayT * 15);   // half-speed playback of 30fps snaps
    const buf = game.replayBuf;
    if (idx >= buf.length) { afterGoal(); }
    else {
      const s = buf[idx];
      for (let i = 0; i < 2; i++) {
        const p = game.players[i], src = s.p[i];
        p.x = src[0]; p.y = src[1]; p.fx = src[2]; p.fy = src[3];
        p.moving = !!src[4]; p.anim = src[5];
      }
      game.ball.x = s.b[0]; game.ball.y = s.b[1]; game.ball.owner = -1;
      game.keepers[0].y = s.k[0]; game.keepers[1].y = s.k[1];
    }
    return;
  }

  if (game.phase === 'paused') {
    game.pauseT -= dt;
    if (game.pauseT <= 0) {
      const lead = game.score[0] > game.score[1] ? 1 : game.score[1] > game.score[0] ? 2 : 0;
      endMatch(lead);
    }
    return;
  }

  if (game.phase !== 'play' && game.phase !== 'countdown') return;

  // match clock (timed mode)
  if (game.settings.timed && game.phase === 'play' && !game.gg) {
    game.clock -= dt;
    if (game.clock <= 0) {
      game.clock = 0;
      if (game.score[0] !== game.score[1]) {
        return endMatch(game.score[0] > game.score[1] ? 1 : 2);
      }
      game.gg = true;
      sfx.whistle();
    }
  }

  // players
  movePlayer(0, inputFor(0), dt);
  movePlayer(1, inputFor(1), dt);
  while (remoteActions.length) applyAction(1, remoteActions.shift());
  if (aiRelease > 0) {
    aiRelease -= dt;
    if (aiRelease <= 0) applyAction(1, 'shootEnd');
  }

  // separate overlapping players
  const [a, b] = game.players;
  const pd = Math.hypot(a.x - b.x, a.y - b.y);
  if (pd > 0 && pd < 9) {
    const push = (9 - pd) / 2, nx = (a.x - b.x) / pd, ny = (a.y - b.y) / pd;
    a.x += nx * push; a.y += ny * push;
    b.x -= nx * push; b.y -= ny * push;
  }

  if (game.phase !== 'play') return;

  stepKeeper(0, dt);
  stepKeeper(1, dt);
  stepPowerups(dt);

  // ball
  const ball = game.ball;
  if (ball.owner >= 0) {
    const p = game.players[ball.owner];
    ball.x = p.x + p.fx * DRIBBLE_DIST;
    ball.y = p.y + p.fy * DRIBBLE_DIST + 10;
    ball.vx = ball.vy = 0;
  } else {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const f = Math.pow(0.35, dt);
    ball.vx *= f; ball.vy *= f;
    const thud = () => { if (Math.hypot(ball.vx, ball.vy) > 40) { sfx.bounce(); game.fx[2]++; } };
    if (ball.y < FIELD.y0 + 2) { ball.y = FIELD.y0 + 2; ball.vy *= -0.8; thud(); }
    if (ball.y > FIELD.y1 - 2) { ball.y = FIELD.y1 - 2; ball.vy *= -0.8; thud(); }
    const inMouth = ball.y > GOAL.y0 && ball.y < GOAL.y1;
    if (ball.x < FIELD.x0 + 2) {
      if (inMouth) return scoreGoal(1);
      ball.x = FIELD.x0 + 2; ball.vx *= -0.8; thud();
    }
    if (ball.x > FIELD.x1 - 2) {
      if (inMouth) return scoreGoal(0);
      ball.x = FIELD.x1 - 2; ball.vx *= -0.8; thud();
    }
    for (let i = 0; i < 2; i++) {
      const p = game.players[i];
      const ch = getCharacter(game.chars[i]);
      if (p.pickupCd > 0 || p.stun > 0) continue;
      if (Math.hypot(ball.x - p.x, ball.y - (p.y + 10)) < ch.ctl) {
        ball.owner = i; sfx.pickup(); game.fx[3]++; break;
      }
    }
  }

  // replay ring buffer (~2.5s at 30fps)
  recFrame = !recFrame;
  if (recFrame) {
    game.replayBuf.push({
      p: game.players.map(p => [p.x, p.y, p.fx, p.fy, p.moving ? 1 : 0, p.anim]),
      b: [ball.x, ball.y],
      k: [game.keepers[0].y, game.keepers[1].y],
    });
    if (game.replayBuf.length > 75) game.replayBuf.shift();
  }
}
let recFrame = false;

function afterGoal() {
  if (matchOverBy()) {
    endMatch(game.score[0] > game.score[1] ? 1 : 2);
  } else {
    resetKickoff();
    game.phase = 'countdown';
    game.phaseT = 2;
  }
}

/* ================= AI opponent ================= */

const ai = { t: 0, move: { up: 0, down: 0, left: 0, right: 0, sprint: 0 }, aimY: 116 };
let aiRelease = 0;

function aiThink() {
  return ai.move;
}

function aiStep(dt) {
  if (game.mode !== 'ai' || game.phase !== 'play') return;
  const me = game.players[1], opp = game.players[0], b = game.ball;
  ai.t -= dt;
  if (ai.t > 0) return;
  ai.t = 0.12;
  let tx, ty, sprint = 0;
  if (b.owner === 1) {
    // attack the LEFT goal, aim at whichever corner is farther from the keeper
    ai.aimY = game.keepers[0].y > 116 ? GOAL.y0 + 4 : GOAL.y1 - 4;
    tx = FIELD.x0 + 26; ty = ai.aimY - 10;   // dribble offset puts the ball at aimY
    sprint = me.st > 35 && me.x > 180 ? 1 : 0;
    if (me.x < 175 && Math.abs((me.y + 10) - ai.aimY) < 10 && me.charge < 0 && aiRelease <= 0) {
      me.fx = -1; me.fy = 0;
      applyAction(1, 'shootStart');
      aiRelease = 0.3 + Math.random() * 0.35;
    }
  } else if (b.owner === 0) {
    tx = opp.x + opp.fx * 12; ty = opp.y + opp.fy * 12;
    sprint = me.st > 30 ? 1 : 0;
    const ch = getCharacter(game.chars[1]);
    if (Math.hypot(b.x - me.x, b.y - me.y) < ch.tkl * 0.9 && me.stealCd <= 0 && Math.random() < 0.7) {
      remoteActions.push('steal');
    }
  } else {
    tx = b.x; ty = b.y - 10;
    sprint = me.st > 25 && Math.hypot(b.x - me.x, b.y - me.y) > 60 ? 1 : 0;
    // grab loose power-ups when they're close by
    if (game.pu && Math.hypot(game.pu.x - me.x, game.pu.y - me.y) < 70) { tx = game.pu.x; ty = game.pu.y - 8; }
  }
  const dx = tx - me.x, dy = ty - me.y;
  ai.move = {
    left: dx < -3 ? 1 : 0, right: dx > 3 ? 1 : 0,
    up: dy < -3 ? 1 : 0, down: dy > 3 ? 1 : 0,
    sprint,
  };
}

/* ================= Networking glue ================= */

let netStatusEl = $('lobbyStatus');
let lastFx = [0, 0, 0, 0, 0, 0];
let guestState = null;
let rejoinTimer = null;

function stateMsg() {
  const p = game.players, b = game.ball;
  const enc = q => [q.x, q.y, q.fx, q.fy, q.moving ? 1 : 0, q.anim, q.stun, q.st, q.boost, q.frozen, q.charge];
  return {
    t: 'state',
    ph: game.phase, pt: Math.max(0, game.phaseT), s: game.score,
    tm: game.clock, gg: game.gg ? 1 : 0, sc: game.scorer,
    p1: enc(p[0]), p2: enc(p[1]),
    b: [b.x, b.y, b.owner],
    kp: [game.keepers[0].y, game.keepers[1].y],
    pu: game.pu ? [game.pu.x, game.pu.y, game.pu.type] : 0,
    f: game.fx,
  };
}

function applyGuestState(m) {
  const prevPhase = game.phase;
  game.phase = m.ph; game.phaseT = m.pt; game.score = m.s;
  game.clock = m.tm; game.gg = !!m.gg; game.scorer = m.sc;
  if (prevPhase !== 'goal' && m.ph === 'goal') {
    sfx.goal();
    showBubble(m.sc, getCharacter(game.chars[m.sc]).cheer);
    spawnConfetti(m.sc);
    shakeT = 0.5;
  }
  if (prevPhase === 'countdown' && m.ph === 'play') sfx.whistle();
  if (m.f) {
    for (let i = 0; i < m.f.length; i++) {
      if (m.f[i] !== lastFx[i]) {
        fxSounds[i]();
        if (i === 1) spawnDust(m.b[0], m.b[1]);
      }
    }
    lastFx = m.f.slice();
  }
  guestState = m;
  if (!game.players[0]) { game.players[0] = makePlayer(0); game.players[1] = makePlayer(1); game.ball = { x: W / 2, y: 126, vx: 0, vy: 0, owner: -1 }; }
  const snap = prevPhase !== m.ph;   // don't lerp across phase jumps (kickoff, replay)
  for (let i = 0; i < 2; i++) {
    const src = i === 0 ? m.p1 : m.p2, p = game.players[i];
    p.tx = src[0]; p.ty = src[1];
    if (snap) { p.x = src[0]; p.y = src[1]; }
    p.fx = src[2]; p.fy = src[3]; p.moving = !!src[4]; p.anim = src[5]; p.stun = src[6];
    p.st = src[7]; p.boost = src[8]; p.frozen = src[9]; p.charge = src[10];
  }
  game.ball.tx = m.b[0]; game.ball.ty = m.b[1]; game.ball.owner = m.b[2];
  if (snap) { game.ball.x = m.b[0]; game.ball.y = m.b[1]; }
  game.keepers[0].y = m.kp[0]; game.keepers[1].y = m.kp[1];
  game.pu = m.pu ? { x: m.pu[0], y: m.pu[1], type: m.pu[2], ttl: 1 } : null;
}

function guestSmooth() {
  if (!guestState) return;
  const lerp = (o, k, t) => { o[k] += (t - o[k]) * 0.45; };
  for (const p of game.players) { if (p && p.tx !== undefined) { lerp(p, 'x', p.tx); lerp(p, 'y', p.ty); } }
  const b = game.ball;
  if (b && b.tx !== undefined) { lerp(b, 'x', b.tx); lerp(b, 'y', b.ty); }
}

function beginPause() {
  if (!['countdown', 'play', 'goal', 'replay'].includes(game.phase)) return false;
  game.phase = 'paused';
  game.pauseT = PAUSE_GRACE;
  return true;
}

function wireNet() {
  const RELAY_HINT = NET.hasTurn()
    ? 'Your TURN relay did not help — double-check the credentials.'
    : 'Fix: if either player is on a VPN or office network, disconnect it and reload. ' +
      'Or add a relay server: grab free TURN credentials at metered.ca and reopen the game as ' +
      '?turn=USERNAME:CREDENTIAL@standard.relay.metered.ca — the share link passes it to your opponent automatically.';
  NET.onError = err => {
    if (game.phase === 'paused') return;   // reconnect loop handles its own messaging
    const msgs = {
      'peer-unavailable': 'Could not find the match — ask the host to keep their tab open, or get a fresh link.',
      'connect-failed': 'Found each other, but no network path connects you. ' + RELAY_HINT,
      'negotiation-failed': 'Found each other, but no network path connects you. ' + RELAY_HINT,
      'unavailable-id': 'This room code is already in use — reload and pick a different code.',
      'network': 'Lost connection to the matchmaking server. Check your network and reload.',
      'browser-incompatible': 'Your browser does not support WebRTC.',
    };
    netStatusEl.textContent = msgs[err.type] || ('Connection error: ' + (err.type || err));
    netStatusEl.classList.add('err');
    netStatusEl.classList.remove('pulse');
  };
  NET.onIce = state => {
    if (game.phase !== 'idle' || netStatusEl.classList.contains('err')) return;
    if (state === 'checking') netStatusEl.textContent = 'Negotiating connection…';
    else if (state === 'failed' || state === 'disconnected') netStatusEl.textContent = 'Connection attempt failed — retrying…';
  };
  NET.onClose = () => {
    if (game.phase === 'end' || game.phase === 'idle') return;
    // hold the match open and try to get the opponent back
    if (beginPause()) {
      if (game.mode === 'guest') {
        clearInterval(rejoinTimer);
        rejoinTimer = setInterval(() => {
          if (game.phase !== 'paused') { clearInterval(rejoinTimer); return; }
          NET.rejoin();
        }, 2500);
      }
    } else {
      game.phase = 'end';
      game.winner = 0;
      enterOver('Opponent disconnected');
    }
  };
  NET.onSpectatorOpen = conn => {
    conn.send({ t: 'spectate', chars: game.chars, settings: game.settings });
  };
  NET.onData = m => {
    if (NET.isHost) {
      if (m.t === 'hello') {
        game.chars[1] = m.char;
        if (m.resume && game.phase === 'paused') {
          NET.send({ t: 'start', chars: game.chars, settings: game.settings, resume: 1 });
          game.phase = 'countdown';
          game.phaseT = 2;
        } else {
          NET.send({ t: 'start', chars: game.chars, settings: game.settings });
          showVs(() => startMatch());
        }
      } else if (m.t === 'input') {
        Object.assign(remoteInput, m.k);
      } else if (m.t === 'press') {
        remoteActions.length < 20 && remoteActions.push(m.a);
      } else if (m.t === 'emote') {
        showBubble(1, EMOTES[m.i] || '?');
        for (const c of NET.spectators) if (c.open) c.send({ t: 'emote', i: m.i, from: 1 });
      } else if (m.t === 'rematch') {
        game.rematchRemote = true;
        maybeRematch();
      }
    } else {
      if (m.t === 'start') {
        game.mode = 'guest';
        game.chars = m.chars;
        game.settings = m.settings || { timed: false };
        clearInterval(rejoinTimer);
        if (m.resume) { game.phase = 'countdown'; showScreen('game'); fitCanvas(); }
        else showVs(() => startMatch());
      } else if (m.t === 'spectate') {
        game.mode = 'spectate';
        game.chars = m.chars;
        game.settings = m.settings || { timed: false };
        netStatusEl.textContent = 'Match in progress — spectating!';
      } else if (m.t === 'state') {
        applyGuestState(m);
        if (m.ph !== 'end') showGameIfNeeded();
      } else if (m.t === 'emote') {
        if (m.from !== undefined && m.from !== myIndex()) showBubble(m.from, EMOTES[m.i] || '?');
        else if (game.mode === 'spectate') showBubble(m.from ?? 0, EMOTES[m.i] || '?');
      } else if (m.t === 'end') {
        game.phase = 'end'; game.winner = m.winner; game.score = m.score;
        enterOver();
      } else if (m.t === 'restart') {
        game.rematchLocal = game.rematchRemote = false;
        $('btnRematch').disabled = false;
        startMatch();
      }
    }
  };
}

let gameShown = false;
function showGameIfNeeded() {
  if (!gameShown || !gameWrap.classList.contains('active')) { showScreen('game'); fitCanvas(); gameShown = true; }
}

// Guest streams its movement keys to the host; guest resumes send hello again
setInterval(() => {
  if (game.mode === 'guest' && NET.conn && NET.conn.open && ['play', 'countdown'].includes(game.phase)) {
    NET.send({ t: 'input', k: moveSingle() });
  }
}, 50);

/* ================= Screens & flow ================= */

const cardEls = {};

function buildRoster() {
  const roster = $('roster');
  const recs = loadRecords();
  for (const ch of CHARACTERS) {
    const card = document.createElement('div');
    card.className = 'card';
    const cv = document.createElement('canvas');
    drawPortrait(cv, ch);
    const nm = document.createElement('div'); nm.className = 'cname'; nm.textContent = ch.name;
    const fl = document.createElement('div'); fl.className = 'cflag'; fl.textContent = ch.team;
    const pips = statPips(ch);
    const bar = n => '▮'.repeat(n) + '▯'.repeat(5 - n);
    const st = document.createElement('div'); st.className = 'cstats';
    st.innerHTML = `SPD <b>${bar(pips.spd)}</b><br>SHT <b>${bar(pips.sht)}</b><br>TKL <b>${bar(pips.tkl)}</b>`;
    const rec = document.createElement('div'); rec.className = 'crec';
    const r = recs[ch.id];
    rec.textContent = r ? `${r.w}W - ${r.l}L` : '';
    card.append(cv, nm, fl, st, rec);
    cardEls[ch.id] = rec;
    card.onclick = () => {
      document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      game.myChar = ch.id;
      $('btnConfirm').disabled = false;
    };
    roster.appendChild(card);
  }
}

function refreshRecords() {
  const recs = loadRecords();
  for (const ch of CHARACTERS) {
    const r = recs[ch.id];
    if (cardEls[ch.id]) cardEls[ch.id].textContent = r ? `${r.w}W - ${r.l}L` : '';
  }
}

function showVs(cb) {
  showScreen('lobby');
  $('lobbyTitle').textContent = 'Match Found!';
  $('shareUI').style.display = 'none';
  $('vsline').style.display = 'flex';
  const c1 = getCharacter(game.chars[0]), c2 = getCharacter(game.chars[1]);
  drawPortrait($('p1card'), c1); $('p1name').textContent = c1.name;
  drawPortrait($('p2card'), c2); $('p2name').textContent = c2.name;
  netStatusEl.textContent = 'Kick off!';
  netStatusEl.classList.remove('err');
  setTimeout(cb, 1600);
}

function enterOver(msg) {
  clearInterval(rejoinTimer);
  showScreen('over');
  const c1 = getCharacter(game.chars[0]), c2 = getCharacter(game.chars[1]);
  const my = myIndex();
  const iWon = game.winner === my + 1;
  const decided = game.winner !== 0;
  $('overTitle').textContent = !decided ? 'Match Over'
    : game.mode === 'spectate' ? `${getCharacter(game.chars[game.winner - 1]).name} Wins!`
    : game.mode === 'local' ? `Player ${game.winner} Wins!`
    : (iWon ? '🏆 You Win!' : 'You Lose');
  $('overScore').textContent = `${c1.name} ${game.score[0]} — ${game.score[1]} ${c2.name}`;
  $('overStatus').textContent = msg || '';
  $('btnRematch').disabled = !!msg || game.mode === 'spectate';
  if (decided && game.mode !== 'local' && game.mode !== 'spectate') {
    if (game.mode === 'host' || game.mode === 'ai') sfx[iWon ? 'win' : 'lose']();
    else sfx[iWon ? 'win' : 'lose']();
    recordResult(game.chars[my], iWon);
  }
}

function maybeRematch() {
  if (NET.isHost && game.rematchLocal && game.rematchRemote) {
    NET.broadcast({ t: 'restart' });
    game.rematchLocal = game.rematchRemote = false;
    $('btnRematch').disabled = false;
    startMatch();
  }
}

/* ---- menu flow ---- */

const params = new URLSearchParams(location.search);
let joinRoom = params.get('room');
let customRoom = null;
let pendingMode = 'online';   // what btnConfirm should do: 'online' | 'local' | 'ai'
let localPickStage = 0;

$('modeGoals').onclick = () => {
  game.settings.timed = false;
  $('modeGoals').classList.add('selected'); $('modeTimed').classList.remove('selected');
};
$('modeTimed').onclick = () => {
  game.settings.timed = true;
  $('modeTimed').classList.add('selected'); $('modeGoals').classList.remove('selected');
};

function readCodeField(required) {
  const code = $('joinCode').value.trim().toLowerCase();
  if (!code && !required) return '';
  if (!/^[a-z0-9]{4,8}$/.test(code)) {
    $('menuStatus').textContent = required
      ? "Enter the room code shown on your opponent's screen."
      : 'Room codes are 4–8 letters/numbers.';
    return null;
  }
  $('menuStatus').textContent = '';
  return code;
}

$('btnCreate').onclick = () => {
  const code = readCodeField(false);
  if (code === null) return;
  customRoom = code || null;
  joinRoom = null;
  pendingMode = 'online';
  showScreen('select');
  $('selectStatus').textContent = customRoom ? `Creating room ${customRoom} — pick your player!` : 'Pick your player!';
};

$('btnJoin').onclick = () => {
  const code = readCodeField(true);
  if (!code) return;
  joinRoom = code;
  pendingMode = 'online';
  showScreen('select');
  $('selectStatus').textContent = `Joining room ${code} — pick your player!`;
};
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });

$('btnLocal').onclick = () => {
  pendingMode = 'local';
  localPickStage = 0;
  showScreen('select');
  $('selectStatus').textContent = 'PLAYER 1 — pick your player! (WASD · Q steal · E shoot · F sprint)';
};

$('btnAI').onclick = () => {
  pendingMode = 'ai';
  showScreen('select');
  $('selectStatus').textContent = 'Pick your player — the AI takes someone else!';
};

$('btnConfirm').onclick = () => {
  if (pendingMode === 'local') {
    if (localPickStage === 0) {
      game.chars[0] = game.myChar;
      localPickStage = 1;
      game.myChar = null;
      document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
      $('btnConfirm').disabled = true;
      $('selectStatus').textContent = 'PLAYER 2 — pick your player! (arrows · Space steal · Shift shoot · . sprint)';
      return;
    }
    game.chars[1] = game.myChar;
    game.mode = 'local';
    startMatch();
    return;
  }
  if (pendingMode === 'ai') {
    game.chars[0] = game.myChar;
    const others = CHARACTERS.filter(c => c.id !== game.myChar);
    game.chars[1] = others[Math.floor(Math.random() * others.length)].id;
    game.mode = 'ai';
    startMatch();
    return;
  }
  // online
  wireNet();
  if (joinRoom) {
    game.mode = 'guest';
    game.chars = [null, game.myChar];
    showScreen('lobby');
    $('lobbyTitle').textContent = 'Joining Match';
    netStatusEl.textContent = 'Connecting to opponent…';
    NET.onRetry = n => {
      if (game.phase !== 'paused') netStatusEl.textContent = `Looking for the match… (attempt ${n + 1})`;
    };
    NET.onOpen = () => {
      netStatusEl.textContent = 'Connected! Waiting for kickoff…';
      NET.send({ t: 'hello', char: game.myChar, resume: game.phase === 'paused' ? 1 : 0 });
    };
    NET.join(joinRoom);
  } else {
    game.mode = 'host';
    game.chars = [game.myChar, null];
    const room = customRoom || NET.makeRoomCode();
    showScreen('lobby');
    $('lobbyTitle').textContent = 'Match Lobby';
    netStatusEl.textContent = 'Setting up match…';
    NET.onReady = () => {
      $('shareUI').style.display = 'flex';
      $('roomCode').textContent = room;
      $('shareLink').value = NET.shareLink(room);
      netStatusEl.textContent = 'Waiting for opponent to join…';
    };
    NET.onOpen = () => { netStatusEl.textContent = 'Opponent connected!'; };
    NET.onGuestFound = () => { netStatusEl.textContent = 'Opponent found — connecting…'; };
    NET.onGuestLost = () => {
      if (game.phase === 'idle') netStatusEl.textContent = 'Connection with opponent failed — they are retrying…';
    };
    NET.host(room);
  }
};

$('btnCopy').onclick = async () => {
  const inp = $('shareLink');
  inp.select();
  try { await navigator.clipboard.writeText(inp.value); } catch (e) { document.execCommand('copy'); }
  $('btnCopy').textContent = 'Copied!';
  setTimeout(() => { $('btnCopy').textContent = 'Copy'; }, 1500);
};

$('btnRematch').onclick = () => {
  if (game.mode === 'local' || game.mode === 'ai') { startMatch(); return; }
  game.rematchLocal = true;
  $('btnRematch').disabled = true;
  $('overStatus').textContent = 'Waiting for opponent…';
  if (NET.isHost) maybeRematch();
  else NET.send({ t: 'rematch' });
};

buildRoster();
if (joinRoom) {
  showScreen('select');
  $('selectStatus').textContent = 'You were invited to a match — pick your player!';
}

/* ================= Particles, shake, crowd ================= */

const parts = [];
let shakeT = 0;

function spawnConfetti(scorer) {
  const gx = scorer === 0 ? FIELD.x1 : FIELD.x0;
  const cols = ['#fbbf24', '#4ade80', '#60a5fa', '#f472b6', '#f87171', '#ffffff'];
  for (let i = 0; i < 40; i++) {
    parts.push({
      x: gx + (Math.random() - 0.5) * 16,
      y: 96 + Math.random() * 40,
      vx: (scorer === 0 ? -1 : 1) * (20 + Math.random() * 70),
      vy: -60 - Math.random() * 70,
      g: 160, life: 1 + Math.random() * 0.7,
      c: cols[i % cols.length],
    });
  }
}

function spawnDust(x, y) {
  for (let i = 0; i < 7; i++) {
    parts.push({
      x, y, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 50,
      g: 220, life: 0.35 + Math.random() * 0.25, c: '#c8bfa8',
    });
  }
}

function stepParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  shakeT = Math.max(0, shakeT - dt);
}

function drawParts() {
  for (const p of parts) {
    ctx.fillStyle = p.c;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
  }
}

const CROWD_COLS = ['#e11d48', '#f59e0b', '#10b981', '#3b82f6', '#eab308', '#f472b6', '#a78bfa', '#e2e8f0', '#fb923c'];
function drawCrowd(now) {
  const jump = shakeT > 0 ? Math.floor(now / 90) % 2 : 0;
  // top band (between HUD and pitch) + bottom band
  for (let x = 12; x < 372; x += 5) {
    const i = (x * 2654435761) >>> 0;
    ctx.fillStyle = CROWD_COLS[i % CROWD_COLS.length];
    ctx.fillRect(x, 21 + ((i >> 4) % 2) - (jump && x % 2 ? 1 : 0), 2, 2);
    ctx.fillStyle = CROWD_COLS[(i >> 8) % CROWD_COLS.length];
    ctx.fillRect(x + 2, 208 + ((i >> 6) % 3) - (jump && x % 3 ? 1 : 0), 2, 2);
    ctx.fillStyle = CROWD_COLS[(i >> 12) % CROWD_COLS.length];
    ctx.fillRect(x, 212 + ((i >> 2) % 2) + (jump && x % 2 ? 1 : 0), 2, 2);
  }
}

/* ================= Rendering ================= */

function drawField() {
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#1f8a44' : '#1a7a3a';
    ctx.fillRect(FIELD.x0 + i * (FIELD.x1 - FIELD.x0) / 8, FIELD.y0, (FIELD.x1 - FIELD.x0) / 8 + 1, FIELD.y1 - FIELD.y0);
  }
  ctx.fillStyle = '#0f5228';
  ctx.fillRect(0, 20, W, FIELD.y0 - 20); ctx.fillRect(0, FIELD.y1, W, H - FIELD.y1);
  ctx.fillRect(0, 20, FIELD.x0, H - 20); ctx.fillRect(FIELD.x1, 20, W - FIELD.x1, H - 20);
  ctx.strokeStyle = '#e8f5e9';
  ctx.lineWidth = 2;
  ctx.strokeRect(FIELD.x0 + 1, FIELD.y0 + 1, FIELD.x1 - FIELD.x0 - 2, FIELD.y1 - FIELD.y0 - 2);
  ctx.beginPath();
  ctx.moveTo(W / 2, FIELD.y0); ctx.lineTo(W / 2, FIELD.y1); ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, (FIELD.y0 + FIELD.y1) / 2, 24, 0, Math.PI * 2); ctx.stroke();
  const bh = 84, bw = 36, by = (FIELD.y0 + FIELD.y1) / 2 - bh / 2;
  ctx.strokeRect(FIELD.x0 + 1, by, bw, bh);
  ctx.strokeRect(FIELD.x1 - bw - 1, by, bw, bh);
  ctx.fillStyle = '#dddddd';
  ctx.fillRect(FIELD.x0 - 7, GOAL.y0, 7, GOAL.y1 - GOAL.y0);
  ctx.fillRect(FIELD.x1, GOAL.y0, 7, GOAL.y1 - GOAL.y0);
  ctx.strokeStyle = '#999999'; ctx.lineWidth = 1;
  for (let y = GOAL.y0; y <= GOAL.y1; y += 5) {
    ctx.beginPath(); ctx.moveTo(FIELD.x0 - 7, y + .5); ctx.lineTo(FIELD.x0, y + .5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(FIELD.x1, y + .5); ctx.lineTo(FIELD.x1 + 7, y + .5); ctx.stroke();
  }
  ctx.fillStyle = '#c62828';
  ctx.fillRect(FIELD.x0 - 8, GOAL.y0 - 3, 9, 3); ctx.fillRect(FIELD.x0 - 8, GOAL.y1, 9, 3);
  ctx.fillRect(FIELD.x1 - 1, GOAL.y0 - 3, 9, 3); ctx.fillRect(FIELD.x1 - 1, GOAL.y1, 9, 3);
}

function drawShadow(x, y, w) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - w / 2, y, w, 2);
}

function keeperChar(defenderIdx) {
  const team = getCharacter(game.chars[defenderIdx]);
  return {
    skin: '#d9a06a', hair: '#221a12', style: 'buzz',
    shirt: '#ff8c00', trim: team.shirt, shorts: '#111827', socks: '#ff8c00',
  };
}

function drawKeepers() {
  for (let i = 0; i < 2; i++) {
    const kx = i === 0 ? FIELD.x0 + 8 : FIELD.x1 - 8;
    const kp = game.keepers[i];
    drawShadow(kx, kp.y + 12, 9);
    drawCharacter(ctx, keeperChar(i), 0, Math.round(kx - 6), Math.round(kp.y - 4), 1, i === 1);
  }
}

function drawPowerup(now) {
  if (!game.pu) return;
  const bob = Math.round(Math.sin(now / 200) * 2);
  const x = Math.round(game.pu.x), y = Math.round(game.pu.y) + bob;
  if (game.pu.type === 0) {   // bolt
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x - 1, y - 5, 3, 4); ctx.fillRect(x - 3, y - 2, 5, 2); ctx.fillRect(x - 2, y, 3, 4);
  } else {                    // freeze
    ctx.fillStyle = '#67e8f9';
    ctx.fillRect(x - 1, y - 5, 2, 10); ctx.fillRect(x - 5, y - 1, 10, 2);
    ctx.fillRect(x - 3, y - 3, 2, 2); ctx.fillRect(x + 1, y + 1, 2, 2);
    ctx.fillRect(x + 1, y - 3, 2, 2); ctx.fillRect(x - 3, y + 1, 2, 2);
  }
}

function drawPlayers(now) {
  const order = [...game.players.keys()].sort((a, b) => game.players[a].y - game.players[b].y);
  const celebrating = game.phase === 'goal';
  for (const i of order) {
    const p = game.players[i];
    const ch = getCharacter(game.chars[i]);
    const frame = p.moving ? (Math.floor(p.anim) % 2) : 0;
    const flip = p.fx < 0;
    let jumpY = 0;
    if (celebrating && i === game.scorer) jumpY = Math.round(Math.abs(Math.sin(now / 130)) * 6);
    if (p.stun > 0 && Math.floor(p.stun * 12) % 2) continue;
    drawShadow(p.x, p.y + 14, 10);
    drawCharacter(ctx, ch, frame, Math.round(p.x - 6), Math.round(p.y - 2 - jumpY), 1, flip);
    // frozen tint
    if (p.frozen > 0) {
      ctx.fillStyle = 'rgba(103,232,249,0.3)';
      ctx.fillRect(Math.round(p.x - 6), Math.round(p.y - 2), 12, 16);
    }
    // boost sparks
    if (p.boost > 0 && Math.random() < 0.4) {
      parts.push({ x: p.x - p.fx * 6, y: p.y + 12, vx: -p.fx * 30, vy: -20 - Math.random() * 20, g: 60, life: 0.3, c: '#facc15' });
    }
    // possession marker
    if (game.ball && game.ball.owner === i) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 7, 3, 3);
    }
    // "you" marker
    const my = myIndex();
    if ((game.mode === 'host' || game.mode === 'guest' || game.mode === 'ai') && i === my) {
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 11, 3, 2);
      ctx.fillRect(Math.round(p.x), Math.round(p.y) - 9, 1, 1);
    }
    // charge bar
    if (p.charge >= 0) {
      const w = Math.round(14 * Math.min(p.charge, CHARGE_MAX) / CHARGE_MAX);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(Math.round(p.x) - 7, Math.round(p.y) - 14, 14, 3);
      ctx.fillStyle = w >= 14 ? '#ef4444' : '#fbbf24';
      ctx.fillRect(Math.round(p.x) - 7, Math.round(p.y) - 14, w, 3);
    }
  }
  // speech bubbles
  for (let i = 0; i < 2; i++) {
    const bb = game.bubbles[i];
    if (!bb || bb.t <= 0) continue;
    const p = game.players[i];
    if (!p) continue;
    ctx.font = 'bold 8px "Courier New", monospace';
    const tw = ctx.measureText(bb.text).width + 6;
    const bx = Math.max(2, Math.min(W - tw - 2, p.x - tw / 2));
    const by = Math.max(22, p.y - 26);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(bx, by, tw, 11);
    ctx.fillStyle = '#0b1020';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(bb.text, bx + 3, by + 6);
  }
}

function drawBall() {
  const b = game.ball;
  drawShadow(b.x, b.y + 2, 5);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 3, 4, 4);
  ctx.fillStyle = '#333333';
  ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 2, 2, 2);
}

function staminaBar(x, st) {
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, 8, 42, 4);
  ctx.fillStyle = st > 30 ? '#4ade80' : '#f87171';
  ctx.fillRect(x + 1, 9, Math.round(40 * st / 100), 2);
}

function drawHUD(now) {
  const c1 = getCharacter(game.chars[0]), c2 = getCharacter(game.chars[1]);
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, W, 20);
  ctx.font = 'bold 10px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#eef2ff';
  ctx.textAlign = 'right';
  ctx.fillText(c1.name.toUpperCase(), W / 2 - 26, 11);
  ctx.textAlign = 'left';
  ctx.fillText(c2.name.toUpperCase(), W / 2 + 26, 11);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(`${game.score[0]} - ${game.score[1]}`, W / 2, game.settings.timed ? 7 : 11);
  if (game.settings.timed) {
    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = game.gg ? '#f87171' : '#93a0c9';
    const t = Math.max(0, Math.ceil(game.clock));
    ctx.fillText(game.gg ? 'GOLDEN GOAL' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, W / 2, 16);
  }
  staminaBar(6, game.players[0].st);
  staminaBar(W - 48, game.players[1].st);

  if (game.mode === 'spectate') {
    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = '#93a0c9';
    ctx.textAlign = 'left';
    ctx.fillText('👁 SPECTATING', 6, 16 + 8);
  }

  if (game.phase === 'countdown') {
    banner(game.phaseT > 0.6 ? String(Math.ceil(game.phaseT - 0.5) || 'GO!') : 'GO!');
  } else if (game.phase === 'goal') {
    banner('GOAL!');
  } else if (game.phase === 'replay') {
    if (Math.floor(now / 400) % 2) smallBanner('◄◄ REPLAY');
  } else if (game.phase === 'paused') {
    banner('PAUSED');
    smallBanner(`opponent disconnected — waiting ${Math.max(0, Math.ceil(game.pauseT))}s`, H / 2 + 30);
  } else if (game.phase === 'play' && game.gg && Math.floor(now / 350) % 2) {
    smallBanner('⚡ GOLDEN GOAL — NEXT SCORES WINS ⚡', 32);
  }
}

function banner(text) {
  ctx.font = 'bold 28px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(W / 2 - 70, H / 2 - 22, 140, 44);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(text, W / 2, H / 2 + 1);
}

function smallBanner(text, y = H / 2 + 34) {
  ctx.font = 'bold 9px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(W / 2 - tw / 2, y - 7, tw, 14);
  ctx.fillStyle = '#facc15';
  ctx.fillText(text, W / 2, y);
}

/* ================= Main loop ================= */

let lastT = performance.now();
let lastTickN = -1;
let bcastFrame = false;

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (game.phase === 'countdown') {
    const n = Math.ceil(game.phaseT - 0.5);
    if (n !== lastTickN) { lastTickN = n; if (n >= 1) sfx.tick(); }
  } else {
    lastTickN = -1;
  }

  const inGame = ['countdown', 'play', 'goal', 'replay', 'paused'].includes(game.phase);
  if (inGame && game.players[0]) {
    if (simulating()) {
      aiStep(dt);
      simulate(dt);
      if (game.mode === 'host') {
        bcastFrame = !bcastFrame;
        if (bcastFrame || game.phase !== 'play') NET.broadcast(stateMsg());
      }
    } else {
      guestSmooth();
    }
    for (const bb of game.bubbles) if (bb) bb.t -= dt;
    stepParts(dt);

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shakeT > 0) ctx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 3));
    drawField();
    drawCrowd(now);
    drawPowerup(now);
    drawKeepers();
    drawBall();
    drawPlayers(now);
    drawParts();
    ctx.restore();
    drawHUD(now);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
