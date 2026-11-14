# Doodle Lane Battler

A one-lane battler where every unit is something you draw. Ink is the price: each stroke spends ink, and the ink you spend sets the unit's strength. A vision model decides what the drawing is (ground, flying or stationary; melee, ranged, area or no attack; fire, water, plant or none), never how strong it is.

Hackathon MVP with three ways to play: against a bot, two players on one screen, or online with each player on their own device.

## Doodle Duel (second game idea)

Open `/duel` on the same server for a live two-player stickman fight. Before each round both players draw two things (a sword, a bow, a bomb, a shield, wings, a snack) and share 100 ink between them; the vision model decides what each drawing does and the ink spent sets how strong it is. Then you fight live: move, double jump, and use your two drawings. First to 2 rounds wins. It has the same three ways to play (bot, one screen, online rooms with a QR code).

Every item gets three stats, shown as bars as soon as it is read: **power**, **range** and **speed**. The reader says how the thing you drew leans (a sledgehammer is all power, a dagger all speed) and the game scales those leanings to the same total for every item, so nothing is good at everything; ink sets the overall strength. Each item also has one **trait** (boomerang, hook, flurry, homing and so on): you are offered two that suit the drawing and pick one. You can trade speed for power with the two tuning buttons, and if the reader got it wrong, "Not right?" lets you say what it is in one tap. Anything can be drawn: a drawing the reader cannot place is sorted by its shape.

Big screen: choose Online, then "Use this as the big screen" on a laptop or projector. It shows a large join code and then the fight; the first two tablets or phones to scan it are Blue and Red, and they draw and play with the touch buttons.

Ways to play. **Player vs Bot** and **Player vs Player** make this device the screen of a room, and each player scans its code to use a phone or tablet as sketchbook and controller (in Player vs Bot the bot runs on the server as Red). **On this device: vs Bot, 2 players, Practice** needs no second device: the sketchbook and the fight are both on the computer, played with its keyboard (or the touch buttons on a tablet). Both are in the header and on the start screen.

Big screen: a room's screen is the device that pressed Player vs Bot or Player vs Player. It shows a large join code and then the fight; the first two tablets or phones to scan it are Blue and Red, and they draw and play with the touch buttons.

Keys: A/D move, W jump, S down, J and K use your two drawings. Tap a blade repeatedly for a 3-hit combo; attack while running, in the air, or holding down for other moves. Bows and guns keep firing as you tap, and down + attack is a charged shot. Draw two of the same weapon (twin swords, a pair of pistols) and the fighter holds one in each hand, striking or firing with alternate hands. Second player on one screen: arrows, with , and . to attack. Touch buttons appear under the arena on tablets.

### Arena customizations (prebuilt, not yet chosen by a model)

A weapon can carry one block that changes the stage for a few seconds when its holder lands the combo's last hit or a charged shot (bombs and dashes on a hit, shields and heals on use), at most once every 9 seconds: **gust** (wind across the stage), **moon** (light gravity), **night** (dark but for a light round each fighter, the holder's much bigger), **rain** (soaks anyone not under cover, puts out burns), **quake** (jolts that hop whoever is standing; jump them) and **shrink ring** (walls close in, then go back). Only one runs at a time; a new one replaces it. Everything it draws is in its holder's colour, a plate in the corner says whose weapon did it and how long is left, and a star at the hand shows when the block is ready. Try them on the move tester (`/moves`): "Arena block" puts one on the weapon, "Set off now" starts one.

## InkShop: the merged game

On a computer, `/duel` is Alex's InkShop prototype (repo `al371160/hackprinceton-brainstorming-alex`) running on this game's engine. His interface, shape recogniser, hack table and effects are in the page as he wrote them; his mechanics run in this game's server-side rules, so they work for tablet rooms too.

