import { useQuery } from "@tanstack/react-query";
import { useRef, useEffect, useState } from "react";
import { Selection } from "@shared/schema";
import { Zap, Clock, TrendingUp, TrendingDown, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { proxyLogoUrl } from "@/lib/imgProxy";

const FIXTURE_ID = 1520716;
const GAME_ID = `api-football-${FIXTURE_ID}`;

const MARKET_LABELS: Record<number, string> = {
  1: "Resultado Final",
  5: "Gols Over/Under",
  8: "Ambas Marcam",
  13: "Vencedor 1º Tempo",
  12: "Dupla Chance",
  3: "Vencedor 2º Tempo",
  6: "Over/Under 1º Tempo",
  20: "Escanteios Over/Under",
  119: "Total Cartões",
  25: "Gols Over/Under",
  65: "Próximos 10 min",
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
  "Goals/Over 0.5": "Gol +0.5",
  "Goals/Under 0.5": "Gol -0.5",
  "Corners 3-Way/Over 0.5": "Escan +0.5",
  "Corners 3-Way/Under 0.5": "Escan -0.5",
  "Cards/Over 0.5": "Cart +0.5",
  "Cards/Under 0.5": "Cart -0.5",
};

function translateOutcome(value: string): string {
  if (OUTCOME_LABELS[value]) return OUTCOME_LABELS[value];
  // "Over 1.5" → "Acima 1.5"
  const overMatch = value.match(/^Over\s+(.+)$/i);
  if (overMatch) return `Acima ${overMatch[1]}`;
  // "Under 1.5" → "Abaixo 1.5"
  const underMatch = value.match(/^Under\s+(.+)$/i);
  if (underMatch) return `Abaixo ${underMatch[1]}`;
  // "Home/Over 1.5" → "Casa/Acima 1.5"
  // "Exactly 13" → "Exato 13"
  const exactlyMatch = value.match(/^Exactly\s+(.+)$/i);
  if (exactlyMatch) return `Exato ${exactlyMatch[1]}`;
  return value
    .replace(/\bExactly\b/gi, "Exato")
    .replace(/\bOver\b/gi, "Acima")
    .replace(/\bUnder\b/gi, "Abaixo")
    .replace(/\bHome\b/gi, "Casa")
    .replace(/\bAway\b/gi, "Fora")
    .replace(/\bDraw\b/gi, "Empate")
    .replace(/\bGoals\b/gi, "Gols")
    .replace(/\bCorners\b/gi, "Escanteios")
    .replace(/\bCards\b/gi, "Cartões")
    .replace(/\bYellow Card\b/gi, "Cartão Amarelo")
    .replace(/\bRed Card\b/gi, "Cartão Vermelho")
    .replace(/\bWin\b/gi, "Vencer")
    .replace(/\bLose\b/gi, "Perder")
    .replace(/\bHalf\b/gi, "Tempo")
    .replace(/\b3-Way\b/gi, "")
    .trim();
}

const EVENT_DETAILS: Record<string, string> = {
  "Yellow Card": "Cartão Amarelo",
  "Red Card": "Cartão Vermelho",
  "Second Yellow card": "2º Amarelo",
  "Normal Goal": "Gol",
  "Own Goal": "Gol Contra",
  "Penalty": "Pênalti",
  "Missed Penalty": "Pênalti Perdido",
  "Substitution 1": "Substituição",
  "Substitution 2": "Substituição",
  "Substitution 3": "Substituição",
  "Substitution 4": "Substituição",
  "Substitution 5": "Substituição",
  "VAR - Goal": "VAR - Gol",
  "VAR - Cancel Goal": "VAR - Gol Cancelado",
  "VAR - Penalty confirmed": "VAR - Pênalti Confirmado",
  "VAR - Red Card": "VAR - Cartão Vermelho",
};

function translateDetail(detail: string): string {
  return EVENT_DETAILS[detail] ?? detail;
}

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
    values: Array<{ value: string; odd: number; suspended?: boolean }>;
  }>;
  fetchedAt: number;
}

interface TeamStats {
  name: string;
  logo: string;
  id: number;
  possession: number;
  shotsOnGoal: number;
  shotsOffGoal: number;
  totalShots: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  xg: number | null;
  passes: number;
  passAccuracy: string | null;
}

interface MatchEvent {
  minute: number;
  extra: number | null;
  teamName: string;
  teamId: number;
  type: string;
  detail: string;
  player: string | null;
  assist: string | null;
}

