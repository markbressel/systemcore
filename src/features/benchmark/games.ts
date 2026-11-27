// Turns a game's Steam requirement texts + this PC's benchmark points into "how would it run" and "what to upgrade".
// Calibration: a Ryzen 7 3700X scored 30 121 CPU points and a GTX 1060 3GB 1 079 GPU points with this build.
// Other parts are scaled from that by their typical relative performance (GPU: gaming averages, CPU: multi-core),
// so every number here is an estimate, not a measured frame rate.
// shortcut: one calibration machine and hand-made part tables; re-anchor if the benchmark workload changes,
// extend GPUS / the CPU tables when new parts show up in requirements as "not recognized".

/** Points per "GTX 1060 6GB = 100" unit and per 1 000 Cinebench R23 multi-core points. */
const GPU_PTS = 1079 / 93;
const CPU_PTS = 30121 / 12.2;
const gpu = (rel: number) => Math.round(rel * GPU_PTS);
const cpu = (cb23k: number) => Math.round(cb23k * CPU_PTS);

/** Lowercase, trademarks and punctuation gone, letters and digits split: "GTX1060 3GB" -> "gtx 1060 3 gb". */
export const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/\((tm|r)\)|[™®]/g, " ")
    .replace(/([a-z])(\d)|(\d)([a-z])/g, "$1$3 $2$4")
    .replace(/([a-z])(\d)|(\d)([a-z])/g, "$1$3 $2$4")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\b(nvidia|geforce|amd|radeon|intel|graphics)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

// Gaming performance relative to a GTX 1060 6GB (= 100).
const GPUS: [string, number][] = (
  "hd 4000:8,hd 4600:10,hd 520:12,hd 530:12,hd 620:12,hd 630:13,uhd 620:13,uhd 630:14,uhd 770:18,iris xe:30,vega 8:25,vega 11:30,arc a380:65,arc a580:150,arc a750:175,arc a770:190,arc b570:195,arc b580:220," +
  "gt 710:6,gt 730:10,gt 1030:30,gt 640:12,gtx 650:20,gtx 650 ti:27,gtx 660:40,gtx 660 ti:45,gtx 670:52,gtx 680:57,gtx 750:32,gtx 750 ti:37,gtx 760:46,gtx 770:58,gtx 780:67,gtx 780 ti:77,gtx titan:72," +
  "gtx 950:50,gtx 960:58,gtx 970:88,gtx 980:102,gtx 980 ti:125,gtx 1050:47,gtx 1050 ti:57,gtx 1060 3 gb:93,gtx 1060:100,gtx 1070:132,gtx 1070 ti:150,gtx 1080:160,gtx 1080 ti:210," +
  "gtx 1630:45,gtx 1650:72,gtx 1650 super:100,gtx 1660:112,gtx 1660 super:125,gtx 1660 ti:128,rtx 2060:155,rtx 2060 super:175,rtx 2070:185,rtx 2070 super:205,rtx 2080:225,rtx 2080 super:235,rtx 2080 ti:280," +
  "rtx 3050:135,rtx 3060:175,rtx 3060 ti:225,rtx 3070:260,rtx 3070 ti:275,rtx 3080:320,rtx 3080 ti:355,rtx 3090:365,rtx 3090 ti:400," +
  "rtx 4060:205,rtx 4060 ti:245,rtx 4070:320,rtx 4070 super:370,rtx 4070 ti:400,rtx 4070 ti super:430,rtx 4080:490,rtx 4080 super:500,rtx 4090:630," +
  "rtx 5060:250,rtx 5060 ti:290,rtx 5070:400,rtx 5070 ti:480,rtx 5080:540,rtx 5090:800," +
  "hd 7750:22,hd 7770:28,hd 7790:33,hd 7850:45,hd 7870:52,hd 7950:60,hd 7970:68,r7 260x:32,r7 370:45,r9 270:50,r9 270x:53,r9 280:60,r9 280x:68,r9 290:85,r9 290x:90,r9 380:65,r9 380x:72,r9 390:95,r9 390x:100,r9 fury:115,r9 fury x:125," +
  "rx 460:40,rx 470:85,rx 480:95,rx 550:25,rx 560:45,rx 570:90,rx 580:100,rx 590:110,rx vega 56:140,rx vega 64:155,vega 56:140,vega 64:155,radeon vii:190," +
  "rx 5500 xt:95,rx 5600 xt:150,rx 5700:175,rx 5700 xt:195,rx 6400:65,rx 6500 xt:75,rx 6600:165,rx 6600 xt:190,rx 6650 xt:200,rx 6700:215,rx 6700 xt:245,rx 6750 xt:255,rx 6800:300,rx 6800 xt:345,rx 6900 xt:370,rx 6950 xt:390," +
  "rx 7600:205,rx 7600 xt:215,rx 7700 xt:295,rx 7800 xt:360,rx 7900 gre:390,rx 7900 xt:450,rx 7900 xtx:520,rx 9060 xt:290,rx 9070:450,rx 9070 xt:500"
)
  .split(",")
  .map((e) => {
    const [name, rel] = e.split(":");
    return [norm(name), Number(rel)];
  });

