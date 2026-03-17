import { type BetSlip, type InsertBetSlip, type MarketSetting, type Banner, type Withdrawal, betSlipsTable, marketSettingsTable, bannersTable, siteContentTable, withdrawalsTable } from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface GameSimpleBetTotal {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  sportTitle: string;
  total: number;
  count: number;
  isBlocked: boolean;
}

export interface IStorage {
  createBetSlip(data: InsertBetSlip): Promise<BetSlip>;
  getBetSlip(id: string): Promise<BetSlip | undefined>;
  getAllBetSlips(): Promise<BetSlip[]>;
  getRecentBetSlips(hours: number): Promise<BetSlip[]>;
  deleteBetSlip(id: string): Promise<boolean>;
  deleteAllBetSlips(): Promise<void>;
  updateBetSlipStatus(id: string, status: "pending" | "won" | "lost"): Promise<BetSlip | undefined>;
  updateSelectionResult(betId: string, selectionId: string, result: "pending" | "won" | "lost"): Promise<BetSlip | undefined>;
  updateBetSlipVerified(id: string, verified: boolean): Promise<BetSlip | undefined>;
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
}

export class DatabaseStorage implements IStorage {
  async createBetSlip(data: InsertBetSlip): Promise<BetSlip> {
    const id = randomUUID();
    const totalOdds = data.selections.reduce((acc, sel) => acc * sel.odds, 1);
    const potentialWin = data.stake * totalOdds;
    
    const [result] = await db.insert(betSlipsTable).values({
      id,
      selections: data.selections,
      stake: data.stake,
      totalOdds,
      potentialWin,
      status: "pending",
    }).returning();
    
    return {
      id: result.id,
      selections: result.selections as BetSlip["selections"],
      stake: result.stake,
      totalOdds: result.totalOdds,
      potentialWin: result.potentialWin,
      status: result.status as "pending" | "won" | "lost",
      verified: result.verified,
      createdAt: result.createdAt.toISOString(),
    };
  }

  async getBetSlip(id: string): Promise<BetSlip | undefined> {
    const [result] = await db.select().from(betSlipsTable).where(eq(betSlipsTable.id, id));
    if (!result) return undefined;
    
    return {
      id: result.id,
      selections: result.selections as BetSlip["selections"],
      stake: result.stake,
      totalOdds: result.totalOdds,
      potentialWin: result.potentialWin,
      status: result.status as "pending" | "won" | "lost",
      verified: result.verified,
      createdAt: result.createdAt.toISOString(),
    };
  }

  async getAllBetSlips(): Promise<BetSlip[]> {
    const results = await db.select().from(betSlipsTable).orderBy(desc(betSlipsTable.createdAt));
    
    return results.map(result => ({
      id: result.id,
      selections: result.selections as BetSlip["selections"],
      stake: result.stake,
      totalOdds: result.totalOdds,
      potentialWin: result.potentialWin,
      status: result.status as "pending" | "won" | "lost",
      verified: result.verified,
      createdAt: result.createdAt.toISOString(),
    }));
  }

  async getRecentBetSlips(hours: number): Promise<BetSlip[]> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const results = await db.select().from(betSlipsTable).orderBy(desc(betSlipsTable.createdAt));
    
    return results
      .filter(result => new Date(result.createdAt) >= cutoffTime)
      .map(result => ({
        id: result.id,
        selections: result.selections as BetSlip["selections"],
        stake: result.stake,
        totalOdds: result.totalOdds,
        potentialWin: result.potentialWin,
        status: result.status as "pending" | "won" | "lost",
        verified: result.verified,
        createdAt: result.createdAt.toISOString(),
      }));
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
    
    return {
      id: result.id,
      selections: result.selections as BetSlip["selections"],
      stake: result.stake,
      totalOdds: result.totalOdds,
      potentialWin: result.potentialWin,
      status: result.status as "pending" | "won" | "lost",
      verified: result.verified,
      createdAt: result.createdAt.toISOString(),
    };
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

    return {
      id: updated.id,
      selections: updated.selections as BetSlip["selections"],
      stake: updated.stake,
      totalOdds: updated.totalOdds,
      potentialWin: updated.potentialWin,
      status: updated.status as "pending" | "won" | "lost",
      verified: updated.verified,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async updateBetSlipVerified(id: string, verified: boolean): Promise<BetSlip | undefined> {
    const [result] = await db.update(betSlipsTable)
      .set({ verified })
      .where(eq(betSlipsTable.id, id))
      .returning();
    
    if (!result) return undefined;
    
    return {
      id: result.id,
      selections: result.selections as BetSlip["selections"],
      stake: result.stake,
      totalOdds: result.totalOdds,
      potentialWin: result.potentialWin,
      status: result.status as "pending" | "won" | "lost",
      verified: result.verified,
      createdAt: result.createdAt.toISOString(),
    };
  }

  async getDailyBetSlips(): Promise<BetSlip[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const results = await db.select().from(betSlipsTable)
      .where(gte(betSlipsTable.createdAt, todayStart))
      .orderBy(desc(betSlipsTable.createdAt));
    
    return results.map(result => ({
      id: result.id,
      selections: result.selections as BetSlip["selections"],
      stake: result.stake,
      totalOdds: result.totalOdds,
      potentialWin: result.potentialWin,
      status: result.status as "pending" | "won" | "lost",
      verified: result.verified,
      createdAt: result.createdAt.toISOString(),
    }));
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
          total: 0,
          count: 0,
          isBlocked: false,
        };
      }

      totals[gameId].total += bet.potentialWin;
      totals[gameId].count += 1;
    }

    return Object.values(totals).map(t => ({
      ...t,
      isBlocked: t.total >= SIMPLE_BET_GAME_LIMIT,
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
}

export const storage = new DatabaseStorage();
