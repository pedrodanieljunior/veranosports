import { useQuery } from "@tanstack/react-query";
import { MarketSetting } from "@shared/schema";

export function useMarketSettings() {
  const { data: settings = [] } = useQuery<MarketSetting[]>({
    queryKey: ["/api/admin/market-settings"],
    staleTime: 60 * 1000,
  });

  const getBoostMultiplier = (marketKey: string): number => {
    const setting = settings.find(s => s.marketKey === marketKey);
    if (!setting) return 1;
    return 1 + setting.boostPercent / 100;
  };

  const getBoostPercent = (marketKey: string): number => {
    const setting = settings.find(s => s.marketKey === marketKey);
    return setting?.boostPercent ?? 0;
  };

  const hasBoosted = (marketKey: string): boolean => {
    return getBoostPercent(marketKey) !== 0;
  };

  return { settings, getBoostMultiplier, getBoostPercent, hasBoosted };
}
