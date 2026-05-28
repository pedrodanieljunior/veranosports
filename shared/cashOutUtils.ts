export type CashOutState =
  | { type: "ea"; offer: number }
  | { type: "unavailable" }
  | { type: "cashout"; offer: number; wonEvents: number; totalEvents: number }
  | { type: "none" }
  | { type: "done"; cashOutValue: number };

export function computeEarlyExitOffer(stake: number, earlyExitPct: number): number {
  return Math.round(stake * (1 - earlyExitPct / 100) * 100) / 100;
}

export function computeCashOutOffer(
  stake: number,
  potentialWin: number,
  totalEvents: number,
  wonEvents: number,
  cashPct: number,
): number | null {
  if (totalEvents <= 1) return null;
  if (wonEvents <= 0 || wonEvents >= totalEvents) return null;

  const N = Math.min(totalEvents, 12);
  const { discountFracs, premiumFracs } = getCashOutFractions(N, cashPct);
  const pivotM = discountFracs.length + 1;
  const M = wonEvents;

  let offer: number;
  if (M < pivotM) {
    const discPct = discountFracs[M - 1];
    offer = stake * (1 - discPct / 100);
  } else if (M === pivotM) {
    offer = stake;
  } else {
    const premIdx = M - pivotM - 1;
    if (premIdx >= premiumFracs.length) return null;
    offer = stake + potentialWin * premiumFracs[premIdx] / 100;
  }

  return Math.round(offer * 100) / 100;
}

function getCashOutFractions(N: number, cash: number): { discountFracs: number[]; premiumFracs: number[] } {
  const c1 = cash - 1;
  switch (N) {
    case 2:  return { discountFracs: [],                             premiumFracs: [] };
    case 3:  return { discountFracs: [],                             premiumFracs: [cash] };
    case 4:  return { discountFracs: [c1],                           premiumFracs: [cash] };
    case 5:  return { discountFracs: [c1, cash/2],                   premiumFracs: [cash] };
    case 6:  return { discountFracs: [c1, cash/2],                   premiumFracs: [cash/2, cash] };
    case 7:  return { discountFracs: [c1, cash/2, cash/4],           premiumFracs: [cash/2, cash] };
    case 8:  return { discountFracs: [c1, cash/2, cash/4],           premiumFracs: [cash/4, cash/2, cash] };
    case 9:  return { discountFracs: [c1, c1*3/4, c1/2, c1/4],      premiumFracs: [cash/4, cash/2, cash] };
    case 10: return { discountFracs: [c1, c1*3/4, c1/2, c1/4],      premiumFracs: [cash/4, cash/2, cash*3/4, cash] };
    case 11: return { discountFracs: [c1, c1*4/5, c1*3/5, c1*2/5, c1/5], premiumFracs: [cash/4, cash/2, cash*3/4, cash] };
    default: return { discountFracs: [c1, c1*4/5, c1*3/5, c1*2/5, c1/5], premiumFracs: [cash/5, cash*2/5, cash*3/5, cash*4/5, cash] };
  }
}

export function getCashOutState(
  bet: {
    status: string;
    stake: number;
    potentialWin: number;
    bonusUsed?: number | null;
    cashOutValue?: number | null;
    selections: Array<{ gameId: string; commenceTime: string; result?: string | null; odds?: number; originalOdds?: number }>;
  },
  now: Date,
  cashOutPct: number,
  earlyExitPct: number,
): CashOutState {
  if (bet.cashOutValue != null) return { type: "done", cashOutValue: bet.cashOutValue };
  if (bet.status !== "pending") return { type: "none" };

  const anyLost = bet.selections.some(s => s.result === "lost");
  if (anyLost) return { type: "none" };

  // Elegibilidade: em bilhetes com 2+ seleções, verifica se a soma das
  // demais odds >= maior odd. Se não, o cashout funciona mas é limitado
  // ao valor apostado (sem lucro — trava no empate).
  let capAtStake = false;
  if (bet.selections.length > 1) {
    const selOdds = bet.selections.map(s => s.originalOdds ?? s.odds ?? 1);
    const maxOdd = Math.max(...selOdds);
    const sumOthers = selOdds.reduce((acc, o) => acc + o, 0) - maxOdd;
    capAtStake = sumOthers < maxOdd;
  }

  const grouped: Record<string, typeof bet.selections> = {};
  for (const sel of bet.selections) {
    if (!grouped[sel.gameId]) grouped[sel.gameId] = [];
    grouped[sel.gameId].push(sel);
  }
  const gameIds = Object.keys(grouped);
  const totalEvents = gameIds.length;

  const wonEvents = gameIds.filter(gameId =>
    grouped[gameId].every(s => s.result === "won")
  ).length;

  // Se já tem jogos ganhos mas não todos → oferecer cash out imediatamente
  if (wonEvents > 0 && wonEvents < totalEvents) {
    const netPotentialWin = Math.max(0, bet.potentialWin - (bet.bonusUsed ?? 0));
    const rawOffer = computeCashOutOffer(bet.stake, netPotentialWin, totalEvents, wonEvents, cashOutPct);
    if (rawOffer !== null) {
      const offer = capAtStake ? Math.min(rawOffer, bet.stake) : rawOffer;
      return { type: "cashout", offer, wonEvents, totalEvents };
    }
  }

  // Nenhum jogo ganho ainda: verificar se está pré-jogo ou em andamento
  const allNotStarted = bet.selections.every(s => new Date(s.commenceTime) > now);
  if (allNotStarted) {
    return { type: "ea", offer: computeEarlyExitOffer(bet.stake, earlyExitPct) };
  }

  const anyInProgress = gameIds.some(gameId => {
    const sels = grouped[gameId];
    const started = sels.some(s => new Date(s.commenceTime) <= now);
    const allResolved = sels.every(s => s.result !== "pending");
    return started && !allResolved;
  });
  if (anyInProgress) return { type: "unavailable" };

  return { type: "none" };
}
