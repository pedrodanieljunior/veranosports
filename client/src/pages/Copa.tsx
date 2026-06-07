import { useState, useEffect, useMemo, useRef } from "react";
import copaTrofeuTab from "@assets/copa_trofeu_tab.png";
import { proxyLogoUrl } from "@/lib/imgProxy";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { Sport, Game, Selection, BetSlip as BetSlipType } from "@shared/schema";
import { BetSlip } from "@/components/BetSlip";
import { BetHistory } from "@/components/BetHistory";
import { GameDetailModal } from "@/components/GameDetailModal";
import { RulesModal } from "@/components/RulesModal";
import { AuthModals } from "@/components/AuthModals";
import { ProfileModal } from "@/components/ProfileModal";
import { BoostCard } from "@/components/BoostCard";
import { BoostCard as BoostCardType } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getSessionId } from "@/lib/session";
import { GamesList } from "@/components/GamesList";
import { MobileNav } from "@/components/MobileNav";
import { LiveTestCard } from "@/components/LiveTestCard";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { History, Search, X, BookOpen, UserCircle, Calendar, CalendarDays, Users, Globe, BarChart2, Lock } from "lucide-react";
import { translateLeagueName } from "@/lib/leagueTranslations";
import fwSportsLogo from "@assets/verano-logo-transparent.png";
import copaLogo from "@assets/copa_logo_transparent.png";
import tacaCopa from "@assets/taca_copa_transparent.png";

const COPA_START = new Date("2026-06-11T15:00:00Z");
const WC_QUALIFIER_KEYS = [
  "soccer_wc_qualifiers_conmebol",
  "soccer_wc_qualifiers_europe",
  "soccer_wc_qualifiers_concacaf",
  "soccer_wc_qualifiers_caf",
  "soccer_wc_qualifiers_afc",
  "soccer_wc_intercontinental",
];

