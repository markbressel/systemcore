// Self-check for the game requirement parser and estimates (run by `npm run test:ui`).
import assert from "node:assert/strict";
import { closest, CPU_LADDER, cpuNeed, GPU_LADDER, gpuNeed, norm, overall, parseSpec, partLevel, upgrades } from "./games.ts";

assert.equal(norm("NVIDIA® GeForce® GTX1060 3GB"), " gtx 1060 3 gb ");

// The calibration machine maps back onto itself.
assert.equal(closest(CPU_LADDER, 30121), "Ryzen 7 3700X");
assert.equal(closest(GPU_LADDER, 1079), "GTX 1060 3GB");
assert.equal(closest(GPU_LADDER, 1), "Intel UHD 630", "below the ladder");

// Most specific name wins, the slowest alternative counts.
assert.equal(gpuNeed("GTX 1060 3 GB or RX 580 4 GB"), gpuNeed("GTX 1060 3GB"));
assert.ok(gpuNeed("RX 6600 XT")! > gpuNeed("RX 6600")!);
assert.ok(gpuNeed("RTX 4070 Ti SUPER")! > gpuNeed("RTX 4070 Ti")!);
assert.equal(gpuNeed("1920x1080, DirectX 11"), null);
assert.equal(cpuNeed("Intel® Core™ i5-2500K / AMD FX-6300"), cpuNeed("FX 6300"), "the slower alternative counts");
assert.ok(cpuNeed("Core i7-12700")! > cpuNeed("Core i7-8700K")!, "5-digit Intel generation");
assert.ok(cpuNeed("i5 2500 i7 4770") != null, "neighbouring names");
assert.equal(cpuNeed("Dual core 2.8 GHz"), null);

// Real Steam text (ELDEN RING).
const html = (cpu: string, ram: string, gpu: string) =>
  `<strong>Minimum:</strong><br><ul class="bb_ul"><li>Requires a 64-bit processor and operating system<br></li><li><strong>OS:</strong> Windows 10<br></li><li><strong>Processor:</strong> ${cpu}<br></li><li><strong>Memory:</strong> ${ram}<br></li><li><strong>Graphics:</strong> ${gpu}<br></li><li><strong>Storage:</strong> 60 GB available space<br></li></ul>`;
const min = parseSpec(html("INTEL CORE I5-8400 or AMD RYZEN 3 3300X", "12 GB RAM", "NVIDIA GEFORCE GTX 1060 3 GB or AMD RADEON RX 580 4 GB"));
const rec = parseSpec(html("INTEL CORE I7-8700K or AMD RYZEN 5 3600X", "16 GB RAM", "NVIDIA GEFORCE GTX 1070 8 GB or AMD RADEON RX VEGA 56 8 GB"));
assert.equal(min.text.os, "Windows 10");
assert.equal(min.text.storage, "60 GB available space");
assert.deepEqual([min.ramGb, min.vramGb, rec.ramGb, rec.vramGb], [12, 3, 16, 8]);
assert.ok(min.cpu && min.gpu && rec.cpu && rec.gpu);

const pc = { cpu: 30121, gpu: 1079, vramGb: 3, ramGb: 15.9 };
assert.equal(partLevel("cpu", pc, min, rec), "high");
assert.equal(partLevel("ramGb", pc, min, rec), "high", "15.9 GB counts as 16");
assert.equal(partLevel("gpu", pc, min, rec), "medium");
assert.equal(overall(pc, min, rec), "medium");
assert.deepEqual(upgrades(pc, min, rec), [{ part: "gpu", to: "RTX 3050 (8 GB)" }]);
assert.equal(overall({ ...pc, ramGb: 8 }, min, rec), "low");
assert.deepEqual(upgrades({ ...pc, ramGb: 8 }, min, rec).map((u) => u.part), ["gpu", "ram"]);
assert.deepEqual(upgrades({ cpu: 1e9, gpu: 1e9, vramGb: 64, ramGb: 64 }, min, rec), []);
const none = parseSpec("");
assert.equal(overall(pc, none, none), null, "nothing listed: cannot tell");
assert.equal(partLevel("cpu", { ...pc, cpu: null }, min, rec), null, "no benchmark yet");
console.log("game estimates: ok");
