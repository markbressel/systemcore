import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label = "Collecting first measurements…" }: { label?: string }) {
  return (
    <div className="state" role="status">
      <div className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, children, compact }: { icon?: LucideIcon; children: ReactNode; compact?: boolean }) {
  return (
    <div className={`state${compact ? " state--compact" : ""}`}>
      {Icon && <Icon className="state__icon" aria-hidden="true" />}
      {children}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state state--error" role="alert">
      <AlertTriangle className="state__icon" aria-hidden="true" />
      <span>
        <strong>Error:</strong> {message}
      </span>
    </div>
  );
}
