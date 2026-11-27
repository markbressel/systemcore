import { Lightbulb, PackageOpen, RefreshCw, ShieldAlert, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, LoadingState } from "../../components/feedback/States";
import { StatusBadge } from "../../components/feedback/StatusBadge";
import { PageContainer } from "../../components/layout/PageContainer";
import { t } from "../../lib/i18n";
import { DEFAULT_ACCENT, deviceColor, scanDevices, useLighting } from "../../stores/lighting";
import { updateSettings, useSettings } from "../../stores/settings";
import { hardwareDriverStatus, restartAsAdmin } from "../../lib/tauri";
import type { RgbDevice } from "../../types/telemetry";
import { Switch } from "../settings/SettingsPage";
import { buildPc, buildPeripherals, PART_LABELS, PC_PARTS, PERIPHERAL_PARTS } from "./models";
import { Stage3D } from "./Stage3D";
import type { Stage } from "./stage";

const PRESETS = ["#ff2a2a", "#ff7a1a", "#ffd21a", "#2aff6a", "#1ad8ff", "#2a5cff", "#a12aff", "#ff2ad4", "#ffffff"];
// Detected but no color chosen yet: still lit (so it is clickable), in neutral white.
const UNSET = "#9aa0a6";

export type LightingScope = "pc" | "peripherals";

const SCOPES = {
  pc: {
    parts: PC_PARTS,
    build: buildPc,
    title: "PC lighting",
    subtitle: "RGB parts inside the PC that SystemCore can control directly, without vendor software. Click a lit part to change its color.",
  },
  peripherals: {
    parts: PERIPHERAL_PARTS,
    build: buildPeripherals,
    title: "Peripherals",
    subtitle: "RGB keyboards, mice and headsets that SystemCore can control directly, without vendor software. Click a lit part to change its color.",
  },
};

const partIn = (parts: Record<string, string[]>, d: RgbDevice) => Object.keys(parts).find((p) => parts[p].includes(d.kind)) ?? null;
// Devices of a kind neither scene draws are listed with the peripherals (they are almost always USB gadgets).
const inScope = (scope: LightingScope, d: RgbDevice) => (scope === "pc" ? partIn(PC_PARTS, d) !== null : partIn(PC_PARTS, d) === null);

