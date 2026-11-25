# SYSTEMCORE — PROJECT CONTEXT

**Master Project Documentation & AI Handover File**

| Property | Value |
|---|---|
| Project name | SystemCore |
| Project type | Desktop System Monitoring Application |
| Primary platform | Windows 11 |
| Architecture target | Modular, extensible |
| Initial scope | Complete system monitoring |
| UI theme | Dark |
| Project status | Phase 0–1 implemented, parts of 2–4 (read-only). See README.md "Status" |
| Document purpose | Complete project context and AI handover |

---

# 1. PROJECT OVERVIEW

## 1.1 What is SystemCore?

SystemCore is a modern, comprehensive desktop system monitoring and management application.

The goal is to create a desktop application that provides significantly more detailed information and control over a computer than the standard Windows Task Manager.

SystemCore should eventually become a central control panel for the user's computer.

The application should allow users to:

- Monitor CPU performance.
- Monitor RAM and memory usage.
- Monitor GPU performance.
- Monitor storage devices.
- Monitor network activity.
- Inspect running processes.
- View hardware information.
- Analyze system performance.
- Identify potential system problems.
- Receive diagnostic recommendations.
- Manage applications and installed software.
- Apply safe system optimizations in future releases.

The application should be designed as a real desktop product, not a simple dashboard or a frontend demonstration.

## 1.2 Product vision

SystemCore should combine three major areas:

1. **Monitoring** — Real-time system resource monitoring.
2. **Diagnostics** — Identifying performance problems and potential hardware or software issues.
3. **Management** — Managing applications, processes and system settings in future versions.

The initial priority is to build a reliable monitoring foundation.

System modification, optimization and application management must be implemented only after the underlying monitoring infrastructure is stable.

## 1.3 Product philosophy

The following principles must guide development:

- Accuracy over visual effects.
- Reliability over unnecessary complexity.
- Modular architecture.
- Low resource consumption.
- Modern and premium user interface.
- Local-first operation.
- Privacy by default.
- Safe system interactions.
- Expandability for future features.

SystemCore must never display fabricated or misleading system metrics.

If a metric cannot be collected, the application must communicate that clearly instead of displaying zero.

---

# 2. CONFIRMED PROJECT DECISIONS

The following decisions have already been established.

| Category | Decision |
|---|---|
| Platform | Windows first |
| Operating system target | Windows 11 |
| Application type | Desktop application |
| Project scope | Complete monitoring application |
| Design | Dark interface |
| Product name | SystemCore |
| Architecture philosophy | Modular and extensible |
| Initial priority | System monitoring |
| Future direction | Diagnostics, optimization and application management |

## 2.1 Proposed technology stack

The following stack is the current architectural direction discussed for the project. It should be verified against the actual repository before implementation decisions are finalized.

| Technology | Responsibility |
|---|---|
| Tauri 2 | Desktop application framework |
| React | User interface |
| TypeScript | Frontend application logic |
| Vite | Frontend development and build |
| Rust | Backend and system-level functionality |
| SQLite | Potential local persistence layer |
| Windows APIs | Native Windows system information |

### Why this architecture?

React and TypeScript provide a flexible foundation for a modern desktop interface.

Rust provides efficient and relatively safe access to system-level functionality.

Tauri provides communication between the frontend and backend without requiring a bundled Chromium browser.

SQLite can be used for local historical data, diagnostics and settings.

The architecture must remain modular so that additional operating systems and telemetry providers can be integrated later.

**Important:** Do not assume that every technology or dependency is already implemented. Inspect the existing repository before changing anything.

---

# 3. APPLICATION FUNCTIONALITY

## 3.1 Overview Dashboard

The Overview page is the main application screen.

It should provide a quick overview of the computer's current condition.

Required information:

- CPU utilization.
- RAM utilization.
- GPU utilization when supported.
- Storage utilization.
- Network activity.
- System uptime.
- Running process count.
- General system status.

The dashboard should contain:

- Metric cards.
- Real-time charts.
- Hardware summaries.
- System status indicators.
- Navigation to detailed monitoring pages.

The Overview must not become overloaded with information.

Detailed metrics should be available in dedicated sections.

## 3.2 Performance Monitoring

The Performance module should provide detailed resource monitoring.

### CPU

Required information:

- Total CPU utilization.
- Per-core utilization.
- Logical processor count.
- Processor identification.
- Current frequency when available.
- Temperature when supported.
- Historical utilization chart.

### Memory

Required information:

- Total physical memory.
- Used memory.
- Available memory.
- Memory utilization percentage.
- Committed memory where available.
- Memory usage history.

