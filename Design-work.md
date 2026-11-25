# SYSTEMCORE — GAMING HARDWARE DESIGN SYSTEM

**Document:** UI/UX and SCSS Architecture Specification  
**Project:** SystemCore  
**Design Direction:** Premium Gaming Hardware Aesthetic  
**Platform:** Windows 11 Desktop  
**Theme:** Dark  
**Styling Technology:** SCSS (Sass)  
**Frontend:** React + TypeScript  
**Status:** Design Specification  
**Priority:** High

---

# 1. DESIGN VISION

## 1.1 Core Concept

SystemCore must have the visual identity of a premium PC hardware monitoring and management application.

The interface should feel like professional software designed for PC enthusiasts, gamers, hardware enthusiasts and advanced Windows users.

The design must communicate:

- Performance.
- Precision.
- Technical sophistication.
- Reliability.
- Control.
- Hardware-focused functionality.

The application should look like a product that belongs alongside professional GPU monitoring, hardware diagnostic and system management utilities.

It must not look like a generic SaaS dashboard, AI-generated admin panel or cryptocurrency interface.

## 1.2 Visual Direction

The design combines four visual characteristics:

1. **Dark industrial surfaces** — graphite, charcoal and near-black backgrounds.
2. **Hardware-inspired accents** — controlled orange highlights and electric green status indicators.
3. **Technical precision** — thin borders, precise alignment, compact information blocks and clean typography.
4. **Performance visualization** — real-time charts, resource indicators and detailed hardware metrics.

The interface should be visually interesting without sacrificing readability.

## 1.3 Design References

The desired design language can take inspiration from:

- MSI Afterburner — technical hardware monitoring.
- NZXT CAM — modern PC hardware presentation.
- ASUS Armoury Crate — hardware-oriented navigation and visual identity.
- HWiNFO — information density and technical detail.
- Steam Desktop — functional desktop navigation and hierarchy.

These are references for design principles, not interfaces to copy.

SystemCore must have its own recognizable visual identity.

---

# 2. COLOR SYSTEM

## 2.1 Primary Palette

The primary palette consists of dark graphite surfaces and controlled orange accents.

| Token | HEX | Purpose |
|---|---|---|
| `color-bg-primary` | `#0B0D10` | Main application background |
| `color-bg-secondary` | `#101318` | Secondary background |
| `color-bg-tertiary` | `#151A20` | Elevated sections |
| `color-surface` | `#191F27` | Cards and panels |
| `color-surface-hover` | `#202731` | Hover surfaces |
| `color-surface-active` | `#272F3A` | Selected surfaces |
| `color-border` | `#2A313B` | Standard borders |
| `color-border-subtle` | `#202630` | Subtle separators |
| `color-text-primary` | `#F1F3F5` | Primary text |
| `color-text-secondary` | `#A0A8B3` | Secondary text |
| `color-text-muted` | `#68727F` | Muted text |
| `color-accent` | `#F07832` | Primary orange |
| `color-accent-hover` | `#FF8B45` | Orange hover |
| `color-accent-active` | `#D96224` | Orange pressed |
| `color-accent-soft` | `#392319` | Orange background |
| `color-success` | `#A3E635` | Healthy status |
| `color-warning` | `#F5B942` | Warning status |
| `color-danger` | `#EF5350` | Critical status |
| `color-info` | `#55B7E8` | Information |

## 2.2 Color Usage Rules

Orange is the primary brand color.

It should be used for:

- Active navigation indicators.
- Selected tabs.
- Primary buttons.
- Important metric highlights.
- Focus indicators.
- Active chart series.
- Small decorative hardware details.

Orange must not dominate the entire interface.

The primary background should remain dark.

Electric green is reserved for healthy system states and successful operations.

Red is reserved for critical conditions and destructive actions.

Yellow is reserved for warnings.

Never communicate status using color alone. Always combine status colors with text, icons or labels.

## 2.3 Background Hierarchy

The interface should use multiple levels of dark surfaces.

