import { type BetSlip, type InsertBetSlip, type MarketSetting, type Banner, type Withdrawal, type BoostCard, type InsertBoostCard, type User, type Deposit, type UserWithdrawal, betSlipsTable, marketSettingsTable, bannersTable, siteContentTable, withdrawalsTable, boostCardsTable, usersTable, depositsTable, userWithdrawalsTable } from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, lte, and, sql } from "drizzle-orm";
import { randomUUID, scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [hashed, salt] = hash.split(".");
  if (!hashed || !salt) return false;
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  const hashedBuf = Buffer.from(hashed, "hex");
  return timingSafeEqual(buf, hashedBuf);
}

export interface GameSimpleBetTotal {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  sportTitle: string;
  commenceTime: string | null;
  total: number;
  count: number;
  isBlocked: boolean;
}

export interface IStorage {
  createBetSlip(data: InsertBetSlip): Promise<BetSlip>;
  getBetSlip(id: string): Promise<BetSlip | undefined>;
  getAllBetSlips(): Promise<BetSlip[]>;
  getRecentBetSlips(hours: number): Promise<BetSlip[]>;
  getBetSlipsBySession(sessionId: string): Promise<BetSlip[]>;
  getBetSlipsByUser(userId: string): Promise<BetSlip[]>;
  deleteBetSlip(id: string): Promise<boolean>;
  deleteAllBetSlips(): Promise<void>;
  updateBetSlipStatus(id: string, status: "pending" | "won" | "lost"): Promise<BetSlip | undefined>;
  updateSelectionResult(betId: string, selectionId: string, result: "pending" | "won" | "lost"): Promise<BetSlip | undefined>;
  updateBetSlipVerified(id: string, verified: boolean): Promise<BetSlip | undefined>;
  updateBetSlipTelegramChatId(id: string, telegramChatId: string): Promise<BetSlip | undefined>;
  updateBetSlipPixKey(id: string, pixKey: string): Promise<BetSlip | undefined>;
  getDailyBetSlips(): Promise<BetSlip[]>;
  getDailyTotalPotentialWin(): Promise<number>;
  getGameSimpleBetTotals(): Promise<GameSimpleBetTotal[]>;
  getBlockedGameIds(): Promise<Set<string>>;
  getMarketSettings(): Promise<MarketSetting[]>;
  updateMarketSettings(updates: { marketKey: string; boostPercent: number }[]): Promise<MarketSetting[]>;
  seedMarketSettings(): Promise<void>;
  getBanners(): Promise<Banner[]>;
  getBannersRaw(): Promise<any[]>;
  upsertBanner(slotNumber: number, filename: string, url: string, imageData?: string, mimeType?: string): Promise<Banner>;
  deleteBanner(slotNumber: number): Promise<boolean>;
  getRules(): Promise<string>;
  saveRules(content: string): Promise<void>;
  getWithdrawals(): Promise<Withdrawal[]>;
  createWithdrawal(amount: number, description: string): Promise<Withdrawal>;
  deleteWithdrawal(id: number): Promise<boolean>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  getBoostCards(): Promise<BoostCard[]>;
  getActiveBoostCards(): Promise<BoostCard[]>;
  createBoostCard(data: InsertBoostCard): Promise<BoostCard>;
  updateBoostCard(id: number, data: Partial<InsertBoostCard>): Promise<BoostCard | undefined>;
  resolveBoostCard(id: number, result: "pending" | "won" | "lost", outcomeIdx?: number): Promise<{ card: BoostCard; affectedBets: number }>;
  deleteBoostCard(id: number): Promise<boolean>;
  // Users
  createUser(data: { cpf: string; name: string; phone: string; referralCode?: string; passwordHash: string }): Promise<User>;
  getUserByCpf(cpf: string): Promise<(User & { passwordHash: string }) | undefined>;
  getAllUsers(): Promise<User[]>;
  updateUserBalance(cpf: string, newBalance: number): Promise<User | undefined>;
  updateUserPassword(cpf: string, passwordHash: string): Promise<boolean>;
  updateUserData(cpf: string, data: { name?: string; phone?: string }): Promise<User | undefined>;
  deleteUser(cpf: string): Promise<boolean>;
  markFirstDeposit(cpf: string): Promise<void>;
  getBetSlipsByUser(userId: string): Promise<BetSlip[]>;
  // Deposits
  createDeposit(userId: string, amount: number, bonusAmount: number): Promise<Deposit>;
  getDepositsByUser(userId: string): Promise<Deposit[]>;
  getAllDeposits(): Promise<Deposit[]>;
  updateDepositStatus(id: number, status: string): Promise<Deposit | undefined>;
  deleteDeposit(id: number): Promise<boolean>;
  // User Withdrawals
  createUserWithdrawal(userId: string, amount: number, pixKey: string): Promise<UserWithdrawal>;
  getUserWithdrawalsByUser(userId: string): Promise<UserWithdrawal[]>;
  getAllUserWithdrawals(): Promise<UserWithdrawal[]>;
  updateUserWithdrawalStatus(id: number, status: string): Promise<UserWithdrawal | undefined>;
  markUserWithdrawalAsPaid(id: number): Promise<UserWithdrawal | undefined>;
}

