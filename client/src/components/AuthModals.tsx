import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { SiWhatsapp } from "react-icons/si";

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

const WHATSAPP_SUPPORT = "5592981128080";

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

  const handleLogin = async () => {
    if (!cpf || !password) return toast({ title: "Preencha CPF e senha", variant: "destructive" });
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cpf, password }),
      });
      const data = await res.json();
      if (!res.ok) return toast({ title: data.message || "Erro ao entrar", variant: "destructive" });
      login(data);
      toast({ title: `Bem-vindo, ${data.name}!` });
      onClose();
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setLoading(false);
    }
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
      toast({ title: "Cadastro realizado!", description: `Bem-vindo, ${data.name}!` });
      onClose();
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={mode === "login"} onOpenChange={open => !open && onClose()}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">Entrar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-zinc-300">CPF</Label>
              <Input
                placeholder="000.000.000-00"
                value={formatCPF(cpf)}
                onChange={e => setCpf(e.target.value)}
                className="bg-zinc-800 border-zinc-600 text-white"
                data-testid="input-login-cpf"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-300">Senha</Label>
              <Input
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                className="bg-zinc-800 border-zinc-600 text-white"
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
              <p className="text-sm text-zinc-400">
                Não tem conta?{" "}
                <button className="text-yellow-400 hover:underline font-semibold" onClick={() => onSwitch("register")}>
                  Cadastre-se
                </button>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "register"} onOpenChange={open => !open && onClose()}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">Criar Conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-zinc-300">CPF <span className="text-red-400">*</span></Label>
              <Input
                placeholder="000.000.000-00"
                value={formatCPF(regCpf)}
                onChange={e => setRegCpf(e.target.value)}
                className="bg-zinc-800 border-zinc-600 text-white"
                data-testid="input-register-cpf"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-300">Nome completo <span className="text-red-400">*</span></Label>
              <Input
                placeholder="Seu nome"
                value={regName}
                onChange={e => setRegName(e.target.value)}
                className="bg-zinc-800 border-zinc-600 text-white"
                data-testid="input-register-name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-300">Telefone (com DDD) <span className="text-red-400">*</span></Label>
              <Input
                placeholder="(92) 99999-9999"
                value={formatPhone(regPhone)}
                onChange={e => setRegPhone(e.target.value)}
                className="bg-zinc-800 border-zinc-600 text-white"
                data-testid="input-register-phone"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-300">Código de indicação <span className="text-zinc-500">(opcional)</span></Label>
              <Input
                placeholder="Código de quem te indicou"
                value={regReferral}
                onChange={e => setRegReferral(e.target.value)}
                className="bg-zinc-800 border-zinc-600 text-white"
                data-testid="input-register-referral"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-300">Senha <span className="text-red-400">*</span></Label>
              <Input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                className="bg-zinc-800 border-zinc-600 text-white"
                data-testid="input-register-password"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-300">Confirmar senha <span className="text-red-400">*</span></Label>
              <Input
                type="password"
                placeholder="Repita a senha"
                value={regPassword2}
                onChange={e => setRegPassword2(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleRegister()}
                className="bg-zinc-800 border-zinc-600 text-white"
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
            <p className="text-sm text-zinc-400 text-center">
              Já tem conta?{" "}
              <button className="text-yellow-400 hover:underline font-semibold" onClick={() => onSwitch("login")}>
                Entrar
              </button>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
