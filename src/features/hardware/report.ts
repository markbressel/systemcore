import { formatBytes } from "../../lib/format";
import type { DisksSnapshot, HardwareInfo } from "../../types/telemetry";

/** Plain-text spec sheet for forums or support. Leaves out the computer name and MAC addresses. */
export function specReport(hw: HardwareInfo, disks: DisksSnapshot | null, version: string | null): string {
  const lines: string[] = [];
  const add = (label: string, value: string | number | null | undefined) => {
    if (value != null && value !== "") lines.push(`  ${label.padEnd(18)} ${value}`);
  };
  const section = (title: string) => lines.push("", title);

  lines.push(`SystemCore ${version ? `v${version} ` : ""}system report · ${new Date().toLocaleString()}`);

  section("Processor");
  add("Model", hw.cpu.brand);
  add("Cores / threads", hw.cpu.physicalCores ? `${hw.cpu.physicalCores} / ${hw.cpu.logicalProcessors}` : hw.cpu.logicalProcessors);
  add("Architecture", hw.cpu.architecture);

  section("System");
  add("Manufacturer", hw.system.vendor);
  add("Model", hw.system.name);
  add("Motherboard", [hw.motherboard.vendor, hw.motherboard.name].filter(Boolean).join(" "));

  section("Memory");
  add("Installed", hw.memoryTotalBytes != null ? formatBytes(hw.memoryTotalBytes, 0) : null);
  hw.memoryModules.forEach((m, i) => {
    const speed = m.configuredSpeedMts ?? m.speedMts;
    add(`Module ${i + 1}`, [m.capacityBytes != null && formatBytes(m.capacityBytes, 0), m.kind, speed && `${speed} MT/s`, m.manufacturer, m.partNumber].filter(Boolean).join(" · "));
  });

  section("Graphics");
  hw.gpus.forEach((g, i) => add(`GPU ${i + 1}`, [g.model, g.vramTotalBytes != null && formatBytes(g.vramTotalBytes, 0)].filter(Boolean).join(" · ")));

  if (disks?.disks.length) {
    section("Storage");
    disks.disks.forEach((d) =>
      add(d.mountPoint, [d.model ?? d.name, !d.kind.startsWith("Unknown") && d.kind, `${formatBytes(d.totalBytes, 0)} (${formatBytes(d.availableBytes, 0)} free)`, d.fileSystem, d.health && `health: ${d.health}`].filter(Boolean).join(" · ")),
    );
  }

  section("Operating system");
  add("Edition", hw.os.longVersion ?? hw.os.name);
  add("Version", hw.os.version);
  add("Build", hw.os.kernel);

  return lines.join("\n") + "\n";
}
