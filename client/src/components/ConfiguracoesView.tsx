import { useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useTheme } from "@/lib/theme";
import {
  isNative,
  isBiometricEnabledSync,
  isBiometricAvailable,
  clearBiometricCredentials,
} from "@/lib/platform";

interface Props { onBack: () => void; }

const TOGGLES = [
  { key: "matchStart",  label: "Início de partidas" },
  { key: "goalsAlerts", label: "Alertas de gols" },
  { key: "betResults",  label: "Resultados de apostas" },
  { key: "promotions",  label: "Promoções e bônus" },
];

const DEFAULT_PREFS = { matchStart: true, goalsAlerts: true, betResults: true, promotions: true };

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-block w-11 h-6 rounded-full transition-colors ${on ? "bg-blue-500" : "bg-slate-200"}`}>
      <span
        className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? "translateX(20px)" : "translateX(0px)" }}
      />
    </span>
  );
}

export function ConfiguracoesView({ onBack }: Props) {
  const { theme, setTheme } = useTheme();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  // Leitura síncrona via localStorage — sem chamada nativa, sem freeze
  const [bioEnabled, setBioEnabled] = useState(() => isBiometricEnabledSync());
  const [bioMsg, setBioMsg] = useState("");

  // Carrega preferências de push do servidor — fetch normal, sem bridge nativo
  useEffect(() => {
    fetch("/api/user/push-preferences", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPrefs(p => ({ ...p, ...data })); })
      .catch(() => {});
  }, []);

  function togglePref(key: string) {
    const next = { ...prefs, [key]: !prefs[key as keyof typeof prefs] };
    setPrefs(next);
    fetch("/api/user/push-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(next),
    }).catch(() => {});
  }

  // Chamada nativa só no tap — não no mount, evita freeze no Android WebView
  async function toggleBiometric() {
    if (bioEnabled) {
      await clearBiometricCredentials();
      setBioEnabled(false);
      setBioMsg("Biometria desativada.");
    } else {
      const available = await isBiometricAvailable();
      if (!available) {
        setBioMsg("Biometria não disponível neste dispositivo.");
        return;
      }
      setBioMsg("Faça login normalmente para ativar a biometria.");
    }
  }

  const isDark = theme === "dark";

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      {/* Notificações — só exibe no app nativo */}
      {isNative() && (
        <div className="rounded-xl border border-slate-100 bg-white/80 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notificações</p>
          {TOGGLES.map(t => (
            <button
              key={t.key}
              onClick={() => togglePref(t.key)}
              className="w-full flex items-center justify-between py-1"
            >
              <span className="text-sm text-slate-700">{t.label}</span>
              <Toggle on={prefs[t.key as keyof typeof prefs]} />
            </button>
          ))}
        </div>
      )}

      {/* Biometria — só no nativo, estado inicial via localStorage (sem bridge) */}
      {isNative() && (
        <div className="rounded-xl border border-slate-100 bg-white/80 p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Segurança</p>
          <button
            onClick={toggleBiometric}
            className="w-full flex items-center justify-between py-1"
          >
            <span className="text-sm text-slate-700">Login biométrico</span>
            <Toggle on={bioEnabled} />
          </button>
          {bioMsg ? <p className="text-xs text-slate-500">{bioMsg}</p> : null}
        </div>
      )}

      {/* Tema */}
      <div className="rounded-xl border border-slate-100 bg-white/80 p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Aparência</p>
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="w-full flex items-center justify-between py-1"
        >
          <span className="text-sm text-slate-700">Tema escuro</span>
          <Toggle on={isDark} />
        </button>
      </div>
    </div>
  );
}
