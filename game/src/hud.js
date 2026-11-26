// Authentic aviation instrument cluster & heads-up telemetry: compass tape, ASI, artificial horizon, altimeter, fuel & throttle.

import { CANVAS_HEIGHT, CANVAS_WIDTH, FLIGHT_TUNING, METERS_TO_FEET, PALETTE } from './config.js';
import { angleDelta, wrapAngle } from './physics.js';
import { getActiveWaypoint } from './missions.js';

function drawInstrumentBezel(ctx, cx, cy, r) {
  // Recessed outer metallic housing with subtle brushed gradient
  const bezelGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  bezelGrad.addColorStop(0, '#465466');
  bezelGrad.addColorStop(0.5, '#1e2734');
  bezelGrad.addColorStop(1, '#364354');

  ctx.save();
  ctx.fillStyle = 'rgba(7, 12, 20, 0.72)';
  ctx.beginPath();
  ctx.arc(cx, cy + 3, r + 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = bezelGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(220, 234, 248, 0.24)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Matte instrument dial face
  ctx.fillStyle = PALETTE.hudFace;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Subtle corner mounting screws
  const screwOffset = r * 0.78;
  ctx.fillStyle = '#536275';
  for (const [sx, sy] of [
    [-screwOffset, -screwOffset],
    [screwOffset, -screwOffset],
    [-screwOffset, screwOffset],
    [screwOffset, screwOffset],
  ]) {
    ctx.beginPath();
    ctx.arc(cx + sx, cy + sy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGlassSheen(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  ctx.clip();
  const sheen = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.4, cy + r * 0.4);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.13)');
  sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0.03)');
  sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

export function drawCompassStrip(ctx, plane, waypoint) {
  const w = 360;
  const h = 44;
  const x = (CANVAS_WIDTH - w) * 0.5;
  const y = 14;
  const cx = CANVAS_WIDTH * 0.5;

  ctx.save();
  // Anodized bezel frame
  ctx.fillStyle = 'rgba(13, 22, 34, 0.88)';
  ctx.strokeStyle = 'rgba(244, 185, 92, 0.52)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  const hdgDeg = ((wrapAngle(plane.heading) * 180) / Math.PI) % 360;
  const pxPerDeg = 3.2;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 2, w - 8, h - 4, 6);
  ctx.clip();

  const startDeg = Math.floor((hdgDeg - 60) / 5) * 5;
  const endDeg = Math.ceil((hdgDeg + 60) / 5) * 5;
  const cardinals = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let d = startDeg; d <= endDeg; d += 5) {
    const normDeg = ((d % 360) + 360) % 360;
    const tx = cx + (d - hdgDeg) * pxPerDeg;
    const isMajor = normDeg % 30 === 0;
    const isMid = normDeg % 15 === 0;

    ctx.strokeStyle = isMajor ? '#f4eee2' : 'rgba(195, 215, 236, 0.55)';
    ctx.lineWidth = isMajor ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(tx, y + h - 2);
    ctx.lineTo(tx, y + h - (isMajor ? 12 : isMid ? 9 : 6));
    ctx.stroke();

    if (cardinals[normDeg]) {
      ctx.fillStyle = normDeg % 90 === 0 ? '#f6b84c' : '#b4d0ec';
      ctx.font = normDeg % 90 === 0 ? 'bold 13px ui-monospace, monospace' : 'bold 11px ui-monospace, monospace';
      ctx.fillText(cardinals[normDeg], tx, y + 16);
    } else if (isMajor) {
      ctx.fillStyle = '#dce8f6';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText(String(normDeg).padStart(3, '0'), tx, y + 16);
    }
  }

  // Gold target heading bug pointing to next ring or runway
  if (waypoint) {
    const bearingRad = wrapAngle(Math.atan2(waypoint.x - plane.x, -(waypoint.z - plane.z)));
    const diffDeg = (angleDelta(plane.heading, bearingRad) * 180) / Math.PI;
    const bugX = Math.max(x + 12, Math.min(x + w - 12, cx + diffDeg * pxPerDeg));
    ctx.fillStyle = '#ffca54';
    ctx.beginPath();
    ctx.moveTo(bugX, y + 4);
    ctx.lineTo(bugX + 6, y + 12);
    ctx.lineTo(bugX, y + 16);
    ctx.lineTo(bugX - 6, y + 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Central lubber line & digital heading readout box
  ctx.fillStyle = '#f6b84c';
  ctx.beginPath();
  ctx.moveTo(cx, y + h - 1);
  ctx.lineTo(cx - 6, y + h + 7);
  ctx.lineTo(cx + 6, y + h + 7);
  ctx.closePath();
  ctx.fill();

  const boxW = 84;
  ctx.fillStyle = '#0c1522';
  ctx.strokeStyle = '#f6b84c';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(cx - boxW * 0.5, y + h + 5, boxW, 22, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff5e0';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`HDG ${String(Math.round(hdgDeg) % 360).padStart(3, '0')}°`, cx, y + h + 16);
  ctx.restore();
}

export function drawAirspeedGauge(ctx, cx, cy, r, plane) {
  drawInstrumentBezel(ctx, cx, cy, r);
  ctx.save();

  const minKt = 30;
  const maxKt = 170;
  const startAng = Math.PI * 0.72;
  const sweepAng = Math.PI * 1.56;
  const ktToAng = (kt) => startAng + ((Math.max(minKt, Math.min(maxKt, kt)) - minKt) / (maxKt - minKt)) * sweepAng;

  // Color-coded aviation speed arcs (red stall, white approach, green cruise, amber caution)
  const drawArc = (k0, k1, color, width = 5) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 9, ktToAng(k0), ktToAng(k1));
    ctx.stroke();
  };
  drawArc(30, FLIGHT_TUNING.stallSpeedKt, '#e54f44', 5.5);
  drawArc(FLIGHT_TUNING.stallSpeedKt, 84, '#d9e6f4', 4);
  drawArc(84, 138, '#4cc496', 5);
  drawArc(138, 170, '#f2b144', 5);

  // Tick marks & crisp numerals
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let kt = 40; kt <= 160; kt += 10) {
    const ang = ktToAng(kt);
    const major = kt % 20 === 0;
    const inner = r - (major ? 17 : 12);
    const outer = r - 4;
    ctx.strokeStyle = major ? '#f4eee2' : 'rgba(220, 232, 245, 0.55)';
    ctx.lineWidth = major ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
    ctx.lineTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
    ctx.stroke();

    if (major) {
      const tx = cx + Math.cos(ang) * (r - 27);
      const ty = cy + Math.sin(ang) * (r - 27);
      ctx.fillStyle = '#e8f0f8';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillText(String(kt), tx, ty);
    }
  }

  // Dial label & digital readout window
  ctx.fillStyle = '#9cb6d0';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.fillText('AIRSPEED', cx, cy - 16);
  ctx.fillText('KNOTS', cx, cy + 16);

  ctx.fillStyle = '#070c14';
  ctx.strokeStyle = 'rgba(244, 185, 92, 0.55)';
  ctx.lineWidth = 1;
  ctx.fillRect(cx - 24, cy + 23, 48, 17);
  ctx.strokeRect(cx - 24, cy + 23, 48, 17);
  ctx.fillStyle = plane.airspeedKt < FLIGHT_TUNING.stallSpeedKt ? '#ff7062' : '#fff5e0';
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.fillText(`${Math.round(plane.airspeedKt)}`, cx, cy + 32);

  // Illuminated pointer needle
  const needleAng = ktToAng(plane.airspeedKt);
  ctx.translate(cx, cy);
  ctx.rotate(needleAng);
  ctx.strokeStyle = '#ff9d42';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(r - 12, 0);
  ctx.stroke();
  ctx.fillStyle = '#d8e2ec';
  ctx.beginPath();
  ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawGlassSheen(ctx, cx, cy, r);
}

