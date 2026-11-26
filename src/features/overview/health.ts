// PC health score: start at 100 and subtract a penalty per problem found. Pure, so it can be self-checked.
import { t } from "../../lib/i18n.ts";


export interface HealthDisk {
  mount: string;
  /** Storage API health ("Healthy", "Warning", "Unhealthy") or null when unknown. */
  health: string | null;
  totalBytes: number;
  availableBytes: number;
}

export interface HealthInput {
  cpuTempC: number | null;
  gpuTempC: number | null;
  ramPercent: number | null;
  disks: HealthDisk[];
  /** Enabled startup apps, or null while unknown. */
  startupApps: number | null;
  /** CPU or GPU is slowing down because it is too hot. */
  throttling?: boolean;
}

export interface HealthResult {
  score: number;
  /** Problems, worst first. Empty means nothing lowers the score. */
  issues: string[];
}

const GB = 1024 ** 3;

export function healthScore(i: HealthInput): HealthResult {
  const found: [number, string][] = [];
  const add = (penalty: number, text: string) => found.push([penalty, text]);

  if (i.throttling) add(30, t("The PC is slowing itself down right now because it is too hot. Check the fans, dust and airflow."));
  if (i.cpuTempC != null) {
    if (i.cpuTempC >= 90) add(25, t("The CPU is very hot ({temp} °C). Check the cooler and airflow.", { temp: i.cpuTempC.toFixed(0) }));
    else if (i.cpuTempC >= 80) add(10, t("The CPU runs warm ({temp} °C).", { temp: i.cpuTempC.toFixed(0) }));
  }
  if (i.gpuTempC != null) {
    if (i.gpuTempC >= 85) add(20, t("The GPU is very hot ({temp} °C). Check its fans and airflow.", { temp: i.gpuTempC.toFixed(0) }));
    else if (i.gpuTempC >= 75) add(8, t("The GPU runs warm ({temp} °C).", { temp: i.gpuTempC.toFixed(0) }));
  }
  if (i.ramPercent != null) {
    if (i.ramPercent >= 90) add(10, t("Memory is almost full ({pct} % in use).", { pct: i.ramPercent.toFixed(0) }));
    else if (i.ramPercent >= 80) add(4, t("Memory use is high ({pct} %).", { pct: i.ramPercent.toFixed(0) }));
  }
  for (const d of i.disks) {
    if (d.health === "Unhealthy") add(40, t("Drive {mount} reports Unhealthy. Back up your data now.", { mount: d.mount }));
    else if (d.health === "Warning") add(25, t("Drive {mount} reports a health warning. Back up your data.", { mount: d.mount }));
    if (d.totalBytes <= 0) continue;
    const free = d.availableBytes / d.totalBytes;
    const freeText = t("{gb} GB free", { gb: (d.availableBytes / GB).toFixed(1) });
    if (free < 0.05 || d.availableBytes < 2 * GB) add(20, t("Drive {mount} is almost full ({free}).", { mount: d.mount, free: freeText }));
    else if (free < 0.1) add(10, t("Drive {mount} is getting full ({free}).", { mount: d.mount, free: freeText }));
  }
  if (i.startupApps != null) {
    if (i.startupApps > 15) add(10, t("{count} apps start with Windows, which slows down startup.", { count: i.startupApps }));
    else if (i.startupApps > 8) add(5, t("{count} apps start with Windows.", { count: i.startupApps }));
  }

  found.sort((a, b) => b[0] - a[0]);
  const penalty = found.reduce((sum, [p]) => sum + p, 0);
  return { score: Math.max(0, 100 - penalty), issues: found.map(([, t]) => t) };
}
