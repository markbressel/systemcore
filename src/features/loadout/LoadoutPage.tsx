import { CheckCircle2, Cpu, Download, ExternalLink, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState } from "../../components/feedback/States";
import { StatusBadge } from "../../components/feedback/StatusBadge";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { Gauge } from "../../components/metrics/Gauge";
import { getLanguage, t } from "../../lib/i18n";
import { listPeripherals, openLink } from "../../lib/tauri";
import { useHardware } from "../../stores/hardware";
import { download, install, loadInstalled, useLoadout } from "../../stores/loadout";
import { CATALOG, iconSlug, isInstalled, pickedForPc, type App, type Category, type PcInfo } from "./catalog";

const TABS: { id: Exclude<Category, "hardware"> | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "launchers", label: "Game launchers" },
  { id: "social", label: "Voice & streaming" },
  { id: "performance", label: "Monitoring & tuning" },
  { id: "maintenance", label: "Cleanup & care" },
  { id: "essentials", label: "Essentials" },
];
const initials = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || name[0];
// Official icons, fetched once from each publisher and shipped with the app (src/assets/apps/<slug>.png|svg).
const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>("../../assets/apps/*.{png,svg}", { eager: true, query: "?url", import: "default" })).map(([path, url]) => [path.replace(/^.*\/|\.\w+$/g, ""), url]),
);
const mb = (bytes: number) => `${Math.round(bytes / 1024 ** 2)} MB`;

function AppCard({ app, part }: { app: App; part?: string }) {
  const { installed, status } = useLoadout();
  const lang = getLanguage() === "hu" ? "hu" : "en";
  const key = app.id ?? app.download;
  const s = key ? status[key] : undefined;
  const has = s?.state === "done" || (installed ? isInstalled(app, installed) : null);
  const icon = ICONS[iconSlug(app.name)];
  return (
    <article className={`loadout-card loadout-card--${app.category}`}>
      <div className="loadout-card__head">
        <span className={`loadout-card__mark${icon ? " loadout-card__mark--icon" : ""}`} aria-hidden="true">
          {icon ? <img src={icon} alt="" /> : initials(app.name)}
        </span>
        <div className="loadout-card__titles">
          <h3 className="loadout-card__name">{app.name}</h3>
          <div className="loadout-card__tags">
            {part && <span className="loadout-card__for">{t("For your {part}", { part })}</span>}
            {app.openSource && <span className="loadout-card__tag">{t("Open source")}</span>}
          </div>
        </div>
        <button type="button" className="button button--ghost loadout-card__site" onClick={() => void openLink(app.url)} title={t("Website")} aria-label={t("{name} website", { name: app.name })}>
          <ExternalLink className="button__icon" aria-hidden="true" />
        </button>
      </div>
      <p className="loadout-card__desc">{app.desc[lang]}</p>
      {s?.state === "downloading" && (
        <div className="metric-indicator" role="progressbar" aria-label={t("Downloading {name}", { name: app.name })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.total ? Math.round((s.done / s.total) * 100) : undefined}>
          <span className="metric-indicator__fill" style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} />
        </div>
      )}
      <div className="loadout-card__actions">
        {has === true ? (
          <StatusBadge tone="success">
            <CheckCircle2 className="button__icon" aria-hidden="true" /> {t("Installed")}
          </StatusBadge>
        ) : s?.state === "waiting" || s?.state === "installing" ? (
          <StatusBadge tone="info">{s.state === "waiting" ? t("Waiting") : t("Installing…")}</StatusBadge>
        ) : s?.state === "downloading" ? (
          <StatusBadge tone="info">{s.total ? t("Downloading… {done} / {total}", { done: mb(s.done), total: mb(s.total) }) : t("Downloading…")}</StatusBadge>
        ) : s?.state === "started" ? (
          <StatusBadge tone="success">{t("Installer started: finish it in its window")}</StatusBadge>
        ) : app.id || app.download ? (
          <button
            type="button"
            className="button button--secondary"
            disabled={!installed}
            onClick={() => (app.id ? install(app.id, app.source ?? "winget") : download(app.download!))}
            title={s?.state === "failed" ? s.reason : undefined}
          >
            <Download className="button__icon" aria-hidden="true" /> {s?.state === "failed" ? t("Try again") : has === null ? t("Install / repair") : t("Install")}
          </button>
        ) : (
          // Drivers change their download link with every version, so these go to the publisher's driver page.
          <button type="button" className="button button--secondary" onClick={() => void openLink(app.url)}>
            <ExternalLink className="button__icon" aria-hidden="true" /> {t("Get the latest driver")}
          </button>
        )}
      </div>
      {s?.state === "failed" && <p className="page__note u-danger">{t(s.reason)}</p>}
    </article>
  );
}

