# Real-time Netcode (WebSocket, binary deltas, interpolation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "one HTTP request per button press, 60 JSON messages a second" with one WebSocket per device carrying inputs up and binary state deltas down, and draw from a jitter buffer, so the controller feels immediate on venue Wi-Fi.

**Architecture:** A WebSocket server written from the RFC (no library) sits beside the existing event stream. State goes down as a binary patch against the last snapshot the client acknowledged. The page draws a moment in the past, interpolating between two buffered snapshots. The existing event-stream path stays as the automatic fallback.

**Tech Stack:** Node 18+ (`http`, `crypto`, `net`), plain JavaScript, no dependencies.

**Spec:** the "Design" section of this file.

**Branch:** `netcode-ws`, cut from `origin/main` at `4df868c`. Preview port 3112.

## Design

- **Today:** state is a JSON snapshot on a Server-Sent Events stream about 60 times a second; inputs are `POST /duel/act` with one request in flight (`sendInput()` in `duel.html`); the page extrapolates from the newest snapshot by its age (`render`, line ~3042).
- **Transport:** `GET /duel/ws?room=CODE&id=CLIENT[&watch=1]` upgrades to a WebSocket. Text frames carry every named event as `{"ev":name,"data":...}` (so events other branches add travel unchanged). Binary frames carry state. The client sends inputs and acknowledgements as text frames `{"t":"input","seq":n,"ack":stateSeq,...buttons}`; every other act stays on `POST /duel/act`.
- **State frames:** byte 0 is `1` (full) or `2` (delta); then `seq`, `baseSeq` (delta only) and `serverMs` as varints; then a packed value. A delta is against the snapshot `baseSeq`, which the client has acknowledged. The server keeps each client's last 32 sent snapshots; if the base is gone, or every 2 s, it sends a full frame.
- **Packing:** `wire.js` encodes any JSON value in binary: zigzag varints for integers, float64 otherwise, strings by a per-connection dictionary after first use, arrays, objects with dictionary keys. `diff(prev,cur)` returns only what changed; arrays of objects that all have an `id` (the shots `pr`) are diffed by id, other arrays are replaced whole when they differ.
- **Input rules stay as they are:** only a higher `seq` counts; a controller silent for 0.9 s with a direction held is released (`room.heldAt` in the room loop).
- **Jitter buffer:** the page keeps recent snapshots with their `serverMs`, estimates the clock offset and jitter, and draws at `serverNow - delay`, `delay = clamp(2 * jitter + 9, 17, 100)` ms, interpolating fighter and shot positions between the two snapshots around that time (shots matched by id). If the buffer runs dry it extrapolates for at most 50 ms, then holds.
- **Fallback and switch:** if the socket has not opened within 1500 ms, or closes, the page uses the existing event stream and `POST` inputs. `?net=sse` forces the old path, `?net=ws` forbids the fallback.
- **Status bar:** shows transport, round-trip time, jitter and kB/s.

## Global Constraints

- No runtime dependencies. Node 18+. Tests are plain Node scripts in the style of `tools/test-world.js`.
- The DUEL block in `duel.html` is not changed by this plan.
- The event-stream path must keep working unchanged: with `?net=sse` behaviour is as on `4df868c`.
- `server.js` and `duel-server.js` send every event through one function (`sse`/`broadcast`); route both transports through it rather than adding call sites.
- `node tools/test-world.js` and `node tools/check-anim.js` keep passing.
- Work only in this branch's worktree. Never touch `/Users/benliu/HackPrinceton`. Commit after every task. Do not push. Never print or commit `.env`.

## Review Focus

