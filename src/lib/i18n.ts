// UI translation. English text is the key: `t("Overview")` returns the Hungarian text when Hungarian is
// active and the English text otherwise, so a missing translation falls back to readable English.
// Standalone (no app imports) so pure modules and their Node self-checks can use it; Node runs in English.
import { HU, HU_PATTERNS } from "./i18n.hu.ts";

export type Language = "en" | "hu";

let language: Language = "en";

/** Set once at startup from the saved setting; a change reloads the windows (see stores/settings). */
export function setLanguage(l: Language) {
  language = l;
  document.documentElement.lang = l;
}

export const getLanguage = () => language;

/** Default for a first run: Hungarian on a Hungarian Windows, English otherwise. */
export const systemLanguage = (): Language => (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("hu") ? "hu" : "en");

/** Messages with changing parts (e.g. a process name inside a backend error). */
function fromPattern(text: string): string | undefined {
  const hit = HU_PATTERNS.find(([re]) => re.test(text));
  return hit && text.replace(hit[0], hit[1]);
}

/** Translates `text` and fills `{name}` placeholders from `vars`. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const s = language === "hu" ? (HU[text] ?? fromPattern(text) ?? text) : text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
