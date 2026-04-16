import { BetSlip as BetSlipType, Selection } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, History, Receipt, Share2 } from "lucide-react";
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
  const grouped: Record<string, Selection[]> = {};
  for (const sel of bet.selections) {
    const key = sel.gameId;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(sel);
  }

  const shareBet = async () => {
    const gameGrouped: Record<string, Selection[]> = {};
    for (const sel of bet.selections) {
      const gameLabel = sel.awayTeam ? `${sel.homeTeam} vs ${sel.awayTeam}` : sel.homeTeam;
      if (!gameGrouped[gameLabel]) gameGrouped[gameLabel] = [];
      gameGrouped[gameLabel].push(sel);
    }
    const isCombo = checkIsComboBonus(bet.selections);
    const comboPct = isCombo ? getComboBonus(bet.selections.length) : 0;
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
      lines.push(`⚡ BÔNUS COMBINADA +${bonusPctStr} (${bet.selections.length} seleções)`);
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

  return (
    <div data-testid={`bet-history-item-${bet.id}`} className="space-y-3">
      <div className="bg-primary/10 border border-primary rounded-md px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Código do Bilhete</p>
            <p className="font-mono text-base font-bold text-primary" data-testid={`text-bet-id-${bet.id}`}>
              #{bet.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(bet.createdAt), "dd/MM/yyyy • HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {Object.entries(grouped).map(([gameId, sels]) => {
          const first = sels[0];
          const gameOdds = fmtOdds(sels.reduce((a, s) => a * s.odds, 1));
          return (
            <div key={gameId} className="rounded-xl bg-muted border border-border overflow-hidden" data-testid={`card-history-game-${gameId}`}>
              <div className="flex items-center justify-between px-4 py-3 bg-muted/60 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">⚽</span>
                  <span className="font-semibold text-foreground text-sm truncate">
                    {first.homeTeam}{first.awayTeam ? ` vs ${first.awayTeam}` : ""}
                  </span>
                </div>
                <span className="text-yellow-400 font-bold text-sm flex-shrink-0 ml-2">
                  {gameOdds}
                </span>
              </div>

              <div className="px-4 py-3">
                <div className="relative pl-5">
                  <div
                    className="absolute left-[5px] top-[6px] w-[2px] bg-yellow-400"
                    style={{ height: sels.length > 1 ? `calc(100% - 12px)` : "0px" }}
                  />
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-muted-foreground text-sm">Odds total</span>
          <span className="text-foreground font-bold text-lg">{fmtOdds(bet.totalOdds)}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="text-muted-foreground text-sm">Valor Apostado</span>
          <span className="text-foreground font-medium">R$ {bet.stake.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-muted-foreground text-sm">Retorno Potencial</span>
          <span className="text-yellow-400 font-bold">R$ {bet.potentialWin.toFixed(2)}</span>
        </div>
      </div>

      <Button
        className="w-full bg-green-600 text-white hover:bg-green-700"
        onClick={shareBet}
        data-testid={`button-share-history-${bet.id}`}
      >
        <Share2 className="w-4 h-4 mr-2" />
        Compartilhar Bilhete
      </Button>
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
              <div className="space-y-6">
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
