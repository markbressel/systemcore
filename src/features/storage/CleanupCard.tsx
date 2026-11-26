import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadingState } from "../../components/feedback/States";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { formatBytes } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cleanTarget, cleanupTargets } from "../../lib/tauri";
import type { CleanupTarget } from "../../types/telemetry";

/** One-click cleaning of known-safe locations; every delete is confirmed first. */
export function CleanupCard() {
  const [targets, setTargets] = useState<CleanupTarget[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    cleanupTargets()
      .then(setTargets)
      .catch((e) => setMessage(t(String(e))));
  useEffect(() => void load(), []);

  const clean = async (c: CleanupTarget) => {
    setConfirm(null);
    setBusy(c.id);
    try {
      const freed = await cleanTarget(c.id);
      setMessage(
        t("{label}: {size} freed.", { label: t(c.label), size: formatBytes(freed) }) +
          (freed < c.bytes * 0.9 ? " " + t("Some files were in use or protected and were left alone.") : ""),
      );
    } catch (e) {
      setMessage(t(String(e)));
    } finally {
      setBusy(null);
      void load();
    }
  };

  return (
    <HardwareCard title={t("Clean up")} icon={Sparkles}>
      {!targets ? (
        <LoadingState label={t("Measuring temporary files…")} />
      ) : (
        <ul className="cleanup">
          {targets.map((c) => (
            <li key={c.id} className="cleanup__row">
              <div className="cleanup__text">
                <div className="cleanup__label">{t(c.label)}</div>
                <div className="cleanup__hint">{t(c.hint)}</div>
              </div>
              <span className="cleanup__size u-mono">{formatBytes(c.bytes)}</span>
              {confirm === c.id ? (
                <span className="cleanup__actions">
                  <button type="button" className="button button--primary" onClick={() => void clean(c)}>
                    {t("Delete {size}", { size: formatBytes(c.bytes) })}
                  </button>
                  <button type="button" className="button button--ghost" onClick={() => setConfirm(null)}>
                    {t("Cancel")}
                  </button>
                </span>
              ) : (
                <button type="button" className="button" disabled={busy != null || c.bytes === 0} onClick={() => setConfirm(c.id)}>
                  {busy === c.id ? t("Cleaning…") : t("Clean")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {message && <p className="page__note">{message}</p>}
    </HardwareCard>
  );
}
