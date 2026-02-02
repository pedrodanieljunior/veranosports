import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBetSlipSchema } from "@shared/schema";
import { z } from "zod";
import { cache } from "./cache";

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const CACHE_TTL_SPORTS = 60 * 60 * 1000; // 1 hora
const CACHE_TTL_ODDS = 10 * 60 * 1000; // 10 minutos
const CACHE_TTL_FOOTBALL = 15 * 60 * 1000; // 15 minutos

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Mapeamento de sport keys da The Odds API para league IDs da API-Football (para mercados extras)
  const LEAGUE_MAPPING: Record<string, number> = {
    "soccer_epl": 39,                           // Premier League
    "soccer_spain_la_liga": 140,                // La Liga
    "soccer_italy_serie_a": 135,                // Serie A
    "soccer_germany_bundesliga": 78,            // Bundesliga
    "soccer_france_ligue_one": 61,              // Ligue 1
    "soccer_uefa_champs_league": 2,             // Champions League
    "soccer_uefa_europa_league": 3,             // Europa League
    "soccer_brazil_campeonato": 71,             // Brasileirão
    "soccer_usa_mls": 253,                      // MLS
    "soccer_portugal_primeira_liga": 94,        // Primeira Liga
    "soccer_efl_champ": 40,                     // Championship
    "soccer_fa_cup": 45,                        // FA Cup
    "soccer_netherlands_eredivisie": 88,        // Eredivisie
    "soccer_turkey_super_league": 203,          // Turkey Super League
    "soccer_belgium_first_div": 144,            // Belgium First Division
  };

  app.get("/api/sports", async (req, res) => {
    try {
      if (!ODDS_API_KEY) {
        return res.status(500).json({ error: "ODDS_API_KEY not configured" });
      }
      
      const cached = cache.get<any[]>("sports");
      if (cached) {
        return res.json(cached);
      }
      
      // Buscar esportes da The Odds API
      const response = await fetch(`${ODDS_API_BASE}/sports?apiKey=${ODDS_API_KEY}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("The Odds API sports error:", errorText);
        return res.status(response.status).json({ error: "Failed to fetch sports" });
      }
      
      const sports = await response.json();
      
      // Filtrar apenas futebol e adicionar leagueId da API-Football para mercados extras
      const soccerSports = sports
        .filter((s: any) => s.group === "Soccer" && s.active)
        .map((s: any) => ({
          ...s,
          leagueId: LEAGUE_MAPPING[s.key] || null
        }));
      
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
      
      // Buscar odds da The Odds API (jogos atuais)
      const oddsUrl = `${ODDS_API_BASE}/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=eu,uk&markets=h2h,spreads,totals&oddsFormat=decimal`;
      const response = await fetch(oddsUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("The Odds API error:", errorText);
        return res.status(response.status).json({ error: "Failed to fetch odds" });
      }
      
      const rawGames = await response.json();
      
      // Log remaining requests
      const remaining = response.headers.get('x-requests-remaining');
      console.log(`The Odds API - Requests remaining: ${remaining}`);
      
      // Transformar para formato esperado pelo frontend (camelCase)
      const games = rawGames.map((game: any) => ({
        id: game.id,
        sportKey: game.sport_key,
        sportTitle: game.sport_title,
        commenceTime: game.commence_time,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        bookmakers: game.bookmakers || []
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
      
      // Determinar a temporada atual (ligas europeias vão de agosto a maio do ano seguinte)
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth(); // 0-11
      const season = currentMonth >= 7 ? currentYear : currentYear - 1; // Se agosto ou depois, usa ano atual
      
      const fixturesResponse = await fetch(
        `${API_FOOTBALL_BASE}/fixtures?league=${leagueId}&season=${season}&from=${today}&to=${nextWeek}`,
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
      
      // Mapeamento de nomes de mercado para português
      const marketLabels: Record<string, string> = {
        "Match Winner": "Resultado Final",
        "Home/Away": "Casa/Fora",
        "Second Half Winner": "Vencedor 2º Tempo",
        "Asian Handicap": "Handicap Asiático",
        "Goals Over/Under": "Total de Gols",
        "Goals Over/Under First Half": "Gols 1º Tempo",
        "HT/FT Double": "Intervalo/Final",
        "Both Teams Score": "Ambas Marcam (BTTS)",
        "Handicap Result": "Resultado com Handicap",
        "Exact Score": "Placar Exato",
        "Highest Scoring Half": "Tempo com Mais Gols",
        "Double Chance": "Dupla Chance",
        "First Half Winner": "Vencedor 1º Tempo",
        "Team To Score First": "Primeira Equipe a Marcar",
        "Team To Score Last": "Última Equipe a Marcar",
        "Total - Home": "Total Gols Casa",
        "Total - Away": "Total Gols Visitante",
        "Handicap Result - First Half": "Handicap 1º Tempo",
        "Asian Handicap First Half": "Handicap Asiático 1º Tempo",
        "Double Chance - First Half": "Dupla Chance 1º Tempo",
        "Odd/Even": "Ímpar/Par",
        "Odd/Even - First Half": "Ímpar/Par 1º Tempo",
        "Results/Both Teams Score": "Resultado + Ambas Marcam",
        "Result/Total Goals": "Resultado + Total Gols",
        "Goals Over/Under - Second Half": "Gols 2º Tempo",
        "Clean Sheet - Home": "Sem Sofrer Gol - Casa",
        "Clean Sheet - Away": "Sem Sofrer Gol - Visitante",
        "Win to Nil - Home": "Vitória sem Sofrer Gol - Casa",
        "Win to Nil - Away": "Vitória sem Sofrer Gol - Visitante",
        "Correct Score - First Half": "Placar Exato 1º Tempo",
        "Win Both Halves": "Vencer Ambos os Tempos",
        "Double Chance - Second Half": "Dupla Chance 2º Tempo",
        "Both Teams Score - First Half": "Ambas Marcam 1º Tempo",
        "Both Teams To Score - Second Half": "Ambas Marcam 2º Tempo",
        "Win To Nil": "Vencer sem Sofrer Gol",
        "Exact Goals Number": "Número Exato de Gols",
        "To Win Either Half": "Vencer um dos Tempos",
        "Home Team Exact Goals Number": "Gols Exatos Casa",
        "Away Team Exact Goals Number": "Gols Exatos Visitante",
        "Home Team Score a Goal": "Casa Marca",
        "Away Team Score a Goal": "Visitante Marca",
        "Corners Over Under": "Total de Escanteios",
        "Winning Margin": "Margem de Vitória",
        "Total Goals/Both Teams To Score": "Total Gols + Ambas Marcam",
        "Goal Line": "Linha de Gols",
        "Corners 1x2": "Escanteios 1x2",
        "Corners Asian Handicap": "Escanteios Handicap Asiático",
        "Cards Over/Under": "Total de Cartões",
        "First Corner": "Primeiro Escanteio",
        "Last Corner": "Último Escanteio",
        "To Qualify": "Classificação"
      };
      
      // Retornar TODOS os mercados disponíveis (329 mercados da API-Football)
      const markets = bookmaker.bets.map((bet: any) => ({
        id: bet.id,
        name: bet.name,
        label: marketLabels[bet.name] || bet.name,
        values: bet.values?.map((v: any) => ({
          value: v.value,
          odd: parseFloat(v.odd)
        })) || []
      }));
      
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


  return httpServer;
}
