import type { ReactNode } from "react";
import { useTelemetry } from "../../stores/telemetry";
import { ErrorState } from "../feedback/States";
import type { PageId } from "./navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface Props {
  page: PageId;
  onNavigate: (p: PageId) => void;
  children: ReactNode;
}

export function AppShell({ page, onNavigate, children }: Props) {
  const { error } = useTelemetry();
  return (
    <div className="app-shell">
      <Sidebar active={page} onSelect={onNavigate} />
      <div className="app-shell__main">
        <Topbar page={page} />
        {/* key resets scroll position when switching pages */}
        <main className="app-shell__content" key={page}>
          {error && <ErrorState message={error} />}
          {children}
        </main>
      </div>
    </div>
  );
}
