"use client";

import { LIVE_GAMES, UPCOMING_GAMES } from "@/lib/data";

/** 진행 중 경기 스코어와 예정 경기 일정. */
export default function GameSchedule() {
  return (
    <div className="text-xs">
      <p className="flex items-center gap-1.5 px-3 pb-1 pt-2.5 text-[10px] font-semibold tracking-widest text-ink-muted">
        <span className="relative flex h-1.5 w-1.5">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: "var(--color-down)" }}
          />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-down)" }} />
        </span>
        LIVE
      </p>
      <ul className="divide-y divide-hairline">
        {LIVE_GAMES.map((g) => (
          <li key={g.id} className="flex items-center gap-2 px-3 py-2">
            <span className="w-9 shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-center text-[10px] font-semibold text-ink-muted">
              {g.league}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink">
              {g.home} <span className="text-ink-muted">vs</span> {g.away}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">
              {g.homeScore} : {g.awayScore}
            </span>
            <span className="w-14 shrink-0 text-right tabular-nums text-ink-muted">{g.status}</span>
          </li>
        ))}
      </ul>

      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold tracking-widest text-ink-muted">UPCOMING</p>
      <ul className="divide-y divide-hairline">
        {UPCOMING_GAMES.map((g) => (
          <li key={g.id} className="flex items-center gap-2 px-3 py-2">
            <span className="w-9 shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-center text-[10px] font-semibold text-ink-muted">
              {g.league}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-2">
              {g.home} <span className="text-ink-muted">vs</span> {g.away}
            </span>
            <span className="shrink-0 tabular-nums text-ink-muted">{g.kickoff}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
