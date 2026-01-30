import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBetSlipSchema } from "@shared/schema";
import { z } from "zod";
import { cache } from "./cache";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

const ODDSBLAZE_API_KEY = process.env.ODDSBLAZE_API_KEY;
const ODDSBLAZE_BASE = "https://odds.oddsblaze.com";

const CACHE_TTL_SPORTS = 60 * 60 * 1000; // 1 hora
const CACHE_TTL_ODDS = 10 * 60 * 1000; // 10 minutos
const CACHE_TTL_FOOTBALL = 15 * 60 * 1000; // 15 minutos
const CACHE_TTL_ODDSBLAZE = 5 * 60 * 1000; // 5 minutos - dados mais rápidos

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/sports", async (req, res) => {
    try {
      if (!ODDS_API_KEY) {
        return res.status(500).json({ error: "ODDS_API_KEY not configured" });
      }
      
      const cached = cache.get<any[]>("sports");
      if (cached) {
        return res.json(cached);
      }
      
      const response = await fetch(
        `${ODDS_API_BASE}/sports?apiKey=${ODDS_API_KEY}`
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Odds API error:", errorText);
        return res.status(response.status).json({ error: "Failed to fetch sports" });
      }
      
      const sports = await response.json();
      
      const soccerSports = sports.filter((sport: any) => 
        sport.active && sport.group === "Soccer"
      );
      
      cache.set("sports", soccerSports, CACHE_TTL_SPORTS);
      
      res.json(soccerSports);
    } catch (error) {
      console.error("Error fetching sports:", error);
      res.status(500).json({ error: "Failed to fetch sports" });
    }
  });

  app.get("/api/odds/:sportKey", async (req, res) => {
    try {
      if (!ODDS_API_KEY) {
        return res.status(500).json({ error: "ODDS_API_KEY not configured" });
      }
      
      const { sportKey } = req.params;
      const cacheKey = `odds_${sportKey}`;
      
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      const regions = "us,uk,eu";
      const markets = "h2h,spreads,totals";
      const oddsFormat = "decimal";
      
      const url = `${ODDS_API_BASE}/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Odds API error:", errorText);
        return res.status(response.status).json({ error: "Failed to fetch odds" });
      }
      
      const oddsData = await response.json();
      
      const games = oddsData.map((game: any) => ({
        id: game.id,
        sportKey: game.sport_key,
        sportTitle: game.sport_title,
        commenceTime: game.commence_time,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        bookmakers: game.bookmakers?.slice(0, 2).map((bookmaker: any) => ({
          key: bookmaker.key,
          title: bookmaker.title,
          lastUpdate: bookmaker.last_update,
          markets: bookmaker.markets?.map((market: any) => ({
            key: market.key,
            lastUpdate: market.last_update,
            outcomes: market.outcomes?.map((outcome: any) => ({
              name: outcome.name,
              price: outcome.price,
              point: outcome.point,
            })) || [],
          })) || [],
        })) || [],
      }));
      
      cache.set(cacheKey, games, CACHE_TTL_ODDS);
      
      res.json(games);
    } catch (error) {
      console.error("Error fetching odds:", error);
      res.status(500).json({ error: "Failed to fetch odds" });
    }
  });

  app.post("/api/bets", async (req, res) => {
    try {
      const validatedData = insertBetSlipSchema.parse(req.body);
      const betSlip = await storage.createBetSlip(validatedData);
      res.status(201).json(betSlip);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid bet data", 
          details: error.errors 
        });
      }
      console.error("Error creating bet:", error);
      res.status(500).json({ error: "Failed to create bet" });
    }
  });

  app.get("/api/bets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const betSlip = await storage.getBetSlip(id);
      
      if (!betSlip) {
        return res.status(404).json({ error: "Bet slip not found" });
      }
      
      res.json(betSlip);
    } catch (error) {
      console.error("Error fetching bet:", error);
      res.status(500).json({ error: "Failed to fetch bet" });
    }
  });

  app.get("/api/bets", async (req, res) => {
    try {
      const betSlips = await storage.getAllBetSlips();
      res.json(betSlips);
    } catch (error) {
      console.error("Error fetching bets:", error);
      res.status(500).json({ error: "Failed to fetch bets" });
    }
  });

  // API-Football: Buscar ligas de futebol
  app.get("/api/football/leagues", async (req, res) => {
    try {
      if (!API_FOOTBALL_KEY) {
        return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      }
      
      const cached = cache.get<any[]>("football_leagues");
      if (cached) {
        return res.json(cached);
      }
      
      const response = await fetch(`${API_FOOTBALL_BASE}/leagues?current=true`, {
        headers: { "x-apisports-key": API_FOOTBALL_KEY }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("API-Football error:", errorText);
        return res.status(response.status).json({ error: "Failed to fetch leagues" });
      }
      
      const data = await response.json();
      const leagues = data.response?.filter((item: any) => 
        item.league?.type === "League" || item.league?.type === "Cup"
      ).slice(0, 30).map((item: any) => ({
        id: item.league.id,
        name: item.league.name,
        country: item.country?.name,
        logo: item.league.logo,
        season: item.seasons?.[0]?.year
      })) || [];
      
      cache.set("football_leagues", leagues, CACHE_TTL_SPORTS);
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching football leagues:", error);
      res.status(500).json({ error: "Failed to fetch football leagues" });
    }
  });

  // API-Football: Buscar jogos de uma liga com odds
  app.get("/api/football/fixtures/:leagueId", async (req, res) => {
    try {
      if (!API_FOOTBALL_KEY) {
        return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      }
      
      const { leagueId } = req.params;
      const cacheKey = `football_fixtures_${leagueId}`;
      
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      // Buscar jogos próximos
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const fixturesResponse = await fetch(
        `${API_FOOTBALL_BASE}/fixtures?league=${leagueId}&season=2024&from=${today}&to=${nextWeek}`,
        { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
      );
      
      if (!fixturesResponse.ok) {
        const errorText = await fixturesResponse.text();
        console.error("API-Football fixtures error:", errorText);
        return res.status(fixturesResponse.status).json({ error: "Failed to fetch fixtures" });
      }
      
      const fixturesData = await fixturesResponse.json();
      const fixtures = fixturesData.response?.slice(0, 10) || [];
      
      // Buscar odds para cada jogo
      const fixturesWithOdds = await Promise.all(
        fixtures.map(async (fixture: any) => {
          try {
            const oddsResponse = await fetch(
              `${API_FOOTBALL_BASE}/odds?fixture=${fixture.fixture.id}`,
              { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
            );
            
            let odds: any[] = [];
            if (oddsResponse.ok) {
              const oddsData = await oddsResponse.json();
              odds = oddsData.response?.[0]?.bookmakers?.[0]?.bets || [];
            }
            
            return {
              id: fixture.fixture.id,
              date: fixture.fixture.date,
              homeTeam: fixture.teams.home.name,
              awayTeam: fixture.teams.away.name,
              homeLogo: fixture.teams.home.logo,
              awayLogo: fixture.teams.away.logo,
              league: fixture.league.name,
              odds: odds.map((bet: any) => ({
                name: bet.name,
                values: bet.values?.map((v: any) => ({
                  value: v.value,
                  odd: parseFloat(v.odd)
                })) || []
              }))
            };
          } catch (err) {
            return {
              id: fixture.fixture.id,
              date: fixture.fixture.date,
              homeTeam: fixture.teams.home.name,
              awayTeam: fixture.teams.away.name,
              homeLogo: fixture.teams.home.logo,
              awayLogo: fixture.teams.away.logo,
              league: fixture.league.name,
              odds: []
            };
          }
        })
      );
      
      cache.set(cacheKey, fixturesWithOdds, CACHE_TTL_FOOTBALL);
      res.json(fixturesWithOdds);
    } catch (error) {
      console.error("Error fetching football fixtures:", error);
      res.status(500).json({ error: "Failed to fetch football fixtures" });
    }
  });

  // API-Football: Buscar mercados extras por nome dos times
  app.get("/api/football/extra-markets", async (req, res) => {
    try {
      if (!API_FOOTBALL_KEY) {
        return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      }
      
      const { homeTeam, awayTeam, commenceTime } = req.query;
      
      if (!homeTeam || !awayTeam) {
        return res.status(400).json({ error: "homeTeam and awayTeam are required" });
      }
      
      const cacheKey = `extra_markets_${homeTeam}_${awayTeam}_${commenceTime || ''}`;
      const cached = cache.get<any>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      // Parse game date if provided for better matching
      let gameDate: Date | null = null;
      if (commenceTime) {
        gameDate = new Date(String(commenceTime));
      }
      
      // Buscar jogos num intervalo de 3 dias
      const today = new Date();
      const fromDate = gameDate ? new Date(gameDate.getTime() - 24 * 60 * 60 * 1000) : today;
      const toDate = gameDate ? new Date(gameDate.getTime() + 24 * 60 * 60 * 1000) : new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const from = fromDate.toISOString().split('T')[0];
      const to = toDate.toISOString().split('T')[0];
      
      // Buscar por nome do time da casa (primeira palavra significativa)
      const homeWords = String(homeTeam).toLowerCase().split(' ').filter(w => w.length > 2 && !['fc', 'sc', 'cf', 'ac', 'cd', 'rc'].includes(w));
      const searchTerm = homeWords[0] || String(homeTeam).split(' ')[0];
      
      const searchResponse = await fetch(
        `${API_FOOTBALL_BASE}/fixtures?search=${encodeURIComponent(searchTerm)}&from=${from}&to=${to}`,
        { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
      );
      
      if (!searchResponse.ok) {
        console.error("API-Football search failed:", await searchResponse.text());
        return res.json({ markets: [], error: "search_failed" });
      }
      
      const searchData = await searchResponse.json();
      const fixtures = searchData.response || [];
      
      // Função para normalizar nomes de times
      const normalizeTeamName = (name: string): string[] => {
        return name.toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(' ')
          .filter(w => w.length > 2 && !['fc', 'sc', 'cf', 'ac', 'cd', 'rc', 'united', 'city', 'real', 'sporting', 'athletic'].includes(w));
      };
      
      const homeNorm = normalizeTeamName(String(homeTeam));
      const awayNorm = normalizeTeamName(String(awayTeam));
      
      // Encontrar o jogo que corresponde - matching mais robusto
      const matchingFixture = fixtures.find((f: any) => {
        const fixtureHomeNorm = normalizeTeamName(f.teams.home.name);
        const fixtureAwayNorm = normalizeTeamName(f.teams.away.name);
        
        // Verificar se há palavras significativas em comum
        const homeMatch = homeNorm.some(w => fixtureHomeNorm.includes(w)) || 
                         fixtureHomeNorm.some(w => homeNorm.includes(w));
        const awayMatch = awayNorm.some(w => fixtureAwayNorm.includes(w)) ||
                         fixtureAwayNorm.some(w => awayNorm.includes(w));
        
        // Se temos data do jogo, verificar se está no mesmo dia
        if (gameDate && f.fixture.date) {
          const fixtureDate = new Date(f.fixture.date);
          const sameDayish = Math.abs(fixtureDate.getTime() - gameDate.getTime()) < 48 * 60 * 60 * 1000;
          return homeMatch && awayMatch && sameDayish;
        }
        
        return homeMatch && awayMatch;
      });
      
      if (!matchingFixture) {
        cache.set(cacheKey, { markets: [] }, CACHE_TTL_FOOTBALL);
        return res.json({ markets: [] });
      }
      
      // Buscar odds do jogo
      const oddsResponse = await fetch(
        `${API_FOOTBALL_BASE}/odds?fixture=${matchingFixture.fixture.id}`,
        { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
      );
      
      if (!oddsResponse.ok) {
        cache.set(cacheKey, { markets: [] }, CACHE_TTL_FOOTBALL);
        return res.json({ markets: [] });
      }
      
      const oddsData = await oddsResponse.json();
      const bookmaker = oddsData.response?.[0]?.bookmakers?.[0];
      
      if (!bookmaker) {
        cache.set(cacheKey, { markets: [] }, CACHE_TTL_FOOTBALL);
        return res.json({ markets: [] });
      }
      
      // Mapear mercados extras relevantes
      const relevantBets = [
        { id: 1, name: "Match Winner", label: "Resultado Final" },
        { id: 2, name: "Home/Away", label: "Casa/Fora" },
        { id: 3, name: "Second Half Winner", label: "Vencedor 2º Tempo" },
        { id: 4, name: "Goals Over/Under", label: "Total de Gols" },
        { id: 5, name: "Goals Over/Under First Half", label: "Gols 1º Tempo" },
        { id: 6, name: "Goals Over/Under Second Half", label: "Gols 2º Tempo" },
        { id: 8, name: "Both Teams Score", label: "Ambas Marcam (BTTS)" },
        { id: 9, name: "Exact Score", label: "Placar Exato" },
        { id: 10, name: "Double Chance", label: "Dupla Chance" },
        { id: 11, name: "First Half Winner", label: "Vencedor 1º Tempo" },
        { id: 13, name: "HT/FT Double", label: "Intervalo/Final" },
        { id: 16, name: "Clean Sheet - Home", label: "Sem Sofrer Gol - Casa" },
        { id: 17, name: "Clean Sheet - Away", label: "Sem Sofrer Gol - Fora" },
        { id: 21, name: "Correct Score - First Half", label: "Placar 1º Tempo" },
        { id: 27, name: "Odd/Even", label: "Ímpar/Par" },
      ];
      
      const markets = bookmaker.bets
        .filter((bet: any) => relevantBets.some(r => r.id === bet.id))
        .map((bet: any) => {
          const relevantBet = relevantBets.find(r => r.id === bet.id);
          return {
            id: bet.id,
            name: bet.name,
            label: relevantBet?.label || bet.name,
            values: bet.values?.map((v: any) => ({
              value: v.value,
              odd: parseFloat(v.odd)
            })) || []
          };
        });
      
      const result = {
        fixtureId: matchingFixture.fixture.id,
        homeTeam: matchingFixture.teams.home.name,
        awayTeam: matchingFixture.teams.away.name,
        bookmaker: bookmaker.name,
        markets
      };
      
      cache.set(cacheKey, result, CACHE_TTL_FOOTBALL);
      res.json(result);
    } catch (error) {
      console.error("Error fetching extra markets:", error);
      res.status(500).json({ error: "Failed to fetch extra markets" });
    }
  });

  // API-Football: Buscar tipos de apostas disponíveis
  app.get("/api/football/bets", async (req, res) => {
    try {
      if (!API_FOOTBALL_KEY) {
        return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      }
      
      const cached = cache.get<any[]>("football_bets");
      if (cached) {
        return res.json(cached);
      }
      
      const response = await fetch(`${API_FOOTBALL_BASE}/odds/bets`, {
        headers: { "x-apisports-key": API_FOOTBALL_KEY }
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch bet types" });
      }
      
      const data = await response.json();
      cache.set("football_bets", data.response || [], CACHE_TTL_SPORTS);
      res.json(data.response || []);
    } catch (error) {
      console.error("Error fetching bet types:", error);
      res.status(500).json({ error: "Failed to fetch bet types" });
    }
  });

  // OddsBlaze: Buscar odds de futebol com múltiplas casas de apostas
  app.get("/api/oddsblaze/soccer", async (req, res) => {
    try {
      if (!ODDSBLAZE_API_KEY) {
        return res.status(500).json({ error: "ODDSBLAZE_API_KEY not configured" });
      }
      
      const cacheKey = "oddsblaze_soccer";
      const cached = cache.get<any>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      // OddsBlaze usa formato: ?sportsbook=X&league=Y&key=Z
      const sportsbooks = ["draftkings", "fanduel", "betmgm"];
      const leagues = ["epl", "laliga", "seriea", "bundesliga", "ligue1"];
      const allGames: any[] = [];
      
      // Buscar de uma casa de apostas principal
      for (const league of leagues) {
        try {
          const response = await fetch(
            `${ODDSBLAZE_BASE}/?sportsbook=draftkings&league=${league}&key=${ODDSBLAZE_API_KEY}`,
            { headers: { "Accept": "application/json" } }
          );
          
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
              allGames.push(...data.map((g: any) => ({ ...g, leagueSource: league })));
            } else if (data.games && Array.isArray(data.games)) {
              allGames.push(...data.games.map((g: any) => ({ ...g, leagueSource: league })));
            }
          }
        } catch (err) {
          console.error(`OddsBlaze error for ${league}:`, err);
        }
      }
      
      const result = {
        source: "oddsblaze",
        games: allGames,
        timestamp: new Date().toISOString()
      };
      
      cache.set(cacheKey, result, CACHE_TTL_ODDSBLAZE);
      res.json(result);
    } catch (error) {
      console.error("Error fetching OddsBlaze odds:", error);
      res.status(500).json({ error: "Failed to fetch OddsBlaze odds" });
    }
  });

  // OddsBlaze: Buscar odds de um jogo específico por nome dos times
  app.get("/api/oddsblaze/game-odds", async (req, res) => {
    try {
      if (!ODDSBLAZE_API_KEY) {
        return res.status(500).json({ error: "ODDSBLAZE_API_KEY not configured" });
      }
      
      const { homeTeam, awayTeam, league } = req.query;
      
      if (!homeTeam || !awayTeam) {
        return res.status(400).json({ error: "homeTeam and awayTeam are required" });
      }
      
      const cacheKey = `oddsblaze_game_${homeTeam}_${awayTeam}_${league || 'unknown'}`;
      const cached = cache.get<any>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      // Mapear liga do The Odds API para formato OddsBlaze
      const leagueMapping: Record<string, string> = {
        "soccer_epl": "epl",
        "soccer_spain_la_liga": "laliga",
        "soccer_italy_serie_a": "seriea",
        "soccer_germany_bundesliga": "bundesliga",
        "soccer_france_ligue_one": "ligue1",
        "soccer_usa_mls": "mls",
        "soccer_uefa_champs_league": "ucl",
        "soccer_uefa_europa_league": "uel",
        "soccer_brazil_campeonato": "brazil_serie_a",
        "soccer_portugal_primeira_liga": "primeira_liga",
        "soccer_netherlands_eredivisie": "eredivisie",
        "soccer_argentina_primera_division": "argentina_liga"
      };
      
      const oddsBlazeLeague = leagueMapping[String(league)];
      
      // Se não temos mapeamento para a liga, retornar erro específico
      if (!oddsBlazeLeague) {
        const emptyResult = { markets: [], unsupported_league: true };
        cache.set(cacheKey, emptyResult, CACHE_TTL_ODDSBLAZE);
        return res.json(emptyResult);
      }
      
      // Usar formato correto: ?sportsbook=X&league=Y&key=Z
      const response = await fetch(
        `${ODDSBLAZE_BASE}/?sportsbook=draftkings&league=${oddsBlazeLeague}&key=${ODDSBLAZE_API_KEY}`,
        { headers: { "Accept": "application/json" } }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("OddsBlaze API error:", errorText);
        return res.status(502).json({ markets: [], error: "api_error", message: "OddsBlaze API unavailable" });
      }
      
      const data = await response.json();
      
      // OddsBlaze pode retornar array direto ou objeto com games
      let games: any[] = [];
      if (Array.isArray(data)) {
        games = data;
      } else if (data.games && Array.isArray(data.games)) {
        games = data.games;
      } else if (data.odds && Array.isArray(data.odds)) {
        games = data.odds;
      }
      
      console.log(`OddsBlaze: Found ${games.length} games for league ${oddsBlazeLeague}`);
      
      // Normalizar nome de time
      const normalizeTeam = (name: string): string[] => {
        return name.toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(' ')
          .filter(w => w.length > 2);
      };
      
      const homeNorm = normalizeTeam(String(homeTeam));
      const awayNorm = normalizeTeam(String(awayTeam));
      
      // Encontrar o jogo - tentar diferentes formatos de dados
      const matchingGame = games.find((g: any) => {
        // Formato 1: teams.home.name / teams.away.name
        let gameHomeName = g.teams?.home?.name || g.home_team || g.homeTeam || g.home || '';
        let gameAwayName = g.teams?.away?.name || g.away_team || g.awayTeam || g.away || '';
        
        const gameHome = normalizeTeam(gameHomeName);
        const gameAway = normalizeTeam(gameAwayName);
        
        const homeMatch = homeNorm.some(w => gameHome.some(gw => gw.includes(w) || w.includes(gw)));
        const awayMatch = awayNorm.some(w => gameAway.some(gw => gw.includes(w) || w.includes(gw)));
        
        return homeMatch && awayMatch;
      });
      
      if (!matchingGame) {
        console.log(`OddsBlaze: No matching game found for ${homeTeam} vs ${awayTeam}`);
        cache.set(cacheKey, { markets: [] }, CACHE_TTL_ODDSBLAZE);
        return res.json({ markets: [] });
      }
      
      console.log(`OddsBlaze: Found matching game:`, JSON.stringify(matchingGame).substring(0, 200));
      
      // Transformar odds para formato padrão
      const markets: any[] = [];
      
      // OddsBlaze pode ter odds em diferentes formatos
      const sportsbooks = matchingGame.sportsbooks || matchingGame.bookmakers || [];
      const directOdds = matchingGame.odds || matchingGame.markets || [];
      
      // Agregar odds de todas as casas
      const marketsByType: Record<string, any[]> = {};
      
      // Processar sportsbooks se existirem
      if (sportsbooks.length > 0) {
        sportsbooks.forEach((sb: any) => {
          const odds = sb.odds || sb.markets || [];
          odds.forEach((odd: any) => {
            const marketType = odd.market || odd.type || odd.name || 'unknown';
            if (!marketsByType[marketType]) {
              marketsByType[marketType] = [];
            }
            marketsByType[marketType].push({
              bookmaker: sb.name || sb.id || 'OddsBlaze',
              ...odd
            });
          });
        });
      }
      
      // Processar odds diretas se existirem
      if (directOdds.length > 0) {
        directOdds.forEach((odd: any) => {
          const marketType = odd.market || odd.type || odd.name || 'unknown';
          if (!marketsByType[marketType]) {
            marketsByType[marketType] = [];
          }
          marketsByType[marketType].push({
            bookmaker: 'OddsBlaze',
            ...odd
          });
        });
      }
      
      // Mapear mercados para formato legível
      const marketLabels: Record<string, string> = {
        "Moneyline": "Resultado Final",
        "Point Spread": "Handicap",
        "Total Points": "Total de Gols",
        "Total Goals": "Total de Gols",
        "Both Teams to Score": "Ambas Marcam (BTTS)",
        "Draw No Bet": "Empate Anula Aposta",
        "Double Chance": "Dupla Chance",
        "First Half Moneyline": "1º Tempo - Resultado",
        "First Half Total": "1º Tempo - Total",
      };
      
      Object.entries(marketsByType).forEach(([type, odds]) => {
        const label = marketLabels[type] || type;
        
        // Usar melhor odd de cada resultado
        const bestOdds: Record<string, { value: string; odd: number; bookmaker: string }> = {};
        
        odds.forEach((o: any) => {
          const key = o.selection || o.name || o.value;
          const price = parseFloat(o.price) || parseFloat(o.odds) || 0;
          
          if (!bestOdds[key] || price > bestOdds[key].odd) {
            bestOdds[key] = {
              value: key,
              odd: price,
              bookmaker: o.bookmaker
            };
          }
        });
        
        if (Object.keys(bestOdds).length > 0) {
          markets.push({
            id: type,
            name: type,
            label,
            values: Object.values(bestOdds)
          });
        }
      });
      
      const result = {
        gameId: matchingGame.id,
        homeTeam: matchingGame.teams?.home?.name,
        awayTeam: matchingGame.teams?.away?.name,
        source: "oddsblaze",
        markets
      };
      
      cache.set(cacheKey, result, CACHE_TTL_ODDSBLAZE);
      res.json(result);
    } catch (error) {
      console.error("Error fetching OddsBlaze game odds:", error);
      res.status(500).json({ error: "Failed to fetch OddsBlaze game odds" });
    }
  });

  return httpServer;
}
