// Flight dynamics, throttle/turn energy, stall mechanics, wind drift, landing evaluation, and chase camera.

import {
  FEET_TO_METERS,
  FLIGHT_TUNING,
  KNOTS_TO_WORLD_MPS,
  METERS_TO_FEET,
  MPS_TO_FPM,
  SURFACE,
} from './config.js';
import { findRunwayUnderPoint, sampleTerrainHeight, sampleTerrainSurface } from './terrain.js';

export function wrapAngle(rad) {
  let a = rad % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a;
}

export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createAircraftState(spawn) {
  return {
    x: spawn.x,
    y: spawn.altitudeFt * FEET_TO_METERS,
    z: spawn.z,
    heading: (spawn.headingDeg * Math.PI) / 180,
    pitch: spawn.pitchRad ?? 0,
    bank: spawn.bankRad ?? 0,
    airspeedKt: spawn.airspeedKt ?? 102,
    throttle: spawn.throttle ?? 0.72,
    airbrake: false,
    verticalSpeedFpm: 0,
    fuel: spawn.fuel ?? 100,
    hull: 100,
    onGround: false,
    stallFactor: 0,
    aglMeters: spawn.altitudeFt * FEET_TO_METERS,
    lastLandingQuality: null,
    crashReport: null,
    touchdownEvents: [],
    wingTrailTimer: 0,
  };
}

export function createChaseCamera(plane) {
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);
  return {
    x: plane.x - fx * 34,
    y: plane.y + 8.5,
    z: plane.z - fz * 34,
    yaw: plane.heading,
    pitch: plane.pitch * 0.65 - 0.055,
    roll: plane.bank * 0.32,
  };
}

