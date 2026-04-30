import { useQuery } from "@tanstack/react-query";

export function useComboBonus() {
  const { data: pctTable = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/market-settings/combo-bonus"],
    staleTime: 60 * 1000,
  });

  const fractionTable: Record<number, number> = {};
  for (const [k, v] of Object.entries(pctTable)) {
    fractionTable[Number(k)] = v / 100;
  }

  return { pctTable, fractionTable };
}
