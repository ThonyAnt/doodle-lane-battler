---
name: scene-creation
description: Design and build a new fight scene (stage, arena, level, map) for Doodle Duel, where a late-90s program open on the retro desktop becomes the arena, like the spreadsheet stage. Use this whenever the user asks for a new scene or stage, wants scene ideas, describes a program or a gag to fight inside ("one in an old email client", "the installer crashes at 99%", "make the slideshow one"), or wants to change, extend or fix an existing scene. Also use it before pitching scene ideas, so the pitch already follows the house rules.
---

# Scene creation for Doodle Duel

A scene is a late-90s program open on the game's retro desktop, with somebody using it while two stick figures fight
inside the document. The program's interface is the arena. The one scene that exists today is the spreadsheet stage
("Granola Sheets 97"): a banker builds an IPO model, the cells he fills in are the platforms, he deletes everything in a
rage and `#REF!` errors rain down, then he notices the fighters and hunts them with the selection box. Read its script
in `references/beat-sheet.md` before designing anything; it is the standard every new scene is measured against.

A scene is finished when someone who has used the real program laughs in recognition, and when a fight in it could not
be mistaken for a fight in any other scene.

## How to work

Work in this order. The first two steps are conversation, and they are where a scene is won or lost; do not start
building until the owner has agreed to the beat sheet.

### 1. Pitch, and ask about the inside joke

Pitch the scene in a few lines: the program, who is using it and what they are trying to do, what goes wrong, and the
two or three interface elements that become obstacles. If the user asked for ideas instead of one scene, pitch several in
the three-column shape used in `references/ideas.md` and recommend one.

