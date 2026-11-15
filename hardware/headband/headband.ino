// Doodle Duel headband firmware: six motors + stereo speakers.
//
// Game lines (USB serial, 115200 baud, one line each). The patterns live in the page (haptics.js); the board only
// copies numbers and never waits on the game.
//   M m0 m1 m2 m3 m4 m5      motor strengths 0-255. Lines stop for 400 ms -> motors off.
//   S n [L|R|B]              play sound effect n (list below) on one side or both, full volume
//   V n volL volR            play sound effect n with its own volume per speaker, 0-100 each (V 18 100 25:
//                            a slash heard mostly on the left). 0 silences that side.
//   T L|R|B freq ms          one beep, e.g. T L 880 120
//   W f0 f1 ms volL volR     incoming whoosh: a sweep from f0 to f1 Hz over ms, rising from faint to vol per side.
//                            The page sends it when a shot is about to land; the impact's V line cuts it off.
//   F L|R|B level            footsteps that keep going: level 0 (far, faint, slow) to 100 (close, loud, fast).
//                            Send again to update. F X stops them; so does 1 s with no F line.
//                            Any other sound takes over while it plays, and the steps carry on after it.
//
// Sound effects: 1 swoosh, 2 hurt, 3 zap, 4 chime, 5 levelup, 6 left footsteps,
//   7 right footsteps, 8 walk, 9 run, 10 monster steps, 11 pan left->right, 12 pan right->left,
//   13 someone approaching from the left (gets louder), 14 approaching from the right,
//   15 walking away on the left (gets quieter), 16 walking away on the right,
//   17 stab, 18 slash, 19 shot, 20 arrow, 21 magic, 22 fire, 23 water, 24 plant, 25 smash, 26 punch,
//   27 clank (block), 28 lightning, 29 explosion, 30 burn tick, 31 thrown, 32 ultimate, 33 one footstep
//
// Typed in the Serial Monitor (New Line):
//   command,direction,intensity    e.g. hit,left,0.8        (haptics, plus a matching sound)
//   sound,swoosh,left              any effect by name, optional side: left right (blank = both)
//   vol,slash,100,20               any effect with a volume per side (left, right; 0-100)
//   steps,left,70                  footsteps that keep going at level 70 (steps,stop ends them)
//   incoming,right                 a whoosh rising on the right over half a second
//   sounds                         every attack sound (17-33): left, then right
//   stereo                         full sound test      balance   left/right beeps
//   help                           list everything
//
// Speakers: each pin -> its own 1k resistor -> joined at the speaker lead; other lead to GND.
//   Left:  D7, A0, A1, A2     Right: D13, A3, A4, A5
//   (If you only wired D7 and D13, it still works.)

const int PINS[6] = {3, 5, 6, 9, 10, 11};  // front, back, left, right, left temple, right temple
const int ALL = 63;
const int MIN_DRIVE = 90;
const int KICK_MS = 25;
const unsigned long TIMEOUT_MS = 400;
const long BAUD = 115200;

const int NSP = 4;
const int L_PINS[NSP] = {7, A0, A1, A2};
const int R_PINS[NSP] = {13, A3, A4, A5};
const int LEFT = 1, RIGHT = 2, BOTH = 3;

int DUTY_L = 50;               // 50 = loudest. Lower the louder side to balance.
int DUTY_R = 50;
const bool PAIR_SOUND = true;  // typed haptic patterns also play a matching sound
const bool BOOT_CHIME = true;  // chime at power-up

float inten = 0.7;
bool stopNow = false;

/* ---------- stereo sound (non-blocking software square waves) ---------- */

int sfxId = 0, sfxSide = BOTH, sfxStep = 0;
unsigned long sfxNext = 0;
int curF = 0, curSide = BOTH;
unsigned long periodUs = 1000, hL = 0, hR = 0, phaseStart = 0;
bool stateL = false, stateR = false;
int manualF = 0, manualD = 0, manualSide = BOTH;
int volL = 100, volR = 100;          // per-speaker volume of the effect playing, 0-100 (V and W lines)
float scaleL = 1, scaleR = 1;
int sweepF0 = 0, sweepF1 = 0, sweepMs = 0;   // the W line's whoosh

// Footsteps that keep going (F lines). Each step is effect 33; between steps the speakers rest.
int footSide = 0, footLevel = 0;
unsigned long footLastLine = 0, footNext = 0;
bool footHold = false;               // typed steps,left,N: no timeout
bool footPlaying = false;            // the effect playing is one of our steps
const unsigned long FOOT_TIMEOUT_MS = 1000;

