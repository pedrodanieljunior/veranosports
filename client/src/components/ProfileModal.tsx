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
import { Deposit, UserWithdrawal, Transaction, CLUB_FW_LEVELS, SORTE_VERANO_PERIODS, type SorteVeranoNumber } from "@shared/schema";
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
    const msg = `OlÃ¡! Realizei um depÃ³sito PIX de R$${parsedAmount.toFixed(2)} na Verano Sports. CÃ³digo do depÃ³sito: #${pendingDeposit?.id}. Segue o comprovante em anexo.`;
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
            <SiPix className="w-4 h-4 text-[#32BCAD]" /> FaÃ§a o PIX
          </h3>
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Valor a pagar</p>
            <p className="text-2xl font-bold text-yellow-600">R$ {pendingDeposit.amount.toFixed(2).replace(".", ",")}</p>
            {pendingDeposit.bonusAmount > 0 && (
              <p className="text-sm text-green-400 font-semibold">+ R$ {pendingDeposit.bonusAmount.toFixed(2).replace(".", ",")} de bÃ´nus (1Âº depÃ³sito)</p>
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
              <p className="text-xs text-gray-400">Aponte a cÃ¢mera do seu banco para o QR Code</p>
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
              {copied ? "âœ“ CÃ³digo copiado!" : "Copiar cÃ³digo PIX"}
            </Button>
            {pendingDeposit.pixExpiresAt && (
              <p className="text-[11px] text-orange-400 text-center">
                â± Expira em: {new Date(pendingDeposit.pixExpiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>

        {hasMp ? (
          <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-3 text-center">
            <p className="text-sm text-green-300 font-semibold">âœ… ConfirmaÃ§Ã£o automÃ¡tica</p>
            <p className="text-xs text-green-400 mt-0.5">Seu saldo serÃ¡ creditado automaticamente apÃ³s o pagamento ser aprovado.</p>
          </div>
        ) : (
          <>
            <Button
              className="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold"
              onClick={sendWhatsApp}
            >
              <SiWhatsapp className="w-5 h-5 mr-2" />
              Enviar comprovante via WhatsApp
            </Button>
            <p className="text-xs text-gray-500 text-center">ApÃ³s enviar o comprovante, seu saldo serÃ¡ atualizado em atÃ© 10 minutos.</p>
          </>
        )}
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
            <p className="text-sm text-green-400 mt-1 font-semibold">ğŸ BÃ´nus: R$ {(user?.bonusBalance ?? 0).toFixed(2).replace(".", ",")}</p>
          )}
        </div>
        {isFirstDeposit && (
          <div className="bg-green-900/40 border border-green-700 rounded-xl p-3">
            <p className="text-sm text-green-300 font-semibold">ğŸ 1Âº depÃ³sito ganha +R$ 10,00 de bÃ´nus!</p>
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-gray-700">Valor do depÃ³sito (R$) â€” mÃ­n. R$10 / mÃ¡x. R$5.000</Label>
          <Input
            placeholder="Ex: 100,00"
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9,]/g, ""))}
            className="bg-white border-blue-200 text-gray-900"
            data-testid="input-deposit-amount"
          />
          {parsedAmount > 5000 && (
            <p className="text-sm text-red-400">Valor mÃ¡ximo por depÃ³sito Ã© R$5.000,00</p>
          )}
          {bonus > 0 && parsedAmount <= 5000 && (
            <p className="text-sm text-green-400">VocÃª receberÃ¡ +R$ 10,00 de bÃ´nus</p>
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
        <p className="text-xs text-gray-400 text-center">Valor mÃ­nimo: R$ 10,00</p>
      </div>

      {deposits && deposits.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-500">HistÃ³rico de depÃ³sitos</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {deposits.map(d => (
              <div key={d.id} className="rounded-lg px-3 py-2 flex items-center justify-between bg-white border border-blue-50">
                <div>
                  <p className="font-semibold text-sm">R$ {d.amount.toFixed(2).replace(".", ",")}</p>
                  {d.bonusAmount > 0 && <p className="text-xs text-green-400">+R$ {d.bonusAmount.toFixed(2).replace(".", ",")} bÃ´nus</p>}
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
      toast({ title: "SolicitaÃ§Ã£o enviada!", description: "Seu saque estÃ¡ em anÃ¡lise e serÃ¡ processado em breve." });
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
        <p className="text-sm text-gray-500 mb-1">Saldo disponÃ­vel para saque</p>
        <p className="text-2xl font-bold text-yellow-400">R$ {(user?.balance ?? 0).toFixed(2).replace(".", ",")}</p>
        {(user?.bonusBalance ?? 0) > 0 && (
          <p className="text-xs text-gray-400 mt-1">ğŸ BÃ´nus R$ {(user?.bonusBalance ?? 0).toFixed(2).replace(".", ",")} â€” nÃ£o disponÃ­vel para saque</p>
        )}
      </div>

      <div className="rounded-xl p-4 border border-blue-100 bg-white/80 space-y-3">
        <p className="text-sm font-semibold text-white">Solicitar Saque</p>
        <div className="space-y-2">
          <Label className="text-xs text-gray-500">Valor (mÃ­n. R$ 20,00)</Label>
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
          <Label className="text-xs text-gray-500">Chave PIX (CPF, e-mail, telefone ou chave aleatÃ³ria)</Label>
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
        <p className="text-xs text-gray-400 text-center">O saque serÃ¡ processado em atÃ© 24 horas Ãºteis</p>
      </div>

      {withdrawals.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-500">HistÃ³rico de saques</p>
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
    if (newPassword !== confirmPassword) return toast({ title: "Senhas nÃ£o coincidem", variant: "destructive" });
    if (newPassword.length < 6) return toast({ title: "Senha mÃ­nima de 6 caracteres", variant: "destructive" });
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
      toast({ title: "Erro de conexÃ£o", variant: "destructive" });
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
    if (type === "deposit") return "DepÃ³sito";
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
          <p className="text-gray-500 text-sm">Nenhuma transaÃ§Ã£o encontrada</p>
          <p className="text-gray-400 text-xs mt-1">Suas movimentaÃ§Ãµes de saldo aparecerÃ£o aqui</p>
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
                  <p className="text-xs text-gray-400">{format(new Date(t.createdAt), "dd/MM/yyyy HH:mm", { fçWB×&VfW'&ÂÖ6öFR ¢óà¢Ä'WGFöà¢öä6Æ–6³×²‚’Óâ6fT×WFF–öâæ×WFFR†6öFR—Ğ¢F—6&ÆVC×²6öFRÇÂ6öFRæÆVæwF‚Â2ÇÂ6fT×WFF–öâæ—5VæF–æwĞ¢6Æ74æÖSÒ&&r×–VÆÆ÷rÓC†÷fW#¦&r×–VÆÆ÷rÓSFW‡BÖ&Æ6²föçBÖ&öÆB6‡&–æ²Ó ¢FF×FW7F–CÒ&'WGFöâ×6fR×&VfW'&ÂÖ6öFR ¢à¢·6fT×WFF–öâæ—5VæF–ærò"âââ"¢%6Çf"'Ğ¢Âô'WGFöãà¢ÂöF—cà¢ÂöF—cà ¢¶†46öFRbb€¢ÆF—b6Æ74æÖSÒ'76R×’Ó2#à¢ÆF—b6Æ74æÖSÒ'&÷VæFVB×†ÂÓ2&÷&FW"&÷&FW"Ö&ÇVRÓ&r×v†—FRóƒ#à¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡BÖw&’ÓSÖ"Ó#äÆ–æ²FR6öçf—FSÂ÷à¢Ç6Æ74æÖSÒ'FW‡B×‡2föçBÖÖöæòFW‡B×–VÆÆ÷rÓs'&V²ÖÆÂ#ç¶–çf—FTÆ–æ·ÓÂ÷à¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓ"#à¢Ä'WGFöà¢f&–çCÒ&÷WFÆ–æR ¢6Æ74æÖSÒ&fÆW‚Ó&÷&FW"Ö&ÇVRÓ#FW‡BÖw&’Ós†÷fW#¦&rÖ&ÇVRÓS ¢öä6Æ–6³×¶6÷”Æ–æ·Ğ¢FF×FW7F–CÒ&'WGFöâÖ6÷’Ö–çf—FRÖÆ–æ² ¢à¢Ä6÷’6Æ74æÖSÒ'rÓB‚ÓB×"Ó""óà¢¶6÷–VBò$6÷–Fò"¢$6÷–"Æ–æ²'Ğ¢Âô'WGFöãà¢Ä'WGFöà¢6Æ74æÖSÒ&fÆW‚Ó&rÕ²3#TC3ceÒ†÷fW#¦&rÕ²3V&SVEÒFW‡B×v†—FRföçBÖ&öÆB ¢öä6Æ–6³×·6†&Uv†G4Ğ¢FF×FW7F–CÒ&'WGFöâ×6†&RÖ–çf—FR×v†G6 ¢à¢Å6•v†G66Æ74æÖSÒ'rÓB‚ÓB×"Ó""óà¢6ö×'F–Æ† ¢Âô'WGFöãà¢ÂöF—cà¢ÂöF—cà¢—Ğ¢ÂöF—cà¢“°§Ğ ¦6öç7BÄUdTÅôäÔU3¢&V6÷&CÆçVÖ&W"Â7G&–æsâÒ²¢$'&öç¦R"Â#¢%&F"Â3¢$÷W&ò"ÂC¢$F–ÖçFR"Ó°¦6öç7BÄUdTÅô4ôÄõ%3¢&V6÷&CÆçVÖ&W"Â7G&–æsâÒ°¢¢'FW‡BÖÖ&W"Ós&rÖÖ&W"Ó&÷&FW"ÖÖ&W"Ó3"À¢#¢'FW‡BÖw&’ÓS&rÖw&’Ó&÷&FW"Öw&’Ó3"À¢3¢'FW‡B×–VÆÆ÷rÓc&r×–VÆÆ÷rÓS&÷&FW"×–VÆÆ÷rÓ3"À¢C¢'FW‡BÖ7–âÓc&rÖ7–âÓS&÷&FW"Ö7–âÓ3"À§Ó° ¦gVæ7F–öâ6÷'FUfW&æõf–Wr‡²öä&6²Ó¢²öä&6³¢‚’Óâfö–BÒ’°¢6öç7B²FF¢çVÖ&W'2ÒµÒÂ—4ÆöF–ærÒÒW6UVW'“Å6÷'FUfW&æôçVÖ&W%µÓâ‡°¢VW'”¶W“¢²"ö’÷6÷'FR×fW&æò%ÒÀ¢VW'”fã¢7–æ2‚’Óâ°¢6öç7B&W2Òv—BfWF6‚‚"ö’÷6÷'FR×fW&æò"Â²7&VFVçF–Ç3¢&–æ6ÇVFR"Ò“°¢–b‚&W2æö²’F‡&÷ræWrW'&÷"‚$W'&ò"“°¢&WGW&â&W2æ§6öâ‚“°¢ÒÀ¢Ò“° ¢òòw&÷W'’W&–ö@¢6öç7B'•W&–öBÒ4õ%DUõdU$äõõU$”ôE2ç&VGV6SÅ&V6÷&CÆçVÖ&W"Â6÷'FUfW&æôçVÖ&W%µÓãâ‚†62Â’Óâ°¢65·æ–EÒÒçVÖ&W'2æf–ÇFW"†âÓââçW&–öD–BÓÓÒæ–B“°¢&WGW&â63°¢ÒÂ·Ò“° ¢6öç7BFöF’ÒæWrFFR‚’çFô•4õ7G&–ær‚’ç6Æ–6RƒÂ“°¢6öç7B7F—fUW&–öG2Ò4õ%DUõdU$äõõU$”ôE2æf–ÇFW"‡ÓâFöF’ãÒæ6öÆÆV7F–öå7F'BbbFöF’ÃÒæ6öÆÆV7F–öäVæB“° ¢&WGW&â€¢ÆF—b6Æ74æÖSÒ'76R×’ÓB#à¢Æ'WGFöâöä6Æ–6³×¶öä&6·Ò6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓFW‡B×6ÒFW‡BÖ&ÇVRÓc†÷fW#§FW‡BÖ&ÇVRÓƒ#à¢Ä6†Wg&öäÆVgB6Æ74æÖSÒ'rÓB‚ÓB"óâföÇF ¢Âö'WGFöãà ¢ÆF—b6Æ74æÖSÒ'&÷VæFVB×†Â&÷&FW"&÷&FW"×–VÆÆ÷rÓ#&rÖw&F–VçB×FòÖ'"g&öÒ×–VÆÆ÷rÓSFòÖÖ&W"ÓSÓBfÆW‚—FV×2×7F'BvÓ2#à¢Å7&¶ÆW26Æ74æÖSÒ'rÓR‚ÓRFW‡B×–VÆÆ÷rÓS×BÓãRfÆW‚×6‡&–æ²Ó"óà¢ÆF—cà¢Ç6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆBFW‡BÖÖ&W"Óƒ#ä6öÖògVæ6–öæÂ÷à¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡BÖÖ&W"Ós×BÓãRÆVF–ær×&VÆ†VB#à¢òF–æv—"VÖ&V6ö×Vç6æò6ÇV&RfW&æòÂfö<:¢&V6V&Rì;¦ÖW&÷2F6÷'FS ¢'&öç¦Rì;¦ÖW&ò+r&F"+r÷W&ò2+rF–ÖçFRBãÆ'"óà¢6÷'FV–÷2ÖVç6—26öÒ,:¦Ö–÷2W†6ÇW6—f÷2¢Â÷à¢ÂöF—cà¢ÂöF—cà ¢ÆF—b7G–ÆS×·²†V–v‡C¢#Sf‚"Â÷fW&fÆ÷u“¢&WFò"ÂvV&¶—D÷fW&fÆ÷u67&öÆÆ–æs¢'F÷V6‚"ÂFF–æu&–v‡C¢B×Óà¢¶—4ÆöF–ærò€¢ÆF—b6Æ74æÖSÒ'76R×’Ó2#à¢µ³Â"Â5ÒæÖ†’ÓâÆF—b¶W“×¶—Ò6Æ74æÖSÒ&‚Ó#&rÖ&ÇVRÓ&÷VæFVB×†Âæ–ÖFR×VÇ6R"óâ—Ğ¢ÂöF—cà¢’¢çVÖ&W'2æÆVæwF‚ÓÓÒò€¢ÆF—b6Æ74æÖSÒ'FW‡BÖ6VçFW"’ÓFW‡BÖw&’ÓC#à¢Å7&¶ÆW26Æ74æÖSÒ'rÓ‚Ó×‚ÖWFòÖ"Ó2÷6—G’Ó3"óà¢Ç6Æ74æÖSÒ'FW‡B×6ÒföçBÖÖVF—VÒ#äæVæ‡VÒì;¦ÖW&òvW&Fò–æFÂ÷à¢Ç6Æ74æÖSÒ'FW‡B×‡2×BÓ#ä7V×VÆR÷7F2æò6ÇV&RfW&æò&væ†"ì;¦ÖW&÷2F6÷'FRÂ÷à¢ÂöF—cà¢’¢€¢ÆF—b6Æ74æÖSÒ'76R×’ÓB#à¢µ4õ%DUõdU$äõõU$”ôE2æÖ‡W&–öBÓâ°¢6öç7BW&–öDçV×2Ò'•W&–öE·W&–öBæ–EÒóòµÓ°¢–b‡W&–öDçV×2æÆVæwF‚ÓÓÒ’&WGW&âçVÆÃ°¢6öç7B—47F—fRÒFöF’ãÒW&–öBæ6öÆÆV7F–öå7F'BbbFöF’ÃÒW&–öBæ6öÆÆV7F–öäVæC°¢&WGW&â€¢ÆF—b¶W“×·W&–öBæ–GÒ6Æ74æÖSÒ'&÷VæFVB×†Â&÷&FW"&÷&FW"Ö&ÇVRÓ&r×v†—FRóƒÓB#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâÖ"Ó2#à¢ÆF—cà¢Ç6Æ74æÖSÒ'FW‡B×6ÒföçBÖ&öÆBFW‡BÖw&’Óƒ#ç·W&–öBæÆ&VÇÓÂ÷à¢Ç6Æ74æÖSÒ'FW‡BÕ³…ÒFW‡BÖw&’ÓC×BÓãR#à¢W&:|:6ó¢·W&–öBæ6öÆÆV7F–öå7F'Bç7Æ—B‚"Ò"’ç&WfW'6R‚’æ¦ö–â‚"ò"—Ò(	2·W&–öBæ6öÆÆV7F–öäVæBç7Æ—B‚"Ò"’ç&WfW'6R‚’æ¦ö–â‚"ò"—Ğ¢Â÷à¢Ç6Æ74æÖSÒ'FW‡BÕ³…ÒFW‡BÖw&’ÓC#à¢6÷'FV–ó¢·W&–öBæG&tFFRç7Æ—B‚"Ò"’ç&WfW'6R‚’æ¦ö–â‚"ò"—Ğ¢Â÷à¢ÂöF—cà¢¶—47F—fRbb€¢Ç7â6Æ74æÖSÒ'FW‡BÕ³…ÒföçBÖ&öÆB‚Ó"’ÓãR&÷VæFVBÖgVÆÂ&rÖw&VVâÓFW‡BÖw&VVâÓs&÷&FW"&÷&FW"Öw&VVâÓ##à¢F—fğ¢Â÷7ãà¢—Ğ¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ"#à¢·W&–öDçV×2æÖ†âÓâ€¢ÆF—b¶W“×¶âæ–GÒ6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"vÓ#à¢ÆF—b6Æ74æÖSÒ'rÓB‚ÓB&÷VæFVB×†Â&rÖw&F–VçB×FòÖ'"g&öÒÖ&ÇVRÓSFòÖ&ÇVRÓsfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"6†F÷r×6Ò#à¢Ç7â6Æ74æÖSÒ'FW‡B×v†—FRföçBÖ&Æ6²FW‡BÖÆrG&6¶–ær×v–FW7B#ç¶âæçVÖ&W'ÓÂ÷7ãà¢ÂöF—cà¢Ç7â6Æ74æÖS×¶FW‡BÕ³—…ÒföçBÖ&öÆB‚ÓãR’ÓãR&÷VæFVBÖgVÆÂ&÷&FW"G´ÄUdTÅô4ôÄõ%5¶âæ6ÇV$ÆWfVÅ×ÖÓà¢´ÄUdTÅôäÔU5¶âæ6ÇV$ÆWfVÅ×Ğ¢Â÷7ãà¢ÂöF—cà¢’—Ğ¢ÂöF—cà¢ÂöF—cà¢“°¢Ò—Ğ¢ÂöF—cà¢—Ğ¢ÂöF—cà ¢¶7F—fUW&–öG2æÆVæwF‚âbb€¢Ç6Æ74æÖSÒ'FW‡BÕ³…ÒFW‡BÖw&’ÓCFW‡BÖ6VçFW"#à¢¶7F—fUW&–öG2æÆVæwF‡ÒW&:|:6òŒ;VW2’F—f‡2’+rì;¦ÖW&÷2vW&F÷2WFöÖF–6ÖVçFRò&V6V&W",;FçW26ÇV&RfW&æğ¢Â÷à¢—Ğ¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâ'VÆW5f–Wr‡²öä&6²Ó¢²öä&6³¢‚’Óâfö–BÒ’°¢6öç7B²FFÂ—4ÆöF–ærÒÒW6UVW'“Ç²6öçFVçC¢7G&–ærÓâ‡°¢VW'”¶W“¢²"ö’÷'VÆW2%ÒÀ¢Ò“°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ'76R×’ÓB#à¢Æ'WGFöâöä6Æ–6³×¶öä&6·Ò6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓFW‡B×6ÒFW‡BÖ&ÇVRÓc†÷fW#§FW‡BÖ&ÇVRÓƒ#à¢Ä6†Wg&öäÆVgB6Æ74æÖSÒ'rÓB‚ÓB"óâföÇF ¢Âö'WGFöãà¢ÆF—b7G–ÆS×·²†V–v‡C¢#cf‚"Â÷fW&fÆ÷u“¢&WFò"ÂvV&¶—D÷fW&fÆ÷u67&öÆÆ–æs¢'F÷V6‚"ÂFF–æu&–v‡C¢‚×Óà¢¶—4ÆöF–ærò€¢ÆF—b6Æ74æÖSÒ'76R×’Ó2’Ó"#à¢´'&’æg&öÒ‡²ÆVæwFƒ¢‚Ò’æÖ‚…òÂ’’Óâ€¢ÆF—b¶W“×¶—Ò6Æ74æÖSÒ&‚Ó2&rÖ&ÇVRÓ&÷VæFVBæ–ÖFR×VÇ6R"7G–ÆS×·²v–GFƒ¢G³cR²†’R2’¢'ÒV×Òóà¢’—Ğ¢ÂöF—cà¢’¢FFòæ6öçFVçBò€¢Ç6Æ74æÖSÒ'FW‡BÖw&’ÓSFW‡B×6ÒFW‡BÖ6VçFW"’Ó‚#äæVæ‡VÖ&Vw&6F7G&F–æFãÂ÷à¢’¢€¢ÆF—`¢6Æ74æÖSÒ'&÷6R&÷6R×6ÒF&³§&÷6RÖ–çfW'BÖ‚×rÖæöæR’Ó'VÆW2Ö6öçFVçB ¢FævW&÷W6Ç•6WD–ææW$…DÔÃ×·²õö‡FÖÃ¢FFæ6öçFVçB×Ğ¢óà¢—Ğ¢ÂöF—cà¢ÂöF—cà¢“°§Ğ ¦W‡÷'BgVæ7F–öâ&öf–ÆTÖöFÂ‡²÷VâÂöä6Æ÷6RÓ¢&÷2’°¢6öç7B²W6W"ÂÆöv÷WBÂ&Vg&W6…W6W"ÒÒW6TWF‚‚“°¢6öç7B·f–WrÂ6WEf–WuÒÒW6U7FFSÅf–Wsâ‚&ÖVçR"“° ¢6öç7B²Fö7BÒÒW6UFö7B‚“° ¢6öç7B²FF¢6ÇV$gu&öw&W72ÒÒW6UVW'“Ç°¢vVVµ7F'C¢7G&–æs°¢vVV¶Ç•7F¶S¢çVÖ&W#°¢6Æ–ÖVDÆWfVÇ3¢çVÖ&W%µÓ°¢æWtÆWfVÇ3¢çVÖ&W%µÓ°¢æWt&öçW3¢çVÖ&W#°¢Óâ‡°¢VW'”¶W“¢²"ö’ö6ÇV"Ögr÷&öw&W72%ÒÀ¢VW'”fã¢7–æ2‚’Óâ°¢6öç7B&W2Òv—BfWF6‚‚"ö’ö6ÇV"Ögr÷&öw&W72"“°¢–b‚&W2æö²’F‡&÷ræWrW'&÷"‚&f–ÆVB"“°¢&WGW&â&W2æ§6öâ‚“°¢ÒÀ¢Væ&ÆVC¢W6W"bb÷VâÀ¢&VfWF6„–çFW'fÃ¢fÇ6RÀ¢Ò“° ¢W6TVffV7B‚‚’Óâ°¢–b†6ÇV$gu&öw&W72bb6ÇV$gu&öw&W72ææWt&öçW2â’°¢†F–4ÖVF—VÒ‚“°¢Fö7B‡°¢F—FÆS¢/	øøb6ÇV&RfW&æò(	B,;FçW27&VF—FFò"À¢FW67&—F–öã¢µ"BG¶6ÇV$gu&öw&W72ææWt&öçW2çFôf—†VBƒ"’ç&WÆ6R‚"â"Â"Â"—ÒF–6–öæF÷2ò6WR6ÆFò,;FçW2æÀ¢Ò“°¢&Vg&W6…W6W"‚“°¢Ğ¢ÒÂ¶6ÇV$gu&öw&W73òææWt&öçW5Ò“° ¢–b‚W6W"’&WGW&âçVÆÃ° ¢6öç7BÖVçT—FV×2Ò°¢²–C¢&FW÷6—B"2f–WrÂ–6öã¢Ä7&VF—D6&B6Æ74æÖSÒ'rÓR‚ÓR"óâÂÆ&VÃ¢$FW÷6—F""ÂFW63¢$F–6–öæ"6ÆFòf–•‚"ÒÀ¢²–C¢'v—F†G&r"2f–WrÂ–6öã¢ÅvÆÆWB6Æ74æÖSÒ'rÓR‚ÓR"óâÂÆ&VÃ¢%6VW2"ÂFW63¢%6öÆ–6—F"&WF—&F"ÒÀ¢²–C¢&†—7F÷'’"2f–WrÂ–6öã¢Ä†—7F÷'’6Æ74æÖSÒ'rÓR‚ÓR"óâÂÆ&VÃ¢$W‡G&Fò"ÂFW63¢$†—7L;7&–6òFRÖ÷f–ÖVçF:|;VW2"ÒÀ¢²–C¢&66÷VçB"2f–WrÂ–6öã¢ÅW6W"6Æ74æÖSÒ'rÓR‚ÓR"óâÂÆ&VÃ¢$Ö–æ†6öçF"ÂFW63¢$FF÷2R6Væ†"ÒÀ¢²–C¢&–çf—FR"2f–WrÂ–6öã¢Äv–gB6Æ74æÖSÒ'rÓR‚ÓR"óâÂÆ&VÃ¢$6öçf—FR"ÂFW63¢%6WR<;6F–vòFR–æF–6:|:6ò"ÒÀ¢²–C¢'6÷'FR"2f–WrÂ–6öã¢Å7&¶ÆW26Æ74æÖSÒ'rÓR‚ÓR"óâÂÆ&VÃ¢%6÷'FRfW&æò"ÂFW63¢%6WW2ì;¦ÖW&÷2F6÷'FR"ÒÀ¢âââ†—4æF—fR‚’ò·²–C¢&6öæf–wW&6öW2"2f–WrÂ–6öã¢Å6WGF–æw26Æ74æÖSÒ'rÓR‚ÓR"óâÂÆ&VÃ¢$6öæf–wW&:|;VW2"ÂFW63¢$æ÷F–f–6:|;VW2Â&–öÖWG&–RFVÖ"ÕÒ¢µÒ’À¢²–C¢''VÆW2"2f–WrÂ–6öã¢Ä&öö´÷Vâ6Æ74æÖSÒ'rÓR‚ÓR"óâÂÆ&VÃ¢%&Vw&2Fò6—FR"ÂFW63¢%FW&Ö÷2R6öæFœ:|;VW2"ÒÀ¢Ó° ¢–b‚÷Vâ’&WGW&âçVÆÃ°¢&WGW&â€¢Ãà¢²ò¢&6¶G&÷(	B6VÒ&F—‚Â6VÒ÷'FÂÂ6VÒfö7W566÷R¢÷Ğ¢ÆF—`¢7G–ÆS×·²÷6—F–öã¢&f—†VB"Â–ç6WC¢Â¤–æFWƒ¢SÂ&6¶w&÷VæC¢'&v&ƒÃÃÃã‚’"×Ğ¢öä6Æ–6³×²‚’Óâ²6WEf–Wr‚&ÖVçR"“²öä6Æ÷6R‚“²×Ğ¢óà¢²ò¢6öçF\;¦FòFòÖöFÂ¢÷Ğ¢ÆF—b7G–ÆS×·°¢÷6—F–öã¢&f—†VB"À¢ÆVgC¢#SR"ÂF÷¢#SR"À¢G&ç6f÷&Ó¢'G&ç6ÆFR‚ÓSRÂÓSR’"À¢¤–æFWƒ¢SÀ¢v–GFƒ¢&6Æ2ƒgrÒg‚’"À¢Ö…v–GFƒ¢##G&VÒ"À¢&6¶w&÷VæC¢&Æ–æV"Öw&F–VçB‡Fò&÷GFöÒÂ6c†f&fbÂ6F&VfR’"À¢&÷&FW#¢#‚6öÆ–B&v&ƒCrÃ“rÃ#S2ÃãR’"À¢6öÆ÷#¢"3ƒ#r"À¢&÷&FW%&F—W3¢#ãW&VÒ"À¢FF–æs¢#ãW&VÒ"À¢&÷…6†F÷s¢##‚c‚&v&ƒÃÃÃãB’"À¢Ö„†V–v‡C¢#“f‚"À¢÷fW&fÆ÷u“¢&WFò"À¢vV&¶—D÷fW&fÆ÷u67&öÆÆ–æs¢'F÷V6‚"À¢Ò2&V7Bä555&÷W'F–W7Óà¢²ò¢†VFW"¢÷Ğ¢ÆF—b7G–ÆS×·²F—7Æ“¢&fÆW‚"Â§W7F–g”6öçFVçC¢'76RÖ&WGvVVâ"ÂÆ–vä—FV×3¢&6VçFW""ÂÖ&v–ä&÷GFöÓ¢#&VÒ"×Óà¢Æƒ"7G–ÆS×·²föçEvV–v‡C¢sÂföçE6—¦S¢#ã#W&VÒ"×Óà¢·f–WrÓÓÒ&ÖVçR"bb%W&f–Â'Ğ¢·f–WrÓÓÒ&FW÷6—B"bb$FW÷6—F"'Ğ¢·f–WrÓÓÒ'v—F†G&r"bb%6VW2'Ğ¢·f–WrÓÓÒ&†—7F÷'’"bb$W‡G&Fò'Ğ¢·f–WrÓÓÒ&66÷VçB"bb$Ö–æ†6öçF'Ğ¢·f–WrÓÓÒ&–çf—FR"bb$6öçf—FR'Ğ¢·f–WrÓÓÒ'6÷'FR"bb%6÷'FRfW&æò'Ğ¢·f–WrÓÓÒ&6öæf–wW&6öW2"bb$6öæf–wW&:|;VW2'Ğ¢·f–WrÓÓÒ''VÆW2"bb%&Vw&2Fò6—FR'Ğ¢Âöƒ#à¢Æ'WGFöà¢öä6Æ–6³×²‚’Óâ²6WEf–Wr‚&ÖVçR"“²öä6Æ÷6R‚“²×Ğ¢7G–ÆS×·²÷6—G“¢ãrÂFF–æs¢BÂF÷V6„7F–öã¢&Öæ—VÆF–öâ"Â&6¶w&÷VæC¢&æöæR"Â&÷&FW#¢&æöæR"Â7W'6÷#¢'ö–çFW""×Ğ¢à¢Å‚6Æ74æÖSÒ&‚ÓBrÓB"óà¢Âö'WGFöãà¢ÂöF—cà ¢·f–WrÓÓÒ&ÖVçR"bb€¢ÆF—b7G–ÆS×·²Ö„†V–v‡C¢#sf‚"Â÷fW&fÆ÷u“¢&WFò"ÂvV&¶—D÷fW&fÆ÷u67&öÆÆ–æs¢'F÷V6‚"×Óà¢ÆF—b6Æ74æÖSÒ'76R×’ÓB"Ó#à¢ÆF—b6Æ74æÖSÒ'&÷VæFVB×†ÂÓB&÷&FW"&÷&FW"Ö&ÇVRÓ&r×v†—FRóƒ#à¢Ç6Æ74æÖSÒ'FW‡B×6ÒFW‡BÖw&’Óc#äöÌ:ÂÇ7â6Æ74æÖSÒ'FW‡BÖw&’Ó“föçB×6VÖ–&öÆB#ç·W6W"ææÖRç7Æ—B‚""•³×ÓÂ÷7ããÂ÷à¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡BÖw&’ÓC×BÓãR#ç·W6W"æ7bç&WÆ6R‚ò…ÆG³7Ò’…ÆG³7Ò’…ÆG³7Ò’…ÆG³'Ò’òÂ"CâC"âC2ÒCB"—ÓÂ÷à¢ÆF—b6Æ74æÖSÒ&×BÓ2BÓ2&÷&FW"×B&÷&FW"Ö&ÇVRÓ#à¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡BÖw&’ÓS#å6ÆFòF÷FÃÂ÷à¢Ç6Æ74æÖSÒ'FW‡BÓ'†ÂföçBÖ&öÆBFW‡B×–VÆÆ÷rÓC#à¢"B²‡W6W"æ&Ææ6R²‡W6W"æ&öçW4&Ææ6Róò’’çFôf—†VBƒ"’ç&WÆ6R‚"â"Â"Â"—Ğ¢Â÷à¢²‡W6W"æ&öçW4&Ææ6Róò’âbb€¢ÆF—b6Æ74æÖSÒ&×BÓãRfÆW‚vÓ2FW‡B×‡2FW‡BÖw&’ÓS#à¢Ç7ãï	ù+&–æ6—Ã¢Ç7â6Æ74æÖSÒ'FW‡BÖw&’Ó“föçB×6VÖ–&öÆB#å"B·W6W"æ&Ææ6RçFôf—†VBƒ"’ç&WÆ6R‚"â"Â"Â"—ÓÂ÷7ããÂ÷7ãà¢Ç7ãï	øè,;FçW3¢Ç7â6Æ74æÖSÒ'FW‡BÖw&VVâÓCföçB×6VÖ–&öÆB#å"B²‡W6W"æ&öçW4&Ææ6Róò’çFôf—†VBƒ"’ç&WÆ6R‚"â"Â"Â"—ÓÂ÷7ããÂ÷7ãà¢ÂöF—cà¢—Ğ¢ÂöF—cà¢ÂöF—cà¢²ò¢6ÇV&Rer¢÷Ğ¢²‚‚’Óâ°¢6öç7BvVV¶Ç•7F¶RÒ6ÇV$gu&öw&W73òçvVV¶Ç•7F¶Róò°¢6öç7BÔ‚Ò°¢6öç7B7BÒÖF‚æÖ–âƒÂ‡vVV¶Ç•7F¶RòÔ‚’¢“°¢6öç7BæW‡DÆWfVÂÒ4ÅT%ôeuôÄUdTÅ2æf–æB†ÂÓâvVV¶Ç•7F¶RÂÂçF‡&W6†öÆB“°¢6öç7BÆÄFöæRÒvVV¶Ç•7F¶RãÒÔƒ° ¢6öç7BD”U%2Ò°¢°¢Æ&VÃ¢$'&öç¦R"À¢–6öã¢/	úX’"À¢vÆ÷s¢'&v&ƒ#C’ÃRÃ#"ÃãCR’"À¢F÷C¢&&rÖ÷&ævRÓƒ&÷&FW"Ö÷&ævRÓs"À¢F÷E&V6†VC¢&&rÖ÷&ævRÓC&÷&FW"Ö÷&ævRÓ3"À¢6&C¢&&rÖ÷&ævRÓ“SóC&÷&FW"Ö÷&ævRÓƒóS"À¢6&E&V6†VC¢&&rÖ÷&ævRÓ“óC&÷&FW"Ö÷&ævRÓSós"À¢æÖS¢'FW‡BÖ÷&ævRÓ3"À¢æÖU&V6†VC¢'FW‡BÖ÷&ævRÓ#"À¢&öçW3¢'FW‡BÖ÷&ævRÓ3"À¢&öçW5&V6†VC¢'FW‡BÖ÷&ævRÓ#"À¢ÒÀ¢°¢Æ&VÃ¢%&F"À¢–6öã¢/	úX‚"À¢vÆ÷s¢'&v&ƒ3"Ã#BÃ#"ÃãCR’"À¢F÷C¢&&rÖÆ–ÖRÓƒ&÷&FW"ÖÆ–ÖRÓs"À¢F÷E&V6†VC¢&&rÖÆ–ÖRÓC&÷&FW"ÖÆ–ÖRÓ3"À¢6&C¢&&rÖÆ–ÖRÓ“SóC&÷&FW"ÖÆ–ÖRÓƒóS"À¢6&E&V6†VC¢&&rÖÆ–ÖRÓ“óC&÷&FW"ÖÆ–ÖRÓSós"À¢æÖS¢'FW‡BÖÆ–ÖRÓ3"À¢æÖU&V6†VC¢'FW‡BÖÆ–ÖRÓ#"À¢&öçW3¢'FW‡BÖÆ–ÖRÓ3"À¢&öçW5&V6†VC¢'FW‡BÖÆ–ÖRÓ#"À¢ÒÀ¢°¢Æ&VÃ¢$÷W&ò"À¢–6öã¢/	úXr"À¢vÆ÷s¢'&v&ƒc‚ÃƒRÃ#CrÃãCR’"À¢F÷C¢&&r×W'ÆRÓƒ&÷&FW"×W'ÆRÓs"À¢F÷E&V6†VC¢&&r×W'ÆRÓC&÷&FW"×W'ÆRÓ3"À¢6&C¢&&r×W'ÆRÓ“SóC&÷&FW"×W'ÆRÓƒóS"À¢6&E&V6†VC¢&&r×W'ÆRÓ“óC&÷&FW"×W'ÆRÓSós"À¢æÖS¢'FW‡B×W'ÆRÓ3"À¢æÖU&V6†VC¢'FW‡B×W'ÆRÓ#"À¢&öçW3¢'FW‡B×W'ÆRÓ3"À¢&öçW5&V6†VC¢'FW‡B×W'ÆRÓ#"À¢ÒÀ¢°¢Æ&VÃ¢$F–ÖçFR"À¢–6öã¢/	ù(â"À¢vÆ÷s¢'&v&ƒ3BÃ#Ã#3‚ÃãCR’"À¢F÷C¢&&rÖ7–âÓƒ&÷&FW"Ö7–âÓs"À¢F÷E&V6†VC¢&&rÖ7–âÓC&÷&FW"Ö7–âÓ3"À¢6&C¢&&rÖ7–âÓ“SóC&÷&FW"Ö7–âÓƒóS"À¢6&E&V6†VC¢&&rÖ7–âÓ“óC&÷&FW"Ö7–âÓSós"À¢æÖS¢'FW‡BÖ7–âÓ3"À¢æÖU&V6†VC¢'FW‡BÖ7–âÓ#"À¢&öçW3¢'FW‡BÖ7–âÓ3"À¢&öçW5&V6†VC¢'FW‡BÖ7–âÓ#"À¢ÒÀ¢Ó° ¢&WGW&â€¢ÆF—b6Æ74æÖSÒ'&÷VæFVB×†ÂÓB&÷&FW"&÷&FW"×–VÆÆ÷rÓcóC"7G–ÆS×·²&6¶w&÷VæC¢&Æ–æV"Öw&F–VçBƒcFVrÂ3v3FRÂ6#ƒsS3RÂ6CC“cbSRRÂ63Cv3RsRRÂ3†S#R’"×ÒFF×FW7F–CÒ&6&BÖ6ÇV&RÖgr#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"Ö"Ó2#à¢ÅG&÷‡’6Æ74æÖSÒ'rÓB‚ÓBFW‡B×–VÆÆ÷rÓC"óà¢Ç7â6Æ74æÖSÒ&föçBÖ&öÆBFW‡B×6ÒFW‡B×–VÆÆ÷rÓC#ä6ÇV&RfW&æóÂ÷7ãà¢Ç7â6Æ74æÖSÒ&ÖÂÖWFòFW‡B×‡2FW‡B×–VÆÆ÷rÓ#ós#ç6VÖæGVÃÂ÷7ãà¢ÂöF—cà ¢²ò¢&'&FR&öw&W76ò¢÷Ğ¢ÆF—b6Æ74æÖSÒ'&VÆF—fR‚Ó"ãR&rÖ&Æ6²ó#&÷VæFVBÖgVÆÂÖ"ÓB÷fW&fÆ÷r×f—6–&ÆR#à¢ÆF—`¢6Æ74æÖSÒ&'6öÇWFR–ç6WB×’ÓÆVgBÓ&÷VæFVBÖgVÆÂG&ç6—F–öâÖÆÂGW&F–öâÓS ¢7G–ÆS×·°¢v–GFƒ¢G·7GÒVÀ¢&6¶w&÷VæC¢&Æ–æV"Öw&F–VçB‡Fò&–v‡BÂ6c“s3bÂ3ƒF63bÂ6ƒSVcrÂ3#&C6VR’"À¢×Ğ¢óà¢´4ÅT%ôeuôÄUdTÅ2æÖ‚‡²ÆWfVÂÂF‡&W6†öÆBÒÂ–G‚’Óâ°¢6öç7B÷2Ò‡F‡&W6†öÆBòÔ‚’¢°¢6öç7B&V6†VBÒvVV¶Ç•7F¶RãÒF‡&W6†öÆC°¢6öç7BBÒD”U%5¶–G…Ó°¢&WGW&â€¢ÆF—`¢¶W“×¶ÆWfVÇĞ¢6Æ74æÖSÒ&'6öÇWFRF÷Óó"×G&ç6ÆFR×’Óó"×G&ç6ÆFR×‚Óó" ¢7G–ÆS×·²ÆVgC¢G·÷7ÒV×Ğ¢à¢Ç7â6Æ74æÖS×¶FW‡BÖ&6RÆVF–ærÖæöæRG&÷×6†F÷rÖÖBG&ç6—F–öâÖÆÂG·&V6†VBò&÷6—G’Ó"¢&÷6—G’Ó3w&—66ÆR'ÖÓç·Bæ–6öçÓÂ÷7ãà¢ÂöF—cà¢“°¢Ò—Ğ¢ÂöF—cà ¢²ò¢ì:×fV—2¢÷Ğ¢²‚‚’Óâ°¢òò8ÖæF–6RFòì:×fVÂÖ—2ÇFòF–æv–Fò‚Ó6RæVæ‡VÒ¢6öç7B7W'&VçD–G‚Ò4ÅT%ôeuôÄUdTÅ2ç&VGV6R‚†62Â²F‡&W6†öÆBÒÂ–G‚’Óà¢vVV¶Ç•7F¶RãÒF‡&W6†öÆBò–G‚¢62ÂÓ“°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2ÓBvÓÖ"Ó2#à¢´4ÅT%ôeuôÄUdTÅ2æÖ‚‡²ÆWfVÂÂF‡&W6†öÆBÂ&öçW2ÒÂ–G‚’Óâ°¢6öç7BBÒD”U%5¶–G…Ó°¢6öç7B—57BÒ–G‚Â7W'&VçD–Gƒ°¢6öç7B—47W'&VçBÒ–G‚ÓÓÒ7W'&VçD–Gƒ°¢6öç7B—4Æö6¶VBÒ–G‚â7W'&VçD–Gƒ°¢&WGW&â€¢ÆF—`¢¶W“×¶ÆWfVÇĞ¢6Æ74æÖS×¶&÷VæFVBÖÆrÓãRFW‡BÖ6VçFW"&÷&FW"G&ç6—F–öâÖ6öÆ÷'2&VÆF—fP¢G¶—47W'&VçBòG·Bæ6&E&V6†VGÒ&–ærÓ&–ærÖöfg6WBÓ¢"'Ğ¢G¶—57Bò&&rÖw&’Ó&÷&FW"Öw&’Ó#÷6—G’Óƒ"¢"'Ğ¢G¶—4Æö6¶VBòBæ6&B¢"'Ğ¢Ğ¢7G–ÆS×¶—47W'&VçBò²&÷…6†F÷s¢‡‚G·BævÆ÷wÖÒ¢VæFVf–æVGĞ¢à¢¶—57Bbb€¢ÆF—b6Æ74æÖSÒ&'6öÇWFR–ç6WBÓfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÆr&r×v†—FRós#à¢Ç7â6Æ74æÖSÒ'FW‡BÖw&VVâÓCföçBÖ&öÆBFW‡B×‡2#î)É3Â÷7ãà¢ÂöF—cà¢—Ğ¢Ç6Æ74æÖS×¶FW‡B×6ÒÆVF–ærÖæöæRÖ"ÓãRG¶—57Bò&w&—66ÆR÷6—G’ÓC"¢"'ÖÓç·Bæ–6öçÓÂ÷à¢Ç6Æ74æÖS×¶FW‡BÕ³—…ÒföçBÖ&öÆ@¢G¶—47W'&VçBòBææÖU&V6†VB¢"'Ğ¢G¶—57Bò'FW‡BÖw&’ÓC"¢"'Ğ¢G¶—4Æö6¶VBòBææÖR¢"'Ğ¢Óà¢·BæÆ&VÇĞ¢Â÷à¢Ç6Æ74æÖS×¶FW‡BÕ³—…ÒG¶—47W'&VçBò'FW‡B×v†—FRóƒ"¢'FW‡B×–VÆÆ÷rÓós'ÖÓà¢"G·F‡&W6†öÆBãÒò#²"¢F‡&W6†öÆGĞ¢Â÷à¢Ç6Æ74æÖS×¶FW‡BÕ³…ÒföçBÖ&öÆB×BÓãP¢G¶—47W'&VçBòBæ&öçW5&V6†VB¢"'Ğ¢G¶—57Bò'FW‡BÖw&’ÓSÆ–æR×F‡&÷Vv‚"¢"'Ğ¢G¶—4Æö6¶VBòBæ&öçW2¢"'Ğ¢Óà¢µ"G¶&öçW7Ğ¢Â÷à¢ÂöF—cà¢“°¢Ò—Ğ¢ÂöF—cà¢“°¢Ò’‚—Ğ ¢ÆF—b6Æ74æÖSÒ'76R×’ÓFW‡BÖ6VçFW"#à¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡B×–VÆÆ÷rÓó“#à¢¶ÆÄFöæP¢òÃï	ù(âÖWFF–æv–F,;FçW27&VF—FFòæ6VwVæF:2†ƒÂóà¢¢æW‡DÆWfVÀ¢òÃä÷7FFó¢Ç7â6Æ74æÖSÒ'FW‡B×v†—FRföçB×6VÖ–&öÆB#å"B·vVV¶Ç•7F¶RçFôf—†VBƒ"’ç&WÆ6R‚"â"Â"Â"—ÓÂ÷7ãâ+rfÇFÒÇ7â6Æ74æÖSÒ'FW‡B×–VÆÆ÷rÓ3föçB×6VÖ–&öÆB#å"B²†æW‡DÆWfVÂçF‡&W6†öÆBÒvVV¶Ç•7F¶R’çFôf—†VBƒ"’ç&WÆ6R‚"â"Â"Â"—ÓÂ÷7ãâòµD”U%5´4ÅT%ôeuôÄUdTÅ2æf–æD–æFW‚†ÂÓâÂæÆWfVÂÓÓÒæW‡DÆWfVÂæÆWfVÂ•ÒæÆ&VÇÓÂóà¢¢$6ö×æ†R6WR&öw&W76òV’'Ğ¢Â÷à¢Ç6Æ74æÖSÒ'FW‡BÕ³…ÒFW‡B×–VÆÆ÷rÓ#óc#à¢	ùYr&VÖ–:|:6òFöF6VwVæF:2†‚††÷,:&–òFRÖæW2¢Â÷à¢Ç6Æ74æÖSÒ'FW‡BÕ³…ÒFW‡B×–VÆÆ÷rÓ#óc#à¢,;FçW2ì:6ò7V×VÆF—fğ¢Â÷à¢ÂöF—cà¢ÂöF—cà¢“°¢Ò’‚—Ğ ¢ÆF—b6Æ74æÖSÒ'76R×’Ó"#à¢¶ÖVçT—FV×2æÖ†—FVÒÓâ€¢Æ'WGFöà¢¶W“×¶—FVÒæ–GĞ¢6Æ74æÖSÒ'rÖgVÆÂfÆW‚—FV×2Ö6VçFW"vÓ2&r×v†—FR†÷fW#¦&rÖ&ÇVRÓS&÷&FW"&÷&FW"Ö&ÇVRÓ&÷VæFVB×†Â‚ÓB’Ó2FW‡BÖÆVgBG&ç6—F–öâÖ6öÆ÷'2 ¢öä6Æ–6³×²‚’Óâ6WEf–Wr†—FVÒæ–B—Ğ¢FF×FW7F–C×¶'WGFöâ×&öf–ÆRÒG¶—FVÒæ–GÖĞ¢à¢Ç7â6Æ74æÖSÒ'FW‡B×–VÆÆ÷rÓC#ç¶—FVÒæ–6öçÓÂ÷7ãà¢ÆF—cà¢Ç6Æ74æÖSÒ&föçB×6VÖ–&öÆBFW‡B×6Ò#ç¶—FVÒæÆ&VÇÓÂ÷à¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡BÖw&’ÓS#ç¶—FVÒæFW67ÓÂ÷à¢ÂöF—cà¢Âö'WGFöãà¢’—Ğ¢Æ'WGFöà¢6Æ74æÖSÒ'rÖgVÆÂfÆW‚—FV×2Ö6VçFW"vÓ2&r×v†—FR†÷fW#¦&rÖ&ÇVRÓS&÷&FW"&÷&FW"Ö&ÇVRÓ&÷VæFVB×†Â‚ÓB’Ó2FW‡BÖÆVgBG&ç6—F–öâÖ6öÆ÷'2 ¢öä6Æ–6³×²‚’Óâv–æF÷ræ÷Vâ†‡GG3¢ò÷væÖRòGµt„E4õ5Uõ%GÓ÷FW‡CÒG¶Væ6öFUU$”6ö×öæVçB‚$öÌ:Â&V6—6òFR§VFâ"—ÖÂ%ö&Ææ²"—Ğ¢FF×FW7F–CÒ&'WGFöâ×&öf–ÆRÖfÆRÖ6öæ÷66ò ¢à¢Ç7â6Æ74æÖSÒ'FW‡B×–VÆÆ÷rÓC#ãÄÖW76vT6—&6ÆR6Æ74æÖSÒ'rÓR‚ÓR"óãÂ÷7ãà¢ÆF—cà¢Ç6Æ74æÖSÒ&föçB×6VÖ–&öÆBFW‡B×6Ò#äfÆR6öæ÷66óÂ÷à¢Ç6Æ74æÖSÒ'FW‡B×‡2FW‡BÖw&’ÓS#å7W÷'FRf–v†G4Â÷à¢ÂöF—cà¢Âö'WGFöãà¢ÂöF—cà¢Ä'WGFöâf&–çCÒ&÷WFÆ–æR"6Æ74æÖSÒ'rÖgVÆÂ&÷&FW"×&VBÓcFW‡B×&VBÓC†÷fW#¦&r×&VBÓ“ó#"öä6Æ–6³×²‚’Óâ²Æöv÷WB‚“²öä6Æ÷6R‚“²×ÒFF×FW7F–CÒ&'WGFöâ×&öf–ÆRÖÆöv÷WB#à¢ÄÆöt÷WB6Æ74æÖSÒ'rÓB‚ÓB×"Ó""óà¢6—"F6öçF¢Âô'WGFöãà¢ÂöF—cà¢ÂöF—cà¢—Ğ ¢·f–WrÓÓÒ&FW÷6—B"bbÄFW÷6—Ef–Wröä&6³×²‚’Óâ6WEf–Wr‚&ÖVçR"—ÒóçĞ¢·f–WrÓÓÒ'v—F†G&r"bbÅv—F†G&uf–Wröä&6³×²‚’Óâ6WEf–Wr‚&ÖVçR"—ÒóçĞ¢·f–WrÓÓÒ&†—7F÷'’"bbÄ†—7F÷'•f–Wröä&6³×²‚’Óâ6WEf–Wr‚&ÖVçR"—ÒóçĞ¢·f–WrÓÓÒ&66÷VçB"bbÄ66÷VçEf–Wröä&6³×²‚’Óâ6WEf–Wr‚&ÖVçR"—ÒóçĞ¢·f–WrÓÓÒ&–çf—FR"bbÄ–çf—FUf–Wröä&6³×²‚’Óâ6WEf–Wr‚&ÖVçR"—ÒóçĞ¢·f–WrÓÓÒ'6÷'FR"bbÅ6÷'FUfW&æõf–Wröä&6³×²‚’Óâ6WEf–Wr‚&ÖVçR"—ÒóçĞ¢·f–WrÓÓÒ&6öæf–wW&6öW2"bbÄ6öæf–wW&6öW5f–Wröä&6³×²‚’Óâ6WEf–Wr‚&ÖVçR"—ÒóçĞ¢·f–WrÓÓÒ''VÆW2"bbÅ'VÆW5f–Wröä&6³×²‚’Óâ6WEf–Wr‚&ÖVçR"—ÒóçĞ¢ÂöF—cà¢Âóà¢“°§Ğ