Then ask, every time and before writing the script: **"Do you want an inside joke in this one?"** The team's own
references are what make a scene theirs (the spreadsheet's company is "Anthropik", a deliberate misspelling), and only
they know what is funny to them. Ask once, plainly, and offer where it could go: a name in the document, a line the
user types, a file name in the title bar. If the answer is no, do not invent one about real people or companies; a
made-up name is fine.

### 2. Research the program, if the scene needs a new one

If the scene takes place in a program that is not on the desktop yet, research the real thing before drawing a single
pixel: the layout of its window, its menus and toolbars, its dialogs and their exact wording, its cursors, its error
messages, the little habits everyone remembers. Search the web for screenshots, interface guidelines and write-ups of
the era's version of that kind of program, and read enough to be specific. The new window has to be an exact visual
clone of the retro interface, because the comedy depends on instant recognition: a nearly-right toolbar reads as a
generic "old computer" skin, while the right dotted focus rectangle on the right button reads as *that program*.

`references/retro-ui.md` says what to look up, what to reuse from the game's existing desktop, and what must be
invented (names, logos and icons are always original; the look and layout are cloned).

Skip this step only when the scene reuses a window that already exists.

### 3. Write the beat sheet and get it agreed

A beat sheet is the scene's script as a timed table: when, what the user of the program does, what changes under the
fighters, and what the user "says". `references/beat-sheet.md` has the template and the
spreadsheet's as a worked example. Check it against the six principles below, then show it to the owner. Changing a
row of a table is cheap; changing a built scene is not.

### 4. Build it

`references/anatomy.md` maps where a scene plugs into the code (rules, page, server, docs) and lists the constraints
that keep it fair and keep it working online. Follow the spreadsheet stage's pattern rather than inventing a second
one; if two scenes share machinery, lift it into something both use.

### 5. Show it

Give the owner a link that opens the scene directly (`/duel?stage=<id>`), say what you checked and what you did not,
and follow the working rules in the repo's `CLAUDE.md` (for example, whether test suites may be run without asking).
A scene is a thing to be watched, so offer a recording or stills when the owner is not at the machine.

## The six principles

### 1. The arena keeps changing

If the ground never changes, the scene is only wallpaper and the fight is the same fight as everywhere else. Something
about where the fighters can stand should change every few seconds, and over the scene it should change in at least
three different ways: ground appears, ground moves (and carries whoever is on it), ground vanishes, the whole layout is
replaced. Each scene should have one signature change that no other scene has.

### 2. Every obstacle is a piece of the program

This is the creative heart of a scene, and it deserves the most thought. List everything the real program has:
menus, toolbars, scroll bars, dialogs, cursors, selections, tooltips, progress bars, the status bar, error messages,
keyboard shortcuts, undo. Then ask of each one: *what would this do to a small body standing inside it?*

| Interface element | What it could do to a fighter |
|---|---|
| Selection box, then Delete | Hunts a fighter, locks, erases whatever is inside |
| Undo | Brings back the ground that was deleted |
| Drag and drop | A moving platform that carries its passengers |
| Scroll bar | Slides the whole arena sideways like a conveyor |
| Dialog box | Lands as a solid block; its buttons are steps |
| Progress bar | A floor that grows, stalls, and is taken away |
| Tooltip | A small ledge that exists for two seconds |
| Hourglass cursor | A patch of slow time |
| Error message | Falls from the top and hurts |
| Find and replace | Swaps two platforms under their feet |
| Sort A to Z | Reorders every ledge at once |
| Spell-check underline | A floor that stings |

Push past the first idea for each element; the second or third is usually the one that surprises. Turn at least four
or five elements into obstacles so the scene has texture.

Do not use generic game hazards: no spikes, lava, saws or lasers. If an obstacle could appear in any game, it does not
belong in this one. The test is whether someone who used the program in 1998 would recognise what just hit them.

### 3. A story with a punchline

Somebody is using the program, and at first they do not know there is a fight in their document. Give them a goal, a
mood and a deadline, and let the scene be the story of their minute. Three acts work well:

1. **Routine.** They work. The arena is built up by ordinary use of the program.
2. **It goes wrong.** A mistake, a crash, a rage. This is the big change in the arena.
3. **They notice.** They see the fighters, or blame them, or the machine gives up. This is the escalating finale.

The user speaks only through the program's own text: the formula bar, the status bar, speaker notes, a half-typed
e-mail, the title bar. Write it the way people type to themselves: lower case, short, deadpan, getting less composed
as things go wrong ("why is enterprise value NEGATIVE", then "THIS MODEL IS COOKED").

The punchline and the hazard should be the same beat. A joke that only sits in the text is a caption; a joke that
deletes the floor is a scene. Product and company names are parodies in the manner of "Granola Sheets 97".

### 4. An inside joke, if they want one

Covered in step 1: ask every time. It is listed here as a principle because it is easy to skip when the user seems to
be in a hurry, and it is the cheapest way to make a scene feel like theirs.

### 5. Thirty to sixty seconds

The scripted story takes between thirty seconds and a minute. Shorter and there is no room for three acts; longer and
most rounds end before the finale, so the best part is never seen. The round clock is longer than the script (see
`ROUND_TIME`), so the finale must be a state that keeps escalating until the round ends, as the spreadsheet's hunt does
by getting quicker each time.

Randomness is welcome. The story's beats come in the same order every round, but which cell, which dialog, where the
error lands, or which of two bad ideas the user has next can differ, so a scene stays surprising on the tenth play.
Keep the randomness even-handed: it should not lean toward the left or the right start.

### 6. An exact clone of the retro interface

Covered in step 2 and in `references/retro-ui.md`. The short version: research first, reuse the desktop's existing
window furniture so the new program matches its neighbours pixel for pixel, clone layout and wording faithfully, and
invent every name, logo and icon.

## Before calling it done

- The pitch was agreed, the inside-joke question was asked, and the beat sheet was shown before building.
- The script runs thirty to sixty seconds, has three acts, and its finale escalates until the round ends.
- The ground changes every few seconds, in at least three different ways.
- At least four interface elements are obstacles, and none is a generic game hazard.
- The user of the program has a voice, and the biggest joke changes the arena.
- A new program window was researched and matches the desktop around it; all names and icons are invented.
- The scene does not favour either starting side, freezes during an ultimate, and works in an online room (see
  `references/anatomy.md`).
- The owner has a link to it, and knows what was and was not checked.

## Reference files

- `references/beat-sheet.md`: the beat sheet template and the spreadsheet stage's script as the worked example. Read
  it before designing.
- `references/anatomy.md`: where a scene plugs into the code and the constraints it must respect. Read it before
  building.
- `references/retro-ui.md`: how to research and clone a program's look, and what the desktop already provides. Read
  it when the scene needs a new program window.
- `references/ideas.md`: scenes already pitched to the owner, and seeds for more. Read it when asked for ideas.
