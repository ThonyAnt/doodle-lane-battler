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
- Desktop overlay: `overlay/main.js` (Electron, a dev dependency; `npm run overlay`) opens a transparent, always-on-top, click-through window over the work area and loads `/duel?desk=1`. In that mode (`DESK` in `duel.html`, body class `deskmode`) the page is transparent, one game unit is a fixed number of screen pixels, the arena is as wide as the screen with no platforms (`createDuel({width,plats})`), health shows above heads, and the page tells the app via `window.overlayHost` when to take the mouse. `electron overlay/main.js --selftest=out.png` renders a frame off-screen. Window terrain: `overlay/windows.js` (koffi, Windows only, read-only) lists other apps' windows front to back and computes the visible parts of their top edges; `main.js` polls it every 100 ms and sends changes to the page, which converts them to platforms (`deskTerrain`) and calls `sim.setPlats`, or posts `{type:"plats"}` to the room when it is the big screen (only a watcher may; the server rebroadcasts a `plats` event). `setPlats` carries a fighter standing on a platform whose `id` persists. The header toggle "Draw here / Draw on tablets" (`drawHere`, `drawTablets`) switches any device between the ordinary game and being the big screen of a new room; in the overlay an online room uses the standard 960 stage scaled to the screen. The server itself still has no dependencies.
- InkShop merge (Alex's prototype, repo `al371160/hackprinceton-brainstorming-alex`, file `prototype/inkshop-duel.html`; our codebase is the base). On a wide fine-pointer screen (`RETRO`, off with `?plain=1`) the page is his InkShop desktop. His code is copied unchanged between `BEGIN verbatim` / `END verbatim` markers in three places: the `INK` block in the rules (geometry helpers, glyph templates `T`, `recognize`, `HACKS`), `inkshop.js` (effects, drawing helpers, tools, menus, `buildUI`) and `inkshop.css` (nested under `#inkos`); his markup is in `duel.html` inside `#inkos`. Do not edit inside the markers; re-copy from his file instead.
- Adapted from his code into the server-run rules (`createDuel`, section "InkShop world"): `S.stroke` -> grouping -> `recognize` -> `applyGlyph` (platform, wall, crate, block, shield, trap, arrow dash/fling/wind/link, erase, lightning, mid-fight weapon `forge`), `startHack` / `counterHack` / `execHack` / `patchCanvas`, `stepBody` props, `impact` slam damage. Drawn things keep his convention ({x,y}, y DOWN, floor at 0); fighters use ours (height above floor). New: the art board (`BOARD`, `boardCells`, `S.setLayout`), the mining move (`mine`, `mineHit`, key L), mid-fight `ink2` and `od` meters, inputs `m`, `q`, `h`. Shapes reach clients once as `obj` events with strokes; snapshots carry only ids and positions.
- The bot (`makeBot`) is our fighting logic plus his `AI.decide` / `onHack` / `Drawer` adapted (ghost cursor, glyphs, hacks, counters). Server acts added: `stroke` (players), `layout` (big screen only). `node tools/test-world.js` tests the world rules.
- Not merged: his fighter movement and spring rig (the owner wants to combine the rig with our clips later), pick-up weapon items, cursor grab.
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
