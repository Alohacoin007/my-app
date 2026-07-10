import type { Sport } from "./types";

export const SPORT_LABEL: Record<Sport, string> = {
  NFL: "NFL",
  MLB: "MLB",
  NBA: "NBA",
};

export const SPORT_FULL: Record<Sport, string> = {
  NFL: "Football",
  MLB: "Baseball",
  NBA: "Basketball",
};

export function sportBadgeClass(sport: string): string {
  switch (sport) {
    case "NFL":
      return "bg-nfl-soft text-nfl";
    case "MLB":
      return "bg-mlb-soft text-mlb";
    case "NBA":
      return "bg-nba-soft text-nba";
    default:
      return "bg-surface-chip text-ink-mid";
  }
}

export function fakeMatchTicker(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const n = Math.abs(hash);
  return ("0000" + n.toString(36).toUpperCase()).slice(-4);
}
