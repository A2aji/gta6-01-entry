// Solmar Bay — every tuning number and colour in one place.
// The city is a fixed 2560x1920 logical area; the renderer scales the camera
// view to the window, so no rule below depends on the screen size.

export const WORLD = { width: 2560, height: 1920 };
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;

/** The city grid: roads run on these centrelines, 64 wide, blocks between them. */
export const CITY = {
  roadWidth: 64,
  verticalRoads: [320, 640, 960, 1280, 1600, 1920, 2240],
  horizontalRoads: [320, 640, 960, 1280, 1600],
  beachTop: 1760, // south edge: sand, then sea
  riverLeft: 2400, // east edge: river strip with a bridge on the y=960 road
  parkBlock: { x: 960, y: 640 }, // the block whose corner is at (960, 640)
  docks: { x: 0, y: 1280, width: 320, height: 320 },
};

export const PLAYER = {
  radius: 14,
  walkSpeed: 170,
  runSpeed: 260,
  health: 100,
  pistolDamage: 34,
  pistolRange: 320,
  pistolAmmo: 12,
  pistolReload: 1.1,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 420,
  brake: 700,
  reverseAccel: 240,
  maxSpeed: 520,
  maxReverse: 160,
  steer: 2.6,
  grip: 6.0,
  handbrakeGrip: 1.6,
  damageSmoke: 0.55, // health fraction where smoke starts
};

export const TRAFFIC = {
  count: 26,
  speed: 150,
  speedJitter: 40,
  minGap: 70,
};

export const PEDESTRIAN = {
  count: 34,
  speed: 55,
  fleeSpeed: 150,
  fleeRadius: 220,
};

export const POLICE = {
  maxActive: 6,
  speed: 470,
  ramDamage: 8,
  arrestRadius: 34,
  arrestTime: 1.2,
  spawnDistance: 700,
  roadblockAtStars: 3,
  giveUpAfter: 5, // seconds unseen before the police give up the chase
  seenRadius: 400, // inside this, the police can see the player
  helicopterAtStars: 3, // wanted level that brings the helicopter
  helicopterAltitude: 220,
  helicopterSpeed: 380,
};

export const WANTED = {
  stealCar: 1,
  hitPedestrian: 1,
  shoot: 1,
  killPolice: 2,
  decayDelay: 12, // seconds with no crime before stars start falling
  decayInterval: 9, // seconds per star lost while hidden
  maxStars: 5,
};

export const MISSIONS = [
  { id: 'm1', name: 'First Ride', reward: 150, place: 'The Strip', text: 'Drive the client to the marker on the north end of the Strip.' },
  { id: 'm2', name: 'The Pickup', reward: 250, place: 'Docks', text: 'On foot: collect the package at the docks. The cops are watching.' },
  { id: 'm3', name: 'Heat on the Strip', reward: 400, place: 'The Strip', text: 'The Vulture crew is on the Strip. Clear them out, then get away.' },
  { id: 'm4', name: 'Bay Bridge Run', reward: 600, place: 'Bridge', text: 'Timed delivery across the Bay Bridge. Two stars on you — do not stop.' },
  { id: 'm5', name: 'The Vault Job', reward: 1200, place: 'Docks', text: 'Steal the vault car and bring it to the docks. Three stars. Bring it home.' },
  { id: 'm6', name: 'Sunset Keys', reward: 1500, place: 'Beach', text: 'VIP delivery to the beach at sunset. Four stars on you — do not stop.' },
];

export const PALETTE = {
  backdrop: '#10141f',
  ground: '#9aa06b',
  asphalt: '#3d3a38',
  roadLine: '#f5d76e',
  sidewalk: '#c9b896',
  sand: '#e3cf9e',
  sea: '#2e7f9e',
  seaDeep: '#256b87',
  grass: '#6fa055',
  tree: '#4e7d3a',
  treeDark: '#3c6130',
  roofTerracotta: '#c96f4a',
  roofCoral: '#e07856',
  roofCream: '#e8dcc0',
  roofTeal: '#3f8f7f',
  roofOchre: '#d9a441',
  buildingSide: '#5a4a3a',
  player: '#ffd23f',
  playerDark: '#b8860b',
  police: '#2b4acb',
  policeLight: '#7ea0ff',
  panel: '#141a2e',
  panelEdge: '#ffb347',
  text: '#f5efe0',
  muted: '#b8ad94',
  star: '#ffcf3f',
  health: '#58d68d',
  danger: '#e5534b',
  cash: '#7ee081',
  mission: '#ff9f43',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'solmar-bay.save';
