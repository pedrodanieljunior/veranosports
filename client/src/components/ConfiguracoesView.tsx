// VERSÃO DEBUG 2 — toggles estáticos (sem fetch, sem useEffect, sem biometria)
// Se travar: problema é no CSS left/layout dos toggles
// Se não travar: problema é no fetch / setPrefs / biometric

import { useState } from "react";
import { ChevronLeft } from "lucide-react";

interface Props { onBack: () => void; }

const TOGGLES = [
  { key: "matchStart",    label: "Início de partidas" },
  { key: "goalsAlerts",   label: "Alertas de gols" },
  { key: "betResults",    label: "Resultados de apostas" },
  { key: "promotions",    label: "Promoções e bônus" },
];

export function ConfiguracoesView({ onBack }: Props) {
  const [prefs, setPrefs] = useState({ matchStart: true, goalsAlerts: true, betResults: true, promotions: true });

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="rounded-xl border border-slate-100 bg-white/80 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notificações</p>
        {TOGGLES.map(t => (
          <button
            key={t.key}
            onClick={() => setPrefs(p => ({ ...p, [t.key]: !p[t.key as keyof typeof p] }))}
            className="w-full flex items-center justify-between py-1"
          >
            <span className="text-sm text-slate-700">{t.label}</span>
            {/* knob com transform em vez de left — evita layout reflow no WebView */}
            <span className={`relative inline-block w-11 h-6 rounded-full transition-colors ${prefs[t.key as keyof typeof prefs] ? "bg-blue-500" : "bg-slate-200"}`}>
              <span
                className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: prefs[t.key as keyof typeof prefs] ? "translateX(20px)" : "translateX(0px)" }}
              />
            </span>
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-slate-400">debug v2 — estático</p>
    </div>
  );
}
