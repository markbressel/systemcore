import { Gamepad2, Monitor, Plus, RefreshCw, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, LoadingState } from "../../components/feedback/States";
import { PageContainer } from "../../components/layout/PageContainer";
import { t } from "../../lib/i18n";
import { setDisplayHardware } from "../../lib/tauri";
import { colorFor, NEUTRAL, previewProfile, refreshDisplays, useDisplay } from "../../stores/display";
import { updateSettings, useSettings, type ColorAdjust } from "../../stores/settings";
import { useTelemetry } from "../../stores/telemetry";
import { Switch } from "../settings/SettingsPage";

function Slider(p: { title: string; hint: string; min: number; max: number; step: number; value: number; show: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="setting">
      <div className="setting__text">
        <div className="setting__title">{t(p.title)}</div>
        <div className="setting__hint">{t(p.hint)}</div>
      </div>
      <div className="setting__control">
        <div className="range-field">
          <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} aria-label={t(p.title)} onChange={(e) => p.onChange(Number(e.target.value))} />
          <output className="range-field__value">{p.show(p.value)}</output>
        </div>
      </div>
    </div>
  );
}

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));
const DESKTOP = "";

export function DisplayPage() {
  const settings = useSettings();
  const { displays, active, error } = useDisplay();
  const game = useTelemetry().system?.game.process ?? null;
  const { monitors, profiles, autoProfiles } = settings.display;
  // What the sliders edit: the desktop settings of one monitor, or a game profile (applies to every monitor).
  const [editing, setEditing] = useState(DESKTOP);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [newExe, setNewExe] = useState("");
  const [hw, setHw] = useState<Record<string, { brightness?: number; contrast?: number }>>({});

  // A profile being edited is shown live; leaving the page goes back to automatic.
  useEffect(() => {
    previewProfile(editing || null);
    return () => previewProfile(null);
  }, [editing]);

  const display = displays?.find((d) => d.id === monitorId) ?? displays?.find((d) => d.primary) ?? displays?.[0] ?? null;
  const profile = profiles.find((p) => p.exe === editing) ?? null;
  const color: ColorAdjust = profile ? profile.color : display ? colorFor(display.id, null) : NEUTRAL;

  const update = (patch: Partial<ColorAdjust>) => {
    if (profile) {
      updateSettings("display", { profiles: profiles.map((p) => (p === profile ? { ...p, color: { ...p.color, ...patch } } : p)) });
    } else if (display) {
      updateSettings("display", { monitors: { ...monitors, [display.id]: { ...color, ...patch } } });
    }
  };
  const addProfile = (exe: string) => {
    const name = exe.trim();
    if (!name || profiles.some((p) => p.exe.toLowerCase() === name.toLowerCase())) return setEditing(name);
    updateSettings("display", { profiles: [...profiles, { exe: name, color: { ...NEUTRAL } }] });
    setEditing(name);
    setNewExe("");
  };
  const removeProfile = (exe: string) => {
    updateSettings("display", { profiles: profiles.filter((p) => p.exe !== exe) });
    if (editing === exe) setEditing(DESKTOP);
  };
  const setHardware = (kind: "brightness" | "contrast", v: number) => {
    if (!display) return;
    setHw({ ...hw, [display.id]: { ...hw[display.id], [kind]: v } });
    void setDisplayHardware(display.id, kind === "brightness" ? v : null, kind === "contrast" ? v : null).catch(() => {});
  };
  const label = (i: number, primary: boolean) => `${t("Display {n}", { n: i + 1 })}${primary ? ` (${t("primary")})` : ""}`;
  const vib = display?.vibrance;

  return (
    <PageContainer
      title={t("Display")}
      subtitle={t("Picture settings for your monitors, and color profiles that switch on by themselves when a game is in front.")}
      actions={
        <button type="button" className="button button--secondary" onClick={() => void refreshDisplays()}>
          <RefreshCw className="button__icon" aria-hidden="true" /> {t("Search again")}
        </button>
      }
    >
      {error && (
        <div className="notice notice--danger" role="alert">
          <ShieldAlert aria-hidden="true" /> {t(error)}
        </div>
      )}

      <section className="settings">
        <div className="panel__header">
          <h2 className="panel__title">
            <Gamepad2 className="panel__icon" aria-hidden="true" /> {t("Game profiles")}
          </h2>
        </div>
        <div className="setting">
          <div className="setting__text">
            <div className="setting__title">{t("Switch profiles automatically")}</div>
            <div className="setting__hint">
              {active ? t("Now active: {exe}", { exe: active }) : t("A game's profile turns on while the game is in front, and the desktop settings come back after.")}
            </div>
          </div>
          <div className="setting__control">
            <Switch label="Switch profiles automatically" checked={autoProfiles} onChange={(v) => updateSettings("display", { autoProfiles: v })} />
          </div>
        </div>
        <div className="display__chips" role="tablist" aria-label={t("What to edit")}>
          <button type="button" role="tab" aria-selected={editing === DESKTOP} className="display__chip" onClick={() => setEditing(DESKTOP)}>
            <Monitor aria-hidden="true" /> {t("Desktop")}
          </button>
          {profiles.map((p) => (
            <span key={p.exe} className="display__chip-wrap">
              <button type="button" role="tab" aria-selected={editing === p.exe} className="display__chip" onClick={() => setEditing(p.exe)}>
                <Gamepad2 aria-hidden="true" /> {p.exe}
              </button>
              <button type="button" className="display__chip-remove" aria-label={t("Delete profile {exe}", { exe: p.exe })} onClick={() => removeProfile(p.exe)}>
                <Trash2 aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="display__add"
          onSubmit={(e) => {
            e.preventDefault();
            addProfile(newExe);
          }}
        >
          <label className="search-field">
            <Gamepad2 className="search-field__icon" aria-hidden="true" />
            <input className="search-field__input" placeholder={t("Game program, e.g. cs2.exe")} aria-label={t("Game program")} value={newExe} onChange={(e) => setNewExe(e.target.value)} />
          </label>
          <button type="submit" className="button button--secondary" disabled={!newExe.trim()}>
            <Plus className="button__icon" aria-hidden="true" /> {t("Add profile")}
          </button>
          {game && !/systemcore/i.test(game) && (
            <button type="button" className="button button--ghost" onClick={() => addProfile(game)}>
              <Plus className="button__icon" aria-hidden="true" /> {t("Add {exe}", { exe: game })}
            </button>
          )}
        </form>
      </section>

      {!displays ? (
        <LoadingState />
      ) : displays.length === 0 ? (
        <EmptyState icon={Monitor}>{t("No display found.")}</EmptyState>
      ) : (
        <section className="settings">
          <div className="panel__header">
            <h2 className="panel__title">
              <Monitor className="panel__icon" aria-hidden="true" /> {profile ? t("Profile: {exe} (all displays, shown live)", { exe: profile.exe }) : t("Desktop picture")}
            </h2>
            <button type="button" className="button button--ghost" onClick={() => update({ ...NEUTRAL })}>
              <RotateCcw className="button__icon" aria-hidden="true" /> {t("Reset")}
            </button>
          </div>
          {!profile && displays.length > 1 && (
            <div className="display__chips" role="tablist" aria-label={t("Display")}>
              {displays.map((d, i) => (
                <button key={d.id} type="button" role="tab" aria-selected={d.id === display?.id} className="display__chip" onClick={() => setMonitorId(d.id)}>
                  {label(i, d.primary)} · {d.width}×{d.height}
                </button>
              ))}
            </div>
          )}
          <Slider title="Brightness" hint="Lifts or darkens the whole picture." min={-50} max={50} step={1} value={color.brightness} show={signed} onChange={(brightness) => update({ brightness })} />
          <Slider title="Contrast" hint="Spreads dark and light apart, or pulls them together." min={-50} max={50} step={1} value={color.contrast} show={signed} onChange={(contrast) => update({ contrast })} />
          <Slider
            title="Gamma"
            hint="Above 1 brightens the shadows (see enemies in dark corners); below 1 deepens them."
            min={0.5}
            max={2}
            step={0.05}
            value={color.gamma}
            show={(v) => v.toFixed(2)}
            onChange={(gamma) => update({ gamma })}
          />
          <Slider
            title="Color temperature"
            hint="Lower is warmer and easier on the eyes at night; 6500 K is neutral."
            min={3000}
            max={9000}
            step={100}
            value={color.temperature}
            show={(v) => `${v} K`}
            onChange={(temperature) => update({ temperature })}
          />
          {vib ? (
            <Slider
              title="Saturation"
              hint="NVIDIA digital vibrance: richer, more vivid colors."
              min={vib.min}
              max={vib.max}
              step={1}
              value={color.vibrance ?? vib.current}
              show={(v) => `${Math.round(50 + (50 * (v - vib.min)) / Math.max(1, vib.max - vib.min))}%`}
              onChange={(vibrance) => update({ vibrance })}
            />
          ) : (
            <p className="setting__hint display__note">{t("Saturation needs an NVIDIA graphics card (AMD support is planned).")}</p>
          )}
          {!profile && display && (display.hwBrightness || display.hwContrast) && (
            <>
              <h3 className="display__sub">{t("Monitor's own settings (DDC/CI)")}</h3>
              {display.hwBrightness && (
                <Slider
                  title="Backlight brightness"
                  hint="The monitor's real brightness, like its own buttons. Kept by the monitor."
                  min={display.hwBrightness.min}
                  max={display.hwBrightness.max}
                  step={1}
                  value={hw[display.id]?.brightness ?? display.hwBrightness.current}
                  show={String}
                  onChange={(v) => setHardware("brightness", v)}
                />
              )}
              {display.hwContrast && (
                <Slider
                  title="Monitor contrast"
                  hint="The monitor's own contrast setting."
                  min={display.hwContrast.min}
                  max={display.hwContrast.max}
                  step={1}
                  value={hw[display.id]?.contrast ?? display.hwContrast.current}
                  show={String}
                  onChange={(v) => setHardware("contrast", v)}
                />
              )}
            </>
          )}
          {!profile && display && !display.hwBrightness && !display.hwContrast && (
            <p className="setting__hint display__note">{t("This monitor does not answer DDC/CI, so its own backlight cannot be set from here. Turning on DDC/CI in the monitor's menu usually helps.")}</p>
          )}
          <p className="setting__hint display__note">{t("Some games in exclusive fullscreen load their own colors; borderless fullscreen keeps these settings.")}</p>
        </section>
      )}
    </PageContainer>
  );
}
