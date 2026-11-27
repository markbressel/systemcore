import { useEffect, useState } from "react";
import { formatBytes } from "../../lib/format";
import { t } from "../../lib/i18n";
import { listPeripherals } from "../../lib/tauri";
import { useHardware } from "../../stores/hardware";
import { useTelemetry } from "../../stores/telemetry";
import type { Peripheral, RgbDevice } from "../../types/telemetry";

// Peripheral names change only when something is plugged in; one read per app run is enough.
let peripherals: Promise<Peripheral[]> | null = null;

type Row = [string, string | null | undefined];

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" ") || null;
const num = (v: number | null | undefined, unit: string, digits = 0) => (v == null ? null : `${v.toFixed(digits)} ${unit}`);

/** What the selected 3D part really is in this PC: model, specs and live readings. */
export function PartDetails({ part, device }: { part: string; device: RgbDevice | null }) {
  const { hardware: hw } = useHardware();
  const s = useTelemetry().system;
  const [periph, setPeriph] = useState<Peripheral[]>([]);
  useEffect(() => {
    peripherals ??= listPeripherals().catch(() => []);
    void peripherals.then(setPeriph);
  }, []);

  const gpu = s?.gpus.value?.[0];
  const rows: Row[] = [];
  const modules: string[] = [];
  let note: string | null = null;

  switch (part) {
    case "gpu": {
      const g = hw?.gpus[0];
      rows.push(
        ["Model", g?.model ?? gpu?.model],
        ["Video memory", g?.vramTotalBytes ? formatBytes(g.vramTotalBytes, 0) : null],
        ["Driver", hw?.gpuDrivers[0]?.split(" · ").pop()],
        ["Load now", num(gpu?.usagePercent.value, "%")],
        ["Temperature", num(gpu?.temperatureC.value, "°C")],
        ["Core clock", num(gpu?.coreClockMhz.value, "MHz")],
        ["Power draw", num(gpu?.powerWatts.value, "W")],
        ["Fan", num(gpu?.fanPercent.value, "%")],
      );
      break;
    }
    case "ram":
      rows.push(
        ["Installed", hw?.memoryTotalBytes ? formatBytes(hw.memoryTotalBytes, 0) : null],
        ["Modules", hw ? String(hw.memoryModules.length) : null],
        ["In use now", num(s?.memory.usagePercent.value, "%")],
      );
      for (const m of hw?.memoryModules ?? []) {
        const speed = m.configuredSpeedMts ?? m.speedMts;
        modules.push(
          [join(m.manufacturer && m.manufacturer !== "Unknown" ? m.manufacturer : null, m.partNumber), m.capacityBytes ? formatBytes(m.capacityBytes, 0) : null, m.kind, speed ? `${speed} MT/s` : null, m.slot]
            .filter(Boolean)
            .join(" · "),
        );
      }
      break;
    case "motherboard":
      rows.push(
        ["Manufacturer", hw?.motherboard.vendor],
        ["Model", hw?.motherboard.name],
        ["Revision", hw?.motherboard.version],
        ["System", join(hw?.system.vendor, hw?.system.name)],
      );
      break;
    case "cooler":
      note = t("The cooler sits on the processor; these are the processor's readings.");
      rows.push(
        ["Processor", hw?.cpu.brand],
        ["Cores / threads", hw ? `${hw.cpu.physicalCores ?? "?"} / ${hw.cpu.logicalProcessors}` : null],
        ["Temperature", num(s?.cpu.temperatureC.value, "°C", 1)],
        ["Clock now", num(s?.cpu.frequencyMhz.value, "MHz")],
        ["Load now", num(s?.cpu.usagePercent.value, "%")],
      );
      break;
    case "fans":
      note = t("Windows does not report case fan models or speeds; the graphics card fan is shown on the graphics card.");
      break;
    case "strip":
      note = t("LED strips connect to an RGB header or hub; their brand is not reported to Windows.");
      break;
    default: {
      // Peripherals: the RGB device's own name first, then what USB reports for this kind.
      const usb = periph.filter((p) => p.kind === part);
      const main = usb.find((p) => device && (device.name.toLowerCase().includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(device.name.toLowerCase()))) ?? usb[0];
      rows.push(
        ["Model", device?.name ?? main?.name],
        ["Manufacturer", main?.manufacturer],
        ["Connection", main ? (main.wireless ? t("Wireless (USB receiver)") : t("USB cable")) : null],
        ["USB ID", main ? `${main.vendorId.toString(16).padStart(4, "0")}:${main.productId.toString(16).padStart(4, "0")}`.toUpperCase() : null],
      );
      for (const other of usb.filter((p) => p !== main)) modules.push(join(other.manufacturer, other.name) ?? other.name);
      if (!device && !main) note = t("No device of this kind is connected.");
    }
  }

  const shown = rows.filter(([, v]) => v);
  return (
    <>
      {shown.length > 0 && (
        <dl className="lighting__facts">
          {shown.map(([k, v]) => (
            <div key={k} className="lighting__fact">
              <dt>{t(k)}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {modules.length > 0 && (
        <ul className="lighting__modules" aria-label={part === "ram" ? t("Memory modules") : t("Also connected")}>
          {modules.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      {note && <p className="setting__hint">{note}</p>}
    </>
  );
}
