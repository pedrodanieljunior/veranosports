import { Game, Selection } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { useMarketSettings } from "@/hooks/use-market-settings";

interface ExtraMarket {
  id: number;
  name: string;
  label: string;
  values: Array<{ value: string; odd: number }>;
}

interface ExtraMarketsResponse {
  fixtureId?: number;
  homeTeam?: string;
  awayTeam?: string;
  bookmaker?: string;
  markets: ExtraMarket[];
}

interface GameDetailModalProps {
  game: Game | null;
  open: boolean;
  onClose: () => void;
  selections: Selection[];
  onToggleSelection: (selection: Selection) => void;
}

export function GameDetailModal({ game, open, onClose, selections, onToggleSelection }: GameDetailModalProps) {
  const { getBoostMultiplier, hasBoosted, getBoostPercent } = useMarketSettings();

  const extraMarketsQueryKey = game ? 
    `/api/football/extra-markets?homeTeam=${encodeURIComponent(game.homeTeam)}&awayTeam=${encodeURIComponent(game.awayTeam)}&commenceTime=${encodeURIComponent(game.commenceTime)}&gameId=${encodeURIComponent(game.id)}` : 
    null;
  
  const { data: extraMarkets, isLoading: loadingExtra, isError: errorExtra } = useQuery<ExtraMarketsResponse>({
    queryKey: [extraMarketsQueryKey],
    enabled: open && !!game && !!extraMarketsQueryKey,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  if (!game) return null;
  
  const gameDate = new Date(game.commenceTime);
  
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
  
  const isSelected = (outcomeName: string, marketKey: string) => {
    return selections.some(
      s => s.gameId === game.id && s.outcome === outcomeName && s.marketKey === marketKey
    );
  };

  const selectionsForThisGame = selections.filter(s => s.gameId === game.id);
  const gameSelectionLimitReached = selectionsForThisGame.length >= 3;

  const isButtonDisabled = (outcomeName: string, marketKey: string) => {
    const selected = isSelected(outcomeName, marketKey);
    return !selected && gameSelectionLimitReached;
  };

  const marketKeyToBoostKey = (mk: string): string => {
    if (mk === "h2h") return "h2h";
    if (mk.startsWith("extra-")) {
      const id = mk.replace("extra-", "");
      const nameMap: Record<string, string> = {
        "1": "btts", "8": "btts",
        "2": "ht_ft", "5": "totals",
        "4": "exact_score",
        "3": "totals",
        "6": "first_to_score",
        "11": "corners",
        "15": "red_card",
      };
      return nameMap[id] || mk;
    }
    return mk;
  };

  const handleOddClick = (outcomeName: string, originalOdds: number, marketKey: string, bookmaker: string) => {
    const boostKey = marketKeyToBoostKey(marketKey);
    const finalOdds = originalOdds * getBoostMultiplier(boostKey);
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
      odds: finalOdds,
      result: "pending",
    };
    onToggleSelection(selection);
  };

  const marketLabels: Record<string, string> = {
    h2h: "Resultado Final (1X2)",
    spreads: "Handicap Asiático",
    totals: "Total de Gols"
  };

  const renderExtraMarket = (market: ExtraMarket) => {
    const bookmaker = extraMarkets?.bookmaker || "API-Football";
    const marketKey = `extra-${market.id}`;
    const boostKey = marketKeyToBoostKey(marketKey);
    const isBoosted = hasBoosted(boostKey);
    const boostPct = getBoostPercent(boostKey);
    
    return (
      <div key={market.id} className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-200">{market.label}</span>
        </div>
        <div className={`grid gap-2 ${market.values.length <= 2 ? 'grid-cols-2' : market.values.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {market.values.map((value) => {
            const outcomeKey = `${market.name}-${value.value}`;
            const selected = isSelected(outcomeKey, marketKey);
            const displayOdd = isBoosted ? value.odd * getBoostMultiplier(boostKey) : value.odd;
            
            const translateHalf = (part: string) => {
              if (part === "Home") return "Casa";
              if (part === "Away") return "Fora";
              if (part === "Draw") return "Empate";
              return part;
            };

            const isTeamToScoreFirst = market.name === "Team To Score First";
            let displayLabel = value.value;
            if (value.value === "Yes") displayLabel = "Sim";
            else if (value.value === "No") displayLabel = "Não";
            else if (value.value === "Home") displayLabel = game.homeTeam.substring(0, 10);
            else if (value.value === "Away") displayLabel = game.awayTeam.substring(0, 10);
            else if (value.value === "Draw" || value.value === "No Goal" || value.value === "Nenhum Gol") displayLabel = isTeamToScoreFirst ? "Nenhum" : "Empate";
            else if (value.value === "Nenhum") displayLabel = "Nenhum";
            else if (value.value === "Odd") displayLabel = "Ímpar";
            else if (value.value === "Even") displayLabel = "Par";
            else if (value.value.includes("Over")) displayLabel = value.value.replace("Over", "Mais ");
            else if (value.value.includes("Under")) displayLabel = value.value.replace("Under", "Menos ");
            else if (value.value.includes("/")) {
              const parts = value.value.split("/");
              displayLabel = parts.map(translateHalf).join("/");
            }
            
            const disabled = isButtonDisabled(outcomeKey, marketKey);
            return (
              <button
                key={value.value}
                onClick={() => !disabled && handleOddClick(outcomeKey, value.odd, marketKey, bookmaker)}
                disabled={disabled}
                className={`flex flex-col items-center p-2.5 rounded-lg border-2 transition-all ${
                  disabled
                    ? "bg-[#2a2a2a] border-[#333] opacity-40 cursor-not-allowed"
                    : selected
                      ? "bg-green-900/30 border-green-500 hover-elevate active-elevate-2"
                      : "bg-[#3a3a3a] border-[#4a4a4a] hover:border-[#666] hover-elevate active-elevate-2"
                }`}
                data-testid={`button-modal-extra-${market.id}-${value.value}`}
              >
                <span className="text-xs text-gray-400 mb-1 text-center line-clamp-1">
                  {displayLabel}
                </span>
                <div className="flex flex-col items-center">
                  <span className="font-bold text-base text-[#f5c518]">
                    {displayOdd.toFixed(2)}
                  </span>
                  {isBoosted && (
                    <span className="text-[10px] text-gray-500 line-through flex items-center gap-0.5">
                      {value.odd.toFixed(2)}
                      {boostPct > 0 ? <TrendingUp className="w-2.5 h-2.5 text-green-500" /> : <TrendingDown className="w-2.5 h-2.5 text-red-500" />}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const hasMainMarkets = !!h2hMarket;
  const hasExtraMarkets = extraMarkets?.markets && extraMarkets.markets.length > 0;
  const isLoadingAny = loadingExtra;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 bg-gradient-to-b from-[#333333] to-[#282828] text-gray-100 border-[#444]">
        <DialogHeader className="p-4 border-b border-[#444] bg-[#333333]">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              <span>{format(gameDate, "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
            </div>
            <Badge variant="secondary" className="text-xs bg-[#444] text-gray-300">
              {game.sportTitle}
            </Badge>
          </div>
          <DialogTitle className="text-lg text-gray-100">
            {game.homeTeam} vs {game.awayTeam}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400">
            Selecione uma odd para adicionar ao bilhete
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh]">
          <div className="p-4 space-y-6">
            {h2hMarket && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-200">
                    {marketLabels.h2h}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {h2hMarket.outcomes.map((outcome: any) => {
                    const selected = isSelected(outcome.name, "h2h");
                    const h2hBoosted = hasBoosted("h2h");
                    const h2hBoostPct = getBoostPercent("h2h");
                    const displayOdd = h2hBoosted ? outcome.price * getBoostMultiplier("h2h") : outcome.price;
                    const isDraw = outcome.name === "Draw" || outcome.name === "Empate";
                    const isHome = outcome.name === game.homeTeam;
                    const displayName = isDraw ? "Empate" : 
                                        isHome ? game.homeTeam.substring(0, 10) : 
                                        game.awayTeam.substring(0, 10);
                    const disabled = isButtonDisabled(outcome.name, "h2h");
                    return (
                      <button
                        key={outcome.name}
                        onClick={() => !disabled && handleOddClick(outcome.name, outcome.price, "h2h", h2hMarket.bookmaker)}
                        disabled={disabled}
                        className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${
                          disabled
                            ? "bg-[#2a2a2a] border-[#333] opacity-40 cursor-not-allowed"
                            : selected
                              ? "bg-green-900/30 border-green-500 hover-elevate active-elevate-2"
                              : "bg-[#3a3a3a] border-[#4a4a4a] hover:border-[#666] hover-elevate active-elevate-2"
                        }`}
                        data-testid={`button-modal-h2h-${outcome.name}`}
                      >
                        <span className="text-xs text-gray-400 mb-1">
                          {displayName}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-lg text-[#f5c518]">
                            {displayOdd.toFixed(2)}
                          </span>
                          {h2hBoosted && (h2hBoostPct > 0 ? <TrendingUp className="w-3 h-3 text-green-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />)}
                        </div>
                        {h2hBoosted && (
                          <span className="text-[10px] text-gray-500 line-through">
                            {outcome.price.toFixed(2)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            

            {/* Separator for API-Football extra markets */}
            {hasMainMarkets && (hasExtraMarkets || loadingExtra) && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-[#4a4a4a]" />
                <span className="text-xs text-gray-400 font-medium">Mercados Extras</span>
                <div className="flex-1 h-px bg-[#4a4a4a]" />
              </div>
            )}

            {/* Loading state for extra markets */}
            {loadingExtra && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-400">Carregando mercados extras...</span>
              </div>
            )}

            {/* Error state for extra markets */}
            {errorExtra && !isLoadingAny && (
              <div className="text-center py-4 text-gray-400">
                <p className="text-sm">Alguns mercados extras não puderam ser carregados</p>
              </div>
            )}

            {/* Extra markets from API-Football */}
            {hasExtraMarkets && extraMarkets.markets.map(renderExtraMarket)}
            
            {!hasMainMarkets && !hasExtraMarkets && !isLoadingAny && (
              <div className="text-center py-8 text-gray-400">
                <p>Nenhum mercado disponível para este jogo</p>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="p-3 border-t border-[#444] bg-[#282828] space-y-1">
          {gameSelectionLimitReached && (
            <p className="text-xs text-yellow-400 text-center font-semibold">
              Limite de 3 mercados por jogo atingido
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
