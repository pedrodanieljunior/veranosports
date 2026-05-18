import { useState, useEffect } from "react";
import { Game, Selection } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TeamBadge } from "@/components/TeamBadge";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, TrendingUp, TrendingDown, Loader2, Zap, Lock } from "lucide-react";
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
  onMigrateGameId?: (oldId: string, newId: string) => void;
}

type MarketTab = "todos" | "gols" | "escanteios" | "cartoes" | "intervalos";

const TABS: { id: MarketTab; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "gols", label: "Gols" },
  { id: "escanteios", label: "Escanteios" },
  { id: "cartoes", label: "Cartões" },
  { id: "intervalos", label: "Intervalos" },
];

const GOLS_MARKETS = [
  "Goals Over/Under", "Both Teams Score", "Results/Both Teams Score", "Team To Score First", "Exact Score",
  "Goals Over/Under First Half", "Total - Home", "Total - Away",
];
const ESCANTEIOS_MARKETS = [
  "Corners Over Under", "Total Corners",
  "Corners 1x2", "Corners Over Under First Half",
];
const CARTOES_MARKETS = ["Red Card In The Match (1st Half)", "Cards Over/Under", "Cards - Home", "Cards - Away"];
const INTERVALOS_MARKETS = ["First Half Winner", "Both Teams Score - First Half", "Both Teams To Score - Second Half", "HT/FT Double"];

// Lock groups: selecting any market from one group blocks all others in that group
// h2h (Resultado Final 1X2) belongs to the Gols group
const GOLS_INTERVALOS_LOCK = new Set(["h2h", "double_chance", "totals", ...GOLS_MARKETS, ...INTERVALOS_MARKETS]);
const ESCANTEIOS_LOCK = new Set(ESCANTEIOS_MARKETS);
const CARTOES_LOCK = new Set(CARTOES_MARKETS);

function getMarketLockGroup(marketKey: string): 'gols_intervalos' | 'escanteios' | 'cartoes' | null {
  if (GOLS_INTERVALOS_LOCK.has(marketKey)) return 'gols_intervalos';
  if (ESCANTEIOS_LOCK.has(marketKey)) return 'escanteios';
  if (CARTOES_LOCK.has(marketKey)) return 'cartoes';
  return null;
}

function matchesTab(marketName: string, tab: MarketTab): boolean {
  if (tab === "todos") return true;
  if (tab === "gols") return GOLS_MARKETS.some(m => marketName.includes(m) || m.includes(marketName));
  if (tab === "escanteios") return ESCANTEIOS_MARKETS.some(m => marketName.includes(m) || m.includes(marketName));
  if (tab === "cartoes") return CARTOES_MARKETS.includes(marketName);
  if (tab === "intervalos") return INTERVALOS_MARKETS.some(m => m === marketName);
  return false;
}

export function GameDetailModal({ game, open, onClose, selections, onToggleSelection, onMigrateGameId }: GameDetailModalProps) {
  const { getBoostMultiplier, hasBoosted, getBoostPercent } = useMarketSettings();
  const [activeTab, setActiveTab] = useState<MarketTab>("todos");

  useEffect(() => {
    if (open) setActiveTab("todos");
  }, [open]);

  const extraMarketsQueryKey = game ?
    `/api/football/extra-markets?homeTeam=${encodeURIComponent(game.homeTeam)}&awayTeam=${encodeURIComponent(game.awayTeam)}&commenceTime=${encodeURIComponent(game.commenceTime)}&gameId=${encodeURIComponent(game.id)}` :
    null;

  const { data: extraMarkets, isLoading: loadingExtra, isError: errorExtra } = useQuery<ExtraMarketsResponse>({
    queryKey: [extraMarketsQueryKey],
    enabled: open && !!game && !!extraMarketsQueryKey,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (extraMarkets?.fixtureId && game && onMigrateGameId) {
      const newId = `api-football-${extraMarkets.fixtureId}`;
      if (game.id !== newId) {
        onMigrateGameId(game.id, newId);
      }
    }
  }, [extraMarkets?.fixtureId, game?.id]);

  if (!game) return null;

  const gameDate = new Date(game.commenceTime);

  const allMarkets: Record<string, { outcomes: any[]; bookmaker: string }> = {};
  game.bookmakers.forEach((bookmaker) => {
    bookmaker.markets.forEach((market) => {
      if (!allMarkets[market.key]) {
        allMarkets[market.key] = { outcomes: market.outcomes, bookmaker: bookmaker.title };
      }
    });
  });

  const h2hMarket = allMarkets["h2h"];

  const effectiveGameId = extraMarkets?.fixtureId
    ? `api-football-${extraMarkets.fixtureId}`
    : game.id;

  const isSelected = (outcomeName: string, marketKey: string) =>
    selections.some(s =>
      (s.gameId === effectiveGameId || s.gameId === game.id) &&
      s.outcome === outcomeName && s.marketKey === marketKey
    );

  const selectionsForThisGame = selections.filter(s =>
    s.gameId === effectiveGameId || s.gameId === game.id
  );
  const distinctMarketsForThisGame = new Set(selectionsForThisGame.map(s => s.marketKey)).size;
  const gameSelectionLimitReached = distinctMarketsForThisGame >= 3;

  const marketKeyToBoostKey = (mk: string): string => {
    if (mk === "h2h") return "h2h";
    if (mk === "double_chance") return "double_chance"; // sem boost — usa odd raw do bookmaker
    if (mk === "totals") return "totals";
    const nameToBoostKey: Record<string, string> = {
      "Both Teams Score": "btts",
      "HT/FT Double": "ht_ft",
      "Goals Over/Under": "totals",
      "Goals Over/Under First Half": "first_half_goals",
      "Total - Home": "team_goals",
      "Total - Away": "team_goals",
      "Exact Score": "exact_score",
      "Team To Score First": "first_to_score",
      "Corners Over Under": "corners",
      "Total Corners": "corners",
      "Corners 1x2": "corners_winner",
      "Corners Over Under First Half": "first_half_corners",
      "Cards Over/Under": "cards",
      "Cards - Home": "cards_home",
      "Cards - Away": "cards_away",
      "First Half Winner": "first_half_result",
      "Red Card In The Match (1st Half)": "red_card_1h",
      "Results/Both Teams Score": "result_btts",
      "Both Teams Score - First Half": "btts_1h",
      "Both Teams To Score - Second Half": "btts_2h",
    };
    if (nameToBoostKey[mk]) return nameToBoostKey[mk];
    if (mk.startsWith("extra-")) {
      const id = mk.replace("extra-", "");
      const idMap: Record<string, string> = {
        "1": "btts", "8": "btts",
        "2": "ht_ft", "9": "ht_ft",
        "5": "totals",
        "4": "exact_score", "11": "exact_score",
        "6": "first_to_score",
        "45": "corners", "46": "corners",
      };
      return idMap[id] || mk;
    }
    return mk;
  };

  const CORRELATED_BOOST_KEYS = new Set(["h2h", "totals", "btts"]);

  const isCorrelatedLocked = (boostKey: string): boolean => {
    if (!CORRELATED_BOOST_KEYS.has(boostKey)) return false;
    const selectedCorrelated = new Set(
      selectionsForThisGame
        .map(s => marketKeyToBoostKey(s.marketKey))
        .filter(k => CORRELATED_BOOST_KEYS.has(k))
    );
    return selectedCorrelated.size >= 2 && !selectedCorrelated.has(boostKey);
  };

  const isGroupLocked = (marketKey: string): boolean => {
    const group = getMarketLockGroup(marketKey);
    if (!group) return false;
    return selectionsForThisGame.some(s => {
      if (s.marketKey === marketKey) return false;
      return getMarketLockGroup(s.marketKey) === group;
    });
  };

  const isButtonDisabled = (outcomeName: string, marketKey: string) => {
    const selected = isSelected(outcomeName, marketKey);
    if (selected) return false;
    const sameMarketHasSelection = selectionsForThisGame.some(s => s.marketKey === marketKey);
    if (sameMarketHasSelection) return true;
    if (isGroupLocked(marketKey)) return true;
    const boostKey = marketKeyToBoostKey(marketKey);
    return gameSelectionLimitReached || isCorrelatedLocked(boostKey);
  };

  const isMarketGroupLocked = (marketKey: string): boolean => {
    const selected = selectionsForThisGame.some(s => s.marketKey === marketKey);
    return !selected && isGroupLocked(marketKey);
  };

  const handleOddClick = (outcomeName: string, originalOdds: number, marketKey: string, bookmaker: string) => {
    const boostKey = marketKeyToBoostKey(marketKey);
    const finalOdds = Math.round(originalOdds * getBoostMultiplier(boostKey) * 100) / 100;
    const selection: Selection = {
      id: `${effectiveGameId}-${marketKey}-${outcomeName}`,
      gameId: effectiveGameId,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      commenceTime: game.commenceTime,
      sportTitle: game.sportTitle,
      marketKey,
      bookmaker,
      outcome: outcomeName,
      odds: finalOdds,
      originalOdds,
      result: "pending",
    };
    onToggleSelection(selection);
  };

  const renderExtraMarket = (market: ExtraMarket) => {
    const bookmaker = extraMarkets?.bookmaker || "API-Football";
    const marketKey = market.name;
    const boostKey = marketKeyToBoostKey(marketKey);
    const isBoosted = hasBoosted(boostKey);
    const boostPct = getBoostPercent(boostKey);

    const filteredValues = market.values.filter((value) => {
      if (market.name === "Team To Score First") {
        return !["Draw", "No Goal", "Nenhum Gol", "Nenhum"].includes(value.value);
      }
      if (market.name === "Corners Over Under" || market.name === "Total Corners") {
        return ["Over 8.5", "Under 8.5", "Over 9.5", "Under 9.5", "Over 10.5", "Under 10.5"].includes(value.value);
      }
      if (market.name === "Corners Over Under First Half") {
        return ["Over 4.5", "Under 4.5", "Over 5.5", "Under 5.5", "Over 6.5", "Under 6.5"].includes(value.value);
      }
      if (market.name === "Cards Over/Under") {
        const m = value.value.match(/^(Over|Under)\s+([\d.]+)$/i);
        if (!m) return false;
        const line = parseFloat(m[2]);
        return line % 1 === 0.5 && line >= 1.5 && line <= 9.5;
      }
      if (market.name === "Cards - Home" || market.name === "Cards - Away") {
        const m = value.value.match(/^(Over|Under)\s+([\d.]+)$/i);
        if (!m) return false;
        const line = parseFloat(m[2]);
        return line % 1 === 0.5 && line >= 0.5 && line <= 6.5;
      }
      if (market.name === "Goals Over/Under First Half") {
        return ["Over 0.5", "Under 0.5", "Over 1.5", "Under 1.5", "Over 2.5", "Under 2.5"].includes(value.value);
      }
      if (market.name === "Total - Home" || market.name === "Total - Away") {
        return ["Over 0.5", "Under 0.5", "Over 1.5", "Under 1.5", "Over 2.5", "Under 2.5"].includes(value.value);
      }
      return true;
    });

    if (filteredValues.length === 0) return null;
    const colClass = filteredValues.length <= 2 ? 'grid-cols-2' : filteredValues.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3';

    const translateHalf = (part: string) => {
      if (part === "Home") return "Casa";
      if (part === "Away") return "Fora";
      if (part === "Draw") return "Empate";
      if (part === "Yes") return "Sim";
      if (part === "No") return "Não";
      return part;
    };

    const groupLocked = isMarketGroupLocked(marketKey);

    return (
      <div key={market.id} className="space-y-3">
        <span className="text-sm font-semibold text-gray-200">{market.label}</span>
        <div className={`grid gap-2 ${colClass}`}>
          {filteredValues.map((value) => {
            const outcomeKey = `${market.name}-${value.value}`;
            const selected = isSelected(outcomeKey, marketKey);
            const displayOdd = isBoosted ? value.odd * getBoostMultiplier(boostKey) : value.odd;
            const isTeamToScoreFirst = market.name === "Team To Score First";
            let displayLabel = value.value;
            if (value.value === "Yes") displayLabel = "Sim";
            else if (value.value === "No") displayLabel = "Não";
            else if (value.value === "Home") displayLabel = game.homeTeam.substring(0, 10);
            else if (value.value === "Away") displayLabel = game.awayTeam.substring(0, 10);
            else if (value.value === "Draw" || value.value === "No Goal" || value.value === "Nenhum Gol") displayLabel = isTeamToScoreFirst ? "Nenhum" : "Empate";
            else if (value.value === "Nenhum") displayLabel = "Nenhum";
            else if (value.value === "No Corner") displayLabel = "Sem Escanteio";
            else if (value.value === "Odd") displayLabel = "Ímpar";
            else if (value.value === "Even") displayLabel = "Par";
            else if (value.value.includes("Over")) displayLabel = value.value.replace("Over", "Mais ");
            else if (value.value.includes("Under")) displayLabel = value.value.replace("Under", "Menos ");
            else if (value.value.includes("/")) {
              const parts = value.value.split("/");
              displayLabel = parts.map(translateHalf).join("/");
            }

            const disabled = isButtonDisabled(outcomeKey, marketKey);
            const correlatedLocked = !selected && isCorrelatedLocked(boostKey);
            const showLock = !selected && (groupLocked || correlatedLocked);
            return (
              <button
                key={value.value}
                onClick={() => !disabled && handleOddClick(outcomeKey, value.odd, marketKey, bookmaker)}
                disabled={disabled}
                className={`relative flex flex-col items-center p-2.5 rounded-lg border-2 transition-all ${
                  disabled
                    ? (groupLocked || correlatedLocked)
                      ? "bg-[#2a2a2a] border-[#444] opacity-60 cursor-not-allowed"
                      : "bg-[#2a2a2a] border-[#333] opacity-40 cursor-not-allowed"
                    : selected
                      ? "bg-green-900/30 border-green-500 hover-elevate active-elevate-2"
                      : "bg-[#3a3a3a] border-[#4a4a4a] hover:border-[#666] hover-elevate active-elevate-2"
                }`}
                data-testid={`button-modal-extra-${market.id}-${value.value}`}
              >
                {showLock && (
                  <span className="absolute top-1 right-1">
                    <Lock className="w-3 h-3 text-gray-400" />
                  </span>
                )}
                <span className="text-xs text-gray-400 mb-1 text-center line-clamp-1">{displayLabel}</span>
                <div className="flex flex-col items-center">
                  <span className="font-bold text-base text-[#f5c518]">{displayOdd.toFixed(2)}</span>
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

  const showBasicMarkets = activeTab === "todos" || activeTab === "gols";
  const showH2h = showBasicMarkets;

  const dcMarket = showBasicMarkets ? allMarkets["double_chance"] : null;
  const totalsMarket = showBasicMarkets ? allMarkets["totals"] : null;

  // Exclude "Goals Over/Under" from extra markets — already shown via totalsMarket
  const filteredExtraMarkets = (extraMarkets?.markets.filter(m => matchesTab(m.name, activeTab) && m.name !== "Goals Over/Under") ?? []).sort((a, b) => {
    if (activeTab === "intervalos") {
      return INTERVALOS_MARKETS.indexOf(a.name) - INTERVALOS_MARKETS.indexOf(b.name);
    }
    return 0;
  });
  const hasContent = (showH2h && !!h2hMarket) || !!dcMarket || !!totalsMarket || filteredExtraMarkets.length > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 bg-gradient-to-b from-[#333333] to-[#282828] text-gray-100 border-[#444]">
        <DialogHeader className="p-4 pb-0 border-b border-[#444] bg-[#333333]">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              <span>{format(gameDate, "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
            </div>
            <Badge variant="secondary" className="text-xs bg-[#444] text-gray-300">
              {game.sportTitle}
            </Badge>
          </div>
          <DialogTitle className="text-base text-gray-100">
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <TeamBadge teamName={game.homeTeam} logoUrl={game.homeLogo} size={22} />
                <span className="truncate">{game.homeTeam}</span>
              </div>
              <span className="text-gray-400 font-normal text-sm shrink-0">vs</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <TeamBadge teamName={game.awayTeam} logoUrl={game.awayLogo} size={22} />
                <span className="truncate">{game.awayTeam}</span>
              </div>
            </div>
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-400 !mt-5 mb-3">
            Selecione uma odd para adicionar ao bilhete
          </DialogDescription>

          {/* Tab bar */}
          <div className="flex gap-1 overflow-x-auto pb-0 -mx-4 px-4 scrollbar-none">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-yellow-400 text-yellow-400 bg-[#282828]"
                    : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#2a2a2a]"
                }`}
                data-testid={`tab-market-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh]">
          <div className="p-4 space-y-6">

            {/* H2H market — shown on Todos tab */}
            {showH2h && h2hMarket && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-200">Resultado Final (1X2)</span>
                  <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm shadow-amber-500/40">
                    <Zap className="w-2.5 h-2.5 fill-black" />
                    Super Aumento Apostas simples
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {h2hMarket.outcomes.map((outcome: any) => {
                    const selected = isSelected(outcome.name, "h2h");
                    const h2hBoosted = hasBoosted("h2h");
                    const h2hBoostPct = getBoostPercent("h2h");
                    const displayOdd = Math.round((h2hBoosted ? outcome.price * getBoostMultiplier("h2h") : outcome.price) * 100) / 100;
                    const isDraw = outcome.name === "Draw" || outcome.name === "Empate";
                    const isHome = outcome.name === game.homeTeam;
                    const displayName = isDraw ? "Empate" : isHome ? game.homeTeam.substring(0, 10) : game.awayTeam.substring(0, 10);
                    const disabled = isButtonDisabled(outcome.name, "h2h");
                    const correlatedLocked = !selected && isCorrelatedLocked("h2h");
                    return (
                      <button
                        key={outcome.name}
                        onClick={() => !disabled && handleOddClick(outcome.name, outcome.price, "h2h", h2hMarket.bookmaker)}
                        disabled={disabled}
                        className={`relative flex flex-col items-center p-3 rounded-lg border-2 transition-all ${
                          disabled
                            ? correlatedLocked
                              ? "bg-[#2a2a2a] border-[#444] opacity-60 cursor-not-allowed"
                              : "bg-[#2a2a2a] border-[#333] opacity-40 cursor-not-allowed"
                            : selected
                              ? "bg-green-900/30 border-green-500 hover-elevate active-elevate-2"
                              : "bg-[#3a3a3a] border-[#4a4a4a] hover:border-[#666] hover-elevate active-elevate-2"
                        }`}
                        data-testid={`button-modal-h2h-${outcome.name}`}
                      >
                        {correlatedLocked && !selected && (
                          <span className="absolute top-1.5 right-1.5">
                            <Lock className="w-3 h-3 text-gray-400" />
                          </span>
                        )}
                        <span className="text-xs text-gray-400 mb-1">{displayName}</span>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-lg text-[#f5c518]">{displayOdd.toFixed(2)}</span>
                          {h2hBoosted && (h2hBoostPct > 0 ? <TrendingUp className="w-3 h-3 text-green-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />)}
                        </div>
                        {h2hBoosted && (
                          <span className="text-[10px] text-gray-500 line-through">{outcome.price.toFixed(2)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dupla Chance market — no boost, always shows raw odds */}
            {dcMarket && (() => {
              const DC_LABELS: Record<string, string> = { "1X": "Casa ou Empate", "X2": "Empate ou Fora", "12": "Casa ou Fora" };
              return (
                <div className="space-y-3">
                  <span className="text-sm font-semibold text-gray-200">Dupla Chance</span>
                  <div className="grid grid-cols-3 gap-2">
                    {dcMarket.outcomes.map((outcome: any) => {
                      const selected = isSelected(outcome.name, "double_chance");
                      const disabled = isButtonDisabled(outcome.name, "double_chance");
                      const groupLocked = isMarketGroupLocked("double_chance");
                      return (
                        <button
                          key={outcome.name}
                          onClick={() => !disabled && handleOddClick(outcome.name, outcome.price, "double_chance", dcMarket.bookmaker)}
                          disabled={disabled}
                          className={`relative flex flex-col items-center p-2.5 rounded-lg border-2 transition-all ${
                            disabled
                              ? groupLocked ? "bg-[#2a2a2a] border-[#444] opacity-60 cursor-not-allowed" : "bg-[#2a2a2a] border-[#333] opacity-40 cursor-not-allowed"
                              : selected ? "bg-green-900/30 border-green-500 hover-elevate active-elevate-2" : "bg-[#3a3a3a] border-[#4a4a4a] hover:border-[#666] hover-elevate active-elevate-2"
                          }`}
                          data-testid={`button-modal-dc-${outcome.name}`}
                        >
                          {groupLocked && !selected && <span className="absolute top-1 right-1"><Lock className="w-3 h-3 text-gray-400" /></span>}
                          <span className="text-[10px] text-gray-400 mb-1 text-center font-bold">{outcome.name}</span>
                          <span className="text-[9px] text-gray-500 mb-1 text-center leading-tight">{DC_LABELS[outcome.name] || outcome.name}</span>
                          <span className="font-bold text-base text-[#f5c518]">{outcome.price.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Totals (+/- Gols) market */}
            {totalsMarket && (() => {
              const totBoosted = hasBoosted("totals");
              const totMult = getBoostMultiplier("totals");
              const totBoostPct = getBoostPercent("totals");

              // Group into pairs: [{ line: "0.5", mais: outcome, menos: outcome }, ...]
              const lineMap = new Map<string, { mais?: any; menos?: any }>();
              totalsMarket.outcomes.forEach((o: any) => {
                const parts = o.name.split(" ");
                const line = parts[1];
                if (!lineMap.has(line)) lineMap.set(line, {});
                const entry = lineMap.get(line)!;
                if (o.name.startsWith("Mais")) entry.mais = o;
                else entry.menos = o;
              });
              const lines = Array.from(lineMap.entries()).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

              return (
                <div className="space-y-3">
                  <span className="text-sm font-semibold text-gray-200">Mais ou Menos Gols</span>
                  <div className="space-y-1.5">
                    {/* Header row */}
                    <div className="grid grid-cols-3 gap-2 mb-1">
                      <div className="text-[10px] text-gray-500 text-center">Linha</div>
                      <div className="text-[10px] text-gray-500 text-center">Mais</div>
                      <div className="text-[10px] text-gray-500 text-center">Menos</div>
                    </div>
                    {lines.map(([line, { mais, menos }]) => (
                      <div key={line} className="grid grid-cols-3 gap-2 items-center">
                        <div className="text-xs text-gray-300 font-medium text-center">{line}</div>
                        {[mais, menos].map((outcome, idx) => {
                          if (!outcome) return <div key={idx} />;
                          const selected = isSelected(outcome.name, "totals");
                          const displayOdd = Math.round((totBoosted ? outcome.price * totMult : outcome.price) * 100) / 100;
                          const disabled = isButtonDisabled(outcome.name, "totals");
                          return (
                            <button
                              key={outcome.name}
                              onClick={() => !disabled && handleOddClick(outcome.name, outcome.price, "totals", totalsMarket.bookmaker)}
                              disabled={disabled}
                              className={`flex flex-col items-center py-2 px-1 rounded-lg border-2 transition-all ${
                                disabled ? "bg-[#2a2a2a] border-[#333] opacity-40 cursor-not-allowed"
                                  : selected ? "bg-green-900/30 border-green-500 hover-elevate active-elevate-2"
                                  : "bg-[#3a3a3a] border-[#4a4a4a] hover:border-[#666] hover-elevate active-elevate-2"
                              }`}
                              data-testid={`button-modal-totals-${outcome.name}`}
                            >
                              <span className="font-bold text-sm text-[#f5c518]">{displayOdd.toFixed(2)}</span>
                              {totBoosted && (
                                <span className="text-[9px] text-gray-500 line-through flex items-center gap-0.5">
                                  {outcome.price.toFixed(2)}
                                  {totBoostPct > 0 ? <TrendingUp className="w-2 h-2 text-green-500" /> : <TrendingDown className="w-2 h-2 text-red-500" />}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Divider between main and extra markets */}
            {showH2h && h2hMarket && filteredExtraMarkets.length > 0 && (
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-[#4a4a4a]" />
                <span className="text-xs text-gray-400 font-medium">Mercados Extras</span>
                <div className="flex-1 h-px bg-[#4a4a4a]" />
              </div>
            )}

            {/* Loading state */}
            {loadingExtra && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-400">Carregando mercados...</span>
              </div>
            )}

            {/* Error state */}
            {errorExtra && !loadingExtra && (
              <div className="text-center py-4 text-gray-400">
                <p className="text-sm">Alguns mercados não puderam ser carregados</p>
              </div>
            )}

            {/* Filtered extra markets */}
            {filteredExtraMarkets.map(renderExtraMarket)}

            {/* Empty state */}
            {!loadingExtra && !hasContent && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">Nenhum mercado disponível nesta categoria</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-[#444] bg-[#282828]">
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