All memory values should use bytes internally.

The interface can format them into MB or GB.

Do not confuse physical memory usage with committed virtual memory.

### GPU

Required information when supported:

- GPU identification.
- GPU utilization.
- Dedicated VRAM usage.
- Shared GPU memory.
- Temperature.
- Current clock speed.
- Power consumption where available.

GPU support must be capability-based.

Do not assume that every user has an NVIDIA GPU.

Possible provider strategy:

- NVIDIA: NVML where compatible.
- AMD: appropriate supported vendor interfaces.
- Intel: appropriate supported vendor interfaces.

A missing GPU provider must not prevent the rest of the application from working.

### Storage

Required information:

- Installed storage devices.
- Device identification.
- Total capacity.
- Used capacity.
- Free capacity.
- Partition and volume information.
- Disk activity where available.

SMART health information should be implemented separately from ordinary storage capacity monitoring.

### Network

Required information:

- Available network adapters.
- Download speed.
- Upload speed.
- Received bytes.
- Transmitted bytes.
- Adapter identification.
- Historical traffic charts.

Network speeds should be calculated from differences between cumulative byte counters.

Counter resets must not create artificial traffic spikes.

---

# 4. PROCESS MANAGER

The Process Manager should provide a more detailed alternative to Windows Task Manager.

## 4.1 Process list

Each process should expose, where available:

- Process name.
- PID.
- CPU utilization.
- Memory usage.
- Executable information.
- Process status.
- Start time.
- Additional details.

## 4.2 Interface functionality

The process list should support:

- Searching.
- Sorting.
- Filtering.
- Process selection.
- Process details.
- Resource usage inspection.

Search and sorting should happen in frontend state rather than triggering operating-system enumeration for every keystroke.

## 4.3 Process termination

Process termination may be introduced after the basic monitoring functionality is stable.

Requirements:

- Explicit user confirmation.
- Revalidation of process identity before termination.
- Proper handling of permission errors.
- Handling of processes that have already exited.
- Protection against PID reuse.

Do not implement a kill-all feature.

Do not require administrator privileges for the entire application.

---

# 5. HARDWARE INFORMATION

The Hardware module should provide an organized inventory of the computer.

Potential categories:

- Processor.
- Graphics cards.
- Memory modules.
- Motherboard.
- Storage devices.
- Network adapters.
- Operating system.

Each hardware section should present available identification and technical details.

Unsupported information must be clearly marked.

Do not invent hardware specifications when a provider cannot retrieve them.

---

# 6. DIAGNOSTICS SYSTEM

The Diagnostics module should analyze collected system information.

Its purpose is to identify potential problems and explain them to the user.

Possible diagnostic categories:

- High CPU utilization.
- High memory utilization.
- Low storage capacity.
- Unusually high process resource consumption.
- Network instability.
- Unsupported or unavailable telemetry.
- Potential thermal problems when reliable temperature data is available.

Each diagnostic result should include:

- Title.
- Description.
- Severity.
- Supporting evidence.
- Detection timestamp.
- Suggested action.
- Current status.

Severity levels:

- Informational.
- Low.
- Medium.
- High.
- Critical.

Diagnostics should use thresholds with persistence and hysteresis.

A short CPU spike should not immediately generate a critical warning.

SystemCore must distinguish between an observed condition and a confirmed hardware fault.

---

# 7. APPLICATION MANAGEMENT — FUTURE MODULE

A future version may include application management.

Potential functionality:

- Installed application inventory.
- Application search.
- Application details.
- Installation.
- Uninstallation.
- Update information.
- Package management.

Windows package management integration, potentially through Windows Package Manager (`winget`), can be evaluated.

All installation and removal operations must require explicit user confirmation.

Never execute arbitrary shell commands supplied by the UI.

This module is not a priority for the initial monitoring release.

---

# 8. SYSTEM OPTIMIZATION — FUTURE MODULE

System optimization is a future product direction.

Potential functionality:

- Startup application management.
- Resource usage analysis.
- Storage cleanup recommendations.
- Performance recommendations.
- Background application analysis.
- Windows configuration suggestions.

Safety requirements:

1. Explain exactly what will change.
2. Obtain explicit confirmation.
3. Preserve a rollback mechanism wherever possible.
4. Verify the result.
5. Record the operation locally.
6. Never make opaque system changes.

The application must not automatically disable security services, modify BIOS settings, install drivers or execute undocumented optimization scripts.

Optimization must not be implemented before reliable monitoring and diagnostics exist.

---

# 9. USER INTERFACE AND DESIGN

## 9.1 Visual direction

