import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sport, Game, Selection, BetSlip as BetSlipType } from "@shared/schema";
import { GamesList } from "@/components/GamesList";
import { BetSlip } from "@/components/BetSlip";
import { BetHistory } from "@/components/BetHistory";
import { MobileNav } from "@/components/MobileNav";
import { GameDetailModal } from "@/components/GameDetailModal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { History, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { translateLeagueName } from "@/lib/leagueTranslations";
import fwSportsLogo from "@assets/WhatsApp_Image_2026-02-27_at_14.24.46-removebg-preview_1772216817565.png";
import { PromoBanners } from "@/components/PromoBanners";
import frameImage from "@assets/WhatsApp_Image_2026-02-27_at_13.39.09_1772213985065.jpeg";

export default function Home() {
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [isBetSlipMinimized, setIsBetSlipMinimized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [placedBet, setPlacedBet] = useState<BetSlipType | null>(null);
  const { toast } = useToast();

  const { data: sports = [], isLoading: sportsLoading } = useQuery<Sport[]>({ queryKey: ["/api/sports"] });
  const { data: todayGames = [], isLoading: todayGamesLoading, error: todayGamesError } = useQuery<Game[]>({ queryKey: ["/api/games/today"], enabled: !selectedSport, refetchInterval: 5 * 60 * 1000 });
  const { data: brasileiraoGames = [], isLoading: brasileiraoLoading } = useQuery<Game[]>({ queryKey: ["/api/games/brasileirao"], enabled: !selectedSport, refetchInterval: 5 * 60 * 1000 });
  const hasBrasileiraoToday = todayGames.some(g => g.sportKey === "soccer_brazil_campeonato");
  const upcomingBrasileirao = brasileiraoGames.filter(g => !todayGames.some(tg => tg.id === g.id)).slice(0, 6);
  const { data: leagueGames = [], isLoading: leagueGamesLoading, error: leagueGamesError } = useQuery<Game[]>({ queryKey: [`/api/odds/${selectedSport}`], enabled: !!selectedSport, refetchInterval: 5 * 60 * 1000 });

  const games = selectedSport ? leagueGames : todayGames;
  const gamesLoading = selectedSport ? leagueGamesLoading : todayGamesLoading;
  const gamesError = selectedSport ? leagueGamesError : todayGamesError;

  const { data: betHistory = [], isLoading: historyLoading } = useQuery<BetSlipType[]>({ queryKey: ["/api/bets"] });

  const placeBetMutation = useMutation({
    mutationFn: async (data: { selections: Selection[]; stake: number }) => {
      const response = await apiRequest("POST", "/api/bets", data);
      return response.json();
    },
    onSuccess: (data: BetSlipType) => {
      setPlacedBet(data);
      setSelections([]);
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/limits"] });
      toast({ title: "Bilhete gerado com sucesso!", description: `Código: #${data.id.slice(0, 8).toUpperCase()}` });
    },
    onError: (error: Error) => {
      let description = error.message;
      try {
        const parsed = JSON.parse(error.message.replace(/^\d+:\s*/, ''));
        if (parsed.error) description = parsed.error;
      } catch {}
      toast({ title: "Erro ao gerar bilhete", description, variant: "destructive" });
    },
  });

  const handleSelectSport = (sportKey: string) => setSelectedSport(sportKey);
  const handleToggleSelection = (selection: Selection) => {
    if (placedBet) setPlacedBet(null);
    setSelections((prev) => {
      const exists = prev.find((s) => s.id === selection.id);
      if (exists) return prev.filter((s) => s.id !== selection.id);
      const selectionsFromSameGame = prev.filter((s) => s.gameId === selection.gameId);
      if (selectionsFromSameGame.length >= 3) {
        toast({ title: "Máximo de 3 mercados por jogo", variant: "destructive" });
        return prev;
      }
      return [...prev, selection];
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
  const handlePlaceBet = (stake: number) => placeBetMutation.mutate({ selections, stake });

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ===== MOBILE LAYOUT ===== */}
      <div className="md:hidden flex flex-col min-h-screen" style={{ backgroundColor: "#333333" }}>
        <header className="sticky top-0 z-50 px-3 py-2 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #f5c518 0%, #e8b206 40%, #d4960a 100%)" }}>
          <div className="flex flex-col items-start gap-1">
            <img src={fwSportsLogo} alt="FW Sports" className="h-20 w-auto cursor-pointer" onClick={() => setSelectedSport(null)} />
            <div className="flex items-center gap-1">
              <MobileNav sports={sports} selectedSport={selectedSport} onSelectSport={handleSelectSport} isLoading={sportsLoading} />
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors" data-testid="button-top-leagues">
                    <span className="text-sm">🏆</span>
                    <span className="text-white font-bold text-xs whitespace-nowrap">Principais Ligas</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" className="w-52 p-2 bg-[#2a2a2a] border-[#444] z-[9999]">
                  <p className="text-yellow-400 font-bold text-xs mb-2 px-1">🏆 Principais Ligas</p>
                  {[
                    { key: "soccer_brazil_campeonato", label: "Brasileirão Série A" },
                    { key: "soccer_england_league1", label: "Premier League" },
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
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowHistory(true); setShowBetSlip(false); }} className="relative flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/95 text-gray-800 font-bold text-xs shadow-md" data-testid="button-open-history-mobile">
              <History className="w-3.5 h-3.5" /><span>Apostas</span>
              {betHistory.length > 0 && <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center px-1 text-[10px] bg-red-500 text-white border-0">{betHistory.length}</Badge>}
            </button>
            <button onClick={() => { setShowBetSlip(true); setShowHistory(false); setIsBetSlipMinimized(false); }} className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white font-bold text-xs shadow-md" data-testid="button-open-betslip-mobile">
              <Receipt className="w-3.5 h-3.5" /><span>Bilhete</span>
              {selections.length > 0 && <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center px-1 text-[10px] bg-red-500 text-white border-0">{selections.length}</Badge>}
            </button>
          </div>
        </header>
        <div className="flex-1">
          <GamesList games={games} selections={selections} onGameClick={(game) => setSelectedGame(game)} isLoading={gamesLoading} error={gamesError as Error | null} selectedSport={selectedSport} isTodayGames={!selectedSport} upcomingBrasileirao={!selectedSport && !hasBrasileiraoToday ? upcomingBrasileirao : []} brasileiraoLoading={brasileiraoLoading} isDark={true} />
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
            <div className="flex items-center justify-end pb-0 flex-shrink-0" style={{ paddingRight: "8vw", paddingTop: "8vh" }}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setShowHistory(true); setShowBetSlip(false); }}
                  className="relative flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-gray-700 font-bold text-sm border border-gray-300 shadow-sm hover:bg-gray-50 transition-colors"
                  data-testid="button-open-history"
                >
                  <History className="w-4 h-4" /><span>Apostas</span>
                  {betHistory.length > 0 && <Badge className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1.5 text-xs bg-red-500 text-white border-0">{betHistory.length}</Badge>}
                </button>
                <button
                  onClick={() => { setShowBetSlip(true); setShowHistory(false); setIsBetSlipMinimized(false); }}
                  className="relative flex items-center gap-2 px-5 py-2 rounded-lg bg-green-600 text-white font-bold text-sm shadow-sm hover:bg-green-700 transition-colors"
                  data-testid="button-open-betslip"
                >
                  <Receipt className="w-4 h-4" /><span>Bilhete</span>
                  {selections.length > 0 && <Badge className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1.5 text-xs bg-red-500 text-white border-0">{selections.length}</Badge>}
                </button>
              </div>
            </div>

            {/* Spacer to push content down to align with sidebar leagues */}
            <div className="flex-shrink-0" style={{ height: "22vh" }} />

            {/* Promo banners */}
            <div className="pb-4 flex-shrink-0" style={{ paddingLeft: "3vw", paddingRight: "1vw" }}>
              <PromoBanners />
            </div>

            {/* Games content */}
            <div className="pb-8" style={{ paddingLeft: "18vw", paddingRight: "1vw" }}>
              <GamesList games={games} selections={selections} onGameClick={(game) => setSelectedGame(game)} isLoading={gamesLoading} error={gamesError as Error | null} selectedSport={selectedSport} isTodayGames={!selectedSport} upcomingBrasileirao={!selectedSport && !hasBrasileiraoToday ? upcomingBrasileirao : []} brasileiraoLoading={brasileiraoLoading} />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <GameDetailModal game={selectedGame} open={!!selectedGame} onClose={() => setSelectedGame(null)} selections={selections} onToggleSelection={handleToggleSelection} />
      {showBetSlip && <BetSlip selections={selections} onRemoveSelection={handleRemoveSelection} onClearAll={handleClearAll} onClose={() => setShowBetSlip(false)} onPlaceBet={handlePlaceBet} placedBet={placedBet} isPlacing={placeBetMutation.isPending} isMinimized={isBetSlipMinimized} onToggleMinimize={setIsBetSlipMinimized} />}
      {showHistory && <BetHistory bets={betHistory} isLoading={historyLoading} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
