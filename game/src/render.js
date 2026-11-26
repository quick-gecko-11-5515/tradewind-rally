// Unified scene renderer: golden-hour sky, sun, volumetric clouds, rotated voxel-space terrain,
// 3D runways/PAPI lights/target rings, aircraft, particles, and HUD composition.

import {
  AIRFIELDS,
  CAMERA_FOCAL,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PALETTE,
  VOXEL_HEIGHT,
  VOXEL_SCALE,
  VOXEL_WIDTH,
} from './config.js';
import { createSeededRng } from './random.js';
import { createVoxelTerrainRenderer, renderVoxelTerrain, sampleTerrainHeight } from './terrain.js';
import { drawAircraftShadow, drawPlayerAircraft } from './plane.js';
import { drawFlightHud } from './hud.js';
import { getActiveWaypoint } from './missions.js';

const SUN_AZIMUTH = 0.74; // NE golden sun
const SUN_ELEVATION = 0.24;

export function createSceneRenderer(seed = 7) {
  const voxel = createVoxelTerrainRenderer();
  const rng = createSeededRng(seed * 73 + 9);
  const clouds = [];

  for (let i = 0; i < 34; i++) {
    clouds.push({
      x: 900 + rng() * 6400,
      y: 340 + rng() * 240,
      z: 900 + rng() * 6400,
      radius: 110 + rng() * 145,
      puffs: 3 + Math.floor(rng() * 3),
      seed: rng() * 10,
    });
  }

  return {
    voxel,
    clouds,
    particles: [],
    sunDir: { azimuth: SUN_AZIMUTH, elevation: SUN_ELEVATION },
  };
}

export function spawnFlightParticles(renderer, kind, wx, wy, wz, count = 12) {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (i * 0.7);
    const spd = kind === 'ring' ? 18 + (i % 4) * 8 : kind === 'smoke' ? 5 + (i % 3) * 3 : 22 + (i % 5) * 9;
    renderer.particles.push({
      kind,
      x: wx + Math.cos(ang) * (kind === 'smoke' ? 3 : 1.5),
      y: wy + (kind === 'smoke' ? 0.6 : 0),
      z: wz + Math.sin(ang) * (kind === 'smoke' ? 3 : 1.5),
      vx: Math.cos(ang) * spd,
      vy: kind === 'smoke' ? 4 + (i % 3) * 2 : kind === 'crash' ? 14 + (i % 4) * 6 : Math.sin(ang) * spd * 0.5,
      vz: Math.sin(ang) * spd,
      life: 0,
      maxLife: kind === 'ring' ? 0.85 : kind === 'smoke' ? 1.45 : 1.6,
      size: kind === 'smoke' ? 3.2 : kind === 'crash' ? 4.8 : 2.6,
    });
  }
}

export function updateFlightParticles(renderer, dt) {
  const list = renderer.particles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      list.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.kind === 'smoke') {
      p.vx *= 0.94;
      p.vz *= 0.94;
      p.size += dt * 4.5;
    } else if (p.kind === 'crash') {
      p.vy -= 14 * dt;
      p.size += dt * 5.2;
    }
  }
}

export function projectWorldPoint(wx, wy, wz, camera) {
  const fx = Math.sin(camera.yaw);
  const fz = -Math.cos(camera.yaw);
  const rx = Math.cos(camera.yaw);
  const rz = Math.sin(camera.yaw);

  const dx = wx - camera.x;
  const dy = wy - camera.y;
  const dz = wz - camera.z;

  const depth = dx * fx + dz * fz;
  if (depth <= 2) return null;

  const lateral = dx * rx + dz * rz;
  const ux = (lateral / depth) * CAMERA_FOCAL;
  const uy = Math.tan(camera.pitch) * CAMERA_FOCAL - (dy / depth) * CAMERA_FOCAL;

  const cosR = Math.cos(-camera.roll);
  const sinR = Math.sin(-camera.roll);

  return {
    sx: CANVAS_WIDTH * 0.5 + ux * cosR - uy * sinR,
    sy: CANVAS_HEIGHT * 0.5 + ux * sinR + uy * cosR,
    depth,
    scale: CAMERA_FOCAL / depth,
  };
}

