import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBetSlipSchema } from "@shared/schema";
import { z } from "zod";
import { cache } from "./cache";
import QRCode from "qrcode";
import multer from "multer";
import path from "path";
import fs from "fs";

const bannerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), "uploads", "banners");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `banner-${Date.now()}${ext}`);
  },
});
const bannerUpload = multer({
  storage: bannerStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype.split("/")[1]);
    cb(null, ext && mime);
  },
});

// Formatar nome de time com Title Case, preservando conectivos portugueses em minúsculo
function formatTeamName(name: string): string {
  if (!name) return name;
  const minorWords = new Set(['da', 'de', 'do', 'dos', 'das', 'e', 'a', 'as', 'os', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'the', 'of', 'and']);
  return name
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (!word) return word;
      if (index > 0 && minorWords.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

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

const CACHE_TTL_SPORTS = 5 * 60 * 1000; // 5 minutos
const CACHE_TTL_ODDS = 5 * 60 * 1000; // 5 minutos
const CACHE_TTL_FOOTBALL = 5 * 60 * 1000; // 5 minutos

const MANAUS_OFFSET_MS = -4 * 60 * 60 * 1000;
function toManausDateStr(ms: number): string {
  return new Date(ms + MANAUS_OFFSET_MS).toISOString().split('T')[0];
}

// Ligas permitidas — ordem exata de exibição
const ALLOWED_LEAGUES_ORDERED = [
  "soccer_argentina_primera_division",
  "soccer_brazil_campeonato",
  "soccer_brazil_serie_b",
  "soccer_conmebol_copa_libertadores",
  "soccer_epl",
  "soccer_fa_cup",
  "soccer_france_ligue_one",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "soccer_japan_j_league",
  "soccer_mexico_ligamx",
  "soccer_netherlands_eredivisie",
  "soccer_portugal_primeira_liga",
  "soccer_spain_la_liga",
  "soccer_turkey_super_league",
  "soccer_uefa_champs_league",
  "soccer_uefa_europa_conference_league",
  "soccer_uefa_europa_league",
  "soccer_usa_mls",
  "soccer_brazil_copa_do_brasil",
  "soccer_conmebol_copa_sudamericana",
];
const ALLOWED_LEAGUES_SET = new Set(ALLOWED_LEAGUES_ORDERED);

// Helper para converter dados de múltiplos bookmakers da API-Football em formato de mercados
// Agrega valores de todos os bookmakers para ter mais linhas (ex: escanteios)
function buildMarketsFromBookmaker(bookmakerOrBookmakers: any, homeTeam: string, awayTeam: string) {
  const bookmakers: any[] = Array.isArray(bookmakerOrBookmakers) ? bookmakerOrBookmakers : [bookmakerOrBookmakers];
  const primaryBookmaker = bookmakers[0];
  return buildMarketsFromBookmakers(bookmakers, primaryBookmaker?.name || "API-Football", homeTeam, awayTeam);
}

function buildMarketsFromBookmakers(bookmakers: any[], bookmakerName: string, homeTeam: string, awayTeam: string) {
  const marketLabels: Record<string, string> = {
    "Match Winner": "Resultado Final",
    "Home/Away": "Casa/Fora",
    "Second Half Winner": "Vencedor 2º Tempo",
    "Asian Handicap": "Handicap Asiático",
    "Goals Over/Under": "Total de Gols",
    "Goals Over/Under First Half": "Gols 1º Tempo",
    "HT/FT Double": "Intervalo/Final",
    "Both Teams Score": "Ambas Marcam",
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

  const allowedMarkets = new Set([
    "Both Teams Score",
    "HT/FT Double",
    "Exact Score",
    "Goals Over/Under",
    "Team To Score First",
    "Corners Over Under",
    "Total Corners",
  ]);

  // Agrupar bets do mesmo mercado de TODOS os bookmakers, deduplicando por valor
  // Usa a média das odds quando múltiplos bookmakers cobrem o mesmo outcome
  // Isso maximiza as linhas disponíveis (ex: escanteios Over 8.5, 9.5, 10.5, 11.5...)
  const grouped: Record<string, { id: number; name: string; label: string; accumulator: Record<string, { sum: number; count: number }>; values: { value: string; odd: number }[] }> = {};

  for (const bk of bookmakers) {
    const bets: any[] = bk.bets || [];
    bets
      .filter((bet: any) => allowedMarkets.has(bet.name))
      .forEach((bet: any) => {
        const key: string = bet.name;
        if (!grouped[key]) {
          grouped[key] = {
            id: bet.id,
            name: bet.name,
            label: marketLabels[bet.name] || bet.name,
            accumulator: {},
            values: []
          };
        }
        const vals: { value: string; odd: number }[] = (bet.values || []).map((v: any) => ({
          value: String(v.value),
          odd: parseFloat(v.odd)
        }));
        for (const v of vals) {
          if (!grouped[key].accumulator[v.value]) {
            grouped[key].accumulator[v.value] = { sum: 0, count: 0 };
          }
          grouped[key].accumulator[v.value].sum += v.odd;
          grouped[key].accumulator[v.value].count += 1;
        }
      });
  }

  // Converter acumuladores em valores médios
  for (const key of Object.keys(grouped)) {
    grouped[key].values = Object.entries(grouped[key].accumulator).map(([value, acc]) => ({
      value,
      odd: parseFloat((acc.sum / acc.count).toFixed(2))
    }));
  }

  // Filtrar linhas não-padrão (Asian quarter lines como 2.75, 3.25, etc.)
  // Para Gols: manter apenas linhas x.5 (0.5, 1.5, 2.5, 3.5, 4.5, 5.5)
  // Para Escanteios: manter apenas linhas x.5 e inteiros (8, 8.5, 9, 9.5, 10, 10.5...)
  function isStandardGoalLine(value: string): boolean {
    const match = value.match(/^(Over|Under)\s+([\d.]+)$/i);
    if (!match) return true;
    const num = parseFloat(match[2]);
    const decimal = num - Math.floor(num);
    return decimal === 0.5;
  }

  function isStandardCornerLine(value: string): boolean {
    const match = value.match(/^(Over|Under)\s+([\d.]+)$/i);
    if (!match) return true;
    const num = parseFloat(match[2]);
    const decimal = num - Math.floor(num);
    return decimal === 0.5;
  }

  const overUnderMarkets = new Set(["Goals Over/Under", "Goals Over/Under First Half", "Goals Over/Under - Second Half", "Corners Over Under", "Total Corners"]);

  function sortOverUnder(values: { value: string; odd: number }[]) {
    return [...values].sort((a, b) => {
      const parseVal = (s: string) => {
        const m = s.match(/^(Over|Under)\s+([\d.]+)$/i);
        if (!m) return 0;
        const num = parseFloat(m[2]);
        const isUnder = m[1].toLowerCase() === "under" ? 0.1 : 0;
        return num + isUnder;
      };
      return parseVal(a.value) - parseVal(b.value);
    });
  }

  const marketOrder: Record<string, number> = {
    "Goals Over/Under": 1,
    "HT/FT Double": 2,
    "Both Teams Score": 3,
    "Corners Over Under": 4,
    "Total Corners": 4,
    "Team To Score First": 5,
    "Red Card": 6,
    "Exact Score": 7,
  };

  const markets = Object.values(grouped).map((g) => {
    let values = g.values;
    let label = g.label;

    if (g.name === "Goals Over/Under") {
      // Mostrar apenas a linha 2.5 com rótulos Sim/Não
      const over = values.find((v) => v.value === "Over 2.5");
      const under = values.find((v) => v.value === "Under 2.5");
      values = [
        { value: "Sim", odd: over?.odd ?? 1.90 },
        { value: "Não", odd: under?.odd ?? 1.90 },
      ];
      label = "Total de Gols mais de 2,5";
    } else if (g.name === "Goals Over/Under First Half" || g.name === "Goals Over/Under - Second Half") {
      values = values.filter((v) => isStandardGoalLine(v.value));
      if (overUnderMarkets.has(g.name)) values = sortOverUnder(values);
    } else if (g.name === "Corners Over Under" || g.name === "Total Corners") {
      values = values.filter((v) => isStandardCornerLine(v.value));
      if (overUnderMarkets.has(g.name)) values = sortOverUnder(values);
    } else if (overUnderMarkets.has(g.name)) {
      values = sortOverUnder(values);
    }

    return {
      id: g.id,
      name: g.name,
      label,
      values,
    };
  }).sort((a, b) => (marketOrder[a.name] ?? 99) - (marketOrder[b.name] ?? 99));

  // Adicionar mercado de Cartão Vermelho sinteticamente se a API não retornou
  const hasRedCard = markets.some(m => m.name === "Red Card");
  if (!hasRedCard) {
    markets.push({
      id: 15,
      name: "Red Card",
      label: "Cartão Vermelho no Jogo",
      values: [
        { value: "Sim", odd: 3.25 },
        { value: "Não", odd: 1.24 }
      ]
    });
    markets.sort((a, b) => (marketOrder[a.name] ?? 99) - (marketOrder[b.name] ?? 99));
  }

  return {
    homeTeam,
    awayTeam,
    bookmaker: bookmakerName,
    markets
  };
}

// Função para gerar mercados extras quando API-Football não encontra correspondência
// IMPORTANTE: esses valores são as odds BASE (antes do boost de +20% aplicado no frontend)
// Para que após o boost fiquem realistas, os valores aqui devem ser ~17% menores que o mercado real
function generateExtraMarkets(homeTeam: string, awayTeam: string) {
  const r = (min: number, max: number) => parseFloat((min + Math.random() * (max - min)).toFixed(2));
  
  return [
    {
      id: 1,
      name: "Both Teams Score",
      label: "Ambas Marcam",
      values: [
        { value: "Sim", odd: r(1.45, 1.60) },
        { value: "Não", odd: r(1.85, 2.05) }
      ]
    },
    {
      id: 2,
      name: "HT/FT Double",
      label: "Intervalo/Final",
      values: [
        { value: `${homeTeam}/${homeTeam}`, odd: r(3.00, 4.00) },
        { value: "Empate/Empate", odd: r(4.50, 5.50) },
        { value: `${awayTeam}/${awayTeam}`, odd: r(4.00, 5.50) },
        { value: `${homeTeam}/Empate`, odd: r(7.00, 9.00) },
        { value: `Empate/${homeTeam}`, odd: r(5.00, 7.00) },
        { value: `${awayTeam}/Empate`, odd: r(8.00, 11.00) },
        { value: `Empate/${awayTeam}`, odd: r(6.00, 8.50) }
      ]
    },
    {
      id: 4,
      name: "Exact Score",
      label: "Placar Exato",
      values: [
        { value: "1-0", odd: r(5.50, 7.00) },
        { value: "2-0", odd: r(8.00, 10.00) },
        { value: "2-1", odd: r(7.00, 9.00) },
        { value: "1-1", odd: r(5.50, 6.50) },
        { value: "0-0", odd: r(8.00, 10.00) },
        { value: "0-1", odd: r(7.50, 9.50) },
        { value: "0-2", odd: r(11.00, 14.00) },
        { value: "1-2", odd: r(9.00, 11.00) },
        { value: "2-2", odd: r(11.00, 14.00) },
        { value: "3-0", odd: r(15.00, 19.00) },
        { value: "3-1", odd: r(13.00, 16.00) },
        { value: "3-2", odd: r(19.00, 25.00) }
      ]
    },
    {
      id: 5,
      name: "Goals Over/Under 2.5",
      label: "Total de Gols 2,5",
      values: [
        { value: "Sim (Mais de 2.5)", odd: r(1.55, 1.75) },
        { value: "Não (Menos de 2.5)", odd: r(1.75, 1.95) }
      ]
    },
    {
      id: 6,
      name: "Team To Score First",
      label: "Primeiro a Marcar",
      values: [
        { value: homeTeam, odd: r(1.70, 2.00) },
        { value: awayTeam, odd: r(2.10, 2.60) },
        { value: "Nenhum Gol", odd: r(7.00, 9.00) }
      ]
    },
    {
      id: 11,
      name: "Total Corners",
      label: "Total de Escanteios",
      values: [
        { value: "Mais de 7.5", odd: r(1.50, 1.65) },
        { value: "Menos de 7.5", odd: r(1.90, 2.10) },
        { value: "Mais de 8.5", odd: r(1.65, 1.80) },
        { value: "Menos de 8.5", odd: r(1.75, 1.95) },
        { value: "Mais de 9.5", odd: r(1.85, 2.05) },
        { value: "Menos de 9.5", odd: r(1.55, 1.72) },
        { value: "Mais de 10.5", odd: r(2.10, 2.35) },
        { value: "Menos de 10.5", odd: r(1.42, 1.55) }
      ]
    },
    {
      id: 15,
      name: "Red Card",
      label: "Cartão Vermelho no Jogo",
      values: [
        { value: "Sim", odd: r(3.00, 3.80) },
        { value: "Não", odd: r(1.18, 1.28) }
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
      // Lista estática — sem chamada à API externa, sem consumir cota
      const LEAGUE_TITLES: Record<string, string> = {
        "soccer_brazil_campeonato": "Brasileirão Série A",
        "soccer_conmebol_copa_libertadores": "Copa Libertadores",
        "soccer_brazil_copa_do_brasil": "Copa do Brasil",
        "soccer_conmebol_copa_sudamericana": "Copa Sul-Americana",
        "soccer_brazil_serie_b": "Brasileirão Série B",
        "soccer_uefa_champs_league": "UEFA Champions League",
        "soccer_uefa_europa_league": "UEFA Europa League",
        "soccer_uefa_europa_conference_league": "UEFA Conference League",
        "soccer_epl": "Premier League",
        "soccer_fa_cup": "Copa da Inglaterra",
        "soccer_france_ligue_one": "Ligue 1",
        "soccer_germany_bundesliga": "Bundesliga",
        "soccer_italy_serie_a": "Serie A",
        "soccer_japan_j_league": "J-League",
        "soccer_mexico_ligamx": "Liga MX",
        "soccer_usa_mls": "MLS",
        "soccer_netherlands_eredivisie": "Eredivisie",
        "soccer_portugal_primeira_liga": "Primeira Liga",
        "soccer_spain_la_liga": "La Liga",
        "soccer_turkey_super_league": "Superliga",
        "soccer_argentina_primera_division": "Primera División",
      };

      const soccerSports = ALLOWED_LEAGUES_ORDERED.map(key => ({
        key,
        group: "Soccer",
        title: LEAGUE_TITLES[key] || key,
        active: true,
        leagueId: LEAGUE_MAPPING[key] || null,
      }));

      res.json(soccerSports);
    } catch (error) {
      console.error("Error building sports list:", error);
      res.status(500).json({ error: "Failed to build sports list" });
    }
  });

  // Endpoint para buscar jogos do dia de ligas populares
  app.get("/api/games/today", async (req, res) => {
    try {
      const cacheKey = "games_today";
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        const blockedIds = await storage.getBlockedGameIds();
        return res.json(blockedIds.size > 0 ? cached.filter((g: any) => !blockedIds.has(g.id)) : cached);
      }
      
      let allGames: any[] = [];
      let quotaExceeded = false;

      // Prioridade de liga (maior = mais importante para exibição)
      const LEAGUE_PRIORITY: Record<string, number> = {
        "soccer_brazil_campeonato": 10,
        "soccer_uefa_champs_league": 10,
        "soccer_epl": 9,
        "soccer_spain_la_liga": 9,
        "soccer_conmebol_copa_libertadores": 8,
        "soccer_brazil_copa_do_brasil": 8,
        "soccer_germany_bundesliga": 8,
        "soccer_italy_serie_a": 8,
        "soccer_france_ligue_one": 7,
        "soccer_uefa_europa_league": 7,
        "soccer_conmebol_copa_sudamericana": 7,
        "soccer_uefa_europa_conference_league": 6,
        "soccer_fa_cup": 6,
        "soccer_brazil_serie_b": 6,
        "soccer_portugal_primeira_liga": 5,
        "soccer_netherlands_eredivisie": 5,
        "soccer_turkey_super_league": 5,
        "soccer_argentina_primera_division": 5,
        "soccer_mexico_ligamx": 4,
        "soccer_usa_mls": 4,
        "soccer_japan_j_league": 4,
      };

      // Ligas para buscar jogos do dia (as mais prováveis de ter jogos diariamente)
      const todayLeagues = [
        "soccer_brazil_campeonato",
        "soccer_uefa_champs_league",
        "soccer_epl",
        "soccer_spain_la_liga",
        "soccer_germany_bundesliga",
        "soccer_italy_serie_a",
        "soccer_france_ligue_one",
        "soccer_uefa_europa_league",
        "soccer_conmebol_copa_libertadores",
        "soccer_conmebol_copa_sudamericana",
        "soccer_brazil_copa_do_brasil",
        "soccer_brazil_serie_b",
        "soccer_uefa_europa_conference_league",
        "soccer_fa_cup",
        "soccer_portugal_primeira_liga",
        "soccer_netherlands_eredivisie",
        "soccer_turkey_super_league",
        "soccer_argentina_primera_division",
        "soccer_mexico_ligamx",
        "soccer_usa_mls",
        "soccer_japan_j_league",
      ];

      // Usar API-Football como fonte principal (assinatura ativa)
      quotaExceeded = true;

      const coveredSportKeys = new Set(allGames.map(g => g.sportKey));

      if (API_FOOTBALL_KEY) {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        const europeanSeason = currentMonth >= 7 ? currentYear : currentYear - 1;
        const brazilianSeason = currentYear;

        const allFootballLeagues = [
          { id: 71, key: "soccer_brazil_campeonato", name: "Campeonato Brasileiro Série A", season: brazilianSeason },
          { id: 72, key: "soccer_brazil_serie_b", name: "Brasileirão Série B", season: brazilianSeason },
          { id: 73, key: "soccer_brazil_copa_do_brasil", name: "Copa do Brasil", season: brazilianSeason },
          { id: 13, key: "soccer_conmebol_copa_libertadores", name: "Copa Libertadores", season: brazilianSeason },
          { id: 11, key: "soccer_conmebol_copa_sudamericana", name: "Copa Sul-Americana", season: brazilianSeason },
          { id: 2, key: "soccer_uefa_champs_league", name: "UEFA Champions League", season: europeanSeason },
          { id: 39, key: "soccer_epl", name: "Premier League", season: europeanSeason },
          { id: 45, key: "soccer_fa_cup", name: "FA Cup", season: europeanSeason },
          { id: 140, key: "soccer_spain_la_liga", name: "La Liga – Espanha", season: europeanSeason },
          { id: 78, key: "soccer_germany_bundesliga", name: "Bundesliga – Alemanha", season: europeanSeason },
          { id: 135, key: "soccer_italy_serie_a", name: "Serie A – Itália", season: europeanSeason },
          { id: 61, key: "soccer_france_ligue_one", name: "Ligue 1 – França", season: europeanSeason },
          { id: 3, key: "soccer_uefa_europa_league", name: "UEFA Europa League", season: europeanSeason },
          { id: 848, key: "soccer_uefa_europa_conference_league", name: "Conference League", season: europeanSeason },
          { id: 94, key: "soccer_portugal_primeira_liga", name: "Primeira Liga – Portugal", season: europeanSeason },
          { id: 88, key: "soccer_netherlands_eredivisie", name: "Eredivisie – Holanda", season: europeanSeason },
          { id: 203, key: "soccer_turkey_super_league", name: "Süper Lig – Turquia", season: europeanSeason },
          { id: 128, key: "soccer_argentina_primera_division", name: "Primera División – Argentina", season: brazilianSeason },
          { id: 262, key: "soccer_mexico_ligamx", name: "Liga MX – México", season: brazilianSeason },
          { id: 253, key: "soccer_usa_mls", name: "MLS – EUA", season: 2026 },
          { id: 98, key: "soccer_japan_j_league", name: "J1 League – Japão", season: 2026 },
        ];

        const footballLeagues = allFootballLeagues.filter(l => !coveredSportKeys.has(l.key));
        if (footballLeagues.length > 0) {
        console.log(`Using API-Football for ${footballLeagues.length} uncovered leagues: ${footballLeagues.map(l => l.key).join(", ")}`);

        const nowMs = Date.now();
        const next24hMs = nowMs + 24 * 60 * 60 * 1000;
        const todayStr = toManausDateStr(nowMs);
        const next24hStr = toManausDateStr(next24hMs);

        const fixtureResults: Array<{ league: typeof footballLeagues[0]; fixtures: any[] }> = [];
        const BATCH_SIZE = 5;
        for (let i = 0; i < footballLeagues.length; i += BATCH_SIZE) {
          const batch = footballLeagues.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(league =>
              fetch(`${API_FOOTBALL_BASE}/fixtures?league=${league.id}&season=${league.season}&from=${todayStr}&to=${next24hStr}`,
                { headers: { "x-apisports-key": API_FOOTBALL_KEY } })
                .then(r => r.ok ? r.json() : { response: [] })
                .then(data => ({ league, fixtures: data.response || [] }))
                .catch(() => ({ league, fixtures: [] }))
            )
          );
          fixtureResults.push(...batchResults);
          if (i + BATCH_SIZE < footballLeagues.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        // Coletar fixtures por liga
        const fixturesByLeague: Array<{ league: { id: number; key: string; name: string; season: number }; fixtures: any[] }> = [];
        for (const { league, fixtures } of fixtureResults) {
          const upcoming = fixtures.filter((f: any) => {
            const status = f.fixture?.status?.short;
            const gameDate = new Date(f.fixture?.date).getTime();
            return status === "NS" && gameDate > nowMs && gameDate <= next24hMs;
          }).slice(0, 5);
          if (upcoming.length > 0) fixturesByLeague.push({ league, fixtures: upcoming });
        }

        // Buscar odds sequencialmente por liga (evita throttling da API)
        const todayOddsMap = new Map<number, any[]>(); // fixtureId -> bookmakers
        const bkPreferred = ["Bet365", "Betano", "William Hill", "Betfair", "Unibet", "10Bet", "Pinnacle", "1xBet"];

        const extractH2hFromBk = (bk: any, title?: string) => {
          if (!bk) return null;
          const h2h = bk.bets?.find((b: any) => b.name === "Match Winner");
          if (!h2h || h2h.values?.length < 2) return null;
          return [{
            key: "api-football",
            title: title || bk.name,
            markets: [{ key: "h2h", outcomes: h2h.values.map((v: any) => ({
              name: v.value === "Home" ? "__HOME__" : v.value === "Away" ? "__AWAY__" : "Empate",
              price: parseFloat(v.odd)
            }))}]
          }];
        };

        const populateFromBulk = (entries: any[]) => {
          for (const entry of entries) {
            const fid = entry.fixture?.id;
            if (!fid || todayOddsMap.has(fid)) continue;
            const allBks: any[] = entry.bookmakers || [];
            const bk = allBks.find((b: any) => bkPreferred.includes(b.name)) || allBks[0];
            const result = extractH2hFromBk(bk);
            if (result) todayOddsMap.set(fid, result);
          }
        };

        for (const { league, fixtures: upcoming } of fixturesByLeague) {
          // 1. Verificar se o cache da liga já tem os dados (populado pelo endpoint /api/odds/:sportKey)
          const leagueCache = cache.get<any[]>(`odds_${league.key}`);
          if (leagueCache) {
            for (const game of leagueCache) {
              const fid = parseInt(game.id.replace("api-football-", ""), 10);
              if (!isNaN(fid) && !todayOddsMap.has(fid) && game.bookmakers?.length > 0) {
                todayOddsMap.set(fid, game.bookmakers);
              }
            }
            continue; // liga já está em cache, pular busca de odds
          }

          // 2. Buscar odds em bloco para esta liga (hoje e amanhã sequencialmente)
          const fidSet = new Set(upcoming.map((f: any) => f.fixture.id));
          for (const dateStr of [todayStr, next24hStr]) {
            if ([...fidSet].every(fid => todayOddsMap.has(fid))) break; // todos já encontrados
            try {
              const r = await fetch(
                `${API_FOOTBALL_BASE}/odds?league=${league.id}&season=${league.season}&date=${dateStr}`,
                { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
              );
              if (r.ok) populateFromBulk((await r.json()).response || []);
            } catch (e) { /* silently ignore */ }
          }

          // 3. Fallback individual para fixtures ainda sem odds após o bulk
          const missed = upcoming.filter((f: any) => !todayOddsMap.has(f.fixture.id));
          for (const fixture of missed) {
            const fid = fixture.fixture.id;
            try {
              const r = await fetch(
                `${API_FOOTBALL_BASE}/odds?fixture=${fid}`,
                { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
              );
              if (r.ok) {
                const d = await r.json();
                const allBks: any[] = d.response?.[0]?.bookmakers || [];
                const bk = allBks.find((b: any) => bkPreferred.includes(b.name)) || allBks[0];
                const result = extractH2hFromBk(bk);
                if (result) todayOddsMap.set(fid, result);
              }
            } catch (e) { /* silently ignore */ }
          }
        }

        for (const { league, fixtures: upcoming } of fixturesByLeague) {
          for (const fixture of upcoming) {
            const fid = fixture.fixture.id;
            let bkData = todayOddsMap.get(fid);
            if (bkData) {
              // Substituir placeholders com nomes reais
              bkData = bkData.map(bk => ({
                ...bk,
                markets: bk.markets.map((mkt: any) => ({
                  ...mkt,
                  outcomes: mkt.outcomes.map((o: any) => ({
                    ...o,
                    name: o.name === "__HOME__" ? formatTeamName(fixture.teams.home.name) :
                          o.name === "__AWAY__" ? formatTeamName(fixture.teams.away.name) : o.name
                  }))
                }))
              }));
            }
            allGames.push({
              id: `api-football-${fid}`,
              sportKey: league.key,
              sportTitle: league.name,
              commenceTime: fixture.fixture.date,
              homeTeam: formatTeamName(fixture.teams.home.name),
              awayTeam: formatTeamName(fixture.teams.away.name),
              homeLogo: fixture.teams.home.logo,
              awayLogo: fixture.teams.away.logo,
              bookmakers: bkData || [],
              _priority: LEAGUE_PRIORITY[league.key] ?? 3,
            });
          }
        }
      }
      }

      // Ordenar: por prioridade de liga (desc) depois por horário (asc)
      allGames.sort((a, b) => {
        if (b._priority !== a._priority) return b._priority - a._priority;
        return new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime();
      });

      // Remover campo interno _priority e filtrar jogos sem odds reais
      const finalGames = allGames
        .map(({ _priority, ...g }) => g)
        .filter((g: any) => g.bookmakers?.length > 0 && g.bookmakers[0]?.markets?.length > 0);

      console.log(`Games today endpoint - Found ${finalGames.length} games across all leagues`);
      cache.set(cacheKey, finalGames, 30 * 60 * 1000); // cache 30 minutos
      const blockedIds = await storage.getBlockedGameIds();
      res.json(blockedIds.size > 0 ? finalGames.filter((g: any) => !blockedIds.has(g.id)) : finalGames);
    } catch (error) {
      console.error("Error fetching today's games:", error);
      res.status(500).json({ error: "Failed to fetch today's games" });
    }
  });

  // Endpoint para buscar próximos jogos do Brasileirão
  app.get("/api/games/brasileirao", async (req, res) => {
    try {
      const cacheKey = "games_brasileirao";
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        const blockedIds = await storage.getBlockedGameIds();
        return res.json(blockedIds.size > 0 ? cached.filter((g: any) => !blockedIds.has(g.id)) : cached);
      }

      let games: any[] = [];

      // API-Football PRIMEIRO — odds reais da bookmaker correta (ex: 3.90 para Remo)
      if (API_FOOTBALL_KEY) {
        const currentYear = new Date().getFullYear();
        const nowMs = Date.now();
        const next24hMs = nowMs + 24 * 60 * 60 * 1000;
        const today = toManausDateStr(nowMs);
        const next24hStr = toManausDateStr(next24hMs);

        const fetchBrasileiraoFixtures = async (season: number) => {
          const r = await fetch(
            `${API_FOOTBALL_BASE}/fixtures?league=71&season=${season}&from=${today}&to=${next24hStr}`,
            { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
          );
          if (!r.ok) return [];
          const data = await r.json();
          return (data.response || []).filter((f: any) => {
            const status = f.fixture?.status?.short;
            const t = new Date(f.fixture?.date).getTime();
            return status === "NS" && t > nowMs && t <= next24hMs;
          }).slice(0, 10);
        };

        let fixtures = await fetchBrasileiraoFixtures(currentYear);
        if (fixtures.length === 0) {
          console.log(`Brasileirão ${currentYear} sem jogos nas próximas 24h`);
        }

        // Buscar todas as odds do Brasileirão de uma vez (hoje + amanhã, pois jogos como 00:30 ficam no dia seguinte)
        const preferredNames = ["Bet365", "Betano", "William Hill", "Betfair", "Unibet", "10Bet", "Pinnacle", "1xBet"];
        const oddsMap = new Map<number, any[]>(); // fixtureId -> bookmakers
        const tomorrow = toManausDateStr(nowMs + 24 * 60 * 60 * 1000);
        const processOddsEntries = (entries: any[]) => {
          for (const entry of entries) {
            const fid = entry.fixture?.id;
            if (!fid || oddsMap.has(fid)) continue;
            const allBks: any[] = entry.bookmakers || [];
            const chosenBk = allBks.find((bk: any) => preferredNames.includes(bk.name)) || allBks[0];
            const bets = chosenBk?.bets || [];
            const h2h = bets.find((b: any) => b.name === "Match Winner");
            if (h2h && h2h.values?.length >= 2) {
              console.log(`[BR-bulk] ${fid} bookmaker: ${chosenBk.name}`);
              oddsMap.set(fid, [{
                key: "api-football",
                title: chosenBk.name,
                markets: [{
                  key: "h2h",
                  outcomes: h2h.values.map((v: any) => ({
                    name: v.value === "Home" ? "HOME_PLACEHOLDER" :
                          v.value === "Away" ? "AWAY_PLACEHOLDER" : "Empate",
                    price: parseFloat(v.odd)
                  }))
                }]
              }]);
            }
          }
        };
        try {
          const [resp1, resp2] = await Promise.all([
            fetch(`${API_FOOTBALL_BASE}/odds?league=71&season=${currentYear}&date=${today}`, { headers: { "x-apisports-key": API_FOOTBALL_KEY } }),
            fetch(`${API_FOOTBALL_BASE}/odds?league=71&season=${currentYear}&date=${tomorrow}`, { headers: { "x-apisports-key": API_FOOTBALL_KEY } })
          ]);
          if (resp1.ok) { const d = await resp1.json(); processOddsEntries(d.response || []); }
          if (resp2.ok) { const d = await resp2.json(); processOddsEntries(d.response || []); }
          console.log(`[BR-bulk] odds carregadas para ${oddsMap.size} fixtures`);
        } catch (err) {
          console.error("[BR-bulk] Erro ao buscar odds em bloco:", err);
        }

        // Para fixtures que não estavam no bulk, buscar individualmente
        const missedFixtures = fixtures.filter((f: any) => !oddsMap.has(f.fixture.id));
        if (missedFixtures.length > 0) {
          await Promise.all(missedFixtures.map(async (fixture: any) => {
            const fid = fixture.fixture.id;
            try {
              const r = await fetch(`${API_FOOTBALL_BASE}/odds?fixture=${fid}`, { headers: { "x-apisports-key": API_FOOTBALL_KEY } });
              if (r.ok) {
                const d = await r.json();
                const allBks: any[] = d.response?.[0]?.bookmakers || [];
                const chosenBk = allBks.find((bk: any) => preferredNames.includes(bk.name)) || allBks[0];
                const bets = chosenBk?.bets || [];
                const h2h = bets.find((b: any) => b.name === "Match Winner");
                if (h2h && h2h.values?.length >= 2) {
                  console.log(`[BR-indiv] ${fid} bookmaker: ${chosenBk.name}`);
                  oddsMap.set(fid, [{
                    key: "api-football",
                    title: chosenBk.name,
                    markets: [{ key: "h2h", outcomes: h2h.values.map((v: any) => ({
                      name: v.value === "Home" ? "HOME_PLACEHOLDER" : v.value === "Away" ? "AWAY_PLACEHOLDER" : "Empate",
                      price: parseFloat(v.odd)
                    }))}]
                  }]);
                } else {
                  console.warn(`[BR-indiv] fixture ${fid} sem Match Winner, bookmakers: ${allBks.length}`);
                }
              }
            } catch (e) { console.error(`[BR-indiv] erro fixture ${fid}:`, e); }
          }));
        }

        games = fixtures.map((fixture: any) => {
          const fid = fixture.fixture.id;
          let bookmakers = oddsMap.get(fid);
          if (bookmakers) {
            // Substituir placeholders pelos nomes reais dos times
            bookmakers = bookmakers.map(bk => ({
              ...bk,
              markets: bk.markets.map((mkt: any) => ({
                ...mkt,
                outcomes: mkt.outcomes.map((o: any) => ({
                  ...o,
                  name: o.name === "HOME_PLACEHOLDER" ? formatTeamName(fixture.teams.home.name) :
                        o.name === "AWAY_PLACEHOLDER" ? formatTeamName(fixture.teams.away.name) : o.name
                }))
              }))
            }));
          } else {
            console.warn(`[BR] Sem odds da API para fixture ${fid}, ignorando`);
            bookmakers = [];
          }
          return {
            id: `api-football-${fid}`,
            sportKey: "soccer_brazil_campeonato",
            sportTitle: "Brasileirão Série A",
            commenceTime: fixture.fixture.date,
            homeTeam: formatTeamName(fixture.teams.home.name),
            awayTeam: formatTeamName(fixture.teams.away.name),
            homeLogo: fixture.teams.home.logo,
            awayLogo: fixture.teams.away.logo,
            bookmakers
          };
        });
      }


      const gamesWithOdds = games.filter((g: any) => g.bookmakers?.length > 0 && g.bookmakers[0]?.markets?.length > 0);
      cache.set(cacheKey, gamesWithOdds, CACHE_TTL_ODDS);
      const blockedIds = await storage.getBlockedGameIds();
      res.json(blockedIds.size > 0 ? gamesWithOdds.filter((g: any) => !blockedIds.has(g.id)) : gamesWithOdds);
    } catch (error) {
      console.error("Error fetching Brasileirão games:", error);
      res.status(500).json({ error: "Failed to fetch Brasileirão games" });
    }
  });

  app.get("/api/search/games", async (req, res) => {
    try {
      const teamRaw = (req.query.team as string || "").trim();
      const team = teamRaw.toLowerCase();
      if (!team || team.length < 2) return res.json([]);

      const cacheKey = `search_team_${team}`;
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        const blockedIds = await storage.getBlockedGameIds();
        return res.json(blockedIds.size > 0 ? cached.filter((g: any) => !blockedIds.has(g.id)) : cached);
      }

      let results: any[] = [];

      if (API_FOOTBALL_KEY) {
        const nowMs = Date.now();
        const next24hMs = nowMs + 24 * 60 * 60 * 1000;

        // Mapeamento de league id -> sportKey para todas as ligas suportadas
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        const europeanSeason = currentMonth >= 7 ? currentYear : currentYear - 1;
        const brazilianSeason = currentYear;
        const leagueIdToKey: Record<number, { key: string; name: string; season: number }> = {
          71:  { key: "soccer_brazil_campeonato", name: "Campeonato Brasileiro Série A", season: brazilianSeason },
          72:  { key: "soccer_brazil_serie_b", name: "Brasileirão Série B", season: brazilianSeason },
          73:  { key: "soccer_brazil_copa_do_brasil", name: "Copa do Brasil", season: brazilianSeason },
          13:  { key: "soccer_conmebol_copa_libertadores", name: "Copa Libertadores", season: brazilianSeason },
          11:  { key: "soccer_conmebol_copa_sudamericana", name: "Copa Sul-Americana", season: brazilianSeason },
          2:   { key: "soccer_uefa_champs_league", name: "UEFA Champions League", season: europeanSeason },
          39:  { key: "soccer_epl", name: "Premier League", season: europeanSeason },
          45:  { key: "soccer_fa_cup", name: "FA Cup", season: europeanSeason },
          140: { key: "soccer_spain_la_liga", name: "La Liga – Espanha", season: europeanSeason },
          78:  { key: "soccer_germany_bundesliga", name: "Bundesliga – Alemanha", season: europeanSeason },
          135: { key: "soccer_italy_serie_a", name: "Serie A – Itália", season: europeanSeason },
          61:  { key: "soccer_france_ligue_one", name: "Ligue 1 – França", season: europeanSeason },
          3:   { key: "soccer_uefa_europa_league", name: "UEFA Europa League", season: europeanSeason },
          848: { key: "soccer_uefa_europa_conference_league", name: "Conference League", season: europeanSeason },
          94:  { key: "soccer_portugal_primeira_liga", name: "Primeira Liga – Portugal", season: europeanSeason },
          88:  { key: "soccer_netherlands_eredivisie", name: "Eredivisie – Holanda", season: europeanSeason },
          203: { key: "soccer_turkey_super_league", name: "Süper Lig – Turquia", season: europeanSeason },
          128: { key: "soccer_argentina_primera_division", name: "Primera División – Argentina", season: brazilianSeason },
          262: { key: "soccer_mexico_ligamx", name: "Liga MX – México", season: brazilianSeason },
          253: { key: "soccer_usa_mls", name: "MLS – EUA", season: 2026 },
          98:  { key: "soccer_japan_j_league", name: "J1 League – Japão", season: 2026 },
        };

        // Passo 1: buscar IDs dos times que correspondem ao termo de pesquisa
        // Usar o termo original (sem forçar lowercase) pois API-Football faz busca case-insensitive internamente
        const teamsRes = await fetch(
          `${API_FOOTBALL_BASE}/teams?search=${encodeURIComponent(teamRaw)}`,
          { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
        ).then(r => r.ok ? r.json() : { response: [] }).catch(() => ({ response: [] }));

        const teamIds: number[] = (teamsRes.response || [])
          .slice(0, 5) // Limitar a 5 times para evitar muitas chamadas
          .map((t: any) => t.team?.id)
          .filter(Boolean);

        if (teamIds.length === 0) {
          cache.set(cacheKey, [], 2 * 60 * 1000);
          return res.json([]);
        }

        // Passo 2: buscar os próximos fixtures de cada time (next=3 pega partidas futuras sem precisar de season)
        const fixtureResponses = await Promise.all(
          teamIds.map(tid =>
            fetch(`${API_FOOTBALL_BASE}/fixtures?team=${tid}&next=3`,
              { headers: { "x-apisports-key": API_FOOTBALL_KEY } })
              .then(r => r.ok ? r.json() : { response: [] })
              .catch(() => ({ response: [] }))
          )
        );

        const allFixtures: any[] = [];
        const seenIds = new Set<number>();
        for (const res of fixtureResponses) {
          for (const f of (res.response || [])) {
            const fid = f.fixture?.id;
            if (!fid || seenIds.has(fid)) continue;
            seenIds.add(fid);
            const gameDate = new Date(f.fixture?.date).getTime();
            const status = f.fixture?.status?.short;
            if (status === "NS" && gameDate > nowMs && gameDate <= next24hMs) {
              allFixtures.push(f);
            }
          }
        }

        // Para cada fixture encontrado, tentar obter odds do cache ou buscar
        const bkPreferred = ["Bet365", "Betano", "William Hill", "Betfair", "Unibet", "10Bet", "Pinnacle", "1xBet"];

        for (const f of allFixtures) {
          const fid: number = f.fixture.id;
          const leagueId: number = f.league?.id;
          const leagueInfo = leagueIdToKey[leagueId];
          if (!leagueInfo) continue; // liga não suportada

          // Verificar cache de odds da liga
          let bookmakers: any[] = [];
          const leagueCache = cache.get<any[]>(`odds_${leagueInfo.key}`);
          if (leagueCache) {
            const cached = leagueCache.find((g: any) => g.id === `api-football-${fid}`);
            if (cached) bookmakers = cached.bookmakers || [];
          }

          // Se não tem no cache, buscar odds direto para este fixture
          if (bookmakers.length === 0) {
            try {
              const oddsRes = await fetch(
                `${API_FOOTBALL_BASE}/odds?fixture=${fid}`,
                { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
              );
              if (oddsRes.ok) {
                const oddsData = await oddsRes.json();
                const entry = (oddsData.response || [])[0];
                if (entry) {
                  const allBks: any[] = entry.bookmakers || [];
                  const bk = allBks.find((b: any) => bkPreferred.includes(b.name)) || allBks[0];
                  if (bk) {
                    const h2h = bk.bets?.find((b: any) => b.name === "Match Winner");
                    if (h2h) {
                      bookmakers = [{
                        key: "api-football",
                        title: bk.name,
                        markets: [{ key: "h2h", outcomes: h2h.values.map((v: any) => ({
                          name: v.value === "Home" ? f.teams?.home?.name : v.value === "Away" ? f.teams?.away?.name : "Empate",
                          price: parseFloat(v.odd)
                        }))}]
                      }];
                    }
                  }
                }
              }
            } catch (e) { /* sem odds, continua */ }
          }

          results.push({
            id: `api-football-${fid}`,
            sportKey: leagueInfo.key,
            sportTitle: leagueInfo.name,
            commenceTime: f.fixture.date,
            homeTeam: formatTeamName(f.teams?.home?.name || ""),
            awayTeam: formatTeamName(f.teams?.away?.name || ""),
            bookmakers
          });
        }

        results.sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());
      }

      cache.set(cacheKey, results, 5 * 60 * 1000);
      const blockedIds = await storage.getBlockedGameIds();
      res.json(blockedIds.size > 0 ? results.filter((g: any) => !blockedIds.has(g.id)) : results);
    } catch (error) {
      console.error("Error searching games:", error);
      res.status(500).json({ error: "Failed to search games" });
    }
  });

  app.get("/api/odds/:sportKey", async (req, res) => {
    try {
      const { sportKey } = req.params;
      const cacheKey = `odds_${sportKey}`;

      // Sempre tentar reutilizar o cache do games/today primeiro (odds reais, sem random fallback)
      // Isso evita chamadas individuais por fixture que geram odds aleatórias como fallback
      const todayCache = cache.get<any[]>("games_today");
      if (todayCache) {
        const leagueGames = todayCache.filter((g: any) => g.sportKey === sportKey);
        if (leagueGames.length > 0) {
          const blockedIds = await storage.getBlockedGameIds();
          return res.json(blockedIds.size > 0 ? leagueGames.filter((g: any) => !blockedIds.has(g.id)) : leagueGames);
        }
      }

      // Para o Brasileirão, reusar o cache unificado para evitar odds inconsistentes
      if (sportKey === "soccer_brazil_campeonato") {
        const brCache = cache.get<any[]>("games_brasileirao");
        if (brCache) {
          const blockedIds = await storage.getBlockedGameIds();
          return res.json(blockedIds.size > 0 ? brCache.filter((g: any) => !blockedIds.has(g.id)) : brCache);
        }
      }
      
      const cached = cache.get<any[]>(cacheKey);
      if (cached) {
        const blockedIds = await storage.getBlockedGameIds();
        return res.json(blockedIds.size > 0 ? cached.filter((g: any) => !blockedIds.has(g.id)) : cached);
      }
      
      let games: any[] = [];
      // Sempre usar API-Football como fonte principal de odds (assinatura ativa)
      let useApiFootball = true;
      
      // Usar API-Football como fallback
      if ((useApiFootball || games.length === 0) && API_FOOTBALL_KEY) {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        const europeanSeason = currentMonth >= 7 ? currentYear : currentYear - 1;
        const brazilianSeason = currentYear;
        
        const leagueMapping: Record<string, { id: number; name: string; season: number }> = {
          "soccer_brazil_campeonato": { id: 71, name: "Brasileirão Série A", season: brazilianSeason },
          "soccer_brazil_serie_b": { id: 72, name: "Brasileirão Série B", season: brazilianSeason },
          "soccer_brazil_copa_do_brasil": { id: 73, name: "Copa do Brasil", season: brazilianSeason },
          "soccer_conmebol_copa_libertadores": { id: 13, name: "Copa Libertadores", season: brazilianSeason },
          "soccer_conmebol_copa_sudamericana": { id: 11, name: "Copa Sudamericana", season: brazilianSeason },
          "soccer_epl": { id: 39, name: "Premier League", season: europeanSeason },
          "soccer_fa_cup": { id: 45, name: "FA Cup", season: europeanSeason },
          "soccer_spain_la_liga": { id: 140, name: "La Liga", season: europeanSeason },
          "soccer_italy_serie_a": { id: 135, name: "Serie A", season: europeanSeason },
          "soccer_germany_bundesliga": { id: 78, name: "Bundesliga", season: europeanSeason },
          "soccer_france_ligue_one": { id: 61, name: "Ligue 1", season: europeanSeason },
          "soccer_uefa_champs_league": { id: 2, name: "Champions League", season: europeanSeason },
          "soccer_uefa_europa_league": { id: 3, name: "Europa League", season: europeanSeason },
          "soccer_uefa_europa_conference_league": { id: 848, name: "Conference League", season: europeanSeason },
          "soccer_portugal_primeira_liga": { id: 94, name: "Primeira Liga", season: europeanSeason },
          "soccer_netherlands_eredivisie": { id: 88, name: "Eredivisie", season: europeanSeason },
          "soccer_turkey_super_league": { id: 203, name: "Süper Lig", season: europeanSeason },
          "soccer_argentina_primera_division": { id: 128, name: "Primera División", season: brazilianSeason },
          "soccer_mexico_ligamx": { id: 262, name: "Liga MX", season: brazilianSeason },
          "soccer_usa_mls": { id: 253, name: "MLS", season: 2026 },
          "soccer_japan_j_league": { id: 98, name: "J1 League", season: 2026 },
        };
        
        const league = leagueMapping[sportKey];
        if (league) {
          console.log(`Using API-Football for ${sportKey}`);

          const nowMs = Date.now();
          const next24hMs = nowMs + 24 * 60 * 60 * 1000;
          const today = toManausDateStr(nowMs);
          const next24hStr = toManausDateStr(next24hMs);
          
          const fetchFixtures = async (season: number) => {
            const fixturesResponse = await fetch(
              `${API_FOOTBALL_BASE}/fixtures?league=${league.id}&season=${season}&from=${today}&to=${next24hStr}`,
              { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
            );
            if (!fixturesResponse.ok) return [];
            const fixturesData = await fixturesResponse.json();
            return (fixturesData.response || []).filter((f: any) => {
              const status = f.fixture?.status?.short;
              const t = new Date(f.fixture?.date).getTime();
              return status === "NS" && t > nowMs && t <= next24hMs;
            }).slice(0, 15);
          };

          try {
            let fixtures = await fetchFixtures(league.season);

            // Se não encontrou jogos nas próximas 24h, retorna vazio (não tenta temporada anterior)
            if (fixtures.length === 0) {
              console.log(`No fixtures in next 24h for ${sportKey} season ${league.season}`);
            }

            if (fixtures.length > 0) {
              
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
                      const allBookmakers2: any[] = oddsData.response?.[0]?.bookmakers || [];
                      const preferredNames2 = ["Bet365", "Betano", "William Hill", "Betfair", "Unibet", "10Bet", "Pinnacle", "1xBet"];
                      let chosenBk2 = allBookmakers2.find(bk => preferredNames2.includes(bk.name)) || allBookmakers2[0];
                      const bets = chosenBk2?.bets || [];
                      const h2h = bets.find((b: any) => b.name === "Match Winner");
                      if (h2h && h2h.values?.length >= 2) {
                        bookmakers = [{
                          key: "api-football",
                          title: chosenBk2.name,
                          markets: [{
                            key: "h2h",
                            outcomes: h2h.values.map((v: any) => ({
                              name: v.value === "Home" ? formatTeamName(fixture.teams.home.name) : 
                                    v.value === "Away" ? formatTeamName(fixture.teams.away.name) : "Empate",
                              price: parseFloat(v.odd)
                            }))
                          }]
                        }];
                      } else {
                        bookmakers = [];
                      }
                    }
                  } catch (err) {
                    console.error("Error fetching fixture odds:", err);
                    bookmakers = [];
                  }
                  
                  return {
                    id: `api-football-${fixture.fixture.id}`,
                    sportKey: sportKey,
                    sportTitle: league.name,
                    commenceTime: fixture.fixture.date,
                    homeTeam: formatTeamName(fixture.teams.home.name),
                    awayTeam: formatTeamName(fixture.teams.away.name),
                    homeLogo: fixture.teams.home.logo,
                    awayLogo: fixture.teams.away.logo,
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
      const blockedIds = await storage.getBlockedGameIds();
      res.json(blockedIds.size > 0 ? games.filter((g: any) => !blockedIds.has(g.id)) : games);
    } catch (error) {
      console.error("Error fetching odds:", error);
      res.status(500).json({ error: "Failed to fetch odds" });
    }
  });

  const MAX_BET_PAYOUT = 15000;
  const DAILY_LIMIT = 50000;
  const MAX_MARKETS_PER_GAME = 3;

  app.get("/api/limits", async (req, res) => {
    try {
      const dailyTotal = await storage.getDailyTotalPotentialWin();
      const dailyRemaining = Math.max(0, DAILY_LIMIT - dailyTotal);
      res.json({
        dailyTotal,
        dailyLimit: DAILY_LIMIT,
        dailyRemaining,
        maxBetPayout: MAX_BET_PAYOUT,
        maxMarketsPerGame: MAX_MARKETS_PER_GAME,
        isDailyLimitReached: dailyTotal >= DAILY_LIMIT,
      });
    } catch (error) {
      console.error("Error fetching limits:", error);
      res.status(500).json({ error: "Erro ao buscar limites" });
    }
  });

  app.get("/api/admin/game-limits", async (req, res) => {
    try {
      const totals = await storage.getGameSimpleBetTotals();
      res.json({ totals, limit: MAX_BET_PAYOUT });
    } catch (error) {
      console.error("Error fetching game limits:", error);
      res.status(500).json({ error: "Erro ao buscar limites por jogo" });
    }
  });

  app.post("/api/bets", async (req, res) => {
    try {
      const validatedData = insertBetSlipSchema.parse(req.body);

      // Verificar se algum jogo já iniciou
      const now = new Date();
      for (const sel of validatedData.selections) {
        if (sel.commenceTime) {
          const gameStart = new Date(sel.commenceTime);
          if (gameStart <= now) {
            return res.status(400).json({
              error: `O jogo ${sel.homeTeam} x ${sel.awayTeam} já foi iniciado e não aceita mais apostas.`,
              isGameStarted: true,
            });
          }
        }
      }

      // Verificar se algum jogo do bilhete está bloqueado (limite de apostas simples atingido)
      {
        const blockedIds = await storage.getBlockedGameIds();
        if (blockedIds.size > 0) {
          for (const sel of validatedData.selections) {
            if (blockedIds.has(sel.gameId)) {
              return res.status(400).json({
                error: `O jogo ${sel.homeTeam} x ${sel.awayTeam} está temporariamente bloqueado para novas apostas. Escolha outro jogo.`,
                isGameLimitReached: true,
              });
            }
          }
        }
      }

      // Verificar máximo de 3 mercados por jogo
      const selectionsByGame: Record<string, number> = {};
      for (const sel of validatedData.selections) {
        selectionsByGame[sel.gameId] = (selectionsByGame[sel.gameId] || 0) + 1;
        if (selectionsByGame[sel.gameId] > MAX_MARKETS_PER_GAME) {
          return res.status(400).json({
            error: `Máximo de ${MAX_MARKETS_PER_GAME} mercados por jogo no bilhete`,
          });
        }
      }

      // Verificar limite de apostas simples por jogo (bloqueio a partir de R$14.000)
      if (validatedData.selections.length === 1) {
        const sel = validatedData.selections[0];
        const gameTotals = await storage.getGameSimpleBetTotals();
        const gameTotal = gameTotals.find(t => t.gameId === sel.gameId);
        const totalOddsPreview = sel.odds;
        const potentialWinPreview = validatedData.stake * totalOddsPreview;

        // Jogo já atingiu o limiar de bloqueio (>= R$14.000)
        if (gameTotal && gameTotal.isBlocked) {
          return res.status(400).json({
            error: `Este jogo atingiu o limite de apostas simples e está temporariamente bloqueado. Experimente uma aposta múltipla ou escolha outro jogo.`,
            isGameLimitReached: true,
          });
        }

        // Nova aposta ultrapassaria o limite de R$15.000
        if (gameTotal && (gameTotal.total + potentialWinPreview) > MAX_BET_PAYOUT) {
          const remaining = Math.max(0, MAX_BET_PAYOUT - gameTotal.total);
          if (remaining <= 0) {
            return res.status(400).json({
              error: `Este jogo atingiu o limite de apostas simples (R$15.000). Experimente uma aposta múltipla ou escolha outro jogo.`,
              isGameLimitReached: true,
            });
          }
          return res.status(400).json({
            error: `Retorno potencial excede o limite disponível para apostas simples neste jogo. Máximo disponível: R$${remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
            isGameLimitReached: true,
            remaining,
          });
        }
      }

      const dailyTotal = await storage.getDailyTotalPotentialWin();

      if (dailyTotal >= DAILY_LIMIT) {
        return res.status(400).json({
          error: "Para assegurar os pagamentos das apostas já feitas, o painel retomará em algumas horas.",
          isDailyLimitReached: true,
        });
      }

      const totalOdds = validatedData.selections.reduce((acc, sel) => acc * sel.odds, 1);
      let potentialWin = validatedData.stake * totalOdds;

      if (potentialWin > MAX_BET_PAYOUT) {
        return res.status(400).json({
          error: `O retorno potencial de R$${potentialWin.toFixed(2)} ultrapassa o limite máximo de R$${MAX_BET_PAYOUT.toLocaleString('pt-BR')},00 por bilhete. Reduza o valor apostado.`,
        });
      }

      const dailyRemaining = DAILY_LIMIT - dailyTotal;
      let cappedByDaily = false;
      if (potentialWin > dailyRemaining) {
        potentialWin = dailyRemaining;
        cappedByDaily = true;
      }

      const betSlip = await storage.createBetSlip(validatedData);

      const updatedBetSlip = { ...betSlip, potentialWin };
      if (betSlip.potentialWin !== potentialWin) {
        const { eq } = await import("drizzle-orm");
        const { db } = await import("./db");
        const { betSlipsTable } = await import("@shared/schema");
        await db.update(betSlipsTable)
          .set({ potentialWin })
          .where(eq(betSlipsTable.id, betSlip.id));
      }

      const txId = betSlip.id.replace(/-/g, '').substring(0, 25);
      const pixPayload = generatePixPayload(betSlip.stake, txId);
      const qrCodeDataUrl = await QRCode.toDataURL(pixPayload, { 
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      
      res.status(201).json({
        ...updatedBetSlip,
        pixCode: pixPayload,
        pixQrCode: qrCodeDataUrl,
        cappedAtMax: betSlip.potentialWin !== potentialWin && potentialWin === MAX_BET_PAYOUT,
        cappedByDaily,
        dailyRemaining: dailyRemaining - potentialWin,
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

  // Market settings (boost de odds por mercado)
  app.get("/api/market-settings", async (req, res) => {
    try {
      const cached = cache.get<any[]>("market_settings");
      if (cached) return res.json(cached);

      const settings = await storage.getMarketSettings();
      cache.set("market_settings", settings, 30 * 1000);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching market settings:", error);
      res.status(500).json({ error: "Failed to fetch market settings" });
    }
  });

  app.get("/api/admin/market-settings", async (req, res) => {
    try {
      const cached = cache.get<any[]>("market_settings");
      if (cached) return res.json(cached);

      const settings = await storage.getMarketSettings();
      cache.set("market_settings", settings, 30 * 1000);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching market settings:", error);
      res.status(500).json({ error: "Failed to fetch market settings" });
    }
  });

  app.put("/api/admin/market-settings", async (req, res) => {
    try {
      const updates = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "Body must be an array of { marketKey, boostPercent }" });
      }
      const result = await storage.updateMarketSettings(updates);
      cache.delete("market_settings");
      res.json(result);
    } catch (error) {
      console.error("Error updating market settings:", error);
      res.status(500).json({ error: "Failed to update market settings" });
    }
  });

  // Banner routes
  app.get("/api/banners", async (req, res) => {
    try {
      const cached = cache.get<any[]>("banners");
      if (cached) return res.json(cached);
      const banners = await storage.getBanners();
      cache.set("banners", banners, 5 * 1000);
      res.json(banners);
    } catch (error) {
      console.error("Error fetching banners:", error);
      res.status(500).json({ error: "Failed to fetch banners" });
    }
  });

  app.get("/api/banners/:slot/image", async (req, res) => {
    try {
      const slot = parseInt(req.params.slot);
      const banners = await storage.getBannersRaw();
      const banner = banners.find((b: any) => b.slotNumber === slot);
      if (!banner || !banner.imageData) {
        return res.status(404).send("Not found");
      }
      const mimeType = banner.mimeType || "image/jpeg";
      const buf = Buffer.from(banner.imageData, "base64");
      res.set("Content-Type", mimeType);
      res.set("Cache-Control", "public, max-age=86400");
      res.send(buf);
    } catch (error) {
      res.status(500).send("Error");
    }
  });

  app.post("/api/admin/banners/:slot", bannerUpload.single("image"), async (req, res) => {
    try {
      const slot = parseInt(req.params.slot);
      if (isNaN(slot) || slot < 1 || slot > 4) {
        return res.status(400).json({ error: "Slot must be 1-4" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
      }
      const imageData = fs.readFileSync(req.file.path).toString("base64");
      const mimeType = req.file.mimetype;
      fs.unlinkSync(req.file.path);
      const url = `/api/banners/${slot}/image`;
      const banner = await storage.upsertBanner(slot, req.file.originalname, url, imageData, mimeType);
      cache.delete("banners");
      res.json(banner);
    } catch (error) {
      console.error("Error uploading banner:", error);
      res.status(500).json({ error: "Failed to upload banner" });
    }
  });

  app.delete("/api/admin/banners/:slot", async (req, res) => {
    try {
      const slot = parseInt(req.params.slot);
      if (isNaN(slot) || slot < 1 || slot > 4) {
        return res.status(400).json({ error: "Slot must be 1-4" });
      }
      await storage.deleteBanner(slot);
      cache.delete("banners");
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting banner:", error);
      res.status(500).json({ error: "Failed to delete banner" });
    }
  });

  // Rules routes
  app.get("/api/rules", async (req, res) => {
    try {
      const content = await storage.getRules();
      res.json({ content });
    } catch (error) {
      console.error("Error fetching rules:", error);
      res.status(500).json({ error: "Failed to fetch rules" });
    }
  });

  app.post("/api/admin/rules", async (req, res) => {
    try {
      const { content } = req.body;
      if (typeof content !== "string") return res.status(400).json({ error: "content must be a string" });
      await storage.saveRules(content);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving rules:", error);
      res.status(500).json({ error: "Failed to save rules" });
    }
  });

  // Saques
  app.get("/api/admin/withdrawals", async (req, res) => {
    try {
      const withdrawals = await storage.getWithdrawals();
      res.json(withdrawals);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar saques" });
    }
  });

  app.post("/api/admin/withdrawals", async (req, res) => {
    try {
      const { amount, description } = req.body;
      if (!amount || typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({ error: "Valor inválido" });
      }
      const withdrawal = await storage.createWithdrawal(amount, description ?? "");
      res.json(withdrawal);
    } catch (error) {
      res.status(500).json({ error: "Erro ao registrar saque" });
    }
  });

  app.delete("/api/admin/withdrawals/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
      const deleted = await storage.deleteWithdrawal(id);
      if (!deleted) return res.status(404).json({ error: "Saque não encontrado" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir saque" });
    }
  });

  // Limpar cache do servidor (força recarga das odds do API-Football)
  app.post("/api/admin/clear-cache", async (req, res) => {
    try {
      cache.clear();
      console.log("[Admin] Cache limpo manualmente");
      res.json({ success: true, message: "Cache limpo com sucesso" });
    } catch (error) {
      res.status(500).json({ error: "Falha ao limpar cache" });
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
      const today = toManausDateStr(Date.now());
      const nextWeek = toManausDateStr(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
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
              homeTeam: formatTeamName(fixture.teams.home.name),
              awayTeam: formatTeamName(fixture.teams.away.name),
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
              homeTeam: formatTeamName(fixture.teams.home.name),
              awayTeam: formatTeamName(fixture.teams.away.name),
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
      
      const { homeTeam, awayTeam, commenceTime, gameId } = req.query;
      
      if (!homeTeam || !awayTeam) {
        return res.status(400).json({ error: "homeTeam and awayTeam are required" });
      }

      // Se temos o gameId com fixture ID da API-Football, usar diretamente (mais confiável)
      const directFixtureId = typeof gameId === "string" && gameId.startsWith("api-football-")
        ? gameId.replace("api-football-", "")
        : null;

      const cacheKey = `extra_markets_${directFixtureId || `${homeTeam}_${awayTeam}_${commenceTime || ''}`}`;
      const cached = cache.get<any>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      // Atalho: se temos o fixture ID diretamente, buscar odds sem name-matching
      if (directFixtureId) {
        console.log(`[API-Football] Using direct fixture ID: ${directFixtureId}`);
        const oddsResp = await fetch(
          `${API_FOOTBALL_BASE}/odds?fixture=${directFixtureId}`,
          { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
        );
        if (oddsResp.ok) {
          const oddsData = await oddsResp.json();
          const allBookmakers = oddsData.response?.[0]?.bookmakers || [];
          if (allBookmakers.length > 0) {
            const result = buildMarketsFromBookmaker(allBookmakers, String(homeTeam), String(awayTeam));
            cache.set(cacheKey, result, CACHE_TTL_FOOTBALL);
            return res.json(result);
          }
        }
        // Se a API não devolveu odds, retornar vazio (não gerar sintético)
        cache.set(cacheKey, { markets: [] }, CACHE_TTL_FOOTBALL);
        return res.json({ markets: [] });
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
      
      const from = toManausDateStr(fromDate.getTime());
      const to = toManausDateStr(toDate.getTime());
      
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
      const allBookmakers = oddsData.response?.[0]?.bookmakers || [];
      
      if (allBookmakers.length === 0) {
        cache.set(cacheKey, { markets: [] }, CACHE_TTL_FOOTBALL);
        return res.json({ markets: [] });
      }
      
      const result = {
        ...buildMarketsFromBookmaker(allBookmakers, matchingFixture.teams.home.name, matchingFixture.teams.away.name),
        fixtureId: matchingFixture.fixture.id,
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
      const fromDate = toManausDateStr(oldestGameDate.getTime() - 24 * 60 * 60 * 1000);
      const toDate = toManausDateStr(Math.min(newestGameDate.getTime() + 24 * 60 * 60 * 1000, today.getTime()));
      
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

  // Admin: Auto-resolver bilhete buscando resultado real na API-Football
  app.post("/api/admin/bets/:id/auto-resolve", async (req, res) => {
    try {
      const { id } = req.params;
      const bet = await storage.getBetSlip(id);
      if (!bet) return res.status(404).json({ error: "Bilhete não encontrado" });

      // Extrair fixture IDs únicos das seleções (formato: api-football-{fixtureId}-...)
      const fixtureIds = [...new Set(
        bet.selections
          .map(s => s.gameId.startsWith("api-football-") ? s.gameId.replace("api-football-", "") : null)
          .filter(Boolean) as string[]
      )];

      if (fixtureIds.length === 0) {
        return res.status(400).json({ error: "Bilhete sem fixtures da API-Football para resolver automaticamente." });
      }

      // Buscar resultados de todos os fixtures
      const fixtureResults = new Map<string, {
        statusShort: string;
        homeGoals: number; awayGoals: number;
        htHome: number; htAway: number;
        homeTeam: string; awayTeam: string;
      }>();

      for (const fid of fixtureIds) {
        const url = `https://v3.football.api-sports.io/fixtures?id=${fid}`;
        const resp = await fetch(url, {
          headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" }
        });
        const data: any = await resp.json();
        const fix = data?.response?.[0];
        if (!fix) continue;
        fixtureResults.set(fid, {
          statusShort: fix.fixture?.status?.short ?? "",
          homeGoals: fix.goals?.home ?? 0,
          awayGoals: fix.goals?.away ?? 0,
          htHome: fix.score?.halftime?.home ?? 0,
          htAway: fix.score?.halftime?.away ?? 0,
          homeTeam: fix.teams?.home?.name ?? "",
          awayTeam: fix.teams?.away?.name ?? "",
        });
      }

      // Verificar se todos os jogos terminaram
      const notFinished = fixtureIds.filter(fid => {
        const r = fixtureResults.get(fid);
        return !r || !["FT","AET","PEN","AWD","WO"].includes(r.statusShort);
      });
      if (notFinished.length > 0) {
        const statuses = notFinished.map(fid => fixtureResults.get(fid)?.statusShort || "não encontrado").join(", ");
        return res.status(422).json({ error: `Jogo ainda não encerrado (status: ${statuses}). Tente novamente após o fim da partida.` });
      }

      // Resolver cada seleção
      const resolvedSelections = bet.selections.map(sel => {
        const fid = sel.gameId.startsWith("api-football-") ? sel.gameId.replace("api-football-", "") : null;
        if (!fid) return sel;
        const fix = fixtureResults.get(fid);
        if (!fix) return sel;

        const { homeGoals, awayGoals, htHome, htAway, homeTeam, awayTeam } = fix;

        let selResult: "won" | "lost" = "lost";

        if (sel.marketKey === "h2h") {
          // Resultado 1X2
          const actual = homeGoals > awayGoals ? homeTeam
                       : awayGoals > homeGoals ? awayTeam
                       : "Empate";
          selResult = sel.outcome.trim().toLowerCase() === actual.trim().toLowerCase() ? "won" : "lost";

        } else if (sel.marketKey === "extra-1" || sel.marketKey === "extra-8" || sel.marketKey === "Both Teams Score") {
          // Ambas as equipes marcam (BTTS)
          const btts = homeGoals > 0 && awayGoals > 0;
          const betYes = sel.outcome.toLowerCase().includes("sim") || sel.outcome.toLowerCase().includes("yes");
          selResult = (btts === betYes) ? "won" : "lost";

        } else if (sel.marketKey === "extra-2" || sel.marketKey === "extra-9" || sel.marketKey === "HT/FT Double") {
          // HT/FT — formato: "HT/FT Double-{HT}/{FT}"
          const htResult = htHome > htAway ? homeTeam : htAway > htHome ? awayTeam : "Empate";
          const ftResult = homeGoals > awayGoals ? homeTeam : awayGoals > homeGoals ? awayTeam : "Empate";
          const actualCombo = `${htResult}/${ftResult}`;
          const outcomePart = sel.outcome.replace(/^HT\/FT Double-/i, "").trim();
          selResult = outcomePart.toLowerCase() === actualCombo.toLowerCase() ? "won" : "lost";

        } else if (sel.marketKey === "extra-5" || sel.marketKey === "Goals Over/Under") {
          // Total de gols (Over/Under 2.5)
          const total = homeGoals + awayGoals;
          const over = sel.outcome.toLowerCase().includes("over") || sel.outcome.toLowerCase().includes("acima") || sel.outcome.toLowerCase().includes("mais") || sel.outcome.toLowerCase().includes("sim");
          selResult = (over ? total > 2.5 : total <= 2.5) ? "won" : "lost";

        } else if (sel.marketKey === "extra-4" || sel.marketKey === "extra-11" || sel.marketKey === "Exact Score") {
          // Placar exato — formato: "X-Y" ou "X:Y"
          const outcomeParts = sel.outcome.match(/(\d+)[:\-](\d+)/);
          if (outcomeParts) {
            const [, og, ag] = outcomeParts;
            selResult = parseInt(og) === homeGoals && parseInt(ag) === awayGoals ? "won" : "lost";
          }
        }
        // Para outros mercados, mantém pending (não conseguimos resolver automaticamente)
        else {
          return sel; // mantém resultado anterior
        }

        return { ...sel, result: selResult };
      });

      // Calcular status geral
      const allResolved = resolvedSelections.every(s => s.result !== "pending");
      const anyLost = resolvedSelections.some(s => s.result === "lost");
      const newStatus: "pending" | "won" | "lost" = allResolved ? (anyLost ? "lost" : "won") : "pending";

      // Salvar seleções resolvidas individualmente e status
      let updatedBet = bet;
      for (const sel of resolvedSelections) {
        if (sel.result !== "pending") {
          const r = await storage.updateSelectionResult(updatedBet.id, sel.id, sel.result as "won" | "lost");
          if (r) updatedBet = r;
        }
      }
      if (newStatus !== "pending") {
        const r = await storage.updateBetSlipStatus(updatedBet.id, newStatus);
        if (r) updatedBet = r;
      }

      const resolvedCount = resolvedSelections.filter(s => s.result !== "pending").length;
      res.json({ bet: updatedBet, resolvedCount, total: bet.selections.length, status: newStatus });

    } catch (error) {
      console.error("Error auto-resolving bet:", error);
      res.status(500).json({ error: "Erro ao resolver bilhete automaticamente." });
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
