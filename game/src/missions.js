// Definitions and runtime progression for 3 distinct missions: Ring Rally, Island Hop, Courier Run.

import { AIRFIELDS, FEET_TO_METERS, METERS_TO_FEET } from './config.js';

export const MISSION_CATALOG = [
  {
    id: 'ring-rally',
    code: 'SORTIE 01',
    name: 'Ring Rally',
    tag: 'TIME TRIAL',
    description:
      'Race through 10 glowing aerial rally rings sweeping from Aurelia Atoll across Breeze Cay into Kestrel Strip. Balance bank angle and throttle to hold cornering energy.',
    objectives: [
      'Fly cleanly through all 10 numbered aerial rings in order',
      'Maintain maneuvering speed (85–125 KT) through banked coastal turns',
      'Finish fast for maximum time and fuel efficiency bonuses',
    ],
    windDeg: 75,
    windKt: 8,
    parTimeSec: 88,
    spawn: {
      x: 1840,
      z: 5360,
      altitudeFt: 420,
      headingDeg: 88,
      airspeedKt: 108,
      throttle: 0.76,
      fuel: 100,
    },
    rings: [
      { x: 2240, z: 5360, altFt: 380, radius: 44 },
      { x: 2740, z: 5310, altFt: 420, radius: 44 },
      { x: 3260, z: 5120, altFt: 480, radius: 44 },
      { x: 3740, z: 4860, altFt: 510, radius: 44 },
      { x: 4240, z: 4890, altFt: 490, radius: 44 },
      { x: 4720, z: 4840, altFt: 460, radius: 42 },
      { x: 4920, z: 4540, altFt: 390, radius: 42 },
      { x: 4920, z: 4160, altFt: 340, radius: 42 },
      { x: 4960, z: 3720, altFt: 430, radius: 44 },
      { x: 5040, z: 3240, altFt: 480, radius: 46 },
    ],
    targetAirfieldIds: ['kestrel'],
  },
  {
    id: 'island-hop',
    code: 'SORTIE 02',
    name: 'Island Hop',
    tag: 'PRECISION LANDING',
    description:
      'Depart over Tern Shoal and execute a precision coastal approach into Coral Haven Runway 09. Use PAPI lights and airbrakes to flare smoothly below 360 FPM.',
    objectives: [
      'Pass through the 2 final-approach alignment gates west of Coral Haven',
      'Stabilize airspeed near 72–82 KT using throttle and Space airbrake',
      'Touch down gently on Runway 09 and roll below 24 KT to complete sortie',
    ],
    windDeg: 120,
    windKt: 12,
    parTimeSec: 70,
    spawn: {
      x: 3420,
      z: 2740,
      altitudeFt: 640,
      headingDeg: 66,
      airspeedKt: 104,
      throttle: 0.68,
      fuel: 80,
    },
    rings: [
      { x: 4060, z: 2380, altFt: 420, radius: 52 },
      { x: 4480, z: 2260, altFt: 245, radius: 46 },
    ],
    targetAirfieldIds: ['coral'],
  },
  {
    id: 'courier-run',
    code: 'SORTIE 03',
    name: 'Courier Run',
    tag: 'FUEL STRATEGY',
    description:
      'Deliver urgent archipelago mail pouches to all 3 island runways on a limited 62% fuel load. Throttle discipline separates a clean run from an empty tank.',
    objectives: [
      'Deliver mail at Aurelia Field (09), Kestrel Strip (36), and Coral Haven (09)',
      'Touch down cleanly on each strip to drop the pouch, then throttle up for departure',
      'Conserve fuel by cruising at 55–68% throttle between islands',
    ],
    windDeg: 45,
    windKt: 10,
    parTimeSec: 175,
    spawn: {
      x: 1780,
      z: 5360,
      altitudeFt: 360,
      headingDeg: 90,
      airspeedKt: 96,
      throttle: 0.62,
      fuel: 62,
    },
    rings: [],
    targetAirfieldIds: ['aurelia', 'kestrel', 'coral'],
  },
];

export function getMissionDefinition(missionId) {
  return MISSION_CATALOG.find((m) => m.id === missionId) || MISSION_CATALOG[0];
}

