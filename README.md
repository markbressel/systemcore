<div align="center">

<img src="src/assets/logo.png" alt="SystemCore logo" width="120" />

# SystemCore

**A fast, good-looking system monitor and PC control center for Windows 11.**
Live CPU, GPU, memory, disk and network telemetry in a gaming-cockpit interface, an in-game overlay with FPS,
RGB lighting control for PC parts and peripherals, display color profiles for games, a speed test, a benchmark and one-click updates.

<br />

<a href="https://github.com/markbressel/systemcore/releases/latest"><img src="docs/download-button.svg" alt="Download SystemCore for Windows" width="420" /></a>

<br />

[![Latest version](https://img.shields.io/github/v/release/markbressel/systemcore?label=latest%20version&color=f07832&style=for-the-badge)](https://github.com/markbressel/systemcore/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/markbressel/systemcore/total?label=downloads&color=191f27&style=for-the-badge)](https://github.com/markbressel/systemcore/releases)
![Windows 11](https://img.shields.io/badge/Windows-11-0b0d10?style=for-the-badge&logo=windows&logoColor=white)
![Built with Tauri](https://img.shields.io/badge/Tauri%202-Rust%20%2B%20React-191f27?style=for-the-badge&logo=tauri&logoColor=ffc131)

<img src="docs/screenshots/overview.png" alt="SystemCore overview dashboard" width="900" />

</div>

---

## What's new in 0.3.0

- **PC lighting**: a 3D PC you can take apart. Take the side panel off, lift out a part and set its RGB color. RAM lighting works without vendor software.
- **Peripherals**: a 3D desk with keyboard, mouse, headset and mouse pad. Pick a device up and color it. Logitech G (wired and Lightspeed), Razer Chroma, VIA/QMK keyboards (Keychron and others) and Windows Dynamic Lighting devices.
- **Match the app color**: one switch makes every RGB device follow SystemCore's accent color.
- **Display**: brightness, contrast, gamma, color temperature and NVIDIA saturation per monitor, plus **game profiles** that switch on by themselves while a game is in front.
- **CPU temperature without extra programs** on AMD Ryzen, read from the processor's own sensor.
- **New Overview cockpit**: redesigned instrument cluster with temperature gauges and a selectable info line.

All releases and their notes: [Releases](https://github.com/markbressel/systemcore/releases).

## Download and install

1. Click **[Download for Windows](https://github.com/markbressel/systemcore/releases/latest)** and download `SystemCore_<version>_x64-setup.exe`.
2. Run the installer. Windows SmartScreen may say *"Windows protected your PC"* because the installer is not code-signed with a paid certificate. Click **More info → Run anyway**.
3. The installer also offers **PawnIO**, a small signed hardware driver used for RAM lighting and the Ryzen CPU temperature. It asks for administrator rights in its own prompt; if you decline, everything else still works (see [Hardware access](#hardware-access-pawnio)).
4. Done. Future versions install from inside the app (see [Updates](#updates)).

No account, no ads, no telemetry, no background services.

## Features

### Monitoring

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/overview.png" alt="Overview" /></td>
    <td width="50%">
      <b>Overview</b>: the cockpit. CPU and GPU dials with car-style temperature gauges, memory in the middle with a selectable info line (uptime, GPU power, ping, process count), CPU clock, busiest core, committed memory, disk space, GPU clock, memory and fan.<br /><br />
      <b>PC health</b> score with the reasons behind it, <b>Why is it slow?</b> diagnosis, and the top processes.
    </td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/performance.png" alt="Performance" /></td>
    <td width="50%"><b>Performance</b>: CPU, memory and GPU in detail with a 60-second live history, per-core load, clocks, temperatures, VRAM and power.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/history.png" alt="History" /></td>
    <td width="50%"><b>History</b>: load, temperatures, memory, network, ping and FPS over the last 1, 6 or 24 hours, recorded every 5 seconds while SystemCore runs (also from the tray).</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/processes.png" alt="Processes" /></td>
    <td width="50%"><b>Processes</b>: searchable, sortable list (<code>Ctrl+F</code>), details, priority, open file location, search online and <b>End process</b> with confirmation.</td>
  </tr>
</table>

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/overview-details.png" alt="Overview details" /><p align="center">Overview: health, diagnosis, top processes</p></td>
    <td width="33%"><img src="docs/screenshots/performance-memory.png" alt="Performance memory" /><p align="center">Performance: memory</p></td>
    <td width="33%"><img src="docs/screenshots/performance-gpu.png" alt="Performance GPU" /><p align="center">Performance: GPU</p></td>
  </tr>
</table>

### Hardware

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/hardware.png" alt="Hardware" /></td>
    <td width="50%"><b>Hardware</b>: processor, motherboard, memory modules and graphics card inventory. <b>Copy specs</b> or <b>Save report</b> for forums and support (without the computer name and MAC addresses).</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/storage.png" alt="Storage" /></td>
    <td width="50%"><b>Storage</b>: every volume with capacity, live read/write speed and drive health, a Windows notification if a drive's health gets worse, folder sizes, and <b>cleanup</b> of temporary files and caches.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/network.png" alt="Network" /></td>
    <td width="50%"><b>Network</b>: total and per-adapter download/upload rates with history, and the programs using the network.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/lighting.png" alt="PC lighting" /></td>
    <td width="50%">
      <b>PC lighting</b>: a 3D mid-tower you can rotate and take apart. Click the PC to take the glass panel off, click a part (graphics card, RAM, motherboard, cooler, fans, LED strip) to lift it out, then set its color. Pulsing hotspots show what can be clicked; colored ones have RGB that SystemCore found.
    </td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/peripherals.png" alt="Peripherals" /></td>
    <td width="50%"><b>Peripherals</b>: a 3D desk with keyboard, mouse, headset and mouse pad. Pick a device up to color it. <b>Match the app color</b> makes every RGB device follow the accent color from Settings.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/display.png" alt="Display" /></td>
    <td width="50%">
      <b>Display</b>: brightness, contrast, gamma (see into dark corners) and color temperature on any GPU, saturation (NVIDIA digital vibrance), and the monitor's own backlight and contrast over DDC/CI.<br /><br />
      <b>Game profiles</b>: one set of colors per game (e.g. <code>cs2.exe</code>), switched on automatically while the game is in front and back to the desktop settings after. Editing a profile shows it live.
    </td>
  </tr>
</table>

**Taking the PC apart, step by step:**

<table>
  <tr>
    <td width="25%"><img src="docs/screenshots/lighting.png" alt="Closed PC" /><p align="center">1. Click the PC</p></td>
    <td width="25%"><img src="docs/screenshots/lighting-open.png" alt="Side panel off" /><p align="center">2. Pick a part</p></td>
    <td width="25%"><img src="docs/screenshots/lighting-part.png" alt="Part lifted out" /><p align="center">3. Set its color</p></td>
    <td width="25%"><img src="docs/screenshots/peripherals-device.png" alt="Mouse picked up" /><p align="center">Peripherals: a picked-up mouse</p></td>
  </tr>
</table>

### Tools

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/speedtest.png" alt="Speed Test" /></td>
    <td width="50%"><b>Speed Test</b>: ping, jitter, download and upload against Cloudflare's global network. Runs only when you press start.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/benchmark.png" alt="Benchmark" /></td>
    <td width="50%"><b>Benchmark</b>: CPU stress test with a score, the temperature during the run, thermal slow-down detection and earlier runs to compare.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/startup.png" alt="Startup apps" /></td>
    <td width="50%"><b>Startup apps</b>: programs that start with Windows, with an on/off switch that works like Task Manager's.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/settings.png" alt="Settings" /></td>
    <td width="50%">
      <b>Settings</b>: startup and tray, overlay layout and position, alerts, gaming (FPS measurement, overlay in games, fullscreen optimizations check, <b>Game mode</b> with high priority and the High performance power plan), and appearance: dark or light theme, accent color, English or Hungarian.
    </td>
  </tr>
</table>

<table>
  <tr>
    <td width="25%"><img src="docs/screenshots/settings-overlay.png" alt="Overlay settings" /><p align="center">Overlay</p></td>
    <td width="25%"><img src="docs/screenshots/settings-alerts.png" alt="Alert settings" /><p align="center">Alerts</p></td>
    <td width="25%"><img src="docs/screenshots/settings-gaming.png" alt="Gaming settings" /><p align="center">Gaming</p></td>
    <td width="25%"><img src="docs/screenshots/settings-appearance.png" alt="Appearance settings" /><p align="center">Appearance</p></td>
  </tr>
</table>

### In-game overlay

<img src="docs/screenshots/overlay.png" alt="SystemCore overlay" width="270" align="right" />

Turn it on from the top bar (**Overlay**), the tray icon, **Settings**, or with `Ctrl+Shift+O`.

- FPS, frame time and 1% low of the app in front (needs administrator, see below).
- CPU load and clock, GPU load, temperature, VRAM and power draw, RAM usage, live network rates and ping.
- **Show overlay in games**: opens by itself when an app goes fullscreen and closes when you leave.
- **Readings and size**: pick the readings, scale it 75–150 %, or switch to a single-line **compact** layout.
- **Fixed position** in any corner (respects the taskbar), or **free positioning** with **Locked** so it stays put.

The overlay shows over games in *windowed* or *borderless* mode. Exclusive fullscreen draws over every other window.

<br clear="right" />

### Alerts, tray and updates

- **Alerts**: optional Windows notifications when CPU or GPU temperature or RAM usage reaches your limit, when one program keeps using a lot of CPU or memory, when memory keeps growing for hours, or when the CPU/GPU slows down from heat.
- **Tray**: SystemCore keeps running in the notification area; open it, toggle the overlay or quit from the tray icon.
- **Updates**: an orange **Update to x.y.z** button appears when a new version is out (see [Updates](#updates)).

## Supported RGB devices

SystemCore talks to the devices directly. No vendor software is needed, but if it runs (G HUB, iCUE, Synapse, MSI Center…) it may set its own colors again; turn off its lighting control to keep SystemCore's.

| Family | Devices | How |
|---|---|---|
| Windows Dynamic Lighting | Any device that supports the Windows 11 lighting standard | Built into Windows; colors apply while SystemCore is in front |
| Logitech G | Mice, keyboards and headsets with HID++ lighting, wired and through Lightspeed/Unifying receivers | USB (HID++ 2.0) |
| Razer Chroma | BlackWidow, Huntsman, Ornata, Cynosa, DeathAdder, Basilisk, Viper, Naga, Cobra, Firefly, Goliathus, Strider, Tartarus, Chroma docks | USB |
| VIA / QMK keyboards | Keychron and other VIA-enabled keyboards with RGB | USB (VIA raw HID) |
| RGB RAM (ENE) | T-Force Delta RGB, G.Skill Trident Z RGB, Geil Super Luce and other ENE-based DDR4 | SMBus through PawnIO, administrator |

More families (Corsair, ASUS Aura, MSI Mystic Light, Gigabyte RGB Fusion, ASRock Polychrome, SteelSeries, HyperX, NZXT…) are on the way. Colors are never saved to a device's memory: unplugging it or a full power-off brings back its own lighting.

## Hardware access (PawnIO)

Windows does not let ordinary programs read the Ryzen CPU temperature or talk to the motherboard's SMBus, where RAM lighting controllers sit. For these two features SystemCore uses [PawnIO](https://pawnio.eu), a signed open hardware-access driver also used by LibreHardwareMonitor and OpenRGB.

- The SystemCore installer runs the official PawnIO setup silently (it asks for administrator rights itself) and skips it when PawnIO is already installed. Uninstalling SystemCore leaves PawnIO in place, because other tools may use it.
- RAM lighting and the CPU temperature need SystemCore to **run as administrator**; the PC lighting page offers a restart button.
- Safety: RAM controllers are identified with read-only checks first. SystemCore only ever writes color, mode and apply registers, never to the memory's SPD chip, never changes controller addresses and never saves to the controller's flash.

## Updates

SystemCore checks GitHub Releases at startup and every 6 hours. When a newer version exists, an orange **Update to x.y.z** button appears in the top bar. Clicking it downloads the installer, verifies its signature and restarts into the new version.

Every update is signed. The app refuses any installer that was not signed with the project's private key, so a tampered download cannot be installed.

## Privacy

Everything is measured and shown locally. SystemCore has no account, no analytics and sends no telemetry. It makes only these network requests:

- the **Speed Test**, and only when you start it (Cloudflare);
- the **ping** reading: a TCP handshake to `1.1.1.1:443` every 2 seconds, without sending any data;
- the **update check** (GitHub Releases).

History stays on this PC and is kept for 24 hours. Lighting, display and all other settings are saved on this PC only. The spec report leaves out the computer name and MAC addresses. Process command lines and environment variables are never read.

---

## Building from source

**Requirements:** Node 20+, Rust (stable, MSVC toolchain), Visual Studio Build Tools (C++ workload), WebView2 (built into Windows 11).

```powershell
npm install
npm run app          # development: Vite + Tauri window with hot reload
npm test             # Rust unit tests + UI self-checks
npm run screenshots  # starts the app and saves every page to docs/screenshots (English, 1600×1000)
npx tauri build      # NSIS installer in src-tauri/target/release/bundle/nsis/
```

### Releasing a new version

1. Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, then `npm install --package-lock-only` so the lockfile follows.
2. Refresh the screenshots: `npm run screenshots` from an administrator terminal (CPU temperature and RAM lighting) on a PC with RGB devices. It captures every page, tab, settings section, the 3D lighting steps and the overlay.
3. Update this README: **What's new**, the feature sections, supported devices, data sources and limitations.
4. Commit, then tag and push:
   ```powershell
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```
5. The [Release workflow](.github/workflows/release.yml) builds and signs the installer and publishes the GitHub Release together with `latest.json`. Installed apps pick it up automatically.

The workflow needs the repository secret `TAURI_SIGNING_PRIVATE_KEY`, the updater signing key. Never commit it.

## Architecture

```
React pages (src/features/*)
  └─ stores (src/stores/*)  ─ telemetry, settings, lighting, display, updates; one subscription shared by every page
       └─ src/lib/tauri.ts  ─ the only module that talks to Rust
            └─ Rust commands + events (telemetry:system | processes | disks)
                 ├─ collector.rs ─ one background thread on a fixed schedule
                 └─ src-tauri/src/platform/windows ─ sysinfo, PDH, NVML, WMI, ETW, HID, PawnIO, GDI, NVAPI
```

- **Tech:** Tauri 2, Rust, React 19, TypeScript, SCSS (BEM, design tokens as CSS custom properties), three.js for the 3D lighting scenes (loaded only when those pages open). Fonts are bundled (Inter, JetBrains Mono, Chakra Petch) and icons come from `lucide-react`.
- **Contract:** `src-tauri/src/domain.rs` ⇄ `src/types/telemetry.ts`. Every metric carries `status`, `source` and `sampledAt`; a missing value is `null`, never a fake `0`.
- **Cadence:** CPU and network every 1 s; memory, processes, GPU and disks every 2 s; temperature every 5 s; drive health every 60 s.
- **Rates** come from cumulative counters. A counter going backwards gives "temporarily unavailable" instead of a spike.
- **Lighting backends** (`lights.rs`, one file per vendor family): read-only detection, then only whitelisted color commands.
- **Design:** see [Design-work.md](Design-work.md). Full product spec: [SystemCore-work.md](SystemCore-work.md).

### Data sources

| Data | Source |
|---|---|
| CPU effective and base clock | PDH `Processor Information` (Task Manager's method) |
| Committed memory / commit limit | `GetPerformanceInfo` |
| GPU dedicated and shared memory | PDH `GPU Adapter Memory` |
| NVIDIA temperature, clocks, power, fan, VRAM | NVML (`nvml.dll` from the driver, loaded at runtime) |
| CPU temperature | AMD Ryzen SMU sensor through PawnIO (administrator); else LibreHardwareMonitor's WMI namespace if it runs; else ACPI thermal zones |
| Drive health and media type | WMI Storage Management (`MSFT_PhysicalDisk`) |
| RAM modules | WMI `Win32_PhysicalMemory` |
| FPS, frame time, 1% low | ETW present events (DXGI, D3D9, DxgKrnl), like PresentMon. Needs administrator |
| Ping | TCP connect time to Cloudflare (`1.1.1.1:443`) |
| Startup apps | `Run` registry keys, Startup folders and Task Manager's `StartupApproved` flags |
| RGB lighting | Windows Dynamic Lighting (`Windows.Devices.Lights`), USB HID (Logitech HID++, Razer, VIA), SMBus through PawnIO (RAM) |
| Display color | GDI gamma ramps, Monitor Configuration API (DDC/CI), NVAPI digital vibrance (`nvapi64.dll` from the driver) |

### Known limitations

- **CPU temperature** without LibreHardwareMonitor needs PawnIO and administrator mode, and currently AMD Ryzen. Intel CPU temperature through PawnIO is planned.
- **GPU temperature, clocks, power, fan and saturation** are NVIDIA-only for now.
- **FPS** needs SystemCore to run as administrator (**Settings → Gaming → Restart as administrator**): Windows only shares other programs' frame events with elevated apps. It counts the frames the game hands to Windows, so it matches PresentMon-style tools, not the in-game counter of every engine.
- **Exclusive fullscreen** games draw over every window, including the overlay, and some load their own display colors. Use borderless or windowed mode.
- **Dynamic Lighting** devices only take SystemCore's colors while SystemCore is the app in front (a Windows rule); SystemCore repaints them when you switch back.
- **DDC/CI** works on most desktop monitors when it is enabled in the monitor's menu; laptop panels and some docks do not support it.
- **Process memory** is the working set. Task Manager's default column is the private working set, so the numbers differ.
- Some older drives report no media type ("Unspecified by drive").

## Third-party software

- [PawnIO](https://pawnio.eu) driver setup (freeware; its author allows redistributing the installer) and its modules from [PawnIO.Modules](https://github.com/namazso/PawnIO.Modules) (LGPL-2.1, unmodified; license text in `src-tauri/resources/pawnio/COPYING`).
- [three.js](https://threejs.org) (MIT), [hidapi](https://github.com/ruabmbua/hidapi-rs) (MIT), [lucide](https://lucide.dev) icons (ISC) and the other open-source packages listed in `package.json` and `src-tauri/Cargo.toml`.
- Lighting protocols are SystemCore's own implementation; the OpenRGB, openrazer and liquidctl projects were used as protocol documentation only.
