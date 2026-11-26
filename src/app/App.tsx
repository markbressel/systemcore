import { useCallback, useEffect, useState } from "react";
import { IgnitionSplash } from "../features/splash/IgnitionSplash";
import { AppShell } from "../components/layout/AppShell";
import type { PageId } from "../components/layout/navigation";
import { HardwarePage } from "../features/hardware/HardwarePage";
import { NetworkPage } from "../features/network/NetworkPage";
import { OverviewPage } from "../features/overview/OverviewPage";
import { PerformancePage, type PerfTab } from "../features/performance/PerformancePage";
import { ProcessesPage } from "../features/processes/ProcessesPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { SpeedTestPage } from "../features/speedtest/SpeedTestPage";
import { StoragePage } from "../features/storage/StoragePage";
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

  const openPerformance = (tab: PerfTab) => {
    setPerfTab(tab);
    setPage("performance");
  };

  return (
    <>
    {starting && <IgnitionSplash onDone={finishStart} />}
    <AppShell page={page} onNavigate={setPage}>
      {page === "overview" && <OverviewPage onNavigate={setPage} onOpenPerformance={openPerformance} />}
      {page === "performance" && <PerformancePage tab={perfTab} onTab={setPerfTab} />}
      {page === "processes" && <ProcessesPage />}
      {page === "hardware" && <HardwarePage />}
      {page === "storage" && <StoragePage />}
      {page === "network" && <NetworkPage />}
      {page === "speedtest" && <SpeedTestPage />}
      {page === "settings" && <SettingsPage />}
    </AppShell>
    </>
  );
}
