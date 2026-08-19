> {
    for (const o of overrides) {
      const existing = await db.select().from(gameMarketOverridesTable)
        .where(and(eq(gameMarketOverridesTable.gameId, o.gameId), eq(gameMarketOverridesTable.marketKey, o.marketKey)));
      if (existing.length > 0) {
        await db.update(gameMarketOverridesTable)
          .set({ adjustPercent: o.adjustPercent, homeTeam: o.homeTeam, awayTeam: o.awayTeam })
          .where(and(eq(gameMarketOverridesTable.gameId, o.gameId), eq(gameMarketOverridesTable.marketKey, o.marketKey)));
      } else {
        await db.insert(gameMarketOverridesTable).values(o);
      }
    }
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

  async getBannerRules(): Promise<string> {
    const rows = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "banner_rules"));
    return rows[0]?.content ?? "";
  }

  async saveBannerRules(content: string): Promise<void> {
    const existing = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "banner_rules"));
    if (existing.length > 0) {
      await db.update(siteContentTable).set({ content, updatedAt: new Date() }).where(eq(siteContentTable.key, "banner_rules"));
    } else {
      await db.insert(siteContentTable).values({ key: "banner_rules", content });
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
    const safeISO = (v: any): string => {
      if (!v) return new Date().toISOString();
      if (v instanceof Date) return v.toISOString();
      return new Date(v).toISOString();
    };
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
      startsAt: safeISO(r.startsAt),
      endsAt: safeISO(r.endsAt),
      active: r.active,
      result: (r.result as "pending" | "won" | "lost") ?? "pending",
      gradientFrom: (r as any).gradientFrom ?? "#0f2d6b",
      gradientTo: (r as any).gradientTo ?? "#1a0a0a",
      maxStake: (r as any).maxStake ?? null,
      minStake: (r as any).minStake ?? null,
      hasImage: !!((r as any).imageData),
      fakeCounterTarget: (r as any).fakeCounterTarget ?? 0,
      fakeCounterStart: (r as any).fakeCounterStart ?? 0,
      cardType: ((r as any).cardType ?? "boost") as "boost" | "banner",
      showLuckyCount: (r as any).showLuckyCount ?? false,
      showRules: (r as any).showRules ?? (r as any).show_rules ?? false,
      rulesContent: (r as any).rulesContent ?? (r as any).rules_content ?? "",
      createdAt: safeISO(r.createdAt),
    };
  }

  // Maps a raw pool.query() row (snake_case keys) to BoostCard
  private mapRawBoostCard(r: any): BoostCard {
    const safeISO = (v: any): string => {
      if (!v) return new Date().toISOString();
      if (v instanceof Date) return v.toISOString();
      return new Date(String(v)).toISOString();
    };
    return {
      id: r.id,
      eventName: r.event_name ?? "",
      matchTitle: r.match_title ?? "",
      description: r.description ?? "",
      selections: (typeof r.selections === "string" ? JSON.parse(r.selections) : r.selections) ?? [],
      originalOdds: r.original_odds ?? 0,
      boostedOdds: r.boosted_odds ?? 0,
      outcomes: (typeof r.outcomes === "string" ? JSON.parse(r.outcomes) : r.outcomes) ?? [],
      outcomeResults: (typeof r.outcome_results === "string" ? JSON.parse(r.outcome_results) : r.outcome_results) ?? [],
      subtitle: r.subtitle ?? "",
      startsAt: safeISO(r.starts_at),
      endsAt: safeISO(r.ends_at),
      active: r.active,
      result: (r.result ?? "pending") as "pending" | "won" | "lost",
      gradientFrom: r.gradient_from ?? "#0f2d6b",
      gradientTo: r.gradient_to ?? "#1a0a0a",
      maxStake: r.max_stake ?? null,
      minStake: r.min_stake ?? null,
      hasImage: !!(r.image_data),
      fakeCounterTarget: r.fake_counter_target ?? 0,
      fakeCounterStart: r.fake_counter_start ?? 0,
      cardType: (r.card_type ?? "boost") as "boost" | "banner",
      showLuckyCount: r.show_lucky_count ?? false,
      showRules: r.show_rules ?? false,
      rulesContent: r.rules_content ?? "",
      createdAt: safeISO(r.created_at),
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
    const showRulesVal: boolean = (data as any).showRules ?? false;
    const rulesContentVal: string = (data as any).rulesContent ?? "";
    // Use raw SQL insert so show_rules and rules_content are included in one shot
    const insertResult = await pool.query<any>(
      `INSERT INTO boost_cards
        (event_name, match_title, description, selections, original_odds, boosted_odds,
         outcomes, subtitle, starts_at, ends_at, active, gradient_from, gradient_to,
         max_stake, min_stake, fake_counter_target, fake_counter_start, card_type,
         show_lucky_count, show_rules, rules_content)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        data.eventName ?? "",
        data.matchTitle ?? "",
        data.description ?? "",
        JSON.stringify(data.selections ?? []),
        data.originalOdds ?? 1,
        data.boostedOdds ?? 1,
        JSON.stringify(data.outcomes ?? []),
        (data as any).subtitle ?? "",
        new Date(data.startsAt),
        new Date(data.endsAt),
        data.active ?? true,
        (data as any).gradientFrom ?? "#0f2d6b",
        (data as any).gradientTo ?? "#1a0a0a",
        (data as any).maxStake ?? null,
        (data as any).minStake ?? null,
        (data as any).fakeCounterTarget ?? 0,
        (data as any).fakeCounterStart ?? 0,
        (data as any).cardType ?? "boost",
        (data as any).showLuckyCount ?? false,
        showRulesVal,
        rulesContentVal,
      ]
    );
    const raw = insertResult.rows[0];
    // Map snake_case pool result to BoostCard
    return this.mapRawBoostCard(raw);
  }

  async updateBoostCard(id: number, data: Partial<InsertBoostCard>): Promise<BoostCard | undefined> {
    const d = data as any;
    const setClauses: string[] = [];
    const params: unknown[] = [id];
    const add = (col: string, val: unknown) => {
      setClauses.push(`${col} = $${params.length + 1}`);
      params.push(val);
    };
    if (d.eventName !== undefined) add("event_name", d.eventName);
    if (d.matchTitle !== undefined) add("match_title", d.matchTitle);
    if (d.description !== undefined) add("description", d.description);
    if (d.selections !== undefined) add("selections", JSON.stringify(d.selections));
    if (d.originalOdds !== undefined) add("original_odds", d.originalOdds);
    if (d.boostedOdds !== undefined) add("boosted_odds", d.boostedOdds);
    if (d.outcomes !== undefined) add("outcomes", JSON.stringify(d.outcomes));
    if (d.subtitle !== undefined) add("subtitle", d.subtitle);
    if (d.startsAt !== undefined) add("starts_at", new Date(d.startsAt));
    if (d.endsAt !== undefined) add("ends_at", new Date(d.endsAt));
    if (d.active !== undefined) add("active", d.active);
    if (d.gradientFrom !== undefined) add("gradient_from", d.gradientFrom);
    if (d.gradientTo !== undefined) add("gradient_to", d.gradientTo);
    if (d.maxStake !== undefined) add("max_stake", d.maxStake);
    if (d.minStake !== undefined) add("min_stake", d.minStake);
    if (d.fakeCounterTarget !== undefined) add("fake_counter_target", d.fakeCounterTarget);
    if (d.fakeCounterStart !== undefined) add("fake_counter_start", d.fakeCounterStart);
    if (d.cardType !== undefined) add("card_type", d.cardType);
    if (d.showLuckyCount !== undefined) add("show_lucky_count", d.showLuckyCount);
    if (d.showRules !== undefined) add("show_rules", d.showRules);
    if (d.rulesContent !== undefined) add("rules_content", d.rulesContent);
    if (d.imageData !== undefined) add("image_data", d.imageData);
    if (d.mimeType !== undefined) add("mime_type", d.mimeType);
    if (setClauses.length === 0) {
      const existing = await pool.query<any>("SELECT * FROM boost_cards WHERE id = $1", [id]);
      return existing.rows[0] ? this.mapRawBoostCard(existing.rows[0]) : undefined;
    }
    const result = await pool.query<any>(
      `UPDATE boost_cards SET ${setClauses.join(", ")} WHERE id = $1 RETURNING *`,
      params
    );
    return result.rows[0] ? this.mapRawBoostCard(result.rows[0]) : undefined;
  }

  async resolveBoostCard(id: number, result: "pending" | "won" | "lost", outcomeIdx?: number): Promise<{ card: BoostCard; affectedBets: number; affectedBetIds: string[] }> {
    let updatedRow: typeof boostCardsTable.$inferSelect;
    let selectionId: string;

    if (outcomeIdx !== undefined) {
      // Multi-outcome: update only that outcome's result in outcomeResults array
      const [existing] = await db.select().from(boostCardsTable).where(eq(boostCardsTable.id, id));
      if (!existing) throw new Error("Boost card nÃ£o encontrado");

      const currentResults = ((existing.outcomeResults ?? []) as ("pending" | "won" | "lost")[]);
      const outcomes = ((existing.outcomes ?? []) as any[]);
      const newResults = outcomes.map((_, i) => (i === outcomeIdx ? result : (currentResults[i] ?? "pending")));

      const [row] = await db.update(boostCardsTable)
        .set({ outcomeResults: newResults })
        .where(eq(boostCardsTable.id, id))
        .returning();
      if (!row) throw new Error("Boost card nÃ£o encontrado");
      updatedRow = row;
      selectionId = `boost-${id}-${outcomeIdx}`;
    } else {
      // Simple card: update top-level result
      const [row] = await db.update(boostCardsTable)
        .set({ result })
        .where(eq(boostCardsTable.id, id))
        .returning();
      if (!row) throw new Error("Boost card nÃ£o encontrado");
      updatedRow = row;
      selectionId = `boost-${id}`;
    }

    const card = this.mapBoostCard(updatedRow);
    // Process all pending bets that contain this boost selection
    const allBets = await db.select().from(betSlipsTable).where(eq(betSlipsTable.status, "pending"));
    let affectedBets = 0;
    const affectedBetIds: string[] = [];

    for (const bet of allBets) {
      const sels = bet.selections as any[];
      const boostSel = sels.find((s: any) => s.id === selectionId);
      if (!boostSel) continue;
      await this.updateSelectionResult(bet.id, selectionId, result);
      affectedBets++;
      affectedBetIds.push(bet.id);
    }

    return { card, affectedBets, affectedBetIds };
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
      // NOTE: pushToken is intentionally excluded from the public User DTO
      // to prevent token leakage through API endpoints. Use getUserPushToken().
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

  async updateUserPushToken(cpf: string, pushToken: string): Promise<void> {
    await db.update(usersTable).set({ pushToken }).where(eq(usersTable.cpf, cpf));
  }

  async getUserPushToken(cpf: string): Promise<string | null> {
    const [row] = await db.select({ pushToken: usersTable.pushToken }).from(usersTable).where(eq(usersTable.cpf, cpf));
    return row?.pushToken ?? null;
  }

  async getAllPushTokens(cpfs?: string[]): Promise<{ cpf: string; pushToken: string }[]> {
    const rows = await db.select({ cpf: usersTable.cpf, pushToken: usersTable.pushToken }).from(usersTable);
    return rows.filter(r => r.pushToken && (!cpfs || cpfs.includes(r.cpf))) as { cpf: string; pushToken: string }[];
  }

  async getUserPushPreferences(cpf: string): Promise<Record<string, boolean>> {
    const DEFAULT = { live_game: true, bet_won: true, deposit_confirmed: true, admin: true };
    try {
      const [row] = await db.select({ pushPreferences: usersTable.pushPreferences }).from(usersTable).where(eq(usersTable.cpf, cpf));
      if (!row?.pushPreferences) return DEFAULT;
      return { ...DEFAULT, ...JSON.parse(row.pushPreferences) };
    } catch { return DEFAULT; }
  }

  async updateUserPushPreferences(cpf: string, prefs: Record<string, boolean>): Promise<void> {
    await db.update(usersTable).set({ pushPreferences: JSON.stringify(prefs) }).where(eq(usersTable.cpf, cpf));
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
    await db.delete(withdrawalsTable);
    await db.delete(defensasTable);
    await db.update(usersTable).set({ balance: 0, bonusBalance: 0, firstDepositDone: false });
    await this.setSetting("defensasProfits", "0");
    await this.setSetting("caixaExtras", "0");
    const savedInitial = await this.getSetting("defensasInitialBalance");
    const initial = savedInitial ? String(parseFloat(savedInitial) || 1000) : "1000";
    await this.setSetting("defensasBalance", initial);
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
    const [row] = await db.update(userWithdrawalsTable).set({ status: "paid", paidAt: new Date() }).where(eq(userWithdrawalsTabg'2‚“°¢ÆWB&ö6W76VBÒ°¢ÆWBF÷FÄ&öçW2Ò° ¢f÷"†6öç7BW6W"öbÆÅW6W'2’°¢G'’°¢6öç7B&W7VÇBÒv—BF†—2æ6†V6´æDv&D6ÇV%fW&æò‡W6W"æ7bÂvVVµ7F'B“°¢–b‡&W7VÇBææWtÆWfVÇ2æÆVæwF‚â’°¢&ö6W76VB²³°¢F÷FÄ&öçW2³Ò&W7VÇBçF÷FÄ&öçW3°¢6öç6öÆRæÆör†´6ÇV&TeuÒ7&VF—FFò"BG·&W7VÇBçF÷FÄ&öçW7Ò&G·W6W"ææÖWÒ‚G·W6W"æ7gÒ’(	B6VÖæG·vVVµ7F'GÖ“°¢Ğ¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"†´6ÇV&TeuÒW'&òò&ö6W76"W7\:&–òG·W6W"æ7gÓ¦ÂR“°¢Ğ¢Ğ ¢v—BF†—2ç6WE6WGF–ær‚&6ÇV%÷fW&æõöÆ7E÷–÷WE÷vVV²"ÂvVVµ7F'B“°¢6öç6öÆRæÆör†´6ÇV&TeuÒvÖVçFò6VÖæG·vVVµ7F'GÒ6öæ6Ç\:ÖFò(	BG·&ö6W76VGÒW7\:&–ò‡2’&VÖ–Fò‡2’Â"BG·F÷FÄ&öçW7ÒVÒ,;FçW6“°¢&WGW&â²&ö6W76VBÂF÷FÄ&öçW2Ó°¢Ğ ¢7–æ2vWDÆÄ6ÇV%fW&æô6Æ–×2†g&öÔFFSó¢7G&–ærÂFôFFSó¢7G&–ær“¢&öÖ—6SÇ²–C¢çVÖ&W#²W6W$–C¢7G&–æs²W6W$æÖS¢7G&–æs²vVVµ7F'C¢7G&–æs²ÆWfVÃ¢çVÖ&W#²&öçW4Ö÷VçC¢çVÖ&W#²7&VFVDC¢FFRÕµÓâ°¢6öç7BÆÅW6W'2Òv—BF†—2ævWDÆÅW6W'2‚“°¢6öç7BW6W$ÖÒæWrÖ†ÆÅW6W'2æÖ‡RÓâ·Ræ7bÂRææÖUÒ’“°¢ÆWBVW'’ÒF"ç6VÆV7B‚’æg&öÒ†6ÇV%fW&æô6Æ–×5F&ÆR’âFG–æÖ–2‚“°¢6öç7B6öæF—F–öç2ÒµÓ°¢–b†g&öÔFFR’6öæF—F–öç2çW6‚†wFR†6ÇV%fW&æô6Æ–×5F&ÆRçvVVµ7F'BÂg&öÔFFR’“°¢–b‡FôFFR’6öæF—F–öç2çW6‚†ÇFR†6ÇV%fW&æô6Æ–×5F&ÆRçvVVµ7F'BÂFôFFR’“°¢–b†6öæF—F–öç2æÆVæwF‚â’VW'’ÒVW'’çv†W&R†æB‚ââæ6öæF—F–öç2’“°¢6öç7B&÷w2Òv—BVW'’æ÷&FW$'’†FW62†6ÇV%fW&æô6Æ–×5F&ÆRæ7&VFVDB’“°¢&WGW&â&÷w2æÖ‡"Óâ‡°¢–C¢"æ–BÀ¢W6W$–C¢"çW6W$–BÀ¢W6W$æÖS¢W6W$ÖævWB‡"çW6W$–B’óò"çW6W$–BÀ¢vVVµ7F'C¢"çvVVµ7F'BÀ¢ÆWfVÃ¢"æÆWfVÂÀ¢&öçW4Ö÷VçC¢"æ&öçW4Ö÷VçBÀ¢7&VFVDC¢"æ7&VFVDBÀ¢Ò’“°¢Ğ ¢òò)H)H)H6÷'FRfW&æò)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H  ¢ò¢ ¢¢&WGW&ç2v†–6‚W&–öB”G2&R7W'&VçFÇ’÷Vâf÷"çVÖ&W"vVæW&F–öâà¢ ¢¢'VÆW3 ¢¢ÒW&–öG2(	3BV6‚†fRF†V—"÷vâW†6ÇW6—fR6öÆÆV7F–öâv–æF÷s²vVæW&FP¢¢çVÖ&W"f÷"v†–6†WfW"öæR—27F—fR&–v‡Bæ÷r†BÖ÷7BöæRBF–ÖR’à¢¢ÒW&–öBR—2F†R&w&æFRW&:|:6òFRFW¦VÖ'&ò#¢—BFöW2äõBvVæW&FP¢¢6W&FRçVÖ&W'2GW&–ærF†R6ÖRv–æF÷r2W&–öG2(	3Bâ—BöæÇ’÷Vç0¢¢f÷"æWrçVÖ&W"vVæW&F–öâgFW"ÄÂ÷F†W"W&–öG2†fRVæFVB†’æRâgFW ¢¢F†RÆ7BW&–öB(	3B6öÆÆV7F–öäVæBFFRÂv†–6‚—2##bÓÓ3’âGW&–æp¢¢F†RFV6VÖ&W"v–æF÷r—BvVæW&FW2öæRW‡G&6WBöbçVÖ&W'2öâF÷öbÆÀ¢¢F†R67V×VÆFVBçVÖ&W'2g&öÒW&–öG2(	3Bà¢¢ÒF†RW&–öBRG&r–æ6ÇVFW2WfW'’çVÖ&W"WfW"vVæW&FVB‡W&–öG2(	3B°¢¢ç’FV6VÖ&W"×7V6–f–2çVÖ&W'2v—F‚W&–öD–BÒR’à¢¢ğ¢&—fFRvWD7F—fUW&–öD–G2‚“¢çVÖ&W%µÒ°¢6öç7BFöF’ÒæWrFFR‚’çFô•4õ7G&–ær‚’ç6Æ–6RƒÂ“²òò%•••’ÔÔÒÔDB  ¢òò&–Ö'’W&–öG2ƒÓB“¢V6‚†2—G2÷vâW†6ÇW6—fRv–æF÷p¢6öç7B&–Ö'•W&–öG2Ò4õ%DUõdU$äõõU$”ôE0¢æf–ÇFW"‡Óâæ–BÓÒRbbFöF’ãÒæ6öÆÆV7F–öå7F'BbbFöF’ÃÒæ6öÆÆV7F–öäVæB¢æÖ‡Óâæ–B“° ¢òòW&–öBR„FV6VÖ&W"ÖöæÇ’v–æF÷r“¢öæÇ’7F—fRgFW"ÆÂ&–Ö'’W&–öG26Æ÷6P¢6öç7BÆ7E&–Ö'”VæBÒ4õ%DUõdU$äõõU$”ôE0¢æf–ÇFW"‡Óâæ–BÓÒR¢æÖ‡Óâæ6öÆÆV7F–öäVæB¢ç6÷'B‚¢æB‚Ó’óò#“““’Ó"Ó3#²òò###bÓÓ3 ¢6öç7BW&–öCRÒ4õ%DUõdU$äõõU$”ôE2æf–æB‡Óâæ–BÓÓÒR’°¢–b‡FöF’âÆ7E&–Ö'”VæBbbFöF’ÃÒW&–öCRæ6öÆÆV7F–öäVæB’°¢&–Ö'•W&–öG2çW6‚ƒR“°¢Ğ ¢&WGW&â&–Ö'•W&–öG3°¢Ğ ¢7–æ2vVæW&FTÇV6·”çVÖ&W'2‡W6W$–C¢7G&–ærÂ6ÇV$ÆWfVÃ¢çVÖ&W"“¢&öÖ—6SÅ6÷'FUfW&æôçVÖ&W%µÓâ°¢6öç7B6÷VçBÒ4õ%DUõdU$äõôåTÔ$U%5õU%ôÄUdTÅ¶6ÇV$ÆWfVÅÒóò°¢6öç7B7F—fUW&–öG2ÒF†—2ævWD7F—fUW&–öD–G2‚“°¢–b†7F—fUW&–öG2æÆVæwF‚ÓÓÒ’&WGW&âµÓ° ¢òòvWBÆÂW†—7F–ærçVÖ&W'2FòVç7W&RvÆö&ÂVæ—VVæW70¢6öç7BW†—7F–æu&÷w2Òv—BF"ç6VÆV7B‡²çVÖ&W#¢6÷'FUfW&æôçVÖ&W'5F&ÆRæçVÖ&W"Ò’æg&öÒ‡6÷'FUfW&æôçVÖ&W'5F&ÆR“°¢6öç7BW6VDçVÖ&W'2ÒæWr6WB†W†—7F–æu&÷w2æÖ‡"Óâ"æçVÖ&W"’“° ¢6öç7BvVæW&FVC¢6÷'FUfW&æôçVÖ&W%µÒÒµÓ° ¢f÷"†6öç7BW&–öD–Böb7F—fUW&–öG2’°¢f÷"†ÆWB’Ò²’Â6÷VçC²’²²’°¢ÆWBGFV×G2Ò°¢ÆWB6æF–FFS¢7G&–æs°¢Fò°¢6öç7BâÒÖF‚æfÆö÷"„ÖF‚ç&æFöÒ‚’¢““““’’²°¢6æF–FFRÒ7G&–ær†â’çE7F'BƒRÂ#"“°¢GFV×G2²³°¢–b†GFV×G2â’F‡&÷ræWrW'&÷"‚%6÷'FRfW&æó¢W6v÷F÷RFVçFF—f2FRì;¦ÖW&ò;¦æ–6ò"“°¢Òv†–ÆR‡W6VDçVÖ&W'2æ†2†6æF–FFR’“° ¢W6VDçVÖ&W'2æFB†6æF–FFR“°¢6öç7B·&÷uÒÒv—BF"æ–ç6W'B‡6÷'FUfW&æôçVÖ&W'5F&ÆR’çfÇVW2‡°¢W6W$–BÀ¢çVÖ&W#¢6æF–FFRÀ¢W&–öD–BÀ¢6ÇV$ÆWfVÂÀ¢Ò’ç&WGW&æ–ær‚“°¢vVæW&FVBçW6‚‡&÷r“°¢Ğ¢Ğ ¢6öç6öÆRæÆör†µ6÷'FUfW&æõÒG¶6÷VçGÒì;¦ÖW&ò‡2’vW&Fò‡2’&G·W6W$–GÒ†ì:×fVÂG¶6ÇV$ÆWfVÇÒÂW,:ÖöF÷2G¶7F—fUW&–öG2æ¦ö–â‚"Â"—Ò–“°¢&WGW&âvVæW&FVC°¢Ğ ¢7–æ2vWEW6W$ÇV6·”çVÖ&W'2‡W6W$–C¢7G&–ær“¢&öÖ—6SÅ6÷'FUfW&æôçVÖ&W%µÓâ°¢&WGW&âF"ç6VÆV7B‚’æg&öÒ‡6÷'FUfW&æôçVÖ&W'5F&ÆR¢çv†W&R†W‡6÷'FUfW&æôçVÖ&W'5F&ÆRçW6W$–BÂW6W$–B’¢æ÷&FW$'’‡6÷'FUfW&æôçVÖ&W'5F&ÆRçW&–öD–BÂ6÷'FUfW&æôçVÖ&W'5F&ÆRæ7&VFVDB“°¢Ğ ¢7–æ2vWDÆÄÇV6·”çVÖ&W'2‚“¢&öÖ—6SÂ…6÷'FUfW&æôçVÖ&W"b²W6W$æÖS¢7G&–ærÂçVÆÃ²W6W%†öæS¢7G&–ærÂçVÆÂÒ•µÓâ°¢6öç7B¶çVÖ&W'2ÂW6W'5ÒÒv—B&öÖ—6RæÆÂ…°¢F"ç6VÆV7B‚’æg&öÒ‡6÷'FUfW&æôçVÖ&W'5F&ÆR’æ÷&FW$'’‡6÷'FUfW&æôçVÖ&W'5F&ÆRçW&–öD–BÂ6÷'FUfW&æôçVÖ&W'5F&ÆRæçVÖ&W"’À¢F†—2ævWDÆÅW6W'2‚’À¢Ò“°¢6öç7BW6W$ÖÒæWrÖ‡W6W'2æÖ‡RÓâ·Ræ7bÂUÒ’“°¢&WGW&âçVÖ&W'2æÖ†âÓâ‡°¢ââæâÀ¢W6W$æÖS¢W6W$ÖævWB†âçW6W$–B“òææÖRóòçVÆÂÀ¢W6W%†öæS¢W6W$ÖævWB†âçW6W$–B“òç†öæRóòçVÆÂÀ¢Ò’“°¢Ğ ¢òòvW&ì;¦ÖW&÷2&WG&öF—fÖVçFR&W7\:&–÷2VR¬:L:¦Ò6Æ–×26ÇV&Rep¢òòÖ2ì:6òL:¦Òì;¦ÖW&÷2&÷2W,:ÖöF÷2F—f÷2à¢òò<;26öç6–FW&6Æ–×27&–F÷2'F—"Fò–ì:Ö6–òFò&öw&Ö6÷'FRfW&æğ¢òò†FFFR–ì:Ö6–òFòW,:ÖöFòFR6öÆWFÖ—2çF–vòF÷2W,:ÖöF÷2(	3B’à¢7–æ2vVæW&FTÖ—76–ætÇV6·”çVÖ&W'2‚“¢&öÖ—6SÇ²vVæW&FVC¢çVÖ&W#²W6W'5&ö6W76VC¢çVÖ&W"Óâ°¢6öç7B7F—fUW&–öG2ÒF†—2ævWD7F—fUW&–öD–G2‚“°¢–b†7F—fUW&–öG2æÆVæwF‚ÓÓÒ’°¢6öç6öÆRæÆör‚%µ6÷'FUfW&æò&WG&õÒæVæ‡VÒW,:ÖöFòF—fò(	BæFf¦W""“°¢&WGW&â²vVæW&FVC¢ÂW6W'5&ö6W76VC¢Ó°¢Ğ ¢òò–ì:Ö6–òFò&öw&Ö¢FFFR–ì:Ö6–òFòW,:ÖöFòFR6öÆWFÖ—2çF–vò†W†6ÇV–æFòW,:ÖöFòR¢6öç7B&öw&Õ7F'BÒ4õ%DUõdU$äõõU$”ôE0¢æf–ÇFW"‡Óâæ–BÓÒR¢æÖ‡Óâæ6öÆÆV7F–öå7F'B¢ç6÷'B‚¢æBƒ’²òò###bÓ‚Ó  ¢òò<;26öç6–FW&6Æ–×27&–F÷2'F—"Fò–ì:Ö6–òFò&öw&Ö¢6öç7BÆÄ6Æ–×2Òv—BF"ç6VÆV7B‡°¢W6W$–C¢6ÇV%fW&æô6Æ–×5F&ÆRçW6W$–BÀ¢ÆWfVÃ¢6ÇV%fW&æô6Æ–×5F&ÆRæÆWfVÂÀ¢Ò’æg&öÒ†6ÇV%fW&æô6Æ–×5F&ÆR¢çv†W&R†wFR†6ÇV%fW&æô6Æ–×5F&ÆRæ7&VFVDBÂæWrFFR‡&öw&Õ7F'B’’“° ¢òòì:×fVÂÖ—2ÇFò÷"W7\:&–ğ¢6öç7B†–v†W7DÆWfVÄ'•W6W"ÒæWrÖÇ7G&–ærÂçVÖ&W#â‚“°¢f÷"†6öç7B6Æ–ÒöbÆÄ6Æ–×2’°¢6öç7B7W'&VçBÒ†–v†W7DÆWfVÄ'•W6W"ævWB†6Æ–ÒçW6W$–B’óò°¢–b†6Æ–ÒæÆWfVÂâ7W'&VçB’†–v†W7DÆWfVÄ'•W6W"ç6WB†6Æ–ÒçW6W$–BÂ6Æ–ÒæÆWfVÂ“°¢Ğ ¢òòVvFöF÷2÷2ì;¦ÖW&÷2¬:W†—7FVçFW2÷"‡W6W$–BÂW&–öD–B¢6öç7BW†—7F–ætçVÖ&W'2Òv—BF"ç6VÆV7B‡°¢W6W$–C¢6÷'FUfW&æôçVÖ&W'5F&ÆRçW6W$–BÀ¢W&–öD–C¢6÷'FUfW&æôçVÖ&W'5F&ÆRçW&–öD–BÀ¢Ò’æg&öÒ‡6÷'FUfW&æôçVÖ&W'5F&ÆR“° ¢6öç7BÇ&VG”†2ÒæWr6WB†W†—7F–ætçVÖ&W'2æÖ†âÓâG¶âçW6W$–GÓ¢G¶âçW&–öD–GÖ’“° ¢ÆWBF÷FÄvVæW&FVBÒ°¢ÆWBW6W'5&ö6W76VBÒ° ¢f÷"†6öç7B·W6W$–BÂ†–v†W7DÆWfVÅÒöb†–v†W7DÆWfVÄ'•W6W"æVçG&–W2‚’’°¢òòfW&–f–66RfÇFÒì;¦ÖW&÷2VÒÆwVÒW,:ÖöFòF—fğ¢6öç7BÖ—76–æuW&–öG2Ò7F—fUW&–öG2æf–ÇFW"‡–BÓâÇ&VG”†2æ†2†G·W6W$–GÓ¢G·–GÖ’“°¢–b†Ö—76–æuW&–öG2æÆVæwF‚ÓÓÒ’6öçF–çVS° ¢G'’°¢6öç7BçV×2Òv—BF†—2ævVæW&FTÇV6·”çVÖ&W'2‡W6W$–BÂ†–v†W7DÆWfVÂ“°¢F÷FÄvVæW&FVB³ÒçV×2æÆVæwFƒ°¢W6W'5&ö6W76VB²³°¢6öç6öÆRæÆör†µ6÷'FUfW&æò&WG&õÒG¶çV×2æÆVæwF‡Òì;¦ÖW&ò‡2’vW&Fò‡2’&G·W6W$–GÒ†ì:×fVÂG¶†–v†W7DÆWfVÇÒ–“°¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"†µ6÷'FUfW&æò&WG&õÒW'&òòvW&"&G·W6W$–GÓ¦ÂR“°¢Ğ¢Ğ ¢6öç6öÆRæÆör†µ6÷'FUfW&æò&WG&õÒ6öæ6Ç\:ÖFò(	BG·W6W'5&ö6W76VGÒW7\:&–ò‡2’ÂG·F÷FÄvVæW&FVGÒì;¦ÖW&ò‡2’vW&Fò‡2–“°¢&WGW&â²vVæW&FVC¢F÷FÄvVæW&FVBÂW6W'5&ö6W76VBÓ°¢Ğ ¢7–æ2vWE6÷'FUfW&æôçVÖ&W'46÷VçB‚“¢&öÖ—6SÆçVÖ&W#â°¢G'’°¢6öç7B&W7VÇBÒv—BF"ç6VÆV7B‡²6÷VçC¢7ÃÆçVÖ&W#æ6÷VçB‚¢“£¦–çFÒ’æg&öÒ‡6÷'FUfW&æôçVÖ&W'5F&ÆR“°¢&WGW&â&W7VÇE³Óòæ6÷VçBóò°¢Ò6F6‚°¢&WGW&â°¢Ğ¢Ğ ¢&—fFRÖ6÷6&B‡#¢G—Vöb6÷v÷&ÆD7W6&G5F&ÆRâF–æfW%6VÆV7B“¢6÷v÷&ÆD7W6&B°¢&WGW&â°¢–C¢"æ–BÀ¢7V%F#¢"ç7V%F"26÷v÷&ÆD7W6&E²'7V%F"%ÒÀ¢F—FÆS¢"çF—FÆRÀ¢FW67&—F–öã¢"æFW67&—F–öâÀ¢FVÓ¢"çFVÓÀ¢FVÓ#¢"çFVÓ"À¢öFG3¢"æöFG2óòçVÆÂÀ¢&FvS¢"æ&FvRÀ¢–ÖvUW&Ã¢"æ–ÖvUW&ÂÀ¢FV×4§6öã¢‡"2ç’’çFV×4§6öâóòçVÆÂÀ¢7F—fS¢"æ7F—fRÀ¢7&VFVDC¢"æ7&VFVDBçFô•4õ7G&–ær‚’À¢Ó°¢Ğ ¢7–æ2vWD6÷6&G2‡7V%F#ó¢7G&–ær“¢&öÖ—6SÄ6÷v÷&ÆD7W6&EµÓâ°¢6öç7B&÷w2Ò7V%F ¢òv—BF"ç6VÆV7B‚’æg&öÒ†6÷v÷&ÆD7W6&G5F&ÆR’çv†W&R†W†6÷v÷&ÆD7W6&G5F&ÆRç7V%F"Â7V%F"’’æ÷&FW$'’†FW62†6÷v÷&ÆD7W6&G5F&ÆRæ7&VFVDB’¢¢v—BF"ç6VÆV7B‚’æg&öÒ†6÷v÷&ÆD7W6&G5F&ÆR’æ÷&FW$'’†FW62†6÷v÷&ÆD7W6&G5F&ÆRæ7&VFVDB’“°¢&WGW&â&÷w2æÖ‡"ÓâF†—2æÖ6÷6&B‡"’“°¢Ğ ¢7–æ27&VFT6÷6&B†FF¢–ç6W'D6÷v÷&ÆD7W6&B“¢&öÖ—6SÄ6÷v÷&ÆD7W6&Câ°¢6öç7B·&÷uÒÒv—BF"æ–ç6W'B†6÷v÷&ÆD7W6&G5F&ÆR’çfÇVW2‡°¢7V%F#¢FFç7V%F"À¢F—FÆS¢FFçF—FÆRÀ¢FW67&—F–öã¢FFæFW67&—F–öâóò""À¢FVÓ¢FFçFVÓóò""À¢FVÓ#¢FFçFVÓ"óò""À¢öFG3¢FFæöFG2óòçVÆÂÀ¢&FvS¢FFæ&FvRóò""À¢–ÖvUW&Ã¢FFæ–ÖvUW&Âóò""À¢FV×4§6öã¢†FF2ç’’çFV×4§6öâóòçVÆÂÀ¢7F—fS¢FFæ7F—fRóòG'VRÀ¢Ò’ç&WGW&æ–ær‚“°¢&WGW&âF†—2æÖ6÷6&B‡&÷r“°¢Ğ ¢7–æ2WFFT6÷6&B†–C¢çVÖ&W"ÂFF¢'F–ÃÄ–ç6W'D6÷v÷&ÆD7W6&Câ“¢&öÖ—6SÄ6÷v÷&ÆD7W6&BÂVæFVf–æVCâ°¢6öç7B·&÷uÒÒv—BF"çWFFR†6÷v÷&ÆD7W6&G5F&ÆR’ç6WB‡°¢âââ†FFç7V%F"ÓÒVæFVf–æVBbb²7V%F#¢FFç7V%F"Ò’À¢âââ†FFçF—FÆRÓÒVæFVf–æVBbb²F—FÆS¢FFçF—FÆRÒ’À¢âââ†FFæFW67&—F–öâÓÒVæFVf–æVBbb²FW67&—F–öã¢FFæFW67&—F–öâÒ’À¢âââ†FFçFVÓÓÒVæFVf–æVBbb²FVÓ¢FFçFVÓÒ’À¢âââ†FFçFVÓ"ÓÒVæFVf–æVBbb²FVÓ#¢FFçFVÓ"Ò’À¢âââ†FFæöFG2ÓÒVæFVf–æVBbb²öFG3¢FFæöFG2Ò’À¢âââ†FFæ&FvRÓÒVæFVf–æVBbb²&FvS¢FFæ&FvRÒ’À¢âââ†FFæ–ÖvUW&ÂÓÒVæFVf–æVBbb²–ÖvUW&Ã¢FFæ–ÖvUW&ÂÒ’À¢âââ‚†FF2ç’’çFV×4§6öâÓÒVæFVf–æVBbb²FV×4§6öã¢†FF2ç’’çFV×4§6öâÒ’À¢âââ†FFæ7F—fRÓÒVæFVf–æVBbb²7F—fS¢FFæ7F—fRÒ’À¢Ò’çv†W&R†W†6÷v÷&ÆD7W6&G5F&ÆRæ–BÂ–B’’ç&WGW&æ–ær‚“°¢&WGW&â&÷ròF†—2æÖ6÷6&B‡&÷r’¢VæFVf–æVC°¢Ğ ¢7–æ2FVÆWFT6÷6&B†–C¢çVÖ&W"“¢&öÖ—6SÆ&ööÆVãâ°¢6öç7B&W7VÇBÒv—BF"æFVÆWFR†6÷v÷&ÆD7W6&G5F&ÆR’çv†W&R†W†6÷v÷&ÆD7W6&G5F&ÆRæ–BÂ–B’’ç&WGW&æ–ær‚“°¢&WGW&â&W7VÇBæÆVæwF‚â°¢Ğ ¢òò)H)H)H&öÌ:6ò)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢7–æ2vWD&öÆöW2‚“¢&öÖ—6SÄ&öÆõµÓâ°¢&WGW&âF"ç6VÆV7B‚’æg&öÒ†&ÆöW5F&ÆR’æ÷&FW$'’†FW62†&ÆöW5F&ÆRæ7&VFVDB’“°¢Ğ ¢7–æ2vWD7F—fT&öÆò‚“¢&öÖ—6SÄ&öÆòÂçVÆÃâ°¢6öç7B&÷w2Òv—BF"ç6VÆV7B‚’æg&öÒ†&ÆöW5F&ÆR’çv†W&R†æB†W†&ÆöW5F&ÆRæ7F—fRÂG'VR’ÂW†&ÆöW5F&ÆRç7FGW2Â&÷Vâ"’’’æÆ–Ö—Bƒ“°¢&WGW&â&÷w5³ÒóòçVÆÃ°¢Ğ ¢òò)H)HGVVÆò)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢7–æ2vWDGVVÆ÷2‚“¢&öÖ—6SÄGVVÆõµÓâ°¢&WGW&âF"ç6VÆV7B‚’æg&öÒ†GVVÆ÷5F&ÆR’æ÷&FW$'’†FW62†GVVÆ÷5F&ÆRæ7&VFVDB’“°¢Ğ¢7–æ2vWD7F—fTGVVÆ÷2‚“¢&öÖ—6SÄGVVÆõµÓâ°¢&WGW&âF"ç6VÆV7B‚’æg&öÒ†GVVÆ÷5F&ÆR’çv†W&R†æB†W†GVVÆ÷5F&ÆRæ7F—fRÂG'VR’ÂW†GVVÆ÷5F&ÆRç7FGW2Â&÷Vâ"’’’æ÷&FW$'’†FW62†GVVÆ÷5F&ÆRæ7&VFVDB’“°¢Ğ¢7–æ27&VFTGVVÆò†FF¢'F–ÃÄGVVÆóâ“¢&öÖ—6SÄGVVÆóâ°¢6öç7B·&÷uÒÒv—BF"æ–ç6W'B†GVVÆ÷5F&ÆR’çfÇVW2†FF2ç’’ç&WGW&æ–ær‚“°¢&WGW&â&÷s°¢Ğ¢7–æ2WFFTGVVÆò†–C¢çVÖ&W"ÂFF¢'F–ÃÄGVVÆóâ“¢&öÖ—6SÄGVVÆòÂVæFVf–æVCâ°¢6öç7B·&÷uÒÒv—BF"çWFFR†GVVÆ÷5F&ÆR’ç6WB†FF2ç’’çv†W&R†W†GVVÆ÷5F&ÆRæ–BÂ–B’’ç&WGW&æ–ær‚“°¢&WGW&â&÷róòVæFVf–æVC°¢Ğ¢7–æ2FVÆWFTGVVÆò†–C¢çVÖ&W"“¢&öÖ—6SÆ&ööÆVãâ°¢6öç7B&W7VÇBÒv—BF"æFVÆWFR†GVVÆ÷5F&ÆR’çv†W&R†W†GVVÆ÷5F&ÆRæ–BÂ–B’’ç&WGW&æ–ær‚“°¢&WGW&â&W7VÇBæÆVæwF‚â°¢Ğ¢7–æ2vWDGVVÆôVçG&–W2†GVVÆô–C¢çVÖ&W"“¢&öÖ—6SÄGVVÆôVçG'•µÓâ°¢&WGW&âF"ç6VÆV7B‚’æg&öÒ†GVVÆôVçG&–W5F&ÆR’çv†W&R†W†GVVÆôVçG&–W5F&ÆRæGVVÆô–BÂGVVÆô–B’’æ÷&FW$'’†FW62†GVVÆôVçG&–W5F&ÆRæ7&VFVDB’“°¢Ğ¢7–æ2vWDGVVÆôVçG&–W4'•W6W"‡W6W$–C¢7G&–ær“¢&öÖ—6SÄGVVÆôVçG'•µÓâ°¢&WGW&âF"ç6VÆV7B‚’æg&öÒ†GVVÆôVçG&–W5F&ÆR’çv†W&R†W†GVVÆôVçG&–W5F&ÆRçW6W$–BÂW6W$–B’’æ÷&FW$'’†FW62†GVVÆôVçG&–W5F&ÆRæ7&VFVDB’“°¢Ğ¢7–æ27&VFTGVVÆôVçG'’†FF¢²GVVÆô–C¢çVÖ&W#²W6W$–C¢7G&–æs²6–FS¢7G&–ærÒ“¢&öÖ—6SÄGVVÆôVçG'“â°¢6öç7B·&÷uÒÒv—BF"æ–ç6W'B†GVVÆôVçG&–W5F&ÆR’çfÇVW2‡²ââæFFÂ&—¦Tv&FVC¢fÇ6RÒ’ç&WGW&æ–ær‚“°¢&WGW&â&÷s°¢Ğ¢7–æ2f–æ—6„GVVÆò†GVVÆô–C¢çVÖ&W"Âv–ææW%6–FS¢7G&–ær“¢&öÖ—6SÇ²v–ææW'3¢çVÖ&W#²&—¦UW%v–ææW#¢çVÖ&W#²F÷FÄVçG&–W3¢çVÖ&W#²F÷FÃ¢çVÖ&W#²†÷W6U&öf—C¢çVÖ&W"Óâ°¢6öç7B¶GVVÆõÒÒv—BF"ç6VÆV7B‚’æg&öÒ†GVVÆ÷5F&ÆR’çv†W&R†W†GVVÆ÷5F&ÆRæ–BÂGVVÆô–B’’æÆ–Ö—Bƒ“°¢–b‚GVVÆò’F‡&÷ræWrW'&÷"‚$GVVÆòì:6òVæ6öçG&Fò"“°¢6öç7BVçG&–W2Òv—BF"ç6VÆV7B‚’æg&öÒ†GVVÆôVçG&–W5F&ÆR’çv†W&R†W†GVVÆôVçG&–W5F&ÆRæGVVÆô–BÂGVVÆô–B’“°¢6öç7BF÷FÄVçG&–W2ÒVçG&–W2æÆVæwFƒ°¢6öç7Bw&÷75F÷FÂÒÖF‚ç&÷VæB‡F÷FÄVçG&–W2¢†GVVÆòæVçG'”fVRóò’¢’ò°¢6öç7B†÷W6T7WE7BÒGVVÆòæ†÷W6T7WBóò°¢6öç7BF÷FÂÒÖF‚ç&÷VæB†w&÷75F÷FÂ¢ƒÒ†÷W6T7WE7Bò’¢’ò°¢6öç7B†÷W6U&öf—BÒÖF‚ç&÷VæB‚†w&÷75F÷FÂÒF÷FÂ’¢’ò°¢6öç7Bv–ææW'2ÒVçG&–W2æf–ÇFW"†RÓâRç6–FRÓÓÒv–ææW%6–FR“°¢6öç7B&—¦UW%v–ææW"Òv–ææW'2æÆVæwF‚âòÖF‚ç&÷VæB‚‡F÷FÂòv–ææW'2æÆVæwF‚’¢’ò¢°¢v—BF"çWFFR†GVVÆ÷5F&ÆR’ç6WB‡²7FGW3¢&f–æ—6†VB"Âv–ææW%6–FRÒ’çv†W&R†W†GVVÆ÷5F&ÆRæ–BÂGVVÆô–B’“°¢f÷"†6öç7Bröbv–ææW'2’°¢v—BF"çWFFR†GVVÆôVçG&–W5F&ÆR’ç6WB‡²&—¦Tv&FVC¢G'VRÂ&—¦TÖ÷VçC¢&—¦UW%v–ææW"Ò’çv†W&R†W†GVVÆôVçG&–W5F&ÆRæ–BÂræ–B’“°¢Ğ¢&WGW&â²v–ææW'3¢v–ææW'2æÆVæwF‚Â&—¦UW%v–ææW"ÂF÷FÄVçG&–W2ÂF÷FÂÂ†÷W6U&öf—BÓ°¢Ğ ¢7–æ27&VFT&öÆò†FF¢–ç6W'D&öÆò“¢&öÖ—6SÄ&öÆóâ°¢6öç7B·&÷uÒÒv—BF"æ–ç6W'B†&ÆöW5F&ÆR’çfÇVW2†FF’ç&WGW&æ–ær‚“°¢&WGW&â&÷s°¢Ğ ¢7–æ2WFFT&öÆò†–C¢çVÖ&W"ÂFF¢'F–ÃÄ–ç6W'D&öÆóâ“¢&öÖ—6SÄ&öÆòÂVæFVf–æVCâ°¢6öç7B·&÷uÒÒv—BF"çWFFR†&ÆöW5F&ÆR’ç6WB†FF’çv†W&R†W†&ÆöW5F&ÆRæ–BÂ–B’’ç&WGW&æ–ær‚“°¢&WGW&â&÷róòVæFVf–æVC°¢Ğ ¢7–æ2FVÆWFT&öÆò†–C¢çVÖ&W"“¢&öÖ—6SÆ&ööÆVãâ°¢6öç7B&W7VÇBÒv—BF"æFVÆWFR†&ÆöW5F&ÆR’çv†W&R†W†&ÆöW5F&ÆRæ–BÂ–B’’ç&WGW&æ–ær‚“°¢&WGW&â&W7VÇBæÆVæwF‚â°¢Ğ ¢7–æ27&VFT&öÆôVçG'’†FF¢²&öÆô–C¢çVÖ&W#²W6W$–C¢7G&–æs²†öÖU66÷&S¢çVÖ&W#²v•66÷&S¢çVÖ&W"Ò“¢&öÖ—6SÄ&öÆôVçG'“â°¢6öç7B·&÷uÒÒv—BF"æ–ç6W'B†&öÆôVçG&–W5F&ÆR’çfÇVW2‡²ââæFFÂ&—¦Tv&FVC¢fÇ6RÒ’ç&WGW&æ–ær‚“°¢&WGW&â&÷s°¢Ğ ¢7–æ2vWD&öÆôVçG&–W2†&öÆô–C¢çVÖ&W"“¢&öÖ—6SÄ&öÆôVçG'•µÓâ°¢&WGW&âF"ç6VÆV7B‚’æg&öÒ†&öÆôVçG&–W5F&ÆR’çv†W&R†W†&öÆôVçG&–W5F&ÆRæ&öÆô–BÂ&öÆô–B’’æ÷&FW$'’†FW62†&öÆôVçG&–W5F&ÆRæ7&VFVDB’“°¢Ğ ¢7–æ2vWD&öÆôVçG&–W4'•W6W"‡W6W$–C¢7G&–ær“¢&öÖ—6SÄ&öÆôVçG'•µÓâ°¢&WGW&âF"ç6VÆV7B‚’æg&öÒ†&öÆôVçG&–W5F&ÆR¢çv†W&R†æB†W†&öÆôVçG&–W5F&ÆRçW6W$–BÂW6W$–B’ÂW†&öÆôVçG&–W5F&ÆRæ†–FFVâÂfÇ6R’’¢æ÷&FW$'’†FW62†&öÆôVçG&–W5F&ÆRæ7&VFVDB’“°¢Ğ ¢7–æ2FVÆWFTÆÄ&öÆôVçG&–W4'•W6W"‡W6W$–C¢7G&–ær“¢&öÖ—6SÇfö–Câ°¢òòæWfW"‡—6–6ÆÇ’FVÆWFR&öÌ:6òVçG&–W2(	BF†W’&R–BF–6¶WG2æB×W7B&VÖ–âf—6–&ÆRFòFÖ–ç2à¢òò–ç7FVBÂÖ&²F†VÒ2†–FFVâ6òF†RW6W"w2$ÖWW2Ç—FW2"f–Wr—26ÆV&VBà¢v—BF"çWFFR†&öÆôVçG&–W5F&ÆR’ç6WB‡²†–FFVã¢G'VRÒ’çv†W&R†W†&öÆôVçG&–W5F&ÆRçW6W$–BÂW6W$–B’“°¢Ğ ¢7–æ2f–æ—6„&öÆò†&öÆô–C¢çVÖ&W"Â†öÖU66÷&S¢çVÖ&W"Âv•66÷&S¢çVÖ&W"“¢&öÖ—6SÇ²v–ææW'3¢çVÖ&W#²&—¦UW%v–ææW#¢çVÖ&W#²F÷FÄVçG&–W3¢çVÖ&W#²F÷FÃ¢çVÖ&W"Óâ°¢6öç7B&öÆòÒv—BF"ç6VÆV7B‚’æg&öÒ†&ÆöW5F&ÆR’çv†W&R†W†&ÆöW5F&ÆRæ–BÂ&öÆô–B’’æÆ–Ö—Bƒ“°¢–b‚&öÆõ³Ò’F‡&÷ræWrW'&÷"‚$&öÌ:6òì:6òVæ6öçG&Fò"“°¢6öç7BVçG&–W2Òv—BF"ç6VÆV7B‚’æg&öÒ†&öÆôVçG&–W5F&ÆR’çv†W&R†W†&öÆôVçG&–W5F&ÆRæ&öÆô–BÂ&öÆô–B’“°¢6öç7BF÷FÄVçG&–W2ÒVçG&–W2æÆVæwFƒ°¢6öç7Bw&÷75F÷FÂÒÖF‚ç&÷VæB‡F÷FÄVçG&–W2¢†&öÆõ³ÒæVçG'”fVRóò’¢’ò°¢6öç7B†÷W6T7WE7BÒ&öÆõ³Òæ†÷W6T7WBóò°¢6öç7BF÷FÂÒÖF‚ç&÷VæB†w&÷75F÷FÂ¢ƒÒ†÷W6T7WE7Bò’¢’ò°¢6öç7Bv–ææW'2ÒVçG&–W2æf–ÇFW"†RÓâRæ†öÖU66÷&RÓÓÒ†öÖU66÷&RbbRæv•66÷&RÓÓÒv•66÷&R“°¢6öç7B&—¦UW%v–ææW"Òv–ææW'2æÆVæwF‚âòÖF‚ç&÷VæB‚‡F÷FÂòv–ææW'2æÆVæwF‚’¢’ò¢° ¢òòÖ&²v–ææW'2bv&B&—¦Rf–G&ç67F–öç2††æFÆVB–â&÷WFR¢v—BF"çWFFR†&ÆöW5F&ÆR’ç6WB‡²7FGW3¢&f–æ—6†VB"Â7GVÄ†öÖU66÷&S¢†öÖU66÷&RÂ7GVÄv•66÷&S¢v•66÷&RÒ’çv†W&R†W†&ÆöW5F&ÆRæ–BÂ&öÆô–B’“° ¢òòÖ&²&—¦Rv&FVBf÷"v–ææW'2æB7F÷&RF†R7GVÂ&—¦RÖ÷Vç@¢f÷"†6öç7Bröbv–ææW'2’°¢v—BF"çWFFR†&öÆôVçG&–W5F&ÆR’ç6WB‡²&—¦Tv&FVC¢G'VRÂ&—¦TÖ÷VçC¢&—¦UW%v–ææW"Ò’çv†W&R†W†&öÆôVçG&–W5F&ÆRæ–BÂræ–B’“°¢Ğ ¢6öç7B†÷W6U&öf—BÒÖF‚ç&÷VæB‚†w&÷75F÷FÂÒF÷FÂ’¢’ò°¢&WGW&â²v–ææW'3¢v–ææW'2æÆVæwF‚Â&—¦UW%v–ææW"ÂF÷FÄVçG&–W2ÂF÷FÂÂ†÷W6U&öf—BÓ°¢Ğ ¢òò)H)Hæ÷F–f–6F–öç2)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢7–æ27&VFTæ÷F–f–6F–öâ†FF¢²F—FÆS¢7G&–æs²&öG“¢7G&–æs²G—S¢7G&–æs²F&vWD7g3ó¢7G&–æuµÒÂçVÆÃ²–ÖvUW&Ãó¢7G&–ærÂçVÆÃ²–ÖvTFFó¢7G&–ærÂçVÆÃ²Ö–ÖUG—Só¢7G&–ærÂçVÆÂÒ’°¢6öç7B¶åÒÒv—BF"æ–ç6W'B†æ÷F–f–6F–öç5F&ÆR’çfÇVW2‡°¢F—FÆS¢FFçF—FÆRÂ&öG“¢FFæ&öG’ÂG—S¢FFçG—RÀ¢F&vWD7g3¢FFçF&vWD7g2óòçVÆÂÂ7F—fS¢G'VRÀ¢–ÖvUW&Ã¢FFæ–ÖvUW&ÂóòçVÆÂÀ¢–ÖvTFF¢FFæ–ÖvTFFóòçVÆÂÀ¢Ö–ÖUG—S¢FFæÖ–ÖUG—RóòçVÆÂÀ¢Ò’ç&WGW&æ–ær‚“°¢&WGW&âã°¢Ğ ¢7–æ2WFFTæ÷F–f–6F–öä–ÖvR†–C¢çVÖ&W"Â–ÖvTFF¢7G&–ærÂÖ–ÖUG—S¢7G&–ær’°¢v—BF"çWFFR†æ÷F–f–6F–öç5F&ÆR’ç6WB‡²–ÖvTFFÂÖ–ÖUG—RÒ’çv†W&R†W†æ÷F–f–6F–öç5F&ÆRæ–BÂ–B’“°¢Ğ ¢7–æ2vWDæ÷F–f–6F–öä–ÖvR†–C¢çVÖ&W"’°¢6öç7B¶åÒÒv—BF"ç6VÆV7B‡²–ÖvTFF¢æ÷F–f–6F–öç5F&ÆRæ–ÖvTFFÂÖ–ÖUG—S¢æ÷F–f–6F–öç5F&ÆRæÖ–ÖUG—RÒ¢æg&öÒ†æ÷F–f–6F–öç5F&ÆR’çv†W&R†W†æ÷F–f–6F–öç5F&ÆRæ–BÂ–B’’æÆ–Ö—Bƒ“°¢–b‚ãòæ–ÖvTFF’&WGW&âçVÆÃ°¢&WGW&â²–ÖvTFF¢âæ–ÖvTFFÂÖ–ÖUG—S¢âæÖ–ÖUG—RÓ°¢Ğ ¢7–æ2vWDæ÷F–f–6F–öç2‚’°¢6öç7B&÷w2Òv—BF"ç6VÆV7B‚’æg&öÒ†æ÷F–f–6F–öç5F&ÆR’æ÷&FW$'’†FW62†æ÷F–f–6F–öç5F&ÆRæ7&VFVDB’“°¢&WGW&â&÷w2æÖ‚‡²–ÖvTFFÂÖ–ÖUG—RÂââç&W7BÒ’Óâ‡²ââç&W7BÂ†4–ÖvS¢–ÖvTFFÒ’“°¢Ğ ¢7–æ2vWDæ÷F–f–6F–öç4f÷%W6W"‡W6W$7c¢7G&–ær’°¢6öç7BÆÂÒv—BF"ç6VÆV7B‚’æg&öÒ†æ÷F–f–6F–öç5F&ÆR¢çv†W&R†W†æ÷F–f–6F–öç5F&ÆRæ7F—fRÂG'VR’¢æ÷&FW$'’†FW62†æ÷F–f–6F–öç5F&ÆRæ7&VFVDB’“°¢6öç7B&VG2Òv—BF"ç6VÆV7B‚’æg&öÒ†æ÷F–f–6F–öå&VG5F&ÆR¢çv†W&R†W†æ÷F–f–6F–öå&VG5F&ÆRçW6W$7bÂW6W$7b’“°¢6öç7B&VE6WBÒæWr6WB‡&VG2æf–ÇFW"‡"Óâ"æF—6Ö—76VB’æÖ‡"Óâ"ææ÷F–f–6F–öä–B’“°¢6öç7BF—6Ö—76VE6WBÒæWr6WB‡&VG2æf–ÇFW"‡"Óâ"æF—6Ö—76VB’æÖ‡"Óâ"ææ÷F–f–6F–öä–B’“°¢&WGW&âÆÀ¢æf–ÇFW"†âÓââçF&vWD7g2ÇÂâçF&vWD7g2æ–æ6ÇVFW2‡W6W$7b’¢æf–ÇFW"†âÓâF—6Ö—76VE6WBæ†2†âæ–B’¢æÖ‚‡²–ÖvTFFÂÖ–ÖUG—RÂââæâÒ’Óâ‡²ââæâÂ†4–ÖvS¢–ÖvTFFÂ&VC¢&VE6WBæ†2†âæ–B’Ò’“°¢Ğ ¢7–æ2F—6Ö—74æ÷F–f–6F–öâ†æ÷F–f–6F–öä–C¢çVÖ&W"ÂW6W$7c¢7G&–ær’°¢6öç7BW†—7F–ærÒv—BF"ç6VÆV7B‚’æg&öÒ†æ÷F–f–6F–öå&VG5F&ÆR¢çv†W&R†æB†W†æ÷F–f–6F–öå&VG5F&ÆRææ÷F–f–6F–öä–BÂæ÷F–f–6F–öä–B’ÂW†æ÷F–f–6F–öå&VG5F&ÆRçW6W$7bÂW6W$7b’’¢æÆ–Ö—Bƒ“°¢–b†W†—7F–æræÆVæwF‚â’°¢v—BF"çWFFR†æ÷F–f–6F–öå&VG5F&ÆR¢ç6WB‡²F—6Ö—76VC¢G'VRÒ¢çv†W&R†æB†W†æ÷F–f–6F–öå&VG5F&ÆRææ÷F–f–6F–öä–BÂæ÷F–f–6F–öä–B’ÂW†æ÷F–f–6F–öå&VG5F&ÆRçW6W$7bÂW6W$7b’’“°¢ÒVÇ6R°¢v—BF"æ–ç6W'B†æ÷F–f–6F–öå&VG5F&ÆR¢çfÇVW2‡²æ÷F–f–6F–öä–BÂW6W$7bÂF—6Ö—76VC¢G'VRÒ“°¢Ğ¢Ğ ¢7–æ2F—6Ö—74ÆÄæ÷F–f–6F–öç2‡W6W$7c¢7G&–ær’°¢òò'W66"FöF22æ÷F–f–6:|;VW2F—f0¢6öç7B7F—fTæ÷F–g2Òv—BF"ç6VÆV7B‡²–C¢æ÷F–f–6F–öç5F&ÆRæ–BÒ¢æg&öÒ†æ÷F–f–6F–öç5F&ÆR¢çv†W&R†W†æ÷F–f–6F–öç5F&ÆRæ7F—fRÂG'VR’“° ¢–b†7F—fTæ÷F–g2æÆVæwF‚ÓÓÒ’&WGW&ã° ¢6öç7B7F—fT–G2Ò7F—fTæ÷F–g2æÖ†âÓââæ–B“° ¢òòGVÆ—¦"&Vv—7G&÷2¬:W†—7FVçFW2&F—6Ö—76VBÒG'VP¢v—BF"çWFFR†æ÷F–f–6F–öå&VG5F&ÆR¢ç6WB‡²F—6Ö—76VC¢G'VRÒ¢çv†W&R†æB€¢W†æ÷F–f–6F–öå&VG5F&ÆRçW6W$7bÂW6W$7b’À¢–ä'&’†æ÷F–f–6F–öå&VG5F&ÆRææ÷F–f–6F–öä–BÂ7F—fT–G2¢’“° ¢òòfW&–f–6"V—2–æFì:6òL:¦Ò&Vv—7G&òR–ç6W&— ¢6öç7BW†—7F–æu&VG2Òv—BF"ç6VÆV7B‡²æ÷F–f–6F–öä–C¢æ÷F–f–6F–öå&VG5F&ÆRææ÷F–f–6F–öä–BÒ¢æg&öÒ†æ÷F–f–6F–öå&VG5F&ÆR¢çv†W&R†æB€¢W†æ÷F–f–6F–öå&VG5F&ÆRçW6W$7bÂW6W$7b’À¢–ä'&’†æ÷F–f–6F–öå&VG5F&ÆRææ÷F–f–6F–öä–BÂ7F—fT–G2¢’“° ¢6öç7BW†—7F–æt–G2ÒæWr6WB†W†—7F–æu&VG2æÖ‡"Óâ"ææ÷F–f–6F–öä–B’“°¢6öç7BÖ—76–ærÒ7F—fT–G2æf–ÇFW"†–BÓâW†—7F–æt–G2æ†2†–B’“° ¢–b†Ö—76–æræÆVæwF‚â’°¢v—BF"æ–ç6W'B†æ÷F–f–6F–öå&VG5F&ÆR¢çfÇVW2†Ö—76–æræÖ†æ÷F–f–6F–öä–BÓâ‡²æ÷F–f–6F–öä–BÂW6W$7bÂF—6Ö—76VC¢G'VRÒ’’“°¢Ğ ¢6öç6öÆRæÆör‚%¶F—6Ö—74ÆÅÒFöæRf÷""ÂW6W$7bÂ.(	Bæ÷F–g3¢"Â7F—fT–G2æÆVæwF‚Â&Ö—76–æs¢"ÂÖ—76–æræÆVæwF‚“°¢Ğ ¢7–æ2vWEVç&VD6÷VçDf÷%W6W"‡W6W$7c¢7G&–ær’°¢6öç7Bæ÷F–f–6F–öç2Òv—BF†—2ævWDæ÷F–f–6F–öç4f÷%W6W"‡W6W$7b“°¢&WGW&âæ÷F–f–6F–öç2æf–ÇFW"†âÓââç&VB’æÆVæwFƒ°¢Ğ ¢7–æ2Ö&´æ÷F–f–6F–öå&VB†æ÷F–f–6F–öä–C¢çVÖ&W"ÂW6W$7c¢7G&–ær’°¢v—BF"æ–ç6W'B†æ÷F–f–6F–öå&VG5F&ÆR¢çfÇVW2‡²æ÷F–f–6F–öä–BÂW6W$7bÒ¢æöä6öæfÆ–7DFôæ÷F†–ær‚“°¢Ğ ¢7–æ2Ö&´ÆÄæ÷F–f–6F–öç5&VB‡W6W$7c¢7G&–ær’°¢6öç7Bæ÷F–f–6F–öç2Òv—BF†—2ævWDæ÷F–f–6F–öç4f÷%W6W"‡W6W$7b“°¢6öç7BVç&VBÒæ÷F–f–6F–öç2æf–ÇFW"†âÓââç&VB“°¢f÷"†6öç7BâöbVç&VB’°¢v—BF"æ–ç6W'B†æ÷F–f–6F–öå&VG5F&ÆR¢çfÇVW2‡²æ÷F–f–6F–öä–C¢âæ–BÂW6W$7bÒ¢æöä6öæfÆ–7DFôæ÷F†–ær‚“°¢Ğ¢Ğ ¢7–æ2FVÆWFTæ÷F–f–6F–öâ†–C¢çVÖ&W"’°¢v—BF"æFVÆWFR†æ÷F–f–6F–öå&VG5F&ÆR’çv†W&R†W†æ÷F–f–6F–öå&VG5F&ÆRææ÷F–f–6F–öä–BÂ–B’“°¢6öç7B&W7VÇBÒv—BF"æFVÆWFR†æ÷F–f–6F–öç5F&ÆR’çv†W&R†W†æ÷F–f–6F–öç5F&ÆRæ–BÂ–B’’ç&WGW&æ–ær‚“°¢&WGW&â&W7VÇBæÆVæwF‚â°¢Ğ ¢7–æ2FövvÆTæ÷F–f–6F–öä7F—fR†–C¢çVÖ&W"’°¢6öç7B¶7W'&VçEÒÒv—BF"ç6VÆV7B‚’æg&öÒ†æ÷F–f–6F–öç5F&ÆR’çv†W&R†W†æ÷F–f–6F–öç5F&ÆRæ–BÂ–B’’æÆ–Ö—Bƒ“°¢–b‚7W'&VçB’&WGW&âçVÆÃ°¢6öç7B·WFFVEÒÒv—BF"çWFFR†æ÷F–f–6F–öç5F&ÆR¢ç6WB‡²7F—fS¢7W'&VçBæ7F—fRÒ’çv†W&R†W†æ÷F–f–6F–öç5F&ÆRæ–BÂ–B’’ç&WGW&æ–ær‚“°¢&WGW&âWFFVC°¢Ğ§Ğ ¦W‡÷'BgVæ7F–öâvWDÖæW5vVVµ7F'B‚“¢7G&–ær°¢6öç7Bæ÷rÒæWrFFR‚“°¢6öç7BÖæW5F–ÖRÒæWrFFR†æ÷rævWEF–ÖR‚’ÒB¢c¢c¢“°¢6öç7BF”öevVV²ÒÖæW5F–ÖRævWEUD4F’‚“°¢6öç7BF—5FôÖöæF’ÒF”öevVV²ÓÓÒòb¢F”öevVV²Ò°¢6öç7BÖöæF’ÒæWrFFR†ÖæW5F–ÖRævWEF–ÖR‚’ÒF—5FôÖöæF’¢#B¢c¢c¢“°¢6öç7B–V"ÒÖöæF’ævWEUD4gVÆÅ–V"‚“°¢6öç7BÖöçF‚Ò7G&–ær†ÖöæF’ævWEUD4ÖöçF‚‚’²’çE7F'Bƒ"Â#"“°¢6öç7BF’Ò7G&–ær†ÖöæF’ævWEUD4FFR‚’’çE7F'Bƒ"Â#"“°¢&WGW&âG·–V'ÒÒG¶ÖöçF‡ÒÒG¶F—Ö°§Ğ ¦W‡÷'BgVæ7F–öâvWD'&6–Æ–vVVµ7F'B‚“¢7G&–ær°¢&WGW&âvWDÖæW5vVVµ7F'B‚“°§Ğ ¦W‡÷'B6öç7B7F÷&vRÒæWrFF&6U7F÷&vR‚“°