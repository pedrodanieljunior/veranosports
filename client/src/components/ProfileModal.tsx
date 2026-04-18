import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Deposit, UserWithdrawal } from "@shared/schema";
import { SiWhatsapp, SiPix } from "react-icons/si";
import { User, Wallet, CreditCard, LogOut, ChevronLeft, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const WHATSAPP_SUPPORT = "5592981128080";
const PIX_KEY = "22580407000178";
const PIX_NAME = "FW Sports";

type View = "menu" | "deposit" | "withdraw" | "account";

interface Props {
  open: boolean;
  onClose: () => void;
}

function DepositView({ onBack }: { onBack: () => void }) {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "pix">("form");
  const [pendingDeposit, setPendingDeposit] = useState<Deposit | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: deposits } = useQuery<Deposit[]>({
    queryKey: ["/api/deposits/mine"],
    queryFn: async () => {
      const res = await fetch("/api/deposits/mine", { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (amt: number) => {
      const res = await fetch("/api/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: amt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      return data as Deposit;
    },
    onSuccess: (deposit) => {
      setPendingDeposit(deposit);
      setStep("pix");
      queryClient.invalidateQueries({ queryKey: ["/api/deposits/mine"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const parsedAmount = parseFloat(amount.replace(",", "."));
  const isFirstDeposit = !user?.firstDepositDone;
  const bonus = isFirstDeposit && parsedAmount >= 10 ? Math.round(parsedAmount * 0.1 * 100) / 100 : 0;

  const copyPix = () => {
    navigator.clipboard.writeText(PIX_KEY);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendWhatsApp = () => {
    const msg = `Olá! Realizei um depósito PIX de R$${parsedAmount.toFixed(2)} na FW Sports. Código do depósito: #${pendingDeposit?.id}. Segue o comprovante em anexo.`;
    window.open(`https://wa.me/${WHATSAPP_SUPPORT}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const statusColor = (s: string) => s === "confirmed" ? "text-green-400" : s === "rejected" ? "text-red-400" : "text-yellow-400";
  const statusIcon = (s: string) => s === "confirmed" ? <CheckCircle2 className="w-4 h-4" /> : s === "rejected" ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />;
  const statusLabel = (s: string) => s === "confirmed" ? "Confirmado" : s === "rejected" ? "Rejeitado" : "Aguardando";

  if (step === "pix" && pendingDeposit) {
    return (
      <div className="space-y-4">
        <button onClick={() => setStep("form")} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="bg-zinc-800 rounded-xl p-4 space-y-3 border border-zinc-700">
          <h3 className="font-bold text-center text-white">Faça o PIX</h3>
          <div className="space-y-1">
            <p className="text-xs text-zinc-400">Valor a pagar</p>
            <p className="text-2xl font-bold text-yellow-400">R$ {pendingDeposit.amount.toFixed(2).replace(".", ",")}</p>
            {pendingDeposit.bonusAmount > 0 && (
              <p className="text-sm text-green-400 font-semibold">+ R$ {pendingDeposit.bonusAmount.toFixed(2).replace(".", ",")} de bônus (1º depósito)</p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs text-zinc-400">Chave PIX (CNPJ)</p>
            <div className="flex gap-2">
              <Input readOnly value={PIX_KEY} className="bg-zinc-900 border-zinc-600 text-white font-mono text-sm" />
              <Button variant="outline" onClick={copyPix} className="border-zinc-600 text-white hover:bg-zinc-700 shrink-0">
                {copied ? "Copiado!" : "Copiar"}
              </Button>
            </div>
            <p className="text-xs text-zinc-500">Beneficiário: {PIX_NAME}</p>
          </div>
        </div>
        <Button
          className="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold"
          onClick={sendWhatsApp}
        >
          <SiWhatsapp className="w-5 h-5 mr-2" />
          Enviar comprovante via WhatsApp
        </Button>
        <p className="text-xs text-zinc-400 text-center">Após enviar o comprovante, seu saldo será atualizado em até 10 minutos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>
      <div className="space-y-3">
        <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
          <p className="text-sm text-zinc-400 mb-1">Saldo atual</p>
          <p className="text-2xl font-bold text-yellow-400">R$ {(user?.balance ?? 0).toFixed(2).replace(".", ",")}</p>
        </div>
        {isFirstDeposit && (
          <div className="bg-green-900/40 border border-green-700 rounded-xl p-3">
            <p className="text-sm text-green-300 font-semibold">🎁 1º depósito ganha +10% de bônus!</p>
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-zinc-300">Valor do depósito (R$)</Label>
          <Input
            placeholder="Ex: 100,00"
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9,]/g, ""))}
            className="bg-zinc-800 border-zinc-600 text-white"
            data-testid="input-deposit-amount"
          />
          {bonus > 0 && (
            <p className="text-sm text-green-400">Você receberá +R$ {bonus.toFixed(2).replace(".", ",")} de bônus</p>
          )}
        </div>
        <Button
          className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold"
          onClick={() => createMutation.mutate(parsedAmount)}
          disabled={!parsedAmount || parsedAmount < 10 || createMutation.isPending}
          data-testid="button-deposit-continue"
        >
          {createMutation.isPending ? "Aguarde..." : "Continuar"}
        </Button>
        <p className="text-xs text-zinc-500 text-center">Valor mínimo: R$ 10,00</p>
      </div>

      {deposits && deposits.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-400">Histórico de depósitos</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {deposits.map(d => (
              <div key={d.id} className="bg-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">R$ {d.amount.toFixed(2).replace(".", ",")}</p>
                  {d.bonusAmount > 0 && <p className="text-xs text-green-400">+R$ {d.bonusAmount.toFixed(2).replace(".", ",")} bônus</p>}
                  <p className="text-xs text-zinc-500">{format(new Date(d.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                </div>
                <div className={`flex items-center gap-1 text-xs font-semibold ${statusColor(d.status)}`}>
                  {statusIcon(d.status)}
                  {statusLabel(d.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WithdrawView({ onBack }: { onBack: () => void }) {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [pixKey, setPixKey] = useState("");

  const { data: withdrawals = [] } = useQuery<UserWithdrawal[]>({
    queryKey: ["/api/withdrawals/mine"],
    queryFn: async () => {
      const res = await fetch("/api/withdrawals/mine", { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
  });

  const requestMutation = useMutation({
    mutationFn: async ({ amount, pixKey }: { amount: number; pixKey: string }) => {
      const res = await fetch("/api/withdrawals/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount, pixKey }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erro ao solicitar saque");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Solicitação enviada!", description: "Seu saque está em análise e será processado em breve." });
      setAmount("");
      setPixKey("");
      queryClient.invalidateQueries({ queryKey: ["/api/withdrawals/mine"] });
      refreshUser();
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const parsedAmount = parseFloat(amount.replace(",", "."));

  const wdStatusColor = (s: string) => s === "paid" ? "text-blue-400" : s === "approved" ? "text-green-400" : s === "rejected" ? "text-red-400" : "text-yellow-400";
  const wdStatusLabel = (s: string) => s === "paid" ? "Pago" : s === "approved" ? "Aprovado" : s === "rejected" ? "Rejeitado" : "Pendente";
  const wdStatusIcon = (s: string) => s === "paid" ? <CheckCircle2 className="w-3.5 h-3.5" /> : s === "approved" ? <CheckCircle2 className="w-3.5 h-3.5" /> : s === "rejected" ? <XCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
        <p className="text-sm text-zinc-400 mb-1">Saldo disponível</p>
        <p className="text-2xl font-bold text-yellow-400">R$ {(user?.balance ?? 0).toFixed(2).replace(".", ",")}</p>
      </div>

      <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700 space-y-3">
        <p className="text-sm font-semibold text-white">Solicitar Saque</p>
        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">Valor (mín. R$ 20,00)</Label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="bg-zinc-900 border-zinc-600 text-white"
            data-testid="input-withdraw-amount"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">Chave PIX (CPF, e-mail, telefone ou chave aleatória)</Label>
          <Input
            type="text"
            placeholder="Sua chave PIX"
            value={pixKey}
            onChange={e => setPixKey(e.target.value)}
            className="bg-zinc-900 border-zinc-600 text-white"
            data-testid="input-withdraw-pix-key"
          />
        </div>
        <Button
          className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold"
          onClick={() => requestMutation.mutate({ amount: parsedAmount, pixKey })}
          disabled={!parsedAmount || parsedAmount < 20 || !pixKey || requestMutation.isPending || (user?.balance ?? 0) < parsedAmount}
          data-testid="button-withdraw-submit"
        >
          {requestMutation.isPending ? "Enviando..." : "Solicitar Saque"}
        </Button>
        <p className="text-xs text-zinc-500 text-center">O saque será processado em até 24 horas úteis</p>
      </div>

      {withdrawals.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-400">Histórico de saques</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {withdrawals.map(w => (
              <div key={w.id} className="bg-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">R$ {w.amount.toFixed(2).replace(".", ",")}</p>
                  <p className="text-xs text-zinc-500">{w.pixKey}</p>
                  <p className="text-xs text-zinc-500">{format(new Date(w.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                </div>
                <div className={`flex items-center gap-1 text-xs font-semibold ${wdStatusColor(w.status)}`}>
                  {wdStatusIcon(w.status)}
                  {wdStatusLabel(w.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountView({ onBack }: { onBack: () => void }) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) return toast({ title: "Preencha todos os campos", variant: "destructive" });
    if (newPassword !== confirmPassword) return toast({ title: "Senhas não coincidem", variant: "destructive" });
    if (newPassword.length < 6) return toast({ title: "Senha mínima de 6 caracteres", variant: "destructive" });
    setLoading(true);
    try {
      const loginRes = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ cpf: user?.cpf, password: oldPassword }),
      });
      if (!loginRes.ok) return toast({ title: "Senha atual incorreta", variant: "destructive" });
      const resetRes = await fetch(`/api/admin/users/${user?.cpf}/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ newPassword }),
      });
      if (!resetRes.ok) return toast({ title: "Erro ao alterar senha", variant: "destructive" });
      toast({ title: "Senha alterada com sucesso!" });
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>
      <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700 space-y-2">
        <p className="text-xs text-zinc-400">Nome</p>
        <p className="font-semibold">{user?.name}</p>
        <p className="text-xs text-zinc-400 mt-2">CPF</p>
        <p className="font-semibold font-mono">{user?.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</p>
        <p className="text-xs text-zinc-400 mt-2">Telefone</p>
        <p className="font-semibold">{user?.phone}</p>
      </div>
      <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700 space-y-3">
        <p className="text-sm font-semibold">Alterar senha</p>
        <Input type="password" placeholder="Senha atual" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="bg-zinc-900 border-zinc-600 text-white" />
        <Input type="password" placeholder="Nova senha" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="bg-zinc-900 border-zinc-600 text-white" />
        <Input type="password" placeholder="Confirmar nova senha" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="bg-zinc-900 border-zinc-600 text-white" />
        <Button className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold" onClick={handleChangePassword} disabled={loading}>
          {loading ? "Salvando..." : "Alterar senha"}
        </Button>
      </div>
      <Button variant="outline" className="w-full border-red-600 text-red-400 hover:bg-red-900/20" onClick={logout} data-testid="button-logout">
        <LogOut className="w-4 h-4 mr-2" />
        Sair da conta
      </Button>
    </div>
  );
}

export function ProfileModal({ open, onClose }: Props) {
  const { user, logout } = useAuth();
  const [view, setView] = useState<View>("menu");

  if (!user) return null;

  const menuItems = [
    { id: "deposit" as View, icon: <CreditCard className="w-5 h-5" />, label: "Depositar", desc: "Adicionar saldo via PIX" },
    { id: "withdraw" as View, icon: <Wallet className="w-5 h-5" />, label: "Sacar", desc: "Solicitar retirada" },
    { id: "account" as View, icon: <User className="w-5 h-5" />, label: "Minha Conta", desc: "Dados e senha" },
  ];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setView("menu"); onClose(); } }}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {view === "menu" && "Perfil"}
            {view === "deposit" && "Depositar"}
            {view === "withdraw" && "Sacar"}
            {view === "account" && "Minha Conta"}
          </DialogTitle>
        </DialogHeader>

        {view === "menu" && (
          <div className="space-y-4">
            <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
              <p className="text-sm text-zinc-400">Olá, <span className="text-white font-semibold">{user.name.split(" ")[0]}</span></p>
              <p className="text-xs text-zinc-500 mt-0.5">{user.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</p>
              <div className="mt-3 pt-3 border-t border-zinc-700">
                <p className="text-xs text-zinc-400">Saldo disponível</p>
                <p className="text-2xl font-bold text-yellow-400">R$ {user.balance.toFixed(2).replace(".", ",")}</p>
              </div>
            </div>
            <div className="space-y-2">
              {menuItems.map(item => (
                <button
                  key={item.id}
                  className="w-full flex items-center gap-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-4 py-3 text-left transition-colors"
                  onClick={() => setView(item.id)}
                  data-testid={`button-profile-${item.id}`}
                >
                  <span className="text-yellow-400">{item.icon}</span>
                  <div>
                    <p className="font-semibold text-sm">{item.label}</p>
                    <p className="text-xs text-zinc-400">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <Button variant="outline" className="w-full border-red-600 text-red-400 hover:bg-red-900/20" onClick={() => { logout(); onClose(); }} data-testid="button-profile-logout">
              <LogOut className="w-4 h-4 mr-2" />
              Sair da conta
            </Button>
          </div>
        )}

        {view === "deposit" && <DepositView onBack={() => setView("menu")} />}
        {view === "withdraw" && <WithdrawView onBack={() => setView("menu")} />}
        {view === "account" && <AccountView onBack={() => setView("menu")} />}
      </DialogContent>
    </Dialog>
  );
}
