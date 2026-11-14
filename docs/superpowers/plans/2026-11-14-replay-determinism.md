# Deterministic Sim, Replays and Instant Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a match exactly repeatable from a seed and a log of commands, then use that for a slow-motion replay of every knockout, a replay viewer for whole matches, and a balance bench that compares versions on identical matches.

**Architecture:** The sim gets its own seeded random generator and records every outside command with the tick it arrived on. Replaying the log rebuilds the match tick for tick; a state hash proves it. The knockout replay needs no re-simulation: the page keeps the last seconds of snapshots and plays them back slowly.

**Tech Stack:** Node 18+, plain JavaScript, no dependencies.

**Spec:** the "Design" section of this file.

**Branch:** `replay-determinism`, cut from `origin/main` at `4df868c`. Preview port 3113.

## Design

- **Randomness today:** inside the DUEL block the sim calls `Math.random` in four places (the `rand` and `pick` helpers near lines 820 and 821, the `lucky` trait in `hurt()` near 1041, the move variant in `startMove` near 1082); the bot and `botLoadout` use it about 25 more times. Nothing in the block reads the clock.
- **Seeded generator:** `createDuel({seed})` builds a mulberry32 generator `S.rand()`; with no seed it picks one from `Math.random` and keeps it in `S.seed`. The block-level helpers use a block-level `RNG` that `tick` points at the current sim's generator. `makeBot(side, skillOf, seed)` and `botLoadout(seed)` get their own generators.
- **Ticks:** the sim advances in fixed steps of 1/120 s (`STEP`). `S.tickN` counts them. A command applies between ticks, so the log stores the tick count at which it was applied.
- **Command log:** with `createDuel({record:true})` the sim appends `[tickN, name, args]` for every call of `setItem`, `tweak`, `setReady`, `setInput`, `stroke`, `setLayout`, `setPlats` (and any other `S.` method that changes state from outside; find them all). `S.log()` returns `{v:1, seed, opts, cmds}`. The bot's presses are logged as ordinary inputs, so a replay never runs the bot.
- **Replay:** `replayDuel(log, {untilTick}) -> S` creates a sim from `log.seed` and `log.opts` and re-applies the commands at their ticks.
- **Hash:** `S.hash()` is FNV-1a (32 bit, 8 hex digits) over phase, clock, round, wins and every fighter's and projectile's numbers rounded to 0.01.
- **Knockout replay:** the page keeps a ring of the last 5 s of snapshots. On a `ko` event it waits 0.4 s, then for 3.0 s draws the last 1.0 s before the knockout at one third speed under a "REPLAY" banner, then returns to live. This fits the 3.2 s `end` phase. Sound is muted during it. `?ko=0` switches it off.
- **Match replay:** rooms record. `GET /duel/replay?room=CODE` returns the log of the current or last match (kept 30 minutes, at most 50 matches in memory). `duel?replay=CODE` re-simulates in the page with play/pause, 0.25x, 1x, 4x and a scrub bar (scrubbing re-simulates from the start).
- **Paired bench:** `tools/balance.js --seed=N` plays round `i` with seed `N+i` so two versions or settings face identical randomness.

## Global Constraints

- No runtime dependencies. Node 18+. Tests are plain Node scripts in the style of `tools/test-world.js`.
- The DUEL block stays DOM-free and loadable with `new Function(block+';return {...}')`.
- Play without a seed must feel as before: `node tools/balance.js quick --n=200` within 6 points of `4df868c`; `node tools/test-world.js` and `node tools/check-anim.js` pass.
- Keep changes to `accept()` in the page to one appended line (another branch also buffers snapshots).
- Work only in this branch's worktree. Never touch `/Users/benliu/HackPrinceton`. Commit after every task. Do not push. Never print or commit `.env`.

## Review Focus

- State that lives in closures (`S.effects` entries carry an `end` function; ultimate projectiles point at their owner): a replay must rebuild them by re-running commands, never by copying state. (Task 3)
- Iteration order over a `Map` or `Set` in the sim changing results between runs. (Task 1)
- A room whose layout is set after the match starts (`layout`, `plats` acts): those commands must be in the log. (Task 3)
- A knockout in the final round: the replay must not cover the champion screen. (Task 5)
- A replay recorded by one version opened by another: refuse with a clear message when `v` or the rules differ, rather than playing a wrong match. (Task 4)

---

### Task 1: Seeded randomness

**Files:** Modify `duel.html` (DUEL block: the helpers near 820, `createDuel` near 938, `hurt` near 1041, `startMove` near 1082, `makeBot` near 1598, `botLoadout` near 1749); create `tools/test-replay.js`

**Interfaces:**
- Produces: `createDuel({seed})`, `S.seed`, `S.rand() -> [0,1)`, `S.tickN`, `makeBot(side, skillOf, seed)`, `botLoadout(seed)`.

