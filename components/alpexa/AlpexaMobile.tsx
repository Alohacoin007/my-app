"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Alpexa Sports 모바일 홈 화면 — BetBoard 디자인 시스템으로 리스타일한 시안.
 * 잔액 히어로 / 검색 / 종목 칩 / Spread·Total·Moneyline 배당표 / 하단 탭바.
 */

interface Market {
  line?: string;
  odds: number;
}

interface TeamRow {
  abbr: string;
  name: string;
  spread?: Market;
  total?: Market;
  money?: Market;
}

interface Game {
  id: string;
  league: string;
  datetime: string;
  locked?: boolean;
  teams: [TeamRow, TeamRow];
}

const SPORTS = [
  { key: "nba", label: "NBA", icon: "🏀" },
  { key: "ncaab", label: "NCAAB", icon: "🏀" },
  { key: "nfl", label: "NFL", icon: "🏈" },
  { key: "mlb", label: "MLB", icon: "⚾" },
  { key: "nhl", label: "NHL", icon: "🏒" },
  { key: "soccer", label: "Soccer", icon: "⚽" },
  { key: "ufc", label: "UFC", icon: "🥊" },
];

const GAMES: Game[] = [
  {
    id: "mlb-1",
    league: "MLB",
    datetime: "Tue, Jul 14 · 5:00 PM",
    teams: [
      {
        abbr: "AL",
        name: "American",
        spread: { line: "+1.5", odds: -175 },
        total: { line: "Under 8", odds: 101 },
        money: { odds: 119 },
      },
      {
        abbr: "NL",
        name: "National",
        spread: { line: "-1.5", odds: 164 },
        total: { line: "Over 8.5", odds: -105 },
        money: { odds: -127 },
      },
    ],
  },
  {
    id: "mlb-2",
    league: "MLB",
    datetime: "Thu, Jul 16 · 4:00 PM",
    locked: true,
    teams: [
      { abbr: "NYM", name: "Mets" },
      { abbr: "PHI", name: "Phillies" },
    ],
  },
  {
    id: "mlb-3",
    league: "MLB",
    datetime: "Fri, Jul 17 · 10:35 AM",
    locked: true,
    teams: [
      { abbr: "TB", name: "Rays" },
      { abbr: "BOS", name: "Red Sox" },
    ],
  },
  {
    id: "mlb-4",
    league: "MLB",
    datetime: "Fri, Jul 17 · 4:05 PM",
    teams: [
      {
        abbr: "LAD",
        name: "Dodgers",
        spread: { line: "-1.5", odds: -110 },
        total: { line: "Over 9", odds: -115 },
        money: { odds: -150 },
      },
      {
        abbr: "SF",
        name: "Giants",
        spread: { line: "+1.5", odds: -110 },
        total: { line: "Under 9", odds: -105 },
        money: { odds: 130 },
      },
    ],
  },
];

