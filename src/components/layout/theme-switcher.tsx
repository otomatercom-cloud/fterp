"use client";
import { useEffect, useState } from "react";
import { Palette } from "lucide-react";

const THEMES = [["maroon", "Maroon (dark)"], ["day", "Day (light)"], ["ocean", "Ocean (dark)"], ["emerald", "Emerald (dark)"]] as const;

export function ThemeSwitcher() {
  const [theme, setTheme] = useState("maroon");
  useEffect(() => { setTheme(document.documentElement.getAttribute("data-theme") || "maroon"); }, []);
  const change = (t: string) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("ierp-theme", t); } catch { /* storage blocked: theme lasts for this visit */ }
  };
  return (
    <label className="relative flex items-center" title="Change theme">
      <Palette aria-hidden className="pointer-events-none absolute left-2 size-4 text-muted" />
      <select aria-label="Theme" value={theme} onChange={(e) => change(e.target.value)} className="h-9 w-9 cursor-pointer appearance-none rounded-md border border-line bg-transparent pl-8 text-transparent sm:w-auto sm:pr-2 sm:text-xs sm:text-ink">
        {THEMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}