Recommended hierarchy:

```text
Application background: #0B0D10
    Sidebar:            #101318
    Main content:       #0B0D10
        Section:        #151A20
            Card:       #191F27
                Hover:  #202731
```

Do not use a large number of visually unrelated surface colors.

The difference between surfaces should be subtle but recognizable.

---

# 3. TYPOGRAPHY

## 3.1 Font Direction

The typography should be modern, technical and highly readable.

Recommended fonts:

- Inter.
- Inter Tight.
- IBM Plex Sans.
- JetBrains Mono for technical values.

Preferred combination:

| Usage | Font |
|---|---|
| General interface | Inter |
| Headings | Inter |
| Technical values | JetBrains Mono |
| PID and hexadecimal identifiers | JetBrains Mono |

Use bundled font assets where licensing permits.

Do not rely on a font being installed on the user's Windows machine.

## 3.2 Typography Scale

| Token | Size | Weight | Usage |
|---|---:|---:|---|
| `font-xs` | 11px | 500 | Labels |
| `font-sm` | 12px | 400 | Secondary information |
| `font-base` | 14px | 400 | Standard interface |
| `font-md` | 15px | 500 | Emphasized body |
| `font-lg` | 18px | 600 | Section headings |
| `font-xl` | 22px | 600 | Page subtitles |
| `font-2xl` | 28px | 650 | Page headings |
| `font-display` | 34px | 650 | Important metrics |

Use JetBrains Mono for numeric hardware measurements where alignment and precision matter.

Examples:

```text
CPU USAGE
34.8%

MEMORY
18.42 GB / 32 GB

GPU TEMPERATURE
67 °C
```

Technical labels may use uppercase styling and subtle letter spacing.

Avoid making every heading uppercase.

---

# 4. SPACING AND LAYOUT SYSTEM

## 4.1 Spacing Scale

Use a consistent 4px-based spacing system.

| Token | Value |
|---|---:|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-10` | 40px |
| `space-12` | 48px |

Do not introduce arbitrary spacing values without a reason.

## 4.2 Border Radius

The application should use relatively restrained corner rounding.

| Token | Value |
|---|---:|
| `radius-sm` | 4px |
| `radius-md` | 6px |
| `radius-lg` | 9px |
| `radius-xl` | 12px |
| `radius-pill` | 999px |

Avoid excessive rounded cards.

The interface should feel like desktop hardware software rather than a mobile application.

## 4.3 Main Window Layout

The application should have three primary areas:

1. Sidebar navigation.
2. Top application bar.
3. Main content area.

Suggested dimensions:

| Element | Dimension |
|---|---:|
| Sidebar | 230px |
| Collapsed sidebar | 72px |
| Topbar | 64px |
| Main content padding | 28px |
| Standard card gap | 16px |
| Minimum comfortable window width | 1100px |

These are starting values and should be tested against actual Windows window sizes.

The interface must support resizing.

Avoid fixed layouts that break when the application window becomes smaller.

---

# 5. APPLICATION SHELL

## 5.1 Sidebar

The sidebar should remain visually stable throughout the application.

Structure:

```text
SYSTEMCORE
--------------------------------

MONITORING

Overview
Performance
Processes

HARDWARE

Hardware
Storage
Network

SYSTEM

Diagnostics
Settings