// Volume 0-100 to a share of the pulse width. Loudness follows duty very unevenly, so this is exponential:
// 100 = full, 50 = about a quarter, 1 = 6 percent, 0 = silent (the 3 to 50 percent range of the old ramps).
float volScale(int v) {
  if (v <= 0) return 0;
  return 0.06 * pow(1.0 / 0.06, constrain(v, 0, 100) / 100.0);
}

void setVolume(int l, int r) {
  volL = constrain(l, 0, 100);
  volR = constrain(r, 0, 100);
  scaleL = volScale(volL);
  scaleR = volScale(volR);
}

void setSide(int side, int v) {
  if (side & LEFT)  for (int i = 0; i < NSP; i++) digitalWrite(L_PINS[i], v);
  if (side & RIGHT) for (int i = 0; i < NSP; i++) digitalWrite(R_PINS[i], v);
}

void speakersOff() {
  setSide(BOTH, LOW);
  stateL = false;
  stateR = false;
}

// f = 0 means a rest. Returns false when the effect is finished.
bool footNote(int s, int count, int dur, int pauseMs, int &f, int &d) {
  int foot = s / 5, sub = s % 5;
  if (foot >= count) return false;
  static const int fr[4] = {700, 500, 350, 250};
  if (sub < 4) { f = fr[sub]; d = dur; } else { f = 0; d = pauseMs; }
  return true;
}

