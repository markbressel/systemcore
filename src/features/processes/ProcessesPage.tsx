import { ChevronDown, ChevronUp, FolderOpen, Globe, Info, Search, XCircle } from "lucide-react";
import { getProcessPriority, killProcess, openProcessLocation, searchProcess, setProcessPriority } from "../../lib/tauri";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, LoadingState } from "../../components/feedback/States";
import { StatusBadge } from "../../components/feedback/StatusBadge";
import { PageContainer } from "../../components/layout/PageContainer";
import { StatList } from "../../components/metrics/StatList";
import { formatBytes, formatPercent } from "../../lib/format";
import { useTelemetry } from "../../stores/telemetry";
import type { Priority, ProcessInfo } from "../../types/telemetry";
import { t } from "../../lib/i18n";

const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "high", label: "High" },
  { id: "above_normal", label: "Above normal" },
  { id: "normal", label: "Normal" },
  { id: "below_normal", label: "Below normal" },
  { id: "idle", label: "Low" },
];

/** Priority picker plus "open location" / "search online" for the selected process. */
function ProcessActions({ p }: { p: ProcessInfo }) {
  const [priority, setPriority] = useState<Priority | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    setPriority(null);
    getProcessPriority(p.pid, p.startTime).then(setPriority).catch(() => setPriority(null));
  }, [p.pid, p.startTime]);

  const run = (f: () => Promise<unknown>) => {
    setError(null);
    f().catch((e) => setError(String(e)));
  };
  const change = (next: Priority) =>
    run(async () => {
      await setProcessPriority(p.pid, p.startTime, next);
      setPriority(await getProcessPriority(p.pid, p.startTime));
    });

  return (
    <div className="processes__actions">
      <label className="processes__priority">
        <span>{t("Priority")}</span>
        <select
          value={priority ?? ""}
          disabled={priority == null}
          title={priority == null ? t("Windows does not allow reading this process's priority") : undefined}
          onChange={(e) => change(e.target.value as Priority)}
        >
          {priority == null && <option value="">{t("Unavailable")}</option>}
          {PRIORITIES.map((o) => (
            <option key={o.id} value={o.id}>
              {t(o.label)}
            </option>
          ))}
        </select>
      </label>
      <div className="processes__buttons">
        <button type="button" className="button button--secondary" disabled={!p.exe} onClick={() => run(() => openProcessLocation(p.pid, p.startTime))}>
          <FolderOpen className="button__icon" aria-hidden="true" /> {t("Open file location")}
        </button>
        <button type="button" className="button button--secondary" onClick={() => run(() => searchProcess(p.pid, p.startTime))}>
          <Globe className="button__icon" aria-hidden="true" /> {t("Search online")}
        </button>
      </div>
      {error && <p className="processes__error" role="alert">{t(error)}</p>}
    </div>
  );
}

type SortKey = "name" | "pid" | "cpuPercent" | "memoryBytes" | "status";
const COLUMNS: { key: SortKey; label: string; numeric?: boolean; className?: string }[] = [
  { key: "name", label: "Name" },
  { key: "pid", label: "PID", numeric: true, className: "data-table__col--narrow" },
  { key: "cpuPercent", label: "CPU", numeric: true, className: "data-table__col--medium" },
  { key: "memoryBytes", label: "Memory", numeric: true, className: "data-table__col--wide" },
  { key: "status", label: "Status", className: "data-table__col--medium" },
];

function compare(a: ProcessInfo, b: ProcessInfo, key: SortKey) {
  const x = a[key] ?? -1;
  const y = b[key] ?? -1;
  return typeof x === "string" ? x.localeCompare(String(y), undefined, { sensitivity: "base" }) : (x as number) - (y as number);
}

function StatusCell({ status }: { status: string }) {
  return <StatusBadge tone="neutral" plain>{t(status)}</StatusBadge>;
}

