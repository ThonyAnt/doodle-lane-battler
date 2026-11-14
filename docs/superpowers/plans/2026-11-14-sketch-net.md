# On-device Doodle Recogniser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Train our own small neural network on public doodle data so the game recognises a drawing in a few milliseconds on the device, with the cloud model only adding the name, and so the game still recognises drawings when the network or the API is down.

**Architecture:** Strokes are drawn into a 28x28 picture by one shared rasteriser used for both training and play. A three-layer network trained offline in Python with numpy is exported as 8-bit weights and run by a small hand-written JavaScript forward pass. Its answer is shown at once and is the fallback when the cloud read fails; when the cloud answers, the cloud wins.

**Tech Stack:** JavaScript for the rasteriser and inference (no dependencies). Python 3 with numpy 2.4 for training only (already on this machine). Data: Google's Quick, Draw! dataset (CC BY 4.0).

**Spec:** the "Design" section of this file.

**Branch:** `sketch-net`, cut from `origin/main` at `4df868c`. Preview port 3115.

## Design

- **Today:** `POST /duel/act` with `type:'item'` sends strokes and a PNG; `readDrawing` in `duel-server.js` asks OpenAI and falls back to `localGuess(strokes)` (DUEL block, line ~654), a set of hand-written shape rules. `validItem` turns any answer into a legal item.
- **Rasteriser:** `rasterize(strokes) -> Float32Array(784)`: scale the drawing's bounding box to fit 24x24 keeping its proportions, centre it in 28x28, draw each polyline with a soft round brush of radius 0.9 px (pixel value from distance to the nearest segment), values 0..1. The same code draws the training pictures from the dataset's strokes, so training and play see the same kind of picture.
- **Classes:** about 40 Quick, Draw! categories that map onto the game's items, chosen from the dataset's own category list: bladed and blunt weapons, things that shoot, things thrown, shields and umbrellas, things that move you, food, explosives, plus a few common non-weapons players draw (cat, flower, house, star). `sketch/classes.json` maps each to `{kind, style, element, name}` using only the kinds and styles `validItem` accepts.
- **Data:** the "simplified drawings" files, one newline-delimited JSON file per category, read with an HTTP range request for the first 8 MB each. Use 5,000 drawings per class for training, 500 for validation, 500 for test, split by position in the file. Confirm the file addresses and the licence from the dataset's README before downloading.
- **Network:** 784 -> 256 (ReLU) -> 96 (ReLU) -> classes (softmax). Adam, learning rate 0.001, batch 128, 12 epochs, keep the epoch with the best validation accuracy. Each training drawing is jittered at stroke level (rotation up to 10 degrees, scale 0.9 to 1.1, each point moved up to 1.5% of the box) before rasterising.
- **Export:** `sketch-net.json`: per layer the weights as base64 int8 with one scale per layer, biases as float32, the class list, and the test accuracy.
- **Inference:** `SketchNet.classify(strokes) -> [{cls, p}]`, top three.
- **Use in the game:** `smartGuess(strokes)` returns the class's item when the top probability is at least 0.6, otherwise `localGuess(strokes)`. The server uses it wherever it used `localGuess`. The page shows "looks like: sword (87%)" under the drawing the moment the pen lifts. `?sketch=0` and `SKETCH=0` switch it off.
- **Bars:** on the held-out test set, top-1 at least 80% and top-3 at least 93% are the targets; below 70% top-1 the feature ships switched off. On the game's own stock drawings (the strokes behind `stockItem`), at least 80% must map to the right item kind.

## Global Constraints