- [ ] **Step 1: Write the failing tests.** Helper `match(seed, secs)` builds a duel with that seed, two stock items a side, two bots seeded `seed+1` and `seed+2`, steps at 1/60 for `secs` and returns the sim.

```js
ok('same seed, same match',[1,2,3,4,5].every(s=>sig(match(s,40))===sig(match(s,40))));          // sig: JSON of hp, x, y of both fighters, wins, phase, t
ok('different seeds differ',sig(match(1,40))!==sig(match(2,40)));
ok('no stray Math.random while stepping',(()=>{ const r=Math.random; let n=0; Math.random=()=>{ n++; return r(); }; match(7,40); Math.random=r; return n===0; })());
ok('stepping in big or small pieces gives the same match',sig(scriptedDt(9,40,1/30))===sig(scriptedDt(9,40,1/120)));      // scriptedDt: no bots; a fixed list of inputs applied whenever S.tickN reaches a multiple of 120
ok('no seed still varies',new Set([0,1,2,3].map(()=>D.createDuel().seed)).size>1);
```

- [ ] **Step 2: Run** `node tools/test-replay.js`. Expected: the first line prints `FAIL`.
- [ ] **Step 3: Implement** the generator and replace every `Math.random` inside the block. In `match()` the bots must be given their seeds before any call.
- [ ] **Step 4: Run** `node tools/test-replay.js && node tools/test-world.js && node tools/balance.js quick --n=200`. Expected: tests pass; `quick` within 6 points.
- [ ] **Step 5: Commit** `git add tools/test-replay.js && git commit -am "Sim: seeded randomness, tick counter"`.

### Task 2: State hash

**Files:** Modify `duel.html` (DUEL block, next to `S.snapshot`), `tools/test-replay.js`

**Interfaces:**
- Produces: `S.hash() -> string` of 8 hex digits.

- [ ] **Step 1: Write the failing tests.**

```js
ok('hash is 8 hex digits',/^[0-9a-f]{8}$/.test(match(1,5).hash()));
ok('equal matches hash equal at every second',(()=>{ const a=matchLive(3), b=matchLive(3); for(let s=0;s<40;s++){ stepSecs(a,1); stepSecs(b,1); if(a.hash()!==b.hash()) return false; } return true; })());
ok('one hit point of difference changes the hash',(()=>{ const a=match(3,10), h=a.hash(); a.f[0].hp-=1; return a.hash()!==h; })());
```

- [ ] **Step 2: Run** the tests. Expected: `S.hash is not a function`.
- [ ] **Step 3: Implement `S.hash`.**
- [ ] **Step 4: Run** the tests. Expected: all `ok`.
- [ ] **Step 5: Commit** `git commit -am "Sim: state hash"`.

### Task 3: Command log and replay

**Files:** Modify `duel.html` (DUEL block: each outside-facing `S.` method; add `replayDuel` at block level), loaders' export lists in `duel-server.js` (line ~11) and the tools, `tools/test-replay.js`

**Interfaces:**
- Produces: `createDuel({record:true})`, `S.log() -> {v:1, seed, opts, cmds:[[tickN, name, args]]}`, `replayDuel(log, {untilTick}?) -> S`.

- [ ] **Step 1: Write the failing tests.** `recorded(seed)` plays a full first-to-`WINS` match between two bots with `record:true`, including one `stroke` and one `tweak` during the draw phase and a `setLayout` before it.

```js
{ const a=recorded(11), log=JSON.parse(JSON.stringify(a.log())), b=D.replayDuel(log);
  ok('a replay ends exactly where the match did',b.hash()===a.hash()&&b.wins.join()===a.wins.join()&&b.tickN===a.tickN);
  ok('a replay to the middle matches the match at that tick',D.replayDuel(log,{untilTick:3000}).hash()===hashAtTick(11,3000));
  ok('the log is small',JSON.stringify(log).length<60000,JSON.stringify(log).length);
  ok('inputs are logged only when they change',log.cmds.filter(c=>c[1]==='setInput').length<a.tickN/4);
  const t=Date.now(); D.replayDuel(log); ok('a whole match replays in under one second',Date.now()-t<1000,Date.now()-t); }
ok('20 seeds all replay exactly',Array.from({length:20},(_,i)=>i+100).every(s=>{ const a=recorded(s); return D.replayDuel(a.log()).hash()===a.hash(); }));
ok('a log from another version is refused',(()=>{ try{ D.replayDuel({v:99,seed:1,opts:{},cmds:[]}); return false; }catch(e){ return /version/.test(e.message); } })());
```

