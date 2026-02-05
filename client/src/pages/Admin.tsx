import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BetSlip as BetSlipType } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
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
  Zap
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

type BetStatus = "pending" | "won" | "lost";

export default function Admin() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: bets = [], isLoading, refetch } = useQuery<BetSlipType[]>({
    queryKey: ["/api/admin/bets"],
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

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
              <ScrollArea className="max-h-[600px]">
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
                                      className={`h-7 w-7 ${sel.result === "won" ? "bg-green-600 hover:bg-green-700" : "hover:bg-green-600/20"}`}
                                      onClick={() => updateSelectionMutation.mutate({ 
                                        betId: bet.id, 
                                        selectionId: sel.id, 
                                        result: sel.result === "won" ? "pending" : "won" 
                                      })}
                                      data-testid={`button-sel-won-${sel.id}`}
                                    >
                                      <CheckCircle className={`w-4 h-4 ${sel.result === "won" ? "text-white" : "text-green-500"}`} />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant={sel.result === "lost" ? "default" : "ghost"}
                                      className={`h-7 w-7 ${sel.result === "lost" ? "bg-red-600 hover:bg-red-700" : "hover:bg-red-600/20"}`}
                                      onClick={() => updateSelectionMutation.mutate({ 
                                        betId: bet.id, 
                                        selectionId: sel.id, 
                                        result: sel.result === "lost" ? "pending" : "lost" 
                                      })}
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
                            >
                              <SelectTrigger className="w-32" data-testid={`select-status-${bet.id}`}>
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
      </div>
    </div>
  );
}