- **The fight starts inside the paint program.** The arena is the art board of the InkShop window, with his three sketched ledges. His Fighters panel shows health, ink and overdrive; the AI Read Log shows what each drawing was read as.
- **Weapons before the round, quick shapes during it.** You still draw two weapons in the Sketchbook before each round (read by the vision model). During the fight you draw glyphs that take effect at once, read by his recogniser: a flat line is a platform, a steep line a wall, a box a crate, a circle around yourself a shield, a circle around the foe a trap, an arrow from yourself a dash, an arrow from the foe a fling, a zig-zag a lightning bolt, an X erases or disarms, and a weapon shape (sword, spear, hammer, bow) replaces the weapon in your hand. Drawing costs ink, which refills.
- **How to draw mid-fight.** With a mouse: pick his Pencil, Rectangle or Ellipse tool (B, R, O) and draw on the art board; the Fight tool (F) makes a click an attack. On a tablet: draw on the strip of the arena above the controller.
- **Hacks.** Dealing and taking damage fills Overdrive. At 100, Q runs the selected hack (1-5 pick): BREAKOUT, RECYCLE, TRANSFORM, POPUPSTORM, OVERCLOCK. Each shows a warning dialog first; the target cancels it by drawing the counter glyph shown, which stuns the hacker.
- **Ultimates.** A full Overdrive bar can go on your weapon's ultimate instead of a hack: press U (M or numpad 0 for a second player on the same keyboard, or the U button on a tablet, which shows its name). Each kind of weapon has its own: sword INK FLEET (copies of your drawing fan out overhead and fly in one after another), spear INK RAIN (copies dive from above), thrown weapon STAR RING (a ring of copies let go at once), staff METEOR (an orb drops where the other fighter was standing), hammer EARTHSHAKER (a leaping slam and a shock wave along the ground), fists HUNDRED HANDS (a lunge and a flurry), twin blades CROSS CUT (three blinks through the other fighter), bow SKY PIERCER (one huge arrow), gun BULLET STORM, twin pistols CROSSFIRE (shots to both sides). They all do the same damage if everything lands. Once an ultimate starts it always plays out: the caster can still be hurt, but not stopped.
- **An ultimate stops the fight.** From the moment it starts until its last piece lands, everything else is held: the other fighter hangs where they are (even in mid-air), shots hang in the air, the stage and the round clock wait, and nothing either player presses or draws counts. The stage goes dark, black bars close in, the ultimate's name crosses the screen with the drawing that powers it, and the held fighter turns grey. The blows then land one beat at a time; the last one flashes the screen, a running total counts up over the fighter being hit, and when time starts again they are sent flying. It cannot be dodged by reacting, only by not being where it lands (in the air above the hammer's wave, out of reach of the fists).
- **Move tester.** Open `/moves` to try every animation: pick a weapon, press a move or its ultimate, and watch it on a dummy that never dies. Slow it down, loop it, change the ink colour, or move the dummy closer.
- **Impact.** Heavy hits freeze the fight for a few frames and shake the screen. Only the ultimate flashes the stage, when its last blow lands: an impact frame in pure black and white (white stage with black figures, then black with white, twice over 0.4 s) with a jagged star and force lines bursting from the hit, then a camera jolt. Each earlier blow pops a small star. On the retro desktop everything behind the fight blurs while an ultimate plays. If your system is set to reduce motion, the flash is off and the shake is small.
- **Getting out.** The art board's walls and floor can be mined: L swings the built-in pick, and S + L digs down. Two hits break a piece. Or run BREAKOUT.exe to open the whole board for 15 seconds. Outside, the desktop's window title bars are platforms.
- **The bot** is his animator.bot on top of this game's fighting bot: it draws glyphs with a ghost cursor, runs hacks, and counters yours. His CPU skill slider sets how good it is; Time scale slows a local match.
- Tablets and phones keep Benjamin's layout (with the draw strip and two new buttons, mine and hack); add `?plain=1` for the plain layout on a computer.

What comes from where is marked in the code: `inkshop.js`, `inkshop.css` and the `INK` block in `duel.html` hold his code between BEGIN/END verbatim markers. Not merged: his fighter movement, his pick-up weapon items, and cursor grabs.

