import { useQuery } from "@tanstack/react-query";
import { MarketSetting, GameMarketOverride } from "@shared/schema";

export function useMarketSettings() {
  const { data: settings = [] } = useQuery<MarketSetting[]>({
    queryKey: ["/api/market-settings"],
    staleTime: 10 * 1000,
  });

  const { data: gameOverrides = [] } = useQuery<GameMarketOverride[]>({
    queryKey: ["/api/game-market-overrides"],
    staleTime: 30 * 1000,
  });

  const DEFAULT_BOOST: Record<string, number> = {};

  const getBoostMultiplier = (marketKey: string): number => {
    const setting = settings.find(s => s.marketKey === marketKey);
    if (!setting) return 1 + (DEFAULT_BOOST[marketKey] ?? 0) / 100;
    return 1 + setting.boostPercent / 100;
  };

  const getBoostPercent = (marketKey: string): number => {
    const setting = settings.find(s => s.marketKey === marketKey);
    return setting?.boostPercent ?? (DEFAULT_BOOST[marketKey] ?? 0);
  };

  const hasBoosted = (marketKey: string): boolean => {
    return getBoostPercent(marketKey) !== 0;
  };

  const getGameBoostMultiplier = (gameId: string, marketKey: string): number => {
    const globalMult = getBoostMultiplier(marketKey);
    const override = gameOverrides.find(o => o.gameId === gameId && o.marketKey === marketKey);
    if (!override || override.adjustPercent === 0) return globalMult;
    return globalMult * (1 + override.adjustPercent / 100);
  };

  const getGameBoostPercent = (gameId: string, marketKey: string): number => {
    const globalPct = getBoostPercent(marketKey);
    const override = gameOverrides.find(o => o.gameId === gameId && o.marketKey === marketKey);
    if (!override || override.adjustPercent === 0) return globalPct;
    const combined = (1 + globalPct / 100) * (1 + override.adjustPercent / 100) - 1;
    return Math.round(combined * 10000) / 100;
  };

  const hasGameOverride = (gameId: string, marketKey: string): boolean => {
    const override = gameOverrides.find(o => o.gameId === gameId && o.marketKey === marketKey);
    return !!override && override.adjustPercent !== 0;
  };

  return { settings, gameOverrides, getBoostMultiplier, getBoostPercent, hasBoosted, getGameBoostMultiplier, getGameBoostPercent, hasGameOverride };
}
