import { CircuitBoard, Cpu, MemoryStick, Monitor, MonitorCog, Network } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "../../components/feedback/States";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { StatList } from "../../components/metrics/StatList";
import { formatBytes } from "../../lib/format";
import { useHardware } from "../../stores/hardware";

export function HardwarePage() {
  const { hardware: hw, error } = useHardware();
  if (error) return <ErrorState message={error} />;
  if (!hw) return <LoadingState label="Reading hardware inventory…" />;

  return (
    <PageContainer title="Hardware" subtitle="Inventory reported by Windows. Values the provider cannot read are marked as not available.">
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