- [ ] **Step 2: Run** the tests. Expected: `a.log is not a function`.
- [ ] **Step 3: Implement** recording by wrapping the methods once inside `createDuel`, and `replayDuel`.
- [ ] **Step 4: Run** `node tools/test-replay.js && node tools/test-world.js`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -am "Sim: command log and exact replay"`.

### Task 4: Rooms record, replays are served and viewed

**Files:** Modify `duel-server.js` (`newRoom`, the `rematch` act, a new `GET /duel/replay`), `duel.html` (a `?replay=CODE` mode beside `setMode`), `tools/test-replay.js`

**Interfaces:**
- Produces: `GET /duel/replay?room=CODE` answers `{log, rules:<hash of the DUEL block text>}` or 404; in the page `playReplay(log)` with `replayAt(log, tick) -> S`.

- [ ] **Step 1: Write the failing tests** against a child `node server.js` on port 3193: play a bot room to the end of round one by posting inputs, then fetch the replay.

```js
ok('the room serves its replay',res.status===200&&res.body.log.v===1&&res.body.log.cmds.length>10);
ok('replaying it reproduces the round result',replayed.wins.join()===liveState.wins.join());
ok('an unknown room is a 404',(await get('/duel/replay?room=ZZZZ')).status===404);
ok('a rematch starts a new log and keeps the last one',afterRematch.log.cmds.length<res.body.log.cmds.length||afterRematch.previous===true);
```

- [ ] **Step 2: Run** the tests. Expected: 404 on the first fetch (`FAIL`).
- [ ] **Step 3: Implement** the route, the 30-minute and 50-match limits, and the viewer (play/pause, 0.25x, 1x, 4x, scrub bar). The viewer refuses a log whose `rules` hash differs from the page's with "This replay is from a different version of the game."
- [ ] **Step 4: Verify in the browser** on port 3113: play a round, open `duel?replay=CODE`, scrub and change speed. Screenshot it. No console errors.
- [ ] **Step 5: Commit** `git commit -am "Rooms record matches; replay route and viewer"`.

### Task 5: Knockout instant replay

**Files:** Modify `duel.html` (`accept` appends one line; `render`; the banner code), `tools/test-replay.js`

**Interfaces:**
- Produces: block-external pure function `koReplayFrame(ring, koMs, sinceKoMs) -> snapshot | null` where `ring` is `[{ms, snap}]`: `null` before 400 ms and after 3400 ms; otherwise the snapshot nearest to `koMs - 1000 + (sinceKoMs - 400) / 3`.

- [ ] **Step 1: Write the failing tests** by extracting `koReplayFrame` from the page source.

```js
const ring=Array.from({length:300},(_,i)=>({ms:i*16.7,snap:{i}})), ko=299*16.7;
ok('nothing for the first 0.4 s',koReplayFrame(ring,ko,300)===null);
ok('starts one second before the knockout',Math.abs(koReplayFrame(ring,ko,400).i*16.7-(ko-1000))<17);
ok('runs at one third speed',Math.abs(koReplayFrame(ring,ko,1900).i*16.7-(ko-500))<17);
ok('ends on the knockout, then stops',Math.abs(koReplayFrame(ring,ko,3399).i-299)<=1&&koReplayFrame(ring,ko,3401)===null);
ok('a short ring does not crash',koReplayFrame(ring.slice(-10),ko,1000)!==undefined);
```

- [ ] **Step 2: Run** the tests. Expected: `FAIL` (`koReplayFrame` not found).
- [ ] **Step 3: Implement** the ring (5 s), the function, the "REPLAY" banner and muting; skip it when the knockout ends the match and when `?ko=0`.
- [ ] **Step 4: Verify in the browser** on port 3113: win a round against the bot; the knockout plays back slowly, then the next round's draw phase appears on time. Screenshot the banner.
- [ ] **Step 5: Commit** `git commit -am "Slow-motion replay of every knockout"`.

### Task 6: Paired balance bench and notes

**Files:** Modify `tools/balance.js` (`round`, `duel`, the options comment), `README.md`, `CLAUDE.md`

- [ ] **Step 1: Write the failing test** in `tools/test-replay.js`: run `node tools/balance.js quick --n=40 --seed=5` twice as child processes; `ok('a seeded bench prints the same numbers twice',out1===out2)`.
- [ ] **Step 2: Run** it. Expected: `FAIL` (numbers differ).
- [ ] **Step 3: Implement `--seed`:** round `i` uses seed `N+i` for the sim and derived seeds for both players' bots and scripted people.
- [ ] **Step 4: Run** `node tools/test-replay.js`. Expected: all `ok`.
- [ ] **Step 5: Document and commit.** `README.md`: the replay link, `?ko=0`, `--seed`. `CLAUDE.md`: the seed, the log format, `S.hash`, and "every new outside-facing `S.` method must be recorded". `git commit -am "Seeded balance bench; notes"`.
