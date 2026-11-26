// Procedural archipelago heightmap, shaded colormap, towns, runways, and voxel-space terrain renderer.

import {
  AIRFIELDS,
  CAMERA_FOCAL,
  CELL_SIZE,
  MAP_SIZE,
  MAX_DRAW_DISTANCE,
  PALETTE,
  SURFACE,
  VOXEL_HEIGHT,
  VOXEL_SCALE,
  VOXEL_WIDTH,
  WORLD_SIZE,
} from './config.js';
import { createSeededRng, hashCoordinates2D, sampleFractalNoise2D, smoothstep } from './random.js';

const ISLAND_MASKS = [
  { name: 'Aurelia Atoll', cx: 2520, cz: 5440, rx: 1220, rz: 960, peakX: 2050, peakZ: 5820, peakH: 205 },
  { name: 'Kestrel Key', cx: 4920, cz: 4220, rx: 1080, rz: 1020, peakX: 5420, peakZ: 4540, peakH: 192 },
  { name: 'Coral Haven', cx: 5120, cz: 2180, rx: 1240, rz: 960, peakX: 5620, peakZ: 1760, peakH: 235 },
  { name: 'Sentinel Peak', cx: 2360, cz: 2380, rx: 820, rz: 780, peakX: 2320, peakZ: 2320, peakH: 278 },
  { name: 'Breeze Cay', cx: 3680, cz: 4780, rx: 410, rz: 320, peakX: 3650, peakZ: 4760, peakH: 76 },
  { name: 'Tern Shoal', cx: 3820, cz: 3040, rx: 420, rz: 340, peakX: 3840, peakZ: 3020, peakH: 88 },
];

