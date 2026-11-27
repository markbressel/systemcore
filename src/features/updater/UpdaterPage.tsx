import { Download, HardDrive, PackageCheck, RefreshCw, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../../components/feedback/States";
import { StatusBadge, type Tone } from "../../components/feedback/StatusBadge";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { formatBytes } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useTelemetry } from "../../stores/telemetry";
import { checkUpdates, runUpdates, stopUpdates, useUpdater, type RowStatus } from "../../stores/updater";

const STATUS: Record<RowStatus["state"], [Tone, string]> = {
  waiting: ["neutral", "Waiting"],
  updating: ["info", "Updating…"],
  done: ["success", "Updated"],
  failed: ["danger", "Failed"],
};

export function UpdaterPage() {
  const u = useUpdater();
  const { disks } = useTelemetry();
  const [selected, setSelected] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!u.list && !u.checking) void checkUpdates();
  }, [u.list, u.checking]);

  const list = u.list ?? [];
  // Everything is ticked until the user changes it; updated programs drop out of the selection.
  const pending = list.filter((p) => u.status[p.id]?.state !== "done");
  const chosen = pending.filter((p) => (selected ? selected.has(p.id) : true));
  const toggle = (id: string) => setSelected(new Set(chosen.map((p) => p.id).filter((x) => x !== id).concat(chosen.some((p) => p.id === id) ? [] : [id])));

  const known = chosen.filter((p) => u.sizes[p.id] != null);
  const download = known.reduce((sum, p) => sum + (u.sizes[p.id] ?? 0), 0);
  const unknown = chosen.filter((p) => p.id in u.sizes && u.sizes[p.id] == null).length;
  const measuring = chosen.some((p) => !(p.id in u.sizes));

  // Installers download to the Windows drive (temp folder) and most programs live there too.
  const sys = disks?.disks.find((d) => /^c:/i.test(d.mountPoint));
  const usedPct = sys ? ((sys.totalBytes - sys.availableBytes) / sys.totalBytes) * 100 : 0;
  const dlPct = sys ? Math.min(100 - usedPct, (download / sys.totalBytes) * 100) : 0;
  const freeAfter = sys ? sys.availableBytes - download : null;
  const tight = sys && freeAfter != null && freeAfter < sys.totalBytes * 0.1;

  const done = Object.values(u.status).filter((s) => s.state === "done").length;
  const failed = Object.values(u.status).filter((s) => s.state === "failed").length;

  return (
    <PageContainer
      title={t("Updater")}
      subtitle={t("Updates your installed programs with Windows Package Manager (winget), the same tool as \"winget upgrade --all\" in the terminal.")}
      actions={
        <button type="button" className="button button--secondary" disabled={u.checking || u.running} onClick={() => void checkUpdates()}>
          <RefreshCw className={`button__icon${u.checking ? " u-spin" : ""}`} aria-hidden="true" /> {t("Check again")}
        </button>
      }
    >
      {u.error && <ErrorState message={t(u.error)} />}

      <section className="panel updater-summary">
        <div className="updater-summary__stat">
          <span className="updater-summary__label">{t("Updates available")}</span>
          <span className="updater-summary__value">{u.list ? pending.length : "—"}</span>
          <span className="updater-summary__sub">{t("{n} selected", { n: chosen.length })}</span>
        </div>
        <div className="updater-summary__stat">
          <span className="updater-summary__label">{t("Download size")}</span>
          <span className="updater-summary__value">{u.list ? formatBytes(download) : "—"}</span>
          <span className="updater-summary__sub">
            {measuring ? t("Measuring…") : unknown ? t("+ {n} programs without a size (e.g. Microsoft Store)", { n: unknown }) : t("All sizes known")}
          </span>
        </div>
        <div className="updater-summary__disk">
          <span className="updater-summary__label">
            <HardDrive className="button__icon" aria-hidden="true" /> {t("Windows drive")} {sys ? sys.mountPoint : ""}
          </span>
          {sys ? (
            <>
              <div className="metric-indicator metric-indicator--storage" role="img" aria-label={t("{used} % used, the update needs {size}", { used: usedPct.toFixed(0), size: formatBytes(download) })}>
                <span className="metric-indicator__fill" style={{ width: `${usedPct}%` }} />
                <span className="metric-indicator__fill metric-indicator__fill--extra" style={{ width: `${dlPct}%` }} />
              </div>
              <div className="distribution__legend">
                <span className="chart__legend-item" style={{ ["--series-color" as string]: "var(--color-chart-storage)" }}>
                  {t("Used")} · <span className="u-mono">{formatBytes(sys.totalBytes - sys.availableBytes)}</span>
                </span>
                <span className="chart__legend-item" style={{ ["--series-color" as string]: "var(--color-accent)" }}>
                  {t("Update")} · <span className="u-mono">{formatBytes(download)}</span>
                </span>
                <span>
                  {t("Free")} · <span className="u-mono">{formatBytes(sys.availableBytes)} → </span>
                  <b className={`u-mono${tight ? " u-danger" : ""}`}>{formatBytes(Math.max(0, freeAfter ?? 0))}</b>
                </span>
              </div>
              <span className={`updater-summary__sub${tight ? " u-danger" : ""}`}>
                {tight
                  ? t("Little space would be left. Free up space on the Storage page first.")
                  : t("Free space while updating. Installers are deleted afterwards, and new versions take about as much room as the old ones.")}
              </span>
            </>
          ) : (
            <span className="updater-summary__sub">{t("Drive data is loading…")}</span>
          )}
        </div>
      </section>

      <HardwareCard
        title={t("Programs with an update")}
        icon={PackageCheck}
        aside={
          u.running ? (
            <button type="button" className="button button--secondary" onClick={stopUpdates}>
              <Square className="button__icon" aria-hidden="true" /> {t("Stop after this program")}
            </button>
          ) : (
            <button type="button" className="button button--primary" disabled={!chosen.length || u.checking} onClick={() => void runUpdates(chosen.map((p) => p.id))}>
              <Download className="button__icon" aria-hidden="true" /> {t("Update selected ({n})", { n: chosen.length })}
            </button>
          )
        }
      >
        {!u.list ? (
          <LoadingState label={t("Looking for updates… (this can take up to a minute)")} />
        ) : !list.length ? (
          <p className="page__note">{t("Everything is up to date.")}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="data-table__col--narrow">
                    <input
                      type="checkbox"
                      aria-label={t("Select all")}
                      checked={chosen.length === pending.length && pending.length > 0}
                      disabled={u.running}
                      onChange={(e) => setSelected(new Set(e.target.checked ? pending.map((p) => p.id) : []))}
                    />
                  </th>
                  <th><span className="data-table__heading">{t("Program")}</span></th>
                  <th><span className="data-table__heading">{t("Version")}</span></th>
                  <th><span className="data-table__heading">{t("Source")}</span></th>
                  <th className="is-numeric"><span className="data-table__heading">{t("Size")}</span></th>
                  <th><span className="data-table__heading">{t("Status")}</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const s = u.status[p.id];
                  return (
                    <tr key={p.id}>
                      <td>
                        <input type="checkbox" aria-label={p.name} checked={chosen.some((c) => c.id === p.id)} disabled={u.running || s?.state === "done"} onChange={() => toggle(p.id)} />
                      </td>
                      <td className="data-table__primary">
                        {p.name}
                        <div className="updater__id">{p.id}</div>
                      </td>
                      <td className="data-table__mono">
                        {p.version} → <b>{p.available}</b>
                      </td>
                      <td>{p.source === "msstore" ? "Microsoft Store" : p.source}</td>
                      <td className="is-numeric data-table__mono">{!(p.id in u.sizes) ? "…" : u.sizes[p.id] == null ? "—" : formatBytes(u.sizes[p.id]!)}</td>
                      <td>
                        {s && (
                          <span title={s.state === "failed" ? s.reason : undefined}>
                            <StatusBadge tone={STATUS[s.state][0]}>{t(STATUS[s.state][1])}</StatusBadge>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {(done > 0 || failed > 0) && !u.running && (
          <p className="page__note">
            {t("Updated: {done}, failed: {failed}.", { done, failed })} {failed > 0 && t("Point at \"Failed\" to see why; closing the program and trying again usually helps.")}
          </p>
        )}
        <p className="page__note">
          {t("Programs update one at a time, silently. Windows may ask for permission for some of them, and a program that is open may need closing first. A restart is sometimes needed afterwards.")}
        </p>
      </HardwareCard>
    </PageContainer>
  );
}