- A proxy that drops WebSocket upgrades (some venue networks, Render's proxy unverified): the page must fall back within 1.5 s and play normally. (Task 5)
- A tablet that sleeps and wakes: its socket is dead, its base snapshot unknown; it must reconnect and get a full frame. (Task 4)
- A snapshot field added by another branch: packing and diffing must carry unknown keys without code changes. (Task 3)
- Frames split across TCP chunks or several frames in one chunk. (Task 1)
- A browser tab in the background stops drawing; on return the buffer must not replay seconds of stale motion. (Task 6)

---

### Task 1: WebSocket frame codec

**Files:** Create `ws.js`, `tools/test-net.js`

**Interfaces:**
- Produces: `encodeFrame(opcode, payload:Buffer, {mask=false}) -> Buffer`; `createDecoder({onFrame(opcode, payload), onError(err), requireMask=true}) -> push(chunk:Buffer)`. Fragments are joined before `onFrame`. Payloads above 1 MiB and client frames without a mask call `onError`.

- [ ] **Step 1: Write the failing tests** with the examples from RFC 6455 section 5.7.

```js
const hex=s=>Buffer.from(s.replace(/\s/g,''),'hex');
ok('unmasked text "Hello"',W.encodeFrame(1,Buffer.from('Hello')).equals(hex('81 05 48 65 6c 6c 6f')));
ok('masked text "Hello" decodes',dec(hex('81 85 37 fa 21 3d 7f 9f 4d 51 58'))[0].payload.toString()==='Hello');
ok('fragments join',dec(Buffer.concat([hex('01 03 48 65 6c'),hex('80 02 6c 6f')]),{requireMask:false})[0].payload.toString()==='Hello');
ok('ping is opcode 9',dec(hex('89 05 48 65 6c 6c 6f'),{requireMask:false})[0].opcode===9);
ok('256 bytes use the 16-bit length',W.encodeFrame(2,Buffer.alloc(256)).subarray(0,4).equals(hex('82 7E 01 00')));
ok('65536 bytes use the 64-bit length',W.encodeFrame(2,Buffer.alloc(65536)).subarray(0,10).equals(hex('82 7F 00 00 00 00 00 01 00 00')));
ok('a frame fed one byte at a time still decodes',decSlow(W.encodeFrame(1,Buffer.from('Hello'),{mask:true}))[0].payload.toString()==='Hello');
ok('two frames in one chunk both arrive',dec(Buffer.concat([W.encodeFrame(1,Buffer.from('a'),{mask:true}),W.encodeFrame(1,Buffer.from('b'),{mask:true})])).length===2);
ok('an unmasked client frame is an error',errOf(hex('81 05 48 65 6c 6c 6f'))!==null);
ok('a 2 MiB frame is an error',errOf(W.encodeFrame(2,Buffer.alloc(2<<20),{mask:true}))!==null);
```

- [ ] **Step 2: Run** `node tools/test-net.js`. Expected: `Cannot find module '../ws.js'`.
- [ ] **Step 3: Implement** the codec.
- [ ] **Step 4: Run** the tests. Expected: all `ok`.
- [ ] **Step 5: Commit** `git add ws.js tools/test-net.js && git commit -m "WebSocket frame codec from RFC 6455"`.

### Task 2: Handshake and sockets

**Files:** Modify `ws.js`, `tools/test-net.js`

**Interfaces:**
- Produces: `acceptKey(key) -> string`; `attach(httpServer, path, onSocket(sock, req))` where `sock.send(string|Buffer)`, `sock.close()`, `sock.on('message', (data, isBinary)=>...)`, `sock.on('close', ...)`; the server pings every 15 s and closes a socket that missed two pongs. `connect(url) -> Promise<sock>` is a minimal client (used by tests and the bench).

- [ ] **Step 1: Write the failing tests.**

```js
ok('accept key matches the RFC example',W.acceptKey('dGhlIHNhbXBsZSBub25jZQ==')==='s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
ok('a client connects, text and binary echo back',echoText==='hi'&&echoBin.equals(Buffer.from([1,2,3])));
ok('a wrong path gets no upgrade',wrongPathStatus===404||wrongPathClosed);
ok('closing from either end fires close once on the other',closes.server===1&&closes.client===1);
```

- [ ] **Step 2: Run** the tests. Expected: `W.acceptKey is not a function`.
- [ ] **Step 3: Implement** on the `upgrade` event of the `http` server.
- [ ] **Step 4: Run** the tests. Expected: all `ok`.
- [ ] **Step 5: Commit** `git commit -am "WebSocket handshake, sockets, keep-alive"`.

### Task 3: Binary packing and deltas

**Files:** Create `wire.js` (UMD: `module.exports` and `window.Wire`); modify `tools/test-net.js`

**Interfaces:**
- Produces: `Wire.createCodec() -> {pack(value) -> Uint8Array, unpack(bytes) -> value}` (one codec per connection per direction, because of the dictionary); `Wire.diff(prev, cur) -> patch | undefined`; `Wire.apply(prev, patch) -> value`.

- [ ] **Step 1: Write the failing tests.** Record 600 consecutive snapshots from a bot-against-bot match (load the DUEL block as `tools/balance.js` does, step at 1/60, call `S.snapshot()`), as `SNAPS`.

```js
ok('pack and unpack round-trip odd values',[0,-1,1.5,1e21,'','é',true,null,[],{},{a:[{id:1,x:0.1}]}].every(v=>JSON.stringify(un(pk(v)))===JSON.stringify(v)));
ok('every recorded snapshot survives a delta',SNAPS.every((s,i)=>i===0||JSON.stringify(Wire.apply(SNAPS[i-1],un(pk(Wire.diff(SNAPS[i-1],s)))))===JSON.stringify(s)));
ok('a delta against a snapshot 30 back also works',JSON.stringify(Wire.apply(SNAPS[100],Wire.diff(SNAPS[100],SNAPS[130])))===JSON.stringify(SNAPS[130]));
ok('an unknown new field is carried',Wire.apply({a:1},Wire.diff({a:1},{a:1,forge:{x:[1,2]}})).forge.x[1]===2);
ok('identical snapshots give no patch',Wire.diff(SNAPS[5],JSON.parse(JSON.stringify(SNAPS[5])))===undefined);
const jsonBytes=SNAPS.reduce((n,s)=>n+JSON.stringify(s).length,0), deltaBytes=SNAPS.reduce((n,s,i)=>n+(i?pk(Wire.diff(SNAPS[i-1],s)||0).length:pk(s).length),0);
ok('deltas are at most 40% of the JSON',deltaBytes<=0.4*jsonBytes,{jsonBytes,deltaBytes});
```

- [ ] **Step 2: Run** the tests. Expected: `Cannot find module '../wire.js'`.
- [ ] **Step 3: Implement** `createCodec`, `diff`, `apply`.
- [ ] **Step 4: Run** the tests. Expected: all `ok`; note the two byte counts for the report.
- [ ] **Step 5: Commit** `git add wire.js && git commit -am "Binary packing and structural deltas for snapshots"`.

### Task 4: Server transport

**Files:** Modify `duel-server.js` (client records near line 149, `sse`/`broadcast`, the room loop near line 61, the input act near line 188), `server.js` (attach the upgrade handler; serve `wire.js`); modify `tools/test-net.js`

**Interfaces:**
- Consumes: `attach`, `connect`, `Wire`.
- Produces: `/duel/ws` as in Design. A room client is `{send(event,data), sendState(snapshot, now), ...}` whatever its transport.

- [ ] **Step 1: Write the failing tests** against a child `node server.js` on port 3192, a bot room and one WebSocket player.

```js
ok('hello and players arrive as text events',evs.hello.side===0&&!!evs.players);
ok('the first state frame is full, later ones are deltas',kinds[0]===1&&kinds.slice(1,20).every(k=>k===2));
ok('decoded state matches the event stream within one tick',Math.abs(wsState.f[0].x-sseState.f[0].x)<12);
ok('holding right over the socket moves the fighter',xAfter-xBefore>40);
ok('silence releases the held direction within 1.3 s',Math.abs(xAt2200-xAt1300)<8);
ok('never acknowledging still works: full frames keep coming',kindsNoAck.filter(k=>k===1).length>=2);
ok('a second socket with the same id takes over cleanly',firstClosed&&secondGotFull);
```

- [ ] **Step 2: Run** the tests. Expected: the connection is refused or closes (`FAIL` lines).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node tools/test-net.js`. Expected: all `ok`.
- [ ] **Step 5: Commit** `git commit -am "Server: WebSocket rooms with acknowledged binary deltas"`.

### Task 5: Page transport with fallback

**Files:** Modify `duel.html` (`joinRoom` near line 2162, `sendInput`, the 150 ms repeat), the static file table (serve `wire.js`)

**Interfaces:**
- Produces: in the page, `net.link` is `'ws'` or `'sse'`; `sendInput()` writes to the socket when it is open, else uses the existing request.

- [ ] **Step 1: Write the failing test** in `tools/test-net.js` for the pure chooser, extracted from the page source by regular expression: `chooseLink({param, opened, elapsedMs, closed}) -> 'ws'|'sse'|'wait'`.

```js
ok('waits up to 1500 ms, then falls back',pick({param:'',opened:false,elapsedMs:1000,closed:false})==='wait'&&pick({param:'',opened:false,elapsedMs:1600,closed:false})==='sse');
ok('uses the socket once open, falls back when it closes',pick({param:'',opened:true,elapsedMs:200,closed:false})==='ws'&&pick({param:'',opened:true,elapsedMs:9000,closed:true})==='sse');
ok('?net=sse never tries, ?net=ws never falls back',pick({param:'sse',opened:true,elapsedMs:0,closed:false})==='sse'&&pick({param:'ws',opened:false,elapsedMs:9000,closed:true})==='wait');
```

- [ ] **Step 2: Run** it. Expected: `FAIL` (`chooseLink` not found).
- [ ] **Step 3: Implement** the chooser and the socket path; keep the `EventSource` code as it is and start it only on fallback.
- [ ] **Step 4: Verify in the browser** on port 3112: play a bot room with no parameter (status bar shows `ws`), with `?net=sse` (shows `sse`, plays as before), and with the server's upgrade handler disabled by `NOWS=1` (falls back within 1.5 s). No console errors.
- [ ] **Step 5: Commit** `git commit -am "Page: WebSocket link with automatic fallback to the event stream"`.

### Task 6: Jitter buffer

**Files:** Modify `wire.js` (add `Wire.createBuffer`), `duel.html` (`accept` appends one line; `render` reads positions from the buffer when `net.link==='ws'`), `tools/test-net.js`

**Interfaces:**
- Produces: `Wire.createBuffer() -> {push(snap, serverMs, recvMs), sample(nowMs) -> {a, b, k, extrapolatedMs} | null, delayMs()}`; `sample` gives the two snapshots around the draw time and the blend `k` in 0..1.

- [ ] **Step 1: Write the failing tests** with a synthetic fighter moving at 340 px/s, snapshots every 16.7 ms, arrivals delayed by 30 ms plus uniform jitter of 0 to 20 ms.

```js
ok('drawn position never moves backwards',backwardSteps===0);
ok('error against the truth at the drawn time is under 3 px',maxErr<3,maxErr);
ok('the delay settles between 17 and 100 ms',d>=17&&d<=100,d);
ok('a 200 ms gap extrapolates for at most 50 ms, then holds',maxExtrap<=50&&heldDuringGap);
ok('after 5 s without pushes the old snapshots are dropped',B.sample(t0+5000+20)===null||freshOnly);
```

- [ ] **Step 2: Run** the tests. Expected: `Wire.createBuffer is not a function`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then check by eye on port 3112 that fighters and shots move without stutter.
- [ ] **Step 5: Commit** `git commit -am "Jitter buffer: draw a moment in the past, interpolated"`.

### Task 7: Measure it

**Files:** Create `tools/net-bench.js`; modify the status bar code near `#st-fps` in `duel.html`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: Write** `tools/net-bench.js`: start the server, join one bot room over each transport through a local TCP relay that adds a fixed delay (`--delay=30`) and jitter (`--jitter=20`), press a direction 200 times, and print per transport: median and 95th-percentile time from sending the press to the first state showing movement, and bytes per second received.
- [ ] **Step 2: Run** `node tools/net-bench.js --delay=30 --jitter=20`. Expected output: one table with two rows. Pass marks: the socket's median is no higher than the event stream's, and its bytes per second are at most 40% of it. If either mark is missed, say so in the report; do not tune the numbers to pass.
- [ ] **Step 3: Show** transport, round trip, jitter and kB/s in the status bar.
- [ ] **Step 4: Document** in `README.md` (the `?net=` switch, the bench) and `CLAUDE.md` (the frame layout, what is not tested: real tablets, Render's proxy).
- [ ] **Step 5: Commit** `git add tools/net-bench.js && git commit -am "Net bench, status bar figures, notes"`.
