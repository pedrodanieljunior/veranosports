import { type BetSlip, type InsertBetSlip, type Selection } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  createBetSlip(data: InsertBetSlip): Promise<BetSlip>;
  getBetSlip(id: string): Promise<BetSlip | undefined>;
  getAllBetSlips(): Promise<BetSlip[]>;
  deleteBetSlip(id: string): Promise<boolean>;
  deleteAllBetSlips(): Promise<void>;
  updateBetSlipStatus(id: string, status: "pending" | "won" | "lost"): Promise<BetSlip | undefined>;
}

export class MemStorage implements IStorage {
  private betSlips: Map<string, BetSlip>;

  constructor() {
    this.betSlips = new Map();
  }

  async createBetSlip(data: InsertBetSlip): Promise<BetSlip> {
    const id = randomUUID();
    const totalOdds = data.selections.reduce((acc, sel) => acc * sel.odds, 1);
    const potentialWin = data.stake * totalOdds;
    
    const betSlip: BetSlip = {
      id,
      selections: data.selections,
      stake: data.stake,
      totalOdds,
      potentialWin,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    
    this.betSlips.set(id, betSlip);
    return betSlip;
  }

  async getBetSlip(id: string): Promise<BetSlip | undefined> {
    return this.betSlips.get(id);
  }

  async getAllBetSlips(): Promise<BetSlip[]> {
    return Array.from(this.betSlips.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async deleteBetSlip(id: string): Promise<boolean> {
    return this.betSlips.delete(id);
  }

  async deleteAllBetSlips(): Promise<void> {
    this.betSlips.clear();
  }

  async updateBetSlipStatus(id: string, status: "pending" | "won" | "lost"): Promise<BetSlip | undefined> {
    const betSlip = this.betSlips.get(id);
    if (!betSlip) return undefined;
    
    betSlip.status = status;
    this.betSlips.set(id, betSlip);
    return betSlip;
  }
}

export const storage = new MemStorage();
