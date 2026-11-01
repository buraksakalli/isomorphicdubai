// Geographic frame for the map. Simple equirectangular mapping, good enough at city scale.
// Coordinates in the data files are APPROXIMATE (general knowledge, not surveyed) — this is an illustration.

export const LAT0 = 25.33;   // north edge
export const LAT1 = 24.86;   // south edge
export const LON0 = 54.98;   // west edge
export const LON1 = 55.45;   // east edge
export const TILE_M = 100;   // metres per tile

const KX = (111320 * Math.cos(25.1 * Math.PI / 180)) / TILE_M; // tiles per degree longitude (~1008)
const KY = 110800 / TILE_M;                                      // tiles per degree latitude (~1108)

export const W = Math.ceil((LON1 - LON0) * KX); // grid width in tiles  (~474)
export const H = Math.ceil((LAT0 - LAT1) * KY); // grid height in tiles (~521)

/** [lat, lon] -> [x, y] world tiles */
export function toWorld(lat, lon) { return [(lon - LON0) * KX, (LAT0 - lat) * KY]; }
/** [x, y] world tiles -> [lat, lon] */
export function toLatLon(x, y) { return [LAT0 - y / KY, LON0 + x / KX]; }
/** kilometres -> tiles */
export const km = (k) => (k * 1000) / TILE_M;
/** metres -> tiles */
export const m = (v) => v / TILE_M;
/** map an array of [lat, lon] to an array of [x, y] */
export const llPts = (arr) => arr.map(([la, lo]) => toWorld(la, lo));