bool getNote(int id, int s, int &f, int &d, int &side, int &duty) {
  switch (id) {
    case 1: if (s >= 31) return false; f = 500 + s * 50; d = 8; return true;
    case 2: if (s >= 16) return false; f = 900 - s * 40; d = 10; return true;
    case 3: if (s >= 20) return false; f = random(600, 2500); d = random(15, 40); return true;
    case 4: { static const int n[3] = {880, 1175, 1568}; if (s >= 3) return false; f = n[s]; d = 110; return true; }
    case 5: { static const int n[4] = {523, 659, 784, 1047}; if (s >= 4) return false; f = n[s]; d = 90; return true; }
    case 6: side = LEFT;  return footNote(s, 5, 14, 380, f, d);
    case 7: side = RIGHT; return footNote(s, 5, 14, 380, f, d);
    case 8: side = ((s / 5) % 2) ? RIGHT : LEFT; return footNote(s, 8, 14, 420, f, d);
    case 9: side = ((s / 5) % 2) ? RIGHT : LEFT; return footNote(s, 12, 10, 190, f, d);
    case 10: {
      int foot = s / 5;
      side = (foot % 2) ? RIGHT : LEFT;
      return footNote(s, 8, 10 + foot * 2, 600 - foot * 55, f, d);
    }
    case 11:
    case 12: {
      if (s >= 31) return false;
      f = 500 + s * 50;
      d = 8;
      bool first = f < 1250;
      bool ltr = (id == 11);
      side = ltr ? (first ? LEFT : RIGHT) : (first ? RIGHT : LEFT);
      return true;
    }
    case 13:
    case 14:
    case 15:
    case 16: {
      // someone walking toward you (13 left, 14 right) or away (15 left, 16 right):
      // ten steps on one side only, with the volume rising (or falling) from 3 to 50 percent
      const int total = 10;
      int foot = s / 5;
      if (foot >= total) return false;
      bool onLeft = (id == 13 || id == 15);
      bool closer = (id == 13 || id == 14);
      side = onLeft ? LEFT : RIGHT;
      float t = (float)foot / (total - 1);
      if (!closer) t = 1.0 - t;
      duty = constrain((int)(3.0 * pow(50.0 / 3.0, t) + 0.5), 1, 50);
      return footNote(s, total, 14 + (int)(t * 6), 520, f, d);
    }
    // Attack sounds. One square wave per side, so each is told apart by its shape: clicks, sweeps, crackle, blips.
    case 17: {   // stab: a sharp high click, then a quick falling blip
      static const int n[4] = {3200, 2400, 1400, 900};
      static const int ms[4] = {6, 10, 12, 18};
      if (s >= 4) return false; f = n[s]; d = ms[s]; return true;
    }
    case 18:     // slash: a fast falling sweep with a little grit in it
      if (s >= 14) return false; f = 2600 - s * 150 + random(-120, 120); d = 7; return true;
    case 19:     // shot: a crack (noise burst) and a low pop
      if (s >= 9) return false;
      if (s < 7) { f = random(1500, 4500); d = 4; } else { f = (s == 7) ? 220 : 160; d = 20; }
      return true;
    case 20:     // arrow: a thin whistle, then a woody thunk
      if (s >= 8) return false;
      if (s < 5) { f = 1800 + s * 60; d = 12; } else { f = 300 - (s - 5) * 50; d = 22; }
      return true;
    case 21: {   // magic: a warbling rising arpeggio
      static const int n[8] = {660, 990, 790, 1180, 940, 1400, 1120, 1760};
      if (s >= 8) return false; f = n[s]; d = 28; return true;
    }
    case 22:     // fire: crackle, random clicks with gaps
      if (s >= 24) return false;
      if (s % 2) { f = 0; d = random(8, 40); } else { f = random(900, 3800); d = random(2, 6); }
      return true;
    case 23:     // water: falling bubbly blips
      if (s >= 10) return false;
      if (s % 2) { f = 0; d = 25; } else { f = 1300 - s * 70 + random(-60, 60); d = 32; duty = 35; }
      return true;
    case 24:     // plant: a soft wobble that rises
      if (s >= 16) return false; f = 420 + s * 25 + ((s % 2) ? 60 : 0); d = 22; duty = 30; return true;
    case 25:     // smash: a low falling thump
      if (s >= 10) return false; f = 260 - s * 14; d = 14; return true;
    case 26: {   // punch: two dull knocks
      static const int n[4] = {340, 0, 240, 0};
      static const int ms[4] = {22, 30, 28, 10};
      if (s >= 4) return false; f = n[s]; d = ms[s]; return true;
    }
    case 27: {   // clank: two bright notes close together, a metal block
      static const int n[3] = {2093, 2637, 1760};
      static const int ms[3] = {30, 50, 40};
      if (s >= 3) return false; f = n[s]; d = ms[s]; return true;
    }
    case 28:     // lightning: crackle building up, then one long falling strike
      if (s >= 22) return false;
      if (s < 12) { if (s % 2) { f = 0; d = random(10, 50); } else { f = random(1800, 4800); d = 3; } }
      else { f = 1800 - (s - 12) * 150 + random(-200, 200); d = 12; }
      return true;
    case 29:     // explosion: a noisy burst sinking into a rumble
      if (s >= 30) return false; f = max(110, random(200, 2200 - s * 65)); d = 10; return true;
    case 30:     // burn tick: a short quiet hiss, for damage over time
      if (s >= 6) return false; f = random(2500, 4500); d = 5; duty = 18; return true;
    case 31:     // thrown: a wobbling flight, then a thunk
      if (s >= 9) return false;
      if (s < 6) { f = (s % 2) ? 700 : 900; d = 18; } else { f = 280 - (s - 6) * 40; d = 18; }
      return true;
    case 32:     // ultimate: a rising siren, a gap, and a crash
      if (s >= 28) return false;
      if (s < 16) { f = 400 + s * 90; d = 14; } else if (s == 16) { f = 0; d = 60; } else { f = random(150, 1600); d = 12; }
      return true;
    case 33: {   // one footstep (the F line's), the same four notes as the old steps
      static const int fr[4] = {700, 500, 350, 250};
      if (s >= 4) return false; f = fr[s]; d = 14; return true;
    }
    case 98: {   // W line: a sweep from sweepF0 to sweepF1, rising from 15 to 100 percent of its volume
      int n = max(1, sweepMs / 8);
      if (s >= n) return false;
      float t = (float)s / max(1, n - 1);
      f = sweepF0 + (int)((sweepF1 - sweepF0) * t);
      d = 8;
      duty = constrain((int)(50 * (0.15 + 0.85 * t * t)), 2, 50);
      return true;
    }
    case 99: if (s > 0) return false; f = manualF; d = manualD; side = manualSide; return true;
  }
  return false;
}

void soundStop() {
  sfxId = 0;
  curF = 0;
  footPlaying = false;
  speakersOff();
}

// Starts an effect at full volume on the given side(s); a V or W line sets its own volumes right after.
void soundStart(int id, int side) {
  speakersOff();
  sfxId = id;
  sfxSide = side;
  sfxStep = 0;
  sfxNext = 0;
  curF = 0;
  footPlaying = false;
  setVolume(100, 100);
}

void footStop() {
  footSide = 0;
  footHold = false;
  if (footPlaying) soundStop();
}

