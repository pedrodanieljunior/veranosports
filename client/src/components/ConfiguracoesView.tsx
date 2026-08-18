import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  { key: "live_game",         label: "Jogo ao vivo",         desc: "Quando um jogo com aposta sua começa" },
  { key: "bet_won",           label: "Aposta vencida",        desc: "Quando uma aposta é liquidada como ganha" },
  { key: "deposit_confirmed", label: "Depósito confirmado",  desc: "Confirmação de depósito na conta" },
  { key: "admin",             label: "Promoções e avisos",   desc: "Comunicados e novidades da plataforma" },
];

const DEFAULT_PREFS: Record<string, boolean> = {
  live_game: true, bet_won: true, deposit_confirmed: true, admin: true,
};

function ToggleKnob({ enabled, disabled }: { enabled: boolean; disabled?: boolean }) {
  return (
    <div
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: enabled ? "#16a34a" : "#d1d5db",
        position: "relative",
        flexShrink: 0,
        transition: "background 0.2s",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 4,
          left: enabled ? 24 : 4,
          width: 16,
          height: 16,
          background: "white",
          borderRadius: 8,
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s",
        }}
      />
    </div>
  );
}

// Linha inteira é clicável — resolve o problema de toque no Android WebView
function ToggleRow({ label, desc, enabled, onChange, disabled = false }: {
  label: string; desc: string; enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div
      onClick={() => { if (!disabled) onChange(!enabled); }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        gap: 12,
        cursor: disabled ? "default" : "pointer",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        WebkitUserSelect: "none",
      } as React.CSSProperties}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: "#1f2937", lineHeight: 1.2 }}>{label}</p>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2, lineHeight: 1.2 }}>{desc}</p>
      </div>
      <ToggleKnob enabled={enabled} disabled={disabled} />
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-600">{icon}</span>
        <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">{title}</h3>
      </div>
      <div className="rounded-xl border border-blue-100 bg-white overflow-hidden divide-y divide-blue-50">
        {children}
      </div>
    </div>
  );
}

export function ConfiguracoesView({ onBack }: Props) {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const [prefs, setPrefs] = useState<Record<string, boolean>>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  // Carrega preferências de notificação e estado da biometria
  useEffect(() => {
    if (isNative()) {
      isBiometricAvailable().then(setBioAvailable);
      isBiometricEnabled().then(setBioEnabled);
    }

    fetch("/api/user/push-preferences", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setPrefs({ ...DEFAULT_PREFS, ...data });
        setPrefsLoaded(true);
      })
      .catch(() => setPrefsLoaded(true));
  }, []);

  const handleNotifToggle = async (key: string, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSavingPrefs(true);
    try {
      await fetch("/api/user/push-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(next),
      });
    } catch {
      // silently ignore — state already updated locally
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleBiometricToggle = async (enable: boolean) => {
    setBioLoading(true);
    try {
      if (enable) {
        // Precisa autenticar com biometria e depois pedir credenciais
        const credentials = await authenticateWithBiometric();
        if (!credentials) {
          // Biometria cancelada ou não há credenciais salvas — pedir login com CPF/senha
          toast({
            title: "Faça login com CPF e senha primeiro",
            description: "Para ativar a biometria, saia e entre novamente com CPF e senha.",
            variant: "destructive",
          });
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
  };

  return (
    <div style={{ maxHeight: "70vh", overflowY: "auto", WebkitOverflowScrolling: "touch" as any }}>
      <div className="space-y-1 pr-1">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-1 text-gray-600"
          onClick={onBack}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Voltar
        </Button>

        {/* Notificações — só no app nativo */}
        {isNative() && (
          <Section icon={<Bell className="w-4 h-4" />} title="Notificações">
            {NOTIF_TYPES.map(t => (
              <ToggleRow
                key={t.key}
                label={t.label}
                desc={t.desc}
                enabled={prefsLoaded ? (prefs[t.key] ?? true) : true}
                onChange={v => handleNotifToggle(t.key, v)}
              />
            ))}
          </Section>
        )}

        {/* Biometria — só no app nativo e se disponível */}
        {isNative() && bioAvailable && (
          <Section icon={<Fingerprint className="w-4 h-4" />} title="Biometria">
            <ToggleRow
              label="Login com reconhecimento facial"
              desc={bioEnabled ? "Ativo — toque para desativar" : "Inativo — toque para ativar"}
              enabled={bioEnabled}
              onChange={handleBiometricToggle}
              disabled={bioLoading}
            />
          </Section>
        )}

        {/* Tema */}
        <Section icon={theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />} title="Tema">
          <ToggleRow
            label="Modo escuro"
            desc={theme === "dark" ? "Ativo" : "Inativo"}
            enabled={theme === "dark"}
            onChange={v => setTheme(v ? "dark" : "light")}
          />
        </Section>

        {savingPrefs && (
          <p className="text-xs text-center text-gray-400 pb-2">Salvando preferências...</p>
        )}
      </div>
    </div>
  );
}
