// Self-check for the change log diff (run by `npm run test:ui`).
import assert from "node:assert/strict";
import { diffBaseline, type Baseline } from "./changes.ts";

const GB = 1024 ** 3;
const a: Baseline = { at: 1, startup: ["Discord", "Steam"], drivers: ["RTX 3070 · 31.0.15.1"], diskFree: { "C:": 100 * GB, "D:": 50 * GB } };

assert.deepEqual(diffBaseline(a, { ...a, at: 2 }), [], "nothing changed");
const b: Baseline = { at: 2, startup: ["Steam", "Spotify"], drivers: ["RTX 3070 · 32.0.15.6"], diskFree: { "C:": 85 * GB, "D:": 45 * GB, "E:": 1 } };
const d = diffBaseline(a, b);
assert.deepEqual(d.map((x) => x.kind), ["startup", "startup", "driver", "disk"]);
assert.equal(d[0].text, "Spotify now starts with Windows.");
assert.equal(d[1].text, "Discord no longer starts with Windows.");
assert.match(d[3].text, /^Drive C: lost 15\.0 GB/, "only big drops, only known drives");
assert.deepEqual(diffBaseline(a, { ...a, drivers: [] }), [], "failed driver query is not a change");
console.log("changes: ok");