export function drawArtificialHorizon(ctx, cx, cy, r, plane) {
  drawInstrumentBezel(ctx, cx, cy, r);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
  ctx.clip();

  // Gyro sphere rotates by -bank and shifts vertically by pitch
  ctx.translate(cx, cy);
  ctx.rotate(-plane.bank);
  const pitchShift = (plane.pitch / 0.55) * (r * 0.72);

  // Sky hemisphere
  const skyGrad = ctx.createLinearGradient(0, -r * 2, 0, pitchShift);
  skyGrad.addColorStop(0, '#1c538c');
  skyGrad.addColorStop(1, '#4f99ce');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-r * 2, -r * 2, r * 4, r * 2 + pitchShift);

  // Earth hemisphere
  const earthGrad = ctx.createLinearGradient(0, pitchShift, 0, r * 2);
  earthGrad.addColorStop(0, '#96653b');
  earthGrad.addColorStop(1, '#58381d');
  ctx.fillStyle = earthGrad;
  ctx.fillRect(-r * 2, pitchShift, r * 4, r * 2 - pitchShift);

  // Crisp artificial horizon line
  ctx.strokeStyle = '#fff8ea';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-r * 1.5, pitchShift);
  ctx.lineTo(r * 1.5, pitchShift);
  ctx.stroke();

  // Pitch ladder bars (+20, +10, -10, -20 deg)
  ctx.strokeStyle = 'rgba(255, 248, 232, 0.85)';
  ctx.fillStyle = 'rgba(255, 248, 232, 0.85)';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const deg of [-20, -10, 10, 20]) {
    const py = pitchShift - (deg / 32) * (r * 0.72);
    const halfBar = Math.abs(deg) === 10 ? 14 : 22;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-halfBar, py);
    ctx.lineTo(halfBar, py);
    ctx.stroke();
    ctx.fillText(`${Math.abs(deg)}`, halfBar + 4, py);
  }
  ctx.restore();

  // Upper bank-angle roll index scale & pointer triangle
  ctx.save();
  ctx.translate(cx, cy);
  for (const deg of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const ang = -Math.PI * 0.5 + (deg * Math.PI) / 180;
    const major = deg % 30 === 0;
    ctx.strokeStyle = deg === 0 ? '#f6b84c' : 'rgba(255, 248, 232, 0.8)';
    ctx.lineWidth = major ? 2 : 1.1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * (r - 11), Math.sin(ang) * (r - 11));
    ctx.lineTo(Math.cos(ang) * (r - 3), Math.sin(ang) * (r - 3));
    ctx.stroke();
  }

  // Bank roll pointer
  const ptrAng = -Math.PI * 0.5 - plane.bank;
  ctx.fillStyle = '#f6b84c';
  ctx.beginPath();
  ctx.moveTo(Math.cos(ptrAng) * (r - 12), Math.sin(ptrAng) * (r - 12));
  ctx.lineTo(Math.cos(ptrAng - 0.08) * (r - 19), Math.sin(ptrAng - 0.08) * (r - 19));
  ctx.lineTo(Math.cos(ptrAng + 0.08) * (r - 19), Math.sin(ptrAng + 0.08) * (r - 19));
  ctx.closePath();
  ctx.fill();

  // Fixed amber miniature aircraft reference bars in center
  ctx.strokeStyle = '#ffba42';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  ctx.lineTo(-9, 0);
  ctx.lineTo(-9, 5);
  ctx.moveTo(26, 0);
  ctx.lineTo(9, 0);
  ctx.lineTo(9, 5);
  ctx.stroke();

  ctx.fillStyle = '#ffba42';
  ctx.beginPath();
  ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawGlassSheen(ctx, cx, cy, r);
}

