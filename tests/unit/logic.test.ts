import { describe, expect, it } from "vitest";
import {
  MODE_IDS,
  clampTeams,
  derangement,
  isDerangement,
  mulberry32,
  runningOrder,
  seededShuffle,
  seedToInt,
  splitIntoTeams,
} from "../../src/logic";

// A deterministic shuffle keyed on a fixed seed, used as the injected
// `shuffle` so team / order tests are reproducible without the RNG hook.
const shuffleWith = (seed: number) => (arr: readonly unknown[]) => seededShuffle(arr, seed);

describe("mulberry32 / seededShuffle", () => {
  it("is deterministic for the same seed", () => {
    expect(seededShuffle([1, 2, 3, 4, 5], 42)).toEqual(seededShuffle([1, 2, 3, 4, 5], 42));
  });

  it("does not mutate its input", () => {
    const input = [1, 2, 3, 4];
    seededShuffle(input, 7);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  it("returns a permutation of the input", () => {
    const out = seededShuffle([0, 1, 2, 3, 4, 5, 6, 7], 99);
    expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("differs across seeds (overwhelmingly likely)", () => {
    expect(seededShuffle([1, 2, 3, 4, 5, 6], 1)).not.toEqual(seededShuffle([1, 2, 3, 4, 5, 6], 2));
  });

  it("mulberry32 emits values in [0, 1)", () => {
    const rnd = mulberry32(12345);
    for (let i = 0; i < 50; i++) {
      const v = rnd();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("seedToInt maps a [0,1) float to a 32-bit unsigned int", () => {
    expect(seedToInt(0)).toBe(0);
    const v = seedToInt(0.5);
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("splitIntoTeams", () => {
  const players = ["a", "b", "c", "d", "e", "f", "g"];

  it("creates exactly N teams", () => {
    const teams = splitIntoTeams(players, 3, shuffleWith(5));
    expect(teams).toHaveLength(3);
  });

  it("uses every player exactly once (partition)", () => {
    const teams = splitIntoTeams(players, 3, shuffleWith(5));
    expect(teams.flat().sort()).toEqual([...players].sort());
  });

  it("balances team sizes to within one", () => {
    const teams = splitIntoTeams(players, 3, shuffleWith(5));
    const sizes = teams.map((t) => t.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("is deterministic for the same shuffle", () => {
    expect(splitIntoTeams(players, 4, shuffleWith(8))).toEqual(
      splitIntoTeams(players, 4, shuffleWith(8)),
    );
  });

  it("never makes more teams than players", () => {
    const teams = splitIntoTeams(["x", "y"], 6, shuffleWith(1));
    expect(teams.length).toBeLessThanOrEqual(2);
    expect(teams.flat().sort()).toEqual(["x", "y"]);
  });

  it("handles an empty roster (N empty buckets)", () => {
    const teams = splitIntoTeams([], 3, shuffleWith(1));
    expect(teams).toEqual([[], [], []]);
  });
});

describe("runningOrder", () => {
  it("returns every player exactly once", () => {
    const order = runningOrder(["a", "b", "c", "d"], shuffleWith(3));
    expect(order.slice().sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("is deterministic for the same shuffle", () => {
    expect(runningOrder(["a", "b", "c"], shuffleWith(2))).toEqual(
      runningOrder(["a", "b", "c"], shuffleWith(2)),
    );
  });
});

describe("derangement", () => {
  it("assigns nobody to themselves across MANY seeds and sizes", () => {
    // The whole fairness promise hinges on this: secret-santa must never make
    // anyone draw their own name. Brute-force a large seed/size grid.
    for (let n = 2; n <= 12; n++) {
      const players = Array.from({ length: n }, (_, i) => `p${i}`);
      for (let seed = 0; seed < 400; seed++) {
        const assignment = derangement(players, seed / 400);
        expect(assignment).toHaveLength(n);
        for (let i = 0; i < n; i++) {
          // No fixed point.
          expect(assignment[i]).not.toBe(players[i]);
        }
        // It's a genuine permutation (bijection) AND a derangement.
        expect(isDerangement(players, assignment)).toBe(true);
      }
    }
  });

  it("is fully deterministic — same seed yields the same mapping on repeat", () => {
    const players = ["alice", "bob", "carol", "dave", "erin"];
    const seed = 0.61803;
    const first = derangement(players, seed);
    for (let rep = 0; rep < 5; rep++) {
      expect(derangement(players, seed)).toEqual(first);
    }
  });

  it("produces a single n-cycle (everyone is reachable by following gifts)", () => {
    // Our construction reads the shuffle as one cycle, so starting from any
    // giver and following giveTo() must visit all n players before returning.
    const players = Array.from({ length: 9 }, (_, i) => i);
    const assignment = derangement(players, 0.314159);
    const next = new Map(players.map((p, i) => [p, assignment[i]!]));
    let cur = players[0]!;
    const visited = new Set<number>();
    for (let step = 0; step < players.length; step++) {
      expect(visited.has(cur)).toBe(false);
      visited.add(cur);
      cur = next.get(cur)!;
    }
    expect(cur).toBe(players[0]); // closed the loop
    expect(visited.size).toBe(players.length);
  });

  it("differs for different seeds (not a constant)", () => {
    const players = ["a", "b", "c", "d", "e", "f"];
    expect(derangement(players, 0.1)).not.toEqual(derangement(players, 0.9));
  });

  it("returns [] for fewer than 2 players (no derangement exists)", () => {
    expect(derangement([], 0.5)).toEqual([]);
    expect(derangement(["solo"], 0.5)).toEqual([]);
  });

  it("handles exactly 2 players (must swap them)", () => {
    const out = derangement(["x", "y"], 0.5);
    expect(out).toEqual(["y", "x"]);
  });
});

describe("isDerangement", () => {
  it("rejects a mapping with a fixed point", () => {
    expect(isDerangement(["a", "b", "c"], ["a", "c", "b"])).toBe(false);
  });

  it("rejects a non-bijection (duplicate giftee)", () => {
    expect(isDerangement(["a", "b", "c"], ["b", "a", "a"])).toBe(false);
  });

  it("accepts a valid derangement", () => {
    expect(isDerangement(["a", "b", "c"], ["b", "c", "a"])).toBe(true);
  });

  it("rejects empty / mismatched lengths", () => {
    expect(isDerangement([], [])).toBe(false);
    expect(isDerangement(["a", "b"], ["b"])).toBe(false);
  });
});

describe("clampTeams", () => {
  it("clamps to the 2..6 band", () => {
    expect(clampTeams(1, 10)).toBe(2);
    expect(clampTeams(9, 10)).toBe(6);
    expect(clampTeams(4, 10)).toBe(4);
  });

  it("never exceeds the player count", () => {
    expect(clampTeams(6, 3)).toBe(3);
    expect(clampTeams(5, 2)).toBe(2);
  });

  it("defaults junk input to the floor", () => {
    expect(clampTeams(Number.NaN, 8)).toBe(2);
  });
});

describe("mode metadata", () => {
  it("exposes four selectable modes", () => {
    expect(MODE_IDS).toEqual(["teams", "order", "santa", "one"]);
  });
});
