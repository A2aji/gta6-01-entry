// Solmar Bay — boot and the one loop. Each frame reads the input, advances
// the world in fixed 1/60 s steps, and paints what is there. Screens: title,
// play, paused, complete, busted, wasted.
// ?seed=N fixes the city. ?shot=cover|title|street|mission (with &seed=N)
// stages that scene instead of running the loop, paints it, and sets
// window.__shotReady so a screenshot can be taken.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createWorld, EVENT_BUSTED, EVENT_PICKUP, EVENT_SHOT, EVENT_WASTED } from './world.js';
import { createMissions } from './missions.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_RADIO, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

// A tab that was hidden for a while must not dump a huge catch-up step.
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const hudCanvas = document.getElementById('hud');
const status = document.getElementById('status');
const random = createRandom(seed);
const city = createCity(random);
const world = createWorld(createRandom(seed), city);
const missions = createMissions(world, city);
const renderer = createRenderer(canvas, hudCanvas);
renderer.buildCity(city);
const audio = createAudio();

function readSave() {
  try {
    return JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

// A staged screenshot: run the scene's script, then paint ~40 frames so the
// chase camera eases onto the player, and flag the shot as ready.
function runShot(name) {
  const staged = stageShot(name, world, missions, city, seed);
  const ui = {
    mission: missions,
    best: readSave()?.best || 0,
    radio: { station: audio.station, on: true },
    completeText: staged.completeText,
    completeReward: staged.completeReward,
  };
  // State snapshot for headless QA (window only; not part of the game).
  window.__debugState = () => JSON.stringify({
    wanted: world.state.wanted,
    cash: world.state.player.cash,
    ammo: world.state.player.ammo,
    health: world.state.player.health,
    inCar: !!world.state.player.inCar,
    player: [Math.round(world.state.player.x), Math.round(world.state.player.y)],
    policeCars: world.state.vehicles.filter((v) => v.driver === 'police').length,
    helicopter: world.state.helicopter.active,
    gang: world.state.gang.length,
    mission: missions.current ? missions.current.id : null,
  });
  let painted = 0;
  function paint() {
    renderer.draw(world.state, staged.screen, ui, 1 / 60, 6);
    painted += 1;
    if (painted < 40) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      window.__diagnostics = renderer.diagnostics();
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readSave()?.best || 0;
  let completeText = '';
  let completeReward = 0;
  let accumulator = 0;
  let last = performance.now();
  let time = 0;
  let pendingActions = 0;

  function announce(message) {
    status.textContent = message;
  }

  function applySave(save) {
    if (!save) return;
    world.state.player.cash = save.cash || 0;
    missions.completed = save.completed || [];
    best = save.best || 0;
  }

  function startGame(fromSave) {
    world.reset();
    missions.current = null;
    missions.completed = [];
    if (fromSave) applySave(readSave());
    const next = missions.next();
    if (next) missions.start(next);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Six jobs. Do not get caught.');
  }

  function endGame(kind) {
    screen = kind === 'busted' ? SCREEN_BUSTED : SCREEN_WASTED;
    writeSave({ cash: world.state.player.cash, completed: missions.completed, best });
    announce(kind === 'busted' ? 'Busted. The Solmar Bay PD has you.' : 'Wasted. Jace is down.');
  }

  function missionComplete() {
    const m = missions.completed[missions.completed.length - 1];
    completeText = `${m} complete.`;
    completeReward = world.state.player.cash;
    best = Math.max(best, world.state.player.cash);
    writeSave({ cash: world.state.player.cash, completed: missions.completed, best });
    audio.sting();
    screen = SCREEN_COMPLETE;
    announce(`Job done. Cash $${world.state.player.cash}.`);
  }

  function worldInput() {
    const held = input.held;
    const mouse = input.mouse();
    const aim = renderer.aimPoint(mouse.x, mouse.y);
    return {
      up: held.up, down: held.down, left: held.left, right: held.right,
      sprint: held.sprint, handbrake: held.handbrake,
      enter: false, shoot: input.shoot, interact: false,
      aimX: aim.x, aimY: aim.y,
    };
  }

  // One simulation step: feed the world this frame's input (one-shot
  // actions apply to this step only), then react to what happened.
  function step() {
    const actions = pendingActions;
    pendingActions = 0;
    const inputState = worldInput();
    inputState.enter = !!(actions & ACTION_ENTER);
    inputState.interact = !!(actions & ACTION_INTERACT);
    const events = world.step(STEP, inputState);
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_BUSTED) endGame('busted');
    else if (events & EVENT_WASTED) endGame('wasted');
    if (missions.update(world, STEP)) missionComplete();
    audio.setEngine(world.state.player.inCar ? Math.abs(world.state.player.inCar.speed) / 520 : 0);
    audio.setSiren(world.state.wanted > 0);
  }

  // The input's takeActions is consumed once per frame; the flags it returns
  // are held here so every fixed step in the frame sees them.
  const takeHeld = input.takeActions.bind(input);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    time += dt;
    pendingActions |= takeHeld();
    if (pendingActions & ACTION_MUTE) {
      audio.toggleMute();
      pendingActions &= ~ACTION_MUTE;
    }
    if (pendingActions & ACTION_RADIO) {
      audio.nextStation();
      pendingActions &= ~ACTION_RADIO;
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_COMPLETE || screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (pendingActions & ACTION_CONFIRM) {
        pendingActions &= ~ACTION_CONFIRM;
        if (screen === SCREEN_COMPLETE) {
          const next = missions.next();
          if (next) {
            missions.start(next);
            screen = SCREEN_PLAY;
          } else screen = SCREEN_TITLE;
        } else if (screen === SCREEN_TITLE) {
          startGame(readSave() !== null);
        } else {
          startGame(false);
        }
      }
    } else if (pendingActions & ACTION_PAUSE) {
      pendingActions &= ~ACTION_PAUSE;
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
    } else if (screen === SCREEN_TITLE) {
      // Attract mode: traffic keeps moving behind the title.
      accumulator += dt;
      while (accumulator >= STEP) {
        world.step(STEP, { up: false, down: false, left: false, right: false, sprint: false, enter: false, shoot: false, interact: false, aimX: 0, aimY: 0 });
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, {
      mission: missions,
      best,
      radio: { station: audio.station, on: audio.on },
      completeText,
      completeReward,
    }, dt, time);
    window.__diagnostics = renderer.diagnostics();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
