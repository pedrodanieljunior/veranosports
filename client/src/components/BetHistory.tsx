import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BetSlip as BetSlipType, Selection } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, History, Receipt, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp, Banknote, CircleDollarSign, Check, Hourglass } from "lucide-react";
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
    ? getCashOutState(bet as any, new Date(), cashOutPct, earlyExitPct)
    : { type: "none" as const };

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
      toast({ title: "Cash out realizado!", description: `R$ ${val} creditados na sua conta.` });
      setConfirming(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro no cash out", description: err?.message || "Tente novamente.", variant: "destructive" });
      setConfirming(null);
    },
  });

  const statusConfig = {
    won:        { label: "Ganhou",       icon: <CheckCircle2 className="w-3.5 h-3.5" />, cls: "bg-green-500/15 text-green-400 border-green-500/40" },
    lost:       { label: "Perdeu",       icon: <XCircle className="w-3.5 h-3.5" />,      cls: "bg-red-500/15 text-red-400 border-red-500/40" },
    pending:    { label: "Em Andamento", icon: <Clock className="w-3.5 h-3.5" />,        cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40" },
    anulado:    { label: "Anulado",      icon: <XCircle className="w-3.5 h-3.5" />,      cls: "bg-gray-500/15 text-gray-400 border-gray-500/40" },
    cashed_out: { label: "Cash Out",     icon: <Banknote className="w-3.5 h-3.5" />,     cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  };
  const st = statusConfig[(bet.status as keyof typeof statusConfig)] ?? statusConfig.pending;

  return (
    <div data-testid={`bet-history-item-${bet.id}`} className="rounded-xl border overflow-hidden"
      style={{ borderColor: bet.status === "won" ? "rgba(34,197,94,0.35)" : bet.status === "lost" ? "rgba(239,68,68,0.25)" : bet.status === "anulado" ? "rgba(156,163,175,0.25)" : bet.status === "cashed_out" ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.1)" }}>

      {/* ── Preview (sempre visível) ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
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
      </button>

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
                        const dotColor = selResult === "won" ? "bg-green-400 border-green-500" : selResult === "lost" ? "bg-red-400 border-red-500" : "bg-yellow-400 border-yellow-500";
                        return (
                          <div key={sel.id} className={idx > 0 ? "mt-4" : ""}>
                            <div className="flex items-center justify-between relative gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-0 relative">
                                  <div className={`absolute -left-5 w-3 h-3 rounded-full border-2 border-muted z-10 ${dotColor}`} />
                                  <span className="text-muted-foreground text-xs">{translateMarket(sel.marketKey)}</span>
                                </div>
                                <p className={`font-semibold text-sm mt-0.5 ${selResult === "lost" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                  {formatOutcome(sel.outcome, sel.marketKey, sel.homeTeam, sel.awayTeam)}
                                </p>
                              </div>
                              <div className="flex-shrink-0">
                                {selResult === "won" && <Check className="w-4 h-4 text-green-400" />}
                                {selResult === "lost" && <X className="w-4 h-4 text-red-400" />}
                                {(!selResult || selResult === "pending") && <Hourglass className="w-3.5 h-3.5 text-yellow-400/40" />}
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
                {bet.status === "won" ? "Retorno ganho" : bet.status === "lost" ? "Retorno perdido" : bet.status === "anulado" ? "Valor devolvido" : bet.status === "cashed_out" ? "Cash Out recebido" : "Retorno potencial"}
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
            if (cashState.type === "ea") {
              return confirming === "ea" ? (
                <div className="flex gap-2">
                  <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => cashOutMutation.mutate("ea")} disabled={cashOutMutation.isPending} data-testid={`button-ea-confirm-${bet.id}`}>
                    {cashOutMutation.isPending ? "Processando..." : `Confirmar — R$ ${cashState.offer.toFixed(2).replace(".", ",")}`}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(null)} data-testid={`button-ea-cancel-${bet.id}`}>Cancelar</Button>
                </div>
              ) : (
                <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white" onClick={() => setConfirming("ea")} data-testid={`button-ea-${bet.id}`}>
                  <CircleDollarSign className="w-4 h-4 mr-2" />
                  Encerrar Aposta — R$ {cashState.offer.toFixed(2).replace(".", ",")}
                </Button>
              );
            }
            if (cashState.type === "unavailable") {
              return (
                <Button variant="outline" disabled className="w-full border-gray-500/40 text-gray-400 opacity-60">
                  Cash out indisponível
                </Button>
              );
            }
            if (cashState.type === "cashout") {
              return confirming === "cashout" ? (
                <div className="flex gap-2">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => cashOutMutation.mutate("cashout")} disabled={cashOutMutation.isPending} data-testid={`button-cashout-confirm-${bet.id}`}>
                    {cashOutMutation.isPending ? "Processando..." : `Confirmar — R$ ${cashState.offer.toFixed(2).replace(".", ",")}`}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(null)} data-testid={`button-cashout-cancel-${bet.id}`}>Cancelar</Button>
                </div>
              ) : (
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setConfirming("cashout")} data-testid={`button-cashout-${bet.id}`}>
                  💰 Cash Out — R$ {cashState.offer.toFixed(2).replace(".", ",")}
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
  const { data: cashoutSettings } = useQuery<{ earlyExitPct: number; cashOutPct: number }>({
    queryKey: ["/api/cashout-settings"],
    staleTime: 5 * 60 * 1000,
  });
  const earlyExitPct = cashoutSettings?.earlyExitPct ?? 20;
  const cashOutPct = cashoutSettings?.cashOutPct ?? 20;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[9998] md:hidden" onClick={onClose} />
      <Card className="fixed bottom-0 left-0 right-0 h-[92vh] rounded-t-2xl md:rounded-lg md:bottom-4 md:left-auto md:right-4 md:top-20 md:w-96 md:h-auto z-[9999] flex flex-col shadow-xl">
        <div className="flex justify-center pt-2 pb-1 md:hidden flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        <CardHeader className="border-b border-card-border flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Apostas</CardTitle>
            </div>
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-history">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <CardContent className="p-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : bets.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-8">
                <Receipt className="w-16 h-16 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">
                  Nenhum bilhete gerado ainda
                </p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Selecione odds e gere seu primeiro bilhete
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {bets.map((bet) => (
                  <BetCard key={bet.id} bet={bet} earlyExitPct={earlyExitPct} cashOutPct={cashOutPct} />
                ))}
              </div>
            )}
          </CardContent>
        </div>
      </Card>
    </>
  );
}
