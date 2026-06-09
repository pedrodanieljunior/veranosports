import { useState, useMemo, useEffect, useRef } from "react";
import { fmtOdds } from "@/lib/formatOdds";
import { translateLeagueDisplay } from "@/lib/leagueTranslations";
import { translateTeam } from "@/lib/teamTranslations";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BetSlip as BetSlipType, MarketSetting, Banner, Withdrawal, BoostCard, User, Deposit, UserWithdrawal, Defesa } from "@shared/schema";
import { computeTotalOdds, checkIsComboBonus, getComboBonus } from "@shared/oddsUtils";
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
  ChevronLeft,
  ChevronRight,
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
  Users,
  Edit,
  Eye,
  EyeOff,
  Gift,
  Star,
  UserCheck,
  Search,
  Settings,
  RotateCcw,
  Shield,
  Pencil,
  Filter,
  Check,
  Timer,
  Lock,
  Unlock,
  Signal,
  PlayCircle,
  StopCircle,
  Smartphone,
  ExternalLink,
  Minus,
  Loader2,
  X,
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
import { proxyLogoUrl } from "@/lib/imgProxy";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { translateMarket, formatOutcome } from "@/lib/marketLabels";
import { useComboBonus } from "@/hooks/use-combo-bonus";

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

type BetStatus = "pending" | "won" | "lost" | "anulado" | "cashed_out";

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

const DEFAULT_COMBO_BONUS_PCT: Record<number, number> = {
  2: 5, 3: 10, 4: 15, 5: 20, 6: 27, 7: 34, 8: 41, 9: 49, 10: 58, 11: 65, 12: 72,
};

function computeBetPayout(bet: { stake: number; selections: any[] }, bonusTable?: Record<number, number>) {
  const isCombo = checkIsComboBonus(bet.selections);
  const dc = new Set(bet.selections.map((s: any) => s.gameId)).size;
  const comboPct = isCombo ? getComboBonus(dc, bonusTable) : 0;
  const baseOdds = computeTotalOdds(bet.selections);
  const displayTotalOdds = isCombo
    ? Math.floor(baseOdds * (1 + comboPct) * 100) / 100
    : baseOdds;
  const displayPotentialWin = Math.round(bet.stake * displayTotalOdds * 100) / 100;

  const isSingleBoosted = !isCombo && bet.selections.length === 1 &&
    bet.selections[0].originalOdds !== undefined &&
    Math.abs((bet.selections[0].originalOdds ?? 0) - bet.selections[0].odds) > 0.001;

  let baseReturn: number | null = null;
  let bonusReturn: number | null = null;

  if (isCombo && comboPct > 0) {
    const baseOddsRounded = Math.round(baseOdds * 100) / 100;
    baseReturn = Math.round(bet.stake * baseOddsRounded * 100) / 100;
    bonusReturn = Math.round((displayPotentialWin - baseReturn) * 100) / 100;
  } else if (isSingleBoosted) {
    const origOdds = bet.selections[0].originalOdds as number;
    baseReturn = Math.round(bet.stake * origOdds * 100) / 100;
    bonusReturn = Math.round((displayPotentialWin - baseReturn) * 100) / 100;
  }

  const bonusLabel = isCombo && comboPct > 0
    ? "bônus combinada"
    : baseReturn !== null
      ? "bônus super aumentada"
      : "";

  return { displayPotentialWin, baseReturn, bonusReturn, baseOdds, isCombo, comboPct, bonusLabel };
}

function fmtBRL(n: number) {
  return n.toFixed(2).replace(".", ",");
}

