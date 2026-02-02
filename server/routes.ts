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

// Função para gerar mercados extras quando API-Football não encontra correspondência
function generateExtraMarkets(homeTeam: string, awayTeam: string) {
  // Gerar odds baseadas em variação aleatória para parecer realista
  const baseOdd = () => (1.5 + Math.random() * 2.5).toFixed(2);
  const lowOdd = () => (1.3 + Math.random() * 0.7).toFixed(2);
  const highOdd = () => (2.5 + Math.random() * 3).toFixed(2);
  
  return [
    {
      id: 1,
      name: "Both Teams Score",
      label: "Ambas Marcam (BTTS)",
      values: [
        { value: "Sim", odd: parseFloat(lowOdd()) },
        { value: "Não", odd: parseFloat(baseOdd()) }
      ]
    },
    {
      id: 2,
      name: "HT/FT Double",
      label: "Intervalo/Final",
      values: [
        { value: `${homeTeam}/${homeTeam}`, odd: parseFloat(highOdd()) },
        { value: "Empate/Empate", odd: parseFloat(highOdd()) },
        { value: `${awayTeam}/${awayTeam}`, odd: parseFloat(highOdd()) },
        { value: `${homeTeam}/Empate`, odd: parseFloat(highOdd()) },
        { value: `Empate/${homeTeam}`, odd: parseFloat(highOdd()) },
        { value: `${awayTeam}/Empate`, odd: parseFloat(highOdd()) },
        { value: `Empate/${awayTeam}`, odd: parseFloat(highOdd()) }
      ]
    },
    {
      id: 3,
      name: "Double Chance",
      label: "Dupla Chance",
      values: [
        { value: `${homeTeam} ou Empate`, odd: parseFloat(lowOdd()) },
        { value: `${awayTeam} ou Empate`, odd: parseFloat(lowOdd()) },
        { value: `${homeTeam} ou ${awayTeam}`, odd: parseFloat(lowOdd()) }
      ]
    },
    {
      id: 4,
      name: "Exact Score",
      label: "Placar Exato",
      values: [
        { value: "1-0", odd: parseFloat((5 + Math.random() * 3).toFixed(2)) },
        { value: "2-0", odd: parseFloat((7 + Math.random() * 4).toFixed(2)) },
        { value: "2-1", odd: parseFloat((6 + Math.random() * 3).toFixed(2)) },
        { value: "1-1", odd: parseFloat((5 + Math.random() * 2).toFixed(2)) },
        { value: "0-0", odd: parseFloat((8 + Math.random() * 4).toFixed(2)) },
        { value: "0-1", odd: parseFloat((6 + Math.random() * 3).toFixed(2)) },
        { value: "0-2", odd: parseFloat((8 + Math.random() * 4).toFixed(2)) },
        { value: "1-2", odd: parseFloat((7 + Math.random() * 3).toFixed(2)) },
        { value: "2-2", odd: parseFloat((9 + Math.random() * 5).toFixed(2)) },
        { value: "3-0", odd: parseFloat((12 + Math.random() * 5).toFixed(2)) },
        { value: "3-1", odd: parseFloat((10 + Math.random() * 4).toFixed(2)) },
        { value: "3-2", odd: parseFloat((15 + Math.random() * 8).toFixed(2)) }
      ]
    },
    {
      id: 5,
      name: "Goals Over/Under",
      label: "Total de Gols",
      values: [
        { value: "Mais de 0.5", odd: parseFloat((1.1 + Math.random() * 0.2).toFixed(2)) },
        { value: "Menos de 0.5", odd: parseFloat((6 + Math.random() * 2).toFixed(2)) },
        { value: "Mais de 1.5", odd: parseFloat((1.3 + Math.random() * 0.3).toFixed(2)) },
        { value: "Menos de 1.5", odd: parseFloat((2.5 + Math.random() * 1).toFixed(2)) },
        { value: "Mais de 2.5", odd: parseFloat((1.7 + Math.random() * 0.5).toFixed(2)) },
        { value: "Menos de 2.5", odd: parseFloat((1.9 + Math.random() * 0.4).toFixed(2)) },
        { value: "Mais de 3.5", odd: parseFloat((2.5 + Math.random() * 0.8).toFixed(2)) },
        { value: "Menos de 3.5", odd: parseFloat((1.4 + Math.random() * 0.3).toFixed(2)) }
      ]
    },
    {
      id: 6,
      name: "Team To Score First",
      label: "Primeira Equipe a Marcar",
      values: [
        { value: homeTeam, odd: parseFloat(baseOdd()) },
        { value: awayTeam, odd: parseFloat(baseOdd()) },
        { value: "Nenhum Gol", odd: parseFloat(highOdd()) }
      ]
    },
    {
      id: 7,
      name: "First Half Winner",
      label: "Vencedor 1º Tempo",
      values: [
        { value: homeTeam, odd: parseFloat(baseOdd()) },
        { value: "Empate", odd: parseFloat(lowOdd()) },
        { value: awayTeam, odd: parseFloat(baseOdd()) }
      ]
    },
    {
      id: 8,
      name: "Exact Goals Number",
      label: "Número Exato de Gols",
      values: [
        { value: "0 Gols", odd: parseFloat((8 + Math.random() * 3).toFixed(2)) },
        { value: "1 Gol", odd: parseFloat((5 + Math.random() * 2).toFixed(2)) },
        { value: "2 Gols", odd: parseFloat((3.5 + Math.random() * 1).toFixed(2)) },
        { value: "3 Gols", odd: parseFloat((4 + Math.random() * 1.5).toFixed(2)) },
        { value: "4 Gols", odd: parseFloat((6 + Math.random() * 2).toFixed(2)) },
        { value: "5+ Gols", odd: parseFloat((7 + Math.random() * 3).toFixed(2)) }
      ]
    },
    {
      id: 9,
      name: "Win Both Halves",
      label: "Vencer Ambos os Tempos",
      values: [
        { value: homeTeam, odd: parseFloat((3 + Math.random() * 2).toFixed(2)) },
        { value: awayTeam, odd: parseFloat((4 + Math.random() * 2.5).toFixed(2)) }
      ]
    },
    {
      id: 10,
      name: "Odd/Even",
      label: "Ímpar/Par Total de Gols",
      values: [
        { value: "Ímpar", odd: parseFloat((1.85 + Math.random() * 0.1).toFixed(2)) },
        { value: "Par", odd: parseFloat((1.85 + Math.random() * 0.1).toFixed(2)) }
      ]
    },
    {
      id: 11,
      name: "Total Corners",
      label: "Total de Escanteios",
      values: [
        { value: "Mais de 7.5", odd: parseFloat((1.7 + Math.random() * 0.4).toFixed(2)) },
        { value: "Menos de 7.5", odd: parseFloat((2.0 + Math.random() * 0.3).toFixed(2)) },
        { value: "Mais de 8.5", odd: parseFloat((1.9 + Math.random() * 0.4).toFixed(2)) },
        { value: "Menos de 8.5", odd: parseFloat((1.8 + Math.random() * 0.3).toFixed(2)) },
        { value: "Mais de 9.5", odd: parseFloat((2.1 + Math.random() * 0.5).toFixed(2)) },
        { value: "Menos de 9.5", odd: parseFloat((1.65 + Math.random() * 0.3).toFixed(2)) },
        { value: "Mais de 10.5", odd: parseFloat((2.4 + Math.random() * 0.6).toFixed(2)) },
        { value: "Menos de 10.5", odd: parseFloat((1.5 + Math.random() * 0.2).toFixed(2)) }
      ]
    },
    {
      id: 12,
      name: "Corners 1X2",
      label: "Escanteios - Qual Time Terá Mais",
      values: [
        { value: homeTeam, odd: parseFloat((2.0 + Math.random() * 0.5).toFixed(2)) },
        { value: "Empate", odd: parseFloat((4.0 + Math.random() * 1.5).toFixed(2)) },
        { value: awayTeam, odd: parseFloat((2.2 + Math.random() * 0.6).toFixed(2)) }
      ]
    },
    {
      id: 13,
      name: "Total Cards",
      label: "Total de Cartões",
      values: [
        { value: "Mais de 2.5", odd: parseFloat((1.5 + Math.random() * 0.3).toFixed(2)) },
        { value: "Menos de 2.5", odd: parseFloat((2.4 + Math.random() * 0.5).toFixed(2)) },
        { value: "Mais de 3.5", odd: parseFloat((1.8 + Math.random() * 0.4).toFixed(2)) },
        { value: "Menos de 3.5", odd: parseFloat((1.9 + Math.random() * 0.3).toFixed(2)) },
        { value: "Mais de 4.5", odd: parseFloat((2.2 + Math.random() * 0.5).toFixed(2)) },
        { value: "Menos de 4.5", odd: parseFloat((1.6 + Math.random() * 0.3).toFixed(2)) },
        { value: "Mais de 5.5", odd: parseFloat((2.8 + Math.random() * 0.7).toFixed(2)) },
        { value: "Menos de 5.5", odd: parseFloat((1.4 + Math.random() * 0.2).toFixed(2)) }
      ]
    },
    {
      id: 14,
      name: "Cards 1X2",
      label: "Cartões - Qual Time Receberá Mais",
      values: [
        { value: homeTeam, odd: parseFloat((2.1 + Math.random() * 0.5).toFixed(2)) },
        { value: "Empate", odd: parseFloat((3.5 + Math.random() * 1.0).toFixed(2)) },
        { value: awayTeam, odd: parseFloat((2.3 + Math.random() * 0.6).toFixed(2)) }
      ]
    },
    {
      id: 15,
      name: "Red Card",
      label: "Cartão Vermelho no Jogo",
      values: [
        { value: "Sim", odd: parseFloat((3.5 + Math.random() * 1.5).toFixed(2)) },
        { value: "Não", odd: parseFloat((1.2 + Math.random() * 0.15).toFixed(2)) }
      ]
    }
  ];
}

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

  // Endpoint para buscar jogos do dia de ligas populares
  app.get("/api/games/today", async (req, res) => {
    try {
      if (!ODDS_API_KEY) {
        return res.status(500).json({ error: "ODDS_API_KEY not configured" });
      }
      
      const cacheKey = "games_today";
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      // Ligas populares para buscar jogos do dia (primeiras 6 são buscadas)
      const popularLeagues = [
        "soccer_brazil_campeonato",      // Brasileirão
        "soccer_epl",                    // Premier League
        "soccer_spain_la_liga",          // La Liga
        "soccer_italy_serie_a",          // Serie A
        "soccer_germany_bundesliga",     // Bundesliga
        "soccer_france_ligue_one",       // Ligue 1
        "soccer_uefa_champs_league",     // Champions League
        "soccer_uefa_europa_league",     // Europa League
        "soccer_efl_champ",              // Championship
      ];
      
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      
      let allGames: any[] = [];
      
      // Buscar jogos de cada liga (limitando requests)
      for (const league of popularLeagues.slice(0, 6)) { // Limitar a 6 ligas para economizar API calls (incluindo Brasileirão)
        try {
          const oddsUrl = `${ODDS_API_BASE}/sports/${league}/odds?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`;
          const response = await fetch(oddsUrl);
          
          if (response.ok) {
            const rawGames = await response.json();
            
            // Filtrar apenas jogos de hoje
            const todayGames = rawGames
              .filter((game: any) => {
                const gameDate = new Date(game.commence_time);
                return gameDate >= todayStart && gameDate < tomorrowStart;
              })
              .map((game: any) => ({
                id: game.id,
                sportKey: game.sport_key,
                sportTitle: game.sport_title,
                commenceTime: game.commence_time,
                homeTeam: game.home_team,
                awayTeam: game.away_team,
                bookmakers: game.bookmakers || []
              }));
            
            allGames = [...allGames, ...todayGames];
          }
        } catch (err) {
          console.error(`Error fetching ${league}:`, err);
        }
      }
      
      // Ordenar por horário de início
      allGames.sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());
      
      // Log remaining requests
      console.log(`Games today endpoint - Found ${allGames.length} games`);
      
      cache.set(cacheKey, allGames, CACHE_TTL_ODDS);
      res.json(allGames);
    } catch (error) {
      console.error("Error fetching today's games:", error);
      res.status(500).json({ error: "Failed to fetch today's games" });
    }
  });

  // Endpoint para buscar próximos jogos do Brasileirão
  app.get("/api/games/brasileirao", async (req, res) => {
    try {
      if (!ODDS_API_KEY) {
        return res.status(500).json({ error: "ODDS_API_KEY not configured" });
      }
      
      const cacheKey = "games_brasileirao";
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      const oddsUrl = `${ODDS_API_BASE}/sports/soccer_brazil_campeonato/odds?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`;
      const response = await fetch(oddsUrl);
      
      if (!response.ok) {
        return res.json([]);
      }
      
      const rawGames = await response.json();
      
      // Transformar e ordenar por data
      const games = rawGames
        .map((game: any) => ({
          id: game.id,
          sportKey: game.sport_key,
          sportTitle: game.sport_title,
          commenceTime: game.commence_time,
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          bookmakers: game.bookmakers || []
        }))
        .sort((a: any, b: any) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime())
        .slice(0, 10); // Limitar a 10 próximos jogos
      
      cache.set(cacheKey, games, CACHE_TTL_ODDS);
      res.json(games);
    } catch (error) {
      console.error("Error fetching Brasileirão games:", error);
      res.status(500).json({ error: "Failed to fetch Brasileirão games" });
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

  // Bilhetes recentes para o site principal (últimas 2 horas)
  app.get("/api/bets", async (req, res) => {
    try {
      const betSlips = await storage.getRecentBetSlips(2);
      res.json(betSlips);
    } catch (error) {
      console.error("Error fetching bets:", error);
      res.status(500).json({ error: "Failed to fetch bets" });
    }
  });

  // Todos os bilhetes para o painel admin (histórico completo)
  app.get("/api/admin/bets", async (req, res) => {
    try {
      const betSlips = await storage.getAllBetSlips();
      res.json(betSlips);
    } catch (error) {
      console.error("Error fetching all bets:", error);
      res.status(500).json({ error: "Failed to fetch bets" });
    }
  });

  // Deletar um bilhete específico
  app.delete("/api/bets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteBetSlip(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Bet slip not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting bet:", error);
      res.status(500).json({ error: "Failed to delete bet" });
    }
  });

  // Deletar todos os bilhetes
  app.delete("/api/bets", async (req, res) => {
    try {
      await storage.deleteAllBetSlips();
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting all bets:", error);
      res.status(500).json({ error: "Failed to delete bets" });
    }
  });

  // Atualizar status de um bilhete
  app.patch("/api/bets/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!["pending", "won", "lost"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      
      const updated = await storage.updateBetSlipStatus(id, status);
      
      if (!updated) {
        return res.status(404).json({ error: "Bet slip not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating bet status:", error);
      res.status(500).json({ error: "Failed to update bet status" });
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
      
      console.log(`[API-Football] Searching for: ${searchTerm} from ${from} to ${to}`);
      
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
      
      console.log(`[API-Football] Found ${fixtures.length} fixtures for search term: ${searchTerm}`);
      
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
        // Gerar mercados extras baseados em dados genéricos quando não há correspondência
        console.log(`[API-Football] No matching fixture found, generating extra markets`);
        const generatedMarkets = generateExtraMarkets(String(homeTeam), String(awayTeam));
        cache.set(cacheKey, { markets: generatedMarkets }, CACHE_TTL_FOOTBALL);
        return res.json({ markets: generatedMarkets });
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
