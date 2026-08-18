import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { SiWhatsapp } from "react-icons/si";
import {
  isNative,
  isBiometricEnabledSync,
  isBiometricAvailableSync,
  saveBiometricCredentials,
  authenticateWithBiometric,
} from "@/lib/platform";

interface Props {
  mode: "login" | "register" | null;
  onClose: () => void;
  onSwitch: (mode: "login" | "register") => void;
}

function formatCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const WHATSAPP_SUPPORT = "5592981420808";

export function AuthModals({ mode, onClose, onSwitch }: Props) {
  const { login } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");

  const [regCpf, setRegCpf] = useState("");
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regReferral, setRegReferral] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");

  // Estado da biometria
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [showBiometricOffer, setShowBiometricOffer] = useState(false);
  const [pendingBiometricCredentials, setPendingBiometricCredentials] = useState<{ cpf: string; password: string } | null>(null);

  // Leitura síncrona — sem bridge nativo, sem freeze
  useEffect(() => {
    if (mode === "login" && isNative()) {
      setBiometricEnabled(isBiometricEnabledSync());
    }
  }, [mode]);

  const doLogin = async (cpfRaw: string, pwd: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ cpf: cpfRaw.replace(/\D/g, ""), password: pwd }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Erro ao entrar");
    return data;
  };

  const handleLogin = async () => {
    if (!cpf || !password) return toast({ title: "Preencha CPF e senha", variant: "destructive" });
    setLoading(true);
    try {
      const data = await doLogin(cpf, password);
      login(data);
      toast({ title: `Bem-vindo, ${data.name}!`, duration: 2000, variant: "welcome" } as any);

      // Oferece biometria se não ativada (sem check nativo — evita freeze/crash)
      if (isNative() && !biometricEnabled) {
        setPendingBiometricCredentials({ cpf: cpf.replace(/\D/g, ""), password });
        setShowBiometricOffer(true);
        return; // não fecha o modal — aguarda resposta do offer
      }

      onClose();
    } catch (err: any) {
      toast({ title: err.message || "Erro de conexão", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setLoading(true);
    try {
      const credentials = await authenticateWithBiometric();
      if (!credentials) {
        toast({ title: "Biometria cancelada", variant: "destructive" });
        return;
      }
      const data = await doLogin(credentials.cpf, credentials.password);
      login(data);
      toast({ title: `Bem-vindo, ${data.name}!`, duration: 2000, variant: "welcome" } as any);
      onClose();
    } catch (err: any) {
      toast({ title: err.message || "Erro ao entrar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptBiometric = async () => {
    if (pendingBiometricCredentials) {
      await saveBiometricCredentials(pendingBiometricCredentials.cpf, pendingBiometricCredentials.password);
      toast({ title: "Login biométrico ativado!", description: "Na próxima vez, use o reconhecimento facial para entrar.", duration: 3000 });
    }
    setShowBiometricOffer(false);
    setPendingBiometricCredentials(null);
    onClose();
  };

  const handleDeclineBiometric = () => {
    setShowBiometricOffer(false);
    setPendingBiometricCredentials(null);
    onClose();
  };

  const handleRegister = async () => {
    if (!regCpf || !regName || !regPhone || !regPassword) return toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
    if (regPassword !== regPassword2) return toast({ title: "As senhas não coincidem", variant: "destructive" });
    if (regPassword.length < 6) return toast({ title: "Senha mínima de 6 caracteres", variant: "destructive" });
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          cpf: regCpf.replace(/\D/g, ""),
          name: regName,
          phone: regPhone.replace(/\D/g, ""),
          referralCode: regReferral || undefined,
          password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) return toast({ title: data.message || "Erro ao cadastrar", variant: "destructive" });
      login(data);
      toast({ title: "Cadastro realizado!", description: `Bem-vindo, ${data.name}!`, variant: "welcome" } as any);
      onClose();
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Dialog de oferta de biometria — só monta quando necessário, evita overlay fantasma no Android */}
      {showBiometricOffer && (
        <AlertDialog open={true} onOpenChange={() => {}}>
          <AlertDialogContent style={{ background: "linear-gradient(to bottom, #f8fbff, #dbeafe)", borderColor: "rgba(147,197,253,0.5)" }}>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-gray-900 text-center">Ativar login biométrico?</AlertDialogTitle>
              <AlertDialogDescription className="text-center text-gray-600">
                Nas próximas vezes, entre com reconhecimento facial ou digital — sem precisar digitar CPF e senha.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
              <AlertDialogAction
                onClick={handleAcceptBiometric}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold"
              >
                Ativar
              </AlertDialogAction>
              <AlertDialogCancel
                onClick={handleDeclineBiometric}
                className="w-full"
              >
                Agora não
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Modal de login — só monta quando aberto, evita overlay fantasma no Android */}
      {mode === "login" && (
      <Dialog open={true} modal={false} onOpenChange={open => !open && onClose()}>
        <DialogContent className="max-w-sm" style={{ background: "linear-gradient(to bottom, #f8fbff, #dbeafe)", borderColor: "rgba(147,197,253,0.5)", color: "#111827" }}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center text-gray-900">Entrar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">

            {/* Botão de biometria (só aparece se já foi ativado) */}
            {biometricEnabled && (
              <Button
                className="w-full font-bold text-white flex items-center justify-center gap-2"
                style={{ background: "#1565C0" }}
                onClick={handleBiometricLogin}
                disabled={loading}
              >
                <span style={{ fontSize: 20 }}>🔒</span>
                {loading ? "Entrando..." : "Entrar sem digitar senha"}
              </Button>
            )}

            {biometricEnabled && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-blue-200" />
                <span className="text-xs text-gray-400">ou</span>
                <div className="flex-1 h-px bg-blue-200" />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-gray-700">CPF</Label>
              <Input
                placeholder="000.000.000-00"
                value={formatCPF(cpf)}
                onChange={e => setCpf(e.target.value)}
                className="bg-white border-blue-200 text-gray-900"
                data-testid="input-login-cpf"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-700">Senha</Label>
              <Input
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                className="bg-white border-blue-200 text-gray-900"
                data-testid="input-login-password"
              />
            </div>
            <Button
              className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold"
              onClick={handleLogin}
              disabled={loading}
              data-testid="button-login-submit"
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <div className="text-center space-y-2">
              <a
                href={`https://wa.me/${WHATSAPP_SUPPORT}?text=${encodeURIComponent("Olá, esqueci minha senha e preciso de ajuda.")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm text-green-400 hover:text-green-300"
                data-testid="link-forgot-password"
              >
                <SiWhatsapp className="w-4 h-4" />
                Esqueci minha senha
              </a>
              <p className="text-sm text-gray-500">
                Não tem conta?{" "}
                <button className="text-yellow-600 hover:underline font-semibold" onClick={() => onSwitch("register")}>
                  Cadastre-se
                </button>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Modal de cadastro — só monta quando aberto, evita overlay fantasma no Android */}
      {mode === "register" && (
      <Dialog open={true} modal={false} onOpenChange={open => !open && onClose()}>
        <DialogContent className="max-w-sm" style={{ background: "linear-gradient(to bottom, #f8fbff, #dbeafe)", borderColor: "rgba(147,197,253,0.5)", color: "#111827" }}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center text-gray-900">Criar Conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-gray-700">CPF <span className="text-red-500">*</span></Label>
              <Input
                placeholder="000.000.000-00"
                value={formatCPF(regCpf)}
                onChange={e => setRegCpf(e.target.value)}
                className="bg-white border-blue-200 text-gray-900"
                data-testid="input-register-cpf"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-700">Nome <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Seu nome"
                value={regName}
                onChange={e => setRegName(e.target.value)}
                className="bg-white border-blue-200 text-gray-900"
                data-testid="input-register-name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-700">Telefone (com DDD) <span className="text-red-500">*</span></Label>
              <Input
                placeholder="(92) 99999-9999"
                value={formatPhone(regPhone)}
                onChange={e => setRegPhone(e.target.value)}
                className="bg-white border-blue-200 text-gray-900"
                data-testid="input-register-phone"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-700">Código de indicação <span className="text-gray-400">(opcional)</span></Label>
              <Input
                placeholder="Código de quem te indicou"
                value={regReferral}
                onChange={e => setRegReferral(e.target.value)}
                className="bg-white border-blue-200 text-gray-900"
                data-testid="input-register-referral"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-700">Senha <span className="text-red-500">*</span></Label>
              <Input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                className="bg-white border-blue-200 text-gray-900"
                data-testid="input-register-password"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-700">Confirmar senha <span className="text-red-500">*</span></Label>
              <Input
                type="password"
                placeholder="Repita a senha"
                value={regPassword2}
                onChange={e => setRegPassword2(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleRegister()}
                className="bg-white border-blue-200 text-gray-900"
                data-testid="input-register-password2"
              />
            </div>
            <Button
              className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold"
              onClick={handleRegister}
              disabled={loading}
              data-testid="button-register-submit"
            >
              {loading ? "Cadastrando..." : "Criar conta"}
            </Button>
            <p className="text-sm text-gray-500 text-center">
              Já tem conta?{" "}
              <button className="text-yellow-600 hover:underline font-semibold" onClick={() => onSwitch("login")}>
                Entrar
              </button>
            </p>
          </div>
        </DialogContent>
      </Dialog>
      )}
    </>
  );
}
