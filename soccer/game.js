// Pixel Pitch — 1v1 online pixel soccer.
// Host simulates the match and streams state; guest sends inputs.

/* ================= Constants ================= */

const W = 384, H = 216;            // logical pixels
const FIELD = { x0: 10, y0: 26, x1: 374, y1: 206 };
const GOAL = { y0: 86, y1: 146 };  // goal mouth vertical span
const PLAYER_SPEED = 92;
const SHOOT_SPEED = 245;
const STEAL_RANGE = 15;
const PICKUP_RANGE = 11;
const DRIBBLE_DIST = 8;
const WIN_SCORE = 5;

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

function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle('active', k === name);
  gameWrap.classList.toggle('active', name === 'game');
  const touchUI = $('touchUI');
  if (touchUI) touchUI.classList.toggle('on', name === 'game' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
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

function cheer(dur = 0.9) {  // white-noise crowd roar
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
  tick:   () => beep(660, 0.07, 'square', 0.03),
  goal:   () => { cheer(); beep(523, 0.12); setTimeout(() => beep(659, 0.12), 120); setTimeout(() => beep(784, 0.25), 240); },
  whistle: () => beep(1900, 0.35, 'square', 0.03),
  win:    () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.16), i * 140)),
  lose:   () => [392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.03), i * 180)),
};

/* ================= Game state ================= */

const game = {
  phase: 'idle',           // idle | countdown | play | goal | end
  phaseT: 0,
  score: [0, 0],
  banner: '',
  myChar: null,            // character id picked locally
  chars: [null, null],     // [p1 char id, p2 char id]
  winner: 0,
  rematchLocal: false,
  rematchRemote: false,
  players: [null, null],
  ball: null,
  fx: [0, 0, 0, 0],        // event counters: kick, steal, bounce, pickup (streamed so the guest hears them too)
};

function makePlayer(i) {
  return {
    x: i === 0 ? 100 : 284, y: 116,
    fx: i === 0 ? 1 : -1, fy: 0,       // facing
    stun: 0, stealCd: 0, pickupCd: 0,
    anim: 0, moving: false,
  };
}

function resetKickoff() {
  game.players[0] = Object.assign(makePlayer(0), { x: 100, y: 116 });
  game.players[1] = Object.assign(makePlayer(1), { x: 284, y: 116 });
  game.ball = { x: W / 2, y: 126, vx: 0, vy: 0, owner: -1 };  // 126 = feet level of players at y 116
}

function startMatch() {
  game.score = [0, 0];
  game.fx = [0, 0, 0, 0];
  lastFx = [0, 0, 0, 0];
  game.winner = 0;
  game.rematchLocal = game.rematchRemote = false;
  resetKickoff();
  game.phase = 'countdown';
  game.phaseT = 3;
  showScreen('game');
  fitCanvas();
}

/* ================= Input ================= */

const keys = {};
const localInput = { up: 0, down: 0, left: 0, right: 0 };

addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (game.phase === 'play' || game.phase === 'countdown') {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space') onAction('steal');
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') onAction('shoot');
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });

function readMove() {
  return {
    up:    (keys['ArrowUp'] || keys['KeyW'] || touchMove.up) ? 1 : 0,
    down:  (keys['ArrowDown'] || keys['KeyS'] || touchMove.down) ? 1 : 0,
    left:  (keys['ArrowLeft'] || keys['KeyA'] || touchMove.left) ? 1 : 0,
    right: (keys['ArrowRight'] || keys['KeyD'] || touchMove.right) ? 1 : 0,
  };
}

/* ---- touch controls (virtual stick + buttons) ---- */

const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const touchMove = { up: 0, down: 0, left: 0, right: 0 };

