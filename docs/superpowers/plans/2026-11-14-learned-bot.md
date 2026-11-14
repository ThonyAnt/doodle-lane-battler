# Self-play Trained CPU Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Train a small neural-network opponent by playing it against a league of opponents in the headless sim all night, and offer it as a second CPU beside the hand-written one.

**Architecture:** A 1,232-weight network reads 28 numbers about the fight and presses the same buttons a player has, at human reaction speed. An evolution strategy improves the weights; fitness is measured by real rounds of the real rules on all cores. The hand-written bot stays the default unless the trained one clears a stated bar.

**Tech Stack:** Node 18+ (`worker_threads`), plain JavaScript, no dependencies.

**Spec:** the "Design" section of this file.

**Branch:** `learned-bot`, cut from `origin/main` at `4df868c`. Preview port 3114.

## Design

- **Today:** `makeBot(side, skillOf)` in the DUEL block (line ~1598) is hand-written. `tools/balance.js` plays headless rounds; `person(kind)` there gives three scripted players (`masher`, `jumper`, `kiter`).
- **What the network sees** (`botFeatures(S, side) -> Float32Array(28)`), mirrored so "towards the foe" is always positive: signed distance to the foe / 480; height difference / 200; own and foe velocity x and y / 600 (4); own and foe health / 160 (2); own and foe on the ground (2); own and foe mid-move (2); foe's move progress 0..1; own and foe stunned or hurt (2); own two cooldowns 0..1 (2); own held slot; own items' kinds as "is ranged" for each slot (2); foe's held item "is ranged"; own and foe overdrive / 100 (2); nearest incoming projectile: present, distance / 480, height difference / 200 (3); distance to the wall behind / 480; round clock / 90; constant 1.
- **Network:** 28 -> 24 (tanh) -> 16 (tanh) -> 8 (linear). Outputs: move (stand if `|v| < 0.33`, else towards or away), jump, attack A, attack B, down, ultimate, use hack, unused. An output above 0 is a press. Weight count 28*24+24 + 24*16+16 + 16*8+8 = 1,232.
- **Human limits:** a decision every 0.1 s; what it sees is `0.12 + 0.2 * (1 - skill)` seconds old; at most 8 presses a second per button.
- **Training:** an evolution strategy with mirrored sampling and rank-shaped fitness: population 64 (32 mirrored pairs), noise 0.1, learning rate 0.03, weight decay 0.005. Fitness of one candidate = mean over 24 rounds of `win + 0.5 * (own health - foe health) / 160 - 0.2 * (round timed out)`, with both sides given the same random loadout from `botLoadout()`, sides swapped every round.
- **League:** the hand-written bot at skill 0.3, 0.55 and 0.8; the three scripted players; and the champion of every 25th generation. Opponents are drawn evenly.
- **Run:** `node bot/train.js --hours=6 --workers=8 --out=bot/checkpoints`. Every generation writes `gen-NNNN.json` (`{gen, theta, fitness, vsClassic}`) and appends to `log.csv`; it resumes from the newest checkpoint and stops cleanly on Ctrl-C or when time is up.
- **Shipping bar:** over 400 rounds with mirrored loadouts, the champion wins at least 55% against the hand-written bot at skill 0.55 and at least 60% against each scripted player. If it does, it becomes selectable as "CPU: trained"; the default stays "classic" either way. If it does not, the option is hidden and the report says by how much it missed.
- **In the game:** `POST /duel/room?bot=1&brain=net` seats the trained bot; the menu gets a "CPU: classic / trained" switch next to the bot-room button.

## Global Constraints

- No runtime dependencies. Node 18+. Tests are plain Node scripts in the style of `tools/test-world.js`.
- The DUEL block stays DOM-free and loadable with `new Function(block+';return {...}')`. The network's forward pass lives in the block; weights are passed in, never read from disk there.
- The hand-written bot and every number in `tools/balance.js bot` stay as on `4df868c`.
- Training must not starve the machine: default `--workers=8` on this 12-core Mac, other sessions are working at the same time.
- `bot/checkpoints/` is git-ignored except the chosen champion, which is committed as `bot-weights.json`.
- Work only in this branch's worktree. Never touch `/Users/benliu/HackPrinceton`. Commit after every task. Do not push. Never print or commit `.env`.

