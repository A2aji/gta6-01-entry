// Solmar Bay — the simulation. No drawing and no browser in it: the player,
// cars, traffic, pedestrians, police, wanted level, combat and pickups.
// step() advances one fixed step and returns what happened as bit flags.
import { CAR, CITY, PEDESTRIAN, PLAYER, POLICE, TRAFFIC, WANTED, WORLD } from './config.js';
import { inBuilding, nearestNode, onRoad } from './city.js';
import { int, pick, range } from './random.js';

export const EVENT_CRIME = 1;
export const EVENT_BUSTED = 2;
export const EVENT_WASTED = 4;
export const EVENT_MISSION = 8;
export const EVENT_SHOT = 16;
export const EVENT_PICKUP = 32;

const CAR_KINDS = ['sedan', 'sedan', 'taxi', 'pickup', 'sports', 'van'];
const TAU = Math.PI * 2;

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Move a circle out of building rects and the sea/river, axis by axis. */
function collideCircle(city, p, radius) {
  p.x = Math.max(radius, Math.min(WORLD.width - radius, p.x));
  p.y = Math.max(radius, Math.min(WORLD.height - radius, p.y));
  // The river blocks everything except the bridge deck.
  const inRiver = p.x > CITY.riverLeft;
  const onBridge = p.y > city.bridge.y && p.y < city.bridge.y + city.bridge.h;
  if (inRiver && !onBridge) p.x = CITY.riverLeft - radius;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(p.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(p.y, b.y + b.h));
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (dx * dx + dy * dy < radius * radius) {
      if (Math.abs(dx) > Math.abs(dy)) p.x = cx + (dx >= 0 ? radius : -radius);
      else p.y = cy + (dy >= 0 ? radius : -radius);
    }
  }
}

