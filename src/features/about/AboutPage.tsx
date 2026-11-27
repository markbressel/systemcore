import { getVersion } from "@tauri-apps/api/app";
import { Bug, CheckCircle2, Download, ExternalLink, Info, Lightbulb, MessageSquarePlus, Send, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import logo from "../../assets/logo.png";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { PageContainer } from "../../components/layout/PageContainer";
import { StatList } from "../../components/metrics/StatList";
import { formatBytes } from "../../lib/format";
import { getLanguage, t } from "../../lib/i18n";
import { openLink, sendFeedback } from "../../lib/tauri";
import { useHardware } from "../../stores/hardware";

const REPO = "https://github.com/markbressel/systemcore";

/** Everything that talks to the internet, so users can see what leaves the PC. */
const NETWORK_USE: [string, string][] = [
  ["Speed test", "Cloudflare speed test servers"],
  ["Ping", "a connection test to 1.1.1.1 (Cloudflare)"],
  ["News", "the news sites listed on the News page"],
  ["Game search", "the Steam store"],
  ["Updates", "GitHub, where new versions are published"],
  ["Updater and Loadout", "Windows Package Manager and the programs' own download servers, when you check or install"],
  ["Feedback", "Formspree, which forwards your message to the developer by e-mail"],
];

function FeedbackForm({ system }: { system: string[] }) {
  const [kind, setKind] = useState<"bug" | "idea">("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [withSystem, setWithSystem] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Say what is missing instead of leaving a greyed-out button unexplained.
  const missing = title.trim().length < 3 ? t("Write a title (at least 3 characters) to send.") : description.trim().length < 6 ? t("Write a few words in the description to send.") : null;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await sendFeedback({ kind, title, message: description, system: withSystem ? system.join("\n") : "" });
      setSent(true);
      setTitle("");
      setDescription("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <HardwareCard title={t("Send feedback")} icon={MessageSquarePlus}>
      <p className="page__note">{t("Found a bug, or have an idea for SystemCore? Write it here: every message is read.")}</p>
      <div className="tabs" role="tablist" aria-label={t("Feedback type")}>
        {(
          [
            ["bug", Bug, "Bug report"],
            ["idea", Lightbulb, "Suggestion"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button key={id} type="button" role="tab" aria-selected={kind === id} className={`tabs__tab${kind === id ? " tabs__tab--active" : ""}`} onClick={() => setKind(id)}>
            <Icon className="button__icon" aria-hidden="true" /> {t(label)}
          </button>
        ))}
      </div>
      <label className="about-form__field">
        <span>{t("Title")}</span>
        <input className="input" maxLength={120} value={title} onChange={(e) => (setTitle(e.target.value), setSent(false))} placeholder={kind === "bug" ? t("e.g. The overlay disappears in fullscreen games") : t("e.g. Show fan speeds in the overlay")} />
      </label>
      <label className="about-form__field">
        <span>{kind === "bug" ? t("What happened, and what did you expect?") : t("What would you like, and how would it help you?")}</span>
        <textarea className="input input--multiline" rows={6} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={withSystem} onChange={(e) => setWithSystem(e.target.checked)} />
        {t("Attach system details (version, Windows, processor, graphics card, memory; no names or addresses)")}
      </label>
      {withSystem && <pre className="about-form__system">{system.join("\n")}</pre>}
      <div className="about-form__actions">
        <button type="button" className="button button--primary" disabled={!!missing || sending} onClick={() => void send()}>
          <Send className="button__icon" aria-hidden="true" /> {sending ? t("Sending…") : t("Send")}
        </button>
      </div>
      {missing && !sent && <p className="page__note">{missing}</p>}
      {error && <p className="page__note u-danger">{t(error)}</p>}
      {sent && (
        <p className="page__note about-form__sent">
          <CheckCircle2 className="button__icon" aria-hidden="true" /> {t("Thank you! Your message has been sent to the developer.")}
        </p>
      )}
    </HardwareCard>
  );
}

export function AboutPage() {
  const { hardware: hw } = useHardware();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const system = [
    `SystemCore ${version ? `v${version}` : ""}`.trim(),
    hw?.os.longVersion ?? hw?.os.name,
    hw?.cpu.brand,
    hw?.gpus.map((g) => g.model).filter(Boolean).join(", "),
    hw?.memoryTotalBytes != null ? `RAM ${formatBytes(hw.memoryTotalBytes, 0)}` : null,
    `${t("Language")}: ${getLanguage()}`,
  ].filter((x): x is string => !!x);

  return (
    <PageContainer title={t("About")} subtitle={t("What SystemCore is, what it sends over the internet, and how to reach the developer.")}>
      <section className="panel about-hero">
        <img className="about-hero__logo" src={logo} alt="" />
        <div className="about-hero__text">
          <h2 className="about-hero__name">
            SYSTEM<span>CORE</span>
          </h2>
          <p className="about-hero__tagline">{t("A fast, good-looking system monitor and PC control center for Windows 11.")}</p>
          <div className="about-hero__meta">
            <span className="about-hero__version">{version ? `v${version}` : "—"}</span>
            <span>Windows 10 / 11</span>
            <span>Tauri · Rust · React</span>
          </div>
        </div>
        <div className="about-hero__actions">
          <button type="button" className="button button--secondary" onClick={() => void openLink(`${REPO}/releases/latest`)}>
            <Download className="button__icon" aria-hidden="true" /> {t("Latest version")}
          </button>
          <button type="button" className="button button--ghost" onClick={() => void openLink(REPO)}>
            <ExternalLink className="button__icon" aria-hidden="true" /> GitHub
          </button>
        </div>
      </section>

      <div className="about-grid">
        <FeedbackForm system={system} />
        <div className="about-grid__side">
          <HardwareCard title={t("This copy")} icon={Info}>
            <StatList
              items={[
                [t("Version"), version ? `v${version}` : null],
                [t("Operating system"), hw?.os.longVersion ?? hw?.os.name],
                [t("Data storage"), t("Only on this PC")],
                [t("Updates"), t("Offered automatically when a new version is out")],
              ]}
              single
            />
          </HardwareCard>
          <HardwareCard title={t("Privacy")} icon={ShieldCheck}>
            <p className="page__note">{t("Measurements, history and settings never leave this PC. SystemCore only goes online for these:")}</p>
            <ul className="about-list">
              {NETWORK_USE.map(([what, where]) => (
                <li key={what}>
                  <strong>{t(what)}</strong> — {t(where)}
                </li>
              ))}
            </ul>
          </HardwareCard>
        </div>
      </div>
    </PageContainer>
  );
}