## Review Focus

- A policy that wins by something unwatchable (standing in a corner spamming one shot, running out the clock): the timeout penalty is in the fitness; also print its presses per second and the share of rounds it ended by knockout. (Task 6)
- A policy that only works on one side: features are mirrored and sides are swapped; test it. (Task 1)
- Training stopped half-way through a generation (laptop sleeps): resume must not corrupt or skip. (Task 4)
- Weights from one rules version used after a balance change: store the hash of the DUEL block text with the weights and warn when it differs. (Task 5)
- The machine is on battery: training on a throttled CPU is slow; print rounds per second at the start so a slow night is obvious. (Task 4)

---

### Task 1: Features and the network, in the rules

**Files:** Modify `duel.html` (DUEL block, after `makeBot`), loaders' export lists (`duel-server.js` line ~11, `tools/balance.js` line ~12); create `tools/test-bot.js`

**Interfaces:**
- Produces: `botFeatures(S, side) -> Float32Array(28)`, `NET_SHAPE=[28,24,16,8]`, `netForward(theta:Float32Array, x:Float32Array) -> Float32Array(8)`, `makeNetBot(side, theta, skillOf) -> (S, dt)=>void` (same calling shape as `makeBot`'s result).

- [ ] **Step 1: Write the failing tests.**

```js
ok('the network has 1232 weights',D.NET_SHAPE.reduce((n,k,i,a)=>i?n+a[i-1]*k+k:0,0)===1232);
ok('zero weights give zero outputs',Array.from(D.netForward(new Float32Array(1232),new Float32Array(28).fill(1))).every(v=>v===0));
ok('a hand-set weight gives the hand-computed output',(()=>{ const th=new Float32Array(1232); th[0]=1; th[28*24+24+0]=1; th[28*24+24+24*16+16+0]=1; const x=new Float32Array(28); x[0]=0.5;
  return Math.abs(D.netForward(th,x)[0]-Math.tanh(Math.tanh(0.5)))<1e-6; })());          // weights stored layer by layer, row by row (output index major), then that layer's biases
ok('features have 28 finite numbers in a sane range',(f=>f.length===28&&Array.from(f).every(v=>Number.isFinite(v)&&Math.abs(v)<=4))(D.botFeatures(fight(),0)));
ok('features are mirrored: swapping sides and flipping the arena changes nothing',close(D.botFeatures(fight(),0),D.botFeatures(mirrored(fight()),1),1e-6));
ok('a net bot presses buttons through setInput and never throws',(()=>{ const S=fight(), b=D.makeNetBot(1,randomTheta(1),()=>0.55); for(let i=0;i<600;i++){ b(S,1/60); S.step(1/60); } return true; })());
ok('it reacts no faster than its delay',msFromFoeMoveToJump(0.55)>=0.12*1000+0.2*0.45*1000-17);      // theta wired by hand so only the "foe mid-move" feature drives the jump output; the foe starts a move and we time the first jump press
```

- [ ] **Step 2: Run** `node tools/test-bot.js`. Expected: `D.NET_SHAPE` is undefined (`FAIL`).
- [ ] **Step 3: Implement** the three functions and `makeNetBot` (ring buffer of past features for the delay; press-rate limit).
- [ ] **Step 4: Run** `node tools/test-bot.js && node tools/test-world.js`. Expected: all pass.
- [ ] **Step 5: Commit** `git add tools/test-bot.js && git commit -am "Bot: feature reader and network forward pass in the rules"`.

### Task 2: Evolution strategy

**Files:** Create `bot/es.js`; modify `tools/test-bot.js`

**Interfaces:**
- Produces: `esInit(n, seed) -> {theta:Float32Array, gen:0, seed}`; `esAsk(state, {pop:64, sigma:0.1}) -> [Float32Array]` (mirrored pairs, deterministic from `state.seed` and `state.gen`); `esTell(state, fitnesses:[number], {lr:0.03, decay:0.005}) -> state` (rank-shaped update, `gen+1`).

- [ ] **Step 1: Write the failing tests** on a toy problem: fitness `-sum((theta[i]-target[i])^2)` in 20 dimensions.

```js
ok('ask returns mirrored pairs around theta',(c=>c.length===64&&close(add(c[0],c[1]),scale(st.theta,2),1e-5))(ES.esAsk(st,{pop:64,sigma:0.1})));
ok('the same state asks the same candidates',close(ES.esAsk(st,{pop:64,sigma:0.1})[5],ES.esAsk(st,{pop:64,sigma:0.1})[5],0));
ok('150 generations cut the toy loss by 90%',lossAfter(150)<0.1*lossAfter(0),[lossAfter(0),lossAfter(150)]);
ok('rank shaping ignores the scale of fitness',close(tellWith(f=>f).theta,tellWith(f=>f*1000).theta,1e-6));
```

- [ ] **Step 2: Run** the tests. Expected: `Cannot find module '../bot/es.js'`.
- [ ] **Step 3: Implement** with a seeded generator (mulberry32) and Box-Muller normals.
- [ ] **Step 4: Run** the tests. Expected: all `ok`.
- [ ] **Step 5: Commit** `git add bot/es.js && git commit -am "Bot: evolution strategy with mirrored sampling"`.

### Task 3: Arena and fitness

**Files:** Create `bot/arena.js`, `bot/people.js` (the three scripted players copied from `tools/balance.js`; do not edit that file); modify `tools/test-bot.js`

**Interfaces:**
- Consumes: `createDuel, makeBot, makeNetBot, botLoadout` from the block.
- Produces: `playRound(playerA, playerB, {flip}) -> {w:0|1|-1, hpDiff, t, timeout}` where a player is `{make(side) -> (S, dt)=>void}`; `opponent(kind) -> player` for `'classic0.3'|'classic0.55'|'classic0.8'|'masher'|'jumper'|'kiter'`; `netPlayer(theta, skill=0.55) -> player`; `fitness(theta, league:[player], rounds=24) -> number`.

- [ ] **Step 1: Write the failing tests.**

```js
ok('a round between two classic bots ends with a result',(r=>[0,1,-1].includes(r.w)&&r.t>3&&r.t<=110)(A.playRound(A.opponent('classic0.55'),A.opponent('classic0.55'),{flip:0})));
ok('both sides get the same loadout',sameLoadoutSeen===true);
ok('a bot that never presses loses to the masher and scores below zero',A.fitness(new Float32Array(1232),[A.opponent('masher')],12)<0);
ok('fitness of classic against itself is near zero',Math.abs(meanOf(40,()=>score(A.playRound(A.opponent('classic0.55'),A.opponent('classic0.55'),{flip:Math.random()<0.5}))))<0.25);
ok('one round takes under 250 ms',msPerRound<250,msPerRound);
```

- [ ] **Step 2: Run** the tests. Expected: `Cannot find module '../bot/arena.js'`.
- [ ] **Step 3: Implement.** Step the sim at 1/60 like `tools/balance.js` does at 1/30; stop at 110 s.
- [ ] **Step 4: Run** the tests. Expected: all `ok`; note `msPerRound`.
- [ ] **Step 5: Commit** `git add bot/arena.js bot/people.js && git commit -am "Bot: headless arena, league opponents, fitness"`.

### Task 4: Trainer

**Files:** Create `bot/train.js`, `bot/worker.js`; modify `.gitignore` (add `bot/checkpoints/`), `tools/test-bot.js`

**Interfaces:**
- Produces: the command line in Design; `bot/checkpoints/gen-NNNN.json`, `bot/checkpoints/log.csv` with columns `gen,secs,best,mean,vsClassic,roundsPerSec`.

- [ ] **Step 1: Write the failing tests** (they run the trainer as a child with tiny settings: `--gens=3 --pop=8 --rounds=2 --workers=2 --out=<temp dir>`).

```js
ok('three generations write three checkpoints and a log',files.filter(f=>/^gen-\d{4}\.json$/.test(f)).length===3&&logLines===4);
ok('a checkpoint holds 1232 finite weights',ck.theta.length===1232&&ck.theta.every(Number.isFinite)&&ck.gen===3);
ok('running again resumes at generation 4',secondRunFirstGen===4);
ok('a half-written newest checkpoint is skipped, not fatal',resumedFromGenAfterTruncating===2);
ok('it prints rounds per second at the start',/rounds\/s/.test(stdout));
```

- [ ] **Step 2: Run** the tests. Expected: the child fails with `Cannot find module`.
- [ ] **Step 3: Implement** a worker pool that scores candidates in parallel; write each checkpoint to a temporary name and rename it; add the generation's champion to the league every 25 generations; measure `vsClassic` (100 rounds against classic 0.55) every 10 generations.
- [ ] **Step 4: Run** the tests. Expected: all `ok`.
- [ ] **Step 5: Commit** `git add bot/train.js bot/worker.js && git commit -am "Bot: resumable parallel trainer"`.

### Task 5: In the game, behind a switch

**Files:** Modify `duel-server.js` (`newRoom` reads `brain`; load `bot-weights.json` if present), `duel.html` (the menu button that starts a bot room near `startMatch`), `tools/balance.js` (a `--brain=net` option for `bot`), `tools/test-bot.js`

**Interfaces:**
- Produces: `POST /duel/room?bot=1&brain=net`; `bot-weights.json` as `{theta:[...1232], rules:<hash of the DUEL block text>, gen, vsClassic}`; `GET /info` gains `brains:['classic'] | ['classic','net']`.

- [ ] **Step 1: Write the failing tests** against a child `node server.js` on port 3194 with a random-weights `bot-weights.json` in place.

```js
ok('/info lists the trained brain when weights exist',info.brains.join()==='classic,net');
ok('a brain=net room is played by the network: Red moves',Math.abs(redXAfter5s-redXStart)>20);
ok('without weights the room quietly uses the classic bot',noWeightsInfo.brains.join()==='classic'&&noWeightsRoomPlays);
ok('weights from other rules are reported',/different rules/.test(serverLogWithStaleHash));
```

- [ ] **Step 2: Run** the tests. Expected: `info.brains` is undefined (`FAIL`).
- [ ] **Step 3: Implement.** Show the menu switch only when `/info` lists `net`.
- [ ] **Step 4: Run** `node tools/test-bot.js`, then verify in the browser on port 3114 that a "trained" bot room starts and the bot plays.
- [ ] **Step 5: Commit** `git commit -am "Game: trained CPU as an optional brain"`.

### Task 6: Train overnight, judge it honestly

**Files:** Create `bot-weights.json` (only if the bar is cleared or as an experimental option, see below); modify `README.md`, `CLAUDE.md`

- [ ] **Step 1: Start training** in the background: `node bot/train.js --hours=6 --workers=8 --out=bot/checkpoints`. Confirm the first generations appear in `log.csv` and note rounds per second. If the machine is on battery, say so in the report.
- [ ] **Step 2: When it ends, evaluate the champion** (the checkpoint with the best `vsClassic`): 400 rounds against classic 0.55 and against each scripted player, mirrored loadouts. Also print its presses per second and its share of rounds ended by knockout.
- [ ] **Step 3: Apply the shipping bar** from Design. Cleared: commit the champion as `bot-weights.json`. Missed: commit it as `bot/experimental-weights.json`, leave the switch hidden, and write down the numbers.
- [ ] **Step 4: Run** `node tools/test-bot.js && node tools/test-world.js && node tools/balance.js bot --n=200`. Expected: tests pass; the classic bot's table as on `4df868c` within 6 points.
- [ ] **Step 5: Document and commit.** `README.md`: how to train, the switch. `CLAUDE.md`: the 28 features, the network shape, the league, the measured results, and that no person has played against it. `git commit -am "Bot: overnight training result and notes"`.