interface MapData {
  home: TeamStats | null;
  away: TeamStats | null;
  events: MatchEvent[];
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

function eventIcon(type: string, detail: string) {
  if (type === "Goal") return "⚽";
  if (type === "Card" && detail.includes("Yellow")) return "🟨";
  if (type === "Card" && detail.includes("Red")) return "🟥";
  if (type === "subst") return "🔄";
  if (type === "Var") return "📺";
  return "•";
}

function StatBar({ label, home, away, isDark }: { label: string; home: number; away: number; isDark: boolean }) {
  const total = home + away || 1;
  const homePct = Math.round((home / total) * 100);
  const awayPct = 100 - homePct;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className={`font-bold w-5 text-right ${isDark ? "text-white" : "text-gray-900"}`}>{home}</span>
        <span className={`flex-1 text-center ${isDark ? "text-gray-400" : "text-gray-500"}`}>{label}</span>
        <span className={`font-bold w-5 text-left ${isDark ? "text-white" : "text-gray-900"}`}>{away}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
        <div className="h-full rounded-l-full bg-blue-500 transition-all duration-700" style={{ width: `${homePct}%` }} />
        <div className="h-full rounded-r-full bg-orange-400 transition-all duration-700" style={{ width: `${awayPct}%` }} />
      </div>
    </div>
  );
}

function MiniPitch({ attackPct, isDark }: { attackPct: number; isDark: boolean }) {
  const arrowLeft = `${Math.round(attackPct)}%`;
  return (
    <div
      className="relative w-full h-16 rounded-lg overflow-hidden flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #2d6a1f 0%, #3a8a28 50%, #2d6a1f 100%)" }}
    >
      {/* Pitch lines */}
      <div className="absolute inset-0">
        {/* Center line */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/30" />
        {/* Center circle */}
        <div className="absolute top-1/2 left-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 border border-white/30 rounded-full" />
        {/* Left penalty box */}
        <div className="absolute top-1/4 left-0 w-6 h-1/2 border border-white/30 border-l-0" />
        {/* Right penalty box */}
        <div className="absolute top-1/4 right-0 w-6 h-1/2 border border-white/30 border-r-0" />
      </div>
      {/* Ball position indicator */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg transition-all duration-1000 flex items-center justify-center"
        style={{ left: arrowLeft, marginLeft: "-8px", background: "rgba(255,255,255,0.9)" }}
      >
        <span className="text-[8px]">⚽</span>
      </div>
      {/* Home label */}
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/60 text-[8px] font-bold">CASA</span>
      {/* Away label */}
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 text-[8px] font-bold">FORA</span>
    </div>
  );
}

