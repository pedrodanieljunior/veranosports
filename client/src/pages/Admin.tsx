import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BetSlip as BetSlipType } from "@shared/schema";
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
  ChevronUp
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [adminTab, setAdminTab] = useState<string>("bilhetes");
  const [riskSelected, setRiskSelected] = useState<"low" | "mid" | "high" | null>(null);

  const { data: bets = [], isLoading, refetch } = useQuery<BetSlipType[]>({
    queryKey: ["/api/admin/bets"],
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
    if (statusFilter === "all") return true;
    return bet.status === statusFilter;
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "won":
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Ganhou</Badge>;
      case "lost":
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Perdeu</Badge>;
      default:
        return <Badge variant="secondary">Pendente</Badge>;
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
                      const pct = Math.min(100, (entry.total / SIMPLE_BET_GAME_LIMIT) * 100);
                      const remaining = Math.max(0, SIMPLE_BET_GAME_LIMIT - entry.total);
                      return (
                        <div key={entry.gameId} className={`rounded-lg border p-4 ${entry.isBlocked ? "border-red-500/50 bg-red-500/5" : "border-border"}`}>
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <div>
                              <p className="font-semibold text-sm">
                                {entry.homeTeam} <span className="text-muted-foreground">vs</span> {entry.awayTeam}
                              </p>
                              <p className="text-xs text-muted-foreground">{entry.sportTitle} · {entry.count} aposta{entry.count !== 1 ? "s" : ""} simples</p>
                            </div>
                            <div className="text-right">
                              {entry.isBlocked ? (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3" />
                                  Jogo Bloqueado
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
                                  Disponível: R${remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Progress
                            value={pct}
                            className={`h-3 ${entry.isBlocked ? "[&>div]:bg-red-500" : pct >= 80 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`}
                            data-testid={`progress-game-${entry.gameId}`}
                          />
                          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                            <span>R${entry.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span>{pct.toFixed(1)}% de R$15.000</span>
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
                const pending = bets.filter(b => !b.verified && b.status === "pending");
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
                            R${g.bets.reduce((s,b)=>s+b.potentialWin,0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
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
                                <div className="flex items-center gap-4">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Apostado</p>
                                    <p className="font-bold text-sm">R${bet.stake.toFixed(2)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-muted-foreground">Retorno</p>
                                    <p className={`font-bold text-sm ${activeGroup.textCls}`}>R${bet.potentialWin.toFixed(2)}</p>
                                  </div>
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => updateVerifiedMutation.mutate({ id: bet.id, verified: true })}
                                    disabled={updateVerifiedMutation.isPending}
                                    data-testid={`button-validate-risk-${bet.id}`}
                                  >
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Confirmar Pago
                                  </Button>
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
                      Atualizar
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
                        const risk = bet.potentialWin <= 5000 ? "low" : bet.potentialWin <= 10000 ? "mid" : "high";
                        const riskStyle = {
                          low:  { dot: "bg-green-500",  border: "border-green-500/30",  bg: "bg-green-500/5",  label: "Baixo",  labelCls: "bg-green-500/20 text-green-400 border-green-500/30" },
                          mid:  { dot: "bg-orange-500", border: "border-orange-500/30", bg: "bg-orange-500/5", label: "Médio",  labelCls: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
                          high: { dot: "bg-red-500",    border: "border-red-500/30",    bg: "bg-red-500/5",    label: "Alto",   labelCls: "bg-red-500/20 text-red-400 border-red-500/30" },
                        }[risk];
                        return (
                          <div key={bet.id} className={`flex items-center justify-between gap-4 rounded-lg border ${riskStyle.border} ${riskStyle.bg} p-4 flex-wrap`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full shrink-0 ${riskStyle.dot}`} title={`Risco ${riskStyle.label}`} />
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm font-bold">#{bet.id.slice(0,8).toUpperCase()}</span>
                                  <Badge variant="secondary">Pendente</Badge>
                                  <Badge className={riskStyle.labelCls}>Risco {riskStyle.label}</Badge>
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
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Apostado</p>
                                <p className="font-bold text-sm">R${bet.stake.toFixed(2)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">Retorno</p>
                                <p className={`font-bold text-sm ${risk === "low" ? "text-green-500" : risk === "mid" ? "text-orange-400" : "text-red-400"}`}>
                                  R${bet.potentialWin.toFixed(2)}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
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

              {/* Painel central — Caixa Diário R$50.000 */}
              <Card className={`border-2 ${
                limitsData?.isDailyLimitReached ? "border-red-500 bg-red-500/5" :
                (limitsData?.dailyTotal ?? 0) / 50000 >= 0.8 ? "border-yellow-500 bg-yellow-500/5" :
                "border-green-500/40 bg-green-500/5"
              }`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <Wallet className="w-7 h-7 text-primary" />
                      <div>
                        <p className="text-lg font-bold">Caixa Diário</p>
                        <p className="text-xs text-muted-foreground">Limite máximo de exposição: R$50.000,00</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {limitsData?.isDailyLimitReached ? (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-sm px-3 py-1">
                          <XCircle className="w-4 h-4 mr-1" /> LIMITE ATINGIDO
                        </Badge>
                      ) : (limitsData?.dailyTotal ?? 0) / 50000 >= 0.8 ? (
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-sm px-3 py-1">
                          <AlertCircle className="w-4 h-4 mr-1" /> ATENÇÃO
                        </Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-sm px-3 py-1">
                          <CheckCircle className="w-4 h-4 mr-1" /> OPERANDO
                        </Badge>
                      )}
                      <Button variant="outline" size="sm" onClick={() => refetchLimits()} data-testid="button-refresh-caixa">
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Barra de progresso principal */}
                  <div className="mb-3">
                    <Progress
                      value={Math.min(100, ((limitsData?.dailyTotal ?? 0) / 50000) * 100)}
                      className={`h-6 ${
                        limitsData?.isDailyLimitReached ? "[&>div]:bg-red-500" :
                        (limitsData?.dailyTotal ?? 0) / 50000 >= 0.8 ? "[&>div]:bg-yellow-500" :
                        "[&>div]:bg-green-500"
                      }`}
                      data-testid="progress-caixa-diario"
                    />
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-muted-foreground">
                      Usado: <span className="text-foreground font-bold">
                        R${(limitsData?.dailyTotal ?? 0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {(((limitsData?.dailyTotal ?? 0) / 50000) * 100).toFixed(1)}% de R$50.000,00
                    </span>
                    <span className="text-muted-foreground">
                      Disponível: <span className={`font-bold ${limitsData?.isDailyLimitReached ? "text-red-400" : "text-green-500"}`}>
                        R${(limitsData?.dailyRemaining ?? 50000).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Cards secundários */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <ArrowUpCircle className="w-5 h-5 mx-auto mb-1 text-green-500" />
                    <p className="text-xl font-bold text-green-500">
                      R${bets.filter(b=>b.verified).reduce((s,b)=>s+b.stake,0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </p>
                    <p className="text-xs text-muted-foreground">Entradas (PIX confirmados)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <ArrowDownCircle className="w-5 h-5 mx-auto mb-1 text-red-400" />
                    <p className="text-xl font-bold text-red-400">
                      R${bets.filter(b=>b.status==="won").reduce((s,b)=>s+b.potentialWin,0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </p>
                    <p className="text-xs text-muted-foreground">Saídas (prêmios pagos)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                    <p className="text-xl font-bold text-blue-500">
                      R${bets.filter(b=>b.status==="pending").reduce((s,b)=>s+b.potentialWin,0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </p>
                    <p className="text-xs text-muted-foreground">Exposição pendente</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Banknote className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
                    <p className={`text-xl font-bold ${
                      (bets.filter(b=>b.verified).reduce((s,b)=>s+b.stake,0) - bets.filter(b=>b.status==="won").reduce((s,b)=>s+b.potentialWin,0)) >= 0
                        ? "text-green-500" : "text-red-400"
                    }`}>
                      R${(bets.filter(b=>b.verified).reduce((s,b)=>s+b.stake,0) - bets.filter(b=>b.status==="won").reduce((s,b)=>s+b.potentialWin,0)).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </p>
                    <p className="text-xs text-muted-foreground">Saldo líquido</p>
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

          {/* ── FINANCEIRO ────────────────────────────────────── */}
          <TabsContent value="financeiro">
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <DollarSign className="w-6 h-6 mx-auto mb-1 text-primary" />
                    <p className="text-xl font-bold">R${bets.reduce((s,b)=>s+b.stake,0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</p>
                    <p className="text-xs text-muted-foreground">Total Apostado</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Trophy className="w-6 h-6 mx-auto mb-1 text-green-500" />
                    <p className="text-xl font-bold text-green-500">R${bets.filter(b=>b.status==="won").reduce((s,b)=>s+b.potentialWin,0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</p>
                    <p className="text-xs text-muted-foreground">Total Prêmios</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="w-6 h-6 mx-auto mb-1 text-blue-500" />
                    <p className="text-xl font-bold text-blue-500">R${bets.filter(b=>b.status==="pending").reduce((s,b)=>s+b.potentialWin,0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</p>
                    <p className="text-xs text-muted-foreground">Exposição Pendente</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Banknote className="w-6 h-6 mx-auto mb-1 text-yellow-500" />
                    <p className={`text-xl font-bold ${(bets.reduce((s,b)=>s+b.stake,0)-bets.filter(b=>b.status==="won").reduce((s,b)=>s+b.potentialWin,0))>=0?"text-green-500":"text-red-400"}`}>
                      R${(bets.reduce((s,b)=>s+b.stake,0)-bets.filter(b=>b.status==="won").reduce((s,b)=>s+b.potentialWin,0)).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </p>
                    <p className="text-xs text-muted-foreground">Lucro / Prejuízo</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-primary" />
                    Resumo por Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { label:"Pendentes", filter:(b:BetSlipType)=>b.status==="pending", color:"text-yellow-500", barColor:"bg-yellow-500" },
                      { label:"Ganhos", filter:(b:BetSlipType)=>b.status==="won", color:"text-green-500", barColor:"bg-green-500" },
                      { label:"Perdidos", filter:(b:BetSlipType)=>b.status==="lost", color:"text-red-400", barColor:"bg-red-400" },
                    ].map(({label,filter,color,barColor})=>{
                      const group = bets.filter(filter);
                      const totalStake = group.reduce((s,b)=>s+b.stake,0);
                      const pct = bets.length > 0 ? (group.length / bets.length) * 100 : 0;
                      return (
                        <div key={label}>
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-sm font-medium ${color}`}>{label}</span>
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span>{group.length} bilhete(s)</span>
                              <span>R${totalStake.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                              <span>{pct.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2.5">
                            <div className={`${barColor} h-2.5 rounded-full transition-all`} style={{width:`${pct}%`}} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Odds Médias</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-primary">
                        {bets.length > 0 ? (bets.reduce((s,b)=>s+b.totalOdds,0)/bets.length).toFixed(2) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">Odd Média Geral</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-500">
                        {bets.filter(b=>b.status==="won").length > 0
                          ? (bets.filter(b=>b.status==="won").reduce((s,b)=>s+b.totalOdds,0)/bets.filter(b=>b.status==="won").length).toFixed(2)
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">Odd Média (Ganhos)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="bilhetes">
          <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle>Bilhetes ({filteredBets.length})</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <SelectValue placeholder="Filtrar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="won">Ganhos</SelectItem>
                  <SelectItem value="lost">Perdidos</SelectItem>
                </SelectContent>
              </Select>
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
                    <Card key={bet.id} className="border border-border">
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
                            
                            <div className="space-y-2">
                              {bet.selections.map((sel, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm bg-muted/30 rounded p-2">
                                  <div className="flex-1">
                                    <span className="text-muted-foreground">{sel.homeTeam} vs {sel.awayTeam}</span>
                                    <span className="mx-2">-</span>
                                    <span className="font-medium">{sel.outcome}</span>
                                    <span className="text-primary ml-2">@{sel.odds.toFixed(2)}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="icon"
                                      variant={sel.result === "won" ? "default" : "ghost"}
                                      className={`h-7 w-7 ${sel.result === "won" ? "bg-green-600 hover:bg-green-700" : "hover:bg-green-600/20"} ${!bet.verified ? "opacity-40 cursor-not-allowed" : ""}`}
                                      onClick={() => updateSelectionMutation.mutate({ 
                                        betId: bet.id, 
                                        selectionId: sel.id, 
                                        result: sel.result === "won" ? "pending" : "won" 
                                      })}
                                      disabled={!bet.verified}
                                      data-testid={`button-sel-won-${sel.id}`}
                                    >
                                      <CheckCircle className={`w-4 h-4 ${sel.result === "won" ? "text-white" : "text-green-500"}`} />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant={sel.result === "lost" ? "default" : "ghost"}
                                      className={`h-7 w-7 ${sel.result === "lost" ? "bg-red-600 hover:bg-red-700" : "hover:bg-red-600/20"} ${!bet.verified ? "opacity-40 cursor-not-allowed" : ""}`}
                                      onClick={() => updateSelectionMutation.mutate({ 
                                        betId: bet.id, 
                                        selectionId: sel.id, 
                                        result: sel.result === "lost" ? "pending" : "lost" 
                                      })}
                                      disabled={!bet.verified}
                                      data-testid={`button-sel-lost-${sel.id}`}
                                    >
                                      <XCircle className={`w-4 h-4 ${sel.result === "lost" ? "text-white" : "text-red-500"}`} />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center gap-4 text-sm">
                              <span className="flex items-center gap-1">
                                <DollarSign className="w-4 h-4 text-muted-foreground" />
                                Aposta: <span className="font-bold">R$ {bet.stake.toFixed(2)}</span>
                              </span>
                              <span className="flex items-center gap-1">
                                <TrendingUp className="w-4 h-4 text-primary" />
                                Retorno: <span className="font-bold text-primary">R$ {bet.potentialWin.toFixed(2)}</span>
                              </span>
                              <span className="text-muted-foreground">
                                Odd: {bet.totalOdds.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
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
        </Tabs>
      </div>
    </div>
  );
}
