# Doodle Duel

A two-player stickman fight where every weapon is something you draw. A vision model decides what the drawing is; the ink you spend sets how strong it is, and a creative drawing earns special abilities.

Hackathon MVP. The repo is still named after the first game, a one-lane battler, which has been removed; the address `/` now goes straight to the duel.

## The game

Open `/duel` on the same server for a live two-player stickman fight. Before each round both players draw two things (a sword, a bow, a bomb, a shield, wings, a snack) and share 100 ink between them; the vision model decides what each drawing does and the ink spent sets how strong it is. Then you fight live: move, double jump, and use your two drawings. First to 2 rounds wins. It has the same three ways to play (bot, one screen, online rooms with a QR code).

**Specials (new, untuned).** A drawing can also carry one or two "special" behaviours from a fixed list, switched on under **Special** on its card (or in the move tester at `/moves`): Lifesteal (hits send green healing orbs back to you), Glide (you float down under a canopy), Extra jump, Dash on hit (a hit zips you behind the enemy), Armour (the first hit you take mid-attack bounces off an ink shell), Combo growth (the weapon swells with every hit in a row) and Rage (faster when your health is low). Each costs points out of 10, so a weapon holds one big one, or a big and a small one. Each shows on screen when it happens. The model that scores a drawing now picks them and scripts them as the drawing's abilities (see Abilities below); the move tester still lets you switch them on by hand.

Every item gets three stats, shown as bars as soon as it is read: **power**, **range** and **speed**. The reader says how the thing you drew leans (a sledgehammer is all power, a dagger all speed) and the game scales those leanings to the same total for every item, so nothing is good at everything; ink sets the overall strength. Each item also has one **trait** (boomerang, hook, flurry, homing and so on): you are offered two that suit the drawing and pick one. You can trade speed for power with the two tuning buttons, and if the reader got it wrong, "Not right?" lets you say what it is in one tap. Anything can be drawn: a drawing the reader cannot place is sorted by its shape.

Big screen: choose Online, then "Use this as the big screen" on a laptop or projector. It shows a large join code and then the fight; the first two tablets or phones to scan it are Blue and Red, and they draw and play with the touch buttons.

Ways to play. **Player vs Bot** and **Player vs Player** make this device the screen of a room, and each player scans its code to use a phone or tablet as sketchbook and controller (in Player vs Bot the bot runs on the server as Red). **On this device: vs Bot, 2 players, Practice** needs no second device: the sketchbook and the fight are both on the computer, played with its keyboard (or the touch buttons on a tablet). Both are in the header and on the start screen.

Big screen: a room's screen is the device that pressed Player vs Bot or Player vs Player. It shows a large join code and then the fight; the first two tablets or phones to scan it are Blue and Red, and they draw and play with the touch buttons.

Keys: A/D move, W jump, S down, J and K use your two drawings. Tap a blade repeatedly for a 3-hit combo; attack while running, in the air, or holding down for other moves. Bows and guns keep firing as you tap, and down + attack is a charged shot. Draw two of the same weapon (twin swords, a pair of pistols) and the fighter holds one in each hand, striking or firing with alternate hands. Second player on one screen: arrows, with , and . to attack. Touch buttons appear under the arena on tablets.

### Arena customizations (blocks an ability can use)

A weapon can carry one block that changes the stage for a few seconds when its holder lands the combo's last hit or a charged shot (bombs and dashes on a hit, shields and heals on use), at most once every 9 seconds: **gust** (wind across the stage), **moon** (light gravity), **night** (dark but for a light round each fighter, the holder's much bigger), **rain** (soaks anyone not under cover, puts out burns), **quake** (jolts that hop whoever is standing; jump them) and **shrink ring** (walls close in, then go back). Only one runs at a time; a new one replaces it. Everything it draws is in its holder's colour, a plate in the corner says whose weapon did it and how long is left, and a star at the hand shows when the block is ready. Try them on the move tester (`/moves`): "Arena block" puts one on the weapon, "Set off now" starts one.

