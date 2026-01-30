import { Game, Selection } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function calculateBoostedOdd(originalOdd: number): number {
  return originalOdd * 1.20;
}

interface GameDetailModalProps {
  game: Game | null;
  open: boolean;
  onClose: () => void;
  selections: Selection[];
  onToggleSelection: (selection: Selection) => void;
}

export function GameDetailModal({ game, open, onClose, selections, onToggleSelection }: GameDetailModalProps) {
  if (!game) return null;
  
  const gameDate = new Date(game.commenceTime);
  const isLive = gameDate <= new Date();
  
  const allMarkets: Record<string, { outcomes: any[]; bookmaker: string }> = {};
  
  game.bookmakers.forEach((bookmaker) => {
    bookmaker.markets.forEach((market) => {
      if (!allMarkets[market.key]) {
        allMarkets[market.key] = {
          outcomes: market.outcomes,
          bookmaker: bookmaker.title
        };
      }
    });
  });
  
  const h2hMarket = allMarkets["h2h"];
  const spreadMarket = allMarkets["spreads"];
  const totalsMarket = allMarkets["totals"];
  
  const isSelected = (outcomeName: string, marketKey: string) => {
    return selections.some(
      s => s.gameId === game.id && s.outcome === outcomeName && s.marketKey === marketKey
    );
  };

  const handleOddClick = (outcomeName: string, originalOdds: number, marketKey: string, bookmaker: string) => {
    const boostedOdds = calculateBoostedOdd(originalOdds);
    const selection: Selection = {
      id: `${game.id}-${marketKey}-${outcomeName}`,
      gameId: game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      commenceTime: game.commenceTime,
      sportTitle: game.sportTitle,
      marketKey,
      bookmaker,
      outcome: outcomeName,
      odds: boostedOdds,
    };
    onToggleSelection(selection);
  };

  const marketLabels: Record<string, string> = {
    h2h: "Resultado Final (1X2)",
    spreads: "Handicap Asiático",
    totals: "Total de Gols"
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0">
        <DialogHeader className="p-4 border-b border-card-border bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            {isLive ? (
              <Badge variant="destructive" className="animate-pulse">
                AO VIVO
              </Badge>
            ) : (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>{format(gameDate, "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
              </div>
            )}
            <Badge variant="secondary" className="text-xs">
              {game.sportTitle}
            </Badge>
          </div>
          <DialogTitle className="text-lg">
            {game.homeTeam} vs {game.awayTeam}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Selecione uma odd para adicionar ao bilhete
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh]">
          <div className="p-4 space-y-6">
            {h2hMarket && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {marketLabels.h2h}
                  </span>
                  <span className="text-xs text-muted-foreground">{h2hMarket.bookmaker}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {h2hMarket.outcomes.map((outcome: any) => {
                    const selected = isSelected(outcome.name, "h2h");
                    const boostedOdd = calculateBoostedOdd(outcome.price);
                    const label = outcome.name === "Draw" ? "Empate" : 
                                  outcome.name === game.homeTeam ? "1" : "2";
                    return (
                      <button
                        key={outcome.name}
                        onClick={() => handleOddClick(outcome.name, outcome.price, "h2h", h2hMarket.bookmaker)}
                        className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all hover-elevate active-elevate-2 ${
                          selected
                            ? "bg-primary/10 border-primary"
                            : "bg-card border-transparent hover:border-muted-foreground/20"
                        }`}
                        data-testid={`button-modal-h2h-${outcome.name}`}
                      >
                        <span className="text-xs text-muted-foreground mb-1">
                          {label === "1" ? game.homeTeam.substring(0, 10) : 
                           label === "2" ? game.awayTeam.substring(0, 10) : "Empate"}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className={`font-bold text-lg ${selected ? "text-primary" : ""}`}>
                            {boostedOdd.toFixed(2)}
                          </span>
                          <TrendingUp className="w-3 h-3 text-green-500" />
                        </div>
                        <span className="text-[10px] text-muted-foreground/60 line-through">
                          {outcome.price.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {spreadMarket && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {marketLabels.spreads}
                  </span>
                  <span className="text-xs text-muted-foreground">{spreadMarket.bookmaker}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {spreadMarket.outcomes.map((outcome: any) => {
                    const selected = isSelected(`spread-${outcome.name}-${outcome.point}`, "spreads");
                    const boostedOdd = calculateBoostedOdd(outcome.price);
                    return (
                      <button
                        key={`${outcome.name}-${outcome.point}`}
                        onClick={() => handleOddClick(`spread-${outcome.name}-${outcome.point}`, outcome.price, "spreads", spreadMarket.bookmaker)}
                        className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all hover-elevate active-elevate-2 ${
                          selected
                            ? "bg-primary/10 border-primary"
                            : "bg-card border-transparent hover:border-muted-foreground/20"
                        }`}
                        data-testid={`button-modal-spread-${outcome.name}`}
                      >
                        <span className="text-xs text-muted-foreground mb-1">
                          {outcome.name} ({outcome.point > 0 ? '+' : ''}{outcome.point})
                        </span>
                        <div className="flex items-center gap-1">
                          <span className={`font-bold text-lg ${selected ? "text-primary" : ""}`}>
                            {boostedOdd.toFixed(2)}
                          </span>
                          <TrendingUp className="w-3 h-3 text-green-500" />
                        </div>
                        <span className="text-[10px] text-muted-foreground/60 line-through">
                          {outcome.price.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {totalsMarket && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {marketLabels.totals}
                  </span>
                  <span className="text-xs text-muted-foreground">{totalsMarket.bookmaker}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {totalsMarket.outcomes.map((outcome: any) => {
                    const selected = isSelected(`total-${outcome.name}-${outcome.point}`, "totals");
                    const boostedOdd = calculateBoostedOdd(outcome.price);
                    const label = outcome.name === "Over" ? `Mais de ${outcome.point}` : `Menos de ${outcome.point}`;
                    return (
                      <button
                        key={`${outcome.name}-${outcome.point}`}
                        onClick={() => handleOddClick(`total-${outcome.name}-${outcome.point}`, outcome.price, "totals", totalsMarket.bookmaker)}
                        className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all hover-elevate active-elevate-2 ${
                          selected
                            ? "bg-primary/10 border-primary"
                            : "bg-card border-transparent hover:border-muted-foreground/20"
                        }`}
                        data-testid={`button-modal-total-${outcome.name}`}
                      >
                        <span className="text-xs text-muted-foreground mb-1">
                          {label}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className={`font-bold text-lg ${selected ? "text-primary" : ""}`}>
                            {boostedOdd.toFixed(2)}
                          </span>
                          <TrendingUp className="w-3 h-3 text-green-500" />
                        </div>
                        <span className="text-[10px] text-muted-foreground/60 line-through">
                          {outcome.price.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {!h2hMarket && !spreadMarket && !totalsMarket && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum mercado disponível para este jogo</p>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="p-3 border-t border-card-border bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
            Todas as odds incluem bônus de +20%
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