export class DatabaseStorage implements IStorage {
  private mapBetSlip(result: any): BetSlip {
    return {
      id: result.id,
      sessionId: result.sessionId,
      userId: result.userId,
      telegramChatId: result.telegramChatId,
      pixKey: result.pixKey,
      selections: result.selections as BetSlip["selections"],
      stake: result.stake,
      totalOdds: result.totalOdds,
      potentialWin: result.potentialWin,
      status: result.status as "pending" | "won" | "lost",
      verified: result.verified,
      createdAt: result.createdAt.toISOString(),
    };
  }

  async createBetSlip(data: InsertBetSlip): Promise<BetSlip> {
    const id = randomUUID();
    const totalOdds = data.selections.reduce((acc, sel) => acc * sel.odds, 1);
    const potentialWin = data.stake * totalOdds;
    
    const [result] = await db.insert(betSlipsTable).values({
      id,
      sessionId: data.sessionId ?? null,
      userId: data.userId ?? null,
      selections: data.selections,
      stake: data.stake,
      totalOdds,
      potentialWin,
      status: "pending",
    }).returning();
    
    return this.mapBetSlip(result);
  }

  async getBetSlip(id: string): Promise<BetSlip | undefined> {
    const [result] = await db.select().from(betSlipsTable).where(eq(betSlipsTable.id, id));
    if (!result) return undefined;
    
    return this.mapBetSlip(result);
  }

  async getAllBetSlips(): Promise<BetSlip[]> {
    const results = await db.select().from(betSlipsTable).orderBy(desc(betSlipsTable.createdAt));
    return results.map(r => this.mapBetSlip(r));
  }

