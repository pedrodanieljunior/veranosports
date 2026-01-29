import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sport, Game, Selection, BetSlip as BetSlipType } from "@shared/schema";
import { Header } from "@/components/Header";
import { SportsSidebar } from "@/components/SportsSidebar";
import { GamesList } from "@/components/GamesList";
import { BetSlip } from "@/components/BetSlip";
import { MobileNav } from "@/components/MobileNav";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Home() {
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [placedBet, setPlacedBet] = useState<BetSlipType | null>(null);
  const { toast } = useToast();

  const { data: sports = [], isLoading: sportsLoading } = useQuery<Sport[]>({
    queryKey: ["/api/sports"],
  });

  const { 
    data: games = [], 
    isLoading: gamesLoading,
    error: gamesError,
    refetch: refetchGames
  } = useQuery<Game[]>({
    queryKey: [`/api/odds/${selectedSport}`],
    enabled: !!selectedSport,
  });

  const placeBetMutation = useMutation({
    mutationFn: async (data: { selections: Selection[]; stake: number }) => {
      const response = await apiRequest("POST", "/api/bets", data);
      return response.json();
    },
    onSuccess: (data: BetSlipType) => {
      setPlacedBet(data);
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
    <div className="min-h-screen bg-background flex flex-col">
      <div className="lg:hidden sticky top-0 z-50 bg-card border-b border-card-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MobileNav
              sports={sports}
              selectedSport={selectedSport}
              onSelectSport={handleSelectSport}
              isLoading={sportsLoading}
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight">BetPro</h1>
              <p className="text-xs text-muted-foreground">Apostas Esportivas</p>
            </div>
          </div>
          
          <button
            onClick={() => setShowBetSlip(true)}
            className="relative flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover-elevate active-elevate-2"
            data-testid="button-open-betslip-mobile"
          >
            <span>Bilhete</span>
            {selections.length > 0 && (
              <span className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1.5 text-xs rounded-full bg-accent text-accent-foreground font-bold">
                {selections.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="hidden lg:block">
        <Header 
          selectionsCount={selections.length} 
          onOpenBetSlip={() => setShowBetSlip(true)} 
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
          onToggleSelection={handleToggleSelection}
          isLoading={gamesLoading}
          error={gamesError as Error | null}
          selectedSport={selectedSport}
          onRefresh={() => refetchGames()}
        />
      </div>
      
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
    </div>
  );
}