/** GPU points of the slowest card named in the text ("GTX 1060 or RX 580" are meant as equals), null if none is known. */
export function gpuNeed(text: string): number | null {
  const t = norm(text);
  const hits = GPUS.filter(([n]) => t.includes(n));
  // "gtx 1060" also sits inside "gtx 1060 3 gb": keep only the most specific name.
  const specific = hits.filter(([n]) => !hits.some(([m]) => m !== n && m.startsWith(n.trimEnd() + " ")));
  return specific.length ? gpu(Math.min(...specific.map(([, r]) => r))) : null;
}

// Multi-core performance (thousands of Cinebench R23 points) by generation and tier: [i3, i5, i7, i9] / [R3, R5, R7, R9].
const INTEL: Record<number, number[]> = {
  2: [1.3, 2.6, 3.5, 3.5], 3: [1.4, 2.9, 4, 4], 4: [1.6, 3.2, 4.6, 4.6], 5: [1.7, 3.3, 4.8, 4.8], 6: [1.9, 3.6, 5.3, 5.3], 7: [2, 3.8, 5.6, 5.6],
  8: [3, 5.8, 8.5, 8.5], 9: [3.2, 6, 9.5, 12.5], 10: [4.5, 8.5, 11.5, 14], 11: [4.5, 10, 12.5, 14.5], 12: [8.5, 15, 22, 27], 13: [9, 20, 29, 38], 14: [9, 21, 32, 39],
};
const RYZEN: Record<number, number[]> = {
  1: [3.5, 6.4, 8.5, 8.5], 2: [3.8, 7.2, 9, 9], 3: [5, 9.3, 12.2, 18], 4: [5, 9, 11, 11], 5: [6, 11, 15, 22], 7: [9, 15, 18, 30], 8: [9, 13, 17, 17], 9: [9, 17, 21, 35],
};
const TIER: Record<string, number> = { 3: 0, 5: 1, 7: 2, 9: 3 };

/** CPU points of the slowest processor named in the text, null if none is recognized. */
export function cpuNeed(text: string): number | null {
  const t = norm(text);
  const found: number[] = [];
  // Trailing spaces are lookaheads so neighbouring names ("i5 2500 i7 4770") can share one.
  for (const m of t.matchAll(/ i ([3579]) (\d{4,5})(?= )/g)) {
    const gen = m[2].length === 5 ? Number(m[2].slice(0, 2)) : Number(m[2][0]);
    if (INTEL[gen]) found.push(INTEL[gen][TIER[m[1]]]);
  }
  for (const m of t.matchAll(/ ryzen ([3579]) (?:pro )?(\d)\d{3}(?= )/g)) if (RYZEN[Number(m[2])]) found.push(RYZEN[Number(m[2])][TIER[m[1]]]);
  for (const m of t.matchAll(/ (?:core )?ultra ([579]) \d{3}(?= )/g)) found.push({ 5: 18, 7: 28, 9: 33 }[m[1]]!);
  for (const m of t.matchAll(/ fx (\d)\d{3}(?= )/g)) found.push({ 4: 1.6, 6: 2.3, 8: 3.2, 9: 3.6 }[m[1]] ?? 2.3);
  if (/ core 2 duo | e \d{4} /.test(t)) found.push(0.6);
  if (/ core 2 quad | q \d{4} /.test(t)) found.push(1.1);
  if (/ phenom ii x 4 /.test(t)) found.push(1.5);
  if (/ phenom ii x 6 /.test(t)) found.push(2.5);
  if (/ pentium /.test(t)) found.push(1);
  return found.length ? cpu(Math.min(...found)) : null;
}

