import * as THREE from 'three';
import { part, toonMat } from './toon.js';

const LEAF = [0x4caf50, 0x3f9142, 0x66bb5a, 0x2f8b3a];
const BARK = 0x6b4a2f, BARK_DK = 0x523321;

function leaf(r, color, outline = 0.05) {
  const m = part(new THREE.SphereGeometry(r, 9, 9), color, outline);
  m.scale.y = 0.5;
  return m;
}

// ---------------------------------------------------------------------------
// Platform decorations. All builders return a Group whose origin sits at the
// CENTER OF THE PLATFORM TOP SURFACE (y = 0 is the walking surface).
// ---------------------------------------------------------------------------

// Default platform: a clean mossy branch-top — a tidy low leaf fringe around the
// rim, no protruding sticks or twigs (those read as random clutter).
export function buildBranch(w, d, tint) {
  const g = new THREE.Group();
  const col = tint ?? LEAF[1];
  const n = Math.max(7, Math.round((w + d) * 0.55));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const l = leaf(0.42, i % 4 === 0 ? LEAF[(i + 1) % LEAF.length] : col, 0.05);
    l.position.set(Math.cos(a) * w * 0.5, -0.08, Math.sin(a) * d * 0.5);
    g.add(l);
  }
  return g;
}

// Checkpoint platform: a safe leafy nest — a tidy fringe of small leaves around
// the rim (fixed leaf size, so big pads don't grow giant blobs) + little flowers.
export function buildLeafNest(w, d, tint) {
  const g = new THREE.Group();
  const col = tint ?? LEAF[0];
  const perim = (w + d) * 2;
  const n = Math.max(10, Math.round(perim * 0.7));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const l = leaf(0.6, i % 3 === 0 ? 0x3f9142 : col, 0.05);
    // ring the rim, alternating just inside/outside the edge
    const rx = w * 0.5 + (i % 2 ? 0.1 : -0.25);
    const rz = d * 0.5 + (i % 2 ? 0.1 : -0.25);
    l.position.set(Math.cos(a) * rx, -0.1, Math.sin(a) * rz);
    g.add(l);
  }
  for (let i = 0; i < 5; i++) {
    const a = i * 1.4;
    // pink / purple / orange — not yellow (≠ bananas) and not near-white (≠ bloom glow)
    const flower = part(new THREE.SphereGeometry(0.18, 8, 8), [0xff7ab0, 0xb265ff, 0xff6a3d][i % 3], 0.04);
    flower.position.set(Math.cos(a) * w * 0.3, 0.16, Math.sin(a) * d * 0.3);
    g.add(flower);
  }
  return g;
}

// A bunch of hanging bananas (a few yellow crescents fanned together).
function bananaBunch() {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const b = part(new THREE.TorusGeometry(0.22, 0.07, 8, 16, 2.1), 0xffe23d, 0.05);
    b.material.emissive = new THREE.Color(0xffd000);
    b.material.emissiveIntensity = 0.4;
    b.rotation.z = -1.0 + (i - 2) * 0.28;
    b.position.set((i - 2) * 0.12, 0, 0);
    g.add(b);
  }
  return g;
}

// A banana tree: trunk + canopy with bunches of bananas. `scale` grows the
// whole thing; the grand version (goal) gets more bunches and a glow.
export function buildBananaTree(scale = 1, grand = false) {
  const g = new THREE.Group();
  const trunkH = 3.4 * scale;
  const trunk = part(new THREE.CylinderGeometry(0.28 * scale, 0.4 * scale, trunkH, 8), BARK, 0.05);
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  const crownY = trunkH * 0.95;
  for (let i = 0; i < 5; i++) {
    const c = leaf((1.1 - i * 0.16) * scale, LEAF[i % LEAF.length], 0.05);
    c.scale.y = 1;
    c.position.set((i % 2 ? 0.55 : -0.55) * scale, crownY + i * 0.4 * scale, (i % 2 ? -0.45 : 0.45) * scale);
    g.add(c);
  }
  const bunches = grand ? 6 : 3;
  for (let i = 0; i < bunches; i++) {
    const bunch = bananaBunch();
    bunch.scale.setScalar(scale * (grand ? 1.3 : 1));
    const a = i * (Math.PI * 2 / bunches);
    bunch.position.set(Math.cos(a) * 1.0 * scale, crownY - 0.3 * scale, Math.sin(a) * 1.0 * scale);
    g.add(bunch);
  }
  return g;
}

