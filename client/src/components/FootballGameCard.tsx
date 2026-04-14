import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp, TrendingDown, Zap } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Selection } from "@shared/schema";
import { useMarketSettings } from "@/hooks/use-market-settings";

interface FootballFixture {
  id: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  league: string;
  odds: {
    name: string;
    values: { value: string; odd: number }[];
  }[];
}

interface FootballGameCardProps {
  fixture: FootballFixture;
  selections: Selection[];
  onToggleSelection: (selection: Selection) => void;
}

export function FootballGameCard({ fixture, selections, onToggleSelection }: FootballGameCardProps) {
  const gameDate = new Date(fixture.date);
  const { getBoostMultiplier, hasBoosted, getBoostPercent } = useMarketSettings();
  
  const matchWinner = fixture.odds.find(o => o.name === "Match Winner");
  const btts = fixture.odds.find(o => o.name === "Both Teams Score");
  const htFt = fixture.odds.find(o => o.name === "HT/FT Double");

  const gameSelections = selections.filter(s => s.gameId === String(fixture.id));
  const isDrawSelected = gameSelections.some(s => s.marketKey === "match_winner" && s.outcome.includes("-Draw"));
  const isBttsNoSelected = gameSelections.some(s => s.marketKey === "btts" && s.outcome.includes("-No"));

  const isCrossLocked = (marketKey: string, value: string): boolean => {
    if (marketKey === "match_winner" && value === "Draw") return isBttsNoSelected;
    if (marketKey === "btts" && value === "No") return isDrawSelected;
    return false;
  };
  
  const isSelected = (outcomeName: string, marketKey: string) => {
    return selections.some(
      s => s.gameId === String(fixture.id) && s.outcome === outcomeName && s.marketKey === marketKey
    );
  };

  const handleOddClick = (outcomeName: string, originalOdds: number, marketKey: string, marketName: string) => {
    const boostKey = marketKey === "match_winner" ? "h2h" : marketKey;
    const finalOdds = originalOdds * getBoostMultiplier(boostKey);
    const selection: Selection = {
      id: `${fixture.id}-${marketKey}-${outcomeName}`,
      gameId: String(fixture.id),
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      commenceTime: fixture.date,
      sportTitle: fixture.league,
      marketKey,
      bookmaker: "API-Football",
      outcome: `${marketName}: ${outcomeName}`,
      odds: finalOdds,
      result: "pending",
    };
    onToggleSelection(selection);
  };

  const renderMarket = (
    market: { name: string; values: { value: string; odd: number }[] } | undefined,
    marketKey: string,
    title: string,
    translateFn?: (value: string) => string
  ) => {
    if (!market || market.values.length === 0) return null;
    
    return (
      <div className="space-y-2 mt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </span>
          {marketKey === "match_winner" && (
            <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm shadow-amber-500/40">
              <Zap className="w-2.5 h-2.5 fill-black" />
              Super Aumento Apostas simples
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {market.values.slice(0, 6).map((outcome) => {
            const selected = isSelected(`${marketKey}-${outcome.value}`, marketKey);
            const boostKey = marketKey === "match_winner" ? "h2h" : marketKey;
            const isBoosted = hasBoosted(boostKey);
            const boostPct = getBoostPercent(boostKey);
            const displayOdd = isBoosted ? outcome.odd * getBoostMultiplier(boostKey) : outcome.odd;
            const displayValue = translateFn ? translateFn(outcome.value) : outcome.value;
            const crossLocked = !selected && isCrossLocked(marketKey, outcome.value);
            return (
              <button
                key={outcome.value}
                onClick={() => !crossLocked && handleOddClick(`${marketKey}-${outcome.value}`, outcome.odd, marketKey, title)}
                disabled={crossLocked}
                className={`relative flex flex-col items-center gap-1 p-3 rounded-md border transition-all ${
                  crossLocked
                    ? "bg-muted/30 border-transparent opacity-60 cursor-not-allowed"
                    : selected
                      ? "bg-primary/10 border-primary text-foreground hover-elevate active-elevate-2"
                      : "bg-muted/50 border-transparent hover-elevate active-elevate-2"
                }`}
                data-testid={`button-${marketKey}-${fixture.id}-${outcome.value}`}
              >
                {crossLocked && (
                  <span className="absolute top-1 right-1">
                    <Lock className="w-3 h-3 text-muted-foreground/60" />
                  </span>
                )}
                <span className="text-xs text-muted-foreground truncate w-full text-center">
                  {displayValue}
                </span>
                <div className="flex flex-col items-center">
                  <span className={`font-bold text-lg ${selected ? "text-primary" : ""}`}>
                    {displayOdd.toFixed(2)}
                  </span>
                  {isBoosted && (
                    <span className="text-[10px] text-muted-foreground/60 line-through flex items-center gap-0.5">
                      {outcome.odd.toFixed(2)}
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

  const translateMatchWinner = (value: string): string => {
    if (value === "Home") return fixture.homeTeam;
    if (value === "Away") return fixture.awayTeam;
    if (value === "Draw") return "Empate";
    return value;
  };

  const translateBtts = (value: string): string => {
    if (value === "Yes") return "Sim";
    if (value === "No") return "Não";
    return value;
  };

  return (
    <Card className="overflow-hidden" data-testid={`card-football-${fixture.id}`}>
      <CardContent className="p-0">
        <div className="p-4 border-b border-card-border bg-muted/30">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>{format(gameDate, "dd MMM HH:mm", { locale: ptBR })}</span>
              </div>
            </div>
            
            <Badge variant="secondary" className="text-xs">
              {fixture.league}
            </Badge>
          </div>
        </div>
        
        <div className="p-4">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {fixture.homeLogo && (
                    <img src={fixture.homeLogo} alt="" className="w-8 h-8 object-contain" />
                  )}
                  {!fixture.homeLogo && (
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-xs font-bold">
                      {fixture.homeTeam.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="font-medium truncate" data-testid={`text-home-team-${fixture.id}`}>
                    {fixture.homeTeam}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {fixture.awayLogo && (
                    <img src={fixture.awayLogo} alt="" className="w-8 h-8 object-contain" />
                  )}
                  {!fixture.awayLogo && (
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-xs font-bold">
                      {fixture.awayTeam.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="font-medium truncate" data-testid={`text-away-team-${fixture.id}`}>
                    {fixture.awayTeam}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {renderMarket(matchWinner, "match_winner", "Resultado Final", translateMatchWinner)}
          {renderMarket(btts, "btts", "Ambas Marcam", translateBtts)}
          {renderMarket(htFt, "ht_ft", "Intervalo / Final")}
          
          {!matchWinner && !btts && !htFt && (
            <div className="text-center py-4 text-muted-foreground">
              <p>Odds não disponíveis para este jogo</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
