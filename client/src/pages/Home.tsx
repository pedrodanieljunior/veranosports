import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sport, Game, Selection, BetSlip as BetSlipType } from "@shared/schema";
import { Header } from "@/components/Header";
import { SportsSidebar } from "@/components/SportsSidebar";
import { GamesList } from "@/components/GamesList";
import { BetSlip } from "@/components/BetSlip";
import { BetHistory } from "@/components/BetHistory";
import { MobileNav } from "@/components/MobileNav";
import { GameDetailModal } from "@/components/GameDetailModal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { History, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import logoFwSports from "@assets/logo_fw_sports_1771768422008.png";

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
    if (placedBet) {
      setPlacedBet(null);
    }
    
    setSelections((prev) => {
      const exists = prev.find((s) => s.id === selection.id);
      if (exists) {
        return prev.filter((s) => s.id !== selection.id);
      }
      return [...prev, selection];
    });
    
    if (!showBetSlip && selections.length === 0) {
      setShowBetSlip(true);
    }
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="lg:hidden sticky top-0 z-50" style={{ background: "linear-gradient(135deg, #f5c518 0%, #e6a800 50%, #d4960a 100%)" }}>
        <div className="container mx-auto px-3 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MobileNav
              sports={sports}
              selectedSport={selectedSport}
              onSelectSport={handleSelectSport}
              isLoading={sportsLoading}
            />
            <img src={logoFwSports} alt="FW Sports" className="h-12 w-auto object-contain" />
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowHistory(true); setShowBetSlip(false); }}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-gray-800 font-semibold text-xs shadow-sm"
              data-testid="button-open-history-mobile"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Meus Bilhetes</span>
              {betHistory.length > 0 && (
                <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center px-1 text-[10px] bg-red-500 text-white border-0">
                  {betHistory.length}
                </Badge>
              )}
            </button>
            <button
              onClick={() => { setShowBetSlip(true); setShowHistory(false); }}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white font-semibold text-xs shadow-sm"
              data-testid="button-open-betslip-mobile"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Bilhete</span>
              {selections.length > 0 && (
                <Badge className="absolute -top-1.5 -right-1.5 h-4 min-w-4 flex items-center justify-center px-1 text-[10px] bg-red-500 text-white border-0">
                  {selections.length}
                </Badge>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <Header 
          selectionsCount={selections.length}
          betsCount={betHistory.length}
          onOpenBetSlip={() => { setShowBetSlip(true); setShowHistory(false); }}
          onOpenHistory={() => { setShowHistory(true); setShowBetSlip(false); }}
        />
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:block">
          <SportsSidebar
            sports={sports}
            selectedSport={selectedSport}
            onSelectSport={handleSelectSport}
            isLoading={sportsLoading}
          />
        </div>
        
        <GamesList
          games={games}
          selections={selections}
          onGameClick={(game) => setSelectedGame(game)}
          isLoading={gamesLoading}
          error={gamesError as Error | null}
          selectedSport={selectedSport}
          onRefresh={() => refetchGames()}
          isTodayGames={!selectedSport}
          upcomingBrasileirao={!selectedSport && !hasBrasileiraoToday ? upcomingBrasileirao : []}
          brasileiraoLoading={brasileiraoLoading}
        />
      </div>
      
      <GameDetailModal
        game={selectedGame}
        open={!!selectedGame}
        onClose={() => setSelectedGame(null)}
        selections={selections}
        onToggleSelection={handleToggleSelection}
      />
      
      {showBetSlip && (
        <BetSlip
          selections={selections}
          onRemoveSelection={handleRemoveSelection}
          onClearAll={handleClearAll}
          onClose={() => setShowBetSlip(false)}
          onPlaceBet={handlePlaceBet}
          placedBet={placedBet}
          isPlacing={placeBetMutation.isPending}
        />
      )}
      
      {showHistory && (
        <BetHistory
          bets={betHistory}
          isLoading={historyLoading}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
