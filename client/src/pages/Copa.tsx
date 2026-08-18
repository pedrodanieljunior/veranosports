import { useState, useEffect, useMemo, useRef } from "react";
import { NativeBottomNav } from "@/components/NativeBottomNav";
import copaTrofeuTab from "@assets/copa_trofeu_tab.png";
import headerBg from "@assets/IMG_0004_1780870047227.jpeg";
import { proxyLogoUrl } from "@/lib/imgProxy";
import { LEAGUE_IDS } from "@/lib/leagueIds";
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
import { BolaoCard } from "@/components/BolaoCard";
import { DueloCard } from "@/components/DueloCard";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { usePresence } from "@/hooks/use-presence";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getSessionId } from "@/lib/session";
import { GamesList } from "@/components/GamesList";
import { MobileNav } from "@/components/MobileNav";
import { LiveTestCard } from "@/components/LiveTestCard";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { History, Search, X, BookOpen, UserCircle, Calendar, CalendarDays, Users, Globe, BarChart2, Lock, Smartphone } from "lucide-react";
import { NotificationPanel, NotificationBanner } from "@/components/NotificationPanel";
import { translateLeagueName } from "@/lib/leagueTranslations";
import fwSportsLogo from "@assets/verano-logo-transparent.png";
import copaLogo from "@assets/copa_logo_transparent.png";
import brasileiraoLogo from "@assets/Brasileiro_SÃ©rie_A_1784212008632.png";
import libertadoresLogo from "@assets/Libertadores_1784212008631.png";
import copaBrasilLogo from "@assets/Copa_do_Brasil_1784212008632.png";
import { isNative, NATIVE_EVENTS, hapticLight, hapticMedium, hapticSuccess } from "@/lib/platform";


const WC_QUALIFIER_KEYS = [
  "soccer_wc_qualifiers_conmebol",
  "soccer_wc_qualifiers_europe",
  "soccer_wc_qualifiers_concacaf",
  "soccer_wc_qualifiers_caf",
  "soccer_wc_qualifiers_afc",
  "soccer_wc_intercontinental",
];

