// Pure, deterministic helpers — no React, no Yjs — so they can be unit-tested
// in isolation and produce an identical result on every phone. The whole
// selling point of mesh-picker is *provable fairness*: every phone derives the
// same answer from the same shared, commit-reveal seed, and nobody can bias it.

/** Mulberry32: tiny, fast, deterministic PRNG seeded by a 32-bit integer. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Turn a fair-RNG seed in [0, 1) into a 32-bit integer usable by mulberry32.
 * `useFairRng` hands us a float; the pure algorithms below want an int so they
 * are stable and testable without depending on the hook.
 */
export function seedToInt(seed: number): number {
  return Math.floor(seed * 0xffffffff) >>> 0;
}

/**
 * Deterministic Fisher-Yates shuffle keyed on an integer seed. Same (items,
 * seed) → same order on every peer. Pure; never mutates the input.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/**
 * Split `players` into `n` teams by shuffling then dealing round-robin (like
 * dealing a deck): team sizes differ by at most one, and the assignment is a
 * pure function of whatever `shuffle` produces. `n` is clamped to [1, players].
 *
 * `shuffle` is injected (the app passes `useFairRng().shuffle`) so the team
 * draw rides the same fair seed as everything else; tests pass their own.
 */
export function splitIntoTeams<T>(
  players: readonly T[],
  n: number,
  shuffle: (arr: readonly T[]) => T[],
): T[][] {
  // Honor the requested bucket count; only cap by player count when there are
  // players to deal (so an empty roster still yields N empty buckets, and a
  // 2-player room can't be asked for 6 teams).
  const requested = Math.max(1, Math.floor(n) || 1);
  const teamCount = players.length > 0 ? Math.min(requested, players.length) : requested;
  const teams: T[][] = Array.from({ length: teamCount }, () => []);
  if (players.length === 0) return teams;
  const order = shuffle(players);
  order.forEach((player, i) => {
    teams[i % teamCount]!.push(player);
  });
  return teams;
}

/**
 * Shuffle `players` into a running order (turn order). Thin wrapper so the call
 * site reads intentionally and the shuffle source stays injectable.
 */
export function runningOrder<T>(players: readonly T[], shuffle: (arr: readonly T[]) => T[]): T[] {
  return shuffle(players);
}

/**
 * Secret-Santa derangement: a permutation `result` of `players` such that no
 * one is assigned themselves, i.e. `result[i] !== players[i]` for every i.
 *
 * Construction (seed-deterministic, no rejection sampling, always succeeds for
 * n >= 2):
 *   1. Build an index array [0, n) and shuffle it with the seed.
 *   2. Read the shuffled order as a single cycle: the giver at shuffled[k]
 *      gives to the receiver at shuffled[k+1] (wrapping the last back to the
 *      first). A single cycle of length n >= 2 has no fixed point by
 *      construction — every position's successor is a *different* position.
 *
 * `result[i]` is the person that `players[i]` gives a gift to. Returns an empty
 * array for n < 2 (a derangement is impossible for 0 or 1 element).
 */
export function derangement<T>(players: readonly T[], seed: number): T[] {
  const n = players.length;
  if (n < 2) return [];
  const order = seededShuffle(
    Array.from({ length: n }, (_, i) => i),
    seedToInt(seed),
  );
  // giver index -> receiver index, following the single cycle.
  const giveTo = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    const giver = order[k]!;
    const receiver = order[(k + 1) % n]!;
    giveTo[giver] = receiver;
  }
  return giveTo.map((receiverIdx) => players[receiverIdx]!);
}

/** True iff `assignment` is a valid derangement of `players` (no fixed points,
 * and a genuine permutation — every person appears exactly once as a giftee). */
export function isDerangement<T>(players: readonly T[], assignment: readonly T[]): boolean {
  if (players.length !== assignment.length) return false;
  if (players.length === 0) return false;
  const seen = new Set<T>();
  for (let i = 0; i < players.length; i++) {
    if (assignment[i] === players[i]) return false; // fixed point
    seen.add(assignment[i] as T);
  }
  return seen.size === players.length; // bijection
}

export type PickMode = "teams" | "order" | "santa" | "one";

export const MODE_META: Record<PickMode, { emoji: string; label: string; blurb: string }> = {
  teams: { emoji: "🟢", label: "Teams", blurb: "Split everyone into N fair teams" },
  order: { emoji: "🔢", label: "Turn order", blurb: "A random running order for the room" },
  santa: {
    emoji: "🎁",
    label: "Secret Santa",
    blurb: "Private gift pairing — nobody gets themselves",
  },
  one: { emoji: "🎯", label: "Pick one", blurb: "Crown a single random winner" },
};

export const MODE_IDS: PickMode[] = ["teams", "order", "santa", "one"];

/** Clamp the team count to the supported range and never exceed player count. */
export function clampTeams(n: number, players: number): number {
  const lo = 2;
  const hi = 6;
  const capped = Math.max(lo, Math.min(hi, Math.floor(n) || lo));
  return Math.max(1, Math.min(capped, Math.max(1, players)));
}