function packRgba(r, g, b, a = 255) {
  return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function mixChannel(a, b, t) {
  return a + (b - a) * t;
}

export function generateArchipelago(seed = 7) {
  const count = MAP_SIZE * MAP_SIZE;
  const heights = new Float32Array(count);
  const colors = new Uint32Array(count);
  const surfaces = new Uint8Array(count);
  const coastGlow = new Float32Array(count);
  const buildingMask = new Uint8Array(count);
  const buildingColors = new Uint32Array(count);

  const rng = createSeededRng(seed * 131 + 17);
  const jitter = (rng() - 0.5) * 40;

  // 1. Sculpt islands, coastlines, hills, and rivers
  for (let gz = 0; gz < MAP_SIZE; gz++) {
    const wz = gz * CELL_SIZE;
    const rowOffset = gz * MAP_SIZE;
    for (let gx = 0; gx < MAP_SIZE; gx++) {
      const wx = gx * CELL_SIZE;
      const idx = rowOffset + gx;

      const macroNoise = sampleFractalNoise2D((wx + jitter) * 0.0009, (wz - jitter) * 0.0009, seed + 11, 4);
      const detailNoise = sampleFractalNoise2D(wx * 0.0038, wz * 0.0038, seed + 43, 3);

      let landField = 0;
      let peakBoost = 0;

      for (let i = 0; i < ISLAND_MASKS.length; i++) {
        const isl = ISLAND_MASKS[i];
        const dx = (wx - isl.cx) / isl.rx;
        const dz = (wz - isl.cz) / isl.rz;
        const dist = Math.hypot(dx, dz);
        const coastWarp = (macroNoise - 0.5) * 0.34 + (detailNoise - 0.5) * 0.1;
        const mask = 1 - smoothstep(0.45, 1.05, dist + coastWarp);
        if (mask > landField) landField = mask;

        const pd = Math.hypot(wx - isl.peakX, wz - isl.peakZ) / (isl.rx * 0.56);
        const ridge = Math.max(0, 1 - pd);
        const hPeak = ridge * ridge * isl.peakH * (0.72 + macroNoise * 0.56);
        if (hPeak > peakBoost) peakBoost = hPeak;
      }

      coastGlow[idx] = landField;

      if (landField <= 0.07) {
        heights[idx] = 0;
        surfaces[idx] = SURFACE.WATER;
        continue;
      }

      // Base elevation rises gently from beach to farmland plateau, then climbs into hills
      const plateau = smoothstep(0.07, 0.36, landField) * 28;
      const rolling = (macroNoise * 26 + detailNoise * 12) * smoothstep(0.14, 0.55, landField);
      let elev = plateau + rolling + peakBoost;

      // Carve winding coastal rivers on Aurelia and Coral Haven
      const riverWaveA = Math.sin(wx * 0.0034 + seed) * 140;
      const riverDistA = Math.abs((wz - 5620) - riverWaveA);
      const riverWaveC = Math.sin(wx * 0.003 + seed * 2) * 120;
      const riverDistC = Math.abs((wz - 1960) - riverWaveC);
      const inRiverA = wx > 2100 && wx < 3120 && riverDistA < 26 && elev < 62;
      const inRiverC = wx > 4560 && wx < 5760 && riverDistC < 28 && elev < 68;

      if (inRiverA || inRiverC) {
        elev = Math.min(elev, 3.2);
        surfaces[idx] = SURFACE.RIVER;
      } else if (elev < 7.5) {
        surfaces[idx] = SURFACE.SAND;
      } else if (elev < 64) {
        surfaces[idx] = SURFACE.FIELD;
      } else if (elev < 145) {
        surfaces[idx] = SURFACE.FOREST;
      } else {
        surfaces[idx] = SURFACE.ROCK;
      }

      heights[idx] = elev;
    }
  }

  // 2. Flatten aprons and stamp crisp runways & coastal towns
  for (let i = 0; i < AIRFIELDS.length; i++) {
    const field = AIRFIELDS[i];
    stampIslandRunway(heights, surfaces, field);
    stampCoastalTown(heights, surfaces, buildingMask, buildingColors, field, seed + i * 31);
  }

  // 3. Lighthouses on scenic capes near each island
  const lighthouses = [
    { x: 3180, z: 5160, baseH: 12 },
    { x: 4540, z: 4680, baseH: 14 },
    { x: 4460, z: 2480, baseH: 16 },
  ];
  for (const lh of lighthouses) {
    stampLighthouse(heights, surfaces, buildingMask, buildingColors, lh.x, lh.z);
  }

  // 4. Compute pre-baked directional sunlit colormap with patchwork fields, roofs, beaches, and runway stripes
  const sunDirX = 0.56;
  const sunDirY = 0.58;
  const sunDirZ = -0.59; // warm golden afternoon sun from the NE

  for (let gz = 0; gz < MAP_SIZE; gz++) {
    const rowOffset = gz * MAP_SIZE;
    const gzUp = gz > 0 ? gz - 1 : 0;
    const gzDn = gz < MAP_SIZE - 1 ? gz + 1 : MAP_SIZE - 1;

    for (let gx = 0; gx < MAP_SIZE; gx++) {
      const idx = rowOffset + gx;
      const surf = surfaces[idx];
      const h = heights[idx];
      const wx = gx * CELL_SIZE;
      const wz = gz * CELL_SIZE;

      if (surf === SURFACE.WATER) {
        // Deep cobalt ocean transitioning into glowing turquoise reef shallows and crisp white surf foam
        const shallow = smoothstep(0.0, 0.07, coastGlow[idx]);
        const surfFoam = smoothstep(0.056, 0.069, coastGlow[idx]);
        const wave = Math.sin(wx * 0.055 + wz * 0.032) * 0.5 + 0.5;
        const ripple = (hashCoordinates2D(gx >> 1, gz >> 1, seed + 5) - 0.5) * 10;
        let r = mixChannel(16, 50, shallow) + wave * 6 + ripple * 0.4;
        let g = mixChannel(68, 178, shallow) + wave * 12 + ripple * 0.5;
        let b = mixChannel(124, 186, shallow) + wave * 10 + ripple * 0.4;
        if (surfFoam > 0.01) {
          r = mixChannel(r, 238, surfFoam * 0.78);
          g = mixChannel(g, 245, surfFoam * 0.8);
          b = mixChannel(b, 246, surfFoam * 0.82);
        }
        colors[idx] = packRgba(clampByte(r), clampByte(g), clampByte(b), 255);
        continue;
      }

      // Compute terrain normal for directional sunlight & relief shading
      const gxL = gx > 0 ? gx - 1 : 0;
      const gxR = gx < MAP_SIZE - 1 ? gx + 1 : MAP_SIZE - 1;
      const dhx = (heights[rowOffset + gxR] - heights[rowOffset + gxL]) / (2 * CELL_SIZE);
      const dhz = (heights[gzDn * MAP_SIZE + gx] - heights[gzUp * MAP_SIZE + gx]) / (2 * CELL_SIZE);
      const invLen = 1 / Math.hypot(dhx, 1, dhz);
      const nx = -dhx * invLen;
      const ny = invLen;
      const nz = -dhz * invLen;
      const ndotl = Math.max(0, nx * sunDirX + ny * sunDirY + nz * sunDirZ);
      const shade = 0.56 + ndotl * 0.58;

      let r = 120;
      let g = 140;
      let b = 95;

      if (surf === SURFACE.RIVER) {
        r = 46;
        g = 136;
        b = 158;
      } else if (surf === SURFACE.SAND) {
        const grain = (hashCoordinates2D(gx, gz, seed + 9) - 0.5) * 16;
        r = 228 + grain;
        g = 204 + grain * 0.85;
        b = 152 + grain * 0.6;
      } else if (surf === SURFACE.FIELD) {
        // Anti-aliased patchwork agricultural fields with soft hedgerow transitions and fine crop furrows
        const u = wx * 0.866 + wz * 0.5;
        const v = -wx * 0.5 + wz * 0.866;
        const cellX = Math.floor(u / 128);
        const cellZ = Math.floor(v / 104);
        const localU = ((u % 128) + 128) % 128;
        const localV = ((v % 104) + 104) % 104;
        const distEdgeU = Math.min(localU, 128 - localU);
        const distEdgeV = Math.min(localV, 104 - localV);
        const hedgeBlend = 1 - smoothstep(3.5, 11.5, Math.min(distEdgeU, distEdgeV));
        const patchRand = hashCoordinates2D(cellX, cellZ, seed + 77);
        const furrow = Math.sin(u * 0.55) * 4.5 + (hashCoordinates2D(gx, gz, seed + 211) - 0.5) * 8;

        let fr = 110;
        let fg = 152;
        let fb = 76;
        if (patchRand < 0.27) {
          fr = 196 + furrow;
          fg = 172 + furrow * 0.8;
          fb = 92;
        } else if (patchRand < 0.58) {
          fr = 104 + furrow;
          fg = 154 + furrow;
          fb = 74;
        } else if (patchRand < 0.82) {
          fr = 84 + furrow * 0.6;
          fg = 128 + furrow * 0.6;
          fb = 66;
        } else {
          fr = 162 + furrow * 0.5;
          fg = 128 + furrow * 0.4;
          fb = 80;
        }

        r = mixChannel(fr, 58, hedgeBlend * 0.72);
        g = mixChannel(fg, 96, hedgeBlend * 0.72);
        b = mixChannel(fb, 52, hedgeBlend * 0.72);
      } else if (surf === SURFACE.FOREST) {
        const canopy = (hashCoordinates2D(gx, gz, seed + 101) - 0.5) * 24;
        r = 52 + canopy * 0.6;
        g = 108 + canopy;
        b = 54 + canopy * 0.5;
      } else if (surf === SURFACE.ROCK) {
        const strata = Math.sin(h * 0.25) * 12;
        const speck = (hashCoordinates2D(gx, gz, seed + 131) - 0.5) * 16;
        const snowCap = smoothstep(235, 272, h);
        r = mixChannel(126 + strata + speck, 224, snowCap);
        g = mixChannel(116 + strata + speck, 222, snowCap);
        b = mixChannel(106 + strata + speck, 214, snowCap);
      } else if (surf === SURFACE.TOWN) {
        if (buildingMask[idx]) {
          const packed = buildingColors[idx];
          r = packed & 255;
          g = (packed >> 8) & 255;
          b = (packed >> 16) & 255;
        } else {
          // Paved plaza & warm cobblestone roads
          r = 154;
          g = 148;
          b = 136;
        }
      } else if (surf === SURFACE.RUNWAY) {
        // Crisp asphalt with painted markings computed per airfield
        const painted = sampleRunwayMarkingsColor(wx, wz);
        r = painted[0];
        g = painted[1];
        b = painted[2];
      }

      // Warm golden sunlight tint on lit faces, subtle cool shadow on away faces
      const warmR = clampByte(r * (shade * 1.05));
      const warmG = clampByte(g * (shade * 1.01));
      const warmB = clampByte(b * (shade * 0.94 + (1 - ndotl) * 0.08));
      colors[idx] = packRgba(warmR, warmG, warmB, 255);
    }
  }

  return {
    seed,
    size: MAP_SIZE,
    cellSize: CELL_SIZE,
    worldSize: WORLD_SIZE,
    heights,
    colors,
    surfaces,
    airfields: AIRFIELDS,
    islands: ISLAND_MASKS,
    lighthouses,
  };
}

function getRunwayLocalCoords(wx, wz, field) {
  const rad = (field.headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fz = -Math.cos(rad);
  const rx = Math.cos(rad);
  const rz = Math.sin(rad);
  const dx = wx - field.cx;
  const dz = wz - field.cz;
  return {
    along: dx * fx + dz * fz,
    across: dx * rx + dz * rz,
  };
}

function sampleRunwayMarkingsColor(wx, wz) {
  for (let i = 0; i < AIRFIELDS.length; i++) {
    const field = AIRFIELDS[i];
    const { along, across } = getRunwayLocalCoords(wx, wz, field);
    const halfLen = field.length * 0.5;
    const halfWid = field.width * 0.5;
    if (Math.abs(along) <= halfLen + 10 && Math.abs(across) <= halfWid + 10) {
      // Grassy safety shoulder edge
      if (Math.abs(along) > halfLen || Math.abs(across) > halfWid) {
        return [175, 166, 130];
      }
      // Side white runway edge lines
      if (Math.abs(across) > halfWid - 4.5) {
        return [238, 236, 228];
      }
      // Piano-key threshold stripes near both ends
      if (Math.abs(along) > halfLen - 42 && Math.abs(along) < halfLen - 10) {
        const stripe = Math.floor((across + halfWid) / 7) % 2 === 0;
        if (stripe && Math.abs(across) < halfWid - 5) {
          return [244, 242, 234];
        }
      }
      // Dashed white centerline
      if (Math.abs(across) < 3.6 && Math.abs(along) < halfLen - 48) {
        const dash = ((along + halfLen) % 44) < 24;
        if (dash) return [245, 243, 235];
      }
      // Dark weathered tarmac with subtle tire rubber marks near touchdown zones
      const rubberZone = Math.abs(Math.abs(along) - (halfLen - 95)) < 36 && Math.abs(across) < 10;
      return rubberZone ? [52, 56, 62] : [68, 74, 82];
    }
  }
  return [70, 76, 84];
}

export function stampIslandRunway(heights, surfaces, field) {
  const halfLen = field.length * 0.5;
  const halfWid = field.width * 0.5;
  const padMargin = 110;
  const bound = Math.max(halfLen, halfWid) + padMargin;
  const minGx = Math.max(1, Math.floor((field.cx - bound) / CELL_SIZE));
  const maxGx = Math.min(MAP_SIZE - 2, Math.ceil((field.cx + bound) / CELL_SIZE));
  const minGz = Math.max(1, Math.floor((field.cz - bound) / CELL_SIZE));
  const maxGz = Math.min(MAP_SIZE - 2, Math.ceil((field.cz + bound) / CELL_SIZE));

  for (let gz = minGz; gz <= maxGz; gz++) {
    const wz = gz * CELL_SIZE;
    for (let gx = minGx; gx <= maxGx; gx++) {
      const wx = gx * CELL_SIZE;
      const idx = gz * MAP_SIZE + gx;
      const { along, across } = getRunwayLocalCoords(wx, wz, field);

      if (Math.abs(along) <= halfLen + 4 && Math.abs(across) <= halfWid + 4) {
        heights[idx] = field.elevation;
        surfaces[idx] = SURFACE.RUNWAY;
      } else {
        const dxOut = Math.max(0, Math.abs(along) - (halfLen + 4));
        const dzOut = Math.max(0, Math.abs(across) - (halfWid + 4));
        const distOut = Math.hypot(dxOut, dzOut);
        if (distOut < padMargin) {
          const blend = smoothstep(0, padMargin, distOut);
          const curH = heights[idx];
          heights[idx] = field.elevation * (1 - blend) + curH * blend;
          if (surfaces[idx] === SURFACE.WATER && blend < 0.45) {
            surfaces[idx] = SURFACE.SAND;
          }
        }
      }
    }
  }
}

export function stampCoastalTown(heights, surfaces, buildingMask, buildingColors, field, seed) {
  // Position the coastal town neatly beside the runway (offset laterally by 165 m)
  const rad = (field.headingDeg * Math.PI) / 180;
  const rx = Math.cos(rad);
  const rz = Math.sin(rad);
  const townCx = field.cx + rx * 170;
  const townCz = field.cz + rz * 170;
  const radius = 138;

  const minGx = Math.max(2, Math.floor((townCx - radius) / CELL_SIZE));
  const maxGx = Math.min(MAP_SIZE - 3, Math.ceil((townCx + radius) / CELL_SIZE));
  const minGz = Math.max(2, Math.floor((townCz - radius) / CELL_SIZE));
  const maxGz = Math.min(MAP_SIZE - 3, Math.ceil((townCz + radius) / CELL_SIZE));

  // Level town plateau slightly above sea level
  for (let gz = minGz; gz <= maxGz; gz++) {
    const wz = gz * CELL_SIZE;
    for (let gx = minGx; gx <= maxGx; gx++) {
      const wx = gx * CELL_SIZE;
      const d = Math.hypot(wx - townCx, wz - townCz);
      if (d > radius) continue;
      const idx = gz * MAP_SIZE + gx;
      if (surfaces[idx] === SURFACE.RUNWAY || surfaces[idx] === SURFACE.WATER) continue;

      const baseElev = Math.max(14, field.elevation - 2);
      const t = smoothstep(radius * 0.65, radius, d);
      heights[idx] = baseElev * (1 - t) + heights[idx] * t;
      if (d < radius * 0.85) {
        surfaces[idx] = SURFACE.TOWN;
      }
    }
  }

  // Stamp 3D voxel buildings (terracotta roofs, coral gables, cream hangars, blue boat sheds)
  const rng = createSeededRng(seed + 505);
  const roofPalette = [
    packRgba(198, 88, 62, 255),  // warm terracotta roof
    packRgba(226, 214, 192, 255), // cream stucco roof
    packRgba(174, 72, 54, 255),  // deep tile red
    packRgba(92, 134, 168, 255), // coastal slate blue hangar
    packRgba(214, 152, 74, 255), // ochre villa roof
  ];

  for (let b = 0; b < 34; b++) {
    const angle = rng() * Math.PI * 2;
    const dist = Math.sqrt(rng()) * (radius * 0.72);
    const bx = townCx + Math.cos(angle) * dist;
    const bz = townCz + Math.sin(angle) * dist;
    const bw = 2 + Math.floor(rng() * 2); // 16-24m
    const bd = 2 + Math.floor(rng() * 2);
    const bh = 8 + rng() * 14;
    const color = roofPalette[Math.floor(rng() * roofPalette.length)];

    const cgx = Math.floor(bx / CELL_SIZE);
    const cgz = Math.floor(bz / CELL_SIZE);
    const baseH = heights[cgz * MAP_SIZE + cgx];

    for (let dz = 0; dz < bd; dz++) {
      for (let dx = 0; dx < bw; dx++) {
        const gx = cgx + dx;
        const gz = cgz + dz;
        if (gx < 2 || gx >= MAP_SIZE - 2 || gz < 2 || gz >= MAP_SIZE - 2) continue;
        const idx = gz * MAP_SIZE + gx;
        if (surfaces[idx] !== SURFACE.TOWN) continue;
        heights[idx] = baseH + bh;
        buildingMask[idx] = 1;
        buildingColors[idx] = color;
      }
    }
  }
}

function stampLighthouse(heights, surfaces, buildingMask, buildingColors, wx, wz) {
  const cgx = Math.floor(wx / CELL_SIZE);
  const cgz = Math.floor(wz / CELL_SIZE);
  const baseH = Math.max(12, heights[cgz * MAP_SIZE + cgx]);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gx = cgx + dx;
      const gz = cgz + dz;
      const idx = gz * MAP_SIZE + gx;
      const isCenter = dx === 0 && dz === 0;
      heights[idx] = baseH + (isCenter ? 34 : 18);
      surfaces[idx] = SURFACE.TOWN;
      buildingMask[idx] = 1;
      buildingColors[idx] = isCenter ? packRgba(236, 68, 52, 255) : packRgba(246, 244, 236, 255);
    }
  }
}

