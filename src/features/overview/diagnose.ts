// "Why is my PC slow?": turns ~10 s of samples into plain-language causes, worst first. Pure, so it can be self-checked.
import { t } from "../../lib/i18n.ts";


export interface ProcSample {
  name: string;
  cpuPercent: number | null;
  memoryBytes: number | null;
  netBytesPerSec: number | null;
}

export interface Sample {
  cpuPercent: number | null;
  busiestCorePercent: number | null;
  ramPercent: number | null;
  cpuTempC: number | null;
  gpuPercent: number | null;
  throttling: boolean;
  /** Busiest drive: [mount, read+write bytes/s]. */
  disk: [string, number] | null;
  latencyMs: number | null;
  processes: ProcSample[];
}

export interface Finding {
  severity: 1 | 2 | 3;
  text: string;
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;

function avg(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Per-program averages over all samples, keyed by name (several processes of one app add up). */
function programs(samples: Sample[]) {
  const by = new Map<string, { cpu: number; mem: number; net: number }>();
  for (const s of samples) {
    const tick = new Map<string, { cpu: number; mem: number; net: number }>();
    for (const p of s.processes) {
      const t = tick.get(p.name) ?? { cpu: 0, mem: 0, net: 0 };
      t.cpu += p.cpuPercent ?? 0;
      t.mem += p.memoryBytes ?? 0;
      t.net += p.netBytesPerSec ?? 0;
      tick.set(p.name, t);
    }
    for (const [name, t] of tick) {
      const a = by.get(name) ?? { cpu: 0, mem: 0, net: 0 };
      by.set(name, { cpu: a.cpu + t.cpu, mem: Math.max(a.mem, t.mem), net: a.net + t.net });
    }
  }
  const n = Math.max(1, samples.filter((s) => s.processes.length).length);
  return [...by].map(([name, a]) => ({ name: name.replace(/\.exe$/i, ""), cpu: a.cpu / n, mem: a.mem, net: a.net / n }));
}

const top = <T,>(xs: T[], key: (x: T) => number) => [...xs].sort((a, b) => key(b) - key(a))[0];

export function diagnose(samples: Sample[]): Finding[] {
  if (!samples.length) return [];
  const out: Finding[] = [];
  const progs = programs(samples);
  const cpuHog = top(progs, (p) => p.cpu);
  const memHog = top(progs, (p) => p.mem);
  const netHog = top(progs, (p) => p.net);

  const cpu = avg(samples.map((s) => s.cpuPercent));
  const core = avg(samples.map((s) => s.busiestCorePercent));
  if (cpu != null && cpu >= 60) {
    const who = cpuHog && cpuHog.cpu >= 10 ? t(" The biggest user is {name} ({cpu} %).", { name: cpuHog.name, cpu: cpuHog.cpu.toFixed(0) }) : "";
    out.push({ severity: cpu >= 85 ? 3 : 2, text: t("The processor is {state} ({cpu} % on average).{who}", { state: cpu >= 85 ? t("maxed out") : t("very busy"), cpu: cpu.toFixed(0), who }) });
  } else if (core != null && core >= 95) {
    out.push({ severity: 2, text: t("One CPU core is maxed out{by}. Programs that run on a single core feel slow even though the total looks low.", { by: cpuHog ? t(", most likely by {name}", { name: cpuHog.name }) : "" }) });
  } else if (cpuHog && cpuHog.cpu >= 25) {
    out.push({ severity: 2, text: t("{name} keeps {cpu} % of the processor busy.", { name: cpuHog.name, cpu: cpuHog.cpu.toFixed(0) }) });
  }

  const ram = avg(samples.map((s) => s.ramPercent));
  if (ram != null && ram >= 80) {
    const who = memHog ? t(" The biggest user is {name} ({gb} GB).", { name: memHog.name, gb: (memHog.mem / GB).toFixed(1) }) : "";
    out.push({ severity: ram >= 90 ? 3 : 2, text: t("Memory is {state} ({ram} %), so Windows has to swap to disk.{who}", { state: ram >= 90 ? t("almost full") : t("filling up"), ram: ram.toFixed(0), who }) });
  }

  if (samples.some((s) => s.throttling)) {
    out.push({ severity: 3, text: t("The PC is slowing itself down because it is too hot. Check the fans, dust and airflow.") });
  } else {
    const maxT = Math.max(...samples.map((s) => s.cpuTempC ?? 0));
    if (maxT >= 90) out.push({ severity: 2, text: t("The CPU is very hot ({temp} °C) and may start slowing down.", { temp: maxT.toFixed(0) }) });
  }

  const disks = samples.map((s) => s.disk).filter((d): d is [string, number] => d != null);
  const diskRate = avg(disks.map((d) => d[1]));
  if (diskRate != null && diskRate >= 50 * MB) {
    out.push({ severity: 2, text: t("Drive {mount} is busy reading and writing ({rate} MB/s), which slows down everything that loads files. Updates, antivirus scans and downloads are typical causes.", { mount: disks[disks.length - 1][0], rate: (diskRate / MB).toFixed(0) }) });
  }

  if (netHog && netHog.net >= 2 * MB) {
    out.push({ severity: 1, text: t("{name} is using the internet at {rate} MB/s, which can make browsing and online games lag.", { name: netHog.name, rate: (netHog.net / MB).toFixed(1) }) });
  }
  const ping = avg(samples.map((s) => s.latencyMs));
  if (ping != null && ping >= 150) out.push({ severity: 1, text: t("The internet connection is slow to respond ({ping} ms ping).", { ping: ping.toFixed(0) }) });

  const gpu = avg(samples.map((s) => s.gpuPercent));
  if (gpu != null && gpu >= 95) out.push({ severity: 1, text: t("The graphics card is fully loaded ({gpu} %).", { gpu: gpu.toFixed(0) }) });

  return out.sort((a, b) => b.severity - a.severity);
}
