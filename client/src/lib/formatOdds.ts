export function roundOdds(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fmtOdds(n: number): string {
  return roundOdds(n).toFixed(2);
}