export function computeAerodynamicForces(plane, controls, wind, dt) {
  const T = FLIGHT_TUNING;

  // Throttle update (smooth, responsive)
  if (controls.throttleDelta !== 0) {
    plane.throttle = Math.max(0, Math.min(1, plane.throttle + controls.throttleDelta * 0.58 * dt));
  }
  plane.airbrake = Boolean(controls.airbrake);

  // Fuel consumption scales nonlinearly with throttle to reward cruise discipline
  const effectiveThrottle = plane.fuel > 0 ? plane.throttle : 0;
  if (plane.fuel > 0) {
    const burnRate = T.fuelBaseBurnPerSec + Math.pow(effectiveThrottle, 1.75) * T.fuelThrottleBurnPerSec;
    plane.fuel = Math.max(0, plane.fuel - burnRate * dt);
  }

  // Control authority scales smoothly with airspeed so controls always answer but feel weighty when slow
  const authority = Math.max(0.42, Math.min(1.18, plane.airspeedKt / 92));

  // Bank (roll) and self-centering stability
  if (Math.abs(controls.roll) > 0.01) {
    plane.bank += controls.roll * T.bankRateRad * authority * dt;
  } else {
    plane.bank *= Math.exp(-T.bankSelfLevelRate * dt);
  }
  plane.bank = Math.max(-T.maxBankRad, Math.min(T.maxBankRad, plane.bank));

  // Pitch control
  if (Math.abs(controls.pitch) > 0.01) {
    plane.pitch += controls.pitch * T.pitchRateRad * authority * dt;
  } else {
    // Gentle pitch trim stability toward level flight
    plane.pitch *= Math.exp(-0.32 * dt);
  }

  // Stall behavior below STALL_SPEED when airborne
  if (!plane.onGround && plane.airspeedKt < T.stallSpeedKt) {
    plane.stallFactor = Math.min(1, (T.stallSpeedKt - plane.airspeedKt) / 16);
    plane.pitch -= T.stallNoseDropRad * plane.stallFactor * dt;
  } else {
    plane.stallFactor = Math.max(0, plane.stallFactor - dt * 2.5);
  }
  plane.pitch = Math.max(-T.maxPitchRad, Math.min(T.maxPitchRad, plane.pitch));

  // Coordinated banking turn: steeper bank turns faster, modulated by airspeed
  const speedTurnScale = Math.max(0.45, Math.min(1.25, 104 / Math.max(55, plane.airspeedKt)));
  const turnRate = Math.sin(plane.bank) * T.turnRateFactor * speedTurnScale;
  plane.heading = wrapAngle(plane.heading + turnRate * dt);

  // Thrust vs aerodynamic drag + gravity exchange (diving builds speed, climbing spends it)
  const thrust = effectiveThrottle * T.maxThrustKtPerSec;
  const inducedDrag = Math.abs(Math.sin(plane.bank)) * 6.5;
  const aeroDrag = plane.airspeedKt * plane.airspeedKt * T.baseDragFactor;
  const brakeDrag = plane.airbrake ? (plane.onGround ? T.groundBrakeKtPerSec : T.airbrakeDragKtPerSec) : 0;
  const groundRollDrag = plane.onGround ? 7.5 : 0;
  const gravityAccel = -Math.sin(plane.pitch) * T.gravityPitchAccel;

  const accelKt = thrust - aeroDrag - inducedDrag - brakeDrag - groundRollDrag + gravityAccel;
  const minSpd = plane.onGround ? 0 : T.minSpeedKt;
  plane.airspeedKt = Math.max(minSpd, Math.min(T.maxSpeedKt, plane.airspeedKt + accelKt * dt));

  // Compute 3D velocity vector including light coastal tradewind drift
  const speedWorld = plane.airspeedKt * KNOTS_TO_WORLD_MPS;
  const cosP = Math.cos(plane.pitch);
  const sinP = Math.sin(plane.pitch);
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);

  // Banked flight loses a touch of vertical lift unless nose is held up
  const bankSinkMps = plane.onGround ? 0 : (1 - Math.cos(plane.bank)) * 5.2;
  const stallSinkMps = plane.onGround ? 0 : plane.stallFactor * 10.5;
  const vy = speedWorld * sinP - bankSinkMps - stallSinkMps;

  const windScale = plane.onGround ? 0.12 : 0.42;
  const vx = speedWorld * cosP * fx + wind.vx * windScale;
  const vz = speedWorld * cosP * fz + wind.vz * windScale;

  plane.x += vx * dt;
  plane.y += vy * dt;
  plane.z += vz * dt;
  plane.verticalSpeedFpm = vy * MPS_TO_FPM;

  // Soft archipelago boundary turn-back so pilot never flies off the edge of the world
  const margin = 420;
  if (plane.x < margin) plane.x = margin;
  if (plane.x > 8192 - margin) plane.x = 8192 - margin;
  if (plane.z < margin) plane.z = margin;
  if (plane.z > 8192 - margin) plane.z = 8192 - margin;
}

