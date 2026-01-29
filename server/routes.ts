import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBetSlipSchema } from "@shared/schema";
import { z } from "zod";

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

const popularLeagues = [
  { id: 39, name: "Premier League", country: "Inglaterra" },
  { id: 140, name: "La Liga", country: "Espanha" },
  { id: 135, name: "Serie A", country: "Itália" },
  { id: 78, name: "Bundesliga", country: "Alemanha" },
  { id: 61, name: "Ligue 1", country: "França" },
  { id: 71, name: "Brasileirão Série A", country: "Brasil" },
  { id: 2, name: "Champions League", country: "Europa" },
  { id: 3, name: "Europa League", country: "Europa" },
  { id: 848, name: "Conference League", country: "Europa" },
  { id: 13, name: "Copa Libertadores", country: "América do Sul" },
  { id: 94, name: "Primeira Liga", country: "Portugal" },
  { id: 88, name: "Eredivisie", country: "Holanda" },
  { id: 144, name: "Jupiler Pro League", country: "Bélgica" },
  { id: 128, name: "Primera División", country: "Argentina" },
  { id: 262, name: "Liga MX", country: "México" },
];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/sports", async (req, res) => {
    try {
      if (!API_FOOTBALL_KEY) {
        return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });
      }
      
      const sports = popularLeagues.map(league => ({
        key: `league_${league.id}`,
        group: "Soccer",
        title: `${league.name} - ${league.country}`,
        description: league.name,
        active: true,
        hasOutrights: false,
      }));
      
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
      const leagueId = sportKey.replace("league_", "");
      
      const currentYear = new Date().getFullYear();
      const season = currentYear;
      
      const fixturesUrl = `${API_FOOTBALL_BASE}/fixtures?league=${leagueId}&season=${season}&next=20`;
      
      const fixturesResponse = await fetch(fixturesUrl, {
        headers: {
          "x-apisports-key": API_FOOTBALL_KEY,
        },
      });
      
      if (!fixturesResponse.ok) {
        const errorText = await fixturesResponse.text();
        console.error("API-Football fixtures error:", errorText);
        return res.status(fixturesResponse.status).json({ error: "Failed to fetch fixtures" });
      }
      
      const fixturesData = await fixturesResponse.json();
      const fixtures = fixturesData.response || [];
      
      if (fixtures.length === 0) {
        return res.json([]);
      }
      
      const fixtureIds = fixtures.map((f: any) => f.fixture.id).join("-");
      const oddsUrl = `${API_FOOTBALL_BASE}/odds?fixture=${fixtureIds.split("-")[0]}&bookmaker=8`;
      
      let oddsMap: Record<string, any> = {};
      
      for (const fixture of fixtures.slice(0, 10)) {
        try {
          const oddsResponse = await fetch(
            `${API_FOOTBALL_BASE}/odds?fixture=${fixture.fixture.id}`,
            {
              headers: {
                "x-apisports-key": API_FOOTBALL_KEY,
              },
            }
          );
          
          if (oddsResponse.ok) {
            const oddsData = await oddsResponse.json();
            if (oddsData.response && oddsData.response.length > 0) {
              oddsMap[fixture.fixture.id] = oddsData.response[0];
            }
          }
        } catch (err) {
          console.error("Error fetching odds for fixture:", fixture.fixture.id);
        }
      }
      
      const games = fixtures.map((fixture: any) => {
        const fixtureOdds = oddsMap[fixture.fixture.id];
        const bookmakers = [];
        
        if (fixtureOdds && fixtureOdds.bookmakers) {
          for (const bookmaker of fixtureOdds.bookmakers.slice(0, 3)) {
            const markets = [];
            
            for (const bet of bookmaker.bets || []) {
              if (bet.name === "Match Winner") {
                markets.push({
                  key: "h2h",
                  lastUpdate: new Date().toISOString(),
                  outcomes: bet.values.map((v: any) => ({
                    name: v.value === "Home" ? fixture.teams.home.name : 
                          v.value === "Away" ? fixture.teams.away.name : "Empate",
                    price: parseFloat(v.odd),
                  })),
                });
              }
              
              if (bet.name === "Goals Over/Under") {
                const totalsOutcomes = bet.values
                  .filter((v: any) => v.value.includes("2.5"))
                  .map((v: any) => ({
                    name: v.value.includes("Over") ? "Mais de 2.5" : "Menos de 2.5",
                    price: parseFloat(v.odd),
                    point: 2.5,
                  }));
                
                if (totalsOutcomes.length > 0) {
                  markets.push({
                    key: "totals",
                    lastUpdate: new Date().toISOString(),
                    outcomes: totalsOutcomes,
                  });
                }
              }
              
              if (bet.name === "Asian Handicap") {
                const spreadOutcomes = bet.values.slice(0, 2).map((v: any) => {
                  const parts = v.value.split(" ");
                  const team = parts[0];
                  const point = parseFloat(parts[1]) || 0;
                  return {
                    name: team === "Home" ? fixture.teams.home.name : fixture.teams.away.name,
                    price: parseFloat(v.odd),
                    point: point,
                  };
                });
                
                if (spreadOutcomes.length > 0) {
                  markets.push({
                    key: "spreads",
                    lastUpdate: new Date().toISOString(),
                    outcomes: spreadOutcomes,
                  });
                }
              }
            }
            
            if (markets.length > 0) {
              bookmakers.push({
                key: bookmaker.name.toLowerCase().replace(/\s+/g, "_"),
                title: bookmaker.name,
                lastUpdate: new Date().toISOString(),
                markets,
              });
            }
          }
        }
        
        if (bookmakers.length === 0) {
          bookmakers.push({
            key: "default",
            title: "Odds",
            lastUpdate: new Date().toISOString(),
            markets: [
              {
                key: "h2h",
                lastUpdate: new Date().toISOString(),
                outcomes: [
                  { name: fixture.teams.home.name, price: 2.0 },
                  { name: "Empate", price: 3.2 },
                  { name: fixture.teams.away.name, price: 3.5 },
                ],
              },
            ],
          });
        }
        
        return {
          id: fixture.fixture.id.toString(),
          sportKey: sportKey,
          sportTitle: fixture.league.name,
          commenceTime: fixture.fixture.date,
          homeTeam: fixture.teams.home.name,
          awayTeam: fixture.teams.away.name,
          bookmakers,
        };
      });
      
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

  return httpServer;
}
