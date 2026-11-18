// Solmar Bay — procedural model factories (three.js).
// Every visible thing is authored here from primitives: no imported assets,
// no generator keys. Shared unit geometries plus a material library keep
// draw calls and memory small; one material per colour, cached. A building
// is a facade block with a roof, windows on all four faces, an AC unit, and
// — for shops — a street-level awning; some windows glow warm at dusk.
import * as THREE from '../vendor/three.module.min.js';

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
};

const MATS = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${opts.emissive || ''}|${opts.transparent || ''}|${opts.opacity ?? ''}`;
  if (!MATS.has(key)) {
    MATS.set(key, new THREE.MeshLambertMaterial({
      color,
      emissive: opts.emissive || 0x000000,
      emissiveIntensity: opts.emissive ? 0.9 : 1,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
    }));
  }
  return MATS.get(key);
}

/** A mesh from the shared unit box, scaled and placed. */
export function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(GEO.box, mat(color, opts));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

export function cyl(r, h, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(GEO.cyl, mat(color, opts));
  m.scale.set(r * 2, h, r * 2);
  m.position.set(x, y, z);
  return m;
}

export function sphere(r, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(GEO.sphere, mat(color, opts));
  m.scale.set(r * 2, r * 2, r * 2);
  m.position.set(x, y, z);
  return m;
}

const WINDOW_DARK = 0x1d2733;
const WINDOW_LIT = 0xffc46b;

/** One window pane; a few glow warm so the city feels lived-in at dusk. */
function windowPane(w, h, x, y, z, lit) {
  const color = lit ? WINDOW_LIT : WINDOW_DARK;
  const opts = lit ? { emissive: 0xff9f43 } : undefined;
  return box(w, h, 1, color, x, y, z, opts);
}

/**
 * A building: facade block, flat roof slab, windows on every face, an AC
 * unit on the roof, and — for shops — a striped awning at street level.
 * `shop` and `lit` come from the city data; tall buildings get a water
 * tower from the renderer, not from here.
 */
export function makeBuilding(w, d, height, roofColor, facadeColor, shop = false, lit = false) {
  const g = new THREE.Group();
  const body = box(w, height, d, facadeColor, 0, height / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const roof = box(w + 4, 3, d + 4, roofColor, 0, height + 1.5, 0);
  roof.castShadow = true;
  g.add(roof);
  const ac = box(14, 6, 10, 0x8a8f96, w / 4, height + 6, 0);
  g.add(ac);
  // Windows on the two long faces; every third pane glows when lit.
  const cols = Math.max(2, Math.floor(w / 34));
  const rows = Math.max(1, Math.floor(height / 34));
  let paneIndex = 0;
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const wx = -w / 2 + ((c + 0.5) / cols) * w;
      const wy = 14 + ((r + 0.5) / rows) * (height - 20);
      const glow = lit && (paneIndex % 3 === 0);
      paneIndex += 1;
      g.add(windowPane(12, 14, wx, wy, d / 2 + 0.6, glow));
      g.add(windowPane(12, 14, wx, wy, -d / 2 - 0.6, glow));
    }
  }
  // Windows on the two short (side) faces too — a chase cam sees those most.
  const sideCols = Math.max(1, Math.floor(d / 40));
  const sideRows = Math.max(1, Math.floor(height / 40));
  for (let c = 0; c < sideCols; c += 1) {
    for (let r = 0; r < sideRows; r += 1) {
      const wz = -d / 2 + ((c + 0.5) / sideCols) * d;
      const wy = 14 + ((r + 0.5) / sideRows) * (height - 20);
      g.add(box(1, 14, 12, WINDOW_DARK, w / 2 + 0.6, wy, wz));
      g.add(box(1, 14, 12, WINDOW_DARK, -w / 2 - 0.6, wy, wz));
    }
  }
  // Shopfront awning: a striped slab over the door on the south face.
  if (shop) {
    const awn = box(Math.min(w * 0.6, 70), 3, 22, 0xe07856, 0, 22, d / 2 + 10);
    awn.castShadow = true;
    g.add(awn);
    g.add(box(4, 18, 2, 0x3a2a1a, -w * 0.2, 9, d / 2 + 0.6));
    g.add(box(4, 18, 2, 0x3a2a1a, w * 0.2, 9, d / 2 + 0.6));
  }
  return g;
}

/** A car: body, cabin, wheels, windshield, headlights; police get a light bar. */
export function makeCar(color, kind) {
  const g = new THREE.Group();
  const long = kind === 'van' ? 62 : kind === 'sports' ? 58 : 54;
  const wide = 26;
  const bodyH = kind === 'van' ? 20 : 11;
  const body = box(long, bodyH, wide, color, 0, 7 + bodyH / 2, 0);
  body.castShadow = true;
  g.add(body);
  if (kind === 'van') {
    const cabin = box(long * 0.92, 12, wide - 4, 0x223344, -2, 7 + bodyH + 5, 0);
    g.add(cabin);
  } else if (kind === 'pickup') {
    const cabin = box(long * 0.42, 10, wide - 4, 0x223344, -long * 0.18, 7 + bodyH + 4, 0);
    g.add(cabin);
    const bed = box(long * 0.34, 5, wide - 6, 0x2a2d33, long * 0.28, 7 + bodyH + 1, 0);
    g.add(bed);
  } else {
    const cabin = box(long * 0.5, 9, wide - 5, 0x223344, -2, 7 + bodyH + 4, 0);
    g.add(cabin);
  }
  // Wheels: cylinders with their axis across the car.
  const wheelGeo = new THREE.CylinderGeometry(5.5, 5.5, 4, 10);
  const wheelMat = mat(0x14161a);
  const wheels = [];
  for (const [wx, wz] of [[-long * 0.32, -wide / 2], [-long * 0.32, wide / 2], [long * 0.32, -wide / 2], [long * 0.32, wide / 2]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 5.5, wz);
    wheel.castShadow = true;
    g.add(wheel);
    wheels.push(wheel);
  }
  // Headlights (front = +X) and taillights.
  g.add(box(2, 3, 5, 0xfff2b0, long / 2 + 0.5, 9, -8, { emissive: 0xffe9a0 }));
  g.add(box(2, 3, 5, 0xfff2b0, long / 2 + 0.5, 9, 8, { emissive: 0xffe9a0 }));
  g.add(box(2, 3, 5, 0xd94f3d, -long / 2 - 0.5, 9, -8, { emissive: 0x881111 }));
  g.add(box(2, 3, 5, 0xd94f3d, -long / 2 - 0.5, 9, 8, { emissive: 0x881111 }));
  if (kind === 'police') {
    g.add(box(16, 4, 8, 0xd94f3d, -2, 7 + bodyH + 10, -3, { emissive: 0xaa0000 }));
    g.add(box(16, 4, 8, 0x2b4acb, -2, 7 + bodyH + 10, 3, { emissive: 0x0022aa }));
  }
  if (kind === 'taxi') {
    g.add(box(18, 5, 12, 0xffe08a, -2, 7 + bodyH + 10, 0, { emissive: 0xaa8800 }));
  }
  g.userData.wheels = wheels;
  return g;
}

/** A person: legs, torso, head, arms. Legs swing when walking. */
export function makePerson(jacket, skin = 0xc98e6b, pants = 0x2a3442) {
  const g = new THREE.Group();
  const legs = box(13, 16, 8, pants, 0, 8, 0);
  legs.castShadow = true;
  const torso = box(17, 18, 9, jacket, 0, 25, 0);
  torso.castShadow = true;
  const head = sphere(6, skin, 0, 40, 0);
  head.castShadow = true;
  const armL = box(4, 15, 4, jacket, -11, 25, 0);
  const armR = box(4, 15, 4, jacket, 11, 25, 0);
  g.add(legs, torso, head, armL, armR);
  g.userData.legs = legs;
  g.userData.torso = torso;
  return g;
}

/** A palm: trunk plus a crown of leaves. */
export function makePalm() {
  const g = new THREE.Group();
  const trunk = cyl(3, 52, 0x7a5a38, 0, 26, 0);
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(GEO.cone, mat(0x5a8a44));
    leaf.scale.set(12, 3, 22);
    leaf.position.set(Math.cos((i / 6) * Math.PI * 2) * 12, 54, Math.sin((i / 6) * Math.PI * 2) * 12);
    leaf.rotation.z = Math.cos((i / 6) * Math.PI * 2) * 0.9;
    leaf.rotation.x = -Math.sin((i / 6) * Math.PI * 2) * 0.9;
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

/** A police helicopter: body, tail, main + tail rotors, skids, spotlight cone. */
export function makeHelicopter() {
  const g = new THREE.Group();
  const body = box(46, 16, 22, 0x2b3a55, 0, 0, 0);
  body.castShadow = true;
  g.add(body);
  const nose = sphere(11, 0x9fd8ef, 24, 2, 0);
  g.add(nose);
  const tail = box(44, 6, 6, 0x2b3a55, -42, 4, 0);
  g.add(tail);
  const fin = box(2, 14, 10, 0x2b3a55, -62, 8, 0);
  g.add(fin);
  const rotor = box(96, 2, 6, 0x14161a, 0, 12, 0);
  g.add(rotor);
  const rotor2 = box(6, 2, 96, 0x14161a, 0, 13, 0);
  g.add(rotor2);
  const skidL = box(50, 2, 3, 0x14161a, 0, -12, -10);
  const skidR = box(50, 2, 3, 0x14161a, 0, -12, 10);
  g.add(skidL, skidR);
  // Spotlight cone, pointing down (apex at the helicopter).
  const coneGeo = new THREE.ConeGeometry(70, 220, 20, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.14,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.rotation.x = Math.PI;
  cone.position.y = -110;
  g.add(cone);
  g.userData.rotor = rotor;
  g.userData.rotor2 = rotor2;
  return g;
}

/** A rooftop water tower: legs, tank, conical cap. */
export function makeWaterTower() {
  const g = new THREE.Group();
  for (const [lx, lz] of [[-10, -10], [-10, 10], [10, -10], [10, 10]]) {
    g.add(box(2, 14, 2, 0x5a4a3a, lx, 7, lz));
  }
  const tank = cyl(13, 20, 0x8a6a4a, 0, 24, 0);
  tank.castShadow = true;
  g.add(tank);
  const cap = new THREE.Mesh(GEO.cone, mat(0x6b4a2a));
  cap.scale.set(28, 10, 28);
  cap.position.y = 39;
  g.add(cap);
  return g;
}

/**
 * Street props: lamp, hydrant, container, tree, billboard, bus stop,
 * bench, traffic light, planter. Each is one small group the renderer
 * drops at the city's prop positions.
 */
export function makeProp(kind, color = 0x8a8f96) {
  const g = new THREE.Group();
  if (kind === 'lamp') {
    const pole = cyl(1.6, 46, 0x3a3f46, 0, 23, 0);
    const head = box(14, 3, 5, 0xffe9a0, 5, 46, 0, { emissive: 0xffe9a0 });
    g.add(pole, head);
  } else if (kind === 'hydrant') {
    g.add(cyl(4, 12, 0xd94f3d, 0, 6, 0));
    g.add(sphere(3, 0xd94f3d, 0, 14, 0));
  } else if (kind === 'container') {
    const c = box(60, 22, 20, color, 0, 11, 0);
    c.castShadow = true;
    c.receiveShadow = true;
    g.add(c);
    // Door ribs and a top rail, so the box reads as a container, not a slab.
    for (const rx of [-18, -6, 6, 18]) {
      g.add(box(2, 20, 1, 0x000000, rx, 11, 10.4, { opacity: 0.25, transparent: true }));
    }
    g.add(box(60, 2, 21, 0x000000, 0, 21, 0, { opacity: 0.2, transparent: true }));
  } else if (kind === 'tree') {
    const trunk = cyl(2.4, 22, 0x6b4a2a, 0, 11, 0);
    trunk.castShadow = true;
    const canopy = sphere(16, 0x4e7d3a, 0, 34, 0);
    canopy.castShadow = true;
    g.add(trunk, canopy);
  } else if (kind === 'billboard') {
    // Two posts, a tall panel, and a glowing face — the Strip's neon.
    g.add(box(4, 44, 4, 0x3a3f46, -16, 22, 0));
    g.add(box(4, 44, 4, 0x3a3f46, 16, 22, 0));
    const face = box(52, 26, 2, color, 0, 56, 0, { emissive: color });
    face.castShadow = true;
    g.add(face);
    g.add(box(52, 3, 3, 0xffe9a0, 0, 70, 0, { emissive: 0xffe9a0 }));
  } else if (kind === 'busStop') {
    // Shelter: posts, a roof, and a bench under it.
    for (const [px, pz] of [[-18, -8], [18, -8], [-18, 8], [18, 8]]) {
      g.add(box(2, 26, 2, 0x3a3f46, px, 13, pz));
    }
    g.add(box(44, 2, 22, 0x3f8f7f, 0, 27, 0));
    g.add(box(36, 3, 10, 0x8a6a4a, 0, 12, 0));
    g.add(box(3, 12, 3, 0x8a6a4a, -16, 6, 0));
    g.add(box(3, 12, 3, 0x8a6a4a, 16, 6, 0));
  } else if (kind === 'bench') {
    g.add(box(34, 3, 10, 0x8a6a4a, 0, 12, 0));
    g.add(box(34, 10, 2, 0x8a6a4a, 0, 20, -5));
    g.add(box(3, 12, 3, 0x3a3f46, -14, 6, 0));
    g.add(box(3, 12, 3, 0x3a3f46, 14, 6, 0));
  } else if (kind === 'trafficLight') {
    const pole = cyl(2, 52, 0x3a3f46, 0, 26, 0);
    g.add(pole);
    const housing = box(8, 22, 6, 0x22262b, 0, 50, 0);
    g.add(housing);
    g.add(box(5, 5, 2, 0xd94f3d, 0, 56, 3.5, { emissive: 0xaa0000 }));
    g.add(box(5, 5, 2, 0xe0a83c, 0, 50, 3.5, { emissive: 0xaa8800 }));
    g.add(box(5, 5, 2, 0x4caf6d, 0, 44, 3.5, { emissive: 0x008800 }));
  } else if (kind === 'planter') {
    g.add(box(22, 10, 22, 0x7a5a38, 0, 5, 0));
    const bush = sphere(9, 0x4e7d3a, 0, 16, 0);
    bush.castShadow = true;
    g.add(bush);
  }
  return g;
}
