// Loadout page state: what is installed (winget list) and a one-at-a-time install queue.
// Lives outside React so installs keep running while the user switches pages.
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { downloadInstaller, installPackage, listInstalled } from "../lib/tauri";

export type InstallStatus =
  | { state: "waiting" | "installing" | "done" | "started" }
  | { state: "downloading"; done: number; total: number | null }
  | { state: "failed"; reason: string };

export interface LoadoutState {
  installed: { name: string; id: string }[] | null;
  error: string | null;
  status: Record<string, InstallStatus>;
}

let state: LoadoutState = { installed: null, error: null, status: {} };
let queue: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
const set = (patch: Partial<LoadoutState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const setStatus = (id: string, s: InstallStatus) => set({ status: { ...state.status, [id]: s } });

export const useLoadout = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

export async function loadInstalled() {
  try {
    set({ installed: await listInstalled(), error: null });
  } catch (e) {
    set({ error: String(e) });
  }
}

/** Queues an install; winget runs one installer at a time, so they go in order. */
export function install(id: string, source: "winget" | "msstore") {
  if (state.status[id] && state.status[id].state !== "failed") return;
  setStatus(id, { state: "waiting" });
  queue = queue.then(async () => {
    setStatus(id, { state: "installing" });
    try {
      await installPackage(id, source);
      setStatus(id, { state: "done" });
    } catch (e) {
      setStatus(id, { state: "failed", reason: String(e) });
    }
  });
}

/** Downloads a publisher's installer (fixed list on the Rust side) and starts it; the user finishes it there. */
export function download(key: string) {
  const s = state.status[key]?.state;
  if (s === "downloading" || s === "waiting") return;
  setStatus(key, { state: "downloading", done: 0, total: null });
  downloadInstaller(key).then(
    () => setStatus(key, { state: "started" }),
    (e) => setStatus(key, { state: "failed", reason: String(e) }),
  );
}

void listen<{ key: string; done: number; total: number | null }>("installer:progress", ({ payload }) => {
  if (state.status[payload.key]?.state === "downloading") setStatus(payload.key, { state: "downloading", done: payload.done, total: payload.total });
});

if (import.meta.hot) import.meta.hot.accept(() => location.reload());