--------------------------------
System status
Version
```

Requirements:

- Brand logo and application name at the top.
- Clear navigation categories.
- Consistent navigation icons.
- Orange indicator for the active route.
- Subtle hover background.
- Optional collapsed mode.
- No unnecessary decorative animation.

The active route should be immediately recognizable.

## 5.2 Topbar

The topbar should contain:

- Current page title or breadcrumb.
- Optional global search.
- System status.
- Notifications.
- Settings shortcut where appropriate.

The topbar should not become a second navigation system.

Use a subtle bottom border.

## 5.3 Main Content

The main content area should:

- Scroll independently from the sidebar.
- Have consistent horizontal padding.
- Use a clear heading hierarchy.
- Support responsive card layouts.
- Avoid excessive empty space.
- Keep important information visible.

---

# 6. OVERVIEW DASHBOARD

## 6.1 Purpose

The Overview page should provide a quick and meaningful understanding of the current system state.

It is not intended to display every available hardware measurement.

Detailed measurements belong in the Performance and Hardware sections.

## 6.2 Suggested Layout

```text
-------------------------------------------------
TOPBAR
-------------------------------------------------
SIDEBAR | SYSTEM OVERVIEW
        |
        | CPU          GPU
        | --------------------------------------
        | 34.8%        62.1%
        |
        | MEMORY       STORAGE
        | --------------------------------------
        | 71.4%        48.2%
        |
        | PERFORMANCE HISTORY
        | --------------------------------------
        | Real-time chart
        |
        | SYSTEM INFORMATION
        | --------------------------------------
        | CPU model
        | GPU model
        | RAM capacity
        | Windows version
        |
        | TOP RESOURCE CONSUMERS
        | --------------------------------------
        | Process table
-------------------------------------------------
```

## 6.3 Metric Cards

Each metric card should contain:

- Metric label.
- Primary value.
- Unit.
- Optional secondary value.
- Resource icon.
- Utilization indicator.
- Optional mini chart.
- Data availability state.

Example:

```text
CPU UTILIZATION                     CPU ICON

34.8%

16 logical processors

[================----------]

Current utilization
```

The primary value must be visually dominant.

Do not fill every card with unnecessary information.

## 6.4 Card Interaction

Cards should support:

- Hover feedback.
- Optional navigation to the relevant detailed page.
- Consistent click behavior.
- Keyboard accessibility.

A metric card should not appear clickable unless it actually performs an action.

---

# 7. PERFORMANCE PAGE

The Performance page should be the most visually informative area of SystemCore.

Each hardware resource should have a dedicated detailed view.

## 7.1 Resource Navigation

Suggested navigation:

```text
CPU
Memory
GPU
Storage
Network
```

Each resource section should provide relevant measurements and historical information.

## 7.2 CPU Layout

Display:

- Total utilization.
- Per-core utilization.
- Processor name.
- Logical processors.
- Base frequency.
- Current frequency.
- Temperature if supported.
- Historical usage.

Per-core utilization should use a compact grid of individual indicators.

Do not force CPU temperature or frequency to display if the hardware provider does not supply them.

## 7.3 Memory Layout

Display:

- Total physical memory.
- Used memory.
- Available memory.
- Utilization percentage.
- Memory history.
- Committed memory where available.

Use a clear memory distribution indicator.

## 7.4 GPU Layout

Display:

- GPU model.
- Utilization.
- Dedicated VRAM.
- Shared memory.
- Temperature.
- Core frequency.
- Power consumption where available.

GPU metrics should be grouped by category.

The UI must distinguish unavailable metrics from actual zero values.

## 7.5 Storage Layout

Display:

- Drive identification.
- Drive type where available.
- Capacity.
- Used space.
- Free space.
- Disk activity.
- Health information where supported.

## 7.6 Network Layout

Display:

- Adapter name.
- Connection status.
- Download speed.
- Upload speed.
- Received bytes.
- Transmitted bytes.
- Historical traffic.

Use clearly distinguishable download and upload indicators.

---

# 8. PROCESS MANAGER

## 8.1 Visual Design

The Process Manager should prioritize information density and usability.

It should resemble a professional desktop process manager.

Suggested layout:

```text
PROCESSES

Search processes...

