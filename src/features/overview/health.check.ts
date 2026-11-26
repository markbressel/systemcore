// Self-check for the PC health score (run by `npm run test:ui`).
import assert from "node:assert/strict";
import { healthScore } from "./health.ts";

const GB = 1024 ** 3;
const calm = { cpuTempC: 50, gpuTempC: 45, ramPercent: 40, disks: [{ mount: "C:", health: "Healthy", totalBytes: 500 * GB, availableBytes: 200 * GB }], startupApps: 5 };

assert.deepEqual(healthScore(calm), { score: 100, issues: [] });
assert.deepEqual(healthScore({ cpuTempC: null, gpuTempC: null, ramPercent: null, disks: [], startupApps: null }), { score: 100, issues: [] }, "unknown readings cost nothing");

const full = healthScore({ ...calm, disks: [{ mount: "C:", health: "Healthy", totalBytes: 500 * GB, availableBytes: 0.24 * GB }] });
assert.equal(full.score, 80);
assert.match(full.issues[0], /almost full/);

const worst = healthScore({ ...calm, cpuTempC: 95, disks: [{ mount: "D:", health: "Unhealthy", totalBytes: 1000 * GB, availableBytes: 500 * GB }], startupApps: 20 });
assert.equal(worst.score, 100 - 25 - 40 - 10);
assert.match(worst.issues[0], /Unhealthy/, "worst problem first");

assert.equal(healthScore({ ...calm, cpuTempC: 100, gpuTempC: 100, ramPercent: 99, disks: [{ mount: "C:", health: "Unhealthy", totalBytes: 100 * GB, availableBytes: 0 }], startupApps: 40 }).score, 0, "never below 0");
assert.equal(healthScore({ ...calm, throttling: true }).score, 70);
assert.match(healthScore({ ...calm, throttling: true }).issues[0], /too hot/);
console.log("health score: ok");
