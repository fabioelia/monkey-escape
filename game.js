import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { toonMat } from './toon.js';
import { buildMonkey, buildChimp, buildBanana, animateWalk } from './characters.js';
import { buildBranch, buildLeafNest, buildMushroom, buildVine, buildTree, buildFloorProp, buildBananaTree, buildHangingPlatform } from './foliage.js';
import { STAGES } from './stages.js';
import { sfx, resume as resumeAudio, toggleMute, startMusic, setMusicIntensity, setVolume } from './audio.js';

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const canvas = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9fd3ff, 48, 170);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);

// gradient sky dome (vertical color blend, follows the camera)
const skyUniforms = {
  top: { value: new THREE.Color(0x4a90d9) },
  bottom: { value: new THREE.Color(0xcfeaff) },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(500, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
      void main(){ float h = clamp(vP.y/500.0*0.5+0.5,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.7)),1.0); }`,
  })
);
scene.add(sky);

// post-processing bloom
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const sun = new THREE.DirectionalLight(0xfff4d6, 2.4);
sun.position.set(40, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 320;
const s = 130;
sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
sun.shadow.camera.top = s;  sun.shadow.camera.bottom = -s;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x4a5a40, 1.1));

const GROUND_Y = -24;

// forest floor
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(420, 460),
  toonMat(0x3c6b34)
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, GROUND_Y, -45);
floor.receiveShadow = true;
scene.add(floor);

// low forest-floor props scattered across the floor
const PROP_KINDS = ['bush', 'fern', 'rock', 'log'];
for (let i = 0; i < 60; i++) {
  const kind = PROP_KINDS[i % PROP_KINDS.length];
  const prop = buildFloorProp(kind, 1 + (i % 3) * 0.6);
  const a = i * 2.39, r = 12 + (i * 7) % 150;
  prop.position.set(Math.cos(a) * r, GROUND_Y + 0.2, -45 + Math.sin(a) * r);
  scene.add(prop);
}

// background grove — big trees rising from the floor, framing the climb
const groveTrees = [];
for (let i = 0; i < 28; i++) {
  const side = i % 2 ? 1 : -1;
  const h = 40 + (i % 5) * 8;
  const tree = buildTree(h);
  const z = 8 - i * 4.2;
  const x = side * (30 + (i % 3) * 9);
  tree.position.set(x, GROUND_Y, z);
  scene.add(tree);
  groveTrees.push({ tree, ph: i * 1.3, amp: 0.012 + (i % 3) * 0.004 });
}
// camera-collision occluders + ray (keeps the camera out of the foliage)
const treeOccluders = groveTrees.map((g) => g.tree);
const camRay = new THREE.Raycaster();
const _camTarget = new THREE.Vector3(), _camPos = new THREE.Vector3(), _camDir = new THREE.Vector3(), _aimGoal = new THREE.Vector3();

// drifting leaves — gentle ambient motion through the canopy
const leafPGeo = new THREE.SphereGeometry(0.16, 6, 6);
const LEAF_COLORS = [0x4caf50, 0x66bb5a, 0xffb070, 0x9a8a3a];
const leafParticles = [];
for (let i = 0; i < 30; i++) {
  const m = new THREE.Mesh(leafPGeo, toonMat(LEAF_COLORS[i % LEAF_COLORS.length]));
  m.scale.set(1.5, 0.35, 1);
  m.position.set((Math.random() - 0.5) * 50, GROUND_Y + Math.random() * 40, 12 - Math.random() * 110);
  scene.add(m);
  leafParticles.push({ mesh: m, fall: 1.2 + Math.random() * 1.4, ph: Math.random() * 7, spin: (Math.random() - 0.5) * 2 });
}

// a river winding across the forest floor
const river = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 460),
  new THREE.MeshStandardMaterial({ color: 0x3a78c0, transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.1 })
);
river.rotation.x = -Math.PI / 2;
river.position.set(-22, GROUND_Y + 0.1, -45);
scene.add(river);

// fireflies — shown only on the night summit
const fireflies = new THREE.Group();
const ffGeo = new THREE.SphereGeometry(0.12, 6, 6);
const ffMat = new THREE.MeshBasicMaterial({ color: 0xffee66 });
const ffList = [];
for (let i = 0; i < 44; i++) {
  const m = new THREE.Mesh(ffGeo, ffMat);
  m.position.set((Math.random() - 0.5) * 44, 1 + Math.random() * 16, 12 - Math.random() * 110);
  fireflies.add(m);
  ffList.push({ m, ph: Math.random() * 7, sp: 0.5 + Math.random(), base: m.position.clone() });
}
fireflies.visible = false;
scene.add(fireflies);

// a few high clouds for depth
for (let i = 0; i < 7; i++) {
  const cloud = new THREE.Group();
  const a = i * 2.39, r = 100 + (i % 5) * 14;
  for (let j = 0; j < 4; j++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(3 + (j % 2), 10, 10), toonMat(0xffffff));
    puff.position.set((j - 1.5) * 3, Math.sin(j) * 1.2, 0);
    cloud.add(puff);
  }
  cloud.position.set(Math.cos(a) * r, 40 + (i % 4) * 6, Math.sin(a) * r - 40);
  scene.add(cloud);
}

// ---------------------------------------------------------------------------
// Characters (built once, repositioned per stage)
// ---------------------------------------------------------------------------
const monkey = buildMonkey();
const chimp = buildChimp();
scene.add(monkey, chimp);

const PLAYER = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  radius: 0.45, height: 1.7, onGround: false, groundPlat: null, facing: 0,
  jumpsLeft: 1,   // air jumps available (Monkey Flip)
  dashTimer: 0,   // >0 while dashing
  dashCD: 0,      // dash cooldown remaining
  dashDir: new THREE.Vector3(),
  flipT: 0,       // double-jump flip animation timer
  gliding: false,
  coyote: 0,      // grace window to still jump just after leaving ground
  jumpBuf: 0,     // buffered jump press, fires on landing
  squash: 1,      // squash & stretch scale factor
  swing: null,    // {anchor, L, angle, angVel, pdir} while swinging on a vine
  swingCD: 0,     // cooldown before re-grabbing a vine
};
const GRAVITY = -32, MOVE_SPEED = 9, JUMP_VEL = 12.5, AIR_CONTROL = 0.6;
const DASH_SPEED = 22, DASH_TIME = 0.2, DASH_COOLDOWN = 1.3, GLIDE_FALL = -3.2;
const COYOTE = 0.1, JUMP_BUFFER = 0.12;
const FALL_Y = -14; // fall this far below the branches -> respawn (floor sits lower)

// game-feel state
let shake = 0, fov = 70, fovTarget = 70, timeScale = 1;
// run-state: paused + the dramatic "caught" sequence
let paused = false, caughtT = 0, pauseAt = 0;
let lookSens = 0.0022;

// ---------------------------------------------------------------------------
// Persistence — best time + medal per stage, in localStorage
// ---------------------------------------------------------------------------
const SAVE_KEY = 'monkey-escape-v1';
let best = { times: {}, bananas: 0 };
try { best = Object.assign(best, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); best.times = best.times || {}; } catch (_) {}
function saveBest() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(best)); } catch (_) {} }
function medalFor(i, time) {
  const par = STAGES[i].par ?? 30;
  if (time <= par) return '🥇';
  if (time <= par * 1.5) return '🥈';
  if (time <= par * 2.2) return '🥉';
  return '';
}

// banana projectiles thrown at the chimp
const bananaGeo = new THREE.SphereGeometry(0.22, 8, 8);
const projectiles = [];

// ---------------------------------------------------------------------------
// Stage world (rebuilt on load)
// ---------------------------------------------------------------------------
const platGeo = new THREE.BoxGeometry(1, 1, 1);
const vineGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
const _UP = new THREE.Vector3(0, 1, 0);
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vd = new THREE.Vector3();
// stretch/orient a unit cylinder so it spans from top point a down to b
function orientVine(mesh, ax, ay, az, bx, by, bz) {
  _va.set(ax, ay, az); _vb.set(bx, by, bz);
  _vd.subVectors(_vb, _va);
  const len = _vd.length();
  mesh.position.copy(_va).addScaledVector(_vd, 0.5);
  mesh.scale.y = len;
  mesh.quaternion.setFromUnitVectors(_UP, _vd.normalize());
}
let platforms = [], checkpoints = [], goalPlat = null, bananas = [], swingAnchors = [];
let stageIndex = 0, lastCheckpoint = null, stageStartT = 0, finished = false, running = false;
let score = 0; // total bananas collected across the run
let lastCpIndex = 0, cpRewarded = false; // the banana-tree checkpoint + its reward

// Chimp chase state
const chimp_s = {
  trail: [],            // breadcrumbs of player route
  target: 0,            // index in trail chimp heads toward
  pos: new THREE.Vector3(),
  active: false,
  speed: 7.2,
  dist: 99,             // current distance to player
  stun: 0,              // seconds of banana-stun remaining
  stuckT: 0,            // time spent making no progress (anti-stall)
};

// Sparkle particles (banana collect, stage clear) — tiny additive spheres.
const sparkGeo = new THREE.SphereGeometry(0.12, 6, 6);
const sparks = [];
function burst(pos, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(pos);
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize();
    scene.add(m);
    sparks.push({ mesh: m, vel: dir.multiplyScalar(4 + Math.random() * 3), life: 0.6 });
  }
}
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    if (s.life <= 0) { scene.remove(s.mesh); sparks.splice(i, 1); continue; }
    s.vel.y -= 9 * dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    s.mesh.scale.setScalar(Math.max(0.05, s.life / 0.6));
    s.mesh.material.opacity = s.life / 0.6;
  }
}

// Throw a banana toward the chimp (or straight ahead) — stuns on hit.
function throwBanana() {
  const mesh = new THREE.Mesh(bananaGeo, new THREE.MeshBasicMaterial({ color: 0xffe23d }));
  mesh.position.copy(PLAYER.pos);
  scene.add(mesh);
  const dir = new THREE.Vector3();
  if (chimp_s.active) dir.subVectors(chimp_s.pos, PLAYER.pos).normalize();
  else dir.copy(forward).negate();
  const v = dir.multiplyScalar(26); v.y += 5; // slight arc
  projectiles.push({ mesh, vel: v, life: 2.5 });
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt; p.vel.y -= 30 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += dt * 12;
    let hit = false;
    if (chimp_s.active && chimp_s.stun <= 0 && p.mesh.position.distanceTo(chimp_s.pos) < 1.7) {
      chimp_s.stun = 2.5; sfx.stun(); burst(chimp_s.pos, 0xffe23d, 16); hit = true;
    }
    if (hit || p.life <= 0 || p.mesh.position.y < FALL_Y) { scene.remove(p.mesh); projectiles.splice(i, 1); }
  }
}

function clearStageMeshes() {
  for (const p of platforms) {
    scene.remove(p.mesh);
    if (p.decor) scene.remove(p.decor);
    if (p.rig) { scene.remove(p.rig.beam); for (const v of p.rig.vines) scene.remove(v.mesh); }
  }
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  for (const b of bananas) scene.remove(b.mesh);
  bananas = [];
  for (const a of swingAnchors) scene.remove(a.mesh);
  swingAnchors = [];
}

function loadStage(i) {
  clearStageMeshes();
  const stage = STAGES[i];
  const horizon = new THREE.Color(stage.sky);
  scene.fog.color.copy(horizon);
  skyUniforms.bottom.value.copy(horizon);
  skyUniforms.top.value.copy(horizon).multiplyScalar(0.55); // darker zenith
  platforms = []; checkpoints = []; goalPlat = null;

  const tint = stage.leaf ?? 0x4caf50;
  lastCpIndex = Math.max(0, ...stage.platforms.filter(p => p.checkpoint !== undefined).map(p => p.checkpoint));
  cpRewarded = false;
  for (const def of stage.platforms) {
    const h = def.h ?? 1;
    // kind drives the look. Moving platforms become vine-hung planks that SWING
    // (a real pendulum), not free-floating branches that twist in the air.
    const kind = def.goal ? 'goal' : def.bounce ? 'mushroom'
      : def.checkpoint !== undefined ? 'nest' : def.move ? 'hang' : 'branch';

    const surfaceColor = { branch: 0x7a5a36, nest: tint, goal: 0xffd23f, mushroom: 0xe2433a, hang: 0x6f4f30 }[kind];
    const mat = toonMat(surfaceColor);
    if (kind === 'goal') { mat.emissive = new THREE.Color(0xffae00); mat.emissiveIntensity = 0.6; }
    const mesh = new THREE.Mesh(platGeo, mat);
    mesh.scale.set(def.w, h, def.d);
    mesh.position.set(def.x, def.y, def.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (kind === 'mushroom' || kind === 'hang') mesh.visible = false; // a model stands in for the box
    scene.add(mesh);

    const p = {
      mesh, def, h, base: new THREE.Vector3(def.x, def.y, def.z),
      half: new THREE.Vector3(def.w / 2, h / 2, def.d / 2),
      top: def.y + h / 2, prevPos: new THREE.Vector3(def.x, def.y, def.z),
      vel: new THREE.Vector3(), goal: !!def.goal, rig: null,
    };

    // decor group origin = center of the walking surface
    const decor = new THREE.Group();
    decor.position.set(def.x, p.top, def.z);
    if (kind === 'mushroom') decor.add(buildMushroom(def.w, def.d));
    else if (kind === 'nest') decor.add(buildLeafNest(def.w, def.d, tint));
    else if (kind === 'hang') decor.add(buildHangingPlatform(def.w, def.d));
    else if (kind === 'goal') {
      decor.add(buildLeafNest(def.w, def.d, 0xffe06a));
      decor.add(buildBananaTree(1.8, true)); // the finish: a grand banana tree
    }
    else decor.add(buildBranch(def.w, def.d, tint));
    // the final checkpoint of the stage grows a banana tree (reward platform)
    if (def.checkpoint === lastCpIndex && lastCpIndex > 0) {
      const tree = buildBananaTree();
      tree.position.set(0, 0, def.d * 0.28); // at the back, clear of the path
      decor.add(tree);
    }
    // hanging vine off some branches for jungle flavor
    if (kind === 'branch' && platforms.length % 2 === 0) {
      const vine = buildVine(2.5 + (platforms.length % 3));
      vine.position.set(def.w * 0.34, -h / 2, -def.d * 0.2);
      decor.add(vine);
    }
    scene.add(decor);
    p.decor = decor;

    // suspension rig for swinging platforms: a fixed beam above + 2 vines
    if (kind === 'hang') {
      const anchorY = def.y + 8;
      const offs = def.w * 0.42;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, def.w * 1.2, 7), toonMat(0x6b4a2f)
      );
      beam.rotation.z = Math.PI / 2;
      beam.position.set(def.x, anchorY + 0.2, def.z);
      scene.add(beam);
      const vines = [];
      for (const ox of [-offs, offs]) {
        const v = new THREE.Mesh(vineGeo, toonMat(0x4f7a3a));
        scene.add(v);
        vines.push({ mesh: v, ox });
      }
      p.rig = { beam, vines, anchorY };
    }

    platforms.push(p);
    if (def.checkpoint !== undefined && def.checkpoint !== 0)
      checkpoints.push({ pos: new THREE.Vector3(def.x, p.top + 1.0, def.z), index: def.checkpoint });
    if (def.goal) goalPlat = p;
  }

  // spawn = first platform top + checkpoint 0
  const spawn = platforms[0];
  const spawnPos = new THREE.Vector3(spawn.base.x, spawn.top + 1.0, spawn.base.z);
  checkpoints.unshift({ pos: spawnPos.clone(), index: 0 });
  lastCheckpoint = checkpoints[0];


  // bananas
  for (const def of (stage.bananas ?? [])) {
    const mesh = buildBanana();
    mesh.position.set(def.x, def.y, def.z);
    scene.add(mesh);
    bananas.push({ mesh, pos: new THREE.Vector3(def.x, def.y, def.z), taken: false });
  }

  // swing vines
  for (const sv of (stage.swings ?? [])) {
    const L = sv.L ?? 5;
    const vine = buildVine(L);
    vine.position.set(sv.x, sv.y, sv.z);
    scene.add(vine);
    swingAnchors.push({ pos: new THREE.Vector3(sv.x, sv.y, sv.z), L, mesh: vine });
  }

  // reset player + chimp + skills
  PLAYER.pos.copy(spawnPos); PLAYER.vel.set(0, 0, 0);
  PLAYER.jumpsLeft = 1; PLAYER.dashTimer = 0; PLAYER.dashCD = 0; PLAYER.flipT = 0; PLAYER.gliding = false;
  PLAYER.swing = null; PLAYER.swingCD = 0; PLAYER.coyote = 0; PLAYER.jumpBuf = 0; PLAYER.squash = 1;
  monkey.rotation.set(0, 0, 0);
  chimp_s.trail = [spawnPos.clone()];
  chimp_s.target = 0;
  chimp_s.pos.copy(spawnPos).add(new THREE.Vector3(0, 0, 6)); // behind start
  chimp_s.active = false; chimp_s.stun = 0; chimp_s.stuckT = 0;
  chimp_s.speed = stage.chimpSpeed;
  chimp.position.copy(chimp_s.pos);
  monkey.position.copy(PLAYER.pos);

  stageStartT = clock.elapsedTime;
  finished = false; running = false; started = false; paused = false; caughtT = 0; timeScale = 1;
  bigText.style.opacity = '0';
  chimp.scale.setScalar(0.7 + i * 0.04); // chimp grows bigger/scarier each stage
  fireflies.visible = (i === STAGES.length - 1); // night summit
  hudStage.textContent = `Stage ${i + 1}/${STAGES.length} · ${stage.name}`;
  hudCp.textContent = 'Checkpoint 0';
}

function respawn() {
  PLAYER.pos.copy(lastCheckpoint.pos);
  PLAYER.vel.set(0, 0, 0);
}

// The chimp grabs you — slow-mo + roar + "Gotcha!", then restart after a beat.
function triggerCaught() {
  if (caughtT > 0 || finished) return;
  caughtT = 1.1;
  sfx.roar(); sfx.caught(); flashCaught();
  shake = 1.3;
  PLAYER.swing = null;
  bigText.textContent = '😱 Gotcha!';
  bigText.style.opacity = '1';
}

// Reset the stage from the start pad (called when the catch sequence ends).
function restartStage() {
  burst(PLAYER.pos, 0xff5050, 20);
  bigText.style.opacity = '0';
  const spawn = checkpoints[0].pos;
  PLAYER.pos.copy(spawn); PLAYER.vel.set(0, 0, 0);
  lastCheckpoint = checkpoints[0];
  hudCp.textContent = 'Checkpoint 0';
  // re-collectable bananas, refund any taken this life
  let takenNow = 0;
  for (const b of bananas) { if (b.taken) takenNow++; b.taken = false; b.mesh.visible = true; }
  score -= takenNow; updateScore();
  // reset chimp: behind the start, head start again
  chimp_s.trail = [spawn.clone()];
  chimp_s.target = 0;
  chimp_s.pos.copy(spawn).add(new THREE.Vector3(0, 0, 6));
  chimp_s.active = false; chimp_s.stun = 0; chimp_s.stuckT = 0;
  chimp.position.copy(chimp_s.pos);
  PLAYER.jumpsLeft = 1; PLAYER.dashTimer = 0; PLAYER.flipT = 0; PLAYER.gliding = false;
  PLAYER.swing = null; PLAYER.swingCD = 0;
  for (const p of projectiles) scene.remove(p.mesh); projectiles.length = 0;
  stageStartT = clock.elapsedTime; // restart the timer + head-start window
}

function updateScore() { hudScore.textContent = `🍌 ${score}`; }

function doJump(isDouble) {
  if (isDouble) { PLAYER.vel.y = JUMP_VEL * 0.95; PLAYER.jumpsLeft--; PLAYER.flipT = 0.45; sfx.flip(); }
  else { PLAYER.vel.y = JUMP_VEL; sfx.jump(); }
  PLAYER.onGround = false; PLAYER.coyote = 0;
  PLAYER.squash = 1.28; // stretch up on launch
}

// puff of dust at the player's feet on a hard landing
function dust(pos) {
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xb9a07a, transparent: true }));
    m.position.set(pos.x, pos.y - PLAYER.height / 2, pos.z);
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.25, Math.random() - 0.5).normalize();
    scene.add(m);
    sparks.push({ mesh: m, vel: dir.multiplyScalar(2.5 + Math.random() * 2), life: 0.45 });
  }
}

// ---------------------------------------------------------------------------
// Vine swinging — auto-grab a nearby hanging vine, swing as a pendulum, jump to launch
// ---------------------------------------------------------------------------
const _rel = new THREE.Vector3(), _tan = new THREE.Vector3();
function tryGrabSwing() {
  if (PLAYER.swingCD > 0) return;
  for (const a of swingAnchors) {
    const gx = a.pos.x, gz = a.pos.z, gy = a.pos.y - a.L; // grab point (vine end)
    const dx = PLAYER.pos.x - gx, dy = PLAYER.pos.y - gy, dz = PLAYER.pos.z - gz;
    if (dx * dx + dy * dy + dz * dz > 6.25) continue; // within 2.5m
    // swing plane = horizontal direction of travel (fallback to facing)
    const pdir = new THREE.Vector3(PLAYER.vel.x, 0, PLAYER.vel.z);
    if (pdir.lengthSq() < 1) pdir.set(Math.sin(PLAYER.facing + Math.PI), 0, Math.cos(PLAYER.facing + Math.PI));
    pdir.normalize();
    _rel.set(PLAYER.pos.x - a.pos.x, PLAYER.pos.y - a.pos.y, PLAYER.pos.z - a.pos.z);
    const horiz = _rel.x * pdir.x + _rel.z * pdir.z;
    const angle = Math.atan2(horiz, -_rel.y);
    _tan.set(pdir.x * Math.cos(angle), Math.sin(angle), pdir.z * Math.cos(angle));
    const angVel = (PLAYER.vel.x * _tan.x + PLAYER.vel.y * _tan.y + PLAYER.vel.z * _tan.z) / a.L;
    PLAYER.swing = { anchor: a.pos, L: a.L, pdir, angle, angVel };
    sfx.grab();
    return;
  }
}
function updateSwing(dt) {
  const s = PLAYER.swing;
  s.angVel += (-(34 / s.L) * Math.sin(s.angle)) * dt; // pendulum + a touch of drive
  s.angVel *= 0.999;
  s.angle += s.angVel * dt;
  PLAYER.pos.set(
    s.anchor.x + s.pdir.x * s.L * Math.sin(s.angle),
    s.anchor.y - s.L * Math.cos(s.angle),
    s.anchor.z + s.pdir.z * s.L * Math.sin(s.angle)
  );
  const v = s.L * s.angVel; // tangential speed
  PLAYER.vel.set(s.pdir.x * Math.cos(s.angle) * v, Math.sin(s.angle) * v, s.pdir.z * Math.cos(s.angle) * v);
  PLAYER.onGround = false;
}
function releaseSwing() {
  PLAYER.vel.y += 3.5;          // a little hop off the vine
  PLAYER.swing = null;
  PLAYER.swingCD = 0.5; PLAYER.jumpsLeft = 1; PLAYER.coyote = 0;
  sfx.jump();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = {};
const justPressed = new Set(); // edge-triggered presses, cleared each frame
const SCROLLERS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
window.addEventListener('keydown', (e) => {
  if (!e.repeat) justPressed.add(e.code);
  keys[e.code] = true;
  if (SCROLLERS.includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM') { const m = toggleMute(); hudScore.title = m ? 'muted' : ''; }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

let yaw = 0, pitch = 0.18;
let started = false; // current stage run has begun
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const banner = document.getElementById('banner');

// Begin / resume gameplay for the current stage.
function beginPlay() {
  resumeAudio(); startMusic();
  banner.classList.add('hidden');
  if (!started && !finished) { started = true; running = true; stageStartT = clock.elapsedTime; }
  else if (paused) { running = true; paused = false; stageStartT += clock.elapsedTime - pauseAt; } // resume w/o timer jump
  hidePause();
}
function pauseGame() {
  if (!started || finished || paused || caughtT > 0) return;
  paused = true; running = false; pauseAt = clock.elapsedTime;
  showPause();
}

canvas.addEventListener('click', () => { if (banner.classList.contains('hidden') && !paused && !isTouch) canvas.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) beginPlay();
  else if (started && !finished && caughtT <= 0 && !paused) pauseGame(); // Esc / lock lost -> pause
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * lookSens;
  pitch = Math.max(-0.85, Math.min(0.85, pitch - e.movementY * lookSens));
});

// desktop locks the pointer; touch starts directly (no lock available)
function lockOrStart() { if (isTouch) beginPlay(); else canvas.requestPointerLock(); }

// On-screen joystick + buttons for touch devices.
const touchMove = new THREE.Vector2(0, 0);
let lookId = null, lastLX = 0, lastLY = 0;
if (isTouch) setupTouch();
function setupTouch() {
  const ui = document.getElementById('touchui'); ui.style.display = 'block';
  const sk = document.getElementById('skills'); if (sk) sk.style.display = 'none';
  const joy = document.getElementById('joystick'), knob = document.getElementById('stick');
  let joyId = null, jcx = 0, jcy = 0; const R = 55;
  joy.addEventListener('pointerdown', (e) => {
    joyId = e.pointerId; const r = joy.getBoundingClientRect();
    jcx = r.left + r.width / 2; jcy = r.top + r.height / 2; joy.setPointerCapture(e.pointerId);
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - jcx, dy = e.clientY - jcy;
    const len = Math.hypot(dx, dy) || 1, cl = Math.min(len, R);
    dx = dx / len * cl; dy = dy / len * cl;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    touchMove.set(dx / R, dy / R);
  });
  const endJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; knob.style.transform = 'translate(0,0)'; touchMove.set(0, 0); };
  joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);

  // look: drag on the right ~60% of the screen
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.clientX < window.innerWidth * 0.4) return;
    lookId = e.pointerId; lastLX = e.clientX; lastLY = e.clientY;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    yaw -= (e.clientX - lastLX) * lookSens * 1.3;
    pitch = Math.max(-0.85, Math.min(0.85, pitch - (e.clientY - lastLY) * lookSens * 1.3));
    lastLX = e.clientX; lastLY = e.clientY;
  });
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
  canvas.addEventListener('pointerup', endLook); canvas.addEventListener('pointercancel', endLook);

  const bindBtn = (id, down, up) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); down(); });
    if (up) el.addEventListener('pointerup', (e) => { e.preventDefault(); up(); });
  };
  bindBtn('btnJump', () => { justPressed.add('Space'); keys['Space'] = true; }, () => { keys['Space'] = false; });
  bindBtn('btnDash', () => justPressed.add('ShiftLeft'));
  bindBtn('btnThrow', () => justPressed.add('KeyE'));
  bindBtn('btnPause', () => { paused ? beginPlay() : pauseGame(); });
}

// HUD
const timerEl = document.getElementById('timer');
const hudStage = document.getElementById('stage');
const hudCp = document.getElementById('checkpoint');
const hudScore = document.getElementById('score');
const hudDanger = document.getElementById('danger');
const vignette = document.getElementById('vignette');
const bigText = document.getElementById('bigtext');
const goalArrow = document.getElementById('goalarrow');

function flashCaught() {
  vignette.style.opacity = '1';
  setTimeout(() => { vignette.style.opacity = '0'; }, 350);
}

// Pause / settings overlay
const pauseEl = document.getElementById('pause');
function showPause() {
  pauseEl.innerHTML = `
    <h1>⏸ Paused</h1>
    <label>Volume <input id="vol" type="range" min="0" max="1" step="0.05" value="${audioVol}"></label>
    <label>Look sensitivity <input id="sens" type="range" min="0.5" max="2.5" step="0.1" value="${lookSens / 0.0022}"></label>
    <div class="btnrow">
      <button id="resume">Resume</button>
      <button id="prestart" class="ghost">Restart stage</button>
      <button id="pmenu" class="ghost">↩ Levels</button>
    </div>`;
  pauseEl.style.display = 'flex';
  document.getElementById('vol').addEventListener('input', (e) => { audioVol = +e.target.value; setVolume(audioVol); });
  document.getElementById('sens').addEventListener('input', (e) => { lookSens = 0.0022 * +e.target.value; });
  document.getElementById('resume').addEventListener('click', () => lockOrStart());
  document.getElementById('prestart').addEventListener('click', () => { hidePause(); paused = false; loadStage(stageIndex); lockOrStart(); });
  document.getElementById('pmenu').addEventListener('click', () => { hidePause(); paused = false; started = false; showMenu(); });
}
function hidePause() { pauseEl.style.display = 'none'; }
let audioVol = 1;

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------
function updatePlatforms(t) {
  for (const p of platforms) {
    p.prevPos.copy(p.mesh.position);
    const m = p.def.move;
    if (m && p.rig && m.axis !== 'y') {
      // pendulum: swings along an arc about the beam, so it dips at the bottom
      // of the swing and rises at the ends (gravity-driven up/down + side-to-side)
      const L = p.rig.anchorY - p.base.y;               // vine length
      const omega = Math.sqrt(30 / L);                   // ω = √(g/L)
      const theta0 = Math.min(0.95, m.amp / L);          // swing amplitude (rad)
      const theta = theta0 * Math.sin(t * omega + (m.phase ?? 0));
      p.mesh.position.copy(p.base);
      p.mesh.position[m.axis] = p.base[m.axis] + L * Math.sin(theta);
      p.mesh.position.y = p.rig.anchorY - L * Math.cos(theta);
      p.top = p.mesh.position.y + p.h / 2;
    } else if (m) {
      const off = Math.sin(t * m.speed + (m.phase ?? 0)) * m.amp;
      p.mesh.position.copy(p.base);
      p.mesh.position[m.axis] += off;
      p.top = p.mesh.position.y + p.h / 2;
    }
    p.vel.subVectors(p.mesh.position, p.prevPos);
    if (p.decor) p.decor.position.set(p.mesh.position.x, p.top, p.mesh.position.z); // surface rides the platform
    if (p.rig) {
      // vines stay anchored to the fixed beam above and follow the swinging plank
      const mx = p.mesh.position.x, mz = p.mesh.position.z, ay = p.rig.anchorY;
      for (const v of p.rig.vines) {
        orientVine(v.mesh, p.base.x + v.ox, ay, p.base.z, mx + v.ox, p.top + 0.1, mz);
      }
    }
  }
}

function collide(plat) {
  const pr = PLAYER.radius, halfH = PLAYER.height / 2;
  const c = PLAYER.pos, m = plat.mesh.position;
  const hx = plat.half.x, hy = plat.half.y, hz = plat.half.z;
  const minX = m.x - hx - pr, maxX = m.x + hx + pr;
  const minZ = m.z - hz - pr, maxZ = m.z + hz + pr;
  const minY = m.y - hy - halfH, maxY = m.y + hy + halfH;
  if (c.x < minX || c.x > maxX || c.z < minZ || c.z > maxZ || c.y < minY || c.y > maxY) return;

  const dx = c.x < m.x ? c.x - minX : c.x - maxX;
  const dz = c.z < m.z ? c.z - minZ : c.z - maxZ;
  const dy = c.y < m.y ? c.y - minY : c.y - maxY;
  const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);

  if (ay <= ax && ay <= az) {
    if (c.y > m.y) {
      c.y = maxY;
      if (PLAYER.vel.y <= 0) {
        if (plat.def.bounce) {
          PLAYER.vel.y = plat.def.bounce; // jump pad launch
          sfx.bounce();
        } else {
          PLAYER.vel.y = 0; PLAYER.onGround = true; PLAYER.groundPlat = plat;
        }
      }
    } else { c.y = minY; if (PLAYER.vel.y > 0) PLAYER.vel.y = 0; }
  } else if (ax <= az) {
    c.x = c.x < m.x ? minX : maxX;
  } else {
    c.z = c.z < m.z ? minZ : maxZ;
  }
}

// ---------------------------------------------------------------------------
// Chimp chase — follows the player's route, but smart:
//   · corner-cuts the breadcrumb trail instead of snaking every node
//   · predicts where the player is heading and aims ahead of them
//   · rubber-bands faster when far behind, eases off when very close
//   · grows angrier (faster) the longer the chase runs
//   · lunges for the catch at point-blank range
// ---------------------------------------------------------------------------
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();

function updateChimp(dt, t, sinceStageStart) {
  const stage = STAGES[stageIndex];
  if (!chimp_s.active && sinceStageStart > stage.chimpHeadStart && !finished)
    chimp_s.active = true;

  const trail = chimp_s.trail;
  const last = trail[trail.length - 1];
  if (PLAYER.pos.distanceTo(last) > 1.0) trail.push(PLAYER.pos.clone()); // dense path

  if (!chimp_s.active) { chimp.position.copy(chimp_s.pos); return 0; }

  // stunned by a thrown banana — dazed and stationary
  if (chimp_s.stun > 0) {
    chimp_s.stun -= dt;
    chimp_s.dist = chimp_s.pos.distanceTo(PLAYER.pos);
    chimp.position.copy(chimp_s.pos);
    chimp.rotation.z = Math.sin(t * 30) * 0.3; // dizzy wobble
    return 0;
  }
  chimp.rotation.z = 0;

  const dPlayer = chimp_s.pos.distanceTo(PLAYER.pos);
  chimp_s.dist = dPlayer;

  // --- progress along the trail: monotonic, and skip nodes we've passed ------
  let ti = chimp_s.target;
  // 1) consume any node we've effectively reached
  while (ti < trail.length - 1 && chimp_s.pos.distanceTo(trail[ti]) < 2.2) ti++;
  // 2) shortcut: if a later node (within a small window) is closer, jump to it —
  //    keeps the chimp moving forward instead of snaking back to a stale node
  let bestI = ti, bestD = chimp_s.pos.distanceTo(trail[ti]);
  for (let k = ti + 1; k < trail.length && k <= ti + 12; k++) {
    const dk = chimp_s.pos.distanceTo(trail[k]);
    if (dk < bestD) { bestD = dk; bestI = k; }
  }
  ti = Math.max(ti, bestI);
  chimp_s.target = ti;

  // direct line of sight to the player? (close & roughly level) -> beeline, cut the trail
  const losToPlayer = dPlayer < 11 && Math.abs(chimp_s.pos.y - PLAYER.pos.y) < 3.5;
  const nodesLeft = trail.length - 1 - ti;

  // --- aim: pursue the player directly (with prediction) when in sight or near
  // the end of the trail; otherwise chase a short lookahead along the path -----
  if (losToPlayer || nodesLeft <= 2) {
    const lead = Math.min(0.7, dPlayer / Math.max(5, chimp_s.speed));
    _aim.copy(PLAYER.vel).multiplyScalar(lead).add(PLAYER.pos);
  } else {
    _aim.copy(trail[Math.min(ti + 1, trail.length - 1)]); // small lookahead = smooth
  }

  // --- speed: anger ramp + strong rubber-band + lunge, with a hard floor so it
  // NEVER crawls/stalls (relentless, continuous pursuit) ----------------------
  let spd = chimp_s.speed * (1 + Math.min(0.6, sinceStageStart * 0.015)); // gets angrier
  if (dPlayer > 16) spd *= 1.7;
  else if (dPlayer > 9) spd *= 1.35;
  else if (dPlayer > 5) spd *= 1.12;
  if (dPlayer < 2.6) spd *= 1.4; // lunge for the grab
  spd = Math.max(spd, chimp_s.speed * 0.85);

  _dir.subVectors(_aim, chimp_s.pos);
  const dist = _dir.length();
  let moved = 0;
  if (dist > 0.001) {
    _dir.multiplyScalar(1 / dist);
    const step = Math.min(spd * dt, dist);
    chimp_s.pos.addScaledVector(_dir, step);
    moved = step / dt;
    chimp.rotation.y = THREE.MathUtils.lerp(chimp.rotation.y, Math.atan2(-_dir.x, -_dir.z), 0.25);
  }
  chimp.position.copy(chimp_s.pos);

  // anti-stall: if it's barely moving but not near the player, jump its target
  // forward so it can never get permanently stuck on a node
  if (moved < spd * 0.25 && dPlayer > 3) chimp_s.stuckT += dt; else chimp_s.stuckT = 0;
  if (chimp_s.stuckT > 0.4) { chimp_s.target = Math.min(trail.length - 1, ti + 4); chimp_s.stuckT = 0; }

  // caught? -> dramatic catch sequence, then restart
  if (dPlayer < 1.3) { triggerCaught(); return 0; }
  return Math.min(1, moved / chimp_s.speed); // 0..1 walk amount
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const forward = new THREE.Vector3(), right = new THREE.Vector3();
let lastGrounded = false, stepTimer = 0, nearTimer = 0, lastFallVel = 0;

function tick() {
  requestAnimationFrame(tick);
  const realDt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // dramatic "caught" slow-mo, then restart when the beat ends
  timeScale = caughtT > 0 ? 0.28 : 1;
  if (caughtT > 0) { caughtT -= realDt; if (caughtT <= 0) restartStage(); }
  const dt = realDt * timeScale;

  const active = running && !paused && !finished && caughtT <= 0; // gameplay input live?
  const since = running ? t - stageStartT : 0;

  updatePlatforms(t);

  // movement input (camera-relative): keyboard + touch joystick
  forward.set(Math.sin(yaw), 0, Math.cos(yaw));
  right.set(forward.z, 0, -forward.x);
  const wish = new THREE.Vector3();
  if (active) {
    if (keys['KeyW'] || keys['ArrowUp']) wish.sub(forward);
    if (keys['KeyS'] || keys['ArrowDown']) wish.add(forward);
    if (keys['KeyD'] || keys['ArrowRight']) wish.add(right);
    if (keys['KeyA'] || keys['ArrowLeft']) wish.sub(right);
    if (touchMove.lengthSq() > 0.02) {
      wish.set(0, 0, 0).addScaledVector(forward, touchMove.y).addScaledVector(right, touchMove.x);
    }
  }
  if (wish.lengthSq() > 0) wish.normalize();

  const wantJump = active && justPressed.has('Space');
  PLAYER.dashCD = Math.max(0, PLAYER.dashCD - dt);
  PLAYER.coyote = Math.max(0, PLAYER.coyote - dt);
  PLAYER.jumpBuf = Math.max(0, PLAYER.jumpBuf - dt);
  PLAYER.swingCD = Math.max(0, PLAYER.swingCD - dt);

  // --- VINE SWINGING -------------------------------------------------------
  if (PLAYER.swing) {
    updateSwing(dt);
    if (wantJump) releaseSwing(); // jump off the vine -> launch
  } else {
    // auto-grab a nearby swing vine while airborne
    if (active && !PLAYER.onGround && PLAYER.dashTimer <= 0) tryGrabSwing();
  }

  if (!PLAYER.swing) {
    const control = PLAYER.onGround ? 1 : AIR_CONTROL;
    PLAYER.vel.x += (wish.x * MOVE_SPEED - PLAYER.vel.x) * control * Math.min(1, dt * 14);
    PLAYER.vel.z += (wish.z * MOVE_SPEED - PLAYER.vel.z) * control * Math.min(1, dt * 14);

    if (PLAYER.onGround && PLAYER.groundPlat && PLAYER.groundPlat.def.move)
      PLAYER.pos.add(PLAYER.groundPlat.vel);

    if (PLAYER.onGround) { PLAYER.jumpsLeft = 1; PLAYER.coyote = COYOTE; }

    // SKILL — Jump + Monkey Flip (double jump), with coyote time + buffering
    if (wantJump) {
      if (PLAYER.onGround || PLAYER.coyote > 0) doJump(false);
      else if (PLAYER.jumpsLeft > 0) doJump(true);
      else PLAYER.jumpBuf = JUMP_BUFFER; // remember it; fire on landing
    }

    // SKILL — Vine Dash (Shift)
    if (active && (justPressed.has('ShiftLeft') || justPressed.has('ShiftRight')) && PLAYER.dashCD <= 0) {
      PLAYER.dashDir.copy(wish.lengthSq() > 0 ? wish : forward.clone().negate()).setY(0).normalize();
      PLAYER.dashTimer = DASH_TIME; PLAYER.dashCD = DASH_COOLDOWN; sfx.dash();
      fovTarget = 84; burst(PLAYER.pos, 0x9fe6ff, 8);
    }

    // SKILL — Banana Throw (E/F)
    if (active && (justPressed.has('KeyE') || justPressed.has('KeyF')) && score > 0) {
      score--; updateScore(); sfx.throw(); throwBanana();
    }

    PLAYER.vel.y += GRAVITY * dt;

    if (PLAYER.dashTimer > 0) {
      PLAYER.dashTimer -= dt;
      PLAYER.vel.x = PLAYER.dashDir.x * DASH_SPEED;
      PLAYER.vel.z = PLAYER.dashDir.z * DASH_SPEED;
      if (PLAYER.vel.y < 0) PLAYER.vel.y *= 0.6;
    }

    // SKILL — Glide
    PLAYER.gliding = active && !PLAYER.onGround && keys['Space'] && PLAYER.vel.y < GLIDE_FALL && PLAYER.dashTimer <= 0;
    if (PLAYER.gliding) PLAYER.vel.y = GLIDE_FALL;

    PLAYER.onGround = false; PLAYER.groundPlat = null;
    PLAYER.pos.x += PLAYER.vel.x * dt;
    PLAYER.pos.z += PLAYER.vel.z * dt;
    PLAYER.pos.y += PLAYER.vel.y * dt;
    for (const plat of platforms) collide(plat);
  }

  // landing: sound + squash + dust + screen shake + buffered jump
  if (PLAYER.onGround && !lastGrounded && running) {
    sfx.land();
    const impact = Math.min(1, Math.abs(lastFallVel) / 18);
    PLAYER.squash = 1 - 0.35 * impact;        // squash on touchdown
    if (impact > 0.4) { shake = Math.max(shake, impact * 0.5); dust(PLAYER.pos); }
    if (PLAYER.jumpBuf > 0) { doJump(false); PLAYER.jumpBuf = 0; }
  }
  lastFallVel = PLAYER.vel.y;
  lastGrounded = PLAYER.onGround;

  // footsteps while running on the ground
  if (running && PLAYER.onGround && PLAYER.vel.x * PLAYER.vel.x + PLAYER.vel.z * PLAYER.vel.z > 4) {
    stepTimer -= dt;
    if (stepTimer <= 0) { sfx.step(); stepTimer = 0.32; }
  }

  // checkpoints
  for (const cp of checkpoints)
    if (cp.index > lastCheckpoint.index && PLAYER.pos.distanceTo(cp.pos) < 4) {
      lastCheckpoint = cp; hudCp.textContent = `Checkpoint ${cp.index}`;
      // reaching the banana-tree checkpoint pays out 5 bananas (once per stage)
      if (cp.index === lastCpIndex && !cpRewarded) {
        cpRewarded = true; score += 5; updateScore();
        sfx.clear(); burst(cp.pos, 0xffe23d, 22);
        hudCp.textContent = '🍌 Banana Tree! +5';
      }
    }

  // bananas: bob, spin, collect
  for (const b of bananas) {
    if (b.taken) continue;
    b.mesh.rotation.y += dt * 2.2;
    b.mesh.position.y = b.pos.y + Math.sin(t * 2 + b.pos.x) * 0.2;
    if (PLAYER.pos.distanceTo(b.pos) < 1.5) {
      b.taken = true; b.mesh.visible = false; score++; updateScore();
      sfx.collect(); burst(b.pos, 0xffe23d);
    }
  }

  // goal -> next stage / win
  if (!finished && goalPlat && PLAYER.onGround && PLAYER.groundPlat === goalPlat)
    completeStage(since);

  if (PLAYER.pos.y < FALL_Y) respawn();

  // chimp (only chases during active play)
  const chimpAmt = running && !finished && caughtT <= 0 ? updateChimp(dt, t, since) : 0;

  // tense cue + danger warning when the chimp is breathing down your neck
  nearTimer -= dt;
  const danger = running && !finished && chimp_s.active && chimp_s.dist < 6;
  if (danger && chimp_s.dist < 4.5 && nearTimer <= 0) { sfx.near(); nearTimer = 0.7; }
  hudDanger.style.opacity = danger ? '1' : '0';

  // music swells while the chimp is actively hunting
  setMusicIntensity(running && !finished && chimp_s.active);

  updateSparks(dt);
  updateProjectiles(dt);

  // ambient life: canopies sway, leaves drift down
  for (const g of groveTrees) g.tree.rotation.z = Math.sin(t * 0.5 + g.ph) * g.amp;
  for (const L of leafParticles) {
    L.mesh.position.y -= L.fall * dt;
    L.mesh.position.x += Math.sin(t * 0.7 + L.ph) * 0.5 * dt;
    L.mesh.rotation.z += L.spin * dt;
    if (L.mesh.position.y < GROUND_Y + 0.5) {
      L.mesh.position.set((Math.random() - 0.5) * 50, 30, 12 - Math.random() * 110);
    }
  }
  if (fireflies.visible) {
    for (const f of ffList) {
      f.m.position.x = f.base.x + Math.sin(t * f.sp + f.ph) * 1.5;
      f.m.position.y = f.base.y + Math.cos(t * f.sp * 0.8 + f.ph) * 1.0;
      f.m.scale.setScalar(0.6 + 0.5 * (Math.sin(t * 3 + f.ph) * 0.5 + 0.5)); // flicker
    }
  }

  // place + animate monkey, facing its horizontal velocity
  monkey.position.copy(PLAYER.pos);
  monkey.position.y -= PLAYER.height / 2; // feet on platform
  const speed2 = PLAYER.vel.x * PLAYER.vel.x + PLAYER.vel.z * PLAYER.vel.z;
  if (speed2 > 0.5) PLAYER.facing = Math.atan2(-PLAYER.vel.x, -PLAYER.vel.z);
  monkey.rotation.y = THREE.MathUtils.lerp(monkey.rotation.y, PLAYER.facing, 0.2);
  animateWalk(monkey, t, Math.min(1, Math.sqrt(speed2) / MOVE_SPEED));

  // squash & stretch — eases back to 1 each frame
  PLAYER.squash += (1 - PLAYER.squash) * Math.min(1, dt * 10);
  const sy = PLAYER.squash, sxz = 1 / Math.sqrt(sy);
  monkey.scale.set(0.55 * sxz, 0.55 * sy, 0.55 * sxz);

  // Monkey Flip spin during a double jump
  if (PLAYER.flipT > 0) { PLAYER.flipT -= dt; monkey.rotation.x = (1 - PLAYER.flipT / 0.45) * Math.PI * 2; }
  else monkey.rotation.x = 0;
  // Glide pose: arms spread wide
  const limbs = monkey.userData.limbs;
  if (limbs) {
    const spread = PLAYER.gliding ? 1.2 : 0;
    limbs.arms[0].rotation.z = spread; limbs.arms[1].rotation.z = -spread;
  }

  // chimp lunges onto the player during the catch sequence
  if (caughtT > 0) {
    chimp_s.pos.lerp(PLAYER.pos, Math.min(1, realDt * 6));
    chimp.rotation.y = Math.atan2(PLAYER.pos.x - chimp_s.pos.x, PLAYER.pos.z - chimp_s.pos.z);
  }
  chimp.position.copy(chimp_s.pos); chimp.position.y = chimp_s.pos.y - 1.2;
  animateWalk(chimp, t, chimp_s.active ? Math.max(0.4, chimpAmt) : 0);

  // camera orbit behind player (+ shake + dash FOV kick)
  shake = Math.max(0, shake - realDt * 3);
  fovTarget += (70 - fovTarget) * Math.min(1, realDt * 5);
  fov += (fovTarget - fov) * Math.min(1, realDt * 10);
  if (Math.abs(camera.fov - fov) > 0.02) { camera.fov = fov; camera.updateProjectionMatrix(); }

  const camOff = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)
  ).multiplyScalar(7);
  _camTarget.set(PLAYER.pos.x, PLAYER.pos.y + 1, PLAYER.pos.z);
  _camPos.copy(PLAYER.pos).add(camOff).add(_UP).add(_UP).add(_UP); // +3 up
  // pull the camera in if a tree blocks the line of sight (no black-out)
  _camDir.subVectors(_camPos, _camTarget);
  const wantDist = _camDir.length();
  _camDir.multiplyScalar(1 / wantDist);
  camRay.set(_camTarget, _camDir);
  camRay.far = wantDist;
  const camHits = camRay.intersectObjects(treeOccluders, true);
  const d = camHits.length ? Math.max(2, camHits[0].distance - 0.8) : wantDist;
  camera.position.copy(_camTarget).addScaledVector(_camDir, d);
  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.6;
    camera.position.y += (Math.random() - 0.5) * shake * 0.6;
  }
  camera.lookAt(_camTarget);
  sky.position.copy(camera.position); // sky dome rides with the camera

  // goal-direction compass arrow
  if (goalPlat && running && !finished) {
    _aimGoal.copy(goalPlat.base).project(camera);
    const behind = _aimGoal.z > 1;
    const ang = behind ? Math.atan2(-_aimGoal.y, -_aimGoal.x) : Math.atan2(_aimGoal.y, _aimGoal.x);
    const onScreen = !behind && Math.abs(_aimGoal.x) < 0.65 && Math.abs(_aimGoal.y) < 0.65;
    goalArrow.style.opacity = onScreen ? '0' : '0.8';
    goalArrow.style.transform = `translate(-50%,-50%) rotate(${-ang}rad)`;
  } else { goalArrow.style.opacity = '0'; }

  if (running && !finished) timerEl.textContent = since.toFixed(2);
  composer.render();
  justPressed.clear();
}

function completeStage(time) {
  finished = true; running = false; started = false;
  document.exitPointerLock();
  burst(PLAYER.pos, 0xffe23d, 24);
  // record best time + most bananas
  const prev = best.times[stageIndex];
  const isBest = prev === undefined || time < prev;
  if (isBest) best.times[stageIndex] = +time.toFixed(2);
  if (score > best.bananas) best.bananas = score;
  saveBest();
  const medal = medalFor(stageIndex, time);
  const bestStr = `Best ${best.times[stageIndex].toFixed(2)}s`;
  if (stageIndex < STAGES.length - 1) {
    sfx.clear();
    showBanner(`✅ Stage ${stageIndex + 1} clear! ${medal}`,
      `Time ${time.toFixed(2)}s · ${bestStr}${isBest ? ' — 🎉 new best!' : ''} · 🍌 ${score}`,
      'Next stage', () => { stageIndex++; loadStage(stageIndex); lockOrStart(); });
  } else {
    sfx.win();
    showBanner(`🏆 You got away! ${medal}`,
      `Escaped all ${STAGES.length} stages · last ${time.toFixed(2)}s · 🍌 ${score}`,
      'Play again', () => { stageIndex = 0; score = 0; updateScore(); loadStage(0); lockOrStart(); });
  }
}

// Start / level-select menu, built from the stage list (with best times + medals).
function showMenu() {
  banner.classList.remove('hidden');
  hidePause();
  const btns = STAGES.map((s, i) => {
    const bt = best.times[i];
    const sub = bt !== undefined ? `${medalFor(i, bt)} ${bt.toFixed(2)}s` : '—';
    return `<button class="lvl" data-i="${i}"><b>${i + 1}. ${s.name}</b><span>${sub}</span></button>`;
  }).join('');
  const ctrls = isTouch
    ? 'Joystick to move · buttons to jump / dash / throw 🍌 · drag to look'
    : 'WASD / ↑↓←→ move · Space jump (×2 flip) · hold Space glide · Shift dash · E throw 🍌 · Esc pause · M mute';
  banner.innerHTML = `
    <h1>🐵 Monkey Escape</h1>
    <p>You're a monkey fleeing a cranky chimpanzee through the treetops. Swing on vines, reach the big banana tree to clear each stage — get caught and it restarts.</p>
    <p style="margin-top:12px"><strong>Choose a level</strong> &nbsp;·&nbsp; best 🍌 ${best.bananas}</p>
    <div class="levels">${btns}</div>
    <p class="ctrls">${ctrls}</p>`;
  banner.querySelectorAll('.lvl').forEach((b) => b.addEventListener('click', () => {
    stageIndex = +b.dataset.i; score = 0; updateScore();
    loadStage(stageIndex);
    lockOrStart();
  }));
}

function showBanner(title, sub, btn, onClick) {
  banner.classList.remove('hidden');
  banner.innerHTML = `<h1>${title}</h1><p>${sub}</p>
    <div class="btnrow"><button id="cont">${btn}</button><button id="tomenu" class="ghost">↩ Levels</button></div>`;
  document.getElementById('tomenu').addEventListener('click', showMenu);
  document.getElementById('cont').addEventListener('click', onClick);
}

// ---------------------------------------------------------------------------
// Resize + boot
// ---------------------------------------------------------------------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
updateScore();
loadStage(0);
showMenu();
tick();
