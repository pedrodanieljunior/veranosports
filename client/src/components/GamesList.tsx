import { Game, Selection } from "@shared/schema";
import { GameCard } from "./GameCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, AlertCircle, RefreshCw, Calendar, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface GamesListProps {
  games: Game[];
  selections: Selection[];
  onGameClick: (game: Game) => void;
  isLoading: boolean;
  error: Error | null;
  selectedSport: string | null;
  onRefresh: () => void;
  isTodayGames?: boolean;
  upcomingBrasileirao?: Game[];
  brasileiraoLoading?: boolean;
}

export function GamesList({ 
  games, 
  selections, 
  onGameClick, 
  isLoading, 
  error,
  selectedSport,
  onRefresh,
  isTodayGames = false,
  upcomingBrasileirao = [],
  brasileiraoLoading = false
}: GamesListProps) {

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

  if (games.length === 0 && !isTodayGames) {
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

  if (games.length === 0 && isTodayGames) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <Calendar className="w-16 h-16 text-muted-foreground/20 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Nenhum jogo hoje</h2>
        <p className="text-muted-foreground max-w-md">
          Não há jogos programados para hoje nas principais ligas. Selecione uma liga no menu para ver próximos jogos.
        </p>
      </div>
    );
  }

  // Agrupar jogos por liga quando mostrando jogos do dia
  const gamesByLeague = isTodayGames 
    ? games.reduce((acc, game) => {
        const league = game.sportTitle;
        if (!acc[league]) acc[league] = [];
        acc[league].push(game);
        return acc;
      }, {} as Record<string, Game[]>)
    : null;

  const today = new Date();
  const formattedDate = format(today, "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          {isTodayGames ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-5 h-5 text-yellow-500" />
                <h2 className="text-xl font-semibold" data-testid="text-today-games">
                  Jogos do Dia
                </h2>
              </div>
              <p className="text-sm text-muted-foreground capitalize">
                {formattedDate} - {games.length} {games.length === 1 ? "jogo" : "jogos"} nas principais ligas
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold" data-testid="text-games-count">
                {games.length} {games.length === 1 ? "Jogo" : "Jogos"} Disponíveis
              </h2>
              <p className="text-sm text-muted-foreground">
                Clique no jogo para ver todos os mercados
              </p>
            </>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} data-testid="button-refresh-games">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>
      
      {isTodayGames && gamesByLeague ? (
        <div className="space-y-6">
          {Object.entries(gamesByLeague).map(([league, leagueGames]) => (
            <div key={league}>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="secondary" className="text-xs">
                  {league}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {leagueGames.length} {leagueGames.length === 1 ? "jogo" : "jogos"}
                </span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {leagueGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    selections={selections}
                    onClick={() => onGameClick(game)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              selections={selections}
              onClick={() => onGameClick(game)}
            />
          ))}
        </div>
      )}

      {/* Próximos jogos do Brasileirão quando não há jogos do Brasil hoje */}
      {isTodayGames && upcomingBrasileirao.length > 0 && (
        <div className="mt-8 pt-6 border-t border-border">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-4 rounded-sm overflow-hidden flex">
              <div className="w-1/3 bg-green-500" />
              <div className="w-1/3 bg-yellow-400" />
              <div className="w-1/3 bg-blue-500" />
            </div>
            <h3 className="text-lg font-semibold">Próximos Jogos do Brasileirão</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Confira os próximos jogos do Campeonato Brasileiro
          </p>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {upcomingBrasileirao.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                selections={selections}
                onClick={() => onGameClick(game)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Loading do Brasileirão */}
      {isTodayGames && brasileiraoLoading && upcomingBrasileirao.length === 0 && (
        <div className="mt-8 pt-6 border-t border-border">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="w-6 h-4" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
