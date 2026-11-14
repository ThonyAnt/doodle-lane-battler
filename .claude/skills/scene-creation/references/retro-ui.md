# Cloning the retro interface

When a scene needs a program that is not on the desktop yet, its window must look exactly like the late-90s original
would: same furniture, same proportions, same wording. This file says how to get there. Read it before drawing a new
window.

Why exactness matters here: the joke of every scene is recognition. People who used these programs remember them in
their hands, not in words. A toolbar that is two pixels too tall or a dialog that says "Okay" does not register as a
mistake; it registers as "some old computer", and the scene loses the thing that makes it funny.

## 1. Research the real program first

Do this every time, even for a program you think you remember. Search the web and read before designing.

Look for:

- **Screenshots of the era's version** at original size (mid to late 1990s; the desktop in this game is of that
  period). Several, in different states: empty, in use, with a dialog open, with an error.
- **Interface guidelines and write-ups** from the period, and pixel-accurate recreations other people have built in
  CSS. They give the measurements screenshots only suggest.
- **The wording.** Menu names in order, the items people used most, toolbar tooltips, dialog titles and button
  labels, status bar fields, error messages word for word. Wording is the cheapest fidelity there is and the most
  recognisable.
- **The habits.** What the pointer turns into over each part. What a selection looks like. What happens while it is
  busy. The thing everyone remembers it doing wrong.

Write down what you found, with where you found it, in a short note at the top of the scene's drawing code or in the
pull request, so the next person can check a detail without repeating the search. Say plainly which details you could
not confirm and guessed.

What to collect, as a checklist:

| Part | What to pin down |
|---|---|
| Window | Title bar text pattern ("Document - Program"), its small icon, which caption buttons |
| Menu bar | The menu names, in order |
| Toolbars | How many rows, which buttons in which order, where the separators are, any drop-down boxes (font, size, zoom) |
| Work area | Background colour, rulers, gridlines, headers, margins, how the document itself is drawn |
| Edges | Scroll bars, status bar fields and their text, tabs, splitters |
| Pointers | The pointer over each area, and while dragging, selecting, busy |
| Selection | Its colour and outline, handles, marching ants or solid |
| Dialogs | The two or three everyone met: their size, icon, wording, button labels and order |
| Failure | Its most familiar error message and what the program looked like when it hung |

## 2. Reuse what the desktop already has

The game already draws a late-90s desktop: the window frame and title bar, caption buttons, menu bar, tool buttons,
sunken panels, status bar, small windows, dialogs, the taskbar and its buttons. A new program must sit next to these
and match them pixel for pixel, so build it from the same parts instead of redrawing them.

- `inkshop.css` holds the desktop's styles (windows, title bars, menus, panels, bevels, the taskbar). It was merged
  from a teammate's prototype and is kept verbatim between markers; do not edit inside the markers. Add a scene's own
  rules outside them or in `duel.html`'s style block.
- `duel.html` has the markup inside `#inkos`, the helper that makes the game's own windows (`retroWindow`), and the
  styles under `body.retro`.
- The spreadsheet stage is the model for re-dressing the main window as another program: a body class
  (`sheetstage`) hides the paint program's parts and shows the new program's toolbar, name box, formula bar and tabs;
  the title bar text and icon are swapped. Search for `sheetstage` and copy the approach.

Take colours, bevels, fonts and sizes from those files, not from memory and not from a different recreation, so two
programs on the same desktop cannot disagree about what grey is.

Parts that are drawn on the arena canvas (the document itself, pointers, selections) cannot use the CSS, so match it
by eye and by number: same greys, same one-pixel lines (draw them one device pixel wide whatever the zoom), same font
at the same size.

## 3. Clone the look, invent the identity

- **Clone:** layout, proportions, control styles, colours, pointers, the wording of menus, dialogs and errors, the
  way the document is drawn.
- **Invent:** the program's name, its logo and icons, the company, any mascot or assistant character, and the
  document's contents. Names are parodies in the house style ("Granola Sheets 97", "InkShop 2.0"). Icons are drawn
  fresh, in the same small pixel style, and must not reproduce a real product's logo.

A real product's name, logo or character in the game is a problem for the team and adds nothing; the parody name is
funnier anyway.

## 4. Check the result

Put a screenshot of the new window next to a screenshot of the real program and next to the game's existing windows.

- At a glance, does it read as that kind of program and no other?
- Do the frame, title bar, menu bar and status bar match the neighbouring windows exactly?
- Is every piece of text something the real program would have said?
- Are thin lines still one pixel thin, and is text crisp, at the sizes the game is played at?
- Is anything on screen a real name, logo or icon? Replace it.
- With the fight running, can the fighters and the platforms still be read against the document? Fidelity gives way
  to readability where they collide: lighten the document, never the fighters.
