// Run: node src/features/overlay/placement.check.ts
import assert from "node:assert/strict";
import { cornerPosition } from "./placement.ts";

// Second monitor right of the first, taskbar takes the bottom 48 px.
const area = { x: 1920, y: 0, width: 2560, height: 1392 };
const size = { width: 300, height: 200 };
assert.deepEqual(cornerPosition("top-left", area, size, 16), { x: 1936, y: 16 });
assert.deepEqual(cornerPosition("top-right", area, size, 16), { x: 4164, y: 16 });
assert.deepEqual(cornerPosition("bottom-left", area, size, 16), { x: 1936, y: 1176 });
assert.deepEqual(cornerPosition("bottom-right", area, size, 16), { x: 4164, y: 1176 });
console.log("placement ok");
