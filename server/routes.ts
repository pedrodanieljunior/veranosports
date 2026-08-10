import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, hashPassword, verifyPassword, getBrasiliaWeekStart } from "./storage";
import { insertBetSlipSchema, insertUserSchema, insertDefesaSchema } from "@shared/schema";
import { computeTotalOdds, checkIsComboBonus, getComboBonus, countH2HGames } from "@shared/oddsUtils";
import { computeCashOutOffer } from "@shared/cashOutUtils";
import { z } from "zod";
import { cache } from "./cache";
import { pool } from "./db";
import QRCode from "qrcode";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomBytes } from "crypto";
import nodemailer from "nodemailer";

// ─── Image Proxy (contorna bloqueio de hotlink do api-sports.io) ──────────────
async function setupImageProxy(app: Express) {
  app.get("/api/img-proxy", async (req: Request, res: Response) => {
    const raw = req.query.url as string | undefined;
    if (!raw) return res.status(400).send("missing url");
    let url: URL;
    try { url = new URL(raw); } catch { return res.status(400).send("invalid url"); }
    const allowed = ["media.api-sports.io", "media-2.api-sports.io", "media-3.api-sports.io", "media-4.api-sports.io"];
    if (!allowed.includes(url.hostname)) return res.status(403).send("forbidden host");
    try {
      const upstream = await fetch(url.toString(), {
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://api-sports.io/" },
      });
      if (!upstream.ok) return res.status(upstream.status).send("upstream error");
      const ct = upstream.headers.get("content-type") ?? "image/png";
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buf = await upstream.arrayBuffer();
      res.send(Buffer.from(buf));
    } catch {
      res.status(502).send("proxy error");
    }
  });
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) return res.status(401).json({ message: "Não autenticado" });
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.isAdmin) return res.status(403).json({ message: "Acesso restrito a administradores" });
  next();
}

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

const boostImgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// Formatar nome de time com Title Case, preservando conectivos portugueses em minúsculo
// Dicionário de tradução de nomes de seleções nacionais (Inglês → Português)
const NATIONAL_TEAM_PT: Record<string, string> = {
  "Afghanistan": "Afeganistão",
  "Albania": "Albânia",
  "Algeria": "Argélia",
  "Andorra": "Andorra",
  "Angola": "Angola",
  "Argentina": "Argentina",
  "Armenia": "Armênia",
  "Australia": "Austrália",
  "Austria": "Áustria",
  "Azerbaijan": "Azerbaijão",
  "Bahrain": "Bahrein",
  "Bangladesh": "Bangladesh",
  "Belarus": "Bielorrússia",
  "Belgium": "Bélgica",
  "Belize": "Belize",
  "Benin": "Benim",
  "Bhutan": "Butão",
  "Bolivia": "Bolívia",
  "Bosnia": "Bósnia",
  "Bosnia And Herzegovina": "Bósnia e Herzegovina",
  "Bosnia and Herzegovina": "Bósnia e Herzegovina",
  "Botswana": "Botsuana",
  "Brazil": "Brasil",
  "Bulgaria": "Bulgária",
  "Burkina Faso": "Burquina Faso",
  "Burundi": "Burundi",
  "Cambodia": "Camboja",
  "Cameroon": "Camarões",
  "Canada": "Canadá",
  "Cape Verde": "Cabo Verde",
  "Central African Republic": "Rep. Centro-Africana",
  "Chad": "Chade",
  "Chile": "Chile",
  "China": "China",
  "China PR": "China",
  "Colombia": "Colômbia",
  "Comoros": "Comores",
  "Congo": "Congo",
  "Congo DR": "Congo (RD)",
  "Costa Rica": "Costa Rica",
  "Croatia": "Croácia",
  "Cuba": "Cuba",
  "Cyprus": "Chipre",
  "Czech Republic": "República Tcheca",
  "Czechia": "República Tcheca",
  "Denmark": "Dinamarca",
  "Djibouti": "Djibuti",
  "Dominican Republic": "República Dominicana",
  "Ecuador": "Equador",
  "Egypt": "Egito",
  "El Salvador": "El Salvador",
  "England": "Inglaterra",
  "Equatorial Guinea": "Guiné Equatorial",
  "Eritrea": "Eritreia",
  "Estonia": "Estônia",
  "Eswatini": "Essuatíni",
  "Ethiopia": "Etiópia",
  "Faroe Islands": "Ilhas Faroé",
  "Fiji": "Fiji",
  "Finland": "Finlândia",
  "France": "França",
  "Gabon": "Gabão",
  "Gambia": "Gâmbia",
  "Georgia": "Geórgia",
  "Germany": "Alemanha",
  "Ghana": "Gana",
  "Gibraltar": "Gibraltar",
  "Greece": "Grécia",
  "Guatemala": "Guatemala",
  "Guinea": "Guiné",
  "Guinea-Bissau": "Guiné-Bissau",
  "Guyana": "Guiana",
  "Haiti": "Haiti",
  "Honduras": "Honduras",
  "Hungary": "Hungria",
  "Iceland": "Islândia",
  "India": "Índia",
  "Indonesia": "Indonésia",
  "Iran": "Irã",
  "Iraq": "Iraque",
  "Ireland": "Irlanda",
  "Israel": "Israel",
  "Italy": "Itália",
  "Ivory Coast": "Costa do Marfim",
  "Jamaica": "Jamaica",
  "Japan": "Japão",
  "Jordan": "Jordânia",
  "Kazakhstan": "Cazaquistão",
  "Kenya": "Quênia",
  "Kosovo": "Kosovo",
  "Kuwait": "Kuwait",
  "Kyrgyzstan": "Quirguistão",
  "Laos": "Laos",
  "Latvia": "Letônia",
  "Lebanon": "Líbano",
  "Lesotho": "Lesoto",
  "Liberia": "Libéria",
  "Libya": "Líbia",
  "Liechtenstein": "Liechtenstein",
  "Lithuania": "Lituânia",
  "Luxembourg": "Luxemburgo",
  "Madagascar": "Madagascar",
  "Malawi": "Maláui",
  "Malaysia": "Malásia",
  "Maldives": "Maldivas",
  "Mali": "Mali",
  "Malta": "Malta",
  "Mauritania": "Mauritânia",
  "Mauritius": "Maurício",
  "Mexico": "México",
  "Moldova": "Moldávia",
  "Mongolia": "Mongólia",
  "Montenegro": "Montenegro",
  "Morocco": "Marrocos",
  "Mozambique": "Moçambique",
  "Myanmar": "Mianmar",
  "Namibia": "Namíbia",
  "Nepal": "Nepal",
  "Netherlands": "Holanda",
  "New Zealand": "Nova Zelândia",
  "Nicaragua": "Nicarágua",
  "Niger": "Níger",
  "Nigeria": "Nigéria",
  "North Korea": "Coreia do Norte",
  "North Macedonia": "Macedônia do Norte",
  "Northern Ireland": "Irlanda do Norte",
  "Norway": "Noruega",
  "Oman": "Omã",
  "Pakistan": "Paquistão",
  "Palestine": "Palestina",
  "Panama": "Panamá",
  "Papua New Guinea": "Papua Nova Guiné",
  "Paraguay": "Paraguai",
  "Peru": "Peru",
  "Philippines": "Filipinas",
  "Poland": "Polônia",
  "Portugal": "Portugal",
  "Qatar": "Catar",
  "Republic of Ireland": "Irlanda",
  "Romania": "Romênia",
  "Russia": "Rússia",
  "Rwanda": "Ruanda",
  "San Marino": "San Marino",
  "Saudi Arabia": "Arábia Saudita",
  "Scotland": "Escócia",
  "Senegal": "Senegal",
  "Serbia": "Sérvia",
  "Sierra Leone": "Serra Leoa",
  "Singapore": "Singapura",
  "Slovakia": "Eslováquia",
  "Slovenia": "Eslovênia",
  "Somalia": "Somália",
  "South Africa": "África do Sul",
  "South Korea": "Coreia do Sul",
  "Korea Republic": "Coreia do Sul",
  "Korea DPR": "Coreia do Norte",
  "Spain": "Espanha",
  "Sri Lanka": "Sri Lanka",
  "Sudan": "Sudão",
  "Sweden": "Suécia",
  "Switzerland": "Suíça",
  "Syria": "Síria",
  "Taiwan": "Taiwan",
  "Chinese Taipei": "Taipei Chinês",
  "Tajikistan": "Tadjiquistão",
  "Tanzania": "Tanzânia",
  "Thailand": "Tailândia",
  "Togo": "Togo",
  "Trinidad And Tobago": "Trinidad e Tobago",
  "Trinidad and Tobago": "Trinidad e Tobago",
  "Tunisia": "Tunísia",
  "Turkey": "Turquia",
  "Turkmenistan": "Turcomenistão",
  "Uganda": "Uganda",
  "Ukraine": "Ucrânia",
  "United Arab Emirates": "Emirados Árabes Unidos",
  "United States": "Estados Unidos",
  "USA": "Estados Unidos",
  "Uruguay": "Uruguai",
  "Uzbekistan": "Uzbequistão",
  "Venezuela": "Venezuela",
  "Vietnam": "Vietnã",
  "Wales": "País de Gales",
  "Yemen": "Iêmen",
  "Zambia": "Zâmbia",
  "Zimbabwe": "Zimbábue",
  // Côte d'Ivoire (varia na API)
  "Ivory Coast": "Costa do Marfim",
  "Cote D'Ivoire": "Costa do Marfim",
  "Côte d'Ivoire": "Costa do Marfim",
  // Variações de nomes usadas pela API
  "IR Iran": "Irã",
  "Democratic Republic of Congo": "Congo (RD)",
  "DR Congo": "Congo (RD)",
  "Swaziland": "Essuatíni",
  "Macau": "Macau",
  "Curacao": "Curaçao",
  "Antigua And Barbuda": "Antígua e Barbuda",
  "Antigua and Barbuda": "Antígua e Barbuda",
  "Saint Kitts And Nevis": "São Cristóvão e Nevis",
  "Saint Lucia": "Santa Lúcia",
  "Saint Vincent": "São Vicente",
  "Saint Vincent And The Grenadines": "São Vicente e Granadinas",
  "Barbados": "Barbados",
  "Bermuda": "Bermudas",
  "Suriname": "Suriname",
  "Guadeloupe": "Guadalupe",
  "Martinique": "Martinica",
  "New Caledonia": "Nova Caledônia",
  "Tahiti": "Taiti",
  "Vanuatu": "Vanuatu",
  "Solomon Islands": "Ilhas Salomão",
  "Sao Tome and Principe": "São Tomé e Príncipe",
  "Seychelles": "Seicheles",
  "South Sudan": "Sudão do Sul",
};

function formatTeamName(name: string): string {
  if (!name) return name;
  // Verificar primeiro se é uma seleção nacional com tradução disponível
  if (NATIONAL_TEAM_PT[name]) return NATIONAL_TEAM_PT[name];
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

// Configuração PIX - CNPJ
const PIX_KEY = "22580407000178";
const PIX_NAME = "Verano Sports";
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
  "soccer_international_friendlies",
  "soccer_wc_qualifiers_conmebol",
  "soccer_wc_qualifiers_europe",
  "soccer_wc_qualifiers_concacaf",
  "soccer_wc_qualifiers_caf",
  "soccer_wc_qualifiers_afc",
  "soccer_wc_intercontinental",
];
const ALLOWED_LEAGUES_SET = new Set(ALLOWED_LEAGUES_ORDERED);

// Ordem de prioridade de bookmakers — respeitada em TODOS os pontos de seleção
const PREFERRED_BOOKMAKERS = ["Bet365", "Betano", "William Hill", "Betfair", "Unibet", "10Bet", "Pinnacle", "1xBet"];

// Seleciona o bookmaker de maior prioridade disponível na lista
// Itera pela lista de preferência na ordem correta, não pela lista de bookmakers retornados
function pickBestBookmaker(allBks: any[]): any {
  for (const name of PREFERRED_BOOKMAKERS) {
    const found = allBks.find((b: any) => b.name === name);
    if (found) return found;
  }
  return allBks[0] || null;
}

function extractExtraMarketsFromBets(bets: any[]): any[] {
  const extra: any[] = [];
  const dc = bets.find((b: any) => b.name === "Double Chance");
  if (dc && dc.values?.length >= 2) {
    const outcomes = dc.values.map((v: any) => ({
      name: v.value === "Home/Draw" ? "1X" : v.value === "Draw/Away" ? "X2" : v.value === "Home/Away" ? "12" : v.value,
      price: parseFloat(v.odd)
    })).filter((o: any) => !isNaN(o.price) && o.price > 0);
    if (outcomes.length >= 2) extra.push({ key: "double_chance", outcomes });
  }
  const ou = bets.find((b: any) => b.name === "Goals Over/Under");
  if (ou) {
    const outcomes = ou.values
      .filter((v: any) => /^(Over|Under)\s+[\d.]+$/.test(v.value))
      .map((v: any) => {
        const m = v.value.match(/^(Over|Under)\s+([\d.]+)$/);
        const dir = m[1] === "Over" ? "Mais" : "Menos";
        return { name: `${dir} ${m[2]}`, price: parseFloat(v.odd) };
      })
      .filter((o: any) => !isNaN(o.price) && o.price > 0)
      .sort((a: any, b: any) => {
        const lineA = parseFloat(a.name.split(" ")[1]);
        const lineB = parseFloat(b.name.split(" ")[1]);
        if (lineA !== lineB) return lineA - lineB;
        return a.name.startsWith("Mais") ? -1 : 1;
      });
    if (outcomes.length >= 2) extra.push({ key: "totals", outcomes });
  }
  return extra;
}

// Helper para converter dados de múltiplos bookmakers da API-Football em formato de mercados
// Estratégia: usar odds do melhor bookmaker disponível (Bet365 > Betano > ...).
// Para cada mercado, usa o bookmaker de maior prioridade que tenha aquele mercado.
// Nunca mistura nem faz média de odds entre bookmakers.
// ==========================================
// SGP (Same Game Parlay) Engine
// ==========================================

const SGP_FT_MARKETS = new Set([
  'h2h', 'match_winner', 'goals over/under', 'goals over/under - second half',
  'both teams score', 'both teams to score - second half', 'total - home', 'total - away',
]);
const SGP_HT_MARKETS = new Set([
  'first half winner', 'goals over/under first half', 'both teams score - first half',
]);

function isSGPEligibleMarket(marketKey: string): boolean {
  const mk = marketKey.toLowerCase();
  return SGP_FT_MARKETS.has(mk) || SGP_HT_MARKETS.has(mk);
}

interface ScoreLine { h: number; a: number; odd: number; prob: number; }
interface SGPSelInput { marketKey: string; outcome: string; }
type SGPPred = { type: 'ft' | 'ht'; pred: (h: number, a: number) => boolean };

function buildSGPPredicate(sel: SGPSelInput & { homeTeam: string; awayTeam: string }): SGPPred | null {
  const mk = sel.marketKey.toLowerCase();
  const oc = sel.outcome
    .replace(new RegExp(`^${sel.marketKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-:]\\s*`, 'i'), '')
    .toLowerCase()
    .trim();

  if (mk === 'h2h' || mk === 'match_winner') {
    if (oc.includes('empate') || oc.includes('draw') || oc === 'x')
      return { type: 'ft', pred: (h, a) => h === a };
    if (oc.includes(sel.homeTeam.toLowerCase()) || oc === 'home' || oc === '1' || oc === 'casa' || oc === '1')
      return { type: 'ft', pred: (h, a) => h > a };
    return { type: 'ft', pred: (h, a) => a > h };
  }

  if (mk === 'goals over/under') {
    const m = oc.match(/(over|under)\s*(\d+\.?\d*)/i);
    if (m) {
      const line = parseFloat(m[2]);
      const over = m[1].toLowerCase() === 'over';
      return { type: 'ft', pred: (h, a) => over ? h + a > line : h + a < line };
    }
    // Server simplifies "Goals Over/Under" to show only the 2.5 line as "Sim"/"Não"
    if (oc === 'sim' || oc === 'yes') return { type: 'ft', pred: (h, a) => h + a > 2.5 };
    if (oc === 'não' || oc === 'nao' || oc === 'no') return { type: 'ft', pred: (h, a) => h + a < 2.5 };
    return null;
  }

  if (mk === 'goals over/under first half') {
    const m = oc.match(/(over|under)\s*(\d+\.?\d*)/i);
    if (!m) return null;
    const line = parseFloat(m[2]);
    const over = m[1].toLowerCase() === 'over';
    return { type: 'ht', pred: (h, a) => over ? h + a > line : h + a < line };
  }

  if (mk === 'goals over/under - second half') return null; // needs joint distribution

  if (mk === 'both teams score') {
    const isYes = oc.includes('yes') || oc.includes('sim');
    return { type: 'ft', pred: (h, a) => isYes ? (h > 0 && a > 0) : !(h > 0 && a > 0) };
  }

  if (mk === 'both teams score - first half') {
    const isYes = oc.includes('yes') || oc.includes('sim');
    return { type: 'ht', pred: (h, a) => isYes ? (h > 0 && a > 0) : !(h > 0 && a > 0) };
  }

  if (mk === 'both teams to score - second half') return null; // needs joint

  if (mk === 'first half winner') {
    if (oc.includes('draw') || oc.includes('empate'))
      return { type: 'ht', pred: (h, a) => h === a };
    if (oc.includes('home') || oc.includes('casa') || oc.includes(sel.homeTeam.toLowerCase()))
      return { type: 'ht', pred: (h, a) => h > a };
    return { type: 'ht', pred: (h, a) => a > h };
  }

  if (mk === 'total - home') {
    const m = oc.match(/(over|under)\s*(\d+\.?\d*)/i);
    if (!m) return null;
    const line = parseFloat(m[2]);
    const over = m[1].toLowerCase() === 'over';
    return { type: 'ft', pred: (h, _a) => over ? h > line : h < line };
  }

  if (mk === 'total - away') {
    const m = oc.match(/(over|under)\s*(\d+\.?\d*)/i);
    if (!m) return null;
    const line = parseFloat(m[2]);
    const over = m[1].toLowerCase() === 'over';
    return { type: 'ft', pred: (_h, a) => over ? a > line : a < line };
  }

  return null;
}

function normalizeScoreLines(values: any[]): ScoreLine[] {
  const raw: ScoreLine[] = [];
  for (const v of values) {
    const m = String(v.value).match(/(\d+):(\d+)/);
    if (!m) continue;
    const odd = parseFloat(v.odd);
    if (!isFinite(odd) || odd <= 0) continue;
    raw.push({ h: parseInt(m[1]), a: parseInt(m[2]), odd, prob: 0 });
  }
  if (raw.length === 0) return [];
  const sumInv = raw.reduce((s, sc) => s + 1 / sc.odd, 0);
  raw.forEach(sc => { sc.prob = (1 / sc.odd) / sumInv; });
  return raw;
}

async function fetchScoreDist(fixtureId: string, betId: number): Promise<ScoreLine[] | null> {
  const cacheKey = `sgp_dist_${fixtureId}_bet${betId}`;
  const cached = cache.get<ScoreLine[]>(cacheKey);
  if (cached) return cached;
  if (!API_FOOTBALL_KEY) return null;
  try {
    const resp = await fetch(`${API_FOOTBALL_BASE}/odds?fixture=${fixtureId}&bet=${betId}`,
      { headers: { 'x-apisports-key': API_FOOTBALL_KEY } });
    const data = await resp.json();
    const allBks: any[] = data.response?.[0]?.bookmakers || [];
    const bk = pickBestBookmaker(allBks);
    if (!bk) return null;
    const bet = bk.bets?.find((b: any) => b.id === betId);
    if (!bet?.values?.length) return null;
    const lines = normalizeScoreLines(bet.values);
    if (lines.length > 0) cache.set(cacheKey, lines, CACHE_TTL_FOOTBALL);
    return lines.length > 0 ? lines : null;
  } catch { return null; }
}

function calcSGPProbability(ftLines: ScoreLine[], htLines: ScoreLine[] | null, preds: SGPPred[]): number {
  const ftPreds = preds.filter(p => p.type === 'ft');
  const htPreds = preds.filter(p => p.type === 'ht');
  const hasFT = ftPreds.length > 0;
  const hasHT = htPreds.length > 0;

  if (hasFT && !hasHT)
    return ftLines.filter(sc => ftPreds.every(p => p.pred(sc.h, sc.a))).reduce((s, sc) => s + sc.prob, 0);

  if (!hasFT && hasHT && htLines)
    return htLines.filter(sc => htPreds.every(p => p.pred(sc.h, sc.a))).reduce((s, sc) => s + sc.prob, 0);

  if (hasFT && hasHT && htLines) {
    let prob = 0;
    for (const ft of ftLines) {
      if (!ftPreds.every(p => p.pred(ft.h, ft.a))) continue;
      const valid = htLines.filter(ht => ht.h <= ft.h && ht.a <= ft.a);
      const validTotal = valid.reduce((s, ht) => s + ht.prob, 0);
      if (validTotal === 0) continue;
      for (const ht of valid) {
        if (htPreds.every(p => p.pred(ht.h, ht.a)))
          prob += ft.prob * (ht.prob / validTotal);
      }
    }
    return prob;
  }
  return 0;
}

const SGP_BOOST = 1.1;

// Busca a odd diretamente do mercado pré-construído "Results/Both Teams Score"
// usando o cache do extra-markets quando disponível (sem custo de quota adicional)
async function fetchResultBttsOdd(fixtureId: string, targetValue: string): Promise<number | null> {
  // 1) Tentar do cache processado pelo endpoint extra-markets
  const extraCached = cache.get<any>(`extra_markets_${fixtureId}`);
  if (extraCached?.markets) {
    const market = extraCached.markets.find((m: any) => m.name === "Results/Both Teams Score");
    if (market?.values?.length) {
      const val = market.values.find((v: any) =>
        String(v.value).toLowerCase() === targetValue.toLowerCase()
      );
      if (val) {
        const odd = parseFloat(val.odd);
        if (isFinite(odd) && odd > 0) return odd;
      }
      return null; // mercado encontrado mas outcome não disponível
    }
  }

  // 2) Tentar do cache de bookmakers brutos
  const rawCacheKey = `raw_bks_${fixtureId}`;
  let allBks: any[] = cache.get<any[]>(rawCacheKey) || [];

  if (allBks.length === 0) {
    if (!API_FOOTBALL_KEY) return null;
    try {
      const resp = await fetch(
        `${API_FOOTBALL_BASE}/odds?fixture=${fixtureId}`,
        { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
      );
      const data = await resp.json();
      allBks = data.response?.[0]?.bookmakers || [];
      if (allBks.length > 0) cache.set(rawCacheKey, allBks, CACHE_TTL_FOOTBALL);
    } catch { return null; }
  }

  // Ordem de preferência de bookmakers
  const sorted = [...PREFERRED_BOOKMAKERS]
    .map(name => allBks.find((b: any) => b.name === name))
    .filter(Boolean)
    .concat(allBks.filter((b: any) => !PREFERRED_BOOKMAKERS.includes(b.name)));

  for (const bk of sorted) {
    const bet = (bk.bets || []).find((b: any) => b.name === "Results/Both Teams Score");
    if (!bet?.values?.length) continue;
    const val = bet.values.find((v: any) =>
      String(v.value).toLowerCase() === targetValue.toLowerCase()
    );
    if (val) {
      const odd = parseFloat(val.odd);
      if (isFinite(odd) && odd > 0) return odd;
    }
  }
  return null;
}

// Fator de correlação para fallback quando Placar Exato não está disponível.
// Positivo (>1) = mercados positivamente correlacionados → odd combinada menor que naive.
// Negativo (<1) = correlação negativa → odd combinada maior que naive.
function getSGPCorrelationFactor(sels: Array<{ marketKey: string; outcome: string }>, homeTeam: string): number {
  const mk = (s: { marketKey: string }) => s.marketKey.toLowerCase();
  const oc = (s: { outcome: string }) => s.outcome.toLowerCase();

  const h2hSel = sels.find(s => mk(s) === 'h2h' || mk(s) === 'match_winner');
  const goalsSel = sels.find(s => mk(s) === 'goals over/under');
  const bttsSel = sels.find(s => mk(s) === 'both teams score' || mk(s) === 'btts');
  const htWinSel = sels.find(s => mk(s) === 'first half winner');
  const htGoalsSel = sels.find(s => mk(s) === 'goals over/under first half');
  const totalHomeSel = sels.find(s => mk(s) === 'total - home');
  const totalAwaySel = sels.find(s => mk(s) === 'total - away');

  if (h2hSel) {
    const h2hOc = oc(h2hSel);
    const isDraw = h2hOc.includes('empate') || h2hOc.includes('draw') || h2hOc === 'x';
    const isHome = !isDraw && (
      h2hOc.includes(homeTeam.toLowerCase()) || h2hOc === 'home' || h2hOc === '1' || h2hOc === 'casa'
    );
    const isAway = !isDraw && !isHome;

    // H2H + Gols 1T (first half goals) — correlação forte positiva
    if (htGoalsSel) {
      const htGoalsOc = oc(htGoalsSel);
      const isOver = htGoalsOc.includes('over');
      const lineMatch = htGoalsOc.match(/(\d+\.?\d*)/);
      const line = lineMatch ? parseFloat(lineMatch[1]) : 1.5;
      // Vencer o jogo + mais gols no 1T: correlação positiva (time favorito domina todo o jogo)
      if (isDraw) {
        return isOver ? (line <= 0.5 ? 1.35 : line <= 1.5 ? 1.10 : 0.90) : (line <= 0.5 ? 0.80 : 1.15);
      }
      // Home/Away win + HT over: forte correlação positiva
      return isOver ? (line <= 0.5 ? 1.55 : line <= 1.5 ? 1.45 : 1.30) : (line <= 0.5 ? 0.65 : line <= 1.5 ? 0.78 : 0.92);
    }

    // H2H + Resultado 1T
    if (htWinSel) {
      const htWinOc = oc(htWinSel);
      const htIsDraw = htWinOc.includes('empate') || htWinOc.includes('draw');
      const htIsHome = !htIsDraw && (htWinOc.includes('home') || htWinOc.includes('casa') || htWinOc.includes(homeTeam.toLowerCase()));
      // Vencer o jogo E vencer o 1T com mesmo time: forte correlação positiva
      if (isHome && htIsHome) return 1.55;
      if (isAway && !htIsHome && !htIsDraw) return 1.55;
      // Vencer jogo + empate 1T: correlação moderada (recuperação no 2T)
      if (!isDraw && htIsDraw) return 1.25;
      // Vencer jogo + 1T oposto: correlação negativa (improvável)
      return 0.65;
    }

    if (goalsSel) {
      const goalsOc = oc(goalsSel);
      const isOver = goalsOc.includes('over') || goalsOc.includes('sim');
      if (isDraw) return isOver ? 1.15 : 1.22;
      return isOver ? 1.22 : 0.72;
    }

    if (bttsSel) {
      const bttsOc = oc(bttsSel);
      const isYes = bttsOc.includes('sim') || bttsOc.includes('yes');
      if (isDraw) return isYes ? 1.28 : 0.80;
      return isYes ? 1.20 : 0.75;
    }

    if (totalHomeSel || totalAwaySel) {
      const sel = totalHomeSel || totalAwaySel!;
      const selOc = oc(sel);
      const isOver = selOc.includes('over');
      const isHomeTeamTotal = !!totalHomeSel;
      if (!isDraw && isOver && isHomeTeamTotal) return 1.30;
      if (!isDraw && isOver && !isHomeTeamTotal) return 1.18;
      return 1.10;
    }

    return 1.12;
  }

  // Sem h2h: correlações entre mercados de gols
  if (htGoalsSel && goalsSel) {
    const htOver = oc(htGoalsSel).includes('over');
    const ftOver = oc(goalsSel).includes('over') || oc(goalsSel).includes('sim');
    return htOver === ftOver ? 1.45 : 0.65; // Mesma direção: forte correlação; direções opostas: negativa
  }

  if (goalsSel && bttsSel) {
    const isOver = oc(goalsSel).includes('over') || oc(goalsSel).includes('sim');
    const isYes = oc(bttsSel).includes('sim') || oc(bttsSel).includes('yes');
    if (isOver && isYes) return 1.40;
    if (!isOver && !isYes) return 1.35;
    return 0.70;
  }

  return 1.10;
}

async function computeSGPOddForGame(
  fixtureId: string,
  homeTeam: string,
  awayTeam: string,
  sels: Array<{ marketKey: string; outcome: string; odds?: number; originalOdds?: number }>
): Promise<number | null> {
  if (sels.length < 2) return null;

  // ── ATALHO: h2h + btts (2 seleções) → usar mercado "Results/Both Teams Score" diretamente ──
  // Garante que a odd mostrada seja idêntica à odd do mercado combinado pré-construído
  if (sels.length === 2) {
    const h2hSel = sels.find(s => s.marketKey === 'h2h' || s.marketKey === 'match_winner');
    const bttsSel = sels.find(s => {
      const mk = s.marketKey.toLowerCase();
      return mk === 'both teams score' || mk === 'btts' || mk === 'ambas marcam';
    });

    if (h2hSel && bttsSel) {
      // Inferir resultado do h2h (Home / Draw / Away)
      const h2hOc = h2hSel.outcome
        .replace(/^(h2h|match.winner|resultado final)\s*[-:]\s*/i, '')
        .toLowerCase().trim();

      let resultKey: string;
      if (h2hOc.includes('empate') || h2hOc.includes('draw') || h2hOc === 'x') {
        resultKey = 'Draw';
      } else if (
        h2hOc.includes(homeTeam.toLowerCase()) ||
        h2hOc === 'home' || h2hOc === '1' || h2hOc === 'casa'
      ) {
        resultKey = 'Home';
      } else {
        resultKey = 'Away';
      }

      // Inferir BTTS (Yes / No)
      const bttsOc = bttsSel.outcome.toLowerCase();
      const bttsKey = (bttsOc.includes('sim') || bttsOc.includes('yes')) ? 'Yes' : 'No';

      const targetValue = `${resultKey}/${bttsKey}`;
      const directOdd = await fetchResultBttsOdd(fixtureId, targetValue);
      if (directOdd !== null) return directOdd;
      // Se não encontrou o mercado pré-construído, cai para o cálculo via Placar Exato
    }
  }

  // ── Cálculo via distribuição de Placar Exato (fallback e outros mercados) ──
  const preds = sels
    .map(s => buildSGPPredicate({ ...s, homeTeam, awayTeam }))
    .filter((p): p is SGPPred => p !== null);
  if (preds.length < 2) return null;

  const needsHT = preds.some(p => p.type === 'ht');
  const [ftLines, htLines] = await Promise.all([
    fetchScoreDist(fixtureId, 10),
    needsHT ? fetchScoreDist(fixtureId, 31) : Promise.resolve(null),
  ]);
  if (!ftLines || ftLines.length === 0) {
    // ── Fallback: Placar Exato indisponível → usar odds individuais + modelo de correlação ──
    const hasIndividualOdds = sels.every(s => typeof s.originalOdds === 'number' || typeof s.odds === 'number');
    if (!hasIndividualOdds) return null;

    // Usar originalOdds (sem boost) quando disponível; caso contrário estimar removendo o boost de 20%
    const rawProbs = sels.map(s => {
      const rawOdd = (typeof s.originalOdds === 'number' && s.originalOdds > 1)
        ? s.originalOdds
        : (s.odds || 1.5) / 1.2;
      return Math.min(0.95, Math.max(0.02, 1 / rawOdd));
    });

    const naiveJointProb = rawProbs.reduce((p, q) => p * q, 1);
    const corrFactor = getSGPCorrelationFactor(sels, homeTeam);
    const adjustedProb = naiveJointProb * corrFactor;

    if (adjustedProb <= 0 || adjustedProb >= 1) return null;
    // Usar SGP_BOOST reduzido para fallback (já são odds com margem embutida)
    return Math.round((1 / adjustedProb) * (SGP_BOOST * 0.95) * 100) / 100;
  }

  // Para combinações mistas FT+HT, o modelo condicional de placares subestima
  // a probabilidade real (ex: FT=1:0 exclui todos os placares HT com >1 gol).
  // Nesses casos, usar o modelo de correlação que dá resultados próximos às casas de aposta.
  const hasMixedFTHT = preds.some(p => p.type === 'ft') && preds.some(p => p.type === 'ht');
  if (!hasMixedFTHT) {
    const prob = calcSGPProbability(ftLines, htLines, preds);
    if (prob <= 0 || prob >= 1) return null;
    return Math.round((1 / prob) * SGP_BOOST * 100) / 100;
  }

  // Modelo de correlação para combinações FT+HT
  const hasIndividualOdds = sels.every(s => typeof s.originalOdds === 'number' || typeof s.odds === 'number');
  if (!hasIndividualOdds) return null;
  const rawProbs = sels.map(s => {
    const rawOdd = (typeof s.originalOdds === 'number' && s.originalOdds > 1)
      ? s.originalOdds
      : (s.odds || 1.5) / 1.2;
    return Math.min(0.95, Math.max(0.02, 1 / rawOdd));
  });
  const naiveJointProb = rawProbs.reduce((p, q) => p * q, 1);
  const corrFactor = getSGPCorrelationFactor(sels, homeTeam);
  const adjustedProb = naiveJointProb * corrFactor;
  if (adjustedProb <= 0 || adjustedProb >= 1) return null;
  // Usar boost reduzido: probabilidades individuais já têm margem embutida
  return Math.round((1 / adjustedProb) * (SGP_BOOST * 0.95) * 100) / 100;
}

function buildMarketsFromBookmaker(bookmakerOrBookmakers: any, homeTeam: string, awayTeam: string) {
  const bookmakers: any[] = Array.isArray(bookmakerOrBookmakers) ? bookmakerOrBookmakers : [bookmakerOrBookmakers];
  // Reordenar bookmakers pela lista de preferência
  const sorted = [...PREFERRED_BOOKMAKERS]
    .map(name => bookmakers.find((b: any) => b.name === name))
    .filter(Boolean)
    .concat(bookmakers.filter((b: any) => !PREFERRED_BOOKMAKERS.includes(b.name)));
  const primaryBookmaker = sorted[0] || bookmakers[0];
  return buildMarketsFromBookmakers(sorted, primaryBookmaker?.name || "API-Football", homeTeam, awayTeam);
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
    "Cards - Home": "Cartões - Casa",
    "Cards - Away": "Cartões - Fora",
    "Red Card In The Match (1st Half)": "Cartão Vermelho 1º Tempo",
    "Last Corner": "Último Escanteio",
    "To Qualify": "Classificação",
    "Corners Over Under First Half": "Escanteios 1º Tempo",
    "First Half Winner": "Resultado 1º Tempo"
  };

  const allowedMarkets = new Set([
    "Both Teams Score",
    "HT/FT Double",
    "Exact Score",
    "Goals Over/Under",
    "Goals Over/Under First Half",
    "Total - Home",
    "Total - Away",
    "Team To Score First",
    "Corners Over Under",
    "Total Corners",
    "Corners 1x2",
    "Corners Over Under First Half",
    "Cards Over/Under",
    "Cards - Home",
    "Cards - Away",
    "Red Card In The Match (1st Half)",
    "Home Team Total Cards",
    "Away Team Total Cards",
    "Total Corners (1st Half)",
    "First Half Winner",
    "Results/Both Teams Score",
    "Both Teams Score - First Half",
    "Both Teams To Score - Second Half",
  ]);

  // Normaliza nomes alternativos da API para os nomes internos
  const marketNameAliases: Record<string, string> = {
    "Home Team Total Cards":          "Cards - Home",
    "Away Team Total Cards":          "Cards - Away",
    "Total Corners (1st Half)":       "Corners Over Under First Half",
  };

  // Para cada mercado permitido, usar o bookmaker de MAIOR PRIORIDADE que o tenha.
  // Os bookmakers já chegam ordenados por prioridade (Bet365 primeiro).
  // Nunca mistura nem faz média — usa as odds exatas do melhor bookmaker disponível.
  const grouped: Record<string, { id: number; name: string; label: string; values: { value: string; odd: number }[] }> = {};

  for (const bk of bookmakers) {
    const bets: any[] = bk.bets || [];
    bets
      .filter((bet: any) => allowedMarkets.has(bet.name))
      .forEach((bet: any) => {
        const internalName = marketNameAliases[bet.name] || bet.name;
        if (grouped[internalName]) return; // já temos esse mercado de bookmaker mais prioritário
        const vals: { value: string; odd: number }[] = (bet.values || []).map((v: any) => ({
          value: String(v.value),
          odd: parseFloat(v.odd)
        }));
        if (vals.length > 0) {
          grouped[internalName] = {
            id: bet.id,
            name: internalName,
            label: marketLabels[internalName] || marketLabels[bet.name] || bet.name,
            values: vals
          };
        }
      });
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

  const overUnderMarkets = new Set([
    "Goals Over/Under", "Goals Over/Under First Half", "Goals Over/Under - Second Half",
    "Corners Over Under", "Total Corners", "Corners Over Under First Half",
    "Total - Home", "Total - Away", "Cards Over/Under",
  ]);

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
    "Goals Over/Under First Half": 2,
    "Total - Home": 3,
    "Total - Away": 4,
    "HT/FT Double": 5,
    "First Half Winner": 6,
    "Both Teams Score": 7,
    "Corners Over Under": 8,
    "Total Corners": 8,
    "Corners 1x2": 9,
    "Corners Over Under First Half": 10,
    "Cards Over/Under": 12,
    "Cards - Home": 13,
    "Cards - Away": 13,
    "Team To Score First": 14,
    "Red Card": 15,
    "Red Card In The Match (1st Half)": 15,
    "Results/Both Teams Score": 3,
    "Both Teams Score - First Half": 5,
    "Both Teams To Score - Second Half": 6,
    "Exact Score": 16,
  };

  const markets = Object.values(grouped).map((g) => {
    let values = g.values;
    let label = g.label;

    if (g.name === "Goals Over/Under") {
      // Excluded — shown via the dedicated totals market on the game card
      return null;
    } else if (g.name === "Goals Over/Under First Half" || g.name === "Goals Over/Under - Second Half") {
      values = values.filter(v => {
        const m = v.value.match(/^(Over|Under)\s+([\d.]+)$/i);
        if (!m) return true;
        return [0.5, 1.5, 2.5].includes(parseFloat(m[2]));
      });
      values = sortOverUnder(values);
    } else if (g.name === "Total - Home" || g.name === "Total - Away") {
      values = values.filter(v => {
        const m = v.value.match(/^(Over|Under)\s+([\d.]+)$/i);
        if (!m) return true;
        return [0.5, 1.5, 2.5].includes(parseFloat(m[2]));
      });
      values = sortOverUnder(values);
    } else if (g.name === "Cards Over/Under") {
      values = values.filter(v => {
        const m = v.value.match(/^(Over|Under)\s+([\d.]+)$/i);
        if (!m) return false;
        const line = parseFloat(m[2]);
        return line % 1 === 0.5 && line >= 1.5 && line <= 9.5;
      });
      values = sortOverUnder(values);
    } else if (g.name === "Cards - Home" || g.name === "Cards - Away") {
      values = values.filter(v => {
        const m = v.value.match(/^(Over|Under)\s+([\d.]+)$/i);
        if (!m) return false;
        const line = parseFloat(m[2]);
        return line % 1 === 0.5 && line >= 0.5 && line <= 6.5;
      });
      values = sortOverUnder(values);
    } else if (g.name === "Corners Over Under First Half") {
      values = values.filter(v => {
        const m = v.value.match(/^(Over|Under)\s+([\d.]+)$/i);
        if (!m) return true;
        return [4.5, 5.5, 6.5].includes(parseFloat(m[2]));
      });
      values = sortOverUnder(values);
    } else if (g.name === "Corners Over Under" || g.name === "Total Corners") {
      // Para cada linha obrigatória (8.5, 9.5, 10.5), usar o bookmaker de maior prioridade que a tenha.
      // Se o bookmaker principal (ex: Bet365) não tiver a linha, busca no próximo da lista.
      const REQUIRED_CORNER_LINES = ["8.5", "9.5", "10.5"];
      const CORNER_DEFAULTS: Record<string, { over: number; under: number }> = {
        "8.5":  { over: 1.72, under: 1.98 },
        "9.5":  { over: 2.00, under: 1.73 },
        "10.5": { over: 2.45, under: 1.52 },
      };
      const filled: { value: string; odd: number }[] = [];
      for (const line of REQUIRED_CORNER_LINES) {
        const escaped = line.replace(".", "\\.");
        const lineRe  = (dir: string) => new RegExp(`^${dir}\\s+${escaped}$`, "i");
        let over  = values.find(v => lineRe("Over").test(v.value));
        let under = values.find(v => lineRe("Under").test(v.value));
        // Linha ausente no bookmaker principal → percorrer os demais em prioridade
        if (!over || !under) {
          for (const bk of bookmakers) {
            const cornerBet = bk.bets?.find((b: any) =>
              b.name === "Corners Over Under" || b.name === "Total Corners"
            );
            if (!cornerBet) continue;
            const bkVals: { value: string; odd: number }[] = (cornerBet.values || []).map((v: any) => ({
              value: String(v.value),
              odd: parseFloat(v.odd)
            }));
            if (!over) {
              const found = bkVals.find(v => lineRe("Over").test(v.value));
              if (found) over = found;
            }
            if (!under) {
              const found = bkVals.find(v => lineRe("Under").test(v.value));
              if (found) under = found;
            }
            if (over && under) break;
          }
        }
        filled.push({ value: `Over ${line}`,  odd: over?.odd  ?? CORNER_DEFAULTS[line].over  });
        filled.push({ value: `Under ${line}`, odd: under?.odd ?? CORNER_DEFAULTS[line].under });
      }
      values = filled;
    } else if (overUnderMarkets.has(g.name)) {
      values = sortOverUnder(values);
    }

    if (values.length === 0) return null;
    return {
      id: g.id,
      name: g.name,
      label,
      values,
    };
  }).filter(Boolean).sort((a, b) => (marketOrder[a!.name] ?? 99) - (marketOrder[b!.name] ?? 99)) as { id: number; name: string; label: string; values: { value: string; odd: number }[] }[];

  // Garantir mercado de Escanteios sempre presente com as 3 linhas obrigatórias
  const hasCorners = markets.some(m => m.name === "Corners Over Under" || m.name === "Total Corners");
  if (!hasCorners) {
    markets.push({
      id: 45,
      name: "Corners Over Under",
      label: "Total de Escanteios",
      values: [
        { value: "Over 8.5",  odd: 1.72 },
        { value: "Under 8.5", odd: 1.98 },
        { value: "Over 9.5",  odd: 2.00 },
        { value: "Under 9.5", odd: 1.73 },
        { value: "Over 10.5", odd: 2.45 },
        { value: "Under 10.5",odd: 1.52 },
      ]
    });
    markets.sort((a, b) => (marketOrder[a.name] ?? 99) - (marketOrder[b.name] ?? 99));
  }

  // Fallbacks sintéticos para novos mercados
  if (!markets.some(m => m.name === "Goals Over/Under First Half")) {
    markets.push({
      id: 1001, name: "Goals Over/Under First Half", label: "Gols 1º Tempo",
      values: [
        { value: "Over 0.5", odd: 1.25 }, { value: "Under 0.5", odd: 3.80 },
        { value: "Over 1.5", odd: 2.55 }, { value: "Under 1.5", odd: 1.49 },
        { value: "Over 2.5", odd: 5.50 }, { value: "Under 2.5", odd: 1.14 },
      ]
    });
  }
  if (!markets.some(m => m.name === "Total - Home")) {
    markets.push({
      id: 1002, name: "Total - Home", label: "Total Gols Casa",
      values: [
        { value: "Over 0.5", odd: 1.57 }, { value: "Under 0.5", odd: 2.25 },
        { value: "Over 1.5", odd: 2.90 }, { value: "Under 1.5", odd: 1.42 },
        { value: "Over 2.5", odd: 5.50 }, { value: "Under 2.5", odd: 1.14 },
      ]
    });
  }
  if (!markets.some(m => m.name === "Total - Away")) {
    markets.push({
      id: 1003, name: "Total - Away", label: "Total Gols Visitante",
      values: [
        { value: "Over 0.5", odd: 1.72 }, { value: "Under 0.5", odd: 2.10 },
        { value: "Over 1.5", odd: 3.40 }, { value: "Under 1.5", odd: 1.31 },
        { value: "Over 2.5", odd: 7.00 }, { value: "Under 2.5", odd: 1.10 },
      ]
    });
  }
  if (!markets.some(m => m.name === "First Half Winner")) {
    markets.push({
      id: 1004, name: "First Half Winner", label: "Resultado 1º Tempo",
      values: [
        { value: "Home", odd: 2.50 },
        { value: "Draw", odd: 2.20 },
        { value: "Away", odd: 3.50 },
      ]
    });
  }
  if (!markets.some(m => m.name === "Corners 1x2")) {
    markets.push({
      id: 1006, name: "Corners 1x2", label: "Escanteios 1x2",
      values: [
        { value: "Home", odd: 2.10 },
        { value: "Draw", odd: 3.80 },
        { value: "Away", odd: 2.60 },
      ]
    });
  }
  if (!markets.some(m => m.name === "Corners Over Under First Half")) {
    markets.push({
      id: 1008, name: "Corners Over Under First Half", label: "Escanteios 1º Tempo",
      values: [
        { value: "Over 4.5", odd: 2.00 }, { value: "Under 4.5", odd: 1.73 },
        { value: "Over 5.5", odd: 2.80 }, { value: "Under 5.5", odd: 1.43 },
        { value: "Over 6.5", odd: 4.20 }, { value: "Under 6.5", odd: 1.20 },
      ]
    });
  }

  markets.sort((a, b) => (marketOrder[a.name] ?? 99) - (marketOrder[b.name] ?? 99));

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
      name: "Goals Over/Under",
      label: "Total de Gols",
      values: [
        { value: "Over 1.5", odd: r(1.45, 1.60) },
        { value: "Under 1.5", odd: r(2.20, 2.60) },
        { value: "Over 2.5", odd: r(1.75, 1.95) },
        { value: "Under 2.5", odd: r(1.75, 1.95) },
        { value: "Over 3.5", odd: r(2.50, 2.90) },
        { value: "Under 3.5", odd: r(1.38, 1.50) },
      ]
    },
    {
      id: 1001,
      name: "Goals Over/Under First Half",
      label: "Gols 1º Tempo",
      values: [
        { value: "Over 0.5", odd: r(1.20, 1.30) }, { value: "Under 0.5", odd: r(3.50, 4.20) },
        { value: "Over 1.5", odd: r(2.40, 2.70) }, { value: "Under 1.5", odd: r(1.44, 1.55) },
        { value: "Over 2.5", odd: r(5.00, 6.00) }, { value: "Under 2.5", odd: r(1.10, 1.18) },
      ]
    },
    {
      id: 1002,
      name: "Total - Home",
      label: "Total Gols Casa",
      values: [
        { value: "Over 0.5", odd: r(1.50, 1.65) }, { value: "Under 0.5", odd: r(2.10, 2.40) },
        { value: "Over 1.5", odd: r(2.80, 3.00) }, { value: "Under 1.5", odd: r(1.38, 1.46) },
        { value: "Over 2.5", odd: r(5.00, 6.00) }, { value: "Under 2.5", odd: r(1.10, 1.18) },
      ]
    },
    {
      id: 1003,
      name: "Total - Away",
      label: "Total Gols Visitante",
      values: [
        { value: "Over 0.5", odd: r(1.65, 1.80) }, { value: "Under 0.5", odd: r(2.00, 2.20) },
        { value: "Over 1.5", odd: r(3.20, 3.60) }, { value: "Under 1.5", odd: r(1.28, 1.35) },
        { value: "Over 2.5", odd: r(6.50, 7.50) }, { value: "Under 2.5", odd: r(1.08, 1.12) },
      ]
    },
    {
      id: 1004,
      name: "First Half Winner",
      label: "Resultado 1º Tempo",
      values: [
        { value: "Home", odd: r(2.30, 2.70) },
        { value: "Draw", odd: r(2.00, 2.40) },
        { value: "Away", odd: r(3.20, 3.80) },
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
      id: 45,
      name: "Corners Over Under",
      label: "Total de Escanteios",
      values: [
        { value: "Over 8.5",  odd: 1.72 },
        { value: "Under 8.5", odd: 1.98 },
        { value: "Over 9.5",  odd: 2.00 },
        { value: "Under 9.5", odd: 1.73 },
        { value: "Over 10.5", odd: 2.45 },
        { value: "Under 10.5",odd: 1.52 },
      ]
    },
    {
      id: 1006,
      name: "Corners 1x2",
      label: "Escanteios 1x2",
      values: [
        { value: "Home", odd: r(1.95, 2.25) },
        { value: "Draw", odd: r(3.50, 4.20) },
        { value: "Away", odd: r(2.40, 2.80) },
      ]
    },
    {
      id: 1008,
      name: "Corners Over Under First Half",
      label: "Escanteios 1º Tempo",
      values: [
        { value: "Over 4.5", odd: r(1.90, 2.10) }, { value: "Under 4.5", odd: r(1.68, 1.78) },
        { value: "Over 5.5", odd: r(2.60, 2.90) }, { value: "Under 5.5", odd: r(1.38, 1.48) },
        { value: "Over 6.5", odd: r(4.00, 4.50) }, { value: "Under 6.5", odd: r(1.16, 1.24) },
      ]
    },
  ];
}