if (IS_TOUCH) {
  const stick = $('stick'), nub = $('nub');
  const setStick = (dx, dy) => {
    const m = Math.hypot(dx, dy);
    if (m > 42) { dx *= 42 / m; dy *= 42 / m; }
    nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const t = 12;   // dead zone in px
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

  const bindBtn = (id, action) => {
    $(id).addEventListener('touchstart', e => { e.preventDefault(); unlockAudio(); onAction(action); }, { passive: false });
  };
  bindBtn('tSteal', 'steal');
  bindBtn('tShoot', 'shoot');
}

// Remote (guest) input as seen by the host
const remoteInput = { up: 0, down: 0, left: 0, right: 0 };
const remoteActions = [];   // queued 'steal' / 'shoot' presses from the guest

function onAction(a) {
  if (NET.isHost) {
    hostAction(0, a);
  } else {
    NET.send({ t: 'press', a });
  }
}

/* ================= Host simulation ================= */

function hostAction(pi, action) {
  if (game.phase !== 'play') return;
  const p = game.players[pi], b = game.ball, o = game.players[1 - pi];
  if (p.stun > 0) return;
  if (action === 'steal') {
    if (p.stealCd > 0) return;
    p.stealCd = 0.5;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < STEAL_RANGE && b.owner !== pi) {
      if (b.owner === 1 - pi) { o.stun = 0.45; sfx.steal(); game.fx[1]++; }
      b.owner = pi;
      p.pickupCd = 0;
    }
  } else if (action === 'shoot') {
    if (b.owner !== pi) return;
    let dx = p.fx, dy = p.fy;
    if (dx === 0 && dy === 0) dx = pi === 0 ? 1 : -1;
    const n = Math.hypot(dx, dy) || 1;
    b.owner = -1;
    b.vx = (dx / n) * SHOOT_SPEED;
    b.vy = (dy / n) * SHOOT_SPEED;
    p.pickupCd = 0.35;
    sfx.kick();
    game.fx[0]++;
  }
}

function movePlayer(p, input, dt) {
  p.moving = false;
  if (p.stun > 0) { p.stun -= dt; return; }
  let dx = input.right - input.left;
  let dy = input.down - input.up;
  if (dx || dy) {
    const n = Math.hypot(dx, dy);
    dx /= n; dy /= n;
    p.x += dx * PLAYER_SPEED * dt;
    p.y += dy * PLAYER_SPEED * dt;
    p.fx = dx; p.fy = dy;
    p.moving = true;
    p.anim += dt * 10;
  }
  p.x = Math.max(FIELD.x0 + 4, Math.min(FIELD.x1 - 4, p.x));
  p.y = Math.max(FIELD.y0 + 6, Math.min(FIELD.y1 - 2, p.y));
  p.stealCd = Math.max(0, p.stealCd - dt);
  p.pickupCd = Math.max(0, p.pickupCd - dt);
}

function hostStep(dt) {
  game.phaseT -= dt;

  if (game.phase === 'countdown' && game.phaseT <= 0) {
    game.phase = 'play';
    sfx.whistle();
  }
  if (game.phase === 'goal' && game.phaseT <= 0) {
    if (game.score[0] >= WIN_SCORE || game.score[1] >= WIN_SCORE) {
      game.winner = game.score[0] >= WIN_SCORE ? 1 : 2;
      game.phase = 'end';
      NET.send({ t: 'end', winner: game.winner, score: game.score });
      enterOver();
    } else {
      resetKickoff();
      game.phase = 'countdown';
      game.phaseT = 2;
    }
  }
  if (game.phase !== 'play' && game.phase !== 'countdown') return;

  // players
  movePlayer(game.players[0], readMove(), dt);
  movePlayer(game.players[1], remoteInput, dt);
  while (remoteActions.length) hostAction(1, remoteActions.shift());

  // separate overlapping players
  const [a, b] = game.players;
  const pd = Math.hypot(a.x - b.x, a.y - b.y);
  if (pd > 0 && pd < 9) {
    const push = (9 - pd) / 2, nx = (a.x - b.x) / pd, ny = (a.y - b.y) / pd;
    a.x += nx * push; a.y += ny * push;
    b.x -= nx * push; b.y -= ny * push;
  }

  if (game.phase !== 'play') return;

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
    const f = Math.pow(0.35, dt);   // friction
    ball.vx *= f; ball.vy *= f;
    // walls (top/bottom always; left/right outside the goal mouth)
    const thud = () => { if (Math.hypot(ball.vx, ball.vy) > 40) { sfx.bounce(); game.fx[2]++; } };
    if (ball.y < FIELD.y0 + 2) { ball.y = FIELD.y0 + 2; ball.vy *= -0.8; thud(); }
    if (ball.y > FIELD.y1 - 2) { ball.y = FIELD.y1 - 2; ball.vy *= -0.8; thud(); }
    const inMouth = ball.y > GOAL.y0 && ball.y < GOAL.y1;
    if (ball.x < FIELD.x0 + 2) {
      if (inMouth) return scoreGoal(1);      // guest scores in left goal
      ball.x = FIELD.x0 + 2; ball.vx *= -0.8; thud();
    }
    if (ball.x > FIELD.x1 - 2) {
      if (inMouth) return scoreGoal(0);      // host scores in right goal
      ball.x = FIELD.x1 - 2; ball.vx *= -0.8; thud();
    }
    // loose-ball pickup on touch
    for (let i = 0; i < 2; i++) {
      const p = game.players[i];
      if (p.pickupCd > 0 || p.stun > 0) continue;
      if (Math.hypot(ball.x - p.x, ball.y - (p.y + 10)) < PICKUP_RANGE) { ball.owner = i; sfx.pickup(); game.fx[3]++; break; }
    }
  }
}