export function drawGoldenSky(ctx, camera, sunDir) {
  ctx.save();
  ctx.translate(CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.5);
  ctx.rotate(-camera.roll);

  const horizonOffset = Math.tan(camera.pitch) * CAMERA_FOCAL;
  const skyGrad = ctx.createLinearGradient(0, -CANVAS_HEIGHT * 0.85, 0, horizonOffset + 40);
  skyGrad.addColorStop(0, '#163f76');
  skyGrad.addColorStop(0.45, '#3b82be');
  skyGrad.addColorStop(0.82, '#99c4dc');
  skyGrad.addColorStop(0.95, '#edc592');
  skyGrad.addColorStop(1, '#f4cf9b');

  ctx.fillStyle = skyGrad;
  ctx.fillRect(-CANVAS_WIDTH, -CANVAS_HEIGHT, CANVAS_WIDTH * 2, CANVAS_HEIGHT * 2);

  // Radiant golden-hour sun positioned in world azimuth/elevation
  const relSunYaw = Math.atan2(
    Math.sin(sunDir.azimuth - camera.yaw),
    Math.cos(sunDir.azimuth - camera.yaw),
  );
  if (Math.abs(relSunYaw) < 1.2) {
    const sunX = Math.tan(relSunYaw) * CAMERA_FOCAL;
    const sunY = horizonOffset - Math.tan(sunDir.elevation) * CAMERA_FOCAL;

    const corona = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 210);
    corona.addColorStop(0, 'rgba(255, 250, 224, 0.96)');
    corona.addColorStop(0.18, 'rgba(255, 224, 150, 0.65)');
    corona.addColorStop(0.55, 'rgba(255, 186, 106, 0.18)');
    corona.addColorStop(1, 'rgba(255, 180, 100, 0)');
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 210, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.sunCore;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawVolumetricClouds(ctx, clouds, camera, timeSec) {
  const projected = [];
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    const driftX = (c.x + timeSec * 5) % 8192;
    const p = projectWorldPoint(driftX, c.y, c.z, camera);
    if (!p || p.depth > 4800 || p.depth < 140) continue;
    projected.push({ c, p });
  }
  projected.sort((a, b) => b.p.depth - a.p.depth);

  for (let i = 0; i < projected.length; i++) {
    const { c, p } = projected[i];
    const rPx = c.radius * p.scale;
    if (rPx < 4 || p.sx < -rPx * 2 || p.sx > CANVAS_WIDTH + rPx * 2) continue;

    const fade = Math.min(1, (4800 - p.depth) / 1400) * Math.min(1, (p.depth - 140) / 280);
    ctx.save();
    ctx.translate(p.sx, p.sy);
    ctx.rotate(-camera.roll);
    ctx.globalAlpha = fade * 0.84;

    // Warm lavender-slate cloud belly
    ctx.fillStyle = '#c4bfd0';
    ctx.beginPath();
    ctx.ellipse(0, rPx * 0.16, rPx * 1.15, rPx * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sunlit cream cumulus puffs
    for (let k = 0; k < c.puffs; k++) {
      const ox = (k - (c.puffs - 1) * 0.5) * rPx * 0.54;
      const oy = -Math.cos((k + c.seed) * 1.3) * rPx * 0.14;
      const pr = rPx * (0.42 + (k % 2) * 0.16);
      const grad = ctx.createRadialGradient(ox - pr * 0.2, oy - pr * 0.25, pr * 0.1, ox, oy, pr);
      grad.addColorStop(0, '#fffbf0');
      grad.addColorStop(0.68, '#f4ead8');
      grad.addColorStop(1, 'rgba(220, 212, 206, 0.2)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ox, oy, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawRunwayVisualAids(ctx, camera, plane, timeSec) {
  // Crisp 3D-projected runway threshold strobes, centerline highlights, and PAPI glide-slope lights
  for (let i = 0; i < AIRFIELDS.length; i++) {
    const f = AIRFIELDS[i];
    const distToField = Math.hypot(f.cx - plane.x, f.cz - plane.z);
    if (distToField > 2600) continue;

    const rad = (f.headingDeg * Math.PI) / 180;
    const fx = Math.sin(rad);
    const fz = -Math.cos(rad);
    const rx = Math.cos(rad);
    const rz = Math.sin(rad);
    const halfLen = f.length * 0.5;
    const halfWid = f.width * 0.5;

    // Project 4 runway corners for a razor-sharp tarmac edge accent when close
    const c1 = projectWorldPoint(f.cx - fx * halfLen - rx * halfWid, f.elevation + 0.4, f.cz - fz * halfLen - rz * halfWid, camera);
    const c2 = projectWorldPoint(f.cx - fx * halfLen + rx * halfWid, f.elevation + 0.4, f.cz - fz * halfLen + rz * halfWid, camera);
    const c3 = projectWorldPoint(f.cx + fx * halfLen + rx * halfWid, f.elevation + 0.4, f.cz + fz * halfLen + rz * halfWid, camera);
    const c4 = projectWorldPoint(f.cx + fx * halfLen - rx * halfWid, f.elevation + 0.4, f.cz + fz * halfLen - rz * halfWid, camera);

    if (c1 && c2 && c3 && c4 && distToField < 1850) {
      ctx.save();
      ctx.fillStyle = 'rgba(54, 60, 68, 0.86)';
      ctx.strokeStyle = 'rgba(244, 240, 226, 0.72)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(c1.sx, c1.sy);
      ctx.lineTo(c2.sx, c2.sy);
      ctx.lineTo(c3.sx, c3.sy);
      ctx.lineTo(c4.sx, c4.sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Piano-key threshold markings at approach end
      for (let s = -3; s <= 3; s++) {
        if (s === 0) continue;
        const off = s * (halfWid * 0.24);
        const pA = projectWorldPoint(f.cx - fx * (halfLen - 8) + rx * off, f.elevation + 0.5, f.cz - fz * (halfLen - 8) + rz * off, camera);
        const pB = projectWorldPoint(f.cx - fx * (halfLen - 34) + rx * off, f.elevation + 0.5, f.cz - fz * (halfLen - 34) + rz * off, camera);
        if (pA && pB) {
          ctx.strokeStyle = 'rgba(250, 248, 240, 0.9)';
          ctx.lineWidth = Math.max(1.2, pA.scale * 2.2);
          ctx.beginPath();
          ctx.moveTo(pA.sx, pA.sy);
          ctx.lineTo(pB.sx, pB.sy);
          ctx.stroke();
        }
      }

      // Crisp dashed centerline along runway
      for (let seg = -halfLen + 48; seg < halfLen - 42; seg += 48) {
        const pA = projectWorldPoint(f.cx + fx * seg, f.elevation + 0.5, f.cz + fz * seg, camera);
        const pB = projectWorldPoint(f.cx + fx * (seg + 24), f.elevation + 0.5, f.cz + fz * (seg + 24), camera);
        if (pA && pB) {
          ctx.strokeStyle = 'rgba(250, 246, 234, 0.9)';
          ctx.lineWidth = Math.max(1.2, pA.scale * 1.9);
          ctx.beginPath();
          ctx.moveTo(pA.sx, pA.sy);
          ctx.lineTo(pB.sx, pB.sy);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Approach threshold green lights & crisp 4-bulb PAPI glide-slope indicator beside threshold
    const threshX = f.cx - fx * halfLen;
    const threshZ = f.cz - fz * halfLen;

    for (let k = -2; k <= 2; k++) {
      const gx = threshX + rx * (k * 9.5);
      const gz = threshZ + rz * (k * 9.5);
      const pt = projectWorldPoint(gx, f.elevation + 1.6, gz, camera);
      if (!pt || pt.depth > 2100) continue;
      const radPx = Math.max(1.8, Math.min(4.2, pt.scale * 2.6));
      const pulse = 0.78 + Math.sin(timeSec * 6 + k) * 0.22;
      ctx.fillStyle = `rgba(92, 246, 178, ${pulse.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, radPx, 0, Math.PI * 2);
      ctx.fill();
    }

    // PAPI 4-light bar on the left side of the approach zone (authentic 3° glide slope indicator)
    const distFromThresh = Math.max(40, Math.hypot(plane.x - threshX, plane.z - threshZ));
    const glideDeg = (Math.atan2(plane.y - f.elevation, distFromThresh) * 180) / Math.PI;
    const papiThresholds = [2.2, 2.9, 3.8, 4.7];
    for (let pIdx = 0; pIdx < 4; pIdx++) {
      const px = f.cx - fx * (halfLen - 54) - rx * (halfWid + 12 + pIdx * 7.5);
      const pz = f.cz - fz * (halfLen - 54) - rz * (halfWid + 12 + pIdx * 7.5);
      const pt = projectWorldPoint(px, f.elevation + 2.2, pz, camera);
      if (!pt || pt.depth > 2100) continue;
      const isWhite = glideDeg > papiThresholds[pIdx];
      const radPx = Math.max(2.0, Math.min(4.8, pt.scale * 3.0));
      const glow = ctx.createRadialGradient(pt.sx, pt.sy, 0.4, pt.sx, pt.sy, radPx * 2.4);
      glow.addColorStop(0, isWhite ? '#ffffff' : '#ffaca0');
      glow.addColorStop(0.5, isWhite ? 'rgba(255, 250, 224, 0.78)' : 'rgba(255, 58, 44, 0.85)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, radPx * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = isWhite ? '#ffffff' : '#ff6050';
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, radPx * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    // Coastal windsock mast beside mid-runway
    const sockBase = projectWorldPoint(f.cx - rx * (halfWid + 22), f.elevation, f.cz - rz * (halfWid + 22), camera);
    const sockTop = projectWorldPoint(f.cx - rx * (halfWid + 22), f.elevation + 15, f.cz - rz * (halfWid + 22), camera);
    if (sockBase && sockTop && sockBase.depth < 1400) {
      ctx.save();
      ctx.strokeStyle = '#dde4ec';
      ctx.lineWidth = Math.max(1.2, sockTop.scale * 0.9);
      ctx.beginPath();
      ctx.moveTo(sockBase.sx, sockBase.sy);
      ctx.lineTo(sockTop.sx, sockTop.sy);
      ctx.stroke();

      const sockLen = Math.max(6, Math.min(24, sockTop.scale * 8));
      const flutter = Math.sin(timeSec * 9) * 2.5;
      ctx.fillStyle = '#f26038';
      ctx.beginPath();
      ctx.moveTo(sockTop.sx, sockTop.sy - 2);
      ctx.lineTo(sockTop.sx + sockLen, sockTop.sy + flutter);
      ctx.lineTo(sockTop.sx + sockLen, sockTop.sy + 4 + flutter);
      ctx.lineTo(sockTop.sx, sockTop.sy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

export function drawWorldRingsAndBeacons(ctx, mission, camera, timeSec) {
  const drawList = [];
  for (let i = mission.ringsPassed; i < mission.rings.length; i++) {
    const r = mission.rings[i];
    const p = projectWorldPoint(r.x, r.y, r.z, camera);
    if (!p || p.depth > 2800) continue;
    drawList.push({ r, p, isNext: i === mission.ringsPassed, offsetIdx: i - mission.ringsPassed });
  }
  drawList.sort((a, b) => b.p.depth - a.p.depth);

  for (let i = 0; i < drawList.length; i++) {
    const { r, p, isNext, offsetIdx } = drawList[i];
    const radPx = r.radius * p.scale;
    if (radPx < 3 || radPx > 520) continue;

    ctx.save();
    ctx.translate(p.sx, p.sy);
    ctx.rotate(-camera.roll);

    const alpha = isNext ? 0.96 : Math.max(0.24, 0.65 - offsetIdx * 0.16);
    ctx.globalAlpha = alpha;

    // Outer luminous halo for the active next target ring
    if (isNext) {
      const glow = ctx.createRadialGradient(0, 0, radPx * 0.72, 0, 0, radPx * 1.38);
      glow.addColorStop(0, 'rgba(255, 204, 72, 0)');
      glow.addColorStop(0.55, 'rgba(255, 198, 72, 0.34)');
      glow.addColorStop(1, 'rgba(255, 174, 52, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, radPx * 1.38, 0, Math.PI * 2);
      ctx.fill();
    }

    // Thick 3D-styled segmented aero beacon ring (dark steel rim + golden-amber lit core)
    const rimW = Math.max(3, radPx * 0.14);
    ctx.strokeStyle = isNext ? '#243244' : 'rgba(32, 46, 64, 0.7)';
    ctx.lineWidth = rimW + 3;
    ctx.beginPath();
    ctx.arc(0, 0, radPx, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = isNext ? '#ffc84d' : '#74d6c4';
    ctx.lineWidth = rimW;
    ctx.beginPath();
    ctx.arc(0, 0, radPx, 0, Math.PI * 2);
    ctx.stroke();

    // Animated rotating directional beacon segments around the ring
    const spin = timeSec * (isNext ? 1.4 : 0.7);
    ctx.strokeStyle = isNext ? '#fff7dc' : '#d2fff6';
    ctx.lineWidth = Math.max(2, rimW * 0.48);
    for (let seg = 0; seg < 4; seg++) {
      const a0 = spin + (seg * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(0, 0, radPx, a0, a0 + 0.42);
      ctx.stroke();
    }

    // Center crosshair chevrons & sequence badge on active ring
    if (isNext && radPx > 16) {
      const badgeY = -radPx - 14;
      ctx.fillStyle = 'rgba(13, 22, 34, 0.88)';
      ctx.strokeStyle = '#ffc84d';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(-28, badgeY - 10, 56, 20, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff5dc';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`RING ${r.index + 1}`, 0, badgeY);
    }
    ctx.restore();
  }
}

export function drawFlightParticles(ctx, renderer, camera) {
  const list = renderer.particles;
  for (let i = 0; i < list.length; i++) {
    const pt = list[i];
    const proj = projectWorldPoint(pt.x, pt.y, pt.z, camera);
    if (!proj || proj.depth < 14) continue;
    const t = pt.life / pt.maxLife;
    const rad = Math.max(1.5, Math.min(pt.kind === 'smoke' ? 24 : 34, pt.size * proj.scale * 0.45));

    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    if (pt.kind === 'ring') {
      ctx.fillStyle = t < 0.4 ? '#fff6c8' : '#ffba42';
      ctx.beginPath();
      ctx.arc(proj.sx, proj.sy, rad, 0, Math.PI * 2);
      ctx.fill();
    } else if (pt.kind === 'smoke') {
      const grad = ctx.createRadialGradient(proj.sx, proj.sy, 1, proj.sx, proj.sy, rad);
      grad.addColorStop(0, 'rgba(244, 242, 236, 0.48)');
      grad.addColorStop(0.6, 'rgba(225, 224, 220, 0.22)');
      grad.addColorStop(1, 'rgba(220, 220, 220, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(proj.sx, proj.sy, rad, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = t < 0.35 ? '#ff7c3a' : '#3a3a42';
      ctx.beginPath();
      ctx.arc(proj.sx, proj.sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawOffscreenWaypointArrow(ctx, mission, camera, plane) {
  if (mission.completed) return;
  const wp = getActiveWaypoint(mission);
  if (!wp) return;
  const proj = projectWorldPoint(wp.x, wp.y, wp.z, camera);
  const inBounds =
    proj &&
    proj.sx > 80 &&
    proj.sx < CANVAS_WIDTH - 80 &&
    proj.sy > 90 &&
    proj.sy < CANVAS_HEIGHT - 160;
  if (inBounds) return;

  // Compute bearing indicator arrow along the edge of the screen
  const fx = Math.sin(camera.yaw);
  const fz = -Math.cos(camera.yaw);
  const rx = Math.cos(camera.yaw);
  const rz = Math.sin(camera.yaw);
  const dx = wp.x - plane.x;
  const dz = wp.z - plane.z;
  const side = dx * rx + dz * rz;
  const fwd = dx * fx + dz * fz;
  const ang = Math.atan2(side, fwd);

  const edgeX = Math.max(96, Math.min(CANVAS_WIDTH - 96, CANVAS_WIDTH * 0.5 + Math.sin(ang) * 520));
  const edgeY = Math.max(112, Math.min(CANVAS_HEIGHT - 190, 220 - Math.cos(ang) * 90));

  ctx.save();
  ctx.translate(edgeX, edgeY);
  ctx.fillStyle = 'rgba(13, 22, 34, 0.85)';
  ctx.strokeStyle = '#ffca54';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(-52, -14, 104, 28, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffca54';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const dirArrow = side >= 0 ? '▸' : '◂';
  const distKm = (Math.hypot(dx, dz) / 1000).toFixed(1);
  ctx.fillText(`${dirArrow} ${distKm} KM`, 0, 0);
  ctx.restore();
}

export function renderFlightFrame(ctx, renderer, terrain, plane, camera, mission, controls, timeSec, options = {}) {
  // 1. Golden-hour sky gradient + radiant sun
  drawGoldenSky(ctx, camera, renderer.sunDir);

  // 2. Volumetric cumulus clouds behind and over the archipelago
  drawVolumetricClouds(ctx, renderer.clouds, camera, timeSec);

  // 3. Voxel-space procedural terrain (rendered unrolled, drawn rotated by chase roll)
  const voxelCanvas = renderVoxelTerrain(renderer.voxel, terrain, camera, renderer.sunDir);
  ctx.save();
  ctx.translate(CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.5);
  ctx.rotate(-camera.roll);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    voxelCanvas,
    -(VOXEL_WIDTH * VOXEL_SCALE) * 0.5,
    -(VOXEL_HEIGHT * VOXEL_SCALE) * 0.5,
    VOXEL_WIDTH * VOXEL_SCALE,
    VOXEL_HEIGHT * VOXEL_SCALE,
  );
  ctx.restore();

  // 4. Crisp 3D runway markings, threshold strobes, and PAPI glide-slope lights
  drawRunwayVisualAids(ctx, camera, plane, timeSec);

  // 5. Floating target rings & rally gates
  if (mission) {
    drawWorldRingsAndBeacons(ctx, mission, camera, timeSec);
  }

  // 6. Aircraft ground shadow when flying low over terrain or runway
  const groundH = sampleTerrainHeight(terrain, plane.x, plane.z);
  const shadowProj = projectWorldPoint(plane.x, groundH + 0.6, plane.z, camera);
  if (shadowProj) {
    drawAircraftShadow(ctx, shadowProj.sx, shadowProj.sy, Math.max(0, plane.y - groundH), plane.bank, shadowProj.scale * 1.15);
  }

  // 7. World-space particles (tire smoke, ring burst sparks, crash plume)
  drawFlightParticles(ctx, renderer, camera);

  // 8. Articulated 3D player aircraft in chase view
  const planeProj = projectWorldPoint(plane.x, plane.y, plane.z, camera);
  const px = planeProj ? planeProj.sx : CANVAS_WIDTH * 0.5;
  const py = planeProj ? planeProj.sy : CANVAS_HEIGHT * 0.61;
  drawPlayerAircraft(ctx, plane, camera, controls, timeSec, px, py);

  // 9. Flight HUD & offscreen waypoint guide (hidden on Title background flyover)
  if (options.showHud && mission) {
    drawOffscreenWaypointArrow(ctx, mission, camera, plane);
    drawFlightHud(ctx, plane, mission, Boolean(options.muted));
  }
}
