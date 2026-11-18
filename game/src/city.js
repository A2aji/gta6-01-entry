// The city of Solmar Bay: roads, blocks, buildings, the park, the plaza,
// the beach, the river, the bridge and the docks, plus the road graph
// traffic drives on, the named places missions point at, and the street
// props (hydrants, benches, billboards, bus stops, traffic lights) that
// make the streets read dense. Built once from a seed — the same seed
// always builds the same city.
import { CITY, DENSITY, PALETTE, WORLD } from './config.js';
import { chance, int, pick, range } from './random.js';

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

/** Distance from a block's corner to downtown — tall towers cluster there. */
function downtownDistance(x0, y0) {
  const cx = x0 + 128;
  const cy = y0 + 128;
  return Math.hypot(cx - 1280, cy - 960);
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

  // Buildings fill every block except the park, the plaza and the docks.
  // Blocks now hold 2–4 buildings (was 1–3) so the blocks read full, and
  // the ones near downtown rise to 3–5 storeys for a skyline.
  const buildings = [];
  const blockW = 320 - CITY.roadWidth;
  for (let bx = 0; bx < CITY.verticalRoads.length; bx += 1) {
    for (let by = 0; by < CITY.horizontalRoads.length; by += 1) {
      const x0 = CITY.verticalRoads[bx] + CITY.roadWidth / 2;
      const y0 = CITY.horizontalRoads[by] + CITY.roadWidth / 2;
      if (x0 >= CITY.riverLeft) continue;
      if (x0 === CITY.parkBlock.x && y0 === CITY.parkBlock.y) continue; // park
      if (x0 === CITY.plazaBlock.x && y0 === CITY.plazaBlock.y) continue; // plaza
      if (x0 < 320 && y0 === CITY.docks.y) continue; // docks
      const downtown = downtownDistance(x0, y0) < 560;
      const heightRange = downtown ? DENSITY.downtownHeight : [1, 3];
      const count = int(random, DENSITY.buildingsPerBlock[0], DENSITY.buildingsPerBlock[1]);
      for (let i = 0; i < count; i += 1) {
        const w = range(random, 90, 180);
        const h = range(random, 70, 150);
        const x = x0 + range(random, 8, Math.max(9, blockW - w - 8));
        const y = y0 + range(random, 8, Math.max(9, blockW - h - 8));
        buildings.push({
          x, y, w, h,
          roof: pick(random, ROOF_COLORS),
          height: int(random, heightRange[0], heightRange[1]),
          shop: chance(random, 0.45), // a shopfront awning at street level
          lit: chance(random, 0.35), // some windows glow at golden hour
        });
      }
    }
  }

  // Rooftop water towers on a few of the taller buildings — a skyline
  // reads taller with something on top of it.
  const waterTowers = [];
  const tall = buildings.filter((b) => b.height >= 3);
  for (let i = 0; i < Math.min(8, tall.length); i += 1) {
    const b = tall[int(random, 0, tall.length - 1)];
    waterTowers.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, roofY: 40 + b.height * 30 });
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
  for (let i = 0; i < DENSITY.carSpawnPoints; i += 1) {
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
  for (let i = 0; i < DENSITY.pedSpawnPoints; i += 1) {
    if (random() < 0.5) {
      const x = pick(random, CITY.verticalRoads) + (random() < 0.5 ? -44 : 44);
      pedSpawns.push({ x, y: range(random, 60, CITY.beachTop - 60) });
    } else {
      const y = pick(random, CITY.horizontalRoads) + (random() < 0.5 ? -44 : 44);
      pedSpawns.push({ x: range(random, 60, CITY.riverLeft - 60), y });
    }
  }

  // Parked cars: roadside, near the curb, clear of intersections — they
  // are stealable and they make the streets look lived-in. The sim's
  // traffic ignores them (driver null), so they never block the flow.
  const parkedSpots = [];
  for (let i = 0; i < DENSITY.parkedCars; i += 1) {
    if (random() < 0.5) {
      const x = pick(random, CITY.verticalRoads) + (random() < 0.5 ? -27 : 27);
      let y = range(random, 140, CITY.beachTop - 140);
      const nearLine = CITY.horizontalRoads.find((hy) => Math.abs(y - hy) < 60);
      if (nearLine) y += 90;
      parkedSpots.push({ x, y: Math.min(y, CITY.beachTop - 60), angle: random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 });
    } else {
      const y = pick(random, CITY.horizontalRoads) + (random() < 0.5 ? -27 : 27);
      let x = range(random, 140, CITY.riverLeft - 140);
      const nearLine = CITY.verticalRoads.find((vx) => Math.abs(x - vx) < 60);
      if (nearLine) x += 90;
      parkedSpots.push({ x: Math.min(x, CITY.riverLeft - 60), y, angle: random() < 0.5 ? 0 : Math.PI });
    }
  }

  // Street props: hydrants at corners, benches in the park/plaza/beach,
  // billboards over the big intersections, bus stops on the Strip,
  // traffic lights at the busiest crossings, planters along the Strip.
  const props = [];
  const corners = [];
  for (const n of nodes) corners.push(n);
  for (let i = 0; i < 12; i += 1) {
    const n = corners[int(random, 0, corners.length - 1)];
    props.push({ kind: 'hydrant', x: n.x + 44, y: n.y + 44, angle: 0 });
  }
  const benchSpots = [
    ...Array.from({ length: 6 }, (_, i) => ({ x: CITY.parkBlock.x + 40 + (i % 3) * 80, y: CITY.parkBlock.y + 40 + Math.floor(i / 3) * 140 })),
    ...Array.from({ length: 6 }, (_, i) => ({ x: CITY.plazaBlock.x + 40 + (i % 3) * 80, y: CITY.plazaBlock.y + 40 + Math.floor(i / 3) * 140 })),
    ...Array.from({ length: 6 }, (_, i) => ({ x: 200 + i * 400, y: CITY.beachTop + 40 })),
  ];
  for (const b of benchSpots) props.push({ kind: 'bench', x: b.x, y: b.y, angle: chance(random, 0.5) ? 0 : Math.PI / 2 });
  const billboardAt = [[1280, 320], [1280, 960], [960, 960], [1600, 1280]];
  for (const [x, y] of billboardAt) {
    props.push({ kind: 'billboard', x: x - 48, y: y - 48, angle: 0, color: pick(random, ['#e07856', '#3f8f7f', '#d9a441', '#7d5ba6']) });
  }
  const busStops = [[1280, 480], [1280, 1120], [960, 960], [1600, 960]];
  for (const [x, y] of busStops) props.push({ kind: 'busStop', x, y, angle: 0 });
  const lightAt = [[1280, 960], [960, 960], [1600, 960], [1280, 640], [1280, 1280], [960, 1280]];
  for (const [x, y] of lightAt) props.push({ kind: 'trafficLight', x: x + 40, y: y - 40, angle: 0 });
  for (let y = 400; y < CITY.beachTop - 100; y += 320) {
    props.push({ kind: 'planter', x: 1280 + 44, y, angle: 0 });
    props.push({ kind: 'planter', x: 1280 - 44, y: y + 160, angle: 0 });
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
    parkedSpots,
    props,
    waterTowers,
    carColors: CAR_COLORS,
    playerSpawn: { x: 640, y: 700 },
    places,
    park: { x: CITY.parkBlock.x, y: CITY.parkBlock.y, w: blockW, h: blockW },
    plaza: { x: CITY.plazaBlock.x, y: CITY.plazaBlock.y, w: blockW, h: blockW },
    beach: { x: 0, y: CITY.beachTop, w: WORLD.width, h: WORLD.height - CITY.beachTop },
    river: { x: CITY.riverLeft, y: 0, w: WORLD.width - CITY.riverLeft, h: WORLD.height },
    bridge: { x: 2240, y: 960 - CITY.roadWidth / 2, w: 320, h: CITY.roadWidth },
    docks: CITY.docks,
  };
}