function scoreGoal(scorer) {
  game.score[scorer]++;
  game.phase = 'goal';
  game.phaseT = 2.2;
  game.banner = 'GOAL!';
  sfx.goal();
}

/* ================= Networking glue ================= */

let netStatusEl = $('lobbyStatus');

function hostBroadcast() {
  const p = game.players, b = game.ball;
  NET.send({
    t: 'state',
    ph: game.phase, pt: Math.max(0, game.phaseT), s: game.score,
    p1: [p[0].x, p[0].y, p[0].fx, p[0].fy, p[0].moving ? 1 : 0, p[0].anim, p[0].stun],
    p2: [p[1].x, p[1].y, p[1].fx, p[1].fy, p[1].moving ? 1 : 0, p[1].anim, p[1].stun],
    b: [b.x, b.y, b.owner],
    f: game.fx,
  });
}

// Guest-side snapshot targets (positions are smoothed toward these when drawing)
let guestState = null;

let lastFx = [0, 0, 0, 0];
const fxSounds = [sfx.kick, sfx.steal, sfx.bounce, sfx.pickup];

function applyGuestState(m) {
  const prevPhase = game.phase;
  game.phase = m.ph; game.phaseT = m.pt; game.score = m.s;
  if (prevPhase !== 'goal' && m.ph === 'goal') sfx.goal();
  if (prevPhase === 'countdown' && m.ph === 'play') sfx.whistle();
  if (m.f) {
    for (let i = 0; i < 4; i++) if (m.f[i] !== lastFx[i]) fxSounds[i]();
    lastFx = m.f.slice();
  }
  guestState = m;
  if (!game.players[0]) { game.players[0] = makePlayer(0); game.players[1] = makePlayer(1); game.ball = { x: W / 2, y: 126, vx: 0, vy: 0, owner: -1 }; }
  for (let i = 0; i < 2; i++) {
    const src = i === 0 ? m.p1 : m.p2, p = game.players[i];
    p.tx = src[0]; p.ty = src[1];
    p.fx = src[2]; p.fy = src[3]; p.moving = !!src[4]; p.anim = src[5]; p.stun = src[6];
  }
  game.ball.tx = m.b[0]; game.ball.ty = m.b[1]; game.ball.owner = m.b[2];
}

function guestSmooth() {
  if (!guestState) return;
  const lerp = (o, k, t) => { o[k] += (t - o[k]) * 0.45; };
  for (const p of game.players) { if (p.tx !== undefined) { lerp(p, 'x', p.tx); lerp(p, 'y', p.ty); } }
  const b = game.ball;
  if (b.tx !== undefined) { lerp(b, 'x', b.tx); lerp(b, 'y', b.ty); }
}

