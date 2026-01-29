import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertBetSlipSchema } from "@shared/schema";
import { z } from "zod";
import { popularLeagues, fetchUpcomingEvents, fetchEventOdds } from "./sofascore";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/sports", async (req, res) => {
    try {
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
      const { sportKey } = req.params;
      const leagueId = parseInt(sportKey.replace("league_", ""));
      
      const league = popularLeagues.find(l => l.id === leagueId);
      if (!league) {
        return res.status(404).json({ error: "League not found" });
      }
      
      const events = await fetchUpcomingEvents(leagueId);
      
      if (events.length === 0) {
        return res.json([]);
      }
      
      const gamesWithOdds = await Promise.all(
        events.slice(0, 10).map(async (event) => {
          const odds = await fetchEventOdds(event.id);
          
          const bookmakers = [{
            key: "sofascore",
            title: "SofaScore",
            lastUpdate: new Date().toISOString(),
            markets: [
              {
                key: "h2h",
                lastUpdate: new Date().toISOString(),
                outcomes: [
                  { name: event.homeTeam, price: odds?.home || 2.0 },
                  { name: "Empate", price: odds?.draw || 3.2 },
                  { name: event.awayTeam, price: odds?.away || 3.5 },
                ],
              },
            ],
          }];
          
          return {
            id: event.id.toString(),
            sportKey: sportKey,
            sportTitle: event.leagueName,
            commenceTime: event.startTime,
            homeTeam: event.homeTeam,
            awayTeam: event.awayTeam,
            bookmakers,
          };
        })
      );
      
      res.json(gamesWithOdds);
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