export function sampleTerrainHeight(terrain, wx, wz) {
  const gx = wx / terrain.cellSize;
  const gz = wz / terrain.cellSize;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  if (ix < 0 || ix >= terrain.size - 1 || iz < 0 || iz >= terrain.size - 1) {
    return 0;
  }
  const fx = gx - ix;
  const fz = gz - iz;
  const row0 = iz * terrain.size;
  const row1 = row0 + terrain.size;
  const h00 = terrain.heights[row0 + ix];
  const h10 = terrain.heights[row0 + ix + 1];
  const h01 = terrain.heights[row1 + ix];
  const h11 = terrain.heights[row1 + ix + 1];
  const h0 = h00 + (h10 - h00) * fx;
  const h1 = h01 + (h11 - h01) * fx;
  return h0 + (h1 - h0) * fz;
}

export function sampleTerrainSurface(terrain, wx, wz) {
  const ix = Math.floor(wx / terrain.cellSize);
  const iz = Math.floor(wz / terrain.cellSize);
  if (ix < 0 || ix >= terrain.size || iz < 0 || iz >= terrain.size) {
    return SURFACE.WATER;
  }
  return terrain.surfaces[iz * terrain.size + ix];
}

export function findRunwayUnderPoint(terrain, wx, wz, margin = 6) {
  for (let i = 0; i < terrain.airfields.length; i++) {
    const field = terrain.airfields[i];
    const { along, across } = getRunwayLocalCoords(wx, wz, field);
    if (
      Math.abs(along) <= field.length * 0.5 + margin &&
      Math.abs(across) <= field.width * 0.5 + margin
    ) {
      return {
        field,
        along,
        across,
        centerlineRatio: Math.abs(across) / (field.width * 0.5),
      };
    }
  }
  return null;
}

