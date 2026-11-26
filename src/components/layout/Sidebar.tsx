import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import logo from "../../assets/logo.png";
import { NAV_SECTIONS, type PageId } from "./navigation";
import { SystemStatus } from "./SystemStatus";
import { t } from "../../lib/i18n";

interface Props {
  active: PageId;
  onSelect: (p: PageId) => void;
}

export function Sidebar({ active, onSelect }: Props) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <img className="sidebar__logo" src={logo} alt="" />
        <span className="sidebar__wordmark">
          SYSTEM<span>CORE</span>
        </span>
      </div>
      <nav className="sidebar__navigation" aria-label={t("Main")}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="sidebar__section">
            <div className="sidebar__section-title">{t(section.title)}</div>
            <ul>
              {section.pages.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <button
                    type="button"
                    className={`sidebar__item${id === active ? " sidebar__item--active" : ""}`}
                    aria-current={id === active ? "page" : undefined}
                    aria-label={t(label)}
                    title={t(label)}
                    onClick={() => onSelect(id)}
                  >
                    <Icon className="sidebar__icon" aria-hidden="true" />
                    <span className="sidebar__label">{t(label)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="sidebar__footer">
        <SystemStatus />
        <span className="sidebar__version">{version ? `v${version} · ` : ""}{t("local only")}</span>
      </div>
    </aside>
  );
}
