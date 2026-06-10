import { z } from "zod";
import { pgTable, text, real, timestamp, jsonb, boolean, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

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
  userId: text("user_id"),
  selections: jsonb("selections").notNull(),
  stake: real("stake").notNull(),
  totalOdds: real("total_odds").notNull(),
  potentialWin: real("potential_win").notNull(),
  bonusUsed: real("bonus_used").notNull().default(0),
  status: text("status").notNull().default("pending"),
  verified: boolean("verified").notNull().default(false),
  telegramChatId: text("telegram_chat_id"),
  pixKey: text("pix_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  cashOutValue: real("cash_out_value"),
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
  originalOdds: z.number().optional(),
  result: z.enum(["pending", "won", "lost"]).optional().default("pending"),
});

export type Selection = z.infer<typeof selectionSchema>;

export const betSlipSchema = z.object({
  id: z.string(),
  sessionId: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  selections: z.array(selectionSchema),
  stake: z.number(),
  totalOdds: z.number(),
  potentialWin: z.number(),
  bonusUsed: z.number().default(0),
  status: z.enum(["pending", "won", "lost", "cashed_out"]).default("pending"),
  verified: z.boolean().default(false),
  telegramChatId: z.string().optional().nullable(),
  pixKey: z.string().optional().nullable(),
  createdAt: z.string(),
  cashOutValue: z.number().nullable().optional(),
});

export type BetSlip = z.infer<typeof betSlipSchema>;

