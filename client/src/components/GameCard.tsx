import { Game, Selection } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronRight } from "lucide-react";
import { format } from "date-fns";

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
  const isValidDate = !isNaN(gameDate.getTime());
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const isLive = isValidDate && gameDate <= now && gameDate >= twoHoursAgo;
  
  const bestBookmaker = game.bookmakers[0];
  const h2hMarket = bestBookmaker?.markets.find(m => m.key === "h2h");
  
  const homeOdd = h2hMarket?.outcomes.find(o => o.name === game.homeTeam);
  const drawOdd = h2hMarket?.outcomes.find(o => o.name === "Draw" || o.name === "Empate");
  const awayOdd = h2hMarket?.outcomes.find(o => o.name === game.awayTeam);
  
  const selectionsForGame = selections.filter(s => s.gameId === game.id);
  const hasSelections = selectionsForGame.length > 0;

  const formattedDate = isValidDate ? format(gameDate, "dd/MM HH:mm") : "A definir";

  return (
    <div 
      className={`bg-white rounded-lg border cursor-pointer transition-all hover:shadow-md ${hasSelections ? 'border-yellow-400 ring-1 ring-yellow-400' : 'border-gray-200'}`}
      onClick={onClick}
      data-testid={`card-game-${game.id}`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50 rounded-t-lg">
        {isLive ? (
          <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0 animate-pulse border-0">
            AO VIVO
          </Badge>
        ) : (
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <Clock className="w-3 h-3" />
            <span>{formattedDate}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {hasSelections && (
            <Badge className="bg-yellow-500 text-white text-[10px] px-1.5 py-0 border-0">
              {selectionsForGame.length}
            </Badge>
          )}
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </div>
      </div>
      
      <div className="p-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-600 shrink-0">
            {game.homeTeam.substring(0, 2).toUpperCase()}
          </div>
          <span className="text-xs font-medium text-gray-800 truncate flex-1" data-testid={`text-home-team-${game.id}`}>
            {game.homeTeam}
          </span>
          {homeOdd && (
            <span className="text-sm font-bold text-green-600 ml-auto tabular-nums">
              {calculateBoostedOdd(homeOdd.price).toFixed(2)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mb-1.5 pl-8">
          <span className="text-[11px] text-gray-400 flex-1">Empate</span>
          {drawOdd && (
            <span className="text-sm font-bold text-green-600 ml-auto tabular-nums">
              {calculateBoostedOdd(drawOdd.price).toFixed(2)}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-600 shrink-0">
            {game.awayTeam.substring(0, 2).toUpperCase()}
          </div>
          <span className="text-xs font-medium text-gray-800 truncate flex-1" data-testid={`text-away-team-${game.id}`}>
            {game.awayTeam}
          </span>
          {awayOdd && (
            <span className="text-sm font-bold text-green-600 ml-auto tabular-nums">
              {calculateBoostedOdd(awayOdd.price).toFixed(2)}
            </span>
          )}
        </div>
        
        {!h2hMarket && (
          <div className="text-center pt-1.5 text-[10px] text-gray-400">
            Clique para ver mercados
          </div>
        )}
      </div>
    </div>
  );
}
