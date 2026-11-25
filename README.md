# SystemCore

Desktop system monitor for Windows 11. Tauri 2 + React 19 + TypeScript + Rust. Full spec: [SystemCore-work.md](SystemCore-work.md).

## Run

Requirements: Node 20+, Rust (stable, MSVC), Visual Studio Build Tools (C++), WebView2 (built into Windows 11).

```
npm install
npm run app        # dev mode (Vite + Tauri window)
npm test           # Rust unit tests
npx tauri build    # NSIS installer: src-tauri/target/release/bundle/nsis/SystemCore_<ver>_x64-setup.exe
```

## Architecture

```
React pages (src/features/*)
  â””â”€ one store (src/stores/telemetry.ts) â”€â”€ listens to events, keeps 60 s history, stale detection
       â””â”€ src/lib/tauri.ts â”€â”€ the only IPC module
            â””â”€ Rust commands (get_latest, get_hardware) + events (telemetry:system|processes|disks)
                 â””â”€ collector.rs â”€â”€ one background thread, fixed schedule, owns all sysinfo handles
                      â””â”€ sysinfo 0.40 (Win32, PDH, D3DKMT, WMI)
```

- UI follows [Design-work.md](Design-work.md): SCSS only (Dart Sass, `@use`/`@forward`), entry `src/styles/main.scss`. Colors live once in `styles/abstracts/_colors.scss` and are emitted as `--color-*` custom properties; components use BEM classes. Fonts (Inter, JetBrains Mono, Chakra Petch) are bundled via `@fontsource`, icons are `lucide-react`.
- Visual direction (owner decision, 2026-11-23, extends Design-work.md): instrument-panel "cockpit" overview with dial gauges, HUD corner brackets, triangle textures, and **Chakra Petch** as display face for headings/navigation/large readouts (Inter stays for body text, JetBrains Mono for tables/IDs).
- Startup: ignition screen (`src/features/splash/`) â€” logo, name, CPU/GPU dials sweep 0â†’100â†’0 (calibration), then live values; skippable (click/Esc), reduced-motion aware. Timeline self-check: `npm run test:ui`.
- Clock bars: GPU clock is relative to the NVML hardware maximum; CPU clock is relative to the highest clock measured this session (Windows does not report max boost).
- CPU temperature: owner decided (2026-11-23) not to install LibreHardwareMonitor/driver; the row shows "Needs LibreHardwareMonitor".
- Logo: the hexagon "S" mark, cropped from the brand artwork â†’ `src/assets/logo.png` (UI) and `src-tauri/app-icon.png` (source for `npx tauri icon`).
- Components: `src/components/{layout,metrics,charts,feedback,hardware}`; page code in `src/features/*`.
- Contract: `src-tauri/src/domain.rs` â‡„ `src/types/telemetry.ts`. Every metric carries `status`/`source`/`sampledAt`; unavailable values are `null`, never `0`.
- Cadence: CPU + network 1 s, memory/processes/GPU/disks 2 s, temperature 5 s.
- Network and disk rates come from cumulative counters; a counter going backwards yields "temporarily unavailable", not a spike.
- Process command lines and environment are never read. No command accepts user input; capabilities are `core:default` only.

## Status (2026-11-23)

| Area | State |
|---|---|
| Phase 0 foundation, shell, navigation | Implemented, runs |
| Overview, Performance (CPU, per-core, memory, GPU) | Implemented, runs on dev machine |
| Processes (search, sort, details, PID-reuse-safe selection) | Implemented, read-only (no termination) |
| Hardware inventory | Implemented |
| Storage (volumes, capacity, read/write rate) | Implemented |
| Network (total + per-adapter rates, history) | Implemented |
| Gaming-hardware design system (Design-work.md stages 1â€“5, except Diagnostics/Settings pages) | Implemented |
| Diagnostics, Settings, history persistence (SQLite), tray | Not started |

Tested: `cargo test` (rate calc, counter reset, process CPU normalisation, metric serialisation), `tsc` + `vite build`, app launched and showing live data.
Manual hardware probe: `cargo test --manifest-path src-tauri/Cargo.toml probe -- --ignored --nocapture` prints every Windows source's raw reading.
Not tested: values have **not** yet been compared against Task Manager; sleep/resume; long sessions; multi-GPU; AMD/Intel GPUs; installer build.

Data sources (`src-tauri/src/platform/windows/`), all without admin rights:
- CPU effective clock and base clock: PDH `Processor Information` (Task Manager's method).
- Committed memory / commit limit: `GetPerformanceInfo`.
- GPU dedicated + shared memory: PDH `GPU Adapter Memory`; NVIDIA temperature, clocks, power, fan, VRAM: NVML (`nvml.dll` from the driver, loaded at runtime).
- Disk health and media type: WMI Storage Management (`MSFT_PhysicalDisk`); RAM modules: `Win32_PhysicalMemory`.
- CPU temperature: read from LibreHardwareMonitor's WMI namespace while it is running.

Speed test (`src-tauri/src/speedtest.rs`, page *Tools → Speed Test*): user-initiated only, against Cloudflare's public endpoints (speed.cloudflare.com). Ping = median HTTP round trip (first request excluded), jitter = mean consecutive difference; download 6 / upload 4 parallel streams for 10 s each, result = trimmed mean of 200 ms samples after 1.5 s warm-up (drop lowest 30 %, highest 10 %). Cloudflare rate-limits large downloads after many runs: chunks shrink 25 MB → 5 MB → 1 MB, and if even that is refused the user sees the Retry-After wait. Live check: `cargo test --manifest-path src-tauri/Cargo.toml speedtest_live -- --ignored --nocapture`.

Known limitations:
- CPU temperature needs LibreHardwareMonitor running: Windows gives user-mode apps no CPU die temperature on this hardware, and reading it directly requires a kernel driver, which SystemCore will not install.
- GPU temperature/clock/power/fan are NVIDIA-only for now (AMD/Intel would need D3DKMT adapter perf data or vendor SDKs).
- PDH GPU memory is attributed only on single-GPU systems (PDH keys adapters by LUID, not PCI address).
- Some older drives report no media type (shown as "Unspecified by drive").
- Process memory is working set; Task Manager's default column is private working set, so numbers differ.

