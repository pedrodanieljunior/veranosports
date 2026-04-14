export interface SelectionForOdds {
  gameId: string;
  odds: number;
  marketKey?: string;
  outcome?: string;
}

function isBTTS(sel: SelectionForOdds): boolean {
  const mk = (sel.marketKey ?? "").toLowerCase();
  const oc = (sel.outcome ?? "").toLowerCase();
  return mk.includes("both teams score") && (oc.includes("yes") || oc.includes("sim"));
}

function isOver25(sel: SelectionForOdds): boolean {
  const mk = (sel.marketKey ?? "").toLowerCase();
  const oc = (sel.outcome ?? "").toLowerCase();
  return (mk.includes("goals over") || mk.includes("over/under")) &&
    (oc.endsWith("-sim") || oc.endsWith("-yes") || oc.endsWith("-over") || oc.includes("over 2") || oc.includes("+2"));
}

/**
 * Calcula o total de odds aplicando a regra especial:
 * Quando no mesmo jogo o apostador seleciona AMBOS:
 *   - "Ambos Marcam (Sim)" (Both Teams Score)
 *   - "+2.5 Gols (Sim)" (Goals Over/Under)
 * A odd combinada desses dois mercados é: max(odd1, odd2) × 1.15
 * Quaisquer outros mercados do mesmo jogo (ou de outros jogos) multiplicam normalmente.
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
    const over25 = gameSelections.find(isOver25);

    if (btts && over25) {
      const combined = Math.max(btts.odds, over25.odds) * 1.15;
      totalOdds *= combined;
      for (const sel of gameSelections) {
        if (sel !== btts && sel !== over25) {
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