export function evaluateTouchdown(plane, runwayHit) {
  const T = FLIGHT_TUNING;
  const sinkFpm = Math.max(0, -plane.verticalSpeedFpm);
  const bankDeg = Math.abs((plane.bank * 180) / Math.PI);
  const speedKt = plane.airspeedKt;

  // Check runway alignment (allow landing from either end: 09 or 27)
  const rwyRad = (runwayHit.field.headingDeg * Math.PI) / 180;
  const diffFwd = Math.abs(angleDelta(plane.heading, rwyRad));
  const diffRev = Math.abs(angleDelta(plane.heading, wrapAngle(rwyRad + Math.PI)));
  const alignDeg = (Math.min(diffFwd, diffRev) * 180) / Math.PI;

  if (sinkFpm > 1050 || bankDeg > 28 || alignDeg > 42) {
    return {
      outcome: 'crash',
      grade: 'CRASH',
      damage: 100,
      reason:
        sinkFpm > 1050
          ? `HARD IMPACT ON ${runwayHit.field.name.toUpperCase()} — EXCESSIVE SINK RATE (${Math.round(sinkFpm)} FPM)`
          : bankDeg > 28
            ? `WING STRIKE ON TOUCHDOWN — BANK ANGLE ${Math.round(bankDeg)}°`
            : `RUNWAY EXCURSION — MISALIGNED BY ${Math.round(alignDeg)}°`,
      sinkFpm,
      bankDeg,
      speedKt,
      alignDeg,
      centerlineRatio: runwayHit.centerlineRatio,
      field: runwayHit.field,
    };
  }

  let grade = 'SMOOTH';
  let damage = 0;

  if (sinkFpm <= T.smoothSinkFpm && bankDeg <= 10 && speedKt <= 92 && runwayHit.centerlineRatio <= 0.45) {
    grade = 'GREASER';
    damage = 0;
  } else if (sinkFpm <= T.firmSinkFpm && bankDeg <= T.maxSafeBankDeg && speedKt <= T.maxSafeTouchdownKt) {
    grade = 'FIRM';
    damage = Math.round(Math.max(0, (sinkFpm - 320) * 0.04));
  } else {
    grade = 'HARD';
    damage = Math.round(24 + Math.max(0, (sinkFpm - 550) * 0.08) + Math.max(0, bankDeg - 14) * 1.4);
  }

  return {
    outcome: 'landed',
    grade,
    damage,
    sinkFpm,
    bankDeg,
    speedKt,
    alignDeg,
    centerlineRatio: runwayHit.centerlineRatio,
    field: runwayHit.field,
  };
}

export function checkTerrainCollision(plane, terrain) {
  const groundH = sampleTerrainHeight(terrain, plane.x, plane.z);
  const wheelClearance = 1.6;
  plane.aglMeters = Math.max(0, plane.y - groundH);

  // Check if airborne or touching ground
  if (plane.y > groundH + wheelClearance) {
    plane.onGround = false;
    return null;
  }

  const runwayHit = findRunwayUnderPoint(terrain, plane.x, plane.z, 10);
  if (runwayHit) {
    const wasAirborne = !plane.onGround;
    plane.y = runwayHit.field.elevation + wheelClearance;
    plane.aglMeters = 0;

    if (wasAirborne) {
      const report = evaluateTouchdown(plane, runwayHit);
      plane.onGround = true;
      plane.pitch = Math.max(0, plane.pitch * 0.25);
      plane.bank *= 0.2;
      plane.verticalSpeedFpm = 0;

      if (report.outcome === 'crash') {
        plane.hull = 0;
        plane.crashReport = {
          title: 'HARD LANDING CRASH',
          reason: report.reason,
          airspeedKt: Math.round(plane.airspeedKt),
          sinkFpm: Math.round(report.sinkFpm),
          altitudeFt: Math.round(plane.y * METERS_TO_FEET),
        };
        return { type: 'crash', report: plane.crashReport };
      }

      plane.hull = Math.max(0, plane.hull - report.damage);
      plane.lastLandingQuality = report;
      if (plane.hull <= 0) {
        plane.crashReport = {
          title: 'AIRFRAME FAILURE',
          reason: `CUMULATIVE LANDING DAMAGE EXCEEDED HULL LIMIT ON ${runwayHit.field.name.toUpperCase()}.`,
          airspeedKt: Math.round(plane.airspeedKt),
          sinkFpm: Math.round(report.sinkFpm),
          altitudeFt: Math.round(plane.y * METERS_TO_FEET),
        };
        return { type: 'crash', report: plane.crashReport };
      }
      return { type: 'touchdown', report };
    }

    // Rolling along runway: allow gentle liftoff if speed & pitch up
    if (plane.airspeedKt > 62 && plane.pitch > 0.08) {
      plane.onGround = false;
    } else {
      plane.pitch = Math.max(0, Math.min(0.14, plane.pitch));
      plane.bank *= 0.65;
      plane.verticalSpeedFpm = 0;
    }
    return { type: 'rolling', field: runwayHit.field };
  }

  // Off-runway impact (ocean ditching or terrain crash)
  const surface = sampleTerrainSurface(terrain, plane.x, plane.z);
  const sinkFpm = Math.max(0, -plane.verticalSpeedFpm);
  plane.y = groundH + 1.0;
  plane.hull = 0;

  let title = 'TERRAIN IMPACT';
  let reason = `COLLIDED WITH RISING ISLAND TERRAIN AT ${Math.round(plane.airspeedKt)} KT.`;
  if (plane.stallFactor > 0.35) {
    title = 'STALL CRASH';
    reason = `LOST LIFT BELOW STALL SPEED (${Math.round(plane.airspeedKt)} KT) AND IMPACTED SURFACE.`;
  } else if (surface === SURFACE.WATER) {
    title = 'OPEN WATER DITCHING';
    reason = `SPLASHED DOWN IN THE STRAIT AT ${Math.round(plane.airspeedKt)} KT (${Math.round(sinkFpm)} FPM SINK).`;
  } else if (surface === SURFACE.TOWN) {
    title = 'COASTAL TOWN COLLISION';
    reason = `STRUCK HARBOR STRUCTURES AT LOW ALTITUDE (${Math.round(plane.airspeedKt)} KT).`;
  }

  plane.crashReport = {
    title,
    reason,
    airspeedKt: Math.round(plane.airspeedKt),
    sinkFpm: Math.round(sinkFpm),
    altitudeFt: Math.round(plane.y * METERS_TO_FEET),
  };
  return { type: 'crash', report: plane.crashReport };
}