- No runtime dependencies; Python and numpy are used only by the training scripts and are not needed to run the game.
- The DUEL block stays DOM-free and loadable with `new Function(block+';return {...}')`. It must not name `SketchNet`; `smartGuess` is passed the classifier or lives outside the block.
- `sketch/data/` is git-ignored. `sketch-net.json` is committed and must be under 400 kB.
- If the dataset cannot be downloaded, stop and report. Do not substitute invented or self-drawn training data.
- Add the dataset's attribution to `README.md`.
- `node tools/test-world.js` and `node tools/check-anim.js` keep passing.
- Work only in this branch's worktree. Never touch `/Users/benliu/HackPrinceton`. Commit after every task. Do not push. Never print or commit `.env`.

## Review Focus

- Our players draw with a thick pen on a tablet, bigger and messier than the dataset: the stock-drawing check is the only evidence it carries over; report it separately from test accuracy. (Task 5)
- A drawing that is none of the classes (a dragon, a name): confidence must fall below 0.6 and `localGuess` take over, never a confident wrong item. (Task 4)
- One dot, an empty drawing, a single straight line: no crash, no NaN. (Task 1)
- JavaScript and Python disagreeing after 8-bit export. (Task 4)
- A slow tablet: the classifier must not delay the pen. (Task 4)

---

### Task 1: Rasteriser

**Files:** Create `sketch/raster.js` (UMD: `module.exports` and `window.SketchRaster`), `tools/test-sketch.js`

**Interfaces:**
- Produces: `rasterize(strokes) -> Float32Array(784)`; `strokes` is `[[{x,y},...],...]` as the game stores them, or `[[[x...],[y...]],...]` as the dataset does (`fromQuickDraw(drawing) -> strokes` converts).

- [ ] **Step 1: Write the failing tests.**

```js
const line=[[{x:0,y:0},{x:100,y:0}]], R=SR.rasterize, row=(a,r)=>Array.from(a.slice(r*28,r*28+28)).reduce((s,v)=>s+v,0);
ok('784 values between 0 and 1',(a=>a.length===784&&a.every(v=>v>=0&&v<=1))(R(line)));
ok('a horizontal line lights the middle rows only',(a=>row(a,13)+row(a,14)>10&&row(a,5)===0&&row(a,22)===0)(R(line)));
ok('moving or scaling a drawing changes nothing',close(R(line),R([[{x:500,y:300},{x:900,y:300}]]),1e-6));
ok('a tall drawing keeps its proportions',(a=>row(a,2)>0&&row(a,25)>0&&a[14*28+2]===0)(R([[{x:0,y:0},{x:0,y:100}]])));
ok('stroke order and direction do not matter',close(R([[{x:0,y:0},{x:50,y:80}],[{x:50,y:0},{x:0,y:80}]]),R([[{x:0,y:80},{x:50,y:0}],[{x:50,y:80},{x:0,y:0}]]),1e-6));
ok('empty, one dot and repeated points do not break',[[],[[{x:5,y:5}]],[[{x:1,y:1},{x:1,y:1}]]].every(s=>R(s).every(Number.isFinite)));
ok('dataset strokes convert',SR.fromQuickDraw([[[0,255],[10,10]]])[0][1].x===255);
ok('fast',(()=>{ const t=Date.now(); for(let i=0;i<200;i++) R(line); return Date.now()-t<200; })());
```

- [ ] **Step 2: Run** `node tools/test-sketch.js`. Expected: `Cannot find module '../sketch/raster.js'`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: all `ok`.
- [ ] **Step 5: Commit** `git add sketch/raster.js tools/test-sketch.js && git commit -m "Sketch: shared rasteriser"`.

### Task 2: Classes and data

**Files:** Create `sketch/classes.json`, `sketch/fetch-data.js`, `sketch/build-set.js`; modify `.gitignore` (add `sketch/data/`), `tools/test-sketch.js`

**Interfaces:**
- Consumes: `rasterize`, `fromQuickDraw`; `validItem` from the DUEL block.
- Produces: `sketch/data/<class>.ndjson` (partial files), `sketch/data/{train,val,test}.bin` (uint8 pictures, 784 bytes each) with `{train,val,test}.labels.bin` (one byte each), `sketch/data/meta.json` (`{classes, counts}`).

