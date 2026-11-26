// Self-check for the bottleneck rule (run by `npm run test:ui`).
import assert from "node:assert/strict";
import { bottleneck } from "./bottleneck.ts";

const base = { gpuPercent: 70, cpuPercent: 30, busiestCorePercent: 75, cpuThrottling: false, gpuThrottling: false };
assert.equal(bottleneck({ ...base, gpuPercent: 99 }), "gpu");
assert.equal(bottleneck({ ...base, gpuPercent: 60, busiestCorePercent: 100 }), "cpu", "one maxed core is enough");
assert.equal(bottleneck({ ...base, gpuPercent: 97, busiestCorePercent: 100 }), "gpu", "GPU at its limit wins");
assert.equal(bottleneck({ ...base, gpuPercent: 40, busiestCorePercent: 50 }), "cap");
assert.equal(bottleneck(base), null, "balanced");
assert.equal(bottleneck({ ...base, gpuPercent: null }), null, "no GPU data");
assert.equal(bottleneck({ ...base, gpuPercent: 99, cpuThrottling: true }), "cpu-hot", "heat first");
console.log("bottleneck: ok");
