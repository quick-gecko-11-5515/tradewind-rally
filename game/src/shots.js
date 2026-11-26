// Deterministic ?shot= screenshot state setup using seeded RNG and genuine physics autopilot.

import { AIRFIELDS, FEET_TO_METERS } from './config.js';
import { getMissionDefinition, createMissionState, checkRingPassed, checkCourierDelivery } from './missions.js';
import { angleDelta, createAircraftState, createChaseCamera, stepFlightPhysics, updateChaseCamera, wrapAngle } from './physics.js';
import { spawnFlightParticles, updateFlightParticles } from './render.js';

export function parseShotQuery(searchString = window.location.search) {
  const params = new URLSearchParams(searchString);
  const shot = params.get('shot');
  const seedRaw = Number(params.get('seed'));
  const seed = Number.isFinite(seedRaw) && seedRaw > 0 ? Math.floor(seedRaw) : 7;
  if (!shot) return null;
  return { shot, seed };
}

export function runAutopilotStep(plane, target, desiredSpeedKt, airbrake = false) {
  const bearing = wrapAngle(Math.atan2(target.x - plane.x, -(target.z - plane.z)));
  const headingErr = angleDelta(plane.heading, bearing);
  const desiredBank = Math.max(-0.52, Math.min(0.52, headingErr * 1.4));
  const rollCmd = Math.max(-1, Math.min(1, (desiredBank - plane.bank) * 3.2));

  const altErr = target.y - plane.y;
  const distHoriz = Math.max(40, Math.hypot(target.x - plane.x, target.z - plane.z));
  const desiredPitch = Math.max(-0.22, Math.min(0.24, Math.atan2(altErr, distHoriz) * 1.6));
  const pitchCmd = Math.max(-1, Math.min(1, (desiredPitch - plane.pitch) * 3.5));

  const speedErr = desiredSpeedKt - plane.airspeedKt;
  const throttleDelta = speedErr > 4 ? 1 : speedErr < -4 ? -1 : 0;

  return {
    roll: rollCmd,
    pitch: pitchCmd,
    throttleDelta,
    airbrake,
  };
}

