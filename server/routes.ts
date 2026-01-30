import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBetSlipSchema } from "@shared/schema";
import { z } from "zod";
import { cache } from "./cache";

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

const CACHE_TTL_SPORTS = 60 * 60 * 1000; // 1 hora
const CACHE_TTL_FOOTBALL = 15 * 60 * 1000; // 15 minutos

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Lista de ligas principais para exibir
  const MAIN_LEAGUES = [
    { id: 39, key: "soccer_england_premier_league", title: "Premier League", country: "England" },
    { id: 140, key: "soccer_spain_la_liga", title: "La Liga", country: "Spain" },
    { id: 135, key: "soccer_italy_serie_a", title: "Serie A", country: "Italy" },
    { id: 78, key: "soccer_germany_bundesliga", title: "Bundesliga", country: "Germany" },
    { id: 61, key: "soccer_france_ligue_one", title: "Ligue 1", country: "France" },
    { id: 2, key: "soccer_uefa_champs_league", title: "UEFA Champions League", country: "Europe" },
    { id: 3, key: "soccer_uefa_europa_league", title: "UEFA Europa League", country: "Europe" },
    { id: 71, key: "soccer_brazil_campeonato", title: "Brasileirão Série A", country: "Brazil" },
    { id: 253, key: "soccer_usa_mls", title: "MLS", country: "USA" },
    { id: 94, key: "soccer_portugal_primeira_liga", title: "Primeira Liga", country: "Portugal" },
  ];

  app.get("/api/sports", async (req, res) => {
    try {
      if (!API_FOOTBALL_KEY) {
        return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      }
      
      const cached = cache.get<any[]>("sports");
      if (cached) {
        return res.json(cached);
      }
      
      // Retornar lista de ligas principais (formato compatível com frontend)
      const sports = MAIN_LEAGUES.map(league => ({
        key: league.key,
        active: true,
        group: "Soccer",
        title: league.title,
        description: `${league.title} - ${league.country}`,
        leagueId: league.id
      }));
      
      cache.set("sports", sports, CACHE_TTL_SPORTS);
      res.json(sports);
    } catch (error) {
      console.error("Error fetching sports:", error);
      res.status(500).json({ error: "Failed to fetch sports" });
    }
  });

  app.get("/api/odds/:sportKey", async (req, res) => {
    try {
      if (!API_FOOTBALL_KEY) {
        return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      }
      
      const { sportKey } = req.params;
      const cacheKey = `odds_${sportKey}`;
      
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      // Encontrar o leagueId correspondente ao sportKey
      const league = MAIN_LEAGUES.find(l => l.key === sportKey);
      if (!league) {
        return res.status(404).json({ error: "League not found" });
      }
      
      // Buscar jogos próximos (7 dias)
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Determinar a temporada atual (ligas europeias vão de agosto a maio do ano seguinte)
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth(); // 0-11
      const season = currentMonth >= 7 ? currentYear : currentYear - 1; // Se agosto ou depois, usa ano atual
      
      const fixturesResponse = await fetch(
        `${API_FOOTBALL_BASE}/fixtures?league=${league.id}&season=${season}&from=${today}&to=${nextWeek}`,
        { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
      );
      
      if (!fixturesResponse.ok) {
        const errorText = await fixturesResponse.text();
        console.error("API-Football fixtures error:", errorText);
        return res.status(fixturesResponse.status).json({ error: "Failed to fetch fixtures" });
      }
      
      const fixturesData = await fixturesResponse.json();
      const fixtures = fixturesData.response?.slice(0, 15) || [];
      
      // Buscar odds para cada jogo
      const games = await Promise.all(
        fixtures.map(async (fixture: any) => {
          try {
            const oddsResponse = await fetch(
              `${API_FOOTBALL_BASE}/odds?fixture=${fixture.fixture.id}`,
              { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
            );
            
            let bookmakers: any[] = [];
            if (oddsResponse.ok) {
              const oddsData = await oddsResponse.json();
              const apiBookmakers = oddsData.response?.[0]?.bookmakers || [];
              
              // Converter formato API-Football para formato compatível
              bookmakers = apiBookmakers.slice(0, 2).map((bm: any) => ({
                key: bm.name?.toLowerCase().replace(/\s+/g, '_') || 'unknown',
                title: bm.name || 'Unknown',
                lastUpdate: new Date().toISOString(),
                markets: (bm.bets || []).map((bet: any) => {
                  // Mapear nomes de mercado
                  let marketKey = 'h2h';
                  if (bet.name === 'Match Winner' || bet.name === 'Home/Away') marketKey = 'h2h';
                  else if (bet.name?.includes('Handicap') || bet.name?.includes('Spread')) marketKey = 'spreads';
                  else if (bet.name?.includes('Goals') || bet.name?.includes('Over/Under')) marketKey = 'totals';
                  
                  return {
                    key: marketKey,
                    lastUpdate: new Date().toISOString(),
                    outcomes: (bet.values || []).map((v: any) => ({
                      name: v.value,
                      price: parseFloat(v.odd) || 1.0,
                      point: null,
                    })),
                  };
                }),
              }));
            }
            
            return {
              id: String(fixture.fixture.id),
              sportKey: sportKey,
              sportTitle: league.title,
              commenceTime: fixture.fixture.date,
              homeTeam: fixture.teams.home.name,
              awayTeam: fixture.teams.away.name,
              bookmakers: bookmakers,
            };
          } catch (err) {
            return {
              id: String(fixture.fixture.id),
              sportKey: sportKey,
              sportTitle: league.title,
              commenceTime: fixture.fixture.date,
              homeTeam: fixture.teams.home.name,
              awayTeam: fixture.teams.away.name,
              bookmakers: [],
            };
          }
        })
      );
      
      cache.set(cacheKey, games, CACHE_TTL_FOOTBALL);
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


  return httpServer;
}
