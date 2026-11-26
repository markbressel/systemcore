import { Rocket, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState } from "../../components/feedback/States";
import { StatusBadge } from "../../components/feedback/StatusBadge";
import { PageContainer } from "../../components/layout/PageContainer";
import { listStartupApps, setStartupEnabled } from "../../lib/tauri";
import type { StartupApp } from "../../types/telemetry";

export function StartupPage() {
  const [apps, setApps] = useState<StartupApp[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => listStartupApps().then(setApps).catch((e) => setError(String(e))), []);
  useEffect(() => void reload(), [reload]);

  const toggle = async (a: StartupApp) => {
    setBusy(a.id);
    setError(null);
    try {
      await setStartupEnabled(a.id, !a.enabled);
    } catch (e) {
      setError(`${a.name}: ${e}`);
    }
    await reload();
    setBusy(null);
  };

  const enabled = apps?.filter((a) => a.enabled).length ?? 0;

  return (
    <PageContainer
      title="Startup apps"
      subtitle="Programs that start when you sign in. Disabling works like Task Manager: the entry stays and can be turned back on."
    >
      {error && (
        <div className="notice notice--danger" role="alert">
          <ShieldAlert aria-hidden="true" /> {error}
        </div>
      )}
      {!apps ? (
        <LoadingState />
      ) : apps.length === 0 ? (
        <EmptyState icon={Rocket}>No startup programs found.</EmptyState>
      ) : (
        <section className="panel panel--flush">
          <div className="panel__header startup__header">
            <h2 className="panel__title">
              <Rocket className="panel__icon" aria-hidden="true" /> {enabled} of {apps.length} enabled
            </h2>
          </div>
          <div className="table-scroll">
            <table className="data-table startup">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Location</th>
                  <th className="data-table__col--medium">Status</th>
                  <th className="data-table__col--narrow">On</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="data-table__primary">{a.name}</div>
                      <div className="data-table__mono startup__command" title={a.command}>
                        {a.command}
                      </div>
                    </td>
                    <td className="startup__location">
                      {a.location}
                      {a.needsAdmin && <div className="startup__admin">Needs administrator to change</div>}
                    </td>
                    <td>
                      <StatusBadge tone={a.enabled ? "success" : "neutral"}>{a.enabled ? "Enabled" : "Disabled"}</StatusBadge>
                    </td>
                    <td>
                      <button
                        type="button"
                        role="switch"
                        className="switch"
                        aria-checked={a.enabled}
                        aria-label={`Start ${a.name} with Windows`}
                        disabled={busy != null}
                        onClick={() => void toggle(a)}
                      >
                        <span className="switch__thumb" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PageContainer>
  );
}
