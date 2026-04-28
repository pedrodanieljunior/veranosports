import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { Sport, Game, Selection, BetSlip as BetSlipType } from "@shared/schema";
import { GamesList } from "@/components/GamesList";
import { BetSlip } from "@/components/BetSlip";
import { BetHistory } from "@/components/BetHistory";
import { MobileNav } from "@/components/MobileNav";
import { GameDetailModal } from "@/components/GameDetailModal";
import { MobileBannerCarousel } from "@/components/MobileBannerCarousel";
import { RulesModal } from "@/components/RulesModal";
import { BoostCard } from "@/components/BoostCard";
import { BoostCard as BoostCardType } from "@shared/schema";
import { AuthModals } from "@/components/AuthModals";
import { ProfileModal } from "@/components/ProfileModal";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { History, Receipt, Search, X, BookOpen, UserCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { translateLeagueName } from "@/lib/leagueTranslations";
import { getSessionId } from "@/lib/session";
import fwSportsLogo from "@assets/WhatsApp_Image_2026-02-27_at_14.24.46-removebg-preview_1772216817565.png";
import { DesktopBannerCarousel } from "@/components/DesktopBannerCarousel";
import frameImage from "@assets/WhatsApp_Image_2026-02-27_at_13.39.09_1772213985065.jpeg";

export default function Home() {
  const { user, refreshUser } = useAuth();
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [isBetSlipMinimized, setIsBetSlipMinimized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [placedBet, setPlacedBet] = useState<BetSlipType | null>(null);
  const [gameLimitRemaining, setGameLimitRemaining] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const { toast } = useToast();

  const pendingGameRef = useRef<Game | null>(null);
  const pendingSelectionRef = useRef<Selection | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newNow = Date.now();
      setNow(newNow);
      setSelections(prev => {
        const filtered = prev.filter(s => new Date(s.commenceTime).getTime() > newNow);
        if (filtered.length < prev.length) {
          toast({ title: "Jogo iniciado", description: "Uma ou mais seleções foram removidas pois o jogo já começou.", variant: "destructive" });
        }
        return filtered;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (pendingGameRef.current) {
      setSelectedGame(pendingGameRef.current);
      pendingGameRef.current = null;
    }
    if (pendingSelectionRef.current) {
      const sel = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      setSelections(prev => {
        const exists = prev.find(s => s.id === sel.id);
        if (exists) return prev;
        return [...prev, sel];
      });
      setShowBetSlip(true);
    }
  }, [user]);

  // A cada 5 minutos, resetar interface para o estado inicial (junto com a atualização dos dados)
  useEffect(() => {
    const resetInterval = setInterval(() => {
      setSelectedSport(null);
      setSelectedGame(null);
      setSearchQuery("");
      setDebouncedSearch("");
      setShowHistory(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 5 * 60 * 1000);
    return () => clearInterval(resetInterval);
  }, []);

  const { data: sports = [], isLoading: sportsLoading } = useQuery<Sport[]>({ queryKey: ["/api/sports"] });
  const { data: todayGames = [], isLoading: todayGamesLoading, error: todayGamesError } = useQuery<Game[]>({ queryKey: ["/api/games/today"], enabled: !selectedSport, staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000, refetchIntervalInBackground: true, refetchOnWindowFocus: false });
  const { data: brasileiraoGames = [], isLoading: brasileiraoLoading } = useQuery<Game[]>({ queryKey: ["/api/games/brasileirao"], enabled: !selectedSport, staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000, refetchIntervalInBackground: true, refetchOnWindowFocus: false });
  const { data: leagueGames = [], isLoading: leagueGamesLoading, error: leagueGamesError } = useQuery<Game[]>({ queryKey: [`/api/odds/${selectedSport}`], enabled: !!selectedSport, staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000, refetchIntervalInBackground: true, refetchOnWindowFocus: false });

  // Merge: Brasileirão sempre primeiro, deduplicando com os jogos de hoje
  const mergedTodayGames: Game[] = useMemo(() => {
    const todayIds = new Set(todayGames.map(g => g.id));
    const extraBr = brasileiraoGames.filter(g => !todayIds.has(g.id));
    const brFromToday = todayGames.filter(g => g.sportKey === "soccer_brazil_campeonato");
    const otherToday = todayGames.filter(g => g.sportKey !== "soccer_brazil_campeonato");
    return [...brFromToday, ...extraBr, ...otherToday];
  }, [todayGames, brasileiraoGames]);

  // Buscar odds de cada liga que aparece nos jogos do dia
  const uniqueSportKeys = useMemo(() =>
    !selectedSport ? [...new Set(mergedTodayGames.map(g => g.sportKey))] : [],
    [mergedTodayGames, selectedSport]
  );
  const leagueOddsResults = useQueries({
    queries: uniqueSportKeys.map(sportKey => ({
      queryKey: [`/api/odds/${sportKey}`],
      enabled: !selectedSport && uniqueSportKeys.length > 0,
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: false,
    })),
  });

  // Mesclar odds buscadas nos jogos do dia (por ID de jogo)
  const todayGamesWithOdds: Game[] = useMemo(() => {
    const oddsById: Record<string, Game["bookmakers"]> = {};
    for (const result of leagueOddsResults) {
      const gamesWithOdds = result.data as Game[] | undefined;
      if (gamesWithOdds) {
        for (const g of gamesWithOdds) {
          if (g.bookmakers?.length) oddsById[g.id] = g.bookmakers;
        }
      }
    }
    return mergedTodayGames.map(g =>
      oddsById[g.id] ? { ...g, bookmakers: oddsById[g.id] } : g
    );
  }, [mergedTodayGames, leagueOddsResults]);

  const games = selectedSport ? leagueGames : todayGamesWithOdds;
  const gamesLoading = selectedSport ? leagueGamesLoading : (todayGamesLoading || brasileiraoLoading);
  const gamesError = selectedSport ? leagueGamesError : todayGamesError;

  const isSearching = debouncedSearch.trim().length >= 2;
  const { data: searchResults = [], isLoading: searchLoading } = useQuery<Game[]>({
    queryKey: ["/api/search/games", debouncedSearch.trim()],
    queryFn: () => fetch(`/api/search/games?team=${encodeURIComponent(debouncedSearch.trim())}`).then(r => r.json()),
    enabled: isSearching,
    staleTime: 5 * 60 * 1000,
  });

  const isTyping = searchQuery.trim().length >= 2 && !isSearching;
  const filteredGames = (isSearching ? searchResults : games).filter(
    g => new Date(g.commenceTime).getTime() > now
  );
  const isLoadingGames = isTyping || (isSearching ? searchLoading : gamesLoading);

  const { data: boostCards = [] } = useQuery<BoostCardType[]>({
    queryKey: ["/api/boost-cards"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const sessionId = getSessionId();

  const { data: betHistory = [], isLoading: historyLoading } = useQuery<BetSlipType[]>({
    queryKey: ["/api/bets", user?.cpf ?? sessionId],
    queryFn: async () => {
      const url = user?.cpf
        ? `/api/bets?userId=${encodeURIComponent(user.cpf)}`
        : `/api/bets?sessionId=${encodeURIComponent(sessionId)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro ao buscar histórico");
      return res.json();
    },
    refetchInterval: user ? 10 * 1000 : false,
  });

  const placeBetMutation = useMutation({
    mutationFn: async (data: { selections: Selection[]; stake: number; useBonus: boolean }) => {
      const response = await apiRequest("POST", "/api/bets", { ...data, sessionId, userId: user?.cpf });
      return response.json();
    },
    onSuccess: (data: BetSlipType) => {
      setPlacedBet(data);
      setSelections([]);
      setGameLimitRemaining(null);
      queryClient.invalidateQueries({ queryKey: ["/api/bets", user?.cpf ?? sessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/limits"] });
      if (user) {
        refreshUser();
      }
    },
    onError: (error: Error) => {
      let description = error.message;
      let remaining: number | null = null;
      try {
        const parsed = JSON.parse(error.message.replace(/^\d+:\s*/, ''));
        if (parsed.error) description = parsed.error;
        if (typeof parsed.remaining === "number") remaining = parsed.remaining;
      } catch {}
      setGameLimitRemaining(remaining);
      toast({ title: "Erro ao gerar bilhete", description, variant: "destructive" });
    },
  });

  const handleSelectSport = (sportKey: string) => setSelectedSport(sportKey);
  const handleGameClick = (game: Game) => {
    if (!user) {
      pendingGameRef.current = game;
      pendingSelectionRef.current = null;
      setAuthMode("login");
      return;
    }
    setSelectedGame(game);
  };
  const handleToggleSelection = (selection: Selection) => {
    if (!user) {
      pendingSelectionRef.current = selection;
      pendingGameRef.current = null;
      setAuthMode("login");
      return;
    }
    if (placedBet) setPlacedBet(null);
    setGameLimitRemaining(null);
    setSelections((prev) => {
      const exists = prev.find((s) => s.id === selection.id);
      if (exists) return prev.filter((s) => s.id !== selection.id);

      const isBoost = selection.marketKey === "boost";
      const hasBoost = prev.some((s) => s.marketKey === "boost");
      const hasOther = prev.some((s) => s.marketKey !== "boost");

      if (isBoost && hasOther) {
        toast({ title: "Super Boost é exclusivo", description: "Remova as outras seleções antes de adicionar o Super Boost.", variant: "destructive" });
        return prev;
      }
      if (!isBoost && hasBoost) {
        toast({ title: "Bilhete com Super Boost", description: "Remova o Super Boost para adicionar outras seleções.", variant: "destructive" });
        return prev;
      }

      // Remove qualquer seleção anterior do mesmo jogo+mercado (comportamento de rádio)
      const withoutSameMarket = prev.filter(
        (s) => !(s.gameId === selection.gameId && s.marketKey === selection.marketKey)
      );

      // Contar mercados distintos para o jogo (após remover o mesmo mercado)
      const distinctMarketsForGame = new Set(
        withoutSameMarket
          .filter((s) => s.gameId === selection.gameId)
          .map((s) => s.marketKey)
      ).size;

      if (distinctMarketsForGame >= 3) {
        toast({ title: "Máximo de 3 mercados por jogo", variant: "destructive" });
        return prev;
      }
      return [...withoutSameMarket, selection];
    });
    const alreadySelected = selections.find((s) => s.id === selection.id);
    if (!alreadySelected) {
      setShowBetSlip(true);
      setShowHistory(false);
      if (selectedGame) setIsBetSlipMinimized(true);
    }
  };
  const handleRemoveSelection = (selectionId: string) => setSelections((prev) => prev.filter((s) => s.id !== selectionId));
  const handleClearAll = () => { setSelections([]); setPlacedBet(null); };
  const handleMigrateGameId = (oldId: string, newId: string) => {
    setSelections((prev) => {
      const hasOld = prev.some((s) => s.gameId === oldId);
      if (!hasOld) return prev;
      return prev.map((s) =>
        s.gameId === oldId
          ? { ...s, gameId: newId, id: s.id.replace(oldId, newId) }
          : s
      );
    });
  };
  const handlePlaceBet = (stake: number, useBonus: boolean) => placeBetMutation.mutate({ selections, stake, useBonus });

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ===== MOBILE LAYOUT ===== */}
      <div className="md:hidden flex flex-col min-h-screen" style={{ backgroundColor: "#333333" }}>
        <header className="sticky top-0 z-50 px-3 py-2 flex flex-col gap-1.5" style={{ background: "linear-gradient(135deg, #f5c518 0%, #e8b206 40%, #d4960a 100%)" }}>
          {/* Row 1: Logo + Auth buttons */}
          <div className="flex items-center justify-between">
            <img src={fwSportsLogo} alt="FW Sports" className="h-16 w-auto cursor-pointer" onClick={() => setSelectedSport(null)} />
            <div className="flex flex-row flex-nowrap items-center gap-2">
              {!user ? (
                <>
                  <button onClick={() => setAuthMode("register")} className="px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-white font-bold text-xs whitespace-nowrap transition-colors" data-testid="button-register-mobile">
                    Registre-se
                  </button>
                  <button onClick={() => setAuthMode("login")} className="px-3 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-white font-bold text-xs whitespace-nowrap transition-colors" data-testid="button-login-mobile">
                    Login
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setShowHistory(true); setShowBetSlip(false); }} className="relative inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 text-white font-bold text-xs shadow-md whitespace-nowrap" data-testid="button-open-history-mobile">
                    <History className="w-3.5 h-3.5" /><span>Apostas</span>
                    {betHistory.filter(b => b.status === "pending").length > 0 && <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center px-1 text-[10px] bg-red-500 text-white border-0">{betHistory.filter(b => b.status === "pending").length}</Badge>}
                  </button>
                  <button onClick={() => setShowProfile(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 text-white font-bold text-xs whitespace-nowrap transition-colors" data-testid="button-open-profile-mobile">
                    <span className="text-white text-[10px]">
                      R${(user.balance + (user.bonusBalance ?? 0)).toFixed(2).replace(".", ",")}
                    </span>
                    <UserCircle className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
          {/* Row 2: League buttons + Search */}
          <div className="flex flex-col gap-1">
            <div className="flex flex-row flex-nowrap items-center gap-1">
              <MobileNav sports={sports} selectedSport={selectedSport} onSelectSport={handleSelectSport} isLoading={sportsLoading} />
              <Popover>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors" data-testid="button-top-leagues">
                    <span className="text-sm">🏆</span>
                    <span className="text-white font-bold text-[10px] whitespace-nowrap">Principais Ligas</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" className="w-52 p-2 bg-[#2a2a2a] border-[#444] z-[9999]">
                  <p className="text-yellow-400 font-bold text-xs mb-2 px-1">🏆 Principais Ligas</p>
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
                      <button key={key} onClick={() => handleSelectSport(key)}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium transition-colors ${selectedSport === key ? "bg-yellow-500 text-black" : "text-white hover:bg-white/10"}`}>
                        {label}
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-1.5 bg-black/30 border border-white/40 rounded-lg px-2.5 py-1.5">
              <Search className="w-3.5 h-3.5 text-white shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar time..."
                className="flex-1 bg-transparent text-white text-xs font-medium placeholder-white/70 outline-none min-w-0"
                data-testid="input-search-teams"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-white/80 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </header>
        <div className="px-3 pt-2">
          <MobileBannerCarousel />
        </div>
        {boostCards.length > 0 && !isSearching && !isTyping && !selectedSport && (
          <div className="pt-2">
            {boostCards.map(card => (
              <BoostCard key={card.id} card={card} selections={selections} onToggleSelection={handleToggleSelection} />
            ))}
          </div>
        )}
        <div className="flex-1">
          <GamesList games={filteredGames} selections={selections} onGameClick={handleGameClick} isLoading={isLoadingGames} error={(isSearching || isTyping) ? null : gamesError as Error | null} selectedSport={(isSearching || isTyping) ? null : selectedSport} isTodayGames={!selectedSport && !isSearching && !isTyping} isDark={true} />
        </div>
        {/* Mobile footer — Regras */}
        <div className="flex-shrink-0 py-4 px-4 text-center border-t border-white/10">
          <button
            onClick={() => setShowRules(true)}
            className="inline-flex items-center gap-2 text-yellow-400 hover:text-yellow-300 text-sm font-semibold transition-colors"
            data-testid="button-rules-mobile"
          >
            <BookOpen className="w-4 h-4" />
            Regras do Site
          </button>
        </div>
      </div>

      {/* ===== DESKTOP LAYOUT - Frame image as fixed background ===== */}
      <div className="hidden md:block h-screen overflow-y-scroll overflow-x-hidden relative desktop-scroll">
        {/* FRAME IMAGE - fixed background covering entire page */}
        <div
          className="fixed inset-0 z-0 pointer-events-none select-none"
          style={{
            backgroundImage: `url(${frameImage})`,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
          }}
          data-testid="img-frame"
        />

        {/* ALL CONTENT positioned on top of the frame */}
        <div className="relative z-10 flex min-h-full">
          {/* LEFT SIDEBAR AREA - positioned over the yellow bar in the frame */}
          <div className="flex-shrink-0 flex flex-col" style={{ width: "14vw", paddingTop: "45vh", paddingLeft: "2.5vw" }}>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2 whitespace-nowrap">
                <span className="text-sm">⚽</span>
                <h2 className="font-bold text-gray-800 text-[15px] whitespace-nowrap">Ligas de Futebol</h2>
              </div>
              <div className="flex flex-col">
                {sportsLoading ? (
                  Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="px-3 py-2"><Skeleton className="h-4 w-full" /></div>
                  ))
                ) : (
                  sports.map((sport) => (
                    <button
                      key={sport.key}
                      onClick={() => handleSelectSport(sport.key)}
                      className={`w-full text-left px-3 py-2.5 text-[13px] transition-colors ${
                        selectedSport === sport.key
                          ? "bg-white/50 text-gray-900 font-semibold"
                          : "text-gray-700 hover:bg-white/30 hover:text-gray-900"
                      }`}
                      data-testid={`button-sport-${sport.key}`}
                    >
                      {translateLeagueName(sport.key, sport.title)}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* RIGHT CONTENT AREA - positioned over the white area in the frame */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Buttons area - positioned at top right of the white area */}
            <div className="flex items-center justify-end pb-0 flex-shrink-0" style={{ paddingRight: "8vw", paddingTop: "12vh" }}>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 w-56 border border-black/10 shadow-sm" style={{ background: "linear-gradient(135deg, #f5c518 0%, #e8b206 40%, #d4960a 100%)" }}>
                  <Search className="w-4 h-4 text-gray-900/70 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar time..."
                    className="flex-1 bg-transparent text-gray-900 text-sm font-medium placeholder-gray-900/50 outline-none min-w-0"
                    data-testid="input-search-teams-desktop"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="text-gray-900/60 hover:text-gray-900">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {!user ? (
                  <>
                    <button onClick={() => setAuthMode("register")} className="px-4 py-2 rounded-lg bg-black/20 hover:bg-black/30 text-white font-bold text-sm transition-colors" data-testid="button-register-desktop">
                      Registre-se
                    </button>
                    <button onClick={() => setAuthMode("login")} className="px-5 py-2 rounded-lg bg-black/20 hover:bg-black/30 text-white font-bold text-sm transition-colors" data-testid="button-login-desktop">
                      Login
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setShowHistory(true); setShowBetSlip(false); }}
                      className="relative flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white font-bold text-sm shadow-sm hover:bg-green-700 transition-colors"
                      data-testid="button-open-history"
                    >
                      <History className="w-4 h-4" /><span>Apostas</span>
                      {betHistory.filter(b => b.status === "pending").length > 0 && <Badge className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1.5 text-xs bg-red-500 text-white border-0">{betHistory.filter(b => b.status === "pending").length}</Badge>}
                    </button>
                    <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black/20 hover:bg-black/30 text-white font-bold text-sm transition-colors" data-testid="button-open-profile-desktop">
                      <span className="text-white text-xs">
                        R${(user.balance + (user.bonusBalance ?? 0)).toFixed(2).replace(".", ",")}
                      </span>
                      <UserCircle className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Spacer to push content down to align with sidebar leagues */}
            <div className="flex-shrink-0" style={{ height: "7vh" }} />

            {/* Promo banners */}
            <div className="pb-4 flex-shrink-0" style={{ paddingRight: "8vw" }}>
              <DesktopBannerCarousel />
            </div>

            {/* Boost cards */}
            {boostCards.length > 0 && !isSearching && !isTyping && !selectedSport && (
              <div className="pb-2" style={{ paddingLeft: "18vw", paddingRight: "1vw" }}>
                {boostCards.map(card => (
                  <BoostCard key={card.id} card={card} selections={selections} onToggleSelection={handleToggleSelection} />
                ))}
              </div>
            )}

            {/* Games content */}
            <div className="pb-4" style={{ paddingLeft: "18vw", paddingRight: "1vw" }}>
              <GamesList games={filteredGames} selections={selections} onGameClick={handleGameClick} isLoading={isLoadingGames} error={(isSearching || isTyping) ? null : gamesError as Error | null} selectedSport={(isSearching || isTyping) ? null : selectedSport} isTodayGames={!selectedSport && !isSearching && !isTyping} isDark={true} />
            </div>

            {/* Desktop footer — Regras */}
            <div className="pb-6 text-center" style={{ paddingLeft: "18vw", paddingRight: "1vw" }}>
              <button
                onClick={() => setShowRules(true)}
                className="inline-flex items-center gap-2 text-yellow-500 hover:text-yellow-400 text-sm font-semibold transition-colors"
                data-testid="button-rules-desktop"
              >
                <BookOpen className="w-4 h-4" />
                Regras do Site
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <GameDetailModal game={selectedGame} open={!!selectedGame} onClose={() => setSelectedGame(null)} selections={selections} onToggleSelection={handleToggleSelection} onMigrateGameId={handleMigrateGameId} />
      {showBetSlip && user && <BetSlip selections={selections} onRemoveSelection={handleRemoveSelection} onClearAll={handleClearAll} onClose={() => setShowBetSlip(false)} onPlaceBet={handlePlaceBet} placedBet={placedBet} isPlacing={placeBetMutation.isPending} isMinimized={isBetSlipMinimized} onToggleMinimize={setIsBetSlipMinimized} gameLimitRemaining={gameLimitRemaining} />}
      {showHistory && user && <BetHistory bets={betHistory} isLoading={historyLoading} onClose={() => setShowHistory(false)} />}
      <RulesModal open={showRules} onClose={() => setShowRules(false)} />
      <AuthModals
        mode={authMode}
        onClose={() => setAuthMode(null)}
        onSwitch={(m) => setAuthMode(m)}
      />
      <ProfileModal
        open={showProfile}
        onClose={() => { setShowProfile(false); refreshUser(); }}
      />
    </div>
  );
}
