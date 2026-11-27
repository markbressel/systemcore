// News feeds: fixed sources (ids match src-tauri/src/news.rs), RSS/Atom parsing with the webview's DOMParser,
// and a module-level cache so switching pages does not refetch. Refreshes when older than 15 minutes.
import { useSyncExternalStore } from "react";
import { fetchNews } from "../../lib/tauri";

export type Category = "hardware" | "tech" | "gaming";
export interface Source {
  id: string;
  name: string;
  category: Category;
  lang: "hu" | "en";
}

export const SOURCES: Source[] = [
  { id: "hwsw", name: "HWSW", category: "tech", lang: "hu" },
  { id: "index-tech", name: "Index Tech", category: "tech", lang: "hu" },
  { id: "gamestar-hu", name: "GameStar", category: "gaming", lang: "hu" },
  { id: "tomshardware", name: "Tom's Hardware", category: "hardware", lang: "en" },
  { id: "techpowerup", name: "TechPowerUp", category: "hardware", lang: "en" },
  { id: "arstechnica", name: "Ars Technica", category: "tech", lang: "en" },
  { id: "pcgamer", name: "PC Gamer", category: "gaming", lang: "en" },
  { id: "eurogamer", name: "Eurogamer", category: "gaming", lang: "en" },
];

export interface Article {
  source: Source;
  title: string;
  link: string;
  /** ms since epoch; 0 when the feed gave no usable date. */
  date: number;
  summary: string;
  image: string | null;
}

const PER_SOURCE = 25;
const MAX_AGE_MS = 15 * 60_000;

/** Plain text of an HTML fragment (feeds put markup and double-escaped entities in titles and summaries). */
const text = (html: string) => (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").replace(/\s+/g, " ").trim();
// Images must be https: that is all the page's content security policy lets through.
const httpsUrl = (u: string | null | undefined) => (u && /^https:\/\/\S+$/.test(u.trim()) ? u.trim() : null);

function image(item: Element, html: string): string | null {
  const tagged = ["media:thumbnail", "media:content", "enclosure"].flatMap((tag) => [...item.getElementsByTagName(tag)]);
  for (const el of tagged) {
    const type = el.getAttribute("type") ?? el.getAttribute("medium") ?? "image";
    const url = httpsUrl(el.getAttribute("url"));
    if (url && /image/.test(type)) return url;
  }
  return httpsUrl(/<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]);
}

export function parseFeed(xml: string, source: Source): Article[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The news feed could not be read.");
  const items = [...doc.getElementsByTagName("item"), ...doc.getElementsByTagName("entry")].slice(0, PER_SOURCE);
  const first = (el: Element, ...tags: string[]) => tags.map((t) => el.getElementsByTagName(t)[0]).find(Boolean);
  return items.flatMap((item) => {
    const linkEl = first(item, "link");
    const link = httpsUrl(linkEl?.textContent || linkEl?.getAttribute("href"));
    const title = text(first(item, "title")?.textContent ?? "");
    if (!link || !title) return [];
    const html = first(item, "content:encoded", "description", "summary", "content")?.textContent ?? "";
    const date = Date.parse(first(item, "pubDate", "published", "updated", "dc:date")?.textContent ?? "");
    const summary = text(html);
    return [{ source, title, link, date: Number.isFinite(date) ? date : 0, summary: summary.length > 240 ? `${summary.slice(0, 237).trimEnd()}…` : summary, image: image(item, html) }];
  });
}

const VENDOR_WORDS: [RegExp, RegExp][] = [
  [/nvidia|geforce/i, /nvidia|geforce/i],
  [/amd|radeon/i, /amd|radeon|adrenalin/i],
  [/intel/i, /intel|arc\b/i],
];
/** A driver story for the vendor of this PC's graphics card (model text as Windows reports it). */
export function aboutMyGpuDriver(title: string, gpuModel: string | null | undefined): boolean {
  const words = gpuModel && VENDOR_WORDS.find(([vendor]) => vendor.test(gpuModel))?.[1];
  return !!words && /driver|illesztőprogram/i.test(title) && words.test(title);
}

interface NewsState {
  articles: Article[];
  /** Source ids that failed on the last load. */
  failed: string[];
  loading: boolean;
  loadedAt: number;
}
let state: NewsState = { articles: [], failed: [], loading: false, loadedAt: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<NewsState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const useNews = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

/** Loads every source in parallel; a failing site only drops its own articles. `force` skips the 15-minute cache. */
export async function loadNews(force = false) {
  if (state.loading || (!force && Date.now() - state.loadedAt < MAX_AGE_MS)) return;
  set({ loading: true });
  const results = await Promise.allSettled(SOURCES.map(async (s) => parseFeed(await fetchNews(s.id), s)));
  const articles = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  // Same story syndicated twice: keep the first.
  const seen = new Set<string>();
  set({
    articles: articles.filter((a) => !seen.has(a.link) && seen.add(a.link)).sort((a, b) => b.date - a.date),
    failed: SOURCES.filter((_, i) => results[i].status === "rejected").map((s) => s.id),
    loading: false,
    loadedAt: Date.now(),
  });
}