- [ ] **Step 1: Write the failing tests.**

```js
const C=require('../sketch/classes.json');
ok('35 to 45 classes',C.length>=35&&C.length<=45,C.length);
ok('every class maps to an item the game accepts unchanged',C.every(c=>{ const v=D.validItem({name:c.name,kind:c.kind,style:c.style,element:c.element},null); return v&&v.kind===c.kind&&(v.style||'')===(c.style||''); }));
ok('all six kinds are covered',['melee','ranged','bomb','shield','dash','heal'].every(k=>C.some(c=>c.kind===k)));
ok('the built set has 5000/500/500 per class and no class is missing',meta.counts.train===5000*C.length&&meta.counts.val===500*C.length&&meta.counts.test===500*C.length&&labelsSeen.size===C.length);       // skipped with a printed note if sketch/data is absent
ok('train and test do not share a drawing',overlap===0);
```

- [ ] **Step 2: Run** the tests. Expected: `Cannot find module '../sketch/classes.json'`.
- [ ] **Step 3: Implement.** Read the dataset's README and category list first; pick only categories that exist there. `fetch-data.js` downloads the first 8 MB of each file and drops a trailing partial line; `build-set.js` rasterises and writes the binary files (unjittered).
- [ ] **Step 4: Run** `node sketch/fetch-data.js && node sketch/build-set.js && node tools/test-sketch.js`. Expected: all `ok`. If the download fails, stop here and report.
- [ ] **Step 5: Commit** `git add sketch/classes.json sketch/fetch-data.js sketch/build-set.js .gitignore && git commit -m "Sketch: class map, data fetch, training set builder"`.

### Task 3: Training

**Files:** Create `sketch/train.py`, `sketch/jitter.js` (writes jittered epochs: `node sketch/jitter.js <epoch>` -> `sketch/data/train-<epoch>.bin`); modify `tools/test-sketch.js`

**Interfaces:**
- Produces: `python3 sketch/train.py [--selftest] [--epochs 12]` writing `sketch-net.json` (format in Design) and `sketch/data/metrics.json` (`{val:[...per epoch], test_top1, test_top3, per_class:{...}}`).

- [ ] **Step 1: Write the failing tests** (the self-test is in the Python script; the Node test runs it as a child).

```js
ok('gradient check: analytic and numeric gradients agree',selftest.grad_max_rel_err<1e-4,selftest);
ok('the network can memorise 20 pictures',selftest.overfit_acc===1);
ok('the same seed trains the same weights',selftest.repeat_equal===true);
```

- [ ] **Step 2: Run** the tests. Expected: `python3: can't open file 'sketch/train.py'`.
- [ ] **Step 3: Implement** forward, backward, Adam and the export in numpy; `--selftest` prints one JSON line with the three fields above.
- [ ] **Step 4: Run** the tests, then train: `for e in $(seq 1 12); do node sketch/jitter.js $e; done; python3 sketch/train.py --epochs 12`. Expected: tests `ok`; `metrics.json` written; note `test_top1` and `test_top3`.
- [ ] **Step 5: Commit** `git add sketch/train.py sketch/jitter.js sketch-net.json && git commit -m "Sketch: numpy trainer and the trained network"`.

### Task 4: Inference in JavaScript

**Files:** Create `sketch-net.js` (UMD: `module.exports` and `window.SketchNet`); modify `tools/test-sketch.js`

**Interfaces:**
- Consumes: `sketch-net.json`, `rasterize`.
- Produces: `SketchNet.load(json) -> {classify(strokes) -> [{cls, p}] (top 3, p sums to at most 1), classes}`.

- [ ] **Step 1: Write the failing tests.** `sketch/train.py --dump 50` writes `sketch/data/parity.json`: 50 test pictures with the Python network's probabilities after 8-bit export.

