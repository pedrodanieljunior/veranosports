const MARKET_LABELS: Record<string, string> = {
  h2h: "Resultado Final",
  spreads: "Handicap",
  totals: "Total de Gols",
  btts: "Ambas Marcam",
  ht_ft: "Intervalo/Final",
  exact_score: "Placar Exato",
  first_to_score: "Primeiro a Marcar",
  corners: "Escanteios",
  red_card: "Cartão Vermelho",
  "Both Teams Score": "Ambas Marcam",
  "HT/FT Double": "Intervalo/Final",
  "Exact Score": "Placar Exato",
  "Goals Over/Under": "Total de Gols",
  "Goals Over/Under First Half": "Total de Gols 1º Tempo",
  "Goals Over/Under - Second Half": "Total de Gols 2º Tempo",
  "Team To Score First": "Primeira Equipe a Marcar",
  "Corners Over Under": "Total de Escanteios",
  "Total Corners": "Total de Escanteios",
  "Red Card": "Cartão Vermelho no Jogo",
  "Match Winner": "Resultado Final",
  "Home/Away": "Casa/Fora",
  "Double Chance": "Dupla Chance",
  "First Half Winner": "Vencedor 1º Tempo",
  "Second Half Winner": "Vencedor 2º Tempo",
  "Asian Handicap": "Handicap Asiático",
  "Handicap Result": "Resultado com Handicap",
  "Odd/Even": "Ímpar/Par",
  "Correct Score - First Half": "Placar Exato 1º Tempo",
  "Both Teams Score - First Half": "Ambas Marcam 1º Tempo",
  "Both Teams To Score - Second Half": "Ambas Marcam 2º Tempo",
  "Winning Margin": "Margem de Vitória",
  "Clean Sheet - Home": "Sem Sofrer Gol - Casa",
  "Clean Sheet - Away": "Sem Sofrer Gol - Visitante",
  "Win to Nil - Home": "Vitória sem Sofrer Gol - Casa",
  "Win to Nil - Away": "Vitória sem Sofrer Gol - Visitante",
  "Corners 1x2": "Escanteios 1x2",
  "Cards Over/Under": "Total de Cartões",
  "Cards - Home": "Cartões - Casa",
  "Cards - Away": "Cartões - Fora",
  "Red Card In The Match (1st Half)": "Cartão Vermelho 1º Tempo",
  "Corners Over Under First Half": "Escanteios 1º Tempo",
  "Results/Both Teams Score": "Resultado + Ambas Marcam",
  "Result/Total Goals": "Resultado + Total Gols",
  "extra-1": "Ambas Marcam",
  "extra-2": "Intervalo/Final",
  "extra-4": "Placar Exato",
  "extra-5": "Total de Gols",
  "extra-6": "Primeiro a Marcar",
  "extra-8": "Ambas Marcam",
  "extra-9": "Intervalo/Final",
  "extra-11": "Escanteios",
  "extra-12": "Dupla Chance",
  "extra-15": "Cartão Vermelho",
  "extra-45": "Total de Escanteios",
  "extra-46": "Escanteios 1x2",
  "extra-47": "Total de Cartões",
};

export function translateMarket(key: string): string {
  if (key === "boost") return "Super Boost";
  if (key === "copa_grupo" || key.startsWith("copa_grupo_")) return "Copa do Mundo 2026";
  if (MARKET_LABELS[key]) return MARKET_LABELS[key];
  if (key.startsWith("extra-")) {
    return "Mercado Extra";
  }
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const VALUE_TRANSLATIONS: Record<string, string> = {
  Yes: "Sim",
  No: "Não",
  Draw: "Empate",
  "No Goal": "Sem Gol",
  Odd: "Ímpar",
  Even: "Par",
};

function translateHalf(part: string, homeTeam?: string, awayTeam?: string): string {
  if (part === "Home") return homeTeam || "Casa";
  if (part === "Away") return awayTeam || "Fora";
  if (part === "Draw") return "Empate";
  if (part === "Yes") return "Sim";
  if (part === "No") return "Não";
  return part;
}

export function formatOutcome(
  outcome: string,
  marketKey: string,
  homeTeam?: string,
  awayTeam?: string
): string {
  let value = outcome;

  const allKnownPrefixes = [
    ...Object.keys(MARKET_LABELS).filter((k) => !k.startsWith("extra-") && !["h2h","spreads","totals","btts","ht_ft","exact_score","first_to_score","corners","red_card"].includes(k)),
    marketKey,
  ];
  for (const prefix of allKnownPrefixes) {
    if (outcome.startsWith(prefix + "-")) {
      value = outcome.slice(prefix.length + 1);
      break;
    }
  }

  if (value === outcome && marketKey && outcome.startsWith(marketKey + "-")) {
    value = outcome.slice(marketKey.length + 1);
  }

  // Goals Over/Under usa "Sim" = Mais de 2,5 e "Não" = Menos de 2,5
  if (marketKey === "Goals Over/Under") {
    if (value === "Sim" || value === "Yes") return "Mais de 2,5";
    if (value === "Não" || value === "No")  return "Menos de 2,5";
  }

  // Red Card usa "Sim" = Houve Cartão Vermelho e "Não" = Sem Cartão Vermelho
  if (marketKey === "Red Card") {
    if (value === "Sim" || value === "Yes") return "Com Cartão Vermelho";
    if (value === "Não" || value === "No")  return "Sem Cartão Vermelho";
  }

  if (VALUE_TRANSLATIONS[value]) return VALUE_TRANSLATIONS[value];

  if (value === "Home") return homeTeam || "Casa";
  if (value === "Away") return awayTeam || "Fora";

  value = value.replace(/\bOver\b/g, "Mais").replace(/\bUnder\b/g, "Menos");

  if (value.includes("/")) {
    return value
      .split("/")
      .map((p) => translateHalf(p.trim(), homeTeam, awayTeam))
      .join("/");
  }

  return value;
}
