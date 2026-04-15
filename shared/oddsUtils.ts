export interface SelectionForOdds {
  gameId: string;
  odds: number;
  originalOdds?: number;
  marketKey?: string;
  outcome?: string;
}

const COMBO_BONUS_TABLE: Record<number, number> = {
  2: 0.05,
  3: 0.10,
  4: 0.15,
  5: 0.20,
  6: 0.27,
  7: 0.34,
  8: 0.41,
  9: 0.49,
  10: 0.58,
  11: 0.65,
};

export function countH2HGames(selections: SelectionForOdds[]): number {
  const h2hGameIds = new Set(
    selections
      .filter(s => s.marketKey === "h2h" || s.marketKey === "match_winner")
      .map(s => s.gameId)
  );
  return h2hGameIds.size;
}

export function getComboBonus(h2hGameCount: number): number {
  if (h2hGameCount < 2) return 0;
  if (h2hGameCount >= 12) return 0.72;
  return COMBO_BONUS_TABLE[h2hGameCount] ?? 0;
}

export function checkIsComboBonus(selections: SelectionForOdds[]): boolean {
  if (selections.length < 2) return false;
  const distinctGames = new Set(selections.map(s => s.gameId));
  if (distinctGames.size < 2) return false;
  return countH2HGames(selections) >= 2;
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
