// Deterministic seeded PRNG and 2D value/fractal noise helpers.

export function createSeededRng(seed = 1) {
  let state = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashCoordinates2D(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function sampleValueNoise2D(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);

  const a = hashCoordinates2D(ix, iz, seed);
  const b = hashCoordinates2D(ix + 1, iz, seed);
  const c = hashCoordinates2D(ix, iz + 1, seed);
  const d = hashCoordinates2D(ix + 1, iz + 1, seed);

  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}

export function sampleFractalNoise2D(x, z, seed, octaves = 4) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    sum += sampleValueNoise2D(x * frequency, z * frequency, seed + i * 97) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.02;
  }

  return sum / norm;
}