**Springy movement.** The fighters' animations are authored clips; on top of them every joint is a small weight on a spring chasing the clip's pose (`anim/rig.js`, using the spring maths of his rig). The body lags and settles, a hit throws the joints about, and a dash leaves afterimages. It only changes how fighters are drawn, never who hits whom. On the InkShop desktop the Rig Properties sliders tune it: **Jelly** (how soft; 0 is the plain authored animation), **Stretch** (how far limbs may stretch), **Flab** (how loose the belly is), **Exaggerate** (bigger poses while moving about), **Onion skin** (afterimages all the time, not just during a dash) and **Show rig** (draws the springs). Settings are remembered per browser.

## Desktop overlay (experimental, Windows)

The fighters can play on top of your real desktop instead of in a browser tab. This needs two development dependencies (Electron, and koffi for reading window positions): run `npm install` once, then `npm run overlay`. If npm says it skipped install scripts and the overlay will not start, run `npm run overlay:setup` once to fetch the Electron runtime.

- The fight runs along the top edge of the taskbar, across the whole screen. Clicks pass through to whatever is underneath; only the menu and sketchbook cards take the mouse.
- **Esc** or **Ctrl+Alt+D** opens the menu (mode, restart, sketchbook, quit) and pauses. **Ctrl+Alt+Q** quits.
- The fight pauses whenever another app has the keyboard; press Ctrl+Alt+D to come back.
- **Draw here** (the default): vs bot, two players on one keyboard, or practice, with the sketchbook on the computer and a screen-wide arena.
- **Draw on tablets**: the overlay becomes the big screen of a new room. It shows the join code, two tablets or phones draw and play, and the fight runs on the desktop on the standard stage. The tablets must be able to reach this computer (same Wi-Fi, firewall allowing Node).
- **Your windows are the terrain.** The top edge of every visible, un-maximised window is a platform, marked with a thin yellow line. Drag a window and whoever is standing on it rides along; move it out from under them and they fall. A maximised window in front hides everything behind it, so restore a few windows to a smaller size to build a stage. Only window positions are read, never titles or contents.
- With **Draw on tablets**, the overlay sends that terrain to the room, so it works for tablet players too.

## Spreadsheet stage

Press **Stage** in the header (or open `/duel?stage=sheet`) to fight inside a banker's spreadsheet while he builds a valuation model. The cells he fills in are the platforms. He drags one across, pastes another, deletes a row, then loses his temper and deletes everything, and the `#REF!` errors rain down. Near the end he notices the two of you and comes after you with the cursor: get out of the selection before he presses Delete. It is the same minute every round, so you can learn it. A room made from that page uses the stage for everyone in it.

## Replays

- **Every knockout is shown again.** When a round ends, the last second before the knockout plays back at a third of the speed under a REPLAY banner, then the next round's drawing begins as usual. The knockout that wins the match is not replayed: the champion screen comes straight up. Add `?ko=0` to the address to switch the replays off (`/duel?ko=0`).
- **Any room's match can be watched again.** Open `/duel?replay=CODE` with the room's four letters, for example `/duel?replay=ABCD`. The page plays the match back from the room's recording: play and pause, 0.25×, 1× and 4× speed, and a bar to drag to any moment (with the bar selected, the arrow keys step one tick at a time). While a match is on, the link shows it up to the moment you opened it. After a rematch it shows the match that just ended until the new one has started. A recording is kept for 30 minutes after its match is replaced or its room closes, and the server keeps at most 50 of them. A replay made by a different version of the game is refused, since it would play out differently.
- **The balance bench can be repeated exactly.** `node tools/balance.js quick --seed=7` plays the same rounds every time, so two versions or settings can be compared on identical matches; see the notes at the top of `tools/balance.js`.

A match is exactly repeatable because all its randomness comes from one seed and every command it is given is logged with the tick it arrived on; `node tools/test-replay.js` checks that.

## RuleForge: rules written for the items in play

In Doodle Duel, once both players have an item, the server asks a language model for up to three small rules about how those particular items meet: a tennis racket swats a ball straight back, a torch melts the ice cream. Each rule is a short program in ForgeScript, a tiny language of our own (`forgescript.js`) that the game parses, checks and interprets itself, so nothing the model writes is ever run as JavaScript. Before a rule goes into the match it is tried in staged test fights and in twenty seconds of bot against bot. One that breaks, or never triggers, is sent back to the model once with its errors; if it still fails, a built-in rule takes its place.