type CopaTab = "aovivo" | "todos" | "copa" | "brasileirao" | "libertadores" | "copa_brasil";
type CopaSubTab = "todos" | "grupos" | "longo" | "especiais";


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
  usePresence(activeTab);
  const [copaGrupoKey, setCopaGrupoKey] = useState<string>("todos");
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [boostIdx, setBoostIdx] = useState(0);
  const boostTouchRef = useRef(0);
  const pendingGameRef = useRef<Game | null>(null);
  const pendingSelectionRef = useRef<Selection | null>(null);


  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    const id = setInterval(() => {
      const newNow = Date.now();
      setNow(newNow);
      setSelections(prev => {
        const filtered = prev.filter(s => s.gameId.startsWith("copa-card-") || s.marketKey?.startsWith("live_m") || new Date(s.commenceTime).getTime() > newNow);
        if (filtered.length < prev.length) {
          toast({ title: "Jogo iniciado", description: "SeleÃ§Ã£o removida pois o jogo jÃ¡ comeÃ§ou.", variant: "destructive" });
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

  // â”€â”€ IntegraÃ§Ã£o com NativeBottomNav (app Android/iOS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!isNative()) return;

    const onTabChange = (e: Event) => {
      const { tab } = (e as CustomEvent<{ tab: string }>).detail;
      if (tab === "aovivo") setActiveTab("aovivo");
      if (tab === "jogos") setActiveTab("todos");
    };
    const onOpenBetSlip = () => {
      if (!user) { setAuthMode("login"); return; }
      setShowBetSlip(true);
      setShowHistory(false);
      setIsBetSlipMinimized(false);
    };
    const onOpenProfile = () => {
      if (!user) { setAuthMode("login"); return; }
      setShowProfile(true);
    };
    const onOpenHistory = () => {
      if (!user) { setAuthMode("login"); return; }
      setShowHistory(true);
      setShowBetSlip(false);
    };

    window.addEventListener(NATIVE_EVENTS.TAB_CHANGE, onTabChange);
    window.addEventListener(NATIVE_EVENTS.OPEN_BETSLIP, onOpenBetSlip);
    window.addEventListener(NATIVE_EVENTS.OPEN_PROFILE, onOpenProfile);
    window.addEventListener(NATIVE_EVENTS.OPEN_HISTORY, onOpenHistory);
    return () => {
      window.removeEventListener(NATIVE_EVENTS.TAB_CHANGE, onTabChange);
      window.removeEventListener(NATIVE_EVENTS.OPEN_BETSLIP, onOpenBetSlip);
      window.removeEventListener(NATIVE_EVENTS.OPEN_PROFILE, onOpenProfile);
      window.removeEventListener(NATIVE_EVENTS.OPEN_HISTORY, onOpenHistory);
    };
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
  useEffect(() => {
    if (boostCards.length <= 1) return;
    const id = setInterval(() => setBoostIdx(i => (i + 1) % boostCards.length), 5000);
    return () => clearInterval(id);
  }, [boostCards.length]);

  // SSE: receive live-state changes instantly (no waiting for next poll)
  useEffect(() => {
    const es = new EventSource("/api/live-events");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // Update live-status instantly (new multi-game format)
        queryClient.setQueryData(["/api/football/live-status"], data);
        // No invalidateQueries â€” LiveTestCard handles per-fixture cache updates via its own SSE listener.
      } catch {}
    };
    return () => es.close();
  }, []);

  const { data: liveStatus } = useQuery<{ games: { fixtureId: number; gameInfo: any; isLocked: boolean }[] }>({
    queryKey: ["/api/football/live-status"],
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const activeGames = liveStatus?.games ?? [];


  const { data: copaCards = [] } = useQuery<any[]>({
    queryKey: ["/api/copa-world-cup-cards"], staleTime: 60_000, refetchInterval: 60_000,
  });

  const { data: duelosData = [] } = useQuery<any[]>({
    queryKey: ["/api/duelo/active"],
    queryFn: async () => {
      const res = await fetch("/api/duelo/active");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  });

  const { data: bolaoData } = useQuery<any>({
    queryKey: ["/api/bolao/active"],
    queryFn: async () => {
      const res = await fetch("/api/bolao/active");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });


  const { data: copaMundoGames = [], isLoading: copaMundoLoading } = useQuery<Game[]>({
    queryKey: ["/api/copa-mundo-games"],
    staleTime: 0,
    refetchInterval: 5 * 60 * 1000,
    enabled: activeTab === "copa",
  });

  const { data: brazilianGames = [], isLoading: brazilianLoading } = useQuery<Game[]>({
    queryKey: ["/api/brazilian-games"],
    staleTime: 0,
    refetchInterval: 5 * 60 * 1000,
    enabled: activeTab === "brasileirao" || activeTab === "libertadores" || activeTab === "copa_brasil",
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
    return future;
  }, [baseGames, searchResults, isSearching, isTyping, activeTab, selectedSport, now]);

  const placeBetMutation = useMutation({
    mutationFn: async (data: { selections: Selection[]; stake: number; useBonus: boolean }) => {
      const res = await apiRequest("POST", "/api/bets", { ...data, sessionId, userId: user?.cpf });
      return res.json();
    },
    onSuccess: (data: BetSlipType) => {
      hapticSuccess();
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
    // Use snapshot only to decide which haptic to fire (once, outside the pure updater)
    const isRemoving = selections.some(s => s.id === selection.id);
    if (isRemoving) {
      hapticMedium();
      setSelections(prev => prev.filter(s => s.id !== selection.id));
      return;
    }
    // Validate against snapshot before committing; guard cases return early with no state change
    const isBoost = selection.marketKey === "boost";
    const hasBoost = selections.some(s => s.marketKey === "boost");
    const hasOther = selections.some(s => s.marketKey !== "boost");
    if (isBoost && hasBoost) { toast({ title: "Apenas 1 Super Boost por bilhete", description: "Remova o Super Boost atual antes de adicionar outro.", variant: "destructive" }); return; }
    if (isBoost && hasOther) { toast({ title: "Super Boost Ã© exclusivo", description: "Remova as outras seleÃ§Ãµes antes.", variant: "destructive" }); return; }
    if (!isBoost && hasBoost) { toast({ title: "Bilhete com Super Boost", description: "Remova o Super Boost para adicionar outras seleÃ§Ãµes.", variant: "destructive" }); return; }
    const withoutSameMarketSnap = selections.filter(s => !(s.gameId === selection.gameId && s.marketKey === selection.marketKey));
    const distinctMarkets = new Set(withoutSameMarketSnap.filter(s => s.gameId === selection.gameId).map(s => s.marketKey)).size;
    if (distinctMarkets >= 3) { toast({ title: "MÃ¡ximo de 3 mercados por jogo", variant: "destructive" }); return; }
    hapticLight();
    // Use functional updater for the actual mutation so concurrent updates don't discard each other
    setSelections(prev => {
      const withoutSameMarket = prev.filter(s => !(s.gameId === selection.gameId && s.marketKey === selection.marketKey));
      return [...withoutSameMarket, selection];
    });
    setShowBetSlip(true); setShowHistory(false); setIsBetSlipMinimized(true);
  };

  const handleRemoveSelection = (id: string) => { hapticMedium(); setSelections(prev => prev.filter(s => s.id !== id)); };
  const handleClearAll = () => {
    // Fire medium haptic only when there are selections to clear (not on the post-bet "new bet" path)
    if (selections.length > 0) hapticMedium();
    setSelections([]); setPlacedBet(null);
  };
  const handleMigrateGameId = (oldId: string, newId: string) => {
    setSelections(prev => prev.map(s => s.gameId === oldId ? { ...s, gameId: newId, id: s.id.replace(oldId, newId) } : s));
  };

  const hasLiveGame = activeGames.length > 0;

  const tabs: { key: CopaTab; label: string; icon: React.ReactNode }[] = [
    {
      key: "aovivo",
      label: "AO VIVO",
      icon: (
        <span className="relative flex items-center">
          <span className={`w-2 h-2 rounded-full ${hasLiveGame ? (activeTab === "aovivo" ? "bg-white animate-ping" : "bg-orange-400 animate-pulse") : "bg-gray-400"}`} />
        </span>
      ),
    },
    { key: "todos", label: "TODOS", icon: "ðŸ“…" },
    { key: "brasileirao", label: "BRASILEIRÃƒO", icon: <img src={brasileiraoLogo} alt="BrasileirÃ£o" className="w-5 h-5 object-contain" /> },
    { key: "libertadores", label: "LIBERTADORES", icon: <img src={libertadoresLogo} alt="Libertadores" className="w-5 h-5 object-contain" /> },
    { key: "copa_brasil", label: "COPA BR", icon: <img src={copaBrasilLogo} alt="Copa do Brasil" className="w-5 h-5 object-contain" /> },
    { key: "copa", label: "COPA DO MUNDO", icon: <img src={copaTrofeuTab} alt="Copa" className="w-5 h-5 object-contain" /> },
  ];

  const pendingBets = betHistory.filter(b => b.status === "pending").length;

  return (
    <div className="min-h-screen" style={{
      background: "#ffffff",
      position: "relative"
    }}>
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-50 px-3 py-2 flex flex-col gap-2" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center", borderBottom: "2px solid #e87c1e" }}>
        {/* Row 1: Logo + Copa badge + Auth */}
        <div className="flex items-center justify-between gap-2" style={{ position: "relative", zIndex: 1 }}>
          <div className="flex items-center gap-2">
            <img src={fwSportsLogo} alt="Verano Sports" className="h-16 w-auto object-contain" />
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
                <NotificationPanel />
                {!isNative() && (
                <button onClick={() => { setShowHistory(true); setShowBetSlip(false); }} className="relative inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold text-xs shadow-md whitespace-nowrap" style={{ background: "#1565C0", color: "white" }} data-testid="button-history-copa">
                  <History className="w-3.5 h-3.5" /><span>Apostas</span>
                  {pendingBets > 0 && <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center px-1 text-[10px] bg-red-500 text-white border-0">{pendingBets}</Badge>}
                </button>
                )}
                <button onClick={() => setShowProfile(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap" style={{ background: "rgba(201,162,39,0.15)", color: "#f5c518", border: "1px solid rgba(201,162,39,0.3)" }} data-testid="button-profile-copa">
                  <span className="text-[10px]">R${(user.balance + (user.bonusBalance ?? 0)).toFixed(2).replace(".", ",")}</span>
                  <UserCircle className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Ligas */}
        <div className="flex flex-row flex-nowrap items-center gap-1" style={{ position: "relative", zIndex: 1 }}>
          <MobileNav
            sports={sports}
            selectedSport={selectedSport}
            onSelectSport={(key) => { setSelectedSport(key); setActiveTab("todos"); }}
            isLoading={sportsLoading}
          />
        </div>

        {/* Row 3: Search */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-2 shadow-sm" style={{ position: "relative", zIndex: 1 }}>
          <Search className="w-4 h-4 shrink-0 text-gray-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar time ou seleÃ§Ã£o..." className="flex-1 bg-transparent text-gray-800 text-sm placeholder-gray-400 outline-none" data-testid="input-search-copa" />
          {searchQuery && <button onClick={() => setSearchQuery("")}><X className="w-4 h-4 text-gray-400" /></button>}
        </div>
      </header>

      <NotificationBanner />

      {/* ===== DUELOS ===== */}
      {duelosData.length > 0 && !isSearching && !isTyping && (
        <div className="pt-3">
          {duelosData.map((duelo: any) => (
            <DueloCard
              key={duelo.id}
              duelo={duelo}
              isLoggedIn={!!user}
              userBalance={user?.balance ?? 0}
              onLoginRequired={() => setAuthMode("login")}
            />
          ))}
        </div>
      )}

      {/* ===== BOLÃƒO DA COPA ===== */}
      {bolaoData && !isSearching && !isTyping && (
        <div className="px-3 pt-3">
          <BolaoCard
            data={bolaoData}
            isLoggedIn={!!user}
            userBalance={user?.balance ?? 0}
            onLoginRequired={() => setAuthMode("login")}
          />
        </div>
      )}

      {/* ===== BOOST CARDS ===== */}
      {boostCards.length > 0 && !isSearching && !isTyping && (
        <div className="pt-3">
          {boostCards.length === 1 ? (
            <BoostCard card={boostCards[0]} selections={selections} onToggleSelection={handleToggleSelection}
              usedByUser={user ? betHistory.some((b: BetSlipType) => Array.isArray(b.selections) && b.selections.some((s: any) => s.gameId === `boost-${boostCards[0].id}`)) : false} />
          ) : (
            <div>
              <div
                style={{ position: "relative", touchAction: "pan-y" }}
                onTouchStart={e => { boostTouchRef.current = e.touches[0].clientX; }}
                onTouchEnd={e => {
                  const diff = boostTouchRef.current - e.changedTouches[0].clientX;
                  if (diff > 50) setBoostIdx(i => Math.min(boostCards.length - 1, i + 1));
                  else if (diff < -50) setBoostIdx(i => Math.max(0, i - 1));
                }}
              >
                {boostCards.map((card, i) => (
                  <div key={card.id} style={{ display: i === boostIdx ? "block" : "none" }}>
                    <BoostCard card={card} selections={selections} onToggleSelection={handleToggleSelection}
                      usedByUser={user ? betHistory.some((b: BetSlipType) => Array.isArray(b.selections) && b.selections.some((s: any) => s.gameId === `boost-${card.id}`)) : false} />
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:8, paddingBottom:4 }}>
                {boostCards.map((_,i) => (
                  <button key={i} onClick={() => setBoostIdx(i)} style={{ height:6, width: i===boostIdx?18:6, borderRadius:9999, background: i===boostIdx?"rgba(255,255,255,0.85)":"rgba(255,255,255,0.35)", transition:"all 0.3s", border:"none", cursor:"pointer", padding:0 }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== TABS PRINCIPAIS ===== */}
      {!isSearching && !isTyping && (
        <div className="pt-3">
          {/* Linha 1: TODOS | COPA | QUALIFICATÃ“RIAS */}
          <div className="px-3">
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); if (tab.key === "copa") setCopaSubTab("todos"); }}
                  data-testid={`tab-copa-${tab.key}`}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold text-[10px] whitespace-nowrap transition-all shrink-0 ${tab.key === "aovivo" && hasLiveGame ? "animate-pulse" : ""}`}
                  style={activeTab === tab.key
                    ? tab.key 3#SRÃãƒR’"×Òóà¢Ç7â6Æ74æÖSÒ&föçBÖ&Æ6²FW‡BÕ³—…ÒÆVF–ærÖæöæRFW‡BÖ6VçFW"v†—FW76RÖæ÷w&"7G–ÆS×·²6öÆ÷#¢—47F—fRò"3#c"¢'&v&ƒ#SRÃ#SRÃ#SRÃãƒR’"ÂÆWGFW%76–æs¢#ã6VÒ"×Óà¢¶Æ&VÇÐ¢Â÷7ãà¢Âö'WGFöãà¢“°¢Ò—Ð¢ÂöF—cà¢ÂöF—cà¢—Ð ¢ÂöF—cà¢—Ð ¢²ò¢ÓÓÓÓÒtÔU2Ä•5BÓÓÓÓÒ¢÷Ð¢ÆF—b6Æ74æÖSÒ'‚ÓBÓ""ÓB#à¢¶7F—fUF"ÓÓÒ&÷f—fò"ò€¢ÆF—b6Æ74æÖSÒ'‚Ó2#à¢¶†4Æ—fTvÖRò€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂvÓ2#à¢¶7F—fTvÖW2æÖ†rÓâ€¢ÄÆ—fUFW7D6&B¶W“×¶ræf—‡GW&T–GÒf—‡GW&T–C×¶ræf—‡GW&T–GÒ6VÆV7F–öç3×·6VÆV7F–öç7ÒöåFövvÆU6VÆV7F–öã×¶†æFÆUFövvÆU6VÆV7F–öçÒ—4F&³×¶fÇ6WÒóà¢’—Ð¢ÂöF—cà¢’¢€¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"’Ó"FW‡BÖ6VçFW"#à¢Ç7â6Æ74æÖSÒ'rÓ2‚Ó2&÷VæFVBÖgVÆÂ&rÖw&’Ó3Ö"ÓB"óà¢Ç6Æ74æÖSÒ'FW‡BÖw&’ÓcföçB×6VÖ–&öÆBFW‡B×6Ò#äæVæ‡VÒ¦övòòf—fòæòÖöÖVçFóÂ÷à¢Ç6Æ74æÖSÒ'FW‡BÖw&’ÓCFW‡B×‡2×BÓ#ä÷2¦öv÷2òf—fò&V6W,:6òV’WFöÖF–6ÖVçFSÂ÷à¢ÂöF—cà¢—Ð¢ÂöF—cà¢’¢†7F—fUF"ÓÓÒ&'&6–ÆV—&ò"ÇÂ7F—fUF"ÓÓÒ&Æ–&W'FF÷&W2"ÇÂ7F—fUF"ÓÓÒ&6÷ö'&6–Â"’ò‚‚’Óâ°¢6öç7B7÷'D¶W”Ö¢&V6÷&CÇ7G&–ærÂ7G&–æsâÒ°¢'&6–ÆV—&ó¢'6ö66W%ö'&¦–Åö6×VöæFò"À¢Æ–&W'FF÷&W3¢'6ö66W%ö6öæÖV&öÅö6÷öÆ–&W'FF÷&W2"À¢6÷ö'&6–Ã¢'6ö66W%ö'&¦–Åö6÷öFõö'&6–Â"À¢Ó°¢6öç7BÆ&VÄÖ¢&V6÷&CÇ7G&–ærÂ²VÖö¦“¢7G&–æs²æÖS¢7G&–æs²V×G“¢7G&–ærÓâÒ°¢'&6–ÆV—&ó¢²VÖö¦“¢/	øz	ø{r"ÂæÖS¢$'&6–ÆV—,:6ò<:—&–R"ÂV×G“¢$æVæ‡VÒ¦övòFò'&6–ÆV—,:6òæ2,;7†–Ö2C‚†÷&2"ÒÀ¢Æ–&W'FF÷&W3¢²VÖö¦“¢/	øøb"ÂæÖS¢$6÷Æ–&W'FF÷&W2"ÂV×G“¢$æVæ‡VÒ¦övòFÆ–&W'FF÷&W2æ2,;7†–Ö2C‚†÷&2"ÒÀ¢6÷ö'&6–Ã¢²VÖö¦“¢/	úXr"ÂæÖS¢$6÷Fò'&6–Â"ÂV×G“¢$æVæ‡VÒ¦övòF6÷Fò'&6–Âæ2,;7†–Ö2C‚†÷&2"ÒÀ¢Ó°¢6öç7B7÷'D¶W’Ò7÷'D¶W”Ö¶7F—fUF%Ó°¢6öç7BÖWFÒÆ&VÄÖ¶7F—fUF%Ó°¢6öç7BF$vÖW2Ò'&¦–Æ–ävÖW0¢æf–ÇFW"†rÓârç7÷'D¶W’ÓÓÒ7÷'D¶W’bbæWrFFR†ræ6öÖÖVæ6UF–ÖR’ævWEF–ÖR‚’âæ÷r¢ç6÷'B‚†Â"’ÓâæWrFFR†æ6öÖÖVæ6UF–ÖR’ævWEF–ÖR‚’ÒæWrFFR†"æ6öÖÖVæ6UF–ÖR’ævWEF–ÖR‚’“° ¢–b†'&¦–Æ–äÆöF–ær’°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ'‚Ó2BÓbfÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"vÓ"FW‡BÖw&’ÓC#à¢ÆF—b6Æ74æÖSÒ'rÓb‚Ób&÷&FW"Ó"&÷&FW"Öw&’Ó3&÷&FW"×BÖ&ÇVRÓS&÷VæFVBÖgVÆÂæ–ÖFR×7–â"óà¢Ç6Æ74æÖSÒ'FW‡B×‡2#ä6'&VvæFò¦öv÷2ââãÂ÷à¢ÂöF—cà¢“°¢Ð¢–b‡F$vÖW2æÆVæwF‚ÓÓÒ’°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&×‚Ó2×BÓ"&÷VæFVB×†ÂÓ‚FW‡BÖ6VçFW""7G–ÆS×·²&6¶w&÷VæC¢"6c6cFcb"Â&÷&FW#¢#‚6öÆ–B6SVSvV""×Óà¢ÆF—b6Æ74æÖSÒ'FW‡BÓG†ÂÖ"Ó2#ç¶ÖWFæVÖö¦—ÓÂöF—cà¢Ç6Æ74æÖSÒ'FW‡BÖw&’ÓƒföçBÖ&öÆBFW‡B×6ÒÖ"Ó#ç¶ÖWFææÖWÓÂ÷à¢Ç6Æ74æÖSÒ'FW‡BÖw&’ÓSFW‡B×‡2#ç¶ÖWFæV×G—ÓÂ÷à¢ÂöF—cà¢“°¢Ð¢6öç7BÆVwVT–BÒÄTuTUô”E5·7÷'D¶W•Ó°¢&WGW&â€¢Ãà¢²ò¢ÆVvVæFFÆ–v6öÒÆövò¢÷Ð¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"‚ÓBBÓ2"Ó#à¢¶ÆVwVT–Bbb€¢Æ–Öp¢7&3×·&÷‡”ÆövõW&Â†‡GG3¢òöÖVF–æ’×7÷'G2æ–òöfö÷F&ÆÂöÆVwVW2òG¶ÆVwVT–GÒçæv—Ð¢ÇCÒ" ¢v–GFƒ×³‡Ð¢†V–v‡C×³‡Ð¢6Æ74æÖSÒ'rÕ³‡…Ò‚Õ³‡…Òö&¦V7BÖ6öçF–âfÆW‚×6‡&–æ²Ó ¢óà¢—Ð¢Æƒ26Æ74æÖSÒ'FW‡B×6ÒföçBÖ&öÆBFW‡BÖw&’Óƒ#ç¶ÖWFææÖWÓÂöƒ3à¢Ç7â6Æ74æÖSÒ'FW‡B×‡2ÖÂÓFW‡BÖw&’ÓC#à¢·F$vÖW2æÆVæwF‡Ò·F$vÖW2æÆVæwF‚ÓÓÒò&¦övò"¢&¦öv÷2'Ð¢Â÷7ãà¢ÂöF—cà¢ÄvÖW4Æ—7@¢vÖW3×·F$vÖW7Ð¢6VÆV7F–öç3×·6VÆV7F–öç7Ð¢öåFövvÆU6VÆV7F–öã×¶†æFÆUFövvÆU6VÆV7F–öçÐ¢öävÖT6Æ–6³×¶†æFÆTvÖT6Æ–6·Ð¢—4F&³×¶fÇ6WÐ¢óà¢Âóà¢“°¢Ò’‚’¢7F—fUF"ÓÓÒ&6÷"bb6÷7V%F"ÓÒ'FöF÷2"ò€¢‚‚’Óâ°¢6öç7B4õôu%Uõ2Ò²$"Â$""Â$2"Â$B"Â$R"Â$b"Â$r"Â$‚"Â$’"Â$¢"Â$²"Â$Â%Ó°¢6öç7B7V$6&G2Ò6÷6&G2æf–ÇFW"‚†3¢ç’’Óâ2ç7V%F"ÓÓÒ6÷7V%F"“°¢6öç7Bf—6–&ÆT6&G2Ò6÷7V%F"ÓÓÒ&w'W÷2"bb6÷w'Wô¶W’ÓÒ'FöF÷2 ¢ò7V$6&G2æf–ÇFW"‚†3¢ç’’Óâ2æ&FvRÓÓÒw'WòG¶6÷w'Wô¶W—Ö¢¢7V$6&G3° ¢–b‡7V$6&G2æÆVæwF‚ÓÓÒ’&WGW&â€¢Ãà¢¶6÷7V%F"ÓÓÒ&w'W÷2"bb€¢ÆF—b6Æ74æÖSÒ'‚Ó2Ö"Ó2÷fW&fÆ÷r×‚ÖWFò#à¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓãR"Ó"7G–ÆS×·²Ö–åv–GFƒ¢&Ö‚Ö6öçFVçB"×Óà¢Æ'WGFöâöä6Æ–6³×²‚’Óâ6WD6÷w'Wô¶W’‚'FöF÷2"—ÒFF×FW7F–CÒ&w'Wò×FöF÷2 ¢6Æ74æÖSÒ'‚Ó2’ÓãR&÷VæFVBÖgVÆÂFW‡BÕ³…ÒföçBÖ&Æ6²G&ç6—F–öâÖÆÂv†—FW76RÖæ÷w& ¢7G–ÆS×·²&6¶w&÷VæC¢6÷w'Wô¶W’ÓÓÒ'FöF÷2"ò"63–##r"¢"6c6cFcb"Â6öÆ÷#¢6÷w'Wô¶W’ÓÓÒ'FöF÷2"ò"3#c"¢"33sCS"Â&÷&FW#¢6÷w'Wô¶W’ÓÓÒ'FöF÷2"ò&æöæR"¢#‚6öÆ–B6SVSvV""×Óà¢DôDõ0¢Âö'WGFöãà¢´4õôu%Uõ2æÖ†rÓâ€¢Æ'WGFöâ¶W“×¶wÒöä6Æ–6³×²‚’Óâ6WD6÷w'Wô¶W’†r—ÒFF×FW7F–C×¶w'WòÒG¶wÖÐ¢6Æ74æÖSÒ'‚Ó2’ÓãR&÷VæFVBÖgVÆÂFW‡BÕ³…ÒföçBÖ&Æ6²G&ç6—F–öâÖÆÂv†—FW76RÖæ÷w& ¢7G–ÆS×·²&6¶w&÷VæC¢6÷w'Wô¶W’ÓÓÒrò"63–##r"¢"6c6cFcb"Â6öÆ÷#¢6÷w'Wô¶W’ÓÓÒrò"3#c"¢"33sCS"Â&÷&FW#¢6÷w'Wô¶W’ÓÓÒrò&æöæR"¢#‚6öÆ–B6SVSvV""×Óà¢u%Uò¶wÐ¢Âö'WGFöãà¢’—Ð¢ÂöF—cà¢ÂöF—cà¢—Ð¢ÆF—b6Æ74æÖSÒ&×‚Ó2&÷VæFVB×†ÂÓbFW‡BÖ6VçFW""7G–ÆS×·²&6¶w&÷VæC¢"6c6cFcb"Â&÷&FW#¢#‚6öÆ–B6SVSvV""×Óà¢ÆF—b6Æ74æÖSÒ'FW‡BÓG†ÂÖ"Ó2#ï	øøcÂöF—cà¢Ç6Æ74æÖSÒ'FW‡BÖw&’ÓƒföçBÖ&öÆBFW‡B×6ÒÖ"Ó#äVÒ'&WfRÂ÷à¢Ç6Æ74æÖSÒ'FW‡BÖw&’ÓSFW‡B×‡2#ä÷26&G2FW7F6\:|:6ò6W,:6òF–6–öæF÷2VÒ'&WfRãÂ÷à¢ÂöF—cà¢Âóà¢“°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ'‚Ó276R×’Ó2#à¢¶6÷7V%F"ÓÓÒ&w'W÷2"bb€¢ÆF—b6Æ74æÖSÒ&÷fW&fÆ÷r×‚ÖWFòÖ×‚Ó2‚Ó2Ö"Ó#à¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓãR"Ó"7G–ÆS×·²Ö–åv–GFƒ¢&Ö‚Ö6öçFVçB"×Óà¢Æ'WGFöâöä6Æ–6³×²‚’Óâ6WD6÷w'Wô¶W’‚'FöF÷2"—ÒFF×FW7F–CÒ&w'Wò×FöF÷2 ¢6Æ74æÖSÒ'‚Ó2’ÓãR&÷VæFVBÖgVÆÂFW‡BÕ³…ÒföçBÖ&Æ6²G&ç6—F–öâÖÆÂv†—FW76RÖæ÷w& ¢7G–ÆS×·²&6¶w&÷VæC¢6÷w'Wô¶W’ÓÓÒ'FöF÷2"ò"63–##r"¢"6c6cFcb"Â6öÆ÷#¢6÷w'Wô¶W’ÓÓÒ'FöF÷2"ò"3#c"¢"33sCS"Â&÷&FW#¢6÷w'Wô¶W’ÓÓÒ'FöF÷2"ò&æöæR"¢#‚6öÆ–B6SVSvV""×Óà¢DôDõ0¢Âö'WGFöãà¢´4õôu%Uõ2æÖ†rÓâ€¢Æ'WGFöâ¶W“×¶wÒöä6Æ–6³×²‚’Óâ6WD6÷w'Wô¶W’†r—ÒFF×FW7F–C×¶w'WòÒG¶wÖÐ¢6Æ74æÖSÒ'‚Ó2’ÓãR&÷VæFVBÖgVÆÂFW‡BÕ³…ÒföçBÖ&Æ6²G&ç6—F–öâÖÆÂv†—FW76RÖæ÷w& ¢7G–ÆS×·²&6¶w&÷VæC¢6÷w'Wô¶W’ÓÓÒrò"63–##r"¢"6c6cFcb"Â6öÆ÷#¢6÷w'Wô¶W’ÓÓÒrò"3#c"¢"33sCS"Â&÷&FW#¢6÷w'Wô¶W’ÓÓÒrò&æöæR"¢#‚6öÆ–B6SVSvV""×Óà¢u%Uò¶wÐ¢Âö'WGFöãà¢’—Ð¢ÂöF—cà¢ÂöF—cà¢—Ð¢²‚‚’Óâ°¢6öç7B6VÆV7FVD6÷6&D–G2ÒæWr6WB€¢6VÆV7F–öç0¢æf–ÇFW"‡2Óâ2ævÖT–Bç7F'G5v—F‚‚&6÷Ö6&BÒ"’¢æÖ‡2Óâ2ævÖT–Bç&WÆ6R‚&6÷Ö6&BÒ"Â""’¢“°¢6öç7B6VÆV7FVE7V%F'2ÒæWr6WB€¢6÷6&G0¢æf–ÇFW"‚†3¢ç’’Óâ6VÆV7FVD6÷6&D–G2æ†2…7G&–ær†2æ–B’’¢æÖ‚†3¢ç’’Óâ2ç7V%F"27G&–ær¢“°¢6öç7B†4Æöævô÷$W7V6–—56VÆV7FVBÒ6VÆV7FVE7V%F'2æ†2‚&Æöævò"’ÇÂ6VÆV7FVE7V%F'2æ†2‚&W7V6–—2"“°¢6öç7B†4w'W÷56VÆV7FVBÒ6VÆV7FVE7V%F'2æ†2‚&w'W÷2"“° ¢&WGW&â‡f—6–&ÆT6&G22ç•µÒ’æÖ‚†6&C¢ç’’Óâ°¢6öç7B6&D—56VÆV7FVBÒ6VÆV7FVD6÷6&D–G2æ†2…7G&–ær†6&Bæ–B’“°¢ÆWB6&D&Æö6¶VBÒfÇ6S°¢–b†6&Bç7V%F"ÓÓÒ&w'W÷2"’°¢6&D&Æö6¶VBÒ†4Æöævô÷$W7V6–—56VÆV7FVC°¢ÒVÇ6R–b†6&Bç7V%F"ÓÓÒ&Æöævò"ÇÂ6&Bç7V%F"ÓÓÒ&W7V6–—2"’°¢6&D&Æö6¶VBÒ6&D—56VÆV7FVBbb††4w'W÷56VÆV7FVBÇÂ†4Æöævô÷$W7V6–—56VÆV7FVB“°¢Ð¢ÆWB'6VEFV×3¢²æÖS¢7G&–æs²öFG3¢çVÖ&W"ÂçVÆÂÕµÒÒµÓ°¢ÆWBF&ÆTFF¢²G—S¢7G&–æs²6öÇVÖç3¢²æÖS¢7G&–æs²Öƒ¢çVÖ&W"ÕµÓ²FV×3¢²æÖS¢7G&–æs²öFG3¢†çVÖ&W"ÂçVÆÂ•µÒÕµÒÒÂçVÆÂÒçVÆÃ°¢–b†6&BçFV×4§6öâ’°¢G'’°¢6öç7B'6VBÒ¥4ôâç'6R†6&BçFV×4§6öâ“°¢–b‡'6VBbb'&’æ—4'&’‡'6VB’bb'6VBçG—RÓÓÒ'F&ÆR"’°¢F&ÆTFFÒ°¢ââç'6VBÀ¢6öÇVÖç3¢‡'6VBæ6öÇVÖç2ÇÂµÒ’æÖ‚†3¢ç’’Óà¢G—Vöb2ÓÓÒ'7G&–ær"ò²æÖS¢2ÂÖƒ¢Ò¢²æÖS¢2ææÖRÇÂ2ÂÖƒ¢2æÖ‚ÇÂÐ¢’À¢Ó°¢ÒVÇ6R–b„'&’æ—4'&’‡'6VB’’°¢'6VEFV×2Ò'6VC°¢Ð¢Ò6F6‚·Ð¢Ð¢6öç7B—5F&ÆT6&BÒF&ÆTFFÓÒçVÆÃ°¢6öç7B—4w'Wô6&BÒ'6VEFV×2æÆVæwF‚â°¢6öç7Bt5ôDDRÒ###bÓbÓC££ã¢#° ¢6öç7BÖ¶T6÷6VÆV7F–öâÒ†÷WF6öÖS¢7G&–ærÂöFG3¢çVÖ&W"Â6VÄ–C¢7G&–ærÂÖ&¶WD¶W’Ò&6÷öw'Wò"“¢6VÆV7F–öâÓâ‡°¢–C¢6VÄ–BÀ¢vÖT–C¢6÷Ö6&BÒG¶6&Bæ–GÖÀ¢†öÖUFVÓ¢6&BçF—FÆRÀ¢v•FVÓ¢""À¢6öÖÖVæ6UF–ÖS¢t5ôDDRÀ¢7÷'EF—FÆS¢$6÷Fò×VæFò##b"À¢Ö&¶WD¶W’À¢&öö¶Ö¶W#¢%fW&æò7÷'G2"À¢÷WF6öÖRÀ¢öFG2À¢Ò“° ¢&WGW&â€¢ÆF—b¶W“×¶6&Bæ–GÒ6Æ74æÖSÒ'&÷VæFVB×†Â÷fW&fÆ÷rÖ†–FFVâ"7G–ÆS×·²&6¶w&÷VæC¢&Æ–æV"Öw&F–VçBƒ3VFVrÂ3C6RÂ3VS&CRÂ3cFbR’"Â&÷&FW#¢#‚6öÆ–B&v&ƒ#Ãc"Ã3’Ãã2’"×Óà¢ÆF—b6Æ74æÖSÒ'Ó2#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2×7F'B§W7F–g’Ö&WGvVVâvÓ"Ö"Ó"#à¢ÆF—b6Æ74æÖSÒ&fÆW‚ÓÖ–â×rÓ#à¢¶6&Bæ&FvRbbÇ7â6Æ74æÖSÒ&–æÆ–æRÖ&Æö6²‚Ó"’ÓãR&÷VæFVBFW‡BÕ³…ÒföçBÖ&Æ6²Ö"Ó"7G–ÆS×·²&6¶w&÷VæC¢'&v&ƒ#Ãc"Ã3’Ãã"’"Â6öÆ÷#¢"6cV3S‚"×Óç¶6&Bæ&FvWÓÂ÷7ãçÐ¢Æƒ26Æ74æÖSÒ'FW‡B×v†—FRföçBÖ&öÆBFW‡B×6ÒÆVF–ær×F–v‡B#ç¶6&BçF—FÆWÓÂöƒ3à¢ÂöF—cà¢ÂöF—cà ¢¶—5F&ÆT6&Bò€¢ò¢)H)HF&VÆFRw'Wò6öÒÜ;¦ÇF—Æ÷2ÖW&6F÷2)H)H¢ð¢ÆF—b6Æ74æÖSÒ&÷fW&fÆ÷r×‚ÖWFò#à¢ÇF&ÆR6Æ74æÖSÒ'rÖgVÆÂFW‡B×‡2&÷&FW"Ö6öÆÆ6R"7G–ÆS×·²Ö–åv–GFƒ¢G²‡F&ÆTFFæ6öÇVÖç2æÆVæwF‚¢s’²×†×Óà¢ÇF†VCà¢ÇG#à¢ÇF‚6Æ74æÖSÒ'FW‡BÖÆVgB"ÓãR"Ó"föçBÖæ÷&ÖÂFW‡B×v†—FRóCFW‡BÕ³…Ò#å6VÆ\:|:6óÂ÷Fƒà¢·F&ÆTFFæ6öÇVÖç2æÖ‚†6öÂÂ6’’Óâ€¢ÇF‚¶W“×¶6—Ò6Æ74æÖSÒ'FW‡BÖ6VçFW""ÓãR‚ÓföçBÖ&öÆBFW‡B×v†—FRósFW‡BÕ³…Òv†—FW76RÖæ÷w&#ç¶6öÂææÖWÓÂ÷Fƒà¢’—Ð¢Â÷G#à¢Â÷F†VCà¢ÇF&öG“à¢·F&ÆTFFçFV×2æÖ‚‡FVÒÂF’’Óâ€¢ÇG"¶W“×·F—Ò6Æ74æÖSÒ&&÷&FW"×B"7G–ÆS×·²&÷&FW$6öÆ÷#¢'&v&ƒ#SRÃ#SRÃ#SRÃãR’"×Óà¢ÇFB6Æ74æÖSÒ'’ÓãR"Ó"FW‡B×v†—FRföçB×6VÖ–&öÆBv†—FW76RÖæ÷w&#ç·FVÒææÖWÓÂ÷FCà¢²‚‚’Óâ°¢6öç7BF&ÆT†56VÆV7F–öâÒF&ÆTFFçFV×2ç6öÖR‚…òÂ÷F†W%F’’Óà¢F&ÆTFFæ6öÇVÖç2ç6öÖR‚…òÂ÷F†W$6’’Óà¢6VÆV7F–öç2ç6öÖR‡2Óâ2æ–BÓÓÒ6÷Ö6&BÒG¶6&Bæ–GÒ×BG¶÷F†W%F—ÒÖ2G¶÷F†W$6—Ö¢¢“°¢&WGW&âF&ÆTFFæ6öÇVÖç2æÖ‚†6öÂÂ6’’Óâ°¢6öç7BöFBÒFVÒæöFG5¶6•Ó°¢6öç7B6VÄ–BÒ6÷Ö6&BÒG¶6&Bæ–GÒ×BG·F—ÒÖ2G¶6—Ö°¢6öç7B—56VÆV7FVBÒ6VÆV7F–öç2ç6öÖR‡2Óâ2æ–BÓÓÒ6VÄ–B“°¢6öç7B†4öFBÒöFBÒçVÆÃ°¢6öç7B—4F—6&ÆVBÒ†4öFBÇÂ‚—56VÆV7FVBbb‡F&ÆT†56VÆV7F–öâÇÂ6&D&Æö6¶VB’“°¢&WGW&â€¢ÇFB¶W“×¶6—Ò6Æ74æÖSÒ'’Ó‚ÓãR#à¢Æ'WGFöà¢öä6Æ–6³×²‚’Óâ—4F—6&ÆVBò†æFÆUFövvÆU6VÆV7F–öâ†Ö¶T6÷6VÆV7F–öâ†G·FVÒææÖWÒ(	2G¶6öÂææÖWÖÂöFBÂ6VÄ–BÂ6÷öw'Wõö6öÂG¶6—Ö’’¢VæFVf–æVGÐ¢F—6&ÆVC×¶—4F—6&ÆVGÐ¢6Æ74æÖS×¶rÖgVÆÂFW‡BÖ6VçFW"&÷VæFVB‚ÓãR’ÓãRföçBÖ&Æ6²FW‡B×‡2G&ç6—F–öâÖÆÂG²—4F—6&ÆVBò&7W'6÷"×ö–çFW"7F—fS§66ÆRÓ“R"¢&7W'6÷"ÖFVfVÇB÷6—G’Ó3'ÖÐ¢7G–ÆS×·²&6¶w&÷VæC¢—56VÆV7FVBò"63–##r"¢'&v&ƒÃÃÃã3R’"Â6öÆ÷#¢—56VÆV7FVBò"3#c"¢"6cV3S‚"ÂÖ–åv–GFƒ¢#S'‚"×Óà¢¶†4öFBòçVÖ&W"†öFB’çFôf—†VBƒ"’¢.(	B'Ð¢Âö'WGFöãà¢Â÷FCà¢“°¢Ò“°¢Ò’‚—Ð¢Â÷G#à¢’—Ð¢Â÷F&öG“à¢Â÷F&ÆSà¢ÂöF—cà¢’¢—4w'Wô6&Bò€¢ò¢F–ÖW2Fòw'Wò6öÒöFG2–æF—f–GV—2(	B6Æ–<:fV—2¢ð¢ÆF—b6Æ74æÖSÒ'76R×’ÓãR#à¢·'6VEFV×2æÖ‚‡FVÒÂ’’Óâ°¢6öç7B6VÄ–BÒ6÷Ö6&BÒG¶6&Bæ–GÒÒG¶—Ö°¢6öç7B—56VÆV7FVBÒ6VÆV7F–öç2ç6öÖR‡2Óâ2æ–BÓÓÒ6VÄ–B“°¢6öç7B†4öFBÒFVÒæöFG2ÒçVÆÃ°¢&WGW&â€¢Æ'WGFöà¢¶W“×¶—Ð¢öä6Æ–6³×²‚’Óâ††4öFBbb†6&D&Æö6¶VBbb—56VÆV7FVB’’ò†æFÆUFövvÆU6VÆV7F–öâ†Ö¶T6÷6VÆV7F–öâ‡FVÒææÖRÂFVÒæöFG2Â6VÄ–B’’¢VæFVf–æVGÐ¢F—6&ÆVC×²†4öFBÇÂ†6&D&Æö6¶VBbb—56VÆV7FVB—Ð¢6Æ74æÖS×¶rÖgVÆÂfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâ&÷VæFVBÖÆr‚Ó"ãR’Ó"G&ç6—F–öâÖÆÂG²††4öFBbb†6&D&Æö6¶VBbb—56VÆV7FVB’’ò&7W'6÷"×ö–çFW"7F—fS§66ÆRÓ“R"¢&7W'6÷"ÖFVfVÇB'ÖÐ¢7G–ÆS×·°¢&6¶w&÷VæC¢—56VÆV7FVBò'&v&ƒ#Ãc"Ã3’Ãã#R’"¢'&v&ƒÃÃÃã2’"À¢&÷&FW#¢—56VÆV7FVBò#‚6öÆ–B&v&ƒ#Ãc"Ã3’Ããr’"¢#‚6öÆ–BG&ç7&VçB"À¢÷6—G“¢†6&D&Æö6¶VBbb—56VÆV7FVB’òã2¢À¢×Ð¢à¢Ç7â6Æ74æÖSÒ'FW‡B×v†—FRFW‡B×‡2föçB×6VÖ–&öÆBFW‡BÖÆVgB#ç·FVÒææÖWÓÂ÷7ãà¢¶†4öFBò€¢Ç7â6Æ74æÖS×¶FW‡B×‡2föçBÖ&Æ6²ÖÂÓ"6‡&–æ²Ó‚ÓãR’ÓãR&÷VæFVBG¶—56VÆV7FVBò'FW‡BÖ&Æ6²"¢"'ÖÐ¢7G–ÆS×·²&6¶w&÷VæC¢—56VÆV7FVBò"6cV3S‚"¢'G&ç7&VçB"Â6öÆ÷#¢—56VÆV7FVBò"3"¢"6cV3S‚"×Óà¢´çVÖ&W"‡FVÒæöFG2’çFôf—†VBƒ"—Ð¢Â÷7ãà¢’¢€¢ÄÆö6²6Æ74æÖSÒ'rÓ2ãR‚Ó2ãRÖÂÓ"6‡&–æ²ÓFW‡B×v†—FRó3"óà¢—Ð¢Âö'WGFöãà¢“°¢Ò—Ð¢ÂöF—cà¢’¢€¢ò¢6&B6–×ÆW2†÷WG&27V"Ö&2’(	BöFB6Æ–<:fVÂ¢ð¢‚‚’Óâ°¢6öç7B6VÄ–BÒ6÷Ö6&BÒG¶6&Bæ–GÒÓ°¢6öç7B—56VÆV7FVBÒ6VÆV7F–öç2ç6öÖR‡2Óâ2æ–BÓÓÒ6VÄ–B“°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2×7F'B§W7F–g’Ö&WGvVVâvÓ"#à¢ÆF—b6Æ74æÖSÒ&fÆW‚ÓÖ–â×rÓ#à¢²†6&BçFVÓÇÂ6&BçFVÓ"’bb€¢Ç6Æ74æÖSÒ'FW‡B×v†—FRócFW‡B×‡2#ç¶6&BçFVÓ×¶6&BçFVÓbb6&BçFVÓ"ò"9r"¢"'×¶6&BçFVÓ'ÓÂ÷à¢—Ð¢ÂöF—cà¢¶6&BæöFG2ò€¢Æ'WGFöà¢öä6Æ–6³×²‚’Óâ6&D&Æö6¶VBò†æFÆUFövvÆU6VÆV7F–öâ†Ö¶T6÷6VÆV7F–öâ†6&BçFVÓÇÂ6&BçF—FÆRÂçVÖ&W"†6&BæöFG2’Â6VÄ–B’’¢VæFVf–æVGÐ¢F—6&ÆVC×¶6&D&Æö6¶VBbb—56VÆV7FVGÐ¢6Æ74æÖSÒ'6‡&–æ²ÓfÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"&÷VæFVBÖÆr‚Ó"’ÓãRÖÂÓ"G&ç6—F–öâÖÆÂ7F—fS§66ÆRÓ“R ¢7G–ÆS×·°¢&6¶w&÷VæC¢—56VÆV7FVBò'&v&ƒ#Ãc"Ã3’Ãã2’"¢'&v&ƒÃÃÃãB’"À¢&÷&FW#¢—56VÆV7FVBò#‚6öÆ–B6cV3S‚"¢#‚6öÆ–B&v&ƒ#Ãc"Ã3’ÃãB’"À¢÷6—G“¢6&D&Æö6¶VBbb—56VÆV7FVBòã2¢À¢7W'6÷#¢6&D&Æö6¶VBbb—56VÆV7FVBò&FVfVÇB"¢'ö–çFW""À¢×Ð¢à¢Ç7â6Æ74æÖSÒ'FW‡BÕ³—…ÒFW‡B×v†—FRóSföçBÖ&öÆB#äôDCÂ÷7ãà¢Ç7â6Æ74æÖSÒ'FW‡BÖ&6RföçBÖ&Æ6²"7G–ÆS×·²6öÆ÷#¢"6cV3S‚"×Óç´çVÖ&W"†6&BæöFG2’çFôf—†VBƒ"—ÓÂ÷7ãà¢Âö'WGFöãà¢’¢€¢ÆF—b6Æ74æÖSÒ'6‡&–æ²ÓfÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖÆr‚Ó"’ÓãRÖÂÓ" ¢7G–ÆS×·²&6¶w&÷VæC¢'&v&ƒÃÃÃã2’"Â&÷&FW#¢#‚6öÆ–B&v&ƒ#SRÃ#SRÃ#SRÃã’"×Óà¢ÄÆö6²6Æ74æÖSÒ'rÓB‚ÓBFW‡B×v†—FRó3"óà¢ÂöF—cà¢—Ð¢ÂöF—cà¢“°¢Ò’‚¢—Ð ¢¶6&BæFW67&—F–öâbbÇ6Æ74æÖSÒ'FW‡B×v†—FRóSFW‡B×‡2×BÓ"ÆVF–ær×&VÆ†VB#ç¶6&BæFW67&—F–öçÓÂ÷çÐ¢ÂöF—cà¢ÂöF—cà¢“°¢Ò“°¢Ò’‚—Ð¢ÂöF—cà¢“°¢Ò’‚¢’¢7F—fUF"ÓÓÒ&6÷"bb6÷7V%F"ÓÓÒ'FöF÷2"ò€¢6÷×VæFôÆöF–ærò€¢ÆF—b6Æ74æÖSÒ'‚Ó276R×’Ó2#à¢µ³Ã"Ã5ÒæÖ†’Óâ€¢ÆF—b¶W“×¶—Ò6Æ74æÖSÒ&‚Ó#&÷VæFVB×†Âæ–ÖFR×VÇ6R"7G–ÆS×·²&6¶w&÷VæC¢'&v&ƒ#SRÃ#SRÃ#SRÃãb’"×Òóà¢’—Ð¢ÂöF—cà¢’¢6÷×VæFôvÖW2æÆVæwF‚ÓÓÒò€¢ÆF—b6Æ74æÖSÒ&×‚Ó2&÷VæFVB×†ÂÓbFW‡BÖ6VçFW""7G–ÆS×·²&6¶w&÷VæC¢"6c6cFcb"Â&÷&FW#¢#‚6öÆ–B6SVSvV""×Óà¢ÆF—b6Æ74æÖSÒ'FW‡BÓG†ÂÖ"Ó2#ï	øøcÂöF—cà¢Ç6Æ74æÖSÒ'FW‡BÖw&’ÓƒföçBÖ&öÆBFW‡B×6ÒÖ"Ó#ä¦öv÷2F6÷VÒ'&WfRÂ÷à¢Ç6Æ74æÖSÒ'FW‡BÖw&’ÓSFW‡B×‡2#ä÷2¦öv÷2F6÷Fò×VæFò##bW7F,:6òF—7öì:×fV—2'F—"FRFR§Væ†òãÂ÷à¢ÂöF—cà¢’¢€¢ÄvÖW4Æ—7@¢vÖW3×¶6÷×VæFôvÖW7Ð¢6VÆV7F–öç3×·6VÆV7F–öç7Ð¢öävÖT6Æ–6³×¶†æFÆTvÖT6Æ–6·Ð¢öåFövvÆU6VÆV7F–öã×¶†æFÆUFövvÆU6VÆV7F–öçÐ¢—4ÆöF–æs×¶fÇ6WÐ¢W'&÷#×¶çVÆÇÐ¢6VÆV7FVE7÷'C×¶çVÆÇÐ¢—5FöF”vÖW3×¶fÇ6WÐ¢—4F&³×¶fÇ6WÐ¢óà¢¢’¢€¢ÄvÖW4Æ—7@¢vÖW3×¶f–ÇFW&VDvÖW7Ð¢6VÆV7F–öç3×·6VÆV7F–öç7Ð¢öävÖT6Æ–6³×¶†æFÆTvÖT6Æ–6·Ð¢öåFövvÆU6VÆV7F–öã×¶†æFÆUFövvÆU6VÆV7F–öçÐ¢—4ÆöF–æs×¶—5G—–ærÇÂ†—56V&6†–ærò6V&6„ÆöF–ær¢FöF”ÆöF–ær—Ð¢W'&÷#×¶çVÆÇÐ¢6VÆV7FVE7÷'C×¶çVÆÇÐ¢—5FöF”vÖW3×²—56V&6†–ærbb—5G—–æwÐ¢†–FT†VFW#×¶fÇ6WÐ¢—4F&³×¶fÇ6WÐ¢óà¢—Ð¢ÂöF—cà ¢²ò¢fö÷FW"¢÷Ð¢ÆF—b6Æ74æÖSÒ'’ÓB‚ÓBfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓb"7G–ÆS×·²&÷&FW%F÷¢#‚6öÆ–B&v&ƒ#Ãc"Ã3’ÃãR’"×Óà¢Æ'WGFöâöä6Æ–6³×²‚’Óâ6WE6†÷u'VÆW2‡G'VR—Ò6Æ74æÖSÒ&–æÆ–æRÖfÆW‚—FV×2Ö6VçFW"vÓ"FW‡B×6ÒföçB×6VÖ–&öÆBG&ç6—F–öâÖ6öÆ÷'2"7G–ÆS×·²6öÆ÷#¢"63–##r"×ÒFF×FW7F–CÒ&'WGFöâ×'VÆW2Ö6÷#à¢Ä&öö´÷Vâ6Æ74æÖSÒ'rÓB‚ÓB"óâ&Vw&2Fò6—FP¢Âö'WGFöãà¢²—4æF—fR‚’bb€¢Æ¢‡&VcÒ"öF÷væÆöG2÷fW&æò×7÷'G2æ² ¢F÷væÆö@¢6Æ74æÖSÒ&–æÆ–æRÖfÆW‚—FV×2Ö6VçFW"vÓ"FW‡B×6ÒföçB×6VÖ–&öÆBG&ç6—F–öâÖ6öÆ÷'2 ¢7G–ÆS×·²6öÆ÷#¢"3FFSƒ"×Ð¢FF×FW7F–CÒ&'WGFöâÖF÷væÆöBÖ²Ö6÷ ¢à¢Å6Ö'G†öæR6Æ74æÖSÒ'rÓB‚ÓB"óâ&—†" ¢Âöà¢—Ð¢ÂöF—cà ¢²ò¢ÖöFÇ2¢÷Ð¢ÄvÖTFWF–ÄÖöFÂvÖS×·6VÆV7FVDvÖWÒ÷Vã×²6VÆV7FVDvÖWÒöä6Æ÷6S×²‚’Óâ6WE6VÆV7FVDvÖR†çVÆÂ—Ò6VÆV7F–öç3×·6VÆV7F–öç7ÒöåFövvÆU6VÆV7F–öã×¶†æFÆUFövvÆU6VÆV7F–öçÒöäÖ–w&FTvÖT–C×¶†æFÆTÖ–w&FTvÖT–GÒóà¢·6†÷t&WE6Æ—bbW6W"bbÄ&WE6Æ—6VÆV7F–öç3×·6VÆV7F–öç7Òöå&VÖ÷fU6VÆV7F–öã×¶†æFÆU&VÖ÷fU6VÆV7F–öçÒöä6ÆV$ÆÃ×¶†æFÆT6ÆV$ÆÇÒöä6Æ÷6S×²‚’Óâ²–b‡6VÆV7F–öç2æÆVæwF‚â’²6WD—4&WE6Æ—Ö–æ–Ö—¦VB‡G'VR“²ÒVÇ6R²6WE6†÷t&WE6Æ—†fÇ6R“²Ò×ÒöåÆ6T&WC×²‡7F¶RÂW6T&öçW2’ÓâÆ6T&WD×WFF–öâæ×WFFR‡²6VÆV7F–öç2Â7F¶RÂW6T&öçW2Ò—ÒÆ6VD&WC×·Æ6VD&WGÒ—5Æ6–æs×·Æ6T&WD×WFF–öâæ—5VæF–æwÒ—4Ö–æ–Ö—¦VC×¶—4&WE6Æ—Ö–æ–Ö—¦VGÒöåFövvÆTÖ–æ–Ö—¦S×·6WD—4&WE6Æ—Ö–æ–Ö—¦VGÒvÖTÆ–Ö—E&VÖ–æ–æs×¶vÖTÆ–Ö—E&VÖ–æ–æwÒóçÐ¢·6†÷t†—7F÷'’bbW6W"bbÄ&WD†—7F÷'’&WG3×¶&WD†—7F÷'—Ò—4ÆöF–æs×¶†—7F÷'”ÆöF–æwÒöä6Æ÷6S×²‚’Óâ6WE6†÷t†—7F÷'’†fÇ6R—ÒóçÐ ¢Å'VÆW4ÖöFÂ÷Vã×·6†÷u'VÆW7Òöä6Æ÷6S×²‚’Óâ6WE6†÷u'VÆW2†fÇ6R—Òóà¢ÄWF„ÖöFÇ2ÖöFS×¶WF„ÖöFWÒöä6Æ÷6S×²‚’Óâ6WDWF„ÖöFR†çVÆÂ—Òöå7v—F6ƒ×¶ÒÓâ6WDWF„ÖöFR†Ò—Òóà¢Å&öf–ÆTÖöFÂ÷Vã×·6†÷u&öf–ÆWÒöä6Æ÷6S×²‚’Óâ²6WE6†÷u&öf–ÆR†fÇ6R“²&Vg&W6…W6W"‚“²×Òóà ¢²ò¢&'&FRæfVv:|:6ò–æfW&–÷"(	BW†6ÇW6—fFòæG&ö–Bö”õ2¢÷Ð¢ÄæF—fT&÷GFöÔæb6VÆV7F–öç46÷VçC×·6VÆV7F–öç2æÆVæwF‡Òóà¢ÂöF—cà¢“°§Ð 