const fmtOdds = (v: number) => (v > 0 ? `+${v}` : `${v}`);

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-ink-muted" aria-hidden>
      <rect x="2.4" y="5.2" width="7.2" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5V3.8a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function OddsCell({
  market,
  locked,
  selected,
  onToggle,
}: {
  market?: Market;
  locked?: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  if (locked || !market) {
    return (
      <div
        className="flex h-11 items-center justify-center rounded-md bg-surface-2"
        aria-label="Betting locked"
      >
        <LockIcon />
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`flex h-11 flex-col items-center justify-center rounded-md border leading-tight transition-colors ${
        selected
          ? "border-series-1 bg-series-1/15"
          : "border-hairline bg-surface-2 hover:border-ink-muted"
      }`}
    >
      {market.line && <span className="text-[10px] text-ink-muted">{market.line}</span>}
      <span
        className="text-xs font-semibold tabular-nums"
        style={{ color: market.odds > 0 ? "var(--color-up)" : "var(--color-ink)" }}
      >
        {fmtOdds(market.odds)}
      </span>
    </button>
  );
}

const NAV = [
  {
    key: "home",
    label: "Home",
    icon: (
      <path d="M2 7.5 8 2l6 5.5V14a1 1 0 0 1-1 1h-3.2v-4.2H6.2V15H3a1 1 0 0 1-1-1V7.5Z" strokeLinejoin="round" />
    ),
  },
  {
    key: "live",
    label: "Live",
    icon: (
      <>
        <circle cx="8" cy="9" r="2" />
        <path d="M4.5 12.5a5 5 0 0 1 0-7M11.5 5.5a5 5 0 0 1 0 7M2.5 14.5a8 8 0 0 1 0-11M13.5 3.5a8 8 0 0 1 0 11" strokeLinecap="round" />
      </>
    ),
  },
  {
    key: "bets",
    label: "My Bets",
    icon: (
      <path d="M2 5.5V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1.5a1.5 1.5 0 0 0 0 3V10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.5a1.5 1.5 0 0 0 0-3ZM6 3v8" strokeLinejoin="round" />
    ),
  },
  {
    key: "wallet",
    label: "Wallet",
    icon: (
      <>
        <rect x="2" y="4" width="12" height="9" rx="1.5" />
        <path d="M10 8.5h2M2 6.5h12" />
      </>
    ),
  },
];

export default function AlpexaMobile() {
  const [sport, setSport] = useState("mlb");
  const [tab, setTab] = useState("home");
  const [picks, setPicks] = useState<Set<string>>(new Set());

  // BetBoard와 동일한 테마 메커니즘 공유 (화이트 기본, 🌙로 다크 전환)
  const [theme, setTheme] = useState<"dark" | "light">("light");
  useEffect(() => {
    try {
      if (window.localStorage.getItem("betboard-theme") === "dark") {
        setTheme("dark");
        document.documentElement.dataset.theme = "dark";
      }
    } catch {
      // 스토리지가 막힌 환경에서는 기본 테마로 시작
    }
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        window.localStorage.setItem("betboard-theme", next);
      } catch {
        // 저장 실패는 무시
      }
      return next;
    });
  }, []);

  const togglePick = (id: string) =>
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const grid = "grid grid-cols-[minmax(0,1fr)_repeat(3,62px)] items-center gap-1.5";

  return (
    <div className="flex h-full flex-col bg-page text-ink">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 헤더 + 잔액 히어로 */}
        <header className="border-b border-hairline bg-surface px-4 pb-3.5 pt-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-series-1 text-sm font-bold text-white">
              A
            </span>
            <h1 className="text-[15px] font-bold">Alpexa Sports</h1>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" aria-label="Notifications" className="relative rounded-md p-1.5 text-ink-2 hover:bg-surface-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
                  <path d="M8 2.5a3.5 3.5 0 0 1 3.5 3.5c0 3 1 4 1.5 4.5H3c.5-.5 1.5-1.5 1.5-4.5A3.5 3.5 0 0 1 8 2.5ZM6.8 12.5a1.3 1.3 0 0 0 2.4 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-down)" }} />
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2"
              >
                {theme === "dark" ? (
                  <svg width="15" height="15" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <circle cx="6" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6 0.6v1.2M6 10.2v1.2M0.6 6h1.2M10.2 6h1.2M2.2 2.2l0.85 0.85M8.95 8.95l0.85 0.85M9.8 2.2l-0.85 0.85M3.05 8.95l-0.85 0.85" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M10.4 7.2A4.8 4.8 0 1 1 4.8 1.6a3.9 3.9 0 0 0 5.6 5.6Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <button type="button" aria-label="Settings" className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
                  <circle cx="8" cy="8" r="2.2" />
                  <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
          <p className="mt-3 text-[10px] font-semibold tracking-widest text-ink-muted">BALANCE · USD</p>
          <p className="text-[28px] font-bold leading-tight">$1,351,756.36</p>
          <div className="mt-1.5 flex items-center">
            <p className="text-xs text-ink-2">
              Pending <span className="font-semibold tabular-nums text-ink">$112,020.00</span>
            </p>
            <button
              type="button"
              className="ml-auto rounded-md bg-series-1 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              + Deposit
            </button>
          </div>
        </header>

        {/* 검색 */}
        <div className="px-4 pt-3">
          <label className="flex items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="shrink-0 text-ink-muted" aria-hidden>
              <circle cx="6" cy="6" r="4" />
              <path d="m9.2 9.2 3 3" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search teams or games"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            />
          </label>
        </div>

        {/* 종목 칩 */}
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 pt-3 [scrollbar-width:none]">
          {SPORTS.map((s) => {
            const active = sport === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSport(s.key)}
                aria-pressed={active}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-series-1 bg-series-1/15 text-ink"
                    : "border-hairline bg-surface text-ink-2 hover:border-ink-muted"
                }`}
              >
                <span aria-hidden>{s.icon}</span>
                {s.label}
              </button>
            );
          })}
        </div>

        {/* 컬럼 헤더 */}
        <div className={`${grid} pb-1.5 pl-7 pr-[30px] pt-3`}>
          <span className="text-[11px] font-semibold text-ink-2">Today</span>
          {["Spread", "Total", "Moneyline"].map((h) => (
            <span key={h} className="text-center text-[10px] font-semibold tracking-wide text-ink-muted">
              {h}
            </span>
          ))}
        </div>

        {/* 경기 카드 */}
        <ul className="space-y-2 px-4 pb-4">
          {GAMES.map((g) => (
            <li key={g.id} className="rounded-[10px] border border-hairline bg-surface">
              <div className="flex items-center gap-1.5 border-b border-hairline px-3 py-2">
                <span aria-hidden className="text-xs">⚾</span>
                <span className="text-[11px] font-semibold text-ink-2">{g.league}</span>
                <span className="ml-auto text-[11px] tabular-nums text-ink-muted">{g.datetime}</span>
                <button type="button" aria-label="Add to favorites" className="rounded p-0.5 text-ink-muted hover:text-ink">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                    <path d="m7 1.8 1.6 3.3 3.6.5-2.6 2.5.6 3.6L7 10l-3.2 1.7.6-3.6L1.8 5.6l3.6-.5L7 1.8Z" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div className="space-y-1.5 px-3 py-2.5">
                {g.teams.map((t) => (
                  <div key={t.abbr} className={grid}>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-7 shrink-0 items-center justify-center rounded bg-surface-2 text-[9px] font-bold text-ink-2">
                        {t.abbr}
                      </span>
                      <span className="truncate text-xs font-semibold">{t.name}</span>
                    </div>
                    {(["spread", "total", "money"] as const).map((m) => (
                      <OddsCell
                        key={m}
                        market={t[m]}
                        locked={g.locked}
                        selected={picks.has(`${g.id}:${t.abbr}:${m}`)}
                        onToggle={() => togglePick(`${g.id}:${t.abbr}:${m}`)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 하단 탭바 */}
      <nav className="grid shrink-0 grid-cols-4 border-t border-hairline bg-surface px-2 pb-1.5 pt-1">
        {NAV.map((n) => {
          const active = tab === n.key;
          return (
            <button
              key={n.key}
              type="button"
              onClick={() => setTab(n.key)}
              aria-pressed={active}
              className={`relative flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium transition-colors ${
                active ? "text-series-1" : "text-ink-muted hover:text-ink-2"
              }`}
            >
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
                {n.icon}
              </svg>
              {n.key === "bets" && (
                <span
                  className="absolute right-1/2 top-0 flex h-3.5 min-w-3.5 -translate-y-0.5 translate-x-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                  style={{ background: "var(--color-down)" }}
                >
                  4
                </span>
              )}
              {n.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
