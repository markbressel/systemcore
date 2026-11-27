import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { IgnitionSplash } from "../features/splash/IgnitionSplash";
import { AppShell } from "../components/layout/AppShell";
import { LoadingState, PageErrorBoundary } from "../components/feedback/States";
import type { PageId } from "../components/layout/navigation";
import { BenchmarkPage } from "../features/benchmark/BenchmarkPage";
import { DisplayPage } from "../features/display/DisplayPage";
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
import { startDisplay } from "../stores/display";
import { startJournal } from "../stores/journal";
import { startLighting } from "../stores/lighting";
import { startAppearance, startAppSettings } from "../stores/settings";
import { startTelemetry } from "../stores/telemetry";
import { startUpdateChecks } from "../stores/update";

// three.js is large: load the 3D lighting page only when it is opened.
const LightingPage = lazy(() => import("../features/lighting/LightingPage").then((m) => ({ default: m.LightingPage })));

export function App() {
  const [page, setPage] = useState<PageId>("overview");
  const [perfTab, setPerfTab] = useState<PerfTab>("cpu");
  const [starting, setStarting] = useState(true);
  const finishStart = useCallback(() => setStarting(false), []);

  useEffect(startTelemetry, []);
  useEffect(startUpdateChecks, []);
  useEffect(startAppSettings, []);
  useEffect(startAppearance, []);
  useEffect(startJournal, []);
  useEffect(startLighting, []);
  useEffect(startDisplay, []);

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
      {page === "display" && <DisplayPage />}
      {(page === "lighting" || page === "peripherals") && <Suspense fallback={<LoadingState />}><LightingPage scope={page === "lighting" ? "pc" : "peripherals"} /></Suspense>}
      {page === "speedtest" && <SpeedTestPage />}
      {page === "benchmark" && <BenchmarkPage />}
      {page === "startup" && <StartupPage />}
      {page === "settings" && <SettingsPage />}
      </PageErrorBoundary>
    </AppShell>
    </>
  );
}