export function drawAltimeterGauge(ctx, cx, cy, r, plane) {
  drawInstrumentBezel(ctx, cx, cy, r);
  const altFt = Math.max(0, plane.y * METERS_TO_FEET);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 0-9 numerals around the altimeter dial (each digit = 100 ft on long hand, 1000 ft on short hand)
  for (let i = 0; i < 50; i++) {
    const ang = -Math.PI * 0.5 + (i / 50) * Math.PI * 2;
    const major = i % 5 === 0;
    const inner = r - (major ? 14 : 9);
    const outer = r - 4;
    ctx.strokeStyle = major ? '#f4eee2' : 'rgba(214, 228, 244, 0.5)';
    ctx.lineWidth = major ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
    ctx.lineTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
    ctx.stroke();

    if (major) {
      const digit = i / 5;
      const tx = cx + Math.cos(ang) * (r - 24);
      const ty = cy + Math.sin(ang) * (r - 24);
      ctx.fillStyle = '#eef4fa';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText(String(digit), tx, ty);
    }
  }

  ctx.fillStyle = '#9cb6d0';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.fillText('ALTITUDE', cx, cy - 16);

  // Digital altitude box
  ctx.fillStyle = '#070c14';
  ctx.strokeStyle = 'rgba(244, 185, 92, 0.55)';
  ctx.lineWidth = 1;
  ctx.fillRect(cx - 28, cy + 18, 56, 17);
  ctx.strokeRect(cx - 28, cy + 18, 56, 17);
  ctx.fillStyle = '#fff5e0';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillText(`${Math.round(altFt)} FT`, cx, cy + 27);

  // Short 1000-ft hand
  const ang1000 = -Math.PI * 0.5 + ((altFt % 10000) / 10000) * Math.PI * 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang1000);
  ctx.strokeStyle = '#9ac5e8';
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(r * 0.48, 0);
  ctx.stroke();
  ctx.restore();

  // Long 100-ft hand
  const ang100 = -Math.PI * 0.5 + ((altFt % 1000) / 1000) * Math.PI * 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang100);
  ctx.strokeStyle = '#fff5e0';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(r - 11, 0);
  ctx.stroke();
  ctx.fillStyle = '#d8e2ec';
  ctx.beginPath();
  ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
  drawGlassSheen(ctx, cx, cy, r);
}