export function createVoxelTerrainRenderer() {
  const bufferCanvas = document.createElement('canvas');
  bufferCanvas.width = VOXEL_WIDTH;
  bufferCanvas.height = VOXEL_HEIGHT;
  const bufferCtx = bufferCanvas.getContext('2d', { alpha: true });
  const imageData = bufferCtx.createImageData(VOXEL_WIDTH, VOXEL_HEIGHT);
  const pixels32 = new Uint32Array(imageData.data.buffer);
  const yBuffer = new Int16Array(VOXEL_WIDTH);

  return {
    bufferCanvas,
    bufferCtx,
    imageData,
    pixels32,
    yBuffer,
  };
}

export function renderVoxelTerrain(voxel, terrain, camera, sunDir) {
  const { pixels32, yBuffer, imageData, bufferCtx } = voxel;
  const width = VOXEL_WIDTH;
  const height = VOXEL_HEIGHT;
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const focal = CAMERA_FOCAL / VOXEL_SCALE;
  const horizonY = halfH + Math.tan(camera.pitch) * focal;

  // Clear transparent so the crisp main-canvas sky shows behind terrain
  pixels32.fill(0);
  yBuffer.fill(height);

  const fx = Math.sin(camera.yaw);
  const fz = -Math.cos(camera.yaw);
  const rx = Math.cos(camera.yaw);
  const rz = Math.sin(camera.yaw);

  const mapSize = terrain.size;
  const invCell = 1 / terrain.cellSize;
  const heights = terrain.heights;
  const colors = terrain.colors;
  const surfaces = terrain.surfaces;

  const fogR = PALETTE.fogColor[0];
  const fogG = PALETTE.fogColor[1];
  const fogB = PALETTE.fogColor[2];
  const oceanDeep = packRgba(24, 78, 128, 255);

  const camX = camera.x;
  const camY = camera.y;
  const camZ = camera.z;

  // Precompute column ray directions
  const invFocal = 1 / focal;

  // Depth marching from near to far with smoothly growing step size
  let dist = 16;
  let step = 4.2;

  while (dist < MAX_DRAW_DISTANCE) {
    const invDistFocal = focal / dist;
    const fogFactor = Math.min(0.96, 1 - Math.exp(-dist * 0.00056));
    const oneMinusFog = 1 - fogFactor;

    const baseX = camX + fx * dist;
    const baseZ = camZ + fz * dist;
    const stepX = rx * dist * invFocal;
    const stepZ = rz * dist * invFocal;

    let sampleX = baseX - stepX * halfW;
    let sampleZ = baseZ - stepZ * halfW;

    for (let col = 0; col < width; col++) {
      const prevTop = yBuffer[col];
      if (prevTop > 0) {
        const gx = Math.floor(sampleX * invCell);
        const gz = Math.floor(sampleZ * invCell);

        let groundH = 0;
        let colColor = oceanDeep;
        let isWater = true;

        if (gx >= 0 && gx < mapSize && gz >= 0 && gz < mapSize) {
          const idx = gz * mapSize + gx;
          groundH = heights[idx];
          colColor = colors[idx];
          isWater = surfaces[idx] === SURFACE.WATER;

          // Smooth bilinear color & height filtering on near terrain (< 620 m) to eliminate chunky texels
          if (dist < 620 && gx < mapSize - 1 && gz < mapSize - 1) {
            const fxCell = sampleX * invCell - gx;
            const fzCell = sampleZ * invCell - gz;
            const idxR = idx + 1;
            const idxD = idx + mapSize;
            const idxDR = idxD + 1;
            const h0 = heights[idx] + (heights[idxR] - heights[idx]) * fxCell;
            const h1 = heights[idxD] + (heights[idxDR] - heights[idxD]) * fxCell;
            groundH = h0 + (h1 - h0) * fzCell;

            const c00 = colColor;
            const c10 = colors[idxR];
            const c01 = colors[idxD];
            const c11 = colors[idxDR];
            const w00 = (1 - fxCell) * (1 - fzCell);
            const w10 = fxCell * (1 - fzCell);
            const w01 = (1 - fxCell) * fzCell;
            const w11 = fxCell * fzCell;
            const br = ((c00 & 255) * w00 + (c10 & 255) * w10 + (c01 & 255) * w01 + (c11 & 255) * w11) | 0;
            const bg = (((c00 >> 8) & 255) * w00 + ((c10 >> 8) & 255) * w10 + ((c01 >> 8) & 255) * w01 + ((c11 >> 8) & 255) * w11) | 0;
            const bb = (((c00 >> 16) & 255) * w00 + ((c10 >> 16) & 255) * w10 + ((c01 >> 16) & 255) * w01 + ((c11 >> 16) & 255) * w11) | 0;
            colColor = (255 << 24) | (bb << 16) | (bg << 8) | br;
          }
        }

        const projY = Math.floor(horizonY - (groundH - camY) * invDistFocal);

        if (projY < prevTop) {
          const drawStart = projY < 0 ? 0 : projY;
          let r = colColor & 255;
          let g = (colColor >> 8) & 255;
          let b = (colColor >> 16) & 255;

          // Subtle sunlit water shimmer path toward the sun
          if (isWater && dist > 180) {
            const rayAngle = Math.atan2(sampleX - camX, -(sampleZ - camZ));
            const sunDiff = Math.abs(Math.atan2(Math.sin(rayAngle - sunDir.azimuth), Math.cos(rayAngle - sunDir.azimuth)));
            if (sunDiff < 0.24) {
              const glint = (1 - sunDiff / 0.24);
              const sparkle = ((gx * 17 + gz * 31) & 7) === 0 ? 1.25 : 0.72;
              const boost = glint * glint * 92 * sparkle * (1 - fogFactor * 0.5);
              r = Math.min(255, r + boost);
              g = Math.min(255, g + boost * 0.85);
              b = Math.min(255, b + boost * 0.5);
            }
          }

          // Atmospheric distance fog blending smoothly into sunlit horizon
          const fr = (r * oneMinusFog + fogR * fogFactor) | 0;
          const fg = (g * oneMinusFog + fogG * fogFactor) | 0;
          const fb = (b * oneMinusFog + fogB * fogFactor) | 0;
          const finalColor = (255 << 24) | (fb << 16) | (fg << 8) | fr;

          let pIdx = drawStart * width + col;
          for (let y = drawStart; y < prevTop; y++) {
            pixels32[pIdx] = finalColor;
            pIdx += width;
          }
          yBuffer[col] = drawStart;
        }
      }

      sampleX += stepX;
      sampleZ += stepZ;
    }

    dist += step;
    step *= 1.019;
  }

  // Fill any tiny remaining strip between farthest water sample and true horizon line with blended horizon haze
  const horizRow = Math.max(0, Math.min(height, Math.floor(horizonY)));
  const horizonFill = packRgba(fogR, fogG, fogB, 255);
  for (let col = 0; col < width; col++) {
    const prevTop = yBuffer[col];
    if (prevTop > horizRow) {
      let pIdx = horizRow * width + col;
      for (let y = horizRow; y < prevTop; y++) {
        pixels32[pIdx] = horizonFill;
        pIdx += width;
      }
    }
  }

  bufferCtx.putImageData(imageData, 0, 0);
  return voxel.bufferCanvas;
}
