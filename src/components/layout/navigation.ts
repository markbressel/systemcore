import { Activity, CircuitBoard, Flame, Gauge, HardDrive, History, Keyboard, LayoutDashboard, Lightbulb, List, Monitor, Network, Rocket, Settings, type LucideIcon } from "lucide-react";

export interface NavPage {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

export type PageId = "overview" | "performance" | "history" | "processes" | "hardware" | "storage" | "network" | "lighting" | "peripherals" | "display" | "speedtest" | "benchmark" | "startup" | "settings";

export const NAV_SECTIONS: { title: string; pages: NavPage[] }[] = [
  {
    title: "Monitoring",
    pages: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "performance", label: "Performance", icon: Activity },
      { id: "history", label: "History", icon: History },
      { id: "processes", label: "Processes", icon: List },
    ],
  },
  {
    title: "Hardware",
    pages: [
      { id: "hardware", label: "Hardware", icon: CircuitBoard },
      { id: "storage", label: "Storage", icon: HardDrive },
      { id: "network", label: "Network", icon: Network },
      { id: "lighting", label: "PC lighting", icon: Lightbulb },
      { id: "peripherals", label: "Peripherals", icon: Keyboard },
      { id: "display", label: "Display", icon: Monitor },
    ],
  },
  {
    title: "Tools",
    pages: [
      { id: "speedtest", label: "Speed Test", icon: Gauge },
      { id: "benchmark", label: "Benchmark", icon: Flame },
      { id: "startup", label: "Startup Apps", icon: Rocket },
    ],
  },
  {
    title: "App",
    pages: [{ id: "settings", label: "Settings", icon: Settings }],
  },
];

export const findPage = (id: PageId) => {
  for (const s of NAV_SECTIONS) {
    const page = s.pages.find((p) => p.id === id);
    if (page) return { section: s.title, page };
  }
  throw new Error(`Unknown page ${id}`);
};
