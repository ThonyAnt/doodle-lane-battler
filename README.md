# Doodle Lane Battler

A one-lane battler where every unit is something you draw. Ink is the price: each stroke spends ink, and the ink you spend sets the unit's strength. A vision model decides what the drawing is (ground, flying or stationary; melee, ranged, area or no attack; fire, water, plant or none), never how strong it is.

Hackathon MVP with three ways to play: against a bot, two players on one screen, or online with each player on their own device.

## Doodle Duel (second game idea)

Open `/duel` on the same server for a live two-player stickman fight. Before each round both players draw two things (a sword, a bow, a bomb, a shield, wings, a snack) and share 100 ink between them; the vision model decides what each drawing does and the ink spent sets how strong it is. Then you fight live: move, double jump, and use your two drawings. First to 2 rounds wins. It has the same three ways to play (bot, one screen, online rooms with a QR code).

Big screen: press **Draw on tablets** in the header (or choose Online, then "Use this as the big screen") on a laptop or projector. **Draw here** switches back to drawing and playing on that device. It shows a large join code and then the fight; the first two tablets or phones to scan it are Blue and Red, and they draw and play with the touch buttons.

Keys: A/D move, W jump, S down, J and K use your two drawings. Tap a blade repeatedly for a 3-hit combo; attack while running, in the air, or holding down for other moves. Bows and guns keep firing as you tap, and down + attack is a charged shot. Second player on one screen: arrows, with , and . to attack. Touch buttons appear under the arena on tablets.

## Retro desktop stage

On a computer, `/duel` is staged on a pretend old desktop, after Alex's InkShop prototype. The menus, the sketchbook, the health bars, a log of what the vision model read and a notes file are draggable windows; the fighters run along the taskbar and the windows' title bars are the platforms. Drag a window and whoever is standing on it rides along; minimise it and they fall. **Esc** or the **Start** button opens the menu mid-fight. With **Draw on tablets** this desktop is the big screen, and its window layout is the room's terrain. Tablets and phones keep the plain layout; add `?plain=1` to get it on a computer.

The fighters use the InkShop figure (curved limbs, solid head) and its translucent weapon smear, with this game's authored attack animations.

## Desktop overlay (experimental, Windows)

The fighters can play on top of your real desktop instead of in a browser tab. This needs two development dependencies (Electron, and koffi for reading window positions): run `npm install` once, then `npm run overlay`. If npm says it skipped install scripts and the overlay will not start, run `npm run overlay:setup` once to fetch the Electron runtime.

- The fight runs along the top edge of the taskbar, across the whole screen. Clicks pass through to whatever is underneath; only the menu and sketchbook cards take the mouse.
- **Esc** or **Ctrl+Alt+D** opens the menu (mode, restart, sketchbook, quit) and pauses. **Ctrl+Alt+Q** quits.
- The fight pauses whenever another app has the keyboard; press Ctrl+Alt+D to come back.
- **Draw here** (the default): vs bot, two players on one keyboard, or practice, with the sketchbook on the computer and a screen-wide arena.
- **Draw on tablets**: the overlay becomes the big screen of a new room. It shows the join code, two tablets or phones draw and play, and the fight runs on the desktop on the standard stage. The tablets must be able to reach this computer (same Wi-Fi, firewall allowing Node).
- **Your windows are the terrain.** The top edge of every visible, un-maximised window is a platform, marked with a thin yellow line. Drag a window and whoever is standing on it rides along; move it out from under them and they fall. A maximised window in front hides everything behind it, so restore a few windows to a smaller size to build a stage. Only window positions are read, never titles or contents.
- With **Draw on tablets**, the overlay sends that terrain to the room, so it works for tablet players too.

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

## Rules

- Fire beats plant, plant beats water, water beats fire (1.5x damage).
- Flying units cannot be hit by ground melee; ranged and area attacks reach them.
- Stationary drawings hold a spot in front of your base and are tougher.
- Ink refills twice as fast in the last 30 seconds. Most base health at 0:00 wins; if tied, the side that pushed further down the lane wins.

## Files

- `index.html`: the whole game (simulation, bot, drawing pads, rendering).
- `server.js`: serves the page, reads drawings with OpenAI (the key never reaches the browser), and runs online rooms. It loads the match rules from the marked block in `index.html`, so there is one copy of the rules.
- `duel.html` and `duel-server.js`: Doodle Duel. Same pattern: the rules sit in a marked block in `duel.html` and the server runs that block for online rooms.
- `anim/`: Doodle Duel animation clips (running, and a move set each for blade, spear, hammer, fists, bow, gun, magic staff and thrown weapons) and the engine that plays them; see `anim/README.md`. `anim-lab.html` previews clips and `tools/strip.js` renders them to frame strips.
- `qrcode.js`: QR Code Generator by Kazuhiko Arase (MIT), used for the join code.

## Status

Online play is tested with two browsers on one machine and a stand-in for the OpenAI endpoint. Not yet tested: the real OpenAI API, real tablets, and play over a slow network. Doodle Duel is tested by simulation, a scripted two-client online match and a desktop browser; drawings were read by the real OpenAI API (`gpt-4.1-mini`, about 1 second each). Balance numbers and the bot's 15% handicap are first guesses.