```js
ok('JavaScript matches Python on 50 pictures',parity.every(s=>maxAbsDiff(N.classifyPicture(s.x),s.p)<1e-3));
ok('test accuracy matches the stored figure within 0.5 points',Math.abs(top1OnTestSet-json.test_top1)<0.005,top1OnTestSet);
ok('top-1 is at least 70% and top-3 at least 90%',top1OnTestSet>=0.70&&top3OnTestSet>=0.90,{top1OnTestSet,top3OnTestSet});
ok('a scribble is not a confident anything',N.classify(scribble)[0].p<0.6);
ok('an empty drawing returns nothing confident and no NaN',(r=>r.every(o=>Number.isFinite(o.p))&&(r.length===0||r[0].p<0.6))(N.classify([])));
ok('one classification takes under 5 ms',msEach<5,msEach);
ok('the weights file is under 400 kB',fs.statSync('sketch-net.json').size<400000);
```

- [ ] **Step 2: Run** the tests. Expected: `Cannot find module '../sketch-net.js'`.
- [ ] **Step 3: Implement** the forward pass on typed arrays.
- [ ] **Step 4: Run** the tests. Expected: all `ok`. If top-1 is under 70%, do not loosen the test: go to Task 6 and report.
- [ ] **Step 5: Commit** `git add sketch-net.js && git commit -am "Sketch: JavaScript inference, checked against Python"`.

### Task 5: In the game

**Files:** Modify `duel-server.js` (`readDrawing` near line 31 and its other `localGuess` uses; load the network at start), `duel.html` (the sketchbook's pen-up handler; the item card), the static file table (serve `sketch-net.js`, `sketch/raster.js`, `sketch-net.json`), `tools/test-sketch.js`

**Interfaces:**
- Produces: on the server and in the page, `smartGuess(strokes) -> spec` as in Design; the read reply's `source` becomes `'OpenAI' | 'sketch net' | 'local guess'`.

- [ ] **Step 1: Write the failing tests.** `STOCK` is every key `stockItem` accepts; its strokes are the game's own drawings.

```js
ok('the game\'s own stock drawings map to the right kind at least 80% of the time',rightKind/STOCK.length>=0.8,{rightKind,n:STOCK.length,misses});
ok('with no API key the server answers from the network',noKeyReply.source==='sketch net'&&noKeyReply.kind==='melee');      // child server on port 3195, posting the stock sword's strokes as a drawn item
ok('a scribble with no API key falls back to the local guess',scribbleReply.source==='local guess');
ok('SKETCH=0 restores the old behaviour',offReply.source==='local guess');
```

- [ ] **Step 2: Run** the tests. Expected: `FAIL` (`source` is `local guess`).
- [ ] **Step 3: Implement** `smartGuess`, the server wiring and the "looks like" line under the drawing.
- [ ] **Step 4: Verify in the browser** on port 3115 with no API key: draw a sword and a shield in the sketchbook; each shows "looks like" at once and becomes the right kind of item. Screenshot it. No console errors.
- [ ] **Step 5: Commit** `git commit -am "Game: instant on-device recognition with cloud naming"`.

### Task 6: Results and notes

**Files:** Modify `README.md`, `CLAUDE.md`

- [ ] **Step 1: Write the per-class table** from `metrics.json` (accuracy per class, the five most confused pairs) into `README.md` under "On-device recogniser", with the dataset attribution and the two switches.
- [ ] **Step 2: Apply the bars** from Design. If top-1 is under 70% or the stock check is under 80%, make the feature default to off and say so plainly.
- [ ] **Step 3: Run** `node tools/test-sketch.js && node tools/test-world.js && node tools/check-anim.js`. Expected: all pass (or the bar tests fail and the report says the feature is off).
- [ ] **Step 4: Update `CLAUDE.md`:** the files, how to retrain, the measured numbers, and "not tested on real tablets or real players' drawings".
- [ ] **Step 5: Commit** `git commit -am "Sketch: results, attribution, notes"`.
