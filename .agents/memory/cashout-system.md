---
name: Cash Out / Encerrar Aposta system
description: Architecture and key decisions for the bet cash-out feature.
---

# Cash Out System

## Two modes
- **EA (Encerrar Aposta)**: all games not started → user gets `stake * (1 - earlyExitPct/100)`. Default 20%.
- **Cash Out (escalonado)**: N events, M won (after game ends, before last event) → formula-based offer. Default cashPct=20%.

## Shared utility: shared/cashOutUtils.ts
- `computeEarlyExitOffer(stake, earlyExitPct)` 
- `computeCashOutOffer(stake, potWin, totalEvents, wonEvents, cashPct)` — returns null if unavailable
- `getCashOutState(bet, now, cashOutPct, earlyExitPct)` — returns typed state: ea|cashout|unavailable|none|done

## DB
- `bet_slips.cash_out_value REAL` — null until cashed out; when set, status = "cashed_out"
- Migration: `ALTER TABLE bet_slips ADD COLUMN IF NOT EXISTS cash_out_value REAL;`

## Backend (routes.ts)
- `GET /api/cashout-settings` — public, returns `{ earlyExitPct, cashOutPct }` from module-level vars
- `POST /api/bets/:id/cashout` — validates session.userId, computes offer, credits balance, creates transaction type "cashout", calls storage.cashOutBet()
- Settings stored via storage.setSetting("earlyExitPct"/"cashOutPct") and loaded at startup
- Admin PATCH/GET /api/admin/settings now includes earlyExitPct and cashOutPct

## Frontend
- BetHistory.tsx: BetCard receives earlyExitPct/cashOutPct props; uses getCashOutState(); two-step confirm button (first click = show amount, second = execute)
- EA button: orange; Cash Out button: emerald; both show offer amount in BRL
- "cashed_out" status: emerald color, Banknote icon, shows cashOutValue with potentialWin crossed out
- BetHistory fetches /api/cashout-settings on mount (staleTime 5min)

## Admin
- SettingsTab: two new inputs (earlyExitPct, cashOutPct)
- Caixa formula: +cashPlus (sum of stake - cashOutValue for cashed_out bets)
- Caixa display: new row with "Lucro defesas" (cyan) and "Cash +" (emerald) cards

**Why:** Cash out is a standard sportsbook feature; sharing the logic in cashOutUtils.ts avoids duplication between FE state display and BE validation.
