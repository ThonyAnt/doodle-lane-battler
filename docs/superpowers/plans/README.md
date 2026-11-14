# Overnight branches: plans

Five independent plans, each for its own branch cut from `origin/main` at `4df868c`. Each is written test-first: every task starts with failing tests, then the code, then a commit.

| Plan | Branch | Port | What it adds | Main risk |
| --- | --- | --- | --- | --- |
| [RuleForge](2026-11-14-rule-forge.md) | `forge-rules` | 3111 | The AI writes code for how the drawn items interact; we parse, check, test and hot-load it | Only a stand-in model is tested; real output quality unknown |
| [Netcode](2026-11-14-netcode-ws.md) | `netcode-ws` | 3112 | WebSocket server from the RFC, binary state deltas, jitter buffer | Venue or host proxies blocking WebSockets (falls back) |
| [Replays](2026-11-14-replay-determinism.md) | `replay-determinism` | 3113 | Seeded, exactly repeatable matches; knockout slow-motion; replay viewer; paired balance bench | Hidden state that does not replay |
| [Trained CPU](2026-11-14-learned-bot.md) | `learned-bot` | 3114 | A neural-network opponent trained by self-play all night | May not beat the hand-written bot, or may win in a boring way |
| [Sketch net](2026-11-14-sketch-net.md) | `sketch-net` | 3115 | Our own doodle classifier, instant and offline | Needs a 320 MB download; accuracy on tablet drawings unknown |

## Shared rules

- One worktree and one branch per plan. Nobody touches `/Users/benliu/HackPrinceton` or `main`.
- Commit after every task. Do not push.
- Each feature is on by default in its branch and has an off switch, so it can be merged and still turned off.
- The stand-in ports for child test servers are 3191 to 3195, one per plan, so the sessions do not collide. Port 3100 is the copy the team plays on.
- The laptop must be on its charger and kept awake.

## Where they overlap

| Area | Plans touching it | How the plans keep apart |
| --- | --- | --- |
| `hurt()` and the projectile loop in the DUEL block | RuleForge, Replays | Replays changes two `Math.random` calls; RuleForge adds hook calls |
| `sse` / `broadcast` in `duel-server.js` | RuleForge, Netcode | Netcode carries every named event unchanged, so RuleForge's new `forge` event needs nothing |
| `accept()` in the page | Netcode, Replays | each appends one line and keeps its own buffer |
| `makeBot` | Replays (seed), Trained CPU (new function beside it) | different lines |
| `localGuess` callers | Sketch net only | |

Suggested merge order, smallest footprint in shared code first: Replays, RuleForge, Netcode, Trained CPU, Sketch net.

## Considered and left out

- **Rollback netcode with client-side prediction:** needs exact replay first (the Replays plan), and only helps when the screen you watch is the device you press on, which is not the big-screen demo setup.
- **Drawing geometry sets the stat split (mass, moment of inertia, reach):** sound and safe, but a smaller step up in complexity than the five above.
- **Live AI commentator:** fun, but mostly a wrapper around a model call.
