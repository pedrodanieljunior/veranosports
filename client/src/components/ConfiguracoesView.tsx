// VERSÃO DEBUG 3 — fetch + save funcionando, SEM biometria
// Se travar: problema é o fetch/setPrefs re-render
// Se não travar: problema era a biometria (native bridge call)

import { useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useTheme } from "@/lib/theme";

interface Props { onBack: () => void; }

const TOGGLES = [
  { key: "matchStart",  label: "Início de partidas" },
  { key: "goalsAlerts", label: "Alertas de gols" },
  { key: "betResults",  label: "Resultados de apostas" },
  { key: "promotions",  label: "Promoções e bônus" },
];

const DEFAULT_PREFS = { matchStart: true, goalsAlerts: true, betResults: true, promotions: true };

export function ConfiguracoesView({ onBack }: Props) {
  const { theme, setTheme } = useTheme();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  useEffect(() => {
    fetch("/api/user/push-preferences", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPrefs({ ...DEFAULT_PREFS, ...data }); })
      .catch(() => {});
  }, []);

  function toggle(key: string) {
    const next = { ...prefs, [key]: !prefs[key as keyof typeof prefs] };
    setPrefs(next);
    fetch("/api/user/push-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(next),
    }).catch(() => {});
  }

  const isDark = theme === "dark";

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      {/* Notificações */}
      <div className="rounded-xl border border-slate-100 bg-white/80 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notificações</p>
        {TOGGLES.map(t => (
          <button
            key={t.key}
            onClick={() => toggle(t.key)}
            className="w-full flex items-center justify-between py-1"
          >
            <span className="text-sm text-slate-700">{t.label}</span>
            <span className={`relative inline-block w-11 h-6 rounded-full transition-colors ${prefs[t.key as keyof typeof prefs] ? "bg-blue-500" : "bg-slate-200"}`}>
              <span
                className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: prefs[t.key as keyof typeof prefs] ? "translateX(20px)" : "translateX(0px)" }}
              />
            </span>
          </button>
        ))}
      </div>

      {/* Tema */}
      <div className="rounded-xl border border-slate-100 bg-white/80 p-4">
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="w-full flex items-center justify-between py-1"
        >
          <span className="text-sm text-slate-700">Tema escuro</span>
          <span className={`relative inline-block w-11 h-6 rounded-full transition-colors ${isDark ? "bg-blue-500" : "bg-slate-200"}`}>
            <span
              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{ transform: isDark ? "translateX(20px)" : "translateX(0px)" }}
            />
          </span>
        </button>
      </div>

      <p className="text-center text-xs text-slate-400">debug v3 — sem biometria</p>
    </div>
  );
}
