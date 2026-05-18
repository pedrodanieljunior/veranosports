import { useState } from "react";
import { Game, Selection } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronRight, Lock } from "lucide-react";
import { format } from "date-fns";
import { TeamBadge } from "@/components/TeamBadge";
import { useMarketSettings } from "@/hooks/use-market-settings";
import { roundOdds } from "@/lib/formatOdds";
import { useAuth } from "@/lib/auth";

type CardMarket = "h2h" | "double_chance" | "totals";

const MARKET_TABS: { key: CardMarket; label: string }[] = [
  { key: "h2h", label: "1X2" },
  { key: "double_chance", label: "Dupla Chance" },
  { key: "totals", label: "+/- Gols" },
];

interface GameCardProps {
  game: Game;
  selections: Selection[];
  onClick: () => void;
  onToggleSelection?: (selection: Selection) => void;
  isDark?: boolean;
}

export function GameCard({ game, selections, onClick, onToggleSelection, isDark = false }: GameCardProps) {
  const { user } = useAuth();
  const { getBoostMultiplier, hasBoosted } = useMarketSettings();
  const [activeMarket, setActiveMarket] = useState<CardMarket>("h2h");

  const isLoggedOut = !user;
  const gameDate = new Date(game.commenceTime);
  const isValidDate = !isNaN(gameDate.getTime());
  const bestBookmaker = game.bookmakers[0];

  const h2hMarket = bestBookmaker?.markets.find(m => m.key === "h2h");
  const dcMarket = bestBookmaker?.markets.find(m => m.key === "double_chance");
  const totalsMarket = bestBookmaker?.markets.find(m => m.key === "totals");

  const availableTabs = MARKET_TABS.filter(t =>
    t.key === "h2h" ? !!h2hMarket :
    t.key === "double_chance" ? !!dcMarket :
    t.key === "totals" ? !!totalsMarket : false
  );

  const selectionsForGame = selections.filter(s => s.gameId === game.id);
  const hasSelections = selectionsForGame.length > 0;
  const formattedDate = isValidDate ? format(gameDate, "dd/MM HH:mm") : "A definir";

  const getDisplayOdd = (price: number, boostKey: string) => {
    const mult = getBoostMultiplier(boostKey);
    const boosted = hasBoosted(boostKey);
    return roundOdds(boosted ? price * mult : price).toFixed(2);
  };

  const isOutcomeSelected = (outcomeName: string, marketKey: string) =>
    selections.some(s => s.gameId === game.id && s.marketKey === marketKey && s.outcome === outcomeName);

  const handleOddClick = (e: React.MouseEvent, outcomeName: string, price: number, marketKey: CardMarket) => {
    e.stopPropagation();
    if (!user || !onToggleSelection) return;
    const boostKey = marketKey === "totals" ? "totals" : "h2h";
    const boosted = hasBoosted(boostKey);
    const mult = getBoostMultiplier(boostKey);
    const finalOdds = boosted ? Math.round(price * mult * 100) / 100 : price;
    const selection: Selection = {
      id: `${game.id}-${marketKey}-${outcomeName}`,
      gameId: game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      commenceTime: game.commenceTime,
      sportTitle: game.sportTitle,
      marketKey,
      bookmaker: bestBookmaker?.title || "API-Football",
      outcome: outcomeName,
      odds: finalOdds,
      originalOdds: price,
      result: "pending",
    };
    onToggleSelection(selection);
  };

  const activeMarketData =
    activeMarket === "h2h" ? h2hMarket :
    activeMarket === "double_chance" ? dcMarket :
    activeMarket === "totals" ? totalsMarket : null;

  const boostKeyForActive = activeMarket === "totals" ? "totals" : "h2h";

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
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 shrink-0 flex items-center justify-center">
            <TeamBadge teamName={game.homeTeam} logoUrl={game.homeLogo} size={22} />
          </div>
          <span className={`text-xs font-medium truncate flex-1 ${isDark ? "text-white" : "text-gray-800"}`} data-testid={`text-home-team-${game.id}`}>
            {game.homeTeam}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-1 pl-8">
          <span className={`text-[11px] ${isDark ? "text-white/30" : "text-gray-400"}`}>vs</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 shrink-0 flex items-center justify-center">
            <TeamBadge teamName={game.awayTeam} logoUrl={game.awayLogo} size={22} />
          </div>
          <span className={`text-xs font-medium truncate flex-1 ${isDark ? "text-white" : "text-gray-800"}`} data-testid={`text-away-team-${game.id}`}>
            {game.awayTeam}
          </span>
        </div>

        {!h2hMarket ? (
          <div className={`text-center text-[9px] ${isDark ? "text-white/20" : "text-gray-300"}`}>
            Odds em breve
          </div>
        ) : (
          <div onClick={e => e.stopPropagation()}>
            {availableTabs.length > 1 && (
              <div className="flex gap-1 mb-1.5">
                {availableTabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={e => { e.stopPropagation(); setActiveMarket(tab.key); }}
                    className={`flex-1 text-[9px] font-bold py-1 px-0.5 rounded transition-all truncate ${
                      activeMarket === tab.key
                        ? isDark ? "bg-yellow-500/20 text-yellow-400" : "bg-green-100 text-green-700"
                        : isDark ? "text-white/40 hover:text-white/60" : "text-gray-400 hover:text-gray-600"
                    }`}
                    style={{
                      border: activeMarket === tab.key
                        ? isDark ? "1px solid rgba(234,179,8,0.4)" : "1px solid rgba(34,197,94,0.4)"
                        : "1px solid transparent"
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {activeMarketData && (
              <div className={`flex gap-1 ${activeMarketData.outcomes.length > 3 ? "flex-wrap" : ""}`}>
                {activeMarketData.outcomes.map((outcome: any) => {
                  const selected = isOutcomeSelected(outcome.name, activeMarket);
                  const displayOdd = getDisplayOdd(outcome.price, boostKeyForActive);
                  const originalOdd = outcome.price.toFixed(2);
                  const isBoosted = hasBoosted(boostKeyForActive);
                  return (
                    <button
                      key={outcome.name}
                      onClick={e => handleOddClick(e, outcome.name, outcome.price, activeMarket)}
                      className={`flex-1 flex flex-col items-center py-1.5 px-1 rounded transition-all min-w-0 ${
                        isLoggedOut ? "opacity-75" : "active:scale-95"
                      }`}
                      style={{
                        background: selected ? "rgba(234,179,8,0.18)" : isDark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.05)",
                        border: selected ? "1px solid rgba(234,179,8,0.6)" : isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
                      }}
                      data-testid={`button-odd-${game.id}-${activeMarket}-${outcome.name}`}
                    >
                      <span className={`text-[9px] truncate w-full text-center ${isDark ? "text-white/45" : "text-gray-500"}`}>
                        {outcome.name}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <span className={`text-xs font-bold ${isDark ? "text-[#f5c518]" : "text-green-600"}`}>
                          {displayOdd}
                        </span>
                        {isLoggedOut && <Lock className="w-2 h-2 text-gray-400" />}
                      </span>
                      {isBoosted && (
                        <span className={`text-[8px] line-through ${isDark ? "text-white/25" : "text-gray-400"}`}>
                          {originalOdd}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
