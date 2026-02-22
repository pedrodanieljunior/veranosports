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
import { translateLeagueName } from "@/lib/leagueTranslations";
import frameBg from "@assets/imagem3_completa_1771769504535.png";

export default function Home() {
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [placedBet, setPlacedBet] = useState<BetSlipType | null>(null);
  const { toast } = useToast();

  const { data: sports = [], isLoading: sportsLoading } = useQuery<Sport[]>({
    queryKey: ["/api/sports"],
  });

  const { 
    data: todayGames = [], 
    isLoading: todayGamesLoading,
    error: todayGamesError,
    refetch: refetchTodayGames
  } = useQuery<Game[]>({
    queryKey: ["/api/games/today"],
    enabled: !selectedSport,
  });

  const { 
    data: brasileiraoGames = [], 
    isLoading: brasileiraoLoading,
  } = useQuery<Game[]>({
    queryKey: ["/api/games/brasileirao"],
    enabled: !selectedSport,
  });

  const hasBrasileiraoToday = todayGames.some(g => g.sportKey === "soccer_brazil_campeonato");
  
  const upcomingBrasileirao = brasileiraoGames.filter(g => 
    !todayGames.some(tg => tg.id === g.id)
  ).slice(0, 6);

  const { 
    data: leagueGames = [], 
    isLoading: leagueGamesLoading,
    error: leagueGamesError,
    refetch: refetchLeagueGames
  } = useQuery<Game[]>({
    queryKey: [`/api/odds/${selectedSport}`],
    enabled: !!selectedSport,
  });

  const games = selectedSport ? leagueGames : todayGames;
  const gamesLoading = selectedSport ? leagueGamesLoading : todayGamesLoading;
  const gamesError = selectedSport ? leagueGamesError : todayGamesError;
  const refetchGames = selectedSport ? refetchLeagueGames : refetchTodayGames;

  const { data: betHistory = [], isLoading: historyLoading } = useQuery<BetSlipType[]>({
    queryKey: ["/api/bets"],
  });

  const placeBetMutation = useMutation({
    mutationFn: async (data: { selections: Selection[]; stake: number }) => {
      const response = await apiRequest("POST", "/api/bets", data);
      return response.json();
    },
    onSuccess: (data: BetSlipType) => {
      setPlacedBet(data);
      setSelections([]);
      queryClient.invalidateQueries({ queryKey: ["/api/bets"] });
      toast({
        title: "Bilhete gerado com sucesso!",
        description: `Código: #${data.id.slice(0, 8).toUpperCase()}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao gerar bilhete",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSelectSport = (sportKey: string) => {
    setSelectedSport(sportKey);
  };

  const handleToggleSelection = (selection: Selection) => {
    if (placedBet) setPlacedBet(null);
    setSelections((prev) => {
      const exists = prev.find((s) => s.id === selection.id);
      if (exists) return prev.filter((s) => s.id !== selection.id);
      return [...prev, selection];
    });
    if (!showBetSlip && selections.length === 0) setShowBetSlip(true);
  };

  const handleRemoveSelection = (selectionId: string) => {
    setSelections((prev) => prev.filter((s) => s.id !== selectionId));
  };

  const handleClearAll = () => {
    setSelections([]);
    setPlacedBet(null);
  };

  const handlePlaceBet = (stake: number) => {
    placeBetMutation.mutate({ selections, stake });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ===== MOBILE LAYOUT (< md) ===== */}
      <div className="md:hidden flex flex-col min-h-screen">
        <header
          className="sticky top-0 z-50 px-3 py-2 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, #f5c518 0%, #e8b206 40%, #d4960a 100%)" }}
        >
          <div className="flex items-center gap-2">
            <MobileNav
              sports={sports}
              selectedSport={selectedSport}
              onSelectSport={handleSelectSport}
              isLoading={sportsLoading}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowHistory(true); setShowBetSlip(false); }}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/95 text-gray-800 font-bold text-xs shadow-md"
              data-testid="button-open-history-mobile"
            >
              <History className="w-3.5 h-3.5" />
              <span>Meus Bilhetes</span>
              {betHistory.length > 0 && (
                <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center px-1 text-[10px] bg-red-500 text-white border-0">{betHistory.length}</Badge>
              )}
            </button>
            <button
              onClick={() => { setShowBetSlip(true); setShowHistory(false); }}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white font-bold text-xs shadow-md"
              data-testid="button-open-betslip-mobile"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Bilhete</span>
              {selections.length > 0 && (
                <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center px-1 text-[10px] bg-red-500 text-white border-0">{selections.length}</Badge>
              )}
            </button>
          </div>
        </header>
        <div className="flex-1">
          <GamesList
            games={games} selections={selections}
            onGameClick={(game) => setSelectedGame(game)}
            isLoading={gamesLoading} error={gamesError as Error | null}
            selectedSport={selectedSport} onRefresh={() => refetchGames()}
            isTodayGames={!selectedSport}
            upcomingBrasileirao={!selectedSport && !hasBrasileiraoToday ? upcomingBrasileirao : []}
            brasileiraoLoading={brasileiraoLoading}
          />
        </div>
      </div>

      {/* ===== DESKTOP LAYOUT (>= md) - Frame from reference image ===== */}
      <div className="hidden md:block min-h-screen relative">
        {/* Fixed background frame image - covers top-left area */}
        <div
          className="fixed top-0 left-0 w-[280px] h-screen z-0"
          style={{
            backgroundImage: `url(${frameBg})`,
            backgroundSize: "cover",
            backgroundPosition: "top left",
            backgroundRepeat: "no-repeat",
          }}
        />
        {/* Yellow gradient fallback extending below the image */}
        <div
          className="fixed top-0 left-0 w-[280px] h-screen z-0"
          style={{
            background: "linear-gradient(180deg, #f5c518 0%, #e8b206 30%, #d4960a 70%, #c48a08 100%)",
            zIndex: -1,
          }}
        />

        {/* Page content overlaid on top of the frame */}
        <div className="relative z-10 flex h-screen">
          {/* LEFT SIDEBAR - overlaid on the yellow frame */}
          <div className="w-[240px] flex-shrink-0 flex flex-col h-full">
            {/* Logo space - transparent so the background image shows through */}
            <div className="h-[140px] flex-shrink-0" />

            {/* Leagues panel - white panel overlaid on yellow area */}
            <div className="flex-1 bg-white/95 ml-2 rounded-tr-2xl flex flex-col min-h-0 shadow-sm">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                <span className="text-base">⚽</span>
                <h2 className="font-bold text-gray-700 text-sm">Ligas de Futebol</h2>
              </div>
              <ScrollArea className="flex-1">
                <div className="py-1">
                  {sportsLoading ? (
                    Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="px-4 py-2.5">
                        <Skeleton className="h-4 w-full" />
                      </div>
                    ))
                  ) : (
                    sports.map((sport) => (
                      <button
                        key={sport.key}
                        onClick={() => handleSelectSport(sport.key)}
                        className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                          selectedSport === sport.key
                            ? "bg-yellow-50 text-yellow-800 font-semibold border-l-[3px] border-l-yellow-500"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-800 border-l-[3px] border-l-transparent"
                        }`}
                        data-testid={`button-sport-${sport.key}`}
                      >
                        {translateLeagueName(sport.key, sport.title)}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* RIGHT CONTENT AREA */}
          <div className="flex-1 flex flex-col h-full min-w-0">
            {/* Top bar with buttons - aligned with reference */}
            <div className="h-[140px] flex-shrink-0 flex items-start justify-end px-6 pt-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setShowHistory(true); setShowBetSlip(false); }}
                  className="relative flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-gray-700 font-bold text-sm border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
                  data-testid="button-open-history"
                >
                  <History className="w-4 h-4" />
                  <span>Meus Bilhetes</span>
                  {betHistory.length > 0 && (
                    <Badge className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1.5 text-xs bg-red-500 text-white border-0">{betHistory.length}</Badge>
                  )}
                </button>
                <button
                  onClick={() => { setShowBetSlip(true); setShowHistory(false); }}
                  className="relative flex items-center gap-2 px-5 py-2 rounded-lg bg-green-600 text-white font-bold text-sm shadow-sm hover:bg-green-700 transition-colors"
                  data-testid="button-open-betslip"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Bilhete</span>
                  {selections.length > 0 && (
                    <Badge className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1.5 text-xs bg-red-500 text-white border-0">{selections.length}</Badge>
                  )}
                </button>
              </div>
            </div>

            {/* Games content - scrollable */}
            <div className="flex-1 overflow-auto">
              <GamesList
                games={games} selections={selections}
                onGameClick={(game) => setSelectedGame(game)}
                isLoading={gamesLoading} error={gamesError as Error | null}
                selectedSport={selectedSport} onRefresh={() => refetchGames()}
                isTodayGames={!selectedSport}
                upcomingBrasileirao={!selectedSport && !hasBrasileiraoToday ? upcomingBrasileirao : []}
                brasileiraoLoading={brasileiraoLoading}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modals/Overlays */}
      <GameDetailModal
        game={selectedGame} open={!!selectedGame}
        onClose={() => setSelectedGame(null)}
        selections={selections} onToggleSelection={handleToggleSelection}
      />
      {showBetSlip && (
        <BetSlip
          selections={selections} onRemoveSelection={handleRemoveSelection}
          onClearAll={handleClearAll} onClose={() => setShowBetSlip(false)}
          onPlaceBet={handlePlaceBet} placedBet={placedBet}
          isPlacing={placeBetMutation.isPending}
        />
      )}
      {showHistory && (
        <BetHistory bets={betHistory} isLoading={historyLoading} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
