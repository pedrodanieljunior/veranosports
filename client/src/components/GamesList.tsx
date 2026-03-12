import { Game, Selection } from "@shared/schema";
import { GameCard } from "./GameCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, AlertCircle, Star, Calendar } from "lucide-react";
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
  const leagueOrder = isTodayGames
    ? Array.from(new Set(games.map(g => g.sportTitle)))
    : [];

  const currentLeague = activeLeague && gamesByLeague?.[activeLeague] ? activeLeague : leagueOrder[0] || null;
  const tabGames = isTodayGames && currentLeague && gamesByLeague
    ? gamesByLeague[currentLeague]
    : games;

  const today = new Date();
  const formattedDate = format(today, "EEEE, d 'de' MMMM", { locale: ptBR });

  // Ícones de bandeira por liga
  const LEAGUE_FLAGS: Record<string, string> = {
    "soccer_brazil_campeonato": "🇧🇷",
    "soccer_brazil_serie_b": "🇧🇷",
    "soccer_brazil_copa_do_brasil": "🇧🇷",
    "soccer_conmebol_copa_libertadores": "🌎",
    "soccer_conmebol_copa_sudamericana": "🌎",
    "soccer_uefa_champs_league": "⭐",
    "soccer_uefa_europa_league": "🇪🇺",
    "soccer_uefa_europa_conference_league": "🇪🇺",
    "soccer_epl": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "soccer_fa_cup": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "soccer_spain_la_liga": "🇪🇸",
    "soccer_germany_bundesliga": "🇩🇪",
    "soccer_italy_serie_a": "🇮🇹",
    "soccer_france_ligue_one": "🇫🇷",
    "soccer_portugal_primeira_liga": "🇵🇹",
    "soccer_netherlands_eredivisie": "🇳🇱",
    "soccer_turkey_super_league": "🇹🇷",
    "soccer_argentina_primera_division": "🇦🇷",
    "soccer_mexico_ligamx": "🇲🇽",
    "soccer_usa_mls": "🇺🇸",
    "soccer_japan_j_league": "🇯🇵",
  };

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-auto bg-transparent">
      {/* Cabeçalho */}
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
      </div>

      {/* Abas de ligas */}
      {isTodayGames && leagueOrder.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          {leagueOrder.map((league) => {
            const leagueKey = gamesByLeague?.[league]?.[0]?.sportKey || "";
            const displayName = translateLeagueName(leagueKey, league);
            const flag = LEAGUE_FLAGS[leagueKey] || "⚽";
            return (
              <button
                key={league}
                onClick={() => setActiveLeague(league)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                  currentLeague === league
                    ? "bg-yellow-500 text-white shadow-sm font-bold"
                    : isDark
                      ? "bg-white/15 text-white hover:bg-white/25"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                }`}
                data-testid={`button-league-tab-${league}`}
              >
                <span>{flag}</span>
                <span>{displayName}</span>
                <span className="text-[10px] opacity-70">({gamesByLeague?.[league]?.length})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Jogos da aba selecionada */}
      {isTodayGames && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 mb-6">
          {tabGames.map((game) => (
            <GameCard key={game.id} game={game} selections={selections} onClick={() => onGameClick(game)} isDark={isDark} />
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
            const flag = LEAGUE_FLAGS[leagueKey] || "⚽";
            return (
              <div key={league}>
                <button
                  onClick={() => setActiveLeague(league)}
                  className={`flex items-center gap-2 mb-3 w-full text-left group`}
                  data-testid={`button-league-section-${leagueKey}`}
                >
                  <span className="text-base">{flag}</span>
                  <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
                    {displayName}
                  </h3>
                  <span className={`text-xs ml-1 ${isDark ? "text-white/50" : "text-gray-400"}`}>
                    {leagueGames.length} {leagueGames.length === 1 ? "jogo" : "jogos"}
                  </span>
                </button>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                  {leagueGames.map((game) => (
                    <GameCard key={game.id} game={game} selections={selections} onClick={() => onGameClick(game)} isDark={isDark} />
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
            <GameCard key={game.id} game={game} selections={selections} onClick={() => onGameClick(game)} isDark={isDark} />
          ))}
        </div>
      )}

      {/* Próximos jogos do Brasileirão */}
      {isTodayGames && upcomingBrasileirao.length > 0 && (
        <div className={`mt-6 pt-4 border-t ${isDark ? "border-white/20" : "border-gray-200"}`}>
          <div className="flex items-center gap-2 mb-3">
            <img src="https://flagcdn.com/24x18/br.png" alt="Brasil" className="w-6 h-auto rounded-sm" />
            <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-800"}`}>Próximos Jogos do Brasileirão</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
            {upcomingBrasileirao.map((game) => (
              <GameCard key={game.id} game={game} selections={selections} onClick={() => onGameClick(game)} isDark={isDark} />
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