  async getRecentBetSlips(hours: number): Promise<BetSlip[]> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const results = await db.select().from(betSlipsTable).orderBy(desc(betSlipsTable.createdAt));
    return results.filter(r => new Date(r.createdAt) >= cutoffTime).map(r => this.mapBetSlip(r));
  }

  async getBetSlipsBySession(sessionId: string): Promise<BetSlip[]> {
    const results = await db.select().from(betSlipsTable)
      .where(eq(betSlipsTable.sessionId, sessionId))
      .orderBy(desc(betSlipsTable.createdAt));
    return results.map(r => this.mapBetSlip(r));
  }

  async getBetSlipsByUser(userId: string): Promise<BetSlip[]> {
    const results = await db.select().from(betSlipsTable)
      .where(eq(betSlipsTable.userId, userId))
      .orderBy(desc(betSlipsTable.createdAt));
    return results.map(r => this.mapBetSlip(r));
  }

  async deleteBetSlip(id: string): Promise<boolean> {
    const result = await db.delete(betSlipsTable).where(eq(betSlipsTable.id, id)).returning();
    return result.length > 0;
  }

  async deleteAllBetSlips(): Promise<void> {
    await db.delete(betSlipsTable);
  }

  async updateBetSlipStatus(id: string, status: "pending" | "won" | "lost"): Promise<BetSlip | undefined> {
    const [result] = await db.update(betSlipsTable)
      .set({ status })
      .where(eq(betSlipsTable.id, id))
      .returning();
    
    if (!result) return undefined;
    return this.mapBetSlip(result);
  }

  async updateSelectionResult(betId: string, selectionId: string, result: "pending" | "won" | "lost"): Promise<BetSlip | undefined> {
    const bet = await this.getBetSlip(betId);
    if (!bet) return undefined;

    const updatedSelections = bet.selections.map(sel => {
      if (sel.id === selectionId) {
        return { ...sel, result };
      }
      return sel;
    });

    // Calcular status do bilhete baseado nas seleções
    const allResolved = updatedSelections.every(sel => sel.result !== "pending");
    const anyLost = updatedSelections.some(sel => sel.result === "lost");
    
    let betStatus: "pending" | "won" | "lost" = "pending";
    if (allResolved) {
      betStatus = anyLost ? "lost" : "won";
    }

    const [updated] = await db.update(betSlipsTable)
      .set({ 
        selections: updatedSelections,
        status: betStatus
      })
      .where(eq(betSlipsTable.id, betId))
      .returning();

    if (!updated) return undefined;
    return this.mapBetSlip(updated);
  }

  async updateBetSlipVerified(id: string, verified: boolean): Promise<BetSlip | undefined> {
    const [result] = await db.update(betSlipsTable)
      .set({ verified })
      .where(eq(betSlipsTable.id, id))
      .returning();
    
    if (!result) return undefined;
    return this.mapBetSlip(result);
  }

  async updateBetSlipTelegramChatId(id: string, telegramChatId: string): Promise<BetSlip | undefined> {
    const [result] = await db.update(betSlipsTable)
      .set({ telegramChatId })
      .where(eq(betSlipsTable.id, id))
      .returning();
    
    if (!result) return undefined;
    return this.mapBetSlip(result);
  }

  async updateBetSlipPixKey(id: string, pixKey: string): Promise<BetSlip | undefined> {
    const [result] = await db.update(betSlipsTable)
      .set({ pixKey })
      .where(eq(betSlipsTable.id, id))
      .returning();

    if (!result) return undefined;
    return this.mapBetSlip(result);
  }

  async getDailyBetSlips(): Promise<BetSlip[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const results = await db.select().from(betSlipsTable)
      .where(gte(betSlipsTable.createdAt, todayStart))
      .orderBy(desc(betSlipsTable.createdAt));
    
    return results.map(r => this.mapBetSlip(r));
  }

  async getDailyTotalPotentialWin(): Promise<number> {
    const [result] = await db.select({
      total: sql<number>`COALESCE(SUM(${betSlipsTable.potentialWin}), 0)`
    }).from(betSlipsTable)
      .where(eq(betSlipsTable.status, "pending"));
    
    return Number(result?.total ?? 0);
  }

  async getGameSimpleBetTotals(): Promise<GameSimpleBetTotal[]> {
    const SIMPLE_BET_GAME_LIMIT = 15000;
    const allBets = await db.select().from(betSlipsTable);

    const totals: Record<string, GameSimpleBetTotal> = {};

    for (const bet of allBets) {
      const selections = bet.selections as BetSlip["selections"];
      if (selections.length !== 1) continue;

      const sel = selections[0];
      const gameId = sel.gameId;

      if (!totals[gameId]) {
        totals[gameId] = {
          gameId,
          homeTeam: sel.homeTeam,
          awayTeam: sel.awayTeam,
          sportTitle: sel.sportTitle,
          commenceTime: sel.commenceTime ?? null,
          total: 0,
          count: 0,
          isBlocked: false,
        };
      }

      totals[gameId].total += bet.potentialWin;
      totals[gameId].count += 1;
    }

    const DISPLAY_BLOCK_THRESHOLD = 14000;
    const now = new Date();
    return Object.values(totals)
      .filter(t => {
        if (!t.commenceTime) return true;
        return new Date(t.commenceTime) > now;
      })
      .map(t => ({
        ...t,
        isBlocked: t.total >= DISPLAY_BLOCK_THRESHOLD,
      })).sort((a, b) => b.total - a.total);
  }

  async getBlockedGameIds(): Promise<Set<string>> {
    const totals = await this.getGameSimpleBetTotals();
    return new Set(totals.filter(t => t.isBlocked).map(t => t.gameId));
  }

  async seedMarketSettings(): Promise<void> {
    const existing = await db.select().from(marketSettingsTable);
    if (existing.length > 0) return;

    const defaults = [
      { marketKey: "h2h", marketName: "Resultado Final (1X2)", boostPercent: 15 },
      { marketKey: "totals", marketName: "Total de Gols", boostPercent: 0 },
      { marketKey: "ht_ft", marketName: "Intervalo/Final", boostPercent: 0 },
      { marketKey: "btts", marketName: "Ambas Marcam", boostPercent: 0 },
      { marketKey: "corners", marketName: "Total de Escanteios", boostPercent: 0 },
      { marketKey: "first_to_score", marketName: "Primeira Equipe a Marcar", boostPercent: 0 },
      { marketKey: "red_card", marketName: "Cartão Vermelho no Jogo", boostPercent: 0 },
      { marketKey: "exact_score", marketName: "Placar Exato", boostPercent: 0 },
    ];

    for (const d of defaults) {
      await db.insert(marketSettingsTable).values(d);
    }
    console.log("Market settings seeded with 8 default markets");
  }

  async getMarketSettings(): Promise<MarketSetting[]> {
    const results = await db.select().from(marketSettingsTable).orderBy(marketSettingsTable.id);
    return results.map(r => ({
      id: r.id,
      marketKey: r.marketKey,
      marketName: r.marketName,
      boostPercent: r.boostPercent,
    }));
  }

  async updateMarketSettings(updates: { marketKey: string; boostPercent: number }[]): Promise<MarketSetting[]> {
    for (const u of updates) {
      await db.update(marketSettingsTable)
        .set({ boostPercent: u.boostPercent })
        .where(eq(marketSettingsTable.marketKey, u.marketKey));
    }
    return this.getMarketSettings();
  }

  async getBanners(): Promise<Banner[]> {
    const results = await db.select().from(bannersTable).where(eq(bannersTable.active, true)).orderBy(bannersTable.slotNumber);
    return results.map(r => ({
      id: r.id,
      slotNumber: r.slotNumber,
      filename: r.filename,
      url: r.url,
      active: r.active,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async getBannersRaw(): Promise<any[]> {
    const results = await db.select().from(bannersTable).where(eq(bannersTable.active, true)).orderBy(bannersTable.slotNumber);
    return results;
  }

  async upsertBanner(slotNumber: number, filename: string, url: string, imageData?: string, mimeType?: string): Promise<Banner> {
    const existing = await db.select().from(bannersTable).where(eq(bannersTable.slotNumber, slotNumber));
    let result;
    const setData: any = { filename, url, active: true, updatedAt: new Date() };
    if (imageData !== undefined) setData.imageData = imageData;
    if (mimeType !== undefined) setData.mimeType = mimeType;
    if (existing.length > 0) {
      [result] = await db.update(bannersTable)
        .set(setData)
        .where(eq(bannersTable.slotNumber, slotNumber))
        .returning();
    } else {
      [result] = await db.insert(bannersTable)
        .values({ slotNumber, filename, url, imageData, mimeType, active: true })
        .returning();
    }
    return {
      id: result.id,
      slotNumber: result.slotNumber,
      filename: result.filename,
      url: result.url,
      active: result.active,
      updatedAt: result.updatedAt.toISOString(),
    };
  }

  async deleteBanner(slotNumber: number): Promise<boolean> {
    const result = await db.delete(bannersTable).where(eq(bannersTable.slotNumber, slotNumber)).returning();
    return result.length > 0;
  }

  async getRules(): Promise<string> {
    const rows = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "rules"));
    return rows[0]?.content ?? "";
  }

  async saveRules(content: string): Promise<void> {
    const existing = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "rules"));
    if (existing.length > 0) {
      await db.update(siteContentTable).set({ content, updatedAt: new Date() }).where(eq(siteContentTable.key, "rules"));
    } else {
      await db.insert(siteContentTable).values({ key: "rules", content });
    }
  }

  async getWithdrawals(): Promise<Withdrawal[]> {
    const rows = await db.select().from(withdrawalsTable).orderBy(desc(withdrawalsTable.createdAt));
    return rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async createWithdrawal(amount: number, description: string): Promise<Withdrawal> {
    const [row] = await db.insert(withdrawalsTable).values({ amount, description }).returning();
    return { ...row, createdAt: row.createdAt.toISOString() };
  }

  async deleteWithdrawal(id: number): Promise<boolean> {
    const result = await db.delete(withdrawalsTable).where(eq(withdrawalsTable.id, id)).returning();
    return result.length > 0;
  }

  async getSetting(key: string): Promise<string | null> {
    const rows = await db.select().from(siteContentTable).where(eq(siteContentTable.key, `_setting_${key}`));
    return rows[0]?.content ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const dbKey = `_setting_${key}`;
    const existing = await db.select().from(siteContentTable).where(eq(siteContentTable.key, dbKey));
    if (existing.length > 0) {
      await db.update(siteContentTable).set({ content: value, updatedAt: new Date() }).where(eq(siteContentTable.key, dbKey));
    } else {
      await db.insert(siteContentTable).values({ key: dbKey, content: value });
    }
  }

  private mapBoostCard(r: typeof boostCardsTable.$inferSelect): BoostCard {
    return {
      id: r.id,
      eventName: r.eventName,
      matchTitle: r.matchTitle,
      description: r.description,
      selections: (r.selections as { description: string }[]) ?? [],
      originalOdds: r.originalOdds,
      boostedOdds: r.boostedOdds,
      outcomes: (r.outcomes as { label: string; originalOdds: number; boostedOdds: number }[]) ?? [],
      outcomeResults: (r.outcomeResults as ("pending" | "won" | "lost")[]) ?? [],
      subtitle: r.subtitle ?? "",
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      active: r.active,
      result: (r.result as "pending" | "won" | "lost") ?? "pending",
      createdAt: r.createdAt.toISOString(),
    };
  }

  async getBoostCards(): Promise<BoostCard[]> {
    const rows = await db.select().from(boostCardsTable).orderBy(desc(boostCardsTable.createdAt));
    return rows.map(r => this.mapBoostCard(r));
  }

  async getActiveBoostCards(): Promise<BoostCard[]> {
    const now = new Date();
    const rows = await db.select().from(boostCardsTable).where(
      and(eq(boostCardsTable.active, true), lte(boostCardsTable.startsAt, now), gte(boostCardsTable.endsAt, now))
    ).orderBy(boostCardsTable.startsAt);
    return rows.map(r => this.mapBoostCard(r));
  }

  async createBoostCard(data: InsertBoostCard): Promise<BoostCard> {
    const [row] = await db.insert(boostCardsTable).values({
      eventName: data.eventName,
      matchTitle: data.matchTitle,
      description: data.description ?? "",
      selections: data.selections ?? [],
      originalOdds: data.originalOdds,
      boostedOdds: data.boostedOdds,
      outcomes: data.outcomes ?? [],
      subtitle: data.subtitle ?? "",
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      active: data.active ?? true,
    }).returning();
    return this.mapBoostCard(row);
  }

  async updateBoostCard(id: number, data: Partial<InsertBoostCard>): Promise<BoostCard | undefined> {
    const update: any = {};
    if (data.eventName !== undefined) update.eventName = data.eventName;
    if (data.matchTitle !== undefined) update.matchTitle = data.matchTitle;
    if (data.description !== undefined) update.description = data.description;
    if (data.selections !== undefined) update.selections = data.selections;
    if (data.originalOdds !== undefined) update.originalOdds = data.originalOdds;
    if (data.boostedOdds !== undefined) update.boostedOdds = data.boostedOdds;
    if (data.outcomes !== undefined) update.outcomes = data.outcomes;
    if (data.subtitle !== undefined) update.subtitle = data.subtitle;
    if (data.startsAt !== undefined) update.startsAt = new Date(data.startsAt);
    if (data.endsAt !== undefined) update.endsAt = new Date(data.endsAt);
    if (data.active !== undefined) update.active = data.active;
    const [row] = await db.update(boostCardsTable).set(update).where(eq(boostCardsTable.id, id)).returning();
    return row ? this.mapBoostCard(row) : undefined;
  }

  async resolveBoostCard(id: number, result: "pending" | "won" | "lost", outcomeIdx?: number): Promise<{ card: BoostCard; affectedBets: number }> {
    let updatedRow: typeof boostCardsTable.$inferSelect;
    let selectionId: string;

    if (outcomeIdx !== undefined) {
      // Multi-outcome: update only that outcome's result in outcomeResults array
      const [existing] = await db.select().from(boostCardsTable).where(eq(boostCardsTable.id, id));
      if (!existing) throw new Error("Boost card não encontrado");

      const currentResults = ((existing.outcomeResults ?? []) as ("pending" | "won" | "lost")[]);
      const outcomes = ((existing.outcomes ?? []) as any[]);
      const newResults = outcomes.map((_, i) => (i === outcomeIdx ? result : (currentResults[i] ?? "pending")));

      const [row] = await db.update(boostCardsTable)
        .set({ outcomeResults: newResults })
        .where(eq(boostCardsTable.id, id))
        .returning();
      if (!row) throw new Error("Boost card não encontrado");
      updatedRow = row;
      selectionId = `boost-${id}-${outcomeIdx}`;
    } else {
      // Simple card: update top-level result
      const [row] = await db.update(boostCardsTable)
        .set({ result })
        .where(eq(boostCardsTable.id, id))
        .returning();
      if (!row) throw new Error("Boost card não encontrado");
      updatedRow = row;
      selectionId = `boost-${id}`;
    }

    const card = this.mapBoostCard(updatedRow);
    const allBets = await db.select().from(betSlipsTable).where(eq(betSlipsTable.status, "pending"));
    let affectedBets = 0;

    for (const bet of allBets) {
      const sels = bet.selections as any[];
      const boostSel = sels.find((s: any) => s.id === selectionId);
      if (!boostSel) continue;
      await this.updateSelectionResult(bet.id, selectionId, result);
      affectedBets++;
    }

    return { card, affectedBets };
  }

  async deleteBoostCard(id: number): Promise<boolean> {
    const result = await db.delete(boostCardsTable).where(eq(boostCardsTable.id, id)).returning();
    return result.length > 0;
  }

  private mapUser(row: any): User {
    return {
      cpf: row.cpf,
      name: row.name,
      phone: row.phone,
      referralCode: row.referralCode ?? null,
      balance: row.balance,
      firstDepositDone: row.firstDepositDone,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createUser(data: { cpf: string; name: string; phone: string; referralCode?: string; passwordHash: string }): Promise<User> {
    const [row] = await db.insert(usersTable).values({
      cpf: data.cpf,
      name: data.name,
      phone: data.phone,
      referralCode: data.referralCode ?? null,
      passwordHash: data.passwordHash,
      balance: 0,
      firstDepositDone: false,
    }).returning();
    return this.mapUser(row);
  }

  async getUserByCpf(cpf: string): Promise<(User & { passwordHash: string }) | undefined> {
    const [row] = await db.select().from(usersTable).where(eq(usersTable.cpf, cpf));
    if (!row) return undefined;
    return { ...this.mapUser(row), passwordHash: row.passwordHash };
  }

  async getAllUsers(): Promise<User[]> {
    const rows = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
    return rows.map(r => this.mapUser(r));
  }

  async updateUserBalance(cpf: string, newBalance: number): Promise<User | undefined> {
    const [row] = await db.update(usersTable).set({ balance: newBalance }).where(eq(usersTable.cpf, cpf)).returning();
    if (!row) return undefined;
    return this.mapUser(row);
  }

  async updateUserPassword(cpf: string, passwordHash: string): Promise<boolean> {
    const result = await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.cpf, cpf)).returning();
    return result.length > 0;
  }

  async updateUserData(cpf: string, data: { name?: string; phone?: string }): Promise<User | undefined> {
    const [row] = await db.update(usersTable).set(data).where(eq(usersTable.cpf, cpf)).returning();
    if (!row) return undefined;
    return this.mapUser(row);
  }

  async deleteUser(cpf: string): Promise<boolean> {
    const result = await db.delete(usersTable).where(eq(usersTable.cpf, cpf)).returning();
    return result.length > 0;
  }

  async markFirstDeposit(cpf: string): Promise<void> {
    await db.update(usersTable).set({ firstDepositDone: true }).where(eq(usersTable.cpf, cpf));
  }

  async getBetSlipsByUser(userId: string): Promise<BetSlip[]> {
    const results = await db.select().from(betSlipsTable)
      .where(eq(betSlipsTable.userId, userId))
      .orderBy(desc(betSlipsTable.createdAt));
    return results.map(r => this.mapBetSlip(r));
  }

  private mapDeposit(row: any): Deposit {
    return {
      id: row.id,
      userId: row.userId,
      amount: row.amount,
      bonusAmount: row.bonusAmount,
      status: row.status,
      pixReceipt: row.pixReceipt ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createDeposit(userId: string, amount: number, bonusAmount: number): Promise<Deposit> {
    const [row] = await db.insert(depositsTable).values({
      userId,
      amount,
      bonusAmount,
      status: "pending",
    }).returning();
    return this.mapDeposit(row);
  }

  async getDepositsByUser(userId: string): Promise<Deposit[]> {
    const rows = await db.select().from(depositsTable).where(eq(depositsTable.userId, userId)).orderBy(desc(depositsTable.createdAt));
    return rows.map(r => this.mapDeposit(r));
  }

  async getAllDeposits(): Promise<Deposit[]> {
    const rows = await db.select().from(depositsTable).orderBy(desc(depositsTable.createdAt));
    return rows.map(r => this.mapDeposit(r));
  }

  async updateDepositStatus(id: number, status: string): Promise<Deposit | undefined> {
    const [row] = await db.update(depositsTable).set({ status }).where(eq(depositsTable.id, id)).returning();
    if (!row) return undefined;
    return this.mapDeposit(row);
  }

  async deleteDeposit(id: number): Promise<boolean> {
    const result = await db.delete(depositsTable).where(eq(depositsTable.id, id)).returning();
    return result.length > 0;
  }

  private mapUserWithdrawal(row: any, userPhone?: string | null): UserWithdrawal {
    return {
      id: row.id,
      userId: row.userId,
      amount: row.amount,
      pixKey: row.pixKey,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      userPhone: userPhone ?? null,
    };
  }

  async createUserWithdrawal(userId: string, amount: number, pixKey: string): Promise<UserWithdrawal> {
    const [row] = await db.insert(userWithdrawalsTable).values({ userId, amount, pixKey, status: "pending" }).returning();
    return this.mapUserWithdrawal(row);
  }

  async getUserWithdrawalsByUser(userId: string): Promise<UserWithdrawal[]> {
    const rows = await db.select().from(userWithdrawalsTable).where(eq(userWithdrawalsTable.userId, userId)).orderBy(desc(userWithdrawalsTable.createdAt));
    return rows.map(r => this.mapUserWithdrawal(r));
  }

  async getAllUserWithdrawals(): Promise<UserWithdrawal[]> {
    const rows = await db
      .select({
        id: userWithdrawalsTable.id,
        userId: userWithdrawalsTable.userId,
        amount: userWithdrawalsTable.amount,
        pixKey: userWithdrawalsTable.pixKey,
        status: userWithdrawalsTable.status,
        createdAt: userWithdrawalsTable.createdAt,
        paidAt: userWithdrawalsTable.paidAt,
        userPhone: usersTable.phone,
      })
      .from(userWithdrawalsTable)
      .leftJoin(usersTable, eq(userWithdrawalsTable.userId, usersTable.cpf))
      .orderBy(desc(userWithdrawalsTable.createdAt));
    return rows.map(r => this.mapUserWithdrawal(r, r.userPhone));
  }

  async updateUserWithdrawalStatus(id: number, status: string): Promise<UserWithdrawal | undefined> {
    const [row] = await db.update(userWithdrawalsTable).set({ status }).where(eq(userWithdrawalsTable.id, id)).returning();
    if (!row) return undefined;
    return this.mapUserWithdrawal(row);
  }

  async markUserWithdrawalAsPaid(id: number): Promise<UserWithdrawal | undefined> {
    const [row] = await db.update(userWithdrawalsTable).set({ status: "paid", paidAt: new Date() }).where(eq(userWithdrawalsTable.id, id)).returning();
    if (!row) return undefined;
    return this.mapUserWithdrawal(row);
  }
}

export const storage = new DatabaseStorage();