The big screen shows the result in a `FORGE.EXE` window: each rule's name, what it does, the two items, its code, and a tick per check passed. In the fight, a rule's shout pops up over the fighter when it triggers. If the model is slow, the countdown waits for it, four seconds at most, and then the round starts with built-in rules.

- **Model:** `OPENAI_FORGE_MODEL` (defaults to `OPENAI_MODEL`). Without a key the built-in rules are used.
- **Off switch:** `FORGE=0` in the environment or `.env` turns it off on the server. `?forge=0` in the page address turns it off for matches played in that page and for rooms made from it.
- **Cache:** rules the model wrote are kept in `forge-cache.json` (git-ignored; `FORGE_CACHE` names another file, or none if it is empty), so the same items need no model the next time. Rules read back from the file are proven again before they are used.
- **Warm it before a demo:** `node tools/forge-warm.js` (needs the key) forges every pair of the ready-made items, 196 pairs, so a demo played with ready-made items needs no network for its rules. It covers the items as they come: no ink colour, first trait, no tuning. `--els=none,fire,water,plant` covers the colours too; `--jobs=8` runs more at once.
- **Try it against the real model:** `node tools/forge-live.js` forges five sets of items and prints every rule with its code, where it came from (`ai`, `repaired` or `built-in`), how long it took and what the verifier objected to. `--raw` adds the model's replies.
- **Try it without a key:** `node tools/fake-openai.js` starts a stand-in model that always writes the same two rules. Start the game with `OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:3192 FORGE_CACHE= node server.js`; the empty `FORGE_CACHE` keeps the stand-in's rules out of the cache file.
- **Tests:** `node tools/test-forge.js` covers the language, the rule engine, the verifier, the pipeline and the server (child servers on port 3191, with the stand-in).

What a rule can do is small, and the match clamps it whatever the code asks for (`FORGE_API` and `FORGE_LIMITS` in `duel.html`): four events (`swat`, `guard`, `strike`, `near`), effects such as `shot.reflect`, `hit.scale`, `push`, `burn` and `heal`, and at most 24 health healed or hurt per rule per round.

Tried with real models, but not yet with the one the game uses: two language models (a small and a mid-sized one) were each given the exact prompt for eight sets of items and answered from the prompt alone. All 48 rules they wrote passed every check, and their replies are kept in `tools/fixtures/forge-models/` (`node tools/test-forge-models.js`). The OpenAI model the server asks by default has not been tried: `node tools/forge-live.js` does that with your key.

## Trained CPU (optional)

Beside the hand-written bot there is a second CPU that learned to fight by playing: a small neural network (28 numbers in, two hidden layers, 8 buttons out, 1,232 weights) improved by an evolution strategy over about 2.3 million rounds of the real rules (after an earlier run of about four million, before the weapons were re-balanced) against a league (the hand-written bot at three skills, three scripted players, and earlier versions of itself).

- **Use it:** when `bot-weights.json` sits next to `server.js`, the menu shows a `CPU: classic / trained` switch for Player vs Bot rooms. The classic bot is always the default. `POST /duel/room?bot=1&brain=net` asks for it directly.
- **Measured (400 fresh rounds each, same random loadout both sides):** it beats the hand-written bot at skill 0.55 in 65% of rounds, and the scripted masher, jumper and kiter in 92%, 97% and 98%. That is the best of many checkpoints, which flatters: the newest one scored 58% against the hand-written bot.
- **How it plays:** it walks in and attacks with both items, about 11 presses a second in all (it is held to 6 presses a second per attack button and 3 jumps). It has learned not to jump at all, does not draw, and has only been watched for a few rounds; nobody has played a full match against it.
- **Train:** `node bot/train.js --hours=0.5 --workers=8 --out=bot/checkpoints` (resumable; about 2,500 rounds a second on this laptop, so half an hour is plenty: the win rate stopped rising after about 1,000 generations).
- **Judge and save:** `node bot/eval.js bot/checkpoints --n=400 --save=bot-weights.json`. Weights only suit the rules they were trained in; the server warns when `duel.html` has changed since.

