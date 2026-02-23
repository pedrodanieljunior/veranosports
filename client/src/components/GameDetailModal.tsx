import { Game, Selection } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, TrendingUp, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";

function calculateH2hBoostedOdd(originalOdd: number): number {
  return originalOdd * 1.15;
}

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
  // API-Football extra markets
  const extraMarketsQueryKey = game ? 
    `/api/football/extra-markets?homeTeam=${encodeURIComponent(game.homeTeam)}&awayTeam=${encodeURIComponent(game.awayTeam)}&commenceTime=${encodeURIComponent(game.commenceTime)}` : 
    null;
  
  const { data: extraMarkets, isLoading: loadingExtra, isError: errorExtra } = useQuery<ExtraMarketsResponse>({
    queryKey: [extraMarketsQueryKey],
    enabled: open && !!game && !!extraMarketsQueryKey,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  if (!game) return null;
  
  const gameDate = new Date(game.commenceTime);
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const isLive = gameDate <= now && gameDate >= twoHoursAgo;
  
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

  const handleOddClick = (outcomeName: string, originalOdds: number, marketKey: string, bookmaker: string) => {
    const finalOdds = marketKey === "h2h" ? calculateH2hBoostedOdd(originalOdds) : originalOdds;
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
    
    return (
      <div key={market.id} className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">{market.label}</span>
          <span className="text-xs text-gray-500">{bookmaker}</span>
        </div>
        <div className={`grid gap-2 ${market.values.length <= 2 ? 'grid-cols-2' : market.values.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {market.values.map((value) => {
            const outcomeKey = `${market.name}-${value.value}`;
            const selected = isSelected(outcomeKey, marketKey);
            
            let displayLabel = value.value;
            if (value.value === "Yes") displayLabel = "Sim";
            else if (value.value === "No") displayLabel = "Não";
            else if (value.value === "Home") displayLabel = game.homeTeam.substring(0, 10);
            else if (value.value === "Away") displayLabel = game.awayTeam.substring(0, 10);
            else if (value.value === "Draw") displayLabel = "Empate";
            else if (value.value === "Odd") displayLabel = "Ímpar";
            else if (value.value === "Even") displayLabel = "Par";
            else if (value.value.includes("Over")) displayLabel = value.value.replace("Over", "Mais ");
            else if (value.value.includes("Under")) displayLabel = value.value.replace("Under", "Menos ");
            
            return (
              <button
                key={value.value}
                onClick={() => handleOddClick(outcomeKey, value.odd, marketKey, bookmaker)}
                className={`flex flex-col items-center p-2.5 rounded-lg border-2 transition-all hover-elevate active-elevate-2 ${
                  selected
                    ? "bg-blue-50 border-blue-500"
                    : "bg-white border-gray-200 hover:border-gray-400"
                }`}
                data-testid={`button-modal-extra-${market.id}-${value.value}`}
              >
                <span className="text-xs text-gray-500 mb-1 text-center line-clamp-1">
                  {displayLabel}
                </span>
                <span className={`font-bold text-base ${selected ? "text-blue-600" : "text-gray-900"}`}>
                  {value.odd.toFixed(2)}
                </span>
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
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 bg-gray-100 text-gray-900 border-gray-300">
        <DialogHeader className="p-4 border-b border-gray-300 bg-gray-200/60">
          <div className="flex items-center gap-2 mb-2">
            {isLive ? (
              <Badge variant="destructive" className="animate-pulse">
                AO VIVO
              </Badge>
            ) : (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="w-3.5 h-3.5" />
                <span>{format(gameDate, "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
              </div>
            )}
            <Badge variant="secondary" className="text-xs bg-gray-200 text-gray-700">
              {game.sportTitle}
            </Badge>
          </div>
          <DialogTitle className="text-lg text-gray-900">
            {game.homeTeam} vs {game.awayTeam}
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Selecione uma odd para adicionar ao bilhete
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh]">
          <div className="p-4 space-y-6">
            {h2hMarket && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-800">
                    {marketLabels.h2h}
                  </span>
                  <span className="text-xs text-gray-500">{h2hMarket.bookmaker}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {h2hMarket.outcomes.map((outcome: any) => {
                    const selected = isSelected(outcome.name, "h2h");
                    const boostedOdd = calculateH2hBoostedOdd(outcome.price);
                    const isDraw = outcome.name === "Draw" || outcome.name === "Empate";
                    const isHome = outcome.name === game.homeTeam;
                    const displayName = isDraw ? "Empate" : 
                                        isHome ? game.homeTeam.substring(0, 10) : 
                                        game.awayTeam.substring(0, 10);
                    return (
                      <button
                        key={outcome.name}
                        onClick={() => handleOddClick(outcome.name, outcome.price, "h2h", h2hMarket.bookmaker)}
                        className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all hover-elevate active-elevate-2 ${
                          selected
                            ? "bg-blue-50 border-blue-500"
                            : "bg-white border-gray-200 hover:border-gray-400"
                        }`}
                        data-testid={`button-modal-h2h-${outcome.name}`}
                      >
                        <span className="text-xs text-gray-500 mb-1">
                          {displayName}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className={`font-bold text-lg ${selected ? "text-blue-600" : "text-gray-900"}`}>
                            {boostedOdd.toFixed(2)}
                          </span>
                          <TrendingUp className="w-3 h-3 text-green-500" />
                        </div>
                        <span className="text-[10px] text-gray-400 line-through">
                          {outcome.price.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            

            {/* Separator for API-Football extra markets */}
            {hasMainMarkets && (hasExtraMarkets || loadingExtra) && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-gray-300" />
                <span className="text-xs text-gray-500 font-medium">Mercados Extras</span>
                <div className="flex-1 h-px bg-gray-300" />
              </div>
            )}

            {/* Loading state for extra markets */}
            {loadingExtra && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">Carregando mercados extras...</span>
              </div>
            )}

            {/* Error state for extra markets */}
            {errorExtra && !isLoadingAny && (
              <div className="text-center py-4 text-gray-500">
                <p className="text-sm">Alguns mercados extras não puderam ser carregados</p>
              </div>
            )}

            {/* Extra markets from API-Football */}
            {hasExtraMarkets && extraMarkets.markets.map(renderExtraMarket)}
            
            {!hasMainMarkets && !hasExtraMarkets && !isLoadingAny && (
              <div className="text-center py-8 text-gray-500">
                <p>Nenhum mercado disponível para este jogo</p>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="p-3 border-t border-gray-300 bg-gray-200/60">
          <p className="text-xs text-gray-500 text-center">
            Resultado Final inclui bônus de +15%
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
