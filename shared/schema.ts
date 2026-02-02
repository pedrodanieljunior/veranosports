import { z } from "zod";
import { pgTable, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";

export const betSlipsTable = pgTable("bet_slips", {
  id: text("id").primaryKey(),
  selections: jsonb("selections").notNull(),
  stake: real("stake").notNull(),
  totalOdds: real("total_odds").notNull(),
  potentialWin: real("potential_win").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sportSchema = z.object({
  key: z.string(),
  group: z.string(),
  title: z.string(),
  description: z.string(),
  active: z.boolean(),
  hasOutrights: z.boolean().optional(),
});

export type Sport = z.infer<typeof sportSchema>;

export const outcomeSchema = z.object({
  name: z.string(),
  price: z.number(),
  point: z.number().optional(),
});

export type Outcome = z.infer<typeof outcomeSchema>;

export const marketSchema = z.object({
  key: z.string(),
  lastUpdate: z.string().optional(),
  outcomes: z.array(outcomeSchema),
});

export type Market = z.infer<typeof marketSchema>;

export const bookmakerSchema = z.object({
  key: z.string(),
  title: z.string(),
  lastUpdate: z.string().optional(),
  markets: z.array(marketSchema),
});

export type Bookmaker = z.infer<typeof bookmakerSchema>;

export const gameSchema = z.object({
  id: z.string(),
  sportKey: z.string(),
  sportTitle: z.string(),
  commenceTime: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  bookmakers: z.array(bookmakerSchema),
});

export type Game = z.infer<typeof gameSchema>;

export const selectionSchema = z.object({
  id: z.string(),
  gameId: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  commenceTime: z.string(),
  sportTitle: z.string(),
  marketKey: z.string(),
  bookmaker: z.string(),
  outcome: z.string(),
  odds: z.number(),
});

export type Selection = z.infer<typeof selectionSchema>;

export const betSlipSchema = z.object({
  id: z.string(),
  selections: z.array(selectionSchema),
  stake: z.number(),
  totalOdds: z.number(),
  potentialWin: z.number(),
  status: z.enum(["pending", "won", "lost"]).default("pending"),
  createdAt: z.string(),
});

export type BetSlip = z.infer<typeof betSlipSchema>;

export const insertBetSlipSchema = z.object({
  selections: z.array(selectionSchema).min(1, "Selecione pelo menos uma aposta"),
  stake: z.number().min(1, "Valor mínimo de R$1,00"),
});

export type InsertBetSlip = z.infer<typeof insertBetSlipSchema>;