export function ProcessesPage() {
  const { processes } = useTelemetry();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "cpuPercent", desc: true });
  // PID + start time identifies a process; a reused PID won't be mistaken for the selected one.
  const [selected, setSelected] = useState<{ pid: number; startTime: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [toKill, setToKill] = useState<ProcessInfo | null>(null);
  const [killError, setKillError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (processes?.processes ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.pid).includes(q));
    list.sort((a, b) => (sort.desc ? -1 : 1) * compare(a, b, sort.key));
    return list;
  }, [processes, query, sort]);

  if (!processes) return <LoadingState label={t("Enumerating processes…")} />;

  const current = selected && processes.processes.find((p) => p.pid === selected.pid && p.startTime === selected.startTime);
  const toggleSort = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "name" && key !== "status" }));
  const select = (p: ProcessInfo) => setSelected({ pid: p.pid, startTime: p.startTime });
  const askKill = (p: ProcessInfo) => {
    setToKill(p);
    setKillError(null);
    dialogRef.current?.showModal();
  };
  const confirmKill = () => {
    if (!toKill) return;
    killProcess(toKill.pid, toKill.startTime)
      .then(() => dialogRef.current?.close())
      .catch((e) => setKillError(String(e)));
  };

  return (
    <PageContainer
      title={t("Processes")}
      subtitle={t("{count} running · refreshed every 2 s · CPU as share of all logical processors", { count: processes.processes.length })}
      actions={
        <label className="search-field">
          <Search className="search-field__icon" aria-hidden="true" />
          <input
            ref={searchRef}
            className="search-field__input"
            type="search"
            placeholder={t("Search processes…")}
            aria-label={t("Search processes by name or PID")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="search-field__hint">Ctrl F</kbd>
        </label>
      }
    >
      <div className="processes">
        <div className="panel panel--flush">
          <div className="table-scroll processes__table">
            <table className="data-table">
              <thead>
                <tr>
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key;
                    const Icon = sort.desc ? ChevronDown : ChevronUp;
                    return (
                      <th
                        key={c.key}
                        className={[c.numeric && "is-numeric", c.className].filter(Boolean).join(" ") || undefined}
                        aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
                      >
                        <button type="button" className={`data-table__sort${active ? " data-table__sort--active" : ""}`} onClick={() => toggleSort(c.key)}>
                          {t(c.label)}
                          {active && <Icon className="data-table__sort-icon" aria-hidden="true" />}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const isSel = !!current && current.pid === p.pid;
                  const cpu = p.cpuPercent;
                  return (
                    <tr
                      key={p.pid}
                      className={`data-table__row--selectable${isSel ? " data-table__row--selected" : ""}`}
                      tabIndex={0}
                      aria-selected={isSel}
                      onClick={() => select(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          select(p);
                        }
                      }}
                    >
                      <td className="data-table__primary" title={p.name}>{p.name}</td>
                      <td className="is-numeric data-table__mono">{p.pid}</td>
                      <td className="is-numeric data-table__mono">
                        {cpu == null ? (
                          "…"
                        ) : (
                          <span className="cell-bar">
                            {formatPercent(cpu)}
                            <span className="cell-bar__track metric-indicator metric-indicator--thin metric-indicator--cpu" aria-hidden="true">
                              <span className="metric-indicator__fill" style={{ width: `${Math.min(100, cpu)}%` }} />
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="is-numeric data-table__mono" title={p.memoryBytes == null ? t("Access denied") : undefined}>{p.memoryBytes == null ? t("n/a") : formatBytes(p.memoryBytes)}</td>
                      <td><StatusCell status={p.status} /></td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="data-table__empty">{t("No process matches “{query}”.", { query })}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="panel processes__detail" aria-label={t("Process details")}>
          {!selected ? (
            <EmptyState icon={Info} compact>{t("Select a process to see its details.")}</EmptyState>
          ) : !current ? (
            <EmptyState icon={Info} compact>{t("The selected process has exited.")}</EmptyState>
          ) : (
            <>
              <div className="panel__header">
                <h2 className="processes__detail-name" title={current.name}>{current.name}</h2>
                <StatusCell status={current.status} />
              </div>
              <StatList
                single
                items={[
                  ["PID", <span className="u-mono">{current.pid}</span>],
                  [t("Parent PID"), current.parentPid != null ? <span className="u-mono">{current.parentPid}</span> : null],
                  ["CPU", current.cpuPercent == null ? null : <span className="u-mono">{formatPercent(current.cpuPercent)}</span>],
                  [t("Memory (working set)"), current.memoryBytes == null ? null : <span className="u-mono">{formatBytes(current.memoryBytes, 2)}</span>],
                  [t("Started"), current.startTime > 0 ? new Date(current.startTime * 1000).toLocaleString() : null],
                  [t("Executable"), current.exe ? <span className="processes__path">{current.exe}</span> : <span className="metric-value metric-value--missing">{t("Access denied or unavailable")}</span>],
                ]}
              />
              <ProcessActions key={current.pid} p={current} />
              <button type="button" className="button button--danger processes__end" onClick={() => askKill(current)}>
                <XCircle className="button__icon" aria-hidden="true" /> {t("End process")}
              </button>
            </>
          )}
        </aside>
      </div>

      <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby="kill-title" onClose={() => setToKill(null)}>
        <h2 id="kill-title" className="confirm-dialog__title">{t("End {name}?", { name: toKill?.name ?? "" })}</h2>
        <p className="confirm-dialog__text">
          {t("PID {pid}. Unsaved work in this program will be lost. Ending a system process can make Windows unstable.", { pid: toKill?.pid ?? "" })}
        </p>
        {killError && <p className="confirm-dialog__error" role="alert">{t(killError)}</p>}
        <div className="confirm-dialog__actions">
          <button type="button" className="button button--secondary" autoFocus onClick={() => dialogRef.current?.close()}>{t("Cancel")}</button>
          <button type="button" className="button button--danger" onClick={confirmKill}>{t("End process")}</button>
        </div>
      </dialog>
    </PageContainer>
  );
}
