// Self-check for the slowness diagnosis (run by `npm run test:ui`).
import assert from "node:assert/strict";
import { diagnose, type Sample } from "./diagnose.ts";

const GB = 1024 ** 3;
const calm: Sample = { cpuPercent: 10, busiestCorePercent: 30, ramPercent: 50, cpuTempC: 50, gpuPercent: 5, throttling: false, disk: ["C:", 0], latencyMs: 20, processes: [{ name: "explorer.exe", cpuPercent: 1, memoryBytes: 0.1 * GB, netBytesPerSec: 0 }] };

assert.deepEqual(diagnose([]), []);
assert.deepEqual(diagnose([calm, calm]), [], "nothing wrong");

const busy: Sample = {
  ...calm,
  cpuPercent: 95,
  ramPercent: 93,
  processes: [
    { name: "chrome.exe", cpuPercent: 30, memoryBytes: 2 * GB, netBytesPerSec: 0 },
    { name: "chrome.exe", cpuPercent: 20, memoryBytes: 2 * GB, netBytesPerSec: 0 },
    { name: "game.exe", cpuPercent: 10, memoryBytes: 1 * GB, netBytesPerSec: 0 },
  ],
};
const f = diagnose([busy, busy]);
assert.equal(f.length, 2);
assert.match(f[0].text, /maxed out \(95 %.*chrome \(50 %\)/, "processes of one app add up");
assert.match(f[1].text, /almost full.*chrome \(4\.0 GB\)/);

assert.equal(diagnose([{ ...calm, throttling: true }])[0].severity, 3);
assert.match(diagnose([{ ...calm, disk: ["D:", 200 * 1024 ** 2] }])[0].text, /Drive D: is busy/);
assert.match(diagnose([{ ...calm, busiestCorePercent: 100, processes: [{ name: "app.exe", cpuPercent: 12, memoryBytes: 0, netBytesPerSec: 0 }] }])[0].text, /One CPU core.*app/);
console.log("diagnose: ok");
