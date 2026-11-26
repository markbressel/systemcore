// "What changed on this PC": compares two snapshots of things that often explain a PC that got slower.
import { t } from "../../lib/i18n.ts";


export interface Baseline {
  at: number;
  /** Names of startup apps that are enabled. */
  startup: string[];
  /** "GPU name · driver version". */
  drivers: string[];
  /** Mount point → free bytes. */
  diskFree: Record<string, number>;
}

export interface ChangeEvent {
  at: number;
  kind: "startup" | "driver" | "disk";
  text: string;
}

const GB = 1024 ** 3;
/** A drop this big between two checks (about an hour apart) counts as "suddenly". */
export const DISK_DROP_BYTES = 10 * GB;

export function diffBaseline(prev: Baseline, next: Baseline): ChangeEvent[] {
  const out: ChangeEvent[] = [];
  const add = (kind: ChangeEvent["kind"], text: string) => out.push({ at: next.at, kind, text });
  for (const name of next.startup.filter((n) => !prev.startup.includes(n))) add("startup", t("{name} now starts with Windows.", { name }));
  for (const name of prev.startup.filter((n) => !next.startup.includes(n))) add("startup", t("{name} no longer starts with Windows.", { name }));
  // An empty list means the query failed, not that the GPU vanished.
  if (prev.drivers.length && next.drivers.length) {
    for (const d of next.drivers.filter((x) => !prev.drivers.includes(x))) add("driver", t("Graphics driver changed: {driver}.", { driver: d }));
  }
  for (const [mount, free] of Object.entries(next.diskFree)) {
    const before = prev.diskFree[mount];
    if (before != null && before - free >= DISK_DROP_BYTES) {
      add("disk", t("Drive {mount} lost {lost} GB of free space ({left} GB left).", { mount, lost: ((before - free) / GB).toFixed(1), left: (free / GB).toFixed(1) }));
    }
  }
  return out;
}
