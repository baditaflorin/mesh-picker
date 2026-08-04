import { describe, expect, it } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
import { createMockRoom, linkMockRooms } from "@baditaflorin/mesh-common/testing";
import { commit } from "@baditaflorin/mesh-common";
import { Feature } from "../../src/Feature";
import { config } from "../../src/config";

// These tests write directly to the shared Yjs doc the way an adversarial or
// merely out-of-sync peer would, rather than going through the UI — that's
// exactly the class of bug this file guards against (malformed/unexpected
// state arriving over the mesh, not just state the local UI would produce).

/**
 * Seeds a peer's already-committed-and-revealed entry for useFairRng's round
 * 0, the same shape `useCommitRevealHook` would publish for a real peer.
 */
async function seedFairRngReveal(
  room: ReturnType<typeof createMockRoom>,
  key: string,
  peerId: string,
  payload: string,
) {
  const c = await commit(JSON.stringify(payload));
  room.doc.getMap(`${key}:0:commits`).set(peerId, c.hash);
  room.doc.getMap(`${key}:0:reveals`).set(peerId, { salt: c.salt, payload });
}

describe("Feature — malformed shared `mode` doesn't crash the render", () => {
  it("falls back to the seed-gathering screen instead of throwing when pick:cfg.mode is garbage", () => {
    const room = createMockRoom();
    // Any peer can write straight to the CRDT doc (devtools, a stale client
    // build, a future bug) — this bypasses the mode-selection buttons, which
    // only ever write one of MODE_IDS.
    room.doc.getMap("pick:cfg").set("mode", "not-a-real-mode");
    room.doc.getMap("pick:phase").set("phase", "reveal");
    room.doc.getMap("pick:phase").set("epoch", 1);

    let container: HTMLElement | undefined;
    expect(() => {
      ({ container } = render(<Feature room={room} config={config} />));
    }).not.toThrow();

    expect(within(container!).getByText(/gathering the fair seed/i)).toBeInTheDocument();
  });
});

describe("Feature — reveal draws over a frozen player snapshot, not the live roster", () => {
  it("both peers render the identical winner even when their local rosters momentarily disagree", async () => {
    const a = createMockRoom({ peerId: "peer-a" });
    const b = createMockRoom({ peerId: "peer-b" });
    const unlink = linkMockRooms(a, b);

    // Both peers present with names, synced to each other via the link.
    a.doc.getMap("__mesh_names").set(a.peerId, "Alex");
    b.doc.getMap("__mesh_names").set(b.peerId, "Bo");
    a.doc.getMap("__mesh_roster").set(a.peerId, Date.now());
    b.doc.getMap("__mesh_roster").set(b.peerId, Date.now());

    // Both peers already committed + revealed a verified salt for round 0 —
    // the state useFairRng would have reached after a real commit-reveal
    // round, so the seed is ready as soon as the component mounts.
    await seedFairRngReveal(a, "pick:rng", a.peerId, "11".repeat(16));
    await seedFairRngReveal(a, "pick:rng", b.peerId, "22".repeat(16));

    // Peer A picks "Pick one" and hits Draw — exactly what the onClick
    // handler in Feature.tsx does: freeze the player list and flip the
    // phase in one transaction.
    a.doc.getMap("pick:cfg").set("mode", "one");
    a.doc.transact(() => {
      a.doc.getMap("pick:cfg").set("playersSnapshot", [a.peerId, b.peerId]);
      a.doc.getMap("pick:phase").set("phase", "reveal");
      a.doc.getMap("pick:phase").set("epoch", 1);
    });

    // Now the network partitions *after* the draw synced, and peer B's own
    // roster view drifts (a third peer's heartbeat lands locally on B but
    // hasn't reached A yet — same shape as real propagation lag / clock
    // skew around the presence freshness window).
    unlink();
    b.doc.getMap("__mesh_names").set("peer-c", "Casey");
    b.doc.getMap("__mesh_roster").set("peer-c", Date.now());

    const renderedA = render(<Feature room={a} config={config} />);
    await waitFor(() =>
      expect(within(renderedA.container).getByText(/is the pick\./i)).toBeInTheDocument(),
    );
    const winnerA = within(renderedA.container).getByText(/is the pick\./i).previousElementSibling
      ?.textContent;

    const renderedB = render(<Feature room={b} config={config} />);
    await waitFor(() =>
      expect(within(renderedB.container).getByText(/is the pick\./i)).toBeInTheDocument(),
    );
    const winnerB = within(renderedB.container).getByText(/is the pick\./i).previousElementSibling
      ?.textContent;

    expect(winnerA).toBeTruthy();
    // Same winner on both screens, and it's one of the two real players —
    // never "Casey", who only exists in B's transiently-diverged local view
    // and was never part of the frozen draw.
    expect(winnerB).toBe(winnerA);
    expect(["Alex", "Bo"]).toContain(winnerA);
  });
});