export function stepFlightPhysics(plane, controls, terrain, wind, dt) {
  computeAerodynamicForces(plane, controls, wind, dt);
  const surfaceEvent = checkTerrainCollision(plane, terrain);

  // Check fuel exhaustion crash if stopped or unable to fly
  if (!surfaceEvent && plane.fuel <= 0 && plane.onGround && plane.airspeedKt < 8) {
    plane.crashReport = {
      title: 'FUEL EXHAUSTED',
      reason: 'TANKS RAN DRY SHORT OF MISSION COMPLETION. MANAGE CRUISE THROTTLE TO EXTEND RANGE.',
      airspeedKt: Math.round(plane.airspeedKt),
      sinkFpm: 0,
      altitudeFt: Math.round(plane.y * METERS_TO_FEET),
    };
    return { type: 'crash', report: plane.crashReport };
  }

  return surfaceEvent;
}

export function updateChaseCamera(camera, plane, terrain, dt) {
  const followDist = 34;
  const followHeight = 8.4 - plane.pitch * 3.2;
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);

  const targetX = plane.x - fx * followDist;
  const targetZ = plane.z - fz * followDist;
  const groundUnderCam = sampleTerrainHeight(terrain, targetX, targetZ);
  const targetY = Math.max(groundUnderCam + 4.5, plane.y + followHeight);

  const posSmooth = 1 - Math.exp(-8.5 * dt);
  const rotSmooth = 1 - Math.exp(-7.2 * dt);

  camera.x += (targetX - camera.x) * posSmooth;
  camera.y += (targetY - camera.y) * posSmooth;
  camera.z += (targetZ - camera.z) * posSmooth;

  camera.yaw = wrapAngle(camera.yaw + angleDelta(camera.yaw, plane.heading) * rotSmooth);
  const targetPitch = plane.pitch * 0.62 - 0.055;
  camera.pitch += (targetPitch - camera.pitch) * rotSmooth;

  // Camera banks ~34% of aircraft bank so the horizon tilts cinematically without fighting the pilot
  const targetRoll = Math.max(-0.34, Math.min(0.34, plane.bank * 0.34));
  camera.roll += (targetRoll - camera.roll) * rotSmooth;
}
