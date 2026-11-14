# Anatomy of a scene

Where a scene plugs into the code, using the spreadsheet stage as the pattern. Identifiers are given by name, not line
number, because `duel.html` changes daily; search for them. The repo's `CLAUDE.md` has a bullet headed "Spreadsheet
stage" that describes the current implementation in more detail; read it too, and update it when you add a scene.

Read the existing scenes' code end to end before writing a new one. Search `duel.html` for `sheet` and for `deck`
(rules and page) and `duel-server.js` for `stage`. The slideshow (`deck`) is the newer of the two and shows two things
the spreadsheet does not: geometry shared between rules and page (`deckLayout`, `deckCover`, defined at the top level
of the rules block so both sides call the same functions), and replacing the whole arena through a transition
(`deckMix`).

## The three places a scene lives

### 1. Rules (in `duel.html`, between `/*DUEL-START*/` and `/*DUEL-END*/`)

This block is the match itself. The server runs the same text for online rooms, so it must not touch the page: no
`document`, no canvas, no timers. `Math.random` is fine: in a room the server rolls the dice and every device sees the
same result in the snapshot.

| Piece | In the spreadsheet stage | What a new scene needs |
|---|---|---|
| Choosing the scene | `createDuel({stage:'sheet'})` sets `S.sheet` | Its own stage id and state object |
| The script | `SCRIPT`: an array of `[seconds, h => { ... }]`, run in order as the scene clock `h.t` passes each time | The beat sheet, one entry per beat |
| The scene's state | `S.sheet`: clock `t`, next script index `i`, the user's line `msg` and when it was said, plus whatever the scene tracks (`move`, `rain`, `hunt`, cursor `cur`, `aim`) | Only what the page must draw and the rules must remember |
| Starting over | `sheetReset()`, called when a duel is made and when each round begins | The same; a round always starts from beat 0 |
| Each tick | `sheetTick(dt)`: advance the clock, run due script entries, move what is moving, apply hazards | The same shape |
| Platforms | The scene owns them: `SP` is its list, `sheetPush()` hands copies to `applyPlats`, and `S.setPlats` from outside is ignored while the scene is on | Give each platform a stable `id` and a `wx` (its left edge); `applyPlats` uses them to carry a fighter standing on a platform that moves |
| Hazards | `hurt(fighter, damage, element, knockX, knockY, by, fromX, stun, trait, hapticName, finisher)` with `by` as `null` | Always go through `hurt`, so health, hit-stop, overdrive and the hit events all behave as for any other hit |
| Effects for the page | `fx('del', {...})`, `fx('quake', {...})` | One event per moment the page should mark |
| What clients see | `sheetView()` builds the scene's part of the snapshot (`snapshot().sheet`): rounded numbers only, as little as will draw it | The same; online rooms send this many times a second |
| The user's voice | `say(h, text, column, row)` sets the line and where the cursor should travel | A helper like it for the scene's own text channel |

Where the scene is ticked matters. `tick` calls `sheetTick` only in the ordinary branch, after `world(dt)`. When an
ultimate is playing (`ultLock()` is not -1) and during hit-stop (`S.stop`), nothing in that branch runs, so the scene
stands still along with everything else. Tick a new scene in the same place and it gets this for free.

In practice mode the script loops (`sheetReset` when its clock passes its length), so the scene can be watched again
and again from the move tester or a practice match.

### 2. Page (the rest of `duel.html`, plus `inkshop.css`)

| Piece | In the spreadsheet stage |
|---|---|
| Opening the scene | `STAGE` is read from `?stage=`; the Stage button (`stageBtn`) toggles it; `sheetOn()` is true when the page or the room is on the scene |
| Drawing behind the fighters | `sheetBack(v, now)`: the grid, headings, cell contents, filled cells, the banker's cell border and typing |
| Drawing in front | `sheetFront`: pointer, selection box, falling errors, the hunt |
| Fitting the stage into the program's window | `sheetEmb()` and `sheetBox()` place the 960-wide stage inside the window's canvas area with the floor on its bottom edge; the view transform and the mouse-to-stage mapping (`s2w`) both use them |
| Re-dressing the window as the program | Body class `sheetstage`: CSS hides the paint program's tools, palette and timeline and shows the spreadsheet's toolbar, name box, formula bar and sheet tabs; the title bar text and icon change |
| Reacting to events | The event handler marks a `del` with a shake and a mark on the sheet |

A new scene needs its own drawing functions and its own body class. Follow `references/retro-ui.md` for the window.
If the scene needs a different stage size or a different way of fitting into the window, make the fitting code take
the scene as a parameter instead of copying it.

### 3. Server (`duel-server.js`) and the rest

- `newRoom(stage, ...)` accepts the stage from `POST /duel/room?stage=...` and passes it to `createDuel`; a rematch
  rebuilds the duel with the room's stage. It currently accepts only `'sheet'`; a new stage id has to be allowed in
  both places.
- The page's room-creation code already sends `STAGE` in the query.
- The big screen normally tells a room its layout and window ledges; on a scene those are ignored, because the scene
  owns the platforms.
- Docs: add a bullet to `CLAUDE.md` in the style of the spreadsheet's (what the script does, times, damage, where the
  state and drawing live), and a short paragraph to `README.md` for players.
- Tests: `tools/test-world.js` holds the rule tests. A scene deserves a few: the script reaches each act at the stated
  time, a platform that moves carries a fighter, each hazard does its stated damage, the scene resets between rounds,
  and it stands still during an ultimate. The repo's `CLAUDE.md` says whether test suites may be run without asking;
  follow it.

## Constraints that keep a scene fair and working

- **Randomness is allowed.** The owner wants scenes free to vary from round to round. Two things to know: draw the
  random numbers in the rules, never in the page, so every device in a room sees the same thing; and recorded matches
  (`record:true`) and the bot's training replay rounds from their inputs, so a scene that uses chance will not replay
  exactly. The owner has said that is acceptable.
- **Symmetry.** A hazard that targets a fighter must take turns or pick by a rule both players can read (the hunt
  starts with whoever has more health, then alternates). Layouts should not favour the left or right start.
- **The players decide the round.** Scene damage is a seasoning. The spreadsheet's errors do 5 and its delete 12
  against `HP` of 160; a scene that kills on its own is a cutscene with victims.
- **Always somewhere to stand.** Even at the scene's emptiest moment the floor remains, unless removing it is the
  scene's signature.
- **Light on the wire.** The scene's snapshot field is sent constantly: round the numbers, send ids and positions,
  let the page work out the rest. Things that never change (the document's static content) are drawn by the page
  from its own data, not sent.
- **Works on every screen.** The retro desktop embeds the scene in the program's window; phones and tablets used as
  controllers, the plain layout (`?plain=1`) and the big screen each draw it their own way. Check what the
  spreadsheet does in each before assuming.
- **Scenes are wired side by side.** `S.sheet` and `S.deck` each have their own reset, tick and view, hooked into the
  same handful of places (`createDuel`, `resetWorld`, `setPlats`, `setLayout`, `tick`, `snapshot`; on the page
  `sceneKind`, the body class, `render`; on the server `newRoom`). Adding a third is the moment to turn those hooks
  into a small table of scenes (id, reset, tick, view, draw), so the fourth costs less than the third.
- **The program's toolbars share holders.** Both programs' toolbar rows live in `#xlbar` and `#xltabs`, each row
  tagged `forsheet` or `fordeck`, and the body class decides which show. A new program adds its own tag.
