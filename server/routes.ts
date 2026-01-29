import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBetSlipSchema } from "@shared/schema";
import { z } from "zod";
import { cache } from "./cache";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const CACHE_TTL_SPORTS = 60 * 60 * 1000; // 1 hora
const CACHE_TTL_ODDS = 10 * 60 * 1000; // 10 minutos

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

  return httpServer;
}
