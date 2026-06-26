import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BetSlip as BetSlipType, Selection } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, History, Receipt, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp, Banknote, CircleDollarSign, Check, Timer, ArrowRight, Info, Trophy, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { translateMarket, formatOutcome } from "@/lib/marketLabels";
import { fmtOdds } from "@/lib/formatOdds";
import { useToast } from "@/hooks/use-toast";
import { checkIsComboBonus, getComboBonus, computeTotalOdds } from "@shared/oddsUtils";
import { getCashOutState } from "@shared/cashOutUtils";
import { queryClient } from "@/lib/queryClient";

interface BetHistoryProps {
  bets: BetSlipType[];
  isLoading: boolean;
  onClose: () => void;
}

function BetCard({ bet, earlyExitPct, cashOutPct }: { bet: BetSlipType; earlyExitPct: number; cashOutPct: number }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState<"ea" | "cashout" | null>(null);
  const isCombo = checkIsComboBonus(bet.selections);
  const grouped: Record<string, Selection[]> = {};
  for (const sel of bet.selections) {
    const key = sel.gameId;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(sel);
  }
  const distinctGames = Object.keys(grouped);
  const firstGame = bet.selections[0];
  const distinctGameCount = new Set(bet.selections.map(s => s.gameId)).size;
  const comboPct = isCombo ? getComboBonus(distinctGameCount) : 0;
  // Always compute odds from selections (correct for multi-market h2h originalOdds, combo, single boost)
  const baseOdds = computeTotalOdds(bet.selections);
  const displayTotalOdds = isCombo
    ? Math.floor(baseOdds * (1 + comboPct) * 100) / 100
    : baseOdds;
  const displayPotentialWin = Math.round(bet.stake * displayTotalOdds * 100) / 100;
  const bonusUsed = bet.bonusUsed ?? 0;
  const netReturn = bonusUsed > 0 ? Math.max(0, displayPotentialWin - bonusUsed) : displayPotentialWin;
  const comboBonusPctStr = (comboPct * 100) % 1 === 0
    ? `${(comboPct * 100).toFixed(0)}%`
    : `${(comboPct * 100).toFixed(1)}%`;

  const cashState = bet.userId
    ? getCashOutState({ ...bet, potentialWin: displayPotentialWin } as any, new Date(), cashOutPct, earlyExitPct)
    : { type: "none" as const };

  // Regra de bônus: se bonusUsed > 0, cashout só é permitido quando o valor supera o bônus usado
  const effectiveCashState: typeof cashState = (() => {
    if (bonusUsed <= 0) return cashState;
    if (cashState.type === "ea") return { type: "unavailable" };
    if (cashState.type === "cashout" && cashState.offer <= bonusUsed) return { type: "unavailable" };
    return cashState;
  })();

  const cashOutMutation = useMutation({
    mutationFn: async (type: "ea" | "cashout") => {
      const res = await fetch(`/api/bets/${bet.id}/cashout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Erro no cash out");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      // Update cache directly for instant UI feedback
      const updateBet = (old: BetSlipType[] | undefined) => {
        if (!old) return old;
        return old.map(b => b.id === bet.id
          ? { ...b, status: "cashed_out" as const, cashOutValue: data.cashOutValue ?? null }
          : b
        );
      };
      queryClient.setQueryData(["/api/bets", bet.userId], updateBet);
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
      const val = typeof data?.cashOutValue === "number"
        ? data.cashOutValue.toFixed(2).replace(".", ",")
        : "?";
      toast({ title: "Cashout realizado!", description: `R$ ${val} creditados na sua conta.` });
      setConfirming(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro no cashout", description: err?.message || "Tente novamente.", variant: "destructive" });
      setConfirming(null);
    },
  });

  const statusConfig = {
    won:        { label: "Ganhou",       icon: <CheckCircle2 className="w-3.5 h-3.5" />, cls: "bg-green-500/15 text-green-400 border-green-500/40" },
    lost:       { label: "Perdeu",       icon: <XCircle className="w-3.5 h-3.5" />,      cls: "bg-red-500/15 text-red-400 border-red-500/40" },
    pending:    { label: "Em Andamento", icon: <Clock className="w-3.5 h-3.5" />,        cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40" },
    anulado:    { label: "Anulado",      icon: <XCircle className="w-3.5 h-3.5" />,      cls: "bg-gray-500/15 text-gray-400 border-gray-500/40" },
    cashed_out: { label: "Cashout",     icon: <Banknote className="w-3.5 h-3.5" />,     cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  };
  const st = statusConfig[(bet.status as keyof typeof statusConfig)] ?? statusConfig.pending;

  return (
    <div data-testid={`bet-history-item-${bet.id}`} className="rounded-xl border overflow-hidden"
      style={{ borderColor: bet.status === "won" ? "rgba(34,197,94,0.35)" : bet.status === "lost" ? "rgba(239,68,68,0.25)" : bet.status === "anulado" ? "rgba(156,163,175,0.25)" : bet.status === "cashed_out" ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.1)" }}>

      {/* ── Preview (sempre visível) ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={e => e.key === "Enter" && setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer"
        data-testid={`button-expand-bet-${bet.id}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* status dot */}
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${bet.status === "won" ? "bg-green-400" : bet.status === "lost" ? "bg-red-400" : bet.status === "anulado" ? "bg-gray-400" : bet.status === "cashed_out" ? "bg-emerald-400" : "bg-yellow-400"}`} />
          <div className="min-w-0">
            <p className={`font-mono text-sm font-bold leading-none ${bet.status === "won" ? "text-green-400" : bet.status === "lost" ? "text-red-400" : bet.status === "anulado" ? "text-gray-400" : bet.status === "cashed_out" ? "text-emerald-400" : "text-primary"}`} data-testid={`text-bet-id-${bet.id}`}>
              #{bet.id.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[160px]">
              {distinctGames.length > 1
                ? `${distinctGames.length} jogos`
                : firstGame ? `${firstGame.homeTeam}${firstGame.awayTeam ? ` vs ${firstGame.awayTeam}` : ""}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{format(new Date(bet.createdAt), "dd/MM • HH:mm", { locale: ptBR })}</p>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${st.cls}`}>
                {st.icon}{st.label}
              </span>
              <span className={`font-bold text-xs ${bet.status === "cashed_out" ? "text-emerald-400" : "text-yellow-400"}`}>
                R$ {bet.status === "cashed_out" && (bet as any).cashOutValue != null
                  ? ((bet as any).cashOutValue as number).toFixed(2).replace(".", ",")
                  : netReturn.toFixed(2).replace(".", ",")}
              </span>
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* ── Faixa de cash out (preview, fora do botão expand) ── */}
      {bet.status === "pending" && (effectiveCashState.type === "ea" || effectiveCashState.type === "cashout" || effectiveCashState.type === "unavailable") && (
        <div className="px-4 pb-2.5 -mt-1">
          {effectiveCashState.type === "unavailable" ? (
            <div className="w-full flex flex-col gap-1">
              <div className="w-full inline-flex items-center justify-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-400 border border-gray-500/25 opacity-70 cursor-not-allowed">
                <span>Cashout indisponível</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 px-1 min-w-0">
                <Info className="w-3 h-3 text-gray-500 flex-shrink-0" />
                <span className="text-[10px] text-gray-500 whitespace-nowrap truncate">Jogos em andamento. Cashout disponível ao finalizar.</span>
              </div>
            </div>
          ) : confirming === effectiveCashState.type ? (
            <div className="flex gap-2">
              <button
                onClick={e => { e.stopPropagation(); cashOutMutation.mutate(effectiveCashState.type as "ea" | "cashout"); }}
                disabled={cashOutMutation.isPending}
                data-testid={`button-preview-cashout-confirm-${bet.id}`}
                className="flex-1 inline-flex items-center justify-center gap-3 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
              >
                {cashOutMutation.isPending ? (
                  "Processando..."
                ) : (
                  <>
                    <span>Confirmar</span>
                    <span>R$ {(effectiveCashState as any).offer?.toFixed(2).replace(".", ",")}</span>
                  </>
                )}
              </button>
              <button
                onClick={e => { e.stopPropagation(); setConfirming(null); }}
                data-testid={`button-preview-cashout-cancel-${bet.id}`}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-muted-foreground hover:bg-white/10 transition-colors border border-white/10"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setConfirming(effectiveCashState.type as "ea" | "cashout"); }}
              data-testid={`button-preview-cashout-${bet.id}`}
              className="w-full inline-flex items-center justify-center gap-3 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 hover:bg-emerald-500/25 transition-colors"
            >
              <span>{effectiveCashState.type === "ea" ? "Encerrar Aposta" : "Cashout"}</span>
              <span>R$ {(effectiveCashState as any).offer?.toFixed(2).replace(".", ",")}</span>
            </button>
          )}
        </div>
      )}

      {/* ── Detalhe expandido ── */}
      {expanded && (
        <div className="border-t border-white/10 px-4 pb-4 pt-3 space-y-3 bg-muted/30">
          <div className="space-y-3">
            {Object.entries(grouped).map(([gameId, sels]) => {
              const first = sels[0];
              const gameOdds = fmtOdds(computeTotalOdds(sels, isCombo));
              return (
                <div key={gameId} className="rounded-xl bg-muted border border-border overflow-hidden" data-testid={`card-history-game-${gameId}`}>
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/60 border-b border-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">⚽</span>
                      <span className="font-semibold text-foreground text-sm truncate">
                        {first.homeTeam}{first.awayTeam ? ` vs ${first.awayTeam}` : ""}
                      </span>
                    </div>
                    <span className="text-yellow-400 font-bold text-sm flex-shrink-0 ml-2">{gameOdds}</span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="relative pl-5">
                      <div className="absolute left-[5px] top-[6px] w-[2px] bg-border"
                        style={{ height: sels.length > 1 ? `calc(100% - 12px)` : "0px" }} />
                      {sels.map((sel, idx) => {
                        const selResult = (sel as any).result as "pending" | "won" | "lost" | undefined;
                        return (
                          <div key={sel.id} className={idx > 0 ? "mt-4" : ""}>
                            <div className="flex items-center justify-between relative gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-0 relative">
                                  <div className="absolute -left-5 z-10 flex items-center justify-center w-4 h-4 -translate-x-0.5">
                                    {selResult === "won"
                                      ? <Check className="w-3.5 h-3.5 text-green-400" />
                                      : selResult === "lost"
                                      ? <X className="w-3.5 h-3.5 text-red-400" />
                                      : <Timer className="w-3 h-3 text-yellow-400/50" />}
                                  </div>
                                  <span className="text-muted-foreground text-xs">{translateMarket(sel.marketKey)}</span>
                                </div>
                                <p className={`font-semibold text-sm mt-0.5 ${selResult === "lost" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                  {formatOutcome(sel.outcome, sel.marketKey, sel.homeTeam, sel.awayTeam)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl bg-muted border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-muted-foreground text-sm">Odds total</span>
              <span className="text-foreground font-bold">{fmtOdds(baseOdds)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <span className="text-muted-foreground text-sm">Valor Apostado</span>
              <span className="text-foreground font-medium">R$ {bet.stake.toFixed(2)}</span>
            </div>
            {isCombo && comboPct > 0 && (() => {
              const displayedBaseOdds = Math.round(baseOdds * 100) / 100;
              const bonusAmt = (displayPotentialWin - bet.stake * displayedBaseOdds).toFixed(2);
              return (
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <span className="text-green-400 text-sm">⚡ Bônus Combinada (+{comboBonusPctStr})</span>
                  <span className="text-green-400 font-medium">+R$ {bonusAmt}</span>
                </div>
              );
            })()}
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-muted-foreground text-sm">
                {bet.status === "won" ? "Retorno ganho" : bet.status === "lost" ? "Retorno perdido" : bet.status === "anulado" ? "Valor devolvido" : bet.status === "cashed_out" ? "Cashout recebido" : "Retorno potencial"}
              </span>
              <div className="text-right">
                {bet.status === "cashed_out" && (bet as any).cashOutValue != null ? (
                  <>
                    <span className="font-bold text-emerald-400">R$ {((bet as any).cashOutValue as number).toFixed(2)}</span>
                    <p className="text-[10px] text-muted-foreground line-through opacity-60 mt-0.5">R$ {netReturn.toFixed(2)} potencial</p>
                  </>
                ) : (
                  <>
                    <span className={`font-bold ${bet.status === "won" ? "text-green-400" : bet.status === "lost" ? "text-red-400 line-through opacity-60" : bet.status === "anulado" ? "text-gray-400" : "text-yellow-400"}`}>
                      R$ {netReturn.toFixed(2)}
                    </span>
                    {bonusUsed > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        R$ {displayPotentialWin.toFixed(2)} − R$ {bonusUsed.toFixed(2)} bônus
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {bet.status === "pending" && (() => {
            if (effectiveCashState.type === "ea") {
              return confirming === "ea" ? (
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white inline-flex justify-center gap-3" onClick={() => cashOutMutation.mutate("ea")} disabled={cashOutMutation.isPending} data-testid={`button-ea-confirm-${bet.id}`}>
                    {cashOutMutation.isPending ? "Processando..." : <><span>Confirmar</span><span>R$ {effectiveCashState.offer.toFixed(2).replace(".", ",")}</span></>}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(null)} data-testid={`button-ea-cancel-${bet.id}`}>Cancelar</Button>
                </div>
              ) : (
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white inline-flex justify-center gap-3" onClick={() => setConfirming("ea")} data-testid={`button-ea-${bet.id}`}>
                  <span>Encerrar Aposta</span>
                  <span>R$ {effectiveCashState.offer.toFixed(2).replace(".", ",")}</span>
                </Button>
              );
            }
            if (effectiveCashState.type === "unavailable") {
              return (
                <div className="flex flex-col gap-1">
                  <Button variant="outline" disabled className="w-full border-gray-500/40 text-gray-400 opacity-60">
                    Cashout indisponível
                  </Button>
                  <div className="flex items-center justify-center gap-1.5 px-1">
                    <Info className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span className="text-[10px] text-gray-500 whitespace-nowrap truncate">Jogos em andamento. Cashout disponível ao finalizar.</span>
                  </div>
                </div>
              );
            }
            if (effectiveCashState.type === "cashout") {
              return confirming === "cashout" ? (
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white inline-flex justify-center gap-3" onClick={() => cashOutMutation.mutate("cashout")} disabled={cashOutMutation.isPending} data-testid={`button-cashout-confirm-${bet.id}`}>
                    {cashOutMutation.isPending ? "Processando..." : <><span>Confirmar</span><span>R$ {effectiveCashState.offer.toFixed(2).replace(".", ",")}</span></>}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(null)} data-testid={`button-cashout-cancel-${bet.id}`}>Cancelar</Button>
                </div>
              ) : (
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white inline-flex justify-center gap-3" onClick={() => setConfirming("cashout")} data-testid={`button-cashout-${bet.id}`}>
                  <span>Cashout</span>
                  <span>R$ {effectiveCashState.offer.toFixed(2).replace(".", ",")}</span>
                </Button>
              );
            }
            return null;
          })()}
        </div>
      )}
    </div>
  );
}

export function BetHistory({ bets, isLoading, onClose }: BetHistoryProps) {
  const [activeTab, setActiveTab] = useState<"apostas" | "bolao">("apostas");
  const [palpites, setPalpites] = useState<any[]>([]);
  const [palpitesLoading, setPalpitesLoading] = useState(true);
  const [duelos, setDuelos] = useState<any[]>([]);
  const [duelosLoading, setDuelosLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchPalpites = () => {
    setPalpitesLoading(true);
    setDuelosLoading(true);
    Promise.all([
      fetch("/api/bolao/my-entries", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/duelo/my-entries", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([bolaoData, dueloData]) => {
      const b = Array.isArray(bolaoData) ? bolaoData : [];
      const d = Array.isArray(dueloData) ? dueloData : [];
      setPalpites(b);
      setDuelos(d);
      if (b.length > 0 || d.length > 0) setActiveTab("bolao");
    }).catch(() => {}).finally(() => {
      setPalpitesLoading(false);
      setDuelosLoading(false);
    });
  };

  useEffect(() => { fetchPalpites(); }, []);

  const { data: cashoutSettings } = useQuery<{ earlyExitPct: number; cashOutPct: number }>({
    queryKey: ["/api/cashout-settings"],
    staleTime: 5 * 60 * 1000,
  });
  const earlyExitPct = cashoutSettings?.earlyExitPct ?? 20;
  const cashOutPct = cashoutSettings?.cashOutPct ?? 20;

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch { return d; }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[9998] md:hidden" onClick={onClose} />
      <Card className="fixed bottom-0 left-0 right-0 h-[92vh] rounded-t-2xl md:rounded-lg md:bottom-4 md:left-auto md:right-4 md:top-20 md:w-96 md:h-auto z-[9999] flex flex-col shadow-xl">
        <div className="flex justify-center pt-2 pb-1 md:hidden flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        <CardHeader className="border-b border-card-border flex-shrink-0 pb-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Apostas</CardTitle>
            </div>
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-history">
              <X className="w-4 h-4" />
            </Button>
          </div>
          {/* Abas */}
          <div className="flex gap-0 -mx-6 border-t border-border">
            <button
              onClick={() => setActiveTab("apostas")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors border-b-2"
              style={{
                borderColor: activeTab === "apostas" ? "hsl(var(--primary))" : "transparent",
                color: activeTab === "apostas" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              }}
              data-testid="tab-apostas-history"
            >
              <Receipt className="w-3.5 h-3.5" />
              Histórico
            </button>
            <button
              onClick={() => setActiveTab("bolao")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors border-b-2"
              style={{
                borderColor: activeTab === "bolao" ? "#f59e0b" : "transparent",
                color: activeTab === "bolao" ? "#f59e0b" : "hsl(var(--muted-foreground))",
              }}
              data-testid="tab-bolao-history"
            >
              <Trophy className="w-3.5 h-3.5" />
              Meus Palpites
            </button>
          </div>
        </CardHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <CardContent className="p-4">
            {/* ── Aba Histórico ── */}
            {activeTab === "apostas" && (
              isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-xl" />
                  ))}
                </div>
              ) : bets.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-8">
                  <Receipt className="w-16 h-16 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Nenhum bilhete gerado ainda</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Selecione odds e gere seu primeiro bilhete</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {bets.map((bet) => (
                    <BetCard key={bet.id} bet={bet} earlyExitPct={earlyExitPct} cashOutPct={cashOutPct} />
                  ))}
                </div>
              )
            )}

            {/* ── Aba Meus Palpites (bolão + duelos) ── */}
            {activeTab === "bolao" && (
              (palpitesLoading || duelosLoading) ? (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
                  <div className="w-4 h-4 border-2 border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
                  Carregando...
                </div>
              ) : (palpites.length === 0 && duelos.length === 0) ? (
                <div className="flex flex-col items-center justify-center text-center py-8">
                  <Trophy className="w-16 h-16 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Nenhum palpite registrado ainda</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Participe de um bolão ou duelo para ver seus palpites aqui</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Botão limpar histórico de bolões */}
                  {palpites.length > 0 && (
                    <div className="flex justify-end mb-1">
                      {confirmDelete ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Tem certeza?</span>
                          <button
                            onClick={async () => {
                              setDeleting(true);
                              const res = await fetch("/api/bolao/my-entries", { method: "DELETE", credentials: "include" });
                              if (res.ok) {
                                const updated = await fetch("/api/bolao/my-entries", { credentials: "include" });
                                const data = updated.ok ? await updated.json() : [];
                                setPalpites(data);
                                if (data.length === 0 && duelos.length === 0) setActiveTab("apostas");
                              }
                              setConfirmDelete(false);
                              setDeleting(false);
                            }}
                            disabled={deleting}
                            className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                          >
                            {deleting ? "..." : "Sim, limpar"}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(false)}
                            className="text-xs px-2 py-0.5 rounded bg-muted/40 text-muted-foreground hover:bg-muted/60 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(true)}
                          className="text-xs text-muted-foreground/60 hover:text-red-400 transition-colors flex items-center gap-1"
                          data-testid="button-clear-palpites"
                        >
                          <Trash2 className="w-3 h-3" />
                          Limpar palpites
                        </button>
                      )}
                    </div>
                  )}

                  {/* Todas as entradas misturadas por data (mais recente primeiro) */}
                  {[
                    ...palpites.map((e: any) => ({ ...e, _kind: "bolao" })),
                    ...duelos.map((e: any) => ({ ...e, _kind: "duelo" })),
                  ]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((entry: any) => {
                      const isWon = entry.status === "won";
                      const isLost = entry.status === "lost";

                      if (entry._kind === "bolao") {
                        return (
                          <div
                            key={`bolao-${entry.id}`}
                            className="rounded-xl border overflow-hidden"
                            style={{ borderColor: isWon ? "rgba(34,197,94,0.35)" : isLost ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.1)" }}
                          >
                            <div className="flex items-center gap-3 px-4 py-3">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isWon ? "bg-green-400" : isLost ? "bg-red-400" : entry.bolaoStatus === "closed" ? "bg-orange-400" : "bg-yellow-400"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{entry.homeTeam} × {entry.awayTeam}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(entry.matchDate)}</p>
                                {entry.bolaoStatus === "finished" && entry.actualHomeScore !== null && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">Placar final: {entry.actualHomeScore}–{entry.actualAwayScore}</p>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="flex items-center gap-1.5 justify-end">
                                  <span className="text-xs text-muted-foreground">Palpite:</span>
                                  <span className={`font-black text-sm tabular-nums ${isWon ? "text-green-400" : isLost ? "text-red-400" : "text-yellow-400"}`}>
                                    {entry.myHomeScore}–{entry.myAwayScore}
                                  </span>
                                </div>
                                <div className={`text-[11px] mt-0.5 font-medium ${isWon ? "text-green-400" : isLost ? "text-red-400" : entry.bolaoStatus === "closed" ? "text-orange-400" : "text-yellow-400/70"}`}>
                                  {isWon ? "✓ Acertou!" : isLost ? "✗ Errou" : entry.bolaoStatus === "closed" ? "Jogo em breve" : "Aguardando"}
                                </div>
                                {isWon && entry.prizeAmount != null && (
                                  <div className="text-[11px] mt-0.5 font-bold text-green-300">
                                    + R${entry.prizeAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Duelo card
                      const sideColor = entry.mySide === "A" ? "#ef4444" : "#3b82f6";
                      return (
                        <div
                          key={`duelo-${entry.id}`}
                          className="rounded-xl border overflow-hidden"
                          style={{ borderColor: isWon ? "rgba(34,197,94,0.35)" : isLost ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.1)" }}
                          data-testid={`duelo-history-${entry.id}`}
                        >
                          <div className="flex items-start gap-3 px-4 py-3">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${isWon ? "bg-green-400" : isLost ? "bg-red-400" : "bg-yellow-400"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-0.5">Duelo</p>
                              <p className="text-xs text-muted-foreground truncate">{entry.title}</p>
                              <p className="text-sm font-semibold mt-0.5" style={{ color: sideColor }}>{entry.myOption}</p>
                              {entry.dueloStatus === "finished" && entry.winnerOption && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">Vencedor: {entry.winnerOption}</p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className={`text-xs font-semibold ${isWon ? "text-green-400" : isLost ? "text-red-400" : "text-yellow-400"}`}>
                                {isWon ? "✓ Ganhou!" : isLost ? "✗ Perdeu" : "Aguardando"}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                − R$ {(entry.entryFee ?? 10).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </div>
                              {isWon && entry.prizeAmount != null && (
                                <div className="text-[11px] mt-0.5 font-bold text-green-300">
                                  + R$ {entry.prizeAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )
            )}
          </CardContent>
        </div>
      </Card>
    </>
  );
}
