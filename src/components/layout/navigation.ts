import { Activity, CircuitBoard, Flame, Gauge, HardDrive, History, Info, Keyboard, LayoutDashboard, Lightbulb, List, Monitor, Network, Newspaper, PackageCheck, Swords, Rocket, Settings, type LucideIcon } from "lucide-react";

export interface NavPage {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

export type PageId = "overview" | "performance" | "history" | "processes" | "hardware" | "storage" | "network" | "lighting" | "peripherals" | "display" | "speedtest" | "benchmark" | "startup" | "updater" | "loadout" | "news" | "settings" | "about";

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
      { id: "updater", label: "Updater", icon: PackageCheck },
      { id: "loadout", label: "Loadout", icon: Swords },
    ],
  },
  {
    title: "App",
    pages: [
      { id: "news", label: "News", icon: Newspaper },
      { id: "settings", label: "Settings", icon: Settings },
      { id: "about", label: "About", icon: Info },
    ],
  },
];

export const findPage = (id: PageId) => {
  for (const s of NAV_SECTIONS) {
    const page = s.pages.find((p) => p.id === id);
    if (page) return { section: s.title, page };
  }
  throw new Error(`Unknown page ${id}`);
};
