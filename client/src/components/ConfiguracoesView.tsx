import { useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useTheme } from "@/lib/theme";
import {
  isNative,
  isBiometricEnabledSync,
  clearBiometricLocalSync,
  clearBiometricCredentials,
} from "@/lib/platform";

interface Props { onBack: () => void; }

// Chaves alinhadas com o servidor (live_game, bet_won, deposit_confirmed, admin)
const TOGGLES = [
  { key: "live_game",          label: "Jogos ao vivo" },
  { key: "bet_won",            label: "Apostas ganhas" },
  { key: "deposit_confirmed",  label: "Depósitos confirmados" },
  { key: "admin",              label: "Comunicados da Verano" },
];

const DEFAULT_PREFS = { live_game: true, bet_won: true, deposit_confirmed: true, admin: true };
type Prefs = typeof DEFAULT_PREFS;

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
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  // Leitura síncrona via localStorage — zero bridge nativo, zero freeze
  const [bioEnabled, setBioEnabled] = useState(() => isBiometricEnabledSync());
  const [bioMsg, setBioMsg] = useState("");

  // Carrega preferências do servidor
  useEffect(() => {
    fetch("/api/user/push-preferences", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPrefs(p => ({ ...p, ...data })); })
      .catch(() => {});
  }, []);

  function togglePref(key: keyof Prefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    fetch("/api/user/push-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(next),
    }).catch(() => {});
  }

  // Sem await de bridge nativo no handler — zero freeze
  function toggleBiometric() {
    if (bioEnabled) {
      setBioEnabled(false);
      setBioMsg("Biometria desativada.");
      clearBiometricLocalSync();                  // síncrono, sem bridge
      clearBiometricCredentials().catch(() => {}); // fire-and-forget
    } else {
      setBioMsg("Para ativar, faça login novamente no app.");
    }
  }

  const isDark = theme === "dark";

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      {/* Notificações — só no nativo */}
      {isNative() && (
        <div className="rounded-xl border border-slate-100 bg-white/80 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notificações</p>
          {TOGGLES.map(t => (
            <button
              key={t.key}
              onClick={() => togglePref(t.key as keyof Prefs)}
              className="w-full flex items-center justify-between py-1"
            >
              <span className="text-sm text-slate-700">{t.label}</span>
              <Toggle on={prefs[t.key as keyof Prefs]} />
            </button>
          ))}
        </div>
      )}

      {/* Biometria — estado inicial via localStorage sync, tap é fire-and-forget */}
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
          {bioMsg ? <p className="text-xs text-slate-500 mt-1">{bioMsg}</p> : null}
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
