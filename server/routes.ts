import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBetSlipSchema } from "@shared/schema";
import { z } from "zod";
import { cache } from "./cache";
import QRCode from "qrcode";

// Configuração PIX - telefone com código do país
const PIX_KEY = "+5592993848238";
const PIX_NAME = "WENDELL SILVA DE SOUZA";
const PIX_CITY = "SAO PAULO";

// Gerar payload PIX EMV (formato BRCode)
function generatePixPayload(value: number, txId: string): string {
  const formatField = (id: string, value: string) => {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
  };

  // Remover caracteres especiais do txId (apenas alfanuméricos)
  const cleanTxId = txId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25);

  // Merchant Account Information (GUI + chave PIX)
  const gui = formatField("00", "BR.GOV.BCB.PIX");
  const key = formatField("01", PIX_KEY);
  const merchantAccountInfo = gui + key;
  const merchantAccount = formatField("26", merchantAccountInfo);

  // Campos do payload
  const payloadFormat = formatField("00", "01"); // Payload Format Indicator
  const merchantCat = formatField("52", "0000"); // Merchant Category Code
  const transactionCurrency = formatField("53", "986"); // Currency = BRL
  const transactionAmount = formatField("54", value.toFixed(2));
  const countryCode = formatField("58", "BR");
  
  // Nome sem acentos, máximo 25 caracteres
  const cleanName = PIX_NAME.normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 25);
  const merchantName = formatField("59", cleanName);
  
  // Cidade sem acentos, máximo 15 caracteres
  const cleanCity = PIX_CITY.normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 15);
  const merchantCity = formatField("60", cleanCity);
  
  // Additional Data Field Template (txid)
  const txIdField = formatField("05", cleanTxId);
  const additionalData = formatField("62", txIdField);

  // Montar payload sem CRC
  const payloadWithoutCRC = payloadFormat + merchantAccount + merchantCat + 
    transactionCurrency + transactionAmount + countryCode + 
    merchantName + merchantCity + additionalData + "6304";

  // Calcular CRC16-CCITT (XModem)
  const crc = calculateCRC16(payloadWithoutCRC);
  
  return payloadWithoutCRC + crc;
}