export function LoadoutPage() {
  const { hardware: hw } = useHardware();
  const lo = useLoadout();
  const [peripherals, setPeripherals] = useState<PcInfo["peripherals"]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [hideInstalled, setHideInstalled] = useState(false);
  useEffect(() => {
    if (!lo.installed) void loadInstalled();
    listPeripherals().then(setPeripherals).catch(() => {});
  }, []);

  const pc: PcInfo = {
    gpus: hw?.gpus.map((g) => g.model ?? "").filter(Boolean) ?? [],
    cpu: hw?.cpu.brand ?? null,
    board: [hw?.motherboard.vendor, hw?.motherboard.name].filter(Boolean).join(" ") || null,
    peripherals,
  };
  const picked = pickedForPc(pc);
  const done = (a: App) => (a.id && lo.status[a.id]?.state === "done") || (lo.installed ? isInstalled(a, lo.installed) === true : false);
  const pickedDone = picked.filter((p) => done(p.app)).length;
  const grid = CATALOG.filter((a) => a.category !== "hardware" && (tab === "all" || a.category === tab) && !(hideInstalled && done(a)));
  // Which part each vendor tool was matched to, for the summary.
  const parts = [...new Set(picked.map((p) => p.part))];

  return (
    <PageContainer title={t("Loadout")} subtitle={t("Programs worth having for gaming and PC care, and the tools made for your hardware. One click installs them silently.")}>
      {lo.error && <ErrorState message={t(lo.error)} />}

      <section className="speedtest panel">
        <div className="speedtest__dial">
          <Gauge value={picked.length && lo.installed ? (pickedDone / picked.length) * 100 : null} label={t("Your PC's tools")} missingText={lo.installed ? t("Nothing matched") : t("Checking…")} />
        </div>
        <div className="speedtest__side">
          <h2 className="loadout-hero__title">
            <Sparkles className="panel__icon" aria-hidden="true" /> {t("Made for your hardware")}
          </h2>
          <p className="page__note">
            {picked.length
              ? t("{done} of {total} tools for your parts are installed. Drivers and vendor tools keep games stable and unlock features like recording and fan control.", { done: pickedDone, total: picked.length })
              : t("SystemCore found no vendor tools for your parts. The lists below are worth a look anyway.")}
          </p>
          <ul className="loadout-hero__parts">
            {parts.map((part) => (
              <li key={part}>
                <Cpu className="button__icon" aria-hidden="true" /> {part}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {picked.length > 0 && (
        <HardwareCard title={t("Picked for your PC")} icon={Sparkles}>
          <div className="loadout-grid">
            {picked.map(({ app, part }) => (
              <AppCard key={app.name} app={app} part={part} />
            ))}
          </div>
        </HardwareCard>
      )}

      <div className="loadout-filters">
        <div className="tabs" role="tablist" aria-label={t("Category")}>
          {TABS.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={tab === c.id} className={`tabs__tab${tab === c.id ? " tabs__tab--active" : ""}`} onClick={() => setTab(c.id)}>
              {t(c.label)}
            </button>
          ))}
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={hideInstalled} onChange={(e) => setHideInstalled(e.target.checked)} />
          {t("Hide installed")}
        </label>
      </div>
      <div className="loadout-grid">
        {grid.map((app) => (
          <AppCard key={app.name} app={app} />
        ))}
      </div>
      <p className="page__note">
        {t("Installs run one at a time through Windows Package Manager (winget), from the publishers' own installers. Windows may ask for permission for some of them.")}
      </p>
    </PageContainer>
  );
}
