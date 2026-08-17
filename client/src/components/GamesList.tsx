import { Game, Selection } from "@shared/schema";
import { GameCard } from "./GameCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, AlertCircle, Star, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { translateLeagueName } from "@/lib/leagueTranslations";
import { LEAGUE_IDS } from "@/lib/leagueIds";
import { proxyLogoUrl } from "@/lib/imgProxy";

interface GamesListProps {
  games: Game[];
  selections: Selection[];
  onGameClick: (game: Game) => void;
  onToggleSelection?: (selection: Selection) => void;
  isLoading: boolean;
  error: Error | null;
  selectedSport: string | null;
  isTodayGames?: boolean;
  isDark?: boolean;
  hideHeader?: boolean;
}

export function GamesList({ 
  games, 
  selections, 
  onGameClick,
  onToggleSelection,
  isLoading, 
  error,
  selectedSport,
  isTodayGames = false,
  isDark = false,
  hideHeader = false,
}: GamesListProps) {
  const [activeLeague, setActiveLeague] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex-1 p-4 sm:p-6 bg-transparent">
        {/* Cabeçalho de carregamento */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className={`text-sm font-medium ${isDark ? "text-white/70" : "text-gray-500"}`}>
            Carregando jogos disponíveis...
          </span>
        </div>

        {/* Skeletons no estilo dos cards reais */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-lg border animate-pulse ${isDark ? "bg-[#4a4a4a] border-[#5a5a5a]" : "bg-white border-gray-200"}`}
            >
              {/* Header do card (horário) */}
              <div className={`flex items-center gap-2 px-3 py-2 border-b rounded-t-lg ${isDark ? "border-[#5a5a5a] bg-[#3d3d3d]" : "border-gray-100 bg-gray-50"}`}>
                <Skeleton className={`h-3 w-20 ${isDark ? "bg-white/10" : ""}`} />
                <div className="ml-auto">
                  <Skeleton className={`h-3 w-4 ${isDark ? "bg-white/10" : ""}`} />
                </div>
              </div>

              <div className="p-2.5 space-y-2">
                {/* Time da casa */}
                <div className="flex items-center gap-2">
                  <Skeleton className={`w-6 h-6 rounded-full shrink-0 ${isDark ? "bg-white/10" : ""}`} />
                  <Skeleton className={`h-3.5 w-28 ${isDark ? "bg-white/10" : ""}`} />
                </div>
                {/* Time visitante */}
                <div className="flex items-center gap-2">
                  <Skeleton className={`w-6 h-6 rounded-full shrink-0 ${isDark ? "bg-white/10" : ""}`} />
                  <Skeleton className={`h-3.5 w-24 ${isDark ? "bg-white/10" : ""}`} />
                </div>

                {/* Botões de odds (1 X 2) */}
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  {[0, 1, 2].map((j) => (
                    <Skeleton
                      key={j}
                      className={`h-9 rounded-md ${isDark ? "bg-white/10" : ""}`}
                    />
                  ))}
                </div>
              </div>
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
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg" data-testid="button-retry">
          Tentar Novamente
        </button>
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

  // Agrupar jogos por liga preservando a ordem de prioridade
  const gamesByLeague = isTodayGames
    ? games.reduce((acc, game) => {
        const league = game.sportTitle;
        if (!acc[league]) acc[league] = [];
        acc[league].push(game);
        return acc;
      }, {} as Record<string, Game[]>)
    : null;

  // Manter ordem original (já vem ordenada por prioridade do backend)
  // Garante que o Brasileirão (soccer_brazil_campeonato) seja sempre o primeiro
  const leagueOrder = isTodayGames
    ? (() => {
        const titles = Array.from(new Set(games.map(g => g.sportTitle)));
        const brasileiraoTitle = games.find(g => g.sportKey === "soccer_brazil_campeonato")?.sportTitle;
        if (brasileiraoTitle && titles.includes(brasileiraoTitle)) {
          return [brasileiraoTitle, ...titles.filter(t => t !== brasileiraoTitle)];
        }
        return titles;
      })()
    : [];

  // Aba padrão: Brasileirão, se disponível
  const defaultLeague = leagueOrder.find(t =>
    games.find(g => g.sportTitle === t && g.sportKey === "soccer_brazil_campeonato")
  ) || leagueOrder[0] || null;
  const currentLeague = activeLeague && gamesByLeague?.[activeLeague] ? activeLeague : defaultLeague;
  const tabGames = isTodayGames && currentLeague && gamesByLeague
    ? gamesByLeague[currentLeague]
    : games;

  const today = new Date();
  const formattedDate = format(today, "EEEE, d 'de' MMMM", { locale: ptBR });


  return (
    <div className="flex-1 p-4 sm:p-6 overflow-auto bg-transparent">
      {/* Cabeçalho */}
      {!hideHeader && <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
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
                {formattedDate} — {games.length} {games.length === 1 ? "jogo" : "jogos"} em {leagueOrder.length} {leagueOrder.length === 1 ? "liga" : "ligas"}
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
      </div>}

      {/* Abas de ligas */}
      {isTodayGames && leagueOrder.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          {leagueOrder.map((league) => {
            const leagueKey = gamesByLeague?.[league]?.[0]?.sportKey || "";
            const displayName = translateLeagueName(leagueKey, league);
            return (
              <button
                key={league}
                onClick={() => setActiveLeague(league)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  currentLeague === league
                    ? "bg-yellow-500 text-white shadow-sm font-bold"
                    : isDark
                      ? "bg-white/15 text-white hover:bg-white/25"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                }`}
                data-testid={`button-league-tab-${league}`}
              >
                {displayName} <span className="text-[10px] opacity-70">({gamesByLeague?.[league]?.length})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Jogos da aba selecionada */}
      {isTodayGames && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 mb-6">
          {tabGames.map((game) => (
            <GameCard key={game.id} game={game} selections={selections} onClick={() => onGameClick(game)} onToggleSelection={onToggleSelection} isDark={isDark} />
          ))}
        </div>
      )}

      {/* Seções por liga (todas as ligas exceto a já exibida na aba, uma abaixo da outra) */}
      {isTodayGames && leagueOrder.length > 0 && (
        <div className={`border-t ${isDark ? "border-white/20" : "border-gray-200"} pt-4 space-y-6`}>
          {leagueOrder.filter(league => league !== currentLeague).map((league) => {
            const leagueGames = gamesByLeague?.[league] || [];
            const leagueKey = leagueGames[0]?.sportKey || "";
            const displayName = translateLeagueName(leagueKey, league);
            return (
              <div key={league}>
                <button
                  onClick={() => setActiveLeague(league)}
                  className={`flex items-center gap-2 mb-3 w-full text-left group`}
                  data-testid={`button-league-section-${leagueKey}`}
                >
                  {LEAGUE_IDS[leagueKey] && (
                    <img
                      src={proxyLogoUrl(`https://media.api-sports.io/football/leagues/${LEAGUE_IDS[leagueKey]}.png`)}
                      alt=""
                      width={18}
                      height={18}
                      className="w-[18px] h-[18px] object-contain flex-shrink-0"
                    />
                  )}
                  <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
                    {displayName}
                  </h3>
                  <span className={`text-xs ml-1 ${isDark ? "text-white/50" : "text-gray-400"}`}>
                    {leagueGames.length} {leagueGames.length === 1 ? "jogo" : "jogos"}
                  </span>
                </button>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                  {leagueGames.map((game) => (
                    <GameCard key={game.id} game={game} selections={selections} onClick={() => onGameClick(game)} onToggleSelection={onToggleSelection} isDark={isDark} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lista normal (não é "hoje") */}
      {!isTodayGames && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {games.map((game) => (
            <GameCard key={game.id} game={game} selections={selections} onClick={() => onGameClick(game)} onToggleSelection={onToggleSelection} isDark={isDark} />
          ))}
        </div>
      )}

    </div>
  );
}
