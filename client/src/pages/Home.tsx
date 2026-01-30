import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sport, Game, Selection, BetSlip as BetSlipType } from "@shared/schema";
import { Header } from "@/components/Header";
import { SportsSidebar } from "@/components/SportsSidebar";
import { GamesList } from "@/components/GamesList";
import { BetSlip } from "@/components/BetSlip";
import { BetHistory } from "@/components/BetHistory";
import { MobileNav } from "@/components/MobileNav";
import { FootballGameCard } from "@/components/FootballGameCard";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface FootballLeague {
  id: number;
  name: string;
  country: string;
  logo: string;
  season: number;
}

interface FootballFixture {
  id: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  league: string;
  odds: {
    name: string;
    values: { value: string; odd: number }[];
  }[];
}

export default function Home() {
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>("odds-api");
  const [selections, setSelections] = useState<Selection[]>([]);
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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

  const { data: betHistory = [], isLoading: historyLoading } = useQuery<BetSlipType[]>({
    queryKey: ["/api/bets"],
  });

  const { data: footballLeagues = [], isLoading: leaguesLoading } = useQuery<FootballLeague[]>({
    queryKey: ["/api/football/leagues"],
    enabled: activeTab === "api-football",
  });

  const { data: footballFixtures = [], isLoading: fixturesLoading } = useQuery<FootballFixture[]>({
    queryKey: ["/api/football/fixtures", selectedLeague],
    enabled: activeTab === "api-football" && !!selectedLeague,
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
              <h1 className="text-lg font-bold tracking-tight">GANHE MAIS AQUI</h1>
              <p className="text-xs text-muted-foreground">Apostas Esportivas</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowHistory(true); setShowBetSlip(false); }}
              className="relative flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-foreground font-medium hover-elevate active-elevate-2"
              data-testid="button-open-history-mobile"
            >
              <span className="text-sm">{betHistory.length}</span>
            </button>
            <button
              onClick={() => { setShowBetSlip(true); setShowHistory(false); }}
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col overflow-hidden">
          <div className="px-4 pt-4 bg-background">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="odds-api" data-testid="tab-odds-api">
                Principais Ligas
              </TabsTrigger>
              <TabsTrigger value="api-football" data-testid="tab-api-football">
                Mercados Extra
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="odds-api" className="flex flex-1 overflow-hidden mt-0">
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
          </TabsContent>
          
          <TabsContent value="api-football" className="flex flex-1 overflow-hidden mt-0">
            <div className="hidden lg:flex flex-col w-64 border-r border-card-border bg-card overflow-y-auto">
              <div className="p-4 border-b border-card-border">
                <h3 className="font-semibold text-sm">Ligas - Mercados Extra</h3>
                <p className="text-xs text-muted-foreground">1º Tempo, Intervalo/Final</p>
              </div>
              {leaguesLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex flex-col gap-1 p-2">
                  {footballLeagues.map((league) => (
                    <button
                      key={league.id}
                      onClick={() => setSelectedLeague(league.id)}
                      className={`flex items-center gap-2 p-2 rounded-md text-left text-sm transition-colors hover-elevate ${
                        selectedLeague === league.id
                          ? "bg-primary/10 text-primary"
                          : "text-foreground"
                      }`}
                      data-testid={`button-league-${league.id}`}
                    >
                      {league.logo && (
                        <img src={league.logo} alt="" className="w-5 h-5 object-contain" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="truncate block">{league.name}</span>
                        <span className="text-xs text-muted-foreground">{league.country}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {!selectedLeague ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">
                    Selecione uma liga para ver os jogos com mercados de 1º Tempo e Intervalo/Final
                  </p>
                  <div className="lg:hidden mt-4 grid grid-cols-2 gap-2">
                    {footballLeagues.slice(0, 8).map((league) => (
                      <button
                        key={league.id}
                        onClick={() => setSelectedLeague(league.id)}
                        className="flex items-center gap-2 p-3 rounded-md bg-muted text-left hover-elevate"
                      >
                        {league.logo && (
                          <img src={league.logo} alt="" className="w-6 h-6 object-contain" />
                        )}
                        <span className="text-sm truncate">{league.name}</span>
                      </button>
                    ))}
                  </div>
                </Card>
              ) : fixturesLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : footballFixtures.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">Nenhum jogo encontrado para esta liga</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {footballFixtures.map((fixture) => (
                    <FootballGameCard
                      key={fixture.id}
                      fixture={fixture}
                      selections={selections}
                      onToggleSelection={handleToggleSelection}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
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