// Mapeamento de sport keys → league IDs da API-Football (usado em runCheckResults e registerRoutes)
const LEAGUE_MAPPING: Record<string, number> = {
  "soccer_brazil_campeonato": 71,
  "soccer_brazil_serie_b": 72,
  "soccer_brazil_copa_do_brasil": 73,
  "soccer_conmebol_copa_libertadores": 13,
  "soccer_conmebol_copa_sudamericana": 11,
  "soccer_argentina_primera_division": 128,
  "soccer_uefa_champs_league": 2,
  "soccer_uefa_europa_league": 3,
  "soccer_uefa_europa_conference_league": 848,
  "soccer_epl": 39,
  "soccer_efl_champ": 40,
  "soccer_fa_cup": 45,
  "soccer_spain_la_liga": 140,
  "soccer_italy_serie_a": 135,
  "soccer_germany_bundesliga": 78,
  "soccer_france_ligue_one": 61,
  "soccer_portugal_primeira_liga": 94,
  "soccer_netherlands_eredivisie": 88,
  "soccer_turkey_super_league": 203,
  "soccer_belgium_first_div": 144,
  "soccer_usa_mls": 253,
  "soccer_mexico_ligamx": 262,
  "soccer_japan_j_league": 98,
  "soccer_international_friendlies": 10,
  "soccer_wc_qualifiers_conmebol": 34,
  "soccer_wc_qualifiers_europe": 32,
  "soccer_wc_qualifiers_concacaf": 31,
  "soccer_wc_qualifiers_caf": 29,
  "soccer_wc_qualifiers_afc": 30,
  "soccer_wc_intercontinental": 43,
  "soccer_fifa_world_cup": 1,
  "soccer_copa_america": 9,
  "soccer_africa_cup_of_nations": 6,
};

// Ligas com temporada no formato calendário (jan–dez), não europeu (ago–jul)
const CALENDAR_YEAR_LEAGUES = new Set([
  71, 72, 73,
  11, 13, 128,
  253, 262, 98,
  10,
  34, 32, 31, 29, 30, 43,
  1, 9, 6,
]);

