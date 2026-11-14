# Doodle Duel animation clips

Fighter animation for `duel.html` is authored as data: keyframed skeleton poses that the engine in `core.js` interpolates, constrains (limbs never stretch) and draws. Each move set lives in its own file and registers clips with `ANIM.add(name, clip)`.

| File | Contents |
|---|---|
| `core.js` | Pose format, `ANIM.P`, `ANIM.add`, sampling, IK, drawing, slash trail. Read its header comments first. |
| `example.js` | One fully commented clip. |
| `locomotion.js` | Idle, run, sprint, jump, fall, land, hit reactions. |
| `blade.js` | Broadblade combo and variants. |
| `bow.js` | Bow shots. |
| `gun.js` | Gun shots. |
| `spear.js` | Spear combo and variants. |
| `hammer.js` | War hammer combo and variants. |
| `fist.js` | Punches and kicks; also used when nothing is drawn. |
| `staff.js` | Magic staff casts. |
| `hurl.js` | Thrown weapons (shuriken, knives, rocks). |
| `dual.js` | A one-handed weapon in each hand (twin swords, daggers). |
| `akimbo.js` | A pistol in each hand. |
| `ultimate.js` | The ultimate (`fleet`): float up, command the copies forward. |

## Style target

Alan Becker's stick fights and the Chinese game 火柴人联盟 (League of Stickman): fast, readable, exaggerated, never stiff.

- **Anticipation, then speed.** Every action has a clear wind-up in the opposite direction, then reaches contact in very few frames (`ease:'snap'`), then overshoots and settles. Spend the time on the wind-up and the recovery, not on the strike.
- **The whole body acts.** Hips drop and drive, the spine leans along a clear line of action, the head leads or trails, the off hand counterbalances, feet re-plant or slide. A move where only the weapon arm changes is a failure.
- **Arcs.** Hands and weapon tips travel on curves. For swings use `orbit:1` so the blade sweeps a true circle about the shoulder; change `ang` by large amounts (often more than half a turn).
- **Compound, flowing motion.** Moves chain: the end of one is the wind-up of the next. Use spins (`turn` through 0 to -1 and back to 1), somersaults (`rot`), hops (feet above y=0) and deep crouches.
- **Strong silhouettes.** Each key pose should read clearly as a black shape: limbs apart, weapon clear of the body, wide stances, asymmetry.
- **Holds and settle.** A two or three frame hold just after contact sells impact. Finish with an overshoot past the rest pose before settling.

## Rules

- Units: local units, figure about 175 tall, facing right, feet on `y=0`, up is negative `y`. The game scales by 0.6.
- **No root motion.** The game moves the fighter (runs, lunges, jumps, knockback). Keep the hips within about ±25 of `x=0`. Feet may leave the ground for hops and air moves.
- Weapon angle `ang`: 0 points right (forward), negative is up, positive is down. Angles are not wrapped, so write a full forward spin as going from, say, -2.4 to 3.9.
- Timings in the move spec are fixed by the game rules: a clip's `dur` and its `marks` must match exactly. Everything else is yours.
- A clip that follows another in a combo should start from roughly the pose the previous one is in at its cancel time. The game cross-fades about 0.05 s between clips.
- Non-loop clips should end in a pose close to the set's stance so they blend back cleanly. Loops must have identical first and last keys.
- Use 6 to 14 keys per clip. Put keys close together around contact.
- Two weapons: the back hand's weapon has its own angle, `ang2` on each key (same convention as `ang`), and its own slash windows, `trail2`. A key without `ang2` carries the back weapon just below the front one, which is how the shared clips (idle, run, hit reactions) look when played with a pair. Set the clip's `weapon` to `'dual'` or `'akimbo'` so the lab draws both hands.
- The engine retimes the run-up to the first hit or shot "slow, then fast" (see `punch` in `core.js`), so author the wind-up and strike with honest, even timing and check the result in the strip. Add `punch:0` to a clip to keep its timing exactly as written.

## Preview

```
node tools/strip.js <clip[,clip2,...]> [frames] [out.png] [extra query]
node tools/strip.js blade1,blade2,blade3 24 anim/out/blade-combo.png
node tools/strip.js blade3 12 anim/out/blade3-contact.png "t0=0.22&t1=0.40"
```

This prints each clip's duration and marks, reports load errors, and writes a PNG of still frames with the previous frame ghosted and marks labelled in red. Open the PNG to check the motion. For live playback open `anim-lab.html` in a browser.
