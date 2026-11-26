import { useCallback, useEffect, useState } from "react";
import { IgnitionSplash } from "../features/splash/IgnitionSplash";
import { AppShell } from "../components/layout/AppShell";
import { PageErrorBoundary } from "../components/feedback/States";
import type { PageId } from "../components/layout/navigation";
import { BenchmarkPage } from "../features/benchmark/BenchmarkPage";
import { HardwarePage } from "../features/hardware/HardwarePage";
import { HistoryPage } from "../features/history/HistoryPage";
import { NetworkPage } from "../features/network/NetworkPage";
import { OverviewPage } from "../features/overview/OverviewPage";
import { PerformancePage, type PerfTab } from "../features/performance/PerformancePage";
import { ProcessesPage } from "../features/processes/ProcessesPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { SpeedTestPage } from "../features/speedtest/SpeedTestPage";
import { StartupPage } from "../features/startup/StartupPage";
import { StoragePage } from "../features/storage/StoragePage";
import { startJournal } from "../stores/journal";
import { startAppSettings } from "../stores/settings";
import { startTelemetry } from "../stores/telemetry";
import { startUpdateChecks } from "../stores/update";

export function App() {
  const [page, setPage] = useState<PageId>("overview");
  const [perfTab, setPerfTab] = useState<PerfTab>("cpu");
  const [starting, setStarting] = useState(true);
  const finishStart = useCallback(() => setStarting(false), []);

  useEffect(startTelemetry, []);
  useEffect(startUpdateChecks, []);
  useEffect(startAppSettings, []);
  useEffect(startJournal, []);

  const openPerformance = (tab: PerfTab) => {
    setPerfTab(tab);
    setPage("performance");
  };

  return (
    <>
    {starting && <IgnitionSplash onDone={finishStart} />}
    <AppShell page={page} onNavigate={setPage}>
      {/* key: a fresh boundary per page, so leaving a broken page clears the error. */}
      <PageErrorBoundary key={page}>
      {page === "overview" && <OverviewPage onNavigate={setPage} onOpenPerformance={openPerformance} />}
      {page === "performance" && <PerformancePage tab={perfTab} onTab={setPerfTab} />}
      {page === "history" && <HistoryPage />}
      {page === "processes" && <ProcessesPage />}
      {page === "hardware" && <HardwarePage />}
      {page === "storage" && <StoragePage />}
      {page === "network" && <NetworkPage />}
      {page === "speedtest" && <SpeedTestPage />}
      {page === "benchmark" && <BenchmarkPage />}
      {page === "startup" && <StartupPage />}
      {page === "settings" && <SettingsPage />}
      </PageErrorBoundary>
    </AppShell>
    </>
  );
}
