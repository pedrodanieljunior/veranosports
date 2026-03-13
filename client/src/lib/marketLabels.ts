const MARKET_LABELS: Record<string, string> = {
  h2h: "Resultado Final",
  spreads: "Handicap",
  totals: "Total de Gols",
  btts: "Ambos Marcam",
  ht_ft: "Intervalo/Final",
  exact_score: "Placar Exato",
  first_to_score: "Primeiro a Marcar",
  corners: "Escanteios",
  red_card: "Cartão Vermelho",
  "extra-1": "Ambos Marcam",
  "extra-2": "Intervalo/Final",
  "extra-4": "Placar Exato",
  "extra-5": "Total de Gols 2.5",
  "extra-6": "Primeiro a Marcar",
  "extra-11": "Escanteios",
  "extra-15": "Cartão Vermelho",
};

export function translateMarket(key: string): string {
  if (MARKET_LABELS[key]) return MARKET_LABELS[key];
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
