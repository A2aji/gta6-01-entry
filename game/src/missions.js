// Solmar Bay — the story. Five missions in a chain, each a small state machine:
// a waypoint to reach, something to do there, and a reward. The world module
// owns the simulation; missions only read it and ask it to spawn things.
import { MISSIONS } from './config.js';

const DIALOGUE = {
  m1: [
    ['JACE', 'First job of the night. A client needs a ride up the Strip.'],
    ['CLIENT', 'Drive smooth, kid. I tip for smooth.'],
  ],
  m2: [
    ['MARA', 'Package is at the docks, crate 7. On foot — no car, no noise.'],
    ['JACE', 'Cops patrol the docks. I will be quick.'],
  ],
  m3: [
    ['MARA', 'The Vulture crew is muscling in on the Strip. Send them home.'],
    ['JACE', 'Loud it is, then.'],
  ],
  m4: [
    ['MARA', 'Ninety seconds. Across the Bay Bridge. Two stars already on you.'],
    ['JACE', 'Do not stop. Do not stop.'],
  ],
  m5: [
    ['MARA', 'The vault car is downtown. Take it. Bring it to the docks.'],
    ['JACE', 'Three stars for this one. Worth it.'],
  ],
  m6: [
    ['MARA', 'Last one. A VIP needs the beach before sunset. Four stars on you.'],
    ['VIP', 'Drive like the sun is chasing us. Because it is.'],
    ['JACE', 'Sunset Keys. Let us finish this.'],
  ],
};

/**
 * A mission's waypoint and what "done" means for each phase.
 * M1: reach the Strip. M2: pick up the package, then lose the cops.
 * M3: clear the gang, then leave the area. M4: cross the bridge in time.
 * M5: steal the vault car, deliver it to the docks.
 */
export function createMissions(world, city) {
  const defs = new Map(MISSIONS.map((m) => [m.id, m]));
  const missions = {
    current: null,
    completed: [],
    dialogue: [],
    dialogueIndex: 0,
    dialogueTimer: 0,
  };

  function start(id) {
    const def = defs.get(id);
    if (!def) return;
    const place = city.places[def.place.toLowerCase()] || city.places.strip;
    const mission = {
      id: def.id,
      name: def.name,
      reward: def.reward,
      waypoint: { x: place.x, y: place.y, name: place.name },
      phase: 'go',
      timer: def.id === 'm4' ? 90 : 0,
      dialogue: DIALOGUE[id] || [],
      dialogueIndex: 0,
      dialogueTimer: 0,
    };
    if (id === 'm2') mission.phase = 'pickup';
    if (id === 'm3') {
      mission.phase = 'fight';
      world.spawnGang(place.x, place.y, 4);
    }
    if (id === 'm4') {
      world.state.wanted = Math.max(world.state.wanted, 2);
      mission.waypoint = { x: 2480, y: 960, name: 'Bay Bridge' };
    }
    if (id === 'm6') {
      world.state.wanted = Math.max(world.state.wanted, 4);
      mission.waypoint = { x: city.places.beach.x, y: city.places.beach.y, name: 'Solmar Beach' };
    }
    if (id === 'm5') {
      mission.phase = 'steal';
      mission.vaultCar = null;
      const car = world.state.vehicles.find((v) => v.kind === 'van' && v.driver === null)
        || world.state.vehicles[0];
      car.kind = 'van';
      car.color = '#d9a441';
      car.x = city.places.downtown.x + 80;
      car.y = city.places.downtown.y;
      car.driver = null;
      mission.vaultCar = car;
      mission.waypoint = { x: car.x, y: car.y, name: 'Vault car' };
    }
    missions.current = mission;
    missions.dialogue = mission.dialogue;
    missions.dialogueIndex = 0;
    missions.dialogueTimer = 0;
    world.state.missionHint = def.text;
  }

  function complete(worldState) {
    const m = missions.current;
    worldState.player.cash += m.reward;
    missions.completed.push(m.id);
    missions.current = null;
    worldState.missionHint = `${m.name} complete — $${m.reward}.`;
    world.spawnPickup(worldState.player.x + 30, worldState.player.y, 'cash');
    return true;
  }

  function fail(reason) {
    const m = missions.current;
    missions.current = null;
    world.state.missionHint = `${m.name} failed: ${reason}. Press Enter to retry.`;
  }

  function update(worldRef, dt = 1 / 60) {
    const m = missions.current;
    if (!m) return false;
    const p = worldRef.state.player;
    const dist = Math.hypot(p.x - m.waypoint.x, p.y - m.waypoint.y);
    m.dialogueTimer += dt;
    if (m.dialogueIndex < m.dialogue.length - 1 && m.dialogueTimer > 5) {
      m.dialogueIndex += 1;
      m.dialogueTimer = 0;
    }

    if (m.id === 'm1') {
      if (dist < 70) return complete(worldRef.state);
    }
    if (m.id === 'm2') {
      if (m.phase === 'pickup' && dist < 60 && !p.inCar) {
        m.phase = 'escape';
        worldRef.state.wanted = Math.max(worldRef.state.wanted, 1);
        worldRef.state.missionHint = 'Got it. Now lose the cops — stay out of sight.';
        m.waypoint = { x: city.places.safehouse.x, y: city.places.safehouse.y, name: 'Safehouse' };
      } else if (m.phase === 'escape' && worldRef.state.wanted === 0) {
        return complete(worldRef.state);
      }
    }
    if (m.id === 'm3') {
      if (m.phase === 'fight' && worldRef.state.gang.length === 0) {
        m.phase = 'leave';
        m.waypoint = { x: city.places.park.x, y: city.places.park.y, name: 'Palm Park' };
        worldRef.state.missionHint = 'Strip is clear. Get out of the area.';
      } else if (m.phase === 'leave' && dist < 80) {
        return complete(worldRef.state);
      }
    }
    if (m.id === 'm4') {
      m.timer -= dt;
      if (m.timer <= 0) { fail('out of time'); return false; }
      if (p.x > 2440) return complete(worldRef.state);
    }
    if (m.id === 'm5') {
      if (m.phase === 'steal' && p.inCar === m.vaultCar) {
        m.phase = 'deliver';
        worldRef.state.wanted = Math.max(worldRef.state.wanted, 3);
        m.waypoint = { x: city.places.docks.x, y: city.places.docks.y, name: 'Docks' };
        worldRef.state.missionHint = 'Vault car is yours. Deliver it to the docks.';
      } else if (m.phase === 'deliver' && dist < 90 && p.inCar === m.vaultCar) {
        return complete(worldRef.state);
      }
    }
    if (m.id === 'm6') {
      if (dist < 90) return complete(worldRef.state);
    }
    return false;
  }

  /** The next mission in the chain, or null when the story is done. */
  function next() {
    const order = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
    for (const id of order) {
      if (!missions.completed.includes(id)) return id;
    }
    return null;
  }

  missions.start = start;
  missions.update = update;
  missions.next = next;
  return missions;
}
