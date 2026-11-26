import { useEffect, useState } from "react";
import { getHardware } from "../lib/tauri";
import type { HardwareInfo } from "../types/telemetry";

// Inventory doesn't change while the app runs: fetch once, share between pages.
let cached: Promise<HardwareInfo> | null = null;

export function useHardware(): { hardware: HardwareInfo | null; error: string | null } {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    cached ??= getHardware();
    cached
      .then((h) => alive && setHardware(h))
      .catch((e) => {
        cached = null; // allow a retry on next mount
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  return { hardware, error };
}

// Dev only: module state (subscriptions, timers) cannot be hot-swapped, so reload the page instead.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