// Level 0-100 to the gap between steps (560 ms far away, 200 ms up close) and their volume.
void footTick(unsigned long now) {
  if (footSide == 0) return;
  if (!footHold && now - footLastLine > FOOT_TIMEOUT_MS) { footStop(); return; }
  if (sfxId != 0 || now < footNext) return;      // another sound is playing: the steps wait for it
  int v = 15 + footLevel * 85 / 100;
  soundStart(33, footSide);
  setVolume((footSide & LEFT) ? v : 0, (footSide & RIGHT) ? v : 0);
  footPlaying = true;
  footNext = now + 560 - (unsigned long)footLevel * 36 / 10;
}

void soundTick() {
  if (sfxId == 0) { footTick(millis()); if (sfxId == 0) return; }
  unsigned long now = millis();
  if (now >= sfxNext) {
    int f = 0, d = 0, side = sfxSide;
    int dutyPct = 50;   // 50 = full volume for this note
    if (!getNote(sfxId, sfxStep, f, d, side, dutyPct)) { soundStop(); return; }
    sfxStep++;
    speakersOff();
    curF = f;
    curSide = side;
    sfxNext = now + d;
    if (f > 0) {
      f = constrain(f, 100, 5000);
      periodUs = 1000000UL / f;
      hL = (unsigned long)(periodUs * DUTY_L * dutyPct / 5000 * scaleL);
      hR = (unsigned long)(periodUs * DUTY_R * dutyPct / 5000 * scaleR);
      phaseStart = micros();
    }
  }
  if (curF > 0) {
    unsigned long e = micros() - phaseStart;
    if (e >= periodUs) {
      phaseStart += periodUs;
      e -= periodUs;
      if (e >= periodUs) { phaseStart = micros(); e = 0; }
    }
    bool wL = (curSide & LEFT) && e < hL;      // hL is 0 when the left volume is 0
    bool wR = (curSide & RIGHT) && e < hR;
    if (wL != stateL) { setSide(LEFT, wL ? HIGH : LOW); stateL = wL; }
    if (wR != stateR) { setSide(RIGHT, wR ? HIGH : LOW); stateR = wR; }
  }
}

int sideOf(String d) {
  if (d == "left" || d == "ltemple" || d == "l") return LEFT;
  if (d == "right" || d == "rtemple" || d == "r") return RIGHT;
  return BOTH;
}

int sideOfChar(char c) {
  if (c == 'L' || c == 'l') return LEFT;
  if (c == 'R' || c == 'r') return RIGHT;
  return BOTH;
}

int sfxByName(String n) {
  if (n == "swoosh") return 1;
  if (n == "hurt") return 2;
  if (n == "zap") return 3;
  if (n == "chime") return 4;
  if (n == "levelup") return 5;
  if (n == "leftsteps") return 6;
  if (n == "rightsteps") return 7;
  if (n == "walk") return 8;
  if (n == "run") return 9;
  if (n == "monster") return 10;
  if (n == "panlr") return 11;
  if (n == "panrl") return 12;
  if (n == "approachleft") return 13;
  if (n == "approachright") return 14;
  if (n == "leaveleft") return 15;
  if (n == "leaveright") return 16;
  if (n == "stab") return 17;
  if (n == "slash") return 18;
  if (n == "shot") return 19;
  if (n == "arrow") return 20;
  if (n == "magic") return 21;
  if (n == "fire") return 22;
  if (n == "water") return 23;
  if (n == "plant") return 24;
  if (n == "smash") return 25;
  if (n == "punch") return 26;
  if (n == "clank") return 27;
  if (n == "lightning") return 28;
  if (n == "explosion") return 29;
  if (n == "burn") return 30;
  if (n == "thrown") return 31;
  if (n == "ultimate") return 32;
  if (n == "step") return 33;
  return 0;
}

const int NEW_FIRST = 17, NEW_LAST = 33;
const char *NEW_NAMES[] = {"stab", "slash", "shot", "arrow", "magic", "fire", "water", "plant", "smash",
                           "punch", "clank", "lightning", "explosion", "burn", "thrown", "ultimate", "step"};

void pairSound(const String &cmd, int side) {
  if (!PAIR_SOUND) return;
  if (cmd == "hit" || cmd == "strong") soundStart(2, side);
  else if (cmd == "block") soundStart(27, side);
  else if (cmd == "arrow") soundStart(20, side);
  else if (cmd == "sword") soundStart(18, side);
  else if (cmd == "fire") soundStart(22, side);
  else if (cmd == "freeze") soundStart(23, side);
  else if (cmd == "lightning") soundStart(28, BOTH);
  else if (cmd == "poison" || cmd == "bleed") soundStart(30, side);
  else if (cmd == "crit") soundStart(32, BOTH);
  else if (cmd == "heal") soundStart(4, side);
  else if (cmd == "levelup") soundStart(5, side);
  else if (cmd == "explosion") soundStart(29, BOTH);
  else if (cmd == "death") soundStart(2, BOTH);
  else if (cmd == "monster") soundStart(10, BOTH);
}