SystemCore should have a premium, modern dark interface.

The design should feel like a professional desktop system utility.

Visual principles:

- Dark graphite and navy backgrounds.
- Clear contrast.
- Subtle accent colors.
- Modern typography.
- Consistent spacing.
- Carefully designed cards.
- Smooth but restrained animations.
- Clear status indicators.
- Professional charts and tables.

Avoid:

- Excessive neon effects.
- Overloaded dashboards.
- Unnecessary gradients.
- Huge decorative elements.
- Excessive animations.
- Generic template-like layouts.

## 9.2 Main navigation

Suggested navigation structure:

1. Overview
2. Performance
3. Processes
4. Hardware
5. Storage
6. Network
7. Diagnostics
8. Settings

The navigation should remain consistent across the application.

## 9.3 Component design

Create reusable UI components.

Suggested components:

- MetricCard
- PerformanceChart
- ResourceIndicator
- StatusBadge
- HardwareCard
- ProcessTable
- SectionHeader
- Sidebar
- TopBar
- EmptyState
- ErrorState
- LoadingState

Do not duplicate the same visual implementation across multiple pages.

## 9.4 UX requirements

The application must support:

- Clear loading states.
- Empty states.
- Error states.
- Unsupported metric states.
- Stale data indicators.
- Keyboard navigation.
- Visible focus indicators.
- Reasonable window resizing.
- Reduced-motion preferences.

Every displayed metric should communicate its unit and meaning.

---

# 10. SYSTEM ARCHITECTURE

## 10.1 High-level architecture

The application should follow this structure:

React Frontend  
↓  
Typed Tauri IPC  
↓  
Rust Backend Services  
↓  
Domain Models and Collectors  
↓  
Windows Platform Adapters  
↓  
Windows APIs and Hardware Providers

### Frontend responsibilities

React should manage:

- Rendering.
- Navigation.
- User interaction.
- Search.
- Sorting.
- Filtering.
- Selected items.
- Chart presentation.
- View-specific state.

The frontend should not directly collect operating-system telemetry.

### Backend responsibilities

Rust should manage:

- Operating-system access.
- Telemetry collection.
- Process enumeration.
- Hardware information.
- Collection scheduling.
- Diagnostics.
- Persistence.
- System-level operations.

### Collector architecture

Use centralized backend collectors.

Do not allow every React component to independently poll Windows APIs.

A centralized collection service should:

1. Schedule collection.
2. Retrieve measurements.
3. Normalize values.
4. Validate data.
5. Attach timestamps.
6. Publish snapshots.
7. Handle errors.

This prevents unnecessary duplicate work and inconsistent measurements.

## 10.2 Metric model

Every telemetry measurement should contain enough information to describe its reliability.

Conceptual structure:

```typescript
interface Metric<T> {
  value: T | null;
  unit: string;
  status:
    | "available"
    | "initializing"
    | "unsupported"
    | "permission_denied"
    | "temporarily_unavailable"
    | "stale"
    | "error";
  source: string;
  sampledAt: string | null;
  errorCode?: string;
}
```

The backend and frontend must use a consistent metric contract.

Do not silently convert unavailable values to zero.

## 10.3 Commands versus telemetry events

Use Tauri commands for on-demand operations:

- Hardware inventory.
- Process details.
- Application settings.
- Diagnostic requests.

Use telemetry events for recurring measurements:

- CPU.
- Memory.
- GPU.
- Network.
- Storage activity.

Avoid repeatedly requesting the same hardware inventory through IPC.

## 10.4 Performance

Suggested initial collection intervals:

| Metric | Suggested interval |
|---|---:|
| CPU | 1 second |
| Network | 1 second |
| Memory | 2 seconds |
| Processes | 2–3 seconds |
| GPU | 1–2 seconds |
| Storage capacity | 30–60 seconds |
| SMART health | On demand or slower |

These values are starting points, not immutable requirements.

Collection frequency should be configurable where appropriate.

Telemetry channels must be bounded so the UI cannot accumulate an unlimited backlog of old snapshots.

---

# 11. PROJECT STRUCTURE

The following is the recommended target structure.