export const insertBetSlipSchema = z.object({
  sessionId: z.string().optional(),
  userId: z.string().optional(),
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

export const boostCardsTable = pgTable("boost_cards", {
  id: serial("id").primaryKey(),
  eventName: text("event_name").notNull().default(""),
  matchTitle: text("match_title").notNull().default(""),
  description: text("description").notNull().default(""),
  selections: jsonb("selections").notNull().default([]),
  originalOdds: real("original_odds").notNull().default(0),
  boostedOdds: real("boosted_odds").notNull().default(0),
  outcomes: jsonb("outcomes").default([]),
  outcomeResults: jsonb("outcome_results").default([]),
  subtitle: text("subtitle").notNull().default(""),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  active: boolean("active").notNull().default(true),
  result: text("result").default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const boostOutcomeSchema = z.object({
  label: z.string(),
  originalOdds: z.number(),
  boostedOdds: z.number(),
});

export const boostCardSchema = z.object({
  id: z.number(),
  eventName: z.string(),
  matchTitle: z.string(),
  description: z.string(),
  selections: z.array(z.object({ description: z.string() })),
  originalOdds: z.number(),
  boostedOdds: z.number(),
  outcomes: z.array(boostOutcomeSchema).default([]),
  outcomeResults: z.array(z.enum(["pending", "won", "lost"])).default([]),
  subtitle: z.string().default(""),
  startsAt: z.string(),
  endsAt: z.string(),
  active: z.boolean(),
  result: z.enum(["pending", "won", "lost"]).default("pending"),
  createdAt: z.string(),
});

export type BoostCard = z.infer<typeof boostCardSchema>;
export type BoostOutcome = z.infer<typeof boostOutcomeSchema>;

export const insertBoostCardSchema = z.object({
  eventName: z.string().min(1, "Nome do evento obrigatório"),
  matchTitle: z.string().min(1, "Título do confronto obrigatório"),
  description: z.string().optional().default(""),
  selections: z.array(z.object({ description: z.string() })).max(3).optional().default([]),
  originalOdds: z.number().min(1, "Odd mínima é 1.00"),
  boostedOdds: z.number().min(1, "Odd mínima é 1.00"),
  outcomes: z.array(boostOutcomeSchema).optional().default([]),
  subtitle: z.string().optional().default(""),
  startsAt: z.string(),
  endsAt: z.string(),
  active: z.boolean().optional().default(true),
});

export type InsertBoostCard = z.infer<typeof insertBoostCardSchema>;

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersTable = pgTable("users", {
  cpf: text("cpf").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  referralCode: text("referral_code"),
  referredByCode: text("referred_by_code"),
  passwordHash: text("password_hash").notNull(),
  balance: real("balance").notNull().default(0),
  bonusBalance: real("bonus_balance").notNull().default(0),
  firstDepositDone: boolean("first_deposit_done").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userSchema = z.object({
  cpf: z.string(),
  name: z.string(),
  phone: z.string(),
  referralCode: z.string().nullable().optional(),
  referredByCode: z.string().nullable().optional(),
  balance: z.number(),
  bonusBalance: z.number(),
  firstDepositDone: z.boolean(),
  createdAt: z.string(),
});

export type User = z.infer<typeof userSchema>;

export const insertUserSchema = z.object({
  cpf: z.string().min(11).max(14),
  name: z.string().min(2),
  phone: z.string().min(10),
  referralCode: z.string().optional(),
  password: z.string().min(6),
});

export type InsertUser = z.infer<typeof insertUserSchema>;

// ─── Deposits ─────────────────────────────────────────────────────────────────
export const depositsTable = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.cpf),
  amount: real("amount").notNull(),
  bonusAmount: real("bonus_amount").notNull().default(0),
  status: text("status").notNull().default("pending"),
  pixReceipt: text("pix_receipt"),
  mpPaymentId: text("mp_payment_id"),
  pixCopyPaste: text("pix_copy_paste"),
  pixQrCode: text("pix_qr_code"),
  pixExpiresAt: timestamp("pix_expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const depositSchema = z.object({
  id: z.number(),
  userId: z.string(),
  amount: z.number(),
  bonusAmount: z.number(),
  status: z.string(),
  pixReceipt: z.string().nullable().optional(),
  mpPaymentId: z.string().nullable().optional(),
  pixCopyPaste: z.string().nullable().optional(),
  pixQrCode: z.string().nullable().optional(),
  pixExpiresAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type Deposit = z.infer<typeof depositSchema>;

// ─── Transactions ─────────────────────────────────────────────────────────────
export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.cpf),
  type: text("type").notNull(), // "deposit" | "bet" | "win" | "withdrawal" | "withdrawal_refund"
  amount: real("amount").notNull(), // positive = credit, negative = debit
  balanceAfter: real("balance_after").notNull(),
  description: text("description").notNull().default(""),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transactionSchema = z.object({
  id: z.number(),
  userId: z.string(),
  type: z.string(),
  amount: z.number(),
  balanceAfter: z.number(),
  description: z.string(),
  referenceId: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type Transaction = z.infer<typeof transactionSchema>;

// ─── User Withdrawals ─────────────────────────────────────────────────────────
export const userWithdrawalsTable = pgTable("user_withdrawals", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.cpf),
  amount: real("amount").notNull(),
  pixKey: text("pix_key").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  paidAt: timestamp("paid_at"),
});

export const userWithdrawalSchema = z.object({
  id: z.number(),
  userId: z.string(),
  amount: z.number(),
  pixKey: z.string(),
  status: z.string(),
  createdAt: z.string(),
  paidAt: z.string().nullable().optional(),
  userPhone: z.string().nullable().optional(),
});

export type UserWithdrawal = z.infer<typeof userWithdrawalSchema>;

export const insertUserWithdrawalSchema = z.object({
  amount: z.number().min(20, "Valor mínimo para saque é R$20,00"),
  pixKey: z.string().min(5, "Chave PIX inválida"),
});

// ─── Defesas ──────────────────────────────────────────────────────────────────
export const defensasTable = pgTable("defensas", {
  id: serial("id").primaryKey(),
  game: text("game").notNull(),
  markets: text("markets").notNull(),
  value: real("value").notNull(),
  odds: real("odds").notNull(),
  potentialReturn: real("potential_return").notNull(),
  referencedTicket: text("referenced_ticket"),
  additionalInfo: text("additional_info"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const defensaSchema = z.object({
  id: z.number(),
  game: z.string(),
  markets: z.string(),
  value: z.number(),
  odds: z.number(),
  potentialReturn: z.number(),
  referencedTicket: z.string().nullable().optional(),
  additionalInfo: z.string().nullable().optional(),
  status: z.enum(["pending", "won", "lost"]),
  createdAt: z.string(),
});

export type Defesa = z.infer<typeof defensaSchema>;

export const insertDefesaSchema = z.object({
  game: z.string().min(1, "Jogo obrigatório"),
  markets: z.string().min(1, "Mercados obrigatórios"),
  value: z.number().positive("Valor deve ser positivo"),
  odds: z.number().min(1.01, "Odd mínima é 1.01"),
  potentialReturn: z.number().positive(),
  referencedTicket: z.string().optional().default(""),
  additionalInfo: z.string().optional().default(""),
});

export type InsertDefesa = z.infer<typeof insertDefesaSchema>;

// ─── Clube FW – Weekly Reward Claims ─────────────────────────────────────────
export const clubFwClaimsTable = pgTable("club_fw_claims", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  weekStart: text("week_start").notNull(),    // "YYYY-MM-DD" Monday in Brasília
  level: integer("level").notNull(),           // 1 | 2 | 3 | 4
  bonusAmount: real("bonus_amount").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const CLUB_FW_LEVELS = [
  { level: 1, threshold: 100,  bonus: 10  },
  { level: 2, threshold: 250,  bonus: 20  },
  { level: 3, threshold: 600,  bonus: 50  },
  { level: 4, threshold: 1000, bonus: 100 },
] as const;

// ─── Copa do Mundo 2026 – Cards por sub-aba ──────────────────────────────────
export const copaWorldCupCardsTable = pgTable("copa_world_cup_cards", {
  id: serial("id").primaryKey(),
  subTab: text("sub_tab").notNull(), // grupos | qualificatorias | longo | previsoes
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  team1: text("team1").notNull().default(""),
  team2: text("team2").notNull().default(""),
  odds: real("odds"),
  badge: text("badge").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  teamsJson: text("teams_json"), // JSON array [{name, odds}] for grupos sub-tab
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const copaWorldCupCardSchema = z.object({
  id: z.number(),
  subTab: z.enum(["grupos", "qualificatorias", "longo", "previsoes", "especiais"]),
  title: z.string(),
  description: z.string(),
  team1: z.string(),
  team2: z.string(),
  odds: z.number().nullable(),
  badge: z.string(),
  imageUrl: z.string(),
  teamsJson: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
});

export type CopaWorldCupCard = z.infer<typeof copaWorldCupCardSchema>;

export const insertCopaWorldCupCardSchema = z.object({
  subTab: z.enum(["grupos", "qualificatorias", "longo", "previsoes", "especiais"]),
  title: z.string().optional().default(""),
  description: z.string().optional().default(""),
  team1: z.string().optional().default(""),
  team2: z.string().optional().default(""),
  odds: z.number().optional().nullable(),
  badge: z.string().optional().default(""),
  imageUrl: z.string().optional().default(""),
  teamsJson: z.string().optional().nullable(),
  active: z.boolean().optional().default(true),
});

export type InsertCopaWorldCupCard = z.infer<typeof insertCopaWorldCupCardSchema>;

// ─── Bolão da Copa ───────────────────────────────────────────────────────────
export const baloesTable = pgTable("boloes", {
  id: serial("id").primaryKey(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  matchDate: text("match_date").notNull(),
  entryFee: real("entry_fee").notNull().default(10),
  houseCut: real("house_cut").notNull().default(0), // % da casa (0-100)
  status: text("status").notNull().default("open"), // open | closed | finished
  actualHomeScore: integer("actual_home_score"),
  actualAwayScore: integer("actual_away_score"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bolaoEntriesTable = pgTable("bolao_entries", {
  id: serial("id").primaryKey(),
  bolaoId: integer("bolao_id").notNull(),
  userId: text("user_id").notNull(),
  homeScore: integer("home_score").notNull(),
  awayScore: integer("away_score").notNull(),
  prizeAwarded: boolean("prize_awarded").notNull().default(false),
  prizeAmount: real("prize_amount"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Bolao = typeof baloesTable.$inferSelect;
export type BolaoEntry = typeof bolaoEntriesTable.$inferSelect;

export const insertBolaoSchema = createInsertSchema(baloesTable).omit({ id: true, createdAt: true });
export const insertBolaoEntrySchema = createInsertSchema(bolaoEntriesTable).omit({ id: true, createdAt: true, prizeAwarded: true });

export type InsertBolao = z.infer<typeof insertBolaoSchema>;
export type InsertBolaoEntry = z.infer<typeof insertBolaoEntrySchema>;

// ─── Escanteios 1º Tempo (capturados ao vivo no intervalo) ───────────────────
export const fixtureHalftimeStatsTable = pgTable("fixture_halftime_stats", {
  fixtureId: integer("fixture_id").primaryKey(),
  homeCorners: integer("home_corners").notNull(),
  awayCorners: integer("away_corners").notNull(),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
});
