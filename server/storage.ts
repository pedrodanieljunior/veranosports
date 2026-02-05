import { type BetSlip, type InsertBetSlip, betSlipsTable } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  createBetSlip(data: InsertBetSlip): Promise<BetSlip>;
  getBetSlip(id: string): Promise<BetSlip | undefined>;
  getAllBetSlips(): Promise<BetSlip[]>;
  getRecentBetSlips(hours: number): Promise<BetSlip[]>;
  deleteBetSlip(id: string): Promise<boolean>;
  deleteAllBetSlips(): Promise<void>;
  updateBetSlipStatus(id: string, status: "pending" | "won" | "lost"): Promise<BetSlip | undefined>;
  updateSelectionResult(betId: string, selectionId: string, result: "pending" | "won" | "lost"): Promise<BetSlip | undefined>;
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
      createdAt: updated.createdAt.toISOString(),
    };
  }
}

export const storage = new DatabaseStorage();
