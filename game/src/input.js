// Keyboard and mouse. Held keys drive movement; one-shot presses (enter,
// interact, pause, confirm, radio, mute) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost and never
// counted twice. The mouse aims (screen position); a held click shoots.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_INTERACT = 8;
export const ACTION_RADIO = 16;
export const ACTION_MUTE = 32;

// Key code groups. WASD and arrows both work; Shift sprints, Space brakes.
const UP_KEYS = new Set(['ArrowUp', 'KeyW']);
const DOWN_KEYS = new Set(['ArrowDown', 'KeyS']);
const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const SPRINT_KEYS = new Set(['ShiftLeft', 'ShiftRight']);
const HANDBRAKE_KEYS = new Set(['Space']);
const CONFIRM_KEYS = new Set(['Enter']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const ENTER_KEYS = new Set(['KeyE']);
const INTERACT_KEYS = new Set(['KeyF']);
const RADIO_KEYS = new Set(['KeyR']);
const MUTE_KEYS = new Set(['KeyM']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, sprint: false, handbrake: false };
  let queued = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function clearHeld() {
    held.up = held.down = held.left = held.right = held.sprint = held.handbrake = false;
    mouseDown = false;
  }

  window.addEventListener('keydown', (event) => {
    if (UP_KEYS.has(event.code)) held.up = true;
    else if (DOWN_KEYS.has(event.code)) held.down = true;
    else if (LEFT_KEYS.has(event.code)) held.left = true;
    else if (RIGHT_KEYS.has(event.code)) held.right = true;
    else if (SPRINT_KEYS.has(event.code)) held.sprint = true;
    else if (HANDBRAKE_KEYS.has(event.code)) held.handbrake = true;
    else if (CONFIRM_KEYS.has(event.code)) { if (!event.repeat) queued |= ACTION_CONFIRM; }
    else if (PAUSE_KEYS.has(event.code)) { if (!event.repeat) queued |= ACTION_PAUSE; }
    else if (ENTER_KEYS.has(event.code)) { if (!event.repeat) queued |= ACTION_ENTER; }
    else if (INTERACT_KEYS.has(event.code)) { if (!event.repeat) queued |= ACTION_INTERACT; }
    else if (RADIO_KEYS.has(event.code)) { if (!event.repeat) queued |= ACTION_RADIO; }
    else if (MUTE_KEYS.has(event.code)) { if (!event.repeat) queued |= ACTION_MUTE; }
    else return;
    // Movement keys would scroll the page; swallow them.
    if (UP_KEYS.has(event.code) || DOWN_KEYS.has(event.code) || LEFT_KEYS.has(event.code)
      || RIGHT_KEYS.has(event.code) || HANDBRAKE_KEYS.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (UP_KEYS.has(event.code)) held.up = false;
    else if (DOWN_KEYS.has(event.code)) held.down = false;
    else if (LEFT_KEYS.has(event.code)) held.left = false;
    else if (RIGHT_KEYS.has(event.code)) held.right = false;
    else if (SPRINT_KEYS.has(event.code)) held.sprint = false;
    else if (HANDBRAKE_KEYS.has(event.code)) held.handbrake = false;
  });
  window.addEventListener('blur', clearHeld);
  window.addEventListener('mousemove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseDown = true;
  });
  window.addEventListener('pointerup', () => { mouseDown = false; });

  return {
    held,
    /** Screen-space mouse position; the renderer turns it into an aim point. */
    mouse() { return { x: mouseX, y: mouseY }; },
    get shoot() { return mouseDown; },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = queued;
      queued = 0;
      return taken;
    },
  };
}
