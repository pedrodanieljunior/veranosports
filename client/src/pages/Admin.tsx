import { useState, useMemo, useEffect, useRef } from "react";
import { fmtOdds } from "@/lib/formatOdds";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BetSlip as BetSlipType, MarketSetting, Banner, Withdrawal } from "@shared/schema";
import { computeTotalOdds } from "@shared/oddsUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Trash2, 
  RefreshCw, 
  Clock, 
  DollarSign, 
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy,
  Zap,
  ShieldAlert,
  BarChart2,
  ClipboardCheck,
  Wallet,
  PieChart,
  ArrowUpCircle,
  ArrowDownCircle,
  Banknote,
  Trophy,
  ChevronDown,
  ChevronUp,
  FileDown,
  Target,
  CalendarDays,
  Image,
  Upload,
  BookOpen,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Save,
  Undo,
  Redo,
  MinusCircle,
  FileText,
  Plus,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExt from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { format, startOfWeek, startOfMonth, subDays, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { translateMarket, formatOutcome } from "@/lib/marketLabels";

const MARKET_LABELS: Record<string, string> = {
  "h2h": "Resultado Final",
  "match_winner": "Resultado Final",
  "spreads": "Handicap",
  "totals": "Total de Gols",
  "extra-1": "Ambas Marcam",
  "extra-2": "Intervalo/Final",
  "extra-4": "Placar Exato",
  "extra-5": "Total de Gols 2.5",
  "extra-6": "Primeiro a Marcar",
  "extra-11": "Escanteios",
  "extra-15": "Cartão Vermelho",
};
const getMarketLabel = (key: string) => MARKET_LABELS[key] ?? key;

const R$ = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PCT = (v: number, t: number) => t > 0 ? `${((v / t) * 100).toFixed(1)}%` : "0%";

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type BetStatus = "pending" | "won" | "lost";

interface GameLimitEntry {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  sportTitle: string;
  total: number;
  count: number;
  isBlocked: boolean;
}

const SIMPLE_BET_GAME_LIMIT = 15000;

export default function Admin() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<"today" | "week" | "month" | "all">("all");
  const [adminTab, setAdminTab] = useState<string>("bilhetes");
  const [riskSelected, setRiskSelected] = useState<"low" | "mid" | "high" | null>(null);
  const [finPeriod, setFinPeriod] = useState<"all" | "month" | "week" | "today">("month");
  const [marketBoosts, setMarketBoosts] = useState<Record<string, number>>({});
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>("");
  const [withdrawalDesc, setWithdrawalDesc] = useState<string>("");

  const { data: bets = [], isLoading, refetch } = useQuery<BetSlipType[]>({
    queryKey: ["/api/admin/bets"],
    refetchInterval: 5 * 1000,
  });

  const { data: withdrawals = [], refetch: refetchWithdrawals } = useQuery<Withdrawal[]>({
    queryKey: ["/api/admin/withdrawals"],
  });

  const createWithdrawalMutation = useMutation({
    mutationFn: async ({ amount, description }: { amount: number; description: string }) => {
      return apiRequest("POST", "/api/admin/withdrawals", { amount, description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      setWithdrawalAmount("");
      setWithdrawalDesc("");
      toast({ title: "Saque registrado", description: "Saque lançado com sucesso." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível registrar o saque.", variant: "destructive" });
    },
  });

  const deleteWithdrawalMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/withdrawals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      toast({ title: "Saque removido", description: "Saque excluído com sucesso." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível remover o saque.", variant: "destructive" });
    },
  });

  // ── Financeiro: dados calculados no nível do componente ──────────────────
  const periodBets = useMemo(() => {
    const now = new Date();
    if (finPeriod === "today") {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return bets.filter(b => new Date(b.createdAt) >= s);
    }
    if (finPeriod === "week") return bets.filter(b => new Date(b.createdAt) >= startOfWeek(now, { locale: ptBR }));
    if (finPeriod === "month") return bets.filter(b => new Date(b.createdAt) >= startOfMonth(now));
    return bets;
  }, [bets, finPeriod]);

  const finDayData = useMemo(() => DAYS_PT.map((day, idx) => {
    const db = periodBets.filter(b => new Date(b.createdAt).getDay() === idx);
    const e = db.filter(b=>b.verified).reduce((s,b)=>s+b.stake,0);
    const s2 = db.filter(b=>b.verified && b.status==="won").reduce((s,b)=>s+b.potentialWin,0);
    return { day, Entrada: parseFloat(e.toFixed(2)), "Prêmios pagos": parseFloat(s2.toFixed(2)), Lucro: parseFloat((e-s2).toFixed(2)) };
  }), [periodBets]);

  const finMarketRows = useMemo(() => {
    const map = new Map<string, { total:number; won:number; lost:number; pending:number; entrada:number; saida:number; lucroEntrada:number }>();
    periodBets.forEach(bet => {
      const keys = bet.selections.length > 1 ? ["__multi__"] : bet.selections.map(s=>s.marketKey);
      keys.forEach(key => {
        const cur = map.get(key) ?? { total:0, won:0, lost:0, pending:0, entrada:0, saida:0, lucroEntrada:0 };
        cur.total++;
        if (bet.status==="won") cur.won++;
        else if (bet.status==="lost") cur.lost++;
        else cur.pending++;
        if (bet.verified) cur.entrada += bet.stake;
        if (bet.verified && bet.status==="won") cur.saida += bet.potentialWin;
        if (bet.verified) cur.lucroEntrada += bet.stake;
        map.set(key, cur);
      });
    });
    return Array.from(map.entries())
      .map(([key,v])=>({ key, label: key==="__multi__"?"Múltiplas":getMarketLabel(key), ...v, lucro: v.lucroEntrada-v.saida }))
      .sort((a,b)=>b.total-a.total);
  }, [periodBets]);

  const { data: marketSettings = [], isLoading: marketSettingsLoading } = useQuery<MarketSetting[]>({
    queryKey: ["/api/admin/market-settings"],
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (marketSettings.length > 0) {
      const init: Record<string, number> = {};
      marketSettings.forEach(s => { init[s.marketKey] = s.boostPercent; });
      setMarketBoosts(init);
    }
  }, [marketSettings]);

  const saveMarketSettingsMutation = useMutation({
    mutationFn: async (updates: { marketKey: string; boostPercent: number }[]) => {
      const response = await apiRequest("PUT", "/api/admin/market-settings", updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/market-settings"] });
      toast({ title: "Mercados atualizados", description: "As configurações de boost foram salvas com sucesso." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível salvar as configurações.", variant: "destructive" });
    },
  });

  const { data: gameLimitsData, isLoading: gameLimitsLoading, refetch: refetchGameLimits } = useQuery<{ totals: GameLimitEntry[]; limit: number }>({
    queryKey: ["/api/admin/game-limits"],
    refetchInterval: 30 * 1000,
  });

  const { data: limitsData, refetch: refetchLimits } = useQuery<{
    dailyTotal: number; dailyLimit: number; dailyRemaining: number; isDailyLimitReached: boolean;
  }>({
    queryKey: ["/api/limits"],
    refetchInterval: 30 * 1000,
  });

  const deleteBetMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/bets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      toast({
        title: "Bilhete excluído",
        description: "O bilhete foi removido com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível excluir o bilhete.",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BetStatus }) => {
      await apiRequest("PATCH", `/api/admin/bets/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      toast({
        title: "Status atualizado",
        description: "O status do bilhete foi atualizado.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status.",
        variant: "destructive",
      });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/bets");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      toast({
        title: "Todos os bilhetes excluídos",
        description: "Todos os bilhetes foram removidos.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível excluir os bilhetes.",
        variant: "destructive",
      });
    },
  });

  const checkResultsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/check-results");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      toast({
        title: "Resultados verificados",
        description: `${data.updated} bilhete(s) atualizado(s) de ${data.totalPending} pendente(s).`,
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível verificar os resultados.",
        variant: "destructive",
      });
    },
  });

  const clearCacheMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/clear-cache");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Cache limpo",
        description: "As odds serão recarregadas do API-Football na próxima consulta.",
      });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível limpar o cache.", variant: "destructive" });
    },
  });

  const recheckBetMutation = useMutation({
    mutationFn: async (betId: string) => {
      const response = await apiRequest("POST", `/api/admin/bets/${betId}/recheck`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      toast({
        title: "Bilhete resetado",
        description: "Bilhete voltou para pendente. Clique em 'Verificar Resultados' para reverificar.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível resetar o bilhete.",
        variant: "destructive",
      });
    },
  });

  const updateSelectionMutation = useMutation({
    mutationFn: async ({ betId, selectionId, result }: { betId: string; selectionId: string; result: "pending" | "won" | "lost" }) => {
      await apiRequest("PATCH", `/api/admin/bets/${betId}/selections/${selectionId}`, { result });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o resultado.",
        variant: "destructive",
      });
    },
  });

  const autoResolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/admin/bets/${id}/auto-resolve`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      toast({
        title: data.status === "pending"
          ? `Resolvido parcialmente (${data.resolvedCount}/${data.total} seleções)`
          : data.status === "won" ? "Bilhete ganhou!" : "Bilhete perdeu",
        description: data.status === "won"
          ? "Todas as seleções foram confirmadas como vencedoras."
          : data.status === "lost"
          ? "Pelo menos uma seleção foi perdida."
          : `${data.resolvedCount} de ${data.total} seleções resolvidas. Mercados não suportados mantidos como pendentes.`,
      });
    },
    onError: async (error: any) => {
      let msg = "Não foi possível resolver automaticamente.";
      try {
        const body = await error.json?.();
        if (body?.error) msg = body.error;
      } catch {}
      toast({ title: "Erro", description: msg, variant: "destructive" });
    },
  });

  const updateVerifiedMutation = useMutation({
    mutationFn: async ({ id, verified }: { id: string; verified: boolean }) => {
      await apiRequest("PATCH", `/api/admin/bets/${id}/verified`, { verified });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      toast({
        title: "Status atualizado",
        description: "Status de verificação atualizado com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a verificação.",
        variant: "destructive",
      });
    },
  });

  const copyBetCode = (id: string) => {
    navigator.clipboard.writeText(`#${id.slice(0, 8).toUpperCase()}`);
    toast({
      title: "Código copiado",
      description: "O código do bilhete foi copiado.",
    });
  };

  const filteredBets = bets.filter(bet => {
    if (statusFilter !== "all" && bet.status !== statusFilter) return false;
    if (periodFilter !== "all") {
      const created = new Date(bet.createdAt);
      const now = new Date();
      if (periodFilter === "today") {
        return created.toDateString() === now.toDateString();
      } else if (periodFilter === "week") {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return created >= startOfWeek;
      } else if (periodFilter === "month") {
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
      }
    }
    return true;
  });

  const stats = {
    total: bets.length,
    pending: bets.filter(b => b.status === "pending").length,
    won: bets.filter(b => b.status === "won").length,
    lost: bets.filter(b => b.status === "lost").length,
    verified: bets.filter(b => b.verified).length,
    notVerified: bets.filter(b => !b.verified).length,
    totalStake: bets.reduce((sum, b) => sum + b.stake, 0),
    totalPotential: bets.reduce((sum, b) => sum + b.potentialWin, 0),
  };

  const getStatusBadge = (status: string, verified?: boolean) => {
    if (!verified) {
      return <Badge variant="secondary">Pendente</Badge>;
    }
    switch (status) {
      case "won":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Ganhou</Badge>;
      case "lost":
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Perdeu</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Em andamento</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Painel de Administração</h1>
            <p className="text-muted-foreground">Gerenciamento de bilhetes</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => checkResultsMutation.mutate()}
              disabled={checkResultsMutation.isPending || stats.pending === 0}
              data-testid="button-check-results"
            >
              <Zap className="w-4 h-4 mr-2" />
              {checkResultsMutation.isPending ? "Verificando..." : "Verificar Resultados"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearCacheMutation.mutate()}
              disabled={clearCacheMutation.isPending}
              data-testid="button-clear-cache"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${clearCacheMutation.isPending ? "animate-spin" : ""}`} />
              {clearCacheMutation.isPending ? "Limpando..." : "Limpar Cache"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-admin">
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
            {bets.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" data-testid="button-delete-all">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpar Tudo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir todos os bilhetes?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. Todos os {bets.length} bilhetes serão removidos permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => deleteAllMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir Todos
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-500">{stats.verified}</p>
              <p className="text-xs text-muted-foreground">Pagos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-500">{stats.won}</p>
              <p className="text-xs text-muted-foreground">Ganhos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-500">{stats.lost}</p>
              <p className="text-xs text-muted-foreground">Perdidos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">R$ {stats.totalStake.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Apostado</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">R$ {stats.totalPotential.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Potencial</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={adminTab} onValueChange={setAdminTab}>
          <TabsList className="mb-4 flex-wrap h-auto gap-1">
            <TabsTrigger value="bilhetes" data-testid="tab-bilhetes">
              <DollarSign className="w-4 h-4 mr-2" />
              Bilhetes
            </TabsTrigger>
            <TabsTrigger value="limites" data-testid="tab-limites">
              <BarChart2 className="w-4 h-4 mr-2" />
              Limites por Jogo
            </TabsTrigger>
            <TabsTrigger value="validacao" data-testid="tab-validacao">
              <ClipboardCheck className="w-4 h-4 mr-2" />
              Validação
            </TabsTrigger>
            <TabsTrigger value="caixa" data-testid="tab-caixa">
              <Wallet className="w-4 h-4 mr-2" />
              Caixa
            </TabsTrigger>
            <TabsTrigger value="financeiro" data-testid="tab-financeiro">
              <PieChart className="w-4 h-4 mr-2" />
              Financeiro
            </TabsTrigger>
            <TabsTrigger value="saques" data-testid="tab-saques">
              <MinusCircle className="w-4 h-4 mr-2" />
              Saques
            </TabsTrigger>
            <TabsTrigger value="mercados" data-testid="tab-mercados">
              <Target className="w-4 h-4 mr-2" />
              Mercados
            </TabsTrigger>
            <TabsTrigger value="banners" data-testid="tab-banners">
              <Image className="w-4 h-4 mr-2" />
              Banners
            </TabsTrigger>
            <TabsTrigger value="regras" data-testid="tab-regras">
              <BookOpen className="w-4 h-4 mr-2" />
              Regras
            </TabsTrigger>
          </TabsList>

          <TabsContent value="limites">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-yellow-500" />
                    Limites de Apostas Simples por Jogo
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => refetchGameLimits()} data-testid="button-refresh-game-limits">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Atualizar
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Limite de R$15.000 em retorno potencial de apostas simples (1 mercado) por jogo. Ao atingir o limite, o jogo é removido do site automaticamente.
                </p>
              </CardHeader>
              <CardContent>
                {gameLimitsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                  </div>
                ) : !gameLimitsData?.totals.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>Nenhuma aposta simples registrada ainda.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {gameLimitsData.totals.map((entry) => {
                      const rawPct = (entry.total / SIMPLE_BET_GAME_LIMIT) * 100;
                      const barPct = Math.min(100, rawPct);
                      const remaining = Math.max(0, SIMPLE_BET_GAME_LIMIT - entry.total);
                      const displayPct = rawPct >= 100 ? "100%" : rawPct.toFixed(2) + "%";
                      return (
                        <div key={entry.gameId} className={`rounded-lg border p-4 ${entry.isBlocked ? "border-red-500/50 bg-red-500/5" : "border-border"}`}>
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <div>
                              <p className="font-semibold text-sm">
                                {entry.homeTeam} <span className="text-muted-foreground">vs</span> {entry.awayTeam}
                              </p>
                              <p className="text-xs text-muted-foreground">{entry.sportTitle} · {entry.count} aposta{entry.count !== 1 ? "s" : ""} simples</p>
                            </div>
                            <div className="flex flex-wrap gap-1 justify-end">
                              {entry.isBlocked && (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3" />
                                  Bloqueado
                                </Badge>
                              )}
                              <Badge variant="outline" className={remaining <= 0 ? "text-red-400 border-red-500/30" : "text-yellow-500 border-yellow-500/30"}>
                                Disponível: R${remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </Badge>
                            </div>
                          </div>
                          <Progress
                            value={barPct}
                            className={`h-3 ${
                              entry.isBlocked || entry.total > 10000
                                ? "[&>div]:bg-red-500"
                                : entry.total > 5000
                                ? "[&>div]:bg-yellow-500"
                                : "[&>div]:bg-green-500"
                            }`}
                            data-testid={`progress-game-${entry.gameId}`}
                          />
                          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                            <span>R${entry.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span>{displayPct} de R$15.000</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── VALIDAÇÃO ─────────────────────────────────────── */}
          <TabsContent value="validacao">
            <div className="space-y-4">

              {/* Painel de classificação por risco */}
              {(() => {
                const pending = bets.filter(b => b.verified && b.status === "pending");
                const groups: { key: "low" | "mid" | "high"; label: string; range: string; dot: string; border: string; bg: string; badgeCls: string; textCls: string; bets: typeof pending }[] = [
                  {
                    key: "low", label: "Risco Baixo", range: "até R$5.000",
                    dot: "bg-green-500", border: "border-green-500/40", bg: "bg-green-500/5",
                    badgeCls: "bg-green-500/20 text-green-400 border-green-500/30", textCls: "text-green-400",
                    bets: pending.filter(b => b.potentialWin <= 5000),
                  },
                  {
                    key: "mid", label: "Risco Médio", range: "R$5.001 – R$10.000",
                    dot: "bg-orange-500", border: "border-orange-500/40", bg: "bg-orange-500/5",
                    badgeCls: "bg-orange-500/20 text-orange-400 border-orange-500/30", textCls: "text-orange-400",
                    bets: pending.filter(b => b.potentialWin > 5000 && b.potentialWin <= 10000),
                  },
                  {
                    key: "high", label: "Risco Alto", range: "R$10.001 – R$15.000",
                    dot: "bg-red-500", border: "border-red-500/40", bg: "bg-red-500/5",
                    badgeCls: "bg-red-500/20 text-red-400 border-red-500/30", textCls: "text-red-400",
                    bets: pending.filter(b => b.potentialWin > 10000),
                  },
                ];
                const activeGroup = groups.find(g => g.key === riskSelected) ?? null;
                return (
                  <div className="space-y-3">
                    {/* 3 cards sempre com a mesma altura */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {groups.map(g => (
                        <button
                          key={g.key}
                          className={`rounded-lg border-2 ${g.border} ${g.bg} p-4 text-left transition-all hover:brightness-110 ${riskSelected === g.key ? "ring-2 ring-offset-1 ring-offset-background " + g.border : ""}`}
                          onClick={() => setRiskSelected(riskSelected === g.key ? null : g.key)}
                          data-testid={`button-risk-${g.key}`}
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`w-3 h-3 rounded-full ${g.dot} shrink-0`} />
                            <p className={`font-semibold text-sm ${g.textCls}`}>{g.label}</p>
                            <Badge className={`ml-auto ${g.badgeCls}`}>{g.bets.length} bilhete(s)</Badge>
                            <span className={g.textCls}>
                              {riskSelected === g.key ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">Retorno {g.range}</p>
                          <p className={`text-2xl font-bold ${g.textCls}`}>
                            R${g.bets.reduce((s,b)=>s+b.potentialWin,0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">exposição total nessa faixa</p>
                        </button>
                      ))}
                    </div>

                    {/* Painel de detalhes — aparece abaixo dos 3 cards, largura total */}
                    {activeGroup && (
                      <div className={`rounded-lg border-2 ${activeGroup.border} ${activeGroup.bg} p-4`}>
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`w-3 h-3 rounded-full ${activeGroup.dot}`} />
                          <p className={`font-semibold text-sm ${activeGroup.textCls}`}>
                            Bilhetes — {activeGroup.label}
                          </p>
                          <span className="text-xs text-muted-foreground ml-1">({activeGroup.bets.length} bilhete(s))</span>
                        </div>
                        {activeGroup.bets.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">Nenhum bilhete nessa faixa.</p>
                        ) : (
                          <div className="space-y-2">
                            {activeGroup.bets.map(bet => (
                              <div key={bet.id} className="flex items-center justify-between gap-4 rounded border border-current/10 bg-background/40 p-3 flex-wrap">
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-xs">#{bet.id.slice(0,8).toUpperCase()}</span>
                                    <span className="text-xs text-muted-foreground">{format(new Date(bet.createdAt),"dd/MM HH:mm",{locale:ptBR})}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate max-w-xs">
                                    {bet.selections.map(s=>`${s.homeTeam} x ${s.awayTeam}`).join(" · ")}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 mt-1 sm:mt-0">
                                  <div className="whitespace-nowrap">
                                    <p className="text-xs text-muted-foreground">Apostado</p>
                                    <p className="font-bold text-sm">R$&nbsp;{bet.stake.toFixed(2)}</p>
                                  </div>
                                  <div className="text-right whitespace-nowrap">
                                    <p className="text-xs text-muted-foreground">Retorno</p>
                                    <p className={`font-bold text-sm ${activeGroup.textCls}`}>R$&nbsp;{bet.potentialWin.toFixed(2)}</p>
                                  </div>
                                  <Badge className={`${activeGroup.badgeCls} text-xs`}>
                                    Pago ✓
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Lista de bilhetes */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardCheck className="w-5 h-5 text-blue-500" />
                      Validação de Pagamentos
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-validacao">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Recarregar
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Bilhetes pendentes aguardando confirmação de pagamento via PIX.
                  </p>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-3">{[1,2,3].map(i=><Skeleton key={i} className="h-16 w-full"/>)}</div>
                  ) : bets.filter(b => !b.verified && b.status === "pending").length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-30 text-green-500" />
                      <p>Nenhum bilhete aguardando validação.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bets.filter(b => !b.verified && b.status === "pending").map(bet => {
                        return (
                          <div key={bet.id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-4 flex-wrap">
                            <div className="flex items-center gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm font-bold">#{bet.id.slice(0,8).toUpperCase()}</span>
                                  <Badge variant="secondary">Pendente</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(bet.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {bet.selections.map(s=>`${s.homeTeam} vs ${s.awayTeam}`).join(" · ")}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 mt-1 sm:mt-0">
                              <div className="whitespace-nowrap">
                                <p className="text-xs text-muted-foreground">Apostado</p>
                                <p className="font-bold text-sm">R$&nbsp;{bet.stake.toFixed(2)}</p>
                              </div>
                              <div className="text-right whitespace-nowrap">
                                <p className="text-xs text-muted-foreground">Retorno</p>
                                <p className="font-bold text-sm">
                                  R$&nbsp;{bet.potentialWin.toFixed(2)}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                                onClick={() => updateVerifiedMutation.mutate({ id: bet.id, verified: true })}
                                disabled={updateVerifiedMutation.isPending}
                                data-testid={`button-validate-${bet.id}`}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Confirmar Pago
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── CAIXA ─────────────────────────────────────────── */}
          <TabsContent value="caixa">
            <div className="space-y-4">

              {/* Painel central — Caixa acumulado */}
              {(() => {
                const APORTE_INICIAL = 50000;
                const ganhos = bets.filter(b => b.verified).reduce((s, b) => s + b.stake, 0);
                const perdas = bets.filter(b => b.verified && b.status === "won").reduce((s, b) => s + b.potentialWin, 0);
                const exposicao = bets.filter(b => b.status === "pending").reduce((s, b) => s + b.potentialWin, 0);
                const totalSaques = withdrawals.reduce((s, w) => s + w.amount, 0);
                const lucroOp = ganhos - perdas - totalSaques;
                // Saldo = capital inicial + resultado operacional − exposição pendente
                // Quando lucroOp é negativo, o prejuízo já consumiu parte do capital inicial
                const saldo = APORTE_INICIAL + lucroOp - exposicao;
                const lucroLivre = Math.max(0, lucroOp - exposicao);
                // Capital reservado = quanto do aporte inicial está comprometido
                // (cobre o prejuízo operacional + a exposição pendente que excede o lucro)
                const capitalReservado = Math.min(APORTE_INICIAL, Math.max(0, exposicao - lucroOp));
                const capitalDisponivel = APORTE_INICIAL - capitalReservado;
                const isPositive = saldo >= APORTE_INICIAL;
                return (
                  <Card className={`border-2 ${isPositive ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"}`}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <Wallet className="w-7 h-7 text-primary" />
                          <div>
                            <p className="text-lg font-bold">Caixa</p>
                            <p className="text-xs text-muted-foreground">Aporte inicial: R$50.000,00 + operações acumuladas</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={isPositive
                            ? "bg-green-500/20 text-green-400 border-green-500/30 text-sm px-3 py-1"
                            : "bg-red-500/20 text-red-400 border-red-500/30 text-sm px-3 py-1"
                          }>
                            {isPositive ? <CheckCircle className="w-4 h-4 mr-1" /> : <XCircle className="w-4 h-4 mr-1" />}
                            {isPositive ? "POSITIVO" : "NEGATIVO"}
                          </Badge>
                          <Button variant="outline" size="sm" onClick={() => refetchLimits()} data-testid="button-refresh-caixa">
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Saldo principal */}
                      <div className="text-center mb-4">
                        <p className="text-xs text-muted-foreground mb-1">Saldo atual do Caixa</p>
                        <p className={`text-4xl font-bold ${isPositive ? "text-green-500" : "text-red-400"}`}
                          data-testid="text-caixa-saldo">
                          {isPositive ? "+" : ""}R${saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>

                      {/* Barras de disponível + lucro */}
                      {(() => {
                        // Barra 1 — capital disponível (após reservar exposição que excede o lucro)
                        const capitalPct = Math.max(0, Math.min(100, (capitalDisponivel / APORTE_INICIAL) * 100));
                        const capitalColor = capitalDisponivel > 40000 ? "bg-gradient-to-r from-green-600 to-emerald-400" : capitalDisponivel > 20000 ? "bg-gradient-to-r from-yellow-600 to-amber-400" : "bg-gradient-to-r from-red-600 to-rose-400";
                        // Barra 2 — lucro livre (depois de cobrir a exposição com o lucro)
                        const lucroLivrePct = Math.max(0, Math.min(100, (lucroLivre / APORTE_INICIAL) * 100));
                        const lucroOpNegativo = lucroOp < 0;
                        const lucroOpPct = Math.max(0, Math.min(100, (Math.abs(lucroOp) / APORTE_INICIAL) * 100));
                        return (
                          <div className="mb-6 space-y-2">
                            {/* Barra 1 — Capital disponível */}
                            <div>
                              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                <span>Capital disponível</span>
                                <span className={`font-semibold ${capitalDisponivel > 40000 ? "text-green-400" : capitalDisponivel > 20000 ? "text-yellow-400" : "text-red-400"}`}>
                                  {capitalPct.toFixed(1)}% · R${capitalDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="w-full h-3 bg-muted rounded-t-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 ${capitalColor}`}
                                  style={{ width: `${capitalPct}%` }}
                                />
                              </div>
                            </div>

                            {/* Barra 2 — Lucro operacional (livre de exposição) */}
                            <div>
                              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                <span>Lucro operacional</span>
                                <span className={`font-semibold ${lucroOpNegativo ? "text-red-400" : lucroLivre > 0 ? "text-violet-400" : lucroOp > 0 ? "text-yellow-400" : "text-muted-foreground"}`}>
                                  {lucroOpNegativo
                                    ? `-R$${Math.abs(lucroOp).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : lucroLivre > 0
                                    ? `+R$${lucroLivre.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} livre`
                                    : lucroOp > 0
                                    ? `+R$${lucroOp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (reservado pela exposição)`
                                    : `R$0,00`}
                                </span>
                              </div>
                              <div className="w-full h-3 bg-muted rounded-b-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 ${lucroOpNegativo ? "bg-red-500" : lucroLivre > 0 ? "bg-gradient-to-r from-purple-600 to-violet-400" : "bg-gradient-to-r from-yellow-600 to-amber-400"}`}
                                  style={{ width: `${lucroOpNegativo ? lucroOpPct : lucroLivre > 0 ? lucroLivrePct : lucroOpPct}%` }}
                                />
                              </div>
                            </div>

                            {/* Legenda compartilhada */}
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>R$0</span>
                              <span>R$50.000</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        <div className="bg-muted/50 rounded-lg p-3 text-center">
                          <Wallet className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-base font-bold">
                            R$50.000,00
                          </p>
                          <p className="text-xs text-muted-foreground">Aporte inicial</p>
                        </div>
                        <div className="bg-green-500/10 rounded-lg p-3 text-center">
                          <ArrowUpCircle className="w-4 h-4 mx-auto mb-1 text-green-500" />
                          <p className="text-base font-bold text-green-500">
                            +R${ganhos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-muted-foreground">Apostas perdidas</p>
                        </div>
                        <div className="bg-red-500/10 rounded-lg p-3 text-center">
                          <ArrowDownCircle className="w-4 h-4 mx-auto mb-1 text-red-400" />
                          <p className="text-base font-bold text-red-400">
                            -R${perdas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-muted-foreground">Prêmios pagos</p>
                        </div>
                        <div className="bg-orange-500/10 rounded-lg p-3 text-center">
                          <MinusCircle className="w-4 h-4 mx-auto mb-1 text-orange-400" />
                          <p className="text-base font-bold text-orange-400">
                            -R${totalSaques.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-muted-foreground">Saques</p>
                        </div>
                        <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                          <ShieldAlert className="w-4 h-4 mx-auto mb-1 text-yellow-400" />
                          <p className="text-base font-bold text-yellow-400">
                            -R${exposicao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-muted-foreground">Exposição reservada</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Cards secundários */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <ArrowUpCircle className="w-5 h-5 mx-auto mb-1 text-green-500" />
                    <p className="text-xl font-bold text-green-500">
                      R${bets.filter(b=>b.verified).reduce((s,b)=>s+b.stake,0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </p>
                    <p className="text-xs text-muted-foreground">Entradas (PIX confirmados)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="w-5 h-5 mx-auto mb-1 text-yellow-400" />
                    <p className="text-xl font-bold text-yellow-400">
                      R${bets.filter(b=>b.status==="pending").reduce((s,b)=>s+b.potentialWin,0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </p>
                    <p className="text-xs text-muted-foreground">Exposição pendente</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Banknote className="w-5 h-5 mx-auto mb-1 text-white" />
                    <p className="text-xl font-bold text-white">
                      {bets.length.toString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Total de apostas</p>
                  </CardContent>
                </Card>
              </div>

              {/* Bilhetes pendentes de recebimento */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="w-4 h-4 text-yellow-500" />
                    Aguardando Pagamento PIX ({bets.filter(b=>!b.verified && b.status==="pending").length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {bets.filter(b=>!b.verified && b.status==="pending").length === 0 ? (
                    <p className="text-center py-6 text-muted-foreground text-sm">Nenhum bilhete aguardando pagamento.</p>
                  ) : (
                    <div className="space-y-2">
                      {bets.filter(b=>!b.verified && b.status==="pending").map(bet=>(
                        <div key={bet.id} className="flex items-center justify-between text-sm border rounded p-3 flex-wrap gap-2">
                          <span className="font-mono font-bold text-xs">#{bet.id.slice(0,8).toUpperCase()}</span>
                          <span className="text-muted-foreground text-xs">{format(new Date(bet.createdAt),"dd/MM HH:mm",{locale:ptBR})}</span>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Apostado</p>
                            <p className="font-bold">R${bet.stake.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Retorno potencial</p>
                            <p className="font-bold text-blue-400">R${bet.potentialWin.toFixed(2)}</p>
                          </div>
                          <Badge variant="secondary" className="text-yellow-500 border-yellow-500/30">Aguardando PIX</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── SAQUES ────────────────────────────────────── */}
          <TabsContent value="saques">
            <div className="space-y-4">
              {/* Formulário de novo saque */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <MinusCircle className="w-5 h-5 text-red-400" />
                    Registrar Saque
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground block mb-1">Valor (R$)</label>
                      <Input
                        data-testid="input-withdrawal-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0,00"
                        value={withdrawalAmount}
                        onChange={e => setWithdrawalAmount(e.target.value)}
                      />
                    </div>
                    <div className="flex-[2]">
                      <label className="text-xs text-muted-foreground block mb-1">Descrição (opcional)</label>
                      <Input
                        data-testid="input-withdrawal-desc"
                        type="text"
                        placeholder="Ex: Retirada semanal"
                        value={withdrawalDesc}
                        onChange={e => setWithdrawalDesc(e.target.value)}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        data-testid="button-add-withdrawal"
                        variant="destructive"
                        disabled={createWithdrawalMutation.isPending || !withdrawalAmount || parseFloat(withdrawalAmount) <= 0}
                        onClick={() => {
                          const amt = parseFloat(withdrawalAmount);
                          if (isNaN(amt) || amt <= 0) return;
                          createWithdrawalMutation.mutate({ amount: amt, description: withdrawalDesc.trim() });
                        }}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Lançar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Resumo total */}
              {withdrawals.length > 0 && (
                <Card className="border-red-500/30 bg-red-500/5">
                  <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-5 h-5 text-red-400" />
                      <span className="text-sm font-semibold">Total sacado</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-red-400" data-testid="text-total-withdrawals">
                        -R${withdrawals.reduce((s, w) => s + w.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const totalSacado = withdrawals.reduce((s, w) => s + w.amount, 0);
                          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Saques - FW Sports</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#111}h1{color:#c53030;border-bottom:2px solid #c53030;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#c53030;color:white;padding:10px;text-align:left}td{padding:8px 10px;border-bottom:1px solid #eee}tr:nth-child(even){background:#f9f9f9}.total{font-size:1.2em;font-weight:bold;margin-top:20px;text-align:right;color:#c53030}.footer{margin-top:40px;font-size:0.8em;color:#888;text-align:center}</style></head><body><h1>Relatório de Saques — FW Sports</h1><p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p><table><thead><tr><th>#</th><th>Data/Hora</th><th>Valor</th><th>Descrição</th></tr></thead><tbody>${withdrawals.map((w, i) => `<tr><td>${i + 1}</td><td>${new Date(w.createdAt).toLocaleString('pt-BR')}</td><td>R$${w.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>${w.description || '—'}</td></tr>`).join('')}</tbody></table><p class="total">Total: R$${totalSacado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p class="footer">FW Sports — Documento gerado automaticamente</p></body></html>`;
                          const w = window.open('', '_blank');
                          if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
                        }}
                        data-testid="button-export-withdrawals-pdf"
                      >
                        <FileText className="w-4 h-4 mr-1" />
                        PDF
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => refetchWithdrawals()} data-testid="button-refresh-withdrawals">
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Lista de saques */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-muted-foreground" />
                      Histórico de Saques ({withdrawals.length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {withdrawals.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground text-sm">Nenhum saque registrado.</p>
                  ) : (
                    <div className="space-y-2">
                      {withdrawals.map((w, idx) => (
                        <div
                          key={w.id}
                          data-testid={`row-withdrawal-${w.id}`}
                          className="flex items-center justify-between gap-3 border rounded-lg p-3 flex-wrap"
                        >
                          <span className="text-xs text-muted-foreground w-6 text-center">{idx + 1}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(w.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="font-bold text-red-400" data-testid={`text-withdrawal-amount-${w.id}`}>
                            -R${w.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="flex-1 text-sm text-muted-foreground text-right sm:text-left">
                            {w.description || <span className="italic">sem descrição</span>}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                            data-testid={`button-delete-withdrawal-${w.id}`}
                            disabled={deleteWithdrawalMutation.isPending}
                            onClick={() => deleteWithdrawalMutation.mutate(w.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── FINANCEIRO ────────────────────────────────────── */}
          <TabsContent value="financeiro">
            {(() => {

              const entrada      = periodBets.filter(b=>b.verified).reduce((s,b)=>s+b.stake,0);
              const saida        = periodBets.filter(b=>b.verified && b.status==="won").reduce((s,b)=>s+b.potentialWin,0);
              const totalSaques  = withdrawals.reduce((s,w)=>s+w.amount,0);
              const lucro        = entrada - saida - totalSaques;
              const pendente  = periodBets.filter(b=>b.status==="pending").reduce((s,b)=>s+b.potentialWin,0);
              const totalBets = periodBets.length;
              const wonBets   = periodBets.filter(b=>b.status==="won").length;
              const lostBets  = periodBets.filter(b=>b.status==="lost").length;

              const resolvedBets = wonBets + lostBets;
              const activeDays = finDayData.filter(d => d.Entrada > 0 || d["Prêmios pagos"] > 0);
              const negativeDays = activeDays.filter(d => d.Lucro < 0);
              const bestDay  = activeDays.length ? [...activeDays].sort((a,b)=>b.Lucro-a.Lucro)[0] : null;
              const worstDay = negativeDays.length ? [...negativeDays].sort((a,b)=>a.Lucro-b.Lucro)[0] : null;
              const marketChartData = finMarketRows.map(r=>({ name: r.label, Apostas: r.total, Lucro: parseFloat(r.lucro.toFixed(2)) }));
              const handlePrint = () => window.print();

              return (
                <div className="space-y-5 print:space-y-3" id="financial-report">
                  {/* Header: período + botão PDF */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {(["today","week","month","all"] as const).map(p => (
                        <Button
                          key={p}
                          size="sm"
                          variant={finPeriod===p?"default":"outline"}
                          onClick={()=>setFinPeriod(p)}
                          className="text-xs"
                          data-testid={`button-fin-period-${p}`}
                        >
                          {{ today:"Hoje", week:"Esta Semana", month:"Este Mês", all:"Todos" }[p]}
                        </Button>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="gap-2 print:hidden" onClick={handlePrint} data-testid="button-print-report">
                      <FileDown className="w-4 h-4" />
                      Exportar PDF
                    </Button>
                  </div>

                  {/* KPI cards linha 1 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { icon: <ArrowUpCircle className="w-5 h-5 text-blue-400"/>, label:"Entradas", value:R$(entrada), color:"text-blue-400" },
                      { icon: <ArrowDownCircle className="w-5 h-5 text-red-400"/>, label:"Prêmios pagos", value:R$(saida), color:"text-red-400" },
                      { icon: lucro>=0?<TrendingUp className="w-5 h-5 text-green-400"/>:<TrendingDown className="w-5 h-5 text-red-400"/>, label:"Lucro Líquido", value:R$(lucro), color:lucro>=0?"text-green-400":"text-red-400" },
                      { icon: <Wallet className="w-5 h-5 text-yellow-400"/>, label:"Exposição pendente", value:R$(pendente), color:"text-yellow-400" },
                    ].map(({icon,label,value,color})=>(
                      <Card key={label}>
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-1">{icon}<p className="text-xs text-muted-foreground">{label}</p></div>
                          <p className={`text-lg font-bold ${color}`}>{value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* KPI cards linha 2 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { icon: <CalendarDays className="w-5 h-5 text-primary"/>, label:"Total de Bilhetes", value: totalBets.toString() },
                      { icon: <Trophy className="w-5 h-5 text-green-400"/>, label:`Ganhos / Perdidos / Pendentes`, value: <span><span className="text-green-400">{wonBets}</span> / <span className="text-red-400">{lostBets}</span> / <span className="text-yellow-400">{totalBets - resolvedBets}</span></span> },
                      { icon: <Target className="w-5 h-5 text-green-400"/>, label:"Taxa de Acerto", value: PCT(wonBets, resolvedBets) },
                      { icon: <XCircle className="w-5 h-5 text-red-400"/>, label:"Taxa de Erros", value: PCT(lostBets, resolvedBets) },
                    ].map(({icon,label,value})=>(
                      <Card key={label}>
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-1">{icon}<p className="text-xs text-muted-foreground">{label}</p></div>
                          <p className="text-lg font-bold">{value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Gráfico por dia da semana */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <BarChart2 className="w-4 h-4 text-primary"/>
                          Fluxo por Dia da Semana
                        </CardTitle>
                        <div className="flex gap-3 text-xs">
                          {bestDay ? <span className="text-green-400">↑ Melhor: <strong>{bestDay.day}</strong> ({R$(bestDay.Lucro)})</span> : null}
                          {worstDay ? <span className="text-red-400">↓ Pior: <strong>{worstDay.day}</strong> ({R$(worstDay.Lucro)})</span> : null}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={finDayData} margin={{top:4,right:8,left:0,bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="day" tick={{fontSize:11}} stroke="#666" />
                          <YAxis tick={{fontSize:10}} stroke="#666" tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v:number)=>R$(v)} contentStyle={{background:"#1a1a1a",border:"1px solid #333",borderRadius:8}} />
                          <Legend />
                          <Bar dataKey="Entrada" fill="#3b82f6" radius={[3,3,0,0]}/>
                          <Bar dataKey="Prêmios pagos" fill="#ef4444" radius={[3,3,0,0]}/>
                          <Bar dataKey="Lucro" fill="#22c55e" radius={[3,3,0,0]}>
                            {finDayData.map((entry, i) => (
                              <Cell key={i} fill={entry.Lucro >= 0 ? "#22c55e" : "#f87171"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Tabela + gráfico por mercado */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <PieChart className="w-4 h-4 text-primary"/>
                        Desempenho por Mercado
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 space-y-4">
                      {finMarketRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Nenhum dado no período selecionado.</p>
                      ) : (
                        <>
                          {/* Gráfico de barras por mercado */}
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={marketChartData} margin={{top:4,right:8,left:0,bottom:20}}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#333"/>
                              <XAxis dataKey="name" tick={{fontSize:9}} angle={-25} textAnchor="end" stroke="#666" interval={0}/>
                              <YAxis yAxisId="left" tick={{fontSize:10}} stroke="#666"/>
                              <YAxis yAxisId="right" orientation="right" tick={{fontSize:10}} stroke="#666" tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                              <Tooltip formatter={(v:any,n:string)=>n==="Apostas"?`${v} apostas`:R$(v)} contentStyle={{background:"#1a1a1a",border:"1px solid #333",borderRadius:8}}/>
                              <Legend />
                              <Bar yAxisId="left" dataKey="Apostas" fill="#8b5cf6" radius={[3,3,0,0]}/>
                              <Bar yAxisId="right" dataKey="Lucro" fill="#22c55e" radius={[3,3,0,0]}>
                                {marketChartData.map((entry,i)=>(
                                  <Cell key={i} fill={entry.Lucro>=0?"#22c55e":"#ef4444"}/>
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>

                          {/* Tabela detalhada */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border text-muted-foreground">
                                  <th className="text-left py-2 pr-3">Mercado</th>
                                  <th className="text-center py-2 px-2">Total</th>
                                  <th className="text-center py-2 px-2 text-green-400">Ganhas</th>
                                  <th className="text-center py-2 px-2 text-red-400">Perdidas</th>
                                  <th className="text-center py-2 px-2 text-yellow-400">Pend.</th>
                                  <th className="text-right py-2 px-2">Entrada</th>
                                  <th className="text-right py-2 px-2">Prêmios pagos</th>
                                  <th className="text-right py-2">Lucro</th>
                                </tr>
                              </thead>
                              <tbody>
                                {finMarketRows.map(r=>(
                                  <tr key={r.key} className="border-b border-border/40 hover:bg-muted/30">
                                    <td className="py-2 pr-3 font-medium">{r.label}</td>
                                    <td className="text-center py-2 px-2">{r.total}</td>
                                    <td className="text-center py-2 px-2 text-green-400">{r.won}</td>
                                    <td className="text-center py-2 px-2 text-red-400">{r.lost}</td>
                                    <td className="text-center py-2 px-2 text-yellow-400">{r.pending}</td>
                                    <td className="text-right py-2 px-2 font-mono">{R$(r.entrada)}</td>
                                    <td className="text-right py-2 px-2 font-mono">{R$(r.saida)}</td>
                                    <td className={`text-right py-2 font-bold font-mono ${r.lucro>=0?"text-green-400":"text-red-400"}`}>{R$(r.lucro)}</td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-border font-bold">
                                  <td className="py-2 pr-3">TOTAL</td>
                                  <td className="text-center py-2 px-2">{totalBets}</td>
                                  <td className="text-center py-2 px-2 text-green-400">{wonBets}</td>
                                  <td className="text-center py-2 px-2 text-red-400">{lostBets}</td>
                                  <td className="text-center py-2 px-2 text-yellow-400">{periodBets.filter(b=>b.status==="pending").length}</td>
                                  <td className="text-right py-2 px-2 font-mono">{R$(entrada)}</td>
                                  <td className="text-right py-2 px-2 font-mono">{R$(saida)}</td>
                                  <td className={`text-right py-2 font-mono font-bold ${lucro>=0?"text-green-400":"text-red-400"}`}>{R$(lucro)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="bilhetes">
          <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle>Bilhetes ({filteredBets.length})</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex rounded-md overflow-hidden border border-border text-xs">
                  {(["today","week","month","all"] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setPeriodFilter(p)}
                      data-testid={`btn-period-${p}`}
                      className={`px-3 py-1.5 transition-colors ${periodFilter === p ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                    >
                      {{ today:"Hoje", week:"Semana", month:"Mês", all:"Todos" }[p]}
                    </button>
                  ))}
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36" data-testid="select-status-filter">
                    <SelectValue placeholder="Filtrar status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    <SelectItem value="pending">Pendentes</SelectItem>
                    <SelectItem value="won">Ganhos</SelectItem>
                    <SelectItem value="lost">Perdidos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : filteredBets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum bilhete encontrado</p>
              </div>
            ) : (
              <ScrollArea className="h-auto max-h-none">
                <div className="space-y-4">
                  {filteredBets.map((bet) => (
                    <Card key={bet.id} className="border border-gray-500/30">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => copyBetCode(bet.id)}
                                className="font-mono text-sm font-bold hover:text-primary transition-colors flex items-center gap-1"
                                data-testid={`button-copy-${bet.id}`}
                              >
                                #{bet.id.slice(0, 8).toUpperCase()}
                                <Copy className="w-3 h-3" />
                              </button>
                              {getStatusBadge(bet.status, bet.verified)}
                              <div 
                                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                                  bet.verified 
                                    ? "bg-green-500/20 text-green-500 border border-green-500/30" 
                                    : "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30"
                                }`}
                                onClick={() => updateVerifiedMutation.mutate({ id: bet.id, verified: !bet.verified })}
                                data-testid={`checkbox-verified-${bet.id}`}
                              >
                                <Checkbox 
                                  checked={bet.verified} 
                                  className="h-3.5 w-3.5 border-current"
                                />
                                <span>{bet.verified ? "Pago" : "Não pago"}</span>
                              </div>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(new Date(bet.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            
                            {/* Bilhete visual — agrupado por jogo */}
                            {(() => {
                              const grouped: Record<string, typeof bet.selections> = {};
                              for (const sel of bet.selections) {
                                if (!grouped[sel.gameId]) grouped[sel.gameId] = [];
                                grouped[sel.gameId].push(sel);
                              }
                              return (
                                <div className="rounded-xl border border-purple-500/50 bg-muted/20 p-2 space-y-2">
                                  {Object.entries(grouped).map(([gameId, sels]) => {
                                    const first = sels[0];
                                    const gameOdds = fmtOdds(computeTotalOdds(sels));
                                    return (
                                      <div key={gameId} className="rounded-lg bg-card border border-border overflow-hidden shadow-sm">
                                        {/* Cabeçalho do jogo */}
                                        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-semibold text-foreground text-xs truncate">
                                              {first.homeTeam} vs {first.awayTeam}
                                            </span>
                                          </div>
                                          <span className="text-yellow-400 font-bold text-xs flex-shrink-0 ml-2">
                                            {gameOdds}
                                          </span>
                                        </div>

                                        {/* Seleções */}
                                        <div className="px-3 py-2.5">
                                          <div className="relative pl-5">
                                            {/* Linha vertical amarela */}
                                            <div
                                              className="absolute left-[5px] top-[6px] w-[2px] bg-yellow-400"
                                              style={{ height: sels.length > 1 ? `calc(100% - 12px)` : "0px" }}
                                            />
                                            {sels.map((sel, idx) => (
                                              <div key={sel.id} className={`flex items-start justify-between gap-2 ${idx > 0 ? "mt-3" : ""}`}>
                                                {/* Mercado + outcome */}
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center relative">
                                                    <div className="absolute -left-5 w-3 h-3 rounded-full bg-yellow-400 border-2 border-muted z-10 flex-shrink-0" />
                                                    <span className="text-muted-foreground text-xs">{translateMarket(sel.marketKey)}</span>
                                                  </div>
                                                  <div className="flex items-center gap-2 mt-0.5">
                                                    <p className={`font-semibold text-xs ${
                                                      sel.result === "won" ? "text-green-400" :
                                                      sel.result === "lost" ? "text-red-400 line-through" :
                                                      "text-foreground"
                                                    }`}>
                                                      {formatOutcome(sel.outcome, sel.marketKey, sel.homeTeam, sel.awayTeam)}
                                                    </p>
                                                  </div>
                                                </div>
                                                {/* Botões ganhou/perdeu */}
                                                <div className="flex items-center gap-1 flex-shrink-0 mt-1">
                                                  <Button
                                                    size="icon"
                                                    variant={sel.result === "won" ? "default" : "ghost"}
                                                    className={`h-6 w-6 ${sel.result === "won" ? "bg-green-600 hover:bg-green-700" : "hover:bg-green-600/20"} ${!bet.verified ? "opacity-40 cursor-not-allowed" : ""}`}
                                                    onClick={() => updateSelectionMutation.mutate({ 
                                                      betId: bet.id, 
                                                      selectionId: sel.id, 
                                                      result: sel.result === "won" ? "pending" : "won" 
                                                    })}
                                                    disabled={!bet.verified}
                                                    data-testid={`button-sel-won-${sel.id}`}
                                                  >
                                                    <CheckCircle className={`w-3.5 h-3.5 ${sel.result === "won" ? "text-white" : "text-green-500"}`} />
                                                  </Button>
                                                  <Button
                                                    size="icon"
                                                    variant={sel.result === "lost" ? "default" : "ghost"}
                                                    className={`h-6 w-6 ${sel.result === "lost" ? "bg-red-600 hover:bg-red-700" : "hover:bg-red-600/20"} ${!bet.verified ? "opacity-40 cursor-not-allowed" : ""}`}
                                                    onClick={() => updateSelectionMutation.mutate({ 
                                                      betId: bet.id, 
                                                      selectionId: sel.id, 
                                                      result: sel.result === "lost" ? "pending" : "lost" 
                                                    })}
                                                    disabled={!bet.verified}
                                                    data-testid={`button-sel-lost-${sel.id}`}
                                                  >
                                                    <XCircle className={`w-3.5 h-3.5 ${sel.result === "lost" ? "text-white" : "text-red-500"}`} />
                                                  </Button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <DollarSign className="w-4 h-4 text-muted-foreground" />
                                Aposta: <span className="font-bold">R$&nbsp;{bet.stake.toFixed(2)}</span>
                              </span>
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <TrendingUp className="w-4 h-4 text-primary" />
                                Retorno: <span className="font-bold text-primary">R$&nbsp;{bet.potentialWin.toFixed(2)}</span>
                              </span>
                              <span className="text-muted-foreground whitespace-nowrap">
                                Odd:&nbsp;{fmtOdds(bet.totalOdds)}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1 w-full sm:w-auto">
                            <Select
                              value={bet.status}
                              onValueChange={(value: BetStatus) => 
                                updateStatusMutation.mutate({ id: bet.id, status: value })
                              }
                              disabled={!bet.verified}
                            >
                              <SelectTrigger className={`w-32 ${!bet.verified ? "opacity-40 cursor-not-allowed" : ""}`} data-testid={`select-status-${bet.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">
                                  <span className="flex items-center gap-2">
                                    <AlertCircle className="w-3 h-3" /> Pendente
                                  </span>
                                </SelectItem>
                                <SelectItem value="won">
                                  <span className="flex items-center gap-2">
                                    <CheckCircle className="w-3 h-3 text-green-500" /> Ganhou
                                  </span>
                                </SelectItem>
                                <SelectItem value="lost">
                                  <span className="flex items-center gap-2">
                                    <XCircle className="w-3 h-3 text-red-500" /> Perdeu
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>

                            {bet.status === "pending" && bet.selections.some(s => s.gameId.startsWith("api-football-")) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                                onClick={() => autoResolveMutation.mutate(bet.id)}
                                disabled={autoResolveMutation.isPending}
                                data-testid={`button-auto-resolve-${bet.id}`}
                                title="Buscar resultado real na API-Football e resolver seleções automaticamente"
                              >
                                <Zap className={`w-4 h-4 mr-1 ${autoResolveMutation.isPending ? 'animate-pulse' : ''}`} />
                                Resolver Auto
                              </Button>
                            )}

                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => recheckBetMutation.mutate(bet.id)}
                              disabled={recheckBetMutation.isPending}
                              data-testid={`button-recheck-${bet.id}`}
                              title="Resetar bilhete para pendente e reverificar"
                            >
                              <RefreshCw className={`w-4 h-4 mr-1 ${recheckBetMutation.isPending ? 'animate-spin' : ''}`} />
                              Reverificar
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`button-delete-${bet.id}`}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir bilhete?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    O bilhete #{bet.id.slice(0, 8).toUpperCase()} será removido permanentemente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => deleteBetMutation.mutate(bet.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="mercados">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    Gerenciamento de Mercados
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => {
                      const updates = Object.entries(marketBoosts).map(([marketKey, boostPercent]) => ({
                        marketKey,
                        boostPercent,
                      }));
                      saveMarketSettingsMutation.mutate(updates);
                    }}
                    disabled={saveMarketSettingsMutation.isPending}
                    data-testid="button-save-market-settings"
                  >
                    {saveMarketSettingsMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    Salvar Alterações
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Controle o percentual de aumento ou diminuição das odds para cada mercado. Valores positivos aumentam a odd, negativos diminuem.
                </p>
              </CardHeader>
              <CardContent>
                {marketSettingsLoading ? (
                  <div className="space-y-4">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {marketSettings.map((setting) => {
                      const currentBoost = marketBoosts[setting.marketKey] ?? setting.boostPercent;
                      const isModified = currentBoost !== setting.boostPercent;
                      return (
                        <div
                          key={setting.marketKey}
                          className={`flex items-center justify-between gap-4 p-4 rounded-lg border transition-colors ${
                            isModified ? "border-primary/50 bg-primary/5" : "border-border bg-muted/30"
                          }`}
                          data-testid={`market-row-${setting.marketKey}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{setting.marketName}</p>
                            <p className="text-xs text-muted-foreground">
                              {currentBoost > 0 ? (
                                <span className="text-green-500 flex items-center gap-1">
                                  <TrendingUp className="w-3 h-3" /> Odds aumentadas em {currentBoost}%
                                </span>
                              ) : currentBoost < 0 ? (
                                <span className="text-red-500 flex items-center gap-1">
                                  <TrendingDown className="w-3 h-3" /> Odds reduzidas em {Math.abs(currentBoost)}%
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Sem alteração nas odds</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-8 h-8 p-0"
                              onClick={() => setMarketBoosts(prev => ({ ...prev, [setting.marketKey]: (prev[setting.marketKey] ?? setting.boostPercent) - 1 }))}
                              data-testid={`button-decrease-${setting.marketKey}`}
                            >
                              −
                            </Button>
                            <div className="relative w-20">
                              <Input
                                type="number"
                                value={currentBoost}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val)) {
                                    setMarketBoosts(prev => ({ ...prev, [setting.marketKey]: val }));
                                  }
                                }}
                                className="text-center pr-6 h-8 text-sm"
                                data-testid={`input-boost-${setting.marketKey}`}
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-8 h-8 p-0"
                              onClick={() => setMarketBoosts(prev => ({ ...prev, [setting.marketKey]: (prev[setting.marketKey] ?? setting.boostPercent) + 1 }))}
                              data-testid={`button-increase-${setting.marketKey}`}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="banners">
            <BannersTab />
          </TabsContent>

          <TabsContent value="regras">
            <RulesEditorTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function BannersTab() {
  const { toast } = useToast();
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);

  const { data: banners = [], isLoading } = useQuery<Banner[]>({
    queryKey: ["/api/banners"],
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ slot, file }: { slot: number; file: File }) => {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`/api/admin/banners/${slot}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Falha no upload");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/banners"] });
      toast({ title: "Banner enviado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao enviar banner", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (slot: number) => {
      const res = await fetch(`/api/admin/banners/${slot}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao remover");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/banners"] });
      toast({ title: "Banner removido" });
    },
    onError: () => {
      toast({ title: "Erro ao remover banner", variant: "destructive" });
    },
  });

  const handleFileSelect = (slot: number, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande (max 5MB)", variant: "destructive" });
      return;
    }
    uploadMutation.mutate({ slot, file });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Image className="w-5 h-5" />
          Banners do Site
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Gerencie os 4 banners exibidos no carrossel do site. Tamanho recomendado: 1200x400px.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(slot => {
              const banner = banners.find(b => b.slotNumber === slot);
              return (
                <div
                  key={slot}
                  className="border rounded-lg overflow-hidden bg-card"
                  data-testid={`banner-slot-${slot}`}
                >
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                    <span className="text-sm font-medium">Slot {slot}</span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRefs.current[slot - 1]?.click()}
                        disabled={uploadMutation.isPending}
                        data-testid={`button-upload-${slot}`}
                      >
                        <Upload className="w-3 h-3 mr-1" />
                        {banner ? "Trocar" : "Enviar"}
                      </Button>
                      {banner && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteMutation.mutate(slot)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-banner-${slot}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <input
                    ref={el => { fileInputRefs.current[slot - 1] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(slot, file);
                      e.target.value = "";
                    }}
                    data-testid={`input-file-${slot}`}
                  />
                  <div className="aspect-[3/1] bg-muted/30 flex items-center justify-center">
                    {banner ? (
                      <img
                        src={`${banner.url}?t=${new Date(banner.updatedAt).getTime()}`}
                        alt={`Banner ${slot}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center text-muted-foreground">
                        <Image className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">Nenhum banner</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RulesEditorTab() {
  const { toast } = useToast();
  const { data: rulesData, isLoading: rulesLoading } = useQuery<{ content: string }>({
    queryKey: ["/api/rules"],
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExt,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "min-h-[400px] outline-none px-4 py-3 prose prose-sm dark:prose-invert max-w-none",
      },
    },
  });

  useEffect(() => {
    if (editor && rulesData?.content !== undefined && !editor.isFocused) {
      editor.commands.setContent(rulesData.content);
    }
  }, [rulesData?.content, editor]);

  const saveMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rules"] });
      toast({ title: "Regras salvas com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar regras", variant: "destructive" });
    },
  });

  const ToolbarBtn = ({
    onClick, active, children, title: btnTitle,
  }: { onClick: () => void; active?: boolean; children: React.ReactNode; title?: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={btnTitle}
      className={`p-1.5 rounded transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
    >
      {children}
    </button>
  );

  if (rulesLoading) return <div className="flex items-center justify-center h-40"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="w-5 h-5 text-primary" />
            Editor de Regras do Site
          </CardTitle>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate(editor?.getHTML() ?? "")}
            disabled={saveMutation.isPending}
            data-testid="button-save-rules"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar Regras"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b bg-muted/30">
          <ToolbarBtn onClick={() => editor?.chain().focus().undo().run()} title="Desfazer">
            <Undo className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().redo().run()} title="Refazer">
            <Redo className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor?.isActive("heading", { level: 1 })}
            title="Título 1"
          >
            <Heading1 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor?.isActive("heading", { level: 2 })}
            title="Título 2"
          >
            <Heading2 className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor?.isActive("heading", { level: 3 })}
            title="Título 3"
          >
            <Heading3 className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive("bold")}
            title="Negrito"
          >
            <Bold className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive("italic")}
            title="Itálico"
          >
            <Italic className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            active={editor?.isActive("underline")}
            title="Sublinhado"
          >
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive("bulletList")}
            title="Lista com marcadores"
          >
            <List className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive("orderedList")}
            title="Lista numerada"
          >
            <ListOrdered className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolbarBtn
            onClick={() => editor?.chain().focus().setTextAlign("left").run()}
            active={editor?.isActive({ textAlign: "left" })}
            title="Alinhar à esquerda"
          >
            <AlignLeft className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().setTextAlign("center").run()}
            active={editor?.isActive({ textAlign: "center" })}
            title="Centralizar"
          >
            <AlignCenter className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor?.chain().focus().setTextAlign("right").run()}
            active={editor?.isActive({ textAlign: "right" })}
            title="Alinhar à direita"
          >
            <AlignRight className="w-4 h-4" />
          </ToolbarBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer" title="Cor do texto">
            <span
              className="w-5 h-5 rounded border border-border inline-block"
              style={{ background: editor?.getAttributes("textStyle").color || "#000000" }}
            />
            <input
              type="color"
              className="sr-only"
              onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
            />
          </label>
        </div>
        {/* Editor area */}
        <div className="min-h-[400px] cursor-text" onClick={() => editor?.commands.focus()}>
          <EditorContent editor={editor} />
        </div>
      </CardContent>
    </Card>
  );
}
