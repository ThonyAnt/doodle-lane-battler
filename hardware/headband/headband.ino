// Doodle Duel headband firmware.
//
// Two ways to drive it over USB serial (115200 baud, one line per message):
//
// 1. The game. While a pattern is playing it sends about 30 lines a second:
//
//      M <m0> <m1> <m2> <m3> <m4> <m5>
//
//    m0..m5 are the six motor strengths (0-255). The board copies them to the pins at once and never waits,
//    so the delay is one serial line. The patterns live in juice.js and can be changed without flashing again.
//    If the lines stop for 400 ms (cable pulled, browser tab closed) everything switches off.
//    A seventh number (the old fan flag) is accepted and ignored.
//
// 2. Built-in patterns for testing by hand from the Serial Monitor:
//
//      command,direction,intensity     e.g. hit,left,0.8     (type help for the list)
//
//    These play on the board. Any new line cuts the running pattern short, so nothing ever queues up.
//
// Wiring: a board pin cannot power a motor directly. Drive each one through a transistor or MOSFET
// with a flyback diode across the motor, and power the motors from 5 V, not from the pin.

const int PINS[6] = {3, 5, 6, 9, 10, 11};  // the six PWM pins on an Uno or Nano; change these to match your board
// 0 front, 1 back, 2 left, 3 right, 4 left temple, 5 right temple
const int ALL = 63;
const int MIN_DRIVE = 90;                  // below this the motors do not turn
const int KICK_MS = 25;                    // full power for a moment to get a motor spinning
const unsigned long TIMEOUT_MS = 400;
const long BAUD = 115200;                  // must match the game (juice.js)

float inten = 0.7;
bool stopNow = false;                      // a new line arrived: cut the built-in pattern short

/* ---------- levels streamed by the game ---------- */

int target[6] = {0, 0, 0, 0, 0, 0};
unsigned long kickUntil[6] = {0, 0, 0, 0, 0, 0};
unsigned long lastLineAt = 0;
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
  live = true;
}

/* ---------- built-in patterns ---------- */

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

// Like delay(), but gives up the moment a new line starts to arrive.
void wait(int ms) {
  unsigned long start = millis();
  while (!stopNow && millis() - start < (unsigned long)ms) {
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

void help() {
  Serial.println("Format: command,direction,intensity   e.g. hit,left,0.8");
  Serial.println("Directions: front back left right ltemple rtemple (blank = all)");
  Serial.println("Intensity: 0 to 1 (blank = 0.7)");
  Serial.println("hit strong arrow block sword bleed  (use a direction)");
  Serial.println("crit explosion poison heal heartbeat fire freeze");
  Serial.println("lightning levelup death monster dizzy cast test");
  Serial.println("motor,N,strength  e.g. motor,3,200  (N is 1 to 6)");
  Serial.println("The game sends: M m0 m1 m2 m3 m4 m5  (0 to 255 each)");
}

void command(String line) {
  line.trim();
  line.toLowerCase();
  if (line.length() == 0) return;

  String f[3] = {"", "", ""};
  int n = 0, start = 0;
  for (int i = 0; i <= (int)line.length() && n < 3; i++) {
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
  allOff();
  Serial.begin(BAUD);
  help();
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
        else command(String(line));
      }
    } else if (lineLen < 63) {
      line[lineLen++] = c;
    } else {
      lineLen = 0;  // overlong line: drop it
    }
  }
  if (live) {
    if (millis() - lastLineAt > TIMEOUT_MS) allOff();
    else refresh();  // ends each motor's starting kick on time
  }
}