export function createMissionState(missionDef) {
  const windRad = (missionDef.windDeg * Math.PI) / 180;
  const windSpeedMps = missionDef.windKt * 0.45;
  return {
    def: missionDef,
    elapsedSec: 0,
    score: 0,
    ringsPassed: 0,
    totalRings: missionDef.rings.length,
    rings: missionDef.rings.map((r, idx) => ({
      index: idx,
      x: r.x,
      y: r.altFt * FEET_TO_METERS,
      z: r.z,
      radius: r.radius,
      passed: false,
    })),
    deliveredAirfields: [],
    deliveryTargetIndex: 0,
    landingReports: [],
    wind: {
      deg: missionDef.windDeg,
      kt: missionDef.windKt,
      vx: Math.sin(windRad) * windSpeedMps,
      vz: -Math.cos(windRad) * windSpeedMps,
    },
    bannerText: '',
    bannerTimer: 0,
    completed: false,
    summary: null,
  };
}

export function getActiveWaypoint(mission) {
  if (mission.def.id === 'ring-rally') {
    const nextRing = mission.rings[mission.ringsPassed];
    if (nextRing) {
      return {
        kind: 'ring',
        label: `RING ${mission.ringsPassed + 1}/${mission.totalRings}`,
        x: nextRing.x,
        y: nextRing.y,
        z: nextRing.z,
      };
    }
  }

  if (mission.def.id === 'island-hop') {
    const nextGate = mission.rings[mission.ringsPassed];
    if (nextGate) {
      return {
        kind: 'ring',
        label: `APPROACH GATE ${mission.ringsPassed + 1}/${mission.totalRings}`,
        x: nextGate.x,
        y: nextGate.y,
        z: nextGate.z,
      };
    }
    const field = AIRFIELDS.find((f) => f.id === 'coral');
    return {
      kind: 'runway',
      label: `LAND RWY ${field.runwayLabel} • ${field.name.toUpperCase()}`,
      x: field.cx,
      y: field.elevation + 4,
      z: field.cz,
      field,
    };
  }

  // Courier Run
  const targetId = mission.def.targetAirfieldIds[mission.deliveryTargetIndex];
  const field = AIRFIELDS.find((f) => f.id === targetId) || AIRFIELDS[0];
  return {
    kind: 'runway',
    label: `DELIVER ${mission.deliveryTargetIndex + 1}/3 • ${field.name.toUpperCase()}`,
    x: field.cx,
    y: field.elevation + 4,
    z: field.cz,
    field,
  };
}

export function checkRingPassed(mission, plane) {
  if (mission.ringsPassed >= mission.rings.length) return null;
  const ring = mission.rings[mission.ringsPassed];
  const dx = plane.x - ring.x;
  const dy = plane.y - ring.y;
  const dz = plane.z - ring.z;
  const dist = Math.hypot(dx, dy, dz);

  if (dist <= ring.radius + 8) {
    ring.passed = true;
    mission.ringsPassed += 1;
    const centerPrecision = Math.max(0, 1 - dist / (ring.radius + 8));
    const points = Math.round(250 + centerPrecision * 150);
    mission.score += points;
    mission.bannerText =
      mission.def.id === 'ring-rally'
        ? `RING ${mission.ringsPassed}/${mission.totalRings} CLEARED  +${points}`
        : `APPROACH GATE ${mission.ringsPassed} ALIGNED  +${points}`;
    mission.bannerTimer = 2.1;

    if (mission.def.id === 'ring-rally' && mission.ringsPassed >= mission.totalRings) {
      mission.completed = true;
      mission.summary = computeSortieScore(mission, plane, null);
    }
    return { ring, points, completed: mission.completed };
  }
  return null;
}

export function scoreLandingQuality(report) {
  if (!report) return { label: 'N/A', bonus: 0 };
  if (report.grade === 'GREASER') return { label: 'GREASER TOUCHDOWN', bonus: 650 };
  if (report.grade === 'SMOOTH') return { label: 'SMOOTH LANDING', bonus: 500 };
  if (report.grade === 'FIRM') return { label: 'FIRM TOUCHDOWN', bonus: 320 };
  return { label: 'HARD LANDING', bonus: 120 };
}

