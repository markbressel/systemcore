// Self-check for the ignition timeline: `npm run test:ui` (Node runs TypeScript directly).
import assert from "node:assert/strict";
import { ignitionAt, TIMELINE } from "./ignition.ts";

assert.deepEqual(ignitionAt(0), { phase: "ignition", sweep: 0 });
assert.equal(ignitionAt(TIMELINE.ignition).sweep, 0, "sweep starts at 0");
assert.equal(ignitionAt(TIMELINE.hold - 1).sweep, 100, "holds at full scale");
assert.equal(ignitionAt(TIMELINE.sweepDown - 0.001).phase, "sweep-down");
assert.ok(ignitionAt(TIMELINE.sweepDown - 0.001).sweep! < 0.01, "returns to 0");
assert.equal(ignitionAt(TIMELINE.sweepDown).sweep, null, "then live data");
assert.equal(ignitionAt(TIMELINE.exit).phase, "done");

// Monotonic up, then down.
let prev = -1;
for (let t = TIMELINE.ignition; t < TIMELINE.sweepUp; t += 10) {
  const v = ignitionAt(t).sweep!;
  assert.ok(v >= prev && v >= 0 && v <= 100);
  prev = v;
}
prev = 100;
for (let t = TIMELINE.hold; t < TIMELINE.sweepDown; t += 10) {
  const v = ignitionAt(t).sweep!;
  assert.ok(v <= prev && v >= 0 && v <= 100);
  prev = v;
}
console.log("ignition timeline: ok");
