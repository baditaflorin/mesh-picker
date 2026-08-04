import { useEffect, useState } from "react";
import {
  type MeshConfig,
  type YRoom,
  ConfettiLayer,
  useConfetti,
  useFairRng,
  useNamedPeer,
  usePhase,
  useRoster,
} from "@baditaflorin/mesh-common";
import {
  MODE_IDS,
  MODE_META,
  type PickMode,
  clampTeams,
  derangement,
  runningOrder,
  splitIntoTeams,
} from "./logic";

type Props = { room: YRoom | null; config: MeshConfig };
type Stage = "setup" | "reveal";

const CFG_KEY = "pick:cfg";

/** Shared pick configuration: which mode is chosen + its params (e.g. team count). */
function usePickConfig(room: YRoom | null) {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!room) return;
    const m = room.doc.getMap(CFG_KEY);
    const cb = () => rerender((n) => n + 1);
    m.observe(cb);
    return () => m.unobserve(cb);
  }, [room]);

  const m = room ? room.doc.getMap(CFG_KEY) : null;
  // `mode` is shared, untrusted CRDT state: any peer (or a future bug) can
  // write an arbitrary string here directly via the Yjs doc, bypassing the
  // mode buttons entirely. Validate against MODE_IDS before trusting it as a
  // PickMode — an unrecognized value falls back to "no mode chosen" instead
  // of crashing every peer's render when it's used to index MODE_META below.
  const rawMode = m?.get("mode") as PickMode | undefined;
  const mode = rawMode && (MODE_IDS as string[]).includes(rawMode) ? rawMode : null;
  const teamCount = (m?.get("teamCount") as number | undefined) ?? 2;
  // Player list frozen at Draw time (see `lockPlayers`) — peerIds in the
  // exact order every phone should use for this round's shuffle/derangement,
  // so the reveal never recomputes over a roster that has since drifted.
  const playersSnapshot = (m?.get("playersSnapshot") as string[] | undefined) ?? null;

  const setMode = (next: PickMode) => m?.set("mode", next);
  const setTeamCount = (n: number) => m?.set("teamCount", n);
  const lockPlayers = (peerIds: readonly string[]) => m?.set("playersSnapshot", [...peerIds]);

  return { mode, teamCount, playersSnapshot, setMode, setTeamCount, lockPlayers };
}