/** First "N GB" (or MB) amount in the text, in GB. */
const amountGb = (text: string, pick: (xs: number[]) => number) => {
  const xs = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(GB|MB)\b/gi)].map((m) => Number(m[1]) / (m[2].toUpperCase() === "MB" ? 1024 : 1));
  return xs.length ? pick(xs) : null;
};

export type Field = "os" | "cpu" | "gpu" | "ram" | "storage";
export interface Spec {
  /** The store's own wording per part. */
  text: Partial<Record<Field, string>>;
  cpu: number | null;
  gpu: number | null;
  vramGb: number | null;
  ramGb: number | null;
}

const FIELD: [RegExp, Field][] = [
  [/^(os|operating)/i, "os"],
  [/processor|cpu/i, "cpu"],
  [/graphics|video|gpu/i, "gpu"],
  [/memory|ram/i, "ram"],
  [/storage|hard|disk|space/i, "storage"],
];

/** Parses one Steam requirement block ("<li><strong>Processor:</strong> ...</li>..."). */
export function parseSpec(html: string): Spec {
  const text: Spec["text"] = {};
  for (const raw of html.split(/<li>|<br\s*\/?>/i)) {
    const line = raw.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    const colon = line.indexOf(":");
    if (colon < 1 || colon > 30) continue;
    const field = FIELD.find(([re]) => re.test(line.slice(0, colon)))?.[1];
    const value = line.slice(colon + 1).trim();
    if (field && value && !text[field]) text[field] = value;
  }
  return {
    text,
    cpu: text.cpu ? cpuNeed(text.cpu) : null,
    gpu: text.gpu ? gpuNeed(text.gpu) : null,
    // "GTX 1060 3 GB or RX 580 4 GB": the smaller amount is enough.
    vramGb: text.gpu ? amountGb(text.gpu, (xs) => Math.min(...xs)) : null,
    ramGb: text.ram ? amountGb(text.ram, (xs) => xs[0]) : null,
  };
}

export interface MyPc {
  cpu: number | null;
  gpu: number | null;
  vramGb: number | null;
  ramGb: number | null;
}
export type Part = "cpu" | "gpu" | "vramGb" | "ramGb";
export const PARTS: Part[] = ["cpu", "gpu", "vramGb", "ramGb"];
/** high = meets recommended, medium = meets minimum, low = below minimum, null = cannot tell. */
export type Level = "high" | "medium" | "low";

// 5 % slack: Windows reports 16 GB of RAM as 15.9, and the point tables are estimates anyway.
const meets = (have: number, need: number | null) => need == null || have * 1.05 >= need;

export function partLevel(part: Part, pc: MyPc, min: Spec, rec: Spec): Level | null {
  const have = pc[part];
  if (have == null || (min[part] == null && rec[part] == null)) return null;
  if (!meets(have, min[part])) return "low";
  return meets(have, rec[part] ?? min[part]) ? "high" : "medium";
}

/** The worst known part decides; null when no part could be compared. */
export function overall(pc: MyPc, min: Spec, rec: Spec): Level | null {
  const levels = PARTS.map((p) => partLevel(p, pc, min, rec)).filter((l): l is Level => l != null);
  if (!levels.length) return null;
  return levels.includes("low") ? "low" : levels.includes("medium") ? "medium" : "high";
}