## Netcode: a WebSocket link (off by default)

A room is reached the way it always was unless the page address says otherwise: the match's state comes down a Server-Sent Events stream as JSON, about 60 times a second in a fight, and every change of buttons goes up as a request of its own, one at a time. Add `?net=ws` to the address (`/duel?net=ws`) and the page uses one WebSocket for both.

- **Down:** every event the event stream carries, unchanged, and the state as small binary frames that hold only what changed since the last state the device said it has. In a recorded fight between two bots that is about 5% of the JSON (1,807 bytes a snapshot against 77).
- **Up:** a button goes the moment it changes, with no request to wait behind. Buttons are still sent again every 150 ms during a round, and the server still lets go of a direction it has not heard about for 0.9 s.
- **Fallback:** if the socket has not opened within 1.5 s, or closes, or falls silent for four seconds, the page goes over to the event stream and plays on in the same seat. `?net=ws-only` never falls back and keeps trying the socket (for tests). Start the server with `NOWS=1` to leave the socket off and watch the fallback happen.
- **The big screen passes it on:** a screen opened with `?net=ws` puts it in the join link and the QR code, so the tablets that scan it use the socket too.
- **Seeing which link is in use:** the desktop layout's status bar shows `ws` or `sse`, the round trip, the jitter and the kB/s arriving. On a tablet with `?net=` in its address the "You are Blue" badge says it.
- **No library:** `ws.js` is the WebSocket, written from RFC 6455 (frames, handshake, ping and pong, close); `wire.js` is the packing and the deltas, loaded by the server and the page.
- **Tests:** `node tools/test-net.js` (starts a server on port 3195): the frame codec, sockets, packing and deltas, rooms over a socket beside the event stream, the page's link code against the real server (including a network that swallows the upgrade), Node's own WebSocket as an independent client, and the page's whole script in a pretend browser, joining a room and pressing keys on each link.
- **Bench:** `node tools/net-bench.js --delay=30 --jitter=20` plays a room against the bot on each link through a relay that holds every packet back by 30 ms plus up to 20 ms, presses a direction 200 times and prints, for each link, the median and 95th-percentile time from the press to the first state that shows the fighter moving, and the bytes a second received. It sends its buttons as the page does, repeat included (`--repeat=0` leaves the repeat out).

Measured on one laptop, server and devices on the same machine, 200 presses a link:

| Relay | Link | Median press to movement | 95th percentile | Bytes a second received |
|---|---|---|---|---|
| 30 ms + up to 20 ms each way | event stream | 105.8 ms | 175.1 ms | 72,947 |
| 30 ms + up to 20 ms each way | socket | 92.4 ms | 110.1 ms | 3,789 (5.2%) |
| none | event stream | 11.2 ms | 21.0 ms | 89,893 |
| none | socket | 10.7 ms | 19.6 ms | 4,252 (4.7%) |

The socket's gain in time is the wait it removes: on the event stream a press made while the last request is still in the air has to wait for it to come back, which on a slow network is most of the time because of the 150 ms repeat. That shows in the 95th percentile more than in the median. With the repeat left out (`--repeat=0`, 100 presses, same relay) the two links are level: 92.3 against 90.4 ms, 95th percentile 110.2 against 105.2. With no delay they are the same within the noise. Presses during which the bot hit the fighter were thrown away (60 and 73 of them with the delay, 6 and 4 without), and the relay delays whole chunks, not single packets: read the numbers as a comparison of the two links, not as what a venue's Wi-Fi will do.

Not yet tried: a real browser. This was written and tested without one. The nearest it has come is Node's own `WebSocket` (written by others to the standard browsers follow), which the tests use against this server, with the page's script running in a pretend browser; `EventSource` there is a stand-in. Also untried: real tablets, a real network, a tablet that sleeps and wakes, and Render's proxy (if it does not pass the upgrade, the page should fall back within 1.5 s). States are drawn as they arrive, as before; there is no smoothing buffer.

## Run

