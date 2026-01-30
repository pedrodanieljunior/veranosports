import { Game, Selection } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronRight, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function calculateBoostedOdd(originalOdd: number): number {
  return originalOdd * 1.20;
}

interface GameCardProps {
  game: Game;
  selections: Selection[];
  onClick: () => void;
}

export function GameCard({ game, selections, onClick }: GameCardProps) {
  const gameDate = new Date(game.commenceTime);
  const isLive = gameDate <= new Date();
  
  const bestBookmaker = game.bookmakers[0];
  const h2hMarket = bestBookmaker?.markets.find(m => m.key === "h2h");
  
  const homeOdd = h2hMarket?.outcomes.find(o => o.name === game.homeTeam);
  const drawOdd = h2hMarket?.outcomes.find(o => o.name === "Draw");
  const awayOdd = h2hMarket?.outcomes.find(o => o.name === game.awayTeam);
  
  const selectionsForGame = selections.filter(s => s.gameId === game.id);
  const hasSelections = selectionsForGame.length > 0;

  return (
    <Card 
      className={`overflow-hidden cursor-pointer transition-all hover-elevate active-elevate-2 ${hasSelections ? 'ring-2 ring-primary' : ''}`}
      onClick={onClick}
      data-testid={`card-game-${game.id}`}
    >
      <CardContent className="p-0">
        <div className="p-3 border-b border-card-border bg-muted/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isLive ? (
                <Badge variant="destructive" className="animate-pulse text-xs">
                  AO VIVO
                </Badge>
              ) : (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{format(gameDate, "dd MMM HH:mm", { locale: ptBR })}</span>
                </div>
              )}
            </div>
            
            {hasSelections && (
              <Badge variant="default" className="text-xs">
                {selectionsForGame.length} seleção(ões)
              </Badge>
            )}
          </div>
        </div>
        
        <div className="p-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
                      {game.homeTeam.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="font-medium text-sm truncate" data-testid={`text-home-team-${game.id}`}>
                      {game.homeTeam}
                    </span>
                  </div>
                  {homeOdd && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {calculateBoostedOdd(homeOdd.price).toFixed(2)}
                      </span>
                      <TrendingUp className="w-3 h-3 text-green-500" />
                    </div>
                  )}
                </div>
                
                {drawOdd && (
                  <div className="flex items-center justify-between gap-2 px-9">
                    <span className="text-xs text-muted-foreground">Empate</span>
                    <span className="text-sm font-bold text-primary">
                      {calculateBoostedOdd(drawOdd.price).toFixed(2)}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
                      {game.awayTeam.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="font-medium text-sm truncate" data-testid={`text-away-team-${game.id}`}>
                      {game.awayTeam}
                    </span>
                  </div>
                  {awayOdd && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {calculateBoostedOdd(awayOdd.price).toFixed(2)}
                      </span>
                      <TrendingUp className="w-3 h-3 text-green-500" />
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="shrink-0">
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>
          
          {!h2hMarket && (
            <div className="text-center py-2 text-xs text-muted-foreground">
              Clique para ver mercados
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
