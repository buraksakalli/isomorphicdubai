// Colour palettes for procedural buildings (daylight base colours; lighting is applied at draw time).

/** deterministic PRNG (mulberry32) */
export function rng(seed) {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (arr, R) => arr[Math.floor(R() * arr.length) % arr.length];
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// tower facade materials: c = body, g = window/glass band colour, glass = curtain wall (continuous bands)
export const MAT = {
  white: { c: '#f0ede6', g: '#5a6d7e', glass: false, top: '#dedad2' },
  white2: { c: '#e7e3da', g: '#5f7487', glass: false, top: '#d6d2c9' },
  ivory: { c: '#f3eadb', g: '#6a7480', glass: false, top: '#e0d7c8' },
  champ: { c: '#e2d1ae', g: '#5d6870', glass: false, top: '#d3c3a2' },
  sand: { c: '#d8c09a', g: '#5f625e', glass: false, top: '#c9b28e' },
  bluegl: { c: '#a9bccb', g: '#4c6880', glass: true, top: '#c9d1d6' },
  bluegl2: { c: '#8fa8bd', g: '#3d5a73', glass: true, top: '#c2cad0' },
  teal: { c: '#88babb', g: '#3b6d72', glass: true, top: '#c3cfcc' },
  teal2: { c: '#a2cbc8', g: '#4a7d80', glass: true, top: '#cdd8d5' },
  darkgl: { c: '#71879b', g: '#2f4356', glass: true, top: '#b8bfc5' },
  silver: { c: '#c5cdd3', g: '#55697a', glass: true, top: '#d3d8dc' },
  jbr: { c: '#d9b796', g: '#6b5848', glass: false, top: '#cdb39a' },
  jbr2: { c: '#cfa883', g: '#664f3e', glass: false, top: '#c6a98c' },
  rose: { c: '#e7d2c4', g: '#6a6060', glass: false, top: '#d8c6ba' },
};
export const GOLD = '#d7ae58';
export const GOLD2 = '#c99d45';

export const TOWER_PALS = {
  downtown: { mats: ['white', 'white', 'ivory', 'champ', 'bluegl', 'silver', 'teal2', 'white2', 'darkgl'], podium: '#e6dccb', gold: 0.12 },
  marina: { mats: ['white', 'bluegl', 'bluegl2', 'teal', 'teal2', 'champ', 'darkgl', 'ivory', 'silver'], podium: '#e4dccf', gold: 0.08 },
  bb: { mats: ['bluegl', 'bluegl2', 'darkgl', 'teal', 'silver', 'white', 'teal2', 'white2'], podium: '#ded7cc', gold: 0.06 },
  difc: { mats: ['silver', 'white2', 'darkgl', 'champ', 'bluegl', 'white'], podium: '#ddd5c6', gold: 0.08 },
  szr: { mats: ['white', 'champ', 'bluegl', 'silver', 'darkgl', 'teal', 'ivory', 'bluegl2', 'rose'], podium: '#e2d8c6', gold: 0.18 },
  jlt: { mats: ['bluegl2', 'teal', 'darkgl', 'silver', 'champ', 'bluegl', 'teal2'], podium: '#ddd6ca', gold: 0.05 },
  jbr: { mats: ['jbr', 'jbr2', 'champ', 'sand', 'jbr', 'ivory'], podium: '#dcc6a8', gold: 0.02 },
  creek: { mats: ['white', 'silver', 'bluegl', 'teal2', 'ivory', 'white2'], podium: '#e4dccf', gold: 0.05 },
  generic: { mats: ['white2', 'champ', 'sand', 'bluegl', 'ivory', 'silver'], podium: '#e0d6c4', gold: 0.03 },
  hotel: { mats: ['white', 'ivory', 'champ', 'sand', 'teal2', 'rose'], podium: '#e8dccb', gold: 0.15 },
};

// low-rise
export const MID = ['#efe6d6', '#e8dcc6', '#f3eee5', '#e3d2b8', '#ddd6ca', '#f0e1cc', '#d9cbb4', '#e9e2d8', '#e6d9c9', '#d6cfc4'];
export const MID_ACCENT = ['#b9c6cf', '#c9b496', '#9fb5bf', '#c7a888', '#a9b9a8'];
export const OLD = ['#e2cda4', '#efe6d4', '#e8d7b4', '#d9c39b', '#f3ede2', '#e9ddd0', '#d6c6a8', '#f1e9dc', '#e6cfc0', '#dfe0d6', '#ecd9b8', '#e7dfd1', '#d4dad6', '#f0e4cf'];
export const CORAL = ['#dcc8a0', '#d5bf94', '#e3d2ad', '#d9c39a'];
export const VILLA_WALL = ['#f4efe5', '#efe5d2', '#e9dcc4', '#f6f3ec', '#e7d3b5', '#efe2cf'];
export const VILLA_ROOF = ['#b8653e', '#c47a4f', '#a95c3b', '#bb6f47'];
export const VILLA_FLAT = '#e2dbcf';
// villa "families" (picked per street block, with a few per-plot strays):
//   walls = facade tones, top = main roof, terr = exposed terrace roofs, bwall = compound wall, glass = window bands,
//   acc = accent volumes (porticos, pergolas), roof = hip-roof tiles (null = flat roofs with roof terraces)
export const VILLA_FAM = {
  white: { walls: ['#f6f4ef', '#f1eee8', '#ece9e2'], top: '#e6e2da', terr: '#d9d3c7', bwall: '#ede7dc', glass: '#4f5d69', acc: '#cfcac1', roof: null },
  sand: { walls: ['#e8d5b4', '#e2cba5', '#eddcc0', '#dcc39c'], top: '#ddcbab', terr: '#cfb993', bwall: '#e0cba6', glass: '#5f5649', acc: '#c9ad84', roof: null },
  grey: { walls: ['#e4e2dd', '#dad8d3', '#eceae6'], top: '#d6d3cd', terr: '#c9c5bd', bwall: '#dbd7cf', glass: '#3e4a55', acc: '#a8875f', roof: null },
  med: { walls: ['#f2e4cf', '#efdcc4', '#f5ebdc', '#ead3b8'], top: '#e4d8c6', terr: '#dccbb3', bwall: '#eadbc4', glass: '#5c6670', acc: '#e0c7a4', roof: VILLA_ROOF },
};
export const LAWN3 = '#b3bf86'; // drier lawn
export const PAVE = '#e2d8c5';  // interlock paving / driveways
export const TREE_SPOT = '#77a052'; // tree crowns in the batched mid-zoom program
export const POOL = '#46c8d8';
export const POOL_EDGE = '#e9e4da';
export const LAWN = '#a8c47e';
export const LAWN2 = '#9cbd72';
export const WALL = '#e8dfcf';
export const IND = ['#d3d6d8', '#c4ccd2', '#dcd3c0', '#b9c3cb', '#e0ddd5', '#cfc8b8', '#c8d0cf'];
export const IND_ROOF = ['#c9ced2', '#bfc6cb', '#d3d0c8', '#b5bec4'];
export const CONTAINERS = ['#c0473a', '#3b78b0', '#d9822b', '#3f8f5a', '#8a8f96', '#c9a23a', '#5d6fa8', '#a8423f', '#2f6d8f'];
export const TREE_COL = ['#4f7f3b', '#5a8a3f', '#467536', '#6a9447'];
