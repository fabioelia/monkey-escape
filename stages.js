// Each stage: { name, sky, chimpHeadStart, chimpSpeed, platforms[], bananas[] }
// Platform: { x,y,z, w,d, h?, color?, checkpoint?, goal?, move?, bounce? }
//   move:   { axis:'x'|'y'|'z', amp, speed, phase? }
//   bounce: number  -> launches the player upward with this velocity (jump pad)
// First platform of every stage is the spawn (checkpoint 0).
// One platform must be goal:true — reaching it completes the stage.
// bananas: [{x,y,z}, ...] floating collectibles.

const JUNGLE = 0x6bbf59, VINE = 0x3f8f3a, ROCK = 0x9a8c7a, GOLD = 0xffd23f,
      CP = 0x53e08a, BOUNCE = 0xff5ccd, LAVA = 0xff6a3d, ICE = 0xa9e6ff,
      CLOUD = 0xe7ecff, NIGHT = 0x6b5cff;

export const STAGES = [
  {
    name: 'Lower Branches', sky: 0xbfe3a0, leaf: 0x6bbf59, par: 16, chimpHeadStart: 3.0, chimpSpeed: 7.2,
    swings: [{ x: 0, y: 6, z: -21, L: 5 }],
    platforms: [
      { x: 0, y: 0, z: 0, w: 8, d: 8, color: CP, checkpoint: 0 },
      { x: 0, y: 0.4, z: -9,  w: 4, d: 4, color: JUNGLE },
      { x: 0, y: 0.8, z: -17, w: 3, d: 3, color: JUNGLE },
      { x: 0, y: 1.2, z: -25, w: 3, d: 3, color: VINE, move: { axis: 'x', amp: 5, speed: 1.3 } },
      { x: 0, y: 1.6, z: -34, w: 6, d: 6, color: CP, checkpoint: 1 },
      { x: 3, y: 2.2, z: -42, w: 2.6, d: 2.6, color: JUNGLE },
      { x: -3, y: 2.8, z: -49, w: 2.6, d: 2.6, color: JUNGLE },
      { x: 0, y: 3.4, z: -57, w: 3, d: 3, color: VINE, move: { axis: 'y', amp: 2, speed: 1.1 } },
      { x: 0, y: 4.0, z: -67, w: 7, d: 7, color: GOLD, goal: true },
    ],
    bananas: [{ x: 0, y: 2.4, z: -17 }, { x: 0, y: 3.2, z: -34 }, { x: -3, y: 4.4, z: -49 }],
  },
  {
    name: 'Treetops', sky: 0x9fd3ff, leaf: 0x4caf50, par: 18, chimpHeadStart: 2.5, chimpSpeed: 7.6,
    platforms: [
      { x: 0, y: 0, z: 0, w: 7, d: 7, color: CP, checkpoint: 0 },
      { x: 2, y: 0.5, z: -8,  w: 2.4, d: 2.4, color: ROCK },
      { x: -2, y: 1.0, z: -15, w: 2.4, d: 2.4, color: ROCK },
      { x: 2, y: 1.5, z: -22, w: 2.4, d: 2.4, color: ROCK, move: { axis: 'z', amp: 3, speed: 1.6 } },
      { x: -2, y: 2.0, z: -30, w: 2.4, d: 2.4, color: ROCK },
      { x: 0, y: 2.4, z: -38, w: 6, d: 6, color: CP, checkpoint: 1 },
      { x: -4, y: 3.0, z: -46, w: 3, d: 3, color: ROCK, move: { axis: 'x', amp: 4, speed: 1.5 } },
      { x: 4, y: 3.6, z: -54, w: 3, d: 3, color: ROCK, move: { axis: 'x', amp: 4, speed: 1.5, phase: 3.14 } },
      { x: 0, y: 4.2, z: -63, w: 2.4, d: 2.4, color: ROCK },
      { x: 0, y: 4.8, z: -73, w: 8, d: 8, color: GOLD, goal: true },
    ],
    bananas: [{ x: -2, y: 2.0, z: -15 }, { x: 0, y: 4.0, z: -38 }, { x: 0, y: 5.4, z: -63 }],
  },
  {
    name: 'Deep Canopy', sky: 0x4e7a4a, leaf: 0x2f8b3a, par: 22, chimpHeadStart: 2.2, chimpSpeed: 8.0,
    swings: [{ x: 0, y: 9, z: -33, L: 5 }],
    platforms: [
      { x: 0, y: 0, z: 0, w: 7, d: 7, color: CP, checkpoint: 0 },
      { x: 0, y: 0.6, z: -9,  w: 2.2, d: 2.2, color: VINE, move: { axis: 'x', amp: 6, speed: 1.7 } },
      { x: 0, y: 1.2, z: -18, w: 2.4, d: 2.4, color: JUNGLE },
      { x: 0, y: 1.0, z: -25, w: 3, d: 3, color: BOUNCE, bounce: 19 },
      { x: -3, y: 3.6, z: -33, w: 2.4, d: 2.4, color: JUNGLE },
      { x: 0, y: 4.0, z: -41, w: 6, d: 6, color: CP, checkpoint: 1 },
      { x: 0, y: 4.6, z: -49, w: 2.2, d: 2.2, color: VINE, move: { axis: 'z', amp: 4, speed: 1.9 } },
      { x: 3, y: 5.4, z: -57, w: 2, d: 2, color: JUNGLE },
      { x: -3, y: 6.2, z: -65, w: 2, d: 2, color: JUNGLE },
      { x: 0, y: 6.8, z: -74, w: 2.4, d: 2.4, color: VINE, move: { axis: 'x', amp: 5, speed: 2.0 } },
      { x: 0, y: 7.4, z: -84, w: 9, d: 9, color: GOLD, goal: true },
    ],
    bananas: [{ x: 0, y: 2.6, z: -18 }, { x: 0, y: 5.8, z: -41 }, { x: 3, y: 7.0, z: -57 }, { x: -3, y: 7.8, z: -65 }],
  },
  {
    name: 'Misty Heights', sky: 0xd8e6ee, leaf: 0x7fae6a, par: 24, chimpHeadStart: 2.0, chimpSpeed: 8.3,
    swings: [{ x: 0, y: 8, z: -30, L: 5 }],
    platforms: [
      { x: 0, y: 0, z: 0, w: 7, d: 7, color: CP, checkpoint: 0 },
      { x: 0, y: 0.4, z: -10, w: 2.2, d: 2.2, color: LAVA },
      { x: 0, y: 0.4, z: -16, w: 2.6, d: 2.6, color: BOUNCE, bounce: 17 },
      { x: 0, y: 3.0, z: -25, w: 2.2, d: 2.2, color: LAVA, move: { axis: 'x', amp: 5, speed: 1.8 } },
      { x: 0, y: 3.0, z: -34, w: 2.4, d: 2.4, color: LAVA },
      { x: 0, y: 3.4, z: -42, w: 6, d: 6, color: CP, checkpoint: 1 },
      { x: -3, y: 4.0, z: -50, w: 2, d: 2, color: LAVA, move: { axis: 'z', amp: 3, speed: 2.0 } },
      { x: 3, y: 4.6, z: -58, w: 2, d: 2, color: LAVA, move: { axis: 'z', amp: 3, speed: 2.0, phase: 2 } },
      { x: 0, y: 4.6, z: -66, w: 2.4, d: 2.4, color: BOUNCE, bounce: 18 },
      { x: 0, y: 7.0, z: -76, w: 8, d: 8, color: GOLD, goal: true },
    ],
    bananas: [{ x: 0, y: 1.8, z: -10 }, { x: 0, y: 4.8, z: -34 }, { x: 0, y: 5.2, z: -42 }, { x: 0, y: 8.5, z: -66 }],
  },
  {
    name: 'Sunset Boughs', sky: 0xffb070, leaf: 0x9a8a3a, par: 26, chimpHeadStart: 1.8, chimpSpeed: 8.6,
    swings: [{ x: 0, y: 9, z: -52, L: 5 }],
    platforms: [
      { x: 0, y: 0, z: 0, w: 7, d: 7, color: CP, checkpoint: 0 },
      { x: 2, y: 0.5, z: -8,  w: 2, d: 2, color: ICE, move: { axis: 'x', amp: 4, speed: 1.9 } },
      { x: -2, y: 1.2, z: -16, w: 2, d: 2, color: ICE },
      { x: 2, y: 1.9, z: -24, w: 2, d: 2, color: ICE, move: { axis: 'y', amp: 2, speed: 1.4 } },
      { x: -2, y: 2.6, z: -32, w: 2, d: 2, color: ICE },
      { x: 0, y: 3.0, z: -40, w: 6, d: 6, color: CP, checkpoint: 1 },
      { x: 0, y: 3.2, z: -48, w: 2.6, d: 2.6, color: BOUNCE, bounce: 18 },
      { x: -3, y: 5.6, z: -57, w: 2, d: 2, color: ICE, move: { axis: 'x', amp: 5, speed: 2.1 } },
      { x: 3, y: 6.2, z: -66, w: 2, d: 2, color: ICE },
      { x: 0, y: 6.8, z: -75, w: 2.2, d: 2.2, color: ICE, move: { axis: 'z', amp: 3, speed: 2.2 } },
      { x: 0, y: 7.4, z: -85, w: 8, d: 8, color: GOLD, goal: true },
    ],
    bananas: [{ x: -2, y: 2.4, z: -16 }, { x: 0, y: 4.6, z: -40 }, { x: 3, y: 7.4, z: -66 }, { x: 0, y: 8.6, z: -75 }],
  },
  {
    name: 'Great Tree Summit', sky: 0x5b4f8c, leaf: 0x6bbf59, par: 30, chimpHeadStart: 1.6, chimpSpeed: 9.0,
    swings: [{ x: 0, y: 9, z: -34, L: 5 }, { x: 0, y: 13, z: -70, L: 6 }],
    platforms: [
      { x: 0, y: 0, z: 0, w: 7, d: 7, color: CP, checkpoint: 0 },
      { x: 0, y: 0.4, z: -9,  w: 2.2, d: 2.2, color: NIGHT, move: { axis: 'x', amp: 6, speed: 2.2 } },
      { x: 0, y: 0.4, z: -16, w: 2.4, d: 2.4, color: BOUNCE, bounce: 20 },
      { x: 0, y: 4.0, z: -26, w: 2, d: 2, color: CLOUD, move: { axis: 'y', amp: 2.5, speed: 1.6 } },
      { x: -3, y: 4.4, z: -34, w: 2, d: 2, color: NIGHT },
      { x: 0, y: 4.8, z: -42, w: 6, d: 6, color: CP, checkpoint: 1 },
      { x: 3, y: 5.2, z: -50, w: 1.8, d: 1.8, color: NIGHT, move: { axis: 'x', amp: 5, speed: 2.3 } },
      { x: -3, y: 5.8, z: -58, w: 1.8, d: 1.8, color: NIGHT },
      { x: 0, y: 5.8, z: -66, w: 2.4, d: 2.4, color: BOUNCE, bounce: 19 },
      { x: 0, y: 8.4, z: -75, w: 2, d: 2, color: CLOUD, move: { axis: 'z', amp: 3, speed: 2.4 } },
      { x: 0, y: 8.8, z: -85, w: 2, d: 2, color: NIGHT },
      { x: 0, y: 9.2, z: -95, w: 9, d: 9, color: GOLD, goal: true },
    ],
    bananas: [
      { x: 0, y: 6.0, z: -26 }, { x: -3, y: 5.8, z: -34 }, { x: 0, y: 6.6, z: -42 },
      { x: 0, y: 8.0, z: -66 }, { x: 0, y: 10.4, z: -75 }, { x: 0, y: 10.6, z: -85 },
    ],
  },
];
