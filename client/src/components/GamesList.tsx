import { Game, Selection } from "@shared/schema";
import { GameCard } from "./GameCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GamesListProps {
  games: Game[];
  selections: Selection[];
  onToggleSelection: (selection: Selection) => void;
  isLoading: boolean;
  error: Error | null;
  selectedSport: string | null;
  onRefresh: () => void;
}

export function GamesList({ 
  games, 
  selections, 
  onToggleSelection, 
  isLoading, 
  error,
  selectedSport,
  onRefresh
}: GamesListProps) {
  if (!selectedSport) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <Trophy className="w-20 h-20 text-muted-foreground/20 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Bem-vindo ao GANHE MAIS AQUI</h2>
        <p className="text-muted-foreground max-w-md">
          Selecione uma liga de futebol no menu lateral para ver os jogos e odds disponíveis.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-0">
                <div className="p-4 border-b border-card-border">
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar jogos</h2>
        <p className="text-muted-foreground max-w-md mb-4">
          {error.message || "Não foi possível carregar os jogos. Tente novamente."}
        </p>
        <Button onClick={onRefresh} variant="outline" data-testid="button-retry">
          <RefreshCw className="w-4 h-4 mr-2" />
          Tentar Novamente
        </Button>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <Trophy className="w-16 h-16 text-muted-foreground/20 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Sem jogos disponíveis</h2>
        <p className="text-muted-foreground max-w-md">
          Não há jogos disponíveis para esta liga no momento. Tente novamente mais tarde ou selecione outra liga.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold" data-testid="text-games-count">
            {games.length} {games.length === 1 ? "Jogo" : "Jogos"} Disponíveis
          </h2>
          <p className="text-sm text-muted-foreground">
            Clique nas odds para adicionar ao seu bilhete
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} data-testid="button-refresh-games">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>
      
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {games.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            selections={selections}
            onToggleSelection={onToggleSelection}
          />
        ))}
      </div>
    </div>
  );
}
