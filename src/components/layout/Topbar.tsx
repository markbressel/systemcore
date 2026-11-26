import { ChevronRight, Clock, Download, Layers, PictureInPicture2 } from "lucide-react";
import { toggleOverlayWindow, useOverlayOpen } from "../../stores/settings";
import { installUpdate, useUpdate } from "../../stores/update";
import { formatDuration } from "../../lib/format";
import { useTelemetry } from "../../stores/telemetry";
import { findPage, type PageId } from "./navigation";
import { SystemStatus } from "./SystemStatus";
import { t } from "../../lib/i18n";

export function Topbar({ page }: { page: PageId }) {
  const { system } = useTelemetry();
  const { section, page: current } = findPage(page);
  const uptime = system?.uptimeSecs.value;
  const procs = system?.processCount.value;
  const overlay = useOverlayOpen();
  const update = useUpdate();

  return (
    <header className="topbar">
      <div className="topbar__breadcrumb">
        <span>{t(section)}</span>
        <ChevronRight className="topbar__icon" aria-hidden="true" />
        <span className="topbar__current" aria-current="page">{t(current.label)}</span>
      </div>
      <div className="topbar__meta">
        <span className="topbar__stat" title={t("Time since Windows started")}>
          <Clock className="topbar__icon" aria-hidden="true" />
          {t("Uptime")} <strong>{uptime != null ? formatDuration(uptime) : "—"}</strong>
        </span>
        <span className="topbar__stat">
          <Layers className="topbar__icon" aria-hidden="true" />
          {t("Processes")} <strong>{procs ?? "—"}</strong>
        </span>
        {update.status !== "none" && (
          <button
            type="button"
            className="button button--primary"
            disabled={update.status === "installing"}
            title={update.status === "failed" ? t("Update failed: {message}. Click to retry.", { message: update.message }) : t("SystemCore {version} is available", { version: update.update.version })}
            onClick={() => void installUpdate()}
          >
            <Download className="button__icon" aria-hidden="true" />
            {update.status === "installing"
              ? `${t("Updating…")} ${update.percent != null ? `${update.percent}%` : ""}`
              : update.status === "failed"
                ? t("Retry update")
                : t("Update to {version}", { version: update.update.version })}
          </button>
        )}
        <button
          type="button"
          className="button button--secondary"
          aria-pressed={overlay}
          title={t("Small always-on-top window with CPU, GPU and RAM (borderless/windowed games only)")}
          onClick={() => void toggleOverlayWindow()}
        >
          <PictureInPicture2 className="button__icon" aria-hidden="true" />
          {overlay ? t("Close overlay") : t("Overlay")}
        </button>
        <SystemStatus />
      </div>
    </header>
  );
}
