// 프로토타입용 목업 데이터. 서버/클라이언트 하이드레이션이 어긋나지 않도록
// 모든 값은 결정적(시드 기반)으로 생성한다.

export type MarketKey = "home" | "draw" | "away";

export interface Match {
  id: string;
  league: string;
  home: string;
  away: string;
  kickoff: string; // 표시용 시각
  odds: Record<MarketKey, number>;
  /** 직전 갱신 대비 배당 이동 방향 (배당판의 ▲▼ 표시용) */
  movement: Record<MarketKey, -1 | 0 | 1>;
}

export interface Selection {
  id: string; // `${matchId}:${market}`
  matchId: string;
  matchLabel: string;
  market: MarketKey;
  marketLabel: string;
  odds: number;
}

export interface LiveGame {
  id: string;
  league: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  status: string; // 예: "63'"
}

export interface UpcomingGame {
  id: string;
  league: string;
  home: string;
  away: string;
  kickoff: string;
}

export const MARKET_LABELS: Record<MarketKey, string> = {
  home: "Home",
  draw: "Draw",
  away: "Away",
};

export const MATCHES: Match[] = [
  {
    id: "epl-1",
    league: "EPL",
    home: "Man City",
    away: "Arsenal",
    kickoff: "22:00",
    odds: { home: 2.1, draw: 3.4, away: 3.15 },
    movement: { home: -1, draw: 0, away: 1 },
  },
  {
    id: "epl-2",
    league: "EPL",
    home: "Liverpool",
    away: "Chelsea",
    kickoff: "23:30",
    odds: { home: 1.85, draw: 3.6, away: 4.2 },
    movement: { home: 1, draw: -1, away: 0 },
  },
  {
    id: "kbo-1",
    league: "KBO",
    home: "LG Twins",
    away: "Doosan Bears",
    kickoff: "18:30",
    odds: { home: 1.72, draw: 0, away: 2.05 },
    movement: { home: 0, draw: 0, away: -1 },
  },
  {
    id: "nba-1",
    league: "NBA",
    home: "Lakers",
    away: "Celtics",
    kickoff: "11:00",
    odds: { home: 2.45, draw: 0, away: 1.55 },
    movement: { home: 1, draw: 0, away: -1 },
  },
];

export const LIVE_GAMES: LiveGame[] = [
  {
    id: "live-1",
    league: "KBO",
    home: "SSG Landers",
    away: "KIA Tigers",
    homeScore: 4,
    awayScore: 2,
    status: "Top 7th",
  },
  {
    id: "live-2",
    league: "EPL",
    home: "Tottenham",
    away: "Newcastle",
    homeScore: 1,
    awayScore: 1,
    status: "63'",
  },
  {
    id: "live-3",
    league: "NBA",
    home: "Warriors",
    away: "Nuggets",
    homeScore: 88,
    awayScore: 91,
    status: "4Q 05:12",
  },
];

export const UPCOMING_GAMES: UpcomingGame[] = [
  { id: "up-1", league: "EPL", home: "Man City", away: "Arsenal", kickoff: "Today 22:00" },
  { id: "up-2", league: "EPL", home: "Liverpool", away: "Chelsea", kickoff: "Today 23:30" },
  { id: "up-3", league: "KBO", home: "LG Twins", away: "Doosan Bears", kickoff: "Today 18:30" },
  { id: "up-4", league: "NBA", home: "Lakers", away: "Celtics", kickoff: "Tomorrow 11:00" },
  { id: "up-5", league: "KBO", home: "Samsung Lions", away: "Lotte Giants", kickoff: "Tomorrow 17:00" },
];

/** 간단한 시드 기반 의사난수 (mulberry32) — 렌더마다 동일한 시계열을 만든다. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface OddsPoint {
  label: string; // x축 라벨 (시각)
  home: number;
  away: number;
}

/** 최근 24시간 동안의 홈/원정 승 배당 추이 (25포인트, 1시간 간격) */
export function buildOddsHistory(): OddsPoint[] {
  const rand = mulberry32(20260714);
  const points: OddsPoint[] = [];
  let home = 2.45;
  let away = 2.9;
  for (let i = 0; i <= 24; i++) {
    home = Math.min(3.4, Math.max(1.6, home + (rand() - 0.53) * 0.12));
    away = Math.min(3.6, Math.max(1.8, away + (rand() - 0.47) * 0.12));
    const hour = (21 + i) % 24; // 어제 21:00 ~ 오늘 21:00 구간으로 표시
    points.push({
      label: `${String(hour).padStart(2, "0")}:00`,
      home: Math.round(home * 100) / 100,
      away: Math.round(away * 100) / 100,
    });
  }
  return points;
}
