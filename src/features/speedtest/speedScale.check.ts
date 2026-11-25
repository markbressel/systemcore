// Self-check for the speed dial scale (run by `npm run test:ui`).
import assert from "node:assert/strict";
import { speedPosition } from "./speedScale.ts";

assert.equal(speedPosition(0), 0);
assert.equal(speedPosition(-5), 0);
assert.equal(speedPosition(Number.NaN), 0);
assert.equal(speedPosition(1), 10);
assert.equal(speedPosition(100), 60);
assert.equal(speedPosition(175), 65, "halfway between 100 and 250");
assert.equal(speedPosition(1000), 90);
assert.equal(speedPosition(2000), 95);
assert.equal(speedPosition(50_000), 95, "clamped");
let prev = -1;
for (let v = 0; v <= 1500; v += 0.5) {
  const p = speedPosition(v);
  assert.ok(p >= prev, `monotonic at ${v}`);
  prev = p;
}
console.log("speed scale: ok");