export function Feature({ room, config }: Props) {
  const { name, setName, names, myName } = useNamedPeer(config, room);
  const roster = useRoster(room);
  const phase = usePhase<Stage>(room, "pick:phase", "setup");
  const cfg = usePickConfig(room);
  const peerIds = roster.present.length ? roster.present : room ? [room.peerId] : [];
  // The seed's quorum: prefer the player list frozen at Draw time (see
  // `lockPlayers` above) so a peer joining mid-round can't block the
  // already-locked round's quorum forever; fall back to the live roster
  // before a draw has happened.
  const rngPeerIds =
    cfg.playersSnapshot && cfg.playersSnapshot.length > 0 ? cfg.playersSnapshot : peerIds;
  const rng = useFairRng(room, "pick:rng", { peerIds: rngPeerIds, minContributors: 1 });
  const { burst } = useConfetti();

  // Big confetti when a single winner is crowned.
  useEffect(() => {
    if (phase.phase !== "reveal" || cfg.mode !== "one") return;
    burst({ origin: "top", count: 90, hueRange: [38, 50] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.phase, phase.epoch]);

  if (!room) {
    return (
      <div className="pk-wrap">
        <h1 className="pk-title">{config.appName}</h1>
        <p className="pk-status">Connecting to the room…</p>
      </div>
    );
  }

  const present = peerIds;
  const nameFor = (id: string) =>
    names[id] || (id === room.peerId ? myName : `peer-${id.slice(0, 4)}`);
  const players = present.map(nameFor);

  // ---- Setup --------------------------------------------------------------
  if (phase.phase === "setup") {
    const teamCount = clampTeams(cfg.teamCount, players.length);
    const santaTooFew = players.length < 3;

    return (
      <div className="pk-wrap">
        <ConfettiLayer />
        <h1 className="pk-title">🎲 mesh-picker</h1>
        <p className="pk-tagline">
          The draw the whole group trusts. Everyone opens this page; each phone throws in a pinch of
          randomness; the result is derived from the shared seed — identical on every screen, with
          no single phone secretly picking the winner.
        </p>

        {!name.trim() && (
          <label className="pk-name">
            Your name
            <input
              type="text"
              value={name}
              maxLength={24}
              placeholder="e.g. Alex"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}

        <p className="pk-roster">
          <strong>{players.length}</strong> player{players.length === 1 ? "" : "s"} here:{" "}
          {players.join(", ")}
        </p>

        <div className="pk-modes">
          {MODE_IDS.map((id) => {
            const active = cfg.mode === id;
            return (
              <button
                key={id}
                type="button"
                className={`pk-mode ${active ? "is-active" : ""}`}
                aria-pressed={active}
                onClick={() => cfg.setMode(id)}
              >
                <span className="pk-mode-emoji">{MODE_META[id].emoji}</span>
                <span className="pk-mode-label">{MODE_META[id].label}</span>
                <span className="pk-mode-blurb">{MODE_META[id].blurb}</span>
              </button>
            );
          })}
        </div>

        {cfg.mode === "teams" && (
          <div className="pk-teamcount">
            <span>Teams:</span>
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                className={`pk-chip ${teamCount === n ? "is-active" : ""}`}
                aria-pressed={teamCount === n}
                onClick={() => cfg.setTeamCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <div className="pk-seed">
          {rng.ready ? (
            <>
              🔒 Fair seed locked from <strong>{rng.contributors}</strong> phone
              {rng.contributors === 1 ? "" : "s"}.
            </>
          ) : (
            <>Gathering entropy…</>
          )}
        </div>

        {cfg.mode === "santa" && santaTooFew && (
          <p className="pk-warn">Secret Santa needs at least 3 players.</p>
        )}

        <div className="pk-controls">
          <button
            type="button"
            className="pk-primary"
            disabled={!cfg.mode || !rng.ready || (cfg.mode === "santa" && santaTooFew)}
            onClick={() =>
              // Freeze *who's playing* in the same Yjs transaction as the
              // phase flip, so every peer's reveal is computed over one
              // network-synced player list instead of each peer's own live
              // `roster.present` (which can transiently disagree across
              // peers — differing WebRTC propagation delay, clock skew in
              // the presence freshness window, a peer joining mid-draw —
              // and would otherwise let two phones compute different
              // teams/order/winner from the identical seed).
              room.doc.transact(() => {
                cfg.lockPlayers(present);
                phase.transition("reveal");
              })
            }
          >
            {cfg.mode ? `Draw — ${MODE_META[cfg.mode].label}` : "Pick a mode first"}
          </button>
        </div>
      </div>
    );
  }

  // ---- Reveal -------------------------------------------------------------
  const back = (
    <button type="button" className="pk-ghost" onClick={() => phase.transition("setup")}>
      ← Change mode / players
    </button>
  );
  const reroll = (
    <button
      type="button"
      className="pk-reroll"
      onClick={() => rng.rerollRound()}
      title="Restart the draw for the whole room — everyone blind-commits fresh randomness again"
    >
      🔁 Reroll
    </button>
  );

  // The seed gates the reveal; until every present phone has committed AND
  // revealed (and each reveal verifies against its earlier commitment), we
  // can't show a trustworthy result.
  if (!rng.ready || rng.seed === null || !cfg.mode) {
    return (
      <div className="pk-wrap pk-stage-reveal">
        <ConfettiLayer />
        <h1 className="pk-title">Gathering the fair seed…</h1>
        <p className="pk-status">
          Waiting for every phone in the room ({rng.contributors}/{rngPeerIds.length}) to commit
          and reveal a pinch of randomness.
        </p>
        {back}
      </div>
    );
  }

  const header = (
    <div className="pk-card-head">
      <h1 className="pk-hud">
        {MODE_META[cfg.mode].emoji} {MODE_META[cfg.mode].label}
      </h1>
      <p className="pk-fairnote">
        Derived from a shared seed of <strong>{rng.contributors}</strong> contributor
        {rng.contributors === 1 ? "" : "s"} — same on every phone.
      </p>
    </div>
  );

  // Every peer must draw over the *same* player list. Prefer the snapshot
  // frozen at Draw time (see `lockPlayers` above); only fall back to the
  // live roster for the brief window before that snapshot has synced in
  // (e.g. a peer that connects right as reveal starts).
  const revealPresent =
    cfg.playersSnapshot && cfg.playersSnapshot.length > 0 ? cfg.playersSnapshot : present;
  const revealPlayers = revealPresent.map(nameFor);

  let body: React.ReactNode = null;

  if (cfg.mode === "teams") {
    const n = clampTeams(cfg.teamCount, revealPlayers.length);
    const teams = splitIntoTeams(revealPlayers, n, rng.shuffle);
    body = (
      <div className="pk-teams">
        {teams.map((team, i) => (
          <div key={i} className="pk-team">
            <h2 className="pk-team-title">Team {i + 1}</h2>
            <ul className="pk-team-list">
              {team.map((p, j) => (
                <li key={j}>{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  } else if (cfg.mode === "order") {
    const order = runningOrder(revealPlayers, rng.shuffle);
    body = (
      <ol className="pk-order">
        {order.map((p, i) => (
          <li key={i} className={p === myName ? "is-me" : ""}>
            <span className="pk-order-num">{i + 1}</span>
            <span className="pk-order-name">{p}</span>
          </li>
        ))}
      </ol>
    );
  } else if (cfg.mode === "santa") {
    // Derangement over the frozen player list (sorted by peerId, snapshotted
    // at Draw time) so every phone builds the identical mapping; each phone
    // then reveals ONLY its own giftee.
    const assignment = derangement(revealPlayers, rng.seed);
    const myIdx = revealPresent.indexOf(room.peerId);
    const giveTo = myIdx >= 0 ? assignment[myIdx] : undefined;
    body = (
      <div className="pk-santa">
        {giveTo ? (
          <p className="pk-santa-you">
            🎁 You give to: <strong>{giveTo}</strong>
          </p>
        ) : (
          <p className="pk-status">You're not in the player list yet.</p>
        )}
        <p className="pk-santa-note">
          Only your own giftee shows on this phone. The full mapping is fully computable from the
          shared seed — it's just intentionally not displayed, so the surprise survives.
        </p>
      </div>
    );
  } else {
    const winner = rng.pick(revealPlayers);
    body = (
      <div className="pk-winner">
        <div className="pk-winner-emoji">🎯</div>
        <p className="pk-winner-name">{winner ?? "—"}</p>
        <p className="pk-winner-sub">is the pick.</p>
      </div>
    );
  }

  return (
    <div className="pk-wrap pk-stage-reveal">
      <ConfettiLayer />
      {header}
      <div className="pk-results">{body}</div>
      <div className="pk-controls">
        {reroll}
        {back}
      </div>
    </div>
  );
}