NAME        PID      CPU       MEMORY      STATUS
-------------------------------------------------
chrome.exe  4210     12.4%     1.24 GB     Running
Discord     3308      3.2%     512 MB      Running
explorer    1280      0.8%     146 MB      Running
```

## 8.2 Table Requirements

- Clear column alignment.
- Sticky table header where appropriate.
- Sorting indicators.
- Search field.
- Row hover state.
- Selected row state.
- Context menu where needed.
- Empty and error states.

Technical identifiers should use monospace typography.

Do not use oversized cards instead of tables for large process lists.

## 8.3 Process Detail Panel

Selecting a process may open a detail panel.

It should include:

- Process name.
- PID.
- CPU utilization.
- Memory usage.
- Executable path where permitted.
- Start time.
- Process status.

Destructive operations must be visually separated from ordinary navigation.

---

# 9. CHART DESIGN

## 9.1 Chart Philosophy

Charts should be technical, readable and lightweight.

Avoid decorative charts that do not communicate useful information.

Every chart should have:

- A meaningful title.
- Correct units.
- Time range.
- Clearly identifiable data series.
- Proper empty state.
- Stale-data indicator where applicable.

## 9.2 Chart Colors

Suggested colors:

| Metric | Color |
|---|---|
| CPU | `#F07832` |
| Memory | `#A3E635` |
| GPU | `#55B7E8` |
| Storage | `#B38BFA` |
| Download | `#55B7E8` |
| Upload | `#F07832` |

Do not use the same color for every chart series.

## 9.3 Chart Appearance

- Thin grid lines.
- Restrained axis labels.
- Clear tooltips.
- Smooth but accurate line rendering.
- No exaggerated glow.
- No unnecessary gradient fills.
- Consistent time axes.

Charts must represent actual telemetry data.

Do not invent values to make charts visually interesting.

---

# 10. COMPONENT DESIGN SYSTEM

The frontend should use reusable React components.

Suggested component structure:

```text
src/
└── components/
    ├── layout/
    │   ├── AppShell.tsx
    │   ├── Sidebar.tsx
    │   ├── Topbar.tsx
    │   └── PageContainer.tsx
    │
    ├── navigation/
    │   ├── NavItem.tsx
    │   └── NavSection.tsx
    │
    ├── metrics/
    │   ├── MetricCard.tsx
    │   ├── MetricValue.tsx
    │   ├── MetricIndicator.tsx
    │   └── MetricStatus.tsx
    │
    ├── charts/
    │   ├── PerformanceChart.tsx
    │   └── ChartTooltip.tsx
    │
    ├── tables/
    │   ├── DataTable.tsx
    │   └── TableToolbar.tsx
    │
    ├── hardware/
    │   └── HardwareCard.tsx
    │
    └── feedback/
        ├── EmptyState.tsx
        ├── ErrorState.tsx
        ├── LoadingState.tsx
        └── StatusBadge.tsx
```

Keep feature-specific components inside their corresponding feature folders.

Do not place every component inside one global directory if it is only used by a single feature.

---

# 11. SCSS ARCHITECTURE

## 11.1 Mandatory Styling Technology

SystemCore must use SCSS instead of plain CSS.

All authored stylesheets should use `.scss`.

The project should use the modern Dart Sass implementation.

Do not introduce CSS Modules unless a specific architectural requirement justifies them.

The preferred strategy is:

- Global SCSS design system.
- Feature-level SCSS.
- Component-level SCSS.
- Shared variables, mixins and functions.
- Centralized entry point.

React components should import their relevant SCSS files.

## 11.2 Required SCSS Folder Structure

Recommended structure:

```text
src/
└── styles/
    │
    ├── abstracts/
    │   ├── _variables.scss
    │   ├── _colors.scss
    │   ├── _typography.scss
    │   ├── _spacing.scss
    │   ├── _mixins.scss
    │   ├── _functions.scss
    │   └── _breakpoints.scss
    │
    ├── base/
    │   ├── _reset.scss
    │   ├── _global.scss
    │   ├── _fonts.scss
    │   └── _accessibility.scss
    │
    ├── layout/
    │   ├── _app-shell.scss
    │   ├── _sidebar.scss
    │   ├── _topbar.scss
    │   └── _page-container.scss
    │
    ├── components/
    │   ├── _buttons.scss
    │   ├── _cards.scss
    │   ├── _metric-card.scss
    │   ├── _inputs.scss
    │   ├── _badges.scss
    │   ├── _tables.scss
    │   ├── _tooltips.scss
    │   └── _charts.scss
    │
    ├── features/
    │   ├── _overview.scss
    │   ├── _performance.scss
    │   ├── _processes.scss
    │   ├── _hardware.scss
    │   ├── _storage.scss
    │   ├── _network.scss
    │   ├── _diagnostics.scss
    │   └── _settings.scss
    │
    ├── utilities/
    │   ├── _helpers.scss
    │   └── _animations.scss
    │
    └── main.scss
```

