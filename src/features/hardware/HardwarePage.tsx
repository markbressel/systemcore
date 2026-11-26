import { getVersion } from "@tauri-apps/api/app";
import { Check, CircuitBoard, ClipboardCopy, Cpu, FileDown, MemoryStick, Monitor, MonitorCog, Network } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/feedback/States";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { StatList } from "../../components/metrics/StatList";
import { formatBytes } from "../../lib/format";
import { t } from "../../lib/i18n";
import { saveReport } from "../../lib/tauri";
import { useHardware } from "../../stores/hardware";
import { useTelemetry } from "../../stores/telemetry";
import { specReport } from "./report";

export function HardwarePage() {
  const { hardware: hw, error } = useHardware();
  const { disks } = useTelemetry();
  const [done, setDone] = useState<{ text: string; failed: boolean } | null>(null);
  if (error) return <ErrorState message={t(error)} />;
  if (!hw) return <LoadingState label={t("Reading hardware inventory…")} />;

  const report = async () => specReport(hw, disks, await getVersion().catch(() => null));
  const act = (f: () => Promise<string>) =>
    f()
      .then((text) => setDone({ text, failed: false }))
      .catch((e) => setDone({ text: t("Failed: {error}", { error: t(String(e)) }), failed: true }));

  return (
    <PageContainer
      title={t("Hardware")}
      subtitle={t("Inventory reported by Windows. Values the provider cannot read are marked as not available.")}
      actions={
        <>
          <button type="button" className="button button--secondary" onClick={() => act(async () => (await navigator.clipboard.writeText(await report()), t("Specs copied to the clipboard.")))}>
            <ClipboardCopy className="button__icon" aria-hidden="true" /> {t("Copy specs")}
          </button>
          <button type="button" className="button button--secondary" onClick={() => act(async () => t("Saved to {path}", { path: await saveReport(await report()) }))}>
            <FileDown className="button__icon" aria-hidden="true" /> {t("Save report")}
          </button>
        </>
      }
    >
      {done && (
        <div className={`notice${done.failed ? " notice--danger" : " notice--success"}`} role="status">
          <Check aria-hidden="true" /> {done.text}
          {!done.failed && ` ${t("The report leaves out your computer name and MAC addresses.")}`}
        </div>
      )}
      <div className="grid grid--auto">
        <HardwareCard title={t("Processor")} icon={Cpu}>
          <StatList
            items={[
              [t("Model"), hw.cpu.brand],
              [t("Vendor"), hw.cpu.vendor],
              [t("Architecture"), hw.cpu.architecture],
              [t("Physical cores"), hw.cpu.physicalCores],
              [t("Logical processors"), hw.cpu.logicalProcessors || null],
            ]}
          />
        </HardwareCard>
        <HardwareCard title={t("System")} icon={CircuitBoard}>
          <StatList
            items={[
              [t("Manufacturer"), hw.system.vendor],
              [t("Model"), hw.system.name],
              [t("Motherboard"), [hw.motherboard.vendor, hw.motherboard.name].filter(Boolean).join(" ") || null],
              [t("Board revision"), hw.motherboard.version],
              [t("Installed memory"), hw.memoryTotalBytes != null ? formatBytes(hw.memoryTotalBytes, 0) : null],
            ]}
          />
        </HardwareCard>
        <HardwareCard title={t("Memory modules")} icon={MemoryStick} aside={<span>{t("{n} installed", { n: hw.memoryModules.length })}</span>}>
          {hw.memoryModules.length === 0 ? (
            <EmptyState compact>{t("Windows reported no memory module details.")}</EmptyState>
          ) : (
            hw.memoryModules.map((m, i) => (
              <div key={i}>
                <div className="panel__group-title">{t("Module {n}", { n: i + 1 })}{m.slot ? ` · ${m.slot}` : ""}</div>
                <StatList
                  items={[
                    [t("Capacity"), m.capacityBytes != null ? formatBytes(m.capacityBytes, 0) : null],
                    [t("Type"), m.kind],
                    [t("Speed"), m.configuredSpeedMts ?? m.speedMts ? `${m.configuredSpeedMts ?? m.speedMts} MT/s` : null],
                    [t("Part number"), m.partNumber],
                    [t("Manufacturer"), m.manufacturer],
                  ]}
                />
              </div>
            ))
          )}
        </HardwareCard>
        <HardwareCard title={t("Graphics")} icon={Monitor}>
          {hw.gpus.length === 0 ? (
            <EmptyState compact>{t("No GPU reported by the provider.")}</EmptyState>
          ) : (
            hw.gpus.map((g, i) => (
              <StatList
                key={i}
                items={[
                  [t("Model"), g.model],
                  [t("Vendor"), g.vendor],
                  [t("Dedicated memory"), g.vramTotalBytes != null ? formatBytes(g.vramTotalBytes, 0) : null],
                ]}
              />
            ))
          )}
        </HardwareCard>
        <HardwareCard title={t("Operating system")} icon={MonitorCog}>
          <StatList
            items={[
              [t("Edition"), hw.os.longVersion ?? hw.os.name],
              [t("Version"), hw.os.version],
              [t("Build"), hw.os.kernel],
              [t("Computer name"), hw.os.hostName],
            ]}
          />
        </HardwareCard>
        <HardwareCard title={t("Network adapters")} icon={Network} aside={<span>{t("{n} interfaces", { n: hw.networkAdapters.length })}</span>}>
          <StatList single items={hw.networkAdapters.map((a) => [a.name, <span className="u-mono">{a.mac}</span>])} />
        </HardwareCard>
      </div>
    </PageContainer>
  );
}
