import { getVersion } from "@tauri-apps/api/app";
import { Cpu, Gamepad2, Newspaper, RefreshCw, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, LoadingState } from "../../components/feedback/States";
import { StatusBadge } from "../../components/feedback/StatusBadge";
import { PageContainer } from "../../components/layout/PageContainer";
import { getLanguage, t } from "../../lib/i18n";
import { openLink } from "../../lib/tauri";
import { useHardware } from "../../stores/hardware";
import { CHANGELOG } from "./changelog";
import { aboutMyGpuDriver, loadNews, SOURCES, useNews, type Article, type Category } from "./feeds";

const CATEGORIES: { id: Category | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "hardware", label: "Hardware" },
  { id: "tech", label: "IT & tech" },
  { id: "gaming", label: "Gaming" },
];
const LANGS = [
  { id: "all", label: "All" },
  { id: "hu", label: "Hungarian" },
  { id: "en", label: "English" },
] as const;
const ICON: Record<Category, LucideIcon> = { hardware: Cpu, tech: Newspaper, gaming: Gamepad2 };
const PAGE = 24;

function ago(ms: number) {
  if (!ms) return "";
  const rtf = new Intl.RelativeTimeFormat(getLanguage(), { numeric: "auto" });
  const min = Math.round((ms - Date.now()) / 60_000);
  if (min > -60) return rtf.format(Math.min(0, min), "minute");
  if (min > -60 * 24) return rtf.format(Math.round(min / 60), "hour");
  return rtf.format(Math.round(min / 1440), "day");
}

/** Category-colored picture area; the feed image (if any) covers it, and is dropped if it fails to load. */
function Picture({ a, big }: { a: Article; big?: boolean }) {
  const Icon = ICON[a.source.category];
  return (
    <div className={`news-card__picture news-card__picture--${a.source.category}${big ? " news-card__picture--big" : ""}`}>
      <Icon className="news-card__placeholder" aria-hidden="true" />
      {a.image && <img src={a.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} />}
    </div>
  );
}

function Card({ a, featured, mine }: { a: Article; featured?: boolean; mine: boolean }) {
  return (
    <a
      className={`news-card${featured ? " news-card--featured" : ""}`}
      href={a.link}
      onClick={(e) => {
        e.preventDefault();
        void openLink(a.link);
      }}
    >
      <Picture a={a} big={featured} />
      <div className="news-card__body">
        <div className="news-card__meta">
          <span className={`news-card__source news-card__source--${a.source.category}`}>{a.source.name}</span>
          <span>{ago(a.date)}</span>
          {mine && <StatusBadge tone="accent">{t("Your graphics card")}</StatusBadge>}
        </div>
        <h3 className="news-card__title">{a.title}</h3>
        {a.summary && <p className="news-card__summary">{a.summary}</p>}
      </div>
    </a>
  );
}

function WhatsNew() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);
  const lang = getLanguage() === "hu" ? "hu" : "en";
  return (
    <aside className="panel news-changelog">
      <h2 className="panel__title">
        <Sparkles className="panel__icon" aria-hidden="true" /> {t("What's new in SystemCore")}
      </h2>
      <ol className="news-changelog__list">
        {CHANGELOG.map((r, i) => (
          <li key={r.version} className={`news-changelog__release${i === 0 ? " news-changelog__release--latest" : ""}`}>
            <details open={i < 2}>
              <summary>
                <span className="news-changelog__version">{r.version === "next" ? t("Coming next") : `v${r.version}`}</span>
                {r.version === version && <StatusBadge tone="success">{t("Installed")}</StatusBadge>}
                <span className="news-changelog__date">{new Date(r.date).toLocaleDateString(getLanguage())}</span>
                <span className="news-changelog__title">{r.title[lang]}</span>
              </summary>
              <ul>
                {r.items.map((it) => (
                  <li key={it.en}>{it[lang]}</li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function NewsPage() {
  const news = useNews();
  const { hardware } = useHardware();
  const [category, setCategory] = useState<Category | "all">("all");
  const [lang, setLang] = useState<(typeof LANGS)[number]["id"]>("all");
  const [shown, setShown] = useState(PAGE);
  useEffect(() => void loadNews(), []);

  const gpuModel = hardware?.gpus[0]?.model;
  const list = news.articles.filter((a) => (category === "all" || a.source.category === category) && (lang === "all" || a.source.lang === lang));
  // Lead with the newest story that has a picture.
  const lead = list.find((a) => a.image);
  const rest = list.filter((a) => a !== lead).slice(0, shown);
  const failed = SOURCES.filter((s) => news.failed.includes(s.id)).map((s) => s.name);

  const tabs = <T extends string>(label: string, items: readonly { id: T; label: string }[], value: T, set: (v: T) => void) => (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={value === c.id}
          className={`tabs__tab${value === c.id ? " tabs__tab--active" : ""}`}
          onClick={() => {
            set(c.id);
            setShown(PAGE);
          }}
        >
          {t(c.label)}
        </button>
      ))}
    </div>
  );

  return (
    <PageContainer
      title={t("News")}
      subtitle={t("The latest IT, hardware and gaming news, and what changed in SystemCore. Articles open in your browser.")}
      actions={
        <button type="button" className="button button--secondary" disabled={news.loading} onClick={() => void loadNews(true)}>
          <RefreshCw className={`button__icon${news.loading ? " u-spin" : ""}`} aria-hidden="true" /> {t("Refresh")}
        </button>
      }
    >
      <div className="news">
        <section className="news__feed">
          <div className="news__filters">
            {tabs(t("Topic"), CATEGORIES, category, setCategory)}
            {tabs(t("Language"), LANGS, lang, setLang)}
          </div>
          {failed.length > 0 && <p className="page__note">{t("Not reachable right now: {list}", { list: failed.join(", ") })}</p>}

          {!news.loadedAt ? (
            <LoadingState label={t("Loading news…")} />
          ) : !list.length ? (
            <EmptyState icon={Newspaper}>{t("No news here. Check the internet connection, or pick another topic or language.")}</EmptyState>
          ) : (
            <>
              {lead && <Card a={lead} featured mine={aboutMyGpuDriver(lead.title, gpuModel)} />}
              <div className="news__grid">
                {rest.map((a) => (
                  <Card key={a.link} a={a} mine={aboutMyGpuDriver(a.title, gpuModel)} />
                ))}
              </div>
              {list.length - 1 > shown && (
                <button type="button" className="button button--secondary news__more" onClick={() => setShown((n) => n + PAGE)}>
                  {t("Show more")}
                </button>
              )}
            </>
          )}
        </section>
        <WhatsNew />
      </div>
    </PageContainer>
  );
}
