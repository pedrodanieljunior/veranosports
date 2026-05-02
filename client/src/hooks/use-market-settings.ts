import { useQuery } from "@tanstack/react-query";
import { MarketSetting } from "@shared/schema";

export function useMarketSettings() {
  const { data: settings = [] } = useQuery<MarketSetting[]>({
    queryKey: ["/api/market-settings"],
    staleTime: 10 * 1000,
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

  return { settings, getBoostMultiplier, getBoostPercent, hasBoosted };
}
