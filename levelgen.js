// Procedural level generator — produces a stage in the same shape as stages.js,
// guaranteed walkable (bounded z-gaps, x-wander, and y-rises), with checkpoints,
// mushrooms, swinging platforms, swing vines, bananas, and a banana-tree goal.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIES = [0xbfe3a0, 0x9fd3ff, 0x4e7a4a, 0xd8e6ee, 0xffb070, 0x88c0d0];
const LEAVES = [0x6bbf59, 0x4caf50, 0x2f8b3a, 0x7fae6a, 0x9a8a3a, 0x66bb5a];

// diff: 0,1,2,... harder. seed: integer for reproducibility.
export function generateStage(diff, seed) {
  const rnd = mulberry32(seed >>> 0);
  const rand = (a, b) => a + rnd() * (b - a);
  const r2 = (v) => +v.toFixed(2);

  const night = diff % 4 === 3;
  const pal = diff % SKIES.length;
  const sky = night ? 0x2a2d5a : SKIES[pal];
  const leaf = night ? 0x3f6e4a : LEAVES[pal];

  const n = 11 + Math.min(7, diff);          // platform count grows with difficulty
  const midI = Math.max(3, Math.floor(n * 0.42));
  const lateI = Math.floor(n * 0.78);

  const platforms = [{ x: 0, y: 0, z: 0, w: 7, d: 7, checkpoint: 0 }];
  const bananas = [], swings = [];

  let x = 0, y = 0, z = 0, prevBounce = false;
  for (let i = 1; i < n; i++) {
    const gap = rand(6.5, 7.9);
    z -= gap;
    // a bounce pad launched us up: the next platform sits much higher
    y += prevBounce ? rand(2.6, 3.6) : rand(0.3, 1.0);
    x = Math.max(-3, Math.min(3, x + rand(-2.0, 2.0)));

    const size = Math.max(2.0, rand(2.6, 3.4) - diff * 0.1);
    const def = { x: r2(x), y: r2(y), z: r2(z), w: r2(size), d: r2(size) };
    prevBounce = false;

    if (i === midI) { def.checkpoint = 1; def.w = 6; def.d = 6; }
    else if (i === lateI) { def.checkpoint = 2; def.w = 6; def.d = 6; } // banana-tree reward
    else if (i > 2 && i < n - 1) {
      const roll = rnd();
      if (roll < 0.16) {                       // mushroom bounce
        def.bounce = 17 + diff * 0.4; prevBounce = true;
      } else if (roll < 0.16 + 0.28 + diff * 0.02) { // swinging hang platform
        def.move = { axis: rnd() < 0.5 ? 'x' : 'z', amp: rand(3, 4.2), speed: rand(1.4, 2.0), phase: rand(0, 6.28) };
        def.x = r2(Math.max(-2.4, Math.min(2.4, x))); x = def.x;
      }
    }
    platforms.push(def);

    if (!def.bounce && rnd() < 0.5) bananas.push({ x: def.x, y: r2(def.y + 1.4), z: def.z });
    if (rnd() < 0.12 && i > 3 && i < n - 2) swings.push({ x: def.x, y: r2(def.y + 6), z: r2(def.z + gap * 0.5), L: 5 });
  }

  // goal: a big pad with the banana tree
  z -= rand(7, 8); y += rand(0.4, 0.9);
  platforms.push({ x: 0, y: r2(y), z: r2(z), w: 8, d: 8, goal: true });

  return {
    name: `Level ${diff + 1}`, sky, leaf, night,
    par: Math.round(n * 2.4),
    chimpHeadStart: Math.max(1.4, 3 - diff * 0.22),
    chimpSpeed: 7.0 + Math.min(3.2, diff * 0.4),
    platforms, bananas, swings, generated: true,
  };
}
