import { Game, Selection } from "@shared/schema";
import { GameCard } from "./GameCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, AlertCircle, RefreshCw, Calendar, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { translateLeagueName } from "@/lib/leagueTranslations";

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
  isDark?: boolean;
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
  brasileiraoLoading = false,
  isDark = false
}: GamesListProps) {
  const [activeLeague, setActiveLeague] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex-1 p-4 sm:p-6 bg-transparent">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-5 w-full mb-2" />
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-transparent">
        <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Erro ao carregar jogos</h2>
        <p className="text-sm text-gray-500 max-w-md mb-4">
          {error.message || "Não foi possível carregar os jogos. Tente novamente."}
        </p>
        <Button onClick={onRefresh} className="bg-green-600 hover:bg-green-700 text-white" data-testid="button-retry">
          <RefreshCw className="w-4 h-4 mr-2" />
          Tentar Novamente
        </Button>
      </div>
    );
  }

  if (games.length === 0 && !isTodayGames) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-transparent">
        <Trophy className="w-12 h-12 text-gray-300 mb-3" />
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Sem jogos disponíveis</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Não há jogos disponíveis para esta liga no momento.
        </p>
      </div>
    );
  }

  if (games.length === 0 && isTodayGames) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-transparent">
        <Calendar className="w-12 h-12 text-gray-300 mb-3" />
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Nenhum jogo hoje</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Selecione uma liga no menu para ver próximos jogos.
        </p>
      </div>
    );
  }

  const gamesByLeague = isTodayGames 
    ? games.reduce((acc, game) => {
        const league = game.sportTitle;
        if (!acc[league]) acc[league] = [];
        acc[league].push(game);
        return acc;
      }, {} as Record<string, Game[]>)
    : null;

  const leagueNames = gamesByLeague ? Object.keys(gamesByLeague) : [];
  const currentLeague = activeLeague && gamesByLeague?.[activeLeague] ? activeLeague : leagueNames[0] || null;
  const displayGames = isTodayGames && currentLeague && gamesByLeague 
    ? gamesByLeague[currentLeague] 
    : games;

  const today = new Date();
  const formattedDate = format(today, "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-auto bg-transparent">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          {isTodayGames ? (
            <>
              <div className="flex items-center gap-2 mb-0.5">
                <Star className="w-5 h-5 text-yellow-500" />
                <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-800"}`} data-testid="text-today-games">
                  Jogos do Dia
                </h2>
              </div>
              <p className={`text-xs capitalize ${isDark ? "text-white/70" : "text-gray-500"}`}>
                {formattedDate} - {games.length} {games.length === 1 ? "Jogo" : "Jogos"} Nas Principais Ligas
              </p>
            </>
          ) : (
            <>
              <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-800"}`} data-testid="text-games-count">
                {games.length} {games.length === 1 ? "Jogo" : "Jogos"} Disponíveis
              </h2>
              <p className={`text-xs ${isDark ? "text-white/70" : "text-gray-500"}`}>
                Clique no jogo para ver todos os mercados
              </p>
            </>
          )}
        </div>
        <Button 
          size="sm" 
          onClick={onRefresh} 
          className="bg-green-600 hover:bg-green-700 text-white text-xs h-8"
          data-testid="button-refresh-games"
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          Atualizar
        </Button>
      </div>

      {isTodayGames && leagueNames.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide px-1 py-2 rounded-xl" style={{ background: "linear-gradient(135deg, #f5c518 0%, #e8b206 40%, #d4960a 100%)" }}>
          {leagueNames.map((league) => {
            const leagueKey = gamesByLeague?.[league]?.[0]?.sportKey || "";
            const displayName = translateLeagueName(leagueKey, league);
            return (
              <button
                key={league}
                onClick={() => setActiveLeague(league)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  currentLeague === league
                    ? "bg-white text-yellow-700 shadow-sm font-bold"
                    : "bg-black/20 text-white hover:bg-black/30"
                }`}
                data-testid={`button-league-tab-${league}`}
              >
                {displayName} <span className="text-[10px] opacity-70">{gamesByLeague?.[league]?.length} jogos</span>
              </button>
            );
          })}
        </div>
      )}
      
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        {displayGames.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            selections={selections}
            onClick={() => onGameClick(game)}
          />
        ))}
      </div>

      {isTodayGames && upcomingBrasileirao.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-3.5 rounded-sm overflow-hidden flex">
              <div className="w-1/3 bg-green-500" />
              <div className="w-1/3 bg-yellow-400" />
              <div className="w-1/3 bg-blue-500" />
            </div>
            <h3 className="text-sm font-bold text-gray-800">Próximos Jogos do Brasileirão</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
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

      {isTodayGames && brasileiraoLoading && upcomingBrasileirao.length === 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <Skeleton className="h-5 w-48 mb-3" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