export function LightingPage({ scope }: { scope: LightingScope }) {
  const settings = useSettings();
  const { devices: all, scanning, errors } = useLighting();
  const { parts, build, title, subtitle } = SCOPES[scope];
  const devices = useMemo(() => all?.filter((d) => inScope(scope, d)) ?? null, [all, scope]);
  const slotOf = (d: RgbDevice) => partIn(parts, d);
  const { followAccent, colors } = settings.lighting;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Both scenes: lift a part out (on the PC, after taking the side panel off), then color it.
  const teardown = true;
  const isPc = scope === "pc";
  const [lifted, setLifted] = useState<string | null>(null);
  const [caseOpen, setCaseOpen] = useState(!isPc);
  const stageRef = useRef<Stage | null>(null);
  // RAM and motherboard lighting go through the PawnIO driver, which only opens for an elevated app.
  const [driver, setDriver] = useState<{ installed: boolean; elevated: boolean } | null>(null);
  useEffect(() => {
    if (isPc) void hardwareDriverStatus().then(setDriver).catch(() => {});
  }, [isPc]);
  const labels = useMemo(() => {
    const out: Record<string, string> = { case: t("Open the PC") };
    for (const p of Object.keys(parts)) out[p] = t(PART_LABELS[p]);
    return out;
  }, [parts]);
  // Guide: PC = open → pick → color; peripherals = pick → color.
  const steps = isPc ? ["Open the PC", "Pick a part", "Set its color"] : ["Pick a device", "Set its color"];
  const step = lifted ? steps.length - 1 : isPc && !caseOpen ? 0 : steps.length - 2;

  // shortcut: one device per 3D part (the first found); extra devices of the same kind are only in the list below.
  const bySlot = useMemo(() => {
    const map: Record<string, RgbDevice> = {};
    for (const d of devices ?? []) {
      const s = partIn(parts, d);
      if (s && !map[s]) map[s] = d;
    }
    return map;
  }, [devices, parts]);
  const sceneColors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [slot, d] of Object.entries(bySlot)) out[slot] = deviceColor(settings, d.id) ?? UNSET;
    return out;
  }, [bySlot, settings]);

  const selected = teardown ? (lifted ? (bySlot[lifted] ?? null) : null) : (devices?.find((d) => d.id === selectedId) ?? null);
  const selectedSlot = teardown ? lifted : selected ? slotOf(selected) : null;
  const pickDevice = (d: RgbDevice) => {
    const part = slotOf(d);
    if (teardown && part) stageRef.current?.focus(part);
    else setSelectedId(d.id);
  };
  const color = selected ? (deviceColor(settings, selected.id) ?? UNSET) : UNSET;
  const setColor = (c: string) => selected && updateSettings("lighting", { colors: { ...colors, [selected.id]: c } });

  return (
    <PageContainer
      title={t(title)}
      subtitle={t(subtitle)}
      actions={
        <button type="button" className="button button--secondary" disabled={scanning} onClick={() => void scanDevices()}>
          <RefreshCw className="button__icon" aria-hidden="true" /> {scanning ? t("Searching…") : t("Search again")}
        </button>
      }
    >
      {driver && !(driver.installed && driver.elevated) && (
        <div className="notice notice--info lighting__driver" role="status">
          <ShieldAlert aria-hidden="true" />
          <span>
            {driver.installed
              ? t("RAM and motherboard lighting need SystemCore to run as administrator.")
              : t("RAM and motherboard lighting need the PawnIO driver. Reinstall SystemCore to add it, or get it from pawnio.eu.")}
          </span>
          {driver.installed && (
            <button type="button" className="button button--secondary" onClick={() => void restartAsAdmin()}>
              {t("Restart as administrator")}
            </button>
          )}
        </div>
      )}

      <section className="panel lighting__sync">
        <div className="setting">
          <div className="setting__text">
            <div className="setting__title">{t("Match the app color")}</div>
            <div className="setting__hint">{t("Every RGB device takes the accent color from Settings and follows it when it changes.")}</div>
          </div>
          <div className="setting__control">
            <span className="lighting__chip" style={{ background: settings.appearance.accent ?? DEFAULT_ACCENT }} aria-hidden="true" />
            <Switch label="Match the app color" checked={followAccent} onChange={(v) => updateSettings("lighting", { followAccent: v })} />
          </div>
        </div>
      </section>

      <div className="lighting">
        <section className="panel lighting__view">
          <Stage3D
            build={build}
            colors={sceneColors}
            selected={selectedSlot}
            onSelect={(part) => (teardown ? setLifted(part) : setSelectedId(part ? (bySlot[part]?.id ?? null) : null))}
            onOpen={setCaseOpen}
            stageRef={stageRef}
            labels={labels}
          />
          <ol className="lighting__steps" aria-label={t("How it works")}>
            {steps.map((s, i) => (
              <li key={s} className={i === step ? "lighting__step lighting__step--active" : i < step ? "lighting__step lighting__step--done" : "lighting__step"} aria-current={i === step ? "step" : undefined}>
                <span className="lighting__step-no">{i + 1}</span> {t(s)}
              </li>
            ))}
          </ol>
          <p className="lighting__legend">
            <span className="lighting__key lighting__key--rgb" aria-hidden="true" /> {t("RGB found, color can be set")}
            <span className="lighting__key" aria-hidden="true" /> {t("No RGB found")}
            <span className="lighting__legend-tip">{t("Drag to rotate · scroll to zoom · click empty space to put a part back")}</span>
          </p>
        </section>

        <section className="panel lighting__side">
          {teardown && !lifted ? (
            <EmptyState icon={PackageOpen}>{!isPc ? t("Click a device to pick it up.") : caseOpen ? t("Click a part to take it out of the PC.") : t("Click the PC to take off the side panel.")}</EmptyState>
          ) : !selected ? (
            teardown && lifted ? (
              <>
                <h2 className="panel__title">{t(PART_LABELS[lifted])}</h2>
                <p className="setting__hint">{isPc ? t("No RGB device that SystemCore can control was found for this part.") : t("No device of this kind that SystemCore can control is connected.")}</p>
              </>
            ) : (
              <EmptyState icon={Lightbulb}>{t("Select a lit part in the 3D view or a device below.")}</EmptyState>
            )
          ) : (
            <>
              <h2 className="panel__title">{selected.name}</h2>
              <dl className="lighting__facts">
                <dt>{t("Part")}</dt>
                <dd>{selectedSlot ? t(PART_LABELS[selectedSlot]) : t("Other device")}</dd>
                <dt>{t("Control")}</dt>
                <dd>{selected.backend}</dd>
                <dt>{t("Zones")}</dt>
                <dd>{selected.zones}</dd>
              </dl>

              <div className="accent-picker lighting__picker" role="radiogroup" aria-label={t("Color")}>
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={color === p}
                    aria-label={p}
                    disabled={followAccent}
                    className="accent-picker__swatch"
                    style={{ background: p }}
                    onClick={() => setColor(p)}
                  />
                ))}
                <label className="accent-picker__custom" title={t("Any color")}>
                  <input type="color" aria-label={t("Custom color")} value={color} disabled={followAccent} onChange={(e) => setColor(e.target.value)} />
                </label>
              </div>
              {followAccent && <p className="setting__hint">{t("Turn off “Match the app color” to pick a color per device.")}</p>}
              {!selected.available && <p className="setting__hint">{t("Windows gives lighting control to the app in front. The color comes back when SystemCore is in front again.")}</p>}
              {selected.backend === "Logitech HID++" && <p className="setting__hint">{t("If Logitech G HUB is running, it may set its own color again. Turn off its lighting control (or close it) to keep this color.")}</p>}
              {errors[selected.id] && (
                <div className="notice notice--danger" role="alert">
                  <ShieldAlert aria-hidden="true" /> {t(errors[selected.id])}
                </div>
              )}
            </>
          )}
          {teardown && (lifted || (isPc && caseOpen)) && (
            <div className="lighting__actions">
              {lifted && (
                <button type="button" className="button button--secondary" onClick={() => stageRef.current?.release()}>
                  <Undo2 className="button__icon" aria-hidden="true" /> {t("Put it back")}
                </button>
              )}
              {isPc && (
                <button type="button" className="button button--ghost" onClick={() => stageRef.current?.close()}>
                  {t("Close the case")}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="panel panel--flush">
        <div className="panel__header">
          <h2 className="panel__title">
            <Lightbulb className="panel__icon" aria-hidden="true" /> {t("Detected RGB devices")}
          </h2>
        </div>
        {!devices ? (
          <LoadingState />
        ) : devices.length === 0 ? (
          <EmptyState icon={Lightbulb}>{scope === "pc" ? t("No RGB part found inside the PC that SystemCore can control yet.") : t("No RGB device found that SystemCore can control.")}</EmptyState>
        ) : (
          <ul className="lighting__list">
            {devices.map((d) => (
              <li key={d.id}>
                <button type="button" className={`lighting__device${d.id === selected?.id ? " lighting__device--active" : ""}`} onClick={() => pickDevice(d)}>
                  <span className="lighting__chip" style={{ background: deviceColor(settings, d.id) ?? UNSET }} aria-hidden="true" />
                  <span className="lighting__device-name">{d.name}</span>
                  <span className="lighting__device-meta">{d.backend}</span>
                  {errors[d.id] ? <StatusBadge tone="danger">{t("Error")}</StatusBadge> : !d.available && <StatusBadge tone="neutral">{t("In background")}</StatusBadge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
