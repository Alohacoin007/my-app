// American odds helpers.

export function americanToDecimal(odds: number): number {
  if (odds === 0) return 1;
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

export function decimalToAmerican(dec: number): number {
  if (dec <= 1) return 0;
  return dec >= 2
    ? Math.round((dec - 1) * 100)
    : Math.round(-100 / (dec - 1));
}

export function combineAmerican(oddsList: number[]): number {
  const dec = oddsList.reduce((p, o) => p * americanToDecimal(o), 1);
  return decimalToAmerican(dec);
}

export function payoutCents(stakeCents: number, americanOdds: number): number {
  return Math.round(stakeCents * americanToDecimal(americanOdds));
}

export function profitCents(stakeCents: number, americanOdds: number): number {
  return payoutCents(stakeCents, americanOdds) - stakeCents;
}

export function formatAmerican(odds: number | null | undefined): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatSignedMoney(cents: number): string {
  const sign = cents >= 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(cents))}`;
}

export function formatSpread(line: number | null | undefined): string {
  if (line == null) return "—";
  return line > 0 ? `+${line}` : `${line}`;
}

export function formatPct(bps: number): string {
  const v = bps / 100;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}
