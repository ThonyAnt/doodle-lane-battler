# Doodle Lane Battler

A one-lane battler where every unit is something you draw. Ink is the price: each stroke spends ink, and the ink you spend sets the unit's strength. A vision model decides what the drawing is (ground, flying or stationary; melee, ranged, area or no attack; fire, water, plant or none), never how strong it is.

Hackathon MVP with three ways to play: against a bot, two players on one screen, or online with each player on their own device.

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
| `OPENAI_MODEL` | `gpt-4.1-nano` | Vision model that classifies the drawing |
| `PORT` | `3000` | Port the server listens on |

## Rules

- Fire beats plant, plant beats water, water beats fire (1.5x damage).
- Flying units cannot be hit by ground melee; ranged and area attacks reach them.
- Stationary drawings hold a spot in front of your base and are tougher.
- Ink refills twice as fast in the last 30 seconds. Most base health at 0:00 wins; if tied, the side that pushed further down the lane wins.

## Files

- `index.html`: the whole game (simulation, bot, drawing pads, rendering).
- `server.js`: serves the page, reads drawings with OpenAI (the key never reaches the browser), and runs online rooms. It loads the match rules from the marked block in `index.html`, so there is one copy of the rules.
- `qrcode.js`: QR Code Generator by Kazuhiko Arase (MIT), used for the join code.

## Status

Online play is tested with two browsers on one machine and a stand-in for the OpenAI endpoint. Not yet tested: the real OpenAI API, real tablets, and play over a slow network. Balance numbers and the bot's 15% handicap are first guesses.