The structure should remain practical.

Do not create empty SCSS files for every possible future feature.

Create files when the corresponding implementation begins.

## 11.3 Main SCSS Entry Point

`src/styles/main.scss` should be responsible for loading the global design system.

Use the modern Sass module system (`@use` and `@forward`).

Avoid deprecated `@import`.

Example:

```scss
@use "abstracts/colors";
@use "abstracts/typography";
@use "abstracts/spacing";
@use "abstracts/mixins";

@use "base/reset";
@use "base/fonts";
@use "base/global";
@use "base/accessibility";

@use "layout/app-shell";
@use "layout/sidebar";
@use "layout/topbar";
@use "layout/page-container";

@use "components/buttons";
@use "components/cards";
@use "components/metric-card";
@use "components/tables";
@use "components/charts";
```

Feature-specific styles may be imported globally or through feature entry points.

Avoid duplicate global imports.

---

# 12. SCSS DESIGN TOKENS

## 12.1 Colors

File: `src/styles/abstracts/_colors.scss`

```scss
$color-bg-primary: #0b0d10;
$color-bg-secondary: #101318;
$color-bg-tertiary: #151a20;

$color-surface: #191f27;
$color-surface-hover: #202731;
$color-surface-active: #272f3a;

$color-border: #2a313b;
$color-border-subtle: #202630;

$color-text-primary: #f1f3f5;
$color-text-secondary: #a0a8b3;
$color-text-muted: #68727f;

$color-accent: #f07832;
$color-accent-hover: #ff8b45;
$color-accent-active: #d96224;
$color-accent-soft: #392319;

$color-success: #a3e635;
$color-warning: #f5b942;
$color-danger: #ef5350;
$color-info: #55b7e8;
```

## 12.2 CSS Custom Properties

Although SCSS is mandatory for authored styles, CSS custom properties should be used for runtime design tokens.

This allows future theme changes and consistent component behavior.

Example:

```scss
@use "../abstracts/colors" as colors;

:root {
  --color-bg-primary: #{colors.$color-bg-primary};
  --color-bg-secondary: #{colors.$color-bg-secondary};

  --color-surface: #{colors.$color-surface};
  --color-surface-hover: #{colors.$color-surface-hover};

  --color-border: #{colors.$color-border};

  --color-text-primary: #{colors.$color-text-primary};
  --color-text-secondary: #{colors.$color-text-secondary};
  --color-text-muted: #{colors.$color-text-muted};

  --color-accent: #{colors.$color-accent};
  --color-accent-hover: #{colors.$color-accent-hover};

  --color-success: #{colors.$color-success};
  --color-warning: #{colors.$color-warning};
  --color-danger: #{colors.$color-danger};
  --color-info: #{colors.$color-info};
}
```

Use CSS custom properties for values that may need to change at runtime.

Use SCSS variables for compile-time design constants.

Do not duplicate the same color values throughout component stylesheets.

## 12.3 Spacing

File: `src/styles/abstracts/_spacing.scss`

```scss
$space-1: 4px;
$space-2: 8px;
$space-3: 12px;
$space-4: 16px;
$space-5: 20px;
$space-6: 24px;
$space-8: 32px;
$space-10: 40px;
$space-12: 48px;
```

## 12.4 Typography

File: `src/styles/abstracts/_typography.scss`

