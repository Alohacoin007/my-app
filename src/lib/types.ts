// String literal unions used in place of Prisma enums (SQLite limitation).

export type Sport = "NFL" | "MLB" | "NBA";
export const SPORTS: Sport[] = ["NFL", "MLB", "NBA"];

export type MatchStatus = "UPCOMING" | "LIVE" | "FINAL" | "CANCELED";
export type BetStatus = "PENDING" | "WON" | "LOST" | "VOID";
export type BetType = "SINGLE" | "PARLAY";
export type Market = "MONEYLINE" | "SPREAD" | "TOTAL";
export type Pick = "HOME" | "AWAY" | "OVER" | "UNDER";
