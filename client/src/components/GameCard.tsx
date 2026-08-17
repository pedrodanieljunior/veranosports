import { Game, Selection } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { format } from "date-fns";
import { TeamBadge } from "@/components/TeamBadge";
import { useMarketSettings } from "@/hooks/use-market-settings";
import { roundOdds } from "@/lib/formatOdds";
import { useAuth } from "@/lib/auth";
import { translateTeam } from "@/lib/teamTranslations";
import { LEAGUE_IDS } from "@/lib/leagueIds";
import { proxyLogoUrl } from "@/lib/imgProxy";
import { useState } from "react";

interface GameCardProps {
  game: Game;
  selections: Selection[];
  onClick: () => void;
  onToggleSelection?: (selection: any) => void;
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
      <span className={`text-sm font-bold tabular-nums ${locked ? (isDark ? "text-[#f5c518]/70" : "text-[#0076a8]/70") : (isDark ? "text-[#f5c518]" : "text-[#0076a8]")} inline-flex items-center gap-0.5`}>
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

function LeagueLogo({ sportKey, isDark }: { sportKey: string; isDark: boolean }) {
  const [broken, setBroken] = useState(false);
  const leagueId = LEAGUE_IDS[sportKey];
  if (!leagueId || broken) return null;
  const url = proxyLogoUrl(`https://media.api-sports.io/football/leagues/${leagueId}.png`);
  return (
    <img
      src={url}
      alt=""
      width={16}
      height={16}
      className="w-4 h-4 object-contain flex-shrink-0"
      onError={() => setBroken(true)}
    />
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
      className={`rounded-lg border cursor-pointer transition-all ${isDark ? "bg-[#4a4a4a] hover:bg-[#505050]" : "bg-gradient-to-b from-white to-blue-200 hover:shadow-md"} ${hasSelections ? "border-transparent" : isDark ? "border-[#5a5a5a]" : "border-blue-200"}`}
      style={hasSelections ? { boxShadow: "0 0 0 2px #c9a227" } : undefined}
      onClick={onClick}
      data-testid={`card-game-${game.id}`}
    >
      <div className="p-2.5">
        {/* Data/hora + logo da liga */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <LeagueLogo sportKey={game.sportKey} isDark={isDark} />
            <span className={`text-[11px] ${isDark ? "text-[#aaaaaa]" : "text-gray-400"}`}>{formattedDate}</span>
          </div>
          {hasSelections && (
            <Badge className="text-white text-[10px] px-1.5 py-0 border-0" style={{ background: "linear-gradient(135deg, #d4960f, #8a5200)" }}>
              {selectionsForGame.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-6 h-6 shrink-0 flex items-center justify-center">
            <TeamBadge teamName={game.homeTeam} logoUrl={game.homeLogo} size={22} />
          </div>
          <span className={`text-xs font-medium truncate flex-1 ${isDark ? "text-white" : "text-gray-800"}`} data-testid={`text-home-team-${game.id}`}>
            {translateTeam(game.homeTeam)}
          </span>
          {homeOdd ? (
            <OddWithLock value={displayOdd(homeOdd.price)} isDark={isDark} locked={isLoggedOut} />
          ) : (
            <Lock className={`w-3.5 h-3.5 ml-auto shrink-0 ${isDark ? "text-white/20" : "text-gray-300"}`} />
          )}
        </div>

        <div className="flex items-center gap-2 mb-1.5 pl-8">
          <span className={`text-[11px] flex-1 ${isDark ? "text-white/40" : "text-gray-400"}`}>Empate</span>
          {drawOdd ? (
            <OddWithLock value={displayOdd(drawOdd.price)} isDark={isDark} locked={isLoggedOut} />
          ) : (
            <Lock className={`w-3.5 h-3.5 ml-auto shrink-0 ${isDark ? "text-white/20" : "text-gray-300"}`} />
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 shrink-0 flex items-center justify-center">
            <TeamBadge teamName={game.awayTeam} logoUrl={game.awayLogo} size={22} />
          </div>
          <span className={`text-xs font-medium truncate flex-1 ${isDark ? "text-white" : "text-gray-800"}`} data-testid={`text-away-team-${game.id}`}>
            {translateTeam(game.awayTeam)}
          </span>
          {awayOdd ? (
            <OddWithLock value={displayOdd(awayOdd.price)} isDark={isDark} locked={isLoggedOut} />
          ) : (
            <Lock className={`w-3.5 h-3.5 ml-auto shrink-0 ${isDark ? "text-white/20" : "text-gray-300"}`} />
          )}
        </div>
        
        {!h2hMarket && (
          <div className={`text-center pt-1 text-[9px] ${isDark ? "text-white/20" : "text-gray-300"}`}>
            Odds em breve
          </div>
        )}
      </div>
    </div>
  );
}