export function drawEngineFuelPod(ctx, x, y, w, h, plane) {
  ctx.save();
  ctx.fillStyle = 'rgba(13, 21, 33, 0.9)';
  ctx.strokeStyle = 'rgba(182, 208, 236, 0.34)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();

  // Left: Vertical Throttle Quadrant
  const tx = x + 18;
  const ty = y + 24;
  const th = h - 44;
  ctx.fillStyle = '#9cb6d0';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('THR', tx + 11, y + 14);

  ctx.fillStyle = '#09101a';
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(tx, ty, 22, th);
  ctx.strokeRect(tx, ty, 22, th);

  const fillH = th * plane.throttle;
  const thrGrad = ctx.createLinearGradient(tx, ty + th, tx, ty);
  thrGrad.addColorStop(0, '#44b898');
  thrGrad.addColorStop(0.7, '#f5b84c');
  thrGrad.addColorStop(1, '#ef614e');
  ctx.fillStyle = thrGrad;
  ctx.fillRect(tx + 2, ty + th - fillH + 2, 18, Math.max(0, fillH - 4));

  // Lever handle knob
  const knobY = ty + th - fillH;
  ctx.fillStyle = '#e7edf5';
  ctx.fillRect(tx - 4, knobY - 3, 30, 6);

  ctx.fillStyle = '#fff5e0';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillText(`${Math.round(plane.throttle * 100)}%`, tx + 11, y + h - 8);

  // Right-top: Curved Analog Fuel Gauge
  const fcx = x + 116;
  const fcy = y + 66;
  const fr = 40;
  ctx.fillStyle = '#9cb6d0';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.fillText('FUEL', fcx, y + 14);

  ctx.strokeStyle = '#e54f44';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(fcx, fcy, fr, Math.PI, Math.PI * 1.24);
  ctx.stroke();

  ctx.strokeStyle = '#5cdbb8';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(fcx, fcy, fr, Math.PI * 1.24, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#c8daec';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.fillText('E', fcx - fr + 4, fcy + 10);
  ctx.fillText('F', fcx + fr - 4, fcy + 10);

  const fuelAng = Math.PI + (plane.fuel / 100) * Math.PI;
  ctx.strokeStyle = plane.fuel < FLIGHT_TUNING.fuelLowThreshold ? '#ff6454' : '#ffba42';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(fcx, fcy);
  ctx.lineTo(fcx + Math.cos(fuelAng) * (fr - 6), fcy + Math.sin(fuelAng) * (fr - 6));
  ctx.stroke();
  ctx.fillStyle = '#dce6f2';
  ctx.beginPath();
  ctx.arc(fcx, fcy, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = plane.fuel < FLIGHT_TUNING.fuelLowThreshold ? '#ff7264' : '#fff5e0';
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.fillText(`${Math.round(plane.fuel)}%`, fcx, fcy + 14);

  // Right-bottom: Airframe Hull & VSI Readout
  const hx = x + 64;
  const hy = y + 96;
  const hw = 104;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9cb6d0';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.fillText(`HULL ${Math.round(plane.hull)}%`, hx, hy);
  ctx.fillStyle = '#09101a';
  ctx.fillRect(hx, hy + 5, hw, 8);
  ctx.fillStyle = plane.hull > 60 ? '#5cdbb8' : plane.hull > 30 ? '#f6b84c' : '#ef5e4e';
  ctx.fillRect(hx + 1, hy + 6, (hw - 2) * (plane.hull / 100), 6);

  const vsiSign = plane.verticalSpeedFpm >= 0 ? '+' : '';
  ctx.fillStyle = '#c8daec';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.fillText(`VSI ${vsiSign}${Math.round(plane.verticalSpeedFpm)} FPM`, hx, hy + 27);
  ctx.restore();
}

export function drawAnnunciatorStrip(ctx, plane, mission, muted) {
  const x = CANVAS_WIDTH - 246;
  const y = 14;
  const w = 232;
  const h = 72;

  ctx.save();
  ctx.fillStyle = 'rgba(13, 22, 34, 0.86)';
  ctx.strokeStyle = 'rgba(182, 208, 236, 0.32)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  // Wind & Audio header line
  ctx.fillStyle = '#a8cae8';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`WIND ${String(mission.wind.deg).padStart(3, '0')}°/${mission.wind.kt}KT`, x + 12, y + 20);
  ctx.textAlign = 'right';
  ctx.fillStyle = muted ? '#ef6452' : '#7eead3';
  ctx.fillText(muted ? 'AUDIO OFF [M]' : 'AUDIO ON [M]', x + w - 12, y + 20);

  // 4 Lit cockpit annunciator lamps
  const lamps = [
    { label: 'STALL', active: plane.stallFactor > 0.15, color: '#ff5244' },
    { label: 'FUEL', active: plane.fuel < FLIGHT_TUNING.fuelLowThreshold, color: '#f6a838' },
    { label: 'BRAKE', active: plane.airbrake, color: '#5cdbb8' },
    { label: 'GEAR', active: plane.aglMeters < 65 || plane.onGround, color: '#7eead3' },
  ];

  const lampW = 48;
  for (let i = 0; i < lamps.length; i++) {
    const l = lamps[i];
    const lx = x + 12 + i * (lampW + 5);
    const ly = y + 34;
    ctx.fillStyle = l.active ? l.color : 'rgba(28, 39, 54, 0.9)';
    ctx.strokeStyle = l.active ? '#fff5e0' : 'rgba(140, 165, 192, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(lx, ly, lampW, 24, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = l.active ? '#11161f' : '#53677d';
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.label, lx + lampW * 0.5, ly + 12);
  }
  ctx.restore();
}

