# The beat sheet

A beat sheet is the scene's script as a timed table. Write it before any code and show it to the owner; it is the
cheapest place to find out that a scene is not funny, not fair, or just a skin.

## Template

Start with four lines of setup, then the table.

```
Scene:        <parody name of the program> — <the document that is open>
The user:     <who is at the keyboard, what they are trying to get done, by when>
Their voice:  <where their words appear: formula bar, status bar, speaker notes, title bar...>
Inside joke:  <what the owner asked for, or "none">
Signature:    <the one change to the arena that no other scene has>
```

| Time | What the user does | What changes under the fighters | What the user "says" | Warning the players get |
|---|---|---|---|---|
| 0 s | ... | ... | ... | ... |

Rules of thumb for filling it in:

- **A beat every three to five seconds.** Longer gaps feel like nothing is happening; shorter ones are noise.
- **Three acts.** Routine (about the first third), it goes wrong (the middle), they notice (the last third and on).
- **Every row with a change has a warning** of about a second: the cursor travels there, the text is typed, a button
  goes in. If you cannot say what the warning is, the change is unfair.
- **Count the kinds of change.** Appears, moves, vanishes, replaced. Use at least three.
- **Mark the hazards and their damage.** Fighters have `HP` health (see the constant in the rules). Keep any one hit
  small next to a weapon's hit, so the players decide the round and the scene only shapes it.
- **End on a loop that tightens.** The last row describes a state that repeats and speeds up until the round clock
  runs out.
- **No dice.** Positions and timings are fixed numbers. If you want something to look scattered, scatter it by hand or
  with a fixed formula.

## Worked example: the spreadsheet stage

```
Scene:        Granola Sheets 97 — Anthropik_IPO_model_v7_FINAL_final(2).xls
The user:     a banker finishing a valuation model; the IPO prices at 9am
Their voice:  the formula bar, typed live
Inside joke:  the company is "Anthropik" (a deliberate misspelling), every figure invented
Signature:    select all, delete: the whole arena is erased and comes back with Ctrl+Z
```

| Time | What the banker does | What changes under the fighters | Formula bar | Warning |
|---|---|---|---|---|
| 0 s | Starts the model | Three filled cells are the platforms: Revenue, EBITDA, an NPV row | `=DCF(Anthropik)     // IPO prices at 9am. focus.` | Cell border on the cell he is in |
| 4 s | Types a growth rate | A small cell appears high up | `growth = 40%. forever. obviously.` | Cursor moves to the cell first |
| 8 s | Drags Revenue two columns over | That platform slides right over 1.6 s and carries whoever is on it | `dragging Revenue two columns over...` | Move pointer and dashed outline |
| 12 s | Copies and pastes EBITDA | A new platform appears | `Ctrl+C   Ctrl+V     // nobody checks adjusted EBITDA` | Cursor moves there |
| 16 s | Deletes the NPV row | The lowest platform vanishes | `delete the NPV row. never liked it.` | Cursor on the row |
| 19 s | Fills a column down | Three small steps appear on the left | `fill down. looks like a model now.` | Cursor moves there |
| 22 s | Reads the result | Nothing; a beat of quiet | `why is enterprise value NEGATIVE` | |
| 23.5 s | Selects everything | Whole sheet highlighted | `THIS MODEL IS COOKED` | The highlight is the one-second warning |
| 24.5 s | Presses Delete | Every platform gone; ten `#REF!` errors fall (5 damage each) | `#REF!   #REF!   #REF!   #REF!` | Errors fall from above the view |
| 29.5 s | Undo, undo, undo | Revenue and EBITDA come back | `Ctrl+Z   Ctrl+Z   Ctrl+Z   Ctrl+Z` | |
| 32.5 s | Rebuilds the terminal value | A wide platform returns | `ok. terminal value. breathe.` | Cursor moves there |
| 36.5 s | Looks closer | Nothing | `...are there two guys FIGHTING in my model?` | The line itself warns of the finale |
| 38.5 s on | Selects where a fighter stands and presses Delete, then the other, faster each time | A selection box follows one fighter, locks, erases what is inside (12 damage and a launch) | `GET.   OUT.   OF.   MY.   SHEET.` then `select.  delete.  select.  delete.` | The box follows, then holds still before it deletes |

Why it works, in the terms of the six principles:

- **Changing arena:** platforms appear (4, 12, 19 s), move (8 s), vanish (16 s), and are all replaced (24.5 s, 29.5 s).
- **Interface as obstacle:** cell fill, drag and drop, paste, delete row, select all, error values, undo, the selection
  box. Eight pieces of the program, no generic hazard.
- **Story:** routine (0 to 22 s), it goes wrong (22 to 33 s), he notices (36.5 s on). The biggest joke, the rage
  delete, is also the biggest change to the arena.
- **Inside joke:** Anthropik.
- **Length:** the story takes about fifty seconds; the hunt then tightens until the round ends.
- **Clone:** the window has the toolbar, name box, formula bar, grey column letters, row numbers and sheet tabs of a
  late-90s spreadsheet, the fat white cross pointer, and a model laid out the way a banker would lay it out.

The script lives in the rules in `duel.html` as the `SCRIPT` array; read it there for the exact numbers.
