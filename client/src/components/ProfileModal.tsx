import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Deposit, UserWithdrawal, Transaction } from "@shared/schema";
import { SiWhatsapp, SiPix } from "react-icons/si";
import { User, Wallet, CreditCard, LogOut, ChevronLeft, AlertCircle, CheckCircle2, Clock, XCircle, ArrowUpCircle, ArrowDownCircle, History, TrendingUp, Copy, Share2, Gift } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const WHATSAPP_SUPPORT = "5592981128080";
const PIX_KEY = "22580407000178";
const PIX_NAME = "FW Sports";
const PIX_CITY = "Manaus";

function emv(id: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return ((crc & 0xffff).toString(16).toUpperCase()).padStart(4, "0");
}

function buildPixCode(amount?: number): string {
  const gui = emv("00", "br.gov.bcb.pix");
  const key = emv("01", PIX_KEY);
  const merchant = emv("26", gui + key);
  const mcc = emv("52", "0000");
  const currency = emv("53", "986");
  const amountField = amount ? emv("54", amount.toFixed(2)) : "";
  const country = emv("58", "BR");
  const name = emv("59", PIX_NAME.substring(0, 25));
  const city = emv("60", PIX_CITY);
  const ref = emv("62", emv("05", "***"));
  const payload = "000201" + merchant + mcc + currency + amountField + country + name + city + ref + "6304";
  return payload + crc16(payload);
}

type View = "menu" | "deposit" | "withdraw" | "account" | "history" | "invite";

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

  const pixCode = step === "pix" && pendingDeposit ? buildPixCode(pendingDeposit.amount) : "";

  const copyPix = () => {
    navigator.clipboard.writeText(pixCode || PIX_KEY);
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
          <div className="space-y-2">
            <p className="text-xs text-zinc-400 font-medium">PIX Copia e Cola</p>
            <div className="bg-zinc-900 border border-zinc-600 rounded-lg p-3 font-mono text-[11px] text-zinc-300 break-all leading-relaxed select-all">
              {pixCode}
            </div>
            <Button
              onClick={copyPix}
              className={`w-full font-bold transition-colors ${copied ? "bg-green-600 hover:bg-green-600 text-white" : "bg-yellow-500 hover:bg-yellow-400 text-black"}`}
              data-testid="button-copy-pix"
            >
              <SiPix className="w-4 h-4 mr-2" />
              {copied ? "✓ Código copiado!" : "Copiar código PIX"}
            </Button>
            <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1">
              <span>Chave: {PIX_KEY}</span>
              <span>Beneficiário: {PIX_NAME}</span>
            </div>
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
          <p className="text-sm text-zinc-400 mb-1">Saldo real</p>
          <p className="text-2xl font-bold text-yellow-400">R$ {(user?.balance ?? 0).toFixed(2).replace(".", ",")}</p>
          {(user?.bonusBalance ?? 0) > 0 && (
            <p className="text-sm text-green-400 mt-1 font-semibold">🎁 Bônus: R$ {(user?.bonusBalance ?? 0).toFixed(2).replace(".", ",")}</p>
          )}
        </div>
        {isFirstDeposit && (
          <div className="bg-green-900/40 border border-green-700 rounded-xl p-3">
            <p className="text-sm text-green-300 font-semibold">🎁 1º depósito ganha +10% de bônus!</p>
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-zinc-300">Valor do depósito (R$) — mín. R$10 / máx. R$5.000</Label>
          <Input
            placeholder="Ex: 100,00"
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9,]/g, ""))}
            className="bg-zinc-800 border-zinc-600 text-white"
            data-testid="input-deposit-amount"
          />
          {parsedAmount > 5000 && (
            <p className="text-sm text-red-400">Valor máximo por depósito é R$5.000,00</p>
          )}
          {bonus > 0 && parsedAmount <= 5000 && (
            <p className="text-sm text-green-400">Você receberá +R$ {bonus.toFixed(2).replace(".", ",")} de bônus</p>
          )}
        </div>
        <Button
          className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold"
          onClick={() => createMutation.mutate(parsedAmount)}
          disabled={!parsedAmount || parsedAmount < 10 || parsedAmount > 5000 || createMutation.isPending}
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
  const [useCpfAsKey, setUseCpfAsKey] = useState(false);

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
      setUseCpfAsKey(false);
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
        <p className="text-sm text-zinc-400 mb-1">Saldo disponível para saque</p>
        <p className="text-2xl font-bold text-yellow-400">R$ {(user?.balance ?? 0).toFixed(2).replace(".", ",")}</p>
        {(user?.bonusBalance ?? 0) > 0 && (
          <p className="text-xs text-zinc-500 mt-1">🎁 Bônus R$ {(user?.bonusBalance ?? 0).toFixed(2).replace(".", ",")} — não disponível para saque</p>
        )}
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
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={useCpfAsKey}
              onChange={e => {
                setUseCpfAsKey(e.target.checked);
                if (e.target.checked) setPixKey(user?.cpf ?? "");
                else setPixKey("");
              }}
              className="w-4 h-4 accent-yellow-400"
              data-testid="checkbox-pix-same-cpf"
            />
            <span className="text-xs text-zinc-400">O mesmo do CPF de cadastro</span>
          </label>
          <Input
            type="text"
            placeholder="Sua chave PIX"
            value={pixKey}
            onChange={e => { if (!useCpfAsKey) setPixKey(e.target.value); }}
            readOnly={useCpfAsKey}
            className={`bg-zinc-900 border-zinc-600 text-white ${useCpfAsKey ? "opacity-60 cursor-not-allowed" : ""}`}
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

