// Central constants, flight dynamics tuning, projection geometry, and visual palette.

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

// Voxel-space offscreen buffer (rendered unrolled, then rotated by chase roll onto main canvas)
export const VOXEL_WIDTH = 760;
export const VOXEL_HEIGHT = 560;
export const VOXEL_SCALE = 2; // 1 voxel pixel = 2x2 screen pixels
export const CAMERA_FOCAL = 740;
export const MAX_DRAW_DISTANCE = 3600;

// Archipelago world grid
export const MAP_SIZE = 1024;
export const CELL_SIZE = 8; // meters per grid cell
export const WORLD_SIZE = MAP_SIZE * CELL_SIZE; // 8192 meters

// Unit conversions
export const METERS_TO_FEET = 3.28084;
export const FEET_TO_METERS = 1 / METERS_TO_FEET;
export const KNOTS_TO_WORLD_MPS = 0.65; // brisk, responsive flight pacing across the islands
export const MPS_TO_FPM = METERS_TO_FEET * 60;

// Flight dynamics tuning
export const FLIGHT_TUNING = {
  minSpeedKt: 34,
  stallSpeedKt: 52,
  approachSpeedKt: 74,
  cruiseSpeedKt: 108,
  maxSpeedKt: 162,
  maxThrustKtPerSec: 36,
  baseDragFactor: 0.00145,
  airbrakeDragKtPerSec: 26,
  groundBrakeKtPerSec: 34,
  gravityPitchAccel: 28,
  maxPitchRad: 0.62,
  maxBankRad: 1.08,
  pitchRateRad: 1.35,
  bankRateRad: 2.05,
  bankSelfLevelRate: 0.55,
  turnRateFactor: 0.78,
  stallNoseDropRad: 0.85,
  fuelBaseBurnPerSec: 0.14,
  fuelThrottleBurnPerSec: 0.92,
  fuelLowThreshold: 22,
  smoothSinkFpm: 360,
  firmSinkFpm: 680,
  maxSafeBankDeg: 16,
  maxSafeTouchdownKt: 102,
};

// Terrain surface codes
export const SURFACE = {
  WATER: 0,
  SAND: 1,
  FIELD: 2,
  FOREST: 3,
  ROCK: 4,
  TOWN: 5,
  RUNWAY: 6,
  RIVER: 7,
};

// Golden-hour coastal aviation palette
export const PALETTE = {
  skyZenith: [26, 74, 134],
  skyMid: [76, 146, 198],
  skyHorizon: [244, 206, 154],
  fogColor: [232, 198, 152],
  sunCore: '#fff8df',
  sunGlow: 'rgba(255, 214, 132, 0.45)',
  hudBezelOuter: '#2d3746',
  hudBezelInner: '#131b26',
  hudFace: '#0d141e',
  hudWarmWhite: '#f4eee2',
  hudAmber: '#f6b84c',
  hudCoral: '#ef6452',
  hudMint: '#5cdbb8',
  hudSky: '#3b82bd',
  hudEarth: '#8b5e38',
};

// Fixed island & runway definitions (deterministic across seeds, varied slightly by terrain noise)
export const AIRFIELDS = [
  {
    id: 'aurelia',
    name: 'Aurelia Field',
    townName: 'Port Aurelia',
    runwayLabel: '09',
    cx: 2480,
    cz: 5360,
    elevation: 18,
    headingDeg: 90, // points East (+X)
    length: 460,
    width: 48,
  },
  {
    id: 'kestrel',
    name: 'Kestrel Strip',
    townName: 'Kestrel Harbor',
    runwayLabel: '36',
    cx: 4920,
    cz: 4220,
    elevation: 20,
    headingDeg: 0, // points North (-Z)
    length: 450,
    width: 48,
  },
  {
    id: 'coral',
    name: 'Coral Haven',
    townName: 'Coral Town',
    runwayLabel: '09',
    cx: 5040,
    cz: 2260,
    elevation: 22,
    headingDeg: 90, // points East (+X)
    length: 480,
    width: 50,
  },
];
