// Pixel-art character roster + sprite renderer.
// Sprites are 12x16 pixel grids generated from a shared body template with
// per-character palette (skin/hair/kit) and hair-style overrides.

const CHARACTERS = [
  { id: 'ronaldo', name: 'Ronaldo', team: 'Portugal',  skin: '#e8b48c', hair: '#1c1410', style: 'short',    shirt: '#c8102e', trim: '#046a38', shorts: '#046a38', socks: '#c8102e' },
  { id: 'messi',   name: 'Messi',   team: 'Argentina', skin: '#e8b48c', hair: '#5a3a22', style: 'beard',    shirt: '#75aadb', trim: '#ffffff', shorts: '#1c2340', socks: '#75aadb' },
  { id: 'mbappe',  name: 'Mbappé',  team: 'France',    skin: '#6f4a2f', hair: '#14100c', style: 'buzz',     shirt: '#1e3a8a', trim: '#ef4444', shorts: '#ffffff', socks: '#ef4444' },
  { id: 'lamine',  name: 'Lamine',  team: 'Spain',     skin: '#b07a4e', hair: '#14100c', style: 'curly',    shirt: '#e11d2e', trim: '#ffd700', shorts: '#1e3a8a', socks: '#e11d2e' },
  { id: 'diaz',    name: 'Luis Díaz', team: 'Colombia', skin: '#b07a4e', hair: '#14100c', style: 'curly',   shirt: '#ffd700', trim: '#1e3a8a', shorts: '#1e3a8a', socks: '#e11d2e' },
  { id: 'neymar',  name: 'Neymar',  team: 'Brazil',    skin: '#d9a06a', hair: '#241a10', style: 'mohawk',   shirt: '#ffd700', trim: '#009739', shorts: '#1e3a8a', socks: '#ffffff' },
  { id: 'morgan',  name: 'Morgan',  team: 'USA',       skin: '#e8b48c', hair: '#5a3a22', style: 'ponytail', shirt: '#ffffff', trim: '#b31942', shorts: '#0a3161', socks: '#ffffff', band: '#ff69b4' },
  { id: 'rodman',  name: 'Rodman',  team: 'USA',       skin: '#7a5236', hair: '#2a1810', style: 'ponytail', shirt: '#ffffff', trim: '#b31942', shorts: '#0a3161', socks: '#b31942' },
  { id: 'horan',   name: 'Horan',   team: 'USA',       skin: '#e8b48c', hair: '#d9b25f', style: 'ponytail', shirt: '#ffffff', trim: '#0a3161', shorts: '#0a3161', socks: '#0a3161' },
];

// Legend: . transparent, S skin, H hair, J shirt, K trim, P shorts, G socks, B shoes, E eye, D headband
const BODY_FRAMES = [
  [ // frame 0 — standing / step A
    '............',
    '....HHHH....',
    '...HHHHHH...',
    '...HSSSSH...',
    '...SESSES...',
    '...SSSSSS...',
    '....SSSS....',
    '..JJJJJJJJ..',
    '.KJJJJJJJJK.',
    '.SJJKJJKJJS.',
    '.S.JJJJJJ.S.',
    '..PPPPPPPP..',
    '..PP....PP..',
    '..SS....SS..',
    '..GG....GG..',
    '..BB....BB..',
  ],
  [ // frame 1 — step B (legs shifted)
    '............',
    '....HHHH....',
    '...HHHHHH...',
    '...HSSSSH...',
    '...SESSES...',
    '...SSSSSS...',
    '....SSSS....',
    '..JJJJJJJJ..',
    '.KJJJJJJJJK.',
    '.SJJKJJKJJS.',
    '.S.JJJJJJ.S.',
    '..PPPPPPPP..',
    '...PP..PP...',
    '..SS....SS..',
    '...GG..GG...',
    '..BB....BB..',
  ],
];

// Hair-style overrides applied on top of the base grid: [x, y, char]
const HAIR_STYLES = {
  short: [],
  beard: [
    [3, 5, 'H'], [8, 5, 'H'], [3, 6, 'H'], [8, 6, 'H'], // sideburn beard
  ],
  buzz: [
    [4, 1, '.'], [7, 1, '.'], // tighter cut on top
  ],
  curly: [
    [3, 1, 'H'], [8, 1, 'H'], [2, 2, 'H'], [9, 2, 'H'], [2, 3, 'H'], [9, 3, 'H'], // volume
  ],
  mohawk: [
    [4, 1, '.'], [7, 1, '.'], [5, 0, 'H'], [6, 0, 'H'], // strip on top
  ],
  ponytail: [
    [2, 2, 'H'], [9, 2, 'H'], [9, 3, 'H'], [10, 3, 'H'], [10, 4, 'H'], [10, 5, 'H'], [10, 6, 'H'], // tail on right
  ],
};

function buildGrid(ch, frame) {
  const grid = BODY_FRAMES[frame].map(row => row.split(''));
  for (const [x, y, c] of (HAIR_STYLES[ch.style] || [])) grid[y][x] = c;
  if (ch.band) { for (let x = 3; x <= 8; x++) if (grid[2][x] === 'H') grid[2][x] = 'D'; }
  return grid;
}

// Renders a character sprite frame onto ctx at (dx, dy), 1 grid px = `px` canvas px.
// flip=true mirrors horizontally (facing left).
function drawCharacter(ctx, ch, frame, dx, dy, px, flip) {
  const grid = buildGrid(ch, frame);
  const pal = {
    S: ch.skin, H: ch.hair, J: ch.shirt, K: ch.trim, P: ch.shorts,
    G: ch.socks, B: '#111111', E: '#1a1a1a', D: ch.band || ch.hair,
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 12; x++) {
      const c = grid[y][x];
      if (c === '.') continue;
      const col = pal[c];
      if (!col) continue;
      const gx = flip ? 11 - x : x;
      ctx.fillStyle = col;
      ctx.fillRect(dx + gx * px, dy + y * px, px, px);
    }
  }
}

// Renders a character portrait into a small canvas (for menus).
function drawPortrait(canvas, ch) {
  canvas.width = 12;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 12, 16);
  drawCharacter(ctx, ch, 0, 0, 0, 1, false);
}

function getCharacter(id) {
  return CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
}