```text
SystemCore/
│
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   │   ├── overview/
│   │   ├── performance/
│   │   ├── processes/
│   │   ├── hardware/
│   │   ├── storage/
│   │   ├── network/
│   │   ├── diagnostics/
│   │   └── settings/
│   │
│   ├── hooks/
│   ├── lib/
│   │   └── tauri/
│   ├── stores/
│   ├── styles/
│   ├── types/
│   └── main.tsx
│
├── src-tauri/
│   ├── src/
│   │   ├── commands/
│   │   ├── domain/
│   │   ├── services/
│   │   ├── collectors/
│   │   ├── platform/
│   │   │   └── windows/
│   │   ├── providers/
│   │   ├── persistence/
│   │   ├── errors/
│   │   └── main.rs
│   │
│   ├── capabilities/
│   └── tauri.conf.json
│
├── tests/
│   ├── fixtures/
│   ├── integration/
│   └── manual/
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

This is a target structure.

Before creating or moving files, inspect the existing repository and preserve working implementation.

## 11.1 Dependency rules

- UI components should not call Windows APIs.
- Feature modules should not contain duplicated telemetry collection logic.
- Rust platform adapters should not depend on React.
- Domain models should remain independent of specific UI components.
- Platform-specific functionality should be isolated.
- Persistence should be accessed through defined services.

Avoid giant utility files and unnecessary abstraction layers.

---

# 12. SECURITY AND PRIVACY

SystemCore is a system-level desktop utility. Security must be considered from the beginning.

Requirements:

- Use minimal Tauri capabilities.
- Expose narrowly scoped backend commands.
- Do not create generic command-execution endpoints.
- Do not expose arbitrary PowerShell or CMD execution to the frontend.
- Run without administrator privileges by default.
- Request elevated privileges only for a specific justified operation.
- Keep telemetry local by default.
- Do not introduce cloud accounts unnecessarily.
- Avoid storing process command lines because they may contain sensitive information.
- Make data retention configurable.
- Allow the user to clear local history.

The application must not send telemetry to external servers without explicit user consent.

---

# 13. LOCAL DATA STORAGE

SQLite is a proposed solution for local history.

Potential stored information:

- Historical performance snapshots.
- Diagnostic history.
- User preferences.
- Collection settings.

Requirements:

- Bounded retention.
- Efficient queries.
- Database migrations.
- Error handling.
- No unbounded history growth.

Do not store every measurement indefinitely.

Real-time telemetry and historical persistence should be separate responsibilities.

---

# 14. TESTING AND VALIDATION

SystemCore must be tested against real Windows behavior.

## 14.1 Unit tests

Test:

- Metric calculations.
- CPU utilization calculations.
- Network throughput calculations.
- Memory formatting.
- Diagnostic thresholds.
- Data validation.
- Error handling.

## 14.2 Integration tests

Test:

- Tauri IPC.
- Collector lifecycle.
- Provider availability.
- Persistence.
- Event delivery.
- Process enumeration.

## 14.3 Manual Windows tests

Test at minimum:

- Idle system.
- High CPU load.
- High memory usage.
- Network traffic.
- Multiple storage devices.
- Unsupported GPU provider.
- Permission-denied processes.
- Sleep and resume.
- Long-running application sessions.
- Window resizing.
- Application shutdown and restart.

Compare important measurements with Windows Task Manager and trusted hardware monitoring tools.

Do not claim that a metric is accurate until it has been validated.

---

# 15. DEVELOPMENT ROADMAP

## Phase 0 — Foundation

- Inspect the existing repository.
- Confirm technology stack.
- Establish project structure.
- Configure Tauri.
- Configure React and TypeScript.
- Establish shared types.
- Create the basic application shell.
- Establish error handling.

**Completion condition:** Application starts reliably and has a clean foundation.

## Phase 1 — Core telemetry

- CPU collector.
- Memory collector.
- Basic system information.
- Centralized collection service.
- Typed telemetry events.
- Overview dashboard.

**Completion condition:** Core metrics update correctly and have been validated.

## Phase 2 — Process Manager

- Process enumeration.
- Process information.
- Sorting.
- Searching.
- Filtering.
- Process detail view.
- Safe termination, if approved for release.

**Completion condition:** Process information remains stable across refreshes and handles permission errors.

## Phase 3 — Hardware and Storage

- Hardware inventory.
- GPU provider abstraction.
- Storage volume information.
- Disk activity.
- SMART capability evaluation.

**Completion condition:** Hardware information is accurate where supported and unavailable capabilities are clearly communicated.

## Phase 4 — Network and History

- Network adapters.
- Download and upload speeds.
- Historical charts.
- Local persistence.
- Retention management.

**Completion condition:** Network measurements and historical records are consistent.

## Phase 5 — Diagnostics

- Diagnostic rules.
- Severity levels.
- Threshold persistence.
- Evidence.
- Recommendations.
- Diagnostic history.

**Completion condition:** Diagnostics provide useful, explainable results without excessive false alerts.

## Phase 6 — Desktop polish

- Application settings.
- Installer.
- Startup behavior.
- System tray.
- Notifications.
- Final UI refinement.

**Completion condition:** SystemCore behaves like a complete desktop application.

## Phase 7 — Optimization

- Safe optimization recommendations.
- Explicit confirmation.
- Rollback support.
- Operation logging.
- Verification.

**Completion condition:** Every supported operation has a defined safety and recovery strategy.

## Phase 8 — Application management

- Installed application inventory.
- Package manager integration.
- Installation and removal workflows.
- Update information.

**Completion condition:** Application management works safely and transparently.

## Phase 9 — Linux support

Potential future platform:

- Linux system telemetry.
- `/proc` and `/sys`.
- Hardware sensor providers.
- GPU providers.
- Distribution-specific package managers.

Linux must use separate platform adapters rather than adding Linux-specific code throughout the Windows implementation.

---

# 16. OPEN TECHNICAL DECISIONS

These decisions must be evaluated during development rather than silently assumed.

1. Exact GPU provider coverage.
2. SMART implementation and supported hardware.
3. SQLite schema and migration strategy.
4. Process termination in the first public release.
5. Installer format and update strategy.
6. Historical telemetry retention period.
7. System tray behavior.
8. Startup behavior.
9. Whether temperature monitoring requires additional providers.

Do not introduce unnecessary dependencies just to implement a feature quickly.

---

# 17. DEVELOPMENT RULES FOR AI ASSISTANTS

This section is especially important.

Any AI assistant continuing this project must follow these rules.

## 17.1 Understand before changing

Before modifying the project:

1. Inspect the repository.
2. Read the current README.
3. Inspect the folder structure.
4. Inspect existing implementation.
5. Identify completed functionality.
6. Identify unfinished functionality.
7. Check current build and test status where possible.

Never assume that the project is still in its initial state.

## 17.2 Do not duplicate existing work

Do not recreate components, services or modules that already exist.

Extend existing architecture whenever appropriate.

Do not replace working code simply because a different implementation is preferred.

## 17.3 Implement real functionality

Never create fake monitoring data for the actual application.

Mock data may be used for isolated UI development, but it must be clearly separated from production telemetry.

Do not claim that a feature works unless it has actually been implemented and tested.

## 17.4 Keep the architecture clean

- Use TypeScript types.
- Keep Rust modules focused.
- Separate collection from presentation.
- Use shared contracts.
- Handle errors explicitly.
- Avoid unnecessary dependencies.
- Avoid monolithic files.
- Keep components reusable.

## 17.5 Maintain documentation

Whenever an important architectural decision changes, update this document.

Whenever a feature is completed, update its status.

Whenever a new dependency is introduced, explain why it is needed.

Do not allow documentation to become disconnected from the actual implementation.

## 17.6 Be transparent

Every implementation report must distinguish:

- Implemented.
- Tested.
- Not tested.
- Known limitations.
- Remaining work.

Never claim that a build, test, installation or Git push succeeded without actually verifying it.

## 17.7 Prioritize correctly

Do not jump directly into optimization or application installation.

The priority order is:

1. Reliable foundation.
2. Accurate telemetry.
3. Stable process management.
4. Hardware and storage information.
5. Network and history.
6. Diagnostics.
7. Desktop polish.
8. Safe optimization.
9. Application management.
10. Linux support.

---

# 18. FIRST ACTIONS FOR THE NEXT AI ASSISTANT

When this document is provided to another GPT, the first task is to establish the actual project state.

Follow these steps:

1. Inspect the current repository.
2. Determine whether Tauri 2, React, TypeScript and Rust are already configured.
3. Inspect the existing source files.
4. Identify all implemented features.
5. Identify missing features.
6. Check whether the project builds.
7. Compare the actual structure with the recommended structure in this document.
8. Prepare a concrete implementation plan based on the actual state.

Do not immediately rewrite the project.

Do not create unnecessary files before inspecting the repository.

Do not assume that the suggested architecture has already been implemented.

The goal is to continue development from the real current state.

---

# 19. FINAL PRODUCT GOAL

SystemCore should ultimately become a polished, reliable and comprehensive desktop system management application.

It should combine the most useful aspects of:

- Windows Task Manager.
- Hardware monitoring utilities.
- Performance monitoring dashboards.
- System diagnostics tools.
- Application management utilities.

However, SystemCore must remain understandable, efficient and safe.

The most important requirement is that the application provides accurate information and trustworthy functionality.

A beautiful interface is important, but it must always be backed by real system data.

**SystemCore — Complete visibility. Total control.**

---

*End of Project Context Document.*