export default function Admin() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<"today" | "week" | "month" | "all">("all");
  const [betSearch, setBetSearch] = useState<string>("");
  const [betPage, setBetPage] = useState<number>(1);
  const [userFilter, setUserFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const BETS_PER_PAGE = 15;
  const [adminTab, setAdminTab] = useState<string>("bilhetes");
  const [riskSelected, setRiskSelected] = useState<"low" | "mid" | "high" | null>(null);
  const [finPeriod, setFinPeriod] = useState<"all" | "month" | "week" | "today">("month");
  const [finDateFrom, setFinDateFrom] = useState<string>("");
  const [finDateTo, setFinDateTo] = useState<string>("");
  const [marketBoosts, setMarketBoosts] = useState<Record<string, number>>({});
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>("");
  const [withdrawalDesc, setWithdrawalDesc] = useState<string>("");
  const [adminPassword, setAdminPassword] = useState<string>("");
  const [showAdminPassword, setShowAdminPassword] = useState<boolean>(false);
  const [defendDialog, setDefendDialog] = useState<{ bet: BetSlipType; stake: string } | null>(null);

  const { data: adminMe, isLoading: adminMeLoading } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/me"],
    retry: false,
  });

  const loginAdminMutation = useMutation({
    mutationFn: async (password: string) => {
      return apiRequest("POST", "/api/admin/login", { password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      setAdminPassword("");
    },
    onError: () => {
      toast({ title: "Senha incorreta", description: "A senha de administrador está incorreta.", variant: "destructive" });
    },
  });

  const logoutAdminMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/logout", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
    },
  });

  const clearAllSessionsMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/clear-all-sessions", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/me"] });
    },
  });

  const { data: bets = [], isLoading, refetch } = useQuery<BetSlipType[]>({
    queryKey: ["/api/admin/bets"],
    refetchInterval: adminMe?.isAdmin ? 5 * 1000 : false,
    enabled: !!adminMe?.isAdmin,
  });

  const { data: copaCardsAdmin = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/copa-world-cup-cards"],
    enabled: !!adminMe?.isAdmin,
    staleTime: 60_000,
  });
  const copaCardBadgeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of copaCardsAdmin) {
      if (c.badge) m.set(`copa-card-${c.id}`, c.badge);
    }
    return m;
  }, [copaCardsAdmin]);

  const { data: withdrawals = [], refetch: refetchWithdrawals } = useQuery<Withdrawal[]>({
    queryKey: ["/api/admin/withdrawals"],
    enabled: !!adminMe?.isAdmin,
  });

  const { data: allDeposits = [], refetch: refetchAllDeposits } = useQuery<Deposit[]>({
    queryKey: ["/api/admin/deposits"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/deposits");
      return res.json();
    },
    enabled: !!adminMe?.isAdmin,
    refetchInterval: adminMe?.isAdmin ? 5 * 1000 : false,
  });

  const { data: allUsers = [], refetch: refetchAllUsers } = useQuery<{ cpf: string; name: string; balance: number }[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users");
      return res.json();
    },
    enabled: !!adminMe?.isAdmin,
    refetchInterval: adminMe?.isAdmin ? 10 * 1000 : false,
  });

  const { data: allUserWithdrawals = [], refetch: refetchUserWithdrawals } = useQuery<UserWithdrawal[]>({
    queryKey: ["/api/admin/user-withdrawals"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/user-withdrawals");
      return res.json();
    },
    enabled: !!adminMe?.isAdmin,
    refetchInterval: adminMe?.isAdmin ? 10 * 1000 : false,
  });

  const { data: defensasData, refetch: refetchDefesas } = useQuery<{ defesas: Defesa[]; defensasBalance: number; defensasInitialBalance: number; defensasProfits: number }>({
    queryKey: ["/api/admin/defensas"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/defensas");
      return res.json();
    },
    enabled: !!adminMe?.isAdmin,
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
    let filtered = bets;
    if (finDateFrom) {
      const from = new Date(finDateFrom + "T00:00:00");
      filtered = filtered.filter(b => new Date(b.createdAt) >= from);
    }
    if (finDateTo) {
      const to = new Date(finDateTo + "T23:59:59");
      filtered = filtered.filter(b => new Date(b.createdAt) <= to);
    }
    if (finDateFrom || finDateTo) return filtered;
    if (finPeriod === "today") {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return bets.filter(b => new Date(b.createdAt) >= s);
    }
    if (finPeriod === "week") return bets.filter(b => new Date(b.createdAt) >= startOfWeek(now, { locale: ptBR }));
    if (finPeriod === "month") return bets.filter(b => new Date(b.createdAt) >= startOfMonth(now));
    return bets;
  }, [bets, finPeriod, finDateFrom, finDateTo]);

  const finDayData = useMemo(() => DAYS_PT.map((day, idx) => {
    const db = periodBets.filter(b => new Date(b.createdAt).getDay() === idx);
    const e = db.reduce((s,b)=>s+b.stake,0);
    const s2 = db.filter(b=>b.status==="won").reduce((s,b)=>s+Math.max(0,b.potentialWin-(b.bonusUsed??0)),0);
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
        cur.entrada += bet.stake;
        if (bet.status==="won") cur.saida += Math.max(0, bet.potentialWin - (bet.bonusUsed ?? 0));
        cur.lucroEntrada += bet.stake;
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
    enabled: !!adminMe?.isAdmin,
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

  const { fractionTable: comboBonusTable } = useComboBonus();

  const { data: comboBonusSettings = DEFAULT_COMBO_BONUS_PCT, isLoading: comboBonusLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/admin/combo-bonus"],
    staleTime: 30 * 1000,
    enabled: !!adminMe?.isAdmin,
  });

  const [comboBonusEdits, setComboBonusEdits] = useState<Record<number, number>>({});

  useEffect(() => {
    const init: Record<number, number> = {};
    for (let i = 2; i <= 12; i++) {
      init[i] = (comboBonusSettings[String(i)] as number | undefined) ?? DEFAULT_COMBO_BONUS_PCT[i];
    }
    setComboBonusEdits(init);
  }, [comboBonusSettings]);

  const saveComboBonusMutation = useMutation({
    mutationFn: async (data: Record<number, number>) => {
      const response = await apiRequest("PUT", "/api/admin/combo-bonus", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/combo-bonus"] });
      queryClient.invalidateQueries({ queryKey: ["/api/market-settings/combo-bonus"] });
      toast({ title: "Bônus Combinada atualizado", description: "Os percentuais foram salvos e já estão ativos no sistema." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível salvar os percentuais.", variant: "destructive" });
    },
  });

  const { data: gameLimitsData, isLoading: gameLimitsLoading, refetch: refetchGameLimits } = useQuery<{ totals: GameLimitEntry[]; limit: number }>({
    queryKey: ["/api/admin/game-limits"],
    refetchInterval: 30 * 1000,
    enabled: !!adminMe?.isAdmin,
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
      queryClient.invalidateQueries({ queryKey: ["/api/club-fw/progress"] });
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
      const res = await apiRequest("PATCH", `/api/admin/bets/${id}/status`, { status });
      return { status, data: await res.json() };
    },
    onSuccess: ({ status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/limits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/defensas"] });
      toast({
        title: status === "anulado"
          ? "Bilhete anulado"
          : "Status atualizado",
        description: status === "anulado"
          ? "O valor apostado foi devolvido ao saldo do usuário."
          : "O status do bilhete foi atualizado.",
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
      queryClient.invalidateQueries({ queryKey: ["/api/club-fw/progress"] });
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

  const defendBetMutation = useMutation({
    mutationFn: async ({ betId, stake }: { betId: string; stake: number }) => {
      const res = await apiRequest("POST", `/api/admin/bets/${betId}/defend`, { stake });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/defensas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/limits"] });
      setDefendDialog(null);
      toast({
        title: "Defesa criada",
        description: "Bilhete de defesa criado e registrado no caixa de defesas.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao criar defesa",
        description: err?.message ?? "Não foi possível criar a defesa.",
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

  const resetCaixaMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/reset-caixa");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/user-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/limits"] });
      refetch(); refetchWithdrawals(); refetchAllDeposits(); refetchAllUsers(); refetchUserWithdrawals(); refetchLimits();
      toast({ title: "Caixa zerado", description: "Todos os movimentos foram apagados. Caixa retornou ao aporte inicial." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível zerar o caixa.", variant: "destructive" });
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
    if (betSearch.trim()) {
      const q = betSearch.trim().toLowerCase().replace(/#/g, "");
      const shortId = bet.id.replace(/-/g, "").substring(0, 8).toLowerCase();
      if (!shortId.includes(q) && !bet.id.toLowerCase().includes(q)) return false;
    }
    if (userFilter.trim()) {
      const q = userFilter.trim().toLowerCase();
      const betUser = allUsers.find(u => u.cpf === bet.userId);
      const nameMatch = betUser?.name?.toLowerCase().includes(q);
      const cpfMatch = bet.userId?.toLowerCase().includes(q);
      if (!nameMatch && !cpfMatch) return false;
    }
    const created = new Date(bet.createdAt);
    if (dateFrom) {
      const from = new Date(dateFrom + "T00:00:00");
      if (created < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59");
      if (created > to) return false;
    }
    if (periodFilter !== "all") {
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

  const betTotalPages = Math.max(1, Math.ceil(filteredBets.length / BETS_PER_PAGE));
  const paginatedBets = filteredBets.slice((betPage - 1) * BETS_PER_PAGE, betPage * BETS_PER_PAGE);

  const stats = {
    total: bets.length,
    pending: bets.filter(b => b.status === "pending").length,
    won: bets.filter(b => b.status === "won").length,
    lost: bets.filter(b => b.status === "lost").length,
    anulado: bets.filter(b => b.status === "anulado").length,
    totalStake: bets.reduce((sum, b) => sum + b.stake, 0),
    totalPotential: bets.reduce((sum, b) => sum + b.potentialWin, 0),
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "won":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Ganhou</Badge>;
      case "lost":
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Perdeu</Badge>;
      case "anulado":
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Anulado</Badge>;
      case "cashed_out":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Cashout</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Em andamento</Badge>;
    }
  };

  if (adminMeLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!adminMe?.isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Painel de Administração</h1>
            <p className="text-muted-foreground mt-1">Digite a senha para continuar</p>
          </div>
          <div className="space-y-3">
            <div className="relative">
              <Input
                type={showAdminPassword ? "text" : "password"}
                placeholder="Senha de administrador"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") loginAdminMutation.mutate(adminPassword); }}
                data-testid="input-admin-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowAdminPassword((v) => !v)}
                data-testid="button-toggle-admin-password"
              >
                {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              className="w-full"
              onClick={() => loginAdminMutation.mutate(adminPassword)}
              disabled={loginAdminMutation.isPending || !adminPassword}
              data-testid="button-admin-login"
            >
              {loginAdminMutation.isPending ? "Entrando..." : "Entrar"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm("Encerrar TODAS as sessões ativas? Qualquer pessoa logada será desconectada imediatamente.")) {
                  clearAllSessionsMutation.mutate();
                }
              }}
              disabled={clearAllSessionsMutation.isPending}
              data-testid="button-clear-all-sessions"
            >
              Encerrar Todas as Sessões
            </Button>
            <Button variant="ghost" size="sm" onClick={() => logoutAdminMutation.mutate()} data-testid="button-admin-logout">
              Sair
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
              <p className="text-2xl font-bold text-gray-400">{stats.anulado}</p>
              <p className="text-xs text-muted-foreground">Anulados</p>
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
            <TabsTrigger value="riscos" data-testid="tab-riscos">
              <ShieldAlert className="w-4 h-4 mr-2" />
              Riscos
            </TabsTrigger>
            <TabsTrigger value="caixa" data-testid="tab-caixa">
              <Wallet className="w-4 h-4 mr-2" />
              Caixa
            </TabsTrigger>
            <TabsTrigger value="financeiro" data-testid="tab-financeiro">
              <PieChart className="w-4 h-4 mr-2" />
              Financeiro
            </TabsTrigger>
            <TabsTrigger value="pagamentos" data-testid="tab-pagamentos" className="relative">
              <Banknote className="w-4 h-4 mr-2" />
              Pagamentos
              {allUserWithdrawals.filter(w => w.status === "pending").length > 0 && (
                <span className="ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {allUserWithdrawals.filter(w => w.status === "pending").length}
                </span>
              )}
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
            <TabsTrigger value="copa-mundo" data-testid="tab-copa-mundo">
              <Trophy className="w-4 h-4 mr-2" />
              Copa do Mundo
            </TabsTrigger>
            <TabsTrigger value="boost" data-testid="tab-boost">
              <Zap className="w-4 h-4 mr-2" />
              Boost
            </TabsTrigger>
            <TabsTrigger value="depositos" data-testid="tab-depositos" className="relative">
              <Wallet className="w-4 h-4 mr-2" />
              Depósitos
              {allDeposits.filter(d => d.status === "pending").length > 0 && (
                <span className="ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {allDeposits.filter(d => d.status === "pending").length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="usuarios" data-testid="tab-usuarios">
              <Users className="w-4 h-4 mr-2" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="indicacoes" data-testid="tab-indicacoes">
              <UserCheck className="w-4 h-4 mr-2" />
              Indicações
            </TabsTrigger>
            <TabsTrigger value="defesas" data-testid="tab-defesas">
              <Shield className="w-4 h-4 mr-2" />
              Defesas
            </TabsTrigger>
            <TabsTrigger value="recompensas" data-testid="tab-recompensas">
              <Gift className="w-4 h-4 mr-2" />
              Recompensas
            </TabsTrigger>
            <TabsTrigger value="configuracoes" data-testid="tab-configuracoes">
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="ao-vivo" data-testid="tab-ao-vivo">
              <Signal className="w-4 h-4 mr-2 text-red-500" />
              Ao Vivo
            </TabsTrigger>
            <TabsTrigger value="bolao" data-testid="tab-bolao">
              <Trophy className="w-4 h-4 mr-2 text-yellow-400" />
              Bolão
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
                                {translateTeam(entry.homeTeam)}{entry.awayTeam ? <> <span className="text-muted-foreground">vs</span> {translateTeam(entry.awayTeam)}</> : ""}
                              </p>
                              <p className="text-xs text-muted-foreground">{translateLeagueDisplay(entry.sportTitle)} · {entry.count} aposta{entry.count !== 1 ? "s" : ""} simples</p>
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

          {/* ── RISCOS ─────────────────────────────────────────── */}
          <TabsContent value="riscos">
            <div className="space-y-4">
              {(() => {
                const pending = bets.filter(b => b.status === "pending");
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
                                    {bet.selections.map(s=>s.awayTeam ? `${s.homeTeam} x ${s.awayTeam}` : s.homeTeam).join(" · ")}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 mt-1 sm:mt-0">
                                  <div className="whitespace-nowrap">
                                    <p className="text-xs text-muted-foreground">Apostado</p>
                                    <p className="font-bold text-sm">R$&nbsp;{bet.stake.toFixed(2)}</p>
                                  </div>
                                  <div className="text-right whitespace-nowrap">
                                    <p className="text-xs text-muted-foreground">Retorno</p>
                                    {(() => {
                                      const { displayPotentialWin, baseReturn, bonusReturn, bonusLabel } = computeBetPayout(bet, comboBonusTable);
                                      const bonusUsed = bet.bonusUsed ?? 0;
                                      const netReturn = Math.max(0, displayPotentialWin - bonusUsed);
                                      return (
                                        <>
                                          <p className={`font-bold text-sm ${activeGroup.textCls}`}>R$&nbsp;{fmtBRL(bonusUsed > 0 ? netReturn : displayPotentialWin)}</p>
                                          {bonusUsed > 0 && (
                                            <p className="text-[10px] text-zinc-400">R$&nbsp;{fmtBRL(displayPotentialWin)}&nbsp;−&nbsp;R$&nbsp;{fmtBRL(bonusUsed)}&nbsp;bônus</p>
                                          )}
                                          {bonusUsed === 0 && baseReturn !== null && bonusReturn !== null && (
                                            <p className="text-[10px] text-muted-foreground">R$&nbsp;{fmtBRL(baseReturn)}&nbsp;+&nbsp;R$&nbsp;{fmtBRL(bonusReturn)}&nbsp;{bonusLabel}</p>
                                          )}
                                        </>
                                      );
                                    })()}
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

            </div>
          </TabsContent>

          {/* ── CAIXA ─────────────────────────────────────────── */}
          <TabsContent value="caixa">
            <div className="space-y-4">

              {/* Painel central — Caixa */}
              {(() => {
                const APORTE_INICIAL = 50000;
                // Entradas reais de PIX (sem o bônus que é artificial)
                const confirmedDeposits = allDeposits.filter(d => d.status === "confirmed");
                const entradasPix = confirmedDeposits.reduce((s, d) => s + d.amount, 0);
                // Provisionamento: saldos líquidos dos clientes (sem bonusBalance)
                const saldosClientes = allUsers.reduce((s, u) => s + u.balance, 0);
                // Provisionamento: ganhos potenciais líquidos (apostas pendentes, descontando bônus usado)
                const exposicao = bets.filter(b => b.status === "pending").reduce((s, b) => s + Math.max(0, b.potentialWin - (b.bonusUsed ?? 0)), 0);
                // Saques do caixa (retiradas administrativas)
                const totalSaquesAdmin = withdrawals.reduce((s, w) => s + w.amount, 0);
                // Pagamentos feitos a usuários (saques pagos via PIX)
                const pagamentosUsuarios = allUserWithdrawals
                  .filter(w => w.status === "paid" || w.status === "approved")
                  .reduce((s, w) => s + w.amount, 0);

                // Fórmula principal
                const defensasProfits = defensasData?.defensasProfits ?? 0;
                const cashPlus = bets
                  .filter(b => (b as any).cashOutValue != null)
                  .reduce((s, b) => s + Math.max(0, b.stake - ((b as any).cashOutValue ?? b.stake)), 0);
                const caixa = APORTE_INICIAL
                  + entradasPix
                  - saldosClientes
                  - exposicao
                  - totalSaquesAdmin
                  - pagamentosUsuarios
                  + defensasProfits
                  + cashPlus;

                const isPositive = caixa >= 0;

                const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                // Lucro operacional = entradas PIX − saldos dos clientes
                const lucroOp = entradasPix - saldosClientes;
                const lucroOpPositivo = lucroOp >= 0;
                // Barra de lucro — referência = 20% do aporte (meta razoável)
                const lucroMeta = APORTE_INICIAL * 0.2;
                const lucroPct = lucroMeta > 0 ? Math.max(0, Math.min(100, (Math.abs(lucroOp) / lucroMeta) * 100)) : 0;
                const lucroBarColor = !lucroOpPositivo
                  ? "bg-gradient-to-r from-red-600 to-rose-400"
                  : lucroOp > lucroMeta * 0.5
                  ? "bg-gradient-to-r from-violet-600 to-purple-400"
                  : "bg-gradient-to-r from-yellow-600 to-amber-400";

                // Barra de saúde do caixa — referência = aporte
                const caixaPct = Math.max(0, Math.min(200, (caixa / APORTE_INICIAL) * 100));
                const barColor = caixa > APORTE_INICIAL * 0.8
                  ? "bg-gradient-to-r from-green-600 to-emerald-400"
                  : caixa > APORTE_INICIAL * 0.4
                  ? "bg-gradient-to-r from-yellow-600 to-amber-400"
                  : "bg-gradient-to-r from-red-600 to-rose-400";

                return (
                  <Card className={`border-2 ${isPositive ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"}`}>
                    <CardContent className="p-6">
                      {/* Cabeçalho */}
                      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <Wallet className="w-7 h-7 text-primary" />
                          <div>
                            <p className="text-lg font-bold">Caixa</p>
                            <p className="text-xs text-muted-foreground">
                              Aporte + Entradas − Obrigações − Saídas
                            </p>
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
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline" size="sm"
                                className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                                disabled={resetCaixaMutation.isPending}
                                data-testid="button-reset-caixa"
                              >
                                <RotateCcw className="w-4 h-4 mr-1" />
                                Zerar
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Zerar o Caixa?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação irá apagar <strong>todas as apostas, depósitos, saques, pagamentos e bônus</strong>, e zerar o saldo de todos os usuários. O caixa voltará ao aporte inicial de R$50.000. Essa operação <strong>não pode ser desfeita</strong>.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-600 hover:bg-red-700"
                                  onClick={() => resetCaixaMutation.mutate()}
                                >
                                  Confirmar — Zerar Caixa
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <Button
                            variant="outline" size="sm"
                            onClick={() => { refetch(); refetchWithdrawals(); refetchAllDeposits(); refetchAllUsers(); refetchUserWithdrawals(); refetchLimits(); }}
                            data-testid="button-refresh-caixa"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Saldo principal */}
                      <div className="text-center mb-5">
                        <p className="text-xs text-muted-foreground mb-1">Saldo líquido do Caixa</p>
                        <p className={`text-4xl font-bold ${isPositive ? "text-green-500" : "text-red-400"}`} data-testid="text-caixa-saldo">
                          {isPositive ? "+" : ""}R${fmt(caixa)}
                        </p>
                      </div>

                      {/* Barras */}
                      <div className="mb-6 space-y-3">
                        {/* Barra 1 — Saúde do caixa */}
                        <div>
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Saúde do caixa</span>
                            <span className={`font-semibold ${isPositive ? "text-green-400" : "text-red-400"}`}>
                              {caixaPct.toFixed(1)}% do aporte · {isPositive ? "+" : ""}R${fmt(caixa)}
                            </span>
                          </div>
                          <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.min(100, caixaPct)}%` }} />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>R$0</span>
                            <span>R$50.000 (aporte)</span>
                          </div>
                        </div>

                        {/* Barra 2 — Lucro operacional (apostas) */}
                        <div>
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Lucro operacional</span>
                            <span className={`font-semibold ${lucroOpPositivo ? "text-violet-400" : "text-red-400"}`}>
                              {lucroOpPositivo ? "+" : "−"}R${fmt(Math.abs(lucroOp))}
                              <span className="text-muted-foreground font-normal ml-1">(entradas PIX − saldos clientes)</span>
                            </span>
                          </div>
                          <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-500 ${lucroBarColor}`} style={{ width: `${lucroPct}%` }} />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>{lucroOpPositivo ? "R$0" : "Prejuízo"}</span>
                            <span>Meta: R${fmt(lucroMeta)}</span>
                          </div>
                        </div>

                        {/* Barra 3 — Caixa de Defesas */}
                        {(() => {
                          const defBal = defensasData?.defensasBalance ?? 0;
                          const defInit = defensasData?.defensasInitialBalance ?? 1000;
                          const defPct = defInit > 0 ? Math.max(0, Math.min(100, (defBal / defInit) * 100)) : 0;
                          const defColor = defPct > 60
                            ? "bg-gradient-to-r from-cyan-600 to-cyan-400"
                            : defPct > 25
                            ? "bg-gradient-to-r from-yellow-600 to-amber-400"
                            : "bg-gradient-to-r from-red-600 to-rose-400";
                          return (
                            <div>
                              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-cyan-400" /> Caixa de Defesas</span>
                                <span className="font-semibold text-cyan-400">
                                  R${fmt(defBal)} / R${fmt(defInit)}
                                  {(defensasData?.defensasProfits ?? 0) > 0 && (
                                    <span className="text-green-400 ml-1">(+R${fmt(defensasData!.defensasProfits)} lucro no caixa)</span>
                                  )}
                                </span>
                              </div>
                              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-500 ${defColor}`} style={{ width: `${defPct}%` }} />
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                <span>R$0</span>
                                <span>R${fmt(defInit)} (limite configurado)</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Grid de componentes */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                        {/* Aporte */}
                        <div className="bg-muted/50 rounded-lg p-3 text-center">
                          <Wallet className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-sm font-bold">+R${fmt(APORTE_INICIAL)}</p>
                          <p className="text-xs text-muted-foreground">Aporte inicial</p>
                        </div>
                        {/* Entradas PIX */}
                        <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                          <ArrowUpCircle className="w-4 h-4 mx-auto mb-1 text-blue-400" />
                          <p className="text-sm font-bold text-blue-400">+R${fmt(entradasPix)}</p>
                          <p className="text-xs text-muted-foreground">Entradas PIX</p>
                        </div>
                        {/* Saldos dos clientes */}
                        <div className="bg-purple-500/10 rounded-lg p-3 text-center">
                          <Users className="w-4 h-4 mx-auto mb-1 text-purple-400" />
                          <p className="text-sm font-bold text-purple-400">−R${fmt(saldosClientes)}</p>
                          <p className="text-xs text-muted-foreground">Saldos clientes</p>
                        </div>
                        {/* Exposição potencial */}
                        <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                          <ShieldAlert className="w-4 h-4 mx-auto mb-1 text-yellow-400" />
                          <p className="text-sm font-bold text-yellow-400">−R${fmt(exposicao)}</p>
                          <p className="text-xs text-muted-foreground">Ganhos potenciais</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Saques admin */}
                        <div className="bg-orange-500/10 rounded-lg p-3 text-center">
                          <MinusCircle className="w-4 h-4 mx-auto mb-1 text-orange-400" />
                          <p className="text-sm font-bold text-orange-400">−R${fmt(totalSaquesAdmin)}</p>
                          <p className="text-xs text-muted-foreground">Saques (caixa)</p>
                        </div>
                        {/* Pagamentos usuários */}
                        <div className="bg-red-500/10 rounded-lg p-3 text-center">
                          <ArrowDownCircle className="w-4 h-4 mx-auto mb-1 text-red-400" />
                          <p className="text-sm font-bold text-red-400">−R${fmt(pagamentosUsuarios)}</p>
                          <p className="text-xs text-muted-foreground">Pagamentos usuários</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        {/* Lucro Defesas */}
                        <div className="bg-cyan-500/10 rounded-lg p-3 text-center">
                          <Shield className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
                          <p className="text-sm font-bold text-cyan-400">+R${fmt(defensasProfits)}</p>
                          <p className="text-xs text-muted-foreground">Lucro defesas</p>
                        </div>
                        {/* Cash + */}
                        <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                          <TrendingUp className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                          <p className="text-sm font-bold text-emerald-400">+R${fmt(cashPlus)}</p>
                          <p className="text-xs text-muted-foreground">Cash +</p>
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
                      R${allDeposits.filter(d=>d.status==="confirmed").reduce((s,d)=>s+d.amount,0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </p>
                    <p className="text-xs text-muted-foreground">Total de depósitos confirmados</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="w-5 h-5 mx-auto mb-1 text-yellow-400" />
                    <p className="text-xl font-bold text-yellow-400">
                      R${bets.filter(b=>b.status==="pending").reduce((s,b)=>s+Math.max(0,b.potentialWin-(b.bonusUsed??0)),0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
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

            </div>
          </TabsContent>

          {/* ── PAGAMENTOS ─────────────────────────────────────── */}
          <TabsContent value="pagamentos">
            <UserWithdrawalsSection />
          </TabsContent>

          <TabsContent value="saques">
            <div className="space-y-4">
              {/* Formulário de novo saque */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <MinusCircle className="w-5 h-5 text-red-400" />
                    Registrar Saque (Caixa)
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
                          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Saques - Verano Sports</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#111}h1{color:#c53030;border-bottom:2px solid #c53030;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#c53030;color:white;padding:10px;text-align:left}td{padding:8px 10px;border-bottom:1px solid #eee}tr:nth-child(even){background:#f9f9f9}.total{font-size:1.2em;font-weight:bold;margin-top:20px;text-align:right;color:#c53030}.footer{margin-top:40px;font-size:0.8em;color:#888;text-align:center}</style></head><body><h1>Relatório de Saques — Verano Sports</h1><p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p><table><thead><tr><th>#</th><th>Data/Hora</th><th>Valor</th><th>Descrição</th></tr></thead><tbody>${withdrawals.map((w, i) => `<tr><td>${i + 1}</td><td>${new Date(w.createdAt).toLocaleString('pt-BR')}</td><td>R$${w.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>${w.description || '—'}</td></tr>`).join('')}</tbody></table><p class="total">Total: R$${totalSacado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p class="footer">Verano Sports — Documento gerado automaticamente</p></body></html>`;
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

              const entrada      = periodBets.reduce((s,b)=>s+b.stake,0);
              const saida        = periodBets.filter(b=>b.status==="won").reduce((s,b)=>s+Math.max(0,b.potentialWin-(b.bonusUsed??0)),0);
              const totalSaques  = withdrawals.reduce((s,w)=>s+w.amount,0);
              const lucro        = entrada - saida - totalSaques;
              const pendente  = periodBets.filter(b=>b.status==="pending").reduce((s,b)=>s+Math.max(0,b.potentialWin-(b.bonusUsed??0)),0);
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
                  {/* Header: período + filtro de data + botão PDF */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {(["today","week","month","all"] as const).map(p => (
                        <Button
                          key={p}
                          size="sm"
                          variant={(finPeriod===p && !finDateFrom && !finDateTo)?"default":"outline"}
                          onClick={() => { setFinPeriod(p); setFinDateFrom(""); setFinDateTo(""); }}
                          className="text-xs"
                          data-testid={`button-fin-period-${p}`}
                        >
                          {{ today:"Hoje", week:"Esta Semana", month:"Este Mês", all:"Todos" }[p]}
                        </Button>
                      ))}
                      <div className="flex items-center gap-1.5 ml-1">
                        <input
                          type="date"
                          value={finDateFrom}
                          onChange={e => { setFinDateFrom(e.target.value); }}
                          data-testid="input-fin-date-from"
                          className="py-1.5 px-2 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <span className="text-xs text-muted-foreground">até</span>
                        <input
                          type="date"
                          value={finDateTo}
                          onChange={e => { setFinDateTo(e.target.value); }}
                          data-testid="input-fin-date-to"
                          className="py-1.5 px-2 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        {(finDateFrom || finDateTo) && (
                          <button
                            onClick={() => { setFinDateFrom(""); setFinDateTo(""); }}
                            data-testid="button-fin-clear-dates"
                            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors"
                          >
                            Limpar
                          </button>
                        )}
                      </div>
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
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle>Bilhetes ({filteredBets.length})</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-md overflow-hidden border border-border text-xs">
                    {(["today","week","month","all"] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => { setPeriodFilter(p); setDateFrom(""); setDateTo(""); setBetPage(1); }}
                        data-testid={`btn-period-${p}`}
                        className={`px-3 py-1.5 transition-colors ${periodFilter === p ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                      >
                        {{ today:"Hoje", week:"Semana", month:"Mês", all:"Todos" }[p]}
                      </button>
                    ))}
                  </div>
                  <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setBetPage(1); }}>
                    <SelectTrigger className="w-36" data-testid="select-status-filter">
                      <SelectValue placeholder="Filtrar status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos status</SelectItem>
                      <SelectItem value="pending">Pendentes</SelectItem>
                      <SelectItem value="won">Ganhos</SelectItem>
                      <SelectItem value="lost">Perdidos</SelectItem>
                      <SelectItem value="cashed_out">Cash Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar bilhete..."
                    value={betSearch}
                    onChange={e => { setBetSearch(e.target.value); setBetPage(1); }}
                    data-testid="input-bet-search"
                    className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-40"
                  />
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Usuário (nome ou CPF)..."
                    value={userFilter}
                    onChange={e => { setUserFilter(e.target.value); setBetPage(1); }}
                    data-testid="input-user-filter"
                    className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-48"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); setPeriodFilter("all"); setBetPage(1); }}
                    data-testid="input-date-from"
                    className="py-1.5 px-2 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => { setDateTo(e.target.value); setPeriodFilter("all"); setBetPage(1); }}
                    data-testid="input-date-to"
                    className="py-1.5 px-2 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {(dateFrom || dateTo || userFilter) && (
                    <button
                      onClick={() => { setDateFrom(""); setDateTo(""); setUserFilter(""); setBetPage(1); }}
                      data-testid="btn-clear-filters"
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors"
                    >
                      Limpar
                    </button>
                  )}
                </div>
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
                  {paginatedBets.map((bet) => (
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
                              {getStatusBadge(bet.status)}
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(new Date(bet.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </span>
                              {bet.userId === "ADM_FW" ? (
                                <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded-full font-semibold border border-purple-500/40">
                                  <Shield className="w-2.5 h-2.5 inline mr-0.5" />
                                  DEFESA
                                </span>
                              ) : bet.userId && (() => {
                                const betUser = allUsers.find(u => u.cpf === bet.userId);
                                return betUser ? (
                                  <span className="text-xs bg-zinc-700/60 text-zinc-300 px-2 py-0.5 rounded-full font-medium">
                                    👤 {betUser.name}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{bet.userId}</span>
                                );
                              })()}
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
                                    const gameOdds = fmtOdds(computeTotalOdds(sels, checkIsComboBonus(bet.selections)));
                                    const isCopaGrupo = sels.some(s => s.marketKey === "copa_grupo");
                                    const copaBadge = isCopaGrupo ? copaCardBadgeMap.get(gameId) : undefined;
                                    const gameLabel = copaBadge
                                      ? `${copaBadge} — ${first.homeTeam}`
                                      : first.homeTeam + (first.awayTeam ? ` vs ${first.awayTeam}` : "");
                                    return (
                                      <div key={gameId} className="rounded-lg bg-card border border-border overflow-hidden shadow-sm">
                                        {/* Cabeçalho do jogo */}
                                        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-semibold text-foreground text-xs truncate">
                                              {gameLabel}
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
                                              className="absolute left-[5px] top-[6px] w-[2px] bg-border"
                                              style={{ height: sels.length > 1 ? `calc(100% - 12px)` : "0px" }}
                                            />
                                            {sels.map((sel, idx) => (
                                              <div key={sel.id} className={`flex items-start justify-between gap-2 ${idx > 0 ? "mt-3" : ""}`}>
                                                {/* Mercado + outcome */}
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center relative">
                                                    <div className="absolute -left-5 z-10 flex items-center justify-center w-4 h-4 -translate-x-0.5">
                                                      {sel.result === "won"
                                                        ? <Check className="w-3.5 h-3.5 text-green-400" />
                                                        : sel.result === "lost"
                                                        ? <XCircle className="w-3 h-3 text-red-400" />
                                                        : <Timer className="w-3 h-3 text-yellow-400/50" />}
                                                    </div>
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
                                                    className={`h-6 w-6 ${sel.result === "won" ? "bg-green-600 hover:bg-green-700" : "hover:bg-green-600/20"}`}
                                                    onClick={() => updateSelectionMutation.mutate({ 
                                                      betId: bet.id, 
                                                      selectionId: sel.id, 
                                                      result: sel.result === "won" ? "pending" : "won" 
                                                    })}
                                                    data-testid={`button-sel-won-${sel.id}`}
                                                  >
                                                    <Check className={`w-3.5 h-3.5 ${sel.result === "won" ? "text-white" : "text-green-500"}`} />
                                                  </Button>
                                                  <Button
                                                    size="icon"
                                                    variant={sel.result === "lost" ? "default" : "ghost"}
                                                    className={`h-6 w-6 ${sel.result === "lost" ? "bg-red-600 hover:bg-red-700" : "hover:bg-red-600/20"}`}
                                                    onClick={() => updateSelectionMutation.mutate({ 
                                                      betId: bet.id, 
                                                      selectionId: sel.id, 
                                                      result: sel.result === "lost" ? "pending" : "lost" 
                                                    })}
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
                              {(() => {
                                const { displayPotentialWin, baseReturn, bonusReturn, baseOdds, bonusLabel } = computeBetPayout(bet, comboBonusTable);
                                const bonusUsed = bet.bonusUsed ?? 0;
                                const netReturn = Math.max(0, displayPotentialWin - bonusUsed);
                                return (
                                  <>
                                    <span className="flex items-center gap-1 whitespace-nowrap flex-wrap">
                                      <TrendingUp className="w-4 h-4 text-primary" />
                                      Retorno:&nbsp;
                                      {bet.status === "cashed_out" && (bet as any).cashOutValue != null ? (
                                        <>
                                          <span className="font-bold text-emerald-400">R$&nbsp;{fmtBRL((bet as any).cashOutValue)}</span>
                                          <span className="text-zinc-500 text-xs line-through">R$&nbsp;{fmtBRL(bonusUsed > 0 ? netReturn : displayPotentialWin)}</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="font-bold text-primary">R$&nbsp;{fmtBRL(bonusUsed > 0 ? netReturn : displayPotentialWin)}</span>
                                          {bonusUsed > 0 && (
                                            <span className="text-zinc-400 text-xs">(R$&nbsp;{fmtBRL(displayPotentialWin)}&nbsp;−&nbsp;R$&nbsp;{fmtBRL(bonusUsed)}&nbsp;bônus)</span>
                                          )}
                                          {bonusUsed === 0 && baseReturn !== null && bonusReturn !== null && (
                                            <span className="text-green-400 text-xs">(R$&nbsp;{fmtBRL(baseReturn)}&nbsp;+&nbsp;R$&nbsp;{fmtBRL(bonusReturn)}&nbsp;{bonusLabel})</span>
                                          )}
                                        </>
                                      )}
                                    </span>
                                    <span className="text-muted-foreground whitespace-nowrap">
                                      Odd:&nbsp;{fmtOdds(baseOdds)}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1 w-full sm:w-auto">
                            <Select
                              value={bet.status}
                              onValueChange={(value: BetStatus) => 
                                updateStatusMutation.mutate({ id: bet.id, status: value })
                              }
                              disabled={bet.status === "cashed_out"}
                            >
                              <SelectTrigger className="w-32" data-testid={`select-status-${bet.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cashed_out">
                                  <span className="flex items-center gap-2">
                                    <span className="w-3 h-3 text-emerald-400">💸</span> Cashout
                                  </span>
                                </SelectItem>
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
                                <SelectItem value="anulado">
                                  <span className="flex items-center gap-2">
                                    <XCircle className="w-3 h-3 text-gray-400" /> Anular
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

                            {bet.userId !== "ADM_FW" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                                onClick={() => setDefendDialog({ bet, stake: String(bet.stake) })}
                                data-testid={`button-defend-${bet.id}`}
                                title="Criar defesa automática usando o caixa de defesas"
                              >
                                <Shield className="w-4 h-4 mr-1" />
                                Defender
                              </Button>
                            )}

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
                {betTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      Página {betPage} de {betTotalPages} — {filteredBets.length} bilhetes
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setBetPage(1)}
                        disabled={betPage === 1}
                        data-testid="btn-page-first"
                      >
                        <ChevronLeft className="w-3 h-3" />
                        <ChevronLeft className="w-3 h-3 -ml-2" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setBetPage(p => Math.max(1, p - 1))}
                        disabled={betPage === 1}
                        data-testid="btn-page-prev"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </Button>
                      {Array.from({ length: betTotalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === betTotalPages || Math.abs(p - betPage) <= 1)
                        .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) => p === "..." ? (
                          <span key={`ellipsis-${i}`} className="text-xs text-muted-foreground px-1">…</span>
                        ) : (
                          <Button
                            key={p}
                            variant={betPage === p ? "default" : "outline"}
                            size="icon"
                            className="h-7 w-7 text-xs"
                            onClick={() => setBetPage(p as number)}
                            data-testid={`btn-page-${p}`}
                          >
                            {p}
                          </Button>
                        ))
                      }
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setBetPage(p => Math.min(betTotalPages, p + 1))}
                        disabled={betPage === betTotalPages}
                        data-testid="btn-page-next"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setBetPage(betTotalPages)}
                        disabled={betPage === betTotalPages}
                        data-testid="btn-page-last"
                      >
                        <ChevronRight className="w-3 h-3" />
                        <ChevronRight className="w-3 h-3 -ml-2" />
                      </Button>
                    </div>
                  </div>
                )}
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

            {/* Combo bonus percentage card */}
            <Card className="mt-6">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-purple-400" />
                    Bônus Combinada — Percentuais por Seleções
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => saveComboBonusMutation.mutate(comboBonusEdits)}
                    disabled={saveComboBonusMutation.isPending}
                    data-testid="button-save-combo-bonus"
                  >
                    {saveComboBonusMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    Salvar Percentuais
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Defina o bônus (%) aplicado ao retorno quando o usuário combina seleções elegíveis (Resultado Final / Ambos Marcam) de jogos diferentes.
                </p>
              </CardHeader>
              <CardContent>
                {comboBonusLoading ? (
                  <div className="space-y-3">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Array.from({ length: 11 }, (_, idx) => idx + 2).map((count) => {
                      const label = count === 12 ? "12+ seleções" : `${count} seleções`;
                      const current = comboBonusEdits[count] ?? 0;
                      const isModified = current !== (DEFAULT_COMBO_BONUS_PCT[count] ?? 0);
                      return (
                        <div
                          key={count}
                          className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                            isModified ? "border-purple-500/50 bg-purple-500/5" : "border-border bg-muted/30"
                          }`}
                          data-testid={`combo-bonus-row-${count}`}
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{label}</p>
                            <p className="text-xs text-purple-400">{current}% de bônus</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-7 h-7 p-0"
                              onClick={() => setComboBonusEdits(prev => ({ ...prev, [count]: Math.max(0, (prev[count] ?? 0) - 1) }))}
                              data-testid={`button-decrease-combo-${count}`}
                            >
                              −
                            </Button>
                            <div className="relative w-16">
                              <Input
                                type="number"
                                min={0}
                                max={999}
                                value={current}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val >= 0) {
                                    setComboBonusEdits(prev => ({ ...prev, [count]: val }));
                                  }
                                }}
                                className="text-center pr-5 h-7 text-sm"
                                data-testid={`input-combo-bonus-${count}`}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-7 h-7 p-0"
                              onClick={() => setComboBonusEdits(prev => ({ ...prev, [count]: (prev[count] ?? 0) + 1 }))}
                              data-testid={`button-increase-combo-${count}`}
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

          <TabsContent value="copa-mundo">
            <CopaWorldCupTab />
          </TabsContent>

          <TabsContent value="boost">
            <BoostTab />
          </TabsContent>

          <TabsContent value="depositos">
            <DepositsTab />
          </TabsContent>

          <TabsContent value="usuarios">
            <UsersTab />
          </TabsContent>

          <TabsContent value="indicacoes">
            <ReferralsTab />
          </TabsContent>
          <TabsContent value="defesas">
            <DefesasTab onRefresh={refetchDefesas} />
          </TabsContent>
          <TabsContent value="recompensas">
            <RecompensasTab />
          </TabsContent>

          <TabsContent value="configuracoes">
            <SettingsTab />
          </TabsContent>

          <TabsContent value="ao-vivo">
            <AdminLiveGameTab />
          </TabsContent>

          <TabsContent value="bolao">
            <BolaoTab />
          </TabsContent>

        </Tabs>
      </div>

      {/* Dialog: Criar Defesa a partir de bilhete */}
      <Dialog open={!!defendDialog} onOpenChange={(open) => { if (!open) setDefendDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              Criar Defesa
            </DialogTitle>
            <DialogDescription>
              {defendDialog && (
                <span>
                  Bilhete <span className="font-mono text-foreground">#{defendDialog.bet.id.slice(0, 8).toUpperCase()}</span>
                  {" — "}odds {fmtOdds(defendDialog.bet.totalOdds)}x
                  {" — "}retorno potencial {R$(defendDialog.bet.potentialWin)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {defendDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 text-sm space-y-1">
                {defendDialog.bet.selections.map((sel: any) => (
                  <div key={sel.id} className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground truncate">
                      {sel.homeTeam} x {sel.awayTeam} — {sel.outcomeName}
                    </span>
                    <span className="font-semibold text-purple-300 shrink-0">{fmtOdds(sel.odds)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Valor da defesa (R$)</label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={defendDialog.stake}
                  onChange={(e) => setDefendDialog({ ...defendDialog, stake: e.target.value })}
                  placeholder="Ex: 100"
                  data-testid="input-defend-stake"
                />
                {(() => {
                  const stakeNum = parseFloat(defendDialog.stake);
                  if (!isNaN(stakeNum) && stakeNum > 0) {
                    const pot = stakeNum * defendDialog.bet.totalOdds;
                    return (
                      <p className="text-xs text-muted-foreground">
                        Retorno potencial: <span className="text-green-400 font-medium">{R$(pot)}</span>
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDefendDialog(null)}>Cancelar</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={
                defendBetMutation.isPending ||
                !defendDialog ||
                isNaN(parseFloat(defendDialog.stake)) ||
                parseFloat(defendDialog.stake) <= 0
              }
              onClick={() => {
                if (!defendDialog) return;
                const stake = parseFloat(defendDialog.stake);
                if (isNaN(stake) || stake <= 0) return;
                defendBetMutation.mutate({ betId: defendDialog.bet.id, stake });
              }}
              data-testid="button-defend-confirm"
            >
              {defendBetMutation.isPending ? "Criando..." : "Confirmar Defesa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function BoostTab() {
  const { toast } = useToast();
  const [editingCard, setEditingCard] = useState<BoostCard | null>(null);
  const [showForm, setShowForm] = useState(false);

  const emptyForm = {
    eventName: "",
    matchTitle: "",
    description: "",
    selections: [] as { description: string }[],
    originalOdds: "",
    boostedOdds: "",
    outcomes: [] as { label: string; originalOdds: string; boostedOdds: string }[],
    outcomeMode: false,
    subtitle: "",
    startsAt: "",
    endsAt: "",
    active: true,
  };
  const [form, setForm] = useState(emptyForm);

  const { data: cards = [], isLoading } = useQuery<BoostCard[]>({
    queryKey: ["/api/admin/boost-cards"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/admin/boost-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Erro"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/boost-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boost-cards"] });
      toast({ title: "Super Boost criado!" });
      setShowForm(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/admin/boost-cards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Erro"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/boost-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boost-cards"] });
      toast({ title: "Super Boost atualizado!" });
      setShowForm(false);
      setEditingCard(null);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/boost-cards/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao deletar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/boost-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boost-cards"] });
      toast({ title: "Super Boost removido!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, result, outcomeIdx }: { id: number; result: "pending" | "won" | "lost"; outcomeIdx?: number }) => {
      const res = await fetch(`/api/admin/boost-cards/${id}/result`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, ...(outcomeIdx !== undefined ? { outcomeIdx } : {}) }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Erro"); }
      return res.json() as Promise<{ card: BoostCard; affectedBets: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/boost-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/boost-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bets"] });
      toast({
        title: "Resultado salvo",
        description: data.affectedBets > 0
          ? `${data.affectedBets} bilhete(s) atualizado(s) automaticamente.`
          : "Nenhum bilhete pendente afetado.",
      });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toLocalDatetime = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openEdit = (card: BoostCard) => {
    setEditingCard(card);
    const hasOutcomes = card.outcomes && card.outcomes.length > 0;
    setForm({
      eventName: card.eventName,
      matchTitle: card.matchTitle,
      description: card.description,
      selections: card.selections.map(s => ({ description: s.description })),
      originalOdds: String(card.originalOdds),
      boostedOdds: String(card.boostedOdds),
      outcomes: hasOutcomes
        ? card.outcomes.map(o => ({ label: o.label, originalOdds: String(o.originalOdds), boostedOdds: String(o.boostedOdds) }))
        : [],
      outcomeMode: hasOutcomes,
      subtitle: card.subtitle ?? "",
      startsAt: toLocalDatetime(card.startsAt),
      endsAt: toLocalDatetime(card.endsAt),
      active: card.active,
    });
    setShowForm(true);
  };

  const openNew = () => {
    setEditingCard(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (form.outcomeMode) {
      const validOutcomes = form.outcomes.filter(o => o.label.trim() && parseFloat(o.originalOdds) >= 1 && parseFloat(o.boostedOdds) >= 1);
      if (validOutcomes.length < 2) {
        toast({ title: "Adicione pelo menos 2 opções válidas no modo múltiplas opções", variant: "destructive" });
        return;
      }
      const payload = {
        eventName: form.eventName,
        matchTitle: form.matchTitle,
        description: form.description,
        selections: form.selections.filter(s => s.description.trim()),
        originalOdds: 1,
        boostedOdds: 1,
        outcomes: validOutcomes.map(o => ({ label: o.label, originalOdds: parseFloat(o.originalOdds), boostedOdds: parseFloat(o.boostedOdds) })),
        subtitle: form.subtitle,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        active: form.active,
      };
      if (!payload.eventName || !payload.matchTitle || !form.startsAt || !form.endsAt) {
        toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
        return;
      }
      editingCard ? updateMutation.mutate({ id: editingCard.id, data: payload }) : createMutation.mutate(payload);
    } else {
      const payload = {
        eventName: form.eventName,
        matchTitle: form.matchTitle,
        description: form.description,
        selections: form.selections.filter(s => s.description.trim()),
        originalOdds: parseFloat(form.originalOdds),
        boostedOdds: parseFloat(form.boostedOdds),
        outcomes: [],
        subtitle: form.subtitle,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        active: form.active,
      };
      if (!payload.eventName || !payload.matchTitle || isNaN(payload.originalOdds) || isNaN(payload.boostedOdds) || !form.startsAt || !form.endsAt) {
        toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
        return;
      }
      editingCard ? updateMutation.mutate({ id: editingCard.id, data: payload }) : createMutation.mutate(payload);
    }
  };

  const addSelection = () => {
    if (form.selections.length >= 3) return;
    setForm(f => ({ ...f, selections: [...f.selections, { description: "" }] }));
  };

  const updateSelection = (idx: number, val: string) => {
    setForm(f => {
      const sels = [...f.selections];
      sels[idx] = { description: val };
      return { ...f, selections: sels };
    });
  };

  const removeSelection = (idx: number) => {
    setForm(f => ({ ...f, selections: f.selections.filter((_, i) => i !== idx) }));
  };

  const fmt = (iso: string) => {
    if (!iso) return "-";
    const d = new Date(iso);
    const isToday = d.toDateString() === new Date().toDateString();
    return isToday
      ? `Hoje ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
      : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              Super Boost Cards
            </CardTitle>
            <Button onClick={openNew} size="sm" className="gap-1">
              <Plus className="w-4 h-4" /> Novo Boost
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Cards destacados exibidos antes dos jogos do dia. O horário controla quando aparecem no site automaticamente.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}</div>
          ) : cards.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhum Super Boost criado. Clique em "Novo Boost" para começar.
            </div>
          ) : (
            <div className="space-y-3">
              {cards.map(card => {
                const now = new Date();
                const isLive = card.active && new Date(card.startsAt) <= now && new Date(card.endsAt) >= now;
                const isPast = new Date(card.endsAt) < now;
                const cardResult = card.result ?? "pending";
                const isResolving = resolveMutation.isPending;
                return (
                  <div key={card.id} className={`border rounded-xl p-4 space-y-3 ${cardResult === "won" ? "border-green-500/40 bg-green-500/5" : cardResult === "lost" ? "border-red-500/40 bg-red-500/5" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm">{card.matchTitle}</span>
                          {isLive && <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">● Visível</Badge>}
                          {isPast && !isLive && <Badge variant="outline" className="text-xs text-muted-foreground">Encerrado</Badge>}
                          {!card.active && <Badge variant="outline" className="text-xs text-muted-foreground">Inativo</Badge>}
                          {cardResult === "won" && <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">✓ Ganhou</Badge>}
                          {cardResult === "lost" && <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">✗ Perdeu</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{card.eventName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmt(card.startsAt)} → {fmt(card.endsAt)}
                        </p>
                        {card.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
                        )}
                        {card.subtitle && (
                          <p className="text-xs font-medium italic mt-0.5" style={{ color: "#eee" }}>{card.subtitle}</p>
                        )}
                        {card.outcomes && card.outcomes.length > 0 ? (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {card.outcomes.map((o, oi) => (
                              <span key={oi} className="text-xs flex items-center gap-1 px-2 py-0.5 rounded-full border border-yellow-400/30 bg-yellow-400/10">
                                <span className="text-muted-foreground">{o.label}:</span>
                                <span className="line-through text-muted-foreground">{fmtOdds(o.originalOdds)}</span>
                                <Zap className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
                                <span className="font-bold text-yellow-400">{fmtOdds(o.boostedOdds)}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs line-through text-muted-foreground">{fmtOdds(card.originalOdds)}</span>
                            <Zap className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            <span className="text-sm font-bold text-yellow-400">{fmtOdds(card.boostedOdds)}</span>
                          </div>
                        )}
                        {card.selections.length > 0 && (
                          <div className="relative pl-4 mt-2">
                            {card.selections.length > 1 && (
                              <div
                                className="absolute left-[4px] top-[5px] w-[2px] rounded-full"
                                style={{
                                  background: "linear-gradient(180deg, #f5c518 0%, #e8a800 100%)",
                                  height: "calc(100% - 10px)",
                                }}
                              />
                            )}
                            {card.selections.map((s, i) => (
                              <div key={i} className={`relative${i > 0 ? " mt-2" : ""}`}>
                                <div
                                  className="absolute -left-4 top-[3px] w-[9px] h-[9px] rounded-full z-10"
                                  style={{
                                    background: "linear-gradient(135deg, #f5c518 0%, #e8a800 100%)",
                                    boxShadow: "0 0 4px #f5c51860",
                                  }}
                                />
                                <p className="text-xs text-muted-foreground leading-snug">{s.description}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(card)} title="Editar">
                          <Save className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => deleteMutation.mutate(card.id)} title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Manual result control */}
                    <div className="border-t pt-2.5">
                      <p className="text-[11px] text-muted-foreground mb-2 font-medium">RESULTADO DO BOOST</p>

                      {card.outcomes && card.outcomes.length > 0 ? (
                        /* Multi-outcome: one row of buttons per outcome */
                        <div className="space-y-2">
                          {card.outcomes.map((o, oi) => {
                            const ores = (card.outcomeResults ?? [])[oi] ?? "pending";
                            return (
                              <div key={oi} className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-yellow-400 min-w-[60px]">{o.label}:</span>
                                <Button
                                  size="sm"
                                  variant={ores === "won" ? "default" : "outline"}
                                  className={`h-7 text-xs gap-1 ${ores === "won" ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : "border-green-600/40 text-green-400 hover:bg-green-500/10 hover:border-green-500"}`}
                                  disabled={isResolving}
                                  onClick={() => resolveMutation.mutate({ id: card.id, result: "won", outcomeIdx: oi })}
                                >
                                  ✓ Ganhou
                                </Button>
                                <Button
                                  size="sm"
                                  variant={ores === "lost" ? "default" : "outline"}
                                  className={`h-7 text-xs gap-1 ${ores === "lost" ? "bg-red-600 hover:bg-red-700 text-white border-red-600" : "border-red-600/40 text-red-400 hover:bg-red-500/10 hover:border-red-500"}`}
                                  disabled={isResolving}
                                  onClick={() => resolveMutation.mutate({ id: card.id, result: "lost", outcomeIdx: oi })}
                                >
                                  ✗ Perdeu
                                </Button>
                                {ores !== "pending" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                    disabled={isResolving}
                                    onClick={() => resolveMutation.mutate({ id: card.id, result: "pending", outcomeIdx: oi })}
                                  >
                                    ↺ Pendente
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* Simple card: single set of buttons */
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant={cardResult === "won" ? "default" : "outline"}
                            className={`h-7 text-xs gap-1 ${cardResult === "won" ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : "border-green-600/40 text-green-400 hover:bg-green-500/10 hover:border-green-500"}`}
                            disabled={isResolving}
                            onClick={() => resolveMutation.mutate({ id: card.id, result: "won" })}
                          >
                            ✓ Ganhou
                          </Button>
                          <Button
                            size="sm"
                            variant={cardResult === "lost" ? "default" : "outline"}
                            className={`h-7 text-xs gap-1 ${cardResult === "lost" ? "bg-red-600 hover:bg-red-700 text-white border-red-600" : "border-red-600/40 text-red-400 hover:bg-red-500/10 hover:border-red-500"}`}
                            disabled={isResolving}
                            onClick={() => resolveMutation.mutate({ id: card.id, result: "lost" })}
                          >
                            ✗ Perdeu
                          </Button>
                          {cardResult !== "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground hover:text-foreground"
                              disabled={isResolving}
                              onClick={() => resolveMutation.mutate({ id: card.id, result: "pending" })}
                            >
                              ↺ Pendente
                            </Button>
                          )}
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

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editingCard ? "✏️ Editar Super Boost" : "✨ Novo Super Boost"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Evento / Liga *</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Ex: Copa Libertadores - Gr.F"
                  value={form.eventName}
                  onChange={e => setForm(f => ({ ...f, eventName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Confronto *</label>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Ex: Palmeiras — Sporting Cristal"
                  value={form.matchTitle}
                  onChange={e => setForm(f => ({ ...f, matchTitle: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Dia e horário do evento (opcional)</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                placeholder="Ex: Hoje, 21:00  ou  17/04 • 16:00"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Descrição do mercado (opcional)</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                placeholder="Ex: Ambos marcam no jogo do mengão?"
                value={form.subtitle}
                onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Mercados / Seleções (até 3, opcional)</label>
                {form.selections.length < 3 && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addSelection}>
                    <Plus className="w-3 h-3" /> Adicionar linha
                  </Button>
                )}
              </div>
              {form.selections.map((sel, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Ex: Lopez, Flaco - Mais de 1.5 chutes no gol"
                    value={sel.description}
                    onChange={e => updateSelection(idx, e.target.value)}
                  />
                  <Button size="icon" variant="ghost" className="h-9 w-9 text-red-400 hover:text-red-300 flex-shrink-0" onClick={() => removeSelection(idx)}>
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {form.selections.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhuma seleção adicionada. O card mostrará apenas as odds.</p>
              )}
            </div>

            {/* Odds mode toggle */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, outcomeMode: false, outcomes: [] }))}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${!form.outcomeMode ? "bg-yellow-400/20 text-yellow-400 border border-yellow-400/50" : "text-muted-foreground border border-transparent hover:border-border"}`}
                  >
                    ⚡ Odd simples
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, outcomeMode: true, outcomes: f.outcomes.length >= 2 ? f.outcomes : [{ label: "Sim", originalOdds: "", boostedOdds: "" }, { label: "Não", originalOdds: "", boostedOdds: "" }] }))}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${form.outcomeMode ? "bg-yellow-400/20 text-yellow-400 border border-yellow-400/50" : "text-muted-foreground border border-transparent hover:border-border"}`}
                  >
                    ⚡ Múltiplas opções
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {form.outcomeMode ? "Ex: Ambos marcam: Sim / Não" : "Ex: Over 2.5 — uma única seleção"}
                </p>
              </div>

              {!form.outcomeMode && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Odd original (riscada) *</label>
                    <input
                      type="number" step="0.01" min="1"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                      placeholder="2.75"
                      value={form.originalOdds}
                      onChange={e => setForm(f => ({ ...f, originalOdds: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Odd boostada ⚡ *</label>
                    <input
                      type="number" step="0.01" min="1"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                      placeholder="3.55"
                      value={form.boostedOdds}
                      onChange={e => setForm(f => ({ ...f, boostedOdds: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {form.outcomeMode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Opções de escolha (mín. 2) *</label>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setForm(f => ({ ...f, outcomes: [...f.outcomes, { label: "", originalOdds: "", boostedOdds: "" }] }))}>
                      <Plus className="w-3 h-3" /> Opção
                    </Button>
                  </div>
                  {form.outcomes.map((o, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        className="flex-1 min-w-0 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                        placeholder={idx === 0 ? "Sim" : idx === 1 ? "Não" : `Opção ${idx + 1}`}
                        value={o.label}
                        onChange={e => {
                          const outcomes = [...form.outcomes];
                          outcomes[idx] = { ...outcomes[idx], label: e.target.value };
                          setForm(f => ({ ...f, outcomes }));
                        }}
                      />
                      <input
                        type="number" step="0.01" min="1"
                        className="w-20 rounded-md border bg-background px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                        placeholder="orig."
                        title="Odd original"
                        value={o.originalOdds}
                        onChange={e => {
                          const outcomes = [...form.outcomes];
                          outcomes[idx] = { ...outcomes[idx], originalOdds: e.target.value };
                          setForm(f => ({ ...f, outcomes }));
                        }}
                      />
                      <input
                        type="number" step="0.01" min="1"
                        className="w-20 rounded-md border bg-background px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-primary text-yellow-400 font-semibold"
                        placeholder="⚡boost"
                        title="Odd boostada"
                        value={o.boostedOdds}
                        onChange={e => {
                          const outcomes = [...form.outcomes];
                          outcomes[idx] = { ...outcomes[idx], boostedOdds: e.target.value };
                          setForm(f => ({ ...f, outcomes }));
                        }}
                      />
                      {form.outcomes.length > 2 && (
                        <Button size="icon" variant="ghost" className="h-9 w-9 text-red-400 hover:text-red-300 flex-shrink-0" onClick={() => setForm(f => ({ ...f, outcomes: f.outcomes.filter((_, i) => i !== idx) }))}>
                          <XCircle className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">Campo "orig." = odd original (riscada) · "⚡boost" = odd boostada</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Início do evento *</label>
                <input
                  type="datetime-local"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  value={form.startsAt}
                  onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Fim do evento *</label>
                <input
                  type="datetime-local"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  value={form.endsAt}
                  onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="boost-active"
                checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                className="w-4 h-4"
              />
              <label htmlFor="boost-active" className="text-sm cursor-pointer">Ativo (visível no site dentro do horário configurado)</label>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="gap-1">
                <Save className="w-4 h-4" />
                {editingCard ? "Salvar alterações" : "Criar Super Boost"}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingCard(null); setForm(emptyForm); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UserWithdrawalsSection() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: userWithdrawals = [], refetch } = useQuery<UserWithdrawal[]>({
    queryKey: ["/api/admin/user-withdrawals"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/user-withdrawals");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/admin/user-withdrawals/${id}/approve`);
      return res.json();
    },
    onSuccess: (_data, id) => {
      toast({ title: "Saque aprovado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/user-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      const w = userWithdrawals.find(x => x.id === id);
      if (w?.userPhone) {
        const phone = w.userPhone.replace(/\D/g, "");
        const msg = encodeURIComponent(`Olá! Seu saque de R$ ${w.amount.toFixed(2).replace(".", ",")} foi aprovado. Em breve o valor será enviado para a chave PIX: ${w.pixKey}`);
        window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
      }
    },
    onError: () => toast({ title: "Erro ao aprovar", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/admin/user-withdrawals/${id}/reject`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saque rejeitado. Saldo reembolsado." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/user-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => toast({ title: "Erro ao rejeitar", variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/admin/user-withdrawals/${id}/mark-paid`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saque marcado como pago!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/user-withdrawals"] });
    },
    onError: () => toast({ title: "Erro ao marcar como pago", variant: "destructive" }),
  });

  const pending = userWithdrawals.filter(w => w.status === "pending");
  const statusColor = (s: string) => s === "paid" ? "text-blue-400" : s === "approved" ? "text-green-500" : s === "rejected" ? "text-red-400" : "text-yellow-400";
  const statusLabel = (s: string) => s === "paid" ? "Pago" : s === "approved" ? "Aprovado" : s === "rejected" ? "Rejeitado" : "Pendente";

  const filtered = userWithdrawals.filter(w => {
    const q = search.toLowerCase();
    const qNormalized = q.replace(/\D/g, "");
    const userIdNormalized = String(w.userId).replace(/\D/g, "");
    const matchSearch = !q
      || String(w.userId).toLowerCase().includes(q)
      || (qNormalized.length > 0 && userIdNormalized.includes(qNormalized))
      || w.pixKey.toLowerCase().includes(q)
      || (w.userPhone ?? "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || w.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const countByStatus = (s: string) => userWithdrawals.filter(w => w.status === s).length;

  const statusFilters = [
    { value: "all", label: "Todos", count: userWithdrawals.length },
    { value: "pending", label: "Pendente", count: countByStatus("pending") },
    { value: "approved", label: "Aprovado", count: countByStatus("approved") },
    { value: "paid", label: "Pago", count: countByStatus("paid") },
    { value: "rejected", label: "Rejeitado", count: countByStatus("rejected") },
  ];

  const buildWhatsAppLink = (w: UserWithdrawal) => {
    if (!w.userPhone) return null;
    const phone = w.userPhone.replace(/\D/g, "");
    const msg = encodeURIComponent(`Olá! Seu saque de R$ ${w.amount.toFixed(2).replace(".", ",")} foi aprovado. Em breve o valor será enviado para a chave PIX: ${w.pixKey}`);
    return `https://wa.me/55${phone}?text=${msg}`;
  };

  return (
    <Card className={pending.length > 0 ? "border-yellow-500/40" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="w-5 h-5 text-yellow-400" />
          Solicitações de Saque dos Usuários
          {pending.length > 0 && <Badge className="bg-red-500 text-white border-0 ml-1">{pending.length} pendente{pending.length > 1 ? "s" : ""}</Badge>}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        </CardTitle>
        {userWithdrawals.length > 0 && (
          <div className="space-y-2 pt-1">
            <Input
              placeholder="Buscar por CPF, PIX ou telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-sm"
              data-testid="input-search-withdrawals"
            />
            <div className="flex flex-wrap gap-1.5">
              {statusFilters.map(f => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  data-testid={`button-filter-withdrawal-${f.value}`}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors border ${
                    statusFilter === f.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {f.label} {f.count > 0 && <span className="opacity-70">({f.count})</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {userWithdrawals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma solicitação de saque.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum resultado encontrado.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(w => (
              <div key={w.id} className="flex items-center justify-between gap-3 border rounded-lg p-3 flex-wrap" data-testid={`row-user-withdrawal-${w.id}`}>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">R$ {w.amount.toFixed(2).replace(".", ",")}</p>
                  <p className="text-xs text-muted-foreground">CPF: {w.userId} · PIX: {w.pixKey}</p>
                  {w.userPhone && <p className="text-xs text-muted-foreground">Tel: {w.userPhone}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleString("pt-BR")}</p>
                  {w.paidAt && <p className="text-xs text-blue-400">Pago em: {new Date(w.paidAt).toLocaleString("pt-BR")}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold ${statusColor(w.status)}`}>{statusLabel(w.status)}</span>
                  {w.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => approveMutation.mutate(w.id)} disabled={approveMutation.isPending} data-testid={`button-approve-withdrawal-${w.id}`}>
                        <CheckCircle className="w-4 h-4 mr-1" /> Aprovar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate(w.id)} disabled={rejectMutation.isPending} data-testid={`button-reject-withdrawal-${w.id}`}>
                        <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                      </Button>
                    </>
                  )}
                  {w.status === "approved" && (
                    <>
                      {buildWhatsAppLink(w) && (
                        <a href={buildWhatsAppLink(w)!} target="_blank" rel="noopener noreferrer" data-testid={`link-whatsapp-withdrawal-${w.id}`}>
                          <Button size="sm" variant="outline" className="border-green-500 text-green-400 hover:bg-green-500/10">
                            <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            WhatsApp
                          </Button>
                        </a>
                      )}
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => markPaidMutation.mutate(w.id)} disabled={markPaidMutation.isPending} data-testid={`button-mark-paid-withdrawal-${w.id}`}>
                        <CheckCircle className="w-4 h-4 mr-1" /> Marcar como Pago
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editBalance, setEditBalance] = useState("");
  const [editBalanceReason, setEditBalanceReason] = useState("");
  const [editBonus, setEditBonus] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [bulkBonusAmount, setBulkBonusAmount] = useState("");
  const [bulkBonusMode, setBulkBonusMode] = useState<"all" | "selected">("all");
  const [bulkBonusSelected, setBulkBonusSelected] = useState<Set<string>>(new Set());
  const [bulkBonusOpen, setBulkBonusOpen] = useState(false);

  const { data: allDepositsForUsers = [] } = useQuery<Deposit[]>({
    queryKey: ["/api/admin/deposits"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/deposits");
      return res.json();
    },
  });

  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users");
      return res.json();
    },
  });

  const { data: userBets = [] } = useQuery<BetSlipType[]>({
    queryKey: ["/api/bets", selectedUser?.cpf],
    queryFn: async () => {
      if (!selectedUser) return [];
      const res = await fetch(`/api/bets?userId=${encodeURIComponent(selectedUser.cpf)}`);
      return res.json();
    },
    enabled: !!selectedUser,
  });

  const updateBalanceMutation = useMutation({
    mutationFn: async ({ cpf, balance, reason }: { cpf: string; balance: number; reason?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${encodeURIComponent(cpf)}`, { balance, reason });
      return res.json();
    },
    onSuccess: (updated: User) => {
      toast({ title: "Saldo atualizado!" });
      setSelectedUser(updated);
      setEditBalanceReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      refetchUsers();
    },
    onError: () => toast({ title: "Erro ao atualizar saldo", variant: "destructive" }),
  });

  const updateBonusMutation = useMutation({
    mutationFn: async ({ cpf, bonusBalance }: { cpf: string; bonusBalance: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${encodeURIComponent(cpf)}`, { bonusBalance });
      return res.json();
    },
    onSuccess: (updated: User) => {
      toast({ title: "Bônus atualizado!" });
      setSelectedUser(updated);
      setEditBonus(updated.bonusBalance.toFixed(2));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      refetchUsers();
    },
    onError: () => toast({ title: "Erro ao atualizar bônus", variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ cpf, password }: { cpf: string; password: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${encodeURIComponent(cpf)}/reset-password`, { newPassword: password });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Senha resetada com sucesso!" });
      setNewPassword("");
    },
    onError: () => toast({ title: "Erro ao resetar senha", variant: "destructive" }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (cpf: string) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${encodeURIComponent(cpf)}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Usuário deletado!" });
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => toast({ title: "Erro ao deletar usuário", variant: "destructive" }),
  });

  const bulkBonusMutation = useMutation({
    mutationFn: async ({ cpfs, amount }: { cpfs: string[] | "all"; amount: number }) => {
      const res = await apiRequest("POST", "/api/admin/users/bulk-bonus", { cpfs, amount });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Bônus distribuído para ${data.count} usuário(s)!` });
      setBulkBonusAmount("");
      setBulkBonusSelected(new Set());
      setBulkBonusOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      refetchUsers();
    },
    onError: () => toast({ title: "Erro ao distribuir bônus", variant: "destructive" }),
  });

  const totalUsersBalance = users.reduce((s, u) => s + u.balance, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="text-xs text-muted-foreground">Usuários cadastrados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">R$ {totalUsersBalance.toFixed(2).replace(".", ",")}</p>
              <p className="text-xs text-muted-foreground">Saldo ativo dos usuários</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribuir Bônus em Massa */}
      <Card className="border-yellow-500/30">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="w-4 h-4 text-yellow-400" />
              Distribuir Bônus
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setBulkBonusOpen(v => !v)} data-testid="button-toggle-bulk-bonus">
              {bulkBonusOpen ? "Fechar" : "Abrir"}
            </Button>
          </div>
        </CardHeader>
        {bulkBonusOpen && (
          <CardContent className="space-y-4">
            {/* Modo */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={bulkBonusMode === "all" ? "default" : "outline"}
                onClick={() => { setBulkBonusMode("all"); setBulkBonusSelected(new Set()); }}
                data-testid="button-bulk-mode-all"
              >
                Todos os usuários
              </Button>
              <Button
                size="sm"
                variant={bulkBonusMode === "selected" ? "default" : "outline"}
                onClick={() => setBulkBonusMode("selected")}
                data-testid="button-bulk-mode-selected"
              >
                Selecionar usuários
              </Button>
            </div>

            {/* Lista de seleção */}
            {bulkBonusMode === "selected" && (
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {users.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">Nenhum usuário cadastrado.</p>
                ) : (
                  <div>
                    <label className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkBonusSelected.size === users.length && users.length > 0}
                        onChange={e => setBulkBonusSelected(e.target.checked ? new Set(users.map(u => u.cpf)) : new Set())}
                        className="w-4 h-4"
                        data-testid="checkbox-select-all-users"
                      />
                      <span className="text-sm font-semibold">Selecionar todos ({users.length})</span>
                    </label>
                    {users.map(u => (
                      <label key={u.cpf} className="flex items-center gap-2 px-3 py-2 border-b last:border-0 hover:bg-muted/30 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkBonusSelected.has(u.cpf)}
                          onChange={e => {
                            const next = new Set(bulkBonusSelected);
                            e.target.checked ? next.add(u.cpf) : next.delete(u.cpf);
                            setBulkBonusSelected(next);
                          }}
                          className="w-4 h-4"
                          data-testid={`checkbox-user-${u.cpf}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.cpf}</p>
                        </div>
                        {u.bonusBalance > 0 && (
                          <span className="text-xs text-yellow-400">🎁 R$ {u.bonusBalance.toFixed(2).replace(".", ",")}</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Valor e confirmação */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Valor do bônus (R$)
                  {bulkBonusMode === "all"
                    ? ` — será adicionado a todos os ${users.length} usuários`
                    : bulkBonusSelected.size > 0
                      ? ` — ${bulkBonusSelected.size} usuário(s) selecionado(s)`
                      : " — selecione os usuários"}
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Ex: 10,00"
                  value={bulkBonusAmount}
                  onChange={e => setBulkBonusAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                  data-testid="input-bulk-bonus-amount"
                />
              </div>
              <Button
                onClick={() => {
                  const amount = parseFloat(bulkBonusAmount);
                  if (!amount || amount <= 0) return;
                  const cpfs = bulkBonusMode === "all" ? "all" : Array.from(bulkBonusSelected);
                  if (cpfs !== "all" && (cpfs as string[]).length === 0) return;
                  bulkBonusMutation.mutate({ cpfs, amount });
                }}
                disabled={bulkBonusMutation.isPending || !bulkBonusAmount || parseFloat(bulkBonusAmount) <= 0 || (bulkBonusMode === "selected" && bulkBonusSelected.size === 0)}
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold shrink-0"
                data-testid="button-distribute-bonus"
              >
                {bulkBonusMutation.isPending ? "Enviando..." : "Distribuir"}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* User list */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Lista de Usuários</CardTitle>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou CPF..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-muted border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="input-search-users"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {usersLoading ? <p className="text-sm p-4 text-muted-foreground">Carregando...</p> : users.length === 0 ? (
                <p className="text-sm p-4 text-muted-foreground">Nenhum usuário cadastrado.</p>
              ) : (
                <ScrollArea className="h-[500px]">
                  {(() => {
                    const q = userSearch.toLowerCase().trim();
                    const filtered = users.filter(u =>
                      !q || u.name.toLowerCase().includes(q) || u.cpf.includes(q)
                    );
                    if (filtered.length === 0) return (
                      <p className="text-sm p-4 text-muted-foreground">Nenhum usuário encontrado para "{userSearch}".</p>
                    );
                    return filtered.map(u => {
                      const userDeposits = allDepositsForUsers.filter(d => d.userId === u.cpf && d.status === "confirmed");
                      const totalDeposited = userDeposits.reduce((s, d) => s + d.amount, 0);
                      return (
                        <button key={u.cpf} onClick={() => { setSelectedUser(u); setEditBalance(u.balance.toFixed(2)); setEditBonus((u.bonusBalance ?? 0).toFixed(2)); setNewPassword(""); }}
                          className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors ${selectedUser?.cpf === u.cpf ? "bg-muted" : ""}`}
                          data-testid={`row-user-${u.cpf}`}>
                          <p className="font-semibold text-sm">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.cpf}</p>
                          <div className="flex items-center justify-between mt-0.5">
                            <p className="text-xs text-green-500 font-medium">R$ {u.balance.toFixed(2).replace(".", ",")}</p>
                            {userDeposits.length > 0 && (
                              <p className="text-xs text-blue-400">{userDeposits.length} dep · R$ {totalDeposited.toFixed(2).replace(".", ",")}</p>
                            )}
                          </div>
                          {u.bonusBalance > 0 && (
                            <p className="text-xs text-yellow-400 font-medium mt-0.5 flex items-center gap-1">
                              <Gift className="w-3 h-3" /> Bônus: R$ {u.bonusBalance.toFixed(2).replace(".", ",")}
                            </p>
                          )}
                        </button>
                      );
                    });
                  })()}
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* User detail */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-base">{selectedUser ? selectedUser.name : "Selecione um usuário"}</CardTitle></CardHeader>
            <CardContent>
              {!selectedUser ? (
                <p className="text-sm text-muted-foreground">Clique em um usuário para ver detalhes.</p>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">CPF:</span> {selectedUser.cpf}</div>
                    <div><span className="text-muted-foreground">Telefone:</span> {selectedUser.phone}</div>
                    <div><span className="text-muted-foreground">Saldo:</span> <span className="font-bold text-green-500">R$ {selectedUser.balance.toFixed(2).replace(".", ",")}</span></div>
                    <div><span className="text-muted-foreground">Bônus disponível:</span> <span className="font-bold text-yellow-400">R$ {(selectedUser.bonusBalance ?? 0).toFixed(2).replace(".", ",")}</span></div>
                    <div><span className="text-muted-foreground">1º depósito:</span> {selectedUser.firstDepositDone ? "Sim" : "Não"}</div>
                    <div><span className="text-muted-foreground">Cadastrado:</span> {new Date(selectedUser.createdAt).toLocaleDateString("pt-BR")}</div>
                    {selectedUser.referralCode && <div><span className="text-muted-foreground">Código:</span> {selectedUser.referralCode}</div>}
                  </div>

                  {/* Edit balance */}
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-sm font-semibold">Ajustar Saldo</p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={editBalance}
                        onChange={e => setEditBalance(e.target.value)}
                        className="w-36"
                        data-testid="input-edit-balance"
                        placeholder="Novo saldo"
                      />
                      <Button size="sm" onClick={() => updateBalanceMutation.mutate({ cpf: selectedUser.cpf, balance: parseFloat(editBalance), reason: editBalanceReason })}
                        disabled={updateBalanceMutation.isPending || isNaN(parseFloat(editBalance))}>
                        <Save className="w-4 h-4 mr-1" /> Salvar
                      </Button>
                    </div>
                    <Input
                      type="text"
                      value={editBalanceReason}
                      onChange={e => setEditBalanceReason(e.target.value)}
                      placeholder="Motivo do ajuste (aparece no extrato do usuário)"
                      data-testid="input-edit-balance-reason"
                      className="text-sm"
                    />
                  </div>

                  {/* Edit bonus */}
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-sm font-semibold">Ajustar Bônus</p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editBonus}
                        onChange={e => setEditBonus(e.target.value)}
                        className="w-36"
                        data-testid="input-edit-bonus"
                        placeholder="Novo bônus"
                      />
                      <Button size="sm" onClick={() => updateBonusMutation.mutate({ cpf: selectedUser.cpf, bonusBalance: parseFloat(editBonus) })}
                        disabled={updateBonusMutation.isPending || isNaN(parseFloat(editBonus)) || parseFloat(editBonus) < 0}
                        data-testid="button-save-bonus">
                        <Save className="w-4 h-4 mr-1" /> Salvar
                      </Button>
                    </div>
                  </div>

                  {/* Reset password */}
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-sm font-semibold">Resetar Senha</p>
                    <div className="flex gap-2">
                      <div className="relative flex-1 max-w-xs">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="Nova senha"
                          data-testid="input-new-password"
                        />
                        <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button size="sm" onClick={() => resetPasswordMutation.mutate({ cpf: selectedUser.cpf, password: newPassword })}
                        disabled={resetPasswordMutation.isPending || newPassword.length < 6}>
                        Resetar
                      </Button>
                    </div>
                  </div>

                  {/* User bets */}
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-sm font-semibold">Apostas do Usuário ({userBets.length})</p>
                    {userBets.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma aposta.</p>
                    ) : (
                      <ScrollArea className="h-48">
                        <div className="space-y-2">
                          {userBets.map(bet => (
                            <div key={bet.id} className="p-2 border rounded text-xs">
                              <div className="flex justify-between">
                                <span className="font-mono">#{bet.id.slice(0, 8).toUpperCase()}</span>
                                <Badge variant="secondary" className={`text-[10px] ${
                                  bet.status === "won" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                                  bet.status === "lost" ? "bg-red-500/20 text-red-500 border-red-500/30" :
                                  bet.status === "anulado" ? "bg-gray-500/20 text-gray-400 border-gray-500/30" :
                                  bet.status === "cashed_out" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                                  "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"
                                }`}>
                                  {bet.status === "won" ? "Ganhou" : bet.status === "lost" ? "Perdeu" : bet.status === "anulado" ? "Anulado" : bet.status === "cashed_out" ? "Cash Out" : "Pendente"}
                                </Badge>
                              </div>
                              <div className="flex justify-between mt-1 flex-wrap gap-1">
                                <span>Stake: R$ {bet.stake.toFixed(2).replace(".", ",")}</span>
                                {(() => {
                                  const { displayPotentialWin, baseReturn, bonusReturn, bonusLabel } = computeBetPayout(bet);
                                  if (bet.status === "cashed_out" && (bet as any).cashOutValue != null) {
                                    return (
                                      <span className="text-emerald-400">
                                        Cash Out: R$ {fmtBRL((bet as any).cashOutValue)}
                                        <span className="text-zinc-500 text-[10px] ml-1 line-through">R$&nbsp;{fmtBRL(displayPotentialWin)}</span>
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="text-green-600">
                                      Retorno: R$ {fmtBRL(displayPotentialWin)}
                                      {baseReturn !== null && bonusReturn !== null && (
                                        <span className="text-green-500 text-[10px] ml-1">(R$&nbsp;{fmtBRL(baseReturn)}&nbsp;+&nbsp;R$&nbsp;{fmtBRL(bonusReturn)}&nbsp;{bonusLabel})</span>
                                      )}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>

                  {/* Delete user */}
                  <div className="border-t pt-4">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" data-testid="button-delete-user">
                          <Trash2 className="w-4 h-4 mr-1" /> Excluir Usuário
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir {selectedUser.name}?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita. O usuário e todos os seus dados serão removidos.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteUserMutation.mutate(selectedUser.cpf)} className="bg-red-600 hover:bg-red-700">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </div>
  );
}

function DepositsTab() {
  const { toast } = useToast();

  const { data: deposits = [], isLoading: depositsLoading, refetch: refetchDeposits } = useQuery<Deposit[]>({
    queryKey: ["/api/admin/deposits"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/deposits");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const confirmDepositMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/admin/deposits/${id}/confirm`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Depósito confirmado e saldo creditado!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deposits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      refetchDeposits();
    },
    onError: () => toast({ title: "Erro ao confirmar depósito", variant: "destructive" }),
  });

  const rejectDepositMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/admin/deposits/${id}/reject`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Depósito rejeitado." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deposits"] });
      refetchDeposits();
    },
    onError: () => toast({ title: "Erro ao rejeitar depósito", variant: "destructive" }),
  });

  const deleteDepositMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/deposits/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deposits"] });
      refetchDeposits();
      toast({ title: "Depósito removido", description: "Removido do caixa." });
    },
    onError: () => toast({ title: "Erro ao remover depósito", variant: "destructive" }),
  });

  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const pendingDeposits = deposits.filter(d => d.status === "pending");

  const filtered = useMemo(() => {
    let list = [...deposits].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (dateFrom) {
      const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
      list = list.filter(d => new Date(d.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
      list = list.filter(d => new Date(d.createdAt) <= to);
    }
    return list;
  }, [deposits, dateFrom, dateTo]);

  const totalConfirmado = filtered.filter(d => d.status === "confirmed").reduce((s, d) => s + d.amount, 0);
  const totalPendente = filtered.filter(d => d.status === "pending").reduce((s, d) => s + d.amount, 0);
  const hasFilter = !!dateFrom || !!dateTo;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-yellow-500" />
            Depósitos ({filtered.length}{hasFilter ? ` de ${deposits.length}` : ""})
          </CardTitle>
          {pendingDeposits.length > 0 && (
            <Badge className="bg-red-500 text-white border-0">{pendingDeposits.length} pendente{pendingDeposits.length > 1 ? "s" : ""}</Badge>
          )}
        </div>

        {/* Filtro de datas */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-sm" data-testid="button-date-from">
                <CalendarDays className="w-4 h-4" />
                {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data inicial"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} initialFocus />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground text-sm">até</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-sm" data-testid="button-date-to">
                <CalendarDays className="w-4 h-4" />
                {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data final"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} initialFocus />
            </PopoverContent>
          </Popover>

          {hasFilter && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }} className="text-muted-foreground">
              Limpar filtro
            </Button>
          )}
        </div>

        {/* Totalizadores */}
        {hasFilter && (
          <div className="flex flex-wrap gap-3 pt-2">
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Confirmados</p>
                <p className="text-sm font-bold text-green-400">R$ {totalConfirmado.toFixed(2).replace(".", ",")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              <Clock className="w-4 h-4 text-yellow-400" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Pendentes</p>
                <p className="text-sm font-bold text-yellow-400">R$ {totalPendente.toFixed(2).replace(".", ",")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
              <Wallet className="w-4 h-4 text-blue-400" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total período</p>
                <p className="text-sm font-bold text-blue-400">R$ {(totalConfirmado + totalPendente).toFixed(2).replace(".", ",")}</p>
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {depositsLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{hasFilter ? "Nenhum depósito no período selecionado." : "Nenhum depósito registrado."}</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(dep => (
              <div key={dep.id} className={`flex items-center justify-between p-3 border rounded-lg ${dep.status === "confirmed" ? "border-green-500/30 bg-green-500/5" : dep.status === "rejected" ? "border-red-500/20 opacity-60" : "border-yellow-500/30 bg-yellow-500/5"}`} data-testid={`row-deposit-${dep.id}`}>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-sm">{dep.userId}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${dep.status === "confirmed" ? "bg-green-500/20 text-green-400" : dep.status === "rejected" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                      {dep.status === "confirmed" ? "CONFIRMADO" : dep.status === "rejected" ? "REJEITADO" : "PENDENTE"}
                    </span>
                  </div>
                  <p className="text-sm">R$ {dep.amount.toFixed(2).replace(".", ",")}
                    {dep.bonusAmount > 0 && <span className="text-green-600 ml-1">(+R$ {dep.bonusAmount.toFixed(2).replace(".", ",")} bônus)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(dep.createdAt).toLocaleString("pt-BR")}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {dep.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => confirmDepositMutation.mutate(dep.id)} disabled={confirmDepositMutation.isPending} data-testid={`button-confirm-deposit-${dep.id}`}>
                        <CheckCircle className="w-4 h-4 mr-1" /> Confirmar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => rejectDepositMutation.mutate(dep.id)} disabled={rejectDepositMutation.isPending} data-testid={`button-reject-deposit-${dep.id}`}>
                        <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                      </Button>
                    </>
                  )}
                  {dep.status === "confirmed" && (
                    <Button size="sm" variant="destructive" onClick={() => { if (confirm("Remover este depósito do caixa? O saldo do usuário não será alterado.")) deleteDepositMutation.mutate(dep.id); }} disabled={deleteDepositMutation.isPending} data-testid={`button-delete-deposit-${dep.id}`}>
                      <Trash2 className="w-4 h-4 mr-1" /> Remover
                    </Button>
                  )}
                  {dep.status === "rejected" && (
                    <Button size="sm" variant="ghost" className="text-red-400" onClick={() => deleteDepositMutation.mutate(dep.id)} disabled={deleteDepositMutation.isPending}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ReferralEntry = {
  user: User;
  referralCode: string;
  totalReferred: number;
  depositedCount: number;
  referredUsers: { name: string; cpf: string; deposited: boolean; createdAt: string }[];
};

function ReferralsTab() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery<ReferralEntry[]>({
    queryKey: ["/api/admin/referrals"],
  });

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  if (!rows.length) return (
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground">
        <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p>Nenhum usuário criou um código de convite ainda.</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">
          {rows.length} usuário(s) com código ativo · {rows.reduce((s, r) => s + r.depositedCount, 0)} indicação(ões) convertida(s)
        </p>
      </div>

      {rows.map(row => (
        <Card key={row.user.cpf} className="overflow-hidden" data-testid={`card-referral-${row.user.cpf}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-yellow-400/10 flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5 text-yellow-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{row.user.name}</p>
                  <p className="text-xs text-muted-foreground">{row.user.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-center">
                  <p className="font-mono text-xs font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">{row.referralCode}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">código</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{row.totalReferred}</p>
                  <p className="text-xs text-muted-foreground">cadastros</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-green-400">{row.depositedCount}</p>
                  <p className="text-xs text-muted-foreground">c/ depósito</p>
                </div>
                {row.totalReferred > 0 && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    onClick={() => setExpanded(expanded === row.user.cpf ? null : row.user.cpf)}
                    data-testid={`button-expand-referral-${row.user.cpf}`}
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${expanded === row.user.cpf ? "rotate-180" : ""}`} />
                    {expanded === row.user.cpf ? "Ocultar" : "Ver"}
                  </button>
                )}
              </div>
            </div>

            {expanded === row.user.cpf && row.referredUsers.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-2">
                {row.referredUsers.map(ru => (
                  <div key={ru.cpf} className="flex items-center justify-between text-sm" data-testid={`row-referred-${ru.cpf}`}>
                    <div>
                      <span className="font-medium">{ru.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{ru.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{format(new Date(ru.createdAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                      {ru.deposited
                        ? <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Depositou</Badge>
                        : <Badge variant="outline" className="text-xs text-muted-foreground">Sem depósito</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SettingsTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ aporteInicial: 50000, checkIntervalMinutes: 5, toasterDurationSeconds: 3, defensasInitialBalance: 1000, earlyExitPct: 20, cashOutPct: 20 });
  const [initialized, setInitialized] = useState(false);

  const { data: settings } = useQuery<{ aporteInicial: number; checkIntervalMinutes: number; toasterDurationSeconds: number; defensasInitialBalance: number; earlyExitPct: number; cashOutPct: number }>({
    queryKey: ["/api/admin/settings"],
  });

  useEffect(() => {
    if (settings && !initialized) {
      setForm({ aporteInicial: settings.aporteInicial, checkIntervalMinutes: settings.checkIntervalMinutes, toasterDurationSeconds: settings.toasterDurationSeconds, defensasInitialBalance: settings.defensasInitialBalance ?? 1000, earlyExitPct: settings.earlyExitPct ?? 20, cashOutPct: settings.cashOutPct ?? 20 });
      setInitialized(true);
    }
  }, [settings, initialized]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      await apiRequest("PATCH", "/api/admin/settings", data);
    },
    onSuccess: () => {
      localStorage.setItem("toasterDurationMs", String(form.toasterDurationSeconds * 1000));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/defensas"] });
      toast({ title: "Configurações salvas", description: "As alterações foram aplicadas com sucesso." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível salvar as configurações.", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-yellow-500" />
          Configurações do Sistema
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 max-w-md">
        <div className="space-y-2">
          <label className="text-sm font-medium">Aporte Inicial (R$)</label>
          <p className="text-xs text-muted-foreground">Limite diário de exposição para novas apostas.</p>
          <Input
            type="number"
            min={1}
            data-testid="input-aporte-inicial"
            value={form.aporteInicial}
            onChange={e => setForm(f => ({ ...f, aporteInicial: parseInt(e.target.value) || 50000 }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Atualização de Resultados (minutos)</label>
          <p className="text-xs text-muted-foreground">Com que frequência o servidor verifica resultados pendentes automaticamente.</p>
          <Input
            type="number"
            min={1}
            data-testid="input-check-interval"
            value={form.checkIntervalMinutes}
            onChange={e => setForm(f => ({ ...f, checkIntervalMinutes: parseInt(e.target.value) || 5 }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Duração das Notificações (segundos)</label>
          <p className="text-xs text-muted-foreground">Por quanto tempo as notificações ficam visíveis na tela.</p>
          <Input
            type="number"
            min={1}
            data-testid="input-toaster-duration"
            value={form.toasterDurationSeconds}
            onChange={e => setForm(f => ({ ...f, toasterDurationSeconds: parseInt(e.target.value) || 3 }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2"><Shield className="w-4 h-4 text-cyan-400" /> Caixa de Defesas (R$)</label>
          <p className="text-xs text-muted-foreground">Valor máximo reservado para defesas (hedge bets).</p>
          <Input
            type="number"
            min={1}
            data-testid="input-defensas-initial"
            value={form.defensasInitialBalance}
            onChange={e => setForm(f => ({ ...f, defensasInitialBalance: parseFloat(e.target.value) || 1000 }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Encerrar Aposta (EA) — desconto %</label>
          <p className="text-xs text-muted-foreground">Desconto ao encerrar antes dos jogos. Ex: 20 = usuário recebe 80% do valor apostado.</p>
          <Input
            type="number"
            min={1}
            max={99}
            step={0.5}
            data-testid="input-early-exit-pct"
            value={form.earlyExitPct}
            onChange={e => setForm(f => ({ ...f, earlyExitPct: parseFloat(e.target.value) || 20 }))}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Cashout — variável %</label>
          <p className="text-xs text-muted-foreground">Controla as ofertas escalonadas de cashout (descontos e prêmios progressivos por evento ganho).</p>
          <Input
            type="number"
            min={1}
            max={99}
            step={0.5}
            data-testid="input-cash-out-pct"
            value={form.cashOutPct}
            onChange={e => setForm(f => ({ ...f, cashOutPct: parseFloat(e.target.value) || 20 }))}
          />
        </div>
        <Button
          data-testid="button-save-settings"
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
          className="w-full"
        >
          {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface DefesasTabProps { onRefresh: () => void; }

function DefesasTab({ onRefresh }: DefesasTabProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({ game: "", markets: "", value: "", odds: "", referencedTicket: "", additionalInfo: "" });
  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const { data, isLoading, refetch } = useQuery<{ defesas: Defesa[]; defensasBalance: number; defensasInitialBalance: number; defensasProfits: number }>({
    queryKey: ["/api/admin/defensas"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/admin/defensas"); return res.json(); },
  });

  const defesas = data?.defesas ?? [];
  const balance = data?.defensasBalance ?? 0;
  const initial = data?.defensasInitialBalance ?? 1000;
  const profits = data?.defensasProfits ?? 0;
  const parsedValue = parseFloat(form.value) || 0;
  const parsedOdds = parseFloat(form.odds) || 0;
  const potentialReturn = parsedValue > 0 && parsedOdds > 0 ? Math.round(parsedValue * parsedOdds * 100) / 100 : 0;

  const renovarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/defensas/renovar");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.diff <= 0) {
        toast({ title: "Caixa já está completo", description: "Não há diferença a transferir." });
      } else {
        toast({ title: "Caixa renovado!", description: `R$${fmt(data.diff)} transferido do caixa principal.` });
      }
      refetch(); onRefresh();
      queryClient.invalidateQueries({ queryKey: ["/api/limits"] });
    },
    onError: () => toast({ title: "Erro ao renovar caixa", variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/defensas", {
        game: form.game, markets: form.markets,
        value: parsedValue, odds: parsedOdds,
        potentialReturn,
        referencedTicket: form.referencedTicket,
        additionalInfo: form.additionalInfo,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Defesa cadastrada", description: `R$${fmt(parsedValue)} debitado do caixa de defesas.` });
      setForm({ game: "", markets: "", value: "", odds: "", referencedTicket: "", additionalInfo: "" });
      refetch(); onRefresh();
      createMutation.reset();
    },
    onError: () => toast({ title: "Erro ao cadastrar defesa", variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "won" | "lost" }) => {
      const res = await apiRequest("PATCH", `/api/admin/defensas/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: vars.status === "won" ? "Defesa: Ganhou! Lucro adicionado ao caixa." : "Defesa: Perdeu. Valor descontado." });
      refetch(); onRefresh();
      queryClient.invalidateQueries({ queryKey: ["/api/limits"] });
    },
    onError: () => toast({ title: "Erro ao atualizar defesa", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/defensas/${id}`);
      return res.json();
    },
    onSuccess: () => { toast({ title: "Defesa removida" }); refetch(); onRefresh(); queryClient.invalidateQueries({ queryKey: ["/api/limits"] }); },
    onError: () => toast({ title: "Erro ao remover defesa", variant: "destructive" }),
  });

  const balancePct = initial > 0 ? Math.max(0, Math.min(100, (balance / initial) * 100)) : 0;
  const balColor = balancePct > 60 ? "bg-gradient-to-r from-cyan-600 to-cyan-400"
    : balancePct > 25 ? "bg-gradient-to-r from-yellow-600 to-amber-400"
    : "bg-gradient-to-r from-red-600 to-rose-400";

  return (
    <div className="space-y-4">
      {/* Barra de saldo */}
      <Card className="border-cyan-500/30 bg-cyan-500/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-cyan-400" />
              <div>
                <p className="font-bold">Caixa de Defesas</p>
                <p className="text-xs text-muted-foreground">Reserva para hedge bets em outras casas</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-cyan-400">R${fmt(balance)}</p>
              <p className="text-xs text-muted-foreground">de R${fmt(initial)} disponíveis</p>
            </div>
          </div>
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden mb-2">
            <div className={`h-full transition-all duration-500 ${balColor}`} style={{ width: `${balancePct}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
            {profits > 0 && (
              <p className="text-xs text-green-400 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Lucro total enviado ao caixa principal: R${fmt(profits)}
              </p>
            )}
            {balance < initial && (
              <Button
                data-testid="button-renovar-caixa"
                size="sm"
                variant="outline"
                className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 ml-auto"
                disabled={renovarMutation.isPending}
                onClick={() => renovarMutation.mutate()}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {renovarMutation.isPending ? "Renovando..." : `Renovar Caixa (+R$${fmt(initial - balance)})`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Formulário */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="w-4 h-4 text-primary" /> Nova Defesa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Jogo *</label>
              <Input data-testid="input-defesa-game" placeholder="Ex: Flamengo x Corinthians" value={form.game} onChange={e => setForm(f => ({ ...f, game: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Mercados *</label>
              <Input data-testid="input-defesa-markets" placeholder="Ex: Resultado Final – Corinthians" value={form.markets} onChange={e => setForm(f => ({ ...f, markets: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Valor (R$) *</label>
              <Input data-testid="input-defesa-value" type="number" min="0.01" step="0.01" placeholder="0,00" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Odds *</label>
              <Input data-testid="input-defesa-odds" type="number" min="1.01" step="0.01" placeholder="1.00" value={form.odds} onChange={e => setForm(f => ({ ...f, odds: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Bilhete Referenciado</label>
              <Input data-testid="input-defesa-ticket" placeholder="ID do bilhete do cliente" value={form.referencedTicket} onChange={e => setForm(f => ({ ...f, referencedTicket: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Retorno Potencial</label>
              <div className="h-10 flex items-center px-3 bg-muted/50 rounded-md text-sm font-semibold text-green-400">
                {potentialReturn > 0 ? `R$ ${fmt(potentialReturn)}` : "—"}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Informações Adicionais</label>
            <Input data-testid="input-defesa-info" placeholder="Observações..." value={form.additionalInfo} onChange={e => setForm(f => ({ ...f, additionalInfo: e.target.value }))} />
          </div>
          <Button
            data-testid="button-create-defesa"
            className="w-full"
            disabled={!form.game || !form.markets || parsedValue <= 0 || parsedOdds < 1.01 || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            <Shield className="w-4 h-4 mr-2" />
            {createMutation.isPending ? "Cadastrando..." : "Cadastrar Defesa"}
          </Button>
        </CardContent>
      </Card>

      {/* Lista */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : defesas.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground"><Shield className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Nenhuma defesa cadastrada.</p></CardContent></Card>
        ) : (
          defesas.map(d => (
            <Card key={d.id} className={`border ${d.status === "won" ? "border-green-500/30 bg-green-500/5" : d.status === "lost" ? "border-red-500/20 opacity-70" : "border-cyan-500/20"}`} data-testid={`card-defesa-${d.id}`}>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3 justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${d.status === "won" ? "bg-green-500/20 text-green-400" : d.status === "lost" ? "bg-red-500/20 text-red-400" : "bg-cyan-500/20 text-cyan-400"}`}>
                        {d.status === "won" ? "GANHOU" : d.status === "lost" ? "PERDEU" : "PENDENTE"}
                      </span>
                      <span className="font-semibold text-sm truncate">{d.game}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{d.markets}</p>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span>Valor: <strong className="text-white">R${fmt(d.value)}</strong></span>
                      <span>Odds: <strong className="text-yellow-400">{d.odds.toFixed(2)}</strong></span>
                      <span>Retorno: <strong className="text-green-400">R${fmt(d.potentialReturn)}</strong></span>
                    </div>
                    {d.referencedTicket && <p className="text-xs text-muted-foreground mt-1">Bilhete: {d.referencedTicket}</p>}
                    {d.additionalInfo && <p className="text-xs text-muted-foreground mt-0.5">{d.additionalInfo}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(d.createdAt).toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {d.status === "pending" && (
                      <>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => statusMutation.mutate({ id: d.id, status: "won" })} disabled={statusMutation.isPending} data-testid={`button-defesa-won-${d.id}`}>
                          <CheckCircle className="w-4 h-4 mr-1" /> Ganhou
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => statusMutation.mutate({ id: d.id, status: "lost" })} disabled={statusMutation.isPending} data-testid={`button-defesa-lost-${d.id}`}>
                          <XCircle className="w-4 h-4 mr-1" /> Perdeu
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-400" onClick={() => { if (confirm("Remover esta defesa?")) deleteMutation.mutate(d.id); }} disabled={deleteMutation.isPending} data-testid={`button-defesa-delete-${d.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Copa do Mundo Tab ────────────────────────────────────────────────────────
type CopaSubTabAdmin = "grupos" | "longo" | "especiais";
const COPA_SUBTABS: { key: CopaSubTabAdmin; label: string }[] = [
  { key: "grupos", label: "Grupos" },
  { key: "longo", label: "Longo Prazo" },
  { key: "especiais", label: "Especiais" },
];

interface CopaCardForm {
  subTab: CopaSubTabAdmin;
  title: string;
  description: string;
  team1: string;
  team2: string;
  odds: string;
  badge: string;
  imageUrl: string;
  active: boolean;
  teams: { name: string; odds: string }[];
  tableMode: boolean;
  tableColumns: { name: string; max: number }[];
  tableTeams: { name: string; odds: string[] }[];
}

function CopaWorldCupTab() {
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<CopaSubTabAdmin>("grupos");
  const [activeGrupoAdmin, setActiveGrupoAdmin] = useState<string>("todos");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const emptyForm: CopaCardForm = { subTab: activeSubTab, title: "", description: "", team1: "", team2: "", odds: "", badge: activeSubTab === "grupos" && activeGrupoAdmin !== "todos" ? `Grupo ${activeGrupoAdmin}` : "", imageUrl: "", active: true, teams: [{ name: "", odds: "" }], tableMode: false, tableColumns: [{ name: "", max: 1 }], tableTeams: [{ name: "", odds: [""] }] };
  const [form, setForm] = useState<CopaCardForm>(emptyForm);

  const { data: allCards = [], isLoading, refetch } = useQuery<any[]>({ queryKey: ["/api/admin/copa-world-cup-cards"] });
  const cards = allCards.filter((c: any) => {
    if (c.subTab !== activeSubTab) return false;
    if (activeSubTab === "grupos" && activeGrupoAdmin !== "todos") return c.badge === `Grupo ${activeGrupoAdmin}`;
    return true;
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/admin/copa-world-cup-cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Erro"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/copa-world-cup-cards"] }); queryClient.invalidateQueries({ queryKey: ["/api/copa-world-cup-cards"] }); toast({ title: "Card criado!" }); setShowForm(false); setForm(emptyForm); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/admin/copa-world-cup-cards/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Erro"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/copa-world-cup-cards"] }); queryClient.invalidateQueries({ queryKey: ["/api/copa-world-cup-cards"] }); toast({ title: "Card atualizado!" }); setShowForm(false); setEditingId(null); setForm(emptyForm); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/copa-world-cup-cards/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao deletar");
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/copa-world-cup-cards"] }); queryClient.invalidateQueries({ queryKey: ["/api/copa-world-cup-cards"] }); toast({ title: "Card removido!" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleEdit = (card: any) => {
    setEditingId(card.id);
    let teams: { name: string; odds: string }[] = [{ name: "", odds: "" }];
    let tableMode = false;
    let tableColumns: { name: string; max: number }[] = [{ name: "", max: 1 }];
    let tableTeams: { name: string; odds: string[] }[] = [{ name: "", odds: [""] }];
    if (card.teamsJson) {
      try {
        const parsed = JSON.parse(card.teamsJson);
        if (parsed && !Array.isArray(parsed) && parsed.type === "table") {
          tableMode = true;
          const rawCols = parsed.columns?.length ? parsed.columns : [{ name: "", max: 1 }];
          tableColumns = rawCols.map((c: any) =>
            typeof c === "string" ? { name: c, max: 1 } : { name: c.name || "", max: c.max || 1 }
          );
          tableTeams = (parsed.teams || []).map((t: any) => ({
            name: t.name || "",
            odds: (t.odds || []).map((o: any) => o != null ? String(o) : ""),
          }));
          if (!tableTeams.length) tableTeams = [{ name: "", odds: tableColumns.map(() => "") }];
        } else if (Array.isArray(parsed)) {
          teams = parsed.map((t: any) => ({ name: t.name || "", odds: t.odds != null ? String(t.odds) : "" }));
        }
      } catch {}
    }
    setForm({ subTab: card.subTab, title: card.title, description: card.description, team1: card.team1, team2: card.team2, odds: card.odds != null ? String(card.odds) : "", badge: card.badge, imageUrl: card.imageUrl, active: card.active, teams, tableMode, tableColumns, tableTeams });
    setShowForm(true);
  };

  const handleSubmit = () => {
    const currentSubTabCheck = editingId != null ? form.subTab : activeSubTab;
    const titleRequired = !(currentSubTabCheck === "grupos" && form.tableMode);
    if (titleRequired && !form.title) return toast({ title: "Título obrigatório", variant: "destructive" });
    const currentSubTab = editingId != null ? form.subTab : activeSubTab;
    const isTeamsList = ["grupos", "longo", "especiais"].includes(currentSubTab);
    let payload: any = { ...form, odds: form.odds ? parseFloat(form.odds) : null };
    if (isTeamsList) {
      if (form.tableMode && currentSubTab === "grupos") {
        payload.teamsJson = JSON.stringify({
          type: "table",
          columns: form.tableColumns.filter(c => c.name.trim()).map(c => ({ name: c.name.trim(), max: c.max || 1 })),
          teams: form.tableTeams.filter(t => t.name.trim()).map(t => ({
            name: t.name.trim(),
            odds: t.odds.map(o => o ? parseFloat(o) : null),
          })),
        });
      } else {
        const validTeams = form.teams.filter(t => t.name.trim());
        payload.teamsJson = JSON.stringify(validTeams.map(t => ({ name: t.name.trim(), odds: t.odds ? parseFloat(t.odds) : null })));
      }
    }
    if (editingId != null) updateMutation.mutate({ id: editingId, data: payload });
    else createMutation.mutate({ ...payload, subTab: activeSubTab });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-500" />Copa do Mundo 2026 — Cards</CardTitle>
          <Button size="sm" onClick={() => { setEditingId(null); setForm({ ...emptyForm, subTab: activeSubTab }); setShowForm(!showForm); }} data-testid="button-copa-new-card">
            <Plus className="w-4 h-4 mr-2" />{showForm && editingId == null ? "Cancelar" : "Novo Card"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Crie cards informativos/apostas para cada sub-aba da página Copa do Mundo.</p>
        {/* Sub-tab selector */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {COPA_SUBTABS.map(st => (
            <button key={st.key} onClick={() => { setActiveSubTab(st.key); setActiveGrupoAdmin("todos"); setShowForm(false); setEditingId(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeSubTab === st.key ? "bg-yellow-500 text-black" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              data-testid={`tab-copa-admin-${st.key}`}>{st.label}</button>
          ))}
        </div>
        {activeSubTab === "grupos" && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {(["todos", "A","B","C","D","E","F","G","H","I","J","K","L"] as string[]).map(g => (
              <button key={g} onClick={() => { setActiveGrupoAdmin(g); setShowForm(false); setEditingId(null); }}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${activeGrupoAdmin === g ? "bg-yellow-500/90 text-black" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                data-testid={`tab-copa-grupo-admin-${g}`}>
                {g === "todos" ? "TODOS" : `GRP ${g}`}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Form */}
        {showForm && (() => {
          const currentSubTab = editingId != null ? form.subTab : activeSubTab;
          const isGrupos = currentSubTab === "grupos";
          const isTeamsList = ["grupos", "longo", "especiais"].includes(currentSubTab);
          return (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <h3 className="font-semibold text-sm">{editingId != null ? "Editar Card" : "Novo Card"} — {COPA_SUBTABS.find(s => s.key === currentSubTab)?.label}</h3>
              <div className="space-y-3">
                {/* Título — oculto em grupos com modo tabela */}
                {!(isGrupos && form.tableMode) && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Título *</label>
                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Brasil campeão" className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm" data-testid="input-copa-title" />
                  </div>
                )}

                {isTeamsList ? (
                  <div className="space-y-3">
                    {/* Modo toggle — apenas para grupos */}
                    {isGrupos && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Modo:</span>
                        <button type="button" onClick={() => setForm(f => ({ ...f, tableMode: false }))}
                          className={`px-2.5 py-1 rounded text-xs font-bold border transition-all ${!form.tableMode ? "bg-yellow-500 text-black border-yellow-500" : "border-border text-muted-foreground hover:text-foreground"}`}
                          data-testid="button-copa-mode-lista">Lista</button>
                        <button type="button" onClick={() => setForm(f => ({ ...f, tableMode: true }))}
                          className={`px-2.5 py-1 rounded text-xs font-bold border transition-all ${form.tableMode ? "bg-yellow-500 text-black border-yellow-500" : "border-border text-muted-foreground hover:text-foreground"}`}
                          data-testid="button-copa-mode-tabela">Tabela</button>
                      </div>
                    )}

                    {isGrupos && form.tableMode ? (
                      /* ── MODO TABELA ── */
                      <div className="space-y-3">
                        {/* Editor de colunas */}
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Colunas (mercados)</label>
                          {form.tableColumns.map((col, ci) => (
                            <div key={ci} className="flex gap-2 items-center mt-1.5">
                              <input value={col.name}
                                onChange={e => setForm(f => { const c = [...f.tableColumns]; c[ci] = { ...c[ci], name: e.target.value }; return { ...f, tableColumns: c }; })}
                                placeholder="Ex: Classificar Sim, Líder..."
                                className="flex-1 px-3 py-1.5 rounded-md border bg-background text-sm"
                                data-testid={`input-copa-col-${ci}`} />
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">Máx.</span>
                                <input type="number" min="1" max="10" value={col.max}
                                  onChange={e => setForm(f => { const c = [...f.tableColumns]; c[ci] = { ...c[ci], max: Math.max(1, parseInt(e.target.value) || 1) }; return { ...f, tableColumns: c }; })}
                                  className="w-12 px-2 py-1.5 rounded-md border bg-background text-sm text-center"
                                  data-testid={`input-copa-col-max-${ci}`} />
                              </div>
                              {form.tableColumns.length > 1 && (
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-500 shrink-0"
                                  onClick={() => setForm(f => ({ ...f, tableColumns: f.tableColumns.filter((_, i) => i !== ci), tableTeams: f.tableTeams.map(t => ({ ...t, odds: t.odds.filter((_, i) => i !== ci) })) }))}
                                  data-testid={`button-copa-remove-col-${ci}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                              )}
                            </div>
                          ))}
                          <Button size="sm" variant="outline" className="w-full mt-1.5 text-xs h-8"
                            onClick={() => setForm(f => ({ ...f, tableColumns: [...f.tableColumns, { name: "", max: 1 }], tableTeams: f.tableTeams.map(t => ({ ...t, odds: [...t.odds, ""] })) }))}
                            data-testid="button-copa-add-col">
                            <Plus className="w-3 h-3 mr-1" /> Adicionar coluna
                          </Button>
                        </div>
                        {/* Times com odds por coluna */}
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Times / Seleções</label>
                          {form.tableTeams.map((team, ti) => (
                            <div key={ti} className="mt-1.5 border rounded-md p-2.5 space-y-2 bg-muted/20">
                              <div className="flex gap-2 items-center">
                                <input value={team.name}
                                  onChange={e => setForm(f => { const t = [...f.tableTeams]; t[ti] = { ...t[ti], name: e.target.value }; return { ...f, tableTeams: t }; })}
                                  placeholder="Nome do time / seleção"
                                  className="flex-1 px-3 py-1.5 rounded-md border bg-background text-sm font-semibold"
                                  data-testid={`input-copa-tteam-${ti}`} />
                                {form.tableTeams.length > 1 && (
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-500 shrink-0"
                                    onClick={() => setForm(f => ({ ...f, tableTeams: f.tableTeams.filter((_, i) => i !== ti) }))}
                                    data-testid={`button-copa-remove-tteam-${ti}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                                )}
                              </div>
                              <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${Math.min(form.tableColumns.length, 4)}, 1fr)` }}>
                                {form.tableColumns.map((col, ci) => (
                                  <div key={ci}>
                                    <label className="text-[10px] text-muted-foreground block mb-0.5 truncate">{col.name || `Coluna ${ci + 1}`}</label>
                                    <input type="number" step="0.01" min="1"
                                      value={team.odds[ci] ?? ""}
                                      onChange={e => setForm(f => { const tt = [...f.tableTeams]; const odds = [...tt[ti].odds]; odds[ci] = e.target.value; tt[ti] = { ...tt[ti], odds }; return { ...f, tableTeams: tt }; })}
                                      placeholder="1.00"
                                      className="w-full px-2 py-1.5 rounded-md border bg-background text-sm text-center"
                                      data-testid={`input-copa-todd-${ti}-${ci}`} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <Button size="sm" variant="outline" className="w-full mt-1.5 text-xs h-8"
                            onClick={() => setForm(f => ({ ...f, tableTeams: [...f.tableTeams, { name: "", odds: f.tableColumns.map(() => "") }] }))}
                            data-testid="button-copa-add-tteam">
                            <Plus className="w-3 h-3 mr-1" /> Adicionar time
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* ── MODO LISTA (grupos/longo/especiais) ── */
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">{isGrupos ? "Times do Grupo" : "Seleções / Opções"}</label>
                        {form.teams.map((team, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <input value={team.name}
                              onChange={e => setForm(f => { const t = [...f.teams]; t[idx] = { ...t[idx], name: e.target.value }; return { ...f, teams: t }; })}
                              placeholder={`Time ${String.fromCharCode(65 + idx)}`}
                              className="flex-1 px-3 py-2 rounded-md border bg-background text-sm"
                              data-testid={`input-copa-team-name-${idx}`} />
                            <input type="number" step="0.01" min="1" value={team.odds}
                              onChange={e => setForm(f => { const t = [...f.teams]; t[idx] = { ...t[idx], odds: e.target.value }; return { ...f, teams: t }; })}
                              placeholder="Odd" className="w-20 px-3 py-2 rounded-md border bg-background text-sm"
                              data-testid={`input-copa-team-odds-${idx}`} />
                            {form.teams.length > 1 && (
                              <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-red-400 hover:text-red-500 shrink-0"
                                onClick={() => setForm(f => ({ ...f, teams: f.teams.filter((_, i) => i !== idx) }))}
                                data-testid={`button-copa-remove-team-${idx}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                            )}
                          </div>
                        ))}
                        <Button size="sm" variant="outline" className="w-full mt-1 text-xs h-8"
                          onClick={() => setForm(f => ({ ...f, teams: [...f.teams, { name: "", odds: "" }] }))}
                          data-testid="button-copa-add-team">
                          <Plus className="w-3 h-3 mr-1" /> Adicionar time
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── OUTRAS SUB-ABAS: time + odd simples ── */
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Time / Seleção</label>
                      <input value={form.team1} onChange={e => setForm(f => ({ ...f, team1: e.target.value }))} placeholder="Ex: Brasil" className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm" data-testid="input-copa-team1" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Odd</label>
                      <input type="number" step="0.01" value={form.odds} onChange={e => setForm(f => ({ ...f, odds: e.target.value }))} placeholder="Ex: 2.50" className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm" data-testid="input-copa-odds" />
                    </div>
                  </div>
                )}

                {/* Badge — grupo selector para grupos, texto livre para outras */}
                {isGrupos ? (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Grupo *</label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {["A","B","C","D","E","F","G","H","I","J","K","L"].map(g => (
                        <button key={g} type="button"
                          onClick={() => setForm(f => ({ ...f, badge: `Grupo ${g}` }))}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all border ${form.badge === `Grupo ${g}` ? "bg-yellow-500 text-black border-yellow-500" : "border-border text-muted-foreground hover:text-foreground"}`}
                          data-testid={`button-copa-grupo-sel-${g}`}>
                          GRUPO {g}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Badge (ex: FAVORITO)</label>
                    <input value={form.badge} onChange={e => setForm(f => ({ ...f, badge: e.target.value }))} placeholder="Ex: FAVORITO" className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm" data-testid="input-copa-badge" />
                  </div>
                )}

                {/* Descrição — sempre */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Descrição / Informação</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Informação adicional do card..." rows={2} className="w-full mt-1 px-3 py-2 rounded-md border bg-background text-sm resize-none" data-testid="input-copa-description" />
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="copa-active" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="w-4 h-4" data-testid="checkbox-copa-active" />
                  <label htmlFor="copa-active" className="text-sm">Card ativo (visível no site)</label>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-copa-save">
                  {(createMutation.isPending || updateMutation.isPending) ? "Salvando..." : editingId != null ? "Salvar Alterações" : "Criar Card"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }} data-testid="button-copa-cancel">Cancelar</Button>
              </div>
            </div>
          );
        })()}

        {/* Cards list */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : cards.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Nenhum card em <strong>{COPA_SUBTABS.find(s => s.key === activeSubTab)?.label}</strong>. Clique em "Novo Card" para criar.
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card: any) => (
              <div key={card.id} className="flex items-start gap-3 border rounded-lg p-3">
                {card.imageUrl && <img src={card.imageUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{card.title}</span>
                    {card.badge && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-600">{card.badge}</span>}
                    {!card.active && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-500">INATIVO</span>}
                  </div>
                  {(card.team1 || card.team2) && <p className="text-xs text-muted-foreground mt-0.5">{card.team1}{card.team1 && card.team2 ? " × " : ""}{card.team2}{card.odds ? ` — Odd: ${card.odds}` : ""}</p>}
                  {card.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{card.description}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleEdit(card)} data-testid={`button-copa-edit-${card.id}`}><Pencil className="w-3 h-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-500" onClick={() => { if (confirm("Remover este card?")) deleteMutation.mutate(card.id); }} data-testid={`button-copa-delete-${card.id}`}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Recompensas Tab ──────────────────────────────────────────────────────────
type ClubFwClaim = {
  id: number;
  userId: string;
  userName: string;
  weekStart: string;
  level: number;
  bonusAmount: number;
  createdAt: string;
};

function RecompensasTab() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [payoutWeek, setPayoutWeek] = useState("2026-05-11");
  const [payoutResult, setPayoutResult] = useState<{ processed: number; totalBonus: number; message: string } | null>(null);
  const { toast } = useToast();

  const payoutMutation = useMutation({
    mutationFn: async (weekStart: string) => {
      const res = await apiRequest("POST", "/api/admin/club-fw-payout", { weekStart });
      return res.json();
    },
    onSuccess: (data) => {
      setPayoutResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/club-fw-claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Pagamento processado", description: data.message });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao processar pagamento", variant: "destructive" });
    },
  });

  const [fixResult, setFixResult] = useState<{ fixed: number; totalDeducted: number; message: string; details: string[] } | null>(null);
  const fixMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/club-fw-fix-overcredit", {});
      return res.json();
    },
    onSuccess: (data) => {
      setFixResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/club-fw-claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Correção concluída", description: data.message });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao corrigir overcredit", variant: "destructive" });
    },
  });

  const { data: claims = [], isLoading } = useQuery<ClubFwClaim[]>({
    queryKey: ["/api/admin/club-fw-claims", appliedFrom, appliedTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (appliedFrom) params.set("from", appliedFrom);
      if (appliedTo) params.set("to", appliedTo);
      const res = await apiRequest("GET", `/api/admin/club-fw-claims?${params.toString()}`);
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users");
      return res.json();
    },
  });

  const fmt = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

  const levelColors: Record<number, string> = {
    1: "bg-gray-500/20 text-gray-300",
    2: "bg-blue-500/20 text-blue-300",
    3: "bg-purple-500/20 text-purple-300",
    4: "bg-yellow-500/20 text-yellow-300",
  };
  const levelLabels: Record<number, string> = {
    1: "Nível 1 · R$100",
    2: "Nível 2 · R$250",
    3: "Nível 3 · R$600",
    4: "Nível 4 · R$1.000",
  };

  const filtered = claims.filter(c => {
    if (!userFilter) return true;
    const q = userFilter.toLowerCase();
    return c.userName.toLowerCase().includes(q) || c.userId.includes(q);
  });

  const totalBonus = filtered.reduce((s, c) => s + c.bonusAmount, 0);
  const uniqueUsers = new Set(filtered.map(c => c.userId)).size;

  const byUser = users
    .map(u => ({
      ...u,
      totalEarned: claims.filter(c => c.userId === u.cpf).reduce((s, c) => s + c.bonusAmount, 0),
      claimCount: claims.filter(c => c.userId === u.cpf).length,
    }))
    .filter(u => u.bonusBalance > 0 || u.totalEarned > 0)
    .sort((a, b) => b.bonusBalance - a.bonusBalance);

  return (
    <div className="space-y-4">
      {/* Pagamento Retroativo */}
      <Card className="border-yellow-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="w-4 h-4 text-yellow-400" />
            Processar Pagamento Clube Verano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Credita automaticamente os bônus de todos os usuários elegíveis para a semana informada. Seguro para rodar múltiplas vezes — não duplica créditos.
          </p>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Semana (segunda-feira):</span>
              <input
                type="date"
                value={payoutWeek}
                onChange={e => setPayoutWeek(e.target.value)}
                className="text-sm bg-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="input-payout-week"
              />
            </div>
            <Button
              size="sm"
              onClick={() => payoutMutation.mutate(payoutWeek)}
              disabled={payoutMutation.isPending || !payoutWeek}
              data-testid="button-force-payout"
            >
              {payoutMutation.isPending ? "Processando..." : "Pagar Semana"}
            </Button>
          </div>
          {payoutResult && (
            <div className="mt-3 p-3 rounded-md bg-green-500/10 border border-green-500/20 text-sm">
              <p className="font-medium text-green-400">✓ {payoutResult.message}</p>
              <p className="text-muted-foreground text-xs mt-1">
                {payoutResult.processed} usuário(s) premiado(s) · R$ {payoutResult.totalBonus.toFixed(2).replace(".", ",")} em bônus creditados
              </p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">
              <span className="text-orange-400 font-medium">Corrigir overcredit:</span> remove bônus de níveis inferiores creditados indevidamente quando o usuário já recebeu um nível mais alto na mesma semana.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
              onClick={() => fixMutation.mutate()}
              disabled={fixMutation.isPending}
              data-testid="button-fix-overcredit"
            >
              {fixMutation.isPending ? "Corrigindo..." : "Corrigir Overcredit"}
            </Button>
            {fixResult && (
              <div className="mt-3 p-3 rounded-md bg-orange-500/10 border border-orange-500/20 text-sm">
                <p className="font-medium text-orange-400">✓ {fixResult.message}</p>
                {fixResult.details.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {fixResult.details.map((d, i) => (
                      <li key={i} className="text-muted-foreground text-xs">{d}</li>
                    ))}
                  </ul>
                )}
                {fixResult.fixed === 0 && (
                  <p className="text-muted-foreground text-xs mt-1">Nenhum overcredit encontrado.</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Gift className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-yellow-400">{fmt(claims.reduce((s, c) => s + c.bonusAmount, 0))}</p>
              <p className="text-xs text-muted-foreground">Total distribuído</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold">{new Set(claims.map(c => c.userId)).size}</p>
              <p className="text-xs text-muted-foreground">Usuários premiados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Star className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xl font-bold">{claims.length}</p>
              <p className="text-xs text-muted-foreground">Recompensas emitidas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bônus disponível por usuário */}
      {byUser.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4 text-yellow-400" />
              Bônus Disponível por Usuário
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {byUser.map(u => (
                <div key={u.cpf} className="flex items-center justify-between px-4 py-2.5" data-testid={`row-bonus-${u.cpf}`}>
                  <div>
                    <p className="text-sm font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.cpf} · {u.claimCount} recompensa{u.claimCount !== 1 ? "s" : ""} ganhas · total: {fmt(u.totalEarned)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-yellow-400">{fmt(u.bonusBalance)}</p>
                    <p className="text-[10px] text-muted-foreground">disponível</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Histórico com filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Histórico de Recompensas – Clube Verano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Semana de:</span>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="text-sm bg-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="input-recompensas-from"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">até:</span>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="text-sm bg-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="input-recompensas-to"
              />
            </div>
            <Button size="sm" onClick={() => { setAppliedFrom(fromDate); setAppliedTo(toDate); }} data-testid="button-recompensas-filter">
              <Filter className="w-3.5 h-3.5 mr-1" /> Filtrar
            </Button>
            {(appliedFrom || appliedTo) && (
              <Button size="sm" variant="ghost" onClick={() => { setFromDate(""); setToDate(""); setAppliedFrom(""); setAppliedTo(""); }} data-testid="button-recompensas-clear">
                Limpar filtro
              </Button>
            )}
            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar usuário..."
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
                className="pl-8 pr-3 py-1 text-sm bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="input-recompensas-search"
              />
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma recompensa encontrada.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                {filtered.length} registro{filtered.length !== 1 ? "s" : ""} · {uniqueUsers} usuário{uniqueUsers !== 1 ? "s" : ""} · {fmt(totalBonus)} em bônus
              </p>
              <div className="divide-y divide-border rounded-md border">
                {filtered.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-2.5" data-testid={`row-claim-${c.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{c.userName}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${levelColors[c.level] ?? "bg-muted text-muted-foreground"}`}>
                          {levelLabels[c.level] ?? `Nível ${c.level}`}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        CPF: {c.userId} · Semana: {c.weekStart} · {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-yellow-400 shrink-0 ml-4">+{fmt(c.bonusAmount)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Admin Live Game Tab ───────────────────────────────────────────────────────
type AdminGame = {
  id: number; date: string; dateLabel: string; status: string; statusLong: string; elapsed: number | null;
  home: string; homeLogo: string; away: string; awayLogo: string;
  league: string; leagueLogo: string; goalsHome: number | null; goalsAway: number | null; isLive: boolean;
};
type LiveGamesResp = { games: AdminGame[]; activeFixtureId: number | null; isLocked: boolean };

function AdminLiveGameTab() {
  const { data, isLoading, refetch } = useQuery<LiveGamesResp>({
    queryKey: ["/api/admin/live-games"],
    queryFn: () => fetch("/api/admin/live-games", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  // Native interval polling for lock status — bypasses React Query throttling
  const [lockStatus, setLockStatus] = useState<{ isLocked: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/admin/live-game/lock-status", { credentials: "include" });
        if (r.ok && active) setLockStatus(await r.json());
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const fmt = (n: number | null) => n == null ? "?" : n;

  const activateMut = useMutation({
    mutationFn: (game: AdminGame) =>
      fetch("/api/admin/live-game/activate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId: game.id, home: game.home, away: game.away, league: game.league, homeLogo: game.homeLogo, awayLogo: game.awayLogo }),
      }).then(r => r.json()),
    onSuccess: () => refetch(),
  });

  const deactivateMut = useMutation({
    mutationFn: () =>
      fetch("/api/admin/live-game/deactivate", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => refetch(),
  });

  const lockMut = useMutation({
    mutationFn: () =>
      fetch("/api/admin/live-game/toggle-lock", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (data) => {
      setLockStatus({ isLocked: data.isLocked });
      refetch();
    },
  });

  const [mobileToken, setMobileToken] = useState<string | null>(null);
  const [mobileLinkCopied, setMobileLinkCopied] = useState(false);
  const [mobileTokenError, setMobileTokenError] = useState<string | null>(null);

  const mobileTokenMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/live-control/generate-token", {
        method: "POST",
        credentials: "include",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message ?? "Erro ao gerar link");
      return body as { token: string };
    },
    onSuccess: (data) => {
      setMobileToken(data.token);
      setMobileTokenError(null);
    },
    onError: (err: Error) => {
      setMobileTokenError(err.message);
    },
  });

  const mobileLink = mobileToken
    ? `${window.location.origin}/live-control?t=${mobileToken}`
    : null;

  const copyMobileLink = () => {
    if (!mobileLink) return;
    navigator.clipboard.writeText(mobileLink).then(() => {
      setMobileLinkCopied(true);
      setTimeout(() => setMobileLinkCopied(false), 2500);
    });
  };

  const [searchLive, setSearchLive] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const activeGame = data?.games.find(g => g.id === data.activeFixtureId);
  // Prefer fast-polling lockStatus (5s) over the 30s live-games response
  const isLocked = lockStatus?.isLocked ?? data?.isLocked ?? false;

  const filteredGames = (data?.games ?? []).filter(g => {
    if (!searchLive.trim()) return true;
    const q = searchLive.toLowerCase();
    return g.home.toLowerCase().includes(q) || g.away.toLowerCase().includes(q) || g.league.toLowerCase().includes(q);
  });

  const LIVE_ST = ["1H","HT","2H","ET","BT","P","INT"];
  const statusLabel = (g: AdminGame) => {
    if (LIVE_ST.includes(g.status)) return `${g.elapsed ?? "?"}′`;
    if (g.status === "FT") return "Enc.";
    if (g.status === "NS") {
      const d = new Date(g.date);
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    }
    return g.status;
  };

  return (
    <div className="space-y-4">
      {/* ── Status atual ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Signal className="w-5 h-5 text-red-500" />
            Jogo Ao Vivo no Site
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Mobile control link */}
          {data?.activeFixtureId && (
            <div className="mb-4 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Controle Mobile</span>
              </div>
              {!mobileLink ? (
                <>
                  <button
                    onClick={() => mobileTokenMut.mutate()}
                    disabled={mobileTokenMut.isPending}
                    data-testid="button-generate-mobile-link"
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border border-dashed border-border text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                  >
                    {mobileTokenMut.isPending
                      ? <RefreshCw className="w-4 h-4 animate-spin" />
                      : <Smartphone className="w-4 h-4" />}
                    {mobileTokenMut.isPending ? "Gerando..." : "Gerar Link Mobile"}
                  </button>
                  {mobileTokenError && (
                    <p className="text-[11px] text-red-400 mt-1.5 text-center">{mobileTokenError}</p>
                  )}
                </>
              ) : (
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-1.5 bg-background rounded-lg px-3 py-2 border border-border overflow-hidden">
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">{mobileLink}</span>
                  </div>
                  <button
                    onClick={copyMobileLink}
                    data-testid="button-copy-mobile-link"
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      mobileLinkCopied
                        ? "bg-green-500/20 text-green-400"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {mobileLinkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {mobileLinkCopied ? "Copiado!" : "Copiar"}
                  </button>
                  <button
                    onClick={() => mobileTokenMut.mutate()}
                    data-testid="button-refresh-mobile-link"
                    title="Gerar novo link"
                    className="flex items-center px-2.5 py-2 rounded-lg bg-muted/40 text-muted-foreground hover:bg-muted/70 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground/50 mt-1.5">Link válido por 24h. Abre no celular sem precisar de senha.</p>
            </div>
          )}

          {data?.activeFixtureId && activeGame ? (
            <div className={`rounded-xl border-2 overflow-hidden ${isLocked ? "border-red-500/60" : "border-green-500/50"}`}>
              {/* Status bar */}
              <div className={`flex items-center justify-between px-4 py-2 text-xs font-bold ${isLocked ? "bg-red-500/20 text-red-400" : "bg-green-500/15 text-green-400"}`}>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
                  AO VIVO NO SITE
                </span>
                <span className="flex items-center gap-1.5">
                  {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  {isLocked ? "MERCADOS BLOQUEADOS" : "MERCADOS ABERTOS"}
                </span>
              </div>

              {/* Game info */}
              <div className="px-4 py-4 bg-card">
                {/* League */}
                <div className="flex items-center gap-1.5 mb-3">
                  <img src={proxyLogoUrl(activeGame.leagueLogo)} className="w-4 h-4 object-contain" alt="" />
                  <span className="text-xs text-muted-foreground">{translateLeagueDisplay(activeGame.league)}</span>
                  {activeGame.isLive && (
                    <span className="ml-auto text-sm font-bold tabular-nums text-white">
                      {activeGame.elapsed}′ &nbsp;
                      <span className="text-green-400">{fmt(activeGame.goalsHome)}–{fmt(activeGame.goalsAway)}</span>
                    </span>
                  )}
                  {!activeGame.isLive && (
                    <span className="ml-auto text-xs text-muted-foreground">{statusLabel(activeGame)}</span>
                  )}
                </div>

                {/* Teams */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                    <img src={proxyLogoUrl(activeGame.homeLogo)} className="w-12 h-12 object-contain" alt="" />
                    <span className="text-sm font-semibold text-center leading-tight truncate w-full text-center">{activeGame.home}</span>
                  </div>
                  <div className="text-2xl font-black text-muted-foreground px-2">×</div>
                  <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                    <img src={proxyLogoUrl(activeGame.awayLogo)} className="w-12 h-12 object-contain" alt="" />
                    <span className="text-sm font-semibold text-center leading-tight truncate w-full text-center">{activeGame.away}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-border">
                {confirmDeactivate ? (
                  /* Confirmation state — full width */
                  <div className="p-3 flex flex-col gap-2">
                    <p className="text-xs text-center text-muted-foreground font-medium">
                      Remover jogo ao vivo do site?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { deactivateMut.mutate(); setConfirmDeactivate(false); }}
                        disabled={deactivateMut.isPending}
                        data-testid="button-deactivate-confirm"
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors"
                      >
                        <StopCircle className="w-4 h-4" />
                        Sim, desativar
                      </button>
                      <button
                        onClick={() => setConfirmDeactivate(false)}
                        data-testid="button-deactivate-cancel"
                        className="flex items-center justify-center py-2.5 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal state — two side-by-side buttons */
                  <div className="flex gap-2 p-3">
                    <button
                      onClick={() => lockMut.mutate()}
                      disabled={lockMut.isPending}
                      data-testid="button-toggle-lock"
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white transition-colors
                        ${isLocked
                          ? "bg-green-600 hover:bg-green-700"
                          : "bg-red-600 hover:bg-red-700"
                        }`}
                    >
                      {isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      {isLocked ? "Liberar Mercados" : "Bloquear Mercados"}
                    </button>
                    <button
                      onClick={() => setConfirmDeactivate(true)}
                      disabled={deactivateMut.isPending}
                      data-testid="button-deactivate-live"
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
                    >
                      <StopCircle className="w-4 h-4" />
                      Desativar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Signal className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhum jogo ativo no site.</p>
              <p className="text-xs mt-1 opacity-70">Selecione um jogo na lista abaixo para ativar.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Lista de jogos do dia ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Jogos
              {data?.games.length ? <span className="text-xs font-normal text-muted-foreground">({filteredGames.length}/{data.games.length})</span> : null}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh-live-games">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchLive}
              onChange={e => setSearchLive(e.target.value)}
              placeholder="Buscar por time ou liga..."
              className="w-full pl-8 pr-8 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              data-testid="input-search-live-games"
            />
            {searchLive && (
              <button
                onClick={() => setSearchLive("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : !data?.games.length ? (
            <p className="text-sm text-center text-muted-foreground py-4">Nenhum jogo encontrado para hoje.</p>
          ) : filteredGames.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-4">Nenhum jogo corresponde à pesquisa.</p>
          ) : (
            <div className="space-y-2">
              {(() => {
                const items: JSX.Element[] = [];
                let lastLabel = "";
                filteredGames.forEach(g => {
                  const label = g.isLive ? "🔴 Ao Vivo Agora" : g.dateLabel;
                  if (label !== lastLabel) {
                    lastLabel = label;
                    items.push(
                      <p key={`sep-${label}`} className={`text-xs font-semibold uppercase tracking-wide pt-1 ${g.isLive ? "text-red-400" : "text-muted-foreground"}`}>
                        {label}
                      </p>
                    );
                  }
                  const isActive = g.id === data.activeFixtureId;
                  items.push(
                  <div
                    key={g.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${isActive ? "border-red-500/50 bg-red-500/5" : "border-border hover:border-muted-foreground/30"}`}
                    data-testid={`row-live-game-${g.id}`}
                  >
                    {/* Status */}
                    <div className="w-12 shrink-0 text-center">
                      {g.isLive ? (
                        <span className="text-[10px] font-bold text-red-500 animate-pulse">{statusLabel(g)}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{statusLabel(g)}</span>
                      )}
                    </div>

                    {/* Placar/Times */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <img src={proxyLogoUrl(g.homeLogo)} className="w-4 h-4 object-contain" alt="" />
                        <span className="truncate">{translateTeam(g.home)}</span>
                        {g.isLive && <span className="font-bold mx-1">{fmt(g.goalsHome)}–{fmt(g.goalsAway)}</span>}
                        <span className="text-muted-foreground">×</span>
                        <span className="truncate">{translateTeam(g.away)}</span>
                        <img src={proxyLogoUrl(g.awayLogo)} className="w-4 h-4 object-contain" alt="" />
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <img src={proxyLogoUrl(g.leagueLogo)} className="w-3 h-3 object-contain" alt="" />
                        <span className="text-[10px] text-muted-foreground truncate">{translateLeagueDisplay(g.league)}</span>
                      </div>
                    </div>

                    {/* Ações */}
                    {isActive ? (
                      <Badge variant="destructive" className="text-[10px] shrink-0">Ativo</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 shrink-0 h-7"
                        onClick={() => activateMut.mutate(g)}
                        disabled={activateMut.isPending}
                        data-testid={`button-activate-${g.id}`}
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        Ativar
                      </Button>
                    )}
                  </div>
                  );
                });
                return items;
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Bolão Tab ────────────────────────────────────────────────────────────────
function BolaoTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  interface BolaoAdmin {
    id: number;
    homeTeam: string;
    awayTeam: string;
    matchDate: string;
    entryFee: number;
    status: string;
    active: boolean;
    actualHomeScore: number | null;
    actualAwayScore: number | null;
    totalEntries: number;
    prizePool: number;
    entries: { id: number; userId: string; homeScore: number; awayScore: number; prizeAwarded: boolean; createdAt: string }[];
  }

  const { data: boloes = [], isLoading } = useQuery<BolaoAdmin[]>({ queryKey: ["/api/admin/bolao"], staleTime: 10_000 });

  // Form state
  const [form, setForm] = useState({ homeTeam: "", awayTeam: "", matchDate: "", entryFee: "10" });
  const [creating, setCreating] = useState(false);

  // Finish modal
  const [finishModal, setFinishModal] = useState<{ id: number; homeTeam: string; awayTeam: string } | null>(null);
  const [finishScores, setFinishScores] = useState({ homeScore: 0, awayScore: 0 });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/bolao", {
        homeTeam: form.homeTeam.trim(),
        awayTeam: form.awayTeam.trim(),
        matchDate: form.matchDate,
        entryFee: parseFloat(form.entryFee) || 10,
        active: true,
        status: "open",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Erro"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bolao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolao/active"] });
      setForm({ homeTeam: "", awayTeam: "", matchDate: "", entryFee: "10" });
      setCreating(false);
      toast({ title: "Bolão criado!" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/bolao/${id}`, { active });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/bolao"] }); queryClient.invalidateQueries({ queryKey: ["/api/bolao/active"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/bolao/${id}`, undefined);
      if (!res.ok) throw new Error("Erro");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/bolao"] }); queryClient.invalidateQueries({ queryKey: ["/api/bolao/active"] }); toast({ title: "Bolão excluído" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const finishMutation = useMutation({
    mutationFn: async ({ id, homeScore, awayScore }: { id: number; homeScore: number; awayScore: number }) => {
      const res = await apiRequest("POST", `/api/admin/bolao/${id}/finish`, { homeScore, awayScore });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Erro"); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bolao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bolao/active"] });
      setFinishModal(null);
      toast({ title: `Bolão finalizado! ${data.winnerCount} ganhador(es), R$${data.prizePerWinner?.toFixed(2) ?? "0"} cada.` });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const statusLabel = (s: string) => s === "open" ? "Aberto" : s === "closed" ? "Fechado" : "Finalizado";
  const statusColor = (s: string) => s === "open" ? "bg-green-500/20 text-green-400 border-green-500/30" : s === "closed" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-gray-500/20 text-gray-400 border-gray-500/30";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              Bolão da Copa
            </CardTitle>
            <Button size="sm" onClick={() => setCreating(v => !v)} data-testid="button-novo-bolao">
              {creating ? <><X className="w-4 h-4 mr-1" />Cancelar</> : <><Plus className="w-4 h-4 mr-1" />Novo Bolão</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {creating && (
            <div className="border rounded-lg p-4 mb-4 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Time da Casa</label>
                  <input className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm" value={form.homeTeam} onChange={e => setForm(f => ({ ...f, homeTeam: e.target.value }))} placeholder="Ex: Brasil" data-testid="input-bolao-home" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Time Visitante</label>
                  <input className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm" value={form.awayTeam} onChange={e => setForm(f => ({ ...f, awayTeam: e.target.value }))} placeholder="Ex: Argentina" data-testid="input-bolao-away" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Data do Jogo</label>
                  <input type="datetime-local" className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm" value={form.matchDate} onChange={e => setForm(f => ({ ...f, matchDate: e.target.value }))} data-testid="input-bolao-date" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Taxa de entrada (R$)</label>
                  <input type="number" className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm" value={form.entryFee} onChange={e => setForm(f => ({ ...f, entryFee: e.target.value }))} min="1" step="0.01" data-testid="input-bolao-fee" />
                </div>
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.homeTeam || !form.awayTeam} data-testid="button-criar-bolao">
                {createMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</> : "Criar Bolão"}
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : boloes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Nenhum bolão criado ainda.</div>
          ) : (
            <div className="space-y-3">
              {boloes.map(b => (
                <div key={b.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{b.homeTeam} vs {b.awayTeam}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {b.matchDate ? new Date(b.matchDate).toLocaleString("pt-BR") : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusColor(b.status)}>{statusLabel(b.status)}</Badge>
                      {b.status === "finished" && b.actualHomeScore !== null && (
                        <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                          Placar: {b.actualHomeScore}×{b.actualAwayScore}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground"><Users className="w-3.5 h-3.5" />{b.totalEntries} participante{b.totalEntries !== 1 ? "s" : ""}</span>
                    <span className="flex items-center gap-1 text-muted-foreground"><DollarSign className="w-3.5 h-3.5" />Prêmio: R${fmt(b.prizePool)}</span>
                    <span className="flex items-center gap-1 text-muted-foreground">Taxa: R${fmt(b.entryFee)}</span>
                  </div>

                  {b.status !== "finished" && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => toggleActiveMutation.mutate({ id: b.id, active: !b.active })} data-testid={`button-bolao-toggle-${b.id}`}>
                        {b.active ? <><EyeOff className="w-3.5 h-3.5 mr-1" />Ocultar</> : <><Eye className="w-3.5 h-3.5 mr-1" />Exibir</>}
                      </Button>
                      <Button variant="outline" size="sm" className="text-yellow-400 border-yellow-500/30" onClick={() => { setFinishModal({ id: b.id, homeTeam: b.homeTeam, awayTeam: b.awayTeam }); setFinishScores({ homeScore: 0, awayScore: 0 }); }} data-testid={`button-bolao-finish-${b.id}`}>
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />Finalizar
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-400 border-red-500/30" onClick={() => deleteMutation.mutate(b.id)} data-testid={`button-bolao-delete-${b.id}`}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" />Excluir
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Finish modal */}
      <Dialog open={!!finishModal} onOpenChange={open => !open && setFinishModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              Finalizar Bolão
            </DialogTitle>
          </DialogHeader>
          {finishModal && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{finishModal.homeTeam} vs {finishModal.awayTeam}</p>
              <p className="text-sm font-medium">Informe o placar real:</p>
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-muted-foreground">{finishModal.homeTeam}</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setFinishScores(s => ({ ...s, homeScore: Math.max(0, s.homeScore - 1) }))}>
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-2xl font-bold w-8 text-center">{finishScores.homeScore}</span>
                    <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setFinishScores(s => ({ ...s, homeScore: s.homeScore + 1 }))}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <span className="text-xl font-bold text-muted-foreground">×</span>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-muted-foreground">{finishModal.awayTeam}</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setFinishScores(s => ({ ...s, awayScore: Math.max(0, s.awayScore - 1) }))}>
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-2xl font-bold w-8 text-center">{finishScores.awayScore}</span>
                    <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setFinishScores(s => ({ ...s, awayScore: s.awayScore + 1 }))}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              <Button className="w-full" onClick={() => finishMutation.mutate({ id: finishModal.id, homeScore: finishScores.homeScore, awayScore: finishScores.awayScore })} disabled={finishMutation.isPending} data-testid="button-confirm-finish-bolao">
                {finishMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Finalizando...</> : "Confirmar e Distribuir Prêmios"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
