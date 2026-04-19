import { useState } from "react";
import { BetSlip as BetSlipType, Selection } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, History, Receipt, Share2, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { translateMarket, formatOutcome } from "@/lib/marketLabels";
import { fmtOdds } from "@/lib/formatOdds";
import { useToast } from "@/hooks/use-toast";
import { checkIsComboBonus, getComboBonus } from "@shared/oddsUtils";
import { useMarketSettings } from "@/hooks/use-market-settings";

interface BetHistoryProps {
  bets: BetSlipType[];
  isLoading: boolean;
  onClose: () => void;
}

function BetCard({ bet }: { bet: BetSlipType }) {
  const { toast } = useToast();
  const { getBoostPercent } = useMarketSettings();
  const [expanded, setExpanded] = useState(false);
  const isCombo = checkIsComboBonus(bet.selections);
  const grouped: Record<string, Selection[]> = {};
  for (const sel of bet.selections) {
    const key = sel.gameId;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(sel);
  }
  const distinctGames = Object.keys(grouped);
  const firstGame = bet.selections[0];

  const shareBet = async () => {
    const gameGrouped: Record<string, Selection[]> = {};
    for (const sel of bet.selections) {
      const gameLabel = sel.awayTeam ? `${sel.homeTeam} vs ${sel.awayTeam}` : sel.homeTeam;
      if (!gameGrouped[gameLabel]) gameGrouped[gameLabel] = [];
      gameGrouped[gameLabel].push(sel);
    }
    const isCombo = checkIsComboBonus(bet.selections);
    const distinctGames = new Set(bet.selections.map(s => s.gameId)).size;
    const comboPct = isCombo ? getComboBonus(distinctGames) : 0;
    const baseReturn = isCombo
      ? bet.stake * bet.selections.reduce((acc, s) => acc * (s.originalOdds ?? s.odds), 1)
      : 0;
    const bonusPctStr = (comboPct * 100) % 1 === 0
      ? `${(comboPct * 100).toFixed(0)}%`
      : `${(comboPct * 100).toFixed(1)}%`;

    let lines = [`🎯 Bilhete FW Sports\n`];
    for (const [game, sels] of Object.entries(gameGrouped)) {
      lines.push(`⚽ ${game}`);
      for (const s of sels) {
        lines.push(`  • ${translateMarket(s.marketKey)}: ${formatOutcome(s.outcome, s.marketKey, s.homeTeam, s.awayTeam)}`);
      }
      lines.push("");
    }
    lines.push(`📊 Odds Total: ${fmtOdds(bet.totalOdds)}`);
    lines.push(`💰 Apostado: R$ ${bet.stake.toFixed(2)}`);
    const isSingleH2H = bet.selections.length === 1 &&
      (bet.selections[0].marketKey === "h2h" || bet.selections[0].marketKey === "match_winner");
    const superPct = isSingleH2H ? getBoostPercent("h2h") : 0;
    const superBase = isSingleH2H && bet.selections[0]?.originalOdds
      ? bet.stake * bet.selections[0].originalOdds : 0;
    if (isSingleH2H && superPct > 0 && superBase > 0) {
      lines.push(`⚡ SUPER AUMENTADA +${superPct}%`);
      lines.push(`  Odd normal: R$ ${superBase.toFixed(2)}`);
      lines.push(`  Super Aumentada: R$ ${bet.potentialWin.toFixed(2)}`);
    }
    if (isCombo && comboPct > 0) {
      lines.push(`⚡ BÔNUS COMBINADA +${bonusPctStr} (${distinctGames} jogos)`);
      lines.push(`  Sem bônus: R$ ${baseReturn.toFixed(2)}`);
      lines.push(`  Com bônus: R$ ${bet.potentialWin.toFixed(2)}`);
    }
    lines.push(`🏆 Retorno: R$ ${bet.potentialWin.toFixed(2)}`);
    lines.push(`📋 ID: #${bet.id.slice(0, 8).toUpperCase()}`);
    lines.push(`📅 Data: ${format(new Date(bet.createdAt), "dd/MM • HH:mm", { locale: ptBR })}`);
    lines.push(`\n📱 FW SPORTS`);
    lines.push(`Caso sua aposta seja vencedora, entraremos em contato para informar o pagamento. Boa sorte!`);
    const shareText = lines.join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: "Bilhete FW Sports", text: shareText });
      } catch (err) {}
    } else {
      navigator.clipboard.writeText(shareText);
      toast({ title: "Bilhete copiado!", description: "Cole onde quiser para compartilhar." });
    }
  };

  const statusConfig = {
    won:     { label: "Ganhou",       icon: <CheckCircle2 className="w-3.5 h-3.5" />, cls: "bg-green-500/15 text-green-400 border-green-500/40" },
    lost:    { label: "Perdeu",       icon: <XCircle className="w-3.5 h-3.5" />,      cls: "bg-red-500/15 text-red-400 border-red-500/40" },
    pending: { label: "Em Andamento", icon: <Clock className="w-3.5 h-3.5" />,        cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40" },
  };
  const st = statusConfig[(bet.status as keyof typeof statusConfig)] ?? statusConfig.pending;

  return (
    <div data-testid={`bet-history-item-${bet.id}`} className="rounded-xl border overflow-hidden"
      style={{ borderColor: bet.status === "won" ? "rgba(34,197,94,0.35)" : bet.status === "lost" ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.1)" }}>

      {/* ── Preview (sempre visível) ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
        data-testid={`button-expand-bet-${bet.id}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* status dot */}
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${bet.status === "won" ? "bg-green-400" : bet.status === "lost" ? "bg-red-400" : "bg-yellow-400"}`} />
          <div className="min-w-0">
            <p className={`font-mono text-sm font-bold leading-none ${bet.status === "won" ? "text-green-400" : bet.status === "lost" ? "text-red-400" : "text-primary"}`} data-testid={`text-bet-id-${bet.id}`}>
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
              <span className="text-yellow-400 font-bold text-xs">R$ {bet.potentialWin.toFixed(2).replace(".", ",")}</span>
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
              const gameOdds = fmtOdds(sels.reduce((a, s) => a * (isCombo ? (s.originalOdds ?? s.odds) : s.odds), 1));
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
                      <div className="absolute left-[5px] top-[6px] w-[2px] bg-yellow-400"
                        style={{ height: sels.length > 1 ? `calc(100% - 12px)` : "0px" }} />
                      {sels.map((sel, idx) => (
                        <div key={sel.id} className={idx > 0 ? "mt-4" : ""}>
                          <div className="flex items-center justify-between relative">
                            <div>
                              <div className="flex items-center gap-0 relative">
                                <div className="absolute -left-5 w-3 h-3 rounded-full bg-yellow-400 border-2 border-muted z-10" />
                                <span className="text-muted-foreground text-xs">{translateMarket(sel.marketKey)}</span>
                              </div>
                              <p className="text-foreground font-semibold text-sm mt-0.5">{formatOutcome(sel.outcome, sel.marketKey, sel.homeTeam, sel.awayTeam)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl bg-muted border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-muted-foreground text-sm">Odds total</span>
              <span className="text-foreground font-bold">{fmtOdds(bet.totalOdds)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <span className="text-muted-foreground text-sm">Valor Apostado</span>
              <span className="text-foreground font-medium">R$ {bet.stake.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-muted-foreground text-sm">
                {bet.status === "won" ? "Retorno ganho" : bet.status === "lost" ? "Retorno perdido" : "Retorno potencial"}
              </span>
              <span className={`font-bold ${bet.status === "won" ? "text-green-400" : bet.status === "lost" ? "text-red-400 line-through opacity-60" : "text-yellow-400"}`}>
                R$ {bet.potentialWin.toFixed(2)}
              </span>
            </div>
          </div>

          <Button className="w-full bg-green-600 text-white hover:bg-green-700" onClick={shareBet} data-testid={`button-share-history-${bet.id}`}>
            <Share2 className="w-4 h-4 mr-2" />
            Compartilhar Bilhete
          </Button>
        </div>
      )}
    </div>
  );
}

export function BetHistory({ bets, isLoading, onClose }: BetHistoryProps) {
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
                  <BetCard key={bet.id} bet={bet} />
                ))}
              </div>
            )}
          </CardContent>
        </div>
      </Card>
    </>
  );
}
