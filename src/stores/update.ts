// App self-update from GitHub Releases (signed; Tauri verifies the signature before installing).
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useSyncExternalStore } from "react";

export type UpdateState =
  | { status: "none" }
  | { status: "available"; update: Update }
  | { status: "installing"; update: Update; percent: number | null }
  | { status: "failed"; update: Update; message: string };

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

let state: UpdateState = { status: "none" };
const listeners = new Set<() => void>();
const set = (s: UpdateState) => {
  state = s;
  listeners.forEach((l) => l());
};

async function checkNow() {
  if (state.status === "installing") return;
  try {
    const update = await check();
    if (update) set({ status: "available", update });
  } catch {
    // Offline or no release published yet: try again next round, never nag the user.
  }
}

let started = false;
export function startUpdateChecks() {
  if (started) return;
  started = true;
  void checkNow();
  setInterval(checkNow, CHECK_EVERY_MS);
}

export async function installUpdate() {
  if (state.status !== "available" && state.status !== "failed") return;
  const { update } = state;
  let total = 0;
  let done = 0;
  set({ status: "installing", update, percent: null });
  try {
    await update.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      if (e.event === "Progress") {
        done += e.data.chunkLength;
        if (total) set({ status: "installing", update, percent: Math.round((done / total) * 100) });
      }
    });
    // On Windows the installer closes the app itself; relaunch covers the other cases.
    await relaunch();
  } catch (e) {
    set({ status: "failed", update, message: String(e) });
  }
}

export const useUpdate = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

// Dev only: module state (subscriptions, timers) cannot be hot-swapped, so reload the page instead.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