export function drawMissionOverlay(ctx, plane, mission, waypoint) {
  const x = 14;
  const y = 14;
  const w = 310;
  const h = 76;

  ctx.save();
  ctx.fillStyle = 'rgba(13, 22, 34, 0.88)';
  ctx.strokeStyle = 'rgba(244, 185, 92, 0.48)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  const distNm = waypoint ? (Math.hypot(waypoint.x - plane.x, waypoint.z - plane.z) / 1852).toFixed(2) : '0.00';
  const mins = Math.floor(mission.elapsedSec / 60);
  const secs = (mission.elapsedSec % 60).toFixed(1).padStart(4, '0');

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f6b84c';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillText(`${mission.def.code} • ${mission.def.name.toUpperCase()}`, x + 12, y + 19);

  ctx.fillStyle = '#fff6e6';
  ctx.font = 'bold 13px ui-monospace, monospace';
  const objText = waypoint ? `${waypoint.label}  (${distNm} NM)` : 'SORTIE COMPLETE';
  ctx.fillText(objText, x + 12, y + 41);

  ctx.fillStyle = '#b9d4ee';
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.fillText(`TIME ${String(mins).padStart(2, '0')}:${secs}`, x + 12, y + 63);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#7eead3';
  ctx.fillText(`SCORE ${mission.score.toLocaleString()}`, x + w - 12, y + 63);
  ctx.restore();

  // Dynamic event callout banner (ring passed, delivery confirmed, touchdown grade)
  if (mission.bannerTimer > 0 && mission.bannerText) {
    const alpha = Math.min(1, mission.bannerTimer * 1.4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 15px ui-monospace, monospace';
    const textW = ctx.measureText(mission.bannerText).width + 36;
    const bx = (CANVAS_WIDTH - textW) * 0.5;
    const by = 92;
    ctx.fillStyle = 'rgba(13, 24, 38, 0.88)';
    ctx.strokeStyle = '#f6b84c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(bx, by, textW, 32, 999);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff5df';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mission.bannerText, CANVAS_WIDTH * 0.5, by + 16);
    ctx.restore();
  }
}

export function drawFlightHud(ctx, plane, mission, muted) {
  const waypoint = getActiveWaypoint(mission);

  // Top telemetry bar: Mission info (left), Compass tape (center), Wind & Annunciators (right)
  drawMissionOverlay(ctx, plane, mission, waypoint);
  drawCompassStrip(ctx, plane, waypoint);
  drawAnnunciatorStrip(ctx, plane, mission, muted);

  // Bottom instrument deck (arranged cleanly left & right of center so aircraft & runway remain open)
  const dialY = CANVAS_HEIGHT - 84;
  drawAirspeedGauge(ctx, 96, dialY, 64, plane);
  drawArtificialHorizon(ctx, 244, dialY, 68, plane);
  drawAltimeterGauge(ctx, CANVAS_WIDTH - 284, dialY, 64, plane);
  drawEngineFuelPod(ctx, CANVAS_WIDTH - 202, CANVAS_HEIGHT - 148, 184, 134, plane);
}