Needs Node 18 or newer. No dependencies.

1. Copy `.env.example` to `.env` and put your OpenAI API key after `OPENAI_API_KEY=`.
2. `node server.js`
3. Open http://localhost:3000

Without a key the game still runs; drawings are read by a rough local guess from ink colour and shape.

## Two players on two devices

1. On the first device choose **Online**, then **Create a room**. You get a 4-letter code, a join link and a QR code.
2. On the second device scan the QR code, open the link, or choose **Online** and type the code.
3. The clock starts when the first unit is sent. A third device that joins the same room watches.

The server runs the match; each device only draws and displays, so both players always see the same lane.

**Same Wi-Fi (simplest for a demo):** run `node server.js` on a laptop. When you open the game at `localhost`, the QR code points at the laptop's network address so other devices can reach it. Allow Node through the firewall if your system asks. Some event and campus networks block devices from talking to each other; a phone hotspot avoids that.

**Public link:** deploy this folder to any host that runs a long-lived Node process (start command `node server.js`, set `OPENAI_API_KEY` in the host's environment settings, and the host supplies `PORT`). The QR code then uses the public address. Rooms live in memory, so run a single instance.

## Settings (`.env`)

| Variable | Default | What it does |
|---|---|---|
| `OPENAI_API_KEY` | none | Key used by the server to read drawings |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Vision model that classifies the drawing |
| `PORT` | `3000` | Port the server listens on |
| `OPENAI_FORGE_MODEL` | `OPENAI_MODEL` | Model that writes the match rules (RuleForge) |
| `FORGE` | on | `0` switches RuleForge off |
| `FORGE_CACHE` | `forge-cache.json` | File the model's rules are kept in; empty for none |
| `NOWS` | off | `1` leaves the WebSocket off (pages with `?net=ws` then fall back to the event stream) |

## Rules

- Fire beats plant, plant beats water, water beats fire (1.5x damage).
- Flying units cannot be hit by ground melee; ranged and area attacks reach them.
- Stationary drawings hold a spot in front of your base and are tougher.
- Ink refills twice as fast in the last 30 seconds. Most base health at 0:00 wins; if tied, the side that pushed further down the lane wins.

## Files

- `index.html`: the whole game (simulation, bot, drawing pads, rendering).
- `server.js`: serves the page, reads drawings with OpenAI (the key never reaches the browser), and runs online rooms. It loads the match rules from the marked block in `index.html`, so there is one copy of the rules.
- `duel.html` and `duel-server.js`: Doodle Duel. Same pattern: the rules sit in a marked block in `duel.html` and the server runs that block for online rooms.
- `forgescript.js`, `forge.js`: RuleForge. The first is the rule language (parser, checker, interpreter), used by the server and the page; the second asks the model, proves each rule and holds the built-in ones. `tools/test-forge.js` tests both, `tools/fake-openai.js` stands in for the model, `tools/forge-warm.js` and `tools/forge-live.js` need the key.
- `ws.js`, `wire.js`: the WebSocket link for Doodle Duel rooms (`?net=ws`). The first is the WebSocket itself, the second packs the state into binary frames and deltas; `tools/test-net.js` tests both and `tools/net-bench.js` measures the two links.
- `anim/`: Doodle Duel animation clips (running, and a move set each for blade, spear, hammer, fists, twin blades, bow, gun, twin pistols, magic staff and thrown weapons) and the engine that plays them; see `anim/README.md`. `anim-lab.html` previews clips and `tools/strip.js` renders them to frame strips.
- `qrcode.js`: QR Code Generator by Kazuhiko Arase (MIT), used for the join code.

## Status

Online play is tested with two browsers on one machine and a stand-in for the OpenAI endpoint. Not yet tested: the real OpenAI API, real tablets, and play over a slow network. Doodle Duel is tested by simulation, a scripted two-client online match and a desktop browser; drawings were read by the real OpenAI API (`gpt-4.1-mini`, about 1 second each). Balance numbers and the bot's 15% handicap are first guesses. RuleForge is tested against a stand-in for the model only, and its window and call-outs have not been looked at in a browser.