void sLine(const char *text) {   // "S 3" or "S 3 L"
  int id = 0;
  char sd = 'B';
  int got = sscanf(text + 1, "%d %c", &id, &sd);
  if (got < 1) return;
  soundStart(constrain(id, 1, NEW_LAST), (got >= 2) ? sideOfChar(sd) : BOTH);
}

void vLine(const char *text) {   // "V 18 100 25"
  int id = 0, l = 100, r = 100;
  if (sscanf(text + 1, "%d %d %d", &id, &l, &r) != 3) return;
  if (id < 1 || id > NEW_LAST) return;
  if (l <= 0 && r <= 0) return;
  soundStart(id, BOTH);
  setVolume(l, r);
}

void startSweep(int f0, int f1, int ms, int l, int r) {
  sweepF0 = constrain(f0, 100, 5000);
  sweepF1 = constrain(f1, 100, 5000);
  sweepMs = constrain(ms, 40, 1500);
  soundStart(98, BOTH);
  setVolume(l, r);
}

void wLine(const char *text) {   // "W 500 2200 400 100 20"
  int f0, f1, ms, l, r;
  if (sscanf(text + 1, "%d %d %d %d %d", &f0, &f1, &ms, &l, &r) != 5) return;
  startSweep(f0, f1, ms, l, r);
}

void startSteps(int side, int level, bool hold) {
  footSide = side;
  footLevel = constrain(level, 0, 100);
  footLastLine = millis();
  footHold = hold;
}

void fLine(const char *text) {   // "F L 70" or "F X"
  char sd = 'X';
  int level = 0;
  int got = sscanf(text + 1, " %c %d", &sd, &level);
  if (got < 1 || sd == 'X' || sd == 'x') { footStop(); return; }
  if (got < 2) return;
  startSteps(sideOfChar(sd), level, false);
}

void tLine(const char *text) {   // "T L 880 120"
  char sd = 'B';
  int f, d;
  if (sscanf(text + 1, " %c %d %d", &sd, &f, &d) != 3) return;
  if (f <= 0) { soundStop(); return; }
  manualF = constrain(f, 100, 5000);
  manualD = constrain(d, 10, 800);
  manualSide = sideOfChar(sd);
  soundStart(99, manualSide);
}

/* ---------- levels streamed by the game ---------- */

int target[6] = {0, 0, 0, 0, 0, 0};
unsigned long kickUntil[6] = {0, 0, 0, 0, 0, 0};
unsigned long lastLineAt = 0;
unsigned long lastRefresh = 0;
bool live = false;

void refresh() {
  unsigned long now = millis();
  for (int i = 0; i < 6; i++) {
    analogWrite(PINS[i], (target[i] > 0 && now < kickUntil[i]) ? 255 : target[i]);
  }
}

void allOff() {
  for (int i = 0; i < 6; i++) { target[i] = 0; analogWrite(PINS[i], 0); }
  live = false;
}

void levels(const char *text) {
  int v[6];
  int n = 0;
  const char *p = text + 1;
  while (n < 6) {
    while (*p == ' ') p++;
    if (*p == 0) break;
    v[n++] = constrain(atoi(p), 0, 255);
    while (*p != 0 && *p != ' ') p++;
  }
  if (n < 6) return;  // a damaged line: ignore it rather than buzz at random
  unsigned long now = millis();
  for (int i = 0; i < 6; i++) {
    // stretch 13..255 over the range in which the motors really turn
    int s = v[i] < 13 ? 0 : (int)map(v[i], 13, 255, MIN_DRIVE, 255);
    if (s > 0 && target[i] == 0) kickUntil[i] = now + KICK_MS;
    target[i] = s;
  }
  refresh();
  lastLineAt = now;
  lastRefresh = now;
  live = true;
}

/* ---------- built-in haptic patterns ---------- */

int S(int base) {
  return min(255, (int)(base * (0.5 + 0.5 * inten)));
}

void setMask(int mask, int s) {
  if (stopNow) return;
  if (s > 0) s = constrain(s, MIN_DRIVE, 255);
  for (int i = 0; i < 6; i++) {
    analogWrite(PINS[i], (mask & (1 << i)) ? s : 0);
  }
}

