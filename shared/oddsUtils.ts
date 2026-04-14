export interface SelectionForOdds {
  gameId: string;
  odds: number;
  marketKey?: string;
  outcome?: string;
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