## InkShop: the merged game

On a computer, `/duel` is Alex's InkShop prototype (repo `al371160/hackprinceton-brainstorming-alex`) running on this game's engine. His interface, shape recogniser, hack table and effects are in the page as he wrote them; his mechanics run in this game's server-side rules, so they work for tablet rooms too.

- **The fight starts inside the paint program.** The arena is the art board of the InkShop window, with his three sketched ledges. His Fighters panel shows health, ink and overdrive; the AI Read Log shows what each drawing was read as.
- **Weapons before the round, quick shapes during it.** You still draw two weapons in the Sketchbook before each round (read by the vision model). During the fight you draw glyphs that take effect at once, read by his recogniser: a flat line is a platform, a steep line a wall, a box a crate, a circle around yourself a shield, a circle around the foe a trap, an arrow from yourself a dash, an arrow from the foe a fling, a zig-zag a lightning bolt, an X erases or disarms, and a weapon shape (sword, spear, hammer, bow) replaces the weapon in your hand. Drawing costs ink, which refills.
- **How to draw mid-fight.** With a mouse: pick his Pencil, Rectangle or Ellipse tool (B, R, O) and draw on the art board; the Fight tool (F) makes a click an attack. On a tablet: draw on the strip of the arena above the controller.
- **Hacks.** Dealing and taking damage fills Overdrive. At 100, Q runs the selected hack (1-5 pick): BREAKOUT, RECYCLE, TRANSFORM, POPUPSTORM, OVERCLOCK. Each shows a warning dialog first; the target cancels it by drawing the counter glyph shown, which stuns the hacker.
- **Ultimates.** A full Overdrive bar can go on your weapon's ultimate instead of a hack: press U (M or numpad 0 for a second player on the same keyboard, or the U button on a tablet, which shows its name). Each kind of weapon has its own: sword INK FLEET (copies of your drawing fan out overhead and fly in one after another), spear INK RAIN (copies dive from above), thrown weapon STAR RING (a ring of copies let go at once), staff METEOR (an orb drops where the other fighter was standing), hammer EARTHSHAKER (a leaping slam and a shock wave along the ground), fists HUNDRED HANDS (a lunge and a flurry), twin blades CROSS CUT (three blinks through the other fighter), bow SKY PIERCER (one huge arrow), gun BULLET STORM, twin pistols CROSSFIRE (shots to both sides). They all do the same damage if everything lands. Once an ultimate starts it always plays out: the caster can still be hurt, but not stopped.
- **An ultimate stops the fight.** From the moment it starts until its last piece lands, everything else is held: the other fighter hangs where they are (even in mid-air), shots hang in the air, the stage and the round clock wait, and nothing either player presses or draws counts. The stage goes dark, black bars close in, the ultimate's name crosses the screen with the drawing that powers it, and the held fighter turns grey. The blows then land one beat at a time; the last one flashes the screen, a running total counts up over the fighter being hit, and when time starts again they are sent flying. It cannot be dodged by reacting, only by not being where it lands (in the air above the hammer's wave, out of reach of the fists).
- **Customizations.** A weapon can carry up to three special blocks out of 59, worth at most 10 points together: things it does for its holder (lifesteal with healing orbs, glide, armour), to the other fighter (shrink, tether, swap places), to its own shots and swings (split, ricochet, echo), things it leaves behind (fire, mines, walls), creatures made of your drawing (a pet, a turret, orbiters), stage effects (wind, night, a closing ring), transformations (two forms, giant), and triggers and costs that say when a power fires and what it spends. Every one shows on screen. Pick them under "Special" on a weapon's card, or try any mix on the move tester.
- **Special presets.** Twelve ready-made weapons that come with their own powers, for when you would rather not draw: a Vampire Fang that heals you with every hit, an Umbrella you can glide under, a Chainsaw that overheats and leaves fire, a Cat that brings a pet, and eight more. They are listed first under the ready-made items in the sketchbook.
- **Move tester.** Open `/moves` to try every animation: pick a weapon, press a move or its ultimate, and watch it on a dummy that never dies. Slow it down, loop it, change the ink colour, or move the dummy closer.
- **Weapon customizations: what a hit does to its target.** A weapon can carry up to two prebuilt blocks that leave something visible on whoever it hits, drawn in the colour of the weapon's owner: Shrink, Float (a balloon, low gravity), Slippery (a puddle, feet slide), Mirror (left and right swapped), Tether (a line that holds and tows them), Mark (the next hit is half again as big) and Swap (the two trade places). Each has a point cost for a later budget. None can be re-applied until a short rest after it ends, an ultimate never carries one, and a blocked hit applies none. Nothing chooses them in a match yet; try them on `/moves` in the "On hit" row.
- **Triggers (blocks an ability can use).** A weapon can carry a trigger: a condition that, when met, makes its next hit an empowered one (more damage and knock-back, a star burst in the attacker's colour and the trigger's name). Each shows itself building and armed: Third strike (pips over the head, then the weapon glows gold), Charge (stand still about a second: a ring fills round the weapon hand), Airborne (the weapon trails while its holder is off the ground), Last stand (flames round a fighter below a third of health), Counter (a shrinking ring after being hit or blocking), Full ink (a gauge by the hand, then ink drops circling; each empowered hit spends ink), First blood (a drop over the head until anyone lands the round's first hit). Try them on `/moves`: the Trigger row puts one on the weapon under test.
- **Attack shapes (in progress).** Weapons can carry a customization that changes how their shots or swings travel: shots that split in three, corkscrew, hang in the air at the end of their range, ricochet, or swell as they fly; swings that leave a ghost which strikes again, or finishers that send a wave along the ground. For now they can only be switched on in the move tester (the Shape row); the game does not hand them out yet.
- **Left behind (not yet in matches).** A weapon can carry a customization that leaves something in the arena after an attack: a fire trail, a slick puddle, mines, spikes, a short wall, a step in the air, or a cloud. Each is drawn in its owner's colour and has a point cost. For now they are switched on only in the move tester (the "Leaves behind" row on `/moves`); nothing in a match picks them yet.
- **Costs (try them on `/moves`).** A weapon can carry a power with a price. Six prices are built, each with a gauge over the fighter's head and a note on the A/B button: a **magazine** (pips; empty, it reloads for a moment), **heat** (the weapon glows redder, then steams and cannot be used until it cools), **ink** (each attack drinks mid-fight ink; too little and the weapon goes pale), **blood** (each attack costs a little health; red drops fly), a **wind-up** (a ring fills before the swing) and **fragile** (it cracks with each hit you take and breaks; stand still to mend it). For now they come with one stand-in power, "Heavy": a paid attack hits 35% harder and leaves a gold trail. The Cost row on `/moves` puts one on the weapon under test; "Run it out" shows the spent state. Nothing in a normal match gives a weapon a cost yet.
- **Summons (blocks an ability can use).** A weapon can carry a summon block: copies of its drawing that act on their own, glowing in their owner's colour. Orbiters circle you and sting whoever they touch; a pet trots behind you and pounces; a down attack plants a turret that spits small copies; a decoy is left behind as you blink away from a hit; a swarm flings one copy with each attack; a guardian blocks three incoming shots. The other player can swing at them to break them. Try each on `/moves` (the Summon row).
- **Impact.** Heavy hits freeze the fight for a few frames and shake the screen. Only the ultimate flashes the stage, when its last blow lands: an impact frame in pure black and white (white stage with black figures, then black with white, twice over 0.4 s) with a jagged star and force lines bursting from the hit, then a camera jolt. Each earlier blow pops a small star. On the retro desktop everything behind the fight blurs while an ultimate plays. If your system is set to reduce motion, the flash is off and the shake is small.
- **Getting out.** The art board's walls and floor can be mined: L swings the built-in pick, and S + L digs down. Two hits break a piece. Or run BREAKOUT.exe to open the whole board for 15 seconds. Outside, the desktop's window title bars are platforms.
- **The bot** is his animator.bot on top of this game's fighting bot: it draws glyphs with a ghost cursor, runs hacks, and counters yours. His CPU skill slider sets how good it is; Time scale slows a local match.
- Tablets and phones keep Benjamin's layout (with the draw strip and two new buttons, mine and hack); add `?plain=1` for the plain layout on a computer.

What comes from where is marked in the code: `inkshop.js`, `inkshop.css` and the `INK` block in `duel.html` hold his code between BEGIN/END verbatim markers. Not merged: his fighter movement, his pick-up weapon items, and cursor grabs.

**Springy movement.** The fighters' animations are authored clips; on top of them every joint is a small weight on a spring chasing the clip's pose (`anim/rig.js`, using the spring maths of his rig). The body lags and settles, a hit throws the joints about, and a dash leaves afterimages. It only changes how fighters are drawn, never who hits whom. On the InkShop desktop the Rig Properties sliders tune it: **Jelly** (how soft; 0 is the plain authored animation), **Stretch** (how far limbs may stretch), **Flab** (how loose the belly is), **Exaggerate** (bigger poses while moving about), **Onion skin** (afterimages all the time, not just during a dash) and **Show rig** (draws the springs). Settings are remembered per browser.

## Transforming weapons (a block an ability can use)

A weapon in Doodle Duel can carry one transformation, a change it goes through during the fight that everyone can see: **two forms** (double-tap down to switch, say, a blade into a bow), **splitter** (a finisher that lands splits it into a pair for a few seconds), **giant** (every few seconds it glows and the next move is made at twice the size), **evolving** (it gains a stage every few hits landed, three stages, and starts each round small), **far and near** (a melee weapon throws itself at a far foe and comes back; a ranged one is swung up close) and **overgrown** (it keeps growing and is cut back whenever its holder is hit). The ink still sets how strong the weapon is; a transformation only changes the shape of that strength. Nothing picks them yet: try them on the move tester at `/moves` (the Transform row), or set `customs:[{id:"giant"}]` on an item through `S.tweak`. The numbers and point costs are first guesses.

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

## Slideshow stage

Press Stage twice (or open `/duel?stage=deck`) to fight inside a founder's pitch deck in "Podium 97". The ledges are whatever is on the slide: placeholder boxes, bullet points, the bars of a revenue chart as they grow, the boxes of an org chart. Each bullet arrives by a different animation effect, named in a yellow tooltip as it happens: one flies in and rams, one drops from the top and stomps, one flashes in and out, one stretches from its middle and pushes outward. On the chart slide an Up Arrow shape throws whoever steps on it into the air, and over the org chart a rainbow WordArt "SYNERGY" becomes a bridge of letters riding a wave. Every time the founder presses Next the whole arena is replaced, and the slide transition itself comes through the stage: a Wipe shoves you along, a Cover Down presses from above, a Checkerboard takes the floor away in patches. Then the chart collapses, clip art is dropped in, the founder notices the fighters and goes after them with the pen, and finally just hammers the space bar. The floating Speaker Notes window says what the founder is thinking, and you can stand on it.

## Making a new scene

The repo carries a Claude Code skill for this, `scene-creation`, in `.claude/skills/scene-creation`. It is a project skill: it comes with the repo, so anyone who opens this folder in Claude Code has it without installing anything. Ask for a new scene, stage or arena (or just describe the program to fight in) and Claude follows it: pitch, a question about an inside joke, research into the real program, a timed script to agree on, then the build. The slideshow stage was made this way.

## Replays

- **Every knockout is shown again.** When a round ends, the last second before the knockout plays back at a third of the speed under a REPLAY banner, then the next round's drawing begins as usual. The knockout that wins the match is not replayed: the champion screen comes straight up. Add `?ko=0` to the address to switch the replays off (`/duel?ko=0`).
- **Any room's match can be watched again.** Open `/duel?replay=CODE` with the room's four letters, for example `/duel?replay=ABCD`. The page plays the match back from the room's recording: play and pause, 0.25×, 1× and 4× speed, and a bar to drag to any moment (with the bar selected, the arrow keys step one tick at a time). While a match is on, the link shows it up to the moment you opened it. After a rematch it shows the match that just ended until the new one has started. A recording is kept for 30 minutes after its match is replaced or its room closes, and the server keeps at most 50 of them. A replay made by a different version of the game is refused, since it would play out differently.
- **The balance bench can be repeated exactly.** `node tools/balance.js quick --seed=7` plays the same rounds every time, so two versions or settings can be compared on identical matches; see the notes at the top of `tools/balance.js`.

A match is exactly repeatable because all its randomness comes from one seed and every command it is given is logged with the tick it arrived on; `node tools/test-replay.js` checks that.

## Abilities: creative drawings earn more

Every drawing in Doodle Duel gets a **creativity score** from 1 to 10, and the score decides how many special abilities the weapon has: none for a plain one (a stick, a basic sword), one from 4, two from 7, three from 9. A boring weapon still works; it just has nothing special.

- **Name your drawing.** There is an optional box under the pad. A name ("vampire umbrella") tells the reader what you meant and becomes the weapon's name.
- **Abilities are built from blocks, tied together by code the model writes.** The game has 59 ready-made behaviours with a visible tell each (healing orbs for lifesteal, a glide, a fire trail, a summoned helper, a change to the arena). The model picks among them and writes a short script that says when they happen: "every third hit, mark the foe", "when I land from high up, a shock ring".
- **If the drawing needs something that is not there, the model codes it on the fly** from lower-level pieces: pushes, hops, dashes, shots, healing, stuns, and effects such as rings, streaks and floating text.
- **It is safe.** The scripts are in InkScript, a tiny language of our own (`inkscript.js`) that the game parses, checks and interprets itself, so nothing the model writes is ever run as JavaScript. The match clamps what any script can do, and a script that keeps failing during a fight is switched off ("ability fizzled").
- **It is quick.** Your weapon is ready as soon as the drawing is read. The score and abilities come from a second request and are added to the weapon when they arrive; the round does not start until they have (15 seconds at most, then it starts with what the weapon has).
- **Model:** `OPENAI_ABILITY_MODEL` (defaults to `OPENAI_MODEL`). Without a key the game estimates the score from the drawing and gives built-in abilities. `ABILITIES=0` turns the second request off.
- **Try it without a key:** `node tools/fake-openai.js` starts a stand-in model; start the game with `OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:3192 node server.js`.

Not yet tried with the real model: how well it scores, whether its scripts pass the checks, and how long the second request takes.

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

## INK-OS: the machine rewrites the game (LangChain deepagents)

The fight happens inside an old computer, and that computer is a deep agent. Type a request into the `INK-OS` terminal on the desktop ("make the floor lava", "low gravity", "a storm that zaps everyone") and the machine ships it as an update for the next round, in about 30 to 45 seconds.

- **Who does the work:** one deep agent, `ink-os`, plans the job with a to-do list and runs three sub-agents. The **designer** turns the request into `/design.md`. The **engineer** writes `/update.json` and fixes it until `check_update` passes. The **tester** plays it in headless matches of the real game with `playtest` and writes `/qa-report.md` with a PASS or FAIL. A FAIL goes back to the engineer. Only a play-tested update can be installed.
- **What an update is:** data, never JavaScript. Match settings (`gravity`, `speed`, `jump`, `damage`, `knockback`, `shotSpeed`, `size`, `health`, `overdrive`, each in a fixed range) and up to three world rules written in the game's own small rule language, which the game interprets itself. `MODS` in `duel.html` and `osforge.js` hold the tables; the manual the agents read is generated from them.
- **Nothing the agent writes is trusted:** its tools check the update, and the game server checks and play-tests it again before it reaches a room. A request the game cannot do literally (a new weapon, something for one side only) gets the closest fair change, and the patch notes say so.
- **Watching it work:** the terminal shows the plan ticking off, each hand-over, each file written, the check, and the play-test numbers beside the normal game's. Every run keeps its files in `os-agent/work/<run>/`.
- **Run it:** `cd os-agent && npm install && node server.mjs` (port 3130, needs `OPENAI_API_KEY`; `OS_AGENT_MODEL` picks the model, default `gpt-6-luna`). The game server finds it at `OS_AGENT_URL` (default `http://127.0.0.1:3130`). Type `reset` in the terminal to remove the installed update.
- **Not tested:** nobody outside the team has typed into it, and it has only been run with `gpt-6-luna`.

## Run

Needs Node 18 or newer. No dependencies.

1. Copy `.env.example` to `.env` and put your OpenAI API key after `OPENAI_API_KEY=`.
2. `node server.js`
3. Open http://localhost:3000 (it goes to `/duel`)

Without a key the game still runs; drawings are read by a rough local guess from ink colour and shape.

## Players on their own devices

The page you open is the big screen. Choose **Player vs Bot** or **Player vs Player**; you get a room code, a join link and a QR code. Each player scans it with a phone or tablet, which becomes their controller and sketchbook.

The server runs the match; each device only draws and displays.

**Same Wi-Fi (simplest for a demo):** run `node server.js` on a laptop. When you open the game at `localhost`, the QR code points at the laptop's network address so other devices can reach it. Allow Node through the firewall if your system asks. Some event and campus networks block devices from talking to each other; a phone hotspot avoids that.

**Public link:** deploy this folder to any host that runs a long-lived Node process (start command `node server.js`, set `OPENAI_API_KEY` in the host's environment settings, and the host supplies `PORT`). The QR code then uses the public address. Rooms live in memory, so run a single instance.

## Settings (`.env`)

| Variable | Default | What it does |
|---|---|---|
| `OPENAI_API_KEY` | none | Key used by the server to read drawings |
| `OPENAI_MODEL` | `gpt-6-luna` | Vision model that classifies the drawing |
| `PORT` | `3000` | Port the server listens on |
| `OPENAI_ABILITY_MODEL` | `OPENAI_MODEL` | Model that scores a drawing's creativity and writes its abilities |
| `ABILITIES` | on | `0` switches that second request off |
| `NOWS` | off | `1` leaves the WebSocket off (pages with `?net=ws` then fall back to the event stream) |

## Files

- `server.js`: starts everything: loads `.env`, sends `/` to `/duel`, and hands the rest to `duel-server.js`.
- `duel.html` and `duel-server.js`: the game. The rules sit in a marked block in `duel.html` and the server runs that same block for online rooms, so there is one copy of the rules. The server reads drawings with OpenAI; the key never reaches the browser.
- `inkscript.js`, `abilities.js`: abilities. The first is the script language (parser, checker, interpreter), used by the server and the page; the second writes the prompt and checks what the model answers. `tools/fake-openai.js` stands in for the model.
- `ws.js`, `wire.js`: the WebSocket link for Doodle Duel rooms (`?net=ws`). The first is the WebSocket itself, the second packs the state into binary frames and deltas; `tools/test-net.js` tests both and `tools/net-bench.js` measures the two links.
- `anim/`: Doodle Duel animation clips (running, and a move set each for blade, spear, hammer, fists, twin blades, bow, gun, twin pistols, magic staff and thrown weapons) and the engine that plays them; see `anim/README.md`. `anim-lab.html` previews clips and `tools/strip.js` renders them to frame strips.
- `qrcode.js`: QR Code Generator by Kazuhiko Arase (MIT), used for the join code.

## Status

Online play is tested with two browsers on one machine and a stand-in for the OpenAI endpoint. Not yet tested: the real OpenAI API, real tablets, and play over a slow network. Doodle Duel is tested by simulation, a scripted two-client online match and a desktop browser; drawings were read by the real OpenAI API (`gpt-4.1-mini`, about 1 second each). Balance numbers are first guesses. Abilities (the creativity score and the scripts a model writes) have been tried against a stand-in for the model only.