function MatchMapSection({ data, isLoading, isDark }: { data: MapData | undefined; isLoading: boolean; isDark: boolean }) {
  if (isLoading && !data) {
    return (
      <div className={`text-center py-3 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
        Carregando estatísticas...
      </div>
    );
  }

  const events = data?.events ?? [];
  const recentEvents = [...events].reverse().slice(0, 8);

  // No stats available — always show unavailable notice + events if any
  if (!data?.home || !data?.away) {
    return (
      <div className="space-y-3">
        <div className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
          <span>📊</span>
          <span>Estatísticas indisponíveis para este jogo</span>
        </div>
        {recentEvents.length > 0 && (
          <div>
            <p className={`text-[10px] uppercase tracking-wide mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Eventos</p>
            <div className="space-y-1">
              {recentEvents.map((e, i) => {
                const icon = eventIcon(e.type, e.detail);
                const min = `${e.minute}${e.extra ? "+" + e.extra : ""}`;
                return (
                  <div key={i} className={`flex items-center gap-2 text-[10px] ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    <span className={`w-7 text-right shrink-0 font-mono ${isDark ? "text-gray-500" : "text-gray-400"}`}>{min}'</span>
                    <span className="text-sm leading-none">{icon}</span>
                    <span className={`flex-1 truncate ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                      {e.player ?? translateDetail(e.detail)} · {e.teamName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const { home, away } = data;
  const attackPct = Math.min(85, Math.max(15, Math.round((home.shotsOnGoal / (home.shotsOnGoal + away.shotsOnGoal || 1)) * 100)));

  return (
    <div className="space-y-3">
      {/* Possession bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className={`text-[10px] font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{home.possession}%</span>
          </div>
          <span className={`text-[10px] ${isDark ? "text-gray-400" : "text-gray-500"}`}>Posse de Bola</span>
          <div className="flex items-center gap-1">
            <span className={`text-[10px] font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{away.possession}%</span>
            <div className="w-2 h-2 rounded-full bg-orange-400" />
          </div>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${home.possession}%` }} />
          <div className="h-full bg-orange-400 transition-all duration-700" style={{ width: `${away.possession}%` }} />
        </div>
      </div>

      {/* Mini pitch */}
      <MiniPitch attackPct={attackPct} isDark={isDark} />

      {/* Stats */}
      <div className="space-y-2">
        <StatBar label="Finalizações" home={home.totalShots} away={away.totalShots} isDark={isDark} />
        <StatBar label="No Gol" home={home.shotsOnGoal} away={away.shotsOnGoal} isDark={isDark} />
        <StatBar label="Escanteios" home={home.corners} away={away.corners} isDark={isDark} />
        <StatBar label="Faltas" home={home.fouls} away={away.fouls} isDark={isDark} />
        <StatBar label="Defesas" home={home.saves} away={away.saves} isDark={isDark} />
        {home.xg != null && away.xg != null && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-bold w-8 text-right text-green-400">{home.xg.toFixed(2)}</span>
              <span className={`flex-1 text-center ${isDark ? "text-gray-400" : "text-gray-500"}`}>xG</span>
              <span className="font-bold w-8 text-left text-green-400">{away.xg.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Events timeline */}
      {recentEvents.length > 0 && (
        <div>
          <p className={`text-[10px] uppercase tracking-wide mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Eventos</p>
          <div className="space-y-1">
            {recentEvents.map((e, i) => {
              const isHome = e.teamName === home.name;
              const icon = eventIcon(e.type, e.detail);
              const min = `${e.minute}${e.extra ? "+" + e.extra : ""}`;
              return (
                <div key={i} className={`flex items-center gap-2 text-[10px] ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  <span className={`w-7 text-right shrink-0 font-mono ${isDark ? "text-gray-500" : "text-gray-400"}`}>{min}'</span>
                  <span className="text-sm leading-none">{icon}</span>
                  <span className={`flex-1 truncate ${isHome ? "text-blue-400" : "text-orange-400"}`}>
                    {e.player ?? translateDetail(e.detail)}
                  </span>
                  <span className={`shrink-0 text-[9px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                    {isHome ? home.name.split(" ")[0] : away.name.split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  selections: Selection[];
  onToggleSelection: (sel: Selection) => void;
  isDark?: boolean;
}

export function LiveTestCard({ selections, onToggleSelection, isDark = true }: Props) {
  const [refetchMs, setRefetchMs] = useState(5_000);
  const [showMap, setShowMap] = useState(false);

  const { data: mapData, isLoading: mapLoading } = useQuery<MapData>({
    queryKey: ["/api/football/live-map"],
    queryFn: () => fetch("/api/football/live-map").then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 2,
  });

  const { data, isLoading, error } = useQuery<LiveData>({
    queryKey: ["/api/football/live-test"],
    queryFn: () => fetch("/api/football/live-test").then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
    refetchInterval: refetchMs,
    refetchIntervalInBackground: false,
    staleTime: refetchMs - 3_000,
    retry: 2,
  });

  useEffect(() => {
    if (!data) return;
    const st = data.fixture.status.short;
    const live = ["1H", "HT", "2H", "ET", "BT", "P", "INT"].includes(st);
    setRefetchMs(live ? 5_000 : 60_000);
  }, [data?.fixture.status.short]);

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
          if (clearTimers.current[key]) clearTimeout(clearTimers.current[key]);
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

  const containerCls = "bg-gradient-to-b from-white to-blue-400 border border-blue-200 rounded-xl overflow-hidden shadow-sm";
  const headerCls = "bg-white/60 border-b border-blue-200";
  const teamCls = "text-gray-900 font-bold";
  const scoreCls = "text-gray-900 font-black text-2xl";
  const marketTitleCls = "text-orange-500 font-semibold text-[11px] uppercase tracking-wide";
  const dividerCls = "border-black/10";

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
          <span className={`w-2 h-2 rounded-full ${isLive ? "bg-red-400 animate-pulse" : "bg-yellow-400"}`} />
          <span className={`font-bold text-xs tracking-widest ${isLive ? "text-red-400" : "text-yellow-400"}`}>
            {isLive ? "AO VIVO" : "PRÉ-JOGO"}
          </span>
          <span className="text-gray-500 text-[10px]">• Teste em Tempo Real</span>
        </div>
        <StatusBadge status={st} elapsed={data.fixture.elapsed} />
      </div>

      {/* Score row */}
      <div className="flex items-center justify-between px-4 py-4 gap-3">
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          {data.teams.home.logo && (
            <img src={proxyLogoUrl(data.teams.home.logo)} alt={data.teams.home.name} className="w-10 h-10 object-contain" />
          )}
          <span className={`text-sm ${teamCls} text-center leading-tight`}>{data.teams.home.name}</span>
        </div>
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
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          {data.teams.away.logo && (
            <img src={proxyLogoUrl(data.teams.away.logo)} alt={data.teams.away.name} className="w-10 h-10 object-contain" />
          )}
          <span className={`text-sm ${teamCls} text-center leading-tight`}>{data.teams.away.name}</span>
        </div>
      </div>

      {/* Match Map toggle */}
      {(isLive || isFinished) && (
        <div className={`border-t ${dividerCls}`}>
          <button
            onClick={() => setShowMap(v => !v)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors text-gray-600 hover:text-gray-900 hover:bg-black/5"
            data-testid="button-toggle-match-map"
          >
            {showMap ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showMap ? "Ocultar mapa" : "📊 Mapa do Jogo"}
          </button>

          {showMap && (
            <div className={`px-4 pb-4 border-t ${dividerCls} pt-3`}>
              <MatchMapSection data={mapData} isLoading={mapLoading} isDark={false} />
            </div>
          )}
        </div>
      )}

      {/* Markets */}
      {data.markets.length > 0 && !isFinished && (
        <div className={`px-4 pb-4 space-y-3 border-t ${dividerCls} pt-3`}>
          {data.markets.map((market, idx) => {
            const label = MARKET_LABELS[market.id] ?? market.name;
            // Goals markets: only show .5 lines (remove 0.75, 1.25, 1.75, etc.)
            const GOALS_MARKET_IDS = [5, 25, 6];
            const filteredValues = GOALS_MARKET_IDS.includes(market.id)
              ? market.values.filter(v => {
                  const m = v.value.match(/[\d.]+/);
                  if (!m) return true;
                  const n = parseFloat(m[0]);
                  return n % 1 === 0.5; // keeps only .5 lines (0.5, 1.5, 2.5...)
                })
              : market.values;
            if (filteredValues.length === 0) return null;
            return (
              <div key={market.id} className={`text-center ${idx > 0 ? "border-t pt-3 border-black/15" : ""}`}>
                <p className={`mb-1.5 ${marketTitleCls}`}>{label}</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {filteredValues.map(v => {
                    const rawOdd = v.odd;
                    const isSuspended = !!v.suspended;
                    const id = selId(GAME_ID, market.id, v.value);
                    const moveKey = `m${market.id}-${v.value}`;
                    const movement = isSuspended ? undefined : oddMovements[moveKey];
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
                    const active = !isSuspended && isSelected(selections, id);
                    const outcomeLabel = translateOutcome(v.value);
                    return (
                      <button
                        key={v.value}
                        data-testid={`button-live-${market.id}-${v.value.replace(/\s/g, "_")}`}
                        onClick={() => !isSuspended && onToggleSelection(sel)}
                        disabled={isSuspended}
                        className={`relative flex flex-col items-center px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors min-w-[60px] ${
                          isSuspended
                            ? "opacity-40 cursor-not-allowed bg-gray-100 border-gray-200 text-gray-400"
                            : movement === "up"
                            ? active ? "bg-yellow-400 border-green-400 text-black" : "border-green-500/60 bg-green-50 text-gray-800"
                            : movement === "down"
                            ? active ? "bg-yellow-400 border-red-400 text-black" : "border-red-500/60 bg-red-50 text-gray-800"
                            : active
                            ? "bg-yellow-400 border-yellow-400 text-black"
                            : "bg-white/60 border-black/15 text-gray-900 hover:bg-white/80"
                        }`}
                      >
                        <span className="text-[10px] opacity-70 font-normal">{outcomeLabel}</span>
                        <div className="flex items-center gap-0.5">
                          {isSuspended ? (
                            <Lock className="w-3.5 h-3.5 text-gray-500" />
                          ) : (
                            <>
                              <span className="text-sm font-black bg-gradient-to-b from-blue-500 to-blue-800 bg-clip-text text-transparent">{rawOdd.toFixed(2)}</span>
                              {movement === "up" && <TrendingUp className="w-3 h-3 text-green-400 animate-bounce" />}
                              {movement === "down" && <TrendingDown className="w-3 h-3 text-red-400 animate-bounce" />}
                            </>
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
        <div className={`px-4 pb-4 text-center text-gray-500 text-xs border-t ${dividerCls} pt-3`}>
          Jogo encerrado · {homeGoals} – {awayGoals}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-gray-600 text-[9px]">
          <Zap className="w-2.5 h-2.5" />
          <span>Atualiza a cada {isLive ? "5s" : "60s"}</span>
        </div>
        <span className="text-gray-600 text-[9px]">
          {new Date(data.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
