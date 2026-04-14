export interface SelectionForOdds {
  gameId: string;
  odds: number;
  originalOdds?: number;
  marketKey?: string;
  outcome?: string;
}

const COMBO_BONUS_TABLE: Record<number, number> = {
  2: 0.06,
  3: 0.09,
  4: 0.12,
  5: 0.15,
  6: 0.20,
  7: 0.25,
  8: 0.30,
  9: 0.375,
  10: 0.45,
  11: 0.525,
};

export function getComboBonus(gameCount: number): number {
  if (gameCount < 2) return 0;
  if (gameCount >= 12) return 0.60;
  return COMBO_BONUS_TABLE[gameCount] ?? 0;
}

export function checkIsComboBonus(selections: SelectionForOdds[]): boolean {
  if (selections.length < 2) return false;
  const isAllH2H = selections.every(
    s => s.marketKey === "h2h" || s.marketKey === "match_winner"
  );
  if (!isAllH2H) return false;
  const distinctGames = new Set(selections.map(s => s.gameId));
  return distinctGames.size >= 2 && distinctGames.size === selections.length;
}

function isBTTS(sel: SelectionForOdds): boolean {
  const mk = (sel.marketKey ?? "").toLowerCase();
  return mk.includes("both teams score");
}

function isGoalsOverUnder(sel: SelectionForOdds): boolean {
  const mk = (sel.marketKey ?? "").toLowerCase();
  return mk.includes("goals over") || mk.includes("over/under");
}

/**
 * Calcula o total de odds aplicando a regra especial:
 * Quando no mesmo jogo o apostador seleciona AMBOS:
 *   - Qualquer outcome de "Ambos Marcam" (Both Teams Score) — Sim ou Não
 *   - Qualquer outcome de "Gols Over/Under" (+2.5 ou -2.5) — Sim ou Não
 * A odd combinada desses dois mercados é: max(odd1, odd2) × 1.15
 * Quaisquer outros mercados do mesmo jogo (ou de outros jogos) multiplicam normalmente.
 *
 * Exemplos: Ambos Sim + Over Sim, Ambos Não + Under Não, Ambos Não + Over Sim, etc.
 */
export function computeTotalOdds(selections: SelectionForOdds[]): number {
  if (selections.length === 0) return 1;

  const byGame = new Map<string, SelectionForOdds[]>();
  for (const sel of selections) {
    if (!byGame.has(sel.gameId)) byGame.set(sel.gameId, []);
    byGame.get(sel.gameId)!.push(sel);
  }

  let totalOdds = 1;

  for (const gameSelections of byGame.values()) {
    const btts = gameSelections.find(isBTTS);
    const overUnder = gameSelections.find(isGoalsOverUnder);

    if (btts && overUnder) {
      const combined = Math.max(btts.odds, overUnder.odds) * 1.15;
      totalOdds *= combined;
      for (const sel of gameSelections) {
        if (sel !== btts && sel !== overUnder) {
          totalOdds *= sel.odds;
        }
      }
    } else {
      for (const sel of gameSelections) {
        totalOdds *= sel.odds;
      }
    }
  }

  return totalOdds;
}
