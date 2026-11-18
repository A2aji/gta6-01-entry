// Seeded randomness for Solmar Bay. One seed builds the same city and the
// same screenshot scenes every time, so a run is reproducible and the
// screenshots can be re-shot exactly. mulberry32 is tiny, fast, and plenty
// good enough for a game — no crypto needed here.

/** A generator function returning floats in [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** Whole number in [min, max], both ends included. */
export function int(random, min, max) {
  return Math.floor(range(random, min, max + 1));
}

/** One element, chosen at random. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

/** True with the given probability (0–1). */
export function chance(random, p) {
  return random() < p;
}

/** A shuffled copy (Fisher-Yates); the input array is untouched. */
export function shuffle(random, items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const held = out[i];
    out[i] = out[j];
    out[j] = held;
  }
  return out;
}
