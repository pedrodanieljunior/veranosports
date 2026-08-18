import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Bell, Fingerprint, Sun, Moon } from "lucide-react";
import {
  isNative,
  isBiometricAvailable,
  isBiometricEnabled,
  saveBiometricCredentials,
  clearBiometricCredentials,
  authenticateWithBiometric,
} from "@/lib/platform";
import { useTheme } from "@/lib/theme";

interface Props { onBack: () => void; }

const NOTIF_TYPES = [
  { key: "live_game",         label: "Jogo ao vivo",        desc: "Quando um jogo com aposta sua começa" },
  { key: "bet_won",           label: "Aposta vencida",       desc: "Quando uma aposta é liquidada como ganha" },
  { key: "deposit_confirmed", label: "Depósito confirmado", desc: "Confirmação de depósito na conta" },
  { key: "admin",             label: "Promoções e avisos",  desc: "Comunicados e novidades da plataforma" },
];

const DEFAULT_PREFS: Record<string, boolean> = {
  live_game: true, bet_won: true, deposit_confirmed: true, admin: true,
};

export function ConfiguracoesView({ onBack }: Props) {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const [prefs, setPrefs] = useState<Record<string, boolean>>(DEFAULT_PREFS);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  useEffect(() => {
    fetch("/api/user/push-preferences", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPrefs({ ...DEFAULT_PREFS, ...data }); })
      .catch(() => {});

    // Chamadas nativas atrasadas — evita interferência no mount
    if (!isNative()) return;
    const t = setTimeout(() => {
      isBiometricAvailable().then(v => setBioAvailable(v)).catch(() => {});
      isBiometricEnabled().then(v => setBioEnabled(v)).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, []);

  function toggleNotif(key: string) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    fetch("/api/user/push-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(next),
    }).catch(() => {});
  }

  async function toggleBiometric() {
    if (bioLoading) return;
    setBioLoading(true);
    try {
      if (!bioEnabled) {
        const credentials = await authenticateWithBiometric();
        if (!credentials) {
          toast({ title: "Faça login com CPF e senha primeiro", variant: "destructive" });
          return;
        }
        await saveBiometricCredentials(credentials.cpf, credentials.password);
        setBioEnabled(true);
        toast({ title: "Login biométrico ativado!", duration: 2000 });
      } else {
        await clearBiometricCredentials();
        setBioEnabled(false);
        toast({ title: "Login biométrico desativado", duration: 2000 });
      }
    } catch {
      toast({ title: "Erro ao alterar biometria", variant: "destructive" });
    } finally {
      setBioLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Mesmo padrão do AccountView — button onClick, Tailwind */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      {isNative() && (
        <div className="rounded-xl border border-blue-100 bg-white/80 overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-blue-50">
            <Bell className="w-4 h-4 text-blue-600" />
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Notificações</p>
          </div>
          {NOTIF_TYPES.map((t, i) => (
            <button
              key={t.key}
              onClick={() => toggleNotif(t.key)}
              className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-blue-50"
              style={{ borderTop: i > 0 ? "1px solid #eff6ff" : undefined }}
            >
              <div className="min-w-0 mr-3">
                <p className="text-sm font-medium text-gray-800">{t.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
              </div>
              {/* Toggle visual — sem transition para evitar freeze no Android */}
              <div className="shrink-0" style={{
                width: 44, height: 24, borderRadius: 12,
                background: prefs[t.key] ? "#16a34a" : "#d1d5db",
                position: "relative",
              }}>
                <div style={{
                  position: "absolute", top: 4,
                  left: prefs[t.key] ? 24 : 4,
                  width: 16, height: 16,
                  background: "white", borderRadius: 8,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </div>
            </button>
          ))}
        </div>
      )}

      {isNative() && bioAvailable && (
        <div className="rounded-xl border border-blue-100 bg-white/80 overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-blue-50">
            <Fingerprint className="w-4 h-4 text-blue-600" />
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Biometria</p>
          </div>
          <button
            onClick={toggleBiometric}
            disabled={bioLoading}
            className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-blue-50 disabled:opacity-50"
          >
            <div className="min-w-0 mr-3">
              <p className="text-sm font-medium text-gray-800">Login com reconhecimento facial</p>
              <p className="text-xs text-gray-500 mt-0.5">{bioEnabled ? "Ativo — toque para desativar" : "Inativo — toque para ativar"}</p>
            </div>
            <div className="shrink-0" style={{
              width: 44, height: 24, borderRadius: 12,
              background: bioEnabled ? "#16a34a" : "#d1d5db",
              position: "relative",
            }}>
              <div style={{
                position: "absolute", top: 4,
                left: bioEnabled ? 24 : 4,
                width: 16, height: 16,
                background: "white", borderRadius: 8,
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </div>
          </button>
        </div>
      )}

      <div className="rounded-xl border border-blue-100 bg-white/80 overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-blue-50">
          {theme === "dark"
            ? <Moon className="w-4 h-4 text-blue-600" />
            : <Sun className="w-4 h-4 text-blue-600" />}
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Tema</p>
        </div>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-blue-50"
        >
          <div className="min-w-0 mr-3">
            <p className="text-sm font-medium text-gray-800">Modo escuro</p>
            <p className="text-xs text-gray-500 mt-0.5">{theme === "dark" ? "Ativo" : "Inativo"}</p>
          </div>
          <div className="shrink-0" style={{
            width: 44, height: 24, borderRadius: 12,
            background: theme === "dark" ? "#16a34a" : "#d1d5db",
            position: "relative",
          }}>
            <div style={{
              position: "absolute", top: 4,
              left: theme === "dark" ? 24 : 4,
              width: 16, height: 16,
              background: "white", borderRadius: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </div>
        </button>
      </div>
    </div>
  );
}
