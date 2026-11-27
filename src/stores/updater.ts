// Program updates (winget): the list, download sizes and a one-at-a-time update queue.
// Lives outside React so updates keep running while the user switches pages.
import { useSyncExternalStore } from "react";
import { listUpgrades, upgradePackage, upgradeSize, type Upgrade } from "../lib/tauri";

export type RowStatus = { state: "waiting" | "updating" | "done" } | { state: "failed"; reason: string };

export interface UpdaterState {
  list: Upgrade[] | null;
  checking: boolean;
  error: string | null;
  /** Download bytes per id; null = unknown, absent = still measuring. */
  sizes: Record<string, number | null>;
  status: Record<string, RowStatus>;
  running: boolean;
}

let state: UpdaterState = { list: null, checking: false, error: null, sizes: {}, status: {}, running: false };
let stopAfterCurrent = false;
const listeners = new Set<() => void>();
const set = (patch: Partial<UpdaterState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const useUpdater = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

const SIZE_WORKERS = 4;

export async function checkUpdates() {
  if (state.checking || state.running) return;
  set({ checking: true, error: null, status: {} });
  try {
    // winget updating itself mid-run can end the queue early, so it goes last.
    const list = (await listUpgrades()).sort((a, b) => Number(a.id === "Microsoft.AppInstaller") - Number(b.id === "Microsoft.AppInstaller"));
    set({ list, sizes: {} });
    // Each size needs a `winget show` + a web request: a few in parallel, filling in as they arrive.
    const queue = list.map((u) => u.id);
    await Promise.all(
      Array.from({ length: SIZE_WORKERS }, async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
          const bytes = await upgradeSize(id).catch(() => null);
          set({ sizes: { ...state.sizes, [id]: bytes } });
        }
      }),
    );
  } catch (e) {
    set({ error: String(e) });
  } finally {
    set({ checking: false });
  }
}

/** Updates the given programs one after another. */
export async function runUpdates(ids: string[]) {
  if (state.running || !ids.length) return;
  stopAfterCurrent = false;
  set({ running: true, status: { ...state.status, ...Object.fromEntries(ids.map((id) => [id, { state: "waiting" } as RowStatus])) } });
  for (const id of ids) {
    if (stopAfterCurrent) {
      const { [id]: _, ...rest } = state.status;
      set({ status: rest });
      continue;
    }
    set({ status: { ...state.status, [id]: { state: "updating" } } });
    try {
      await upgradePackage(id);
      set({ status: { ...state.status, [id]: { state: "done" } } });
    } catch (e) {
      set({ status: { ...state.status, [id]: { state: "failed", reason: String(e) } } });
    }
  }
  set({ running: false });
}

/** Finishes the program being installed now (stopping an installer halfway could break it), then stops. */
export function stopUpdates() {
  stopAfterCurrent = true;
}

if (import.meta.hot) import.meta.hot.accept(() => location.reload());
