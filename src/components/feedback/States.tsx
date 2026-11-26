import { AlertTriangle, type LucideIcon } from "lucide-react";
import { Component, type ReactNode } from "react";
import { t } from "../../lib/i18n";

export function LoadingState({ label = t("Collecting first measurements…") }: { label?: string }) {
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
        <strong>{t("Error:")}</strong> {t(message)}
      </span>
    </div>
  );
}

/** Keeps one broken page from blanking the whole app: shows the error in its place instead. */
export class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? <ErrorState message={t("This page could not be shown: {error}", { error: this.state.error.message })} /> : this.props.children;
  }
}
