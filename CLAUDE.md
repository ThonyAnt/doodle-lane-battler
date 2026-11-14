# Doodle Lane Battler: project notes for Claude Code

Hackathon MVP. A one-lane battler where every unit is something the player draws. Ink is the price of a drawing and sets the unit's strength; a vision model only decides what kind of unit it is. See README.md for how to run it and the rules.

## Layout

- `index.html`: the whole client. The block between `/*SIM-START*/` and `/*SIM-END*/` is the pure match logic (stats, combat, bot, drawing fallback guess). Keep it free of DOM access.
- `server.js`: zero-dependency Node server (Node 18+). Serves the page, reads drawings via OpenAI (`POST /read`), and runs online rooms. It extracts and runs the SIM block from `index.html`, so rules exist in one place.
- `qrcode.js`: vendored QR library (MIT). Do not edit.
- `.env`: holds `OPENAI_API_KEY` (git-ignored). `.env.example` is the template.

## Doodle Duel (`/duel`)

- `duel.html`: live 2-player stickman fight with hand-drawn weapons and abilities. The block between `/*DUEL-START*/` and `/*DUEL-END*/` is the pure rules (item stats, physics, phases, bot). Keep it free of DOM access.
- `duel-server.js`: routes under `/duel/` (`read`, `room`, `events`, `act`), loaded by `server.js`. Server-authoritative at about 30 Hz over Server-Sent Events; clients send held buttons plus press counts with a sequence number. `GET /duel/events` with `&watch=1` joins as the big screen: it never takes a player's seat, and the only action it may send is `rematch`.
- Phases: draw (two items, 100 shared ink) -> count -> fight (60 s) -> end; first to 2 rounds. Item kinds: melee, ranged, bomb, shield, dash, heal. Tuning lives in `itemStats`.
- Animation: fighters are a keyframed skeleton in the style of `motion-review.html` (the owner's reference; Alan Becker / 火柴人联盟). Clips are data in `anim/*.js` registered with `ANIM.add`; `anim/core.js` samples them (spline interpolation, IK so limbs never stretch, body spin and somersault channels, painted slash trail) and `anim/README.md` is the authoring guide. Preview with `node tools/strip.js <clip> [frames] [out.png]` (needs Chrome) or open `/anim-lab.html`.
- Attacks are moves in the `MOVES` table inside the rules block (duration, hit or shot times, cancel time, next move). Each move has a clip of the same name whose marks must match; some have a `_b` alternate animation. The vision model returns a `style` for melee (blade, spear, hammer, fist) and ranged (bow, gun, staff, hurl) drawings; each style has its own move set and clip file. Melee styles chain a combo on repeated taps (for example blade1 -> blade2 -> blade3) with running, air and down+attack variants; ranged styles have a shot, quick follow-ups, an air shot and a charged shot. An empty slot fights with the fist set. `STYLE` holds per-style reach, damage and knockback multipliers. `node tools/check-anim.js` verifies clips against `MOVES`.
- Item stats: the reader returns `power`, `range`, `speed` (1 to 10) and two `traits`. `balanceStats` scales the three to a total of 15 (`STAT_BUDGET`), each 1 to 9, so only the proportions matter; `itemStats` turns them into multipliers (`LEAN`: power and speed are worth the same per point, so trading them does not change damage over time; range is paid for with damage). Ink still sets overall strength. Do not let the reader set the total.
- Traits live in `TRAITS` (which kinds may have each) and act in `hurt`, `projectiles` and `control`. `traitChoices` keeps the reader's two if they fit the kind and tops up from the rest.
- `validItem(reply, strokes)` never fails: an unknown kind is sorted by style, then by telling words (`KIND_HINTS`, `STYLE_HINTS`), then by the drawing's shape (`localGuess`), then defaults to melee.
- `S.tweak(side, slot, {kind, style, trait, tune})` changes a made item during the draw phase; online it is `POST /duel/act` with `type:"tweak"`. The sketchbook card (stats, trait choice, tuning, "Not right?") and the big screen's loadout panel both read `view.items`.
- Balance: `STYLE` damage numbers were tuned by a round-robin of the eight styles (equal stats, trait and ink; the bot plus steady button presses on both sides) until each won 46 to 54% overall. Individual pairings are still lopsided (spear beats fists, bow loses to staff). Quick follow-up shots have little or no stun so ranged weapons cannot stun-lock. Win rate in that simulation swings wildly on small damage changes (8% more damage wins about 85% of mirror matches), so it cannot judge stat leanings or the situational traits; those are balanced by construction, not measured.
- Input reliability: online clients resend their held buttons every 350 ms during a round, because one lost release request used to leave a fighter running; `releaseAll()` drops held directions when a round ends or the page loses focus. The drawing pad follows one pointer per stroke, lets a pencil take over from a touch, and ignores touches for 8 s after pencil use (palm rejection).
- The reader's image detail is `OPENAI_DETAIL` (default `high`). On 24 jittered stock doodles it named the intended kind for 17 at `high` and 15 at `low`, at about 0.9 s either way; `gpt-4.1` scored 16 and took 1.3 s. Many misses are fair readings of an ambiguous doodle, which is what "Not right?" is for.
- The arena canvas and item sprites are rendered at the display's pixel density.
- Bot-vs-bot simulation gives a median round of about 22 s; melee wins most often between bots. Not tested on real tablets.

## Online play

- `POST /room` creates a room with a 4-letter code. `GET /events?room=CODE&id=CLIENT` is a Server-Sent Events stream (`hello`, `players`, `state`, `pending`, `spawn`, `cancel`, `reset`, `gone`). `POST /act` takes `start`, `reset` and `send` (strokes plus a PNG of the pad).
- The server is authoritative: it owns ink, runs the sim at 20 Hz and broadcasts state at about 10 Hz. Clients send strokes; every client rebuilds unit sprites from those strokes.
- First client in a room is Blue (side 0), second is Red (side 1), later ones spectate. A client id in sessionStorage lets a player reload and keep their side.
- Rooms are in memory, so a deployment must be a single instance.

## Tuning numbers (all in the SIM block)

Base health 500, match 90 s, ink max 100, refill 6/s (12/s in the last 30 s), ink cost = stroke length / 28. Unit speed and health were raised/lowered once because the first version stalemated in about 90% of simulated matches. The bot's units are 15% weaker than their ink cost; that number is a guess.

## State when this file was written

- Tested: match rules by simulation; single-device modes and a full online match between two headless browsers, all against a stand-in for the OpenAI endpoint.
- Not tested: the real OpenAI API (accuracy and latency on doodles), real iPads and touch input, play over a slow network.
- The original default model `gpt-4.1-nano` was retired by OpenAI; the default is now `gpt-4.1-mini`, checked against the real API (about 1 s per drawing).

## Next steps the owner asked for

1. Make this folder a GitHub repo (`git init`, first commit, create `doodle-lane-battler` on GitHub, push). Confirm `.env` is ignored before the first commit.
2. Host it publicly so two players can join by QR code or room code from any network. Any host that runs a long-lived Node process works: start command `node server.js`, set `OPENAI_API_KEY` in the host's settings, single instance.
3. Run a real match with the OpenAI key and two tablets, then tune balance.

## Ideas discussed but not built

Mirroring the lane so each player sees their own base on the left, spells drawn directly onto the lane, more lanes, haptic patterns per element (the team has a haptic headband), and a round-based auto-duel mode on the same drawing pipeline.