async function runCheckResults() {
  const cornerStatsCache     = new Map<number, number>();       // fid → total
  const cornerHomeCache      = new Map<number, number>();       // fid → escanteios casa
  const cornerAwayCache      = new Map<number, number>();       // fid → escanteios visitante
  const cardHomeCache        = new Map<number, number>();       // fid → cartões casa (amarelo+vermelho)
  const cardAwayCache        = new Map<number, number>();       // fid → cartões visitante
  const firstGoalCache       = new Map<number, string | null>();
  const redCardCache     = new Map<number, boolean>();
  const redCard1HCache   = new Map<number, boolean>();

  const allBets = await storage.getAllBetSlips();
  const pendingBets = allBets.filter(bet => bet.status === "pending");

  if (pendingBets.length === 0) {
    return { message: "Nenhum bilhete pendente", totalPending: 0, updated: 0, fixturesChecked: 0, results: [] };
  }

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

  if (newestGameDate.getTime() === 0) {
    newestGameDate = today;
    oldestGameDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const fromDate = new Date(oldestGameDate.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = new Date(newestGameDate.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  console.log(`[CheckResults] Buscando resultados de ${fromDate} até ${toDate}`);

  const oldestYear = oldestGameDate.getFullYear();
  const oldestMonth = oldestGameDate.getMonth();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const oldEuropeanSeason = oldestMonth < 7 ? oldestYear - 1 : oldestYear;
  const currentEuropeanSeason = currentMonth < 7 ? currentYear - 1 : currentYear;
  const oldBrazilianSeason = oldestYear;
  const currentBrazilianSeason = currentYear;

  const leaguesToCheck: { id: number; season: number }[] = [];
  const addedPairs = new Set<string>();

  for (const leagueId of Object.values(LEAGUE_MAPPING)) {
    const isCalendar = CALENDAR_YEAR_LEAGUES.has(leagueId);
    const mainSeason = isCalendar ? currentBrazilianSeason : currentEuropeanSeason;
    const oldSeason  = isCalendar ? oldBrazilianSeason     : oldEuropeanSeason;
    const mainKey = `${leagueId}-${mainSeason}`;
    if (!addedPairs.has(mainKey)) { leaguesToCheck.push({ id: leagueId, season: mainSeason }); addedPairs.add(mainKey); }
    if (oldSeason !== mainSeason) {
      const oldKey = `${leagueId}-${oldSeason}`;
      if (!addedPairs.has(oldKey)) { leaguesToCheck.push({ id: leagueId, season: oldSeason }); addedPairs.add(oldKey); }
    }
  }

  let allFinishedFixtures: any[] = [];
  for (const league of leaguesToCheck) {
    try {
      const response = await fetch(
        `${API_FOOTBALL_BASE}/fixtures?league=${league.id}&season=${league.season}&from=${fromDate}&to=${toDate}&status=FT`,
        { headers: { "x-apisports-key": API_FOOTBALL_KEY! } }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.response) allFinishedFixtures = [...allFinishedFixtures, ...data.response];
      }
    } catch (err) {
      console.log(`[CheckResults] Erro ao buscar liga ${league.id}:`, err);
    }
  }

  // ── Fallback por fixture ID ────────────────────────────────────────────────
  // Para seleções pendentes cujo commenceTime + 3h já passou e não foram
  // encontradas no pool por liga (ex: amistosos em liga diferente, atraso
  // de atualização de status na API), busca diretamente pelo fixture ID.
  {
    const now = new Date();
    const FINISHED_STATUSES = new Set(["FT","AET","PEN","AWD","WO"]);
    const alreadyInPool = new Set(allFinishedFixtures.map((f: any) => f.fixture.id));
    const fallbackIds = new Set<number>();

    for (const bet of pendingBets) {
      for (const sel of bet.selections) {
        if (sel.result && sel.result !== "pending") continue;
        if (!sel.gameId?.startsWith("api-football-")) continue;
        const fid = parseInt(sel.gameId.replace("api-football-", "").split("-")[0]);
        if (isNaN(fid) || alreadyInPool.has(fid)) continue;
        // Só busca se o jogo deveria ter terminado (commenceTime + 3h < agora)
        if (sel.commenceTime) {
          const shouldEndBy = new Date(new Date(sel.commenceTime).getTime() + 3 * 60 * 60 * 1000);
          if (shouldEndBy > now) continue;
        }
        fallbackIds.add(fid);
      }
    }

    for (const fid of fallbackIds) {
      try {
        const resp = await fetch(`${API_FOOTBALL_BASE}/fixtures?id=${fid}`, {
          headers: { "x-apisports-key": API_FOOTBALL_KEY! }
        });
        if (resp.ok) {
          const data = await resp.json();
          const fix = data?.response?.[0];
          if (fix && FINISHED_STATUSES.has(fix.fixture?.status?.short)) {
            allFinishedFixtures.push(fix);
            console.log(`[CheckResults] Fallback fixture ${fid}: ${fix.teams.home.name} vs ${fix.teams.away.name} → ${fix.fixture.status.short} ✓`);
          } else if (fix) {
            console.log(`[CheckResults] Fallback fixture ${fid}: status=${fix.fixture?.status?.short} (ainda não finalizado)`);
          }
        }
      } catch (err) {
        console.log(`[CheckResults] Erro fallback fixture ${fid}:`, err);
      }
    }
  }

  let updatedCount = 0;
  const results: any[] = [];

  for (const bet of pendingBets) {
    let allSelectionsResolved = true;
    let allSelectionsWon = true;
    let selectionsUpdated = false;

    for (const selection of bet.selections) {
      // Super Boost Verano: NUNCA resolvido automaticamente — sempre pelo admin manualmente
      // Este check vem ANTES do check de result para evitar que boost "lost" incorreto bloqueie o bilhete
      if (selection.marketKey === "boost") {
        if (!selection.result || selection.result === "pending") {
          allSelectionsResolved = false; // ainda aguarda resolução manual
        } else if (selection.result === "lost") {
          allSelectionsWon = false; // admin marcou como perdido
        }
        // se "won", não afeta allSelectionsWon (correto)
        continue;
      }

      // Copa cards (Grupos, Longo Prazo, Especiais): NUNCA resolvidos automaticamente
      // Sempre pelo admin manualmente — resultado não depende de placar de partida simples
      if (selection.gameId?.startsWith("copa-card-")) {
        if (!selection.result || selection.result === "pending") {
          allSelectionsResolved = false;
        } else if (selection.result === "lost") {
          allSelectionsWon = false;
        }
        continue;
      }

      if (selection.result && selection.result !== "pending") {
        if (selection.result === "lost") allSelectionsWon = false;
        continue;
      }

      const matchingFixture = allFinishedFixtures.find((fixture: any) =>
        teamsMatch(fixture.teams.home.name, selection.homeTeam) &&
        teamsMatch(fixture.teams.away.name, selection.awayTeam)
      );

      if (!matchingFixture) { allSelectionsResolved = false; continue; }

      // Usar placar do tempo regulamentar (90min) — score.fulltime é apenas 90min,
      // enquanto goals.home/away inclui gols da prorrogação (status AET/PEN).
      // Apostas h2h, gols, BTTS etc. são sempre liquidadas nos 90 minutos.
      const homeGoals = matchingFixture.score?.fulltime?.home ?? matchingFixture.goals.home;
      const awayGoals = matchingFixture.score?.fulltime?.away ?? matchingFixture.goals.away;
      const totalGoals = homeGoals + awayGoals;
      const htHomeGoals = matchingFixture.score?.halftime?.home ?? null;
      const htAwayGoals = matchingFixture.score?.halftime?.away ?? null;
      const mk = selection.marketKey?.toLowerCase() || "";

      const isCornerSelection =
        mk.includes("corner") ||
        mk === "live_m20" ||
        selection.outcome?.toLowerCase().includes("corner") ||
        selection.marketName?.toLowerCase().includes("escanteio") ||
        selection.marketName?.toLowerCase().includes("corner");

      const isCardSelection =
        (mk.includes("cards") && !mk.includes("red card")) ||
        mk === "live_m119";

      // Busca estatísticas (escanteios + cartões) quando necessário
      let totalCorners: number | null = null;
      if (isCornerSelection || isCardSelection) {
        const fixtureId = matchingFixture.fixture.id;
        const needsCorners = isCornerSelection && !cornerStatsCache.has(fixtureId);
        const needsCards   = isCardSelection   && !cardHomeCache.has(fixtureId);
        if (needsCorners || needsCards) {
          try {
            const statsRes = await fetch(`${API_FOOTBALL_BASE}/fixtures/statistics?fixture=${fixtureId}`, { headers: { "x-apisports-key": API_FOOTBALL_KEY! } });
            if (statsRes.ok) {
              const statsData = await statsRes.json();
              let homeCorners = 0; let awayCorners = 0;
              let homeYellow = 0; let homeRed = 0; let awayYellow = 0; let awayRed = 0;
              let foundCornerStat = false;
              for (const teamStat of statsData.response || []) {
                const isHome = teamsMatch(teamStat.team.name, matchingFixture.teams.home.name);
                for (const s of teamStat.statistics || []) {
                  const rawVal = s.value;
                  const val = rawVal !== null && rawVal !== undefined && rawVal !== "" ? parseInt(String(rawVal)) : null;
                  if (s.type === "Corner Kicks" && val !== null && !isNaN(val)) {
                    foundCornerStat = true;
                    if (isHome) homeCorners = val; else awayCorners = val;
                  }
                  if (s.type === "Yellow Cards" && val !== null && !isNaN(val)) { if (isHome) homeYellow = val; else awayYellow = val; }
                  if (s.type === "Red Cards"    && val !== null && !isNaN(val)) { if (isHome) homeRed = val; else awayRed = val; }
                }
              }
              // Só aceita como válido se encontrou Corner Kicks e o total é > 0
              // (API retorna 0 quando os dados ainda não estão prontos — não cachear para retry)
              if (foundCornerStat && (homeCorners + awayCorners) > 0) {
                cornerStatsCache.set(fixtureId, homeCorners + awayCorners);
                cornerHomeCache.set(fixtureId, homeCorners);
                cornerAwayCache.set(fixtureId, awayCorners);
                console.log(`[CheckResults] Stats fixture ${fixtureId}: corners=${homeCorners + awayCorners} (${homeCorners}/${awayCorners})`);
              } else if (foundCornerStat) {
                console.log(`[CheckResults] Stats fixture ${fixtureId}: Corner Kicks retornou 0+0 — dados ainda não prontos, mantendo pendente`);
              } else {
                console.log(`[CheckResults] Stats fixture ${fixtureId}: Corner Kicks não encontrado na resposta da API — mantendo pendente`);
              }
              if (!cardHomeCache.has(fixtureId)) {
                cardHomeCache.set(fixtureId, homeYellow + homeRed * 2);
                cardAwayCache.set(fixtureId, awayYellow + awayRed * 2);
              }
            }
          } catch (err) { console.log(`[CheckResults] Erro stats fixture ${fixtureId}:`, err); }
        }
        totalCorners = cornerStatsCache.get(fixtureId) ?? null;
      }

      // Para escanteios 1º tempo: buscar do banco (capturado ao vivo no HT)
      let homeCorners1H: number | null = null;
      let awayCorners1H: number | null = null;
      if (mk.includes("corner") && mk.includes("first half")) {
        const fixtureId = matchingFixture.fixture.id;
        const ht = await storage.getFixtureHalftimeStats(fixtureId);
        if (ht) { homeCorners1H = ht.homeCorners; awayCorners1H = ht.awayCorners; }
      }

      const isFirstScorerSelection = mk.includes("team to score first") || mk.includes("score first");
      const isRedCardSelection = mk.includes("red card");
      let firstScorerTeam: string | null = null;
      let hasRedCard: boolean | null = null;
      let hasRedCard1H: boolean | null = null;

      if (isFirstScorerSelection || isRedCardSelection) {
        const fixtureId = matchingFixture.fixture.id;
        if (!firstGoalCache.has(fixtureId)) {
          try {
            const evRes = await fetch(`${API_FOOTBALL_BASE}/fixtures/events?fixture=${fixtureId}`, { headers: { "x-apisports-key": API_FOOTBALL_KEY! } });
            if (evRes.ok) {
              const evData = await evRes.json();
              const events = evData.response || [];
              const goalEvents = events.filter((e: any) => e.type === "Goal" && e.detail !== "Missed Penalty").sort((a: any, b: any) => (a.time?.elapsed ?? 999) - (b.time?.elapsed ?? 999));
              firstGoalCache.set(fixtureId, goalEvents[0]?.team?.name ?? "");
              const rcEvents = events.filter((e: any) => e.type === "Card" && e.detail === "Red Card");
              redCardCache.set(fixtureId, rcEvents.length > 0);
              redCard1HCache.set(fixtureId, rcEvents.some((e: any) => (e.time?.elapsed ?? 999) <= 45));
            }
          } catch (err) { firstGoalCache.set(matchingFixture.fixture.id, null); redCardCache.set(matchingFixture.fixture.id, false); redCard1HCache.set(matchingFixture.fixture.id, false); }
        }
        firstScorerTeam = firstGoalCache.get(matchingFixture.fixture.id) ?? null;
        hasRedCard = redCardCache.get(matchingFixture.fixture.id) ?? null;
        hasRedCard1H = redCard1HCache.get(matchingFixture.fixture.id) ?? null;
      }

      const fixtureId2 = matchingFixture.fixture.id;
      const homeCorners2 = cornerHomeCache.get(fixtureId2) ?? null;
      const awayCorners2 = cornerAwayCache.get(fixtureId2) ?? null;
      const homeCards2   = cardHomeCache.get(fixtureId2) ?? null;
      const awayCards2   = cardAwayCache.get(fixtureId2) ?? null;
      const selectionWon = checkSelectionResult(selection, homeGoals, awayGoals, totalGoals, matchingFixture.teams.home.name, matchingFixture.teams.away.name, htHomeGoals, htAwayGoals, totalCorners, firstScorerTeam, hasRedCard, hasRedCard1H, homeCorners2, awayCorners2, homeCorners1H, awayCorners1H, homeCards2, awayCards2);

      if (selectionWon === null) {
        allSelectionsResolved = false;
        allSelectionsWon = false;
      } else {
        await storage.updateSelectionResult(bet.id, selection.id, selectionWon ? "won" : "lost");
        selectionsUpdated = true;
        if (!selectionWon) allSelectionsWon = false;
      }
    }

    if (allSelectionsResolved) {
      const newStatus = allSelectionsWon ? "won" : "lost";
      const updatedBetAuto = await storage.updateBetSlipStatus(bet.id, newStatus);
      if (newStatus === "won" && bet.userId) {
        // Proteção dupla contra race condition (timer + manual simultâneos):
        // só credita se ainda não existe transação de ganho para este bilhete
        const existingWinTx = await storage.getWinTransactionForBet(bet.id);
        if (!existingWinTx) {
          const winUser = await storage.getUserByCpf(bet.userId);
          if (winUser && updatedBetAuto) {
            // Descontar bônus usado (igual ao admin PATCH)
            const bonusUsed = (updatedBetAuto as any).bonusUsed ?? 0;
            const netPayout = Math.max(0, Math.round((updatedBetAuto.potentialWin - bonusUsed) * 100) / 100);
            const credited = Math.round((winUser.balance + netPayout) * 100) / 100;
            await storage.updateUserBalance(bet.userId, credited);
            await storage.createTransaction({
              userId: bet.userId,
              type: "win",
              amount: netPayout,
              balanceAfter: credited,
              description: `Aposta ganha${bonusUsed > 0 ? ` (R$${updatedBetAuto.potentialWin.toFixed(2)} − R$${bonusUsed.toFixed(2)} bônus)` : ""}`,
              referenceId: bet.id,
            });
          }
        } else {
          console.log(`[CheckResults] Bilhete ${bet.id} já creditado anteriormente — ignorando duplo crédito`);
        }
      }
      updatedCount++;
      results.push({ betId: bet.id, oldStatus: "pending", newStatus, stake: bet.stake, potentialWin: bet.potentialWin });
    } else if (selectionsUpdated) {
      results.push({ betId: bet.id, oldStatus: "pending", newStatus: "pending (parcial)", stake: bet.stake, potentialWin: bet.potentialWin, note: "Algumas seleções atualizadas, aguardando outros jogos" });
    }
  }

  return { message: "Verificação concluída", totalPending: pendingBets.length, updated: updatedCount, fixturesChecked: allFinishedFixtures.length, results };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // LEAGUE_MAPPING e CALENDAR_YEAR_LEAGUES declarados em escopo de módulo (antes de runCheckResults)

  setupImageProxy(app);

  // ── Live Game Admin State (declared early so SSE route registers before any catch-all) ──
  // Multi-game live state — keyed by fixtureId
  const activeLiveGames: Map<number, { home: string; away: string; league: string; homeLogo?: string; awayLogo?: string }> = new Map();
  const lockedFixtures: Set<number> = new Set();
  const lastLiveUnlockMap: Map<number, number> = new Map();
  // Legacy single-game aliases for places not yet updated (bet-slip lock check)
  const isAnyLocked = () => lockedFixtures.size > 0;
  const getLastUnlockMs = (fixtureId?: number | null) =>
    fixtureId ? (lastLiveUnlockMap.get(fixtureId) ?? 0) : Math.max(0, ...Array.from(lastLiveUnlockMap.values()));
  // Mobile control token — persisted in DB so survives server restarts/deploys
  const FINISHED_STATUSES = new Set(["FT","AET","PEN","CANC","ABD","AWD","WO"]);

  // SSE: push live-state changes to all connected clients instantly
  const liveStateClients = new Set<import("express").Response>();
  function buildLiveStatePayload() {
    const games = Array.from(activeLiveGames.entries()).map(([fixtureId, info]) => ({
      fixtureId,
      gameInfo: info,
      isLocked: lockedFixtures.has(fixtureId),
    }));
    return { games };
  }

  function broadcastLiveState() {
    const payload = JSON.stringify(buildLiveStatePayload());
    for (const client of liveStateClients) {
      try { client.write(`data: ${payload}\n\n`); } catch { liveStateClients.delete(client); }
    }
  }

  app.get("/api/live-events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(buildLiveStatePayload())}\n\n`);
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch { clearInterval(ping); } }, 25_000);
    liveStateClients.add(res);
    req.on("close", () => { liveStateClients.delete(res); clearInterval(ping); });
  });

  // ─── Presence Tracking ────────────────────────────────────────────────────
  const presenceMap = new Map<string, { page: string; lastSeen: number }>();
  setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [id, entry] of presenceMap) {
      if (entry.lastSeen < cutoff) presenceMap.delete(id);
    }
  }, 30_000);

  app.post("/api/presence", (req, res) => {
    const { clientId, page } = req.body as { clientId?: string; page?: string };
    if (!clientId) return res.json({ ok: false });
    presenceMap.set(clientId, { page: page || "site", lastSeen: Date.now() });
    res.json({ ok: true });
  });

  app.get("/api/presence/count", (_req, res) => {
    const cutoff = Date.now() - 60_000;
    let total = 0;
    for (const entry of presenceMap.values()) {
      if (entry.lastSeen >= cutoff) total++;
    }
    res.json({ total });
  });

  // ─── Auth Routes ──────────────────────────────────────────────────────────
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      const cpf = data.cpf.replace(/\D/g, "");
      if (cpf.length !== 11) return res.status(400).json({ message: "CPF inválido" });
      const existing = await storage.getUserByCpf(cpf);
      if (existing) return res.status(409).json({ message: "CPF já cadastrado" });
      const passwordHash = await hashPassword(data.password);
      const user = await storage.createUser({ cpf, name: data.name, phone: data.phone, referredByCode: data.referralCode, passwordHash });
      req.session.userId = cpf;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Erro ao salvar sessão" });
        res.json(user);
      });
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: err.issues[0]?.message || "Dados inválidos" });
      res.status(500).json({ message: "Erro ao cadastrar" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { cpf: cpfRaw, password } = req.body as { cpf: string; password: string };
      if (!cpfRaw || !password) return res.status(400).json({ message: "CPF e senha obrigatórios" });
      const cpf = cpfRaw.replace(/\D/g, "");
      const user = await storage.getUserByCpf(cpf);
      if (!user) return res.status(401).json({ message: "CPF ou senha incorretos" });
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "CPF ou senha incorretos" });
      req.session.userId = cpf;
      const { passwordHash: _ph, ...userPublic } = user;
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Erro ao salvar sessão" });
        res.json(userPublic);
      });
    } catch {
      res.status(500).json({ message: "Erro ao fazer login" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Não autenticado" });
    const user = await storage.getUserByCpf(req.session.userId);
    if (!user) return res.status(401).json({ message: "Usuário não encontrado" });
    const { passwordHash: _ph, ...userPublic } = user;
    res.json(userPublic);
  });

  // Clube FW: progresso semanal do usuário
  app.get("/api/club-fw/progress", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
    try {
      // Tenta creditar bônus da semana anterior se for segunda >= 08h Manaus
      const awarded = await storage.checkAndAwardClubFw(req.session.userId);

      // Progresso da SEMANA ATUAL (o que está acumulando para a próxima premiação)
      const weekStart = getBrasiliaWeekStart();
      const [weeklyStake, claimedLevels] = await Promise.all([
        storage.getWeeklyStake(req.session.userId, weekStart),
        storage.getClubFwClaimedLevels(req.session.userId, weekStart),
      ]);
      res.json({ weekStart, weeklyStake, claimedLevels, newLevels: awarded.newLevels, newBonus: awarded.totalBonus });
    } catch (error) {
      console.error("Clube FW progress error:", error);
      res.status(500).json({ error: "Erro interno" });
    }
  });

  app.patch("/api/auth/referral-code", requireAuth, async (req, res) => {
    try {
      const { referralCode } = req.body as { referralCode: string };
      const code = referralCode?.trim().toUpperCase();
      if (!code) return res.status(400).json({ message: "Código inválido" });
      if (!/^[A-Z0-9]{3,12}$/.test(code)) return res.status(400).json({ message: "Código deve ter 3-12 letras ou números" });
      // Check uniqueness
      const allUsers = await storage.getAllUsers();
      const taken = allUsers.find(u => u.referralCode?.toUpperCase() === code && u.cpf !== req.session.userId);
      if (taken) return res.status(400).json({ message: "Esse código já está em uso. Escolha outro." });
      const updated = await storage.updateUserData(req.session.userId!, { referralCode: code });
      if (!updated) return res.status(404).json({ message: "Usuário não encontrado" });
      const { passwordHash: _ph, ...userPublic } = { ...updated, passwordHash: "" };
      res.json(userPublic);
    } catch {
      res.status(500).json({ message: "Erro ao salvar código" });
    }
  });

  // ─── User Deposits ─────────────────────────────────────────────────────────
  // ── Helper: confirm a deposit and credit user balance ───────────────────────
  async function confirmDeposit(depositId: number): Promise<boolean> {
    const deposit = (await storage.getAllDeposits()).find(d => d.id === depositId);
    if (!deposit || deposit.status === "confirmed") return false;
    const user = await storage.getUserByCpf(deposit.userId);
    if (!user) return false;
    await storage.updateDepositStatus(depositId, "confirmed");
    const newBalance = Math.round((user.balance + deposit.amount) * 100) / 100;
    await storage.updateUserBalance(deposit.userId, newBalance);
    if (deposit.bonusAmount > 0) {
      const newBonus = Math.round((user.bonusBalance + deposit.bonusAmount) * 100) / 100;
      await storage.updateUserBonusBalance(deposit.userId, newBonus);
    }
    if (!user.firstDepositDone && deposit.bonusAmount > 0) {
      await storage.markFirstDeposit(deposit.userId);
    }
    const description = deposit.bonusAmount > 0
      ? `Depósito PIX confirmado (+R$${deposit.bonusAmount.toFixed(2)} bônus)`
      : `Depósito PIX confirmado`;
    await storage.createTransaction({
      userId: deposit.userId,
      type: "deposit",
      amount: Math.round((deposit.amount + deposit.bonusAmount) * 100) / 100,
      balanceAfter: newBalance,
      description,
      referenceId: String(depositId),
    });
    return true;
  }

  app.post("/api/deposits", requireAuth, async (req, res) => {
    try {
      const { amount } = req.body as { amount: number };
      if (!amount || amount < 10) return res.status(400).json({ message: "Valor mínimo de depósito é R$10,00" });
      if (amount > 5000) return res.status(400).json({ message: "Valor máximo por depósito é R$5.000,00" });
      const userId = req.session.userId!;
      const user = await storage.getUserByCpf(userId);
      if (!user) return res.status(401).json({ message: "Usuário não encontrado" });
      const bonusAmount = user.firstDepositDone ? 0 : 10;

      // ── Mercado Pago PIX ─────────────────────────────────────────────────────
      const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
      let mpData: { mpPaymentId: string; pixCopyPaste: string; pixQrCode: string; pixExpiresAt: Date } | undefined;

      if (mpToken) {
        try {
          const idempotencyKey = `fw-deposit-${userId}-${Date.now()}`;
          const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${mpToken}`,
              "Content-Type": "application/json",
              "X-Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({
              transaction_amount: amount,
              description: "Depósito Verano Sports",
              payment_method_id: "pix",
              payer: { email: `${userId.replace(/\D/g, "")}@deposito.veranosports.com` },
            }),
          });
          if (mpRes.ok) {
            const mpJson = await mpRes.json();
            const txData = mpJson?.point_of_interaction?.transaction_data;
            if (txData?.qr_code) {
              const expiresAt = mpJson.date_of_expiration
                ? new Date(mpJson.date_of_expiration)
                : new Date(Date.now() + 30 * 60 * 1000);
              mpData = {
                mpPaymentId: String(mpJson.id),
                pixCopyPaste: txData.qr_code,
                pixQrCode: txData.qr_code_base64 ?? "",
                pixExpiresAt: expiresAt,
              };
            }
          } else {
            const errBody = await mpRes.text();
            console.error("[MP] Erro ao criar pagamento:", mpRes.status, errBody);
          }
        } catch (mpErr) {
          console.error("[MP] Exceção ao criar pagamento PIX:", mpErr);
        }
      }

      const deposit = await storage.createDeposit(userId, amount, bonusAmount, mpData);
      res.json(deposit);
    } catch (e) {
      console.error("[deposits] Erro:", e);
      res.status(500).json({ message: "Erro ao criar depósito" });
    }
  });

  // ── Mercado Pago Webhook ────────────────────────────────────────────────────
  app.post("/api/webhooks/mercadopago", async (req, res) => {
    try {
      res.status(200).send("OK"); // always acknowledge immediately
      const { type, data } = req.body as { type?: string; data?: { id?: string } };
      if (type !== "payment" || !data?.id) return;
      const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
      if (!mpToken) return;

      // Fetch payment status from MP
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { "Authorization": `Bearer ${mpToken}` },
      });
      if (!mpRes.ok) return;
      const mpPayment = await mpRes.json();
      if (mpPayment.status !== "approved") return;

      // Find matching deposit
      const allDeposits = await storage.getAllDeposits();
      const deposit = allDeposits.find(d => d.mpPaymentId === String(mpPayment.id));
      if (!deposit) return;

      await confirmDeposit(deposit.id);
      console.log(`[MP Webhook] Depósito #${deposit.id} confirmado automaticamente (pagamento ${mpPayment.id})`);
    } catch (err) {
      console.error("[MP Webhook] Erro:", err);
    }
  });

  // ─── MP Payment Polling (fallback para quando webhook não chega) ──────────────
  const pollMpPayments = async () => {
    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpToken) return;
    try {
      const allDeposits = await storage.getAllDeposits();
      const pending = allDeposits.filter(d => d.status === "pending" && d.mpPaymentId);
      for (const deposit of pending) {
        try {
          const r = await fetch(`https://api.mercadopago.com/v1/payments/${deposit.mpPaymentId}`, {
            headers: { "Authorization": `Bearer ${mpToken}` },
          });
          if (!r.ok) continue;
          const payment = await r.json();
          if (payment.status === "approved") {
            await confirmDeposit(deposit.id);
            console.log(`[MP Poll] Depósito #${deposit.id} confirmado automaticamente (pagamento ${deposit.mpPaymentId})`);
          } else if (payment.status === "cancelled" || payment.status === "rejected") {
            await storage.updateDepositStatus(deposit.id, "rejected");
            console.log(`[MP Poll] Depósito #${deposit.id} rejeitado/cancelado pelo MP`);
          }
        } catch { /* silently skip individual failures */ }
      }
    } catch (err) {
      console.error("[MP Poll] Erro:", err);
    }
  };
  // Poll every 30 seconds
  setInterval(pollMpPayments, 30_000);
  // Also run once on startup after a short delay
  setTimeout(() => {
    console.log("[MP Poll] Polling de pagamentos iniciado (intervalo: 30s)");
    pollMpPayments();
  }, 5_000);

  app.get("/api/deposits/mine", requireAuth, async (req, res) => {
    const deposits = await storage.getDepositsByUser(req.session.userId!);
    res.json(deposits);
  });

  app.get("/api/transactions/mine", requireAuth, async (req, res) => {
    const transactions = await storage.getTransactionsByUser(req.session.userId!);
    res.json(transactions);
  });

  // ─── CallMeBot WhatsApp Notification ─────────────────────────────────────────
  async function sendWhatsAppNotification(message: string) {
    try {
      const phone = process.env.CALLMEBOT_PHONE;
      const apikey = process.env.CALLMEBOT_APIKEY;
      if (!phone || !apikey) return;
      const encoded = encodeURIComponent(message);
      await fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encoded}&apikey=${apikey}`);
    } catch {
      // silently ignore notification errors
    }
  }

  // ─── Gmail Email Notification ─────────────────────────────────────────────────
  async function sendEmailNotification(subject: string, html: string) {
    try {
      const user = "verosports365@gmail.com";
      const pass = process.env.SENDER_APP_PASSWORD;
      const to = "verosports365@gmail.com";
      if (!pass) return;
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
      });
      await transporter.sendMail({ from: `"Verano Sports" <${user}>`, to, subject, html });
    } catch (err) {
      console.error("[email] Erro ao enviar notificação:", err);
    }
  }

  // ─── User Withdrawals ────────────────────────────────────────────────────────
  const createWithdrawalHandler = async (req: Request, res: Response) => {
    try {
      const { amount, pixKey } = req.body as { amount: number; pixKey: string };
      if (!amount || amount < 20) return res.status(400).json({ message: "Valor mínimo para saque é R$20,00" });
      if (!pixKey || pixKey.length < 5) return res.status(400).json({ message: "Chave PIX inválida" });
      const userId = req.session.userId!;
      const user = await storage.getUserByCpf(userId);
      if (!user) return res.status(401).json({ message: "Usuário não encontrado" });
      if (user.balance < amount) return res.status(400).json({ message: `Saldo insuficiente. Seu saldo é R$${user.balance.toFixed(2).replace(".", ",")}` });
      const newBalance = Math.round((user.balance - amount) * 100) / 100;
      await storage.updateUserBalance(userId, newBalance);
      const withdrawal = await storage.createUserWithdrawal(userId, amount, pixKey);
      await storage.createTransaction({
        userId,
        type: "withdrawal",
        amount: -amount,
        balanceAfter: newBalance,
        description: `Saque PIX solicitado`,
        referenceId: String(withdrawal.id),
      });
      console.log(`[saque] Notificando: nome=${user.name} cpf=${userId} valor=${amount} pix=${pixKey}`);
      sendEmailNotification(
        `💸 Novo saque solicitado - Verano Sports`,
        `<h2 style="color:#e11d48">💸 Novo saque solicitado</h2>
         <table style="font-size:15px;border-collapse:collapse">
           <tr><td style="padding:6px 12px;font-weight:bold">Nome</td><td style="padding:6px 12px">${user.name}</td></tr>
           <tr><td style="padding:6px 12px;font-weight:bold">CPF</td><td style="padding:6px 12px">${userId}</td></tr>
           <tr><td style="padding:6px 12px;font-weight:bold">Valor</td><td style="padding:6px 12px">R$${amount.toFixed(2).replace(".", ",")}</td></tr>
           <tr><td style="padding:6px 12px;font-weight:bold">Chave PIX</td><td style="padding:6px 12px">${pixKey}</td></tr>
           <tr><td style="padding:6px 12px;font-weight:bold">Horário</td><td style="padding:6px 12px">${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })} (Manaus)</td></tr>
         </table>
         <p style="margin-top:16px;color:#666">Acesse o painel admin para aprovar ou rejeitar.</p>`
      );
      res.json(withdrawal);
    } catch {
      res.status(500).json({ message: "Erro ao criar solicitação de saque" });
    }
  };
  app.post("/api/withdrawals", requireAuth, createWithdrawalHandler);
  app.post("/api/withdrawals/request", requireAuth, createWithdrawalHandler);

  app.get("/api/withdrawals/mine", requireAuth, async (req, res) => {
    const withdrawals = await storage.getUserWithdrawalsByUser(req.session.userId!);
    res.json(withdrawals);
  });

  // Warn on startup if ADMIN_PASSWORD is not configured in production
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
    console.error("[SECURITY] ADMIN_PASSWORD environment variable is not set. Admin access is disabled until it is configured.");
  }

  // Admin authentication endpoints (public — no requireAdmin)
  app.post("/api/admin/login", async (req, res) => {
    const { password } = req.body as { password?: string };
    if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
      return res.status(503).json({ message: "Painel administrativo indisponível: ADMIN_PASSWORD não configurada no servidor." });
    }
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    if (!password || password !== adminPassword) {
      return res.status(401).json({ message: "Senha de administrador incorreta" });
    }
    req.session.isAdmin = true;
    req.session.save((err) => {
      if (err) {
        console.error("[admin/login] session save error:", err);
        return res.status(500).json({ message: "Erro ao salvar sessão" });
      }
      return res.json({ ok: true });
    });
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session.isAdmin = false;
    req.session.save(() => res.json({ ok: true }));
  });

  app.post("/api/admin/clear-all-sessions", async (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ message: "Acesso restrito" });
    try {
      await pool.query("DELETE FROM sessions");
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: "Erro ao limpar sessões", error: (e as Error).message });
    }
  });

  app.get("/api/admin/me", (req, res) => {
    res.json({ isAdmin: !!req.session.isAdmin });
  });

  // Apply admin auth guard to all subsequent /api/admin/* routes
  app.use("/api/admin", requireAdmin);

  app.get("/api/admin/presence", (_req, res) => {
    const cutoff = Date.now() - 60_000;
    const byPage: Record<string, number> = {};
    let total = 0;
    for (const entry of presenceMap.values()) {
      if (entry.lastSeen >= cutoff) {
        byPage[entry.page] = (byPage[entry.page] || 0) + 1;
        total++;
      }
    }
    res.json({ total, live: byPage["aovivo"] || 0, byPage });
  });

  app.get("/api/admin/user-withdrawals", async (_req, res) => {
    const withdrawals = await storage.getAllUserWithdrawals();
    res.json(withdrawals);
  });

  app.patch("/api/admin/user-withdrawals/:id/approve", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const withdrawal = (await storage.getAllUserWithdrawals()).find(w => w.id === id);
      if (!withdrawal) return res.status(404).json({ message: "Saque não encontrado" });
      if (withdrawal.status !== "pending") return res.status(400).json({ message: "Saque já processado" });
      const updated = await storage.updateUserWithdrawalStatus(id, "approved");
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Erro ao aprovar saque" });
    }
  });

  app.patch("/api/admin/user-withdrawals/:id/reject", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const withdrawal = (await storage.getAllUserWithdrawals()).find(w => w.id === id);
      if (!withdrawal) return res.status(404).json({ message: "Saque não encontrado" });
      if (withdrawal.status !== "pending") return res.status(400).json({ message: "Saque já processado" });
      // Reembolsar saldo
      const user = await storage.getUserByCpf(withdrawal.userId);
      if (user) {
        const refunded = Math.round((user.balance + withdrawal.amount) * 100) / 100;
        await storage.updateUserBalance(withdrawal.userId, refunded);
        await storage.createTransaction({
          userId: withdrawal.userId,
          type: "withdrawal_refund",
          amount: withdrawal.amount,
          balanceAfter: refunded,
          description: `Saque rejeitado - valor devolvido`,
          referenceId: String(id),
        });
      }
      const updated = await storage.updateUserWithdrawalStatus(id, "rejected");
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Erro ao rejeitar saque" });
    }
  });

  app.patch("/api/admin/user-withdrawals/:id/mark-paid", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const withdrawal = (await storage.getAllUserWithdrawals()).find(w => w.id === id);
      if (!withdrawal) return res.status(404).json({ message: "Saque não encontrado" });
      if (withdrawal.status !== "approved") return res.status(400).json({ message: "Saque precisa estar aprovado antes de marcar como pago" });
      const updated = await storage.markUserWithdrawalAsPaid(id);
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Erro ao marcar saque como pago" });
    }
  });

  // ─── Admin: User Management ────────────────────────────────────────────────
  app.get("/api/admin/users", async (_req, res) => {
    const users = await storage.getAllUsers();
    res.json(users);
  });

  app.get("/api/admin/users-activity", requireAdmin, async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          u.cpf AS user_id,
          MAX(b.created_at) AS last_bet_at,
          MAX(d.created_at) AS last_deposit_at
        FROM users u
        LEFT JOIN bet_slips b ON b.user_id = u.cpf
        LEFT JOIN deposits d ON d.user_id = u.cpf AND d.status = 'confirmed'
        GROUP BY u.cpf
      `);
      res.json(result.rows);
    } catch (e) {
      res.status(500).json({ message: "Erro ao buscar atividade" });
    }
  });

  app.get("/api/admin/users/:cpf", async (req, res) => {
    const user = await storage.getUserByCpf(req.params.cpf);
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
    const { passwordHash: _ph, ...userPublic } = user;
    res.json(userPublic);
  });

  app.patch("/api/admin/users/:cpf", async (req, res) => {
    try {
      const { name, phone, balance, reason, bonusBalance } = req.body as { name?: string; phone?: string; balance?: number; reason?: string; bonusBalance?: number };
      const cpf = req.params.cpf;
      if (balance !== undefined) {
        const userBefore = await storage.getUserByCpf(cpf);
        await storage.updateUserBalance(cpf, balance);
        if (userBefore) {
          const diff = Math.round((balance - userBefore.balance) * 100) / 100;
          const description = reason?.trim()
            ? `Ajuste manual: ${reason.trim()}`
            : `Ajuste manual de saldo (${diff >= 0 ? "+" : ""}R$${diff.toFixed(2)})`;
          await storage.createTransaction({
            userId: cpf,
            type: "adjustment",
            amount: diff,
            balanceAfter: balance,
            description,
            referenceId: null,
          });
        }
      }
      if (bonusBalance !== undefined) {
        await storage.updateUserBonusBalance(cpf, Math.max(0, bonusBalance));
      }
      if (name || phone) {
        await storage.updateUserData(cpf, { name, phone });
      }
      const updated = await storage.getUserByCpf(cpf);
      if (!updated) return res.status(404).json({ message: "Usuário não encontrado" });
      const { passwordHash: _ph, ...pub } = updated;
      res.json(pub);
    } catch {
      res.status(500).json({ message: "Erro ao atualizar" });
    }
  });

  app.post("/api/admin/users/bulk-bonus", requireAdmin, async (req, res) => {
    try {
      const { cpfs, amount } = req.body as { cpfs: string[] | "all"; amount: number };
      if (!amount || amount <= 0) return res.status(400).json({ message: "Valor inválido" });
      const allUsers = await storage.getAllUsers();
      const targets = cpfs === "all" ? allUsers : allUsers.filter(u => (cpfs as string[]).includes(u.cpf));
      if (targets.length === 0) return res.status(400).json({ message: "Nenhum usuário selecionado" });
      for (const user of targets) {
        const newBonus = Math.round((user.bonusBalance + amount) * 100) / 100;
        await storage.updateUserBonusBalance(user.cpf, newBonus);
      }
      res.json({ ok: true, count: targets.length });
    } catch {
      res.status(500).json({ message: "Erro ao distribuir bônus" });
    }
  });

  app.post("/api/admin/users/:cpf/reset-password", async (req, res) => {
    try {
      const { newPassword } = req.body as { newPassword: string };
      if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: "Senha mínima de 6 caracteres" });
      const hash = await hashPassword(newPassword);
      const ok = await storage.updateUserPassword(req.params.cpf, hash);
      if (!ok) return res.status(404).json({ message: "Usuário não encontrado" });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Erro ao resetar senha" });
    }
  });

  app.delete("/api/admin/users/:cpf", async (req, res) => {
    const ok = await storage.deleteUser(req.params.cpf);
    if (!ok) return res.status(404).json({ message: "Usuário não encontrado" });
    res.json({ ok: true });
  });

  app.get("/api/admin/fav-users", requireAdmin, async (req, res) => {
    try {
      const raw = await storage.getSetting("admin_fav_users");
      res.json(JSON.parse(raw || "[]"));
    } catch { res.json([]); }
  });

  app.post("/api/admin/fav-users", requireAdmin, async (req, res) => {
    try {
      const { cpfs } = req.body;
      if (!Array.isArray(cpfs)) return res.status(400).json({ message: "cpfs must be array" });
      await storage.setSetting("admin_fav_users", JSON.stringify(cpfs));
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Erro ao salvar favoritos" }); }
  });

  app.get("/api/admin/users/:cpf/bets", async (req, res) => {
    const bets = await storage.getBetSlipsByUser(req.params.cpf);
    res.json(bets);
  });

  app.get("/api/admin/users/:cpf/history", requireAdmin, async (req, res) => {
    try {
      const { cpf } = req.params;
      const [transactions, bets, withdrawals, bolaoEntries, allBoloes, dueloEntries, allDuelos] = await Promise.all([
        storage.getTransactionsByUser(cpf),
        storage.getBetSlipsByUser(cpf),
        storage.getUserWithdrawalsByUser(cpf),
        storage.getBolaoEntriesByUser(cpf),
        storage.getBoloes(),
        storage.getDueloEntriesByUser(cpf),
        storage.getDuelos(),
      ]);

      const txTypeLabel: Record<string, string> = {
        deposit: "Depósito", withdrawal: "Saque", win: "Prêmio de aposta",
        bet_placed: "Aposta colocada", adjustment: "Ajuste manual",
        bolao_win: "Prêmio do bolão", bolao_entry: "Palpite do bolão",
        bonus: "Bônus", cashout: "Cash Out", early_exit: "Saída antecipada",
        referral_bonus: "Bônus de indicação", withdrawal_refund: "Reembolso de saque",
        duelo_entry: "Entrada em duelo", duelo_win: "Prêmio de duelo",
        bet: "Aposta",
      };

      type Event = { id: string; kind: string; subKind: string; date: string; title: string; subtitle: string; amount: number | null; status: string | null };
      const events: Event[] = [];

      for (const tx of transactions) {
        events.push({
          id: `tx-${tx.id}`, kind: "transaction", subKind: tx.type,
          date: tx.createdAt as string,
          title: txTypeLabel[tx.type] ?? tx.type,
          subtitle: tx.description ?? "",
          amount: tx.amount,
          status: null,
        });
      }

      for (const bet of bets) {
        const label = bet.status === "won" ? "Apostou e ganhou" : bet.status === "lost" ? "Apostou e perdeu" : bet.status === "cashed_out" ? "Cash Out" : bet.status === "anulado" ? "Aposta anulada" : "Aposta pendente";
        events.push({
          id: `bet-${bet.id}`, kind: "bet", subKind: bet.status ?? "pending",
          date: bet.createdAt as string,
          title: label,
          subtitle: `${bet.selections.length} seleção(ões) · odds ${bet.totalOdds.toFixed(2)} · R$ ${bet.stake.toFixed(2)}`,
          amount: -bet.stake,
          status: bet.status,
        });
      }

      for (const w of withdrawals) {
        events.push({
          id: `wd-${w.id}`, kind: "saque", subKind: w.status ?? "pending",
          date: w.createdAt as string,
          title: `Saque solicitado${w.status === "paid" ? " (pago)" : w.status === "rejected" ? " (rejeitado)" : " (pendente)"}`,
          subtitle: w.pixKey ? `Chave: ${w.pixKey}` : "",
          amount: -w.amount,
          status: w.status,
        });
      }

      for (const e of bolaoEntries) {
        const bolao = allBoloes.find(b => b.id === e.bolaoId);
        events.push({
          id: `blp-${e.id}`, kind: "bolao", subKind: "entry",
          date: e.createdAt as string,
          title: `Palpite: ${e.homeScore}×${e.awayScore}`,
          subtitle: bolao ? `${bolao.homeTeam} × ${bolao.awayTeam}` : `Bolão #${e.bolaoId}`,
          amount: null,
          status: e.prizeAwarded ? "won" : bolao?.status === "finished" ? "lost" : "pending",
        });
      }

      for (const e of dueloEntries) {
        const duelo = allDuelos.find(d => d.id === e.dueloId);
        const myOption = e.side === "A" ? duelo?.optionA : duelo?.optionB;
        let status = "pending";
        if (duelo?.status === "finished" && duelo.winnerSide) {
          status = e.side === duelo.winnerSide ? "won" : "lost";
        }
        events.push({
          id: `dlo-${e.id}`, kind: "duelo", subKind: "entry",
          date: e.createdAt as string,
          title: `Duelo: ${myOption ?? e.side}`,
          subtitle: duelo?.title ?? `Duelo #${e.dueloId}`,
          amount: null,
          status,
        });
      }

      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json(events);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/fixture-stats", requireAdmin, async (req, res) => {
    const fixtureId = req.query.fixtureId as string;
    if (!fixtureId) return res.status(400).json({ error: "fixtureId required" });
    try {
      const statsRes = await fetch(
        `${API_FOOTBALL_BASE}/fixtures/statistics?fixture=${fixtureId}`,
        { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" } }
      );
      if (!statsRes.ok) return res.status(502).json({ error: "API unavailable" });
      const statsData = await statsRes.json();
      let homeCorners = 0, awayCorners = 0;
      let homeYellow = 0, homeRed = 0, awayYellow = 0, awayRed = 0;
      let homeTeam = "", awayTeam = "";
      let foundCorners = false;
      const teams: any[] = statsData.response ?? [];
      for (let i = 0; i < teams.length; i++) {
        const teamStat = teams[i];
        const isHome = i === 0;
        if (isHome) homeTeam = teamStat.team?.name ?? "Casa";
        else awayTeam = teamStat.team?.name ?? "Fora";
        for (const s of teamStat.statistics || []) {
          const val = s.value !== null && s.value !== undefined ? parseInt(s.value) || 0 : null;
          if (s.type === "Corner Kicks" && val !== null) { foundCorners = true; if (isHome) homeCorners = val; else awayCorners = val; }
          if (s.type === "Yellow Cards" && val !== null) { if (isHome) homeYellow = val; else awayYellow = val; }
          if (s.type === "Red Cards" && val !== null)    { if (isHome) homeRed = val; else awayRed = val; }
        }
      }
      const statsAvailable = teams.length > 0;
      return res.json({
        fixtureId,
        homeTeam,
        awayTeam,
        statsAvailable,
        corners: { home: homeCorners, away: awayCorners, total: homeCorners + awayCorners, available: foundCorners },
        cards: { home: homeYellow + homeRed * 2, away: awayYellow + awayRed * 2, available: statsAvailable },
      });
    } catch { return res.status(500).json({ error: "Internal error" }); }
  });

  app.get("/api/admin/referrals", requireAdmin, async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    // Use firstDepositDone flag as source of truth (balance may be set manually or via confirmed deposit)
    const depositedCpfs = new Set(
      allUsers.filter(u => u.firstDepositDone).map(u => u.cpf)
    );
    // Build referral map: referralCode -> list of referred users who deposited
    const referralMap = new Map<string, { user: (typeof allUsers)[number]; deposited: boolean }[]>();
    // Build a lookup: referralCode -> owner cpf
    const codeOwner = new Map<string, string>();
    for (const u of allUsers) {
      if (u.referralCode) codeOwner.set(u.referralCode.toUpperCase(), u.cpf);
    }
    for (const u of allUsers) {
      if (u.referredByCode) {
        const code = u.referredByCode.toUpperCase();
        // Skip if this user is the owner of that code (self-referral artifact)
        if (codeOwner.get(code) === u.cpf) continue;
        if (!referralMap.has(code)) referralMap.set(code, []);
        referralMap.get(code)!.push({ user: u, deposited: depositedCpfs.has(u.cpf) });
      }
    }
    // Build result: only users who have a referralCode set
    const result = allUsers
      .filter(u => u.referralCode)
      .map(u => {
        const code = u.referralCode!.toUpperCase();
        const referred = referralMap.get(code) ?? [];
        return {
          user: u,
          referralCode: u.referralCode,
          totalReferred: referred.length,
          depositedCount: referred.filter(r => r.deposited).length,
          referredUsers: referred.map(r => ({
            name: r.user.name,
            cpf: r.user.cpf,
            deposited: r.deposited,
            createdAt: r.user.createdAt,
          })),
        };
      })
      .sort((a, b) => b.depositedCount - a.depositedCount);
    res.json(result);
  });

  // ─── Admin: Clube FW Claims ────────────────────────────────────────────────
  app.get("/api/admin/club-fw-claims", requireAdmin, async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const claims = await storage.getAllClubFwClaims(from, to);
      res.json(claims);
    } catch {
      res.status(500).json({ message: "Erro ao buscar recompensas" });
    }
  });

  // Corrigir overcredit: remove claims de nível inferior quando nível superior também foi pago
  app.post("/api/admin/club-fw-fix-overcredit", requireAdmin, async (req, res) => {
    try {
      const result = await storage.fixOvercreditedClubFw();
      res.json({ message: `Correção concluída — ${result.fixed} usuário(s) corrigido(s), -R$${result.totalDeducted.toFixed(2)} estornados`, ...result });
    } catch (e) {
      console.error("[Admin ClubeFW fix] Erro:", e);
      res.status(500).json({ message: "Erro ao corrigir overcredit" });
    }
  });

  // Forçar pagamento Clube FW para uma semana específica (retroativo)
  app.post("/api/admin/club-fw-payout", requireAdmin, async (req, res) => {
    try {
      const { weekStart } = req.body as { weekStart?: string };
      if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return res.status(400).json({ message: "weekStart inválido. Use formato YYYY-MM-DD" });
      }
      // Limpa o cache de semana paga para forçar reprocessamento
      const currentLast = await storage.getSetting("club_fw_last_payout_week");
      if (currentLast === weekStart) {
        await storage.setSetting("club_fw_last_payout_week", "");
      }
      const result = await storage.processAllUsersClubFwPayout(weekStart);
      res.json({ message: `Pagamento processado para semana ${weekStart}`, ...result });
    } catch (e) {
      console.error("[Admin ClubeFW payout] Erro:", e);
      res.status(500).json({ message: "Erro ao processar pagamento" });
    }
  });

  // ─── Sorte Verano ──────────────────────────────────────────────────────────
  app.get("/api/sorte-verano", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: "Não autenticado" });
    try {
      const numbers = await storage.getUserLuckyNumbers(req.session.userId);
      res.json(numbers);
    } catch (e) {
      res.status(500).json({ error: "Erro ao buscar números da sorte" });
    }
  });

  app.get("/api/admin/sorte-verano", requireAdmin, async (_req, res) => {
    try {
      const numbers = await storage.getAllLuckyNumbers();
      res.json(numbers);
    } catch (e) {
      res.status(500).json({ error: "Erro ao buscar números da sorte" });
    }
  });

  // ─── Admin: Deposits Management ────────────────────────────────────────────
  app.get("/api/admin/deposits", async (_req, res) => {
    const deposits = await storage.getAllDeposits();
    res.json(deposits);
  });

  app.patch("/api/admin/deposits/:id/confirm", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ok = await confirmDeposit(id);
      if (!ok) return res.status(400).json({ message: "Depósito não encontrado ou já confirmado" });
      const updated = (await storage.getAllDeposits()).find(d => d.id === id);
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Erro ao confirmar depósito" });
    }
  });

  app.patch("/api/admin/deposits/:id/reject", async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateDepositStatus(id, "rejected");
    if (!updated) return res.status(404).json({ message: "Depósito não encontrado" });
    res.json(updated);
  });

  app.delete("/api/admin/deposits/:id", async (req, res) => {
    const ok = await storage.deleteDeposit(parseInt(req.params.id));
    if (!ok) return res.status(404).json({ message: "Depósito não encontrado" });
    res.json({ ok: true });
  });

  app.post("/api/admin/reset-caixa", async (_req, res) => {
    try {
      await storage.resetCaixa();
      defensasProfits = 0;
      caixaExtras = 0;
      defensasBalance = defensasInitialBalance;
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message ?? "Erro ao zerar caixa" });
    }
  });

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
        "soccer_international_friendlies": "Amistosos Internacionais",
        "soccer_wc_qualifiers_conmebol": "Eliminatórias Copa – Sul-Americana",
        "soccer_wc_qualifiers_europe": "Eliminatórias Copa – UEFA",
        "soccer_wc_qualifiers_concacaf": "Eliminatórias Copa – CONCACAF",
        "soccer_wc_qualifiers_caf": "Eliminatórias Copa – África",
        "soccer_wc_qualifiers_afc": "Eliminatórias Copa – Ásia",
        "soccer_wc_intercontinental": "Playoffs Intercontinentais Copa",
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

      // ── Stale-while-revalidate ────────────────────────────────────────────────
      // Se há dado velho disponível, retornar imediatamente para o usuário nunca
      // ver tela vazia, e continuar o refresh em background.
      let respondedWithStale = false;
      const staleGames = cache.getStale<any[]>(cacheKey);
      if (staleGames) {
        if (cache.isPending(cacheKey)) {
          // Já há refresh em andamento — retornar stale e sair
          const blockedIds = await storage.getBlockedGameIds();
          return res.json(blockedIds.size > 0 ? staleGames.filter((g: any) => !blockedIds.has(g.id)) : staleGames);
        }
        // Retornar stale imediatamente; refresh vai correr em background
        const blockedIds = await storage.getBlockedGameIds();
        res.json(blockedIds.size > 0 ? staleGames.filter((g: any) => !blockedIds.has(g.id)) : staleGames);
        respondedWithStale = true;
        console.log("[games/today] Cache expirado — servindo dado velho, refresh em background iniciado");
      } else if (cache.isPending(cacheKey)) {
        // Sem stale e já há refresh em andamento — aguardar
        const pending = await cache.waitForPending<any[]>(cacheKey);
        if (pending) {
          const blockedIds = await storage.getBlockedGameIds();
          return res.json(blockedIds.size > 0 ? pending.filter((g: any) => !blockedIds.has(g.id)) : pending);
        }
      }

      // Registrar como em andamento — outros endpoints (ex: odds/:sportKey) vão aguardar
      // este resultado em vez de disparar chamadas simultâneas à API
      const { resolve: resolvePending, reject: rejectPending } = cache.registerPending<any[]>(cacheKey);
      
      let allGames: any[] = [];
      let quotaExceeded = false;

      // Prioridade de liga (maior = mais importante para exibição)
      const LEAGUE_PRIORITY: Record<string, number> = {
        "soccer_fifa_world_cup": 11,
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
          { id: 10, key: "soccer_international_friendlies", name: "Amistosos Internacionais", season: brazilianSeason },
          // Copa do Mundo FIFA 2026
          { id: 1, key: "soccer_fifa_world_cup", name: "Copa do Mundo 2026", season: 2026 },
          // Qualificatórias Copa do Mundo 2026
          { id: 34, key: "soccer_wc_qualifiers_conmebol", name: "Eliminatórias Copa – CONMEBOL", season: brazilianSeason },
          { id: 32, key: "soccer_wc_qualifiers_europe", name: "Eliminatórias Copa – UEFA", season: brazilianSeason },
          { id: 31, key: "soccer_wc_qualifiers_concacaf", name: "Eliminatórias Copa – CONCACAF", season: brazilianSeason },
          { id: 29, key: "soccer_wc_qualifiers_caf", name: "Eliminatórias Copa – África", season: brazilianSeason },
          { id: 30, key: "soccer_wc_qualifiers_afc", name: "Eliminatórias Copa – Ásia", season: brazilianSeason },
          { id: 43, key: "soccer_wc_intercontinental", name: "Playoffs Intercontinentais Copa", season: brazilianSeason },
        ];

        const footballLeagues = allFootballLeagues.filter(l => !coveredSportKeys.has(l.key));
        if (footballLeagues.length > 0) {
        console.log(`Using API-Football for ${footballLeagues.length} uncovered leagues: ${footballLeagues.map(l => l.key).join(", ")}`);

        const nowMs = Date.now();
        const next24hMs = nowMs + 24 * 60 * 60 * 1000;
        // Use UTC dates for API queries so games at midnight UTC (e.g. 21:00 BRT) are never missed
        const todayStr = new Date(nowMs).toISOString().split('T')[0];
        const next24hStr = new Date(next24hMs).toISOString().split('T')[0];

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
        // Indicadores de times de base/seleções jovens — filtrados dos amistosos
        const YOUTH_INDICATORS = ["U21", "U20", "U19", "U23", "U18", "U17", "U16", "Sub-21", "Sub-20", "Sub-23", "Sub 21", "Sub 20", "Sub 23", "Under-21", "Under-20", "Under-23"];
        const isYouthTeam = (name: string) => YOUTH_INDICATORS.some(ind => name.includes(ind));

        const fixturesByLeague: Array<{ league: { id: number; key: string; name: string; season: number }; fixtures: any[] }> = [];
        for (const { league, fixtures } of fixtureResults) {
          const isFriendlies = league.id === 10;
          // Amistosos: excluir seleções jovens e usar limite maior (até 30 jogos)
          const upcoming = fixtures.filter((f: any) => {
            const status = f.fixture?.status?.short;
            const gameDate = new Date(f.fixture?.date).getTime();
            if (status !== "NS" || gameDate <= nowMs || gameDate > next24hMs) return false;
            if (isFriendlies) {
              const home = f.teams?.home?.name || "";
              const away = f.teams?.away?.name || "";
              if (isYouthTeam(home) || isYouthTeam(away)) return false;
            }
            return true;
          }).slice(0, isFriendlies ? 30 : 20);
          if (upcoming.length > 0) fixturesByLeague.push({ league, fixtures: upcoming });
        }

        // Buscar odds sequencialmente por liga (evita throttling da API)
        const todayOddsMap = new Map<number, any[]>(); // fixtureId -> bookmakers

        const extractAdditionalMarkets = (bets: any[]): any[] => {
          const extra: any[] = [];
          const dc = bets.find((b: any) => b.name === "Double Chance");
          if (dc && dc.values?.length >= 2) {
            const outcomes = dc.values.map((v: any) => ({
              name: v.value === "Home/Draw" ? "1X" : v.value === "Draw/Away" ? "X2" : v.value === "Home/Away" ? "12" : v.value,
              price: parseFloat(v.odd)
            })).filter((o: any) => !isNaN(o.price) && o.price > 0);
            if (outcomes.length >= 2) extra.push({ key: "double_chance", outcomes });
          }
          const ou = bets.find((b: any) => b.name === "Goals Over/Under");
          if (ou) {
            const outcomes = ou.values
              .filter((v: any) => /^(Over|Under)\s+[\d.]+$/.test(v.value))
              .map((v: any) => {
                const m = v.value.match(/^(Over|Under)\s+([\d.]+)$/);
                const dir = m[1] === "Over" ? "Mais" : "Menos";
                return { name: `${dir} ${m[2]}`, price: parseFloat(v.odd) };
              })
              .filter((o: any) => !isNaN(o.price) && o.price > 0)
              .sort((a: any, b: any) => {
                const lineA = parseFloat(a.name.split(" ")[1]);
                const lineB = parseFloat(b.name.split(" ")[1]);
                if (lineA !== lineB) return lineA - lineB;
                return a.name.startsWith("Mais") ? -1 : 1;
              });
            if (outcomes.length >= 2) extra.push({ key: "totals", outcomes });
          }
          return extra;
        };

        const extractH2hFromBk = (bk: any, title?: string) => {
          if (!bk) return null;
          const bets: any[] = bk.bets || [];
          const h2h = bets.find((b: any) => b.name === "Match Winner");
          if (!h2h || h2h.values?.length < 2) return null;
          const markets: any[] = [{ key: "h2h", outcomes: h2h.values.map((v: any) => ({
            name: v.value === "Home" ? "__HOME__" : v.value === "Away" ? "__AWAY__" : "Empate",
            price: parseFloat(v.odd)
          }))}];
          markets.push(...extractAdditionalMarkets(bets));
          return [{
            key: "api-football",
            title: title || bk.name,
            markets
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
            // Só pular busca se todos os fixtures já estão cobertos
            const allCovered = upcoming.every((f: any) => todayOddsMap.has(f.fixture.id));
            if (allCovered) continue;
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
                const bk = pickBestBookmaker(allBks);
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

      // Remover campo interno _priority e filtrar jogos sem odds disponíveis
      const finalGames = allGames
        .filter(g => g.bookmakers && g.bookmakers.length > 0)
        .map(({ _priority, ...g }) => g);

      console.log(`Games today endpoint - Found ${finalGames.length} games across all leagues`);
      cache.set(cacheKey, finalGames, 5 * 60 * 1000); // cache 5 minutos
      resolvePending(finalGames); // Notificar endpoints que aguardavam este resultado
      if (!respondedWithStale) {
        const blockedIds = await storage.getBlockedGameIds();
        res.json(blockedIds.size > 0 ? finalGames.filter((g: any) => !blockedIds.has(g.id)) : finalGames);
      } else {
        console.log(`[games/today] Refresh em background concluído — ${finalGames.length} jogos no cache`);
      }
    } catch (error) {
      rejectPending(error); // Liberar endpoints que aguardavam
      console.error("Error fetching today's games:", error);
      if (!respondedWithStale) {
        res.status(500).json({ error: "Failed to fetch today's games" });
      }
    }
  });

  // ── Copa do Mundo 2026 — jogos por data ──────────────────────────────────────
  // Antes de 11/jun: retorna preview dos jogos de 11-12/jun.
  // A partir de 11/jun: retorna jogos das próximas 24h (comportamento normal).
  app.get("/api/copa-mundo-games", async (req, res) => {
    try {
      const WC_LEAGUE_ID = 1;
      const WC_SEASON = 2026;
      const TOURNAMENT_START_MS = new Date("2026-06-11T00:00:00Z").getTime();
      const nowMs = Date.now();

      let fromDate: string;
      let toDate: string;

      if (nowMs < TOURNAMENT_START_MS) {
        fromDate = "2026-06-11";
        toDate = "2026-06-18";
      } else {
        fromDate = new Date(nowMs).toISOString().split("T")[0];
        toDate = new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      }

      const cacheKey = `copa_mundo_games_${fromDate}_${toDate}`;
      const cached = cache.get<any[]>(cacheKey);
      if (cached) return res.json(cached);

      if (!API_FOOTBALL_KEY) return res.json([]);

      const fixturesRes = await fetch(
        `${API_FOOTBALL_BASE}/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}&from=${fromDate}&to=${toDate}`,
        { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
      );
      if (!fixturesRes.ok) return res.json([]);
      const fixturesData = await fixturesRes.json();

      const fixtures = (fixturesData.response || []).filter((f: any) => {
        const status = f.fixture?.status?.short;
        return ["NS", "TBD"].includes(status);
      });

      console.log(`[Copa do Mundo] ${fixtures.length} jogos encontrados para ${fromDate}→${toDate}`);

      if (fixtures.length === 0) {
        cache.set(cacheKey, [], 10 * 60 * 1000);
        return res.json([]);
      }

      // Buscar odds para os próximos 3 dias (cobrindo jogos mais próximos)
      const oddsMap = new Map<number, any>();
      const startMs = new Date(fromDate + "T00:00:00Z").getTime();
      const datesToFetch: string[] = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date(startMs + i * 24 * 60 * 60 * 1000);
        datesToFetch.push(d.toISOString().split("T")[0]);
      }
      for (const dateStr of datesToFetch) {
        try {
          const r = await fetch(
            `${API_FOOTBALL_BASE}/odds?league=${WC_LEAGUE_ID}&season=${WC_SEASON}&date=${dateStr}`,
            { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
          );
          if (r.ok) {
            const d = await r.json();
            for (const entry of d.response || []) {
              const fid = entry.fixture?.id;
              if (!fid || oddsMap.has(fid)) continue;
              const bk = pickBestBookmaker(entry.bookmakers || []);
              if (bk) oddsMap.set(fid, bk);
            }
          }
        } catch { /* silently ignore */ }
      }

      const games = fixtures.map((fixture: any) => {
        const fid = fixture.fixture.id;
        const homeTeam = formatTeamName(fixture.teams.home.name);
        const awayTeam = formatTeamName(fixture.teams.away.name);
        const bk = oddsMap.get(fid);
        let bookmakers: any[] = [];
        if (bk) {
          const bets: any[] = bk.bets || [];
          const h2h = bets.find((b: any) => b.name === "Match Winner");
          if (h2h && h2h.values?.length >= 2) {
            const markets: any[] = [{
              key: "h2h",
              outcomes: h2h.values.map((v: any) => ({
                name: v.value === "Home" ? homeTeam : v.value === "Away" ? awayTeam : "Empate",
                price: parseFloat(v.odd),
              })),
            }, ...extractExtraMarketsFromBets(bets)];
            bookmakers = [{ key: "api-football", title: bk.name, markets }];
          }
        }
        return {
          id: `api-football-${fid}`,
          sportKey: "soccer_fifa_world_cup",
          sportTitle: "Copa do Mundo 2026",
          commenceTime: fixture.fixture.date,
          homeTeam,
          awayTeam,
          homeLogo: fixture.teams.home.logo,
          awayLogo: fixture.teams.away.logo,
          bookmakers,
        };
      });

      games.sort((a: any, b: any) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());

      cache.set(cacheKey, games, 10 * 60 * 1000);
      res.json(games);
    } catch (error) {
      console.error("Error fetching Copa do Mundo games:", error);
      res.status(500).json({ error: "Failed to fetch Copa do Mundo games" });
    }
  });

  // ── Ligas Brasileiras: Brasileirão, Libertadores, Copa do Brasil (48h) ─────────
  app.get("/api/brazilian-games", async (req, res) => {
    try {
      const nowMs = Date.now();
      const next48hMs = nowMs + 48 * 60 * 60 * 1000;
      const fromStr = new Date(nowMs).toISOString().split("T")[0];
      const toStr = new Date(next48hMs).toISOString().split("T")[0];
      const cacheKey = `brazilian_games_${fromStr}_${toStr}`;
      const cached = cache.get<any[]>(cacheKey);
      if (cached) return res.json(cached);

      if (!API_FOOTBALL_KEY) return res.json([]);

      const brazilianSeason = new Date().getFullYear();
      const leagues = [
        { id: 71,  key: "soccer_brazil_campeonato",          name: "Brasileirão Série A" },
        { id: 13,  key: "soccer_conmebol_copa_libertadores", name: "Copa Libertadores"   },
        { id: 73,  key: "soccer_brazil_copa_do_brasil",      name: "Copa do Brasil"      },
      ];

      const allGames: any[] = [];

      for (const league of leagues) {
        try {
          const fixturesRes = await fetch(
            `${API_FOOTBALL_BASE}/fixtures?league=${league.id}&season=${brazilianSeason}&from=${fromStr}&to=${toStr}`,
            { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
          );
          if (!fixturesRes.ok) continue;
          const fixturesData = await fixturesRes.json();

          const fixtures = (fixturesData.response || []).filter((f: any) => {
            const status = f.fixture?.status?.short;
            const gameDate = new Date(f.fixture?.date).getTime();
            return ["NS", "TBD"].includes(status) && gameDate > nowMs && gameDate <= next48hMs;
          });

          if (fixtures.length === 0) continue;

          // Buscar odds individualmente por fixture ID (mais confiável que bulk por data)
          const oddsMap = new Map<number, any>();
          for (const fixture of fixtures) {
            const fid = fixture.fixture.id;
            try {
              const r = await fetch(
                `${API_FOOTBALL_BASE}/odds?fixture=${fid}`,
                { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
              );
              if (r.ok) {
                const d = await r.json();
                const allBks: any[] = d.response?.[0]?.bookmakers || [];
                const bk = pickBestBookmaker(allBks);
                if (bk) oddsMap.set(fid, bk);
              }
            } catch { /* silently ignore */ }
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          for (const fixture of fixtures) {
            const fid = fixture.fixture.id;
            const homeTeam = formatTeamName(fixture.teams.home.name);
            const awayTeam = formatTeamName(fixture.teams.away.name);
            const bk = oddsMap.get(fid);
            let bookmakers: any[] = [];
            if (bk) {
              const bets: any[] = bk.bets || [];
              const h2h = bets.find((b: any) => b.name === "Match Winner");
              if (h2h && h2h.values?.length >= 2) {
                const markets: any[] = [{
                  key: "h2h",
                  outcomes: h2h.values.map((v: any) => ({
                    name: v.value === "Home" ? homeTeam : v.value === "Away" ? awayTeam : "Empate",
                    price: parseFloat(v.odd),
                  })),
                }, ...extractExtraMarketsFromBets(bets)];
                bookmakers = [{ key: "api-football", title: bk.name, markets }];
              }
            }
            allGames.push({
              id: `api-football-${fid}`,
              sportKey: league.key,
              sportTitle: league.name,
              commenceTime: fixture.fixture.date,
              homeTeam,
              awayTeam,
              homeLogo: fixture.teams.home.logo,
              awayLogo: fixture.teams.away.logo,
              bookmakers,
            });
          }

          await new Promise(resolve => setTimeout(resolve, 200));
        } catch { /* skip league on error */ }
      }

      allGames.sort((a: any, b: any) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());
      console.log(`[brazilian-games] ${allGames.length} jogos encontrados (${fromStr}→${toStr})`);
      cache.set(cacheKey, allGames, 10 * 60 * 1000);
      res.json(allGames);
    } catch (error) {
      console.error("Error fetching Brazilian games:", error);
      res.status(500).json({ error: "Failed to fetch Brazilian games" });
    }
  });

  // Endpoint dedicado para a Final da Champions League 2025/26 (PSG vs Arsenal, fixture 1544371)
  app.get("/api/ucl-final", async (req, res) => {
    try {
      const UCL_FIXTURE_ID = 1544371;
      const cacheKey = "ucl_final_2026";
      const cached = cache.get<any>(cacheKey);
      if (cached) return res.json(cached);

      if (!API_FOOTBALL_KEY) return res.json(null);

      const fixtureRes = await fetch(
        `${API_FOOTBALL_BASE}/fixtures?id=${UCL_FIXTURE_ID}`,
        { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
      );
      if (!fixtureRes.ok) return res.json(null);
      const fixtureData = await fixtureRes.json();
      const fixture = fixtureData.response?.[0];
      if (!fixture) return res.json(null);

      const homeTeam = formatTeamName(fixture.teams.home.name);
      const awayTeam = formatTeamName(fixture.teams.away.name);

      // Tentar buscar odds
      let bookmakers: any[] = [];
      try {
        const oddsRes = await fetch(
          `${API_FOOTBALL_BASE}/odds?fixture=${UCL_FIXTURE_ID}`,
          { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
        );
        if (oddsRes.ok) {
          const oddsData = await oddsRes.json();
          const bk = pickBestBookmaker(oddsData.response?.[0]?.bookmakers || []);
          if (bk) {
            const bets: any[] = bk.bets || [];
            const h2h = bets.find((b: any) => b.name === "Match Winner");
            if (h2h && h2h.values?.length >= 2) {
              const markets: any[] = [{
                key: "h2h",
                outcomes: h2h.values.map((v: any) => ({
                  name: v.value === "Home" ? homeTeam : v.value === "Away" ? awayTeam : "Empate",
                  price: parseFloat(v.odd),
                })),
              }, ...extractExtraMarketsFromBets(bets)];
              bookmakers = [{ key: "api-football", title: bk.name, markets }];
            }
          }
        }
      } catch { /* silently ignore */ }

      const game = {
        id: `api-football-${UCL_FIXTURE_ID}`,
        sportKey: "soccer_uefa_champs_league",
        sportTitle: "UEFA Champions League",
        commenceTime: fixture.fixture.date,
        homeTeam,
        awayTeam,
        homeLogo: fixture.teams.home.logo,
        awayLogo: fixture.teams.away.logo,
        bookmakers,
      };

      cache.set(cacheKey, game, 10 * 60 * 1000);
      res.json(game);
    } catch (error) {
      console.error("Error fetching UCL final:", error);
      res.json(null);
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

      // Aproveitar cache do games_today se já estiver populado — evita corrida de API
      const todayCacheForBr = cache.get<any[]>("games_today");
      if (todayCacheForBr) {
        const brGames = todayCacheForBr.filter((g: any) => g.sportKey === "soccer_brazil_campeonato");
        if (brGames.length > 0) {
          cache.set(cacheKey, brGames, 5 * 60 * 1000);
          const blockedIds = await storage.getBlockedGameIds();
          return res.json(blockedIds.size > 0 ? brGames.filter((g: any) => !blockedIds.has(g.id)) : brGames);
        }
      }

      let games: any[] = [];

      // API-Football PRIMEIRO — odds reais da bookmaker correta (ex: 3.90 para Remo)
      if (API_FOOTBALL_KEY) {
        const currentYear = new Date().getFullYear();
        const nowMs = Date.now();
        const next24hMs = nowMs + 24 * 60 * 60 * 1000;
        const today = new Date(nowMs).toISOString().split('T')[0];
        const next24hStr = new Date(next24hMs).toISOString().split('T')[0];

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

        // Buscar todas as odds do Brasileirão de uma vez (hoje + amanhã UTC, pois jogos como 21:00 BRT ficam no dia seguinte UTC)
        const oddsMap = new Map<number, any[]>(); // fixtureId -> bookmakers
        const tomorrow = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const processOddsEntries = (entries: any[]) => {
          for (const entry of entries) {
            const fid = entry.fixture?.id;
            if (!fid || oddsMap.has(fid)) continue;
            const allBks: any[] = entry.bookmakers || [];
            const chosenBk = pickBestBookmaker(allBks);
            const bets = chosenBk?.bets || [];
            const h2h = bets.find((b: any) => b.name === "Match Winner");
            if (h2h && h2h.values?.length >= 2) {
              console.log(`[BR-bulk] ${fid} bookmaker: ${chosenBk.name}`);
              const markets: any[] = [{
                key: "h2h",
                outcomes: h2h.values.map((v: any) => ({
                  name: v.value === "Home" ? "HOME_PLACEHOLDER" :
                        v.value === "Away" ? "AWAY_PLACEHOLDER" : "Empate",
                  price: parseFloat(v.odd)
                }))
              }, ...extractExtraMarketsFromBets(bets)];
              oddsMap.set(fid, [{ key: "api-football", title: chosenBk.name, markets }]);
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
          // Buscar sequencialmente com pausa para evitar throttling da API
          for (const fixture of missedFixtures) {
            const fid = fixture.fixture.id;
            try {
              const r = await fetch(`${API_FOOTBALL_BASE}/odds?fixture=${fid}`, { headers: { "x-apisports-key": API_FOOTBALL_KEY } });
              if (r.ok) {
                const d = await r.json();
                const allBks: any[] = d.response?.[0]?.bookmakers || [];
                const chosenBk = pickBestBookmaker(allBks);
                const bets = chosenBk?.bets || [];
                const h2h = bets.find((b: any) => b.name === "Match Winner");
                if (h2h && h2h.values?.length >= 2) {
                  console.log(`[BR-indiv] ${fid} bookmaker: ${chosenBk.name}`);
                  const markets: any[] = [{ key: "h2h", outcomes: h2h.values.map((v: any) => ({
                    name: v.value === "Home" ? "HOME_PLACEHOLDER" : v.value === "Away" ? "AWAY_PLACEHOLDER" : "Empate",
                    price: parseFloat(v.odd)
                  }))}, ...extractExtraMarketsFromBets(bets)];
                  oddsMap.set(fid, [{ key: "api-football", title: chosenBk.name, markets }]);
                } else {
                  console.warn(`[BR-indiv] fixture ${fid} sem Match Winner, bookmakers: ${allBks.length}`);
                }
              }
            } catch (e) { console.error(`[BR-indiv] erro fixture ${fid}:`, e); }
            await new Promise(r => setTimeout(r, 200)); // pausa entre chamadas
          }
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
          10:  { key: "soccer_international_friendlies", name: "Amistosos Internacionais", season: brazilianSeason },
          34:  { key: "soccer_wc_qualifiers_conmebol", name: "Eliminatórias Copa – CONMEBOL", season: brazilianSeason },
          32:  { key: "soccer_wc_qualifiers_europe", name: "Eliminatórias Copa – UEFA", season: brazilianSeason },
          31:  { key: "soccer_wc_qualifiers_concacaf", name: "Eliminatórias Copa – CONCACAF", season: brazilianSeason },
          29:  { key: "soccer_wc_qualifiers_caf", name: "Eliminatórias Copa – África", season: brazilianSeason },
          30:  { key: "soccer_wc_qualifiers_afc", name: "Eliminatórias Copa – Ásia", season: brazilianSeason },
          43:  { key: "soccer_wc_intercontinental", name: "Playoffs Intercontinentais Copa", season: brazilianSeason },
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
                  const bk = pickBestBookmaker(allBks);
                  if (bk) {
                    const bets: any[] = bk.bets || [];
                    const h2h = bets.find((b: any) => b.name === "Match Winner");
                    if (h2h) {
                      const markets: any[] = [{ key: "h2h", outcomes: h2h.values.map((v: any) => ({
                        name: v.value === "Home" ? f.teams?.home?.name : v.value === "Away" ? f.teams?.away?.name : "Empate",
                        price: parseFloat(v.odd)
                      }))}, ...extractExtraMarketsFromBets(bets)];
                      bookmakers = [{ key: "api-football", title: bk.name, markets }];
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
      let todayCache = cache.get<any[]>("games_today");

      // Se games_today está sendo carregado em paralelo (ex: warmup no cold start),
      // aguardar em vez de fazer chamadas simultâneas que causam throttling na API
      if (!todayCache) {
        const pending = await cache.waitForPending<any[]>("games_today");
        if (pending) todayCache = pending;
      }

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
          "soccer_international_friendlies": { id: 10, name: "Amistosos Internacionais", season: brazilianSeason },
          "soccer_wc_qualifiers_conmebol": { id: 34, name: "Eliminatórias Copa – CONMEBOL", season: brazilianSeason },
          "soccer_wc_qualifiers_europe": { id: 32, name: "Eliminatórias Copa – UEFA", season: brazilianSeason },
          "soccer_wc_qualifiers_concacaf": { id: 31, name: "Eliminatórias Copa – CONCACAF", season: brazilianSeason },
          "soccer_wc_qualifiers_caf": { id: 29, name: "Eliminatórias Copa – África", season: brazilianSeason },
          "soccer_wc_qualifiers_afc": { id: 30, name: "Eliminatórias Copa – Ásia", season: brazilianSeason },
          "soccer_wc_intercontinental": { id: 43, name: "Playoffs Intercontinentais Copa", season: brazilianSeason },
        };
        
        const league = leagueMapping[sportKey];
        if (league) {
          console.log(`Using API-Football for ${sportKey}`);

          const nowMs = Date.now();
          const next24hMs = nowMs + 24 * 60 * 60 * 1000;
          const today = new Date(nowMs).toISOString().split('T')[0];
          const next24hStr = new Date(next24hMs).toISOString().split('T')[0];
          
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
                      let chosenBk2 = pickBestBookmaker(allBookmakers2);
                      const bets = chosenBk2?.bets || [];
                      const h2h = bets.find((b: any) => b.name === "Match Winner");
                      if (h2h && h2h.values?.length >= 2) {
                        const markets: any[] = [{
                          key: "h2h",
                          outcomes: h2h.values.map((v: any) => ({
                            name: v.value === "Home" ? formatTeamName(fixture.teams.home.name) :
                                  v.value === "Away" ? formatTeamName(fixture.teams.away.name) : "Empate",
                            price: parseFloat(v.odd)
                          }))
                        }, ...extractExtraMarketsFromBets(bets)];
                        bookmakers = [{ key: "api-football", title: chosenBk2.name, markets }];
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
      
      const gamesWithOdds = games.filter((g: any) => g.bookmakers && g.bookmakers.length > 0);
      cache.set(cacheKey, gamesWithOdds, CACHE_TTL_ODDS);
      const blockedIds = await storage.getBlockedGameIds();
      res.json(blockedIds.size > 0 ? gamesWithOdds.filter((g: any) => !blockedIds.has(g.id)) : gamesWithOdds);
    } catch (error) {
      console.error("Error fetching odds:", error);
      res.status(500).json({ error: "Failed to fetch odds" });
    }
  });

  const MAX_BET_PAYOUT = 15000;
  const MAX_MARKETS_PER_GAME = 3;

  // --- Configurações dinâmicas ---
  let DAILY_LIMIT = 50000;
  let autoCheckIntervalMs = 5 * 60 * 1000;
  let autoCheckTimer: ReturnType<typeof setInterval> | null = null;

  // Carrega configurações salvas do banco
  const savedAporte = await storage.getSetting("aporteInicial");
  if (savedAporte) DAILY_LIMIT = parseInt(savedAporte, 10) || 50000;
  const savedInterval = await storage.getSetting("checkIntervalMinutes");
  if (savedInterval) autoCheckIntervalMs = (parseInt(savedInterval, 10) || 5) * 60 * 1000;

  // Defesas pool (hedge bets)
  let defensasInitialBalance = 1000;
  let defensasBalance = 1000;
  let defensasProfits = 0;
  let earlyExitPct = 20;
  let cashOutPct = 20;
  const savedDefesasInitial = await storage.getSetting("defensasInitialBalance");
  if (savedDefesasInitial) defensasInitialBalance = parseFloat(savedDefesasInitial) || 1000;
  const savedDefesasBalance = await storage.getSetting("defensasBalance");
  defensasBalance = savedDefesasBalance !== null ? (parseFloat(savedDefesasBalance) ?? defensasInitialBalance) : defensasInitialBalance;
  const savedDefesasProfits = await storage.getSetting("defensasProfits");
  if (savedDefesasProfits) defensasProfits = parseFloat(savedDefesasProfits) || 0;
  const savedEarlyExitPct = await storage.getSetting("earlyExitPct");
  if (savedEarlyExitPct) earlyExitPct = parseFloat(savedEarlyExitPct) || 20;
  const savedCashOutPct = await storage.getSetting("cashOutPct");
  if (savedCashOutPct) cashOutPct = parseFloat(savedCashOutPct) || 20;

  // Extras do caixa (lucro da casa no bolão, etc.)
  let caixaExtras = 0;
  const savedCaixaExtras = await storage.getSetting("caixaExtras");
  if (savedCaixaExtras) caixaExtras = parseFloat(savedCaixaExtras) || 0;

  function startAutoCheckTimer() {
    if (autoCheckTimer) clearInterval(autoCheckTimer);
    autoCheckTimer = setInterval(async () => {
      if (!API_FOOTBALL_KEY) return;
      try {
        const result = await runCheckResults();
        if (result.updated > 0) {
          console.log(`[Auto] ${result.updated} bilhete(s) atualizado(s) de ${result.totalPending} pendente(s)`);
        }
      } catch (err) {
        console.error(`[Auto] Erro na verificação automática:`, err);
      }
    }, autoCheckIntervalMs);
  }

  async function computeCaixaBalance(): Promise<number> {
    const [allDeposits, allUsers, allBets, adminWithdrawals, userWithdrawals] = await Promise.all([
      storage.getAllDeposits(),
      storage.getAllUsers(),
      storage.getAllBetSlips(),
      storage.getWithdrawals(),
      storage.getAllUserWithdrawals(),
    ]);
    const confirmedDeposits = allDeposits.filter((d: any) => d.status === "confirmed");
    const entradasPix = confirmedDeposits.reduce((s: number, d: any) => s + d.amount, 0);
    const saldosClientes = allUsers.reduce((s: number, u: any) => s + u.balance, 0);
    const exposicao = allBets.filter((b: any) => b.status === "pending").reduce((s: number, b: any) => s + Math.max(0, b.potentialWin - (b.bonusUsed ?? 0)), 0);
    const totalSaquesAdmin = adminWithdrawals.reduce((s: number, w: any) => s + w.amount, 0);
    const pagamentosUsuarios = userWithdrawals
      .filter((w: any) => w.status === "paid" || w.status === "approved")
      .reduce((s: number, w: any) => s + w.amount, 0);
    return Math.max(0,
      DAILY_LIMIT + entradasPix - saldosClientes - exposicao - totalSaquesAdmin - pagamentosUsuarios + defensasProfits + caixaExtras
    );
  }

  app.get("/api/limits", async (req, res) => {
    try {
      const [dailyTotal, caixaBalance] = await Promise.all([
        storage.getDailyTotalPotentialWin(),
        computeCaixaBalance(),
      ]);
      const dailyRemaining = Math.max(0, DAILY_LIMIT - dailyTotal);

      res.json({
        dailyTotal,
        dailyLimit: DAILY_LIMIT,
        dailyRemaining,
        maxBetPayout: MAX_BET_PAYOUT,
        maxMarketsPerGame: MAX_MARKETS_PER_GAME,
        isDailyLimitReached: caixaBalance <= 0,
        caixaBalance,
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

      // Arredondar odds para 2 casas decimais antes de salvar (evita imprecisão float)
      validatedData.selections = validatedData.selections.map(sel => ({
        ...sel,
        odds: Math.round(sel.odds * 100) / 100,
      }));

      // Verificar se mercados ao vivo estão bloqueados pelo admin (por fixture)
      const hasLiveSelections = validatedData.selections.some(sel => sel.marketKey?.startsWith("live_"));
      if (hasLiveSelections) {
        for (const sel of validatedData.selections) {
          if (!sel.marketKey?.startsWith("live_")) continue;
          const fidStr = (sel.gameId ?? "").replace("api-football-", "");
          const fid = fidStr ? Number(fidStr) : null;
          if (fid && lockedFixtures.has(fid)) {
            return res.status(400).json({
              error: "Os mercados ao vivo estão temporariamente bloqueados. Tente novamente em instantes.",
              isLiveMarketLocked: true,
            });
          }
        }
      }

      // Verificar se algum jogo já iniciou (seleções ao vivo são permitidas)
      const now = new Date();
      for (const sel of validatedData.selections) {
        const isLiveSel = sel.marketKey?.startsWith("live_");
        const isManualCard = sel.gameId?.startsWith("copa-card-") || sel.marketKey === "boost";
        if (!isLiveSel && !isManualCard && sel.commenceTime) {
          const gameStart = new Date(sel.commenceTime);
          if (gameStart <= now) {
            return res.status(400).json({
              error: `O jogo ${sel.homeTeam} x ${sel.awayTeam} já foi iniciado e não aceita mais apostas.`,
              isGameStarted: true,
            });
          }
        }
      }

      // Mínimo de R$5 para apostas normais (Super Boost pode ter mínimo menor configurado pelo admin)
      const hasBoostSel = validatedData.selections.some(s => s.marketKey === "boost");
      if (!hasBoostSel && validatedData.stake < 5) {
        return res.status(400).json({
          error: "Valor mínimo de aposta é R$5,00.",
          isMinStakeRequired: true,
        });
      }

      // Verificar maxStake e uso único de Super Boost cards
      {
        const boostSel = validatedData.selections.find(s => s.marketKey === "boost");
        if (boostSel) {
          const boostCardId = parseInt(String(boostSel.gameId).replace("boost-", ""), 10);
          if (!isNaN(boostCardId)) {
            const allCards = await storage.getBoostCards();
            const boostCard = allCards.find(c => c.id === boostCardId);
            if (boostCard && (boostCard as any).minStake != null && validatedData.stake < (boostCard as any).minStake) {
              return res.status(400).json({
                error: `A aposta mínima para este Super Boost é R$${((boostCard as any).minStake as number).toFixed(2).replace(".", ",")}.`,
                isMinStakeRequired: true,
              });
            }
            if (boostCard && (boostCard as any).maxStake != null && validatedData.stake > (boostCard as any).maxStake) {
              return res.status(400).json({
                error: `A aposta máxima para este Super Boost é R$${((boostCard as any).maxStake as number).toFixed(2).replace(".", ",")}.`,
                isMaxStakeExceeded: true,
              });
            }
            // Verificar uso único por usuário
            const betUserId = (req.session as any)?.userId;
            if (betUserId) {
              const userBets = await storage.getBetSlipsByUser(betUserId);
              const alreadyUsed = userBets.some(b =>
                Array.isArray(b.selections) &&
                b.selections.some((s: any) => s.gameId === `boost-${boostCardId}`)
              );
              if (alreadyUsed) {
                return res.status(400).json({
                  error: "Você já utilizou este Super Boost. Cada boost pode ser usado apenas uma vez.",
                  isBoostAlreadyUsed: true,
                });
              }
            }
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

      const caixaAtual = await computeCaixaBalance();

      if (caixaAtual <= 0) {
        return res.status(400).json({
          error: "Para assegurar os pagamentos das apostas já feitas, o painel retomará em algumas horas.",
          isDailyLimitReached: true,
        });
      }

      // Agrupar seleções por jogo e calcular odds SGP quando aplicável
      const byGameForSGP = new Map<string, typeof validatedData.selections>();
      for (const sel of validatedData.selections) {
        if (!byGameForSGP.has(sel.gameId)) byGameForSGP.set(sel.gameId, []);
        byGameForSGP.get(sel.gameId)!.push(sel);
      }

      // Carregar matriz de correlação ao vivo para bilhetes ao vivo
      // Mesclar defaults para garantir que o backend use os mesmos coeficientes que o frontend
      const LIVE_CORR_DEFAULTS_BET: Record<string, number> = {
        "1_5": 0.90, "1_6": 0.90, "1_8": 0.85, "1_12": 0.92,
        "5_6": 0.75, "5_8": 0.80, "5_12": 0.90,
        "6_8": 0.82, "6_12": 0.88, "8_12": 0.88,
      };
      const liveCorrRaw = await storage.getSetting("live_correlation_matrix");
      const liveCorrSaved: Record<string, number> = liveCorrRaw ? JSON.parse(liveCorrRaw) : {};
      const liveCorrMatrix: Record<string, number> = { ...LIVE_CORR_DEFAULTS_BET, ...liveCorrSaved };
      const LIVE_CORR_NORM_IDS_BE = new Set([1, 8, 12, 5, 6]);
      function normLiveCorrIdBE(mk: string): number | null {
        if (!mk.startsWith("live_m")) return null;
        const id = parseInt(mk.slice(6), 10);
        if (id === 25) return 5;
        return LIVE_CORR_NORM_IDS_BE.has(id) ? id : null;
      }
      function isLiveCorrEligibleBE(mk: string): boolean {
        return normLiveCorrIdBE(mk) !== null;
      }

      const sgpGameOdds = new Map<string, number>();
      await Promise.all(Array.from(byGameForSGP.entries()).map(async ([gameId, gameSels]) => {
        const eligible = gameSels.filter((s: any) => isSGPEligibleMarket(s.marketKey));
        if (eligible.length < 2) return;
        const first: any = gameSels[0];
        // Resolver fixtureId: usar prefixo api-football ou buscar via cache de extra-markets
        let fid: string;
        if (gameId.startsWith('api-football-')) {
          fid = gameId.replace('api-football-', '');
        } else {
          const ht = first.homeTeam || '';
          const at = first.awayTeam || '';
          const extraCached = cache.get<any>(`extra_markets_${ht}_${at}_`);
          if (extraCached?.fixtureId) {
            fid = String(extraCached.fixtureId);
          } else {
            // Sem fixtureId mas passamos odds individuais para o fallback de correlação
            fid = gameId; // não numérico → fetchScoreDist vai falhar → fallback de correlação será usado
          }
        }
        try {
          const eligibleWithOdds = eligible.map((s: any) => ({
            marketKey: s.marketKey,
            outcome: s.outcome,
            odds: s.odds,
            originalOdds: s.originalOdds,
          }));
          const sgpOdd = await computeSGPOddForGame(fid, first.homeTeam || '', first.awayTeam || '', eligibleWithOdds);
          if (sgpOdd !== null) sgpGameOdds.set(gameId, sgpOdd);
        } catch { /* fallback to naive */ }
      }));

      // Calcular odd de cada jogo considerando SGP e correlação ao vivo
      function gameContribution(gameId: string, gameSels: any[], isComboCtx: boolean): number {
        const sgpOdd = sgpGameOdds.get(gameId);
        if (sgpOdd) {
          const eligible = gameSels.filter((s: any) => isSGPEligibleMarket(s.marketKey));
          const nonEligible = gameSels.filter((s: any) => !isSGPEligibleMarket(s.marketKey));
          if (eligible.length >= 2) {
            let contrib = sgpOdd;
            for (const sel of nonEligible) {
              const isH2H = sel.marketKey === 'h2h' || sel.marketKey === 'match_winner';
              contrib *= (isComboCtx && isH2H && sel.originalOdds) ? sel.originalOdds : sel.odds;
            }
            return contrib;
          }
        }
        // Live correlation: aplicar coeficiente para pares de mercados ao vivo
        const liveSels = gameSels.filter((s: any) => isLiveCorrEligibleBE(s.marketKey));
        if (liveSels.length === 2) {
          const idA = normLiveCorrIdBE(liveSels[0].marketKey)!;
          const idB = normLiveCorrIdBE(liveSels[1].marketKey)!;
          const pairKey = `${Math.min(idA, idB)}_${Math.max(idA, idB)}`;
          const coeff = liveCorrMatrix[pairKey] ?? 1.0;
          const corrOdds = liveSels[0].odds * liveSels[1].odds * coeff;
          // Multiplicar quaisquer seleções adicionais não elegíveis (ex.: escanteios)
          const nonLive = gameSels.filter((s: any) => !isLiveCorrEligibleBE(s.marketKey));
          return nonLive.reduce((acc: number, s: any) => acc * s.odds, corrOdds);
        }
        // Naive: usar originalOdds para h2h em contexto de combo
        return gameSels.reduce((acc: number, s: any) => {
          const isH2H = s.marketKey === 'h2h' || s.marketKey === 'match_winner';
          return acc * ((isComboCtx && isH2H && s.originalOdds) ? s.originalOdds : s.odds);
        }, 1);
      }

      let totalOdds: number;
      let potentialWin: number;
      if (checkIsComboBonus(validatedData.selections)) {
        const distinctGameCount = byGameForSGP.size;
        const comboPctTable = await loadComboBonusTable();
        const bonusPct = getComboBonus(distinctGameCount, pctTableToFraction(comboPctTable));
        const baseOdds = Array.from(byGameForSGP.entries())
          .reduce((acc, [gid, sels]) => acc * gameContribution(gid, sels, true), 1);
        const rawTotalOdds = baseOdds * (1 + bonusPct);
        totalOdds = Math.floor(rawTotalOdds * 100) / 100;
        potentialWin = Math.round(validatedData.stake * rawTotalOdds * 100) / 100;
      } else {
        const isMultiGame = byGameForSGP.size > 1;
        const baseOdds = Array.from(byGameForSGP.entries())
          .reduce((acc, [gid, sels]) => acc * gameContribution(gid, sels, isMultiGame), 1);
        totalOdds = Math.round(baseOdds * 100) / 100;
        potentialWin = Math.round(validatedData.stake * baseOdds * 100) / 100;
      }

      if (potentialWin > MAX_BET_PAYOUT) {
        return res.status(400).json({
          error: `O retorno potencial de R$${potentialWin.toFixed(2)} ultrapassa o limite máximo de R$${MAX_BET_PAYOUT.toLocaleString('pt-BR')},00 por bilhete. Reduza o valor apostado.`,
        });
      }

      let cappedByDaily = false;
      if (potentialWin > caixaAtual) {
        potentialWin = caixaAtual;
        cappedByDaily = true;
      }

      // Debitar saldo do usuário se autenticado via sessão
      // Usar sempre req.session.userId para evitar spoofing pelo corpo da requisição
      const sessionUserId = req.session.userId as string | undefined;
      if (sessionUserId) {
        // Garantir que o userId do corpo corresponde ao usuário da sessão
        if (validatedData.userId && validatedData.userId !== sessionUserId) {
          return res.status(403).json({ error: "Usuário não autorizado" });
        }
        // Forçar userId da sessão no bilhete
        validatedData.userId = sessionUserId;
        const betUser = await storage.getUserByCpf(sessionUserId);
        if (!betUser) {
          return res.status(400).json({ error: "Usuário não encontrado" });
        }
        const useBonus = !!(req.body as any).useBonus;
        if (useBonus) {
          // Use all available bonus first, then fill remainder from main balance
          const bonusToUse = Math.min(betUser.bonusBalance, validatedData.stake);
          const mainToUse = Math.round((validatedData.stake - bonusToUse) * 100) / 100;
          const totalAvailable = Math.round((betUser.bonusBalance + betUser.balance) * 100) / 100;
          if (totalAvailable < validatedData.stake) {
            return res.status(400).json({
              error: `Saldo insuficiente. Disponível: R$${totalAvailable.toFixed(2).replace(".", ",")} (inclui bônus).`,
              isInsufficientBalance: true,
            });
          }
          if (bonusToUse > 0) {
            const newBonusBalance = Math.round((betUser.bonusBalance - bonusToUse) * 100) / 100;
            await storage.updateUserBonusBalance(sessionUserId, newBonusBalance);
          }
          let newMainBalance = betUser.balance;
          if (mainToUse > 0) {
            newMainBalance = Math.round((betUser.balance - mainToUse) * 100) / 100;
            await storage.updateUserBalance(sessionUserId, newMainBalance);
          }
          (validatedData as any)._newBalanceAfterBet = newMainBalance;
          (validatedData as any)._usedBonusAmt = bonusToUse;
          (validatedData as any)._usedMainAmt = mainToUse;
          (validatedData as any)._usedBonus = true;
        } else {
          // Deduct from real balance
          if (betUser.balance < validatedData.stake) {
            return res.status(400).json({
              error: `Saldo insuficiente. Seu saldo é R$${betUser.balance.toFixed(2).replace(".", ",")} e o valor da aposta é R$${validatedData.stake.toFixed(2).replace(".", ",")}.`,
              isInsufficientBalance: true,
            });
          }
          const newBalance = Math.round((betUser.balance - validatedData.stake) * 100) / 100;
          await storage.updateUserBalance(sessionUserId, newBalance);
          (validatedData as any)._newBalanceAfterBet = newBalance;
        }
      } else if (validatedData.userId) {
        // Corpo tem userId mas sem sessão — não permitir debitação sem autenticação
        return res.status(401).json({ error: "Autenticação necessária para usar saldo da conta" });
      }

      // Compute live reaction time: seconds since markets were last unlocked (per fixture)
      const hasLiveSels = validatedData.selections.some((s: any) => s.marketKey?.startsWith("live_m"));
      let liveReactionSecs: number | null = null;
      if (hasLiveSels) {
        for (const sel of validatedData.selections) {
          if (!sel.marketKey?.startsWith("live_")) continue;
          const fidStr = (sel.gameId ?? "").replace("api-football-", "");
          const fid = fidStr ? Number(fidStr) : null;
          const unlockMs = fid ? (lastLiveUnlockMap.get(fid) ?? 0) : 0;
          if (unlockMs > 0) { liveReactionSecs = Math.round((Date.now() - unlockMs) / 1000); break; }
        }
      }

      let betSlip;
      try {
        const _bonusUsed = (validatedData as any)._usedBonusAmt ?? 0;
        betSlip = await storage.createBetSlip({ ...validatedData, verified: true, _totalOdds: totalOdds, _potentialWin: potentialWin, _bonusUsed, liveReactionSecs, _caixaSnapshot: caixaAtual } as any);
      } catch (createErr) {
        // Rollback: reembolsar saldo caso a criação do bilhete falhe
        if (sessionUserId) {
          const currentUser = await storage.getUserByCpf(sessionUserId);
          if (currentUser) {
            if ((validatedData as any)._usedBonus) {
              const bonusAmt = (validatedData as any)._usedBonusAmt ?? validatedData.stake;
              const mainAmt = (validatedData as any)._usedMainAmt ?? 0;
              if (bonusAmt > 0) {
                const refundedBonus = Math.round((currentUser.bonusBalance + bonusAmt) * 100) / 100;
                await storage.updateUserBonusBalance(sessionUserId, refundedBonus);
              }
              if (mainAmt > 0) {
                const refundedMain = Math.round((currentUser.balance + mainAmt) * 100) / 100;
                await storage.updateUserBalance(sessionUserId, refundedMain);
              }
            } else {
              const refunded = Math.round((currentUser.balance + validatedData.stake) * 100) / 100;
              await storage.updateUserBalance(sessionUserId, refunded);
            }
          }
        }
        throw createErr;
      }

      if (sessionUserId && (validatedData as any)._newBalanceAfterBet !== undefined) {
        const selCount = validatedData.selections.length;
        const betDesc = selCount === 1
          ? `Aposta simples - ${validatedData.selections[0].homeTeam} x ${validatedData.selections[0].awayTeam}`
          : `Aposta múltipla (${selCount} seleções)`;
        await storage.createTransaction({
          userId: sessionUserId,
          type: "bet",
          amount: -validatedData.stake,
          balanceAfter: (validatedData as any)._newBalanceAfterBet,
          description: betDesc,
          referenceId: betSlip.id,
        });
      }

      const updatedBetSlip = { ...betSlip, potentialWin, totalOdds };
      if (betSlip.potentialWin !== potentialWin || betSlip.totalOdds !== totalOdds) {
        const { eq } = await import("drizzle-orm");
        const { db } = await import("./db");
        const { betSlipsTable } = await import("@shared/schema");
        await db.update(betSlipsTable)
          .set({ potentialWin, totalOdds })
          .where(eq(betSlipsTable.id, betSlip.id));
      }

      const txId = betSlip.id.replace(/-/g, '').substring(0, 25);
      const pixPayload = generatePixPayload(betSlip.stake, txId);
      const qrCodeDataUrl = await QRCode.toDataURL(pixPayload, { 
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      
      // Clube FW: verificar e premiar novos níveis semanais
      let clubFwNewLevels: number[] = [];
      let clubFwTotalBonus = 0;
      if (sessionUserId) {
        try {
          const clubFwResult = await storage.checkAndAwardClubFw(sessionUserId);
          clubFwNewLevels = clubFwResult.newLevels;
          clubFwTotalBonus = clubFwResult.totalBonus;
        } catch (e) {
          console.error("Clube FW check error:", e);
        }
      }

      res.status(201).json({
        ...updatedBetSlip,
        pixCode: pixPayload,
        pixQrCode: qrCodeDataUrl,
        cappedAtMax: betSlip.potentialWin !== potentialWin && potentialWin === MAX_BET_PAYOUT,
        cappedByDaily,
        clubFwNewLevels,
        clubFwTotalBonus,
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

  // Configurações de Cash Out (público)
  app.get("/api/cashout-settings", (_req, res) => {
    res.json({ earlyExitPct, cashOutPct });
  });

  // Cashout / Encerrar Aposta
  app.post("/api/bets/:id/cashout", async (req, res) => {
    try {
      const { id } = req.params;
      const { type } = req.body as { type?: string };
      if (!type || !["ea", "cashout"].includes(type)) {
        return res.status(400).json({ error: "Tipo inválido. Use 'ea' ou 'cashout'." });
      }
      const bet = await storage.getBetSlip(id);
      if (!bet) return res.status(404).json({ error: "Bilhete não encontrado" });
      const sessionUserId = (req.session as any)?.userId;
      if (!sessionUserId) return res.status(401).json({ error: "Não autenticado" });
      if (bet.userId !== sessionUserId) return res.status(403).json({ error: "Não autorizado" });
      if (bet.status !== "pending") return res.status(400).json({ error: "Bilhete não está pendente" });

      const now = new Date();
      const selections = bet.selections;
      const grouped: Record<string, typeof selections> = {};
      for (const sel of selections) {
        if (!grouped[sel.gameId]) grouped[sel.gameId] = [];
        grouped[sel.gameId].push(sel);
      }
      const gameIds = Object.keys(grouped);
      const totalEvents = gameIds.length;

      let cashOutValue: number;

      if (type === "ea") {
        const allNotStarted = selections.every(s => new Date(s.commenceTime) > now);
        if (!allNotStarted) return res.status(400).json({ error: "Encerramento antecipado não disponível: jogos já iniciados" });
        cashOutValue = Math.round(bet.stake * (1 - earlyExitPct / 100) * 100) / 100;
      } else {
        if (totalEvents <= 1) return res.status(400).json({ error: "Cash out indisponível para bilhetes simples" });
        const anyInProgress = gameIds.some(gameId => {
          const sels = grouped[gameId];
          const started = sels.some(s => new Date(s.commenceTime) <= now);
          const allResolved = sels.every(s => s.result !== "pending");
          return started && !allResolved;
        });
        if (anyInProgress) return res.status(400).json({ error: "Cash out indisponível: partida em andamento" });
        const wonEvents = gameIds.filter(gameId =>
          grouped[gameId].every(s => s.result === "won")
        ).length;
        if (wonEvents === 0) return res.status(400).json({ error: "Cash out indisponível: nenhum evento encerrado" });
        if (wonEvents >= totalEvents) return res.status(400).json({ error: "Bilhete já finalizado" });
        const netPotWin = Math.max(0, bet.potentialWin - (bet.bonusUsed ?? 0));
        const rawOffer = computeCashOutOffer(bet.stake, netPotWin, totalEvents, wonEvents, cashOutPct);
        if (rawOffer === null) return res.status(400).json({ error: "Cash out indisponível" });
        // Verificar elegibilidade: se soma das demais odds < maior odd, limitar ao valor apostado
        const selOdds = selections.map((s: any) => s.originalOdds ?? s.odds ?? 1);
        const maxOdd = Math.max(...selOdds);
        const sumOthers = selOdds.reduce((acc: number, o: number) => acc + o, 0) - maxOdd;
        const capAtStake = selections.length > 1 && sumOthers < maxOdd;
        cashOutValue = capAtStake ? Math.min(rawOffer, bet.stake) : rawOffer;
      }

      const user = await storage.getUserByCpf(bet.userId!);
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

      const newBalance = Math.round((user.balance + cashOutValue) * 100) / 100;
      await storage.updateUserBalance(bet.userId!, newBalance);
      await storage.createTransaction({
        userId: bet.userId!,
        type: "cashout",
        amount: cashOutValue,
        balanceAfter: newBalance,
        description: `Cash out bilhete #${bet.id.slice(0, 8).toUpperCase()}`,
        referenceId: bet.id,
      });
      await storage.cashOutBet(bet.id, cashOutValue);

      res.json({ success: true, cashOutValue, newBalance });
    } catch (err) {
      console.error("cashout error:", err);
      res.status(500).json({ error: "Erro ao processar cash out" });
    }
  });

  // Bilhetes recentes para o site principal (últimos 10 minutos)
  app.get("/api/bets", async (req, res) => {
    try {
      const { sessionId, userId } = req.query;
      if (userId && typeof userId === "string") {
        const betSlips = await storage.getBetSlipsByUser(userId);
        return res.json(betSlips);
      }
      if (sessionId && typeof sessionId === "string") {
        const betSlips = await storage.getBetSlipsBySession(sessionId);
        return res.json(betSlips);
      }
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

  // Live market adjustments (per-game odds adjustment) — formerly game-market-overrides
  app.get("/api/live-market-adj", async (_req, res) => {
    try {
      const cached = cache.get<any[]>("game_market_overrides");
      if (cached) return res.json(cached);
      const overrides = await storage.getGameMarketOverrides();
      cache.set("game_market_overrides", overrides, 60 * 1000);
      res.json(overrides);
    } catch (error) {
      console.error("Error fetching game market overrides:", error);
      res.status(500).json({ error: "Failed to fetch game market overrides" });
    }
  });

  app.get("/api/admin/live-market-adj", requireAdmin, async (_req, res) => {
    try {
      const overrides = await storage.getGameMarketOverrides();
      res.json(overrides);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch game market overrides" });
    }
  });

  app.put("/api/admin/live-market-adj", requireAdmin, async (req, res) => {
    try {
      const overrides = req.body;
      if (!Array.isArray(overrides)) return res.status(400).json({ error: "Body must be an array" });
      await storage.upsertGameMarketOverrides(overrides);
      cache.delete("game_market_overrides");
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating game market overrides:", error);
      res.status(500).json({ error: "Failed to update game market overrides" });
    }
  });

  // Combo bonus settings (default percentages as fractions, stored as pct integers in DB)
  const DEFAULT_COMBO_BONUS_PCT: Record<number, number> = {
    2: 5, 3: 10, 4: 15, 5: 20, 6: 27, 7: 34, 8: 41, 9: 49, 10: 58, 11: 65, 12: 72,
  };

  async function loadComboBonusTable(): Promise<Record<number, number>> {
    const raw = await storage.getSetting("combo_bonus");
    if (!raw) return DEFAULT_COMBO_BONUS_PCT;
    try { return JSON.parse(raw); } catch { return DEFAULT_COMBO_BONUS_PCT; }
  }

  function pctTableToFraction(pct: Record<number, number>): Record<number, number> {
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(pct)) out[Number(k)] = v / 100;
    return out;
  }

  app.get("/api/market-settings/combo-bonus", async (_req, res) => {
    try {
      const tbl = await loadComboBonusTable();
      res.json(tbl);
    } catch (err) {
      console.error("Error fetching combo bonus settings:", err);
      res.status(500).json({ error: "Failed to fetch combo bonus settings" });
    }
  });

  app.get("/api/admin/combo-bonus", requireAdmin, async (_req, res) => {
    try {
      const tbl = await loadComboBonusTable();
      res.json(tbl);
    } catch (err) {
      console.error("Error fetching combo bonus settings:", err);
      res.status(500).json({ error: "Failed to fetch combo bonus settings" });
    }
  });

  app.put("/api/admin/combo-bonus", requireAdmin, async (req, res) => {
    try {
      const body = req.body as Record<string, number>;
      if (typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ error: "Body must be an object { 2: pct, 3: pct, ... }" });
      }
      const validated: Record<number, number> = {};
      for (let i = 2; i <= 12; i++) {
        const val = body[i] ?? body[String(i)];
        validated[i] = typeof val === "number" ? val : DEFAULT_COMBO_BONUS_PCT[i];
      }
      await storage.setSetting("combo_bonus", JSON.stringify(validated));
      res.json(validated);
    } catch (err) {
      console.error("Error saving combo bonus settings:", err);
      res.status(500).json({ error: "Failed to save combo bonus settings" });
    }
  });

  // ─── Bolão da Copa ───────────────────────────────────────────────────────
  app.get("/api/bolao/active", async (req, res) => {
    try {
      const bolao = await storage.getActiveBolao();
      if (!bolao) return res.json(null);
      const now = Date.now();
      // Time-window visibility (values stored as Manaus time = UTC-4)
      const parseManausText = (s: string) => {
        const str = s.length === 16 ? s + ":00-04:00" : s.length === 19 ? s + "-04:00" : s;
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
      };
      if ((bolao as any).startsAt) {
        const t = parseManausText((bolao as any).startsAt);
        if (t && now < t.getTime()) return res.json(null);
      }
      if ((bolao as any).endsAt) {
        const t = parseManausText((bolao as any).endsAt);
        if (t && now >= t.getTime()) return res.json(null);
      }
      // Hide 10 minutes before match start
      if (bolao.matchDate) {
        const matchTime = new Date(bolao.matchDate).getTime();
        if (now >= matchTime - 10 * 60 * 1000) return res.json(null);
      }
      const entries = await storage.getBolaoEntries(bolao.id);
      const totalEntries = entries.length;
      const grossPool = Math.round(totalEntries * (bolao.entryFee ?? 10) * 100) / 100;
      const houseCutPct = (bolao as any).houseCut ?? 0;
      const prizePool = Math.round(grossPool * (1 - houseCutPct / 100) * 100) / 100;
      const userId = req.session?.userId;
      const userEntries = userId ? entries.filter(e => e.userId === userId) : [];
      res.json({ bolao, totalEntries, prizePool, userEntries });
    } catch (e) {
      res.status(500).json({ error: "Erro ao buscar bolão" });
    }
  });

  // User's own bolão entries (all bolões, even hidden ones)
  app.get("/api/bolao/my-entries", async (req, res) => {
    try {
      if (!req.session?.userId) return res.json([]);
      const allBoloes = await storage.getBoloes();
      const userEntries = await storage.getBolaoEntriesByUser(req.session.userId);
      const result = userEntries.map(e => {
        const bolao = allBoloes.find(b => b.id === e.bolaoId);
        if (!bolao) return null;
        // Determine entry status
        let status: "pending" | "won" | "lost" = "pending";
        if (bolao.status === "finished" && bolao.actualHomeScore !== null && bolao.actualAwayScore !== null) {
          status = (e.homeScore === bolao.actualHomeScore && e.awayScore === bolao.actualAwayScore) ? "won" : "lost";
        }
        // Use stored prize amount (set at finishBolao time — accurate even after entries are deleted)
        const prizeAmount: number | null = (status === "won" && e.prizeAmount != null) ? e.prizeAmount : null;
        return {
          id: e.id,
          bolaoId: bolao.id,
          homeTeam: bolao.homeTeam,
          awayTeam: bolao.awayTeam,
          matchDate: bolao.matchDate,
          bolaoStatus: bolao.status,
          actualHomeScore: bolao.actualHomeScore,
          actualAwayScore: bolao.actualAwayScore,
          myHomeScore: e.homeScore,
          myAwayScore: e.awayScore,
          prizeAwarded: e.prizeAwarded,
          status,
          entryFee: bolao.entryFee,
          prizeAmount,
          createdAt: e.createdAt,
        };
      }).filter(Boolean);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Erro ao buscar palpites" });
    }
  });

  app.get("/api/duelo/my-entries", async (req, res) => {
    try {
      if (!req.session?.userId) return res.json([]);
      const userId = req.session.userId;
      const rows = await pool.query(`
        SELECT de.id, de.side, de.prize_awarded, de.prize_amount, de.created_at,
               d.id as duelo_id, d.title, d.option_a, d.option_b, d.entry_fee,
               d.status as duelo_status, d.winner_side
        FROM duelo_entries de
        JOIN duelos d ON d.id = de.duelo_id
        WHERE de.user_id = $1
        ORDER BY de.created_at DESC
      `, [userId]);
      const result = rows.rows.map((r: any) => {
        let status: "pending" | "won" | "lost" = "pending";
        if (r.duelo_status === "finished" && r.winner_side) {
          status = r.side === r.winner_side ? "won" : "lost";
        }
        return {
          id: r.id,
          dueloId: r.duelo_id,
          title: r.title,
          optionA: r.option_a,
          optionB: r.option_b,
          mySide: r.side,
          myOption: r.side === "A" ? r.option_a : r.option_b,
          dueloStatus: r.duelo_status,
          winnerSide: r.winner_side,
          winnerOption: r.winner_side ? (r.winner_side === "A" ? r.option_a : r.option_b) : null,
          prizeAwarded: r.prize_awarded,
          prizeAmount: (status === "won" && r.prize_amount != null) ? Number(r.prize_amount) : null,
          entryFee: r.entry_fee,
          status,
          createdAt: r.created_at,
        };
      });
      res.json(result);
    } catch (e: any) {
      console.error("[duelo/my-entries]", e?.message);
      res.status(500).json({ error: "Erro ao buscar duelos" });
    }
  });

  app.delete("/api/bolao/my-entries", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Não autenticado" });
      await storage.deleteAllBolaoEntriesByUser(req.session.userId);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/bolao/:id/enter", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Não autenticado" });
      const bolaoId = parseInt(req.params.id);
      const { homeScore, awayScore } = req.body as { homeScore: number; awayScore: number };
      if (homeScore < 0 || awayScore < 0 || homeScore > 20 || awayScore > 20) return res.status(400).json({ error: "Placar inválido" });

      const bolao = (await storage.getBoloes()).find(b => b.id === bolaoId);
      if (!bolao || bolao.status !== "open" || !bolao.active) return res.status(400).json({ error: "Bolão não disponível" });

      const user = await storage.getUserByCpf(req.session.userId);
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
      const fee = bolao.entryFee ?? 10;
      if (user.balance < fee) return res.status(400).json({ error: "Saldo insuficiente. Você precisa de R$" + fee.toFixed(2) + " para participar." });

      // Deduct entry fee
      const newBalance = Math.round((user.balance - fee) * 100) / 100;
      await storage.updateUserBalance(req.session.userId, newBalance);
      await storage.createTransaction({ userId: req.session.userId, type: "bolao_entry", amount: -fee, balanceAfter: newBalance, description: `Bolão: ${bolao.homeTeam} x ${bolao.awayTeam} — ${homeScore}x${awayScore}` });

      const entry = await storage.createBolaoEntry({ bolaoId, userId: req.session.userId, homeScore, awayScore });
      res.json({ entry, newBalance });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Erro ao participar do bolão" });
    }
  });

  // Admin bolão routes
  app.get("/api/admin/bolao", requireAdmin, async (_req, res) => {
    try {
      const boloes = await storage.getBoloes();
      const result = await Promise.all(boloes.map(async b => {
        const entries = await storage.getBolaoEntries(b.id);
        const entriesWithNames = await Promise.all(entries.map(async e => {
          const user = await storage.getUserByCpf(e.userId);
          return { ...e, userName: user?.name ?? e.userId };
        }));
        const grossPool = Math.round(entries.length * (b.entryFee ?? 10) * 100) / 100;
        const houseCutPct = (b as any).houseCut ?? 0;
        const prizePool = Math.round(grossPool * (1 - houseCutPct / 100) * 100) / 100;
        return { ...b, startsAt: (b as any).startsAt ?? null, endsAt: (b as any).endsAt ?? null, totalEntries: entries.length, grossPool, prizePool, entries: entriesWithNames };
      }));
      res.json(result);
    } catch (e) { res.status(500).json({ error: "Erro" }); }
  });

  app.post("/api/admin/bolao", requireAdmin, async (req, res) => {
    try {
      const body = { ...req.body };
      // Store as plain text (datetime-local string, Manaus time)
      body.startsAt = body.startsAt || null;
      body.endsAt = body.endsAt || null;
      const bolao = await storage.createBolao(body);
      res.json(bolao);
    } catch (e: any) {
      console.error("[bolao create] error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/bolao/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const bolao = await storage.updateBolao(id, req.body);
      if (!bolao) return res.status(404).json({ error: "Não encontrado" });
      res.json(bolao);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/admin/bolao/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteBolao(id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/bolao/:id/finish", requireAdmin, async (req, res) => {
    try {
      const bolaoId = parseInt(req.params.id);
      const { homeScore, awayScore } = req.body as { homeScore: number; awayScore: number };
      const result = await storage.finishBolao(bolaoId, homeScore, awayScore);

      console.log(`[Bolão #${bolaoId}] Finalizado ${homeScore}x${awayScore} | Entradas: ${result.totalEntries} | Prêmio/ganhador: R$${result.prizePerWinner.toFixed(2)} | Lucro casa: R$${result.houseProfit.toFixed(2)}`);

      // Credit prize to each winner's balance
      if (result.prizePerWinner > 0) {
        const entries = await storage.getBolaoEntries(bolaoId);
        const winners = entries.filter(e => e.prizeAwarded && e.homeScore === homeScore && e.awayScore === awayScore);
        console.log(`[Bolão #${bolaoId}] ${winners.length} ganhador(es) encontrado(s)`);
        for (const w of winners) {
          const user = await storage.getUserByCpf(w.userId);
          if (user) {
            const newBal = Math.round((user.balance + result.prizePerWinner) * 100) / 100;
            await storage.updateUserBalance(w.userId, newBal);
            await storage.createTransaction({ userId: w.userId, type: "bolao_win", amount: result.prizePerWinner, balanceAfter: newBal, description: `Prêmio do bolão: ${homeScore}x${awayScore} — R$${result.prizePerWinner.toFixed(2)}` });
            console.log(`[Bolão #${bolaoId}] Prêmio R$${result.prizePerWinner.toFixed(2)} creditado para ${w.userId} → saldo R$${newBal.toFixed(2)}`);
          } else {
            console.warn(`[Bolão #${bolaoId}] Usuário não encontrado: ${w.userId}`);
          }
        }
      } else {
        console.log(`[Bolão #${bolaoId}] Nenhum ganhador — prêmio R$0`);
      }

      // Credit house profit to caixaExtras
      if (result.houseProfit > 0) {
        const prevExtras = caixaExtras;
        caixaExtras = Math.round((caixaExtras + result.houseProfit) * 100) / 100;
        try {
          await storage.setSetting("caixaExtras", String(caixaExtras));
          console.log(`[Bolão #${bolaoId}] caixaExtras: R$${prevExtras.toFixed(2)} + R$${result.houseProfit.toFixed(2)} = R$${caixaExtras.toFixed(2)}`);
        } catch (settingErr: any) {
          console.error(`[Bolão #${bolaoId}] ERRO ao salvar caixaExtras no banco: ${settingErr.message} — valor em memória: R$${caixaExtras.toFixed(2)}`);
        }
      }

      res.json({ ...result, winnerCount: result.winners });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Duelo routes ────────────────────────────────────────────────────────────
  app.get("/api/duelo/active", async (req, res) => {
    try {
      const duelos = await storage.getActiveDuelos();
      const now = Date.now();
      const parseManausText = (s: string) => {
        const str = s.length === 16 ? s + ":00-04:00" : s.length === 19 ? s + "-04:00" : s;
        const d = new Date(str); return isNaN(d.getTime()) ? null : d;
      };
      const visible = duelos.filter(d => {
        if (d.startsAt) { const t = parseManausText(d.startsAt); if (t && now < t.getTime()) return false; }
        if (d.endsAt)   { const t = parseManausText(d.endsAt);   if (t && now >= t.getTime()) return false; }
        return true;
      });
      const userId = req.session?.userId;
      const result = await Promise.all(visible.map(async d => {
        const entries = await storage.getDueloEntries(d.id);
        const totalEntries = entries.length;
        const countA = entries.filter(e => e.side === "A").length;
        const countB = entries.filter(e => e.side === "B").length;
        const pctA = totalEntries > 0 ? Math.round((countA / totalEntries) * 100) : 0;
        const pctB = totalEntries > 0 ? Math.round((countB / totalEntries) * 100) : 0;
        const grossPool = Math.round(totalEntries * (d.entryFee ?? 10) * 100) / 100;
        const prizePool = Math.round(grossPool * (1 - (d.houseCut ?? 0) / 100) * 100) / 100;
        const userEntries = userId ? entries.filter(e => e.userId === userId) : [];
        const userCountA = userEntries.filter(e => e.side === "A").length;
        const userCountB = userEntries.filter(e => e.side === "B").length;
        const { imageData, mimeType, ...dueloWithoutImage } = d;
        return { ...dueloWithoutImage, hasImage: !!imageData, totalEntries, countA, countB, pctA, pctB, prizePool, userCountA, userCountB };
      }));
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/duelo/:id/image", async (req, res) => {
    try {
      const [duelo] = await storage.getDuelos().then(ds => ds.filter(d => d.id === parseInt(req.params.id)));
      if (!duelo?.imageData) return res.status(404).end();
      const buf = Buffer.from(duelo.imageData, "base64");
      res.set("Content-Type", duelo.mimeType || "image/jpeg");
      res.set("Cache-Control", "no-cache, must-revalidate");
      res.send(buf);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Dedicated multipart image upload for duelo (bypasses JSON body limit)
  const dueloImgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
  app.post("/api/admin/duelo/:id/image", requireAdmin, dueloImgUpload.single("image"), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada" });
      const imageData = req.file.buffer.toString("base64");
      const mimeType = req.file.mimetype || "image/jpeg";
      const duelo = await storage.updateDuelo(id, { imageData, mimeType } as any);
      if (!duelo) return res.status(404).json({ error: "Duelo não encontrado" });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/duelo/:id/enter", async (req, res) => {
    try {
      if (!req.session?.userId) return res.status(401).json({ error: "Não autenticado" });
      const dueloId = parseInt(req.params.id);
      const { side } = req.body as { side: string };
      if (side !== "A" && side !== "B") return res.status(400).json({ error: "Lado inválido" });
      const duelos = await storage.getDuelos();
      const duelo = duelos.find(d => d.id === dueloId);
      if (!duelo || duelo.status !== "open" || !duelo.active) return res.status(400).json({ error: "Duelo não disponível" });
      const entries = await storage.getDueloEntries(dueloId);
      const user = await storage.getUserByCpf(req.session.userId);
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
      const fee = duelo.entryFee ?? 10;
      if (user.balance < fee) return res.status(400).json({ error: `Saldo insuficiente. Você precisa de R$${fee.toFixed(2)} para participar.` });
      const newBalance = Math.round((user.balance - fee) * 100) / 100;
      await storage.updateUserBalance(req.session.userId, newBalance);
      await storage.createTransaction({ userId: req.session.userId, type: "duelo_entry", amount: -fee, balanceAfter: newBalance, description: `Duelo: ${duelo.title} — Lado ${side}` });
      const entry = await storage.createDueloEntry({ dueloId, userId: req.session.userId, side });
      res.json({ entry, newBalance });
    } catch (e: any) { res.status(500).json({ error: e.message || "Erro ao participar" }); }
  });

  app.get("/api/admin/duelo", requireAdmin, async (_req, res) => {
    try {
      const duelos = await storage.getDuelos();
      const result = await Promise.all(duelos.map(async d => {
        const entries = await storage.getDueloEntries(d.id);
        const countA = entries.filter(e => e.side === "A").length;
        const countB = entries.filter(e => e.side === "B").length;
        const grossPool = Math.round(entries.length * (d.entryFee ?? 10) * 100) / 100;
        const prizePool = Math.round(grossPool * (1 - (d.houseCut ?? 0) / 100) * 100) / 100;
        const { imageData, mimeType, ...dueloWithoutImage } = d;
        return { ...dueloWithoutImage, hasImage: !!imageData, totalEntries: entries.length, countA, countB, prizePool };
      }));
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/duelo/:id/entries", requireAdmin, async (req, res) => {
    try {
      const dueloId = parseInt(req.params.id);
      const entries = await storage.getDueloEntries(dueloId);
      const entriesWithNames = await Promise.all(entries.map(async e => {
        const user = await storage.getUserByCpf(e.userId);
        return { ...e, userName: user?.name ?? e.userId };
      }));
      res.json(entriesWithNames);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/duelo", requireAdmin, async (req, res) => {
    try {
      const { imageBase64, imageMime, ...rest } = req.body;
      const data: any = { ...rest };
      if (imageBase64) { data.imageData = imageBase64; data.mimeType = imageMime || "image/jpeg"; }
      const duelo = await storage.createDuelo(data);
      res.json(duelo);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/admin/duelo/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { imageBase64, imageMime, ...rest } = req.body;
      const data: any = { ...rest };
      if (imageBase64) { data.imageData = imageBase64; data.mimeType = imageMime || "image/jpeg"; }
      const duelo = await storage.updateDuelo(id, data);
      if (!duelo) return res.status(404).json({ error: "Não encontrado" });
      res.json(duelo);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/admin/duelo/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteDuelo(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/duelo/:id/finish", requireAdmin, async (req, res) => {
    try {
      const dueloId = parseInt(req.params.id);
      const { winnerSide } = req.body as { winnerSide: string };
      if (winnerSide !== "A" && winnerSide !== "B") return res.status(400).json({ error: "Lado inválido" });
      const result = await storage.finishDuelo(dueloId, winnerSide);
      if (result.prizePerWinner > 0) {
        const entries = await storage.getDueloEntries(dueloId);
        for (const w of entries.filter(e => e.prizeAwarded)) {
          const user = await storage.getUserByCpf(w.userId);
          if (user) {
            const newBal = Math.round((user.balance + result.prizePerWinner) * 100) / 100;
            await storage.updateUserBalance(w.userId, newBal);
            const duelos = await storage.getDuelos();
            const duelo = duelos.find(d => d.id === dueloId);
            await storage.createTransaction({ userId: w.userId, type: "duelo_win", amount: result.prizePerWinner, balanceAfter: newBal, description: `Prêmio do duelo: ${duelo?.title ?? dueloId} — R$${result.prizePerWinner.toFixed(2)}` });
          }
        }
      }
      if (result.houseProfit > 0) {
        caixaExtras = Math.round((caixaExtras + result.houseProfit) * 100) / 100;
        await storage.setSetting("caixaExtras", String(caixaExtras));
      }
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Boost card routes
  app.get("/api/boost-cards", async (_req, res) => {
    try {
      const cards = await storage.getActiveBoostCards();
      // mapBoostCard already sets hasImage correctly; just return as-is
      res.json(cards);
    } catch (error) {
      console.error("Error fetching boost cards:", error);
      res.status(500).json({ error: "Failed to fetch boost cards" });
    }
  });

  app.post("/api/admin/boost-cards/:id/image", requireAdmin, boostImgUpload.single("image"), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada" });
      const imageData = req.file.buffer.toString("base64");
      const mimeType = req.file.mimetype || "image/jpeg";
      await storage.updateBoostCard(id, { imageData, mimeType } as any);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/boost-cards/:id/image", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      // Use raw pool query to avoid Drizzle import issues (mapBoostCard strips imageData)
      const result = await pool.query("SELECT image_data, mime_type FROM boost_cards WHERE id = $1", [id]);
      const row = result.rows[0];
      if (!row?.image_data) return res.status(404).end();
      const buf = Buffer.from(row.image_data, "base64");
      res.set("Content-Type", row.mime_type || "image/jpeg");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(buf);
    } catch (e: any) { res.status(500).end(); }
  });

  app.get("/api/admin/boost-cards", async (_req, res) => {
    try {
      const cards = await storage.getBoostCards();
      // mapBoostCard already sets hasImage correctly; just return as-is
      res.json(cards);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch boost cards" });
    }
  });

  app.post("/api/admin/boost-cards", async (req, res) => {
    try {
      const { insertBoostCardSchema } = await import("@shared/schema");
      const data = insertBoostCardSchema.parse(req.body);
      const card = await storage.createBoostCard(data);
      res.json(card);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Invalid data" });
    }
  });

  app.put("/api/admin/boost-cards/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const card = await storage.updateBoostCard(id, req.body);
      if (!card) return res.status(404).json({ error: "Not found" });
      res.json(card);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Invalid data" });
    }
  });

  app.delete("/api/admin/boost-cards/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ok = await storage.deleteBoostCard(id);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  // ─── Copa do Mundo Cards ─────────────────────────────────────────────────────
  app.get("/api/copa-world-cup-cards", async (req, res) => {
    try {
      const { subTab } = req.query;
      const cards = await storage.getCopaCards(subTab as string | undefined);
      res.json(cards.filter(c => c.active));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch copa cards" });
    }
  });

  app.get("/api/admin/copa-world-cup-cards", async (_req, res) => {
    try {
      const cards = await storage.getCopaCards();
      res.json(cards);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch copa cards" });
    }
  });

  app.post("/api/admin/copa-world-cup-cards", async (req, res) => {
    try {
      const { insertCopaWorldCupCardSchema } = await import("@shared/schema");
      const data = insertCopaWorldCupCardSchema.parse(req.body);
      const card = await storage.createCopaCard(data);
      res.json(card);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Invalid data" });
    }
  });

  app.put("/api/admin/copa-world-cup-cards/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const card = await storage.updateCopaCard(id, req.body);
      if (!card) return res.status(404).json({ error: "Not found" });
      res.json(card);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Invalid data" });
    }
  });

  app.delete("/api/admin/copa-world-cup-cards/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ok = await storage.deleteCopaCard(id);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  app.patch("/api/admin/boost-cards/:id/result", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { result, outcomeIdx } = req.body;
      if (!["pending", "won", "lost"].includes(result)) {
        return res.status(400).json({ error: "Resultado inválido. Use: pending, won ou lost" });
      }
      const idx = outcomeIdx !== undefined && outcomeIdx !== null ? Number(outcomeIdx) : undefined;
      const data = await storage.resolveBoostCard(id, result as "pending" | "won" | "lost", idx);

      // Process payouts for any bets that just became "won" as a result of this boost resolution.
      // BUG FIX: resolveBoostCard only updates bet status; the win transaction/balance credit
      // was previously never done for boost-only bets because runCheckResults skips non-pending bets.
      const payoutResults: { betId: string; paid: number }[] = [];
      if (result === "won" && data.affectedBetIds.length > 0) {
        for (const betId of data.affectedBetIds) {
          const bet = await storage.getBetSlip(betId);
          if (!bet || bet.status !== "won") continue;
          const existingWinTx = await storage.getWinTransactionForBet(betId);
          if (existingWinTx) {
            console.log(`[boost-resolve] Bilhete ${betId} já creditado — ignorando`);
            continue;
          }
          const winUser = await storage.getUserByCpf(bet.userId!);
          if (!winUser) continue;
          const bonusUsed = (bet as any).bonusUsed ?? 0;
          const netPayout = Math.max(0, Math.round((bet.potentialWin - bonusUsed) * 100) / 100);
          const credited = Math.round((winUser.balance + netPayout) * 100) / 100;
          await storage.updateUserBalance(bet.userId!, credited);
          await storage.createTransaction({
            userId: bet.userId!,
            type: "win",
            amount: netPayout,
            balanceAfter: credited,
            description: `Aposta ganha${bonusUsed > 0 ? ` (R$${bet.potentialWin.toFixed(2)} − R$${bonusUsed.toFixed(2)} bônus)` : ""}`,
            referenceId: betId,
          });
          payoutResults.push({ betId, paid: netPayout });
          console.log(`[boost-resolve] Bilhete ${betId} creditado: R$${netPayout} → saldo ${credited}`);
        }
      }

      res.json({ card: data.card, affectedBets: data.affectedBets, payouts: payoutResults });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao resolver boost card" });
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

      // Buscar bilhete antes de deletar para poder reembolsar
      const bet = await storage.getBetSlip(id);
      if (!bet) {
        return res.status(404).json({ error: "Bet slip not found" });
      }

      // Reembolsar stake se o bilhete estava pendente e pertence a um usuário
      let refunded = false;
      if (bet.status === "pending" && bet.userId) {
        const betUser = await storage.getUserByCpf(bet.userId);
        if (betUser) {
          const newBalance = Math.round((betUser.balance + bet.stake) * 100) / 100;
          await storage.updateUserBalance(bet.userId, newBalance);
          await storage.createTransaction({
            userId: bet.userId,
            type: "withdrawal_refund",
            amount: bet.stake,
            balanceAfter: newBalance,
            description: `Reembolso - bilhete #${id.replace(/-/g, "").substring(0, 8).toUpperCase()} cancelado pelo admin`,
            referenceId: id,
          });
          refunded = true;
        }
      }

      await storage.deleteBetSlip(id);
      res.json({ success: true, refunded });
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

      if (status === "won" || status === "lost") {
        return res.status(403).json({ error: "Apenas administradores podem marcar bilhetes como ganhos ou perdidos" });
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
            const result = { ...buildMarketsFromBookmaker(allBookmakers, String(homeTeam), String(awayTeam)), fixtureId: Number(directFixtureId) };
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
      
      const from = new Date(fromDate.getTime()).toISOString().split('T')[0];
      const to = new Date(toDate.getTime()).toISOString().split('T')[0];
      
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

  // Same Game Parlay: calcular odd correlacionada via distribuição de Placar Exato
  app.get("/api/football/sgp-odds", async (req, res) => {
    try {
      if (!API_FOOTBALL_KEY) return res.status(500).json({ odd: null, error: "API não configurada" });
      const { gameId, homeTeam = '', awayTeam = '', selections: selJson } = req.query;
      if (!gameId || !selJson) return res.status(400).json({ odd: null, error: "Parâmetros insuficientes" });
      const sels: Array<{ marketKey: string; outcome: string; odds?: number; originalOdds?: number }> = JSON.parse(String(selJson));
      if (!Array.isArray(sels) || sels.length < 2) return res.status(400).json({ odd: null, error: "Mínimo 2 seleções" });

      // Resolver fixtureId: direto do gameId se tiver prefixo, ou buscar por times
      let fixtureId = String(gameId).replace('api-football-', '');
      if (!/^\d+$/.test(fixtureId)) {
        // gameId não é api-football — tentar achar via cache de extra-markets ou busca por times
        const ht = String(homeTeam);
        const at = String(awayTeam);
        let resolved: string | null = null;
        const extraCached = cache.get<any>(`extra_markets_${ht}_${at}_`);
        if (extraCached?.fixtureId) {
          resolved = String(extraCached.fixtureId);
        }
        if (!resolved && ht && at) {
          const normalizeTeam = (name: string) => name.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(' ')
            .filter((w: string) => w.length > 2 && !['fc', 'sc', 'cf', 'ac', 'cd', 'rc'].includes(w));
          const homeWords = normalizeTeam(ht);
          const searchTerm = homeWords[0] || ht.split(' ')[0];
          const today = new Date();
          const from = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const to = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          try {
            const searchResp = await fetch(
              `${API_FOOTBALL_BASE}/fixtures?search=${encodeURIComponent(searchTerm)}&from=${from}&to=${to}`,
              { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
            );
            if (searchResp.ok) {
              const searchData = await searchResp.json();
              const fixtures = searchData.response || [];
              const awayNorm = normalizeTeam(at);
              const match = fixtures.find((f: any) => {
                const fhNorm = normalizeTeam(f.teams.home.name);
                const faNorm = normalizeTeam(f.teams.away.name);
                return homeWords.some((w: string) => fhNorm.includes(w)) &&
                       awayNorm.some((w: string) => faNorm.includes(w));
              });
              if (match) resolved = String(match.fixture.id);
            }
          } catch {}
        }
        // Se não resolveu o fixtureId mas temos odds individuais, ainda podemos usar o fallback de correlação
        fixtureId = resolved ?? fixtureId; // mantem gameId original (não numérico) → fetchScoreDist falha → fallback corre
      }

      const cacheKey = `sgp_odds_${fixtureId}_${JSON.stringify(sels.map(s => `${s.marketKey}:${s.outcome}`).sort())}`;
      const cached = cache.get<any>(cacheKey);
      if (cached) return res.json(cached);
      const sgpOdd = await computeSGPOddForGame(fixtureId, String(homeTeam), String(awayTeam), sels);
      const result = sgpOdd !== null ? { odd: sgpOdd } : { odd: null, error: "Dados insuficientes para calcular SGP" };
      if (sgpOdd !== null) cache.set(cacheKey, result, CACHE_TTL_FOOTBALL);
      return res.json(result);
    } catch (e) {
      return res.json({ odd: null, error: "Erro ao calcular SGP" });
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

  // Helper: deactivate a single live game by fixtureId
  const deactivateLiveGame = (fixtureId: number) => {
    cache.delete(`live_test_${fixtureId}`);
    cache.delete(`live_map_${fixtureId}`);
    activeLiveGames.delete(fixtureId);
    lockedFixtures.delete(fixtureId);
    lastLiveUnlockMap.delete(fixtureId);
    broadcastLiveState();
  };

  // Background watcher: auto-deactivate when any active fixture finishes
  const AUTO_CHECK_INTERVAL = 60 * 1000; // 60 s
  setInterval(async () => {
    if (activeLiveGames.size === 0 || !API_FOOTBALL_KEY) return;
    const ids = Array.from(activeLiveGames.keys());
    for (const fid of ids) {
      try {
        const r = await fetch(`${API_FOOTBALL_BASE}/fixtures?id=${fid}`, {
          headers: { "x-apisports-key": API_FOOTBALL_KEY },
        });
        const data = await r.json();
        const fixture = data?.response?.[0];
        if (!fixture) continue;
        const statusShort: string = fixture.fixture?.status?.short ?? "";
        if (FINISHED_STATUSES.has(statusShort)) {
          console.log(`[live-game] Auto-deactivated fixture ${fid} — status: ${statusShort}`);
          deactivateLiveGame(fid);
        }
      } catch (err) {
        console.error(`[live-game] Auto-check error for ${fid}:`, err);
      }
    }
  }, AUTO_CHECK_INTERVAL);

  // Public: frontend reads this to know which live games are active
  app.get("/api/football/live-status", (_req, res) => {
    res.json(buildLiveStatePayload());
  });

  // Cache for admin live-games fixture data (45s TTL to avoid rate-limit on 20 parallel calls)
  type AdminFixtureCache = { fixtures: any[]; liveOddsCoveredIds: number[]; liveOddsTrusted: boolean; fetchedAt: number };
  let adminFixtureCache: AdminFixtureCache | null = null;
  const ADMIN_FIXTURE_CACHE_TTL = 45_000; // 45 seconds

  async function fetchAdminFixtures(API_FOOTBALL_KEY: string, API_FOOTBALL_BASE: string): Promise<AdminFixtureCache> {
    const now = new Date();
    const brazilOffset = -3 * 60;
    const toBrazilDate = (d: Date) => {
      const ms = d.getTime() + (brazilOffset - d.getTimezoneOffset()) * 60000;
      return new Date(ms).toISOString().slice(0, 10);
    };
    const cutoffMs = now.getTime() + 48 * 60 * 60 * 1000;
    const todayDate = toBrazilDate(now);
    const tomorrowDate = toBrazilDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));

    const hdr = { "x-apisports-key": API_FOOTBALL_KEY };
    const [
      liveRes, liveOddsRes,
      serieA_todayRes, serieA_upRes,
      serieB_todayRes, serieB_upRes,
      serieC_todayRes, serieC_upRes,
      liberta_todayRes, liberta_upRes,
      sudamer_todayRes, sudamer_upRes,
      copaBr_todayRes, copaBr_upRes,
      wc_upRes, friendly_upRes,
      ucl_upRes, uel_upRes, pl_upRes, laliga_upRes,
    ] = await Promise.all([
      fetch(`${API_FOOTBALL_BASE}/fixtures?live=all`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/odds/live`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=71&season=2026&date=${todayDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=71&season=2026&date=${tomorrowDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=72&season=2026&date=${todayDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=72&season=2026&date=${tomorrowDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=75&season=2026&date=${todayDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=75&season=2026&date=${tomorrowDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=13&season=2026&date=${todayDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=13&season=2026&date=${tomorrowDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=11&season=2026&date=${todayDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=11&season=2026&date=${tomorrowDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=73&season=2026&date=${todayDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=73&season=2026&date=${tomorrowDate}`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=1&season=2026&next=10`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=10&next=10`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=2&next=8`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=3&next=8`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=39&next=8`, { headers: hdr }),
      fetch(`${API_FOOTBALL_BASE}/fixtures?league=140&next=8`, { headers: hdr }),
    ]);
    const [
      liveData, liveOddsData,
      serieA_todayData, serieA_upData,
      serieB_todayData, serieB_upData,
      serieC_todayData, serieC_upData,
      liberta_todayData, liberta_upData,
      sudamer_todayData, sudamer_upData,
      copaBr_todayData, copaBr_upData,
      wc_upData, friendly_upData,
      ucl_upData, uel_upData, pl_upData, laliga_upData,
    ] = await Promise.all([
      liveRes.json(), liveOddsRes.json(),
      serieA_todayRes.json(), serieA_upRes.json(),
      serieB_todayRes.json(), serieB_upRes.json(),
      serieC_todayRes.json(), serieC_upRes.json(),
      liberta_todayRes.json(), liberta_upRes.json(),
      sudamer_todayRes.json(), sudamer_upRes.json(),
      copaBr_todayRes.json(), copaBr_upRes.json(),
      wc_upRes.json(), friendly_upRes.json(),
      ucl_upRes.json(), uel_upRes.json(), pl_upRes.json(), laliga_upRes.json(),
    ]);

    const liveOddsItems: any[] = liveOddsData.response ?? [];
    const liveOddsTrusted = liveOddsItems.length > 0;
    const liveOddsCoveredIds: number[] = liveOddsItems.map((r: any) => r.fixture?.id).filter(Boolean);

    console.log(`[admin/live-games] todayDate=${todayDate} tomorrowDate=${tomorrowDate}`);
    console.log(`[admin/live-games] SerieA today=${serieA_todayData.response?.length ?? 0} (errors=${JSON.stringify(serieA_todayData.errors)})`);
    console.log(`[admin/live-games] SerieB today=${serieB_todayData.response?.length ?? 0} | Live fixtures=${liveData.response?.length ?? 0} | Live odds coverage=${liveOddsCoveredIds.length}`);

    const liveFixtures = liveData.response ?? [];
    const upcomingAll = [
      ...(serieA_todayData.response ?? []),
      ...(serieA_upData.response ?? []),
      ...(serieB_todayData.response ?? []),
      ...(serieB_upData.response ?? []),
      ...(serieC_todayData.response ?? []),
      ...(serieC_upData.response ?? []),
      ...(liberta_todayData.response ?? []),
      ...(liberta_upData.response ?? []),
      ...(sudamer_todayData.response ?? []),
      ...(sudamer_upData.response ?? []),
      ...(copaBr_todayData.response ?? []),
      ...(copaBr_upData.response ?? []),
      ...(wc_upData.response ?? []),
      ...(friendly_upData.response ?? []),
      ...(ucl_upData.response ?? []),
      ...(uel_upData.response ?? []),
      ...(pl_upData.response ?? []),
      ...(laliga_upData.response ?? []),
    ].filter((f: any) => new Date(f.fixture.date).getTime() <= cutoffMs);

    const allFixtures = [...liveFixtures, ...upcomingAll];
    return { fixtures: allFixtures, liveOddsCoveredIds, liveOddsTrusted, fetchedAt: Date.now() };
  }

  // Admin: list today's games + currently live games from API-Football
  app.get("/api/admin/live-games", requireAdmin, async (_req, res) => {
    try {
      if (!API_FOOTBALL_KEY) return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      const now = new Date();

      // Use cached fixture data if fresh enough (45s), otherwise re-fetch
      const cacheAge = adminFixtureCache ? Date.now() - adminFixtureCache.fetchedAt : Infinity;
      if (cacheAge > ADMIN_FIXTURE_CACHE_TTL || !adminFixtureCache) {
        console.log(`[admin/live-games] Cache miss (age=${Math.round(cacheAge/1000)}s) — fetching fixtures`);
        adminFixtureCache = await fetchAdminFixtures(API_FOOTBALL_KEY, API_FOOTBALL_BASE);
      } else {
        console.log(`[admin/live-games] Cache hit (age=${Math.round(cacheAge/1000)}s)`);
      }

      const { fixtures: allFixtures, liveOddsCoveredIds, liveOddsTrusted } = adminFixtureCache;
      const liveOddsCoveredSet = new Set<number>(liveOddsCoveredIds);
      const cutoffMs = now.getTime() + 48 * 60 * 60 * 1000;

      // Brazil date helpers (UTC-3)
      const brazilOffset = -3 * 60;
      const toBrazilDate = (d: Date) => {
        const ms = d.getTime() + (brazilOffset - d.getTimezoneOffset()) * 60000;
        return new Date(ms).toISOString().slice(0, 10);
      };
      const todayDate = toBrazilDate(now);

      const seen = new Set<number>();

      // Allowed senior national-team league IDs (API-Football)
      const SELECOES_LEAGUE_IDS = new Set([
        1,   // FIFA World Cup
        4,   // UEFA Euro Championship
        5,   // UEFA Nations League A/B/C/D
        6,   // Africa Cup of Nations
        7,   // Asian Cup
        8,   // CONCACAF Gold Cup
        9,   // Copa América
        10,  // Friendlies (international, senior national teams)
        29,  // WC Qualifiers - South America
        30,  // WC Qualifiers - Asia
        31,  // WC Qualifiers - Africa
        32,  // WC Qualifiers - CONCACAF
        33,  // WC Qualifiers - Europe
        34,  // WC Qualifiers - Europe (play-offs)
        35,  // WC Qualifiers - Oceania
        175, // Nations League - CONMEBOL
        732, // Copa América Qualifiers (when applicable)
      ]);

      // Top club competitions allowed
      const TOP_CLUB_LEAGUE_IDS = new Set([
        11,  // Copa Sudamericana
        13,  // Copa Libertadores
        73,  // Copa do Brasil (also in isBrazilClub, kept here for live-fixtures path)
        2,   // UEFA Champions League
        3,   // UEFA Europa League
        39,  // Premier League
        140, // La Liga
      ]);

      // Filter: Brazil club leagues, top international clubs, approved senior national-team competitions
      // Exclude youth fixtures (U17 / U19 / U20 / U21 / U23 in team names)
      const YOUTH_RE = /\bU\d{2}\b/i;
      const isYouth = (f: any) =>
        YOUTH_RE.test(f.teams?.home?.name ?? "") || YOUTH_RE.test(f.teams?.away?.name ?? "");
      const isBrazilClub = (f: any) => f.league?.id === 71 || f.league?.id === 72 || f.league?.id === 73 || f.league?.id === 75;
      const isTopClub = (f: any) => TOP_CLUB_LEAGUE_IDS.has(f.league?.id) && !isYouth(f);
      const isSelecoes = (f: any) => SELECOES_LEAGUE_IDS.has(f.league?.id) && !isYouth(f);

      const fixtures = allFixtures.filter(f => {
        if (seen.has(f.fixture.id)) return false;
        seen.add(f.fixture.id);
        return isBrazilClub(f) || isTopClub(f) || isSelecoes(f);
      });

      const LIVE_STATUSES = ["1H","HT","2H","ET","BT","P","INT"];
      const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

      const getDateLabel = (isoDate: string) => {
        const gameDate = toBrazilDate(new Date(isoDate));
        if (gameDate === todayDate) return "Hoje";
        const tomorrow = toBrazilDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
        if (gameDate === tomorrow) return "Amanhã";
        const d = new Date(isoDate);
        const dayName = WEEKDAYS[d.getUTCDay()];
        const dd = String(d.getUTCDate()).padStart(2, "0");
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        return `${dayName} ${dd}/${mm}`;
      };

      const games = fixtures.map(f => {
        const isLive = LIVE_STATUSES.includes(f.fixture.status.short);
        return {
          id: f.fixture.id,
          date: f.fixture.date,
          dateLabel: getDateLabel(f.fixture.date),
          status: f.fixture.status.short as string,
          statusLong: f.fixture.status.long as string,
          elapsed: f.fixture.status.elapsed as number | null,
          home: f.teams.home.name as string,
          homeLogo: f.teams.home.logo as string,
          away: f.teams.away.name as string,
          awayLogo: f.teams.away.logo as string,
          league: f.league.id === 71 ? "Campeonato Brasileiro Série A"
                 : f.league.id === 72 ? "Campeonato Brasileiro Série B"
                 : f.league.id === 73 ? "Copa do Brasil"
                 : f.league.id === 75 ? "Campeonato Brasileiro Série C"
                 : f.league.name as string,
          leagueLogo: f.league.logo as string,
          goalsHome: f.goals.home as number | null,
          goalsAway: f.goals.away as number | null,
          isLive,
          // Only meaningful for live games when the /odds/live call returned data (trusted).
          // null = unknown (API returned 0 results — could be timing issue, not absence of coverage)
          // true = confirmed coverage | false = confirmed no coverage
          hasLiveCoverage: isLive && liveOddsTrusted ? liveOddsCoveredSet.has(f.fixture.id) : null,
        };
      });
      // Auto-deactivate any active fixture that appears finished in this response
      for (const [fid] of activeLiveGames) {
        const activeInList = games.find(g => g.id === fid);
        if (activeInList && FINISHED_STATUSES.has(activeInList.status)) {
          console.log(`[live-game] Auto-deactivated fixture ${fid} on list refresh — status: ${activeInList.status}`);
          deactivateLiveGame(fid);
        }
      }

      const activeFixtureIds = Array.from(activeLiveGames.keys());

      // Remove finished/cancelled games from the list (keep only live or upcoming, plus all active)
      const visibleGames = games.filter(g =>
        g.isLive || g.status === "NS" || g.status === "TBD" || activeLiveGames.has(g.id)
      );

      // Always include active games even if the API didn't return them in this call
      // (API-Football fixture responses can be inconsistent between calls due to caching)
      for (const [fid, info] of activeLiveGames) {
        if (!visibleGames.some(g => g.id === fid)) {
          visibleGames.push({
            id: fid,
            date: new Date().toISOString(),
            dateLabel: "Hoje",
            status: "1H",
            statusLong: "Ao Vivo",
            elapsed: null,
            home: info.home,
            homeLogo: info.homeLogo ?? "",
            away: info.away,
            awayLogo: info.awayLogo ?? "",
            league: info.league,
            leagueLogo: "",
            goalsHome: null,
            goalsAway: null,
            isLive: true,
            hasLiveCoverage: null,
          });
        }
      }

      visibleGames.sort((a, b) => {
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
      return res.json({ games: visibleGames, activeFixtureIds, activeFixtureId: activeFixtureIds[0] ?? null, isLocked: lockedFixtures.size > 0, activeGameInfo: activeFixtureIds[0] ? activeLiveGames.get(activeFixtureIds[0]) ?? null : null });
    } catch (err) {
      console.error("[admin/live-games]", err);
      return res.status(500).json({ error: "Erro ao buscar jogos" });
    }
  });

  // Admin: activate a live game
  app.post("/api/admin/live-game/activate", requireAdmin, async (req: any, res: any) => {
    const { fixtureId, home, away, league, homeLogo, awayLogo } = req.body as any;
    if (!fixtureId) return res.status(400).json({ error: "fixtureId required" });
    const fid = Number(fixtureId);
    // Clear stale cache for this fixture (fresh activation)
    cache.delete(`live_test_${fid}`);
    cache.delete(`live_map_${fid}`);
    activeLiveGames.set(fid, { home, away, league, homeLogo, awayLogo });
    // Don't lock on activation — start fresh/unlocked
    lockedFixtures.delete(fid);
    lastLiveUnlockMap.set(fid, Date.now());
    broadcastLiveState();
    console.log(`[live-game] Activated fixture ${fid}: ${home} vs ${away} (total active: ${activeLiveGames.size})`);
    return res.json({ ok: true, fixtureId: fid, isLocked: false });
  });

  // Admin: deactivate a specific live game (or all if no fixtureId given)
  app.post("/api/admin/live-game/deactivate", requireAdmin, (req, res) => {
    const { fixtureId } = req.body as any;
    if (fixtureId) {
      deactivateLiveGame(Number(fixtureId));
      console.log(`[live-game] Deactivated fixture ${fixtureId} manually`);
    } else {
      const ids = Array.from(activeLiveGames.keys());
      for (const id of ids) deactivateLiveGame(id);
      console.log("[live-game] Deactivated all live games manually");
    }
    return res.json({ ok: true });
  });

  // Admin: toggle market lock for a specific fixture
  app.post("/api/admin/live-game/toggle-lock", requireAdmin, (req, res) => {
    const { fixtureId } = req.body as any;
    const fid = fixtureId ? Number(fixtureId) : null;
    if (!fid || !activeLiveGames.has(fid)) {
      return res.status(404).json({ error: "No active live game for that fixtureId" });
    }
    const wasLocked = lockedFixtures.has(fid);
    if (wasLocked) {
      lockedFixtures.delete(fid);
      lastLiveUnlockMap.set(fid, Date.now());
    } else {
      lockedFixtures.add(fid);
    }
    cache.delete(`live_test_${fid}`);
    cache.delete(`live_map_${fid}`);
    broadcastLiveState();
    const nowLocked = !wasLocked;
    console.log(`[live-game] Fixture ${fid} markets ${nowLocked ? "LOCKED" : "UNLOCKED"}`);
    return res.json({ ok: true, isLocked: nowLocked, fixtureId: fid });
  });

  // Admin: lightweight lock status — per-game, no external API calls
  app.get("/api/admin/live-game/lock-status", requireAdmin, (_req, res) => {
    const games = Array.from(activeLiveGames.entries()).map(([fid, info]) => ({
      fixtureId: fid,
      isLocked: lockedFixtures.has(fid),
      home: info.home,
      away: info.away,
    }));
    const activeFixtureIds = Array.from(activeLiveGames.keys());
    return res.json({ games, activeFixtureIds, activeFixtureId: activeFixtureIds[0] ?? null, isLocked: lockedFixtures.size > 0 });
  });

  // ── Live Correlation Matrix ──────────────────────────────────────────────
  const LIVE_CORR_DEFAULTS: Record<string, number> = {
    "1_5": 0.90, "1_6": 0.90, "1_8": 0.85, "1_12": 0.92,
    "5_6": 0.75, "5_8": 0.80, "5_12": 0.90,
    "6_8": 0.82, "6_12": 0.88, "8_12": 0.88,
  };

  app.get("/api/live-correlation", async (_req, res) => {
    const raw = await storage.getSetting("live_correlation_matrix");
    const saved = raw ? JSON.parse(raw) as Record<string, number> : {};
    const matrix = { ...LIVE_CORR_DEFAULTS, ...saved };
    return res.json(matrix);
  });

  app.post("/api/admin/live-correlation", requireAdmin, async (req, res) => {
    const body = req.body as Record<string, number>;
    if (typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "invalid" });
    }
    await storage.setSetting("live_correlation_matrix", JSON.stringify(body));
    return res.json({ ok: true });
  });

  // Admin: generate a mobile control token (24h)
  app.post("/api/admin/live-control/generate-token", requireAdmin, async (_req, res) => {
    const token = randomBytes(20).toString("hex");
    const expiry = Date.now() + 24 * 60 * 60 * 1000;
    await storage.setSetting("mobile_control_token", token);
    await storage.setSetting("mobile_control_expiry", String(expiry));
    console.log(`[live-control] Mobile token generated (DB), expires in 24h`);
    return res.json({ token });
  });

  // Helper: validate mobile token (reads from DB — survives restarts/deploys)
  const validateMobileToken = async (token: string | undefined): Promise<boolean> => {
    if (!token) return false;
    const stored = await storage.getSetting("mobile_control_token");
    if (!stored || token !== stored) return false;
    const expiry = Number(await storage.getSetting("mobile_control_expiry") ?? "0");
    if (Date.now() > expiry) return false;
    return true;
  };

  // Mobile: get live game status (token-protected, no session required)
  app.get("/api/live-control/status", async (req, res) => {
    const token = req.query.t as string;
    if (!(await validateMobileToken(token))) return res.status(401).json({ error: "Invalid or expired token" });
    if (activeLiveGames.size === 0) {
      return res.json({ active: false, games: [] });
    }
    const games = Array.from(activeLiveGames.entries()).map(([fid, info]) => ({
      fixtureId: fid,
      gameInfo: info,
      isLocked: lockedFixtures.has(fid),
    }));
    return res.json({ active: true, games, fixtureId: games[0].fixtureId, gameInfo: games[0].gameInfo, isLocked: games[0].isLocked });
  });

  // Mobile: toggle lock (token-protected) — toggles the first active game or fixtureId in body
  app.post("/api/live-control/toggle-lock", async (req, res) => {
    const token = req.query.t as string;
    if (!(await validateMobileToken(token))) return res.status(401).json({ error: "Invalid or expired token" });
    if (activeLiveGames.size === 0) return res.status(404).json({ error: "No active live game" });
    const fixtureId = (req.body as any)?.fixtureId;
    const fid = fixtureId ? Number(fixtureId) : Array.from(activeLiveGames.keys())[0];
    if (!activeLiveGames.has(fid)) return res.status(404).json({ error: "No active live game" });
    const wasLocked = lockedFixtures.has(fid);
    if (wasLocked) { lockedFixtures.delete(fid); lastLiveUnlockMap.set(fid, Date.now()); }
    else { lockedFixtures.add(fid); }
    cache.delete(`live_test_${fid}`);
    cache.delete(`live_map_${fid}`);
    broadcastLiveState();
    console.log(`[live-control/mobile] Fixture ${fid} markets ${!wasLocked ? "LOCKED" : "UNLOCKED"}`);
    return res.json({ ok: true, isLocked: !wasLocked, fixtureId: fid });
  });

  // Live test: per-fixture odds — requires ?fixture=ID query param
  // In-flight dedup: one inflight promise per fixture to avoid double API calls
  const liveTestInflightMap: Map<number, Promise<any>> = new Map();

  app.get("/api/football/live-test", async (req, res) => {
    try {
      if (!API_FOOTBALL_KEY) {
        return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      }
      const FIXTURE_ID = req.query.fixture ? Number(req.query.fixture) : null;
      if (!FIXTURE_ID || !activeLiveGames.has(FIXTURE_ID)) {
        return res.status(404).json({ error: "No active live game" });
      }

      const cacheKey = `live_test_${FIXTURE_ID}`;
      const LIVE_TTL = 5 * 1000;

      const applyLock = (result: any) => {
        if (!lockedFixtures.has(FIXTURE_ID)) return result;
        return {
          ...result,
          isLocked: true,
          markets: (result.markets ?? []).map((m: any) => ({
            ...m,
            values: m.values.map((v: any) => ({ ...v, suspended: true })),
          })),
        };
      };

      const cached = cache.get<any>(cacheKey);
      if (cached) return res.json(applyLock(cached));

      if (!liveTestInflightMap.has(FIXTURE_ID)) {
        liveTestInflightMap.set(FIXTURE_ID, (async () => {
          // Step 1: fetch fixture to know status
          const fixtureResp = await fetch(`${API_FOOTBALL_BASE}/fixtures?id=${FIXTURE_ID}`, {
            headers: { "x-apisports-key": API_FOOTBALL_KEY! },
          });
          if (!fixtureResp.ok) throw new Error("API-Football unavailable");
          const fixtureData = await fixtureResp.json();
          const fixture = fixtureData.response?.[0];
          if (!fixture) throw new Error("Fixture not found");

          const status = fixture.fixture.status.short as string;
          const isLiveStatus = ["1H","HT","2H","ET","BT","P","INT"].includes(status);

          // Auto-deactivate immediately when game ends
          if (FINISHED_STATUSES.has(status)) {
            console.log(`[live-test] Game finished (${status}) — auto-deactivating fixture ${FIXTURE_ID}`);
            deactivateLiveGame(FIXTURE_ID);
            throw new Error("GAME_FINISHED");
          }

          // Step 2: fetch odds — live endpoint when in-play, pre-match otherwise
          const oddsUrl = isLiveStatus
            ? `${API_FOOTBALL_BASE}/odds/live?fixture=${FIXTURE_ID}`
            : `${API_FOOTBALL_BASE}/odds?fixture=${FIXTURE_ID}`;

          const oddsResp = await fetch(oddsUrl, {
            headers: { "x-apisports-key": API_FOOTBALL_KEY! },
          });
          if (!oddsResp.ok) throw new Error("Odds API unavailable");
          const oddsData = await oddsResp.json();

          // Double Chance label normalisation (live API uses "Home or Draw" etc.)
          const DC_LABELS: Record<string, string> = {
            "Home or Draw": "Home/Draw",
            "Away or Draw": "Draw/Away",
            "Home or Away": "Home/Away",
          };

          let markets: any[] = [];

          if (isLiveStatus) {
            // Live odds: response[0].odds is a flat array {id, name, values:[{value,odd,handicap,suspended}]}
            const LIVE_TO_FRONTEND: Record<number, number> = {
              59: 1,  // Fulltime Result (primary live ID)
              1:  1,  // Fulltime Result (fallback — some fixtures use ID 1 live)
              36: 5,  // Over/Under Line
              49: 6,  // Over/Under (1st Half)
              69: 8,  // Both Teams to Score
              72: 12, // Double Chance
              19: 13, // 1x2 (1st Half)
            };
            const liveOdds: any[] = oddsData.response?.[0]?.odds ?? [];
            const addedFrontendIds = new Set<number>();
            for (const [liveId, frontendId] of Object.entries(LIVE_TO_FRONTEND)) {
              if (addedFrontendIds.has(frontendId)) continue; // skip if already added via another live ID
              const market = liveOdds.find((o: any) => o.id === Number(liveId));
              if (!market) continue;
              const isHandicap = frontendId === 5 || frontendId === 6;
              let values: any[] = [];
              if (isHandicap) {
                const byHc: Record<string, any[]> = {};
                for (const v of (market.values ?? [])) {
                  if (!byHc[v.handicap]) byHc[v.handicap] = [];
                  byHc[v.handicap].push(v);
                }
                if (frontendId === 6) {
                  // 1st half goals — show all available lines sorted ascending
                  const sortedHcs = Object.keys(byHc).sort((a, b) => parseFloat(a) - parseFloat(b));
                  for (const hc of sortedHcs) {
                    for (const v of byHc[hc]) {
                      values.push({ value: `${v.value} ${hc}`, odd: parseFloat(v.odd), suspended: !!v.suspended });
                    }
                  }
                } else {
                  // Full-match O/U from LIVE_TO_FRONTEND — keep 2.5 line only (ID 25 already shows all)
                  const target = "2.5";
                  const hcKey = byHc[target] ? target : Object.keys(byHc)[0];
                  if (hcKey) {
                    values = (byHc[hcKey] ?? []).map((v: any) => ({
                      value: `${v.value} ${hcKey}`, odd: parseFloat(v.odd), suspended: !!v.suspended,
                    }));
                  }
                }
              } else {
                values = (market.values ?? []).map((v: any) => ({
                  value: DC_LABELS[v.value] ?? v.value, odd: parseFloat(v.odd), suspended: !!v.suspended,
                }));
              }
              if (values.length > 0) { markets.push({ id: frontendId, name: market.name, values }); addedFrontendIds.add(frontendId); }
            }

            // --- Always show Resultado Final (1) and Dupla Chance (12) as suspended if API didn't return them ---
            if (!addedFrontendIds.has(1)) {
              markets.unshift({ id: 1, name: "Fulltime Result", values: [
                { value: "Home", odd: 0, suspended: true },
                { value: "Draw", odd: 0, suspended: true },
                { value: "Away", odd: 0, suspended: true },
              ]});
            }
            if (!addedFrontendIds.has(12)) {
              const after1 = markets.findIndex(m => m.id === 1);
              markets.splice(after1 + 1, 0, { id: 12, name: "Double Chance", values: [
                { value: "Home/Draw", odd: 0, suspended: true },
                { value: "Home/Away", odd: 0, suspended: true },
                { value: "Draw/Away", odd: 0, suspended: true },
              ]});
            }

            // --- ID 20: Match Corners (Over/Under, prefer .5 lines) ---
            const cornersM = liveOdds.find((o: any) => o.id === 20);
            if (cornersM) {
              const byHc: Record<string, { over?: any; exactly?: any; under?: any }> = {};
              for (const v of (cornersM.values ?? [])) {
                if (!byHc[v.handicap]) byHc[v.handicap] = {};
                if (v.value === "Over") byHc[v.handicap].over = v;
                if (v.value === "Exactly") byHc[v.handicap].exactly = v;
                if (v.value === "Under") byHc[v.handicap].under = v;
              }
              // Pick most balanced line (Over & Under odds closest to each other)
              const pickBestLine = (hcs: string[]) => hcs
                .filter(h => byHc[h]?.over && byHc[h]?.under)
                .sort((a, b) => {
                  const diffA = Math.abs(parseFloat(byHc[a].over.odd) - parseFloat(byHc[a].under.odd));
                  const diffB = Math.abs(parseFloat(byHc[b].over.odd) - parseFloat(byHc[b].under.odd));
                  return diffA - diffB;
                })[0];
              const halfLines = Object.keys(byHc).filter(h => parseFloat(h) % 1 === 0.5);
              const wholeLines = Object.keys(byHc).filter(h => parseFloat(h) % 1 === 0);
              const hcKey = pickBestLine(halfLines) ?? pickBestLine(wholeLines);
              if (hcKey && byHc[hcKey]) {
                const vals: any[] = [];
                if (byHc[hcKey].over) vals.push({ value: `Over ${hcKey}`, odd: parseFloat(byHc[hcKey].over.odd), suspended: !!byHc[hcKey].over.suspended });
                if (byHc[hcKey].exactly) vals.push({ value: `Exactly ${hcKey}`, odd: parseFloat(byHc[hcKey].exactly.odd), suspended: !!byHc[hcKey].exactly.suspended });
                if (byHc[hcKey].under) vals.push({ value: `Under ${hcKey}`, odd: parseFloat(byHc[hcKey].under.odd), suspended: !!byHc[hcKey].under.suspended });
                if (vals.length > 0) markets.push({ id: 20, name: "Escanteios Over/Under", values: vals });
              }
            }

            // --- ID 119: Total Cards (prefer .5 lines) ---
            const cardsM = liveOdds.find((o: any) => o.id === 119);
            if (cardsM) {
              // Group by handicap, prefer .5 lines
              const byHc: Record<string, { over?: any; under?: any }> = {};
              for (const v of (cardsM.values ?? [])) {
                if (!byHc[v.handicap]) byHc[v.handicap] = {};
                if (v.value === "Over") byHc[v.handicap].over = v;
                if (v.value === "Under") byHc[v.handicap].under = v;
              }
              const halfLines = Object.keys(byHc).filter(h => parseFloat(h) % 1 === 0.5).sort((a,b) => parseFloat(a)-parseFloat(b));
              const wholeLines = Object.keys(byHc).filter(h => parseFloat(h) % 1 === 0).sort((a,b) => parseFloat(a)-parseFloat(b));
              const lines = halfLines.length > 0 ? halfLines : wholeLines;
              const vals: any[] = [];
              for (const hc of lines) {
                if (byHc[hc].over) vals.push({ value: `Over ${hc}`, odd: parseFloat(byHc[hc].over.odd), suspended: !!byHc[hc].over.suspended });
                if (byHc[hc].under) vals.push({ value: `Under ${hc}`, odd: parseFloat(byHc[hc].under.odd), suspended: !!byHc[hc].under.suspended });
              }
              if (vals.length > 0) markets.push({ id: 119, name: "Total Cartões", values: vals });
            }

            // --- ID 25: Match Goals (all lines, sorted) ---
            const goalsM = liveOdds.find((o: any) => o.id === 25);
            if (goalsM) {
              const byHc: Record<string, any[]> = {};
              for (const v of (goalsM.values ?? [])) {
                if (!byHc[v.handicap]) byHc[v.handicap] = [];
                byHc[v.handicap].push(v);
              }
              const sortedHcs = Object.keys(byHc).sort((a, b) => parseFloat(a) - parseFloat(b));
              const vals: any[] = [];
              for (const hc of sortedHcs) {
                for (const v of byHc[hc]) {
                  vals.push({ value: `${v.value} ${hc}`, odd: parseFloat(v.odd), suspended: !!v.suspended });
                }
              }
              if (vals.length > 0) markets.push({ id: 25, name: "Gols Over/Under", values: vals });
            }

            // --- ID 65: Next 10 Minutes Total ---
            const next10M = liveOdds.find((o: any) => o.id === 65);
            if (next10M) {
              const elapsed = fixture.fixture.status.elapsed ?? 0;
              const availableHcs = [...new Set((next10M.values ?? []).map((v: any) => Number(v.handicap)))].sort((a: number, b: number) => a - b) as number[];
              const nextTarget = Math.ceil((elapsed + 1) / 10) * 10;
              const targetHc = availableHcs.find(h => h >= nextTarget) ?? availableHcs[0];
              if (targetHc != null) {
                const groupVals = (next10M.values ?? []).filter((v: any) => Number(v.handicap) === targetHc);
                const vals = groupVals.map((v: any) => ({
                  value: v.value.trim().replace(/\s+/g, " "),
                  odd: parseFloat(v.odd),
                  suspended: !!v.suspended,
                }));
                if (vals.length > 0) markets.push({ id: 65, name: `Próx. ${targetHc} min`, values: vals });
              }
            }

          } else {
            // Pre-match odds: response[0].bookmakers[0].bets — IDs match frontend market IDs directly
            const PREMATCH_IDS = new Set([1, 3, 5, 6, 8, 12, 13]);
            const bkList: any[] = oddsData.response?.[0]?.bookmakers ?? [];
            const bk = bkList[0];
            for (const bet of (bk?.bets ?? [])) {
              if (!PREMATCH_IDS.has(bet.id)) continue;
              let values: any[] = [];
              if (bet.id === 5) {
                // Goals O/U: show only 2.5 line
                values = (bet.values ?? [])
                  .filter((v: any) => v.value === "Over 2.5" || v.value === "Under 2.5")
                  .map((v: any) => ({ value: v.value, odd: parseFloat(v.odd), suspended: false }));
              } else if (bet.id === 6) {
                // O/U 1st Half: show only 0.5 line
                values = (bet.values ?? [])
                  .filter((v: any) => v.value === "Over 0.5" || v.value === "Under 0.5")
                  .map((v: any) => ({ value: v.value, odd: parseFloat(v.odd), suspended: false }));
              } else {
                values = (bet.values ?? []).map((v: any) => ({
                  value: v.value, odd: parseFloat(v.odd), suspended: false,
                }));
              }
              if (values.length > 0) markets.push({ id: bet.id, name: bet.name, values });
            }
          }

          const result = {
            fixture: {
              id: fixture.fixture.id,
              date: fixture.fixture.date,
              status: fixture.fixture.status,
              elapsed: fixture.fixture.status.elapsed,
            },
            teams: {
              home: { name: fixture.teams.home.name, logo: fixture.teams.home.logo },
              away: { name: fixture.teams.away.name, logo: fixture.teams.away.logo },
            },
            goals: fixture.goals,
            score: fixture.score,
            markets,
            isLive: isLiveStatus,
            bookmakerName: isLiveStatus ? "API-Football Live" : "Pré-Jogo",
            fetchedAt: Date.now(),
          };

          // Shorter cache for live, longer for pre-match (changes less often)
          cache.set(cacheKey, result, isLiveStatus ? LIVE_TTL : 60 * 1000);
          return result;
        })().finally(() => { liveTestInflightMap.delete(FIXTURE_ID); }));
      }

      const result = await liveTestInflightMap.get(FIXTURE_ID)!;
      return res.json(applyLock(result));
    } catch (err: any) {
      if (typeof FIXTURE_ID === "number") liveTestInflightMap.delete(FIXTURE_ID);
      const msg = err?.message ?? "Internal error";
      if (msg === "GAME_FINISHED") return res.status(404).json({ error: "Game finished" });
      if (msg === "Fixture not found") return res.status(404).json({ error: msg });
      if (msg === "API-Football unavailable") return res.status(502).json({ error: msg });
      console.error("[live-test]", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // Live match map: statistics + events for a specific active fixture (?fixture=ID)
  app.get("/api/football/live-map", async (req, res) => {
    const FIXTURE_ID = req.query.fixture ? Number(req.query.fixture) : null;
    if (!FIXTURE_ID || !activeLiveGames.has(FIXTURE_ID)) return res.status(404).json({ error: "No active live game" });
    const cacheKey = `live_map_${FIXTURE_ID}`;
    const MAP_TTL = 30 * 1000;
    const cached = cache.get<any>(cacheKey);
    if (cached) return res.json(cached);
    try {
      if (!API_FOOTBALL_KEY) return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      const [statsRes, eventsRes] = await Promise.all([
        fetch(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${FIXTURE_ID}`, { headers: { "x-apisports-key": API_FOOTBALL_KEY } }),
        fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${FIXTURE_ID}`, { headers: { "x-apisports-key": API_FOOTBALL_KEY } }),
      ]);
      const [statsData, eventsData] = await Promise.all([statsRes.json(), eventsRes.json()]);
      const parseTeam = (t: any) => {
        const s: Record<string, any> = {};
        for (const item of (t?.statistics ?? [])) s[item.type] = item.value;
        return {
          name: t.team.name,
          logo: t.team.logo,
          id: t.team.id,
          possession: parseInt(s["Ball Possession"] ?? "0"),
          shotsOnGoal: s["Shots on Goal"] ?? 0,
          shotsOffGoal: s["Shots off Goal"] ?? 0,
          totalShots: s["Total Shots"] ?? 0,
          corners: s["Corner Kicks"] ?? 0,
          fouls: s["Fouls"] ?? 0,
          yellowCards: s["Yellow Cards"] ?? 0,
          redCards: s["Red Cards"] ?? 0,
          saves: s["Goalkeeper Saves"] ?? 0,
          xg: s["expected_goals"] ? parseFloat(s["expected_goals"]) : null,
          passes: s["Total passes"] ?? 0,
          passAccuracy: s["Passes %"] ?? null,
        };
      };
      const teams = statsData.response ?? [];
      const result = {
        home: teams[0] ? parseTeam(teams[0]) : null,
        away: teams[1] ? parseTeam(teams[1]) : null,
        events: (eventsData.response ?? []).map((e: any) => ({
          minute: e.time.elapsed,
          extra: e.time.extra ?? null,
          teamName: e.team.name,
          teamId: e.team.id,
          type: e.type,
          detail: e.detail,
          player: e.player?.name ?? null,
          assist: e.assist?.name ?? null,
        })),
        fetchedAt: Date.now(),
      };
      cache.set(cacheKey, result, MAP_TTL);
      return res.json(result);
    } catch (err) {
      console.error("[live-map]", err);
      return res.status(500).json({ error: "Erro ao buscar mapa" });
    }
  });

  // Admin: Verificar resultados e atualizar bilhetes automaticamente
  app.post("/api/admin/check-results", async (_req, res) => {
    try {
      if (!API_FOOTBALL_KEY) {
        return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      }
      const result = await runCheckResults();
      res.json(result);
    } catch (error) {
      console.error("Error checking results:", error);
      res.status(500).json({ error: "Erro ao verificar resultados" });
    }
  });

  // Verificação automática (intervalo dinâmico)
  startAutoCheckTimer();

  // Admin: Configurações do sistema
  app.get("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const aporteInicial = parseInt((await storage.getSetting("aporteInicial")) || "50000", 10);
      const checkIntervalMinutes = parseInt((await storage.getSetting("checkIntervalMinutes")) || "5", 10);
      const toasterDurationSeconds = parseInt((await storage.getSetting("toasterDurationSeconds")) || "3", 10);
      res.json({ aporteInicial, checkIntervalMinutes, toasterDurationSeconds, defensasInitialBalance, earlyExitPct, cashOutPct });
    } catch (err) {
      res.status(500).json({ error: "Erro ao buscar configurações" });
    }
  });

  app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const { aporteInicial, checkIntervalMinutes, toasterDurationSeconds, defensasInitialBalance: newDefesasInitial, earlyExitPct: newEarlyExitPct, cashOutPct: newCashOutPct } = req.body;
      if (aporteInicial !== undefined) {
        const val = parseInt(String(aporteInicial), 10);
        if (!isNaN(val) && val > 0) {
          DAILY_LIMIT = val;
          await storage.setSetting("aporteInicial", String(val));
        }
      }
      if (checkIntervalMinutes !== undefined) {
        const val = parseInt(String(checkIntervalMinutes), 10);
        if (!isNaN(val) && val > 0) {
          autoCheckIntervalMs = val * 60 * 1000;
          await storage.setSetting("checkIntervalMinutes", String(val));
          startAutoCheckTimer();
        }
      }
      if (toasterDurationSeconds !== undefined) {
        const val = parseInt(String(toasterDurationSeconds), 10);
        if (!isNaN(val) && val > 0) {
          await storage.setSetting("toasterDurationSeconds", String(val));
        }
      }
      if (newDefesasInitial !== undefined) {
        const val = parseFloat(String(newDefesasInitial));
        if (!isNaN(val) && val > 0) {
          defensasInitialBalance = val;
          await storage.setSetting("defensasInitialBalance", String(val));
        }
      }
      if (newEarlyExitPct !== undefined) {
        const val = parseFloat(String(newEarlyExitPct));
        if (!isNaN(val) && val > 0 && val < 100) {
          earlyExitPct = val;
          await storage.setSetting("earlyExitPct", String(val));
        }
      }
      if (newCashOutPct !== undefined) {
        const val = parseFloat(String(newCashOutPct));
        if (!isNaN(val) && val > 0 && val < 100) {
          cashOutPct = val;
          await storage.setSetting("cashOutPct", String(val));
        }
      }
      const updated = {
        aporteInicial: DAILY_LIMIT,
        checkIntervalMinutes: autoCheckIntervalMs / 60000,
        toasterDurationSeconds: parseInt((await storage.getSetting("toasterDurationSeconds")) || "3", 10),
        defensasInitialBalance,
        earlyExitPct,
        cashOutPct,
      };
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Erro ao salvar configurações" });
    }
  });

  // Admin: Defesas
  app.get("/api/admin/defensas", requireAdmin, async (req, res) => {
    try {
      const defesas = await storage.getDefesas();
      res.json({ defesas, defensasBalance, defensasInitialBalance, defensasProfits, caixaExtras });
    } catch (err) {
      res.status(500).json({ error: "Erro ao buscar defesas" });
    }
  });

  app.post("/api/admin/defensas/renovar", requireAdmin, async (req, res) => {
    try {
      const diff = Math.round((defensasInitialBalance - defensasBalance) * 100) / 100;
      if (diff <= 0) return void res.json({ ok: true, diff: 0, defensasBalance });
      await storage.createWithdrawal(diff, `Renovação Caixa de Defesas (R$${diff.toFixed(2)})`);
      defensasBalance = defensasInitialBalance;
      await storage.setSetting("defensasBalance", String(defensasBalance));
      res.json({ ok: true, diff, defensasBalance });
    } catch (err) {
      res.status(500).json({ error: "Erro ao renovar caixa de defesas" });
    }
  });

  app.post("/api/admin/defensas", requireAdmin, async (req, res) => {
    try {
      const parsed = insertDefesaSchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues });
      const defesa = await storage.createDefesa(parsed.data);
      defensasBalance = Math.max(0, defensasBalance - parsed.data.value);
      await storage.setSetting("defensasBalance", String(defensasBalance));
      res.json({ defesa, defensasBalance });
    } catch (err) {
      res.status(500).json({ error: "Erro ao criar defesa" });
    }
  });

  app.patch("/api/admin/defensas/:id/status", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      if (!["won", "lost"].includes(status)) return void res.status(400).json({ error: "Status inválido" });
      const defesas = await storage.getDefesas();
      const defesa = defesas.find(d => d.id === id);
      if (!defesa) return void res.status(404).json({ error: "Defesa não encontrada" });
      if (defesa.status !== "pending") return void res.status(400).json({ error: "Defesa já resolvida" });
      const updated = await storage.updateDefesaStatus(id, status);
      if (status === "won") {
        defensasBalance = Math.min(defensasInitialBalance, defensasBalance + defesa.value);
        const profit = Math.max(0, Math.round((defesa.potentialReturn - defesa.value) * 100) / 100);
        defensasProfits = Math.round((defensasProfits + profit) * 100) / 100;
        await storage.setSetting("defensasProfits", String(defensasProfits));
        await storage.setSetting("defensasBalance", String(defensasBalance));
      }
      res.json({ defesa: updated, defensasBalance, defensasProfits });
    } catch (err) {
      res.status(500).json({ error: "Erro ao atualizar defesa" });
    }
  });

  app.delete("/api/admin/defensas/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const defesas = await storage.getDefesas();
      const defesa = defesas.find(d => d.id === id);
      if (!defesa) return void res.status(404).json({ error: "Defesa não encontrada" });
      if (defesa.status === "won") {
        // Undo: remove the value that was returned and the profit credited
        const profit = Math.round((defesa.potentialReturn - defesa.value) * 100) / 100;
        defensasBalance = Math.max(0, defensasBalance - defesa.value);
        defensasProfits = Math.max(0, Math.round((defensasProfits - profit) * 100) / 100);
        await storage.setSetting("defensasBalance", String(defensasBalance));
        await storage.setSetting("defensasProfits", String(defensasProfits));
      } else {
        // pending or lost: refund value back to defensas pool
        defensasBalance = Math.min(defensasInitialBalance, defensasBalance + defesa.value);
        await storage.setSetting("defensasBalance", String(defensasBalance));
      }
      await storage.deleteDefesa(id);
      res.json({ ok: true, defensasBalance, defensasProfits });
    } catch (err) {
      res.status(500).json({ error: "Erro ao excluir defesa" });
    }
  });

  // Admin: Atualizar status de um bilhete manualmente
  app.patch("/api/admin/bets/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["pending", "won", "lost", "anulado"].includes(status)) {
        return res.status(400).json({ error: "Status inválido" });
      }

      const existing = await storage.getBetSlip(id);

      // Ao reverter para "pending", resetar seleções boost e copa-card para "pending" também
      // (evita que seleções incorretamente marcadas como "lost" forcem o bilhete a perder novamente)
      if (status === "pending" && existing?.selections) {
        for (const sel of existing.selections) {
          const isManualOnly = sel.marketKey === "boost" || sel.gameId?.startsWith("copa-card-");
          if (isManualOnly && sel.result && sel.result !== "pending") {
            await storage.updateSelectionResult(id, sel.id, "pending");
          }
        }
      }

      const updated = await storage.updateBetSlipStatus(id, status);
      if (!updated) {
        return res.status(404).json({ error: "Bilhete não encontrado" });
      }

      // ── Bilhetes ADM_FW (defesas): manejar caixa de defesas em vez do saldo do usuário ──
      const isDefensaBet = existing?.userId === "ADM_FW";

      if (isDefensaBet) {
        // Ganhou: retornar stake + lucro ao caixa de defesas
        if (status === "won" && existing.status !== "won") {
          const profit = Math.max(0, Math.round((updated.potentialWin - updated.stake) * 100) / 100);
          defensasBalance = Math.min(defensasInitialBalance, Math.round((defensasBalance + updated.stake) * 100) / 100);
          defensasProfits = Math.round((defensasProfits + profit) * 100) / 100;
          await storage.setSetting("defensasBalance", String(defensasBalance));
          await storage.setSetting("defensasProfits", String(defensasProfits));
        }
        // Reverter "ganhou" → perdente/pendente
        if ((status === "pending" || status === "lost") && existing.status === "won") {
          const profit = Math.max(0, Math.round(((existing as any).potentialWin - (existing as any).stake) * 100) / 100);
          defensasBalance = Math.max(0, Math.round((defensasBalance - (existing as any).stake) * 100) / 100);
          defensasProfits = Math.max(0, Math.round((defensasProfits - profit) * 100) / 100);
          await storage.setSetting("defensasBalance", String(defensasBalance));
          await storage.setSetting("defensasProfits", String(defensasProfits));
        }
        // Anular: devolver stake ao caixa de defesas
        if (status === "anulado" && existing.status !== "anulado") {
          // Se estava como "ganhou", reverter o lucro também
          if (existing.status === "won") {
            const profit = Math.max(0, Math.round(((existing as any).potentialWin - (existing as any).stake) * 100) / 100);
            defensasProfits = Math.max(0, Math.round((defensasProfits - profit) * 100) / 100);
            await storage.setSetting("defensasProfits", String(defensasProfits));
          }
          defensasBalance = Math.min(defensasInitialBalance, Math.round((defensasBalance + (existing as any).stake) * 100) / 100);
          await storage.setSetting("defensasBalance", String(defensasBalance));
        }

        // Sincronizar status do registro de defesa correspondente
        const defesaRecord = await storage.getDefesaByTicket(id);
        console.log(`[defend-sync] betId=${id} status=${status} defesaFound=${!!defesaRecord} defesaId=${defesaRecord?.id}`);
        if (defesaRecord) {
          // Mapear status do bilhete para status de defesa (anulado → pending)
          const defesaStatus: "pending" | "won" | "lost" =
            status === "won" ? "won" :
            status === "lost" ? "lost" :
            "pending";
          await storage.updateDefesaStatus(defesaRecord.id, defesaStatus);
          console.log(`[defend-sync] updated defesa ${defesaRecord.id} → ${defesaStatus}`);
        }
      }

      // Creditar saldo ao usuário se ganhou (evitar crédito duplo)
      // O valor creditado é potentialWin - bonusUsed (retorno líquido real)
      if (!isDefensaBet && status === "won" && existing?.userId && existing.status !== "won") {
        // Dupla proteção: verificar também se já existe transação de ganho no banco
        // (evita race condition onde múltiplos cliques rápidos passam pela primeira verificação)
        const existingWinTx = await storage.getWinTransactionForBet(id);
        if (!existingWinTx) {
          const winUser = await storage.getUserByCpf(existing.userId);
          if (winUser) {
            const bonusUsed = (existing as any).bonusUsed ?? 0;
            const netPayout = Math.max(0, Math.round((updated.potentialWin - bonusUsed) * 100) / 100);
            const credited = Math.round((winUser.balance + netPayout) * 100) / 100;
            await storage.updateUserBalance(existing.userId, credited);
            await storage.createTransaction({
              userId: existing.userId,
              type: "win",
              amount: netPayout,
              balanceAfter: credited,
              description: `Aposta ganha${bonusUsed > 0 ? ` (R$${updated.potentialWin.toFixed(2)} − R$${bonusUsed.toFixed(2)} bônus)` : ""}`,
              referenceId: id,
            });
          }
        }
      }
      // Reverter crédito se mudando de "won" para qualquer outro status (pending ou lost)
      if (!isDefensaBet && (status === "pending" || status === "lost") && existing?.status === "won" && existing?.userId) {
        const winUser = await storage.getUserByCpf(existing.userId);
        if (winUser) {
          // Busca a transação de ganho original para reverter EXATAMENTE o que foi creditado
          const winTx = await storage.getWinTransactionForBet(id);
          const creditedAmount = winTx
            ? winTx.amount
            : Math.max(0, Math.round(((existing as any).potentialWin - ((existing as any).bonusUsed ?? 0)) * 100) / 100);
          const reversed = Math.round((winUser.balance - creditedAmount) * 100) / 100;
          const newBalance = Math.max(0, reversed);
          await storage.updateUserBalance(existing.userId, newBalance);
          await storage.createTransaction({
            userId: existing.userId,
            type: "adjustment",
            amount: -creditedAmount,
            balanceAfter: newBalance,
            description: `Estorno de ganho — aposta marcada como ${status === "lost" ? "perdida" : "pendente"}`,
            referenceId: id,
          });
        }
      }
      // Anular bilhete: devolver o valor apostado ao usuário
      if (!isDefensaBet && status === "anulado" && existing?.status !== "anulado" && existing?.userId) {
        const user = await storage.getUserByCpf(existing.userId);
        if (user) {
          // Se estava como "won", primeiro reverter o crédito do ganho
          let currentBalance = user.balance;
          if (existing.status === "won") {
            const winTx = await storage.getWinTransactionForBet(id);
            const creditedAmount = winTx
              ? winTx.amount
              : Math.max(0, Math.round(((existing as any).potentialWin - ((existing as any).bonusUsed ?? 0)) * 100) / 100);
            currentBalance = Math.max(0, Math.round((currentBalance - creditedAmount) * 100) / 100);
          }
          // Devolver o valor apostado
          const refunded = Math.round((currentBalance + existing.stake) * 100) / 100;
          await storage.updateUserBalance(existing.userId, refunded);
          await storage.createTransaction({
            userId: existing.userId,
            type: "adjustment",
            amount: existing.stake,
            balanceAfter: refunded,
            description: `Bilhete anulado — devolução de R$${existing.stake.toFixed(2)}`,
            referenceId: id,
          });
        }
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

      const prevBet = await storage.getBetSlip(betId);
      const updated = await storage.updateSelectionResult(betId, selectionId, result);
      if (!updated) {
        return res.status(404).json({ error: "Bilhete ou seleção não encontrada" });
      }

      // Se o bilhete virou "won" agora (não era "won" antes), creditar saldo do usuário
      if (updated.status === "won" && prevBet?.status !== "won" && updated.userId) {
        const existingWinTx = await storage.getWinTransactionForBet(betId);
        if (!existingWinTx) {
          const winUser = await storage.getUserByCpf(updated.userId);
          if (winUser) {
            const bonusUsed = updated.bonusUsed ?? 0;
            const netPayout = Math.max(0, Math.round((updated.potentialWin - bonusUsed) * 100) / 100);
            const newBalance = Math.round((winUser.balance + netPayout) * 100) / 100;
            await storage.updateUserBalance(updated.userId, newBalance);
            await storage.createTransaction({
              userId: updated.userId,
              type: "win",
              amount: netPayout,
              balanceAfter: newBalance,
              description: `Ganhou bilhete #${betId.slice(0, 8).toUpperCase()}`,
            });
          }
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating selection result:", error);
      res.status(500).json({ error: "Erro ao atualizar resultado" });
    }
  });

  // Admin: Criar defesa automática a partir de um bilhete existente
  app.post("/api/admin/bets/:id/defend", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { stake } = req.body;

      if (!stake || typeof stake !== "number" || stake <= 0) {
        return res.status(400).json({ error: "Valor inválido para a defesa" });
      }

      const originalBet = await storage.getBetSlip(id);
      if (!originalBet) {
        return res.status(404).json({ error: "Bilhete não encontrado" });
      }

      if (defensasBalance < stake) {
        return res.status(400).json({
          error: `Saldo de defesas insuficiente. Disponível: R$${defensasBalance.toFixed(2)}`,
          isInsufficientDefensasBalance: true,
        });
      }

      // Calcular totalOdds e potentialWin com as mesmas odds do bilhete original
      const totalOdds = Math.round(originalBet.selections.reduce((acc, sel) => acc * sel.odds, 1) * 100) / 100;
      const potentialWin = Math.round(stake * totalOdds * 100) / 100;

      // Criar bilhete com usuário ADM_FW (não deduza saldo de usuário real)
      const defensaBet = await storage.createBetSlip({
        selections: originalBet.selections as any,
        stake,
        userId: "ADM_FW",
        _totalOdds: totalOdds,
        _potentialWin: potentialWin,
      } as any);

      // Deduzir do caixa de defesas
      defensasBalance = Math.max(0, defensasBalance - stake);
      await storage.setSetting("defensasBalance", String(defensasBalance));

      // Montar rótulos para o registro de defesa
      const gameLabel = originalBet.selections.length > 0
        ? `${originalBet.selections[0].homeTeam} x ${originalBet.selections[0].awayTeam}`
        : "Jogo";
      const marketsLabel = originalBet.selections
        .map((s: any) => `${s.marketKey} - ${s.outcomeName}`)
        .join("; ");

      // Criar registro automático na aba Defesas
      const defesa = await storage.createDefesa({
        game: gameLabel,
        markets: marketsLabel,
        value: stake,
        odds: totalOdds,
        potentialReturn: potentialWin,
        referencedTicket: defensaBet.id,
        additionalInfo: `Defesa automática do bilhete #${id.slice(0, 8).toUpperCase()}`,
      });

      res.json({ bet: defensaBet, defesa, defensasBalance });
    } catch (error) {
      console.error("Error creating defesa bet:", error);
      res.status(500).json({ error: "Erro ao criar defesa" });
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

      // Mapa: fixtureId original → fixtureId real (pode diferir se o admin ativou o ID errado)
      const fidRemap = new Map<string, string>(); // originalFid → resolvedFid

      for (const fid of fixtureIds) {
        // Encontrar os times esperados para esta fixture a partir das seleções do bilhete
        const selsForFid = bet.selections.filter((s: any) =>
          s.gameId === `api-football-${fid}`
        );
        const expectedHome = selsForFid[0]?.homeTeam ?? "";
        const expectedAway = selsForFid[0]?.awayTeam ?? "";

        const fetchFixture = async (id: string) => {
          const r = await fetch(`https://v3.football.api-sports.io/fixtures?id=${id}`, {
            headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" }
          });
          const d: any = await r.json();
          return d?.response?.[0] ?? null;
        };

        let fix = await fetchFixture(fid);
        let resolvedFid = fid;

        if (fix && expectedHome) {
          const apiHome = fix.teams?.home?.name ?? "";
          const apiAway = fix.teams?.away?.name ?? "";
          const homeOk = teamsMatch(expectedHome, apiHome) || teamsMatch(apiHome, expectedHome);
          const awayOk = teamsMatch(expectedAway, apiAway) || teamsMatch(apiAway, expectedAway);

          if (!homeOk || !awayOk) {
            console.warn(`[auto-resolve] Fixture ${fid} teams MISMATCH: stored="${expectedHome} vs ${expectedAway}" | API="${apiHome} vs ${apiAway}" — buscando fixture correta...`);

            // Buscar fixture pela data do bilhete + nome do time esperado
            const betDateStr = new Date(bet.createdAt).toISOString().split("T")[0];
            // Converter nome PT→EN para a busca (API-Football usa nomes em inglês)
            const ptToEn = Object.fromEntries(
              Object.entries(NATIONAL_TEAM_PT).map(([en, pt]) => [pt.toLowerCase(), en])
            );
            const searchName = ptToEn[expectedHome.toLowerCase()] ?? expectedHome;
            const searchUrl = `https://v3.football.api-sports.io/fixtures?date=${betDateStr}&search=${encodeURIComponent(searchName.split(" ")[0])}`;
            const findCorrectFixture = async (): Promise<any | null> => {
              // Tentativa 1: busca com filtro de nome (mais rápido)
              try {
                const searchResp = await fetch(searchUrl, {
                  headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" }
                });
                const searchData: any = await searchResp.json();
                const candidates: any[] = searchData?.response ?? [];
                const found = candidates.find((c: any) => {
                  const cHome = c.teams?.home?.name ?? "";
                  const cAway = c.teams?.away?.name ?? "";
                  return (
                    (teamsMatch(expectedHome, cHome) || teamsMatch(cHome, expectedHome)) &&
                    (teamsMatch(expectedAway, cAway) || teamsMatch(cAway, expectedAway))
                  );
                });
                if (found) return found;
                console.warn(`[auto-resolve] Busca por nome não achou resultado — tentando busca ampla pelo dia ${betDateStr}`);
              } catch (e) {
                console.warn("[auto-resolve] Busca por nome falhou:", e);
              }

              // Tentativa 2: pegar TODOS os jogos do dia e filtrar localmente
              try {
                const allResp = await fetch(
                  `https://v3.football.api-sports.io/fixtures?date=${betDateStr}`,
                  { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" } }
                );
                const allData: any = await allResp.json();
                const all: any[] = allData?.response ?? [];
                console.log(`[auto-resolve] Busca ampla: ${all.length} fixtures em ${betDateStr}`);
                const found = all.find((c: any) => {
                  const cHome = c.teams?.home?.name ?? "";
                  const cAway = c.teams?.away?.name ?? "";
                  return (
                    (teamsMatch(expectedHome, cHome) || teamsMatch(cHome, expectedHome)) &&
                    (teamsMatch(expectedAway, cAway) || teamsMatch(cAway, expectedAway))
                  );
                });
                if (found) return found;
                console.warn(`[auto-resolve] Busca ampla também não encontrou "${expectedHome} vs ${expectedAway}" em ${betDateStr}`);
              } catch (e) {
                console.error("[auto-resolve] Busca ampla falhou:", e);
              }

              return null;
            };

            try {
              const match = await findCorrectFixture();
              if (match) {
                const correctFid = String(match.fixture.id);
                console.log(`[auto-resolve] Fixture correta encontrada: ${correctFid} (${match.teams.home.name} vs ${match.teams.away.name})`);
                fix = match;
                resolvedFid = correctFid;
              }
            } catch (searchErr) {
              console.error("[auto-resolve] Erro ao buscar fixture correta:", searchErr);
            }
          }
        }

        if (!fix) continue;
        fidRemap.set(fid, resolvedFid);
        const statusShort = fix.fixture?.status?.short ?? "";
        const finished = ["FT","AET","PEN","AWD","WO"].includes(statusShort);
        // Só adiciona ao mapa de resultados se o jogo já terminou
        // Seleções de jogos não encerrados ficam como pendente automaticamente
        if (finished) {
          fixtureResults.set(resolvedFid, {
            statusShort,
            homeGoals: fix.goals?.home ?? 0,
            awayGoals: fix.goals?.away ?? 0,
            htHome: fix.score?.halftime?.home ?? 0,
            htAway: fix.score?.halftime?.away ?? 0,
            homeTeam: fix.teams?.home?.name ?? "",
            awayTeam: fix.teams?.away?.name ?? "",
          });
        } else {
          console.log(`[auto-resolve] Fixture ${resolvedFid} ainda não encerrada (status: ${statusShort}) — seleções desse jogo ficam pendentes`);
        }
      }

      // Se absolutamente nenhum jogo terminou, bloqueia com 422
      if (fixtureResults.size === 0) {
        const statuses = fixtureIds.map(fid => {
          const resolvedFid = fidRemap.get(fid) ?? fid;
          // Busca o status da fixture não-terminada (foi salvo no fidRemap mas não em fixtureResults)
          return resolvedFid;
        }).join(", ");
        return res.status(422).json({ error: `Nenhum jogo encerrado ainda. Tente novamente após o fim da partida.` });
      }

      // Resolver cada seleção (loop async para suportar busca de escanteios e eventos)
      const arCornerCache    = new Map<string, number>();         // fid → totalCorners
      const arCornerHomeCache = new Map<string, number>();        // fid → escanteios casa
      const arCornerAwayCache = new Map<string, number>();        // fid → escanteios visitante
      const arCardHomeCache  = new Map<string, number>();        // fid → cartões casa (amarelo+vermelho)
      const arCardAwayCache  = new Map<string, number>();        // fid → cartões visitante
      const arFirstGoalCache = new Map<string, string | null>(); // fid → team name que marcou primeiro
      const arRedCardCache   = new Map<string, boolean>();       // fid → houve cartão vermelho (jogo inteiro)
      const arRedCard1HCache = new Map<string, boolean>();       // fid → houve cartão vermelho (1º tempo)
      const resolvedSelections: any[] = [];

      for (const sel of bet.selections) {
        // Super Boost Verano: sempre resolvido manualmente pelo admin — nunca automático
        if (sel.marketKey === "boost") { resolvedSelections.push(sel); continue; }
        // Copa cards (Grupos, Longo Prazo, Especiais): sempre resolvido manualmente pelo admin
        if (sel.gameId?.startsWith("copa-card-")) { resolvedSelections.push(sel); continue; }
        const fid = sel.gameId.startsWith("api-football-") ? sel.gameId.replace("api-football-", "") : null;
        if (!fid) { resolvedSelections.push(sel); continue; }
        // Usar fixture remapeada caso o admin tenha ativado o ID errado
        const resolvedFid = fidRemap.get(fid) ?? fid;
        const fix = fixtureResults.get(resolvedFid);
        if (!fix) { resolvedSelections.push(sel); continue; }

        const { homeGoals, awayGoals, htHome, htAway, homeTeam, awayTeam } = fix;
        const mk = sel.marketKey?.toLowerCase() || "";
        const oc = sel.outcome?.toLowerCase() || "";

        let selResult: "won" | "lost" = "lost";
        let resolved = true;

        if (sel.marketKey === "h2h" || mk.includes("match_winner")) {
          // Resultado 1X2 — usa fuzzy match para nomes de times
          // Também cobre "Resultado Final: match_winner-Home" do FootballGameCard
          if (oc.includes("empate") || oc.includes("draw") || oc === "x" || oc.includes("-draw")) {
            selResult = homeGoals === awayGoals ? "won" : "lost";
          } else if (oc.includes("-home") || oc === "home") {
            selResult = homeGoals > awayGoals ? "won" : "lost";
          } else if (oc.includes("-away") || oc === "away") {
            selResult = awayGoals > homeGoals ? "won" : "lost";
          } else if (teamsMatch(sel.outcome, homeTeam)) {
            selResult = homeGoals > awayGoals ? "won" : "lost";
          } else if (teamsMatch(sel.outcome, awayTeam)) {
            selResult = awayGoals > homeGoals ? "won" : "lost";
          } else {
            resolved = false;
          }

        } else if (sel.marketKey === "double_chance") {
          // Dupla Chance — "1X" (casa ou empate), "X2" (empate ou fora), "12" (casa ou fora)
          const ocTrim = oc.replace(/^double_chance[-:\s]*/i, "").trim();
          if (ocTrim === "1x") {
            selResult = homeGoals >= awayGoals ? "won" : "lost";
          } else if (ocTrim === "x2") {
            selResult = awayGoals >= homeGoals ? "won" : "lost";
          } else if (ocTrim === "12") {
            selResult = homeGoals !== awayGoals ? "won" : "lost";
          } else {
            resolved = false;
          }

        } else if (sel.marketKey === "totals") {
          // Mais/Menos Gols — outcome: "Mais 2.5", "Menos 1.5" etc.
          const maisMatch = oc.match(/^mais\s*([\d.]+)$/i);
          const menosMatch = oc.match(/^menos\s*([\d.]+)$/i);
          const total = homeGoals + awayGoals;
          if (maisMatch) {
            selResult = total > parseFloat(maisMatch[1]) ? "won" : "lost";
          } else if (menosMatch) {
            selResult = total < parseFloat(menosMatch[1]) ? "won" : "lost";
          } else {
            resolved = false;
          }

        } else if (mk === "results/both teams score") {
          // Resultado + Ambas Marcam (mercado combinado) — deve vir ANTES do BTTS genérico
          const raw = oc.replace(/^results\/both teams score-?/i, "").trim();
          const slash = raw.lastIndexOf("/");
          if (slash === -1) {
            resolved = false;
          } else {
            const resultPick = raw.slice(0, slash).toLowerCase().trim();
            const bttsPick   = raw.slice(slash + 1).toLowerCase().trim();
            const btts = homeGoals > 0 && awayGoals > 0;
            const bttsWon = bttsPick.includes("yes") || bttsPick.includes("sim") ? btts : !btts;
            let resultWon: boolean;
            if (resultPick === "home" || resultPick === "casa") resultWon = homeGoals > awayGoals;
            else if (resultPick === "away" || resultPick === "fora") resultWon = awayGoals > homeGoals;
            else resultWon = homeGoals === awayGoals;
            selResult = resultWon && bttsWon ? "won" : "lost";
          }

        } else if (mk.includes("both") || mk.includes("btts") || sel.marketKey === "Both Teams Score") {
          // Ambas as equipes marcam (BTTS) — diferencia 1º e 2º tempo
          let hG: number, aG: number;
          if (mk.includes("first half")) {
            hG = htHome; aG = htAway;
          } else if (mk.includes("second half")) {
            hG = homeGoals - htHome; aG = awayGoals - htAway;
          } else {
            hG = homeGoals; aG = awayGoals;
          }
          const btts = hG > 0 && aG > 0;
          const betYes = oc.includes("sim") || oc.includes("yes");
          selResult = (btts === betYes) ? "won" : "lost";

        } else if (mk.includes("ht/ft") || mk.includes("halftime") || sel.marketKey === "HT/FT Double" || mk === "ht_ft") {
          // HT/FT — API-Football usa "Home/Home", "Away/Draw" etc.
          // mk pode ser "ht_ft" (FootballGameCard) ou conter "ht/ft"
          const htActual = htHome > htAway ? "home" : htAway > htHome ? "away" : "draw";
          const ftActual = homeGoals > awayGoals ? "home" : awayGoals > homeGoals ? "away" : "draw";
          const raw = sel.outcome
            .replace(/^HT\/FT Double[-:\s]*/i, "")
            .replace(/^[^:]+:\s*ht_ft-/i, "")
            .trim();
          const slash = raw.lastIndexOf("/");
          if (slash !== -1) {
            const htPick = raw.slice(0, slash).trim().toLowerCase();
            const ftPick = raw.slice(slash + 1).trim().toLowerCase();
            const chk = (pick: string, actual: string) => {
              if (pick === actual) return true;
              if (pick === "draw" || pick === "empate" || pick === "x") return actual === "draw";
              if (actual === "home") return teamsMatch(pick, homeTeam);
              if (actual === "away") return teamsMatch(pick, awayTeam);
              return false;
            };
            selResult = chk(htPick, htActual) && chk(ftPick, ftActual) ? "won" : "lost";
          } else {
            resolved = false;
          }

        } else if (mk.includes("goals over") || mk.includes("goals under") || sel.marketKey === "Goals Over/Under") {
          // Total de gols — diferencia período (inteiro, 1º tempo, 2º tempo)
          let total: number;
          if (mk.includes("first half")) {
            total = htHome + htAway;
          } else if (mk.includes("second half")) {
            total = (homeGoals - htHome) + (awayGoals - htAway);
          } else {
            total = homeGoals + awayGoals;
          }
          // API-Football armazena Goals Over/Under como "Sim" (Over 2.5) ou "Não" (Under 2.5)
          if (oc.includes("sim")) {
            selResult = total > 2.5 ? "won" : "lost";
          } else if (oc.includes("não") || oc.includes("nao")) {
            selResult = total <= 2.5 ? "won" : "lost";
          } else {
            const overMatch = oc.match(/over\s*(\d+\.?\d*)/i);
            const underMatch = oc.match(/under\s*(\d+\.?\d*)/i);
            if (overMatch) {
              selResult = total > parseFloat(overMatch[1]) ? "won" : "lost";
            } else if (underMatch) {
              selResult = total < parseFloat(underMatch[1]) ? "won" : "lost";
            } else {
              resolved = false;
            }
          }

        } else if (mk.includes("corner") || mk === "live_m20") {
          // Escanteios — busca estatísticas da API-Football (também extrai cartões)
          // Usa resolvedFid para garantir que buscamos a fixture correta
          if (!arCornerCache.has(resolvedFid)) {
            try {
              const statsRes = await fetch(
                `${API_FOOTBALL_BASE}/fixtures/statistics?fixture=${resolvedFid}`,
                { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" } }
              );
              if (statsRes.ok) {
                const statsData = await statsRes.json();
                let homeC = 0; let awayC = 0;
                let homeYellow = 0; let homeRed = 0; let awayYellow = 0; let awayRed = 0;
                let foundCornerStat = false;
                for (const teamStat of statsData.response || []) {
                  const isHome = teamsMatch(teamStat.team?.name ?? "", homeTeam);
                  for (const s of teamStat.statistics || []) {
                    const rawVal = s.value;
                    const val = rawVal !== null && rawVal !== undefined ? parseInt(rawVal) || 0 : null;
                    if (s.type === "Corner Kicks" && val !== null) {
                      foundCornerStat = true;
                      if (isHome) homeC = val; else awayC = val;
                    }
                    if (s.type === "Yellow Cards" && val !== null) { if (isHome) homeYellow = val; else awayYellow = val; }
                    if (s.type === "Red Cards" && val !== null)    { if (isHome) homeRed = val; else awayRed = val; }
                  }
                }
                if (foundCornerStat && (homeC + awayC) > 0) {
                  arCornerCache.set(resolvedFid, homeC + awayC);
                  arCornerHomeCache.set(resolvedFid, homeC);
                  arCornerAwayCache.set(resolvedFid, awayC);
                  console.log(`    [auto-resolve] Stats fixture ${resolvedFid}: corners=${homeC + awayC} (${homeC}/${awayC}), cartões=${homeYellow + homeRed * 2 + awayYellow + awayRed * 2} (${homeYellow + homeRed * 2}/${awayYellow + awayRed * 2})`);
                } else if (foundCornerStat) {
                  console.log(`    [auto-resolve] Stats fixture ${resolvedFid}: Corner Kicks retornou 0+0 — dados ainda não prontos, mantendo pendente`);
                } else {
                  console.log(`    [auto-resolve] Stats fixture ${resolvedFid}: Corner Kicks não encontrado na API — mantendo pendente`);
                }
                if (!arCardHomeCache.has(resolvedFid)) {
                  arCardHomeCache.set(resolvedFid, homeYellow + homeRed * 2);
                  arCardAwayCache.set(resolvedFid, awayYellow + awayRed * 2);
                }
              }
            } catch (e) {
              console.log(`    [auto-resolve] Erro ao buscar stats fixture ${resolvedFid}:`, e);
            }
          }

          // Escanteios 1º Tempo — sempre manual (admin decide ganhou/perdeu)
          if (mk.includes("first half")) {
            resolved = false;
            console.log(`    [auto-resolve] Corners 1ºT fixture ${resolvedFid}: resolução manual pelo admin`);
          // Mercados complexos não resolvíveis automaticamente
          } else if (mk.includes("asian handicap") || mk.includes("last corner")) {
            resolved = false;
          // Corners 1x2 — quem teve mais escanteios
          } else if (mk.includes("1x2")) {
            const hc = arCornerHomeCache.get(resolvedFid);
            const ac = arCornerAwayCache.get(resolvedFid);
            if (hc !== undefined && ac !== undefined) {
              // Extrai só a escolha (outcome pode ter prefixo "Corners 1x2-Home")
              const ocFull = oc.toLowerCase().trim();
              const ocTrim = ocFull.includes("-") ? ocFull.split("-").pop()!.trim() : ocFull;
              if (ocTrim === "home" || ocTrim === "casa") selResult = hc > ac ? "won" : "lost";
              else if (ocTrim === "away" || ocTrim === "fora" || ocTrim === "visitante") selResult = ac > hc ? "won" : "lost";
              else if (ocTrim === "draw" || ocTrim === "empate" || ocTrim === "x") selResult = hc === ac ? "won" : "lost";
              else resolved = false;
            } else {
              resolved = false;
            }
          // Corners Over/Under — jogo inteiro
          } else {
            const totalCorners = arCornerCache.get(resolvedFid);
            if (totalCorners !== undefined) {
              const overMatch = oc.match(/over\s*(\d+\.?\d*)/i);
              const underMatch = oc.match(/under\s*(\d+\.?\d*)/i);
              if (overMatch) {
                selResult = totalCorners > parseFloat(overMatch[1]) ? "won" : "lost";
              } else if (underMatch) {
                selResult = totalCorners < parseFloat(underMatch[1]) ? "won" : "lost";
              } else {
                resolved = false;
              }
            } else {
              resolved = false;
            }
          }

        } else if (mk.includes("exact") || sel.marketKey === "Exact Score") {
          // Placar exato
          const outcomeParts = sel.outcome.match(/(\d+)[:\-](\d+)/);
          if (outcomeParts) {
            const [, og, ag] = outcomeParts;
            selResult = parseInt(og) === homeGoals && parseInt(ag) === awayGoals ? "won" : "lost";
          } else {
            resolved = false;
          }

        } else if (mk === "first half winner") {
          // Vencedor do 1º Tempo
          const ocTrim = oc.toLowerCase().trim();
          if (ocTrim.includes("draw") || ocTrim.includes("empate") || ocTrim === "x") selResult = htHome === htAway ? "won" : "lost";
          else if (ocTrim.includes("home") || ocTrim.includes("casa")) selResult = htHome > htAway ? "won" : "lost";
          else if (ocTrim.includes("away") || ocTrim.includes("fora") || ocTrim.includes("visitante")) selResult = htAway > htHome ? "won" : "lost";
          else resolved = false;

        } else if (mk === "total - home" || mk === "total - away") {
          // Total de gols de um time específico
          const teamGoals = mk === "total - home" ? homeGoals : awayGoals;
          const overMatch = oc.match(/over\s*(\d+\.?\d*)/i);
          const underMatch = oc.match(/under\s*(\d+\.?\d*)/i);
          if (overMatch)       selResult = teamGoals > parseFloat(overMatch[1]) ? "won" : "lost";
          else if (underMatch) selResult = teamGoals < parseFloat(underMatch[1]) ? "won" : "lost";
          else resolved = false;

        } else if ((mk.includes("cards") && !mk.includes("red card")) || mk === "live_m119") {
          // Mercados de cartões — busca estatísticas da API-Football
          if (!arCardHomeCache.has(resolvedFid)) {
            try {
              const statsRes = await fetch(
                `${API_FOOTBALL_BASE}/fixtures/statistics?fixture=${resolvedFid}`,
                { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" } }
              );
              if (statsRes.ok) {
                const statsData = await statsRes.json();
                let homeYellow = 0; let homeRed = 0; let awayYellow = 0; let awayRed = 0;
                let homeC = 0; let awayC = 0;
                for (const teamStat of statsData.response || []) {
                  const isHome = teamsMatch(teamStat.team?.name ?? "", homeTeam);
                  for (const s of teamStat.statistics || []) {
                    const val = parseInt(s.value) || 0;
                    if (s.type === "Corner Kicks") { if (isHome) homeC = val; else awayC = val; }
                    if (s.type === "Yellow Cards") { if (isHome) homeYellow = val; else awayYellow = val; }
                    if (s.type === "Red Cards")    { if (isHome) homeRed = val; else awayRed = val; }
                  }
                }
                arCardHomeCache.set(resolvedFid, homeYellow + homeRed * 2);
                arCardAwayCache.set(resolvedFid, awayYellow + awayRed * 2);
                if (!arCornerCache.has(resolvedFid)) {
                  arCornerCache.set(resolvedFid, homeC + awayC);
                  arCornerHomeCache.set(resolvedFid, homeC);
                  arCornerAwayCache.set(resolvedFid, awayC);
                }
                console.log(`    [auto-resolve] Cartões fixture ${resolvedFid}: casa=${homeYellow + homeRed * 2}, fora=${awayYellow + awayRed * 2}`);
              }
            } catch (e) {
              console.log(`    [auto-resolve] Erro ao buscar cartões fixture ${resolvedFid}:`, e);
            }
          }
          const homeCards = arCardHomeCache.get(resolvedFid) ?? null;
          const awayCards = arCardAwayCache.get(resolvedFid) ?? null;
          if (homeCards === null || awayCards === null) {
            resolved = false;
          } else {
            let cardTotal: number;
            if (mk === "cards - home" || mk === "home team total cards") cardTotal = homeCards;
            else if (mk === "cards - away" || mk === "away team total cards") cardTotal = awayCards;
            else cardTotal = homeCards + awayCards; // cards over/under
            const overMatch = oc.match(/over\s*(\d+\.?\d*)/i);
            const underMatch = oc.match(/under\s*(\d+\.?\d*)/i);
            if (overMatch)       { selResult = cardTotal > parseFloat(overMatch[1]) ? "won" : "lost"; console.log(`    [auto-resolve] Cartões Over ${overMatch[1]}: total=${cardTotal} → ${selResult}`); }
            else if (underMatch) { selResult = cardTotal < parseFloat(underMatch[1]) ? "won" : "lost"; console.log(`    [auto-resolve] Cartões Under ${underMatch[1]}: total=${cardTotal} → ${selResult}`); }
            else resolved = false;
          }

        } else if (mk.includes("team to score first") || mk.includes("score first") || mk.includes("red card")) {
          // Primeiro marcador ou Cartão Vermelho — busca eventos da partida (cache unificado)
          if (!arFirstGoalCache.has(resolvedFid)) {
            try {
              const evRes = await fetch(
                `${API_FOOTBALL_BASE}/fixtures/events?fixture=${resolvedFid}`,
                { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY || "" } }
              );
              if (evRes.ok) {
                const evData = await evRes.json();
                const events = evData.response || [];
                const goalEvents = events
                  .filter((e: any) => e.type === "Goal" && e.detail !== "Missed Penalty")
                  .sort((a: any, b: any) => (a.time?.elapsed ?? 999) - (b.time?.elapsed ?? 999));
                // "" = buscou mas não houve gol (0x0), null = falha de fetch
                arFirstGoalCache.set(resolvedFid, goalEvents[0]?.team?.name ?? "");
                const redCards = events.filter((e: any) => e.type === "Card" && e.detail === "Red Card");
                arRedCardCache.set(resolvedFid, redCards.length > 0);
                const redCards1H = redCards.filter((e: any) => (e.time?.elapsed ?? 999) <= 45);
                arRedCard1HCache.set(resolvedFid, redCards1H.length > 0);
                console.log(`    [auto-resolve] eventos fixture ${resolvedFid}: 1ºgol=${arFirstGoalCache.get(resolvedFid) || "nenhum"}, redCard=${arRedCardCache.get(resolvedFid)}, redCard1H=${arRedCard1HCache.get(resolvedFid)}`);
              } else {
                arFirstGoalCache.set(resolvedFid, null);
                arRedCardCache.set(resolvedFid, false);
                arRedCard1HCache.set(resolvedFid, false);
              }
            } catch (e) {
              arFirstGoalCache.set(resolvedFid, null);
              arRedCardCache.set(resolvedFid, false);
              arRedCard1HCache.set(resolvedFid, false);
            }
          }

          if (mk.includes("team to score first") || mk.includes("score first")) {
            const firstScorer = arFirstGoalCache.get(resolvedFid) ?? null;
            if (firstScorer === null) {
              // null = falha ao buscar → mantém pendente
              resolved = false;
            } else {
              const ocLc = sel.outcome.toLowerCase().trim();
              const pickedNoGoal = ocLc.includes("no goal") || ocLc.includes("sem gol") || ocLc.includes("nenhum");
              const pickedHome = ocLc === "home" || ocLc === "casa" || ocLc.endsWith("-home") || ocLc.endsWith(" home") || teamsMatch(sel.outcome, homeTeam) || teamsMatch(sel.outcome, sel.homeTeam);
              const pickedAway = ocLc === "away" || ocLc === "fora" || ocLc === "visitante" || ocLc.endsWith("-away") || ocLc.endsWith(" away") || teamsMatch(sel.outcome, awayTeam) || teamsMatch(sel.outcome, sel.awayTeam);
              if (firstScorer === "") {
                // Jogo sem gols (0x0) → todos perdem
                selResult = "lost";
              } else {
                const scoredHome = teamsMatch(firstScorer, homeTeam);
                const scoredAway = teamsMatch(firstScorer, awayTeam);
                if (pickedNoGoal)    selResult = "lost";
                else if (pickedHome) selResult = scoredHome ? "won" : "lost";
                else if (pickedAway) selResult = scoredAway ? "won" : "lost";
                else                 resolved = false;
              }
            }
          } else {
            // Red Card (jogo inteiro ou 1º tempo)
            const is1H = mk.includes("1st half") || mk.includes("first half");
            const hadRedCard = is1H
              ? (arRedCard1HCache.get(resolvedFid) ?? false)
              : (arRedCardCache.get(resolvedFid) ?? false);
            const outcomeLC = sel.outcome?.toLowerCase() ?? "";
            const pickedSim = outcomeLC.includes("sim") || outcomeLC.includes("yes");
            const pickedNao = outcomeLC.includes("não") || outcomeLC.includes("nao") || outcomeLC.includes("no");
            if (pickedSim)      selResult = hadRedCard ? "won" : "lost";
            else if (pickedNao) selResult = hadRedCard ? "lost" : "won";
            else                resolved = false;
          }

        } else if (mk.startsWith("live_m")) {
          // Mercados ao vivo — lógica espelha checkSelectionResult
          const liveId = parseInt(mk.replace("live_m", ""));

          if (liveId === 1) {
            // 1X2 resultado final
            if (oc === "home" || oc === "1" || oc === "casa") selResult = homeGoals > awayGoals ? "won" : "lost";
            else if (oc === "draw" || oc === "x" || oc === "empate") selResult = homeGoals === awayGoals ? "won" : "lost";
            else if (oc === "away" || oc === "2" || oc === "fora" || oc === "visitante") selResult = awayGoals > homeGoals ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 5 || liveId === 25) {
            // Gols Over/Under (tempo inteiro)
            const total = homeGoals + awayGoals;
            const overM = oc.match(/over\s*([\d.]+)/i);
            const underM = oc.match(/under\s*([\d.]+)/i);
            if (overM)       selResult = total > parseFloat(overM[1]) ? "won" : "lost";
            else if (underM) selResult = total < parseFloat(underM[1]) ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 8) {
            // Ambas Marcam
            const btts = homeGoals > 0 && awayGoals > 0;
            if (oc === "yes" || oc === "sim") selResult = btts ? "won" : "lost";
            else if (oc === "no" || oc === "não" || oc === "nao") selResult = btts ? "lost" : "won";
            else resolved = false;

          } else if (liveId === 13) {
            // Vencedor 1º Tempo
            if (oc === "home" || oc === "1" || oc === "casa") selResult = htHome > htAway ? "won" : "lost";
            else if (oc === "draw" || oc === "x" || oc === "empate") selResult = htHome === htAway ? "won" : "lost";
            else if (oc === "away" || oc === "2" || oc === "fora") selResult = htAway > htHome ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 3) {
            // Vencedor 2º Tempo
            const h2Home = homeGoals - htHome;
            const h2Away = awayGoals - htAway;
            if (oc === "home" || oc === "1" || oc === "casa") selResult = h2Home > h2Away ? "won" : "lost";
            else if (oc === "draw" || oc === "x" || oc === "empate") selResult = h2Home === h2Away ? "won" : "lost";
            else if (oc === "away" || oc === "2" || oc === "fora") selResult = h2Away > h2Home ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 6) {
            // Gols Over/Under 1º Tempo
            const htTotal = htHome + htAway;
            const overM = oc.match(/over\s*([\d.]+)/i);
            const underM = oc.match(/under\s*([\d.]+)/i);
            if (overM)       selResult = htTotal > parseFloat(overM[1]) ? "won" : "lost";
            else if (underM) selResult = htTotal < parseFloat(underM[1]) ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 12) {
            // Dupla Chance
            if (oc === "home/draw" || oc === "1x") selResult = homeGoals >= awayGoals ? "won" : "lost";
            else if (oc === "draw/away" || oc === "x2") selResult = awayGoals >= homeGoals ? "won" : "lost";
            else if (oc === "home/away" || oc === "12") selResult = homeGoals !== awayGoals ? "won" : "lost";
            else resolved = false;

          } else if (liveId === 65) {
            // Próximos 10 min — manual
            resolved = false;

          } else {
            resolved = false;
          }

        } else {
          resolved = false;
        }

        resolvedSelections.push(resolved ? { ...sel, result: selResult } : sel);
      }

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

      const bet = await storage.getBetSlip(id);
      if (!bet) {
        return res.status(404).json({ error: "Bilhete não encontrado" });
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



  // ─── Clube FW: scheduler automático ────────────────────────────────────────
  // Calcula a segunda-feira anterior em fuso Manaus (UTC-4)
  function getPrevManausWeekStartStr(): string {
    const now = new Date();
    const manausNow = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const dow = manausNow.getUTCDay(); // 0=Dom, 1=Seg
    const daysToMonday = dow === 0 ? 6 : dow - 1;
    const thisMonday = new Date(manausNow.getTime() - daysToMonday * 24 * 60 * 60 * 1000);
    const prevMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const y = prevMonday.getUTCFullYear();
    const m = String(prevMonday.getUTCMonth() + 1).padStart(2, "0");
    const d = String(prevMonday.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  async function runClubFwPayoutIfDue() {
    try {
      const prevWeek = getPrevManausWeekStartStr();
      const lastPaid = await storage.getSetting("club_fw_last_payout_week");
      if (lastPaid === prevWeek) return; // já processado esta semana

      // Janela de pagamento abre na segunda seguinte ao fim da semana às 08:00 Manaus
      // prevWeek = "YYYY-MM-DD" (segunda da semana encerrada)
      // Abertura = prevWeek + 7 dias às 08:00 Manaus = prevWeek + 7 dias + 12:00 UTC
      const payoutOpensAt = new Date(`${prevWeek}T12:00:00.000Z`);
      payoutOpensAt.setUTCDate(payoutOpensAt.getUTCDate() + 7);

      if (new Date() < payoutOpensAt) return; // ainda não chegou a hora (antes das 08:00 de segunda)

      console.log(`[ClubeFW] Iniciando pagamento automático — semana ${prevWeek}`);
      await storage.processAllUsersClubFwPayout(prevWeek);
    } catch (e) {
      console.error("[ClubeFW] Erro no scheduler:", e);
    }
  }

  // Executa no startup (pega semanas atrasadas caso o servidor tenha caído)
  setTimeout(runClubFwPayoutIfDue, 5000);

  // Verifica a cada 30 minutos
  setInterval(runClubFwPayoutIfDue, 30 * 60 * 1000);

  // ── Notificações ─────────────────────────────────────────────────────────────
  app.get("/api/admin/notifications", requireAdmin, async (_req, res) => {
    try { res.json(await storage.getNotifications()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/admin/notifications", requireAdmin, async (req, res) => {
    try {
      const { title, body, type = "info", targetCpfs, imageData, mimeType } = req.body;
      if (!title || !body) return res.status(400).json({ error: "title e body obrigatórios" });
      res.json(await storage.createNotification({ title, body, type, targetCpfs: targetCpfs ?? null, imageData: imageData ?? null, mimeType: mimeType ?? null }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  const notifImgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  app.post("/api/admin/notifications/:id/image", requireAdmin, notifImgUpload.single("image"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
      const imageData = req.file.buffer.toString("base64");
      const mimeType = req.file.mimetype;
      await storage.updateNotificationImage(Number(req.params.id), imageData, mimeType);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/notifications/:id/image", async (req: any, res) => {
    try {
      const img = await storage.getNotificationImage(Number(req.params.id));
      if (!img) return res.status(404).end();
      const buf = Buffer.from(img.imageData, "base64");
      res.set("Content-Type", img.mimeType || "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400");
      res.send(buf);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.patch("/api/admin/notifications/:id/toggle", requireAdmin, async (req, res) => {
    try { res.json(await storage.toggleNotificationActive(Number(req.params.id))); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/notifications/:id", requireAdmin, async (req, res) => {
    try { res.json({ ok: await storage.deleteNotification(Number(req.params.id)) }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/notifications", async (req: any, res) => {
    try {
      const cpf = req.session?.userId;
      if (!cpf) return res.json([]);
      res.set("Cache-Control", "no-store");
      const result = await storage.getNotificationsForUser(cpf);
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/notifications/unread-count", async (req: any, res) => {
    try {
      const cpf = req.session?.userId;
      if (!cpf) return res.json({ count: 0 });
      res.json({ count: await storage.getUnreadCountForUser(cpf) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/notifications/read-all", async (req: any, res) => {
    try {
      const cpf = req.session?.userId;
      if (!cpf) return res.status(401).json({ error: "Não autenticado" });
      await storage.markAllNotificationsRead(cpf);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/notifications/:id/read", async (req: any, res) => {
    try {
      const cpf = req.session?.userId;
      if (!cpf) return res.status(401).json({ error: "Não autenticado" });
      await storage.markNotificationRead(Number(req.params.id), cpf);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/notifications/:id", async (req: any, res) => {
    try {
      const cpf = req.session?.userId;
      if (!cpf) return res.status(401).json({ error: "Não autenticado" });
      await storage.dismissNotification(Number(req.params.id), cpf);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/notifications/dismiss-all", async (req: any, res) => {
    try {
      const cpf = req.session?.userId;
      console.log("[dismiss-all] cpf=", cpf);
      if (!cpf) return res.status(401).json({ error: "Não autenticado" });
      await storage.dismissAllNotifications(cpf);
      console.log("[dismiss-all] done for", cpf);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[dismiss-all] error:", e);
      res.status(500).json({ error: e.message });
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
  
  // Verificar aliases de clubes
  for (const [canonical, aliases] of Object.entries(teamAliases)) {
    const allNames = [canonical, ...aliases].map(a => normalizeTeamName(a));
    const n1Match = allNames.some(a => n1.includes(a) || a.includes(n1));
    const n2Match = allNames.some(a => n2.includes(a) || a.includes(n2));
    if (n1Match && n2Match) {
      return true;
    }
  }

  // Verificar traduções de seleções nacionais (EN ↔ PT)
  // Ex: "Ghana" (API) == "Gana" (aposta), "Ivory Coast" == "Costa do Marfim"
  for (const [en, pt] of Object.entries(NATIONAL_TEAM_PT)) {
    const nEn = normalizeTeamName(en);
    const nPt = normalizeTeamName(pt);
    const hits1 = n1 === nEn || n1 === nPt || nEn.includes(n1) || n1.includes(nEn) || nPt.includes(n1) || n1.includes(nPt);
    const hits2 = n2 === nEn || n2 === nPt || nEn.includes(n2) || n2.includes(nEn) || nPt.includes(n2) || n2.includes(nPt);
    if (hits1 && hits2) return true;
  }
  
  return false;
}

// Verificar se uma seleção ganhou
// Retorna: true = ganhou | false = perdeu | null = indeterminado (mantém pendente)
function checkSelectionResult(
  selection: any,
  homeGoals: number,
  awayGoals: number,
  totalGoals: number,
  homeTeamName: string,
  awayTeamName: string,
  htHomeGoals: number | null = null,
  htAwayGoals: number | null = null,
  totalCorners: number | null = null,
  firstScorerTeam: string | null = null,
  hasRedCard: boolean | null = null,
  hasRedCard1H: boolean | null = null,
  homeCorners: number | null = null,
  awayCorners: number | null = null,
  homeCorners1H: number | null = null,
  awayCorners1H: number | null = null,
  homeCards: number | null = null,
  awayCards: number | null = null
): boolean | null {
  const outcome   = selection.outcome?.toLowerCase() ?? "";
  const marketKey = selection.marketKey?.toLowerCase() ?? "";

  // Super Boost Verano: nunca resolvido automaticamente
  if (marketKey === "boost") return null;

  console.log(`    checkSelectionResult: mk="${marketKey}" outcome="${selection.outcome}"`);
  console.log(`    Placar: ${homeGoals}-${awayGoals}, HT: ${htHomeGoals}-${htAwayGoals}`);

  // ── Resultado 1X2 (h2h) ────────────────────────────────────────────────────
  if (marketKey === "h2h" || marketKey.includes("match_winner")) {
    if (outcome.includes("draw") || outcome.includes("empate") || outcome === "x" || outcome.includes("-draw")) {
      return homeGoals === awayGoals;
    }
    // Formato API-Football via FootballGameCard: "Resultado Final: match_winner-Home"
    if (outcome.includes("-home") || outcome === "home") {
      console.log(`    h2h/match_winner: home wins (${homeGoals}-${awayGoals})`);
      return homeGoals > awayGoals;
    }
    if (outcome.includes("-away") || outcome === "away") {
      console.log(`    h2h/match_winner: away wins (${homeGoals}-${awayGoals})`);
      return awayGoals > homeGoals;
    }
    if (teamsMatch(selection.outcome, homeTeamName) || teamsMatch(selection.outcome, selection.homeTeam)) {
      return homeGoals > awayGoals;
    }
    if (teamsMatch(selection.outcome, awayTeamName) || teamsMatch(selection.outcome, selection.awayTeam)) {
      return awayGoals > homeGoals;
    }
    console.log(`    h2h: não identificou time no outcome "${selection.outcome}"`);
    return false;
  }

  // ── HT/FT Double ─────────────────────────────────────────────────────────
  // API-Football retorna valores como "Home/Home", "Away/Draw", "Draw/Away" etc.
  // marketKey pode ser "ht/ft double", "ht_ft" (FootballGameCard) ou conter "halftime"
  if (marketKey.includes("ht/ft") || marketKey.includes("halftime") || marketKey === "ht/ft double" || marketKey === "ht_ft") {
    if (htHomeGoals === null || htAwayGoals === null) {
      console.log(`    HT/FT: dados de intervalo não disponíveis`);
      return null;
    }
    const htActual = htHomeGoals > htAwayGoals ? "home" : htAwayGoals > htHomeGoals ? "away" : "draw";
    const ftActual = homeGoals   > awayGoals   ? "home" : awayGoals   > homeGoals   ? "away" : "draw";

    // Remove prefixos conhecidos antes de extrair os picks:
    // "HT/FT Double-Home/Home", "Intervalo / Final: ht_ft-Home/Home"
    const raw   = selection.outcome
      .replace(/^HT\/FT Double[-:\s]*/i, "")
      .replace(/^[^:]+:\s*ht_ft-/i, "")
      .trim();
    const slash = raw.lastIndexOf("/");
    if (slash === -1) { console.log(`    HT/FT: barra não encontrada em "${raw}"`); return false; }

    const htPick = raw.slice(0, slash).trim().toLowerCase();
    const ftPick = raw.slice(slash + 1).trim().toLowerCase();

    const matchesPart = (pick: string, actual: string) => {
      if (pick === actual) return true;
      if (pick === "empate" || pick === "x" || pick === "draw") return actual === "draw";
      if (actual === "home") return teamsMatch(pick, homeTeamName);
      if (actual === "away") return teamsMatch(pick, awayTeamName);
      return false;
    };

    const htWon = matchesPart(htPick, htActual);
    const ftWon = matchesPart(ftPick, ftActual);
    console.log(`    HT/FT: pick="${htPick}/${ftPick}", actual="${htActual}/${ftActual}", won: ${htWon && ftWon}`);
    return htWon && ftWon;
  }

  // ── Escanteios ────────────────────────────────────────────────────────────
  const isCornerMkt =
    marketKey.includes("corner") ||
    selection.marketName?.toLowerCase().includes("escanteio") ||
    selection.marketName?.toLowerCase().includes("corner");

  if (isCornerMkt) {
    // 1º tempo — usa stats capturadas ao vivo no intervalo
    if (marketKey.includes("first half")) {
      if (homeCorners1H === null || awayCorners1H === null) {
        console.log(`    Corners 1ºT: aguardando captura ao vivo no intervalo (jogo ainda não chegou ao HT ou não capturado)`);
        return null;
      }
      const total1H = homeCorners1H + awayCorners1H;
      const overMatch  = outcome.match(/over\s*([\d.]+)/i);
      const underMatch = outcome.match(/under\s*([\d.]+)/i);
      if (overMatch)  { const l = parseFloat(overMatch[1]); console.log(`    Corners 1ºT: Over ${l} — ${total1H}>${l}=${total1H>l}`);  return total1H > l; }
      if (underMatch) { const l = parseFloat(underMatch[1]); console.log(`    Corners 1ºT: Under ${l} — ${total1H}<${l}=${total1H<l}`); return total1H < l; }
      return false;
    }
    // Mercados complexos (Handicap Asiático, Último Escanteio) — não resolvíveis automaticamente
    if (marketKey.includes("asian handicap") || marketKey.includes("last corner")) {
      console.log(`    Corners mercado complexo ("${marketKey}"): não resolvível automaticamente`);
      return null;
    }
    // Corners 1x2 — compara escanteios casa vs visitante
    if (marketKey.includes("1x2")) {
      if (homeCorners === null || awayCorners === null) {
        console.log(`    Corners 1x2: dados home/away não disponíveis`);
        return null;
      }
      // O outcome pode incluir prefixo do mercado (ex: "Corners 1x2-Home") — extrai só a escolha
      const oc2Full = outcome.toLowerCase().trim();
      const oc2 = oc2Full.includes("-") ? oc2Full.split("-").pop()!.trim() : oc2Full;
      if (oc2 === "home" || oc2 === "casa") { console.log(`    Corners 1x2: apostou Casa (${homeCorners} vs ${awayCorners})`); return homeCorners > awayCorners; }
      if (oc2 === "away" || oc2 === "fora" || oc2 === "visitante") { console.log(`    Corners 1x2: apostou Fora (${awayCorners} vs ${homeCorners})`); return awayCorners > homeCorners; }
      if (oc2 === "draw" || oc2 === "empate" || oc2 === "x") { console.log(`    Corners 1x2: apostou Empate (${homeCorners}=${awayCorners})`); return homeCorners === awayCorners; }
      console.log(`    Corners 1x2: outcome não reconhecido "${outcome}"`);
      return null;
    }
    // Corners Over/Under (jogo inteiro)
    if (totalCorners === null) {
      console.log(`    Corners: estatísticas não disponíveis`);
      return null;
    }
    const overMatch  = outcome.match(/over\s*([\d.]+)/i);
    const underMatch = outcome.match(/under\s*([\d.]+)/i);
    if (overMatch)  { const l = parseFloat(overMatch[1]);  console.log(`    Corners: Over ${l} — ${totalCorners}>${l}=${totalCorners>l}`);  return totalCorners > l; }
    if (underMatch) { const l = parseFloat(underMatch[1]); console.log(`    Corners: Under ${l} — ${totalCorners}<${l}=${totalCorners<l}`); return totalCorners < l; }
    console.log(`    Corners: padrão Over/Under não identificado — mantendo pendente`);
    return null;
  }

  // ── Total de Gols Over/Under (inteiro, 1º tempo, 2º tempo) ────────────────
  if (marketKey.includes("goals over") || marketKey.includes("goals under") || marketKey === "goals over/under") {
    // Determinar período correto
    let goalsToCheck: number;
    if (marketKey.includes("first half")) {
      if (htHomeGoals === null || htAwayGoals === null) { console.log(`    Gols 1ºT: dados HT indisponíveis`); return null; }
      goalsToCheck = htHomeGoals + htAwayGoals;
    } else if (marketKey.includes("second half")) {
      if (htHomeGoals === null || htAwayGoals === null) { console.log(`    Gols 2ºT: dados HT indisponíveis`); return null; }
      goalsToCheck = (homeGoals - htHomeGoals) + (awayGoals - htAwayGoals);
    } else {
      goalsToCheck = totalGoals;
    }
    console.log(`    Gols Over/Under: período="${marketKey}", gols=${goalsToCheck}`);
    // API-Football usa "Sim" = Over 2.5 e "Não" = Under 2.5
    if (outcome.includes("sim")) return goalsToCheck > 2.5;
    if (outcome.includes("não") || outcome.includes("nao")) return goalsToCheck <= 2.5;
    // Formato explícito "Over X" / "Under X"
    const overMatch  = outcome.match(/over\s*([\d.]+)/i);
    const underMatch = outcome.match(/under\s*([\d.]+)/i);
    if (overMatch)  { const l = parseFloat(overMatch[1]);  return goalsToCheck > l; }
    if (underMatch) { const l = parseFloat(underMatch[1]); return goalsToCheck < l; }
    return false;
  }

  // ── Resultado + Ambas Marcam (mercado combinado) ─────────────────────────
  if (marketKey === "results/both teams score") {
    // outcome: "Results/Both Teams Score-Home/Yes" → strip prefix → "home/yes"
    const raw = outcome.replace(/^results\/both teams score-?/i, "").trim();
    const slash = raw.lastIndexOf("/");
    if (slash === -1) { console.log(`    Resultado+BTTS: slash não encontrado em "${raw}"`); return false; }
    const resultPick = raw.slice(0, slash).toLowerCase().trim();
    const bttsPick   = raw.slice(slash + 1).toLowerCase().trim();
    const btts = homeGoals > 0 && awayGoals > 0;
    const bttsWon = bttsPick.includes("yes") || bttsPick.includes("sim") ? btts : !btts;
    let resultWon: boolean;
    if (resultPick === "home" || resultPick === "casa") resultWon = homeGoals > awayGoals;
    else if (resultPick === "away" || resultPick === "fora") resultWon = awayGoals > homeGoals;
    else resultWon = homeGoals === awayGoals; // draw/empate
    console.log(`    Resultado+BTTS: pick="${resultPick}/${bttsPick}", placar=${homeGoals}-${awayGoals}, btts=${btts}, resultWon=${resultWon}, bttsWon=${bttsWon}`);
    return resultWon && bttsWon;
  }

  // ── Ambas Marcam (BTTS, 1º tempo, 2º tempo) ──────────────────────────────
  if (marketKey.includes("both teams score") || marketKey.includes("both teams to score") || marketKey.includes("btts")) {
    let hG: number, aG: number;
    if (marketKey.includes("first half")) {
      if (htHomeGoals === null || htAwayGoals === null) { console.log(`    BTTS 1ºT: dados HT indisponíveis`); return null; }
      hG = htHomeGoals; aG = htAwayGoals;
    } else if (marketKey.includes("second half")) {
      if (htHomeGoals === null || htAwayGoals === null) { console.log(`    BTTS 2ºT: dados HT indisponíveis`); return null; }
      hG = homeGoals - htHomeGoals; aG = awayGoals - htAwayGoals;
    } else {
      hG = homeGoals; aG = awayGoals;
    }
    console.log(`    BTTS: período="${marketKey}", gols ${hG}-${aG}`);
    if (outcome.includes("yes") || outcome.includes("sim")) return hG > 0 && aG > 0;
    if (outcome.includes("no")  || outcome.includes("não") || outcome.includes("nao")) return hG === 0 || aG === 0;
    return false;
  }

  // ── Placar Exato ─────────────────────────────────────────────────────────
  if (marketKey.includes("exact score") || marketKey.includes("correct score")) {
    const m = outcome.match(/(\d+)\s*[:\-]\s*(\d+)/);
    if (m) {
      const ok = parseInt(m[1]) === homeGoals && parseInt(m[2]) === awayGoals;
      console.log(`    Placar exato: ${m[1]}-${m[2]} vs ${homeGoals}-${awayGoals} = ${ok}`);
      return ok;
    }
    return false;
  }

  // ── Cartão Vermelho (jogo inteiro ou 1º tempo) ────────────────────────────
  if (marketKey.includes("red card")) {
    const is1H = marketKey.includes("1st half") || marketKey.includes("first half");
    const rcValue = is1H ? hasRedCard1H : hasRedCard;
    if (rcValue === null) {
      console.log(`    Red Card${is1H ? " 1ºT" : ""}: dados de eventos não disponíveis`);
      return null;
    }
    const pickedSim = outcome.includes("sim") || outcome.includes("yes");
    const pickedNao = outcome.includes("não") || outcome.includes("nao") || outcome.includes("no");
    if (pickedSim) { console.log(`    Red Card${is1H ? " 1ºT" : ""}: apostou Sim, houve cartão: ${rcValue}`); return rcValue; }
    if (pickedNao) { console.log(`    Red Card${is1H ? " 1ºT" : ""}: apostou Não, houve cartão: ${rcValue}`); return !rcValue; }
    return false;
  }

  // ── Primeira Equipe a Marcar ──────────────────────────────────────────────
  if (marketKey.includes("team to score first") || marketKey.includes("score first")) {
    if (firstScorerTeam === null) {
      // null = falha ao buscar eventos → mantém pendente
      console.log(`    Team To Score First: dados de eventos não disponíveis`);
      return null;
    }
    const ocLc = selection.outcome.toLowerCase().trim();
    const pickedNoGoal = ocLc.includes("no goal") || ocLc.includes("sem gol") || ocLc.includes("nenhum");
    const pickedHome = ocLc === "home" || ocLc === "casa" || ocLc.endsWith("-home") || ocLc.endsWith(" home") || teamsMatch(selection.outcome, homeTeamName) || teamsMatch(selection.outcome, selection.homeTeam);
    const pickedAway = ocLc === "away" || ocLc === "fora" || ocLc === "visitante" || ocLc.endsWith("-away") || ocLc.endsWith(" away") || teamsMatch(selection.outcome, awayTeamName) || teamsMatch(selection.outcome, selection.awayTeam);
    if (firstScorerTeam === "") {
      // 0x0 — sem gols: todos perdem
      console.log(`    1st scorer: jogo sem gols (0x0) → perdido`);
      return false;
    }
    const scoredHome = teamsMatch(firstScorerTeam, homeTeamName);
    const scoredAway = teamsMatch(firstScorerTeam, awayTeamName);
    if (pickedNoGoal) { console.log(`    1st scorer: apostou sem gol mas houve gol → perdido`); return false; }
    if (pickedHome) { console.log(`    1st scorer: apostou casa, marcou ${firstScorerTeam}: ${scoredHome}`); return scoredHome; }
    if (pickedAway) { console.log(`    1st scorer: apostou visitante, marcou ${firstScorerTeam}: ${scoredAway}`); return scoredAway; }
    console.log(`    1st scorer: não identificou time no outcome "${selection.outcome}"`);
    return false;
  }

  // ── Vencedor do 1º Tempo ─────────────────────────────────────────────────
  if (marketKey === "first half winner") {
    if (htHomeGoals === null || htAwayGoals === null) { console.log(`    First Half Winner: dados HT indisponíveis`); return null; }
    const oc2 = outcome.trim();
    if (oc2.includes("draw") || oc2.includes("empate") || oc2 === "x") { const r = htHomeGoals === htAwayGoals; console.log(`    FHW: apostou Empate, HT=${htHomeGoals}-${htAwayGoals} → ${r}`); return r; }
    if (oc2.includes("home") || oc2.includes("casa")) { const r = htHomeGoals > htAwayGoals; console.log(`    FHW: apostou Casa, HT=${htHomeGoals}-${htAwayGoals} → ${r}`); return r; }
    if (oc2.includes("away") || oc2.includes("fora") || oc2.includes("visitante")) { const r = htAwayGoals > htHomeGoals; console.log(`    FHW: apostou Fora, HT=${htHomeGoals}-${htAwayGoals} → ${r}`); return r; }
    console.log(`    FHW: outcome não reconhecido "${outcome}"`); return false;
  }

  // ── Total de Gols de um Time (Total - Home / Total - Away) ────────────────
  if (marketKey === "total - home" || marketKey === "total - away") {
    const teamGoals = marketKey === "total - home" ? homeGoals : awayGoals;
    const overM  = outcome.match(/over\s*(\d+\.?\d*)/i);
    const underM = outcome.match(/under\s*(\d+\.?\d*)/i);
    if (overM)  { const r = teamGoals > parseFloat(overM[1]);  console.log(`    ${marketKey}: Over ${overM[1]}, gols=${teamGoals} → ${r}`); return r; }
    if (underM) { const r = teamGoals < parseFloat(underM[1]); console.log(`    ${marketKey}: Under ${underM[1]}, gols=${teamGoals} → ${r}`); return r; }
    console.log(`    ${marketKey}: outcome não reconhecido "${outcome}"`); return false;
  }

  // ── Mercados de Cartões (Cards Over/Under, Cards - Home, Cards - Away) ────
  if (marketKey.includes("cards") && !marketKey.includes("red card")) {
    if (homeCards === null || awayCards === null) { console.log(`    Cards: dados de cartões indisponíveis`); return null; }
    let cardTotal: number;
    if (marketKey === "cards - home" || marketKey === "home team total cards") cardTotal = homeCards;
    else if (marketKey === "cards - away" || marketKey === "away team total cards") cardTotal = awayCards;
    else cardTotal = homeCards + awayCards; // cards over/under
    const overM  = outcome.match(/over\s*(\d+\.?\d*)/i);
    const underM = outcome.match(/under\s*(\d+\.?\d*)/i);
    if (overM)  { const r = cardTotal > parseFloat(overM[1]);  console.log(`    Cards Over ${overM[1]}: total=${cardTotal} → ${r}`); return r; }
    if (underM) { const r = cardTotal < parseFloat(underM[1]); console.log(`    Cards Under ${underM[1]}: total=${cardTotal} → ${r}`); return r; }
    console.log(`    Cards: outcome não reconhecido "${outcome}"`); return false;
  }

  // ── Mercados Ao Vivo (live_m*) ───────────────────────────────────────────
  // marketKey salvo como "live_m1", "live_m5" etc. — outcomes são valores brutos
  // da API-Football: "Home", "Draw", "Away", "Over 1.5", "Under 2.5", "Yes", "No",
  // "Home/Draw", "Goals/Over 0.5", "Corners 3-Way/Over 9.5", "Cards/Over 4.5" etc.
  if (marketKey.startsWith("live_m")) {
    const liveId = parseInt(marketKey.slice(6), 10);
    const isHomeOc = outcome === "home";
    const isAwayOc = outcome === "away";
    const isDrawOc = outcome === "draw" || outcome === "x";
    const overM  = outcome.match(/over\s*([\d.]+)/i);
    const underM = outcome.match(/under\s*([\d.]+)/i);

    // live_m1: Resultado Final (1X2)
    if (liveId === 1) {
      if (isDrawOc) return homeGoals === awayGoals;
      if (isHomeOc) return homeGoals > awayGoals;
      if (isAwayOc) return awayGoals > homeGoals;
      console.log(`    Live m1: outcome não reconhecido "${selection.outcome}"`); return false;
    }

    // live_m5 / live_m25: Gols Over/Under (tempo inteiro)
    if (liveId === 5 || liveId === 25) {
      if (overM)  return totalGoals > parseFloat(overM[1]);
      if (underM) return totalGoals < parseFloat(underM[1]);
      console.log(`    Live m${liveId}: outcome não reconhecido "${selection.outcome}"`); return false;
    }

    // live_m8: Ambas Marcam (Yes/No)
    if (liveId === 8) {
      const btts = homeGoals > 0 && awayGoals > 0;
      if (outcome.includes("yes") || outcome.includes("sim")) return btts;
      if (outcome.includes("no")  || outcome.includes("não") || outcome.includes("nao")) return !btts;
      console.log(`    Live m8: outcome não reconhecido "${selection.outcome}"`); return false;
    }

    // live_m13: Vencedor 1º Tempo
    if (liveId === 13) {
      if (htHomeGoals === null || htAwayGoals === null) { console.log(`    Live m13: dados HT indisponíveis`); return null; }
      if (isDrawOc) return htHomeGoals === htAwayGoals;
      if (isHomeOc) return htHomeGoals > htAwayGoals;
      if (isAwayOc) return htAwayGoals > htHomeGoals;
      console.log(`    Live m13: outcome não reconhecido "${selection.outcome}"`); return false;
    }

    // live_m3: Vencedor 2º Tempo
    if (liveId === 3) {
      if (htHomeGoals === null || htAwayGoals === null) { console.log(`    Live m3: dados HT indisponíveis`); return null; }
      const h2 = homeGoals - htHomeGoals;
      const a2 = awayGoals - htAwayGoals;
      if (isDrawOc) return h2 === a2;
      if (isHomeOc) return h2 > a2;
      if (isAwayOc) return a2 > h2;
      console.log(`    Live m3: outcome não reconhecido "${selection.outcome}"`); return false;
    }

    // live_m6: Over/Under 1º Tempo (gols)
    if (liveId === 6) {
      if (htHomeGoals === null || htAwayGoals === null) { console.log(`    Live m6: dados HT indisponíveis`); return null; }
      const htTotal = htHomeGoals + htAwayGoals;
      if (overM)  return htTotal > parseFloat(overM[1]);
      if (underM) return htTotal < parseFloat(underM[1]);
      console.log(`    Live m6: outcome não reconhecido "${selection.outcome}"`); return false;
    }

    // live_m12: Dupla Chance (Home/Draw, Home/Away, Draw/Away)
    if (liveId === 12) {
      if ((outcome.includes("home") && outcome.includes("draw")) || outcome === "1x") return homeGoals >= awayGoals;
      if ((outcome.includes("home") && outcome.includes("away")) || outcome === "12") return homeGoals !== awayGoals;
      if ((outcome.includes("draw") && outcome.includes("away")) || outcome === "x2") return awayGoals >= homeGoals;
      console.log(`    Live m12: outcome não reconhecido "${selection.outcome}"`); return false;
    }

    // live_m20: Escanteios Over/Under
    if (liveId === 20) {
      if (totalCorners === null) { console.log(`    Live m20: dados de escanteios indisponíveis`); return null; }
      if (overM)  return totalCorners > parseFloat(overM[1]);
      if (underM) return totalCorners < parseFloat(underM[1]);
      console.log(`    Live m20: outcome não reconhecido "${selection.outcome}"`); return false;
    }

    // live_m119: Total Cartões Over/Under
    if (liveId === 119) {
      if (homeCards === null || awayCards === null) { console.log(`    Live m119: dados de cartões indisponíveis`); return null; }
      const totalCards = homeCards + awayCards;
      if (overM)  return totalCards > parseFloat(overM[1]);
      if (underM) return totalCards < parseFloat(underM[1]);
      console.log(`    Live m119: outcome não reconhecido "${selection.outcome}"`); return false;
    }

    // live_m65: Próximos 10 min — não resolvível automaticamente, admin resolve manualmente
    if (liveId === 65) {
      console.log(`    Live m65 (Próximos 10min): aguarda resolução manual`);
      return null;
    }

    // outros live markets não mapeados → deixa pendente para resolução manual
    console.log(`    Live market id=${liveId} não mapeado, aguarda resolução manual`);
    return null;
  }

  // ── Dupla Chance ─────────────────────────────────────────────────────────
  if (marketKey === "double_chance") {
    const ocTrim = outcome.replace(/^double_chance[-:\s]*/i, "").trim();
    if (ocTrim === "1x") { const r = homeGoals >= awayGoals; console.log(`    Dupla Chance 1X: ${homeGoals}-${awayGoals} → ${r}`); return r; }
    if (ocTrim === "x2") { const r = awayGoals >= homeGoals; console.log(`    Dupla Chance X2: ${homeGoals}-${awayGoals} → ${r}`); return r; }
    if (ocTrim === "12") { const r = homeGoals !== awayGoals; console.log(`    Dupla Chance 12: ${homeGoals}-${awayGoals} → ${r}`); return r; }
    console.log(`    Dupla Chance: outcome não reconhecido "${outcome}"`); return false;
  }

  // ── Mais/Menos Gols (totals) ──────────────────────────────────────────────
  if (marketKey === "totals") {
    const total = homeGoals + awayGoals;
    const maisMatch  = outcome.match(/^mais\s*([\d.]+)$/i);
    const menosMatch = outcome.match(/^menos\s*([\d.]+)$/i);
    if (maisMatch)  { const r = total > parseFloat(maisMatch[1]);  console.log(`    Totals Mais ${maisMatch[1]}: total=${total} → ${r}`);  return r; }
    if (menosMatch) { const r = total < parseFloat(menosMatch[1]); console.log(`    Totals Menos ${menosMatch[1]}: total=${total} → ${r}`); return r; }
    console.log(`    Totals: outcome não reconhecido "${outcome}"`); return false;
  }

  console.log(`    Mercado não reconhecido: mk="${marketKey}", outcome="${selection.outcome}"`);
  return false;
}