export function checkCourierDelivery(mission, plane, surfaceEvent) {
  if (!surfaceEvent) return null;

  // Island Hop finishes once safely rolled down on Coral Haven
  if (mission.def.id === 'island-hop') {
    if (plane.hull <= 0) return null;
    const isTarget =
      (surfaceEvent.type === 'touchdown' && surfaceEvent.report.field.id === 'coral') ||
      (surfaceEvent.type === 'rolling' && surfaceEvent.field.id === 'coral');
    if (!isTarget) return null;

    if (surfaceEvent.type === 'touchdown') {
      mission.landingReports.push(surfaceEvent.report);
      const q = scoreLandingQuality(surfaceEvent.report);
      mission.score += q.bonus;
      mission.bannerText = `${q.label} (${Math.round(surfaceEvent.report.sinkFpm)} FPM) — BRAKE TO STOP`;
      mission.bannerTimer = 3.2;
    }

    if (plane.onGround && plane.airspeedKt <= 26) {
      const report = mission.landingReports[mission.landingReports.length - 1] || plane.lastLandingQuality;
      mission.completed = true;
      mission.summary = computeSortieScore(mission, plane, report);
      return { delivered: true, completed: true };
    }
    return null;
  }

  // Courier Run delivers on touchdown at each of the 3 airfields in sequence
  if (mission.def.id === 'courier-run') {
    const expectedId = mission.def.targetAirfieldIds[mission.deliveryTargetIndex];
    const hitField =
      surfaceEvent.type === 'touchdown'
        ? surfaceEvent.report.field
        : surfaceEvent.type === 'rolling'
          ? surfaceEvent.field
          : null;
    if (!hitField || hitField.id !== expectedId) return null;

    if (!mission.deliveredAirfields.includes(expectedId)) {
      mission.deliveredAirfields.push(expectedId);
      mission.deliveryTargetIndex += 1;
      const report = surfaceEvent.type === 'touchdown' ? surfaceEvent.report : plane.lastLandingQuality;
      if (report) mission.landingReports.push(report);
      const q = scoreLandingQuality(report);
      const deliveryPts = 500 + q.bonus;
      mission.score += deliveryPts;

      if (mission.deliveryTargetIndex >= mission.def.targetAirfieldIds.length) {
        mission.bannerText = `FINAL PARCEL DELIVERED AT ${hitField.name.toUpperCase()}!`;
        mission.bannerTimer = 3.0;
        mission.completed = true;
        mission.summary = computeSortieScore(mission, plane, report);
        return { delivered: true, completed: true, field: hitField };
      }

      mission.bannerText = `MAIL DROPPED AT ${hitField.name.toUpperCase()} (+${deliveryPts}) • NEXT LEG!`;
      mission.bannerTimer = 3.4;
      return { delivered: true, completed: false, field: hitField };
    }
  }

  return null;
}

