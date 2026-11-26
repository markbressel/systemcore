import { getVersion } from "@tauri-apps/api/app";
import { Check, CircuitBoard, ClipboardCopy, Cpu, FileDown, MemoryStick, Monitor, MonitorCog, Network } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/feedback/States";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { StatList } from "../../components/metrics/StatList";
import { formatBytes } from "../../lib/format";
import { saveReport } from "../../lib/tauri";
import { useHardware } from "../../stores/hardware";
import { useTelemetry } from "../../stores/telemetry";
import { specReport } from "./report";

export function HardwarePage() {
  const { hardware: hw, error } = useHardware();
  const { disks } = useTelemetry();
  const [done, setDone] = useState<string | null>(null);
  if (error) return <ErrorState message={error} />;
  if (!hw) return <LoadingState label="Reading hardware inventory…" />;

  const report = async () => specReport(hw, disks, await getVersion().catch(() => null));
  const act = (f: () => Promise<string>) =>
    f()
      .then(setDone)
      .catch((e) => setDone(`Failed: ${e}`));

  return (
    <PageContainer
      title="Hardware"
      subtitle="Inventory reported by Windows. Values the provider cannot read are marked as not available."
      actions={
        <>
          <button type="button" className="button button--secondary" onClick={() => act(async () => (await navigator.clipboard.writeText(await report()), "Specs copied to the clipboard."))}>
            <ClipboardCopy className="button__icon" aria-hidden="true" /> Copy specs
          </button>
          <button type="button" className="button button--secondary" onClick={() => act(async () => `Saved to ${await saveReport(await report())}`)}>
            <FileDown className="button__icon" aria-hidden="true" /> Save report
          </button>
        </>
      }
    >
      {done && (
        <div className={`notice${done.startsWith("Failed") ? " notice--danger" : " notice--success"}`} role="status">
          <Check aria-hidden="true" /> {done}
          {!done.startsWith("Failed") && " The report leaves out your computer name and MAC addresses."}
        </div>
      )}
      <div className="grid grid--auto">
        <HardwareCard title="Processor" icon={Cpu}>
          <StatList
            items={[
              ["Model", hw.cpu.brand],
              ["Vendor", hw.cpu.vendor],
              ["Architecture", hw.cpu.architecture],
              ["Physical cores", hw.cpu.physicalCores],
              ["Logical processors", hw.cpu.logicalProcessors || null],
            ]}
          />
        </HardwareCard>
        <HardwareCard title="System" icon={CircuitBoard}>
          <StatList
            items={[
              ["Manufacturer", hw.system.vendor],
              ["Model", hw.system.name],
              ["Motherboard", [hw.motherboard.vendor, hw.motherboard.name].filter(Boolean).join(" ") || null],
              ["Board revision", hw.motherboard.version],
              ["Installed memory", hw.memoryTotalBytes != null ? formatBytes(hw.memoryTotalBytes, 0) : null],
            ]}
          />
        </HardwareCard>
        <HardwareCard title="Memory modules" icon={MemoryStick} aside={<span>{hw.memoryModules.length} installed</span>}>
          {hw.memoryModules.length === 0 ? (
            <EmptyState compact>Windows reported no memory module details.</EmptyState>
          ) : (
            hw.memoryModules.map((m, i) => (
              <div key={i}>
                <div className="panel__group-title">Module {i + 1}{m.slot ? ` · ${m.slot}` : ""}</div>
                <StatList
                  items={[
                    ["Capacity", m.capacityBytes != null ? formatBytes(m.capacityBytes, 0) : null],
                    ["Type", m.kind],
                    ["Speed", m.configuredSpeedMts ?? m.speedMts ? `${m.configuredSpeedMts ?? m.speedMts} MT/s` : null],
                    ["Part number", m.partNumber],
                    ["Manufacturer", m.manufacturer],
                  ]}
                />
              </div>
            ))
          )}
        </HardwareCard>
        <HardwareCard title="Graphics" icon={Monitor}>
          {hw.gpus.length === 0 ? (
            <EmptyState compact>No GPU reported by the provider.</EmptyState>
          ) : (
            hw.gpus.map((g, i) => (
              <StatList
                key={i}
                items={[
                  ["Model", g.model],
                  ["Vendor", g.vendor],
                  ["Dedicated memory", g.vramTotalBytes != null ? formatBytes(g.vramTotalBytes, 0) : null],
                ]}
              />
            ))
          )}
        </HardwareCard>
        <HardwareCard title="Operating system" icon={MonitorCog}>
          <StatList
            items={[
              ["Edition", hw.os.longVersion ?? hw.os.name],
              ["Version", hw.os.version],
              ["Build", hw.os.kernel],
              ["Computer name", hw.os.hostName],
            ]}
          />
        </HardwareCard>
        <HardwareCard title="Network adapters" icon={Network} aside={<span>{hw.networkAdapters.length} interfaces</span>}>
          <StatList single items={hw.networkAdapters.map((a) => [a.name, <span className="u-mono">{a.mac}</span>])} />
        </HardwareCard>
      </div>
    </PageContainer>
  );
}
