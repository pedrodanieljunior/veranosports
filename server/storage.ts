import { type BetSlip, type InsertBetSlip, type MarketSetting, type Banner, type Withdrawal, type BoostCard, type InsertBoostCard, type User, type Deposit, type UserWithdrawal, type Transaction, type Defesa, type InsertDefesa, type CopaWorldCupCard, type InsertCopaWorldCupCard, type Bolao, type BolaoEntry, type InsertBolao, type Duelo, type DueloEntry, betSlipsTable, marketSettingsTable, bannersTable, siteContentTable, withdrawalsTable, boostCardsTable, usersTable, depositsTable, userWithdrawalsTable, transactionsTable, fixtureHalftimeStatsTable, defensasTable, clubFwClaimsTable, CLUB_FW_LEVELS, copaWorldCupCardsTable, baloesTable, bolaoEntriesTable, duelosTable, dueloEntriesTable, notificationsTable, notificationReadsTable } from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, lte, and, sql, inArray } from "drizzle-orm";
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
  cashOutBet(id: string, cashOutValue: number): Promise<BetSlip | undefined>;
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
  // Copa do Mundo Cards
  getCopaCards(subTab?: string): Promise<CopaWorldCupCard[]>;
  createCopaCard(data: InsertCopaWorldCupCard): Promise<CopaWorldCupCard>;
  updateCopaCard(id: number, data: Partial<InsertCopaWorldCupCard>): Promise<CopaWorldCupCard | undefined>;
  deleteCopaCard(id: number): Promise<boolean>;
  // Users
  createUser(data: { cpf: string; name: string; phone: string; referredByCode?: string; passwordHash: string }): Promise<User>;
  getUserByCpf(cpf: string): Promise<(User & { passwordHash: string }) | undefined>;
  getAllUsers(): Promise<User[]>;
  updateUserBalance(cpf: string, newBalance: number): Promise<User | undefined>;
  updateUserBonusBalance(cpf: string, newBonusBalance: number): Promise<User | undefined>;
  updateUserPassword(cpf: string, passwordHash: string): Promise<boolean>;
  updateUserData(cpf: string, data: { name?: string; phone?: string; referralCode?: string }): Promise<User | undefined>;
  deleteUser(cpf: string): Promise<boolean>;
  markFirstDeposit(cpf: string): Promise<void>;
  getBetSlipsByUser(userId: string): Promise<BetSlip[]>;
  // Deposits
  createDeposit(userId: string, amount: number, bonusAmount: number, mpData?: { mpPaymentId: string; pixCopyPaste: string; pixQrCode: string; pixExpiresAt: Date }): Promise<Deposit>;
  getDepositsByUser(userId: string): Promise<Deposit[]>;
  getAllDeposits(): Promise<Deposit[]>;
  updateDepositStatus(id: number, status: string): Promise<Deposit | undefined>;
  deleteDeposit(id: number): Promise<boolean>;
  resetCaixa(): Promise<void>;
  // User Withdrawals
  createUserWithdrawal(userId: string, amount: number, pixKey: string): Promise<UserWithdrawal>;
  getUserWithdrawalsByUser(userId: string): Promise<UserWithdrawal[]>;
  getAllUserWithdrawals(): Promise<UserWithdrawal[]>;
  updateUserWithdrawalStatus(id: number, status: string): Promise<UserWithdrawal | undefined>;
  markUserWithdrawalAsPaid(id: number): Promise<UserWithdrawal | undefined>;
  // Transactions
  createTransaction(data: { userId: string; type: string; amount: number; balanceAfter: number; description: string; referenceId?: string }): Promise<Transaction>;
  getTransactionsByUser(userId: string): Promise<Transaction[]>;
  getWinTransactionForBet(betId: string): Promise<Transaction | null>;
  // Defesas
  getDefesas(): Promise<Defesa[]>;
  getDefesaByTicket(ticketId: string): Promise<Defesa | undefined>;
  createDefesa(data: InsertDefesa): Promise<Defesa>;
  updateDefesaStatus(id: number, status: "pending" | "won" | "lost"): Promise<Defesa | undefined>;
  deleteDefesa(id: number): Promise<boolean>;
  // Fixture Halftime Stats
  upsertFixtureHalftimeStats(fixtureId: number, homeCorners: number, awayCorners: number): Promise<void>;
  getFixtureHalftimeStats(fixtureId: number): Promise<{ homeCorners: number; awayCorners: number } | null>;
  getFixtureHalftimeStatsBatch(fixtureIds: number[]): Promise<Map<number, { homeCorners: number; awayCorners: number }>>;
  // Clube FW
  getWeeklyStake(userId: string, weekStart: string): Promise<number>;
  getClubFwClaimedLevels(userId: string, weekStart: string): Promise<number[]>;
  createClubFwClaim(userId: string, weekStart: string, level: number, bonusAmount: number): Promise<void>;
  checkAndAwardClubFw(userId: string, forWeekStart?: string): Promise<{ newLevels: number[]; totalBonus: number }>;
  processAllUsersClubFwPayout(weekStart: string): Promise<{ processed: number; totalBonus: number }>;
  fixOvercreditedClubFw(): Promise<{ fixed: number; totalDeducted: number; details: string[] }>;
  getAllClubFwClaims(fromDate?: string, toDate?: string): Promise<{ id: number; userId: string; userName: string; weekStart: string; level: number; bonusAmount: number; createdAt: Date }[]>;
  // Duelo
  getDuelos(): Promise<Duelo[]>;
  getActiveDuelos(): Promise<Duelo[]>;
  createDuelo(data: Partial<Duelo>): Promise<Duelo>;
  updateDuelo(id: number, data: Partial<Duelo>): Promise<Duelo | undefined>;
  deleteDuelo(id: number): Promise<boolean>;
  getDueloEntries(dueloId: number): Promise<DueloEntry[]>;
  getDueloEntriesByUser(userId: string): Promise<DueloEntry[]>;
  createDueloEntry(data: { dueloId: number; userId: string; side: string }): Promise<DueloEntry>;
  finishDuelo(dueloId: number, winnerSide: string): Promise<{ winners: number; prizePerWinner: number; totalEntries: number; total: number; houseProfit: number }>;
  // Bolão
  getBoloes(): Promise<Bolao[]>;
  getActiveBolao(): Promise<Bolao | null>;
  createBolao(data: InsertBolao): Promise<Bolao>;
  updateBolao(id: number, data: Partial<InsertBolao>): Promise<Bolao | undefined>;
  deleteBolao(id: number): Promise<boolean>;
  createBolaoEntry(data: { bolaoId: number; userId: string; homeScore: number; awayScore: number }): Promise<BolaoEntry>;
  getBolaoEntries(bolaoId: number): Promise<BolaoEntry[]>;
  getBolaoEntriesByUser(userId: string): Promise<BolaoEntry[]>;
  deleteAllBolaoEntriesByUser(userId: string): Promise<void>;
  finishBolao(bolaoId: number, homeScore: number, awayScore: number): Promise<{ winners: number; prizePerWinner: number; totalEntries: number; total: number; houseProfit: number }>;
  // Notifications
  createNotification(data: { title: string; body: string; type: string; targetCpfs?: string[] | null; imageUrl?: string | null; imageData?: string | null; mimeType?: string | null }): Promise<any>;
  updateNotificationImage(id: number, imageData: string, mimeType: string): Promise<void>;
  getNotificationImage(id: number): Promise<{ imageData: string; mimeType: string | null } | null>;
  getNotifications(): Promise<any[]>;
  getNotificationsForUser(userCpf: string): Promise<any[]>;
  getUnreadCountForUser(userCpf: string): Promise<number>;
  markNotificationRead(notificationId: number, userCpf: string): Promise<void>;
  markAllNotificationsRead(userCpf: string): Promise<void>;
  dismissNotification(notificationId: number, userCpf: string): Promise<void>;
  dismissAllNotifications(userCpf: string): Promise<void>;
  deleteNotification(id: number): Promise<boolean>;
  toggleNotificationActive(id: number): Promise<any>;
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
      bonusUsed: result.bonusUsed ?? 0,
      status: result.status as BetSlip["status"],
      verified: result.verified,
      createdAt: result.createdAt.toISOString(),
      cashOutValue: result.cashOutValue ?? null,
    };
  }

  async createBetSlip(data: InsertBetSlip & { _totalOdds?: number; _potentialWin?: number; _bonusUsed?: number }): Promise<BetSlip> {
    const id = randomUUID();
    // Use pre-calculated values from routes (which correctly handle combo/boost logic)
    // Fallback to simple multiply only if not provided
    const totalOdds = (data as any)._totalOdds ?? data.selections.reduce((acc, sel) => acc * sel.odds, 1);
    const potentialWin = (data as any)._potentialWin ?? data.stake * totalOdds;
    const bonusUsed = (data as any)._bonusUsed ?? 0;
    
    const [result] = await db.insert(betSlipsTable).values({
      id,
      sessionId: data.sessionId ?? null,
      userId: data.userId ?? null,
      selections: data.selections,
      stake: data.stake,
      totalOdds,
      potentialWin,
      bonusUsed,
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

    // Não alterar status de bilhetes já encerrados (cashed_out)
    const currentStatus = bet.status as string;
    let newStatus: string = currentStatus;
    if (currentStatus !== "cashed_out") {
      // Seleções boost são sempre resolvidas manualmente pelo admin — excluir da lógica automática
      const nonBoostSelections = updatedSelections.filter((sel: any) => sel.marketKey !== "boost");
      const boostSelections = updatedSelections.filter((sel: any) => sel.marketKey === "boost");
      const boostPending = boostSelections.some((sel: any) => !sel.result || sel.result === "pending");
      const boostLost = boostSelections.some((sel: any) => sel.result === "lost");

      const anyLost = nonBoostSelections.some((sel: any) => sel.result === "lost") || boostLost;
      const allResolved = nonBoostSelections.every((sel: any) => sel.result !== "pending") && !boostPending;
      if (anyLost) {
        // Uma seleção perdida = bilhete perdido imediatamente (regra de múltipla)
        newStatus = "lost";
      } else if (allResolved) {
        newStatus = "won";
      } else {
        newStatus = "pending";
      }
    }

    const [updated] = await db.update(betSlipsTable)
      .set({ 
        selections: updatedSelections,
        status: newStatus as any,
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

  async cashOutBet(id: string, cashOutValue: number): Promise<BetSlip | undefined> {
    const [result] = await db.update(betSlipsTable)
      .set({ status: "cashed_out", cashOutValue })
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
      total: sql<number>`COALESCE(SUM(GREATEST(${betSlipsTable.potentialWin} - COALESCE(${betSlipsTable.bonusUsed}, 0), 0)), 0)`
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
    const defaults = [
      { marketKey: "h2h", marketName: "Resultado Final (1X2)", boostPercent: 15 },
      { marketKey: "totals", marketName: "Total de Gols", boostPercent: 0 },
      { marketKey: "ht_ft", marketName: "Intervalo/Final", boostPercent: 0 },
      { marketKey: "btts", marketName: "Ambas Marcam", boostPercent: 0 },
      { marketKey: "corners", marketName: "Total de Escanteios", boostPercent: 0 },
      { marketKey: "first_to_score", marketName: "Primeira Equipe a Marcar", boostPercent: 0 },
      { marketKey: "red_card", marketName: "Cartão Vermelho no Jogo", boostPercent: 0 },
      { marketKey: "exact_score", marketName: "Placar Exato", boostPercent: 0 },
      { marketKey: "first_half_goals", marketName: "Gols 1º Tempo", boostPercent: 0 },
      { marketKey: "team_goals", marketName: "Gols por Time", boostPercent: 0 },
      { marketKey: "first_half_result", marketName: "Resultado 1º Tempo", boostPercent: 0 },
      { marketKey: "cards", marketName: "Total de Cartões", boostPercent: 0 },
      { marketKey: "corners_winner", marketName: "Vencedor Escanteios", boostPercent: 0 },
      { marketKey: "first_half_corners", marketName: "Escanteios 1º Tempo", boostPercent: 0 },
      { marketKey: "cards_home", marketName: "Cartões - Casa", boostPercent: 0 },
      { marketKey: "cards_away", marketName: "Cartões - Fora", boostPercent: 0 },
      { marketKey: "red_card_1h", marketName: "Cartão Vermelho 1º Tempo", boostPercent: 0 },
      { marketKey: "result_btts", marketName: "Resultado + Ambas Marcam", boostPercent: 0 },
      { marketKey: "btts_1h", marketName: "Ambas Marcam 1º Tempo", boostPercent: 0 },
      { marketKey: "btts_2h", marketName: "Ambas Marcam 2º Tempo", boostPercent: 0 },
    ];

    for (const d of defaults) {
      await db.insert(marketSettingsTable).values(d).onConflictDoNothing();
    }
    console.log("Market settings seeded/updated");
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
      referredByCode: row.referredByCode ?? null,
      balance: row.balance,
      bonusBalance: row.bonusBalance ?? 0,
      firstDepositDone: row.firstDepositDone,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createUser(data: { cpf: string; name: string; phone: string; referredByCode?: string; passwordHash: string }): Promise<User> {
    const [row] = await db.insert(usersTable).values({
      cpf: data.cpf,
      name: data.name,
      phone: data.phone,
      referredByCode: data.referredByCode ?? null,
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

  async updateUserBonusBalance(cpf: string, newBonusBalance: number): Promise<User | undefined> {
    const [row] = await db.update(usersTable).set({ bonusBalance: newBonusBalance }).where(eq(usersTable.cpf, cpf)).returning();
    if (!row) return undefined;
    return this.mapUser(row);
  }

  async updateUserPassword(cpf: string, passwordHash: string): Promise<boolean> {
    const result = await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.cpf, cpf)).returning();
    return result.length > 0;
  }

  async updateUserData(cpf: string, data: { name?: string; phone?: string; referralCode?: string }): Promise<User | undefined> {
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
      mpPaymentId: row.mpPaymentId ?? null,
      pixCopyPaste: row.pixCopyPaste ?? null,
      pixQrCode: row.pixQrCode ?? null,
      pixExpiresAt: row.pixExpiresAt ? row.pixExpiresAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createDeposit(userId: string, amount: number, bonusAmount: number, mpData?: {
    mpPaymentId: string;
    pixCopyPaste: string;
    pixQrCode: string;
    pixExpiresAt: Date;
  }): Promise<Deposit> {
    const [row] = await db.insert(depositsTable).values({
      userId,
      amount,
      bonusAmount,
      status: "pending",
      mpPaymentId: mpData?.mpPaymentId ?? null,
      pixCopyPaste: mpData?.pixCopyPaste ?? null,
      pixQrCode: mpData?.pixQrCode ?? null,
      pixExpiresAt: mpData?.pixExpiresAt ?? null,
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

  async resetCaixa(): Promise<void> {
    await db.delete(betSlipsTable);
    await db.delete(depositsTable);
    await db.delete(userWithdrawalsTable);
    await db.delete(transactionsTable);
    await db.update(usersTable).set({ balance: 0, bonusBalance: 0, firstDepositDone: false });
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

  private mapTransaction(row: any): Transaction {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      amount: row.amount,
      balanceAfter: row.balanceAfter,
      description: row.description,
      referenceId: row.referenceId ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createTransaction(data: { userId: string; type: string; amount: number; balanceAfter: number; description: string; referenceId?: string }): Promise<Transaction> {
    const [row] = await db.insert(transactionsTable).values({
      userId: data.userId,
      type: data.type,
      amount: data.amount,
      balanceAfter: data.balanceAfter,
      description: data.description,
      referenceId: data.referenceId ?? null,
    }).returning();
    return this.mapTransaction(row);
  }

  async getTransactionsByUser(userId: string): Promise<Transaction[]> {
    const rows = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.userId, userId))
      .orderBy(desc(transactionsTable.createdAt));
    return rows.map(r => this.mapTransaction(r));
  }

  async getWinTransactionForBet(betId: string): Promise<Transaction | null> {
    const [row] = await db.select().from(transactionsTable)
      .where(and(eq(transactionsTable.referenceId, betId), eq(transactionsTable.type, "win")))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(1);
    return row ? this.mapTransaction(row) : null;
  }

  async upsertFixtureHalftimeStats(fixtureId: number, homeCorners: number, awayCorners: number): Promise<void> {
    await db.insert(fixtureHalftimeStatsTable)
      .values({ fixtureId, homeCorners, awayCorners })
      .onConflictDoUpdate({
        target: fixtureHalftimeStatsTable.fixtureId,
        set: { homeCorners, awayCorners, capturedAt: new Date() },
      });
  }

  async getFixtureHalftimeStats(fixtureId: number): Promise<{ homeCorners: number; awayCorners: number } | null> {
    const [row] = await db.select().from(fixtureHalftimeStatsTable).where(eq(fixtureHalftimeStatsTable.fixtureId, fixtureId));
    if (!row) return null;
    return { homeCorners: row.homeCorners, awayCorners: row.awayCorners };
  }

  async getFixtureHalftimeStatsBatch(fixtureIds: number[]): Promise<Map<number, { homeCorners: number; awayCorners: number }>> {
    if (fixtureIds.length === 0) return new Map();
    const rows = await db.select().from(fixtureHalftimeStatsTable)
      .where(sql`${fixtureHalftimeStatsTable.fixtureId} = ANY(${fixtureIds})`);
    const result = new Map<number, { homeCorners: number; awayCorners: number }>();
    for (const row of rows) result.set(row.fixtureId, { homeCorners: row.homeCorners, awayCorners: row.awayCorners });
    return result;
  }

  private mapDefesa(r: typeof defensasTable.$inferSelect): Defesa {
    return {
      id: r.id,
      game: r.game,
      markets: r.markets,
      value: r.value,
      odds: r.odds,
      potentialReturn: r.potentialReturn,
      referencedTicket: r.referencedTicket ?? null,
      additionalInfo: r.additionalInfo ?? null,
      status: (r.status as "pending" | "won" | "lost"),
      createdAt: r.createdAt.toISOString(),
    };
  }

  async getDefesas(): Promise<Defesa[]> {
    const rows = await db.select().from(defensasTable).orderBy(desc(defensasTable.createdAt));
    return rows.map(r => this.mapDefesa(r));
  }

  async getDefesaByTicket(ticketId: string): Promise<Defesa | undefined> {
    const [row] = await db.select().from(defensasTable).where(eq(defensasTable.referencedTicket, ticketId));
    return row ? this.mapDefesa(row) : undefined;
  }

  async createDefesa(data: InsertDefesa): Promise<Defesa> {
    const [row] = await db.insert(defensasTable).values({
      game: data.game,
      markets: data.markets,
      value: data.value,
      odds: data.odds,
      potentialReturn: data.potentialReturn,
      referencedTicket: data.referencedTicket || null,
      additionalInfo: data.additionalInfo || null,
    }).returning();
    return this.mapDefesa(row);
  }

  async updateDefesaStatus(id: number, status: "pending" | "won" | "lost"): Promise<Defesa | undefined> {
    const [row] = await db.update(defensasTable).set({ status }).where(eq(defensasTable.id, id)).returning();
    return row ? this.mapDefesa(row) : undefined;
  }

  async deleteDefesa(id: number): Promise<boolean> {
    const result = await db.delete(defensasTable).where(eq(defensasTable.id, id)).returning();
    return result.length > 0;
  }

  // ─── Clube FW ──────────────────────────────────────────────────────────────

  // Manaus = UTC-4 (sem horário de verão)
  private getManausWeekStart(now = new Date()): string {
    const manausTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const dayOfWeek = manausTime.getUTCDay(); // 0=Sun, 1=Mon
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(manausTime.getTime() - daysToMonday * 24 * 60 * 60 * 1000);
    const year = monday.getUTCFullYear();
    const month = String(monday.getUTCMonth() + 1).padStart(2, "0");
    const day = String(monday.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private getPreviousManausWeekStart(): string {
    const currentMonday = new Date(`${this.getManausWeekStart()}T04:00:00.000Z`);
    const prevMondayUTC = new Date(currentMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevMondayManaus = new Date(prevMondayUTC.getTime() - 4 * 60 * 60 * 1000);
    const year = prevMondayManaus.getUTCFullYear();
    const month = String(prevMondayManaus.getUTCMonth() + 1).padStart(2, "0");
    const day = String(prevMondayManaus.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Segunda-feira a partir de 08:00 horário de Manaus
  private isManausPayoutTime(): boolean {
    const now = new Date();
    const manausTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    return manausTime.getUTCDay() === 1 && manausTime.getUTCHours() >= 8;
  }

  async getWeeklyStake(userId: string, weekStart: string): Promise<number> {
    // weekStart = "YYYY-MM-DD" (Segunda-feira em Manaus, UTC-4)
    // Segunda 00:00 Manaus = Segunda 04:00 UTC
    const startUTC = new Date(`${weekStart}T04:00:00.000Z`);
    const endUTC = new Date(startUTC.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ total: sql<number>`COALESCE(SUM(${betSlipsTable.stake}), 0)` })
      .from(betSlipsTable)
      .where(
        and(
          eq(betSlipsTable.userId, userId),
          sql`${betSlipsTable.status} != 'anulado'`,
          gte(betSlipsTable.createdAt, startUTC),
          lte(betSlipsTable.createdAt, endUTC)
        )
      );
    return Number(row?.total ?? 0);
  }

  async getClubFwClaimedLevels(userId: string, weekStart: string): Promise<number[]> {
    const rows = await db
      .select({ level: clubFwClaimsTable.level })
      .from(clubFwClaimsTable)
      .where(
        and(
          eq(clubFwClaimsTable.userId, userId),
          eq(clubFwClaimsTable.weekStart, weekStart)
        )
      );
    return rows.map(r => r.level);
  }

  async createClubFwClaim(userId: string, weekStart: string, level: number, bonusAmount: number): Promise<void> {
    await db.insert(clubFwClaimsTable).values({ userId, weekStart, level, bonusAmount });
  }

  async checkAndAwardClubFw(userId: string, forWeekStart?: string): Promise<{ newLevels: number[]; totalBonus: number }> {
    // Verifica apostas da semana especificada (ou semana anterior por padrão)
    const weekStart = forWeekStart ?? this.getPreviousManausWeekStart();
    const [weeklyStake, claimedLevels] = await Promise.all([
      this.getWeeklyStake(userId, weekStart),
      this.getClubFwClaimedLevels(userId, weekStart),
    ]);

    // Premia apenas o NÍVEL MAIS ALTO atingido (não cumulativo)
    const highestLevel = [...CLUB_FW_LEVELS].reverse().find(l => weeklyStake >= l.threshold);
    if (!highestLevel) return { newLevels: [], totalBonus: 0 };
    if (claimedLevels.includes(highestLevel.level)) return { newLevels: [], totalBonus: 0 };

    const user = await this.getUserByCpf(userId);
    if (!user) return { newLevels: [], totalBonus: 0 };

    const newBonusBalance = Math.round((user.bonusBalance + highestLevel.bonus) * 100) / 100;
    await this.updateUserBonusBalance(userId, newBonusBalance);
    await this.createClubFwClaim(userId, weekStart, highestLevel.level, highestLevel.bonus);
    await this.createTransaction({
      userId,
      type: "bonus",
      amount: highestLevel.bonus,
      balanceAfter: user.balance,
      description: `Clube FW — Nível ${highestLevel.level} (semana ${weekStart}) +R$${highestLevel.bonus.toFixed(2)} bônus`,
    });

    return { newLevels: [highestLevel.level], totalBonus: highestLevel.bonus };
  }

  async fixOvercreditedClubFw(): Promise<{ fixed: number; totalDeducted: number; details: string[] }> {
    // Encontra usuários com múltiplos claims na mesma semana (overcredit)
    const rows = await db.execute(sql`
      SELECT c.user_id, c.week_start,
             ARRAY_AGG(c.id ORDER BY c.level) AS ids,
             ARRAY_AGG(c.level ORDER BY c.level) AS levels,
             ARRAY_AGG(c.bonus_amount ORDER BY c.level) AS bonuses,
             MAX(c.level) AS highest_level
      FROM ${clubFwClaimsTable} c
      GROUP BY c.user_id, c.week_start
      HAVING COUNT(*) > 1
    `);

    const details: string[] = [];
    let fixed = 0;
    let totalDeducted = 0;

    for (const row of rows.rows as any[]) {
      const userId: string = row.user_id;
      const weekStart: string = row.week_start;
      const ids: number[] = row.ids;
      const levels: number[] = row.levels;
      const bonuses: number[] = row.bonuses;
      const highestLevel: number = row.highest_level;

      // IDs dos claims de nível INFERIOR que devem ser removidos
      const toRemove = ids.filter((_id, i) => levels[i] !== highestLevel);
      const overcredit = bonuses
        .filter((_b, i) => levels[i] !== highestLevel)
        .reduce((s, b) => s + b, 0);

      if (toRemove.length === 0 || overcredit <= 0) continue;

      // Remove claims incorretos
      for (const claimId of toRemove) {
        await db.delete(clubFwClaimsTable).where(eq(clubFwClaimsTable.id, claimId));
      }

      // Deduz overcredit do bonus_balance (não abaixo de 0)
      const user = await this.getUserByCpf(userId);
      if (!user) continue;
      const deduct = Math.min(overcredit, user.bonusBalance);
      const newBonusBalance = Math.round((user.bonusBalance - deduct) * 100) / 100;
      await this.updateUserBonusBalance(userId, newBonusBalance);

      // Registra correção como transação
      await this.createTransaction({
        userId,
        type: "bonus",
        amount: -deduct,
        balanceAfter: user.balance,
        description: `Correção Clube FW — semana ${weekStart}: estorno de R$${deduct.toFixed(2)} (níveis inferiores indevidos)`,
      });

      const msg = `${user.name} (${userId}) semana ${weekStart}: -R$${deduct.toFixed(2)} (níveis removidos: ${toRemove.join(",")})`;
      details.push(msg);
      console.log(`[ClubeFW Fix] ${msg}`);
      fixed++;
      totalDeducted += deduct;
    }

    console.log(`[ClubeFW Fix] Concluído — ${fixed} usuário(s) corrigido(s), -R$${totalDeducted.toFixed(2)} devolvidos`);
    return { fixed, totalDeducted, details };
  }

  async processAllUsersClubFwPayout(weekStart: string): Promise<{ processed: number; totalBonus: number }> {
    const lastPaid = await this.getSetting("club_fw_last_payout_week");
    if (lastPaid === weekStart) {
      return { processed: 0, totalBonus: 0 };
    }

    const allUsers = await this.getAllUsers();
    let processed = 0;
    let totalBonus = 0;

    for (const user of allUsers) {
      try {
        const result = await this.checkAndAwardClubFw(user.cpf, weekStart);
        if (result.newLevels.length > 0) {
          processed++;
          totalBonus += result.totalBonus;
          console.log(`[ClubeFW] Creditado R$${result.totalBonus} para ${user.name} (${user.cpf}) — semana ${weekStart}`);
        }
      } catch (e) {
        console.error(`[ClubeFW] Erro ao processar usuário ${user.cpf}:`, e);
      }
    }

    await this.setSetting("club_fw_last_payout_week", weekStart);
    console.log(`[ClubeFW] Pagamento semana ${weekStart} concluído — ${processed} usuário(s) premiado(s), R$${totalBonus} em bônus`);
    return { processed, totalBonus };
  }

  async getAllClubFwClaims(fromDate?: string, toDate?: string): Promise<{ id: number; userId: string; userName: string; weekStart: string; level: number; bonusAmount: number; createdAt: Date }[]> {
    const allUsers = await this.getAllUsers();
    const userMap = new Map(allUsers.map(u => [u.cpf, u.name]));
    let query = db.select().from(clubFwClaimsTable).$dynamic();
    const conditions = [];
    if (fromDate) conditions.push(gte(clubFwClaimsTable.weekStart, fromDate));
    if (toDate) conditions.push(lte(clubFwClaimsTable.weekStart, toDate));
    if (conditions.length > 0) query = query.where(and(...conditions));
    const rows = await query.orderBy(desc(clubFwClaimsTable.createdAt));
    return rows.map(r => ({
      id: r.id,
      userId: r.userId,
      userName: userMap.get(r.userId) ?? r.userId,
      weekStart: r.weekStart,
      level: r.level,
      bonusAmount: r.bonusAmount,
      createdAt: r.createdAt,
    }));
  }

  private mapCopaCard(r: typeof copaWorldCupCardsTable.$inferSelect): CopaWorldCupCard {
    return {
      id: r.id,
      subTab: r.subTab as CopaWorldCupCard["subTab"],
      title: r.title,
      description: r.description,
      team1: r.team1,
      team2: r.team2,
      odds: r.odds ?? null,
      badge: r.badge,
      imageUrl: r.imageUrl,
      teamsJson: (r as any).teamsJson ?? null,
      active: r.active,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async getCopaCards(subTab?: string): Promise<CopaWorldCupCard[]> {
    const rows = subTab
      ? await db.select().from(copaWorldCupCardsTable).where(eq(copaWorldCupCardsTable.subTab, subTab)).orderBy(desc(copaWorldCupCardsTable.createdAt))
      : await db.select().from(copaWorldCupCardsTable).orderBy(desc(copaWorldCupCardsTable.createdAt));
    return rows.map(r => this.mapCopaCard(r));
  }

  async createCopaCard(data: InsertCopaWorldCupCard): Promise<CopaWorldCupCard> {
    const [row] = await db.insert(copaWorldCupCardsTable).values({
      subTab: data.subTab,
      title: data.title,
      description: data.description ?? "",
      team1: data.team1 ?? "",
      team2: data.team2 ?? "",
      odds: data.odds ?? null,
      badge: data.badge ?? "",
      imageUrl: data.imageUrl ?? "",
      teamsJson: (data as any).teamsJson ?? null,
      active: data.active ?? true,
    }).returning();
    return this.mapCopaCard(row);
  }

  async updateCopaCard(id: number, data: Partial<InsertCopaWorldCupCard>): Promise<CopaWorldCupCard | undefined> {
    const [row] = await db.update(copaWorldCupCardsTable).set({
      ...(data.subTab !== undefined && { subTab: data.subTab }),
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.team1 !== undefined && { team1: data.team1 }),
      ...(data.team2 !== undefined && { team2: data.team2 }),
      ...(data.odds !== undefined && { odds: data.odds }),
      ...(data.badge !== undefined && { badge: data.badge }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      ...((data as any).teamsJson !== undefined && { teamsJson: (data as any).teamsJson }),
      ...(data.active !== undefined && { active: data.active }),
    }).where(eq(copaWorldCupCardsTable.id, id)).returning();
    return row ? this.mapCopaCard(row) : undefined;
  }

  async deleteCopaCard(id: number): Promise<boolean> {
    const result = await db.delete(copaWorldCupCardsTable).where(eq(copaWorldCupCardsTable.id, id)).returning();
    return result.length > 0;
  }

  // ─── Bolão ────────────────────────────────────────────────────────────────
  async getBoloes(): Promise<Bolao[]> {
    return db.select().from(baloesTable).orderBy(desc(baloesTable.createdAt));
  }

  async getActiveBolao(): Promise<Bolao | null> {
    const rows = await db.select().from(baloesTable).where(and(eq(baloesTable.active, true), eq(baloesTable.status, "open"))).limit(1);
    return rows[0] ?? null;
  }

  // ── Duelo ──────────────────────────────────────────────────────────────────
  async getDuelos(): Promise<Duelo[]> {
    return db.select().from(duelosTable).orderBy(desc(duelosTable.createdAt));
  }
  async getActiveDuelos(): Promise<Duelo[]> {
    return db.select().from(duelosTable).where(and(eq(duelosTable.active, true), eq(duelosTable.status, "open"))).orderBy(desc(duelosTable.createdAt));
  }
  async createDuelo(data: Partial<Duelo>): Promise<Duelo> {
    const [row] = await db.insert(duelosTable).values(data as any).returning();
    return row;
  }
  async updateDuelo(id: number, data: Partial<Duelo>): Promise<Duelo | undefined> {
    const [row] = await db.update(duelosTable).set(data as any).where(eq(duelosTable.id, id)).returning();
    return row ?? undefined;
  }
  async deleteDuelo(id: number): Promise<boolean> {
    const result = await db.delete(duelosTable).where(eq(duelosTable.id, id)).returning();
    return result.length > 0;
  }
  async getDueloEntries(dueloId: number): Promise<DueloEntry[]> {
    return db.select().from(dueloEntriesTable).where(eq(dueloEntriesTable.dueloId, dueloId)).orderBy(desc(dueloEntriesTable.createdAt));
  }
  async getDueloEntriesByUser(userId: string): Promise<DueloEntry[]> {
    return db.select().from(dueloEntriesTable).where(eq(dueloEntriesTable.userId, userId)).orderBy(desc(dueloEntriesTable.createdAt));
  }
  async createDueloEntry(data: { dueloId: number; userId: string; side: string }): Promise<DueloEntry> {
    const [row] = await db.insert(dueloEntriesTable).values({ ...data, prizeAwarded: false }).returning();
    return row;
  }
  async finishDuelo(dueloId: number, winnerSide: string): Promise<{ winners: number; prizePerWinner: number; totalEntries: number; total: number; houseProfit: number }> {
    const [duelo] = await db.select().from(duelosTable).where(eq(duelosTable.id, dueloId)).limit(1);
    if (!duelo) throw new Error("Duelo não encontrado");
    const entries = await db.select().from(dueloEntriesTable).where(eq(dueloEntriesTable.dueloId, dueloId));
    const totalEntries = entries.length;
    const grossTotal = Math.round(totalEntries * (duelo.entryFee ?? 10) * 100) / 100;
    const houseCutPct = duelo.houseCut ?? 0;
    const total = Math.round(grossTotal * (1 - houseCutPct / 100) * 100) / 100;
    const houseProfit = Math.round((grossTotal - total) * 100) / 100;
    const winners = entries.filter(e => e.side === winnerSide);
    const prizePerWinner = winners.length > 0 ? Math.round((total / winners.length) * 100) / 100 : 0;
    await db.update(duelosTable).set({ status: "finished", winnerSide }).where(eq(duelosTable.id, dueloId));
    for (const w of winners) {
      await db.update(dueloEntriesTable).set({ prizeAwarded: true, prizeAmount: prizePerWinner }).where(eq(dueloEntriesTable.id, w.id));
    }
    return { winners: winners.length, prizePerWinner, totalEntries, total, houseProfit };
  }

  async createBolao(data: InsertBolao): Promise<Bolao> {
    const [row] = await db.insert(baloesTable).values(data).returning();
    return row;
  }

  async updateBolao(id: number, data: Partial<InsertBolao>): Promise<Bolao | undefined> {
    const [row] = await db.update(baloesTable).set(data).where(eq(baloesTable.id, id)).returning();
    return row ?? undefined;
  }

  async deleteBolao(id: number): Promise<boolean> {
    const result = await db.delete(baloesTable).where(eq(baloesTable.id, id)).returning();
    return result.length > 0;
  }

  async createBolaoEntry(data: { bolaoId: number; userId: string; homeScore: number; awayScore: number }): Promise<BolaoEntry> {
    const [row] = await db.insert(bolaoEntriesTable).values({ ...data, prizeAwarded: false }).returning();
    return row;
  }

  async getBolaoEntries(bolaoId: number): Promise<BolaoEntry[]> {
    return db.select().from(bolaoEntriesTable).where(eq(bolaoEntriesTable.bolaoId, bolaoId)).orderBy(desc(bolaoEntriesTable.createdAt));
  }

  async getBolaoEntriesByUser(userId: string): Promise<BolaoEntry[]> {
    return db.select().from(bolaoEntriesTable)
      .where(and(eq(bolaoEntriesTable.userId, userId), eq(bolaoEntriesTable.hidden, false)))
      .orderBy(desc(bolaoEntriesTable.createdAt));
  }

  async deleteAllBolaoEntriesByUser(userId: string): Promise<void> {
    // Never physically delete bolão entries — they are paid tickets and must remain visible to admins.
    // Instead, mark them as hidden so the user's "Meus Palpites" view is cleared.
    await db.update(bolaoEntriesTable).set({ hidden: true }).where(eq(bolaoEntriesTable.userId, userId));
  }

  async finishBolao(bolaoId: number, homeScore: number, awayScore: number): Promise<{ winners: number; prizePerWinner: number; totalEntries: number; total: number }> {
    const bolao = await db.select().from(baloesTable).where(eq(baloesTable.id, bolaoId)).limit(1);
    if (!bolao[0]) throw new Error("Bolão não encontrado");
    const entries = await db.select().from(bolaoEntriesTable).where(eq(bolaoEntriesTable.bolaoId, bolaoId));
    const totalEntries = entries.length;
    const grossTotal = Math.round(totalEntries * (bolao[0].entryFee ?? 10) * 100) / 100;
    const houseCutPct = bolao[0].houseCut ?? 0;
    const total = Math.round(grossTotal * (1 - houseCutPct / 100) * 100) / 100;
    const winners = entries.filter(e => e.homeScore === homeScore && e.awayScore === awayScore);
    const prizePerWinner = winners.length > 0 ? Math.round((total / winners.length) * 100) / 100 : 0;

    // Mark winners & award prize via transactions (handled in route)
    await db.update(baloesTable).set({ status: "finished", actualHomeScore: homeScore, actualAwayScore: awayScore }).where(eq(baloesTable.id, bolaoId));

    // Mark prize awarded for winners and store the actual prize amount
    for (const w of winners) {
      await db.update(bolaoEntriesTable).set({ prizeAwarded: true, prizeAmount: prizePerWinner }).where(eq(bolaoEntriesTable.id, w.id));
    }

    const houseProfit = Math.round((grossTotal - total) * 100) / 100;
    return { winners: winners.length, prizePerWinner, totalEntries, total, houseProfit };
  }

  // ── Notifications ───────────────────────────────────────────────────────────
  async createNotification(data: { title: string; body: string; type: string; targetCpfs?: string[] | null; imageUrl?: string | null; imageData?: string | null; mimeType?: string | null }) {
    const [n] = await db.insert(notificationsTable).values({
      title: data.title, body: data.body, type: data.type,
      targetCpfs: data.targetCpfs ?? null, active: true,
      imageUrl: data.imageUrl ?? null,
      imageData: data.imageData ?? null,
      mimeType: data.mimeType ?? null,
    }).returning();
    return n;
  }

  async updateNotificationImage(id: number, imageData: string, mimeType: string) {
    await db.update(notificationsTable).set({ imageData, mimeType }).where(eq(notificationsTable.id, id));
  }

  async getNotificationImage(id: number) {
    const [n] = await db.select({ imageData: notificationsTable.imageData, mimeType: notificationsTable.mimeType })
      .from(notificationsTable).where(eq(notificationsTable.id, id)).limit(1);
    if (!n?.imageData) return null;
    return { imageData: n.imageData, mimeType: n.mimeType };
  }

  async getNotifications() {
    const rows = await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt));
    return rows.map(({ imageData, mimeType, ...rest }) => ({ ...rest, hasImage: !!imageData }));
  }

  async getNotificationsForUser(userCpf: string) {
    const all = await db.select().from(notificationsTable)
      .where(eq(notificationsTable.active, true))
      .orderBy(desc(notificationsTable.createdAt));
    const reads = await db.select().from(notificationReadsTable)
      .where(eq(notificationReadsTable.userCpf, userCpf));
    const readSet = new Set(reads.filter(r => !r.dismissed).map(r => r.notificationId));
    const dismissedSet = new Set(reads.filter(r => r.dismissed).map(r => r.notificationId));
    return all
      .filter(n => !n.targetCpfs || n.targetCpfs.includes(userCpf))
      .filter(n => !dismissedSet.has(n.id))
      .map(({ imageData, mimeType, ...n }) => ({ ...n, hasImage: !!imageData, read: readSet.has(n.id) }));
  }

  async dismissNotification(notificationId: number, userCpf: string) {
    const existing = await db.select().from(notificationReadsTable)
      .where(and(eq(notificationReadsTable.notificationId, notificationId), eq(notificationReadsTable.userCpf, userCpf)))
      .limit(1);
    if (existing.length > 0) {
      await db.update(notificationReadsTable)
        .set({ dismissed: true })
        .where(and(eq(notificationReadsTable.notificationId, notificationId), eq(notificationReadsTable.userCpf, userCpf)));
    } else {
      await db.insert(notificationReadsTable)
        .values({ notificationId, userCpf, dismissed: true });
    }
  }

  async dismissAllNotifications(userCpf: string) {
    const all = await db.select({ id: notificationsTable.id })
      .from(notificationsTable).where(eq(notificationsTable.active, true));
    for (const n of all) {
      await this.dismissNotification(n.id, userCpf);
    }
  }

  async getUnreadCountForUser(userCpf: string) {
    const notifications = await this.getNotificationsForUser(userCpf);
    return notifications.filter(n => !n.read).length;
  }

  async markNotificationRead(notificationId: number, userCpf: string) {
    await db.insert(notificationReadsTable)
      .values({ notificationId, userCpf })
      .onConflictDoNothing();
  }

  async markAllNotificationsRead(userCpf: string) {
    const notifications = await this.getNotificationsForUser(userCpf);
    const unread = notifications.filter(n => !n.read);
    for (const n of unread) {
      await db.insert(notificationReadsTable)
        .values({ notificationId: n.id, userCpf })
        .onConflictDoNothing();
    }
  }

  async deleteNotification(id: number) {
    await db.delete(notificationReadsTable).where(eq(notificationReadsTable.notificationId, id));
    const result = await db.delete(notificationsTable).where(eq(notificationsTable.id, id)).returning();
    return result.length > 0;
  }

  async toggleNotificationActive(id: number) {
    const [current] = await db.select().from(notificationsTable).where(eq(notificationsTable.id, id)).limit(1);
    if (!current) return null;
    const [updated] = await db.update(notificationsTable)
      .set({ active: !current.active }).where(eq(notificationsTable.id, id)).returning();
    return updated;
  }
}

export function getManausWeekStart(): string {
  const now = new Date();
  const manausTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const dayOfWeek = manausTime.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(manausTime.getTime() - daysToMonday * 24 * 60 * 60 * 1000);
  const year = monday.getUTCFullYear();
  const month = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const day = String(monday.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getBrasiliaWeekStart(): string {
  return getManausWeekStart();
}

export const storage = new DatabaseStorage();
