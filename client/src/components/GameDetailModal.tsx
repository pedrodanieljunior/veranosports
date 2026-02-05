import { Game, Selection } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, TrendingUp, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";

function calculateBoostedOdd(originalOdd: number): number {
  return originalOdd * 1.20;
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
          <span className="text-sm font-semibold">{market.label}</span>
          <span className="text-xs text-muted-foreground">{bookmaker}</span>
        </div>
        <div className={`grid gap-2 ${market.values.length <= 2 ? 'grid-cols-2' : market.values.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {market.values.map((value) => {
            const outcomeKey = `${market.name}-${value.value}`;
            const selected = isSelected(outcomeKey, marketKey);
            const boostedOdd = calculateBoostedOdd(value.odd);
            
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
                    ? "bg-primary/10 border-primary"
                    : "bg-card border-transparent hover:border-muted-foreground/20"
                }`}
                data-testid={`button-modal-extra-${market.id}-${value.value}`}
              >
                <span className="text-xs text-muted-foreground mb-1 text-center line-clamp-1">
                  {displayLabel}
                </span>
                <div className="flex items-center gap-1">
                  <span className={`font-bold text-base ${selected ? "text-primary" : ""}`}>
                    {boostedOdd.toFixed(2)}
                  </span>
                  <TrendingUp className="w-3 h-3 text-green-500" />
                </div>
                <span className="text-[10px] text-muted-foreground/60 line-through">
                  {value.odd.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const hasMainMarkets = h2hMarket || spreadMarket || totalsMarket;
  const hasExtraMarkets = extraMarkets?.markets && extraMarkets.markets.length > 0;
  const isLoadingAny = loadingExtra;

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
                    const isDraw = outcome.name === "Draw" || outcome.name === "Empate";
                    const isHome = outcome.name === game.homeTeam;
                    const label = isDraw ? "X" : isHome ? "1" : "2";
                    const displayName = isDraw ? "Empate" : 
                                        isHome ? game.homeTeam.substring(0, 10) : 
                                        game.awayTeam.substring(0, 10);
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
                          {displayName}
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

            {/* Separator for API-Football extra markets */}
            {hasMainMarkets && (hasExtraMarkets || loadingExtra) && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">Mercados Extras</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {/* Loading state for extra markets */}
            {loadingExtra && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Carregando mercados extras...</span>
              </div>
            )}

            {/* Error state for extra markets */}
            {errorExtra && !isLoadingAny && (
              <div className="text-center py-4 text-muted-foreground">
                <p className="text-sm">Alguns mercados extras não puderam ser carregados</p>
              </div>
            )}

            {/* Extra markets from API-Football */}
            {hasExtraMarkets && extraMarkets.markets.map(renderExtraMarket)}
            
            {!hasMainMarkets && !hasExtraMarkets && !isLoadingAny && (
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
