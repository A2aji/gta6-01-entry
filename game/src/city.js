// The city of Solmar Bay: roads, blocks, buildings, the park, the beach,
// the river, the bridge and the docks, plus the road graph traffic drives
// on and the named places missions point at. Built once from a seed — the
// same seed always builds the same city.
import { CITY, PALETTE, WORLD } from './config.js';
import { int, pick, range } from './random.js';

const ROOF_COLORS = [
  PALETTE.roofTerracotta,
  PALETTE.roofCoral,
  PALETTE.roofCream,
  PALETTE.roofTeal,
  PALETTE.roofOchre,
];

const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8e8e8', '#22262b', '#4caf6d', '#e0a83c', '#7d5ba6', '#c0c8d0'];

/** True when the point sits on asphalt rather than inside a block. */
export function onRoad(city, x, y) {
  const half = CITY.roadWidth / 2;
  for (const rx of CITY.verticalRoads) if (Math.abs(x - rx) <= half) return true;
  for (const ry of CITY.horizontalRoads) if (Math.abs(y - ry) <= half) return true;
  return false;
}

/** True when the point is inside any building (walls block walking and driving). */
export function inBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

/** The road-graph node nearest (x, y), for snapping spawns onto roads. */
export function nearestNode(city, x, y) {
  let best = city.roadGraph.nodes[0];
  let bestD = Infinity;
  for (const n of city.roadGraph.nodes) {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

export function createCity(random) {
  // Road slabs: verticals run to the beach, horizontals stop at the river.
  const roads = [];
  for (const x of CITY.verticalRoads) {
    roads.push({ x: x - CITY.roadWidth / 2, y: 0, w: CITY.roadWidth, h: CITY.beachTop, vertical: true });
  }
  for (const y of CITY.horizontalRoads) {
    roads.push({ x: 0, y: y - CITY.roadWidth / 2, w: CITY.riverLeft, h: CITY.roadWidth, vertical: false });
  }

  // Buildings fill every block except the park block and the docks.
  const buildings = [];
  const blockW = 320 - CITY.roadWidth;
  for (let bx = 0; bx < CITY.verticalRoads.length; bx += 1) {
    for (let by = 0; by < CITY.horizontalRoads.length; by += 1) {
      const x0 = CITY.verticalRoads[bx] + CITY.roadWidth / 2;
      const y0 = CITY.horizontalRoads[by] + CITY.roadWidth / 2;
      if (x0 >= CITY.riverLeft) continue;
      if (x0 === CITY.parkBlock.x && y0 === CITY.parkBlock.y) continue; // park
      if (x0 < 320 && y0 === CITY.docks.y) continue; // docks
      const count = int(random, 1, 3);
      for (let i = 0; i < count; i += 1) {
        const w = range(random, 90, 180);
        const h = range(random, 70, 150);
        const x = x0 + range(random, 8, Math.max(9, blockW - w - 8));
        const y = y0 + range(random, 8, Math.max(9, blockW - h - 8));
        buildings.push({ x, y, w, h, roof: pick(random, ROOF_COLORS), height: int(random, 1, 3) });
      }
    }
  }

  // Road graph: one node per intersection, linked to its neighbours.
  const nodes = [];
  const nodeAt = new Map();
  for (const x of CITY.verticalRoads) {
    for (const y of CITY.horizontalRoads) {
      if (x >= CITY.riverLeft) continue;
      const node = { x, y, id: nodes.length, next: [] };
      nodes.push(node);
      nodeAt.set(`${x},${y}`, node);
    }
  }
  for (const n of nodes) {
    const neighbours = [
      nodeAt.get(`${n.x - 320},${n.y}`),
      nodeAt.get(`${n.x + 320},${n.y}`),
      nodeAt.get(`${n.x},${n.y - 320}`),
      nodeAt.get(`${n.x},${n.y + 320}`),
    ];
    for (const m of neighbours) if (m) n.next.push(m.id);
  }

  // Car spawns: on roads, clear of intersections.
  const carSpawns = [];
  for (let i = 0; i < 60; i += 1) {
    if (random() < 0.5) {
      const x = pick(random, CITY.verticalRoads) + (random() < 0.5 ? -16 : 16);
      carSpawns.push({ x, y: range(random, 100, CITY.beachTop - 100), angle: random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 });
    } else {
      const y = pick(random, CITY.horizontalRoads) + (random() < 0.5 ? -16 : 16);
      carSpawns.push({ x: range(random, 100, CITY.riverLeft - 100), y, angle: random() < 0.5 ? 0 : Math.PI });
    }
  }

  // Pedestrian spawns: on the sidewalks beside roads.
  const pedSpawns = [];
  for (let i = 0; i < 80; i += 1) {
    if (random() < 0.5) {
      const x = pick(random, CITY.verticalRoads) + (random() < 0.5 ? -44 : 44);
      pedSpawns.push({ x, y: range(random, 60, CITY.beachTop - 60) });
    } else {
      const y = pick(random, CITY.horizontalRoads) + (random() < 0.5 ? -44 : 44);
      pedSpawns.push({ x: range(random, 60, CITY.riverLeft - 60), y });
    }
  }

  const places = {
    strip: { x: 1280, y: 320, name: 'The Strip' },
    docks: { x: 160, y: 1440, name: 'Docks' },
    bridge: { x: 2320, y: 960, name: 'Bay Bridge' },
    park: { x: 1120, y: 800, name: 'Palm Park' },
    beach: { x: 1280, y: 1840, name: 'Solmar Beach' },
    downtown: { x: 1280, y: 960, name: 'Downtown' },
    safehouse: { x: 640, y: 640, name: 'Safehouse' },
  };

  return {
    roads,
    buildings,
    roadGraph: { nodes },
    carSpawns,
    pedSpawns,
    carColors: CAR_COLORS,
    playerSpawn: { x: 640, y: 700 },
    places,
    park: { x: CITY.parkBlock.x, y: CITY.parkBlock.y, w: blockW, h: blockW },
    beach: { x: 0, y: CITY.beachTop, w: WORLD.width, h: WORLD.height - CITY.beachTop },
    river: { x: CITY.riverLeft, y: 0, w: WORLD.width - CITY.riverLeft, h: WORLD.height },
    bridge: { x: 2240, y: 960 - CITY.roadWidth / 2, w: 320, h: CITY.roadWidth },
    docks: CITY.docks,
  };
}
