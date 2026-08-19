import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { isNative } from "@/lib/platform";

export type Theme = "light" | "dark";

const THEME_KEY = "verano_theme";

interface ThemeCtx { theme: Theme; setTheme: (t: Theme) => void; }
const ThemeContext = createContext<ThemeCtx>({ theme: "light", setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try { return (localStorage.getItem(THEME_KEY) as Theme) || "light"; } catch { return "light"; }
  });

  useEffect(() => {
    const root = document.documentElement;
    // Modo escuro só ativa no APK nativo — web e desktop ficam sempre no modo claro
    if (theme === "dark" && isNative()) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }
