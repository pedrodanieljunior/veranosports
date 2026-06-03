import { useQuery } from "@tanstack/react-query";
import { useRef, useEffect, useState } from "react";
import { Selection } from "@shared/schema";
import { Zap, Clock, TrendingUp, TrendingDown } from "lucide-react";

const FIXTURE_ID = 1536930;
const GAME_ID = `api-football-${FIXTURE_ID}`;

const MARKET_LABELS: Record<number, string> = {
  1: "Resultado Final",
  5: "Gols Over/Under",
  8: "Ambas Marcam",
  13: "Vencedor 1º Tempo",
  12: "Dupla Chance",
  3: "Vencedor 2º Tempo",
  6: "Over/Under 1º Tempo",
};

const OUTCOME_LABELS: Record<string, string> = {
  Home: "1",
  Draw: "X",
  Away: "2",
  Yes: "Sim",
  No: "Não",
  "Home/Draw": "1X",
  "Home/Away": "12",
  "Draw/Away": "X2",
};

interface LiveData {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long: string; elapsed: number | null };
    elapsed: number | null;
  };
  teams: {
    home: { name: string; logo: string };
    away: { name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
  markets: Array<{
    id: number;
    name: string;
    values: Array<{ value: string; odd: number }>;
  }>;
  fetchedAt: number;
}


function selId(gameId: string, marketId: number, value: string) {
  return `live-${gameId}-m${marketId}-${value.replace(/\s+/g, "_")}`;
}

function isSelected(selections: Selection[], id: string) {
  return selections.some(s => s.id === id);
}

function StatusBadge({ status, elapsed }: { status: string; elapsed: number | null }) {
  const live = ["1H", "HT", "2H", "ET", "BT", "P", "INT"].includes(status);
  const finished = ["FT", "AET", "PEN"].includes(status);
  const upcoming = status === "NS";

  if (upcoming) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 text-[10px] font-bold border border-yellow-500/30">
      <Clock className="w-2.5 h-2.5" /> Em breve
    </span>
  );
  if (finished) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 text-[10px] font-bold border border-gray-500/30">
      Encerrado
    </span>
  );
  if (live) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold border border-red-500/30 animate-pulse">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
      {elapsed != null ? `${elapsed}'` : status}
    </span>
  );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 text-[10px] font-bold border border-gray-500/30">
      {status}
    </span>
  );
}

interface Props {
  selections: Selection[];
  onToggleSelection: (sel: Selection) => void;
  isDark?: boolean;
}

export function LiveTestCard({ selections, onToggleSelection, isDark = true }: Props) {
  const { data, isLoading, error } = useQuery<LiveData>({
    queryKey: ["/api/football/live-test"],
    queryFn: () => fetch("/api/football/live-test").then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
    refetchInterval: 15 * 1000,
    refetchIntervalInBackground: false,
    staleTime: 12 * 1000,
    retry: 2,
  });

  // Track odd movements: key = "m{marketId}-{value}", value = "up"|"down"|null
  const prevOdds = useRef<Record<string, number>>({});
  const [oddMovements, setOddMovements] = useState<Record<string, "up" | "down">>({});
  const clearTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!data?.markets) return;
    const changes: Record<string, "up" | "down"> = {};

    for (const market of data.markets) {
      for (const v of market.values) {
        const key = `m${market.id}-${v.value}`;
        const prev = prevOdds.current[key];
        if (prev !== undefined && prev !== v.odd) {
          changes[key] = v.odd > prev ? "up" : "down";
          // Clear any existing timer for this key
          if (clearTimers.current[key]) clearTimeout(clearTimers.current[key]);
          // Remove the indicator after 4 seconds
          clearTimers.current[key] = setTimeout(() => {
            setOddMovements(m => { const next = { ...m }; delete next[key]; return next; });
          }, 4000);
        }
        prevOdds.current[key] = v.odd;
      }
    }

    if (Object.keys(changes).length > 0) {
      setOddMovements(prev => ({ ...prev, ...changes }));
    }
  }, [data?.fetchedAt]);

  const containerCls = isDark
    ? "bg-[#1a1a2e]/80 border border-white/10 rounded-xl overflow-hidden"
    : "bg-white/90 border border-black/10 rounded-xl overflow-hidden shadow-sm";

  const headerCls = isDark ? "bg-red-500/10 border-b border-red-500/20" : "bg-red-50 border-b border-red-200";
  const teamCls = isDark ? "text-white font-bold" : "text-gray-900 font-bold";
  const scoreCls = isDark ? "text-white font-black text-2xl" : "text-gray-900 font-black text-2xl";
  const marketTitleCls = isDark ? "text-gray-400 font-semibold text-[11px] uppercase tracking-wide" : "text-gray-500 font-semibold text-[11px] uppercase tracking-wide";

  if (isLoading) {
    return (
      <div className={containerCls}>
        <div className={`flex items-center gap-2 px-4 py-2 ${headerCls}`}>
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span className="text-red-400 font-bold text-xs">JOGOS AO VIVO</span>
        </div>
        <div className="px-4 py-6 text-center text-gray-500 text-sm">Carregando...</div>
      </div>
    );
  }

  if (error || !data || !data.fixture) {
    return (
      <div className={containerCls}>
        <div className={`flex items-center gap-2 px-4 py-2 ${headerCls}`}>
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-red-400 font-bold text-xs">JOGOS AO VIVO</span>
        </div>
        <div className="px-4 py-4 text-center text-gray-500 text-xs">Dados indisponíveis no momento.</div>
      </div>
    );
  }

  const st = data.fixture.status.short;
  const isLive = ["1H", "HT", "2H", "ET", "BT", "P", "INT"].includes(st);
  const isFinished = ["FT", "AET", "PEN"].includes(st);
  const homeGoals = data.goals.home ?? 0;
  const awayGoals = data.goals.away ?? 0;

  const commenceTime = data.fixture.date;

  return (
    <div className={containerCls} data-testid="card-live-test">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2 ${headerCls}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isLive ? "bg-red-400 animate-pulse" : "bg-gray-400"}`} />
          <span className="text-red-400 font-bold text-xs tracking-widest">JOGOS AO VIVO</span>
          <span className="text-gray-500 text-[10px]">• Teste em Tempo Real</span>
        </div>
        <StatusBadge status={st} elapsed={data.fixture.elapsed} />
      </div>

      {/* Score row */}
      <div className="flex items-center justify-between px-4 py-4 gap-3">
        {/* Home team */}
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          {data.teams.home.logo && (
            <img src={data.teams.home.logo} alt={data.teams.home.name} className="w-10 h-10 object-contain" />
          )}
          <span className={`text-sm ${teamCls} text-center leading-tight`}>{data.teams.home.name}</span>
        </div>

        {/* Score */}
        <div className="flex flex-col items-center shrink-0 px-2">
          {isLive || isFinished ? (
            <span className={scoreCls}>{homeGoals} – {awayGoals}</span>
          ) : (
            <span className="text-gray-500 font-bold text-lg">vs</span>
          )}
          {isLive && data.fixture.elapsed != null && (
            <span className="text-red-400 text-[10px] font-bold mt-0.5 animate-pulse">{data.fixture.elapsed}'</span>
          )}
          {!isLive && !isFinished && (
            <span className="text-gray-500 text-[10px] mt-0.5">
              {new Date(commenceTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} (Manaus)
            </span>
          )}
        </div>

        {/* Away team */}
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          {data.teams.away.logo && (
            <img src={data.teams.away.logo} alt={data.teams.away.name} className="w-10 h-10 object-contain" />
          )}
          <span className={`text-sm ${teamCls} text-center leading-tight`}>{data.teams.away.name}</span>
        </div>
      </div>

      {/* Markets */}
      {data.markets.length > 0 && !isFinished && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          {data.markets.map(market => {
            const label = MARKET_LABELS[market.id] ?? market.name;
            const showValues = market.values.filter(v => {
              if (market.id === 5) {
                // Over/Under: only show 2.5
                return v.value === "Over 2.5" || v.value === "Under 2.5";
              }
              return true;
            });

            return (
              <div key={market.id} className="text-center">
                <p className={`mb-1.5 ${marketTitleCls}`}>{label}</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {showValues.map(v => {
                    const rawOdd = v.odd;
                    const id = selId(GAME_ID, market.id, v.value);
                    const moveKey = `m${market.id}-${v.value}`;
                    const movement = oddMovements[moveKey];
                    const sel: Selection = {
                      id,
                      gameId: GAME_ID,
                      homeTeam: data.teams.home.name,
                      awayTeam: data.teams.away.name,
                      commenceTime,
                      sportTitle: "Futebol Ao Vivo",
                      marketKey: `live_m${market.id}`,
                      bookmaker: "API-Football",
                      outcome: v.value,
                      odds: rawOdd,
                      result: "pending",
                    };
                    const active = isSelected(selections, id);
                    const outcomeLabel = OUTCOME_LABELS[v.value] ?? v.value;

                    return (
                      <button
                        key={v.value}
                        data-testid={`button-live-${market.id}-${v.value.replace(/\s/g, "_")}`}
                        onClick={() => onToggleSelection(sel)}
                        className={`relative flex flex-col items-center px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors min-w-[60px] ${
                          movement === "up"
                            ? active ? "bg-yellow-400 border-green-400 text-black" : "border-green-500/60 " + (isDark ? "bg-green-500/10 text-white" : "bg-green-50 text-gray-800")
                            : movement === "down"
                            ? active ? "bg-yellow-400 border-red-400 text-black" : "border-red-500/60 " + (isDark ? "bg-red-500/10 text-white" : "bg-red-50 text-gray-800")
                            : active
                            ? "bg-yellow-400 border-yellow-400 text-black"
                            : isDark
                            ? "bg-white/5 border-white/15 text-white hover:bg-white/10"
                            : "bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100"
                        }`}
                      >
                        <span className="text-[10px] opacity-70 font-normal">{outcomeLabel}</span>
                        <div className="flex items-center gap-0.5">
                          <span className="text-sm font-black">{rawOdd.toFixed(2)}</span>
                          {movement === "up" && (
                            <TrendingUp className="w-3 h-3 text-green-400 animate-bounce" />
                          )}
                          {movement === "down" && (
                            <TrendingDown className="w-3 h-3 text-red-400 animate-bounce" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isFinished && (
        <div className="px-4 pb-4 text-center text-gray-500 text-xs border-t border-white/5 pt-3">
          Jogo encerrado · {homeGoals} – {awayGoals}
        </div>
      )}

      {/* Footer: updated at */}
      <div className="px-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-gray-600 text-[9px]">
          <Zap className="w-2.5 h-2.5" />
          <span>Atualiza a cada 15s</span>
        </div>
        <span className="text-gray-600 text-[9px]">
          {new Date(data.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