// Like delay(), but keeps the sound playing and gives up when a new line starts to arrive.
void wait(int ms) {
  unsigned long start = millis();
  while (!stopNow && millis() - start < (unsigned long)ms) {
    soundTick();
    if (Serial.available() > 0) stopNow = true;
  }
}

void pulse(int mask, int s, int onMs, int offMs) {
  if (s > 0) { setMask(mask, 255); wait(KICK_MS); }
  setMask(mask, s);
  wait(onMs);
  setMask(0, 0);
  wait(offMs);
}

int dirMask(String d) {
  if (d == "front") return 1;
  if (d == "back") return 2;
  if (d == "left") return 4;
  if (d == "right") return 8;
  if (d == "ltemple") return 16;
  if (d == "rtemple") return 32;
  return ALL;
}

void hit(int m)    { pulse(m, S(230), 150, 0); }
void strong(int m) { pulse(m, 255, 80, 60); pulse(m, 255, 250, 0); }
void arrow(int m)  { pulse(m, 255, 40, 120); pulse(m, S(150), 100, 0); }
void block(int m)  { pulse(m, 255, 60, 40); pulse(m, S(150), 40, 0); }

void sword(int m) {
  for (int i = 0; i < 3; i++) pulse(m, S(110 + i * 40), 50, 40);
  pulse(m, 255, 120, 40);
  pulse(m, S(170), 80, 0);
}

void bleed(int m) {
  for (int i = 0; i < 5; i++) pulse(m, S(160), 60, 350);
}

void crit() {
  pulse(ALL, 255, 400, 100);
  pulse(ALL, 255, 80, 60);
  pulse(ALL, 255, 80, 60);
  pulse(ALL, 255, 200, 0);
}

void explosion() {
  setMask(ALL, 255);
  wait(500);
  for (int s = 220; s >= 90; s -= 10) { setMask(ALL, s); wait(40); }
  setMask(0, 0);
}

void poison() {
  int top = S(200);
  for (int k = 0; k < 4; k++) {
    for (int s = 90; s <= top; s += 10) { setMask(ALL, s); wait(25); }
    for (int s = top; s >= 90; s -= 10) { setMask(ALL, s); wait(25); }
    setMask(0, 0);
    wait(250);
  }
}

void heal() {
  int top = S(180);
  for (int s = 90; s <= top; s += 5) { setMask(ALL, s); wait(30); }
  for (int s = top; s >= 90; s -= 5) { setMask(ALL, s); wait(30); }
  setMask(0, 0);
}

void heartbeat() {
  for (int k = 0; k < 3; k++) {
    pulse(ALL, S(200), 70, 100);
    pulse(ALL, S(200), 70, 600);
  }
}

void fire() {
  for (int i = 0; i < 25; i++) {
    setMask(1 << random(6), random(110, S(255) + 1));
    wait(random(30, 80));
  }
  setMask(0, 0);
}

void freeze() {
  for (int i = 0; i < 20; i++) pulse(ALL, S(130), 25, 25);
}

void lightning() {
  for (int i = 0; i < 3; i++) pulse(1 << random(6), 255, random(20, 50), random(30, 90));
  pulse(ALL, 255, 150, 0);
}

void levelup() {
  pulse(48, S(120), 100, 60);
  pulse(12, S(170), 100, 60);
  pulse(ALL, 255, 250, 0);
}

void death() {
  for (int s = 255; s >= 90; s -= 5) { setMask(ALL, s); wait(40); }
  setMask(0, 0);
}

void monster() {
  for (int i = 0; i < 6; i++) {
    pulse((i % 2 == 0) ? 4 : 8, S(100 + i * 30), 80 + i * 10, 500 - i * 70);
  }
}

void dizzy() {
  int order[6] = {0, 5, 3, 1, 2, 4};
  for (int lap = 0; lap < 3; lap++) {
    for (int i = 0; i < 6; i++) pulse(1 << order[i], S(170), 80, 0);
  }
}

void cast() {
  int order[4] = {0, 3, 1, 2};
  for (int lap = 0; lap < 2; lap++) {
    for (int i = 0; i < 4; i++) pulse(1 << order[i], S(200), 90, 20);
  }
}

void testAll() {
  for (int i = 0; i < 6; i++) {
    Serial.print("Motor ");
    Serial.println(i + 1);
    pulse(1 << i, 200, 500, 300);
  }
}

/* ---------- sound tests (sound only, no motors) ---------- */