function calculateCRC16(payload: string): string {
  let crc = 0xFFFF;
  const polynomial = 0x1021;

  const bytes = Buffer.from(payload, 'utf8');
  
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

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
      const cacheKey = "games_today";
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      let allGames: any[] = [];
      let useApiFootball = false;
      
      // Tentar The Odds API primeiro
      if (ODDS_API_KEY) {
        const popularLeagues = [
          "soccer_brazil_campeonato",
          "soccer_epl",
          "soccer_spain_la_liga",
          "soccer_italy_serie_a",
          "soccer_germany_bundesliga",
          "soccer_france_ligue_one",
        ];
        
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        
        for (const league of popularLeagues.slice(0, 3)) {
          try {
            const oddsUrl = `${ODDS_API_BASE}/sports/${league}/odds?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`;
            const response = await fetch(oddsUrl);
            
            if (response.status === 401) {
              console.log("The Odds API quota exceeded, switching to API-Football");
              useApiFootball = true;
              break;
            }
            
            if (response.ok) {
              const rawGames = await response.json();
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
      } else {
        useApiFootball = true;
      }
      
      // Usar API-Football se The Odds API falhou ou não tem jogos
      if ((useApiFootball || allGames.length === 0) && API_FOOTBALL_KEY) {
        console.log("Using API-Football for today's games");
        
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        const europeanSeason = currentMonth >= 7 ? currentYear : currentYear - 1;
        const brazilianSeason = currentYear;
        
        const footballLeagues = [
          { id: 71, name: "Brasileirão Série A", season: brazilianSeason },
          { id: 39, name: "Premier League", season: europeanSeason },
          { id: 140, name: "La Liga", season: europeanSeason },
          { id: 135, name: "Serie A", season: europeanSeason },
          { id: 78, name: "Bundesliga", season: europeanSeason },
          { id: 61, name: "Ligue 1", season: europeanSeason },
        ];
        
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        for (const league of footballLeagues.slice(0, 5)) {
          try {
            const fixturesResponse = await fetch(
              `${API_FOOTBALL_BASE}/fixtures?league=${league.id}&season=${league.season}&from=${today}&to=${nextWeek}`,
              { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
            );
            
            if (fixturesResponse.ok) {
              const fixturesData = await fixturesResponse.json();
              const fixtures = fixturesData.response || [];
              
              const gamesWithOdds = await Promise.all(
                fixtures.slice(0, 5).map(async (fixture: any) => {
                  let bookmakers: any[] = [];
                  
                  try {
                    const oddsResponse = await fetch(
                      `${API_FOOTBALL_BASE}/odds?fixture=${fixture.fixture.id}`,
                      { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
                    );
                    
                    if (oddsResponse.ok) {
                      const oddsData = await oddsResponse.json();
                      const bets = oddsData.response?.[0]?.bookmakers?.[0]?.bets || [];
                      
                      const h2h = bets.find((b: any) => b.name === "Match Winner");
                      if (h2h) {
                        bookmakers = [{
                          key: "api-football",
                          title: "API-Football",
                          markets: [{
                            key: "h2h",
                            outcomes: h2h.values.map((v: any) => ({
                              name: v.value === "Home" ? fixture.teams.home.name : 
                                    v.value === "Away" ? fixture.teams.away.name : "Empate",
                              price: parseFloat(v.odd)
                            }))
                          }]
                        }];
                      }
                    }
                  } catch (err) {
                    console.error("Error fetching odds:", err);
                  }
                  
                  return {
                    id: `api-football-${fixture.fixture.id}`,
                    sportKey: `soccer_${league.name.toLowerCase().replace(/\s+/g, '_')}`,
                    sportTitle: league.name,
                    commenceTime: fixture.fixture.date,
                    homeTeam: fixture.teams.home.name,
                    awayTeam: fixture.teams.away.name,
                    bookmakers
                  };
                })
              );
              
              allGames = [...allGames, ...gamesWithOdds];
            }
          } catch (err) {
            console.error(`Error fetching football league ${league.id}:`, err);
          }
        }
      }
      
      allGames.sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());
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
      const { sportKey } = req.params;
      const cacheKey = `odds_${sportKey}`;
      
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      let games: any[] = [];
      let useApiFootball = false;
      
      // Tentar The Odds API primeiro
      if (ODDS_API_KEY) {
        const oddsUrl = `${ODDS_API_BASE}/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY}&regions=eu,uk&markets=h2h,spreads,totals&oddsFormat=decimal`;
        const response = await fetch(oddsUrl);
        
        if (response.status === 401) {
          console.log("The Odds API quota exceeded for sport, switching to API-Football");
          useApiFootball = true;
        } else if (response.ok) {
          const rawGames = await response.json();
          const remaining = response.headers.get('x-requests-remaining');
          console.log(`The Odds API - Requests remaining: ${remaining}`);
          
          games = rawGames.map((game: any) => ({
            id: game.id,
            sportKey: game.sport_key,
            sportTitle: game.sport_title,
            commenceTime: game.commence_time,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            bookmakers: game.bookmakers || []
          }));
        } else {
          useApiFootball = true;
        }
      } else {
        useApiFootball = true;
      }
      
      // Usar API-Football como fallback
      if ((useApiFootball || games.length === 0) && API_FOOTBALL_KEY) {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        const europeanSeason = currentMonth >= 7 ? currentYear : currentYear - 1;
        const brazilianSeason = currentYear;
        
        const leagueMapping: Record<string, { id: number; name: string; season: number }> = {
          "soccer_brazil_campeonato": { id: 71, name: "Brasileirão Série A", season: brazilianSeason },
          "soccer_epl": { id: 39, name: "Premier League", season: europeanSeason },
          "soccer_spain_la_liga": { id: 140, name: "La Liga", season: europeanSeason },
          "soccer_italy_serie_a": { id: 135, name: "Serie A", season: europeanSeason },
          "soccer_germany_bundesliga": { id: 78, name: "Bundesliga", season: europeanSeason },
          "soccer_france_ligue_one": { id: 61, name: "Ligue 1", season: europeanSeason },
          "soccer_uefa_champs_league": { id: 2, name: "Champions League", season: europeanSeason },
          "soccer_uefa_europa_league": { id: 3, name: "Europa League", season: europeanSeason },
          "soccer_portugal_primeira_liga": { id: 94, name: "Primeira Liga", season: europeanSeason },
          "soccer_netherlands_eredivisie": { id: 88, name: "Eredivisie", season: europeanSeason },
        };
        
        const league = leagueMapping[sportKey];
        if (league) {
          console.log(`Using API-Football for ${sportKey}`);
          
          const today = new Date().toISOString().split('T')[0];
          const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          
          try {
            const fixturesResponse = await fetch(
              `${API_FOOTBALL_BASE}/fixtures?league=${league.id}&season=${league.season}&from=${today}&to=${nextWeek}`,
              { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
            );
            
            if (fixturesResponse.ok) {
              const fixturesData = await fixturesResponse.json();
              const fixtures = fixturesData.response?.slice(0, 15) || [];
              
              games = await Promise.all(
                fixtures.map(async (fixture: any) => {
                  let bookmakers: any[] = [];
                  
                  try {
                    const oddsResponse = await fetch(
                      `${API_FOOTBALL_BASE}/odds?fixture=${fixture.fixture.id}`,
                      { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
                    );
                    
                    if (oddsResponse.ok) {
                      const oddsData = await oddsResponse.json();
                      const bets = oddsData.response?.[0]?.bookmakers?.[0]?.bets || [];
                      
                      const h2h = bets.find((b: any) => b.name === "Match Winner");
                      if (h2h) {
                        bookmakers = [{
                          key: "api-football",
                          title: "API-Football",
                          markets: [{
                            key: "h2h",
                            outcomes: h2h.values.map((v: any) => ({
                              name: v.value === "Home" ? fixture.teams.home.name : 
                                    v.value === "Away" ? fixture.teams.away.name : "Empate",
                              price: parseFloat(v.odd)
                            }))
                          }]
                        }];
                      }
                    }
                  } catch (err) {
                    console.error("Error fetching fixture odds:", err);
                  }
                  
                  return {
                    id: `api-football-${fixture.fixture.id}`,
                    sportKey: sportKey,
                    sportTitle: league.name,
                    commenceTime: fixture.fixture.date,
                    homeTeam: fixture.teams.home.name,
                    awayTeam: fixture.teams.away.name,
                    bookmakers
                  };
                })
              );
            }
          } catch (err) {
            console.error("Error fetching from API-Football:", err);
          }
        }
      }
      
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
      
      // Gerar QR Code PIX com valor da aposta
      const txId = betSlip.id.replace(/-/g, '').substring(0, 25);
      const pixPayload = generatePixPayload(betSlip.stake, txId);
      const qrCodeDataUrl = await QRCode.toDataURL(pixPayload, { 
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      
      res.status(201).json({
        ...betSlip,
        pixCode: pixPayload,
        pixQrCode: qrCodeDataUrl
      });
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

  // Bilhetes recentes para o site principal (últimos 10 minutos)
  app.get("/api/bets", async (req, res) => {
    try {
      const betSlips = await storage.getRecentBetSlips(10 / 60);
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

  // Admin: Verificar resultados e atualizar bilhetes automaticamente
  app.post("/api/admin/check-results", async (req, res) => {
    try {
      if (!API_FOOTBALL_KEY) {
        return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      }

      // Buscar todos os bilhetes pendentes
      const allBets = await storage.getAllBetSlips();
      const pendingBets = allBets.filter(bet => bet.status === "pending");

      if (pendingBets.length === 0) {
        return res.json({ message: "Nenhum bilhete pendente", updated: 0 });
      }

      // Encontrar a data mais antiga e mais recente dos jogos nos bilhetes pendentes
      const today = new Date();
      let oldestGameDate = today;
      let newestGameDate = new Date(0);
      
      for (const bet of pendingBets) {
        for (const selection of bet.selections) {
          if (selection.commenceTime) {
            const gameDate = new Date(selection.commenceTime);
            if (gameDate < oldestGameDate) oldestGameDate = gameDate;
            if (gameDate > newestGameDate) newestGameDate = gameDate;
          }
        }
      }
      
      // Se não encontrou datas válidas, usa os últimos 30 dias
      if (newestGameDate.getTime() === 0) {
        newestGameDate = today;
        oldestGameDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      
      // Adicionar margem de 1 dia antes e depois
      const fromDate = new Date(oldestGameDate.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const toDate = new Date(Math.min(newestGameDate.getTime() + 24 * 60 * 60 * 1000, today.getTime())).toISOString().split('T')[0];
      
      console.log(`Buscando resultados de ${fromDate} até ${toDate}`);
      
      // Determinar a temporada com base na data mais antiga do jogo
      const oldestYear = oldestGameDate.getFullYear();
      const oldestMonth = oldestGameDate.getMonth();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      
      // Temporada europeia começa em agosto
      const oldEuropeanSeason = oldestMonth < 7 ? oldestYear - 1 : oldestYear;
      const currentEuropeanSeason = currentMonth < 7 ? currentYear - 1 : currentYear;
      
      // Para o Brasileirão usar o ano correto (temporada = ano do calendário)
      const oldBrazilianSeason = oldestYear;
      const currentBrazilianSeason = currentYear;

      // Buscar resultados de todas as ligas principais - incluir múltiplas temporadas se necessário
      const leaguesToCheck: {id: number, season: number}[] = [];
      
      // Adicionar temporadas europeias
      const europeanLeagues = [39, 40, 140, 135, 78, 61]; // Premier, Championship, La Liga, Serie A, Bundesliga, Ligue 1
      for (const leagueId of europeanLeagues) {
        leaguesToCheck.push({ id: leagueId, season: currentEuropeanSeason });
        if (oldEuropeanSeason !== currentEuropeanSeason) {
          leaguesToCheck.push({ id: leagueId, season: oldEuropeanSeason });
        }
      }
      
      // Adicionar temporadas brasileiras
      leaguesToCheck.push({ id: 71, season: currentBrazilianSeason });
      if (oldBrazilianSeason !== currentBrazilianSeason) {
        leaguesToCheck.push({ id: 71, season: oldBrazilianSeason });
      }
      
      const leagues = leaguesToCheck;
      
      let allFinishedFixtures: any[] = [];
      
      for (const league of leagues) {
        try {
          const response = await fetch(
            `${API_FOOTBALL_BASE}/fixtures?league=${league.id}&season=${league.season}&from=${fromDate}&to=${toDate}&status=FT`,
            { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
          );
          
          if (response.ok) {
            const data = await response.json();
            console.log(`Liga ${league.id} temporada ${league.season}: ${data.response?.length || 0} jogos`);
            if (data.response) {
              allFinishedFixtures = [...allFinishedFixtures, ...data.response];
            }
          }
        } catch (err) {
          console.log(`Erro ao buscar liga ${league.id}:`, err);
        }
      }

      let updatedCount = 0;
      const results: any[] = [];

      // Verificar cada bilhete pendente
      for (const bet of pendingBets) {
        let allSelectionsResolved = true;
        let allSelectionsWon = true;
        let selectionsUpdated = false;
        
        console.log(`Processando bilhete ${bet.id} com ${bet.selections.length} seleções`);

        for (const selection of bet.selections) {
          console.log(`  Seleção: ${selection.homeTeam} vs ${selection.awayTeam} - resultado atual: ${selection.result}`);
          
          // Pular seleções que já têm resultado definido
          if (selection.result && selection.result !== "pending") {
            if (selection.result === "lost") allSelectionsWon = false;
            continue;
          }

          // Tentar encontrar o jogo correspondente nos resultados
          const matchingFixture = allFinishedFixtures.find((fixture: any) => {
            const homeMatch = teamsMatch(fixture.teams.home.name, selection.homeTeam);
            const awayMatch = teamsMatch(fixture.teams.away.name, selection.awayTeam);
            
            if (homeMatch && awayMatch) {
              console.log(`    Match encontrado: ${fixture.teams.home.name} vs ${fixture.teams.away.name} (${fixture.goals.home}-${fixture.goals.away})`);
            }
            return homeMatch && awayMatch;
          });

          if (!matchingFixture) {
            // Jogo ainda não terminou ou não encontrado
            console.log(`    Nenhum match encontrado para ${selection.homeTeam} vs ${selection.awayTeam}`);
            allSelectionsResolved = false;
            continue;
          }

          const homeGoals = matchingFixture.goals.home;
          const awayGoals = matchingFixture.goals.away;
          const totalGoals = homeGoals + awayGoals;
          
          // Dados do primeiro tempo (halftime)
          const htHomeGoals = matchingFixture.score?.halftime?.home ?? null;
          const htAwayGoals = matchingFixture.score?.halftime?.away ?? null;

          // Verificar se a seleção ganhou baseado no tipo de mercado
          const selectionWon = checkSelectionResult(
            selection,
            homeGoals,
            awayGoals,
            totalGoals,
            matchingFixture.teams.home.name,
            matchingFixture.teams.away.name,
            htHomeGoals,
            htAwayGoals
          );

          // Atualizar o resultado da seleção individual
          const selectionResult = selectionWon ? "won" : "lost";
          await storage.updateSelectionResult(bet.id, selection.id, selectionResult);
          selectionsUpdated = true;
          
          console.log(`Seleção ${selection.homeTeam} vs ${selection.awayTeam}: ${selectionResult} (${homeGoals}-${awayGoals})`);

          if (!selectionWon) {
            allSelectionsWon = false;
          }
        }

        // Se todos os jogos terminaram, atualizar o status do bilhete
        if (allSelectionsResolved) {
          const newStatus = allSelectionsWon ? "won" : "lost";
          await storage.updateBetSlipStatus(bet.id, newStatus);
          updatedCount++;
          results.push({
            betId: bet.id,
            oldStatus: "pending",
            newStatus,
            stake: bet.stake,
            potentialWin: bet.potentialWin
          });
        } else if (selectionsUpdated) {
          // Mesmo que nem todos os jogos terminaram, registrar que houve atualização parcial
          results.push({
            betId: bet.id,
            oldStatus: "pending",
            newStatus: "pending (parcial)",
            stake: bet.stake,
            potentialWin: bet.potentialWin,
            note: "Algumas seleções atualizadas, aguardando outros jogos"
          });
        }
      }

      res.json({
        message: `Verificação concluída`,
        totalPending: pendingBets.length,
        updated: updatedCount,
        fixturesChecked: allFinishedFixtures.length,
        results
      });
    } catch (error) {
      console.error("Error checking results:", error);
      res.status(500).json({ error: "Erro ao verificar resultados" });
    }
  });

  // Admin: Atualizar status de um bilhete manualmente
  app.patch("/api/admin/bets/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["pending", "won", "lost"].includes(status)) {
        return res.status(400).json({ error: "Status inválido" });
      }

      const updated = await storage.updateBetSlipStatus(id, status);
      if (!updated) {
        return res.status(404).json({ error: "Bilhete não encontrado" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating bet status:", error);
      res.status(500).json({ error: "Erro ao atualizar status" });
    }
  });

  // Admin: Atualizar resultado de uma seleção individual
  app.patch("/api/admin/bets/:betId/selections/:selectionId", async (req, res) => {
    try {
      const { betId, selectionId } = req.params;
      const { result } = req.body;

      if (!["pending", "won", "lost"].includes(result)) {
        return res.status(400).json({ error: "Resultado inválido" });
      }

      const updated = await storage.updateSelectionResult(betId, selectionId, result);
      if (!updated) {
        return res.status(404).json({ error: "Bilhete ou seleção não encontrada" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating selection result:", error);
      res.status(500).json({ error: "Erro ao atualizar resultado" });
    }
  });

  // Admin: Resetar e reverificar um bilhete
  app.post("/api/admin/bets/:id/recheck", async (req, res) => {
    try {
      const { id } = req.params;
      const bet = await storage.getBetSlip(id);
      
      if (!bet) {
        return res.status(404).json({ error: "Bilhete não encontrado" });
      }

      // Resetar todas as seleções para pending
      for (const selection of bet.selections) {
        await storage.updateSelectionResult(id, selection.id, "pending");
      }
      
      // Resetar status do bilhete para pending
      await storage.updateBetSlipStatus(id, "pending");

      res.json({ 
        message: "Bilhete resetado para pendente. Use 'Verificar Resultados' para reverificar.",
        betId: id
      });
    } catch (error) {
      console.error("Error resetting bet:", error);
      res.status(500).json({ error: "Erro ao resetar bilhete" });
    }
  });

  // Admin: Atualizar status de verificação (pagamento confirmado)
  app.patch("/api/admin/bets/:id/verified", async (req, res) => {
    try {
      const { id } = req.params;
      const { verified } = req.body;

      if (typeof verified !== "boolean") {
        return res.status(400).json({ error: "Valor de verificação inválido" });
      }

      const updated = await storage.updateBetSlipVerified(id, verified);
      if (!updated) {
        return res.status(404).json({ error: "Bilhete não encontrado" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating verification status:", error);
      res.status(500).json({ error: "Erro ao atualizar verificação" });
    }
  });

  return httpServer;
}

// Mapeamento de aliases de times para normalização
const teamAliases: Record<string, string[]> = {
  "bragantino": ["rb bragantino", "bragantino-sp", "bragantino sp", "red bull bragantino"],
  "atletico-mg": ["atletico mineiro", "atletico-mg", "atletico mg", "galo", "cam"],
  "atletico-pr": ["athletico paranaense", "athletico-pr", "athletico pr", "atletico paranaense", "cap"],
  "flamengo": ["flamengo", "mengao", "fla"],
  "fluminense": ["fluminense", "flu", "tricolor"],
  "vasco": ["vasco da gama", "vasco", "vascao"],
  "botafogo": ["botafogo", "bota", "fogao"],
  "santos": ["santos", "peixe"],
  "palmeiras": ["palmeiras", "verdao", "sep"],
  "corinthians": ["corinthians", "timao", "sccp"],
  "sao paulo": ["sao paulo", "spfc", "tricolor paulista"],
  "gremio": ["gremio", "imortal"],
  "internacional": ["internacional", "inter", "colorado"],
  "cruzeiro": ["cruzeiro", "raposa"],
  "bahia": ["bahia", "tricolor de aco"],
  "fortaleza": ["fortaleza", "leao"],
  "ceara": ["ceara", "vozao"],
  "sport": ["sport", "sport recife"],
  "vitoria": ["vitoria", "leao da barra"],
  "chapecoense": ["chapecoense", "chape"],
  "remo": ["remo", "leao azul"],
  "mirassol": ["mirassol"],
  "sunderland": ["sunderland"],
  "burnley": ["burnley"],
};

// Normalizar nome de time para comparação
function normalizeTeamName(name: string): string {
  const normalized = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/fc|sc|cf|ac|as|ss|rb /gi, "")
    .replace(/-/g, " ")
    .trim();
  
  return normalized;
}

// Verificar se dois nomes de times correspondem
function teamsMatch(name1: string, name2: string): boolean {
  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);
  
  // Verificação direta
  if (n1.includes(n2) || n2.includes(n1)) {
    return true;
  }
  
  // Verificar aliases
  for (const [canonical, aliases] of Object.entries(teamAliases)) {
    const allNames = [canonical, ...aliases].map(a => normalizeTeamName(a));
    const n1Match = allNames.some(a => n1.includes(a) || a.includes(n1));
    const n2Match = allNames.some(a => n2.includes(a) || a.includes(n2));
    if (n1Match && n2Match) {
      return true;
    }
  }
  
  return false;
}

// Verificar se uma seleção ganhou
function checkSelectionResult(
  selection: any,
  homeGoals: number,
  awayGoals: number,
  totalGoals: number,
  homeTeamName: string,
  awayTeamName: string,
  htHomeGoals: number | null = null,
  htAwayGoals: number | null = null
): boolean {
  const outcome = selection.outcome.toLowerCase();
  const marketKey = selection.marketKey?.toLowerCase() || "";
  const selectionHome = normalizeTeamName(selection.homeTeam);
  const selectionAway = normalizeTeamName(selection.awayTeam);
  const fixtureHome = normalizeTeamName(homeTeamName);
  const fixtureAway = normalizeTeamName(awayTeamName);
  
  console.log(`    checkSelectionResult: outcome="${outcome}", marketKey="${marketKey}"`);
  console.log(`    Placar: ${homeGoals}-${awayGoals}, HT: ${htHomeGoals}-${htAwayGoals}`);

  // HT/FT Double - Resultado no intervalo e final
  if (outcome.includes("ht/ft") || outcome.includes("halftime/fulltime")) {
    // Formato: "HT/FT Double-Time1/Time2" ou similar
    // Time1 = quem está ganhando no intervalo
    // Time2 = quem ganha o jogo
    const htftMatch = outcome.match(/ht\/ft[^-]*-(.+)\/(.+)/i);
    if (htftMatch && htHomeGoals !== null && htAwayGoals !== null) {
      const htPick = htftMatch[1].trim();
      const ftPick = htftMatch[2].trim();
      
      console.log(`    HT/FT: HT pick="${htPick}", FT pick="${ftPick}"`);
      
      // Determinar resultado do intervalo
      let htResult: string;
      if (htHomeGoals > htAwayGoals) htResult = "home";
      else if (htAwayGoals > htHomeGoals) htResult = "away";
      else htResult = "draw";
      
      // Determinar resultado final
      let ftResult: string;
      if (homeGoals > awayGoals) ftResult = "home";
      else if (awayGoals > homeGoals) ftResult = "away";
      else ftResult = "draw";
      
      // Verificar se o pick do HT está correto
      let htWon = false;
      if (htResult === "home" && teamsMatch(htPick, homeTeamName)) htWon = true;
      if (htResult === "away" && teamsMatch(htPick, awayTeamName)) htWon = true;
      if (htResult === "draw" && (htPick.toLowerCase().includes("draw") || htPick.toLowerCase().includes("empate") || htPick.toLowerCase() === "x")) htWon = true;
      
      // Verificar se o pick do FT está correto
      let ftWon = false;
      if (ftResult === "home" && teamsMatch(ftPick, homeTeamName)) ftWon = true;
      if (ftResult === "away" && teamsMatch(ftPick, awayTeamName)) ftWon = true;
      if (ftResult === "draw" && (ftPick.toLowerCase().includes("draw") || ftPick.toLowerCase().includes("empate") || ftPick.toLowerCase() === "x")) ftWon = true;
      
      console.log(`    HT result: ${htResult}, HT won: ${htWon}. FT result: ${ftResult}, FT won: ${ftWon}`);
      
      return htWon && ftWon;
    }
    return false;
  }

  // Resultado 1X2 (h2h)
  if (marketKey === "h2h" || marketKey.includes("match_winner")) {
    // Verificar empate primeiro
    if (outcome.includes("draw") || outcome.includes("empate") || outcome === "x") {
      console.log(`    h2h: verificando empate - ${homeGoals === awayGoals}`);
      return homeGoals === awayGoals;
    }
    
    // Verificar vitória da casa usando teamsMatch
    const isHomeTeam = teamsMatch(selection.outcome, homeTeamName) || teamsMatch(selection.outcome, selection.homeTeam);
    if (isHomeTeam) {
      console.log(`    h2h: ${selection.outcome} é time da casa - vitória casa: ${homeGoals > awayGoals}`);
      return homeGoals > awayGoals;
    }
    
    // Verificar vitória fora usando teamsMatch
    const isAwayTeam = teamsMatch(selection.outcome, awayTeamName) || teamsMatch(selection.outcome, selection.awayTeam);
    if (isAwayTeam) {
      console.log(`    h2h: ${selection.outcome} é time de fora - vitória fora: ${awayGoals > homeGoals}`);
      return awayGoals > homeGoals;
    }
    
    console.log(`    h2h: não identificou time no outcome "${selection.outcome}"`);
  }

  // Total de gols Over/Under
  if (marketKey.includes("total") || marketKey.includes("over") || marketKey.includes("under")) {
    const overMatch = outcome.match(/over\s*(\d+\.?\d*)/i);
    const underMatch = outcome.match(/under\s*(\d+\.?\d*)/i);
    
    if (overMatch) {
      const line = parseFloat(overMatch[1]);
      console.log(`    totals: Over ${line} - total ${totalGoals} > ${line} = ${totalGoals > line}`);
      return totalGoals > line;
    }
    if (underMatch) {
      const line = parseFloat(underMatch[1]);
      console.log(`    totals: Under ${line} - total ${totalGoals} < ${line} = ${totalGoals < line}`);
      return totalGoals < line;
    }
  }

  // Ambas marcam (BTTS)
  if (marketKey.includes("btts") || marketKey.includes("both") || outcome.includes("both teams score")) {
    if (outcome.includes("yes") || outcome.includes("sim")) {
      console.log(`    BTTS: Sim - ${homeGoals > 0 && awayGoals > 0}`);
      return homeGoals > 0 && awayGoals > 0;
    }
    if (outcome.includes("no") || outcome.includes("nao") || outcome.includes("não")) {
      console.log(`    BTTS: Não - ${homeGoals === 0 || awayGoals === 0}`);
      return homeGoals === 0 || awayGoals === 0;
    }
  }

  // Dupla chance
  if (marketKey.includes("double_chance")) {
    if (outcome.includes("1x") || outcome.includes("home or draw")) {
      return homeGoals >= awayGoals;
    }
    if (outcome.includes("x2") || outcome.includes("draw or away")) {
      return awayGoals >= homeGoals;
    }
    if (outcome.includes("12") || outcome.includes("home or away")) {
      return homeGoals !== awayGoals;
    }
  }

  console.log(`    Mercado não reconhecido: marketKey="${marketKey}", outcome="${outcome}"`);
  // Se não conseguiu determinar, marcar como perdido
  return false;
}
