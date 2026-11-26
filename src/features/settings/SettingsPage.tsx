import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from "@tauri-apps/plugin-autostart";
import { BellRing, Gamepad2, PictureInPicture2, Power, ShieldCheck } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { PageContainer } from "../../components/layout/PageContainer";
import { toggleOverlayWindow, updateOverlay, updateSettings, useOverlayOpen, useSettings, type AlertSettings, type OverlayRow } from "../../stores/settings";
import { isElevated, restartAsAdmin } from "../../lib/tauri";
import { CORNERS } from "../overlay/placement";

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="switch" onClick={() => onChange(!checked)}>
      <span className="switch__thumb" />
    </button>
  );
}

function SettingRow({ title, hint, control, disabled }: { title: string; hint: string; control: ReactNode; disabled?: boolean }) {
  return (
    <div className={`setting${disabled ? " setting--disabled" : ""}`}>
      <div className="setting__text">
        <div className="setting__title">{title}</div>
        <div className="setting__hint">{hint}</div>
      </div>
      <div className="setting__control">{control}</div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="panel settings">
      <div className="panel__header">
        <h2 className="panel__title">
          {icon} {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <label className="checkbox" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Limit({ label, unit, value, min, max, disabled, onChange }: { label: string; unit: string; value: number; min: number; max: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <label className="number-field">
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        // Commit on blur/Enter, not per keystroke, so typing "85" doesn't pass through a clamped "8".
        key={value}
        defaultValue={value}
        disabled={disabled}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        onBlur={(e) => {
          const n = Math.round(Number(e.target.value));
          // Clamp so a typo can't silence an alert (900 °C) or fire it constantly (5 %).
          if (e.target.value === "" || !Number.isFinite(n)) e.target.value = String(value);
          else {
            const clamped = Math.min(max, Math.max(min, n));
            e.target.value = String(clamped);
            onChange(clamped);
          }
        }}
      />
      <span>{unit}</span>
    </label>
  );
}

const ROWS: { id: OverlayRow; label: string }[] = [
  { id: "fps", label: "FPS" },
  { id: "cpu", label: "CPU" },
  { id: "gpu", label: "GPU" },
  { id: "ram", label: "RAM" },
  { id: "net", label: "Network" },
];

export function SettingsPage() {
  const { overlay: o, startup, alerts } = useSettings();
  const open = useOverlayOpen();
  // Autostart lives in the Windows registry, not in our settings; read it back after each change.
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    autostartEnabled().then(setAutostart).catch(() => setAutostart(null));
  }, []);
  const toggleAutostart = async (on: boolean) => {
    try {
      await (on ? enableAutostart() : disableAutostart());
      setAutostart(await autostartEnabled());
    } catch {
      setAutostart(null);
    }
  };
  const setAlert = (patch: Partial<AlertSettings>) => updateSettings("alerts", patch);
  const [elevated, setElevated] = useState<boolean | null>(null);
  const [elevateError, setElevateError] = useState<string | null>(null);
  useEffect(() => {
    isElevated().then(setElevated).catch(() => setElevated(null));
  }, []);

  return (
    <PageContainer title="Settings" subtitle="Saved on this PC. Changes apply immediately.">
      <Section icon={<Gamepad2 className="panel__icon" aria-hidden="true" />} title="Gaming">
        <SettingRow
          title="FPS measurement"
          hint={
            elevated
              ? "Active. FPS, frame time and 1% low of the app in front are shown in the overlay and recorded in History."
              : "Windows only shares other apps' frame events with administrator rights. Restart SystemCore as administrator to see FPS."
          }
          control={
            elevated ? (
              <span className="setting__status">
                <ShieldCheck aria-hidden="true" /> Running as administrator
              </span>
            ) : (
              <div className="setting__stack">
                <button type="button" className="button button--primary" onClick={() => restartAsAdmin().catch((e) => setElevateError(String(e)))}>
                  Restart as administrator
                </button>
                {elevateError && <span className="setting__error">{elevateError}</span>}
              </div>
            )
          }
        />
        <SettingRow
          title="Show overlay in games"
          hint="Opens the overlay when an app goes fullscreen (or borderless fullscreen) and closes it when you leave. Fullscreen videos count too."
          control={<Switch label="Show overlay in games" checked={o.autoShow} onChange={(autoShow) => updateOverlay({ autoShow })} />}
        />
      </Section>

      <Section icon={<PictureInPicture2 className="panel__icon" aria-hidden="true" />} title="Overlay">
        <SettingRow
          title="Show overlay"
          hint="Small always-on-top window, visible over windowed and borderless games. Shortcut: Ctrl+Shift+O."
          control={<Switch label="Show overlay" checked={open} onChange={() => void toggleOverlayWindow()} />}
        />

        <SettingRow
          title="Readings"
          hint="Choose what the overlay shows."
          control={
            <div className="check-group">
              {ROWS.map((r) => (
                <Check key={r.id} label={r.label} checked={o.rows[r.id]} onChange={(on) => updateOverlay({ rows: { ...o.rows, [r.id]: on } })} />
              ))}
            </div>
          }
        />

        <SettingRow
          title="Compact layout"
          hint="A single slim line instead of the card: FPS, usage, temperature, network and ping."
          control={<Switch label="Compact layout" checked={o.compact} onChange={(compact) => updateOverlay({ compact })} />}
        />

        <SettingRow
          title="Size"
          hint="Scale the overlay up for big screens or down to keep it out of the way."
          control={
            <div className="range-field">
              <input
                type="range"
                min={75}
                max={150}
                step={5}
                aria-label="Overlay size"
                value={Math.round(o.scale * 100)}
                onChange={(e) => updateOverlay({ scale: Number(e.target.value) / 100 })}
              />
              <output className="range-field__value">{Math.round(o.scale * 100)}%</output>
            </div>
          }
        />

        <SettingRow
          title="Fixed position"
          hint={o.freeMove ? "Turn off free positioning to pin the overlay to a corner." : "Corner of the screen the overlay sticks to."}
          disabled={o.freeMove}
          control={
            <div className="corner-picker" role="radiogroup" aria-label="Overlay corner">
              {CORNERS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={o.corner === c.id}
                  aria-label={c.label}
                  title={c.label}
                  disabled={o.freeMove}
                  className={`corner-picker__spot corner-picker__spot--${c.id}`}
                  onClick={() => updateOverlay({ corner: c.id })}
                />
              ))}
            </div>
          }
        />

        <SettingRow
          title="Free positioning"
          hint="Drag the overlay anywhere on the screen with the mouse."
          control={<Switch label="Free positioning" checked={o.freeMove} onChange={(freeMove) => updateOverlay({ freeMove, locked: false })} />}
        />

        <SettingRow
          title="Lock position"
          hint="Keeps the overlay where you dragged it, so it can't be moved by accident."
          disabled={!o.freeMove}
          control={<Check label="Locked" checked={o.locked} disabled={!o.freeMove} onChange={(locked) => updateOverlay({ locked })} />}
        />
      </Section>

      <Section icon={<Power className="panel__icon" aria-hidden="true" />} title="Startup & tray">
        <SettingRow
          title="Start with Windows"
          hint={autostart == null ? "Could not read the Windows startup setting." : "Launch SystemCore when you sign in."}
          control={<Switch label="Start with Windows" checked={autostart ?? false} disabled={autostart == null} onChange={(on) => void toggleAutostart(on)} />}
        />
        <SettingRow
          title="Start in the tray"
          hint="When started with Windows, stay in the notification area instead of opening the window."
          disabled={!autostart}
          control={<Switch label="Start in the tray" checked={startup.startHidden} disabled={!autostart} onChange={(startHidden) => updateSettings("startup", { startHidden })} />}
        />
        <SettingRow
          title="Open overlay on start"
          hint="Show the overlay every time SystemCore starts."
          control={<Switch label="Open overlay on start" checked={startup.overlayAtStartup} onChange={(overlayAtStartup) => updateSettings("startup", { overlayAtStartup })} />}
        />
        <SettingRow
          title="Keep running in the tray"
          hint="Closing the window hides SystemCore to the tray (alerts and overlay keep working). Quit from the tray icon."
          control={<Switch label="Keep running in the tray" checked={startup.closeToTray} onChange={(closeToTray) => updateSettings("startup", { closeToTray })} />}
        />
      </Section>

      <Section icon={<BellRing className="panel__icon" aria-hidden="true" />} title="Alerts">
        <SettingRow
          title="Windows notifications"
          hint="Notify once when a reading reaches its limit; it re-arms after dropping 5 below."
          control={<Switch label="Alert notifications" checked={alerts.enabled} onChange={(enabled) => setAlert({ enabled })} />}
        />
        <SettingRow
          title="CPU temperature"
          hint="Needs LibreHardwareMonitor running for CPU temperature."
          disabled={!alerts.enabled}
          control={<Limit label="CPU temperature limit" unit="°C" min={50} max={110} value={alerts.cpuTempC} disabled={!alerts.enabled} onChange={(cpuTempC) => setAlert({ cpuTempC })} />}
        />
        <SettingRow
          title="GPU temperature"
          hint="NVIDIA GPUs only for now."
          disabled={!alerts.enabled}
          control={<Limit label="GPU temperature limit" unit="°C" min={50} max={110} value={alerts.gpuTempC} disabled={!alerts.enabled} onChange={(gpuTempC) => setAlert({ gpuTempC })} />}
        />
        <SettingRow
          title="Memory usage"
          hint="Share of physical RAM in use."
          disabled={!alerts.enabled}
          control={<Limit label="Memory usage limit" unit="%" min={50} max={99} value={alerts.ramPercent} disabled={!alerts.enabled} onChange={(ramPercent) => setAlert({ ramPercent })} />}
        />
        <SettingRow
          title="Heavy programs"
          hint="Notify when one program keeps using a lot of CPU or memory, and say which one."
          control={<Switch label="Heavy program alerts" checked={alerts.hogEnabled} onChange={(hogEnabled) => setAlert({ hogEnabled })} />}
        />
        <SettingRow
          title="Program CPU limit"
          hint="Share of the whole processor, as in Task Manager."
          disabled={!alerts.hogEnabled}
          control={<Limit label="Program CPU limit" unit="%" min={10} max={100} value={alerts.hogCpuPercent} disabled={!alerts.hogEnabled} onChange={(hogCpuPercent) => setAlert({ hogCpuPercent })} />}
        />
        <SettingRow
          title="Program memory limit"
          hint="Memory one program may use before it counts as heavy."
          disabled={!alerts.hogEnabled}
          control={<Limit label="Program memory limit" unit="GB" min={1} max={128} value={alerts.hogMemoryGb} disabled={!alerts.hogEnabled} onChange={(hogMemoryGb) => setAlert({ hogMemoryGb })} />}
        />
        <SettingRow
          title="For at least"
          hint="Short spikes (loading, updates) are ignored."
          disabled={!alerts.hogEnabled}
          control={<Limit label="Minutes above the limit" unit="min" min={1} max={60} value={alerts.hogMinutes} disabled={!alerts.hogEnabled} onChange={(hogMinutes) => setAlert({ hogMinutes })} />}
        />
      </Section>
    </PageContainer>
  );
}
