import { type BetSlip, type InsertBetSlip, type Selection } from "@shared/schema";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "bets.json");

export interface IStorage {
  createBetSlip(data: InsertBetSlip): Promise<BetSlip>;
  getBetSlip(id: string): Promise<BetSlip | undefined>;
  getAllBetSlips(): Promise<BetSlip[]>;
  deleteBetSlip(id: string): Promise<boolean>;
  deleteAllBetSlips(): Promise<void>;
  updateBetSlipStatus(id: string, status: "pending" | "won" | "lost"): Promise<BetSlip | undefined>;
}

export class FileStorage implements IStorage {
  private betSlips: Map<string, BetSlip>;

  constructor() {
    this.betSlips = new Map();
    this.loadFromFile();
  }

  private loadFromFile(): void {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, "utf-8");
        const bets: BetSlip[] = JSON.parse(data);
        bets.forEach(bet => this.betSlips.set(bet.id, bet));
        console.log(`Loaded ${bets.length} bet slips from file`);
      }
    } catch (error) {
      console.error("Error loading bets from file:", error);
    }
  }

  private saveToFile(): void {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const bets = Array.from(this.betSlips.values());
      fs.writeFileSync(DATA_FILE, JSON.stringify(bets, null, 2));
    } catch (error) {
      console.error("Error saving bets to file:", error);
    }
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
    this.saveToFile();
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
    const deleted = this.betSlips.delete(id);
    if (deleted) this.saveToFile();
    return deleted;
  }

  async deleteAllBetSlips(): Promise<void> {
    this.betSlips.clear();
    this.saveToFile();
  }

  async updateBetSlipStatus(id: string, status: "pending" | "won" | "lost"): Promise<BetSlip | undefined> {
    const betSlip = this.betSlips.get(id);
    if (!betSlip) return undefined;
    
    betSlip.status = status;
    this.betSlips.set(id, betSlip);
    this.saveToFile();
    return betSlip;
  }
}

export const storage = new FileStorage();