void playBlocking(const char *name, int id, int side, int gapMs) {
  if (stopNow) return;
  Serial.println(name);
  soundStart(id, side);
  while (sfxId != 0 && !stopNow) {
    soundTick();
    if (Serial.available() > 0) stopNow = true;
  }
  soundStop();
  wait(gapMs);
}

void beepBlocking(int side, int f, int ms, int gapMs) {
  manualF = f;
  manualD = ms;
  manualSide = side;
  soundStart(99, side);
  while (sfxId != 0 && !stopNow) {
    soundTick();
    if (Serial.available() > 0) stopNow = true;
  }
  soundStop();
  wait(gapMs);
}

void balanceBeeps() {
  Serial.println("balance check: left, right, left, right");
  for (int i = 0; i < 3; i++) {
    beepBlocking(LEFT, 1500, 300, 250);
    beepBlocking(RIGHT, 1500, 300, 450);
  }
}

void effectThree(const char *name, int id) {
  playBlocking(name, id, LEFT, 500);
  playBlocking(name, id, RIGHT, 500);
  playBlocking(name, id, BOTH, 900);
}

void stereoTest() {
  playBlocking("left footsteps", 6, BOTH, 600);
  playBlocking("right footsteps", 7, BOTH, 600);
  playBlocking("walk", 8, BOTH, 600);
  playBlocking("run", 9, BOTH, 600);
  playBlocking("monster", 10, BOTH, 900);
  playBlocking("person approaching from the left", 13, BOTH, 900);
  playBlocking("person approaching from the right", 14, BOTH, 900);
  playBlocking("person walking away on the left", 15, BOTH, 900);
  playBlocking("person walking away on the right", 16, BOTH, 900);
  effectThree("swoosh", 1);
  effectThree("hurt", 2);
  effectThree("zap", 3);
  effectThree("chime", 4);
  effectThree("levelup", 5);
  playBlocking("pan left to right", 11, BOTH, 700);
  playBlocking("pan right to left", 12, BOTH, 700);
  if (!stopNow) Serial.println("stereo test done");
}

// Every attack sound (17-33), on the left and then on the right.
void attackSounds() {
  for (int id = NEW_FIRST; id <= NEW_LAST && !stopNow; id++) {
    const char *name = NEW_NAMES[id - NEW_FIRST];
    playBlocking(name, id, LEFT, 300);
    playBlocking(name, id, RIGHT, 700);
  }
  if (!stopNow) Serial.println("attack sounds done");
}

void help() {
  Serial.println("Format: command,direction,intensity   e.g. hit,left,0.8");
  Serial.println("Directions: front back left right ltemple rtemple (blank = all)");
  Serial.println("Intensity: 0 to 1 (blank = 0.7)");
  Serial.println("hit strong arrow block sword bleed  (use a direction)");
  Serial.println("crit explosion poison heal heartbeat fire freeze");
  Serial.println("lightning levelup death monster dizzy cast test");
  Serial.println("motor,N,strength  e.g. motor,3,200  (N is 1 to 6)");
  Serial.println("sound,NAME[,left|right]: swoosh hurt zap chime levelup leftsteps");
  Serial.println("  rightsteps walk run monster panlr panrl");
  Serial.println("  approachleft approachright leaveleft leaveright");
  Serial.println("  stab slash shot arrow magic fire water plant smash punch clank");
  Serial.println("  lightning explosion burn thrown ultimate step");
  Serial.println("vol,NAME,L,R  e.g. vol,slash,100,20   (volume per side, 0-100)");
  Serial.println("steps,left|right,LEVEL  e.g. steps,right,80   steps,stop");
  Serial.println("incoming,left|right  a whoosh rising on that side");
  Serial.println("sounds = every attack sound left then right");
  Serial.println("stereo = full sound test, balance = left/right beeps");
  Serial.println("The game sends: M m0..m5, S n [L|R|B], V n volL volR, T L|R|B freq ms,");
  Serial.println("  W f0 f1 ms volL volR, F L|R|B level, F X");
}