```scss
$font-family-base: "Inter", sans-serif;
$font-family-mono: "JetBrains Mono", monospace;

$font-xs: 11px;
$font-sm: 12px;
$font-base: 14px;
$font-md: 15px;
$font-lg: 18px;
$font-xl: 22px;
$font-2xl: 28px;
$font-display: 34px;
```

---

# 13. SCSS MIXINS AND FUNCTIONS

## 13.1 Mixins

File: `src/styles/abstracts/_mixins.scss`

Recommended mixins:

- Flex layouts.
- Grid layouts.
- Focus states.
- Hover states.
- Text truncation.
- Scrollbar styling.
- Responsive breakpoints.
- Surface styling.

Example:

```scss
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

@mixin surface($background: var(--color-surface)) {
  background: $background;
  border: 1px solid var(--color-border);
  border-radius: 9px;
}

@mixin focus-ring {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

@mixin truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Use mixins when they eliminate meaningful repetition.

Do not create a mixin for every single CSS declaration.

## 13.2 Functions

File: `src/styles/abstracts/_functions.scss`

Functions may be used for:

- Spacing calculations.
- Color transformations.
- Consistent design token operations.

Avoid overly complex Sass functions.

The design system should remain understandable to developers who are not Sass experts.

---

# 14. COMPONENT SCSS EXAMPLES

## 14.1 Metric Card

File: `src/styles/components/_metric-card.scss`

```scss
@use "../abstracts/mixins" as mixins;