function wireNet() {
  const RELAY_HINT = NET.hasTurn()
    ? 'Your TURN relay did not help — double-check the credentials.'
    : 'Fix: if either player is on a VPN or office network, disconnect it and reload. ' +
      'Or add a relay server: grab free TURN credentials at metered.ca and reopen the game as ' +
      '?turn=USERNAME:CREDENTIAL@standard.relay.metered.ca — the share link passes it to your opponent automatically.';
  NET.onError = err => {
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
    // live negotiation feedback while still in the lobby
    if (game.phase !== 'idle' || netStatusEl.classList.contains('err')) return;
    if (state === 'checking') netStatusEl.textContent = 'Negotiating connection…';
    else if (state === 'failed' || state === 'disconnected') netStatusEl.textContent = 'Connection attempt failed — retrying…';
  };
  NET.onClose = () => {
    if (game.phase === 'end' || game.phase === 'idle') return;
    game.phase = 'end';
    game.winner = 0;
    enterOver('Opponent disconnected');
  };
  NET.onData = m => {
    if (NET.isHost) {
      if (m.t === 'hello') {
        game.chars[1] = m.char;
        NET.send({ t: 'start', chars: [game.chars[0], m.char] });
        showVs(() => startMatch());
      } else if (m.t === 'input') {
        Object.assign(remoteInput, m.k);
      } else if (m.t === 'press') {
        remoteActions.push(m.a);
      } else if (m.t === 'rematch') {
        game.rematchRemote = true;
        maybeRematch();
      }
    } else {
      if (m.t === 'start') {
        game.chars = m.chars;
        showVs(() => { startMatch(); });
      } else if (m.t === 'state') {
        applyGuestState(m);
        if (m.ph === 'play' || m.ph === 'countdown') showGameIfNeeded();
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

// Guest streams its movement keys to the host
setInterval(() => {
  if (!NET.isHost && NET.conn && (game.phase === 'play' || game.phase === 'countdown')) {
    NET.send({ t: 'input', k: readMove() });
  }
}, 50);

/* ================= Screens & flow ================= */

function buildRoster() {
  const roster = $('roster');
  for (const ch of CHARACTERS) {
    const card = document.createElement('div');
    card.className = 'card';
    const cv = document.createElement('canvas');
    drawPortrait(cv, ch);
    const nm = document.createElement('div'); nm.className = 'cname'; nm.textContent = ch.name;
    const fl = document.createElement('div'); fl.className = 'cflag'; fl.textContent = ch.team;
    card.append(cv, nm, fl);
    card.onclick = () => {
      document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      game.myChar = ch.id;
      $('btnConfirm').disabled = false;
    };
    roster.appendChild(card);
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
  showScreen('over');
  const c1 = getCharacter(game.chars[0]), c2 = getCharacter(game.chars[1]);
  const iWon = (NET.isHost && game.winner === 1) || (!NET.isHost && game.winner === 2);
  $('overTitle').textContent = game.winner === 0 ? 'Match Over' : (iWon ? '🏆 You Win!' : 'You Lose');
  if (game.winner !== 0) (iWon ? sfx.win : sfx.lose)();
  $('overScore').textContent = `${c1.name} ${game.score[0]} — ${game.score[1]} ${c2.name}`;
  $('overStatus').textContent = msg || '';
  $('btnRematch').disabled = !!msg;   // no rematch after a disconnect
}

function maybeRematch() {
  if (NET.isHost && game.rematchLocal && game.rematchRemote) {
    NET.send({ t: 'restart' });
    game.rematchLocal = game.rematchRemote = false;
    $('btnRematch').disabled = false;
    startMatch();
  }
}

const params = new URLSearchParams(location.search);
let joinRoom = params.get('room');
let customRoom = null;       // host-chosen room code (optional)

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
  showScreen('select');
  if (customRoom) $('selectStatus').textContent = `Creating room ${customRoom} — pick your player!`;
};

$('btnJoin').onclick = () => {
  const code = readCodeField(true);
  if (!code) return;
  joinRoom = code;
  showScreen('select');
  $('selectStatus').textContent = `Joining room ${code} — pick your player!`;
};
$('joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });

$('btnConfirm').onclick = () => {
  wireNet();
  if (joinRoom) {
    // guest
    game.chars = [null, game.myChar];
    showScreen('lobby');
    $('lobbyTitle').textContent = 'Joining Match';
    netStatusEl.textContent = 'Connecting to opponent…';
    NET.onRetry = n => {
      netStatusEl.textContent = `Looking for the match… (attempt ${n + 1})`;
    };
    NET.onOpen = () => {
      netStatusEl.textContent = 'Connected! Waiting for kickoff…';
      NET.send({ t: 'hello', char: game.myChar });
    };
    NET.join(joinRoom);
  } else {
    // host
    game.chars = [game.myChar, null];
    const room = customRoom || NET.makeRoomCode();
    showScreen('lobby');
    $('lobbyTitle').textContent = 'Match Lobby';
    netStatusEl.textContent = 'Setting up match…';
    NET.onReady = () => {
      // Only show the link once the broker knows about us — before that,
      // a joining guest would get peer-unavailable.
      $('shareUI').style.display = 'flex';
      $('roomCode').textContent = room;
      $('shareLink').value = NET.shareLink(room);
      netStatusEl.textContent = 'Waiting for opponent to join…';
    };
    NET.onOpen = () => { netStatusEl.textContent = 'Opponent connected!'; };
    NET.onGuestFound = () => { netStatusEl.textContent = 'Opponent found — connecting…'; };
    NET.onGuestLost = () => { netStatusEl.textContent = 'Connection with opponent failed — they are retrying…'; };
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
  game.rematchLocal = true;
  $('btnRematch').disabled = true;
  $('overStatus').textContent = 'Waiting for opponent…';
  if (NET.isHost) maybeRematch();
  else NET.send({ t: 'rematch' });
};

buildRoster();
if (joinRoom) {
  // Guest arriving via share link goes straight to character select
  showScreen('select');
  $('selectStatus').textContent = 'You were invited to a match — pick your player!';
}

/* ================= Rendering ================= */

function drawField() {
  // grass stripes
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#1f8a44' : '#1a7a3a';
    ctx.fillRect(FIELD.x0 + i * (FIELD.x1 - FIELD.x0) / 8, FIELD.y0, (FIELD.x1 - FIELD.x0) / 8 + 1, FIELD.y1 - FIELD.y0);
  }
  // out of bounds
  ctx.fillStyle = '#0f5228';
  ctx.fillRect(0, 0, W, FIELD.y0); ctx.fillRect(0, FIELD.y1, W, H - FIELD.y1);
  ctx.fillRect(0, 0, FIELD.x0, H); ctx.fillRect(FIELD.x1, 0, W - FIELD.x1, H);
  // lines
  ctx.strokeStyle = '#e8f5e9';
  ctx.lineWidth = 2;
  ctx.strokeRect(FIELD.x0 + 1, FIELD.y0 + 1, FIELD.x1 - FIELD.x0 - 2, FIELD.y1 - FIELD.y0 - 2);
  ctx.beginPath();
  ctx.moveTo(W / 2, FIELD.y0); ctx.lineTo(W / 2, FIELD.y1); ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, (FIELD.y0 + FIELD.y1) / 2, 24, 0, Math.PI * 2); ctx.stroke();
  // penalty boxes
  const bh = 84, bw = 36, by = (FIELD.y0 + FIELD.y1) / 2 - bh / 2;
  ctx.strokeRect(FIELD.x0 + 1, by, bw, bh);
  ctx.strokeRect(FIELD.x1 - bw - 1, by, bw, bh);
  // goals (nets)
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

function drawPlayers() {
  const order = [...game.players.keys()].sort((a, b) => game.players[a].y - game.players[b].y);
  for (const i of order) {
    const p = game.players[i];
    const ch = getCharacter(game.chars[i]);
    const frame = p.moving ? (Math.floor(p.anim) % 2) : 0;
    const flip = p.fx < 0;
    if (p.stun > 0 && Math.floor(p.stun * 12) % 2) continue;   // stun flicker
    drawShadow(p.x, p.y + 14, 10);
    drawCharacter(ctx, ch, frame, Math.round(p.x - 6), Math.round(p.y - 2), 1, flip);
    // possession marker
    if (game.ball && game.ball.owner === i) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 7, 3, 3);
    }
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

function drawHUD() {
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
  ctx.fillText(`${game.score[0]} - ${game.score[1]}`, W / 2, 11);
  // "you" indicator
  ctx.fillStyle = '#4ade80';
  ctx.font = '8px "Courier New", monospace';
  ctx.fillText('YOU', NET.isHost ? 24 : W - 24, 11);

  if (game.phase === 'countdown') {
    banner(game.phaseT > 0.6 ? String(Math.ceil(game.phaseT - 0.5) || 'GO!') : 'GO!');
  } else if (game.phase === 'goal') {
    banner('GOAL!');
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

/* ================= Main loop ================= */

let lastT = performance.now();
let lastTickN = -1;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  // countdown beeps (both sides compute from the streamed phase timer)
  if (game.phase === 'countdown') {
    const n = Math.ceil(game.phaseT - 0.5);
    if (n !== lastTickN) { lastTickN = n; if (n >= 1) sfx.tick(); }
  } else {
    lastTickN = -1;
  }

  const inGame = ['countdown', 'play', 'goal'].includes(game.phase);
  if (inGame && game.players[0]) {
    if (NET.isHost) {
      hostStep(dt);
      hostBroadcast();
    } else {
      guestSmooth();
    }
    ctx.clearRect(0, 0, W, H);
    drawField();
    drawBall();
    drawPlayers();
    drawHUD();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