void command(String line) {
  line.trim();
  line.toLowerCase();
  if (line.length() == 0) return;

  String f[4] = {"", "", "", ""};
  int n = 0, start = 0;
  for (int i = 0; i <= (int)line.length() && n < 4; i++) {
    if (i == (int)line.length() || line[i] == ',') {
      f[n++] = line.substring(start, i);
      start = i + 1;
    }
  }

  String cmd = f[0];
  String dir = f[1];
  inten = 0.7;
  if (dir.length() && (isDigit(dir[0]) || dir[0] == '.')) {
    inten = constrain(dir.toFloat(), 0.0, 1.0);
    dir = "";
  } else if (f[2].length()) {
    inten = constrain(f[2].toFloat(), 0.0, 1.0);
  }
  int m = dirMask(dir);

  Serial.print("Playing: ");
  Serial.print(cmd);
  Serial.print(" mask ");
  Serial.print(m);
  Serial.print(" intensity ");
  Serial.println(inten);

  allOff();  // a hand-typed pattern takes over from whatever the game was sending
  pairSound(cmd, sideOf(dir));
  if (cmd == "hit") hit(m);
  else if (cmd == "strong") strong(m);
  else if (cmd == "arrow") arrow(m);
  else if (cmd == "block") block(m);
  else if (cmd == "sword") sword(m);
  else if (cmd == "bleed") bleed(m);
  else if (cmd == "crit") crit();
  else if (cmd == "explosion") explosion();
  else if (cmd == "poison") poison();
  else if (cmd == "heal") heal();
  else if (cmd == "heartbeat") heartbeat();
  else if (cmd == "fire") fire();
  else if (cmd == "freeze") freeze();
  else if (cmd == "lightning") lightning();
  else if (cmd == "levelup") levelup();
  else if (cmd == "death") death();
  else if (cmd == "monster") monster();
  else if (cmd == "dizzy") dizzy();
  else if (cmd == "cast") cast();
  else if (cmd == "test") testAll();
  else if (cmd == "stereo" || cmd == "speaker") stereoTest();
  else if (cmd == "balance") balanceBeeps();
  else if (cmd == "sound") {
    int id = sfxByName(f[1]);
    if (id) soundStart(id, sideOf(f[2]));
    else Serial.println("unknown sound, type help");
  }
  else if (cmd == "vol") {
    int id = sfxByName(f[1]);
    if (id) { soundStart(id, BOTH); setVolume(f[2].toInt(), f[3].length() ? f[3].toInt() : f[2].toInt()); }
    else Serial.println("unknown sound, type help");
  }
  else if (cmd == "steps") {
    if (f[1] == "stop" || f[1] == "x") footStop();
    else startSteps(sideOf(f[1]), f[2].length() ? f[2].toInt() : 60, true);
  }
  else if (cmd == "incoming") {
    int sd = sideOf(f[1]);
    startSweep(500, 2200, 500, (sd & LEFT) ? 100 : 15, (sd & RIGHT) ? 100 : 15);
  }
  else if (cmd == "sounds") attackSounds();
  else if (cmd == "motor") {
    int idx = constrain(f[1].toInt(), 1, 6) - 1;
    int s = constrain(f[2].toInt(), 0, 255);
    pulse(1 << idx, s, 800, 0);
  }
  else if (cmd == "help") help();
  else Serial.println("Unknown command. Type help.");

  // if the pattern was cut short, make sure nothing is left running
  stopNow = false;
  setMask(0, 0);
}

/* ---------- serial ---------- */

char line[64];
int lineLen = 0;

void setup() {
  for (int i = 0; i < 6; i++) pinMode(PINS[i], OUTPUT);
  for (int i = 0; i < NSP; i++) { pinMode(L_PINS[i], OUTPUT); pinMode(R_PINS[i], OUTPUT); }
  speakersOff();
  allOff();
  Serial.begin(BAUD);
  help();
  if (BOOT_CHIME) soundStart(4, BOTH);
}

void loop() {
  // Read a character at a time and never wait for the rest of a line.
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (lineLen > 0) {
        line[lineLen] = 0;
        lineLen = 0;
        if (line[0] == 'M' && (line[1] == ' ' || line[1] == 0)) levels(line);
        else if (line[0] == 'S' && line[1] == ' ') sLine(line);
        else if (line[0] == 'T' && line[1] == ' ') tLine(line);
        else if (line[0] == 'V' && line[1] == ' ') vLine(line);
        else if (line[0] == 'W' && line[1] == ' ') wLine(line);
        else if (line[0] == 'F' && line[1] == ' ') fLine(line);
        else command(String(line));
      }
    } else if (lineLen < 63) {
      line[lineLen++] = c;
    } else {
      lineLen = 0;  // overlong line: drop it
    }
  }

  soundTick();

  if (live) {
    unsigned long now = millis();
    if (now - lastLineAt > TIMEOUT_MS) allOff();
    else if (now - lastRefresh >= 2) { refresh(); lastRefresh = now; }  // ends each motor's starting kick on time
  }
}

