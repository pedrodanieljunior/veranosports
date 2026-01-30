import { Game, Selection } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, TrendingUp, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";

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
  
  const bestBookmaker = game.bookmakers[0];
  const h2hMarket = bestBookmaker?.markets.find(m => m.key === "h2h");
  const spreadMarket = bestBookmaker?.markets.find(m => m.key === "spreads");
  const totalsMarket = bestBookmaker?.markets.find(m => m.key === "totals");
  
  const isSelected = (outcomeName: string, marketKey: string) => {
    return selections.some(
      s => s.gameId === game.id && s.outcome === outcomeName && s.marketKey === marketKey
    );
  };

  const handleOddClick = (outcomeName: string, originalOdds: number, marketKey: string) => {
    const boostedOdds = calculateBoostedOdd(originalOdds);
    const selection: Selection = {
      id: `${game.id}-${marketKey}-${outcomeName}`,
      gameId: game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      commenceTime: game.commenceTime,
      sportTitle: game.sportTitle,
      marketKey,
      bookmaker: bestBookmaker?.title || "Unknown",
      outcome: outcomeName,
      odds: boostedOdds,
    };
    onToggleSelection(selection);
  };

  const renderOddButton = (
    outcome: { name: string; price: number; point?: number },
    marketKey: string,
    label: string,
    testId: string
  ) => {
    const selected = isSelected(outcome.name, marketKey);
    const boostedOdd = calculateBoostedOdd(outcome.price);
    
    return (
      <button
        key={`${marketKey}-${outcome.name}-${outcome.point || ''}`}
        onClick={() => handleOddClick(outcome.name, outcome.price, marketKey)}
        className={`flex flex-col items-center gap-1 p-3 rounded-md border transition-all hover-elevate active-elevate-2 ${
          selected
            ? "bg-primary/10 border-primary text-foreground"
            : "bg-muted/50 border-transparent"
        }`}
        data-testid={testId}
      >
        <span className="text-xs text-muted-foreground truncate w-full text-center">
          {label}
        </span>
        <div className="flex flex-col items-center">
          <span className={`font-bold text-lg ${selected ? "text-primary" : ""}`}>
            {boostedOdd.toFixed(2)}
          </span>
          <span className="text-[10px] text-muted-foreground/60 line-through flex items-center gap-0.5">
            {outcome.price.toFixed(2)}
            <TrendingUp className="w-2.5 h-2.5 text-green-500" />
          </span>
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b border-card-border sticky top-0 bg-background z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isLive ? (
                <Badge variant="destructive" className="animate-pulse">
                  AO VIVO
                </Badge>
              ) : (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{format(gameDate, "dd MMM HH:mm", { locale: ptBR })}</span>
                </div>
              )}
              <Badge variant="secondary" className="text-xs">
                {game.sportTitle}
              </Badge>
            </div>
          </div>
          <DialogTitle className="text-left mt-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-xs font-bold">
                  {game.homeTeam.substring(0, 2).toUpperCase()}
                </div>
                <span className="font-semibold">{game.homeTeam}</span>
              </div>
              <div className="text-xs text-muted-foreground text-center">vs</div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-xs font-bold">
                  {game.awayTeam.substring(0, 2).toUpperCase()}
                </div>
                <span className="font-semibold">{game.awayTeam}</span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="p-4 space-y-6">
            {h2hMarket && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-primary rounded-full" />
                  <span className="text-sm font-semibold uppercase tracking-wider">
                    Vencedor do Jogo
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {h2hMarket.outcomes.map((outcome) => 
                    renderOddButton(
                      outcome,
                      "h2h",
                      outcome.name === "Draw" ? "Empate" : outcome.name,
                      `button-modal-h2h-${outcome.name}`
                    )
                  )}
                </div>
              </div>
            )}
            
            {spreadMarket && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-primary rounded-full" />
                  <span className="text-sm font-semibold uppercase tracking-wider">
                    Handicap Asiático
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {spreadMarket.outcomes.map((outcome) => 
                    renderOddButton(
                      outcome,
                      "spreads",
                      `${outcome.name} ${outcome.point !== undefined ? `(${outcome.point > 0 ? '+' : ''}${outcome.point})` : ''}`,
                      `button-modal-spread-${outcome.name}`
                    )
                  )}
                </div>
              </div>
            )}
            
            {totalsMarket && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-primary rounded-full" />
                  <span className="text-sm font-semibold uppercase tracking-wider">
                    Total de Gols
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {totalsMarket.outcomes.map((outcome) => 
                    renderOddButton(
                      outcome,
                      "totals",
                      `${outcome.name === "Over" ? "Mais de" : "Menos de"} ${outcome.point}`,
                      `button-modal-total-${outcome.name}`
                    )
                  )}
                </div>
              </div>
            )}
            
            {!h2hMarket && !spreadMarket && !totalsMarket && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum mercado disponível para este jogo</p>
              </div>
            )}
            
            <div className="pt-2 border-t border-card-border">
              <p className="text-xs text-muted-foreground text-center">
                Todas as odds incluem bônus de +20%
              </p>
              {bestBookmaker && (
                <p className="text-xs text-muted-foreground text-center mt-1">
                  Fonte: {bestBookmaker.title}
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
