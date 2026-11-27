import { ArrowUpCircle, Gamepad2, Search } from "lucide-react";
import { useState } from "react";
import { LoadingState } from "../../components/feedback/States";
import { StatusBadge, type Tone } from "../../components/feedback/StatusBadge";
import { HardwareCard } from "../../components/hardware/HardwareCard";
import { t } from "../../lib/i18n";
import { gameRequirements, searchGames } from "../../lib/tauri";
import { closest, CPU_LADDER, GPU_LADDER, overall, parseSpec, partLevel, upgrades, type Field, type Level, type MyPc, type Part, type Spec } from "./games";

const LEVEL: Record<Level, [Tone, string]> = {
  high: ["success", "Runs well (recommended)"],
  medium: ["warning", "Playable (minimum)"],
  low: ["danger", "Below minimum"],
};
const UPGRADE_LABEL = { cpu: "Processor", gpu: "Graphics card", ram: "Memory" } as const;
const gb = (v: number | null) => (v == null ? "—" : `${Math.round(v)} GB`);

type Picked = { name: string; min: Spec; rec: Spec };

/** Search any game on Steam, compare its requirements with this PC's benchmark, and say what to upgrade. */
export function GameSearch({ pc }: { pc: MyPc }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<{ id: number; name: string }[] | null>(null);
  const [game, setGame] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async <T,>(job: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      return await job();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const search = () =>
    run(async () => {
      const found = await searchGames(term);
      setHits(found);
      setGame(null);
      if (found.length === 1) await pick(found[0].id);
    });
  const pick = (id: number) =>
    run(async () => {
      const r = await gameRequirements(id);
      setGame({ name: r.name, min: parseSpec(r.minimum), rec: parseSpec(r.recommended) });
    });

  const rows: { field: Field; label: string; part?: Part; mine: string }[] = [
    { field: "cpu", label: "Processor", part: "cpu", mine: pc.cpu == null ? "—" : t("about {name}", { name: closest(CPU_LADDER, pc.cpu) }) },
    { field: "gpu", label: "Graphics card", part: "gpu", mine: pc.gpu == null ? "—" : t("about {name}", { name: closest(GPU_LADDER, pc.gpu) }) },
    { field: "gpu", label: "Video memory", part: "vramGb", mine: gb(pc.vramGb) },
    { field: "ram", label: "Memory", part: "ramGb", mine: gb(pc.ramGb) },
    { field: "storage", label: "Storage", mine: "" },
    { field: "os", label: "Operating system", mine: "" },
  ];
  const level = game && overall(pc, game.min, game.rec);
  const todo = game ? upgrades(pc, game.min, game.rec) : [];

  return (
    <HardwareCard title={t("Will this game run?")} icon={Gamepad2}>
      <form
        className="game-search__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (term.trim()) void search();
        }}
      >
        <label className="search-field">
          <Search className="search-field__icon" aria-hidden="true" />
          <input className="search-field__input" placeholder={t("Game name, e.g. Elden Ring")} aria-label={t("Game name")} value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
        <button type="submit" className="button button--secondary" disabled={!term.trim() || busy}>
          {t("Search")}
        </button>
      </form>

      {pc.cpu == null && <p className="page__note">{t("Run the benchmark once so the processor and graphics card can be compared too.")}</p>}
      {error && <p className="page__note u-danger">{t(error)}</p>}
      {hits?.length === 0 && <p className="page__note">{t("No game found on Steam with this name.")}</p>}
      {hits && hits.length > 1 && (
        <div className="game-search__hits">
          {hits.map((h) => (
            <button key={h.id} type="button" className="button button--ghost" onClick={() => void pick(h.id)}>
              {h.name}
            </button>
          ))}
        </div>
      )}
      {busy && <LoadingState />}

      {game && !busy && (
        <>
          <div className="game-search__head">
            <strong>{game.name}</strong>
            {level ? <StatusBadge tone={LEVEL[level][0]}>{t(LEVEL[level][1])}</StatusBadge> : <StatusBadge tone="neutral">{t("Cannot estimate")}</StatusBadge>}
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th><span className="data-table__heading">{t("Part")}</span></th>
                  <th><span className="data-table__heading">{t("Minimum")}</span></th>
                  <th><span className="data-table__heading">{t("Recommended")}</span></th>
                  <th><span className="data-table__heading">{t("Your PC")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const l = r.part ? partLevel(r.part, pc, game.min, game.rec) : null;
                  // Video memory has no text of its own: show the amount found in the graphics line.
                  const need = (s: Spec) => (r.part === "vramGb" ? gb(s.vramGb) : (s.text[r.field] ?? "—"));
                  const unknown = r.part && r.part !== "vramGb" && r.part !== "ramGb" && game.min[r.part] == null && game.rec[r.part] == null && (game.min.text[r.field] || game.rec.text[r.field]);
                  return (
                    <tr key={r.label}>
                      <td className="data-table__primary">{t(r.label)}</td>
                      <td>{need(game.min)}</td>
                      <td>{need(game.rec)}</td>
                      <td>
                        {r.mine}
                        {l && <> <StatusBadge tone={LEVEL[l][0]} plain>{t(l === "high" ? "OK" : l === "medium" ? "Minimum" : "Too weak")}</StatusBadge></>}
                        {unknown && <span className="page__note"> {t("(model not recognized)")}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h3 className="game-search__sub">
            <ArrowUpCircle className="button__icon" aria-hidden="true" /> {t("To run it at recommended settings")}
          </h3>
          {todo.length ? (
            <ul className="game-search__todo">
              {todo.map((u) => (
                <li key={u.part}>
                  <strong>{t(UPGRADE_LABEL[u.part])}:</strong> {t("at least {name}", { name: u.to })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="page__note">{level ? t("Nothing to upgrade: your PC meets the recommended requirements.") : t("Steam lists no requirements this app can compare.")}</p>
          )}
          <p className="page__note">
            {t("An estimate from your benchmark scores and the requirements on the game's Steam page, not a measured frame rate. Upgrade picks are performance targets; check that a part fits your motherboard and power supply.")}
          </p>
        </>
      )}
    </HardwareCard>
  );
}
