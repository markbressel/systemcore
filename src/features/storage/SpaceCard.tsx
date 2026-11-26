import { ArrowUp, File, Folder, FolderOpen, PieChart } from "lucide-react";
import { useState } from "react";
import { LoadingState } from "../../components/feedback/States";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { formatBytes } from "../../lib/format";
import { t } from "../../lib/i18n";
import { revealPath, scanFolder } from "../../lib/tauri";
import type { FolderScan } from "../../types/telemetry";

const SHOWN = 25;

/** "What takes up space": sizes of everything in a folder, largest first; click a folder to look inside. */
export function SpaceCard({ drives }: { drives: string[] }) {
  const [scan, setScan] = useState<FolderScan | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (path?: string) => {
    setLoading(path ?? t("your user folder"));
    setError(null);
    scanFolder(path)
      .then(setScan)
      .catch((e) => setError(t(String(e))))
      .finally(() => setLoading(null));
  };
  const largest = scan?.entries[0]?.bytes || 1;

  return (
    <HardwareCard title={t("What takes up space")} icon={PieChart}>
      <div className="space__start">
        <button type="button" className="button" disabled={loading != null} onClick={() => open()}>
          {t("My user folder")}
        </button>
        {drives.map((d) => (
          <button key={d} type="button" className="button" disabled={loading != null} onClick={() => open(d.endsWith("\\") ? d : d + "\\")}>
            {t("Drive {d}", { d })}
          </button>
        ))}
      </div>
      {error && <p className="page__note u-danger">{error}</p>}
      {loading ? (
        <LoadingState label={t("Measuring {path}… big drives can take a minute.", { path: loading })} />
      ) : (
        scan && (
          <>
            <div className="space__path">
              {scan.parent && (
                <button type="button" className="button button--ghost" onClick={() => open(scan.parent!)} aria-label={t("Up one folder")} title={t("Up one folder")}>
                  <ArrowUp className="button__icon" aria-hidden="true" />
                </button>
              )}
              <span className="u-mono u-break">{scan.path}</span>
              <strong className="u-mono">{formatBytes(scan.totalBytes)}</strong>
            </div>
            <ul className="space__list">
              {scan.entries.slice(0, SHOWN).map((e) => {
                const Icon = e.isDir ? Folder : File;
                return (
                  <li key={e.path} className="space__row">
                    <button type="button" className="space__name" disabled={!e.isDir} onClick={() => open(e.path)} title={e.isDir ? t("Look inside") : e.name}>
                      <Icon className="space__icon" aria-hidden="true" />
                      <span className="u-break">{e.name}</span>
                    </button>
                    <span className="space__bar" aria-hidden="true">
                      <span style={{ width: `${(e.bytes / largest) * 100}%` }} />
                    </span>
                    <span className="space__size u-mono">{formatBytes(e.bytes)}</span>
                    <button type="button" className="button button--ghost" onClick={() => void revealPath(e.path)} aria-label={t("Show {name} in Explorer", { name: e.name })} title={t("Show in Explorer")}>
                      <FolderOpen className="button__icon" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
              {scan.entries.length === 0 && <li className="page__note">{t("This folder is empty, or Windows does not allow looking inside.")}</li>}
            </ul>
          </>
        )
      )}
    </HardwareCard>
  );
}
