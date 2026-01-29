import { Game, Selection } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function calculateBoostedOdd(originalOdd: number): number {
  return originalOdd * 1.20;
}

interface GameCardProps {
  game: Game;
  selections: Selection[];
  onToggleSelection: (selection: Selection) => void;
}

export function GameCard({ game, selections, onToggleSelection }: GameCardProps) {
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

  return (
    <Card className="overflow-hidden" data-testid={`card-game-${game.id}`}>
      <CardContent className="p-0">
        <div className="p-4 border-b border-card-border bg-muted/30">
          <div className="flex items-center justify-between gap-2 flex-wrap">
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
            </div>
            
            {bestBookmaker && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span>{bestBookmaker.title}</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-4">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-xs font-bold">
                    {game.homeTeam.substring(0, 2).toUpperCase()}
                  </div>
                  <span className="font-medium truncate" data-testid={`text-home-team-${game.id}`}>
                    {game.homeTeam}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-xs font-bold">
                    {game.awayTeam.substring(0, 2).toUpperCase()}
                  </div>
                  <span className="font-medium truncate" data-testid={`text-away-team-${game.id}`}>
                    {game.awayTeam}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {h2hMarket && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Vencedor do Jogo
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {h2hMarket.outcomes.map((outcome) => {
                  const selected = isSelected(outcome.name, "h2h");
                  const boostedOdd = calculateBoostedOdd(outcome.price);
                  return (
                    <button
                      key={outcome.name}
                      onClick={() => handleOddClick(outcome.name, outcome.price, "h2h")}
                      className={`flex flex-col items-center gap-1 p-3 rounded-md border transition-all hover-elevate active-elevate-2 ${
                        selected
                          ? "bg-primary/10 border-primary text-foreground"
                          : "bg-muted/50 border-transparent"
                      }`}
                      data-testid={`button-odd-${game.id}-${outcome.name}`}
                    >
                      <span className="text-xs text-muted-foreground truncate w-full text-center">
                        {outcome.name === "Draw" ? "Empate" : outcome.name}
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
                })}
              </div>
            </div>
          )}
          
          {spreadMarket && (
            <div className="space-y-2 mt-4">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Handicap
              </span>
              <div className="grid grid-cols-2 gap-2">
                {spreadMarket.outcomes.map((outcome) => {
                  const selected = isSelected(outcome.name, "spreads");
                  const boostedOdd = calculateBoostedOdd(outcome.price);
                  return (
                    <button
                      key={outcome.name}
                      onClick={() => handleOddClick(outcome.name, outcome.price, "spreads")}
                      className={`flex flex-col items-center gap-1 p-3 rounded-md border transition-all hover-elevate active-elevate-2 ${
                        selected
                          ? "bg-primary/10 border-primary text-foreground"
                          : "bg-muted/50 border-transparent"
                      }`}
                      data-testid={`button-spread-${game.id}-${outcome.name}`}
                    >
                      <span className="text-xs text-muted-foreground truncate w-full text-center">
                        {outcome.name} {outcome.point !== undefined && `(${outcome.point > 0 ? '+' : ''}${outcome.point})`}
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
                })}
              </div>
            </div>
          )}
          
          {totalsMarket && (
            <div className="space-y-2 mt-4">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total de Gols/Pontos
              </span>
              <div className="grid grid-cols-2 gap-2">
                {totalsMarket.outcomes.map((outcome) => {
                  const selected = isSelected(outcome.name, "totals");
                  const label = outcome.name === "Over" ? "Mais de" : "Menos de";
                  const boostedOdd = calculateBoostedOdd(outcome.price);
                  return (
                    <button
                      key={outcome.name}
                      onClick={() => handleOddClick(outcome.name, outcome.price, "totals")}
                      className={`flex flex-col items-center gap-1 p-3 rounded-md border transition-all hover-elevate active-elevate-2 ${
                        selected
                          ? "bg-primary/10 border-primary text-foreground"
                          : "bg-muted/50 border-transparent"
                      }`}
                      data-testid={`button-total-${game.id}-${outcome.name}`}
                    >
                      <span className="text-xs text-muted-foreground truncate w-full text-center">
                        {label} {outcome.point}
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
                })}
              </div>
            </div>
          )}
          
          {!h2hMarket && !spreadMarket && !totalsMarket && (
            <div className="text-center py-4 text-muted-foreground">
              <p>Odds não disponíveis no momento</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
