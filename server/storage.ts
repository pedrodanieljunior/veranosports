import { type BetSlip, type InsertBetSlip, type Selection } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  createBetSlip(data: InsertBetSlip): Promise<BetSlip>;
  getBetSlip(id: string): Promise<BetSlip | undefined>;
  getAllBetSlips(): Promise<BetSlip[]>;
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
      createdAt: new Date().toISOString(),
    };
    
    this.betSlips.set(id, betSlip);
    return betSlip;
  }

  async getBetSlip(id: string): Promise<BetSlip | undefined> {
    return this.betSlips.get(id);
  }

  async getAllBetSlips(): Promise<BetSlip[]> {
    return Array.from(this.betSlips.values());
  }
}

export const storage = new MemStorage();