export function createWorld(random, city) {
  const state = {
    player: {
      x: city.playerSpawn.x, y: city.playerSpawn.y, angle: -Math.PI / 2,
      health: PLAYER.health, ammo: PLAYER.pistolAmmo, reload: 0,
      inCar: null, cash: 0, dead: false, busted: false, arrestTimer: 0,
    },
    vehicles: [],
    pedestrians: [],
    police: [], // officers on foot (their cars are in vehicles with driver 'police')
    gang: [], // rival crew members, spawned by missions
    pickups: [],
    particles: [],
    skids: [],
    wanted: 0,
    crimeTimer: 0, // seconds since the last crime
    crimeCooldown: 0, // seconds until another shot can raise the wanted level
    decayTimer: 0,
    seenTimer: 99, // seconds since the police last saw the player
    lastKnown: { x: city.playerSpawn.x, y: city.playerSpawn.y }, // last place the police saw the player
    helicopter: { x: 0, y: 0, altitude: 0, active: false, angle: 0 },
    clock: 17.5 * 3600, // 17:30, golden hour
    time: 0,
    lastInteract: false,
    missionHint: '',
  };

  function spawnVehicle(x, y, angle, kind, color, driver) {
    const v = {
      x, y, angle, speed: 0, kind, color,
      driver, health: 100, moving: false,
      targetNode: null, honk: 0, smoke: 0,
      jitter: range(random, -TRAFFIC.speedJitter, TRAFFIC.speedJitter),
      lastDriver: null,
    };
    state.vehicles.push(v);
    return v;
  }

  function spawnPedestrian(x, y) {
    const p = {
      x, y, angle: random() * TAU, speed: PEDESTRIAN.speed,
      state: 'walk', target: null, dead: false, deadTimer: 0,
      color: pick(random, ['#e8e8e8', '#d94f3d', '#3d7dd9', '#e0a83c', '#4caf6d', '#7d5ba6']),
    };
    state.pedestrians.push(p);
    return p;
  }

  function spawnPickup(x, y, kind) {
    state.pickups.push({ x, y, kind, bob: random() * TAU });
  }

  function addParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * TAU;
      const s = range(random, speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: range(random, life * 0.5, life), maxLife: life, color, size: range(random, size * 0.6, size * 1.4) });
    }
    if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400);
  }

  function addCrime(stars, events) {
    state.wanted = Math.min(WANTED.maxStars, state.wanted + stars);
    state.crimeTimer = 0;
    state.seenTimer = 0;
    state.lastKnown = { x: state.player.x, y: state.player.y };
    return events | EVENT_CRIME;
  }

  function reset() {
    state.vehicles.length = 0;
    state.pedestrians.length = 0;
    state.police.length = 0;
    state.gang.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.skids.length = 0;
    state.player.x = city.playerSpawn.x;
    state.player.y = city.playerSpawn.y;
    state.player.angle = -Math.PI / 2;
    state.player.health = PLAYER.health;
    state.player.ammo = PLAYER.pistolAmmo;
    state.player.reload = 0;
    state.player.inCar = null;
    state.player.cash = 0;
    state.player.dead = false;
    state.player.busted = false;
    state.player.arrestTimer = 0;
    state.wanted = 0;
    state.crimeTimer = 0;
    state.crimeCooldown = 0;
    state.decayTimer = 0;
    state.seenTimer = 99;
    state.helicopter.active = false;
    state.helicopter.altitude = 0;
    state.clock = 17.5 * 3600;
    state.time = 0;
    // Traffic cars on the roads.
    const spawns = city.carSpawns.slice();
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const s = spawns[int(random, 0, spawns.length - 1)];
      const v = spawnVehicle(s.x + range(random, -8, 8), s.y + range(random, -8, 8), s.angle, pick(random, CAR_KINDS), pick(random, city.carColors), 'traffic');
      v.targetNode = nearestNode(city, v.x, v.y).id;
      v.speed = TRAFFIC.speed;
    }
    // One parked sports car near the spawn, for the first steal.
    spawnVehicle(city.playerSpawn.x + 120, city.playerSpawn.y + 40, 0, 'sports', '#d94f3d', null);
    for (let i = 0; i < PEDESTRIAN.count; i += 1) {
      const s = city.pedSpawns[int(random, 0, city.pedSpawns.length - 1)];
      spawnPedestrian(s.x, s.y);
    }
    spawnPickup(city.playerSpawn.x - 60, city.playerSpawn.y + 90, 'health');
    spawnPickup(city.playerSpawn.x + 200, city.playerSpawn.y - 60, 'ammo');
  }

  function stepPlayerOnFoot(dt, input) {
    const p = state.player;
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      const speed = input.sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
      p.x += mx * speed * dt;
      p.y += my * speed * dt;
      p.angle = Math.atan2(my, mx);
      collideCircle(city, p, PLAYER.radius);
    }
    if (input.aimX !== undefined && (input.aimX !== 0 || input.aimY !== 0)) {
      p.angle = angleTo(p.x, p.y, input.aimX, input.aimY);
    }
    if (p.reload > 0) p.reload = Math.max(0, p.reload - dt);
  }

  function stepPlayerInCar(dt, input) {
    const car = state.player.inCar;
    const p = state.player;
    if (input.up) car.speed = Math.min(CAR.maxSpeed, car.speed + CAR.accel * dt);
    else if (input.down) {
      car.speed = car.speed > 0 ? Math.max(0, car.speed - CAR.brake * dt) : Math.max(-CAR.maxReverse, car.speed - CAR.reverseAccel * dt);
    } else {
      car.speed *= Math.max(0, 1 - 2.2 * dt);
      if (Math.abs(car.speed) < 4) car.speed = 0;
    }
    const steer = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * (car.speed >= 0 ? 1 : -1);
    const grip = input.down && Math.abs(car.speed) > 200 ? CAR.handbrakeGrip : CAR.grip;
    car.angle += steer * CAR.steer * (Math.abs(car.speed) / CAR.maxSpeed) * dt * (grip / CAR.grip) * 2.2;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const probe = { x: nx, y: ny };
    collideCircle(city, probe, 24);
    if (Math.abs(probe.x - nx) > 0.5 || Math.abs(probe.y - ny) > 0.5) {
      car.speed *= 0.4; // hit a wall
      if (Math.abs(car.speed) > 150) addParticles(car.x, car.y, 6, '#ffb347', 120, 0.4, 3);
    }
    const ox = car.x;
    const oy = car.y;
    car.x = probe.x;
    car.y = probe.y;
    if (input.down && Math.abs(car.speed) > 240) {
      state.skids.push({ x1: ox, y1: oy, x2: car.x, y2: car.y, life: 6 });
      if (state.skids.length > 200) state.skids.shift();
    }
    car.moving = Math.abs(car.speed) > 5;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // Running over a pedestrian is a crime.
    for (const ped of state.pedestrians) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.x - car.x, ped.y - car.y);
      if (d < 30 && Math.abs(car.speed) > 60) {
        ped.dead = true;
        ped.deadTimer = 8;
        addParticles(ped.x, ped.y, 10, '#e5534b', 140, 0.6, 4);
        state.lastCrime = 'hit';
      }
    }
    if (car.health < 100 * CAR.damageSmoke) {
      car.smoke += dt;
      if (car.smoke > 0.12) { car.smoke = 0; addParticles(car.x, car.y, 1, '#888888', 40, 1.2, 6); }
    }
    if (car.health <= 0) {
      addParticles(car.x, car.y, 30, '#ff9f43', 260, 0.8, 5);
      addParticles(car.x, car.y, 16, '#555555', 120, 1.6, 8);
      state.player.inCar = null;
      car.driver = null;
      car.speed = 0;
      car.health = 1;
      p.x = car.x + 40;
      p.y = car.y;
    }
  }

  function enterExitCar(input) {
    const p = state.player;
    if (p.inCar) {
      const car = p.inCar;
      p.inCar = null;
      car.driver = null;
      car.lastDriver = 'player';
      car.speed = 0;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
      collideCircle(city, p, PLAYER.radius);
      return;
    }
    let best = null;
    let bestD = 60;
    for (const v of state.vehicles) {
      if (v.driver === 'police') continue;
      const d = Math.hypot(v.x - p.x, v.y - p.y);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (best) {
      // Taking a car that is not yours is a crime — unless it is the car
      // you just stepped out of.
      const stolen = best.driver !== null || best.lastDriver !== 'player';
      best.driver = 'player';
      best.lastDriver = null;
      p.inCar = best;
      if (stolen) return 'stolen';
    }
    return null;
  }

  function stepTraffic(dt) {
    for (const v of state.vehicles) {
      if (v.driver !== 'traffic') continue;
      if (!v.targetNode && v.targetNode !== 0) v.targetNode = nearestNode(city, v.x, v.y).id;
      const node = city.roadGraph.nodes[v.targetNode];
      const d = Math.hypot(node.x - v.x, node.y - v.y);
      if (d < 24) {
        const options = node.next.filter((id) => id !== v.lastNode);
        v.lastNode = v.targetNode;
        v.targetNode = options.length > 0 ? pick(random, options) : pick(random, node.next);
        continue;
      }
      const want = angleTo(v.x, v.y, node.x, node.y);
      const diff = angleDiff(want, v.angle);
      v.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      // Slow down for a car ahead.
      let blocked = false;
      for (const other of state.vehicles) {
        if (other === v) continue;
        const dx = other.x - v.x;
        const dy = other.y - v.y;
        const ahead = dx * Math.cos(v.angle) + dy * Math.sin(v.angle);
        const side = Math.abs(-dx * Math.sin(v.angle) + dy * Math.cos(v.angle));
        if (ahead > 0 && ahead < TRAFFIC.minGap && side < 30) { blocked = true; break; }
      }
      const target = blocked ? 0 : TRAFFIC.speed + v.jitter;
      v.speed += Math.max(-300 * dt, Math.min(300 * dt, target - v.speed));
      v.x += Math.cos(v.angle) * v.speed * dt;
      v.y += Math.sin(v.angle) * v.speed * dt;
      v.moving = Math.abs(v.speed) > 5;
    }
  }

  function stepPedestrians(dt) {
    for (const ped of state.pedestrians) {
      if (ped.dead) {
        ped.deadTimer -= dt;
        continue;
      }
      // Flee gunfire and fast cars.
      const threat = state.shotsFired > 0 && state.shotsFiredTimer > 0;
      const carNear = state.player.inCar && Math.hypot(ped.x - state.player.x, ped.y - state.player.y) < 90 && Math.abs(state.player.inCar.speed) > 100;
      if (threat || carNear) ped.state = 'flee';
      else if (ped.state === 'flee' && Math.hypot(ped.x - state.player.x, ped.y - state.player.y) > PEDESTRIAN.fleeRadius) ped.state = 'walk';
      const speed = ped.state === 'flee' ? PEDESTRIAN.fleeSpeed : PEDESTRIAN.speed;
      if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 12) {
        const s = city.pedSpawns[int(random, 0, city.pedSpawns.length - 1)];
        ped.target = { x: s.x, y: s.y };
      }
      const want = ped.state === 'flee'
        ? angleTo(state.player.x, state.player.y, ped.x, ped.y)
        : angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
      ped.angle = want;
      ped.x += Math.cos(want) * speed * dt;
      ped.y += Math.sin(want) * speed * dt;
      collideCircle(city, ped, 10);
    }
    state.pedestrians = state.pedestrians.filter((p) => !p.dead || p.deadTimer > 0);
  }

  function stepPolice(dt, events) {
    // Whether any police car can see the player right now. A sighting updates
    // the last known position; otherwise the police search where they last
    // saw the player, and give up after a while unseen — so a player who
    // breaks away and hides really does lose the heat.
    const policeNear = state.vehicles.some((v) => v.driver === 'police'
      && Math.hypot(v.x - state.player.x, v.y - state.player.y) < POLICE.seenRadius);
    if (policeNear) {
      state.seenTimer = 0;
      state.lastKnown = { x: state.player.x, y: state.player.y };
    } else state.seenTimer += dt;

    // The police give up the chase after a while unseen: their cars become
    // parked again and the officers leave, so the wanted level can decay.
    if (state.seenTimer > POLICE.giveUpAfter) {
      for (const v of state.vehicles) if (v.driver === 'police') { v.driver = null; v.speed = 0; }
      state.police.length = 0;
    }

    // Spawn police while wanted and recently seen, up to the cap — at road
    // nodes near the LAST KNOWN position, never on top of the player.
    const wantCount = Math.min(POLICE.maxActive, Math.ceil(state.wanted / 2) + (state.wanted >= 3 ? 1 : 0));
    const activeCars = state.vehicles.filter((v) => v.driver === 'police').length;
    if (state.wanted > 0 && state.seenTimer < 8 && activeCars < wantCount && state.time % 1 < dt) {
      const node = nearestNode(city, state.lastKnown.x + range(random, -1, 1) * POLICE.spawnDistance, state.lastKnown.y + range(random, -1, 1) * POLICE.spawnDistance);
      const car = spawnVehicle(node.x, node.y, 0, 'police', '#2b4acb', 'police');
      car.targetNode = nearestNode(city, state.lastKnown.x, state.lastKnown.y).id;
      car.speed = POLICE.speed * 0.7;
    }
    // Police cars chase the player's position — live while they can see the
    // player, the last known position once they lose sight of them.
    for (const v of state.vehicles) {
      if (v.driver !== 'police') continue;
      const seesPlayer = Math.hypot(state.player.x - v.x, state.player.y - v.y) < POLICE.seenRadius;
      const target = nearestNode(city,
        seesPlayer ? state.player.x : state.lastKnown.x,
        seesPlayer ? state.player.y : state.lastKnown.y);
      if (v.targetNode === undefined || v.targetNode === null || state.time % 0.5 < dt) v.targetNode = target.id;
      const node = city.roadGraph.nodes[v.targetNode];
      const d = Math.hypot(node.x - v.x, node.y - v.y);
      if (d < 30) {
        const options = node.next.filter((id) => id !== v.lastNode);
        v.lastNode = v.targetNode;
        v.targetNode = options.length > 0 ? pick(random, options) : pick(random, node.next);
      }
      const want = angleTo(v.x, v.y, node.x, node.y);
      const diff = angleDiff(want, v.angle);
      v.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
      // Ram the player's car, or stop beside an on-foot player.
      const pd = Math.hypot(state.player.x - v.x, state.player.y - v.y);
      if (pd < 120 && state.player.inCar) {
        const ram = angleTo(v.x, v.y, state.player.x, state.player.y);
        v.angle += Math.max(-4 * dt, Math.min(4 * dt, angleDiff(ram, v.angle)));
        v.speed = Math.min(POLICE.speed, v.speed + 500 * dt);
        if (pd < 46) {
          state.player.inCar.health -= POLICE.ramDamage * dt * 10;
          addParticles(state.player.x, state.player.y, 3, '#ffb347', 100, 0.3, 3);
        }
      } else if (pd < 120 && !state.player.inCar) {
        v.speed = Math.max(0, v.speed - 600 * dt);
        if (pd < 60 && state.police.length < 2) {
          state.police.push({ x: v.x, y: v.y, angle: v.angle, speed: 0 });
          v.driver = 'parked-police';
        }
      } else {
        v.speed = Math.min(POLICE.speed, v.speed + 320 * dt);
      }
      v.x += Math.cos(v.angle) * v.speed * dt;
      v.y += Math.sin(v.angle) * v.speed * dt;
      collideCircle(city, v, 24);
      v.moving = Math.abs(v.speed) > 5;
    }
    // Officers on foot chase and arrest.
    for (const officer of state.police) {
      const d = Math.hypot(state.player.x - officer.x, state.player.y - officer.y);
      if (state.player.inCar || state.player.dead) continue;
      const want = angleTo(officer.x, officer.y, state.player.x, state.player.y);
      officer.angle = want;
      if (d > POLICE.arrestRadius) {
        officer.x += Math.cos(want) * 250 * dt;
        officer.y += Math.sin(want) * 250 * dt;
        state.player.arrestTimer = 0;
      } else {
        state.player.arrestTimer += dt;
        if (state.player.arrestTimer >= POLICE.arrestTime) {
          state.player.busted = true;
          return events | EVENT_BUSTED;
        }
      }
    }
    // Wanted decay: no crime for a while and the police have not seen the
    // player recently. Once the stars are gone, the police stand down.
    state.crimeTimer += dt;
    if (state.wanted > 0 && state.crimeTimer > WANTED.decayDelay && state.seenTimer > 3) {
      state.decayTimer += dt;
      if (state.decayTimer >= WANTED.decayInterval) {
        state.decayTimer = 0;
        state.wanted -= 1;
        if (state.wanted === 0) {
          for (const v of state.vehicles) if (v.driver === 'police') v.driver = null;
          state.police.length = 0;
        }
      }
    }
    return events;
  }

  function stepCombat(dt, input, events) {
    const p = state.player;
    if (state.shotsFiredTimer > 0) state.shotsFiredTimer -= dt;
    if (state.crimeCooldown > 0) state.crimeCooldown -= dt;
    if (p.inCar || p.reload > 0) return events;
    if (!input.shoot) return events;
    if (p.ammo <= 0) {
      p.reload = PLAYER.pistolReload;
      p.ammo = PLAYER.pistolAmmo;
      return events;
    }
    p.ammo -= 1;
    p.reload = 0.28;
    state.shotsFired = (state.shotsFired || 0) + 1;
    state.shotsFiredTimer = 1.5;
    const mx = p.x + Math.cos(p.angle) * 18;
    const my = p.y + Math.sin(p.angle) * 18;
    addParticles(mx, my, 4, '#ffe08a', 200, 0.12, 3);
    events |= EVENT_SHOT;
    // Sustained fire draws heat, but only once per two seconds — a burst
    // of pistol fire must not max out the wanted level on its own.
    if (state.crimeCooldown <= 0) {
      events = addCrime(WANTED.shoot, events);
      state.crimeCooldown = 2;
    }
    // Hit the nearest gang member, officer or pedestrian near the aim line.
    const targets = [
      ...state.gang.map((g) => ({ x: g.x, y: g.y, ref: g, kind: 'gang' })),
      ...state.police.map((o) => ({ x: o.x, y: o.y, ref: o, kind: 'police' })),
      ...state.pedestrians.filter((ped) => !ped.dead).map((ped) => ({ x: ped.x, y: ped.y, ref: ped, kind: 'ped' })),
    ];
    let best = null;
    let bestScore = Infinity;
    for (const t of targets) {
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > PLAYER.pistolRange) continue;
      const along = dx * Math.cos(p.angle) + dy * Math.sin(p.angle);
      const side = Math.abs(-dx * Math.sin(p.angle) + dy * Math.cos(p.angle));
      if (along < 0 || side > 26) continue;
      const score = dist + side * 4;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (best) {
      addParticles(best.x, best.y, 8, '#e5534b', 160, 0.5, 4);
      if (best.kind === 'gang') {
        best.ref.health -= PLAYER.pistolDamage;
        if (best.ref.health <= 0) {
          best.ref.dead = true;
          state.player.cash += 50;
          addParticles(best.x, best.y, 14, '#e5534b', 200, 0.7, 4);
        }
      } else if (best.kind === 'police') {
        const idx = state.police.indexOf(best.ref);
        if (idx >= 0) state.police.splice(idx, 1);
        events = addCrime(WANTED.killPolice, events);
        addParticles(best.x, best.y, 14, '#2b4acb', 200, 0.7, 4);
      } else {
        best.ref.dead = true;
        best.ref.deadTimer = 8;
        events = addCrime(WANTED.hitPedestrian, events);
      }
    }
    return events;
  }

  function stepGang(dt, events) {
    for (const g of state.gang) {
      if (g.dead) continue;
      const d = Math.hypot(state.player.x - g.x, state.player.y - g.y);
      if (d < 420 && !state.player.dead) {
        g.angle = angleTo(g.x, g.y, state.player.x, state.player.y);
        g.shootTimer -= dt;
        if (g.shootTimer <= 0) {
          g.shootTimer = range(random, 0.9, 1.6);
          addParticles(g.x + Math.cos(g.angle) * 18, g.y + Math.sin(g.angle) * 18, 3, '#ffe08a', 180, 0.1, 3);
          if (Math.hypot(state.player.x - g.x, state.player.y - g.y) < 380 && random() < 0.45) {
            state.player.health -= 9;
            addParticles(state.player.x, state.player.y, 5, '#e5534b', 140, 0.4, 3);
            if (state.player.health <= 0) {
              state.player.health = 0;
              state.player.dead = true;
              return events | EVENT_WASTED;
            }
          }
        }
      } else {
        // Patrol around their post.
        g.angle += range(random, -0.05, 0.05);
        g.x += Math.cos(g.angle) * 40 * dt;
        g.y += Math.sin(g.angle) * 40 * dt;
        collideCircle(city, g, 12);
      }
    }
    state.gang = state.gang.filter((g) => !g.dead);
    return events;
  }

  function stepParticles(dt) {
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.98;
      pt.vy *= 0.98;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const s of state.skids) s.life -= dt;
    state.skids = state.skids.filter((s) => s.life > 0);
  }

  function stepPickups(dt) {
    const p = state.player;
    if (p.inCar) return;
    for (const pk of state.pickups) {
      pk.bob += dt * 3;
      if (Math.hypot(pk.x - p.x, pk.y - p.y) < 34) {
        pk.taken = true;
        if (pk.kind === 'health') p.health = Math.min(PLAYER.health, p.health + 40);
        else if (pk.kind === 'ammo') p.ammo = PLAYER.pistolAmmo;
        else if (pk.kind === 'cash') { p.cash += 100; }
      }
    }
    state.pickups = state.pickups.filter((pk) => !pk.taken);
  }

  // Mission helpers the missions module calls.
  function spawnGang(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      state.gang.push({ x: x + range(random, -40, 40), y: y + range(random, -40, 40), angle: random() * TAU, health: 100, shootTimer: range(random, 0.5, 1.5), dead: false });
    }
  }

  // Helicopter: at 3+ stars it spawns above the player, follows with a
  // spotlight, and keeps the player "seen" while it is overhead. When the
  // heat drops it flies away and switches off.
  function stepHelicopter(dt) {
    const h = state.helicopter;
    if (state.wanted >= POLICE.helicopterAtStars && !h.active) {
      h.active = true;
      h.x = state.player.x + 300;
      h.y = state.player.y - 300;
      h.altitude = POLICE.helicopterAltitude;
    }
    if (!h.active) return;
    if (state.wanted < POLICE.helicopterAtStars) {
      h.altitude += 120 * dt;
      if (h.altitude > 600) { h.active = false; h.altitude = 0; }
      return;
    }
    const tx = state.player.x;
    const ty = state.player.y;
    const d = Math.hypot(tx - h.x, ty - h.y);
    if (d > 40) {
      const want = angleTo(h.x, h.y, tx, ty);
      h.angle = want;
      const speed = Math.min(POLICE.helicopterSpeed, d * 1.5);
      h.x += Math.cos(want) * speed * dt;
      h.y += Math.sin(want) * speed * dt;
    }
    // Spotlight on the player: the police keep seeing them.
    if (d < 300) state.seenTimer = 0;
  }

  function step(dt, input) {
    let events = 0;
    state.time += dt;
    state.clock = (state.clock + dt * 12) % 86400; // 1 real second = 12 game seconds
    if (state.player.dead || state.player.busted) return events;

    if (input.enter) {
      const result = enterExitCar(input);
      if (result === 'stolen') events = addCrime(WANTED.stealCar, events);
    }
    if (state.player.inCar) stepPlayerInCar(dt, input);
    else stepPlayerOnFoot(dt, input);
    if (state.lastCrime === 'hit') {
      events = addCrime(WANTED.hitPedestrian, events);
      state.lastCrime = null;
    }
    stepTraffic(dt);
    stepPedestrians(dt);
    events = stepCombat(dt, input, events);
    events = stepGang(dt, events);
    events = stepPolice(dt, events);
    stepHelicopter(dt);
    stepPickups(dt);
    stepParticles(dt);
    state.lastInteract = !!input.interact;
    return events;
  }

  reset();
  return { state, reset, step, spawnGang, spawnPickup, addParticles };
}