// Parts sold today, slowest first: the upgrade advice names the cheapest one that reaches the target.
const BUY_GPU: [string, number, number][] = [
  ["RTX 3050", 135, 8], ["RX 6600", 165, 8], ["RTX 4060", 205, 8], ["RTX 5060", 250, 8], ["RX 9060 XT 16GB", 290, 16],
  ["RTX 5070", 400, 12], ["RX 9070 XT", 500, 16], ["RTX 5080", 540, 16], ["RTX 5090", 800, 32],
];
const BUY_CPU: [string, number][] = [
  ["Ryzen 5 5600", 10.9], ["Core i5-12400F", 12], ["Ryzen 7 5700X", 14.5], ["Ryzen 7 9700X", 20], ["Core i5-14600K", 24], ["Ryzen 9 9950X", 40],
];

export interface Upgrade {
  part: "cpu" | "gpu" | "ram";
  /** What to buy (at least). */
  to: string;
}

/** What to change so every known part meets the recommended (or, if none is listed, the minimum) requirement. */
export function upgrades(pc: MyPc, min: Spec, rec: Spec): Upgrade[] {
  const target = (p: Part) => rec[p] ?? min[p];
  const short = (p: Part) => pc[p] != null && !meets(pc[p]!, target(p));
  const out: Upgrade[] = [];
  if (short("gpu") || short("vramGb")) {
    const needGpu = short("gpu") ? target("gpu")! : 0;
    const needVram = Math.max(target("vramGb") ?? 0, pc.vramGb ?? 0);
    const pick = BUY_GPU.find(([, rel, vram]) => gpu(rel) >= needGpu && vram >= needVram) ?? BUY_GPU[BUY_GPU.length - 1];
    out.push({ part: "gpu", to: `${pick[0]} (${pick[2]} GB)` });
  }
  if (short("cpu")) out.push({ part: "cpu", to: (BUY_CPU.find(([, k]) => cpu(k) >= target("cpu")!) ?? BUY_CPU[BUY_CPU.length - 1])[0] });
  if (short("ramGb")) out.push({ part: "ram", to: `${[8, 16, 32, 64, 128].find((g) => g >= target("ramGb")!) ?? 128} GB` });
  return out;
}

/** Reference parts for "performs about like ...", slowest first. */
export const GPU_LADDER: [string, number][] = [
  ["Intel UHD 630", gpu(15)], ["GTX 750 Ti", gpu(40)], ["GTX 1050 Ti", gpu(60)], ["GTX 1060 3GB", gpu(93)], ["GTX 1060 6GB / RX 580", gpu(100)],
  ["GTX 1660 Super", gpu(125)], ["GTX 1070", gpu(132)], ["RTX 2060", gpu(155)], ["RTX 3060", gpu(175)], ["RTX 2070 Super", gpu(200)],
  ["RTX 3060 Ti", gpu(230)], ["RTX 3070", gpu(265)], ["RTX 4070", gpu(330)], ["RTX 3090 / RX 6900 XT", gpu(390)], ["RTX 4080", gpu(480)], ["RTX 4090", gpu(620)],
];
export const CPU_LADDER: [string, number][] = [
  ["Core i5-4460", cpu(3.4)], ["Core i7-4770", cpu(5)], ["Ryzen 5 1600", cpu(6.4)], ["Core i5-10400", cpu(8.6)], ["Ryzen 5 3600", cpu(9.3)],
  ["Ryzen 5 5600X", cpu(11)], ["Ryzen 7 3700X", cpu(12.2)], ["Ryzen 7 5800X", cpu(15)], ["Core i5-13600K", cpu(24)], ["Ryzen 9 7950X", cpu(37)],
];

/** The fastest reference part the score reaches (or the slowest one when below all). */
export const closest = (ladder: [string, number][], score: number) => ladder.filter(([, s]) => score >= s * 0.95).pop()?.[0] ?? ladder[0][0];
