# mesh-picker

[![pages](https://img.shields.io/badge/live-baditaflorin.github.io%2Fmesh-picker-f0a830)](https://baditaflorin.github.io/mesh-picker/)
[![version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/baditaflorin/mesh-picker/blob/main/package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> Provably-fair random team-splitter, turn-order, and secret-santa pairing

**Live → https://baditaflorin.github.io/mesh-picker/**

**Source → https://github.com/baditaflorin/mesh-picker**

**Tip the dev (buy a coffee) → https://www.paypal.com/paypalme/florinbadita**

---

![screenshot](docs/screenshot.png)

> Two peers, side-by-side, in the same room. Drop a `tests/demo/scenario.mjs`
> exporting `default async (a, b) => …` and run `npm run demo` to regenerate
> `docs/preview.png` plus `docs/demo-a.webm` / `docs/demo-b.webm` clips.

![preview](docs/preview.png)

## What it is

A **rootless-computing** peer-to-peer browser app. No backend of its own beyond the self-hosted WebRTC stack listed below. State lives in a Yjs mesh shared by everyone in the same room.

Read the principles → **https://baditaflorin.github.io/rootless-computing/principles.html**

## How to play

The utility every group reaches for — no app store, no accounts, no "let me just
flip a coin." One person opens the link; everyone else scans the room QR (⚙ →
invite) or opens the same link. Type a name, and you're in.

1. **Everyone joins.** Presence is live — the lobby shows who's here.
2. **Pick a mode.** The choice is shared, so the whole room sees the same screen:
   - **🟢 Teams** — split everyone into 2–6 balanced teams. Players are shuffled
     and dealt round-robin, so team sizes differ by at most one.
   - **🔢 Turn order** — a random running order for the room (who's up first?).
   - **🎁 Secret Santa** — a private gift pairing. Each phone shows **only** "🎁
     You give to: \<name\>"; no phone reveals anyone else's giftee, and nobody is
     ever assigned themselves. (≥3 players.)
   - **🎯 Pick one** — crown a single random winner, with a big reveal.
3. **Draw.** Every phone contributes a pinch of randomness; once the seed is
   locked, hit **Draw** and the result appears — _identical on every screen_.
4. **Reroll** any time to get a fresh, equally-fair draw — it bumps your salt and
   re-derives for everyone.

## Why it's fair

The whole point of mesh-picker is that **nobody can rig the draw** — not a
player, not the person who opened the link, and not a server (there isn't one).
It uses the same **commit-reveal** trust-minimization as
[mesh-mafia](https://baditaflorin.github.io/mesh-mafia/)'s role dealing:

- Every phone independently generates a random salt and publishes it to a shared
  Yjs map. No single phone supplies "the" randomness.
- The shared seed is the **XOR-combine of all salts** (`combineSalts`). To bias
  the outcome in your favor you'd have to predict and counter the _combined_
  entropy of every other phone — which you can't, because your salt is fixed once
  contributed and theirs are independent.
- Every phone then runs the **same deterministic algorithm** (a seeded
  Fisher-Yates shuffle, mulberry32) on the same seed, so all phones compute the
  _same_ teams / order / pairing without trusting each other or any coordinator.
- **Reroll** simply contributes a fresh salt and shifts the seed for everyone —
  it's another fair draw, not a do-over you control.

For Secret Santa specifically, the pairing is a **derangement** — a permutation
with no fixed points — constructed as a single cycle over the seeded shuffle, so
it is mathematically impossible for anyone to draw their own name. The full
mapping is computable from the public seed, but each phone deliberately renders
only its own giftee so the surprise survives.

## Quickstart

Open the live URL on two devices in the same room (set in ⚙ settings, or scan the room QR). Everything else is in-app.

For local hacking:

```bash
git clone https://github.com/baditaflorin/mesh-common
git clone https://github.com/baditaflorin/mesh-picker
cd mesh-picker
npm install
npm run dev
```

`mesh-common` must sit as a **sibling** directory because `package.json` references it via `file:../mesh-common`.

## Self-hosted infrastructure

| Repo                                              | Endpoint                               | Purpose                     |
| ------------------------------------------------- | -------------------------------------- | --------------------------- |
| https://github.com/baditaflorin/signaling-server  | `wss://turn.0docker.com/ws`            | y-webrtc signaling fan-out  |
| https://github.com/baditaflorin/turn-token-server | `https://turn.0docker.com/credentials` | HMAC TURN creds, 1-hour TTL |
| https://github.com/baditaflorin/coturn-hetzner    | `turn:turn.0docker.com:3479`           | TURN relay                  |

## Settings overrides

The settings drawer lets the user override signaling and TURN endpoints. localStorage keys:

- `mesh-picker:signalingUrl`
- `mesh-picker:turnTokenUrl`
- `mesh-picker:iceServers`
- `mesh-picker:room`

If endpoints are blank or unreachable, the app falls back to STUN-only.

## Version + commit on every screen

The bottom-right footer on every screen of the live app shows:

- `source` → this repo
- `tip ♥` → PayPal
- `vX.Y.Z · <short-sha>` — version from `package.json` plus the build-time git commit

## Build & deploy

GitHub Pages serves the committed `docs/` directory on the `main` branch. There is no GitHub Actions build workflow; local Husky-style hooks gate formatting / typecheck / smoke build before each push.

```bash
npm run smoke                                    # build + sanity-check docs/
bash ../mesh-common/scripts/screenshot-app.sh    # regenerate docs/screenshot.png
```

## Privacy

<!-- mesh:privacy-section:start -->

Everything you publish to a room is visible to every peer in that room. Your local device's name, key, and choices stay local. Cryptographic signatures prove **who** wrote each entry; they do **not** prevent peers from reading or copying entries. The room URL is the access control — share it deliberately.

See `docs/privacy.md` for the full threat model — capabilities used, what other peers in the mesh see, what the self-hosted infra sees, what stays local.

<!-- mesh:privacy-section:end -->

## License

MIT — see `LICENSE`.
