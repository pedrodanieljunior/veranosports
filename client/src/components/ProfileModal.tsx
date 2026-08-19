import { useState, useEffect } from "react";
import { ConfiguracoesView } from "@/components/ConfiguracoesView";
import { hapticMedium, isNative } from "@/lib/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Deposit, UserWithdrawal, Transaction, CLUB_VERANO_LEVELS, SORTE_VERANO_PERIODS, type SorteVeranoNumber } from "@shared/schema";
import { SiWhatsapp, SiPix } from "react-icons/si";
import { User, Wallet, CreditCard, LogOut, ChevronLeft, AlertCircle, CheckCircle2, Clock, XCircle, ArrowUpCircle, ArrowDownCircle, History, TrendingUp, Copy, Share2, Gift, BookOpen, MessageCircle, Trophy, Star, Sparkles, Settings, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const WHATSAPP_SUPPORT = "5592981420808";
const PIX_KEY = "67226607000165";
const PIX_NAME = "Verano Sports";
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

type View = "menu" | "deposit" | "withdraw" | "account" | "history" | "invite" | "rules" | "sorte" | "configuracoes";

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
  const bonus = isFirstDeposit && parsedAmount >= 10 ? 10 : 0;

  // Use MP dynamic code if available, fallback to static PIX payload
  const pixCode = step === "pix" && pendingDeposit
    ? (pendingDeposit.pixCopyPaste ?? buildPixCode(pendingDeposit.amount))
    : "";
  const hasMp = !!(step === "pix" && pendingDeposit?.pixCopyPaste);

  const copyPix = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendWhatsApp = () => {
    const msg = `Ol√°! Realizei um dep√≥sito PIX de R$${parsedAmount.toFixed(2)} na Verano Sports. C√≥digo do dep√≥sito: #${pendingDeposit?.id}. Segue o comprovante em anexo.`;
    window.open(`https://wa.me/${WHATSAPP_SUPPORT}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const statusColor = (s: string) => s === "confirmed" ? "text-green-400" : s === "rejected" ? "text-red-400" : "text-yellow-400";
  const statusIcon = (s: string) => s === "confirmed" ? <CheckCircle2 className="w-4 h-4" /> : s === "rejected" ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />;
  const statusLabel = (s: string) => s === "confirmed" ? "Confirmado" : s === "rejected" ? "Rejeitado" : "Aguardando";

  if (step === "pix" && pendingDeposit) {
    return (
      <div className="space-y-4">
        <button onClick={() => setStep("form")} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="rounded-xl p-4 space-y-3 border border-blue-100 bg-white/80">
          <h3 className="font-bold text-center text-gray-900 flex items-center justify-center gap-2">
            <SiPix className="w-4 h-4 text-[#32BCAD]" /> Fa√ßa o PIX
          </h3>
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Valor a pagar</p>
            <p className="text-2xl font-bold text-yellow-600">R$ {pendingDeposit.amount.toFixed(2).replace(".", ",")}</p>
            {pendingDeposit.bonusAmount > 0 && (
              <p className="text-sm text-green-400 font-semibold">+ R$ {pendingDeposit.bonusAmount.toFixed(2).replace(".", ",")} de b√¥nus (1¬∫ dep√≥sito)</p>
            )}
          </div>

          {/* QR Code image from Mercado Pago */}
          {hasMp && pendingDeposit.pixQrCode && (
            <div className="flex flex-col items-center gap-2">
              <img
                src={`data:image/png;base64,${pendingDeposit.pixQrCode}`}
                alt="QR Code PIX"
                className="w-48 h-48 rounded-lg border border-zinc-600 bg-white p-1"
              />
              <p className="text-xs text-gray-400">Aponte a c√¢mera do seu banco para o QR Code</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-medium">ou use o PIX Copia e Cola</p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 font-mono text-[10px] text-gray-700 break-all leading-relaxed select-all max-h-20 overflow-y-auto">
              {pixCode}
            </div>
            <Button
              onClick={copyPix}
              className={`w-full font-bold transition-colors ${copied ? "bg-green-600 hover:bg-green-600 text-white" : "bg-yellow-500 hover:bg-yellow-400 text-black"}`}
              data-testid="button-copy-pix"
            >
              <SiPix className="w-4 h-4 mr-2" />
              {copied ? "‚úì C√≥digo copiado!" : "Copiar c√≥digo PIX"}
            </Button>
            {pendingDeposit.pixExpiresAt && (
              <p className="text-[11px] text-orange-400 text-center">
                ‚è± Expira em: {new Date(pendingDeposit.pixExpiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>

        {hasMp && (
          <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-3 text-center">
            <p className="text-sm text-green-300 font-semibold">‚úÖ Confirma√ß√£o autom√°tica</p>
          </div>
        )}
        <p className="text-xs text-gray-500 text-center">Ap√≥s enviar o PIX, seu saldo ser√° atualizado em at√© 30 min.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>
      <div className="space-y-3">
        <div className="rounded-xl p-4 border border-blue-100 bg-white/80">
          <p className="text-sm text-gray-500 mb-1">Saldo real</p>
          <p className="text-2xl font-bold text-yellow-400">R$ {(user?.balance ?? 0).toFixed(2).replace(".", ",")}</p>
          {(user?.bonusBalance ?? 0) > 0 && (
            <p className="text-sm text-green-400 mt-1 font-semibold">üéÅ B√¥nus: R$ {(user?.bonusBalance ?? 0).toFixed(2).replace(".", ",")}</p>
          )}
        </div>
        {isFirstDeposit && (
          <div className="bg-green-900/40 border border-green-700 rounded-xl p-3">
            <p className="text-sm text-green-300 font-semibold">üéÅ 1¬∫ dep√≥sito ganha +R$ 10,00 de b√¥nus!</p>
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-gray-700">Valor do dep√≥sito (R$) ‚Äî m√≠n. R$10 / m√°x. R$5.000</Label>
          <Input
            placeholder="Ex: 100,00"
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9,]/g, ""))}
            className="bg-white border-blue-200 text-gray-900"
            data-testid="input-deposit-amount"
          />
          {parsedAmount > 5000 && (
            <p className="text-sm text-red-400">Valor m√°ximo por dep√≥sito √© R$5.000,00</p>
          )}
          {bonus > 0 && parsedAmount <= 5000 && (
            <p className="text-sm text-green-400">Voc√™ receber√° +R$ 10,00 de b√¥nus</p>
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
        <p className="text-xs text-gray-400 text-center">Valor m√≠nimo: R$ 10,00</p>
      </div>

      {deposits && deposits.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-500">Hist√≥rico de dep√≥sitos</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {deposits.map(d => (
              <div key={d.id} className="rounded-lg px-3 py-2 flex items-center justify-between bg-white border border-blue-50">
                <div>
                  <p className="font-semibold text-sm">R$ {d.amount.toFixed(2).replace(".", ",")}</p>
                  {d.bonusAmount > 0 && <p className="text-xs text-green-400">+R$ {d.bonusAmount.toFixed(2).replace(".", ",")} b√¥nus</p>}
                  <p className="text-xs text-gray-400">{format(new Date(d.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
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
      toast({ title: "Solicita√ß√£o enviada!", description: "Seu saque est√° em an√°lise e ser√° processado em breve." });
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
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="rounded-xl p-4 border border-blue-100 bg-white/80">
        <p className="text-sm text-gray-500 mb-1">Saldo dispon√≠vel para saque</p>
        <p className="text-2xl font-bold text-yellow-400">R$ {(user?.balance ?? 0).toFixed(2).replace(".", ",")}</p>
        {(user?.bonusBalance ?? 0) > 0 && (
          <p className="text-xs text-gray-400 mt-1">üéÅ B√¥nus R$ {(user?.bonusBalance ?? 0).toFixed(2).replace(".", ",")} ‚Äî n√£o dispon√≠vel para saque</p>
        )}
      </div>

      <div className="rounded-xl p-4 border border-blue-100 bg-white/80 space-y-3">
        <p className="text-sm font-semibold text-white">Solicitar Saque</p>
        <div className="space-y-2">
          <Label className="text-xs text-gray-500">Valor (m√≠n. R$ 20,00)</Label>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="bg-white border-blue-200 text-gray-900"
            data-testid="input-withdraw-amount"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-gray-500">Chave PIX (CPF, e-mail, telefone ou chave aleat√≥ria)</Label>
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
            <span className="text-xs text-gray-500">O mesmo do CPF de cadastro</span>
          </label>
          <Input
            type="text"
            placeholder="Sua chave PIX"
            value={pixKey}
            onChange={e => { if (!useCpfAsKey) setPixKey(e.target.value); }}
            readOnly={useCpfAsKey}
            className={`bg-white border-blue-200 text-gray-900 ${useCpfAsKey ? "opacity-60 cursor-not-allowed" : ""}`}
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
        <p className="text-xs text-gray-400 text-center">O saque ser√° processado em at√© 24 horas √∫teis</p>
      </div>

      {withdrawals.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-500">Hist√≥rico de saques</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {withdrawals.map(w => (
              <div key={w.id} className="rounded-lg px-3 py-2 flex items-center justify-between bg-white border border-blue-50">
                <div>
                  <p className="font-semibold text-sm">R$ {w.amount.toFixed(2).replace(".", ",")}</p>
                  <p className="text-xs text-gray-400">{w.pixKey}</p>
                  <p className="text-xs text-gray-400">{format(new Date(w.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
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
    if (newPassword !== confirmPassword) return toast({ title: "Senhas n√£o coincidem", variant: "destructive" });
    if (newPassword.length < 6) return toast({ title: "Senha m√≠nima de 6 caracteres", variant: "destructive" });
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
      toast({ title: "Erro de conex√£o", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>
      <div className="rounded-xl p-4 border border-blue-100 bg-white/80 space-y-2">
        <p className="text-xs text-gray-500">Nome</p>
        <p className="font-semibold">{user?.name}</p>
        <p className="text-xs text-gray-500 mt-2">CPF</p>
        <p className="font-semibold font-mono">{user?.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</p>
        <p className="text-xs text-gray-500 mt-2">Telefone</p>
        <p className="font-semibold">{user?.phone}</p>
      </div>
      <div className="rounded-xl p-4 border border-blue-100 bg-white/80 space-y-3">
        <p className="text-sm font-semibold">Alterar senha</p>
        <Input type="password" placeholder="Senha atual" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="bg-white border-blue-200 text-gray-900" />
        <Input type="password" placeholder="Nova senha" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="bg-white border-blue-200 text-gray-900" />
        <Input type="password" placeholder="Confirmar nova senha" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="bg-white border-blue-200 text-gray-900" />
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
    if (type === "deposit") return "Dep√≥sito";
    if (type === "bet") return "Aposta";
    if (type === "win") return "Ganho";
    if (type === "withdrawal") return "Saque";
    if (type === "withdrawal_refund") return "Reembolso";
    return type;
  };

  const amountColor = (amount: number) => amount >= 0 ? "text-green-400" : "text-red-400";

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800" data-testid="button-history-back">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-lg px-3 py-3 h-16 animate-pulse bg-blue-50" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-xl p-6 border border-blue-100 bg-white/80 text-center">
          <History className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">Nenhuma transa√ß√£o encontrada</p>
          <p className="text-gray-400 text-xs mt-1">Suas movimenta√ß√µes de saldo aparecer√£o aqui</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {transactions.map(t => (
            <div key={t.id} className="rounded-lg px-3 py-2.5 flex items-center justify-between bg-white border border-blue-50" data-testid={`row-transaction-${t.id}`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="shrink-0">{typeIcon(t.type)}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900">{typeLabel(t.type)}</p>
                  <p className="text-xs text-gray-500 truncate max-w-[160px]">{t.description}</p>
                  <p className="text-xs text-gray-400">{format(new Date(t.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className={`text-sm font-bold ${amountColor(t.amount)}`}>
                  {t.amount >= 0 ? "+" : ""}R$ {Math.abs(t.amount).toFixed(2).replace(".", ",")}
                </p>
                <p className="text-xs text-gray-400">Saldo: R$ {t.balanceAfter.toFixed(2).replace(".", ",")}</p>
              </div>
            </dbˆ‰6∆ñ6≥◊≤Çí”‚6fT◊WFFñˆ‚Ê◊WFFRÜ6ˆFRó–¢Fó6&∆VC◊≤6ˆFR«¬6ˆFRÊ∆VÊwFÇ¬2«¬6fT◊WFFñˆ‚Êó5VÊFñÊw–¢6∆74Ê÷S“&&r◊ñV∆∆˜r”CÜ˜fW#¶&r◊ñV∆∆˜r”SFWáB÷&∆6≤fˆÁB÷&ˆ∆B6á&ñÊ≤” ¢FF◊FW7FñC“&'WGFˆ‚◊6fR◊&VfW'&¬÷6ˆFR ¢‡¢∑6fT◊WFFñˆ‚Êó5VÊFñÊrÚ"‚‚‚"¢%6«f"'–¢¬Ù'WGFˆ„‡¢¬ˆFóc‡¢¬ˆFóc‡†¢∂Ü46ˆFRbbÄ¢∆Fób6∆74Ê÷S“'76R◊í”2#‡¢∆Fób6∆74Ê÷S“'&˜VÊFVB◊Ü¬”2&˜&FW"&˜&FW"÷&«VR”&r◊vÜóFRÛÉ#‡¢«6∆74Ê÷S“'FWáB◊á2FWáB÷w&í”S÷"”#‰∆ñÊ≤FR6ˆÁfóFS¬˜‡¢«6∆74Ê÷S“'FWáB◊á2fˆÁB÷÷ˆÊÚFWáB◊ñV∆∆˜r”s'&V≤÷∆¬#Á∂ñÁfóFT∆ñÊ∑”¬˜‡¢¬ˆFóc‡¢∆Fób6∆74Ê÷S“&f∆WÇv”"#‡¢ƒ'WGFˆ‡¢f&ñÁC“&˜WF∆ñÊR ¢6∆74Ê÷S“&f∆WÇ”&˜&FW"÷&«VR”#FWáB÷w&í”sÜ˜fW#¶&r÷&«VR”S ¢ˆ‰6∆ñ6≥◊∂6˜î∆ñÊ∑–¢FF◊FW7FñC“&'WGFˆ‚÷6˜í÷ñÁfóFR÷∆ñÊ≤ ¢‡¢ƒ6˜í6∆74Ê÷S“'r”BÇ”B◊"”""Û‡¢∂6˜ñVBÚ$6˜ñFÚ"¢$6˜ñ"∆ñÊ≤'–¢¬Ù'WGFˆ„‡¢ƒ'WGFˆ‡¢6∆74Ê÷S“&f∆WÇ”&r’≤3#TC3ce“Ü˜fW#¶&r’≤3V&SVE“FWáB◊vÜóFRfˆÁB÷&ˆ∆B ¢ˆ‰6∆ñ6≥◊∑6Ü&UvÜG4–¢FF◊FW7FñC“&'WGFˆ‚◊6Ü&R÷ñÁfóFR◊vÜG6 ¢‡¢≈6ïvÜG66∆74Ê÷S“'r”BÇ”B◊"”""Û‡¢6ˆ◊'Fñ∆Ü ¢¬Ù'WGFˆ„‡¢¬ˆFóc‡¢¬ˆFóc‡¢ó–¢¬ˆFóc‡¢ì∞ß–†¶6ˆÁ7BƒUdT≈Ù‰‘U3¢&V6˜&C∆ÁV÷&W"¬7G&ñÊs‚“≤¢$'&ˆÁ¶R"¬#¢%&F"¬3¢$˜W&Ú"¬C¢$Fñ÷ÁFR"”∞¶6ˆÁ7BƒUdT≈Ù4Ùƒı%3¢&V6˜&C∆ÁV÷&W"¬7G&ñÊs‚“∞¢¢'FWáB÷÷&W"”s&r÷÷&W"”&˜&FW"÷÷&W"”3"¿¢#¢'FWáB÷w&í”S&r÷w&í”&˜&FW"÷w&í”3"¿¢3¢'FWáB◊ñV∆∆˜r”c&r◊ñV∆∆˜r”S&˜&FW"◊ñV∆∆˜r”3"¿¢C¢'FWáB÷7ñ‚”c&r÷7ñ‚”S&˜&FW"÷7ñ‚”3"¿ß”∞†¶gVÊ7Fñˆ‚6˜'FUfW&ÊıfñWrá≤ˆ‰&6≤”¢≤ˆ‰&6≥¢Çí”‚fˆñB“í∞¢6ˆÁ7B≤FF¢ÁV÷&W'2“µ“¬ó4∆ˆFñÊr““W6UVW'ì≈6˜'FUfW&ÊÙÁV÷&W%µ”‚á∞¢VW'î∂Wì¢≤"ˆí˜6˜'FR◊fW&ÊÚ%“¿¢VW'îf„¢7ñÊ2Çí”‚∞¢6ˆÁ7B&W2“vóBfWF6ÇÇ"ˆí˜6˜'FR◊fW&ÊÚ"¬≤7&VFVÁFñ«3¢&ñÊ6«VFR"“ì∞¢ñbÇ&W2Êˆ≤íFá&˜rÊWrW'&˜"Ç$W'&Ú"ì∞¢&WGW&‚&W2Êß6ˆ‚Çì∞¢“¿¢“ì∞†¢ÚÚw&˜W'íW&ñˆ@¢6ˆÁ7B'ïW&ñˆB“4ı%DUıdU$‰ııU$îÙE2Á&VGV6S≈&V6˜&C∆ÁV÷&W"¬6˜'FUfW&ÊÙÁV÷&W%µ”„‚ÇÜ62¬í”‚∞¢65∑ÊñE““ÁV÷&W'2Êfñ«FW"Ü‚”‚‚ÁW&ñˆDñB””“ÊñBì∞¢&WGW&‚63∞¢“¬∑“ì∞†¢6ˆÁ7BFˆFí“ÊWrFFRÇíÁFÙï4ı7G&ñÊrÇíÁ6∆ñ6RÉ¬ì∞¢6ˆÁ7B7FófUW&ñˆG2“4ı%DUıdU$‰ııU$îÙE2Êfñ«FW"á”‚FˆFí„“Ê6ˆ∆∆V7FñˆÂ7F'BbbFˆFí√“Ê6ˆ∆∆V7Fñˆ‰VÊBì∞†¢&WGW&‚Ä¢∆Fób6∆74Ê÷S“'76R◊í”B#‡¢∆'WGFˆ‚ˆ‰6∆ñ6≥◊∂ˆ‰&6∑“6∆74Ê÷S“&f∆WÇóFV◊2÷6VÁFW"v”FWáB◊6“FWáB÷&«VR”cÜ˜fW#ßFWáB÷&«VR”É#‡¢ƒ6ÜWg&ˆ‰∆VgB6∆74Ê÷S“'r”BÇ”B"Û‚fˆ«F ¢¬ˆ'WGFˆ„‡†¢∆Fób6∆74Ê÷S“'&˜VÊFVB◊Ü¬&˜&FW"&˜&FW"◊ñV∆∆˜r”#&r÷w&FñVÁB◊FÚ÷'"g&ˆ“◊ñV∆∆˜r”SFÚ÷÷&W"”S”Bf∆WÇóFV◊2◊7F'Bv”2#‡¢≈7&∂∆W26∆74Ê÷S“'r”RÇ”RFWáB◊ñV∆∆˜r”S◊B”„Rf∆WÇ◊6á&ñÊ≤”"Û‡¢∆Fóc‡¢«6∆74Ê÷S“'FWáB◊6“fˆÁB◊6V÷ñ&ˆ∆BFWáB÷÷&W"”É#‰6ˆ÷ÚgVÊ6ñˆÊ¬˜‡¢«6∆74Ê÷S“'FWáB◊á2FWáB÷÷&W"”s◊B”„R∆VFñÊr◊&V∆ÜVB#‡¢ÚFñÊvó"V÷&V6ˆ◊VÁ6ÊÚ6«V&RfW&ÊÚ¬fˆ<:¢&V6V&RÏ;¶÷W&˜2F6˜'FS†¢'&ˆÁ¶RÏ;¶÷W&Ú+r&F"+r˜W&Ú2+rFñ÷ÁFRB„∆'"Û‡¢6˜'FVñ˜2÷VÁ6ó26ˆ“,:¶÷ñ˜2WÜ6«W6óf˜2¢¬˜‡¢¬ˆFóc‡¢¬ˆFóc‡†¢∆Fób7Gñ∆S◊∑≤ÜVñváC¢#SfÇ"¬˜fW&f∆˜uì¢&WFÚ"¬vV&∂óD˜fW&f∆˜u67&ˆ∆∆ñÊs¢'F˜V6Ç"¬FFñÊu&ñváC¢B◊”‡¢∂ó4∆ˆFñÊrÚÄ¢∆Fób6∆74Ê÷S“'76R◊í”2#‡¢µ≥¬"¬5“Ê÷Üí”‚∆Fób∂Wì◊∂ó“6∆74Ê÷S“&Ç”#&r÷&«VR”&˜VÊFVB◊Ü¬Êñ÷FR◊V«6R"Û‚ó–¢¬ˆFóc‡¢í¢ÁV÷&W'2Ê∆VÊwFÇ””“ÚÄ¢∆Fób6∆74Ê÷S“'FWáB÷6VÁFW"í”FWáB÷w&í”C#‡¢≈7&∂∆W26∆74Ê÷S“'r”Ç”◊Ç÷WFÚ÷"”2˜6óGí”3"Û‡¢«6∆74Ê÷S“'FWáB◊6“fˆÁB÷÷VFóV“#‰ÊVÊáV“Ï;¶÷W&ÚvW&FÚñÊF¬˜‡¢«6∆74Ê÷S“'FWáB◊á2◊B”#‰7V◊V∆R˜7F2ÊÚ6«V&RfW&ÊÚ&vÊÜ"Ï;¶÷W&˜2F6˜'FR¬˜‡¢¬ˆFóc‡¢í¢Ä¢∆Fób6∆74Ê÷S“'76R◊í”B#‡¢µ4ı%DUıdU$‰ııU$îÙE2Ê÷áW&ñˆB”‚∞¢6ˆÁ7BW&ñˆDÁV◊2“'ïW&ñˆE∑W&ñˆBÊñE“ÛÚµ”∞¢ñbáW&ñˆDÁV◊2Ê∆VÊwFÇ””“í&WGW&‚ÁV∆√∞¢6ˆÁ7Bó47FófR“FˆFí„“W&ñˆBÊ6ˆ∆∆V7FñˆÂ7F'BbbFˆFí√“W&ñˆBÊ6ˆ∆∆V7Fñˆ‰VÊC∞¢&WGW&‚Ä¢∆Fób∂Wì◊∑W&ñˆBÊñG“6∆74Ê÷S“'&˜VÊFVB◊Ü¬&˜&FW"&˜&FW"÷&«VR”&r◊vÜóFRÛÉ”B#‡¢∆Fób6∆74Ê÷S“&f∆WÇóFV◊2÷6VÁFW"ßW7Fñgí÷&WGvVV‚÷"”2#‡¢∆Fóc‡¢«6∆74Ê÷S“'FWáB◊6“fˆÁB÷&ˆ∆BFWáB÷w&í”É#Á∑W&ñˆBÊ∆&V«”¬˜‡¢«6∆74Ê÷S“'FWáB’≥Ö“FWáB÷w&í”C◊B”„R#‡¢W&:|:6Û¢∑W&ñˆBÊ6ˆ∆∆V7FñˆÂ7F'BÁ7∆óBÇ"“"íÁ&WfW'6RÇíÊ¶ˆñ‚Ç"Ú"ó“(	2∑W&ñˆBÊ6ˆ∆∆V7Fñˆ‰VÊBÁ7∆óBÇ"“"íÁ&WfW'6RÇíÊ¶ˆñ‚Ç"Ú"ó–¢¬˜‡¢«6∆74Ê÷S“'FWáB’≥Ö“FWáB÷w&í”C#‡¢6˜'FVñÛ¢∑W&ñˆBÊG&tFFRÁ7∆óBÇ"“"íÁ&WfW'6RÇíÊ¶ˆñ‚Ç"Ú"ó–¢¬˜‡¢¬ˆFóc‡¢∂ó47FófRbbÄ¢«7‚6∆74Ê÷S“'FWáB’≥Ö“fˆÁB÷&ˆ∆BÇ”"í”„R&˜VÊFVB÷gV∆¬&r÷w&VV‚”FWáB÷w&VV‚”s&˜&FW"&˜&FW"÷w&VV‚”##‡¢Fóf¢¬˜7„‡¢ó–¢¬ˆFóc‡¢∆Fób6∆74Ê÷S“&f∆WÇf∆WÇ◊w&v”"#‡¢∑W&ñˆDÁV◊2Ê÷Ü‚”‚Ä¢∆Fób∂Wì◊∂‚ÊñG“6∆74Ê÷S“&f∆WÇf∆WÇ÷6ˆ¬óFV◊2÷6VÁFW"v”#‡¢∆Fób6∆74Ê÷S“'r”BÇ”B&˜VÊFVB◊Ü¬&r÷w&FñVÁB◊FÚ÷'"g&ˆ“÷&«VR”SFÚ÷&«VR”sf∆WÇóFV◊2÷6VÁFW"ßW7Fñgí÷6VÁFW"6ÜF˜r◊6“#‡¢«7‚6∆74Ê÷S“'FWáB◊vÜóFRfˆÁB÷&∆6≤FWáB÷∆rG&6∂ñÊr◊vñFW7B#Á∂‚ÊÁV÷&W'”¬˜7„‡¢¬ˆFóc‡¢«7‚6∆74Ê÷S◊∂FWáB’≥óÖ“fˆÁB÷&ˆ∆BÇ”„Rí”„R&˜VÊFVB÷gV∆¬&˜&FW"G¥ƒUdT≈Ù4Ùƒı%5∂‚Ê6«V$∆WfV≈◊÷”‡¢¥ƒUdT≈Ù‰‘U5∂‚Ê6«V$∆WfV≈◊–¢¬˜7„‡¢¬ˆFóc‡¢íó–¢¬ˆFóc‡¢¬ˆFóc‡¢ì∞¢“ó–¢¬ˆFóc‡¢ó–¢¬ˆFóc‡†¢∂7FófUW&ñˆG2Ê∆VÊwFÇ‚bbÄ¢«6∆74Ê÷S“'FWáB’≥Ö“FWáB÷w&í”CFWáB÷6VÁFW"#‡¢∂7FófUW&ñˆG2Ê∆VÊwFá“W&:|:6Úå;VW2íFófá2í+rÏ;¶÷W&˜2vW&F˜2WFˆ÷Fñ6÷VÁFRÚ&V6V&W",;FÁW26«V&RfW&Ê¢¬˜‡¢ó–¢¬ˆFóc‡¢ì∞ß–†¶gVÊ7Fñˆ‚'V∆W5fñWrá≤ˆ‰&6≤”¢≤ˆ‰&6≥¢Çí”‚fˆñB“í∞¢6ˆÁ7B≤FF¬ó4∆ˆFñÊr““W6UVW'ì«≤6ˆÁFVÁC¢7G&ñÊr”‚á∞¢VW'î∂Wì¢≤"ˆí˜'V∆W2%“¿¢“ì∞¢&WGW&‚Ä¢∆Fób6∆74Ê÷S“'76R◊í”B#‡¢∆'WGFˆ‚ˆ‰6∆ñ6≥◊∂ˆ‰&6∑“6∆74Ê÷S“&f∆WÇóFV◊2÷6VÁFW"v”FWáB◊6“FWáB÷&«VR”cÜ˜fW#ßFWáB÷&«VR”É#‡¢ƒ6ÜWg&ˆ‰∆VgB6∆74Ê÷S“'r”BÇ”B"Û‚fˆ«F ¢¬ˆ'WGFˆ„‡¢∆Fób7Gñ∆S◊∑≤ÜVñváC¢#cfÇ"¬˜fW&f∆˜uì¢&WFÚ"¬vV&∂óD˜fW&f∆˜u67&ˆ∆∆ñÊs¢'F˜V6Ç"¬FFñÊu&ñváC¢Ç◊”‡¢∂ó4∆ˆFñÊrÚÄ¢∆Fób6∆74Ê÷S“'76R◊í”2í”"#‡¢¥'&íÊg&ˆ“á≤∆VÊwFÉ¢Ç“íÊ÷ÇÖÚ¬íí”‚Ä¢∆Fób∂Wì◊∂ó“6∆74Ê÷S“&Ç”2&r÷&«VR”&˜VÊFVBÊñ÷FR◊V«6R"7Gñ∆S◊∑≤vñGFÉ¢G≥cR≤ÜíR2í¢'“V◊“Û‡¢íó–¢¬ˆFóc‡¢í¢FFÚÊ6ˆÁFVÁBÚÄ¢«6∆74Ê÷S“'FWáB÷w&í”SFWáB◊6“FWáB÷6VÁFW"í”Ç#‰ÊVÊáV÷&Vw&6F7G&FñÊF„¬˜‡¢í¢Ä¢∆Fó`¢6∆74Ê÷S“'&˜6R&˜6R◊6“F&≥ß&˜6R÷ñÁfW'B÷Ç◊r÷ÊˆÊRí”'V∆W2÷6ˆÁFVÁB ¢FÊvW&˜W6«ï6WDñÊÊW$ÖD‘√◊∑≤ıˆáF÷√¢FFÊ6ˆÁFVÁB◊–¢Û‡¢ó–¢¬ˆFóc‡¢¬ˆFóc‡¢ì∞ß–†¶Wá˜'BgVÊ7Fñˆ‚&ˆfñ∆T÷ˆF¬á≤˜V‚¬ˆ‰6∆˜6R”¢&˜2í∞¢6ˆÁ7B≤W6W"¬∆ˆv˜WB¬&Vg&W6ÖW6W"““W6TWFÇÇì∞¢6ˆÁ7B∑fñWr¬6WEfñWu““W6U7FFS≈fñWs‚Ç&÷VÁR"ì∞†¢6ˆÁ7B≤Fˆ7B““W6UFˆ7BÇì∞†¢6ˆÁ7B≤FF¢6«V%fW&Êı&ˆw&W72““W6UVW'ì«∞¢vVVµ7F'C¢7G&ñÊs∞¢vVV∂«ï7F∂S¢ÁV÷&W#∞¢6∆ñ÷VD∆WfV«3¢ÁV÷&W%µ”∞¢ÊWt∆WfV«3¢ÁV÷&W%µ”∞¢ÊWt&ˆÁW3¢ÁV÷&W#∞¢”‚á∞¢VW'î∂Wì¢≤"ˆíˆ6«V"◊fW&ÊÚ˜&ˆw&W72%“¿¢VW'îf„¢7ñÊ2Çí”‚∞¢6ˆÁ7B&W2“vóBfWF6ÇÇ"ˆíˆ6«V"◊fW&ÊÚ˜&ˆw&W72"ì∞¢ñbÇ&W2Êˆ≤íFá&˜rÊWrW'&˜"Ç&fñ∆VB"ì∞¢&WGW&‚&W2Êß6ˆ‚Çì∞¢“¿¢VÊ&∆VC¢W6W"bb˜V‚¿¢&VfWF6ÑñÁFW'f√¢f«6R¿¢“ì∞†¢W6TVffV7BÇÇí”‚∞¢ñbÜ6«V%fW&Êı&ˆw&W72bb6«V%fW&Êı&ˆw&W72ÊÊWt&ˆÁW2‚í∞¢ÜFñ4÷VFóV“Çì∞¢Fˆ7Bá∞¢FóF∆S¢/	¯¯b6«V&RfW&ÊÚ(	B,;FÁW27&VFóFFÚ"¿¢FW67&óFñˆ„¢µ"BG∂6«V%fW&Êı&ˆw&W72ÊÊWt&ˆÁW2ÁFÙfóÜVBÉ"íÁ&W∆6RÇ"‚"¬"¬"ó“Fñ6ñˆÊF˜2Ú6WR6∆FÚ,;FÁW2Ê¿¢“ì∞¢&Vg&W6ÖW6W"Çì∞¢–¢“¬∂6«V%fW&Êı&ˆw&W73ÚÊÊWt&ˆÁW5“ì∞†¢ñbÇW6W"í&WGW&‚ÁV∆√∞†¢6ˆÁ7B÷VÁTóFV◊2“∞¢≤ñC¢&FW˜6óB"2fñWr¬ñ6ˆ„¢ƒ7&VFóD6&B6∆74Ê÷S“'r”RÇ”R"Û‚¬∆&V√¢$FW˜6óF""¬FW63¢$Fñ6ñˆÊ"6∆FÚfñïÇ"“¿¢≤ñC¢'vóFÜG&r"2fñWr¬ñ6ˆ„¢≈v∆∆WB6∆74Ê÷S“'r”RÇ”R"Û‚¬∆&V√¢%6VW2"¬FW63¢%6ˆ∆ñ6óF"&WFó&F"“¿¢≤ñC¢&Üó7F˜'í"2fñWr¬ñ6ˆ„¢ƒÜó7F˜'í6∆74Ê÷S“'r”RÇ”R"Û‚¬∆&V√¢$WáG&FÚ"¬FW63¢$Üó7L;7&ñ6ÚFR÷˜fñ÷VÁF:|;VW2"“¿¢≤ñC¢&66˜VÁB"2fñWr¬ñ6ˆ„¢≈W6W"6∆74Ê÷S“'r”RÇ”R"Û‚¬∆&V√¢$÷ñÊÜ6ˆÁF"¬FW63¢$FF˜2R6VÊÜ"“¿¢≤ñC¢&ñÁfóFR"2fñWr¬ñ6ˆ„¢ƒvñgB6∆74Ê÷S“'r”RÇ”R"Û‚¬∆&V√¢$6ˆÁfóFR"¬FW63¢%6WR<;6FñvÚFRñÊFñ6:|:6Ú"“¿¢≤ñC¢'6˜'FR"2fñWr¬ñ6ˆ„¢≈7&∂∆W26∆74Ê÷S“'r”RÇ”R"Û‚¬∆&V√¢%6˜'FRfW&ÊÚ"¬FW63¢%6WW2Ï;¶÷W&˜2F6˜'FR"“¿¢‚‚‚Üó4ÊFófRÇíÚ∑≤ñC¢&6ˆÊfñwW&6ˆW2"2fñWr¬ñ6ˆ„¢≈6WGFñÊw26∆74Ê÷S“'r”RÇ”R"Û‚¬∆&V√¢$6ˆÊfñwW&:|;VW2"¬FW63¢$Ê˜Fñfñ6:|;VW2¬&ñˆ÷WG&ñRFV÷"’“¢µ“í¿¢≤ñC¢''V∆W2"2fñWr¬ñ6ˆ„¢ƒ&ˆˆ¥˜V‚6∆74Ê÷S“'r”RÇ”R"Û‚¬∆&V√¢%&Vw&2FÚ6óFR"¬FW63¢%FW&÷˜2R6ˆÊFú:|;VW2"“¿¢”∞†¢ñbÇ˜V‚í&WGW&‚ÁV∆√∞¢&WGW&‚Ä¢√‡¢≤Ú¢&6∂G&˜(	B6V“&FóÇ¬6V“˜'F¬¬6V“fˆ7W566˜R¢˜–¢∆Fó`¢7Gñ∆S◊∑≤˜6óFñˆ„¢&fóÜVB"¬ñÁ6WC¢¬§ñÊFWÉ¢S¬&6∂w&˜VÊC¢'&v&É√√√„Çí"◊–¢ˆ‰6∆ñ6≥◊≤Çí”‚≤6WEfñWrÇ&÷VÁR"ì≤ˆ‰6∆˜6RÇì≤◊–¢Û‡¢≤Ú¢6ˆÁF\;¶FÚFÚ÷ˆF¬¢˜–¢∆Fób7Gñ∆S◊∑∞¢˜6óFñˆ„¢&fóÜVB"¿¢∆VgC¢#SR"¬F˜¢#SR"¿¢G&Á6f˜&”¢'G&Á6∆FRÇ”SR¬”SRí"¿¢§ñÊFWÉ¢S¿¢vñGFÉ¢&6∆2Égr“gÇí"¿¢÷ÖvñGFÉ¢##G&V“"¿¢&6∂w&˜VÊC¢&∆ñÊV"÷w&FñVÁBáFÚ&˜GFˆ“¬6cÜf&fb¬6F&VfRí"¿¢&˜&FW#¢#Ç6ˆ∆ñB&v&ÉCr√ìr√#S2√„Rí"¿¢6ˆ∆˜#¢"3É#r"¿¢&˜&FW%&FóW3¢#„W&V“"¿¢FFñÊs¢#„W&V“"¿¢&˜Ö6ÜF˜s¢##ÇcÇ&v&É√√√„Bí"¿¢÷ÑÜVñváC¢#ìfÇ"¿¢˜fW&f∆˜uì¢&WFÚ"¿¢vV&∂óD˜fW&f∆˜u67&ˆ∆∆ñÊs¢'F˜V6Ç"¿¢“2&V7B‰555&˜W'FñW7”‡¢≤Ú¢ÜVFW"¢˜–¢∆Fób7Gñ∆S◊∑≤Fó7∆ì¢&f∆WÇ"¬ßW7Fñgî6ˆÁFVÁC¢'76R÷&WGvVV‚"¬∆ñv‰óFV◊3¢&6VÁFW""¬÷&vñ‰&˜GFˆ”¢#&V“"◊”‡¢∆É"7Gñ∆S◊∑≤fˆÁEvVñváC¢s¬fˆÁE6ó¶S¢#„#W&V“"◊”‡¢∑fñWr””“&÷VÁR"bb%W&fñ¬'–¢∑fñWr””“&FW˜6óB"bb$FW˜6óF"'–¢∑fñWr””“'vóFÜG&r"bb%6VW2'–¢∑fñWr””“&Üó7F˜'í"bb$WáG&FÚ'–¢∑fñWr””“&66˜VÁB"bb$÷ñÊÜ6ˆÁF'–¢∑fñWr””“&ñÁfóFR"bb$6ˆÁfóFR'–¢∑fñWr””“'6˜'FR"bb%6˜'FRfW&ÊÚ'–¢∑fñWr””“&6ˆÊfñwW&6ˆW2"bb$6ˆÊfñwW&:|;VW2'–¢∑fñWr””“''V∆W2"bb%&Vw&2FÚ6óFR'–¢¬ˆÉ#‡¢∆'WGFˆ‡¢ˆ‰6∆ñ6≥◊≤Çí”‚≤6WEfñWrÇ&÷VÁR"ì≤ˆ‰6∆˜6RÇì≤◊–¢7Gñ∆S◊∑≤˜6óGì¢„r¬FFñÊs¢B¬F˜V6Ñ7Fñˆ„¢&÷ÊóV∆Fñˆ‚"¬&6∂w&˜VÊC¢&ÊˆÊR"¬&˜&FW#¢&ÊˆÊR"¬7W'6˜#¢'ˆñÁFW""◊–¢‡¢≈Ç6∆74Ê÷S“&Ç”Br”B"Û‡¢¬ˆ'WGFˆ„‡¢¬ˆFóc‡†¢∑fñWr””“&÷VÁR"bbÄ¢∆Fób7Gñ∆S◊∑≤÷ÑÜVñváC¢#sfÇ"¬˜fW&f∆˜uì¢&WFÚ"¬vV&∂óD˜fW&f∆˜u67&ˆ∆∆ñÊs¢'F˜V6Ç"◊”‡¢∆Fób6∆74Ê÷S“'76R◊í”B"”#‡¢∆Fób6∆74Ê÷S“'&˜VÊFVB◊Ü¬”B&˜&FW"&˜&FW"÷&«VR”&r◊vÜóFRÛÉ#‡¢«6∆74Ê÷S“'FWáB◊6“FWáB÷w&í”c#‰ˆÃ:¬«7‚6∆74Ê÷S“'FWáB÷w&í”ìfˆÁB◊6V÷ñ&ˆ∆B#Á∑W6W"ÊÊ÷RÁ7∆óBÇ""ï≥◊”¬˜7„„¬˜‡¢«6∆74Ê÷S“'FWáB◊á2FWáB÷w&í”C◊B”„R#Á∑W6W"Ê7bÁ&W∆6RÇÚÖ∆G≥7“íÖ∆G≥7“íÖ∆G≥7“íÖ∆G≥'“íÚ¬"C‚C"‚C2“CB"ó”¬˜‡¢∆Fób6∆74Ê÷S“&◊B”2B”2&˜&FW"◊B&˜&FW"÷&«VR”#‡¢«6∆74Ê÷S“'FWáB◊á2FWáB÷w&í”S#Â6∆FÚF˜F√¬˜‡¢«6∆74Ê÷S“'FWáB”'Ü¬fˆÁB÷&ˆ∆BFWáB◊ñV∆∆˜r”C#‡¢"B≤áW6W"Ê&∆Ê6R≤áW6W"Ê&ˆÁW4&∆Ê6RÛÚííÁFÙfóÜVBÉ"íÁ&W∆6RÇ"‚"¬"¬"ó–¢¬˜‡¢≤áW6W"Ê&ˆÁW4&∆Ê6RÛÚí‚bbÄ¢∆Fób6∆74Ê÷S“&◊B”„Rf∆WÇv”2FWáB◊á2FWáB÷w&í”S#‡¢«7„Ô	˘+&ñÊ6ó√¢«7‚6∆74Ê÷S“'FWáB÷w&í”ìfˆÁB◊6V÷ñ&ˆ∆B#Â"B∑W6W"Ê&∆Ê6RÁFÙfóÜVBÉ"íÁ&W∆6RÇ"‚"¬"¬"ó”¬˜7„„¬˜7„‡¢«7„Ô	¯Ë,;FÁW3¢«7‚6∆74Ê÷S“'FWáB÷w&VV‚”CfˆÁB◊6V÷ñ&ˆ∆B#Â"B≤áW6W"Ê&ˆÁW4&∆Ê6RÛÚíÁFÙfóÜVBÉ"íÁ&W∆6RÇ"‚"¬"¬"ó”¬˜7„„¬˜7„‡¢¬ˆFóc‡¢ó–¢¬ˆFóc‡¢¬ˆFóc‡¢≤Ú¢6«V&Rer¢˜–¢≤ÇÇí”‚∞¢6ˆÁ7BvVV∂«ï7F∂R“6«V%fW&Êı&ˆw&W73ÚÁvVV∂«ï7F∂RÛÚ∞¢6ˆÁ7B‘Ç“∞¢6ˆÁ7B7B“÷FÇÊ÷ñ‚É¬ávVV∂«ï7F∂RÚ‘Çí¢ì∞¢6ˆÁ7BÊWáD∆WfV¬“4≈T%ıdU$‰ıÙƒUdT≈2ÊfñÊBÜ¬”‚vVV∂«ï7F∂R¬¬ÁFá&W6Üˆ∆Bì∞¢6ˆÁ7B∆ƒFˆÊR“vVV∂«ï7F∂R„“‘É∞†¢6ˆÁ7BDîU%2“∞¢∞¢∆&V√¢$'&ˆÁ¶R"¿¢ñ6ˆ„¢/	˙Xí"¿¢v∆˜s¢'&v&É#Cí√R√#"√„CRí"¿¢F˜C¢&&r÷˜&ÊvR”É&˜&FW"÷˜&ÊvR”s"¿¢F˜E&V6ÜVC¢&&r÷˜&ÊvR”C&˜&FW"÷˜&ÊvR”3"¿¢6&C¢&&r÷˜&ÊvR”ìSÛC&˜&FW"÷˜&ÊvR”ÉÛS"¿¢6&E&V6ÜVC¢&&r÷˜&ÊvR”ìÛC&˜&FW"÷˜&ÊvR”SÛs"¿¢Ê÷S¢'FWáB÷˜&ÊvR”3"¿¢Ê÷U&V6ÜVC¢'FWáB÷˜&ÊvR”#"¿¢&ˆÁW3¢'FWáB÷˜&ÊvR”3"¿¢&ˆÁW5&V6ÜVC¢'FWáB÷˜&ÊvR”#"¿¢“¿¢∞¢∆&V√¢%&F"¿¢ñ6ˆ„¢/	˙XÇ"¿¢v∆˜s¢'&v&É3"√#B√#"√„CRí"¿¢F˜C¢&&r÷∆ñ÷R”É&˜&FW"÷∆ñ÷R”s"¿¢F˜E&V6ÜVC¢&&r÷∆ñ÷R”C&˜&FW"÷∆ñ÷R”3"¿¢6&C¢&&r÷∆ñ÷R”ìSÛC&˜&FW"÷∆ñ÷R”ÉÛS"¿¢6&E&V6ÜVC¢&&r÷∆ñ÷R”ìÛC&˜&FW"÷∆ñ÷R”SÛs"¿¢Ê÷S¢'FWáB÷∆ñ÷R”3"¿¢Ê÷U&V6ÜVC¢'FWáB÷∆ñ÷R”#"¿¢&ˆÁW3¢'FWáB÷∆ñ÷R”3"¿¢&ˆÁW5&V6ÜVC¢'FWáB÷∆ñ÷R”#"¿¢“¿¢∞¢∆&V√¢$˜W&Ú"¿¢ñ6ˆ„¢/	˙Xr"¿¢v∆˜s¢'&v&ÉcÇ√ÉR√#Cr√„CRí"¿¢F˜C¢&&r◊W'∆R”É&˜&FW"◊W'∆R”s"¿¢F˜E&V6ÜVC¢&&r◊W'∆R”C&˜&FW"◊W'∆R”3"¿¢6&C¢&&r◊W'∆R”ìSÛC&˜&FW"◊W'∆R”ÉÛS"¿¢6&E&V6ÜVC¢&&r◊W'∆R”ìÛC&˜&FW"◊W'∆R”SÛs"¿¢Ê÷S¢'FWáB◊W'∆R”3"¿¢Ê÷U&V6ÜVC¢'FWáB◊W'∆R”#"¿¢&ˆÁW3¢'FWáB◊W'∆R”3"¿¢&ˆÁW5&V6ÜVC¢'FWáB◊W'∆R”#"¿¢“¿¢∞¢∆&V√¢$Fñ÷ÁFR"¿¢ñ6ˆ„¢/	˘(‚"¿¢v∆˜s¢'&v&É3B√#√#3Ç√„CRí"¿¢F˜C¢&&r÷7ñ‚”É&˜&FW"÷7ñ‚”s"¿¢F˜E&V6ÜVC¢&&r÷7ñ‚”C&˜&FW"÷7ñ‚”3"¿¢6&C¢&&r÷7ñ‚”ìSÛC&˜&FW"÷7ñ‚”ÉÛS"¿¢6&E&V6ÜVC¢&&r÷7ñ‚”ìÛC&˜&FW"÷7ñ‚”SÛs"¿¢Ê÷S¢'FWáB÷7ñ‚”3"¿¢Ê÷U&V6ÜVC¢'FWáB÷7ñ‚”#"¿¢&ˆÁW3¢'FWáB÷7ñ‚”3"¿¢&ˆÁW5&V6ÜVC¢'FWáB÷7ñ‚”#"¿¢“¿¢”∞†¢&WGW&‚Ä¢∆Fób6∆74Ê÷S“'&˜VÊFVB◊Ü¬”B&˜&FW"&˜&FW"◊ñV∆∆˜r”cÛC"7Gñ∆S◊∑≤&6∂w&˜VÊC¢&∆ñÊV"÷w&FñVÁBÉcFVr¬3v3FR¬6#ÉsS3R¬6CCìcbSRR¬63Cv3RsRR¬3ÜS#Rí"◊“FF◊FW7FñC“&6&B÷6«V&R◊fW&ÊÚ#‡¢∆Fób6∆74Ê÷S“&f∆WÇóFV◊2÷6VÁFW"v”"÷"”2#‡¢≈G&˜áí6∆74Ê÷S“'r”BÇ”BFWáB◊ñV∆∆˜r”C"Û‡¢«7‚6∆74Ê÷S“&fˆÁB÷&ˆ∆BFWáB◊6“FWáB◊ñV∆∆˜r”C#‰6«V&RfW&ÊÛ¬˜7„‡¢«7‚6∆74Ê÷S“&÷¬÷WFÚFWáB◊á2FWáB◊ñV∆∆˜r”#Ûs#Á6V÷ÊGV√¬˜7„‡¢¬ˆFóc‡†¢≤Ú¢&'&FR&ˆw&W76Ú¢˜–¢∆Fób6∆74Ê÷S“'&V∆FófRÇ”"„R&r÷&∆6≤Û#&˜VÊFVB÷gV∆¬÷"”B˜fW&f∆˜r◊fó6ñ&∆R#‡¢∆Fó`¢6∆74Ê÷S“&'6ˆ«WFRñÁ6WB◊í”∆VgB”&˜VÊFVB÷gV∆¬G&Á6óFñˆ‚÷∆¬GW&Fñˆ‚”S ¢7Gñ∆S◊∑∞¢vñGFÉ¢G∑7G“V¿¢&6∂w&˜VÊC¢&∆ñÊV"÷w&FñVÁBáFÚ&ñváB¬6cìs3b¬3ÉF63b¬6ÉSVcr¬3#&C6VRí"¿¢◊–¢Û‡¢¥4≈T%ıdU$‰ıÙƒUdT≈2Ê÷Çá≤∆WfV¬¬Fá&W6Üˆ∆B“¬ñGÇí”‚∞¢6ˆÁ7B˜2“áFá&W6Üˆ∆BÚ‘Çí¢∞¢6ˆÁ7B&V6ÜVB“vVV∂«ï7F∂R„“Fá&W6Üˆ∆C∞¢6ˆÁ7BB“DîU%5∂ñGÖ”∞¢&WGW&‚Ä¢∆Fó`¢∂Wì◊∂∆WfV«–¢6∆74Ê÷S“&'6ˆ«WFRF˜”Û"◊G&Á6∆FR◊í”Û"◊G&Á6∆FR◊Ç”Û" ¢7Gñ∆S◊∑≤∆VgC¢G∑˜7“V◊–¢‡¢«7‚6∆74Ê÷S◊∂FWáB÷&6R∆VFñÊr÷ÊˆÊRG&˜◊6ÜF˜r÷÷BG&Á6óFñˆ‚÷∆¬G∑&V6ÜVBÚ&˜6óGí”"¢&˜6óGí”3w&ó66∆R'÷”Á∑BÊñ6ˆÁ”¬˜7„‡¢¬ˆFóc‡¢ì∞¢“ó–¢¬ˆFóc‡†¢≤Ú¢Ï:◊fVó2¢˜–¢≤ÇÇí”‚∞¢ÚÚ8÷ÊFñ6RFÚÏ:◊fV¬÷ó2«FÚFñÊvñFÚÇ”6RÊVÊáV“ê¢6ˆÁ7B7W'&VÁDñGÇ“4≈T%ıdU$‰ıÙƒUdT≈2Á&VGV6RÇÜ62¬≤Fá&W6Üˆ∆B“¬ñGÇí”‡¢vVV∂«ï7F∂R„“Fá&W6Üˆ∆BÚñGÇ¢62¬”ì∞¢&WGW&‚Ä¢∆Fób6∆74Ê÷S“&w&ñBw&ñB÷6ˆ«2”Bv”÷"”2#‡¢¥4≈T%ıdU$‰ıÙƒUdT≈2Ê÷Çá≤∆WfV¬¬Fá&W6Üˆ∆B¬&ˆÁW2“¬ñGÇí”‚∞¢6ˆÁ7BB“DîU%5∂ñGÖ”∞¢6ˆÁ7Bó57B“ñGÇ¬7W'&VÁDñGÉ∞¢6ˆÁ7Bó47W'&VÁB“ñGÇ””“7W'&VÁDñGÉ∞¢6ˆÁ7Bó4∆ˆ6∂VB“ñGÇ‚7W'&VÁDñGÉ∞¢&WGW&‚Ä¢∆Fó`¢∂Wì◊∂∆WfV«–¢6∆74Ê÷S◊∂&˜VÊFVB÷∆r”„RFWáB÷6VÁFW"&˜&FW"G&Á6óFñˆ‚÷6ˆ∆˜'2&V∆FófP¢G∂ó47W'&VÁBÚG∑BÊ6&E&V6ÜVG“&ñÊr”&ñÊr÷ˆfg6WB”¢"'–¢G∂ó57BÚ&&r÷w&í”&˜&FW"÷w&í”#˜6óGí”É"¢"'–¢G∂ó4∆ˆ6∂VBÚBÊ6&B¢"'–¢–¢7Gñ∆S◊∂ó47W'&VÁBÚ≤&˜Ö6ÜF˜s¢áÇG∑BÊv∆˜w÷“¢VÊFVfñÊVG–¢‡¢∂ó57BbbÄ¢∆Fób6∆74Ê÷S“&'6ˆ«WFRñÁ6WB”f∆WÇóFV◊2÷6VÁFW"ßW7Fñgí÷6VÁFW"&˜VÊFVB÷∆r&r◊vÜóFRÛs#‡¢«7‚6∆74Ê÷S“'FWáB÷w&VV‚”CfˆÁB÷&ˆ∆BFWáB◊á2#Ó)…3¬˜7„‡¢¬ˆFóc‡¢ó–¢«6∆74Ê÷S◊∂FWáB◊6“∆VFñÊr÷ÊˆÊR÷"”„RG∂ó57BÚ&w&ó66∆R˜6óGí”C"¢"'÷”Á∑BÊñ6ˆÁ”¬˜‡¢«6∆74Ê÷S◊∂FWáB’≥óÖ“fˆÁB÷&ˆ∆@¢G∂ó47W'&VÁBÚBÊÊ÷U&V6ÜVB¢"'–¢G∂ó57BÚ'FWáB÷w&í”C"¢"'–¢G∂ó4∆ˆ6∂VBÚBÊÊ÷R¢"'–¢”‡¢∑BÊ∆&V«–¢¬˜‡¢«6∆74Ê÷S◊∂FWáB’≥óÖ“G∂ó47W'&VÁBÚ'FWáB◊vÜóFRÛÉ"¢'FWáB◊ñV∆∆˜r”Ûs'÷”‡¢"G∑Fá&W6Üˆ∆B„“Ú#≤"¢Fá&W6Üˆ∆G–¢¬˜‡¢«6∆74Ê÷S◊∂FWáB’≥Ö“fˆÁB÷&ˆ∆B◊B”„P¢G∂ó47W'&VÁBÚBÊ&ˆÁW5&V6ÜVB¢"'–¢G∂ó57BÚ'FWáB÷w&í”S∆ñÊR◊Fá&˜VvÇ"¢"'–¢G∂ó4∆ˆ6∂VBÚBÊ&ˆÁW2¢"'–¢”‡¢µ"G∂&ˆÁW7–¢¬˜‡¢¬ˆFóc‡¢ì∞¢“ó–¢¬ˆFóc‡¢ì∞¢“íÇó–†¢∆Fób6∆74Ê÷S“'76R◊í”FWáB÷6VÁFW"#‡¢«6∆74Ê÷S“'FWáB◊á2FWáB◊ñV∆∆˜r”Ûì#‡¢∂∆ƒFˆÊP¢Ú√Ô	˘(‚÷WFFñÊvñF,;FÁW27&VFóFFÚÊ6VwVÊF:2ÜÉ¬Û‡¢¢ÊWáD∆WfV¿¢Ú√‰˜7FFÛ¢«7‚6∆74Ê÷S“'FWáB◊vÜóFRfˆÁB◊6V÷ñ&ˆ∆B#Â"B∑vVV∂«ï7F∂RÁFÙfóÜVBÉ"íÁ&W∆6RÇ"‚"¬"¬"ó”¬˜7„‚+rf«F“«7‚6∆74Ê÷S“'FWáB◊ñV∆∆˜r”3fˆÁB◊6V÷ñ&ˆ∆B#Â"B≤ÜÊWáD∆WfV¬ÁFá&W6Üˆ∆B“vVV∂«ï7F∂RíÁFÙfóÜVBÉ"íÁ&W∆6RÇ"‚"¬"¬"ó”¬˜7„‚ÚµDîU%5¥4≈T%ıdU$‰ıÙƒUdT≈2ÊfñÊDñÊFWÇÜ¬”‚¬Ê∆WfV¬””“ÊWáD∆WfV¬Ê∆WfV¬ï“Ê∆&V«”¬Û‡¢¢$6ˆ◊ÊÜR6WR&ˆw&W76ÚVí'–¢¬˜‡¢«6∆74Ê÷S“'FWáB’≥Ö“FWáB◊ñV∆∆˜r”#Ûc#‡¢	˘Yr&V÷ñ:|:6ÚFˆF6VwVÊF:2ÜÇÜÜ˜,:&ñÚFR÷ÊW2ê¢¬˜‡¢«6∆74Ê÷S“'FWáB’≥Ö“FWáB◊ñV∆∆˜r”#Ûc#‡¢,;FÁW2Ï:6Ú7V◊V∆Fóf¢¬˜‡¢¬ˆFóc‡¢¬ˆFóc‡¢ì∞¢“íÇó–†¢∆Fób6∆74Ê÷S“'76R◊í”"#‡¢∂÷VÁTóFV◊2Ê÷ÜóFV“”‚Ä¢∆'WGFˆ‡¢∂Wì◊∂óFV“ÊñG–¢6∆74Ê÷S“'r÷gV∆¬f∆WÇóFV◊2÷6VÁFW"v”2&r◊vÜóFRÜ˜fW#¶&r÷&«VR”S&˜&FW"&˜&FW"÷&«VR”&˜VÊFVB◊Ü¬Ç”Bí”2FWáB÷∆VgBG&Á6óFñˆ‚÷6ˆ∆˜'2 ¢ˆ‰6∆ñ6≥◊≤Çí”‚6WEfñWrÜóFV“ÊñBó–¢FF◊FW7FñC◊∂'WGFˆ‚◊&ˆfñ∆R“G∂óFV“ÊñG÷–¢‡¢«7‚6∆74Ê÷S“'FWáB◊ñV∆∆˜r”C#Á∂óFV“Êñ6ˆÁ”¬˜7„‡¢∆Fóc‡¢«6∆74Ê÷S“&fˆÁB◊6V÷ñ&ˆ∆BFWáB◊6“#Á∂óFV“Ê∆&V«”¬˜‡¢«6∆74Ê÷S“'FWáB◊á2FWáB÷w&í”S#Á∂óFV“ÊFW67”¬˜‡¢¬ˆFóc‡¢¬ˆ'WGFˆ„‡¢íó–¢∆'WGFˆ‡¢6∆74Ê÷S“'r÷gV∆¬f∆WÇóFV◊2÷6VÁFW"v”2&r◊vÜóFRÜ˜fW#¶&r÷&«VR”S&˜&FW"&˜&FW"÷&«VR”&˜VÊFVB◊Ü¬Ç”Bí”2FWáB÷∆VgBG&Á6óFñˆ‚÷6ˆ∆˜'2 ¢ˆ‰6∆ñ6≥◊≤Çí”‚vñÊF˜rÊ˜V‚ÜáGG3¢Ú˜vÊ÷RÚGµtÑE4ı5Uı%G”˜FWáC“G∂VÊ6ˆFUU$î6ˆ◊ˆÊVÁBÇ$ˆÃ:¬&V6ó6ÚFRßVF‚"ó÷¬%ˆ&∆Ê≤"ó–¢FF◊FW7FñC“&'WGFˆ‚◊&ˆfñ∆R÷f∆R÷6ˆÊ˜66Ú ¢‡¢«7‚6∆74Ê÷S“'FWáB◊ñV∆∆˜r”C#„ƒ÷W76vT6ó&6∆R6∆74Ê÷S“'r”RÇ”R"Û„¬˜7„‡¢∆Fóc‡¢«6∆74Ê÷S“&fˆÁB◊6V÷ñ&ˆ∆BFWáB◊6“#‰f∆R6ˆÊ˜66Û¬˜‡¢«6∆74Ê÷S“'FWáB◊á2FWáB÷w&í”S#Â7W˜'FRfñvÜG4¬˜‡¢¬ˆFóc‡¢¬ˆ'WGFˆ„‡¢¬ˆFóc‡¢ƒ'WGFˆ‚f&ñÁC“&˜WF∆ñÊR"6∆74Ê÷S“'r÷gV∆¬&˜&FW"◊&VB”cFWáB◊&VB”CÜ˜fW#¶&r◊&VB”ìÛ#"ˆ‰6∆ñ6≥◊≤Çí”‚≤∆ˆv˜WBÇì≤ˆ‰6∆˜6RÇì≤◊“FF◊FW7FñC“&'WGFˆ‚◊&ˆfñ∆R÷∆ˆv˜WB#‡¢ƒ∆ˆt˜WB6∆74Ê÷S“'r”BÇ”B◊"”""Û‡¢6ó"F6ˆÁF¢¬Ù'WGFˆ„‡¢¬ˆFóc‡¢¬ˆFóc‡¢ó–†¢∑fñWr””“&FW˜6óB"bbƒFW˜6óEfñWrˆ‰&6≥◊≤Çí”‚6WEfñWrÇ&÷VÁR"ó“ÛÁ–¢∑fñWr””“'vóFÜG&r"bb≈vóFÜG&ufñWrˆ‰&6≥◊≤Çí”‚6WEfñWrÇ&÷VÁR"ó“ÛÁ–¢∑fñWr””“&Üó7F˜'í"bbƒÜó7F˜'ïfñWrˆ‰&6≥◊≤Çí”‚6WEfñWrÇ&÷VÁR"ó“ÛÁ–¢∑fñWr””“&66˜VÁB"bbƒ66˜VÁEfñWrˆ‰&6≥◊≤Çí”‚6WEfñWrÇ&÷VÁR"ó“ÛÁ–¢∑fñWr””“&ñÁfóFR"bbƒñÁfóFUfñWrˆ‰&6≥◊≤Çí”‚6WEfñWrÇ&÷VÁR"ó“ÛÁ–¢∑fñWr””“'6˜'FR"bb≈6˜'FUfW&ÊıfñWrˆ‰&6≥◊≤Çí”‚6WEfñWrÇ&÷VÁR"ó“ÛÁ–¢∑fñWr””“&6ˆÊfñwW&6ˆW2"bbƒ6ˆÊfñwW&6ˆW5fñWrˆ‰&6≥◊≤Çí”‚6WEfñWrÇ&÷VÁR"ó“ÛÁ–¢∑fñWr””“''V∆W2"bb≈'V∆W5fñWrˆ‰&6≥◊≤Çí”‚6WEfñWrÇ&÷VÁR"ó“ÛÁ–¢¬ˆFóc‡¢¬Û‡¢ì∞ß–†