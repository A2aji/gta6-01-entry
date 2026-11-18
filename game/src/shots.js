// Screenshot staging: put the world into a specific, readable scene for
// each of the four screenshots, then let main.js paint it. These are staged
// states of the real game (no mock objects), run through the real step().
// ?shot=cover|title|street|mission
import { STEP } from './config.js';

const IDLE = { up: false, down: false, left: false, right: false, sprint: false, handbrake: false, enter: false, shoot: false, interact: false, aimX: 0, aimY: 0 };

function putPlayerInCar(state, car) {
  car.driver = 'player';
  car.lastDriver = null;
  state.player.inCar = car;
  state.player.x = car.x;
  state.player.y = car.y;
}

function drive(state, world, steps, input) {
  for (let i = 0; i < steps; i += 1) world.step(STEP, input);
}

function cover(world, missions) {
  const { state } = world;
  missions.start('m4');
  const car = state.vehicles.find((v) => v.kind === 'sports') || state.vehicles[0];
  car.x = 1280;
  car.y = 160;
  car.angle = Math.PI / 2; // south, down the Strip
  car.speed = 0;
  putPlayerInCar(state, car);
  // Ninety steps of clean driving, then the heat comes on at the player's
  // CURRENT spot. The police spawn one a second, so the car sits still for
  // two and a half seconds while they close in — then it drives off. The
  // long final run pulls the player away from the rammers, so the cruisers
  // trail behind the car instead of filling the camera, and the run ends
  // mid-city with the chase behind.
  drive(state, world, 90, { ...IDLE, up: true });
  state.wanted = 3;
  state.crimeTimer = 0;
  state.seenTimer = 0;
  state.lastKnown = { x: state.player.x, y: state.player.y };
  drive(state, world, 150, IDLE);
  drive(state, world, 110, { ...IDLE, up: true });
  return { screen: 'play' };
}

function title(world) {
  // Four seconds of traffic moving behind the title screen.
  drive(world.state, world, 240, IDLE);
  return { screen: 'title' };
}

function street(world, missions) {
  const { state } = world;
  missions.start('m2');
  const w = missions.current.waypoint;
  state.player.x = w.x - 120;
  state.player.y = w.y + 60;
  world.spawnGang(w.x - 60, w.y - 40, 3);
  // Less than a second of the shootout: aim at the nearest gang member and
  // fire. Muzzle flash, a wounded crew member, and the wanted stars all
  // show — and the crew is still standing, so the frame reads as a fight,
  // not the aftermath.
  for (let i = 0; i < 45; i += 1) {
    const g = state.gang.find((m) => !m.dead) || state.gang[0];
    const aim = g ? { aimX: g.x, aimY: g.y } : { aimX: w.x, aimY: w.y };
    state.player.angle = Math.atan2(aim.aimY - state.player.y, aim.aimX - state.player.x);
    world.step(STEP, { ...IDLE, shoot: true, ...aim });
  }
  return { screen: 'play' };
}

function mission(world, missions, city) {
  const { state } = world;
  missions.start('m5');
  const vault = missions.current.vaultCar;
  putPlayerInCar(state, vault);
  // Park the vault car right on the docks drop-off point.
  vault.x = city.places.docks.x;
  vault.y = city.places.docks.y;
  state.player.x = vault.x;
  state.player.y = vault.y;
  // Two updates: the first switches the phase to "deliver", the second
  // sees the vault car at the docks and completes the job.
  missions.update(world, STEP);
  missions.update(world, STEP);
  return { screen: 'complete', completeText: 'The Vault Job complete.', completeReward: 1200 };
}

export function stageShot(name, world, missions, city, seed) {
  world.reset();
  missions.current = null;
  missions.completed = [];
  if (name === 'cover') return cover(world, missions);
  if (name === 'title') return title(world);
  if (name === 'street') return street(world, missions);
  if (name === 'mission') return mission(world, missions, city);
  throw new Error(`unknown shot: ${name}`);
}
