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

## InkShop: the merged game

On a computer, `/duel` is Alex's InkShop prototype (repo `al371160/hackprinceton-brainstorming-alex`) running on this game's engine. His interface, shape recogniser, hack table and effects are in the page as he wrote them; his mechanics run in this game's server-side rules, so they work for tablet rooms too.

- **The fight starts inside the paint program.** The arena is the art board of the InkShop window, with his three sketched ledges. His Fighters panel shows health, ink and overdrive; the AI Read Log shows what each drawing was read as.
- **Weapons before the round, quick shapes during it.** You still draw two weapons in the Sketchbook before each round (read by the vision model). During the fight you draw glyphs that take effect at once, read by his recogniser: a flat line is a platform, a steep line a wall, a box a crate, a circle around yourself a shield, a circle around the foe a trap, an arrow from yourself a dash, an arrow from the foe a fling, a zig-zag a lightning bolt, an X erases or disarms, and a weapon shape (sword, spear, hammer, bow) replaces the weapon in your hand. Drawing costs ink, which refills.
- **How to draw mid-fight.** With a mouse: pick his Pencil, Rectangle or Ellipse tool (B, R, O) and draw on the art board; the Fight tool (F) makes a click an attack. On a tablet: draw on the strip of the arena above the controller.
- **Hacks.** Dealing and taking damage fills Overdrive. At 100, Q runs the selected hack (1-5 pick): BREAKOUT, RECYCLE, TRANSFORM, POPUPSTORM, OVERCLOCK. Each shows a warning dialog first; the target cancels it by drawing the counter glyph shown, which stuns the hacker.
- **Ultimates.** A full Overdrive bar can go on your weapon's ultimate instead of a hack: press U (M or numpad 0 for a second player on the same keyboard, or the U button on a tablet, which shows its name). Each kind of weapon has its own: sword INK FLEET (copies of your drawing fan out overhead and fly in one after another), spear INK RAIN (copies dive from above), thrown weapon STAR RING (a ring of copies let go at once), staff METEOR (an orb drops where the other fighter was standing), hammer EARTHSHAKER (a leaping slam and a shock wave along the ground), fists HUNDRED HANDS (a lunge and a flurry), twin blades CROSS CUT (three blinks through the other fighter), bow SKY PIERCER (one huge arrow), gun BULLET STORM, twin pistols CROSSFIRE (shots to both sides). They all do the same damage if everything lands. Once an ultimate starts it always plays out: the caster can still be hurt, but not stopped.
- **An ultimate stops the fight.** From the moment it starts until its last piece lands, everything else is held: the other fighter hangs where they are (even in mid-air), shots hang in the air, the stage and the round clock wait, and nothing either player presses or draws counts. The stage goes dark, black bars close in, the ultimate's name crosses the screen with the drawing that powers it, and the held fighter turns grey. The blows then land one beat at a time; the last one flashes the screen, and when time starts again the total is stamped over the fighter who took it and they are sent flying. It cannot be dodged by reacting, only by not being where it lands (in the air above the hammer's wave, out of reach of the fists).
- **Move tester.** Open `/moves` to try every animation: pick a weapon, press a move or its ultimate, and watch it on a dummy that never dies. Slow it down, loop it, change the ink colour, or move the dummy closer.
- **Impact.** Heavy hits freeze the fight for a few frames and shake the screen. Only the ultimate flashes the stage, when its last blow lands: the picture is inverted and held for about half a second (two flashes). If your system is set to reduce motion, the flash is off and the shake is small.
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
- `anim/`: Doodle Duel animation clips (running, and a move set each for blade, spear, hammer, fists, twin blades, bow, gun, twin pistols, magic staff and thrown weapons) and the engine that plays them; see `anim/README.md`. `anim-lab.html` previews clips and `tools/strip.js` renders them to frame strips.
- `qrcode.js`: QR Code Generator by Kazuhiko Arase (MIT), used for the join code.

## Status

Online play is tested with two browsers on one machine and a stand-in for the OpenAI endpoint. Not yet tested: the real OpenAI API, real tablets, and play over a slow network. Doodle Duel is tested by simulation, a scripted two-client online match and a desktop browser; drawings were read by the real OpenAI API (`gpt-4.1-mini`, about 1 second each). Balance numbers and the bot's 15% handicap are first guesses.