export function prepareDeterministicShot(shotConfig, terrain, renderer) {
  const { shot } = shotConfig;
  const dt = 1 / 60;

  if (shot === 'title') {
    const def = getMissionDefinition('ring-rally');
    const mission = createMissionState(def);
    const plane = createAircraftState({
      x: 3420,
      z: 5050,
      altitudeFt: 485,
      headingDeg: 46,
      airspeedKt: 112,
      throttle: 0.76,
      fuel: 94,
      bankRad: 0.24,
      pitchRad: 0.05,
    });
    const camera = createChaseCamera(plane);
    let lastControls = { roll: 0.3, pitch: 0.06, throttleDelta: 0, airbrake: false };
    for (let step = 0; step < 30; step++) {
      lastControls = { roll: 0.24, pitch: 0.05, throttleDelta: 0, airbrake: false };
      stepFlightPhysics(plane, lastControls, terrain, mission.wind, dt);
      updateChaseCamera(camera, plane, terrain, dt);
    }
    // Slight pitch offset so the hero aircraft rides cleanly in the upper-middle sky above the mission cards
    camera.pitch -= 0.07;
    return { screen: 'title', mission, plane, camera, controls: lastControls, timeSec: 1.8 };
  }

  if (shot === 'cover') {
    // Showcase chase frame: Ring Rally banking cleanly over the turquoise shoreline into Kestrel Key,
    // with sunlit banked aircraft, glowing Ring #7 + #8 ahead, Kestrel Strip runway & coastal harbor beyond,
    // ocean + sandy beach + patchwork fields + mountain peak, and full lit HUD!
    const def = getMissionDefinition('ring-rally');
    const mission = createMissionState(def);
    mission.elapsedSec = 41.2;
    mission.ringsPassed = 6;
    mission.score = 2140;
    for (let i = 0; i < 6; i++) mission.rings[i].passed = true;

    const plane = createAircraftState({
      x: 4460,
      z: 5180,
      altitudeFt: 485,
      headingDeg: 44,
      airspeedKt: 116,
      throttle: 0.78,
      fuel: 78,
      bankRad: -0.32,
      pitchRad: -0.02,
    });
    const camera = createChaseCamera(plane);
    const targetRing = mission.rings[6];
    let lastControls = { roll: -0.45, pitch: 0.02, throttleDelta: 0, airbrake: false };

    for (let step = 0; step < 34; step++) {
      lastControls = runAutopilotStep(
        plane,
        { x: targetRing.x - 18, y: targetRing.y + 8, z: targetRing.z },
        116,
        false,
      );
      stepFlightPhysics(plane, lastControls, terrain, mission.wind, dt);
      updateChaseCamera(camera, plane, terrain, dt);
      mission.elapsedSec += dt;
    }

    return { screen: 'playing', mission, plane, camera, controls: lastControls, timeSec: 42.3 };
  }

  if (shot === 'approach') {
    // Dramatic low-altitude final approach into Coral Haven Runway 09 with 2 white / 2 red PAPI lights,
    // approach gate, Coral Town rooftops, lighthouse cape, and airbrake deployed.
    const def = getMissionDefinition('island-hop');
    const mission = createMissionState(def);
    mission.elapsedSec = 46.2;
    mission.ringsPassed = 1;
    mission.rings[0].passed = true;
    mission.score = 380;

    const coral = AIRFIELDS.find((f) => f.id === 'coral');
    const plane = createAircraftState({
      x: 4140,
      z: 2274,
      altitudeFt: 255,
      headingDeg: 89,
      airspeedKt: 79,
      throttle: 0.44,
      fuel: 66,
      bankRad: 0.06,
      pitchRad: -0.045,
    });
    const camera = createChaseCamera(plane);
    let lastControls = { roll: 0, pitch: -0.04, throttleDelta: 0, airbrake: true };

    for (let step = 0; step < 52; step++) {
      lastControls = runAutopilotStep(
        plane,
        { x: coral.cx - 120, y: coral.elevation + 20, z: coral.cz },
        75,
        true,
      );
      stepFlightPhysics(plane, lastControls, terrain, mission.wind, dt);
      checkRingPassed(mission, plane);
      updateChaseCamera(camera, plane, terrain, dt);
      mission.elapsedSec += dt;
    }

    return { screen: 'playing', mission, plane, camera, controls: lastControls, timeSec: 47.1 };
  }

  // 'landing': Smooth GREASER touchdown (0% damage, 100% hull) and rollout on Coral Haven Runway 09
  const def = getMissionDefinition('island-hop');
  const mission = createMissionState(def);
  mission.elapsedSec = 52.8;
  mission.ringsPassed = 2;
  mission.rings.forEach((r) => {
    r.passed = true;
  });
  mission.score = 740;

  const coral = AIRFIELDS.find((f) => f.id === 'coral');
  const plane = createAircraftState({
    x: coral.cx - 210,
    z: coral.cz,
    altitudeFt: (coral.elevation + 3.4) * 3.28084,
    headingDeg: 90,
    airspeedKt: 74,
    throttle: 0.12,
    fuel: 64,
    bankRad: 0,
    pitchRad: -0.04,
  });
  const camera = createChaseCamera(plane);
  let lastControls = { roll: 0, pitch: 0.02, throttleDelta: 0, airbrake: false };

  // Fly genuine gentle flare above stall speed -> greaser touchdown (0% dmg) -> wheel-braked rollout
  for (let step = 0; step < 360 && !mission.completed; step++) {
    const airborne = !plane.onGround;
    lastControls = {
      roll: 0,
      pitch: airborne ? -0.015 : 0,
      throttleDelta: airborne ? 0 : -1,
      airbrake: !airborne,
    };
    const ev = stepFlightPhysics(plane, lastControls, terrain, mission.wind, dt);
    if (ev && ev.type === 'touchdown') {
      spawnFlightParticles(renderer, 'smoke', plane.x - 10, coral.elevation + 1.0, plane.z - 2.2, 6);
      spawnFlightParticles(renderer, 'smoke', plane.x - 10, coral.elevation + 1.0, plane.z + 2.2, 6);
    }
    if (ev && (ev.type === 'touchdown' || ev.type === 'rolling')) {
      checkCourierDelivery(mission, plane, ev);
    }
    if (plane.onGround && plane.airspeedKt > 28 && step % 16 === 0) {
      spawnFlightParticles(renderer, 'smoke', plane.x - 12, coral.elevation + 1.0, plane.z, 2);
    }
    updateFlightParticles(renderer, dt);
    updateChaseCamera(camera, plane, terrain, dt);
    mission.elapsedSec += dt;
  }

  return { screen: 'summary', mission, plane, camera, controls: lastControls, timeSec: 56.2 };
}
