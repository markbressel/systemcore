import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { t } from "../../lib/i18n";
import { telemetrySnapshot } from "../../stores/telemetry";
import { diagnose, type Finding, type Sample } from "./diagnose";

const SECONDS = 10;

function sample(): Sample | null {
  const { system: s, processes, disks } = telemetrySnapshot();
  if (!s) return null;
  const cores = s.cpu.perCorePercent.value;
  const gpu = s.gpus.value?.[0];
  const busiestDisk = disks?.disks
    .map((d) => [d.mountPoint, (d.readBytesPerSec.value ?? 0) + (d.writeBytesPerSec.value ?? 0)] as [string, number])
    .sort((a, b) => b[1] - a[1])[0];
  return {
    cpuPercent: s.cpu.usagePercent.value,
    busiestCorePercent: cores?.length ? Math.max(...cores) : null,
    ramPercent: s.memory.usagePercent.value,
    cpuTempC: s.cpu.temperatureC.value,
    gpuPercent: gpu?.usagePercent.value ?? null,
    throttling: !!s.cpu.thermalThrottling || !!gpu?.thermalThrottling,
    disk: busiestDisk ?? null,
    latencyMs: s.network.latencyMs.value,
    processes: (processes?.processes ?? []).map((p) => ({
      name: p.name,
      cpuPercent: p.cpuPercent,
      memoryBytes: p.memoryBytes,
      netBytesPerSec: p.netRxBytesPerSec == null ? null : p.netRxBytesPerSec + (p.netTxBytesPerSec ?? 0),
    })),
  };
}

/** Watches everything for 10 s, then says in plain words what slows the PC down. */
export function SlowCheck() {
  const [left, setLeft] = useState<number | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const samples = useRef<Sample[]>([]);

  useEffect(() => {
    if (left == null) return;
    if (left === 0) {
      setFindings(diagnose(samples.current));
      setLeft(null);
      return;
    }
    const id = setTimeout(() => {
      const s = sample();
      if (s) samples.current.push(s);
      setLeft(left - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [left]);

  const start = () => {
    samples.current = [];
    setFindings(null);
    setLeft(SECONDS);
  };

  return (
    <HardwareCard title={t("Why is my PC slow?")} icon={Search}>
      <div className="slow-check">
        {left != null ? (
          <p className="slow-check__status">{t("Watching processor, memory, drives, temperatures and network… {left} s", { left })}</p>
        ) : findings == null ? (
          <p className="page__note">{t("Run this while the PC feels slow. It watches everything for {seconds} seconds and tells you the cause.", { seconds: SECONDS })}</p>
        ) : findings.length === 0 ? (
          <p className="slow-check__ok">{t("Nothing is slowing the PC down right now. If it feels slow at times, run this again while it happens.")}</p>
        ) : (
          <ul className="slow-check__list">
            {findings.map((f) => (
              <li key={f.text} className={`slow-check__item slow-check__item--${f.severity}`}>
                {f.text}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="button button--primary" disabled={left != null} onClick={start}>
          {findings ? t("Check again") : t("Find the cause")}
        </button>
      </div>
    </HardwareCard>
  );
}