function HistoryView({ onBack }: { onBack: () => void }) {
  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions/mine"],
    queryFn: async () => {
      const res = await fetch("/api/transactions/mine", { credentials: "include" });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
  });

  const typeIcon = (type: string) => {
    if (type === "deposit") return <ArrowDownCircle className="w-4 h-4 text-green-400" />;
    if (type === "win") return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (type === "withdrawal_refund") return <ArrowDownCircle className="w-4 h-4 text-blue-400" />;
    return <ArrowUpCircle className="w-4 h-4 text-red-400" />;
  };

  const typeLabel = (type: string) => {
    if (type === "deposit") return "Depósito";
    if (type === "bet") return "Aposta";
    if (type === "win") return "Ganho";
    if (type === "withdrawal") return "Saque";
    if (type === "withdrawal_refund") return "Reembolso";
    return type;
  };

  const amountColor = (amount: number) => amount >= 0 ? "text-green-400" : "text-red-400";

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white" data-testid="button-history-back">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-zinc-800 rounded-lg px-3 py-3 h-16 animate-pulse" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-zinc-800 rounded-xl p-6 border border-zinc-700 text-center">
          <History className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">Nenhuma transação encontrada</p>
          <p className="text-zinc-500 text-xs mt-1">Suas movimentações de saldo aparecerão aqui</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {transactions.map(t => (
            <div key={t.id} className="bg-zinc-800 rounded-lg px-3 py-2.5 flex items-center justify-between" data-testid={`row-transaction-${t.id}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="shrink-0">{typeIcon(t.type)}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{typeLabel(t.type)}</p>
                  <p className="text-xs text-zinc-400 truncate max-w-[160px]">{t.description}</p>
                  <p className="text-xs text-zinc-500">{format(new Date(t.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className={`text-sm font-bold ${amountColor(t.amount)}`}>
                  {t.amount >= 0 ? "+" : ""}R$ {Math.abs(t.amount).toFixed(2).replace(".", ",")}
                </p>
                <p className="text-xs text-zinc-500">Saldo: R$ {t.balanceAfter.toFixed(2).replace(".", ",")}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InviteView({ onBack }: { onBack: () => void }) {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState(user?.referralCode ?? "");
  const [copied, setCopied] = useState(false);

  // Sync with current user's code whenever the user changes
  useEffect(() => {
    setCode(user?.referralCode ?? "");
  }, [user?.cpf, user?.referralCode]);

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://fwsports.com";
  const inviteLink = `${siteUrl}?ref=${code}`;

  const saveMutation = useMutation({
    mutationFn: async (referralCode: string) => {
      const res = await fetch("/api/auth/referral-code", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ referralCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro ao salvar");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Código salvo!" });
      refreshUser();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsApp = () => {
    const msg = encodeURIComponent(`🏆 Aposte comigo na FW Sports! Use meu código *${code}* e comece a ganhar: ${inviteLink}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const hasCode = !!(user?.referralCode);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700 space-y-1">
        <p className="text-sm font-semibold text-white flex items-center gap-2"><Gift className="w-4 h-4 text-yellow-400" /> Como funciona</p>
        <p className="text-xs text-zinc-400">Cadastre um código único, compartilhe com amigos e eles usam ao se registrar. Futuros benefícios serão vinculados ao seu código.</p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-zinc-400">Seu código de convite (3–12 letras/números)</Label>
        <div className="flex gap-2">
          <Input
            placeholder="EX: PEDRO10"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
            className="bg-zinc-900 border-zinc-600 text-white font-mono tracking-widest uppercase"
            data-testid="input-referral-code"
          />
          <Button
            onClick={() => saveMutation.mutate(code)}
            disabled={!code || code.length < 3 || saveMutation.isPending}
            className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold shrink-0"
            data-testid="button-save-referral-code"
          >
            {saveMutation.isPending ? "..." : "Salvar"}
          </Button>
        </div>
      </div>

      {hasCode && (
        <div className="space-y-3">
          <div className="bg-zinc-800 rounded-xl p-3 border border-zinc-700">
            <p className="text-xs text-zinc-400 mb-1">Link de convite</p>
            <p className="text-xs font-mono text-yellow-300 break-all">{inviteLink}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-700"
              onClick={copyLink}
              data-testid="button-copy-invite-link"
            >
              <Copy className="w-4 h-4 mr-2" />
              {copied ? "Copiado!" : "Copiar link"}
            </Button>
            <Button
              className="flex-1 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold"
              onClick={shareWhatsApp}
              data-testid="button-share-invite-whatsapp"
            >
              <SiWhatsapp className="w-4 h-4 mr-2" />
              Compartilhar
            </Button>
          </div>
        </div>
      )}
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
    { id: "history" as View, icon: <History className="w-5 h-5" />, label: "Extrato", desc: "Histórico de movimentações" },
    { id: "account" as View, icon: <User className="w-5 h-5" />, label: "Minha Conta", desc: "Dados e senha" },
    { id: "invite" as View, icon: <Gift className="w-5 h-5" />, label: "Convite", desc: "Seu código de indicação" },
  ];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setView("menu"); onClose(); } }}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {view === "menu" && "Perfil"}
            {view === "deposit" && "Depositar"}
            {view === "withdraw" && "Sacar"}
            {view === "history" && "Extrato"}
            {view === "account" && "Minha Conta"}
            {view === "invite" && "Convite"}
          </DialogTitle>
        </DialogHeader>

        {view === "menu" && (
          <div className="space-y-4">
            <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
              <p className="text-sm text-zinc-400">Olá, <span className="text-white font-semibold">{user.name.split(" ")[0]}</span></p>
              <p className="text-xs text-zinc-500 mt-0.5">{user.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</p>
              <div className="mt-3 pt-3 border-t border-zinc-700">
                <p className="text-xs text-zinc-400">Saldo</p>
                <p className="text-2xl font-bold text-yellow-400">R$ {user.balance.toFixed(2).replace(".", ",")}</p>
                {(user.bonusBalance ?? 0) > 0 && (
                  <p className="text-sm text-green-400 mt-0.5 font-semibold">🎁 Bônus: R$ {(user.bonusBalance ?? 0).toFixed(2).replace(".", ",")}</p>
                )}
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
        {view === "history" && <HistoryView onBack={() => setView("menu")} />}
        {view === "account" && <AccountView onBack={() => setView("menu")} />}
        {view === "invite" && <InviteView onBack={() => setView("menu")} />}
      </DialogContent>
    </Dialog>
  );
}
