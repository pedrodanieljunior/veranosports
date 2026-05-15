import { useState, useEffect, useMemo, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { History, Search, X, BookOpen, UserCircle, Trophy } from "lucide-react";
import fwSportsLogo from "@assets/WhatsApp_Image_2026-02-27_at_14.24.46-removebg-preview_1772216817565.png";

const COPA_START = new Date("2026-06-11T15:00:00Z");
const WC_QUALIFIER_KEYS = [
  "soccer_wc_qualifiers_conmebol",
  "soccer_wc_qualifiers_europe",
  "soccer_wc_qualifiers_concacaf",
  "soccer_wc_qualifiers_caf",
  "soccer_wc_qualifiers_afc",
  "soccer_wc_intercontinental",
];

type CopaTab = "todos" | "copa" | "qualificatorias";

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
      setShowBetSlip(true);
    }
  }, [user]);

  const { data: todayGames = [], isLoading: todayLoading } = useQuery<Game[]>({
    queryKey: ["/api/games/today"], staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000,
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

  const sessionId = getSessionId();
  const { data: betHistory = [], isLoading: historyLoading } = useQuery<BetSlipType[]>({
    queryKey: ["/api/bets", user?.cpf ?? sessionId],
    queryFn: async () => {
      const url = user?.cpf ? `/api/bets?userId=${encodeURIComponent(user.cpf)}` : `/api/bets?sessionId=${encodeURIComponent(sessionId)}`;
      return fetch(url).then(r => r.json());
    },
    refetchInterval: user ? 10_000 : false,
  });

  const isSearching = debouncedSearch.trim().length >= 2;
  const isTyping = searchQuery.trim().length >= 2 && !isSearching;
  const { data: searchResults = [], isLoading: searchLoading } = useQuery<Game[]>({
    queryKey: ["/api/search/games", debouncedSearch.trim()],
    queryFn: () => fetch(`/api/search/games?team=${encodeURIComponent(debouncedSearch.trim())}`).then(r => r.json()),
    enabled: isSearching, staleTime: 5 * 60 * 1000,
  });

  const filteredGames = useMemo(() => {
    const base = isSearching ? searchResults : todayGamesWithOdds;
    const future = base.filter(g => new Date(g.commenceTime).getTime() > now);
    if (isSearching || isTyping) return future;
    if (activeTab === "copa") return future.filter(g => g.sportKey === "soccer_fifa_world_cup");
    if (activeTab === "qualificatorias") return future.filter(g => WC_QUALIFIER_KEYS.includes(g.sportKey));
    return future;
  }, [todayGamesWithOdds, searchResults, isSearching, isTyping, activeTab, now]);

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
    if (!selections.find(s => s.id === selection.id)) { setShowBetSlip(true); setShowHistory(false); if (selectedGame) setIsBetSlipMinimized(true); }
  };

  const handleRemoveSelection = (id: string) => setSelections(prev => prev.filter(s => s.id !== id));
  const handleClearAll = () => { setSelections([]); setPlacedBet(null); };
  const handleMigrateGameId = (oldId: string, newId: string) => {
    setSelections(prev => prev.map(s => s.gameId === oldId ? { ...s, gameId: newId, id: s.id.replace(oldId, newId) } : s));
  };

  const tabs: { key: CopaTab; label: string; icon: string }[] = [
    { key: "todos", label: "TODOS", icon: "📅" },
    { key: "copa", label: "COPA", icon: "🏆" },
    { key: "qualificatorias", label: "QUALIFICATÓRIAS", icon: "🌍" },
  ];

  const pendingBets = betHistory.filter(b => b.status === "pending").length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0b1f10" }}>
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-50 px-3 py-2 flex flex-col gap-2" style={{ background: "linear-gradient(135deg, #0d2a14 0%, #143d1e 60%, #0f2f18 100%)", borderBottom: "2px solid #c9a227" }}>
        {/* Row 1: Logo + Copa badge + Auth */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <img src={fwSportsLogo} alt="FW Sports" className="h-12 w-auto" />
            <div className="flex flex-col leading-tight">
              <div className="flex items-center gap-1">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-400 font-black text-xs tracking-wide">COPA DO MUNDO</span>
              </div>
              <span className="text-white font-black text-xl leading-none tracking-tight" style={{ textShadow: "0 0 10px rgba(201,162,39,0.6)" }}>2026</span>
              <span className="text-yellow-500/70 text-[9px] font-bold tracking-widest">EUA · CANADÁ · MÉXICO</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {!user ? (
              <>
                <button onClick={() => setAuthMode("register")} className="px-2.5 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap transition-colors" style={{ background: "rgba(201,162,39,0.15)", color: "#f5c518", border: "1px solid rgba(201,162,39,0.3)" }} data-testid="button-register-copa">
                  Cadastrar
                </button>
                <button onClick={() => setAuthMode("login")} className="px-2.5 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap" style={{ background: "#1a6b2e", color: "white" }} data-testid="button-login-copa">
                  Login
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { setShowHistory(true); setShowBetSlip(false); }} className="relative inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold text-xs shadow-md whitespace-nowrap" style={{ background: "#1a6b2e", color: "white" }} data-testid="button-history-copa">
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

        {/* Row 2: Search */}
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(201,162,39,0.25)" }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: "#c9a227" }} />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar time ou seleção..." className="flex-1 bg-transparent text-white text-sm placeholder-white/40 outline-none" data-testid="input-search-copa" />
          {searchQuery && <button onClick={() => setSearchQuery("")}><X className="w-4 h-4 text-white/50" /></button>}
        </div>
      </header>

      {/* ===== COUNTDOWN BANNER ===== */}
      {!countdown.started && (
        <div className="px-3 pt-3">
          <div className="rounded-2xl overflow-hidden relative" style={{ background: "linear-gradient(135deg, #0d3a1a 0%, #1a5e2a 40%, #0f4a1f 100%)", border: "1px solid rgba(201,162,39,0.4)" }}>
            <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "radial-gradient(circle at 80% 50%, #ffd700 0%, transparent 60%)" }} />
            <div className="relative p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="text-4xl">🏆</div>
                <div>
                  <h2 className="text-white font-black text-lg leading-tight">RUMO À COPA DO MUNDO</h2>
                  <p className="font-black text-2xl leading-tight" style={{ color: "#f5c518" }}>2026</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-white/70">
                <div className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Cobertura completa da Copa 2026</div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Odds especiais e mercados exclusivos</div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Apostas para o campeão do mundo</div>
                <div className="flex items-center gap-1.5"><span className="text-green-400">✓</span> Os melhores aumentos dos mercados</div>
              </div>
              <div className="text-center">
                <p className="text-white/60 text-xs mb-2">A maior competição do planeta começa em:</p>
                <div className="flex items-center justify-center gap-2">
                  {[
                    { v: countdown.days, l: "DIAS" },
                    { v: countdown.hours, l: "HORAS" },
                    { v: countdown.minutes, l: "MIN" },
                    { v: countdown.seconds, l: "SEG" },
                  ].map(({ v, l }) => (
                    <div key={l} className="flex flex-col items-center rounded-lg px-3 py-1.5 min-w-[50px]" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(201,162,39,0.4)" }}>
                      <span className="text-xl font-black" style={{ color: "#f5c518" }}>{String(v).padStart(2, "0")}</span>
                      <span className="text-white/50 text-[9px] font-bold tracking-widest">{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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

      {/* ===== TABS ===== */}
      {!isSearching && !isTyping && (
        <div className="px-3 pt-3">
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                data-testid={`tab-copa-${tab.key}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs whitespace-nowrap transition-all shrink-0"
                style={activeTab === tab.key
                  ? { background: "#c9a227", color: "#0b1f10" }
                  : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }
                }
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Info do tab ativo */}
          <div className="mt-2 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📅</span>
                <p className="text-white font-bold text-sm">
                  {activeTab === "todos" ? "Jogos do Dia" : activeTab === "copa" ? "Copa do Mundo 2026" : "Qualificatórias"}
                </p>
              </div>
              <p className="text-white/40 text-xs ml-7">
                {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }).replace(/^\w/, c => c.toUpperCase())} — {filteredGames.length} {filteredGames.length === 1 ? "jogo" : "jogos"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== GAMES LIST ===== */}
      <div className="px-0 pt-2 pb-4">
        {activeTab === "copa" && filteredGames.length === 0 && !todayLoading ? (
          <div className="mx-3 rounded-xl p-6 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,162,39,0.2)" }}>
            <div className="text-4xl mb-3">🏆</div>
            <p className="text-white font-bold text-sm mb-1">Jogos da Copa em breve!</p>
            <p className="text-white/50 text-xs">Os jogos da Copa do Mundo 2026 estarão disponíveis a partir de 11 de junho.</p>
          </div>
        ) : (
          <GamesList
            games={filteredGames}
            selections={selections}
            onGameClick={handleGameClick}
            isLoading={isTyping || (isSearching ? searchLoading : todayLoading)}
            error={null}
            selectedSport={null}
            isTodayGames={!isSearching && !isTyping}
            isDark={true}
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
      {showBetSlip && user && <BetSlip selections={selections} onRemoveSelection={handleRemoveSelection} onClearAll={handleClearAll} onClose={() => setShowBetSlip(false)} onPlaceBet={(stake, useBonus) => placeBetMutation.mutate({ selections, stake, useBonus })} placedBet={placedBet} isPlacing={placeBetMutation.isPending} isMinimized={isBetSlipMinimized} onToggleMinimize={setIsBetSlipMinimized} gameLimitRemaining={gameLimitRemaining} />}
      {showHistory && user && <BetHistory bets={betHistory} isLoading={historyLoading} onClose={() => setShowHistory(false)} />}
      <RulesModal open={showRules} onClose={() => setShowRules(false)} />
      <AuthModals mode={authMode} onClose={() => setAuthMode(null)} onSwitch={m => setAuthMode(m)} />
      <ProfileModal open={showProfile} onClose={() => { setShowProfile(false); refreshUser(); }} />
    </div>
  );
}