.metric-card {
  @include mixins.surface();

  padding: 20px;

  display: flex;
  flex-direction: column;
  gap: 16px;

  min-width: 0;

  transition:
    background 150ms ease,
    border-color 150ms ease;

  &:hover {
    background: var(--color-surface-hover);
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__label {
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  &__value {
    color: var(--color-text-primary);
    font-family: "JetBrains Mono", monospace;
    font-size: 30px;
    font-weight: 600;
    line-height: 1.2;
  }

  &__description {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  &--interactive {
    cursor: pointer;

    &:hover {
      border-color: var(--color-accent);
    }

    &:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
  }
}
```

## 14.2 Primary Button

File: `src/styles/components/_buttons.scss`

```scss
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  min-height: 36px;
  padding: 0 14px;

  border: 1px solid transparent;
  border-radius: 6px;

  font-family: inherit;
  font-size: 13px;
  font-weight: 600;

  cursor: pointer;

  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease;

  &--primary {
    color: #111318;
    background: var(--color-accent);

    &:hover {
      background: var(--color-accent-hover);
    }

    &:active {
      background: #d96224;
    }
  }

  &--secondary {
    color: var(--color-text-primary);
    background: var(--color-surface);
    border-color: var(--color-border);

    &:hover {
      background: var(--color-surface-hover);
    }
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}
```

## 14.3 Sidebar

File: `src/styles/layout/_sidebar.scss`

```scss
@use "../abstracts/mixins" as mixins;

.sidebar {
  width: 230px;
  min-width: 230px;

  height: 100%;

  display: flex;
  flex-direction: column;

  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border-subtle);

  &__brand {
    height: 64px;
    padding: 0 20px;

    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__navigation {
    flex: 1;
    padding: 16px 10px;
    overflow-y: auto;
  }

  &__section {
    margin-bottom: 24px;
  }

  &__section-title {
    padding: 0 12px;
    margin-bottom: 8px;

    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  &__item {
    position: relative;

    display: flex;
    align-items: center;
    gap: 12px;

    min-height: 40px;
    padding: 0 12px;

    border-radius: 6px;

    color: var(--color-text-secondary);
    font-size: 13px;

    transition:
      color 150ms ease,
      background 150ms ease;

    &:hover {
      color: var(--color-text-primary);
      background: var(--color-surface);
    }

    &--active {
      color: var(--color-text-primary);
      background: var(--color-accent-soft);

      &::before {
        content: "";
        position: absolute;

        left: 0;
        top: 8px;
        bottom: 8px;

        width: 3px;
        border-radius: 0 3px 3px 0;

        background: var(--color-accent);
      }
    }
  }
}
```

These examples establish the intended style and naming conventions. Adapt them to the actual component implementation.

---

# 15. COMPONENT NAMING CONVENTIONS

Use a consistent BEM-inspired naming convention.

Example:

```scss
.metric-card {}
.metric-card__header {}
.metric-card__value {}
.metric-card__description {}
.metric-card--interactive {}
```

Rules:

- Block: component name.
- Element: `__element`.
- Modifier: `--modifier`.

Avoid deeply nested selectors.

Do not nest SCSS selectors more than necessary.

Prefer component-specific classes instead of broad global selectors.

Avoid styling components through fragile DOM relationships.

---

# 16. ANIMATIONS AND INTERACTIONS

## 16.1 Animation Philosophy

Animations should make the application feel responsive.

They should not be decorative distractions.

Recommended durations:

| Interaction | Duration |
|---|---:|
| Hover | 120–150ms |
| Button feedback | 120ms |
| Sidebar transition | 180ms |
| Panel transition | 180–220ms |
| Modal transition | 180ms |
| Chart transitions | Controlled by chart library |

Avoid:

- Continuous glowing effects.
- Large scale animations.
- Constantly pulsing cards.
- Excessive parallax.
- Long page transitions.

## 16.2 Reduced Motion

Respect `prefers-reduced-motion`.

Example:

```scss
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

# 17. ICONOGRAPHY

Use one consistent icon system.

Lucide is a suitable starting point.

Recommended icon categories:

| Feature | Icon |
|---|---|
| Overview | LayoutDashboard |
| Performance | Activity |
| CPU | Cpu |
| Memory | MemoryStick |
| GPU | Monitor |
| Processes | List |
| Hardware | CircuitBoard |
| Storage | HardDrive |
| Network | Network |
| Diagnostics | ShieldCheck |
| Settings | Settings |

Use a consistent icon size system:

- 14px: compact labels.
- 16px: standard controls.
- 18px: navigation.
- 20px: section icons.
- 24px: larger feature icons.

Avoid mixing icon libraries.

Do not use emoji as application navigation icons.

---

# 18. SCROLLBARS AND INPUTS

## 18.1 Scrollbars

Use subtle dark scrollbars.

The scrollbar should remain visible enough to communicate scrollability.

Do not completely hide scrollbars in long tables or content areas.

## 18.2 Inputs

Inputs should have:

- Dark surface background.
- Clear border.
- Readable text.
- Visible focus state.
- Consistent height.
- Appropriate disabled state.

Search inputs should include a search icon and optional keyboard shortcut hint.

Avoid oversized rounded input fields.

---

# 19. ACCESSIBILITY AND USABILITY

Requirements:

- Sufficient contrast.
- Keyboard navigation.
- Visible focus states.
- Proper labels.
- Tooltips for icon-only actions.
- Meaningful button names.
- Reduced motion support.
- Text alternatives for status colors.
- Usable interface at smaller window dimensions.

Do not sacrifice readability for visual aesthetics.

---

# 20. SCSS IMPLEMENTATION RULES

These rules are mandatory for future development.

1. All authored stylesheets must use `.scss`.
2. Do not create plain `.css` source files.
3. Use Dart Sass.
4. Use `@use` and `@forward`.
5. Do not use deprecated `@import`.
6. Keep design tokens centralized.
7. Use CSS custom properties for runtime theme values.
8. Use SCSS variables for compile-time values.
9. Use reusable mixins for repeated patterns.
10. Keep component styles near their components where appropriate.
11. Avoid excessive nesting.
12. Avoid `!important` except for justified accessibility or reset cases.
13. Avoid inline styles for ordinary visual styling.
14. Do not duplicate color definitions.
15. Keep responsive behavior inside the appropriate component or layout stylesheet.
16. Keep global styles limited to genuinely global behavior.

## 20.1 Package installation

Install Sass as a development dependency:

```bash
npm install -D sass
```

Verify the installed version:

```bash
npm list sass
```

## 20.2 Importing SCSS

The application entry point should import:

```tsx
import "./styles/main.scss";
```

Feature-specific styles can be imported by their corresponding React modules.

Do not import the same global stylesheet multiple times.

## 20.3 Build validation

After introducing SCSS:

```bash
npm run build
```

The application must compile without Sass errors or missing imports.

---

# 21. RESPONSIVE DESKTOP BEHAVIOR

SystemCore is a desktop application, but the interface must support different window dimensions.

Recommended behavior:

| Window width | Layout |
|---|---|
| 1600px+ | Full sidebar and expanded content |
| 1300–1599px | Standard sidebar and normal grid |
| 1100–1299px | Reduced gaps and compact grid |
| Below 1100px | Collapsed sidebar and adaptive cards |

Avoid relying on a single fixed window size.

The layout should gracefully adapt when the user resizes the desktop window.

Tables should provide horizontal scrolling or adaptive column visibility where necessary.

---

# 22. FINAL VISUAL QUALITY REQUIREMENTS

Before considering the design complete, verify the following:

### Visual consistency

- [ ] All pages use the same color system.
- [ ] All components use consistent spacing.
- [ ] Typography is consistent.
- [ ] Border radii are consistent.
- [ ] Icons belong to one visual system.
- [ ] Hover and active states are consistent.

### Gaming hardware identity

- [ ] Dark graphite surfaces.
- [ ] Controlled orange accents.
- [ ] Electric green healthy states.
- [ ] Technical typography.
- [ ] Precise data visualization.
- [ ] Professional information density.
- [ ] No generic AI dashboard appearance.

### SCSS architecture

- [ ] Sass is installed.
- [ ] All authored stylesheets use SCSS.
- [ ] Global tokens are centralized.
- [ ] Mixins are reusable.
- [ ] No deprecated `@import`.
- [ ] No unnecessary duplicate declarations.
- [ ] Component styles are properly organized.

### Usability

- [ ] Navigation is clear.
- [ ] Metrics are readable.
- [ ] Tables are usable.
- [ ] Loading states exist.
- [ ] Error states exist.
- [ ] Unsupported data is represented correctly.
- [ ] Keyboard navigation works.
- [ ] Reduced motion is supported.

---

# 23. IMPLEMENTATION ORDER

The design should be implemented in the following order.

## Stage 1 — Design foundation

- Install Sass.
- Create SCSS directory structure.
- Implement color tokens.
- Implement typography.
- Implement spacing.
- Implement global reset.
- Implement global styles.

## Stage 2 — Application shell

- Sidebar.
- Topbar.
- Main content layout.
- Navigation states.
- Responsive behavior.

## Stage 3 — Shared components

- Buttons.
- Metric cards.
- Status badges.
- Inputs.
- Tables.
- Tooltips.
- Loading and error states.

## Stage 4 — Overview

- Dashboard layout.
- Resource cards.
- Performance chart.
- Hardware summary.
- Process summary.

## Stage 5 — Feature pages

- Performance.
- Processes.
- Hardware.
- Storage.
- Network.
- Diagnostics.
- Settings.

## Stage 6 — Refinement

- Animations.
- Hover states.
- Keyboard interactions.
- Window resizing.
- Accessibility.
- Performance optimization.

Do not attempt to redesign every page simultaneously.

Establish the design foundation first.

---

# 24. FINAL DESIGN STATEMENT

SystemCore should look and feel like a premium gaming hardware utility.

The application should combine the precision of professional monitoring software with the visual polish of modern desktop applications.

The final interface must be:

- Dark.
- Technical.
- Modern.
- Compact.
- Powerful.
- Readable.
- Consistent.
- Professional.

The orange accent should give the product its identity without overwhelming the interface.

SCSS must provide a structured, maintainable styling architecture.

**The final result should look like a serious PC enthusiast product — not an AI-generated dashboard.**

**SYSTEMCORE — COMPLETE VISIBILITY. TOTAL CONTROL.**

---

*End of Design System Specification.*