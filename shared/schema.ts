import { z } from "zod";
import { pgTable, text, real, timestamp, jsonb, boolean, serial, integer } from "drizzle-orm/pg-core";

export const bannersTable = pgTable("banners", {
  id: serial("id").primaryKey(),
  slotNumber: integer("slot_number").notNull().unique(),
  filename: text("filename").notNull(),
  url: text("url").notNull(),
  imageData: text("image_data"),
  mimeType: text("mime_type"),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const bannerSchema = z.object({
  id: z.number(),
  slotNumber: z.number(),
  filename: z.string(),
  url: z.string(),
  active: z.boolean(),
  updatedAt: z.string(),
});

export type Banner = z.infer<typeof bannerSchema>;

export const marketSettingsTable = pgTable("market_settings", {
  id: serial("id").primaryKey(),
  marketKey: text("market_key").notNull().unique(),
  marketName: text("market_name").notNull(),
  boostPercent: real("boost_percent").notNull().default(0),
});

export const betSlipsTable = pgTable("bet_slips", {
  id: text("id").primaryKey(),
  sessionId: text("session_id"),
  selections: jsonb("selections").notNull(),
  stake: real("stake").notNull(),
  totalOdds: real("total_odds").notNull(),
  potentialWin: real("potential_win").notNull(),
  status: text("status").notNull().default("pending"),
  verified: boolean("verified").notNull().default(false),
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
  homeLogo: z.string().optional(),
  awayLogo: z.string().optional(),
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
  result: z.enum(["pending", "won", "lost"]).optional().default("pending"),
});

export type Selection = z.infer<typeof selectionSchema>;

export const betSlipSchema = z.object({
  id: z.string(),
  sessionId: z.string().optional().nullable(),
  selections: z.array(selectionSchema),
  stake: z.number(),
  totalOdds: z.number(),
  potentialWin: z.number(),
  status: z.enum(["pending", "won", "lost"]).default("pending"),
  verified: z.boolean().default(false),
  createdAt: z.string(),
});

export type BetSlip = z.infer<typeof betSlipSchema>;

export const insertBetSlipSchema = z.object({
  sessionId: z.string().optional(),
  selections: z.array(selectionSchema).min(1, "Selecione pelo menos uma aposta"),
  stake: z.number().min(1, "Valor mínimo de R$1,00"),
});

export type InsertBetSlip = z.infer<typeof insertBetSlipSchema>;

export const marketSettingSchema = z.object({
  id: z.number(),
  marketKey: z.string(),
  marketName: z.string(),
  boostPercent: z.number(),
});

export type MarketSetting = z.infer<typeof marketSettingSchema>;

export const siteContentTable = pgTable("site_content", {
  key: text("key").primaryKey(),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const withdrawalsTable = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  amount: real("amount").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const withdrawalSchema = z.object({
  id: z.number(),
  amount: z.number(),
  description: z.string(),
  createdAt: z.string(),
});

export type Withdrawal = z.infer<typeof withdrawalSchema>;

export const insertWithdrawalSchema = z.object({
  amount: z.number().positive("Valor deve ser positivo"),
  description: z.string().optional().default(""),
});