type CopaTab = "todos" | "copa" | "champions";
type CopaSubTab = "todos" | "grupos" | "longo" | "especiais";

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(() => target.getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => setDiff(target.getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  const total = Math.max(0, diff);
  const days = Math.floor(total / 86400000);
  const hours = Math.floor((total % 86400000) / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  return { days, hours, minutes, seconds, started: diff <= 0 };
}

export default function Copa() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [isBetSlipMinimized, setIsBetSlipMinimized] = useState(false);
  const [placedBet, setPlacedBet] = useState<BetSlipType | null>(null);
  const [gameLimitRemaining, setGameLimitRemaining] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<CopaTab>("todos");
  const [copaSubTab, setCopaSubTab] = useState<CopaSubTab>("todos");
  const [copaGrupoKey, setCopaGrupoKey] = useState<string>("todos");
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const pendingGameRef = useRef<Game | null>(null);
  const pendingSelectionRef = useRef<Selection | null>(null);
  const countdown = useCountdown(COPA_START);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    const id = setInterval(() => {
      const newNow = Date.now();
      setNow(newNow);
      setSelections(prev => {
        const filtered = prev.filter(s => new Date(s.commenceTime).getTime() > newNow);
        if (filtered.length < prev.length) {
          toast({ title: "Jogo iniciado", description: "Seleção removida pois o jogo já começou.", variant: "destructive" });
        }
        return filtered;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (pendingGameRef.current) { setSelectedGame(pendingGameRef.current); pendingGameRef.current = null; }
    if (pendingSelectionRef.current) {
      const sel = pendingSelectionRef.current; pendingSelectionRef.current = null;
      setSelections(prev => prev.find(s => s.id === sel.id) ? prev : [...prev, sel]);
      setShowBetSlip(true); setIsBetSlipMinimized(true);
    }
  }, [user]);

  const { data: sports = [], isLoading: sportsLoading } = useQuery<Sport[]>({ queryKey: ["/api/sports"] });

  const { data: todayGames = [], isLoading: todayLoading } = useQuery<Game[]>({
    queryKey: ["/api/games/today"], staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000, enabled: !selectedSport,
  });

  const { data: leagueGames = [], isLoading: leagueLoading } = useQuery<Game[]>({
    queryKey: [`/api/odds/${selectedSport}`], enabled: !!selectedSport, staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000,
  });

  const uniqueSportKeys = useMemo(() => [...new Set(todayGames.map(g => g.sportKey))], [todayGames]);
  const leagueOddsResults = useQueries({
    queries: uniqueSportKeys.map(sportKey => ({
      queryKey: [`/api/odds/${sportKey}`], staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000,
    })),
  });

  const todayGamesWithOdds: Game[] = useMemo(() => {
    const oddsById: Record<string, Game["bookmakers"]> = {};
    for (const r of leagueOddsResults) {
      const games = r.data as Game[] | undefined;
      if (games) for (const g of games) { if (g.bookmakers?.length) oddsById[g.id] = g.bookmakers; }
    }
    return todayGames.map(g => oddsById[g.id] ? { ...g, bookmakers: oddsById[g.id] } : g);
  }, [todayGames, leagueOddsResults]);

  const { data: boostCards = [] } = useQuery<BoostCardType[]>({
    queryKey: ["/api/boost-cards"], staleTime: 0, refetchInterval: 30_000,
  });

  const { data: liveStatus } = useQuery<{ fixtureId: number | null; isLocked: boolean }>({
    queryKey: ["/api/football/live-status"],
    refetchInterval: 10_000,
    staleTime: 8_000,
  });

  const { data: copaCards = [] } = useQuery<any[]>({
    queryKey: ["/api/copa-world-cup-cards"], staleTime: 60_000, refetchInterval: 60_000,
  });

  const { data: copaMundoGames = [], isLoading: copaMundoLoading } = useQuery<Game[]>({
    queryKey: ["/api/copa-mundo-games"],
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    enabled: activeTab === "copa",
  });

  const { data: uclFinalGame } = useQuery<Game | null>({
    queryKey: ["/api/ucl-final"],
    queryFn: () => fetch("/api/ucl-final").then(r => r.json()),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    enabled: activeTab === "champions",
  });

  const sessionId = getSessionId();
  const { data: betHistory = [], isLoading: historyLoading } = useQuery<BetSlipType[]>({
    queryKey: ["/api/bets", user?.cpf ?? sessionId],
    queryFn: async () => {
      const url = user?.cpf ? `/api/bets?userId=${encodeURIComponent(user.cpf)}` : `/api/bets?sessionId=${encodeURIComponent(sessionId)}`;
      return fetch(url).then(r => r.json());
    },
    refetchInterval: user ? 5_000 : false,
  });

  const isSearching = debouncedSearch.trim().length >= 2;
  const isTyping = searchQuery.trim().length >= 2 && !isSearching;
  const { data: searchResults = [], isLoading: searchLoading } = useQuery<Game[]>({
    queryKey: ["/api/search/games", debouncedSearch.trim()],
    queryFn: () => fetch(`/api/search/games?team=${encodeURIComponent(debouncedSearch.trim())}`).then(r => r.json()),
    enabled: isSearching, staleTime: 5 * 60 * 1000,
  });

  const baseGames = selectedSport ? leagueGames : todayGamesWithOdds;
  const gamesLoading = selectedSport ? leagueLoading : todayLoading;

  const filteredGames = useMemo(() => {
    const base = isSearching ? searchResults : baseGames;
    const future = base.filter(g => new Date(g.commenceTime).getTime() > now);
    if (isSearching || isTyping || selectedSport) return future;
    if (activeTab === "copa") return future.filter(g => g.sportKey === "soccer_fifa_world_cup");
    if (activeTab === "champions") {
      return uclFinalGame ? [uclFinalGame] : [];
    }
    return future;
  }, [baseGames, searchResults, isSearching, isTyping, activeTab, selectedSport, now, uclFinalGame]);

  const placeBetMutation = useMutation({
    mutationFn: async (data: { selections: Selection[]; stake: number; useBonus: boolean }) => {
      const res = await apiRequest("POST", "/api/bets", { ...data, sessionId, userId: user?.cpf });
      return res.json();
    },
    onSuccess: (data: BetSlipType) => {
      setPlacedBet(data); setSelections([]); setGameLimitRemaining(null);
      queryClient.invalidateQueries({ queryKey: ["/api/bets", user?.cpf ?? sessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/limits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/club-fw/progress"] });
      if (user) refreshUser();
    },
    onError: (error: Error) => {
      let description = error.message; let remaining: number | null = null;
      try { const p = JSON.parse(error.message.replace(/^\d+:\s*/, "")); if (p.error) description = p.error; if (typeof p.remaining === "number") remaining = p.remaining; } catch {}
      setGameLimitRemaining(remaining);
      toast({ title: "Erro ao gerar bilhete", description, variant: "destructive" });
    },
  });

  const handleGameClick = (game: Game) => {
    if (!user) { pendingGameRef.current = game; pendingSelectionRef.current = null; setAuthMode("login"); return; }
    setSelectedGame(game);
  };

  const handleToggleSelection = (selection: Selection) => {
    if (!user) { pendingSelectionRef.current = selection; pendingGameRef.current = null; setAuthMode("login"); return; }
    if (placedBet) setPlacedBet(null);
    setGameLimitRemaining(null);
    setSelections(prev => {
      const exists = prev.find(s => s.id === selection.id);
      if (exists) return prev.filter(s => s.id !== selection.id);
      const isBoost = selection.marketKey === "boost";
      const hasBoost = prev.some(s => s.marketKey === "boost");
      const hasOther = prev.some(s => s.marketKey !== "boost");
      if (isBoost && hasOther) { toast({ title: "Super Boost é exclusivo", description: "Remova as outras seleções antes.", variant: "destructive" }); return prev; }
      if (!isBoost && hasBoost) { toast({ title: "Bilhete com Super Boost", description: "Remova o Super Boost para adicionar outras seleções.", variant: "destructive" }); return prev; }
      const withoutSameMarket = prev.filter(s => !(s.gameId === selection.gameId && s.marketKey === selection.marketKey));
      const distinctMarkets = new Set(withoutSameMarket.filter(s => s.gameId === selection.gameId).map(s => s.marketKey)).size;
      if (distinctMarkets >= 3) { toast({ title: "Máximo de 3 mercados por jogo", variant: "destructive" }); return prev; }
      return [...withoutSameMarket, selection];
    });
    if (!selections.find(s => s.id === selection.id)) { setShowBetSlip(true); setShowHistory(false); setIsBetSlipMinimized(true); }
  };

  const handleRemoveSelection = (id: string) => setSelections(prev => prev.filter(s => s.id !== id));
  const handleClearAll = () => { setSelections([]); setPlacedBet(null); };
  const handleMigrateGameId = (oldId: string, newId: string) => {
    setSelections(prev => prev.map(s => s.gameId === oldId ? { ...s, gameId: newId, id: s.id.replace(oldId, newId) } : s));
  };

  const tabs: { key: CopaTab; label: string; icon: React.ReactNode }[] = [
    { key: "todos", label: "TODOS", icon: "📅" },
    { key: "copa", label: "COPA DO MUNDO", icon: <img src={copaTrofeuTab} alt="Copa" className="w-5 h-5 object-contain" /> },
    {
      key: "champions",
      label: "CHAMPIONS LEAGUE",
      icon: <img src={proxyLogoUrl("https://media.api-sports.io/football/leagues/2.png")} alt="UCL" className="w-5 h-5 object-contain" />,
    },
  ];

  const pendingBets = betHistory.filter(b => b.status === "pending").length;

  return (
    <div className="min-h-screen bg-white">
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-50 px-3 py-2 flex flex-col gap-2 overflow-hidden" style={{ background: "linear-gradient(135deg, #0d1629 0%, #0e1f4a 60%, #0d2a6e 100%)", borderBottom: "2px solid #e87c1e" }}>
        {/* Neon fan streaks overlay */}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 400 140" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="focal-m" cx="82%" cy="30%" r="22%">
                <stop offset="0%" stopColor="rgba(120,200,255,0.7)" />
                <stop offset="100%" stopColor="rgba(0,100,255,0)" />
              </radialGradient>
              <linearGradient id="sm1" x1="328" y1="42" x2="-20" y2="-20" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="rgba(160,220,255,0.95)" /><stop offset="100%" stopColor="rgba(80,160,255,0)" />
              </linearGradient>
              <linearGradient id="sm2" x1="328" y1="42" x2="60" y2="-15" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="rgba(140,210,255,0.85)" /><stop offset="100%" stopColor="rgba(60,140,255,0)" />
              </linearGradient>
              <linearGradient id="sm3" x1="328" y1="42" x2="170" y2="-18" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="rgba(180,230,255,0.9)" /><stop offset="100%" stopColor="rgba(80,160,255,0)" />
              </linearGradient>
              <linearGradient id="sm4" x1="328" y1="42" x2="-30" y2="70" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="rgba(100,190,255,0.8)" /><stop offset="100%" stopColor="rgba(40,120,255,0)" />
              </linearGradient>
              <linearGradient id="sm5" x1="328" y1="42" x2="-30" y2="140" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="rgba(80,170,255,0.7)" /><stop offset="100%" stopColor="rgba(30,100,255,0)" />
              </linearGradient>
              <linearGradient id="sm6" x1="328" y1="42" x2="60" y2="155" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="rgba(120,200,255,0.75)" /><stop offset="100%" stopColor="rgba(50,130,255,0)" />
              </linearGradient>
              <linearGradient id="sm7" x1="328" y1="42" x2="200" y2="155" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="rgba(100,185,255,0.6)" /><stop offset="100%" stopColor="rgba(40,110,255,0)" />
              </linearGradient>
              <linearGradient id="sm8" x1="328" y1="42" x2="310" y2="155" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="rgba(140,210,255,0.5)" /><stop offset="100%" stopColor="rgba(60,140,255,0)" />
              </linearGradient>
              <filter id="fglow-m" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.5" result="b" />
                <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="fglow-m2" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.2" result="b" />
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <ellipse cx="328" cy="42" rx="60" ry="45" fill="url(#focal-m)" />
            <line x1="328" y1="42" x2="-20" y2="-20" stroke="url(#sm1)" strokeWidth="2.5" filter="url(#fglow-m)" />
            <line x1="328" y1="42" x2="60" y2="-15" stroke="url(#sm2)" strokeWidth="2" filter="url(#fglow-m)" />
            <line x1="328" y1="42" x2="170" y2="-18" stroke="url(#sm3)" strokeWidth="1.5" filter="url(#fglow-m2)" />
            <line x1="328" y1="42" x2="-30" y2="70" stroke="url(#sm4)" strokeWidth="2" filter="url(#fglow-m)" />
            <line x1="328" y1="42" x2="-30" y2="140" stroke="url(#sm5)" strokeWidth="2.5" filter="url(#fglow-m)" />
            <line x1="328" y1="42" x2="60" y2="155" stroke="url(#sm6)" strokeWidth="1.8" filter="url(#fglow-m2)" />
            <line x1="328" y1="42" x2="200" y2="155" stroke="url(#sm7)" strokeWidth="1.5" filter="url(#fglow-m2)" />
            <line x1="328" y1="42" x2="310" y2="155" stroke="url(#sm8)" strokeWidth="1" filter="url(#fglow-m2)" />
            <line x1="328" y1="42" x2="-20" y2="-20" stroke="rgba(220,240,255,0.6)" strokeWidth="0.7" />
            <line x1="328" y1="42" x2="-30" y2="140" stroke="rgba(200,230,255,0.5)" strokeWidth="0.6" />
            <line x1="328" y1="42" x2="60" y2="-15" stroke="rgba(210,235,255,0.55)" strokeWidth="0.5" />
          </svg>
        </div>
        {/* Row 1: Logo + Copa badge + Auth */}
        <div className="flex items-center justify-between gap-2" style={{ position: "relative", zIndex: 1 }}>
          <div className="flex items-center gap-2">
            <img src={fwSportsLogo} alt="Verano Sports" className="h-12 w-auto object-contain" />
            <img src={copaLogo} alt="Copa do Mundo 2026" className="h-12 w-auto object-contain" />
          </div>

          <div className="flex items-center gap-1.5">
            {!user ? (
              <>
                <button onClick={() => setAuthMode("register")} className="px-2.5 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap transition-colors" style={{ background: "rgba(201,162,39,0.15)", color: "#f5c518", border: "1px solid rgba(201,162,39,0.3)" }} data-testid="button-register-copa">
                  Cadastrar
                </button>
                <button onClick={() => setAuthMode("login")} className="px-2.5 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap" style={{ background: "#1565C0", color: "white" }} data-testid="button-login-copa">
                  Login
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setShowHistory(true); setShowBetSlip(false); }} className="relative inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold text-xs shadow-md whitespace-nowrap" style={{ background: "#1565C0", color: "white" }} data-testid="button-history-copa">
                  <History className="w-3.5 h-3.5" /><span>Apostas</span>
                  {pendingBets > 0 && <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center px-1 text-[10px] bg-red-500 text-white border-0">{pendingBets}</Badge>}
                </button>
                <button onClick={() => setShowProfile(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap" style={{ background: "rgba(201,162,39,0.15)", color: "#f5c518", border: "1px solid rgba(201,162,39,0.3)" }} data-testid="button-profile-copa">
                  <span className="text-[10px]">R${(user.balance + (user.bonusBalance ?? 0)).toFixed(2).replace(".", ",")}</span>
                  <UserCircle className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Ligas + Principais Ligas */}
        <div className="flex flex-row flex-nowrap items-center gap-1" style={{ position: "relative", zIndex: 1 }}>
          <MobileNav sports={sports} selectedSport={selectedSport} onSelectSport={(key) => { setSelectedSport(key); setActiveTab("todos"); }} isLoading={sportsLoading} />
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }} data-testid="button-top-leagues-copa">
                <span className="text-sm">🏆</span>
                <span className="font-bold text-[10px] whitespace-nowrap" style={{ color: "rgba(255,255,255,0.8)" }}>Principais Ligas</span>
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-52 p-2 bg-[#1a3520] border-[#c9a227]/30 z-[9999]">
              <p className="font-bold text-xs mb-2 px-1" style={{ color: "#f5c518" }}>🏆 Principais Ligas</p>
              {[
                { key: "soccer_brazil_campeonato", label: "Brasileirão Série A" },
                { key: "soccer_epl", label: "Premier League" },
                { key: "soccer_uefa_champs_league", label: "Champions League" },
                { key: "soccer_spain_la_liga", label: "La Liga" },
                { key: "soccer_italy_serie_a", label: "Serie A" },
                { key: "soccer_germany_bundesliga", label: "Bundesliga" },
              ].map(({ key, label }) => {
                const sport = sports.find(s => s.key === key);
                if (!sport) return null;
                return (
                  <button key={key} onClick={() => { setSelectedSport(key); setActiveTab("todos"); }}
                    className="w-full text-left px-2 py-1.5 rounded text-xs font-medium transition-colors"
                    style={selectedSport === key ? { background: "#c9a227", color: "#0b1f10" } : { color: "#374151" }}
                  >
                    {label}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        </div>

        {/* Row 3: Search */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-2 shadow-sm" style={{ position: "relative", zIndex: 1 }}>
          <Search className="w-4 h-4 shrink-0 text-gray-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar time ou seleção..." className="flex-1 bg-transparent text-gray-800 text-sm placeholder-gray-400 outline-none" data-testid="input-search-copa" />
          {searchQuery && <button onClick={() => setSearchQuery("")}><X className="w-4 h-4 text-gray-400" /></button>}
        </div>
      </header>

      {/* ===== COUNTDOWN BANNER ===== */}
      {!countdown.started && (
        <div className="px-3 pt-3">
          <div className="rounded-xl overflow-hidden relative" style={{ background: "linear-gradient(135deg, #0d3a1a 0%, #1a5e2a 40%, #0f4a1f 100%)", border: "1px solid rgba(201,162,39,0.4)" }}>
            <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "radial-gradient(circle at 80% 50%, #ffd700 0%, transparent 60%)" }} />
            <div className="relative px-3 pt-2 pb-2 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <img src={tacaCopa} alt="Taça Copa do Mundo" className="h-14 w-auto object-contain shrink-0 mt-0.5" style={{ filter: "drop-shadow(0 0 6px rgba(201,162,39,0.5))" }} />
                <div className="flex-1 min-w-0">
                  <h2 className="font-black leading-tight whitespace-nowrap" style={{ color: "#f5c518", fontSize: "clamp(11px, 3.2vw, 15px)" }}>VERANO SPORTS RUMO À COPA DO MUNDO 2026</h2>
                  <p className="text-white/45 text-[9px] font-bold tracking-widest">EUA · CANADÁ · MÉXICO</p>
                  <div className="flex items-center gap-3 mt-1 overflow-hidden">
                    <span className="flex items-center gap-1 text-white/60 text-[9px] whitespace-nowrap shrink-0"><span className="text-green-400 text-[10px]">✓</span>Cobertura completa</span>
                    <span className="flex items-center gap-1 text-white/60 text-[9px] whitespace-nowrap shrink-0"><span className="text-green-400 text-[10px]">✓</span>Odds especiais e mercados exclusivos</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-1">
                {[
                  { v: countdown.days, l: "D" },
                  { v: countdown.hours, l: "H" },
                  { v: countdown.minutes, l: "M" },
                  { v: countdown.seconds, l: "S" },
                ].map(({ v, l }, i, arr) => (
                  <div key={l} className="flex items-center gap-1">
                    <div className="flex flex-col items-center rounded px-2 py-0.5 min-w-[32px]" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(201,162,39,0.4)" }}>
                      <span className="text-sm font-black leading-none" style={{ color: "#f5c518" }}>{String(v).padStart(2, "0")}</span>
                      <span className="text-white/45 text-[8px] font-bold">{l}</span>
                    </div>
                    {i < arr.length - 1 && <span className="text-white/30 text-xs font-bold">:</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== LIVE TEST CARD ===== */}
      {!isSearching && !isTyping && liveStatus?.fixtureId && (
        <div className="px-3 pt-3">
          <LiveTestCard selections={selections} onToggleSelection={handleToggleSelection} isDark={false} />
        </div>
      )}

      {/* ===== BOOST CARDS ===== */}
      {boostCards.length > 0 && !isSearching && !isTyping && (
        <div className="pt-3">
          {boostCards.map(card => (
            <BoostCard key={card.id} card={card} selections={selections} onToggleSelection={handleToggleSelection} />
          ))}
        </div>
      )}

      {/* ===== TABS PRINCIPAIS ===== */}
      {!isSearching && !isTyping && (
        <div className="pt-3">
          {/* Linha 1: TODOS | COPA | QUALIFICATÓRIAS */}
          <div className="px-3">
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); if (tab.key === "copa") setCopaSubTab("todos"); }}
                  data-testid={`tab-copa-${tab.key}`}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-[10px] whitespace-nowrap transition-all shrink-0"
                  style={activeTab === tab.key
                    ? { background: "#1565C0", color: "#ffffff" }
                    : { background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }
                  }
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Linha 2: Sub-abas da Copa (só aparece quando COPA está ativo) */}
          {activeTab === "copa" && (
            <div className="mt-2" style={{ background: "#111c14", borderTop: "1px solid rgba(201,162,39,0.15)", borderBottom: "1px solid rgba(201,162,39,0.15)" }}>
              <div className="flex">
                {([
                  { key: "todos", label: "TODOS", Icon: Calendar },
                  { key: "grupos", label: "GRUPOS", Icon: Users },
                  { key: "longo", label: "LONGO PRAZO", Icon: CalendarDays },
                  { key: "especiais", label: "ESPECIAIS", Icon: BarChart2 },
                ] as { key: CopaSubTab; label: string; Icon: React.ElementType }[]).map(({ key, label, Icon }) => {
                  const isActive = copaSubTab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => { setCopaSubTab(key); setCopaGrupoKey("todos"); }}
                      data-testid={`subtab-copa-${key}`}
                      className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-1 transition-all relative"
                      style={isActive ? { background: "#c9a227" } : {}}
                    >
                      <Icon className="w-5 h-5" style={{ color: isActive ? "#0b1f10" : "rgba(255,255,255,0.55)" }} />
                      <span className="font-black text-[9px] leading-none text-center whitespace-nowrap" style={{ color: isActive ? "#0b1f10" : "rgba(255,255,255,0.55)", letterSpacing: "0.03em" }}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Info do tab ativo */}
          <div className="mt-2 px-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">
                  {activeTab === "copa" ? "🏆" : activeTab === "champions" ? "⭐" : "⚽"}
                </span>
                <p className="text-gray-800 font-bold text-sm">
                  {activeTab === "todos" ? "Jogos do Dia" : activeTab === "copa" ? "Copa do Mundo 2026" : "Champions League"}
                </p>
              </div>
              <p className="text-gray-400 text-xs ml-7">
                {activeTab === "champions" && uclFinalGame
                  ? `${new Date(uclFinalGame.commenceTime).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }).replace(/^\w/, c => c.toUpperCase())} — 1 jogo`
                  : `${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }).replace(/^\w/, c => c.toUpperCase())} — ${filteredGames.length} ${filteredGames.length === 1 ? "jogo" : "jogos"}`
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== GAMES LIST ===== */}
      <div className="px-0 pt-2 pb-4">
        {activeTab === "copa" && copaSubTab !== "todos" ? (
          (() => {
            const COPA_GRUPOS = ["A","B","C","D","E","F","G","H","I","J","K","L"];
            const subCards = copaCards.filter((c: any) => c.subTab === copaSubTab);
            const visibleCards = copaSubTab === "grupos" && copaGrupoKey !== "todos"
              ? subCards.filter((c: any) => c.badge === `Grupo ${copaGrupoKey}`)
              : subCards;

            if (subCards.length === 0) return (
              <>
                {copaSubTab === "grupos" && (
                  <div className="px-3 mb-3 overflow-x-auto">
                    <div className="flex gap-1.5 pb-1" style={{ minWidth: "max-content" }}>
                      <button onClick={() => setCopaGrupoKey("todos")} data-testid="grupo-todos"
                        className="px-3 py-1.5 rounded-full text-[11px] font-black transition-all whitespace-nowrap"
                        style={{ background: copaGrupoKey === "todos" ? "#c9a227" : "#f3f4f6", color: copaGrupoKey === "todos" ? "#0b1f10" : "#374151", border: copaGrupoKey === "todos" ? "none" : "1px solid #e5e7eb" }}>
                        TODOS
                      </button>
                      {COPA_GRUPOS.map(g => (
                        <button key={g} onClick={() => setCopaGrupoKey(g)} data-testid={`grupo-${g}`}
                          className="px-3 py-1.5 rounded-full text-[11px] font-black transition-all whitespace-nowrap"
                          style={{ background: copaGrupoKey === g ? "#c9a227" : "#f3f4f6", color: copaGrupoKey === g ? "#0b1f10" : "#374151", border: copaGrupoKey === g ? "none" : "1px solid #e5e7eb" }}>
                          GRUPO {g}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mx-3 rounded-xl p-6 text-center" style={{ background: "#f3f4f6", border: "1px solid #e5e7eb" }}>
                  <div className="text-4xl mb-3">🏆</div>
                  <p className="text-gray-800 font-bold text-sm mb-1">Em breve!</p>
                  <p className="text-gray-500 text-xs">Os cards desta seção serão adicionados em breve.</p>
                </div>
              </>
            );
            return (
              <div className="px-3 space-y-3">
                {copaSubTab === "grupos" && (
                  <div className="overflow-x-auto -mx-3 px-3 mb-1">
                    <div className="flex gap-1.5 pb-1" style={{ minWidth: "max-content" }}>
                      <button onClick={() => setCopaGrupoKey("todos")} data-testid="grupo-todos"
                        className="px-3 py-1.5 rounded-full text-[11px] font-black transition-all whitespace-nowrap"
                        style={{ background: copaGrupoKey === "todos" ? "#c9a227" : "#f3f4f6", color: copaGrupoKey === "todos" ? "#0b1f10" : "#374151", border: copaGrupoKey === "todos" ? "none" : "1px solid #e5e7eb" }}>
                        TODOS
                      </button>
                      {COPA_GRUPOS.map(g => (
                        <button key={g} onClick={() => setCopaGrupoKey(g)} data-testid={`grupo-${g}`}
                          className="px-3 py-1.5 rounded-full text-[11px] font-black transition-all whitespace-nowrap"
                          style={{ background: copaGrupoKey === g ? "#c9a227" : "#f3f4f6", color: copaGrupoKey === g ? "#0b1f10" : "#374151", border: copaGrupoKey === g ? "none" : "1px solid #e5e7eb" }}>
                          GRUPO {g}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {(() => {
                  const selectedCopaCardIds = new Set(
                    selections
                      .filter(s => s.gameId.startsWith("copa-card-"))
                      .map(s => s.gameId.replace("copa-card-", ""))
                  );
                  const selectedSubTabs = new Set(
                    copaCards
                      .filter((c: any) => selectedCopaCardIds.has(String(c.id)))
                      .map((c: any) => c.subTab as string)
                  );
                  const hasLongoOrEspeciaisSelected = selectedSubTabs.has("longo") || selectedSubTabs.has("especiais");
                  const hasGruposSelected = selectedSubTabs.has("grupos");

                  return (visibleCards as any[]).map((card: any) => {
                  const cardIsSelected = selectedCopaCardIds.has(String(card.id));
                  let cardBlocked = false;
                  if (card.subTab === "grupos") {
                    cardBlocked = hasLongoOrEspeciaisSelected;
                  } else if (card.subTab === "longo" || card.subTab === "especiais") {
                    cardBlocked = !cardIsSelected && (hasGruposSelected || hasLongoOrEspeciaisSelected);
                  }
                  let parsedTeams: { name: string; odds: number | null }[] = [];
                  let tableData: { type: string; columns: { name: string; max: number }[]; teams: { name: string; odds: (number | null)[] }[] } | null = null;
                  if (card.teamsJson) {
                    try {
                      const parsed = JSON.parse(card.teamsJson);
                      if (parsed && !Array.isArray(parsed) && parsed.type === "table") {
                        tableData = {
                          ...parsed,
                          columns: (parsed.columns || []).map((c: any) =>
                            typeof c === "string" ? { name: c, max: 1 } : { name: c.name || c, max: c.max || 1 }
                          ),
                        };
                      } else if (Array.isArray(parsed)) {
                        parsedTeams = parsed;
                      }
                    } catch {}
                  }
                  const isTableCard = tableData !== null;
                  const isGrupoCard = parsedTeams.length > 0;
                  const WC_DATE = "2026-06-11T00:00:00.000Z";

                  const makeCopaSelection = (outcome: string, odds: number, selId: string, marketKey = "copa_grupo"): Selection => ({
                    id: selId,
                    gameId: `copa-card-${card.id}`,
                    homeTeam: card.title,
                    awayTeam: "",
                    commenceTime: WC_DATE,
                    sportTitle: "Copa do Mundo 2026",
                    marketKey,
                    bookmaker: "FW Sports",
                    outcome,
                    odds,
                  });

                  return (
                    <div key={card.id} className="rounded-xl overflow-hidden" style={{ background: "linear-gradient(135deg, #0d3a1a 0%, #1a5e2a 40%, #0f4a1f 100%)", border: "1px solid rgba(201,162,39,0.3)" }}>
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            {card.badge && <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black mb-1" style={{ background: "rgba(201,162,39,0.2)", color: "#f5c518" }}>{card.badge}</span>}
                            <h3 className="text-white font-bold text-sm leading-tight">{card.title}</h3>
                          </div>
                        </div>

                        {isTableCard ? (
                          /* ── Tabela de grupo com múltiplos mercados ── */
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse" style={{ minWidth: `${(tableData!.columns.length * 70) + 100}px` }}>
                              <thead>
                                <tr>
                                  <th className="text-left pb-1.5 pr-2 font-normal text-white/40 text-[10px]">Seleção</th>
                                  {tableData!.columns.map((col, ci) => (
                                    <th key={ci} className="text-center pb-1.5 px-1 font-bold text-white/70 text-[10px] whitespace-nowrap">{col.name}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {tableData!.teams.map((team, ti) => (
                                  <tr key={ti} className="border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                                    <td className="py-1.5 pr-2 text-white font-semibold whitespace-nowrap">{team.name}</td>
                                    {(() => {
                                      const tableHasSelection = tableData!.teams.some((_, otherTi) =>
                                        tableData!.columns.some((_, otherCi) =>
                                          selections.some(s => s.id === `copa-card-${card.id}-t${otherTi}-c${otherCi}`)
                                        )
                                      );
                                      return tableData!.columns.map((col, ci) => {
                                        const odd = team.odds[ci];
                                        const selId = `copa-card-${card.id}-t${ti}-c${ci}`;
                                        const isSelected = selections.some(s => s.id === selId);
                                        const hasOdd = odd != null;
                                        const isDisabled = !hasOdd || (!isSelected && (tableHasSelection || cardBlocked));
                                        return (
                                          <td key={ci} className="py-1 px-0.5">
                                            <button
                                              onClick={() => !isDisabled ? handleToggleSelection(makeCopaSelection(`${team.name} – ${col.name}`, odd!, selId, `copa_grupo_col${ci}`)) : undefined}
                                              disabled={isDisabled}
                                              className={`w-full text-center rounded px-1.5 py-1.5 font-black text-xs transition-all ${!isDisabled ? "cursor-pointer active:scale-95" : "cursor-default opacity-30"}`}
                                              style={{ background: isSelected ? "#c9a227" : "rgba(0,0,0,0.35)", color: isSelected ? "#0b1f10" : "#f5c518", minWidth: "52px" }}>
                                              {hasOdd ? Number(odd).toFixed(2) : "—"}
                                            </button>
                                          </td>
                                        );
                                      });
                                    })()}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : isGrupoCard ? (
                          /* Times do grupo com odds individuais — clicáveis */
                          <div className="space-y-1.5">
                            {parsedTeams.map((team, i) => {
                              const selId = `copa-card-${card.id}-${i}`;
                              const isSelected = selections.some(s => s.id === selId);
                              const hasOdd = team.odds != null;
                              return (
                                <button
                                  key={i}
                                  onClick={() => (hasOdd && !(cardBlocked && !isSelected)) ? handleToggleSelection(makeCopaSelection(team.name, team.odds!, selId)) : undefined}
                                  disabled={!hasOdd || (cardBlocked && !isSelected)}
                                  className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 transition-all ${(hasOdd && !(cardBlocked && !isSelected)) ? "cursor-pointer active:scale-95" : "cursor-default"}`}
                                  style={{
                                    background: isSelected ? "rgba(201,162,39,0.25)" : "rgba(0,0,0,0.3)",
                                    border: isSelected ? "1px solid rgba(201,162,39,0.7)" : "1px solid transparent",
                                    opacity: (cardBlocked && !isSelected) ? 0.3 : 1,
                                  }}
                                >
                                  <span className="text-white text-xs font-semibold text-left">{team.name}</span>
                                  {hasOdd ? (
                                    <span className={`text-xs font-black ml-2 shrink-0 px-1.5 py-0.5 rounded ${isSelected ? "text-black" : ""}`}
                                      style={{ background: isSelected ? "#f5c518" : "transparent", color: isSelected ? "#000" : "#f5c518" }}>
                                      {Number(team.odds).toFixed(2)}
                                    </span>
                                  ) : (
                                    <Lock className="w-3.5 h-3.5 ml-2 shrink-0 text-white/30" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          /* Card simples (outras sub-abas) — odd clicável */
                          (() => {
                            const selId = `copa-card-${card.id}-0`;
                            const isSelected = selections.some(s => s.id === selId);
                            return (
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  {(card.team1 || card.team2) && (
                                    <p className="text-white/60 text-xs">{card.team1}{card.team1 && card.team2 ? " × " : ""}{card.team2}</p>
                                  )}
                                </div>
                                {card.odds ? (
                                  <button
                                    onClick={() => !cardBlocked ? handleToggleSelection(makeCopaSelection(card.team1 || card.title, Number(card.odds), selId)) : undefined}
                                    disabled={cardBlocked && !isSelected}
                                    className="shrink-0 flex flex-col items-center rounded-lg px-2 py-1.5 ml-2 transition-all active:scale-95"
                                    style={{
                                      background: isSelected ? "rgba(201,162,39,0.3)" : "rgba(0,0,0,0.4)",
                                      border: isSelected ? "1px solid #f5c518" : "1px solid rgba(201,162,39,0.4)",
                                      opacity: cardBlocked && !isSelected ? 0.3 : 1,
                                      cursor: cardBlocked && !isSelected ? "default" : "pointer",
                                    }}
                                  >
                                    <span className="text-[9px] text-white/50 font-bold">ODD</span>
                                    <span className="text-base font-black" style={{ color: "#f5c518" }}>{Number(card.odds).toFixed(2)}</span>
                                  </button>
                                ) : (
                                  <div className="shrink-0 flex flex-col items-center justify-center rounded-lg px-2 py-1.5 ml-2"
                                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                    <Lock className="w-4 h-4 text-white/30" />
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        )}

                        {card.description && <p className="text-white/50 text-xs mt-2 leading-relaxed">{card.description}</p>}
                      </div>
                    </div>
                  );
                  });
                })()}
              </div>
            );
          })()
        ) : activeTab === "copa" && copaSubTab === "todos" ? (
          copaMundoLoading ? (
            <div className="px-3 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
              ))}
            </div>
          ) : copaMundoGames.length === 0 ? (
            <div className="mx-3 rounded-xl p-6 text-center" style={{ background: "#f3f4f6", border: "1px solid #e5e7eb" }}>
              <div className="text-4xl mb-3">🏆</div>
              <p className="text-gray-800 font-bold text-sm mb-1">Jogos da Copa em breve!</p>
              <p className="text-gray-500 text-xs">Os jogos da Copa do Mundo 2026 estarão disponíveis a partir de 11 de junho.</p>
            </div>
          ) : (
            <GamesList
              games={copaMundoGames}
              selections={selections}
              onGameClick={handleGameClick}
              onToggleSelection={handleToggleSelection}
              isLoading={false}
              error={null}
              selectedSport={null}
              isTodayGames={false}
              isDark={false}
            />
          )
        ) : (
          <GamesList
            games={filteredGames}
            selections={selections}
            onGameClick={handleGameClick}
            onToggleSelection={handleToggleSelection}
            isLoading={isTyping || (isSearching ? searchLoading : todayLoading)}
            error={null}
            selectedSport={null}
            isTodayGames={!isSearching && !isTyping && activeTab !== "champions"}
            hideHeader={activeTab === "champions"}
            isDark={false}
          />
        )}
      </div>

      {/* Footer */}
      <div className="py-4 px-4 text-center" style={{ borderTop: "1px solid rgba(201,162,39,0.15)" }}>
        <button onClick={() => setShowRules(true)} className="inline-flex items-center gap-2 text-sm font-semibold transition-colors" style={{ color: "#c9a227" }} data-testid="button-rules-copa">
          <BookOpen className="w-4 h-4" /> Regras do Site
        </button>
      </div>

      {/* Modals */}
      <GameDetailModal game={selectedGame} open={!!selectedGame} onClose={() => setSelectedGame(null)} selections={selections} onToggleSelection={handleToggleSelection} onMigrateGameId={handleMigrateGameId} />
      {showBetSlip && user && <BetSlip selections={selections} onRemoveSelection={handleRemoveSelection} onClearAll={handleClearAll} onClose={() => { if (selections.length > 0) { setIsBetSlipMinimized(true); } else { setShowBetSlip(false); } }} onPlaceBet={(stake, useBonus) => placeBetMutation.mutate({ selections, stake, useBonus })} placedBet={placedBet} isPlacing={placeBetMutation.isPending} isMinimized={isBetSlipMinimized} onToggleMinimize={setIsBetSlipMinimized} gameLimitRemaining={gameLimitRemaining} />}
      {showHistory && user && <BetHistory bets={betHistory} isLoading={historyLoading} onClose={() => setShowHistory(false)} />}
      <RulesModal open={showRules} onClose={() => setShowRules(false)} />
      <AuthModals mode={authMode} onClose={() => setAuthMode(null)} onSwitch={m => setAuthMode(m)} />
      <ProfileModal open={showProfile} onClose={() => { setShowProfile(false); refreshUser(); }} />
    </div>
  );
}
