// Application boot, screen state machine, fixed-timestep flight loop, and UI controller.

import { createFlightAudio } from './audio.js';
import { createInputController } from './input.js';
import {
  MISSION_CATALOG,
  checkCourierDelivery,
  checkRingPassed,
  createMissionState,
  drawBriefingMap,
  getMissionDefinition,
} from './missions.js';
import { createAircraftState, createChaseCamera, stepFlightPhysics, updateChaseCamera } from './physics.js';
import { createSceneRenderer, renderFlightFrame, spawnFlightParticles, updateFlightParticles } from './render.js';
import { parseShotQuery, prepareDeterministicShot } from './shots.js';
import { generateArchipelago } from './terrain.js';

export function bootTradewindRally() {
  const canvas = document.getElementById('flight-canvas');
  const ctx = canvas.getContext('2d');

  const screens = {
    title: document.getElementById('screen-title'),
    briefing: document.getElementById('screen-briefing'),
    pause: document.getElementById('screen-pause'),
    summary: document.getElementById('screen-summary'),
    crash: document.getElementById('screen-crash'),
  };

  const shotQuery = parseShotQuery();
  const worldSeed = shotQuery ? shotQuery.seed : 7;
  const terrain = generateArchipelago(worldSeed);
  const renderer = createSceneRenderer(worldSeed);
  const audio = createFlightAudio();

  const app = {
    screen: 'title',
    selectedMissionId: 'ring-rally',
    mission: null,
    plane: null,
    camera: null,
    timeSec: 0,
    lastControls: { roll: 0, pitch: 0, throttleDelta: 0, airbrake: false },
    demoOrbitAngle: 0,
    staticShotMode: Boolean(shotQuery),
  };

  function setScreen(nextScreen) {
    app.screen = nextScreen;
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle('hidden', key !== nextScreen);
    });
  }

  function initTitleBackdropFlight() {
    const def = getMissionDefinition(app.selectedMissionId);
    app.mission = createMissionState(def);
    app.plane = createAircraftState({
      x: 2080,
      z: 5400,
      altitudeFt: 470,
      headingDeg: 74,
      airspeedKt: 108,
      throttle: 0.74,
      fuel: 100,
      bankRad: 0.14,
    });
    app.camera = createChaseCamera(app.plane);
  }

  function populateBriefing(missionId) {
    const def = getMissionDefinition(missionId);
    document.getElementById('briefing-code').textContent = `${def.code} • ${def.tag}`;
    document.getElementById('briefing-title').textContent = def.name;
    document.getElementById('briefing-wind').textContent = `WIND ${String(def.windDeg).padStart(3, '0')}° / ${def.windKt} KT`;
    document.getElementById('briefing-desc').textContent = def.description;
    const listEl = document.getElementById('briefing-objectives');
    listEl.innerHTML = '';
    for (const obj of def.objectives) {
      const li = document.createElement('li');
      li.textContent = obj;
      listEl.appendChild(li);
    }
    drawBriefingMap(document.getElementById('briefing-map'), terrain, def);
  }

  function showSummaryScreen(summary) {
    document.getElementById('summary-title').textContent = summary.title;
    document.getElementById('summary-subtitle').textContent = summary.subtitle;
    document.getElementById('summary-grade').textContent = summary.grade;
    document.getElementById('summary-total').textContent = summary.total.toLocaleString();

    const breakdownEl = document.getElementById('summary-breakdown');
    breakdownEl.innerHTML = '';
    for (const row of summary.rows) {
      const div = document.createElement('div');
      div.className = 'score-row';
      div.innerHTML = `<span>${row.label}</span><strong>${row.value}</strong>`;
      breakdownEl.appendChild(div);
    }
    setScreen('summary');
  }

  function showCrashScreen(report) {
    document.getElementById('crash-title').textContent = report.title;
    document.getElementById('crash-reason').textContent = report.reason;
    const teleEl = document.getElementById('crash-telemetry');
    teleEl.innerHTML = `
      <div class="telemetry-box">IMPACT SPEED<strong>${report.airspeedKt} KT</strong></div>
      <div class="telemetry-box">SINK RATE<strong>${report.sinkFpm} FPM</strong></div>
      <div class="telemetry-box">ALTITUDE<strong>${report.altitudeFt} FT</strong></div>
    `;
    setScreen('crash');
  }

  function startMission(missionId = app.selectedMissionId) {
    app.selectedMissionId = missionId;
    const def = getMissionDefinition(missionId);
    app.mission = createMissionState(def);
    app.plane = createAircraftState(def.spawn);
    app.camera = createChaseCamera(app.plane);
    renderer.particles.length = 0;
    app.mission.bannerText = `${def.name.toUpperCase()} — SORTIE ACTIVE`;
    app.mission.bannerTimer = 2.4;
    audio.ensureStarted();
    setScreen('playing');
  }

  // Wire mission cards on title screen
  const missionCards = document.querySelectorAll('#title-mission-list .mission-card');
  missionCards.forEach((card) => {
    card.addEventListener('click', () => {
      audio.playUiClick();
      app.selectedMissionId = card.dataset.mission;
      missionCards.forEach((c) => c.classList.toggle('selected', c === card));
    });
  });

  // Wire buttons across all overlays
  document.getElementById('btn-open-briefing').addEventListener('click', () => {
    audio.playUiClick();
    populateBriefing(app.selectedMissionId);
    setScreen('briefing');
  });
  document.getElementById('btn-quick-fly').addEventListener('click', () => {
    audio.playUiClick();
    startMission(app.selectedMissionId);
  });
  document.getElementById('btn-briefing-back').addEventListener('click', () => {
    audio.playUiClick();
    setScreen('title');
  });
  document.getElementById('btn-briefing-launch').addEventListener('click', () => {
    audio.playUiClick();
    startMission(app.selectedMissionId);
  });
  document.getElementById('btn-resume').addEventListener('click', () => {
    audio.playUiClick();
    setScreen('playing');
  });
  document.getElementById('btn-pause-restart').addEventListener('click', () => {
    audio.playUiClick();
    startMission(app.selectedMissionId);
  });
  document.getElementById('btn-pause-menu').addEventListener('click', () => {
    audio.playUiClick();
    initTitleBackdropFlight();
    setScreen('title');
  });
  document.getElementById('btn-summary-retry').addEventListener('click', () => {
    audio.playUiClick();
    startMission(app.selectedMissionId);
  });
  document.getElementById('btn-summary-next').addEventListener('click', () => {
    audio.playUiClick();
    const idx = MISSION_CATALOG.findIndex((m) => m.id === app.selectedMissionId);
    const next = MISSION_CATALOG[(idx + 1) % MISSION_CATALOG.length];
    app.selectedMissionId = next.id;
    missionCards.forEach((c) => c.classList.toggle('selected', c.dataset.mission === next.id));
    populateBriefing(next.id);
    setScreen('briefing');
  });
  document.getElementById('btn-summary-menu').addEventListener('click', () => {
    audio.playUiClick();
    initTitleBackdropFlight();
    setScreen('title');
  });
  document.getElementById('btn-crash-retry').addEventListener('click', () => {
    audio.playUiClick();
    startMission(app.selectedMissionId);
  });
  document.getElementById('btn-crash-menu').addEventListener('click', () => {
    audio.playUiClick();
    initTitleBackdropFlight();
    setScreen('title');
  });

  // Keyboard & mouse controls
  const input = createInputController(canvas, {
    onUserGesture: () => audio.ensureStarted(),
    onTogglePause: () => {
      if (app.screen === 'playing') {
        audio.playUiClick();
        setScreen('pause');
      } else if (app.screen === 'pause') {
        audio.playUiClick();
        setScreen('playing');
      }
    },
    onToggleMute: () => {
      audio.toggleMute();
    },
    onRestart: () => {
      if (app.screen === 'playing' || app.screen === 'pause' || app.screen === 'crash' || app.screen === 'summary') {
        audio.playUiClick();
        startMission(app.selectedMissionId);
      }
    },
  });

  // Deterministic screenshot mode (?shot=cover|title|approach|landing)
  if (shotQuery) {
    const shotResult = prepareDeterministicShot(shotQuery, terrain, renderer);
    app.mission = shotResult.mission;
    app.plane = shotResult.plane;
    app.camera = shotResult.camera;
    app.lastControls = shotResult.controls;
    app.timeSec = shotResult.timeSec;

    if (shotResult.screen === 'summary' && app.mission.summary) {
      showSummaryScreen(app.mission.summary);
    } else {
      setScreen(shotResult.screen);
    }

    renderFlightFrame(ctx, renderer, terrain, app.plane, app.camera, app.mission, app.lastControls, app.timeSec, {
      showHud: shotResult.screen === 'playing' || shotResult.screen === 'summary',
      muted: false,
    });
    window.__TRADEWIND_SHOT_READY__ = true;
    return;
  }

  // Normal interactive boot
  initTitleBackdropFlight();
  setScreen('title');

  let lastTimestamp = performance.now();
  let accumulator = 0;
  const fixedDt = 1 / 60;

  function stepSimulation(dt) {
    app.timeSec += dt;

    if (app.screen === 'title' || app.screen === 'briefing') {
      // Gentle live archipelago flyover behind the Title & Briefing menus
      app.demoOrbitAngle += dt * 0.14;
      const demoControls = {
        roll: Math.sin(app.demoOrbitAngle) * 0.16,
        pitch: Math.cos(app.demoOrbitAngle * 0.7) * 0.03,
        throttleDelta: 0,
        airbrake: false,
      };
      app.lastControls = demoControls;
      app.plane.fuel = 100;
      stepFlightPhysics(app.plane, demoControls, terrain, app.mission.wind, dt);
      if (app.plane.y < 115) app.plane.y = 135;
      updateChaseCamera(app.camera, app.plane, terrain, dt);
      audio.updateEngineAudio(app.plane, false, dt);
      return;
    }

    if (app.screen !== 'playing') {
      updateFlightParticles(renderer, dt);
      audio.updateEngineAudio(app.plane, false, dt);
      return;
    }

    const controls = input.sampleFlightControls();
    app.lastControls = controls;
    app.mission.elapsedSec += dt;
    if (app.mission.bannerTimer > 0) {
      app.mission.bannerTimer = Math.max(0, app.mission.bannerTimer - dt);
    }

    const surfaceEvent = stepFlightPhysics(app.plane, controls, terrain, app.mission.wind, dt);
    const ringHit = checkRingPassed(app.mission, app.plane);
    if (ringHit) {
      audio.playRingChime();
      spawnFlightParticles(renderer, 'ring', ringHit.ring.x, ringHit.ring.y, ringHit.ring.z, 22);
      if (ringHit.completed && app.mission.summary) {
        showSummaryScreen(app.mission.summary);
      }
    }

    if (surfaceEvent) {
      if (surfaceEvent.type === 'crash') {
        audio.playCrashSound();
        spawnFlightParticles(renderer, 'crash', app.plane.x, app.plane.y, app.plane.z, 28);
        showCrashScreen(surfaceEvent.report);
      } else if (surfaceEvent.type === 'touchdown') {
        audio.playTouchdownSound(surfaceEvent.report.grade === 'HARD');
        spawnFlightParticles(renderer, 'smoke', app.plane.x, app.plane.y - 0.8, app.plane.z, 14);
        const delivery = checkCourierDelivery(app.mission, app.plane, surfaceEvent);
        if (delivery && delivery.completed && app.mission.summary) {
          audio.playRingChime();
          showSummaryScreen(app.mission.summary);
        }
      } else if (surfaceEvent.type === 'rolling') {
        if (app.plane.airspeedKt > 18 && Math.floor(app.timeSec * 20) % 3 === 0) {
          spawnFlightParticles(renderer, 'smoke', app.plane.x, app.plane.y - 0.8, app.plane.z, 2);
        }
        const delivery = checkCourierDelivery(app.mission, app.plane, surfaceEvent);
        if (delivery && delivery.completed && app.mission.summary) {
          audio.playRingChime();
          showSummaryScreen(app.mission.summary);
        }
      }
    }

    updateFlightParticles(renderer, dt);
    updateChaseCamera(app.camera, app.plane, terrain, dt);
    audio.updateEngineAudio(app.plane, true, dt);
  }

  function renderLoop(now) {
    const frameDt = Math.min(0.05, (now - lastTimestamp) / 1000);
    lastTimestamp = now;
    accumulator += frameDt;

    while (accumulator >= fixedDt) {
      stepSimulation(fixedDt);
      accumulator -= fixedDt;
    }

    const showHud = app.screen === 'playing' || app.screen === 'pause' || app.screen === 'summary';
    renderFlightFrame(ctx, renderer, terrain, app.plane, app.camera, app.mission, app.lastControls, app.timeSec, {
      showHud,
      muted: audio.isMuted(),
    });
    requestAnimationFrame(renderLoop);
  }

  requestAnimationFrame(renderLoop);
}

bootTradewindRally();
