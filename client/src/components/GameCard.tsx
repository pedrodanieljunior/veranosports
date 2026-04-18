import { Game, Selection } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronRight, Lock } from "lucide-react";
import { format } from "date-fns";
import { TeamBadge } from "@/components/TeamBadge";
import { useMarketSettings } from "@/hooks/use-market-settings";
import { roundOdds } from "@/lib/formatOdds";
import { useAuth } from "@/lib/auth";

interface GameCardProps {
  game: Game;
  selections: Selection[];
  onClick: () => void;
  isDark?: boolean;
}

function OddWithLock({ value, originalValue, isDark, locked }: { value: string; originalValue?: string; isDark: boolean; locked: boolean }) {
  const inner = (
    <span className="inline-flex flex-col items-end leading-tight">
      {originalValue && (
        <span className={`text-[10px] tabular-nums line-through ${isDark ? "text-white/40" : "text-gray-400"}`}>
          {originalValue}
        </span>
      )}
      <span className={`text-sm font-bold tabular-nums ${locked ? (isDark ? "text-[#f5c518]/70" : "text-green-600/70") : (isDark ? "text-[#f5c518]" : "text-green-600")} inline-flex items-center gap-0.5`}>
        {value}
        {locked && <Lock className={`w-2.5 h-2.5 ${isDark ? "text-white/40" : "text-gray-400"}`} />}
      </span>
    </span>
  );

  if (!locked) {
    return <span className="ml-auto">{inner}</span>;
  }

  return (
    <span className="relative group/odd ml-auto">
      <span data-testid="span-locked-odd">{inner}</span>
      <span
        className="absolute bottom-full right-0 mb-1 px-2 py-1 bg-gray-900 text-white text-[10px] font-medium rounded whitespace-nowrap opacity-0 group-hover/odd:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg"
        role="tooltip"
      >
        Faça login para apostar
      </span>
    </span>
  );
}

export function GameCard({ game, selections, onClick, isDark = false }: GameCardProps) {
  const { user } = useAuth();
  const { getBoostMultiplier, hasBoosted } = useMarketSettings();
  const isBoosted = hasBoosted("h2h");
  const multiplier = getBoostMultiplier("h2h");
  const isLoggedOut = !user;

  const gameDate = new Date(game.commenceTime);
  const isValidDate = !isNaN(gameDate.getTime());
  const bestBookmaker = game.bookmakers[0];
  const h2hMarket = bestBookmaker?.markets.find(m => m.key === "h2h");
  
  const homeOdd = h2hMarket?.outcomes.find(o => o.name === game.homeTeam);
  const drawOdd = h2hMarket?.outcomes.find(o => o.name === "Draw" || o.name === "Empate");
  const awayOdd = h2hMarket?.outcomes.find(o => o.name === game.awayTeam);
  
  const selectionsForGame = selections.filter(s => s.gameId === game.id);
  const hasSelections = selectionsForGame.length > 0;

  const formattedDate = isValidDate ? format(gameDate, "dd/MM HH:mm") : "A definir";

  const displayOdd = (price: number) => roundOdds(isBoosted ? price * multiplier : price).toFixed(2);

  return (
    <div 
      className={`rounded-lg border cursor-pointer transition-all ${isDark ? "bg-[#4a4a4a] hover:bg-[#505050]" : "bg-white hover:shadow-md"} ${hasSelections ? "border-yellow-400 ring-1 ring-yellow-400" : isDark ? "border-[#5a5a5a]" : "border-gray-200"}`}
      onClick={onClick}
      data-testid={`card-game-${game.id}`}
    >
      <div className={`flex items-center gap-2 px-3 py-1.5 border-b rounded-t-lg ${isDark ? "border-[#5a5a5a] bg-[#3d3d3d]" : "border-gray-100 bg-gray-50"}`}>
        <div className={`flex items-center gap-1 text-[11px] ${isDark ? "text-[#aaaaaa]" : "text-gray-500"}`}>
          <Clock className="w-3 h-3" />
          <span>{formattedDate}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {hasSelections && (
            <Badge className="bg-yellow-500 text-white text-[10px] px-1.5 py-0 border-0">
              {selectionsForGame.length}
            </Badge>
          )}
          <ChevronRight className={`w-4 h-4 ${isDark ? "text-white/40" : "text-gray-400"}`} />
        </div>
      </div>
      
      <div className="p-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-6 h-6 shrink-0 flex items-center justify-center">
            <TeamBadge teamName={game.homeTeam} logoUrl={game.homeLogo} size={22} />
          </div>
          <span className={`text-xs font-medium truncate flex-1 ${isDark ? "text-white" : "text-gray-800"}`} data-testid={`text-home-team-${game.id}`}>
            {game.homeTeam}
          </span>
          {homeOdd && (
            <OddWithLock value={displayOdd(homeOdd.price)} isDark={isDark} locked={isLoggedOut} />
          )}
        </div>

        <div className="flex items-center gap-2 mb-1.5 pl-8">
          <span className={`text-[11px] flex-1 ${isDark ? "text-white/40" : "text-gray-400"}`}>Empate</span>
          {drawOdd && (
            <OddWithLock value={displayOdd(drawOdd.price)} isDark={isDark} locked={isLoggedOut} />
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 shrink-0 flex items-center justify-center">
            <TeamBadge teamName={game.awayTeam} logoUrl={game.awayLogo} size={22} />
          </div>
          <span className={`text-xs font-medium truncate flex-1 ${isDark ? "text-white" : "text-gray-800"}`} data-testid={`text-away-team-${game.id}`}>
            {game.awayTeam}
          </span>
          {awayOdd && (
            <OddWithLock value={displayOdd(awayOdd.price)} isDark={isDark} locked={isLoggedOut} />
          )}
        </div>
        
        {!h2hMarket && (
          <div className={`text-center pt-1.5 text-[10px] ${isDark ? "text-white/30" : "text-gray-400"}`}>
            Clique para ver mercados
          </div>
        )}
      </div>
    </div>
  );
}
