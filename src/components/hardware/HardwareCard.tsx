import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  title: string;
  icon: LucideIcon;
  aside?: ReactNode;
  children: ReactNode;
}

/** Section panel with an icon title — used for hardware groups and detail sections. */
export function HardwareCard({ title, icon: Icon, aside, children }: Props) {
  return (
    <section className="panel">
      <div className="panel__header">
        <h2 className="panel__title">
          <Icon className="panel__icon" aria-hidden="true" />
          {title}
        </h2>
        {aside && <div className="panel__aside">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
