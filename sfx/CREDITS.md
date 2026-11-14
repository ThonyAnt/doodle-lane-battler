# Recorded sound effects

All files here are CC0 (public domain dedication), downloaded from OpenGameArt.org. No credit is required; the sources are listed so they can be found again.

| Files | Source | Author | Notes |
| --- | --- | --- | --- |
| `slash1.ogg` to `slash10.ogg` | [20 Sword Sound Effects (Attacks and Clashes)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) | StarNinjas | The ten attack sounds, unchanged. |
| `swishL1.wav` to `swishL4.wav`, `swishH1.wav` to `swishH4.wav` | [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack) | artisticdude | Four short swishes (L, light) and four long ones (H, heavy), unchanged. |
| `pistol1.wav` to `pistol4.wav` | [Gunshots](https://opengameart.org/content/gunshots), `22 Pistol.wav` | see the page | Single shots cut from the recording, converted to 44.1 kHz mono, faded and normalized. |
| `magnum1.wav` to `magnum3.wav` | [Gunshots](https://opengameart.org/content/gunshots), `22 Magnum.wav` | see the page | As above. |
| `punchM1-5.ogg`, `punchH1-5.ogg`, `clang1-5.ogg`, `mine1-5.ogg`, `step1-4.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | `impactPunch_medium`, `impactPunch_heavy`, `impactMetal_medium`, `impactMining`, `footstep_wood`; unchanged. |
| `scratch1-5.ogg`, `uiclick1-5.ogg`, `glitch1-4.ogg`, `confirm1-4.ogg`, `error1-3.ogg` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | `scratch`, `click`, `glitch`, `confirmation`, `error`; unchanged. |
| `zap1-4.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) | Kenney | `phaserUp1` to `phaserUp4`, unchanged. |
| `splash1-4.ogg` | [40 CC0 water / splash / slime SFX](https://opengameart.org/content/40-cc0-water-splash-slime-sfx) | rubberduck | `splash_09`, `_10`, `_15`, `_06`, unchanged. |
| `bubble1-3.wav` | [Bubble Sound Effects](https://opengameart.org/content/bubble-sound-effects) | BMacZero | `bubbles-single1` to `3`, unchanged. |
| `pop1-5.ogg` | [Pop sounds](https://opengameart.org/content/pop-sounds) | cogitollc | `pop1` to `pop5`, unchanged. |

Where the game plays them (all in `sfx.js`, each with a synthesized fallback): `punchM` / `punchH` on a hit, by its weight, with `splash` added for a water hit; `clang` on a block; `mine` when the pick chips something; `step` on a landing; `bubble` and `pop` when the drawn shield bubble goes up and bursts; `scratch` when a drawn shape appears; `confirm` when an item is made; `glitch` when a hack starts; `error` for the banker's delete; `zap` for a staff shot; `uiclick` for buttons.

`sfx.js` plays them: `slash` for blade and twin-blade swings, `swishL` / `swishH` for other melee swings, `magnum` for a gun, `pistol` for twin pistols.