export function computeSortieScore(mission, plane, landingReport) {
  const timeDelta = Math.max(0, mission.def.parTimeSec - mission.elapsedSec);
  const timeBonus = Math.round(timeDelta * 18);
  const fuelBonus = Math.round(plane.fuel * 12);
  const hullBonus = Math.round(plane.hull * 5);
  const landingScore = scoreLandingQuality(landingReport);
  const rows = [];

  if (mission.totalRings > 0) {
    rows.push({ label: `Rings / Gates Cleared (${mission.ringsPassed}/${mission.totalRings})`, value: `+${mission.score}` });
  } else {
    rows.push({ label: `Courier Deliveries (${mission.deliveredAirfields.length}/3)`, value: `+${mission.score}` });
  }

  if (landingReport) {
    rows.push({
      label: `Touchdown (${landingReport.grade}, ${Math.round(landingReport.sinkFpm)} FPM)`,
      value: landingReport.damage === 0 ? '0% DMG' : `-${landingReport.damage}% HULL`,
    });
  }

  rows.push({ label: `Time Bonus (${mission.elapsedSec.toFixed(1)}s vs ${mission.def.parTimeSec}s par)`, value: `+${timeBonus}` });
  rows.push({ label: `Fuel Remaining (${Math.round(plane.fuel)}%)`, value: `+${fuelBonus}` });
  rows.push({ label: `Airframe Integrity (${Math.round(plane.hull)}%)`, value: `+${hullBonus}` });

  const total = mission.score + timeBonus + fuelBonus + hullBonus;
  const grade = total >= 3800 ? 'S' : total >= 3000 ? 'A+' : total >= 2200 ? 'A' : total >= 1500 ? 'B' : 'C';

  let subtitle = `${mission.def.name} logged in ${mission.elapsedSec.toFixed(1)}s with ${Math.round(plane.fuel)}% fuel remaining.`;
  if (landingReport) {
    subtitle = `${landingScore.label} on ${landingReport.field.name} Runway ${landingReport.field.runwayLabel} at ${Math.round(landingReport.speedKt)} KT (${Math.round(landingReport.sinkFpm)} FPM sink).`;
  }

  return {
    title: landingReport ? 'TOUCHDOWN CONFIRMED' : 'RALLY COURSE COMPLETE',
    subtitle,
    grade,
    rows,
    total,
  };
}

export function drawBriefingMap(canvas, terrain, missionDef) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Nautical chart ocean background
  ctx.fillStyle = '#0e3559';
  ctx.fillRect(0, 0, w, h);

  // Chart lat/lon grid lines
  ctx.strokeStyle = 'rgba(130, 192, 236, 0.16)';
  ctx.lineWidth = 1;
  for (let x = 38; x < w; x += 38) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 35; y < h; y += 35) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const toMapX = (wx) => ((wx - 1000) / 5600) * w;
  const toMapY = (wz) => ((wz - 1100) / 5500) * h;

  // Draw archipelago island silhouettes
  for (const isl of terrain.islands) {
    const cx = toMapX(isl.cx);
    const cy = toMapY(isl.cz);
    const rx = (isl.rx / 5600) * w * 0.88;
    const ry = (isl.rz / 5500) * h * 0.88;

    ctx.fillStyle = 'rgba(72, 186, 188, 0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.15, ry * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#5f9a66';
    ctx.strokeStyle = '#e5cf9c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(244, 236, 220, 0.82)';
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillText(isl.name.toUpperCase(), cx - rx * 0.55, cy + ry + 11);
  }

  // Draw flight route line
  ctx.strokeStyle = '#f6b84c';
  ctx.lineWidth = 2.2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(toMapX(missionDef.spawn.x), toMapY(missionDef.spawn.z));
  for (const r of missionDef.rings) {
    ctx.lineTo(toMapX(r.x), toMapY(r.z));
  }
  for (const id of missionDef.targetAirfieldIds) {
    const f = AIRFIELDS.find((a) => a.id === id);
    if (f) ctx.lineTo(toMapX(f.cx), toMapY(f.cz));
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw rings on chart
  for (const r of missionDef.rings) {
    ctx.fillStyle = '#ffcf66';
    ctx.beginPath();
    ctx.arc(toMapX(r.x), toMapY(r.z), 3.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw runways on chart
  for (const f of AIRFIELDS) {
    const fx = toMapX(f.cx);
    const fy = toMapY(f.cz);
    const isTarget = missionDef.targetAirfieldIds.includes(f.id);
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate((f.headingDeg * Math.PI) / 180);
    ctx.fillStyle = isTarget ? '#7eead3' : '#d8dde4';
    ctx.fillRect(-2.5, -10, 5, 20);
    ctx.restore();
  }

  // Spawn aircraft triangle
  ctx.fillStyle = '#ff725c';
  ctx.beginPath();
  ctx.arc(toMapX(missionDef.spawn.x), toMapY(missionDef.spawn.z), 5, 0, Math.PI * 2);
  ctx.fill();

  // Compass rose in corner
  ctx.fillStyle = 'rgba(244, 236, 220, 0.85)';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillText('N ▲', w - 34, 18);
  ctx.fillText(`ALT START ${Math.round(missionDef.spawn.altitudeFt)} FT`, 10, h - 10);
}