// Bounce platform: a springy mushroom. The cap's flat top sits at y=0 so the
// player stands on it; a cream stem drops below. Returns { group, hideBox:true }.
export function buildMushroom(w, d) {
  const g = new THREE.Group();
  const r = Math.max(w, d) * 0.62;
  const cap = part(new THREE.SphereGeometry(r, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), 0xe2433a, 0.05);
  cap.position.y = -r * 0.28; // dome's rim flares out, crown near y=0
  cap.scale.y = 0.85;
  g.add(cap);
  // white spots
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9, rr = r * (0.3 + (i % 3) * 0.2);
    const spot = part(new THREE.SphereGeometry(0.16 + (i % 2) * 0.06, 8, 8), 0xfff4e0, 0.03);
    spot.position.set(Math.cos(a) * rr, -r * 0.28 + Math.sqrt(Math.max(0, r * r - rr * rr)) * 0.85, Math.sin(a) * rr);
    g.add(spot);
  }
  const stem = part(new THREE.CylinderGeometry(r * 0.32, r * 0.4, r * 1.4, 10), 0xf2e6c8, 0.05);
  stem.position.y = -r * 0.95;
  g.add(stem);
  return g;
}

// A slatted wooden plank platform — used for the swinging, vine-hung platforms.
export function buildHangingPlatform(w, d) {
  const g = new THREE.Group();
  const nPlanks = Math.max(3, Math.round(w / 0.7));
  const pw = w / nPlanks;
  for (let i = 0; i < nPlanks; i++) {
    const plank = part(new THREE.BoxGeometry(pw * 0.86, 0.26, d * 0.96), i % 2 ? 0x8a6239 : 0x6f4f30, 0.03);
    plank.position.set(-w / 2 + pw * (i + 0.5), -0.05, 0);
    g.add(plank);
  }
  // a couple of binding ropes across the planks
  for (const z of [-d * 0.32, d * 0.32]) {
    const rope = part(new THREE.BoxGeometry(w * 0.98, 0.1, 0.12), 0x4f7a3a, 0.02);
    rope.position.set(0, 0.1, z);
    g.add(rope);
  }
  return g;
}

// A hanging vine dangling from the platform underside.
export function buildVine(len) {
  const g = new THREE.Group();
  const stem = part(new THREE.CylinderGeometry(0.06, 0.05, len, 6), 0x4f7a3a, 0.04);
  stem.position.y = -len / 2;
  g.add(stem);
  for (let i = 1; i < 4; i++) {
    const l = leaf(0.16, LEAF[i % LEAF.length], 0.05);
    l.position.set((i % 2 ? 0.12 : -0.12), -len * (i / 4), 0);
    l.scale.set(1.4, 1, 1);
    g.add(l);
  }
  return g;
}

// A big background tree: a tall clear trunk with a compact crown high on top,
// so the foliage stays well above the play corridor (won't block the camera).
export function buildTree(height) {
  const g = new THREE.Group();
  const trunk = part(new THREE.CylinderGeometry(height * 0.04, height * 0.07, height, 9), BARK, 0.04);
  trunk.position.y = height / 2;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const r = height * 0.2 - i * height * 0.045;
    const c = part(new THREE.SphereGeometry(r, 12, 12), LEAF[i % LEAF.length], 0.04);
    c.position.set((i % 2 ? 1 : -1) * height * 0.05, height + i * r * 0.8, (i % 2 ? -1 : 1) * height * 0.05);
    c.scale.y = 0.85;
    g.add(c);
  }
  return g;
}

// Scatter of low forest-floor props: bushes, ferns, rocks, fallen logs.
export function buildFloorProp(kind, scale) {
  if (kind === 'bush') {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const b = part(new THREE.SphereGeometry(scale * (0.7 + (i % 2) * 0.3), 10, 10), LEAF[i % LEAF.length], 0.05);
      b.position.set((i - 1.5) * scale * 0.5, scale * 0.4, Math.sin(i) * scale * 0.4);
      b.scale.y = 0.8; g.add(b);
    }
    return g;
  }
  if (kind === 'fern') {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const frond = part(new THREE.ConeGeometry(0.18 * scale, scale * 1.6, 5), 0x4caf50, 0.04);
      frond.position.y = scale * 0.8;
      frond.rotation.z = (i - 2) * 0.32;
      g.add(frond);
    }
    return g;
  }
  if (kind === 'rock') {
    return part(new THREE.IcosahedronGeometry(scale, 0), 0x8c8a86, 0.05);
  }
  // fallen log
  const log = part(new THREE.CylinderGeometry(scale * 0.4, scale * 0.45, scale * 4, 8), BARK, 0.05);
  log.rotation.z = Math.PI / 2;
  return log;
}
