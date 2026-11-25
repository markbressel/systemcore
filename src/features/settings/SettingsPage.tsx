import { PictureInPicture2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import { PageContainer } from "../../components/layout/PageContainer";
import { toggleOverlayWindow, updateOverlay, useOverlayOpen, useSettings } from "../../stores/settings";
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

export function SettingsPage() {
  const { overlay: o } = useSettings();
  const open = useOverlayOpen();
  const lockId = useId();

  return (
    <PageContainer title="Settings" subtitle="Saved on this PC. Changes apply immediately.">
      <section className="panel settings">
        <div className="panel__header">
          <h2 className="panel__title">
            <PictureInPicture2 className="panel__icon" aria-hidden="true" /> Overlay
          </h2>
        </div>

        <SettingRow
          title="Show overlay"
          hint="Small always-on-top window with CPU, GPU, RAM and network. Visible over windowed and borderless games."
          control={<Switch label="Show overlay" checked={open} onChange={() => void toggleOverlayWindow()} />}
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
          control={
            <label className="checkbox" htmlFor={lockId}>
              <input id={lockId} type="checkbox" checked={o.locked} disabled={!o.freeMove} onChange={(e) => updateOverlay({ locked: e.target.checked })} />
              Locked
            </label>
          }
        />
      </section>
    </PageContainer>
  );
}
