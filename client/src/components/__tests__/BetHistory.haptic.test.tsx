/**
 * Verifies that hapticMedium() is called on each of the three "Confirmar" paths
 * in BetHistory → BetCard:
 *
 *  1. Preview-strip confirm  (data-testid button-preview-cashout-confirm-*)
 *  2. EA (early-exit) confirm inside the expanded detail  (button-ea-confirm-*)
 *  3. Full cash-out confirm inside the expanded detail    (button-cashout-confirm-*)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BetHistory } from "../BetHistory";
import type { BetSlip } from "@shared/schema";

// ─── Mock: platform haptics ───────────────────────────────────────────────────
const hapticMediumMock = vi.fn();
const hapticSuccessMock = vi.fn();

vi.mock("@/lib/platform", () => ({
  hapticMedium: () => hapticMediumMock(),
  hapticSuccess: () => hapticSuccessMock(),
}));

// ─── Mock: cashOutUtils – we control what state is returned ───────────────────
const getCashOutStateMock = vi.fn();

vi.mock("@shared/cashOutUtils", () => ({
  getCashOutState: (...args: unknown[]) => getCashOutStateMock(...args),
}));

// ─── Mock: queryClient (the singleton used by BetHistory) ────────────────────
vi.mock("@/lib/queryClient", () => ({
  queryClient: {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  },
  apiRequest: vi.fn(),
  getQueryFn: vi.fn(),
}));

// ─── Mock: useToast ───────────────────────────────────────────────────────────
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ─── Mock: shared utilities (not under test) ─────────────────────────────────
vi.mock("@shared/oddsUtils", () => ({
  checkIsComboBonus: () => false,
  getComboBonus: () => 0,
  computeTotalOdds: () => 2.0,
}));

vi.mock("@/lib/marketLabels", () => ({
  translateMarket: (k: string) => k,
  formatOutcome: (o: string) => o,
}));

vi.mock("@/lib/formatOdds", () => ({
  fmtOdds: (o: number) => String(o),
}));

// ─── Stub fetch so BetHistory's /api/bolao and /api/cashout requests don't error
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes("/api/bets/") && url.includes("/cashout")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ cashOutValue: 10 }),
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
}) as unknown as typeof fetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, enabled: false },
      mutations: { retry: false },
    },
  });
}

const BET_ID = "abcdef12-0000-0000-0000-000000000001";

function makeBet(overrides: Partial<BetSlip> = {}): BetSlip {
  return {
    id: BET_ID,
    userId: "user-1",
    sessionId: null,
    status: "pending",
    stake: 10,
    totalOdds: 2.0,
    potentialWin: 20,
    bonusUsed: 0,
    verified: false,
    telegramChatId: null,
    pixKey: null,
    cashOutValue: null,
    caixaSnapshot: null,
    createdAt: new Date().toISOString(),
    selections: [
      {
        id: "sel-1",
        gameId: "game-1",
        homeTeam: "Flamengo",
        awayTeam: "Vasco",
        commenceTime: new Date().toISOString(),
        sportTitle: "Soccer",
        marketKey: "h2h",
        bookmaker: "test",
        outcome: "Flamengo",
        odds: 2.0,
        originalOdds: 2.0,
        result: "pending",
      },
    ],
    ...overrides,
  } as BetSlip;
}

function renderHistory(bet: BetSlip) {
  const qc = buildQueryClient();

  // Pre-seed cashout-settings so the useQuery call has data immediately
  qc.setQueryData(["/api/cashout-settings"], { earlyExitPct: 20, cashOutPct: 20 });
  qc.setQueryData(["/api/live-correlation"], {});

  return render(
    <QueryClientProvider client={qc}>
      <BetHistory bets={[bet]} isLoading={false} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("BetHistory cash-out haptics", () => {
  beforeEach(() => {
    hapticMediumMock.mockClear();
    hapticSuccessMock.mockClear();
  });

  // ── 1. Preview-strip confirm ─────────────────────────────────────────────
  it("fires hapticMedium when the preview-strip confirm button is clicked (cashout state)", async () => {
    getCashOutStateMock.mockReturnValue({ type: "cashout", offer: 10 });

    renderHistory(makeBet());

    // Step 1: click the preview strip's initial "Cashout" button to enter confirming mode
    const previewBtn = screen.getByTestId(`button-preview-cashout-${BET_ID}`);
    fireEvent.click(previewBtn);

    // hapticMedium should have fired once for the initial click
    expect(hapticMediumMock).toHaveBeenCalledTimes(1);
    hapticMediumMock.mockClear();

    // Step 2: the confirm button is now visible – click it
    const confirmBtn = await screen.findByTestId(`button-preview-cashout-confirm-${BET_ID}`);
    fireEvent.click(confirmBtn);

    expect(hapticMediumMock).toHaveBeenCalledTimes(1);
  });

  // ── 2. EA (early-exit) confirm in expanded detail ────────────────────────
  it("fires hapticMedium when the EA confirm button is clicked (ea state)", async () => {
    getCashOutStateMock.mockReturnValue({ type: "ea", offer: 8 });

    renderHistory(makeBet());

    // Expand the card
    const expandBtn = screen.getByTestId(`button-expand-bet-${BET_ID}`);
    fireEvent.click(expandBtn);

    // Click the initial "Encerrar Aposta" button inside the expanded detail
    // (this fires hapticMedium once and transitions confirming → "ea")
    const eaBtn = await screen.findByTestId(`button-ea-${BET_ID}`);
    fireEvent.click(eaBtn);

    // Verify the initial button fired hapticMedium, then reset counter
    expect(hapticMediumMock).toHaveBeenCalledTimes(1);
    hapticMediumMock.mockClear();

    // Now click the EA confirm button — this must also fire hapticMedium
    const eaConfirmBtn = await screen.findByTestId(`button-ea-confirm-${BET_ID}`);
    fireEvent.click(eaConfirmBtn);

    expect(hapticMediumMock).toHaveBeenCalledTimes(1);
  });

  // ── 3. Full cash-out confirm in expanded detail ──────────────────────────
  it("fires hapticMedium when the cashout confirm button is clicked (cashout state)", async () => {
    getCashOutStateMock.mockReturnValue({ type: "cashout", offer: 10 });

    renderHistory(makeBet());

    // Expand the card
    const expandBtn = screen.getByTestId(`button-expand-bet-${BET_ID}`);
    fireEvent.click(expandBtn);

    // Click the initial "Cashout" button inside the expanded detail
    const cashoutBtn = await screen.findByTestId(`button-cashout-${BET_ID}`);
    fireEvent.click(cashoutBtn);

    hapticMediumMock.mockClear();

    // Click the cashout confirm button
    const cashoutConfirmBtn = await screen.findByTestId(`button-cashout-confirm-${BET_ID}`);
    fireEvent.click(cashoutConfirmBtn);

    expect(hapticMediumMock).toHaveBeenCalledTimes(1);
  });
});
