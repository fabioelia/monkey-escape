import * as THREE from 'three';
import { part, toonMat } from './toon.js';

// All characters face -Z by default (the player's "forward").
// Each returned group carries userData.limbs = { arms:[], legs:[] } for the
// walk-cycle animation driven in the main loop.

function eyes(group, faceZ, spread, y, browColor) {
  for (const sx of [-1, 1]) {
    const white = part(new THREE.SphereGeometry(0.16, 12, 12), 0xffffff, 0.05);
    white.position.set(sx * spread, y, faceZ);
    white.scale.z = 0.6;
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x1a1320 })
    );
    pupil.position.set(0, 0, 0.12);
    white.add(pupil);
    group.add(white);

    if (browColor !== undefined) {
      const brow = part(new THREE.BoxGeometry(0.34, 0.09, 0.18), browColor, 0.06);
      brow.position.set(sx * spread, y + 0.22, faceZ - 0.02);
      brow.rotation.z = sx * 0.35; // angry slant
      group.add(brow);
    }
  }
}

function buildApe({ fur, face, scale, angry }) {
  const g = new THREE.Group();
  const limbs = { arms: [], legs: [] };

  // torso
  const body = part(new THREE.CapsuleGeometry(0.55, 0.7, 8, 16), fur);
  body.position.y = 1.1;
  g.add(body);

  // belly patch
  const belly = part(new THREE.SphereGeometry(0.42, 14, 14), face, 0);
  belly.position.set(0, 1.0, -0.32);
  belly.scale.set(0.8, 1.05, 0.5);
  g.add(belly);

  // head
  const head = part(new THREE.SphereGeometry(0.55, 18, 18), fur);
  head.position.y = 2.05;
  g.add(head);

  // face disc
  const faceDisc = part(new THREE.SphereGeometry(0.46, 16, 16), face, 0);
  faceDisc.position.set(0, 2.0, -0.28);
  faceDisc.scale.set(0.95, 1.0, 0.55);
  g.add(faceDisc);

  // muzzle
  const muzzle = part(new THREE.SphereGeometry(0.26, 14, 14), face, 0.05);
  muzzle.position.set(0, 1.82, -0.5);
  muzzle.scale.set(1.1, 0.7, 0.8);
  g.add(muzzle);

  // ears
  for (const sx of [-1, 1]) {
    const ear = part(new THREE.SphereGeometry(0.2, 12, 12), fur);
    ear.position.set(sx * 0.55, 2.1, 0.05);
    ear.scale.z = 0.5;
    g.add(ear);
  }

  eyes(g, -0.62, 0.2, 2.08, angry ? fur : undefined);
  // mouth
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.04, 8, 16, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x1a1320 })
  );
  mouth.position.set(0, 1.74, -0.7);
  mouth.rotation.x = Math.PI / 2;
  mouth.rotation.z = angry ? 0 : Math.PI; // smile vs frown
  g.add(mouth);

  // arms
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.62, 1.5, 0);
    const arm = part(new THREE.CapsuleGeometry(0.18, 0.7, 6, 10), fur);
    arm.position.y = -0.45;
    const hand = part(new THREE.SphereGeometry(0.22, 12, 12), face, 0.06);
    hand.position.y = -0.85;
    pivot.add(arm, hand);
    g.add(pivot);
    limbs.arms.push(pivot);
  }

  // legs
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.28, 0.7, 0);
    const leg = part(new THREE.CapsuleGeometry(0.2, 0.55, 6, 10), fur);
    leg.position.y = -0.4;
    const foot = part(new THREE.SphereGeometry(0.22, 12, 12), face, 0.06);
    foot.position.set(0, -0.72, -0.12);
    foot.scale.z = 1.4;
    pivot.add(leg, foot);
    g.add(pivot);
    limbs.legs.push(pivot);
  }

  // tail (only the monkey gets a long one)
  if (!angry) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.8, 0.4),
      new THREE.Vector3(0, 0.5, 1.1),
      new THREE.Vector3(0.3, 0.9, 1.5),
      new THREE.Vector3(0.6, 1.5, 1.4),
    ]);
    const tail = part(new THREE.TubeGeometry(curve, 24, 0.1, 8, false), fur, 0.05);
    g.add(tail);
  }

  g.scale.setScalar(scale);
  g.userData.limbs = limbs;
  return g;
}

export function buildMonkey() {
  return buildApe({ fur: 0x9c6b3f, face: 0xf2cda0, scale: 0.55, angry: false });
}

// Collectible banana — a yellow crescent (partial torus) with brown tips.
export function buildBanana() {
  const g = new THREE.Group();
  const body = part(new THREE.TorusGeometry(0.42, 0.14, 10, 24, 2.3), 0xffe23d, 0.07);
  body.material.emissive = new THREE.Color(0xffd000);
  body.material.emissiveIntensity = 0.55; // glow under bloom
  body.rotation.z = -1.15; // sit the crescent upright
  g.add(body);
  for (const end of [0, 2.3]) {
    const tip = part(new THREE.SphereGeometry(0.13, 8, 8), 0x7a5a20, 0.05);
    tip.position.set(Math.cos(end) * 0.42, Math.sin(end) * 0.42, 0);
    body.add(tip);
  }
  return g;
}

export function buildChimp() {
  return buildApe({ fur: 0x3c2c24, face: 0xc9a87f, scale: 0.7, angry: true });
}

// Drive a walk cycle. amount in [0..1] = how fast it's moving.
export function animateWalk(group, t, amount) {
  const limbs = group.userData.limbs;
  if (!limbs) return;
  const swing = Math.sin(t * 11) * 0.7 * amount;
  if (limbs.arms[0]) limbs.arms[0].rotation.x = swing;
  if (limbs.arms[1]) limbs.arms[1].rotation.x = -swing;
  if (limbs.legs[0]) limbs.legs[0].rotation.x = -swing;
  if (limbs.legs[1]) limbs.legs[1].rotation.x = swing;
  // little body bob
  group.position.y += Math.abs(Math.sin(t * 11)) * 0.06 * amount;
}
