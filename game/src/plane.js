// Articulated 3D polygon model & chase-view renderer for the original TW-7 "Albatross" rally aircraft.

function normalize3(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function rotatePointLocal(p, pitch, bank, yaw) {
  let [x, y, z] = p;
  // Roll (bank right = positive bank -> right wing drops)
  const cb = Math.cos(-bank);
  const sb = Math.sin(-bank);
  const rx = x * cb - y * sb;
  const ry = x * sb + y * cb;
  x = rx;
  y = ry;

  // Pitch (nose up = positive pitch -> +z nose lifts +y)
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const py = y * cp + z * sp;
  const pz = -y * sp + z * cp;
  y = py;
  z = pz;

  // Relative yaw slip
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const yx = x * cy + z * sy;
  const yz = -x * sy + z * cy;
  return [yx, y, yz];
}

function shadeHexColor(rgb, lightFactor) {
  const r = Math.max(0, Math.min(255, Math.round(rgb[0] * lightFactor)));
  const g = Math.max(0, Math.min(255, Math.round(rgb[1] * lightFactor)));
  const b = Math.max(0, Math.min(255, Math.round(rgb[2] * lightFactor)));
  return `rgb(${r},${g},${b})`;
}

// Build the TW-7 Albatross 3D polygonal hull: cream ivory fuselage, coral racing stripes,
// brushed cowling, strut-braced tapered wings with animated control surfaces, tail, canopy, and landing gear.
export function buildAlbatrossMesh(controls, airbrakeFactor = 0) {
  const ivory = [244, 236, 220];
  const ivoryShadow = [212, 202, 184];
  const coral = [218, 72, 54];
  const navy = [36, 62, 96];
  const cowlMetal = [174, 184, 196];
  const canopyGlass = [74, 146, 188];
  const tireDark = [34, 38, 44];
  const strutDark = [82, 92, 106];

  const aileronDeflect = (controls.roll || 0) * 0.16;
  const elevatorDeflect = -(controls.pitch || 0) * 0.14;
  const rudderDeflect = (controls.roll || 0) * 0.12;
  const flapDrop = airbrakeFactor * 0.24;

  const faces = [];
  const addPoly = (pts, rgb, stroke = 'rgba(22,32,48,0.34)', spec = 0) => {
    faces.push({ pts, rgb, stroke, spec });
  };

  // Fuselage cross-sections along Z (+Z is nose, -Z is tail)
  const nose = [0, -0.02, 2.55];
  const cowlRing = [
    [-0.36, 0.34, 1.82],
    [0.36, 0.34, 1.82],
    [0.42, -0.26, 1.82],
    [-0.42, -0.26, 1.82],
  ];
  const midRing = [
    [-0.44, 0.42, 0.42],
    [0.44, 0.42, 0.42],
    [0.46, -0.34, 0.42],
    [-0.46, -0.34, 0.42],
  ];
  const aftRing = [
    [-0.24, 0.26, -1.55],
    [0.24, 0.26, -1.55],
    [0.22, -0.18, -1.55],
    [-0.22, -0.18, -1.55],
  ];
  const tailTip = [0, 0.12, -2.85];

  // Cowling nose cone (brushed aluminum + coral accent)
  addPoly([nose, cowlRing[0], cowlRing[1]], cowlMetal, 'rgba(30,40,55,0.45)', 0.28);
  addPoly([nose, cowlRing[1], cowlRing[2]], coral, 'rgba(30,40,55,0.35)', 0.15);
  addPoly([nose, cowlRing[2], cowlRing[3]], ivoryShadow, 'rgba(30,40,55,0.35)', 0.08);
  addPoly([nose, cowlRing[3], cowlRing[0]], coral, 'rgba(30,40,55,0.35)', 0.15);

  // Forward fuselage (cowl to cockpit)
  addPoly([cowlRing[0], midRing[0], midRing[1], cowlRing[1]], ivory, 'rgba(30,40,55,0.35)', 0.16);
  addPoly([cowlRing[1], midRing[1], midRing[2], cowlRing[2]], ivory, 'rgba(30,40,55,0.35)', 0.12);
  addPoly([cowlRing[2], midRing[2], midRing[3], cowlRing[3]], navy, 'rgba(20,30,45,0.4)', 0.06);
  addPoly([cowlRing[3], midRing[3], midRing[0], cowlRing[0]], ivory, 'rgba(30,40,55,0.35)', 0.12);

  // Aft fuselage (cockpit to tail cone)
  addPoly([midRing[0], aftRing[0], aftRing[1], midRing[1]], ivory, 'rgba(30,40,55,0.35)', 0.14);
  addPoly([midRing[1], aftRing[1], aftRing[2], midRing[2]], coral, 'rgba(30,40,55,0.35)', 0.1);
  addPoly([midRing[2], aftRing[2], aftRing[3], midRing[3]], navy, 'rgba(20,30,45,0.4)', 0.05);
  addPoly([midRing[3], aftRing[3], aftRing[0], midRing[0]], coral, 'rgba(30,40,55,0.35)', 0.1);

  // Tail taper
  addPoly([aftRing[0], tailTip, aftRing[1]], ivory, 'rgba(30,40,55,0.35)', 0.12);
  addPoly([aftRing[1], tailTip, aftRing[2]], ivoryShadow, 'rgba(30,40,55,0.35)', 0.08);
  addPoly([aftRing[2], tailTip, aftRing[3]], navy, 'rgba(20,30,45,0.4)', 0.05);
  addPoly([aftRing[3], tailTip, aftRing[0]], ivoryShadow, 'rgba(30,40,55,0.35)', 0.08);

  // Glazed cockpit canopy bubble (framed glass)
  const canopyFront = [0, 0.42, 1.38];
  const canopyTopF = [0, 0.78, 0.78];
  const canopyTopR = [0, 0.72, -0.25];
  const canopyBack = [0, 0.36, -0.95];
  const canopyL = [-0.36, 0.42, 0.35];
  const canopyR = [0.36, 0.42, 0.35];
  addPoly([canopyFront, canopyL, canopyTopF], canopyGlass, 'rgba(230,245,255,0.55)', 0.45);
  addPoly([canopyFront, canopyTopF, canopyR], canopyGlass, 'rgba(230,245,255,0.55)', 0.45);
  addPoly([canopyL, canopyBack, canopyTopR, canopyTopF], canopyGlass, 'rgba(230,245,255,0.5)', 0.42);
  addPoly([canopyR, canopyTopF, canopyTopR, canopyBack], canopyGlass, 'rgba(230,245,255,0.5)', 0.42);

  // Main high-mounted tapered wings (left & right) with slight dihedral and coral wingtip bands
  const addWingHalf = (side) => {
    const s = side;
    // Inner main wing panel
    addPoly(
      [
        [s * 0.42, 0.32, 0.96],
        [s * 2.75, 0.44, 0.78],
        [s * 2.75, 0.42, -0.14],
        [s * 0.42, 0.30, -0.22],
      ],
      ivory,
      'rgba(30,40,55,0.36)',
      0.16,
    );
    // Outer wing panel (coral rally wingtip)
    addPoly(
      [
        [s * 2.75, 0.44, 0.78],
        [s * 3.92, 0.52, 0.56],
        [s * 3.84, 0.50, -0.08],
        [s * 2.75, 0.42, -0.14],
      ],
      coral,
      'rgba(30,40,55,0.38)',
      0.14,
    );
    // Inner flap (deflects down with airbrake)
    addPoly(
      [
        [s * 0.46, 0.30, -0.22],
        [s * 1.85, 0.36, -0.18],
        [s * 1.85, 0.34 - flapDrop, -0.44],
        [s * 0.46, 0.28 - flapDrop, -0.48],
      ],
      navy,
      'rgba(20,30,45,0.45)',
      0.08,
    );
    // Outer aileron (deflects differentially with roll)
    const aTip = s * aileronDeflect;
    addPoly(
      [
        [s * 1.92, 0.37, -0.18],
        [s * 3.45, 0.47, -0.11],
        [s * 3.40, 0.46 + aTip, -0.34],
        [s * 1.92, 0.36 + aTip, -0.41],
      ],
      ivoryShadow,
      'rgba(30,40,55,0.4)',
      0.1,
    );
    // Wing strut connecting lower fuselage to mid-wing
    addPoly(
      [
        [s * 0.44, -0.28, 0.42],
        [s * 2.08, 0.37, 0.36],
        [s * 2.08, 0.34, 0.26],
        [s * 0.44, -0.31, 0.32],
      ],
      strutDark,
      null,
      0.05,
    );
    // Fixed rally landing gear strut + wheel fairing
    addPoly(
      [
        [s * 0.38, -0.32, 0.78],
        [s * 0.88, -0.86, 0.82],
        [s * 0.88, -0.86, 0.64],
        [s * 0.38, -0.32, 0.60],
      ],
      strutDark,
      null,
      0.05,
    );
    addPoly(
      [
        [s * 0.76, -0.82, 1.02],
        [s * 0.98, -0.82, 1.02],
        [s * 0.98, -1.04, 0.56],
        [s * 0.76, -1.04, 0.56],
      ],
      tireDark,
      'rgba(200,210,220,0.2)',
      0.04,
    );
  };

  addWingHalf(-1);
  addWingHalf(1);

  // Horizontal tailplane + animated elevator
  const addTailHalf = (side) => {
    const s = side;
    addPoly(
      [
        [s * 0.14, 0.18, -2.02],
        [s * 1.38, 0.20, -2.24],
        [s * 1.32, 0.19, -2.62],
        [s * 0.12, 0.17, -2.56],
      ],
      ivory,
      'rgba(30,40,55,0.36)',
      0.14,
    );
    addPoly(
      [
        [s * 0.12, 0.17, -2.56],
        [s * 1.28, 0.19, -2.62],
        [s * 1.24, 0.19 + elevatorDeflect, -2.86],
        [s * 0.10, 0.17 + elevatorDeflect, -2.84],
      ],
      coral,
      'rgba(30,40,55,0.36)',
      0.1,
    );
  };
  addTailHalf(-1);
  addTailHalf(1);

  // Vertical stabilizer fin + animated rudder
  addPoly(
    [
      [0, 0.24, -1.75],
      [0, 1.24, -2.38],
      [0, 1.20, -2.68],
      [0, 0.18, -2.62],
    ],
    navy,
    'rgba(230,240,255,0.28)',
    0.14,
  );
  addPoly(
    [
      [0, 1.20, -2.68],
      [rudderDeflect, 1.14, -2.96],
      [rudderDeflect, 0.16, -2.92],
      [0, 0.18, -2.62],
    ],
    coral,
    'rgba(30,40,55,0.38)',
    0.12,
  );

  return faces;
}

export function drawAircraftShadow(ctx, screenX, screenY, aglMeters, bankRad, scale) {
  if (aglMeters > 110) return;
  const closeness = Math.max(0, 1 - aglMeters / 110);
  const alpha = closeness * closeness * 0.42;
  const shadowScale = scale * (0.45 + closeness * 0.55);

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(-bankRad * 0.25);
  ctx.fillStyle = `rgba(12, 22, 34, ${alpha.toFixed(3)})`;

  // Crisp silhouette shadow of wings + fuselage
  ctx.beginPath();
  ctx.ellipse(0, 0, shadowScale * 2.9, shadowScale * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, shadowScale * 0.48, shadowScale * 1.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPlayerAircraft(ctx, plane, camera, controls, timeSec, screenCenterX, screenCenterY) {
  // Relative aircraft attitude compared to chase camera
  const relPitch = plane.pitch - camera.pitch * 0.72 + (plane.stallFactor || 0) * Math.sin(timeSec * 28) * 0.03;
  const relBank = plane.bank - camera.roll;
  const relYaw = (controls.roll || 0) * 0.08;

  const mesh = buildAlbatrossMesh(controls, plane.airbrake ? 1 : 0);
  const sunLight = normalize3(0.55, 0.76, -0.34);

  // Camera sits slightly behind (+distance along -Z of plane) and above plane
  const camDist = 8.4;
  const camUp = 1.9;
  const projScale = 312;

  const projected = [];
  for (let i = 0; i < mesh.length; i++) {
    const face = mesh[i];
    const worldPts = [];
    let depthSum = 0;
    for (let j = 0; j < face.pts.length; j++) {
      const rp = rotatePointLocal(face.pts[j], relPitch, relBank, relYaw);
      const cz = rp[2] + camDist;
      const cy = rp[1] - camUp;
      const sx = screenCenterX + (rp[0] / cz) * projScale;
      const sy = screenCenterY - (cy / cz) * projScale;
      worldPts.push({ x: rp[0], y: rp[1], z: rp[2], sx, sy });
      depthSum += cz;
    }

    // Face normal for lighting
    const a = worldPts[0];
    const b = worldPts[1];
    const c = worldPts[2];
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const n = normalize3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const ndotl = Math.abs(n[0] * sunLight[0] + n[1] * sunLight[1] + n[2] * sunLight[2]);
    const light = 0.56 + ndotl * 0.52 + (face.spec || 0) * Math.pow(ndotl, 3) * 0.35;

    projected.push({
      pts: worldPts,
      depth: depthSum / worldPts.length,
      fill: shadeHexColor(face.rgb, light),
      stroke: face.stroke,
    });
  }

  // Painter's algorithm: farthest polygons first
  projected.sort((a, b) => b.depth - a.depth);

  // Project nose propeller disc behind nose if visible
  const nosePt = rotatePointLocal([0, -0.02, 2.68], relPitch, relBank, relYaw);
  const noseCz = nosePt[2] + camDist;
  const noseSx = screenCenterX + (nosePt[0] / noseCz) * projScale;
  const noseSy = screenCenterY - ((nosePt[1] - camUp) / noseCz) * projScale;

  // Draw translucent spinning propeller disc ahead of the fuselage (which is farther in Z in chase view)
  ctx.save();
  const propRadius = (0.98 / noseCz) * projScale;
  const propSpin = timeSec * (18 + plane.throttle * 44);
  ctx.translate(noseSx, noseSy);
  ctx.rotate(-relBank);
  ctx.fillStyle = 'rgba(235, 242, 250, 0.16)';
  ctx.beginPath();
  ctx.ellipse(0, 0, propRadius, propRadius * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 248, 228, 0.38)';
  ctx.lineWidth = 2.2;
  for (let b = 0; b < 3; b++) {
    const ang = propSpin + (b * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.arc(0, 0, propRadius * 0.82, ang, ang + 0.55);
    ctx.stroke();
  }
  ctx.restore();

  // Draw all sorted aircraft hull polygons
  ctx.lineJoin = 'round';
  for (let i = 0; i < projected.length; i++) {
    const f = projected[i];
    ctx.beginPath();
    ctx.moveTo(f.pts[0].sx, f.pts[0].sy);
    for (let j = 1; j < f.pts.length; j++) {
      ctx.lineTo(f.pts[j].sx, f.pts[j].sy);
    }
    ctx.closePath();
    ctx.fillStyle = f.fill;
    ctx.fill();
    if (f.stroke) {
      ctx.strokeStyle = f.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Wingtip navigation lights (Port Red, Starboard Green) + tail strobe (crisp & refined)
  const leftTip = rotatePointLocal([-3.88, 0.51, 0.26], relPitch, relBank, relYaw);
  const rightTip = rotatePointLocal([3.88, 0.51, 0.26], relPitch, relBank, relYaw);
  const tailLight = rotatePointLocal([0, 1.24, -2.55], relPitch, relBank, relYaw);

  const drawNavLight = (pt, coreColor, glowColor, radius) => {
    const cz = pt[2] + camDist;
    const sx = screenCenterX + (pt[0] / cz) * projScale;
    const sy = screenCenterY - ((pt[1] - camUp) / cz) * projScale;
    const grad = ctx.createRadialGradient(sx, sy, 0.5, sx, sy, radius * 2.8);
    grad.addColorStop(0, coreColor);
    grad.addColorStop(0.38, glowColor);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 0.65, 0, Math.PI * 2);
    ctx.fill();
    return { sx, sy };
  };

  const portPos = drawNavLight(leftTip, '#ffe4df', 'rgba(255, 62, 52, 0.72)', 2.4);
  const stbdPos = drawNavLight(rightTip, '#dcffec', 'rgba(56, 232, 144, 0.72)', 2.4);
  if (Math.sin(timeSec * 8) > 0.35) {
    drawNavLight(tailLight, '#ffffff', 'rgba(255, 244, 210, 0.65)', 2.1);
  }

  // Subtle wingtip vortex condensation ribbons when banking sharply or at high speed
  const vortexIntensity = Math.max(0, (Math.abs(plane.bank) - 0.22) * 1.1) * Math.min(1, plane.airspeedKt / 110);
  if (vortexIntensity > 0.08 && !plane.onGround) {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 250, 242, ${(vortexIntensity * 0.34).toFixed(3)})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(portPos.sx, portPos.sy);
    ctx.lineTo(portPos.sx - plane.bank * 46, portPos.sy + 34);
    ctx.moveTo(stbdPos.sx, stbdPos.sy);
    ctx.lineTo(stbdPos.sx - plane.bank * 46, stbdPos.sy + 34);
    ctx.stroke();
    ctx.restore();
  }

  return { portPos, stbdPos };
}
