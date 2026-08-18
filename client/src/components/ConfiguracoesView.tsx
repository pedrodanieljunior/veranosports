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

// Toggle sem animação CSS — animação causa freeze no Android WebView após interação
function Knob({ on }: { on: boolean }) {
  return (
    <div style={{
      width: 44, height: 24, borderRadius: 12, flexShrink: 0,
      background: on ? "#16a34a" : "#d1d5db",
      position: "relative",
    }}>
      <div style={{
        position: "absolute", top: 4, left: on ? 24 : 4,
        width: 16, height: 16, background: "white",
        borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </div>
  );
}

function Row({ label, desc, on, onTap, disabled = false }: {
  label: string; desc: string; on: boolean; onTap: () => void; disabled?: boolean;
}) {
  return (
    <div
      onPointerDown={() => { if (!disabled) onTap(); }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", gap: 12,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none", WebkitUserSelect: "none",
        opacity: disabled ? 0.5 : 1,
      } as React.CSSProperties}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: "#1f2937", lineHeight: 1.2, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2, lineHeight: 1.2, margin: 0 }}>{desc}</p>
      </div>
      <Knob on={on} />
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color: "#2563eb" }}>{icon}</span>
        <h3 style={{ fontWeight: 700, color: "#1f2937", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{title}</h3>
      </div>
      <div style={{ borderRadius: 12, border: "1px solid #dbeafe", background: "white", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

export function ConfiguracoesView({ onBack }: Props) {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const [prefs, setPrefs] = useState<Record<string, boolean>>(DEFAULT_PREFS);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);

  useEffect(() => {
    // Carregar preferências (HTTP, não nativo — seguro rodar imediatamente)
    fetch("/api/user/push-preferences", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPrefs({ ...DEFAULT_PREFS, ...data }); })
      .catch(() => {});

    // Chamadas ao bridge nativo atrasadas 600ms — garante que a tela já está
    // totalmente renderizada e interativa antes de tocar no Capacitor bridge,
    // evitando o freeze que ocorre quando chamadas nativas rodam no mount.
    if (!isNative()) return;
    const t = setTimeout(() => {
      isBiometricAvailable().then(v => setBioAvailable(v)).catch(() => {});
      isBiometricEnabled().then(v => setBioEnabled(v)).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, []);

  // Fire-and-forget — sem async/await no handler, sem setSaving re-renders
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
    <div style={{ maxHeight: "70vh", overflowY: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
      <button
        onPointerDown={onBack}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          color: "#4b5563", fontSize: 14, background: "none", border: "none",
          padding: "8px 0", marginBottom: 12, cursor: "pointer",
          touchAction: "manipulation",
        }}
      >
        <ChevronLeft style={{ width: 16, height: 16 }} />
        Voltar
      </button>

      {isNative() && (
        <Section icon={<Bell style={{ width: 16, height: 16 }} />} title="Notificações">
          {NOTIF_TYPES.map((t, i) => (
            <div key={t.key}>
              {i > 0 && <div style={{ height: 1, background: "#eff6ff", margin: "0 16px" }} />}
              <Row
                label={t.label}
                desc={t.desc}
                on={prefs[t.key] ?? true}
                onTap={() => toggleNotif(t.key)}
              />
            </div>
          ))}
        </Section>
      )}

      {isNative() && bioAvailable && (
        <Section icon={<Fingerprint style={{ width: 16, height: 16 }} />} title="Biometria">
          <Row
            label="Login com reconhecimento facial"
            desc={bioEnabled ? "Ativo — toque para desativar" : "Inativo — toque para ativar"}
            on={bioEnabled}
            onTap={toggleBiometric}
            disabled={bioLoading}
          />
        </Section>
      )}

      <Section icon={theme === "dark"
        ? <Moon style={{ width: 16, height: 16 }} />
        : <Sun style={{ width: 16, height: 16 }} />
      } title="Tema">
        <Row
          label="Modo escuro"
          desc={theme === "dark" ? "Ativo" : "Inativo"}
          on={theme === "dark"}
          onTap={() => setTheme(theme === "dark" ? "light" : "dark")}
        />
      </Section>
    </div>
  );
}
